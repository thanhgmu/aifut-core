import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// ── DTOs ────────────────────────────────────────────────────────────────

export interface SubmitListingInput {
  tenantId?: string;
  type: 'connector' | 'template' | 'workflow';
  key: string;
  name: string;
  description?: string;
  category?: string;
  industry?: string;
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

/**
 * MarketplaceService v2 — Community Connector & Template Marketplace.
 *
 * Capabilities:
 *   • CRUD listings with publishing workflow (submit → approve/reject)
 *   • Paginated, sortable, searchable listing queries
 *   • User ratings & reviews (updates average rating on listing)
 *   • Install hooks for templates and connectors
 *   • Admin moderation (approve, reject, feature)
 */
@Injectable()
export class MarketplaceService {
  constructor(private readonly prisma: PrismaService) {}

  // ═════════════════════════════════════════════════════════════════════
  //  SECTION 1 — LISTING CRUD
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
      },
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
   * Update listing metadata (name, description, price, tags, etc.).
   */
  async updateListing(
    key: string,
    patch: Partial<{
      name: string;
      description: string;
      category: string;
      industry: string;
      price: number;
      currency: string;
      version: string;
      tags: string[];
      config: any;
    }>,
  ) {
    const listing = await this.findByKey(key);
    return this.prisma.marketplaceListing.update({
      where: { id: listing.id },
      data: patch as any,
    });
  }

  // ═════════════════════════════════════════════════════════════════════
  //  SECTION 2 — BROWSE & SEARCH
  // ═════════════════════════════════════════════════════════════════════

  /**
   * List marketplace items with pagination, filtering, sorting, and search.
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

    // Full-text search on name + description
    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { tags: { has: term } },
      ];
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

    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.marketplaceListing.findMany({
        where,
        orderBy,
        skip,
        take: Math.min(pageSize, 100),
      }),
      this.prisma.marketplaceListing.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize: Math.min(pageSize, 100),
      totalPages: Math.ceil(total / Math.min(pageSize, 100)),
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
  //  SECTION 3 — RATINGS & REVIEWS
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
  //  SECTION 4 — INSTALL
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

    // ── Connector: create IntegrationConnection ────────────────────
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
  //  SECTION 5 — ANALYTICS & STATS
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

  // ═════════════════════════════════════════════════════════════════════
  //  SECTION 6 — PRIVATE HELPERS
  // ═════════════════════════════════════════════════════════════════════

  private async findByKey(key: string) {
    const item = await this.prisma.marketplaceListing.findUnique({
      where: { key },
    });
    if (!item) throw new NotFoundException(`Listing '${key}' not found`);
    return item;
  }
}
