// ═══════════════════════════════════════════════════════════════════════════
// developer-profile.service.ts — Developer Profile & Marketplace Identity
// ═══════════════════════════════════════════════════════════════════════════
// Quản lý hồ sơ developer trên AIFUT Marketplace, bao gồm:
//   • Đăng ký / cập nhật hồ sơ developer
//   • Kỹ năng (skills) với cấp độ 1-5
//   • Thống kê listing, doanh thu, xếp hạng
//   • Level tier tự động (Bronze → Silver → Gold → Platinum)
// ═══════════════════════════════════════════════════════════════════════════

import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MemoryDatabaseStore } from '../database/memory-fallback.adapter';

// ── Types ─────────────────────────────────────────────────────────────────

export interface CreateDeveloperProfileInput {
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  company?: string;
  website?: string;
  githubUrl?: string;
  twitterUrl?: string;
  country?: string;
  languages?: string[];
}

export interface AddSkillInput {
  skill: string;
  level?: number; // 1-5
}

export interface DeveloperProfileResponse {
  id: string;
  tenantId: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  company: string | null;
  website: string | null;
  githubUrl: string | null;
  twitterUrl: string | null;
  country: string | null;
  languages: string[];
  status: string;
  tier: string;
  totalListings: number;
  totalSales: number;
  totalEarnings: string; // BigInt serialized
  rating: number | null;
  skills: Array<{ id: string; skill: string; level: number }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeveloperStatsResponse {
  profile: DeveloperProfileResponse;
  earnings: {
    total: string;
    thisMonth: string;
    pendingPayout: string;
    byType: Record<string, string>;
  };
  marketplaceStats: {
    totalListings: number;
    totalDownloads: number;
    avgRating: number | null;
    pendingCertification: number;
  };
}

// ── Tier thresholds ───────────────────────────────────────────────────────

const TIER_THRESHOLDS = [
  { tier: 'BRONZE', minListings: 0, minSales: 0, minRating: 0 },
  { tier: 'SILVER', minListings: 2, minSales: 5, minRating: 4.0 },
  { tier: 'GOLD', minListings: 5, minSales: 20, minRating: 4.3 },
  { tier: 'PLATINUM', minListings: 10, minSales: 50, minRating: 4.5 },
] as const;

// ── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class DeveloperProfileService {
  constructor(private readonly prisma: PrismaService) {}

  // ═════════════════════════════════════════════════════════════════════
  //  PROFILE CRUD
  // ═════════════════════════════════════════════════════════════════════

  /**
   * register
   * ────────
   * Đăng ký hồ sơ developer cho một tenant.
   * Mỗi tenant chỉ được có 1 profile.
   */
  async register(
    tenantId: string,
    input: CreateDeveloperProfileInput,
  ): Promise<DeveloperProfileResponse> {
    if (!input.displayName || input.displayName.trim().length === 0) {
      throw new BadRequestException('displayName is required.');
    }

    // Check for existing profile
    const existing = await this.getByTenantIdSafe(tenantId);
    if (existing) {
      throw new ConflictException(
        'Developer profile already exists for this tenant.',
      );
    }

    const profile = await this.prisma.developerProfile.create({
      data: {
        tenantId,
        userId: null,
        displayName: input.displayName.trim(),
        bio: input.bio ?? null,
        avatarUrl: input.avatarUrl ?? null,
        company: input.company ?? null,
        website: input.website ?? null,
        githubUrl: input.githubUrl ?? null,
        twitterUrl: input.twitterUrl ?? null,
        country: input.country ?? 'VN',
        languages: input.languages ?? [],
        status: 'ACTIVE',
        tier: 'BRONZE',
        totalListings: 0,
        totalSales: 0,
        totalEarnings: BigInt(0),
        rating: null,
      },
      include: { skills: true },
    });

    return this.toResponse(profile);
  }

  /**
   * updateProfile
   * ─────────────
   * Cập nhật thông tin hồ sơ developer.
   */
  async updateProfile(
    tenantId: string,
    patch: Partial<CreateDeveloperProfileInput>,
  ): Promise<DeveloperProfileResponse> {
    const profile = await this.getByTenantIdOrThrow(tenantId);

    const data: any = {};
    if (patch.displayName !== undefined) data.displayName = patch.displayName.trim();
    if (patch.bio !== undefined) data.bio = patch.bio;
    if (patch.avatarUrl !== undefined) data.avatarUrl = patch.avatarUrl;
    if (patch.company !== undefined) data.company = patch.company;
    if (patch.website !== undefined) data.website = patch.website;
    if (patch.githubUrl !== undefined) data.githubUrl = patch.githubUrl;
    if (patch.twitterUrl !== undefined) data.twitterUrl = patch.twitterUrl;
    if (patch.country !== undefined) data.country = patch.country;
    if (patch.languages !== undefined) data.languages = patch.languages;

    const updated = await this.prisma.developerProfile.update({
      where: { id: profile.id },
      data,
      include: { skills: true },
    });

    return this.toResponse(updated);
  }

  /**
   * getProfile
   * ──────────
   * Lấy hồ sơ developer theo tenantId.
   */
  async getProfile(tenantId: string): Promise<DeveloperProfileResponse> {
    const profile = await this.getByTenantIdOrThrow(tenantId);
    return this.toResponse(profile);
  }

  /**
   * getProfileById
   * ──────────────
   * Lấy hồ sơ developer theo profile ID (public lookup).
   */
  async getProfileById(profileId: string): Promise<DeveloperProfileResponse> {
    const profile = await this.prisma.developerProfile.findUnique({
      where: { id: profileId },
      include: { skills: true },
    });
    if (!profile) {
      throw new NotFoundException(`Developer profile '${profileId}' not found.`);
    }
    return this.toResponse(profile);
  }

  // ═════════════════════════════════════════════════════════════════════
  //  SKILLS MANAGEMENT
  // ═════════════════════════════════════════════════════════════════════

  /**
   * addSkill
   * ────────
   * Thêm kỹ năng cho developer. Mỗi kỹ năng là unique per profile.
   */
  async addSkill(
    tenantId: string,
    input: AddSkillInput,
  ): Promise<DeveloperProfileResponse> {
    const profile = await this.getByTenantIdOrThrow(tenantId);
    const level = Math.max(1, Math.min(5, input.level ?? 3));

    await this.prisma.developerSkill.upsert({
      where: {
        profileId_skill: { profileId: profile.id, skill: input.skill },
      },
      create: { profileId: profile.id, skill: input.skill, level },
      update: { level },
    });

    return this.getProfile(tenantId);
  }

  /**
   * removeSkill
   * ───────────
   * Xoá kỹ năng khỏi hồ sơ developer.
   */
  async removeSkill(tenantId: string, skill: string): Promise<DeveloperProfileResponse> {
    const profile = await this.getByTenantIdOrThrow(tenantId);

    await this.prisma.developerSkill.deleteMany({
      where: { profileId: profile.id, skill },
    });

    return this.getProfile(tenantId);
  }

  // ═════════════════════════════════════════════════════════════════════
  //  MARKETPLACE STATS & TIER
  // ═════════════════════════════════════════════════════════════════════

  /**
   * getStats
   * ────────
   * Thống kê tổng hợp cho developer dashboard.
   */
  async getStats(tenantId: string): Promise<DeveloperStatsResponse> {
    const profile = await this.getByTenantIdOrThrow(tenantId);

    // Earnings breakdown
    const earnings = await this.prisma.developerEarning.findMany({
      where: { profileId: profile.id },
    });

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const byType: Record<string, bigint> = {};
    let totalEarnings = BigInt(0);
    let thisMonthEarnings = BigInt(0);

    for (const e of earnings) {
      totalEarnings += e.amount;
      byType[e.type] = (byType[e.type] ?? BigInt(0)) + e.amount;
      if (e.createdAt >= thisMonthStart) {
        thisMonthEarnings += e.amount;
      }
    }

    // Marketplace stats
    const listings = await this.prisma.marketplaceListing.findMany({
      where: { tenantId },
      select: { id: true, downloads: true, rating: true },
    });

    const certifications = await this.prisma.connectorCertification.findMany({
      where: { tenantId, status: { in: ['SUBMITTED', 'IN_REVIEW'] } },
      select: { id: true },
    });

    const totalDownloads = listings.reduce((s, l) => s + l.downloads, 0);
    const ratings = listings.filter((l) => l.rating !== null).map((l) => l.rating!);
    const avgRating =
      ratings.length > 0
        ? ratings.reduce((s, r) => s + r, 0) / ratings.length
        : null;

    return {
      profile: this.toResponse(profile),
      earnings: {
        total: totalEarnings.toString(),
        thisMonth: thisMonthEarnings.toString(),
        pendingPayout: '0', // Placeholder — payout system TBD
        byType: Object.fromEntries(
          Object.entries(byType).map(([k, v]) => [k, v.toString()]),
        ),
      },
      marketplaceStats: {
        totalListings: listings.length,
        totalDownloads,
        avgRating,
        pendingCertification: certifications.length,
      },
    };
  }

  /**
   * recalculateTier
   * ───────────────
   * Tự động tính toán và cập nhật tier dựa trên thành tích.
   * Gọi sau mỗi lần listing được publish hoặc có rating mới.
   */
  async recalculateTier(tenantId: string): Promise<string> {
    const profile = await this.getByTenantIdOrThrow(tenantId);

    let newTier = 'BRONZE';
    for (const t of TIER_THRESHOLDS) {
      if (
        profile.totalListings >= t.minListings &&
        profile.totalSales >= t.minSales &&
        (profile.rating ?? 0) >= t.minRating
      ) {
        newTier = t.tier;
      }
    }

    if (newTier !== profile.tier) {
      await this.prisma.developerProfile.update({
        where: { id: profile.id },
        data: { tier: newTier as any },
      });
    }

    return newTier;
  }

  // ═════════════════════════════════════════════════════════════════════
  //  PUBLIC DISCOVERY
  // ═════════════════════════════════════════════════════════════════════

  /**
   * listDevelopers
   * ──────────────
   * Public listing — tìm kiếm developer theo kỹ năng, tier, quốc gia.
   */
  async listDevelopers(options: {
    tier?: string;
    skill?: string;
    country?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const { tier, skill, country, search, page = 1, pageSize = 20 } = options;

    const where: any = { status: 'ACTIVE' };
    if (tier) where.tier = tier;
    if (country) where.country = country;

    if (skill) {
      where.skills = { some: { skill } };
    }

    if (search) {
      where.OR = [
        { displayName: { contains: search, mode: 'insensitive' } },
        { bio: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
      ];
    }

    const safePage = Math.max(1, page);
    const safePageSize = Math.min(Math.max(1, pageSize), 50);
    const skip = (safePage - 1) * safePageSize;

    const [items, total] = await Promise.all([
      this.prisma.developerProfile.findMany({
        where,
        include: { skills: true },
        orderBy: { totalSales: 'desc' },
        skip,
        take: safePageSize,
      }),
      this.prisma.developerProfile.count({ where }),
    ]);

    return {
      items: items.map((p) => this.toResponse(p)),
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.ceil(total / safePageSize),
    };
  }

  // ═════════════════════════════════════════════════════════════════════
  //  PRIVATE HELPERS
  // ═════════════════════════════════════════════════════════════════════

  private async getByTenantIdSafe(tenantId: string) {
    return this.prisma.developerProfile.findUnique({
      where: { tenantId },
      include: { skills: true },
    });
  }

  private async getByTenantIdOrThrow(tenantId: string) {
    const profile = await this.getByTenantIdSafe(tenantId);
    if (!profile) {
      throw new NotFoundException(
        'Developer profile not found. Register first.',
      );
    }
    return profile;
  }

  private toResponse(profile: any): DeveloperProfileResponse {
    return {
      id: profile.id,
      tenantId: profile.tenantId,
      displayName: profile.displayName,
      bio: profile.bio,
      avatarUrl: profile.avatarUrl,
      company: profile.company,
      website: profile.website,
      githubUrl: profile.githubUrl,
      twitterUrl: profile.twitterUrl,
      country: profile.country,
      languages: profile.languages ?? [],
      status: profile.status,
      tier: profile.tier,
      totalListings: profile.totalListings,
      totalSales: profile.totalSales,
      totalEarnings: profile.totalEarnings?.toString() ?? '0',
      rating: profile.rating,
      skills: (profile.skills ?? []).map((s: any) => ({
        id: s.id,
        skill: s.skill,
        level: s.level,
      })),
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
}
