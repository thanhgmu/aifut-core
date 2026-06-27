import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  PublishWorkflowTemplateDto,
  ReviewMarketplaceTemplateDto,
} from './dto/publish-workflow.dto';

// ── Region support ──────────────────────────────────────────────────────

/** Quốc gia hỗ trợ cho connector marketplace. */
export const MARKETPLACE_REGIONS = ['VN', 'SG', 'US', 'JP', 'TH'] as const;
export type MarketplaceRegion = (typeof MARKETPLACE_REGIONS)[number];

/** Chuẩn hóa & validate giá trị region; trả về undefined nếu rỗng, ném lỗi nếu không hợp lệ. */
export function normalizeRegion(
  value?: string | null,
): MarketplaceRegion | undefined {
  if (value == null || `${value}`.trim() === '') return undefined;
  const upper = `${value}`.trim().toUpperCase();
  if (!(MARKETPLACE_REGIONS as readonly string[]).includes(upper)) {
    throw new BadRequestException(
      `Invalid region "${value}". Must be one of: ${MARKETPLACE_REGIONS.join(', ')}.`,
    );
  }
  return upper as MarketplaceRegion;
}

// ── DTOs ────────────────────────────────────────────────────────────────

export interface SubmitListingInput {
  tenantId?: string;
  type: 'connector' | 'template' | 'workflow';
  key: string;
  name: string;
  description?: string;
  category?: string;
  industry?: string;
  region?: string;
  price?: number;
  currency?: string;
  authorName?: string;
  authorEmail?: string;
  config?: any;
  tags?: string[];
}

export interface RateListingInput {
  tenantId: string;
  listingKey: string;
  rating: number;
  review?: string;
}

export interface MarketplaceListOptions {
  type?: string;
  category?: string;
  industry?: string;
  region?: string;
  search?: string;
  sort?: 'newest' | 'popular' | 'rating' | 'price_asc' | 'price_desc';
  publishedOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface MarketplaceResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Trạng thái marketplace workflow cho connector (lưu trong config.marketplaceStatus). */
export type ConnectorMarketplaceStatus =
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED';

// ── Marketplace connector state keys ────────────────────────────────────

const CONFIG_MARKETPLACE_STATUS = 'marketplaceStatus';
const CONFIG_VERIFIED_BADGE = 'verifiedBadge';
const CONFIG_CERTIFICATION_ID = 'certificationId';
const CONFIG_CERTIFICATION_EXPIRES = 'certificationExpiresAt';

/**
 * MarketplaceService v2 — Community Connector & Template Marketplace.
 *
 * Capabilities:
 *   • CRUD listings with publishing workflow (submit → approve/reject)
 *   • submitConnector — tạo connector record, PENDING_REVIEW mặc định, IDOR-safe
 *   • rateConnector — ghi rating vào MarketplaceListingRating, auto-recompute avgRating
 *   • approveConnector — APPROVED + certification + verified badge
 *   • Paginated, sortable, searchable listing queries
 *   • Region-aware filtering (VN, SG, US, JP, TH)
 *   • Optimized full-text search across name + description + tags
 *   • User ratings & reviews (updates average rating on listing)
 *   • Install hooks for templates and connectors
 *   • Admin moderation (approve, reject, feature)
 *   • Workflow template publish/review flow (requestPublish, reviewTemplate)
 */
@Injectable()
export class MarketplaceService {
  constructor(private readonly prisma: PrismaService) {}

  // ═════════════════════════════════════════════════════════════════════
  //  SECTION 1 — CONNECTOR MARKETPLACE WORKFLOW (V2 New)
  // ═════════════════════════════════════════════════════════════════════

  /**
   * submitConnector
   * ──────────────
   * Tạo mới bản ghi connector trên marketplace với trạng thái mặc định
   * 'PENDING_REVIEW'. TenantId được bọc chặt (IDOR guard) — tenant chỉ
   * thao tác trên connector thuộc tenant của mình.
   *
   * @param tenantId - Tenant sở hữu (IDOR guard).
   * @param data     - Thông tin connector (key, name, description, config, ...).
   * @returns MarketplaceListing record với trạng thái PENDING_REVIEW.
   */
  async submitConnector(
    tenantId: string,
    data: {
      key: string;
      name: string;
      description?: string;
      category?: string;
      industry?: string;
      region?: string;
      price?: number;
      currency?: string;
      authorName?: string;
      authorEmail?: string;
      version?: string;
      tags?: string[];
      config?: Record<string, unknown>;
    },
  ) {
    // ── Validate required fields ─────────────────────────────────────
    if (!data.key || !data.name) {
      throw new BadRequestException('Connector key and name are required.');
    }

    // ── IDOR guard: tenantId forced từ auth context ──────────────────
    // Không cho phép data ghi đè tenantId; luôn dùng tenantId từ tham số.
    const effectiveTenantId = tenantId;

    // ── Kiểm tra trùng key trên toàn marketplace ────────────────────
    const existing = await this.prisma.marketplaceListing.findFirst({
      where: {
        key: data.key,
        type: 'connector',
      },
    });
    if (existing) {
      throw new ConflictException(
        `Connector with key '${data.key}' already exists.`,
      );
    }

    // ── Validate + normalize region ──────────────────────────────────
    const region = normalizeRegion(data.region) ?? 'VN';

    // ── Config payload: lưu trạng thái marketplace workflow ──────────
    const baseConfig: Record<string, unknown> = {
      ...(data.config ?? {}),
      [CONFIG_MARKETPLACE_STATUS]: 'PENDING_REVIEW',
      [CONFIG_VERIFIED_BADGE]: false,
    };

    // ── Tạo record ──────────────────────────────────────────────────
    const connector = await this.prisma.marketplaceListing.create({
      data: {
        tenantId: effectiveTenantId,
        type: 'connector',
        key: data.key,
        name: data.name,
        description: data.description ?? '',
        category: data.category ?? null,
        industry: data.industry ?? null,
        region,
        price: data.price ?? 0,
        currency: data.currency ?? 'VND',
        authorName: data.authorName ?? null,
        authorEmail: data.authorEmail ?? null,
        version: data.version ?? '1.0.0',
        tags: data.tags ?? [],
        config: baseConfig,
        downloads: 0,
        rating: null,
        isPublished: false, // Mặc định chưa public — chờ approve
        isOfficial: false,
      } as any,
    });

    return connector;
  }

  /**
   * rateConnector
   * ─────────────
   * Ghi nhận đánh giá (1-5 sao) cho một connector đã APPROVED.
   * Mỗi tenant chỉ được đánh giá một lần — lần sau là cập nhật.
   * Tự động tính toán lại điểm trung bình (avgRating) trên bảng
   * MarketplaceListing để bảo tồn tương thích ngược thông suốt
   * với UI và API cũ.
   *
   * @param tenantId    - Tenant thực hiện đánh giá (IDOR guard).
   * @param connectorId - key của connector listing.
   * @param rating      - Số sao (1-5).
   * @param comment     - Nội dung nhận xét (tùy chọn).
   * @returns Listing đã cập nhật avgRating + số lượng ratings.
   */
  async rateConnector(
    tenantId: string,
    connectorId: string,
    rating: number,
    comment?: string,
  ) {
    // ── Validate rating range ────────────────────────────────────────
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException(
        'Rating must be an integer between 1 and 5.',
      );
    }

    // ── Tìm connector listing ────────────────────────────────────────
    const listing = await this.prisma.marketplaceListing.findFirst({
      where: {
        key: connectorId,
        type: 'connector',
      },
    });
    if (!listing) {
      throw new NotFoundException(
        `Connector listing '${connectorId}' not found.`,
      );
    }

    // ── Chỉ cho phép rate connector đã APPROVED ─────────────────────
    const listingConfig = (listing.config ?? {}) as Record<string, unknown>;
    if (listingConfig[CONFIG_MARKETPLACE_STATUS] !== 'APPROVED') {
      throw new BadRequestException(
        'Cannot rate a connector that has not been approved yet.',
      );
    }

    // ── Upsert rating (tenant chỉ rate một lần) ─────────────────────
    await this.prisma.marketplaceListingRating.upsert({
      where: {
        listingId_tenantId: {
          listingId: listing.id,
          tenantId,
        },
      },
      create: {
        listingId: listing.id,
        tenantId,
        rating,
        review: comment ?? null,
      },
      update: {
        rating,
        review: comment ?? null,
      },
    });

    // ── Recompute average rating ─────────────────────────────────────
    const agg = await this.prisma.marketplaceListingRating.aggregate({
      where: { listingId: listing.id },
      _avg: { rating: true },
      _count: { rating: true },
    });

    const avgRating = agg._avg.rating ?? null;
    const totalRatings = agg._count.rating ?? 0;

    // ── Cập nhật trực tiếp vào MarketplaceListing (tương thích ngược) ─
    const updated = await this.prisma.marketplaceListing.update({
      where: { id: listing.id },
      data: {
        rating: avgRating,
      },
      select: {
        id: true,
        key: true,
        name: true,
        rating: true,
        _count: { select: { ratings: true } },
      },
    });

    return {
      listingId: updated.id,
      key: updated.key,
      name: updated.name,
      avgRating: updated.rating,
      totalRatings: updated._count.ratings,
    };
  }

  /**
   * approveConnector
   * ────────────────
   * Chuyển trạng thái connector sang 'APPROVED'. Tự động:
   *   1. Cập nhật isPublished = true, isOfficial = true.
   *   2. Cấp chứng chỉ ConnectorCertification (đồng pha với phân hệ Certification).
   *   3. Kích hoạt Verified Badge trên listing (lưu trong config).
   *
   * @param connectorId - key của connector listing cần approve.
   * @returns MarketplaceListing đã approve kèm thông tin certification.
   */
  async approveConnector(connectorId: string) {
    // ── Tìm connector ────────────────────────────────────────────────
    const listing = await this.prisma.marketplaceListing.findFirst({
      where: {
        key: connectorId,
        type: 'connector',
      },
    });
    if (!listing) {
      throw new NotFoundException(
        `Connector listing '${connectorId}' not found.`,
      );
    }

    const listingConfig = (listing.config ?? {}) as Record<string, unknown>;
    const currentStatus = listingConfig[CONFIG_MARKETPLACE_STATUS];

    // ── Chống approve lại connector đã APPROVED ─────────────────────
    if (currentStatus === 'APPROVED') {
      throw new ConflictException(
        `Connector '${connectorId}' is already approved.`,
      );
    }

    // ── Tạo certification record ─────────────────────────────────────
    // Sử dụng connectorId làm connectorKey; tận dụng cấu trúc
    // ConnectorCertification đã có sẵn từ phân hệ Certification.
    const certification = await this.prisma.connectorCertification.create({
      data: {
        tenantId: listing.tenantId ?? '__system__',
        connectorKey: listing.key,
        connectorName: listing.name,
        version: listing.version ?? '1.0.0',
        developerEmail: listing.authorEmail,
        developerName: listing.authorName,
        status: 'APPROVED',
        submittedAt: new Date(),
        reviewedAt: new Date(),
        reviewedBy: '__marketplace_admin__',
        reviewerNotes: 'Approved via marketplace connector review.',
        badgeUrl: `https://aifut.app/badges/certified/${listing.tenantId ?? 'system'}/${listing.key}.svg`,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 năm
      },
    });

    // ── Cập nhật listing: APPROVED + verified badge ──────────────────
    const updatedConfig: Record<string, unknown> = {
      ...listingConfig,
      [CONFIG_MARKETPLACE_STATUS]: 'APPROVED',
      [CONFIG_VERIFIED_BADGE]: true,
      [CONFIG_CERTIFICATION_ID]: certification.id,
      [CONFIG_CERTIFICATION_EXPIRES]: certification.expiresAt?.toISOString(),
    };

    const updated = await this.prisma.marketplaceListing.update({
      where: { id: listing.id },
      data: {
        config: updatedConfig,
        isPublished: true,
        isOfficial: true,
      } as any,
    });

    return {
      listing: updated,
      certification: {
        id: certification.id,
        status: certification.status,
        badgeUrl: certification.badgeUrl,
        expiresAt: certification.expiresAt,
      },
    };
  }

  // ═════════════════════════════════════════════════════════════════════
  //  SECTION 2 — LISTING CRUD
  // ═════════════════════════════════════════════════════════════════════

  /**
   * Create or submit a new marketplace listing.
   * Community submissions are auto-saved but NOT published (isPublished = false)
   * until an admin/official approves them.
   */
  async submitListing(input: SubmitListingInput) {
    if (!input.key || !input.name || !input.type) {
      throw new BadRequestException('key, name, and type are required.');
    }
    if (!['connector', 'template', 'workflow'].includes(input.type)) {
      throw new BadRequestException(
        `Invalid type "${input.type}". Must be connector, template, or workflow.`,
      );
    }

    // Validate + normalize region (mặc định VN khi không truyền).
    const region = normalizeRegion(input.region) ?? 'VN';

    const existing = await this.prisma.marketplaceListing.findUnique({
      where: { key: input.key },
    });
    if (existing) {
      throw new ConflictException(`Listing '${input.key}' already exists.`);
    }

    // Community submissions start unpublished; official seeds are auto-published
    const isOfficial = !!input.tenantId; // tenant-owned = official submission
    const listing = await this.prisma.marketplaceListing.create({
      data: {
        tenantId: input.tenantId ?? null,
        type: input.type,
        key: input.key,
        name: input.name,
        description: input.description ?? '',
        category: input.category ?? null,
        industry: input.industry ?? null,
        region,
        price: input.price ?? 0,
        currency: input.currency ?? 'VND',
        authorName: input.authorName ?? null,
        authorEmail: input.authorEmail ?? null,
        version: '1.0.0',
        tags: input.tags ?? [],
        config: input.config ?? undefined,
        downloads: 0,
        rating: null,
        isPublished: isOfficial,
        isOfficial,
      } as any,
    });

    return listing;
  }

  /**
   * Admin approval: publish a community-submitted listing.
   */
  async approveListing(key: string) {
    const listing = await this.findByKey(key);
    if (listing.isPublished) {
      throw new ConflictException(`Listing '${key}' is already published.`);
    }
    return this.prisma.marketplaceListing.update({
      where: { id: listing.id },
      data: { isPublished: true, isOfficial: true },
    });
  }

  /**
   * Admin rejection: delete a community-submitted listing.
   */
  async rejectListing(key: string) {
    const listing = await this.findByKey(key);
    if (listing.isPublished) {
      throw new BadRequestException(
        `Cannot reject a published listing. Use delete instead.`,
      );
    }
    await this.prisma.marketplaceListing.delete({ where: { id: listing.id } });
    return { rejected: true, key };
  }

  /**
   * Delete a listing entirely.
   */
  async deleteListing(key: string) {
    const listing = await this.findByKey(key);
    await this.prisma.marketplaceListing.delete({ where: { id: listing.id } });
    return { deleted: true, key };
  }

  /**
   * Update listing metadata (name, description, price, tags, region, etc.).
   */
  async updateListing(
    key: string,
    patch: Partial<{
      name: string;
      description: string;
      category: string;
      industry: string;
      region: string;
      price: number;
      currency: string;
      version: string;
      tags: string[];
      config: any;
    }>,
  ) {
    const listing = await this.findByKey(key);

    // Validate region nếu được cung cấp.
    const data: any = { ...patch };
    if (patch.region !== undefined) {
      data.region = normalizeRegion(patch.region) ?? 'VN';
    }

    return this.prisma.marketplaceListing.update({
      where: { id: listing.id },
      data,
    });
  }

  // ═════════════════════════════════════════════════════════════════════
  //  SECTION 3 — BROWSE & SEARCH
  // ═════════════════════════════════════════════════════════════════════

  /**
   * List marketplace items with pagination, filtering, region scoping,
   * sorting, and optimized full-text search.
   *
   * By default, only published items are shown (community browsing).
   * Pass publishedOnly=false to include drafts (admin view).
   */
  async listListings(
    options: MarketplaceListOptions,
  ): Promise<MarketplaceResult<any>> {
    const {
      type,
      category,
      industry,
      region,
      search,
      sort = 'newest',
      publishedOnly = true,
      page = 1,
      pageSize = 20,
    } = options;

    const where: any = {};
    if (publishedOnly) where.isPublished = true;
    if (type) where.type = type;
    if (category) where.category = category;
    if (industry) where.industry = industry;

    // Region filter — validate qua whitelist (VN, SG, US, JP, TH).
    const normalizedRegion = normalizeRegion(region);
    if (normalizedRegion) where.region = normalizedRegion;

    // ── Optimized full-text search ──────────────────────────────────
    // Tách query thành các token; mỗi token phải khớp ít nhất một trường
    // (name / description / tags). Dùng AND giữa các token để thu hẹp kết
    // quả, OR trong từng token để mở rộng phạm vi trường — tận dụng được
    // index trên các cột text qua Prisma Client.
    if (search && search.trim()) {
      const tokens = search
        .trim()
        .split(/\s+/)
        .filter((t) => t.length > 0)
        .slice(0, 8); // chặn query quá dài gây bottleneck

      if (tokens.length > 0) {
        where.AND = tokens.map((token) => ({
          OR: [
            { name: { contains: token, mode: 'insensitive' } },
            { description: { contains: token, mode: 'insensitive' } },
            { tags: { has: token } },
          ],
        }));
      }
    }

    // Sort ordering
    let orderBy: any = { createdAt: 'desc' };
    switch (sort) {
      case 'popular':
        orderBy = { downloads: 'desc' };
        break;
      case 'rating':
        orderBy = { rating: 'desc' };
        break;
      case 'price_asc':
        orderBy = { price: 'asc' };
        break;
      case 'price_desc':
        orderBy = { price: 'desc' };
        break;
      case 'newest':
      default:
        orderBy = { createdAt: 'desc' };
        break;
    }

    const boundedPageSize = Math.min(pageSize, 100);
    const skip = (page - 1) * boundedPageSize;

    const [items, total] = await Promise.all([
      this.prisma.marketplaceListing.findMany({
        where,
        orderBy,
        skip,
        take: boundedPageSize,
      }),
      this.prisma.marketplaceListing.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize: boundedPageSize,
      totalPages: Math.ceil(total / boundedPageSize),
    };
  }

  /**
   * Get a single listing by its unique key.
   */
  async getListing(key: string) {
    return this.findByKey(key);
  }

  /**
   * Get pending (unpublished) submissions — for admin review queue.
   */
  async getPendingSubmissions() {
    return this.prisma.marketplaceListing.findMany({
      where: { isPublished: false, isOfficial: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ═════════════════════════════════════════════════════════════════════
  //  SECTION 4 — RATINGS & REVIEWS
  // ═════════════════════════════════════════════════════════════════════

  /**
   * Rate a marketplace listing (1-5 stars).
   * Each tenant can rate once — subsequent calls update the review.
   * Recomputes the average rating on the listing.
   */
  async rateListing(input: RateListingInput) {
    if (input.rating < 1 || input.rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5.');
    }

    const listing = await this.findByKey(input.listingKey);
    if (!listing.isPublished) {
      throw new BadRequestException(
        'Cannot rate an unpublished listing.',
      );
    }

    // Upsert the rating
    await this.prisma.marketplaceListingRating.upsert({
      where: {
        listingId_tenantId: {
          listingId: listing.id,
          tenantId: input.tenantId,
        },
      },
      create: {
        listingId: listing.id,
        tenantId: input.tenantId,
        rating: input.rating,
        review: input.review ?? null,
      },
      update: {
        rating: input.rating,
        review: input.review ?? null,
      },
    });

    // Recompute average
    const agg = await this.prisma.marketplaceListingRating.aggregate({
      where: { listingId: listing.id },
      _avg: { rating: true },
      _count: { rating: true },
    });

    return this.prisma.marketplaceListing.update({
      where: { id: listing.id },
      data: {
        rating: agg._avg.rating ?? null,
      },
      select: {
        id: true,
        key: true,
        rating: true,
        _count: { select: { ratings: true } },
      },
    });
  }

  /**
   * Get ratings/reviews for a listing.
   */
  async getRatings(listingKey: string, page = 1, pageSize = 20) {
    const listing = await this.findByKey(listingKey);
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.marketplaceListingRating.findMany({
        where: { listingId: listing.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Math.min(pageSize, 50),
      }),
      this.prisma.marketplaceListingRating.count({
        where: { listingId: listing.id },
      }),
    ]);

    return {
      items,
      total,
      page,
      pageSize: Math.min(pageSize, 50),
      totalPages: Math.ceil(total / Math.min(pageSize, 50)),
    };
  }

  // ═════════════════════════════════════════════════════════════════════
  //  SECTION 5 — INSTALL
  // ═════════════════════════════════════════════════════════════════════

  /**
   * Install a marketplace listing for a tenant.
   * - Connectors: creates an IntegrationConnection entry
   * - Templates: creates a WorkflowTemplate from listing config
   * - Workflows: instantiates a full workflow execution blueprint
   */
  async installListing(tenantId: string, listingKey: string) {
    const listing = await this.findByKey(listingKey);
    if (!listing.isPublished) {
      throw new BadRequestException(
        `Listing '${listingKey}' is not published yet.`,
      );
    }

    // Increment download counter
    await this.prisma.marketplaceListing.update({
      where: { id: listing.id },
      data: { downloads: { increment: 1 } },
    });

    let result: any = {
      installed: true,
      listingKey,
      listingName: listing.name,
      type: listing.type,
    };

    // ── Template: create WorkflowTemplate ──────────────────────────
    if (listing.type === 'template' || listing.type === 'workflow') {
      const config = (listing.config ?? {}) as any;

      const tpl = await this.prisma.workflowTemplate.create({
        data: {
          tenantId,
          key: `tpl_${listing.key}`,
          name: listing.name,
          description: listing.description ?? '',
          category: listing.category,
          industry: listing.industry,
          source: 'marketplace',
          status: 'ACTIVE',
          config: config.workflowNodes ?? undefined,
        } as any,
      });

      result.template = { id: tpl.id, key: tpl.key };
    }

    // ── Connector: create IntegrationConnection ──────────────────────
    if (listing.type === 'connector') {
      const config = (listing.config ?? {}) as any;

      const conn = await this.prisma.integrationConnection.create({
        data: {
          tenantId,
          connectorKey: listing.key,
          name: listing.name,
          config: config.defaultConfig ?? {},
          status: 'DISCONNECTED' as any,
          source: 'marketplace',
        } as any,
      });

      result.connector = { id: conn.id, key: (conn as any).connectorKey };
    }

    return result;
  }

  // ═════════════════════════════════════════════════════════════════════
  //  SECTION 6 — ANALYTICS & STATS
  // ═════════════════════════════════════════════════════════════════════

  /**
   * Get marketplace platform-wide stats.
   */
  async getPlatformStats() {
    const [
      totalListings,
      totalDownloads,
      officialCount,
      communityCount,
      pendingCount,
      avgPrice,
    ] = await Promise.all([
      this.prisma.marketplaceListing.count({ where: { isPublished: true } }),
      this.prisma.marketplaceListing.aggregate({
        _sum: { downloads: true },
        where: { isPublished: true },
      }),
      this.prisma.marketplaceListing.count({
        where: { isPublished: true, isOfficial: true },
      }),
      this.prisma.marketplaceListing.count({
        where: { isPublished: true, isOfficial: false },
      }),
      this.prisma.marketplaceListing.count({
        where: { isPublished: false },
      }),
      this.prisma.marketplaceListing.aggregate({
        _avg: { price: true },
        where: { isPublished: true, price: { gt: 0 } },
      }),
    ]);

    return {
      totalListings,
      totalDownloads: totalDownloads._sum.downloads ?? 0,
      official: officialCount,
      community: communityCount,
      pendingApproval: pendingCount,
      averagePrice: avgPrice._avg.price ?? 0,
    };
  }

  /**
   * Get per-region listing counts — phục vụ bộ lọc quốc gia ở UI.
   */
  async getRegionStats() {
    const grouped = await this.prisma.marketplaceListing.groupBy({
      by: ['region'],
      where: { isPublished: true },
      _count: { _all: true },
    } as any);

    const counts: Record<string, number> = {};
    for (const r of MARKETPLACE_REGIONS) counts[r] = 0;
    for (const row of grouped as any[]) {
      const key = row.region ?? 'VN';
      counts[key] = (counts[key] ?? 0) + (row._count?._all ?? 0);
    }

    return { regions: MARKETPLACE_REGIONS, counts };
  }

  // ═════════════════════════════════════════════════════════════════════
  //  SECTION 7 — PRIVATE HELPERS
  // ═════════════════════════════════════════════════════════════════════

  private async findByKey(key: string) {
    const item = await this.prisma.marketplaceListing.findUnique({
      where: { key },
    });
    if (!item) throw new NotFoundException(`Listing '${key}' not found`);
    return item;
  }

  // ═════════════════════════════════════════════════════════════════════
  //  SECTION 8 — WORKFLOW TEMPLATE PUBLISHING & REVIEW
  // ═════════════════════════════════════════════════════════════════════

  /**
   * requestPublish
   * ─────────────
   * Developer gửi yêu cầu public template ra marketplace.
   * Kiểm tra quyền sở hữu (IDOR guard) qua tenantId,
   * chuyển marketplaceStatus → PENDING, cập nhật isPublic & developerNotes.
   */
  async requestPublish(
    templateId: string,
    tenantId: string,
    dto: PublishWorkflowTemplateDto,
  ) {
    const template = await this.prisma.workflowTemplate.findFirst({
      where: { id: templateId, tenantId },
    });
    if (!template) {
      throw new NotFoundException(
        `WorkflowTemplate '${templateId}' not found or not owned by this tenant.`,
      );
    }

    return this.prisma.workflowTemplate.update({
      where: { id: templateId },
      data: {
        marketplaceStatus: 'PENDING',
        isPublic: dto.isPublic,
        developerNotes: dto.developerNotes ?? null,
      } as any,
    });
  }

  /**
   * reviewTemplate — ADMIN-ONLY (bypass tenant check)
   * ──────────────────────────────────────────────────
   * Admin phê duyệt (APPROVED) hoặc từ chối (REJECTED) template.
   * Ghi vết adminComment vào metadata JSON.
   */
  async reviewTemplate(
    templateId: string,
    dto: ReviewMarketplaceTemplateDto,
  ) {
    const template = await this.prisma.workflowTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template) {
      throw new NotFoundException(
        `WorkflowTemplate '${templateId}' not found.`,
      );
    }

    // Merge adminComment vào metadata hiện có (nếu có)
    const existingMetadata =
      typeof template.metadata === 'object' && template.metadata !== null
        ? (template.metadata as Record<string, unknown>)
        : {};
    const updatedMetadata = {
      ...existingMetadata,
      ...(dto.adminComment ? { adminComment: dto.adminComment } : {}),
      reviewedAt: new Date().toISOString(),
    };

    return this.prisma.workflowTemplate.update({
      where: { id: templateId },
      data: {
        marketplaceStatus: dto.status,
        // Nếu APPROVED thì tự động set isPublic = true
        ...(dto.status === 'APPROVED' ? { isPublic: true } : {}),
        metadata: updatedMetadata as any,
      } as any,
    });
  }

  /**
   * getPublicMarketplace
   * ────────────────────
   * Public listing — chỉ trả về template đã APPROVED + isPublic = true.
   * Hard clamp pageSize tối đa 50 để tránh query quá tải.
   * Kết nối trực tiếp với Public Listing UI.
   */
  async getPublicMarketplace(
    page: number,
    pageSize: number,
  ) {
    const safePage = Math.max(1, page);
    const safePageSize = Math.min(Math.max(1, pageSize), 50);
    const skip = (safePage - 1) * safePageSize;

    const where = {
      marketplaceStatus: 'APPROVED',
      isPublic: true,
    } as any;

    const [items, total] = await Promise.all([
      this.prisma.workflowTemplate.findMany({
        where,
        skip,
        take: safePageSize,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          key: true,
          name: true,
          description: true,
          category: true,
          industry: true,
          tags: true,
          developerNotes: true,
          version: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.workflowTemplate.count({ where }),
    ]);

    return {
      items,
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.ceil(total / safePageSize),
    };
  }
}
