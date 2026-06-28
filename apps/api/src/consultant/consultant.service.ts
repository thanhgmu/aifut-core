// ═══════════════════════════════════════════════════════════════════════════
// consultant.service.ts — Consultant/Expert Directory & Booking
// ═══════════════════════════════════════════════════════════════════════════
// Quản lý hồ sơ chuyên gia tư vấn, tìm kiếm, đánh giá, đặt lịch.
// ═══════════════════════════════════════════════════════════════════════════

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// ── Types ─────────────────────────────────────────────────────────────────

export interface ConsultantSearchResult {
  total: number;
  items: Array<{
    id: string;
    tenantId: string;
    fullName: string;
    avatarUrl: string | null;
    title: string | null;
    bio: string | null;
    skills: string[];
    industries: string[];
    rating: number | null;
    reviewCount: number;
    completedJobs: number;
    isAvailable: boolean;
    rateType: string | null;
    rateAmount: number | null;
    currency: string;
    isVerified: boolean;
    createdAt: Date;
  }>;
}

export interface ConsultantDetail extends ConsultantSearchResult['items'][0] {
  email: string | null;
  phone: string | null;
  website: string | null;
  socialLinks: string[];
  certifications: string[];
  recentReviews: Array<{
    id: string;
    rating: number;
    review: string | null;
    createdAt: Date;
  }>;
}

export interface CreateConsultantInput {
  fullName: string;
  avatarUrl?: string;
  title?: string;
  bio?: string;
  skills?: string[];
  industries?: string[];
  certifications?: string[];
  email?: string;
  phone?: string;
  website?: string;
  socialLinks?: string[];
  isAvailable?: boolean;
  rateType?: string;
  rateAmount?: number;
  currency?: string;
}

export interface UpdateConsultantInput {
  fullName?: string;
  avatarUrl?: string | null;
  title?: string | null;
  bio?: string | null;
  skills?: string[];
  industries?: string[];
  certifications?: string[];
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  socialLinks?: string[];
  isAvailable?: boolean;
  rateType?: string | null;
  rateAmount?: number | null;
  currency?: string;
  status?: string;
}

// ── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class ConsultantService {
  private readonly logger = new Logger(ConsultantService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ═════════════════════════════════════════════════════════════════════
  //  SEARCH & QUERY
  // ═════════════════════════════════════════════════════════════════════

  async searchConsultants(options: {
    search?: string;
    skills?: string[];
    industries?: string[];
    minRating?: number;
    isAvailable?: boolean;
    isVerified?: boolean;
    rateType?: string;
    priceMin?: number;
    priceMax?: number;
    status?: string;
    limit?: number;
    offset?: number;
    orderBy?: string;
    orderDir?: 'asc' | 'desc';
  } = {}): Promise<ConsultantSearchResult> {
    const {
      search, skills, industries, minRating, isAvailable, isVerified,
      rateType, priceMin, priceMax, status = 'active',
      limit = 20, offset = 0, orderBy = 'rating', orderDir = 'desc',
    } = options;

    const where: any = { status };

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { bio: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (skills && skills.length > 0) {
      // Prisma JSON array contains — dùng JSON array overlap
      where.skills = { array_contains: skills };
    }

    if (industries && industries.length > 0) {
      where.industries = { array_contains: industries };
    }

    if (minRating !== undefined) {
      where.rating = { gte: minRating };
    }

    if (isAvailable !== undefined) {
      where.isAvailable = isAvailable;
    }

    if (isVerified !== undefined) {
      where.isVerified = isVerified;
    }

    if (rateType) {
      where.rateType = rateType;
    }

    if (priceMin !== undefined || priceMax !== undefined) {
      where.rateAmount = {};
      if (priceMin !== undefined) where.rateAmount.gte = priceMin;
      if (priceMax !== undefined) where.rateAmount.lte = priceMax;
    }

    const orderByClause: any = {};
    orderByClause[orderBy] = orderDir;

    const [total, items] = await Promise.all([
      this.prisma.consultantProfile.count({ where }),
      this.prisma.consultantProfile.findMany({
        where,
        orderBy: orderByClause,
        take: limit,
        skip: offset,
        select: {
          id: true,
          tenantId: true,
          fullName: true,
          avatarUrl: true,
          title: true,
          bio: true,
          skills: true,
          industries: true,
          rating: true,
          reviewCount: true,
          completedJobs: true,
          isAvailable: true,
          rateType: true,
          rateAmount: true,
          currency: true,
          isVerified: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      total,
      items: items.map((i) => ({
        ...i,
        skills: Array.isArray(i.skills) ? i.skills.map(String) : [],
        industries: Array.isArray(i.industries) ? i.industries.map(String) : [],
      })) as any,
    };
  }

  async getConsultantById(id: string): Promise<ConsultantDetail | null> {
    const record = await this.prisma.consultantProfile.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        fullName: true,
        avatarUrl: true,
        title: true,
        bio: true,
        skills: true,
        industries: true,
        certifications: true,
        email: true,
        phone: true,
        website: true,
        socialLinks: true,
        isAvailable: true,
        rateType: true,
        rateAmount: true,
        currency: true,
        rating: true,
        reviewCount: true,
        completedJobs: true,
        isVerified: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!record) return null;

    // Get recent reviews
    const reviews = await this.prisma.consultantReview.findMany({
      where: { consultantId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, rating: true, review: true, createdAt: true },
    });

    return {
      id: record.id,
      tenantId: record.tenantId,
      fullName: record.fullName,
      avatarUrl: record.avatarUrl,
      title: record.title,
      bio: record.bio,
      skills: Array.isArray(record.skills) ? record.skills.map(String) : [],
      industries: Array.isArray(record.industries) ? record.industries.map(String) : [],
      certifications: Array.isArray(record.certifications) ? record.certifications.map(String) : [],
      email: record.email,
      phone: record.phone,
      website: record.website,
      socialLinks: Array.isArray(record.socialLinks) ? record.socialLinks.map(String) : [],
      isAvailable: record.isAvailable,
      rateType: record.rateType,
      rateAmount: record.rateAmount,
      currency: record.currency,
      rating: record.rating,
      reviewCount: record.reviewCount,
      completedJobs: record.completedJobs,
      isVerified: record.isVerified,
      createdAt: record.createdAt,
      recentReviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        review: r.review,
        createdAt: r.createdAt,
      })),
    };
  }

  async getConsultantByTenantId(tenantId: string): Promise<ConsultantDetail | null> {
    const record = await this.prisma.consultantProfile.findFirst({
      where: { tenantId },
    });
    if (!record) return null;
    return this.getConsultantById(record.id);
  }

  // ═════════════════════════════════════════════════════════════════════
  //  CRUD
  // ═════════════════════════════════════════════════════════════════════

  async createConsultantProfile(
    tenantId: string,
    input: CreateConsultantInput,
  ): Promise<ConsultantDetail> {
    const existing = await this.prisma.consultantProfile.findFirst({
      where: { tenantId },
    });
    if (existing) {
      // Update instead of create (1 profile per tenant)
      return this.updateConsultantProfile(tenantId, input);
    }

    const record = await this.prisma.consultantProfile.create({
      data: {
        tenantId,
        fullName: input.fullName,
        avatarUrl: input.avatarUrl ?? null,
        title: input.title ?? null,
        bio: input.bio ?? null,
        skills: input.skills ?? [],
        industries: input.industries ?? [],
        certifications: input.certifications ?? [],
        email: input.email ?? null,
        phone: input.phone ?? null,
        website: input.website ?? null,
        socialLinks: input.socialLinks ?? [],
        isAvailable: input.isAvailable ?? true,
        rateType: input.rateType ?? null,
        rateAmount: input.rateAmount ?? null,
        currency: input.currency ?? 'USD',
      },
    });

    this.logger.log(`Consultant profile created for tenant ${tenantId}: ${record.id}`);
    return this.getConsultantById(record.id) as Promise<ConsultantDetail>;
  }

  async updateConsultantProfile(
    tenantId: string,
    input: UpdateConsultantInput,
  ): Promise<ConsultantDetail | null> {
    const existing = await this.prisma.consultantProfile.findFirst({
      where: { tenantId },
    });
    if (!existing) return null;

    const data: any = {};
    if (input.fullName !== undefined) data.fullName = input.fullName;
    if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl;
    if (input.title !== undefined) data.title = input.title;
    if (input.bio !== undefined) data.bio = input.bio;
    if (input.skills !== undefined) data.skills = input.skills;
    if (input.industries !== undefined) data.industries = input.industries;
    if (input.certifications !== undefined) data.certifications = input.certifications;
    if (input.email !== undefined) data.email = input.email;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.website !== undefined) data.website = input.website;
    if (input.socialLinks !== undefined) data.socialLinks = input.socialLinks;
    if (input.isAvailable !== undefined) data.isAvailable = input.isAvailable;
    if (input.rateType !== undefined) data.rateType = input.rateType;
    if (input.rateAmount !== undefined) data.rateAmount = input.rateAmount;
    if (input.currency !== undefined) data.currency = input.currency;
    if (input.status !== undefined) data.status = input.status;

    await this.prisma.consultantProfile.update({
      where: { id: existing.id },
      data,
    });

    return this.getConsultantById(existing.id);
  }

  async setAvailability(tenantId: string, isAvailable: boolean): Promise<ConsultantDetail | null> {
    return this.updateConsultantProfile(tenantId, { isAvailable });
  }

  // ═════════════════════════════════════════════════════════════════════
  //  REVIEWS
  // ═════════════════════════════════════════════════════════════════════

  async submitReview(consultantId: string, reviewerTenantId: string, rating: number, review?: string) {
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    // Check consultant exists
    const consultant = await this.prisma.consultantProfile.findUnique({
      where: { id: consultantId },
    });
    if (!consultant) throw new Error('Consultant not found');

    // Check not self-review
    if (consultant.tenantId === reviewerTenantId) {
      throw new Error('Cannot review yourself');
    }

    const record = await this.prisma.consultantReview.upsert({
      where: {
        consultantId_reviewerId: {
          consultantId,
          reviewerId: reviewerTenantId,
        },
      },
      create: {
        consultantId,
        reviewerId: reviewerTenantId,
        rating,
        review: review ?? null,
      },
      update: {
        rating,
        review: review ?? null,
      },
    });

    // Recalculate average rating
    const stats = await this.prisma.consultantReview.aggregate({
      where: { consultantId },
      _avg: { rating: true },
      _count: true,
    });

    await this.prisma.consultantProfile.update({
      where: { id: consultantId },
      data: {
        rating: stats._avg.rating,
        reviewCount: stats._count,
      },
    });

    return record;
  }

  async getReviews(consultantId: string, options: { limit?: number; offset?: number } = {}) {
    const { limit = 20, offset = 0 } = options;

    const [total, items] = await Promise.all([
      this.prisma.consultantReview.count({ where: { consultantId } }),
      this.prisma.consultantReview.findMany({
        where: { consultantId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          rating: true,
          review: true,
          createdAt: true,
        },
      }),
    ]);

    return { total, items };
  }

  // ═════════════════════════════════════════════════════════════════════
  //  BOOKINGS
  // ═════════════════════════════════════════════════════════════════════

  async createBooking(consultantId: string, clientTenantId: string, message?: string) {
    // Check consultant exists and is available
    const consultant = await this.prisma.consultantProfile.findUnique({
      where: { id: consultantId },
    });
    if (!consultant) throw new Error('Consultant not found');
    if (!consultant.isAvailable) throw new Error('Consultant is not available');

    // Check no conflicting active booking
    const activeBooking = await this.prisma.consultantBooking.findFirst({
      where: {
        consultantId,
        clientTenantId,
        status: { in: ['requested', 'confirmed', 'in_progress'] },
      },
    });
    if (activeBooking) throw new Error('You already have an active booking with this consultant');

    const booking = await this.prisma.consultantBooking.create({
      data: {
        consultantId,
        clientTenantId,
        status: 'requested',
        message: message ?? null,
        requestedDate: new Date(),
      },
    });

    // Increment completedJobs on confirmation (done in confirmBooking)

    this.logger.log(`Booking created: ${booking.id} for consultant ${consultantId}`);
    return booking;
  }

  async updateBookingStatus(
    bookingId: string,
    status: 'confirmed' | 'in_progress' | 'completed' | 'cancelled',
  ): Promise<any> {
    const validTransitions: Record<string, string[]> = {
      requested: ['confirmed', 'cancelled'],
      confirmed: ['in_progress', 'cancelled'],
      in_progress: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    const booking = await this.prisma.consultantBooking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) throw new Error('Booking not found');

    const allowed = validTransitions[booking.status] || [];
    if (!allowed.includes(status)) {
      throw new Error(`Cannot transition from ${booking.status} to ${status}`);
    }

    const data: any = { status };

    if (status === 'completed') {
      data.completedAt = new Date();
      // Increment completedJobs on consultant profile
      await this.prisma.consultantProfile.update({
        where: { id: booking.consultantId },
        data: { completedJobs: { increment: 1 } },
      });
    }

    return this.prisma.consultantBooking.update({
      where: { id: bookingId },
      data,
    });
  }

  async getBookings(
    tenantId: string,
    role: 'client' | 'consultant',
    options: { status?: string; limit?: number; offset?: number } = {},
  ) {
    const { status, limit = 20, offset = 0 } = options;
    const where: any = {};

    if (role === 'client') {
      where.clientTenantId = tenantId;
    } else {
      // Find consultant profile for this tenant
      const profile = await this.prisma.consultantProfile.findFirst({
        where: { tenantId },
        select: { id: true },
      });
      if (!profile) return { total: 0, items: [] };
      where.consultantId = profile.id;
    }

    if (status) where.status = status;

    const [total, items] = await Promise.all([
      this.prisma.consultantBooking.count({ where }),
      this.prisma.consultantBooking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          consultantId: true,
          clientTenantId: true,
          status: true,
          message: true,
          requestedDate: true,
          completedAt: true,
          amount: true,
          currency: true,
          paymentStatus: true,
          createdAt: true,
        },
      }),
    ]);

    return { total, items };
  }
}
