// ═══════════════════════════════════════════════════════════════════════════
// consultant.controller.ts — Consultant/Expert Directory REST API
// ═══════════════════════════════════════════════════════════════════════════
// Route gốc: /v1/consultants
// Search profiles, CRUD, reviews, booking.
// ═══════════════════════════════════════════════════════════════════════════

import {
  Controller, Get, Post, Patch,
  Headers, Query, Param, Body,
  BadRequestException, NotFoundException,
} from '@nestjs/common';
import { ConsultantService } from './consultant.service';

@Controller('v1/consultants')
export class ConsultantController {
  constructor(private readonly consultant: ConsultantService) {}

  // ── Search ───────────────────────────────────────────────────────
  @Get()
  async search(
    @Query('search') search?: string,
    @Query('skills') skills?: string,
    @Query('industries') industries?: string,
    @Query('minRating') minRating?: string,
    @Query('isAvailable') isAvailable?: string,
    @Query('isVerified') isVerified?: string,
    @Query('rateType') rateType?: string,
    @Query('priceMin') priceMin?: string,
    @Query('priceMax') priceMax?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('orderBy') orderBy?: string,
    @Query('orderDir') orderDir?: string,
  ) {
    return this.consultant.searchConsultants({
      search,
      skills: skills ? skills.split(',').map((s) => s.trim()) : undefined,
      industries: industries ? industries.split(',').map((s) => s.trim()) : undefined,
      minRating: minRating ? parseFloat(minRating) : undefined,
      isAvailable: isAvailable !== undefined ? isAvailable === 'true' : undefined,
      isVerified: isVerified !== undefined ? isVerified === 'true' : undefined,
      rateType,
      priceMin: priceMin ? parseFloat(priceMin) : undefined,
      priceMax: priceMax ? parseFloat(priceMax) : undefined,
      limit: parseInt(limit ?? '20', 10) || 20,
      offset: parseInt(offset ?? '0', 10) || 0,
      orderBy: orderBy ?? 'rating',
      orderDir: (orderDir as 'asc' | 'desc') ?? 'desc',
    });
  }

  // ── Profile Detail ───────────────────────────────────────────────
  @Get(':id')
  async getById(@Param('id') id: string) {
    const profile = await this.consultant.getConsultantById(id);
    if (!profile) throw new NotFoundException('Consultant not found');
    return profile;
  }

  // ── My Profile (by tenant) ───────────────────────────────────────
  @Get('me/profile')
  async getMyProfile(@Headers('x-tenant-id') tenantId: string) {
    if (!tenantId) throw new BadRequestException('x-tenant-id header is required.');
    const profile = await this.consultant.getConsultantByTenantId(tenantId);
    if (!profile) throw new NotFoundException('Consultant profile not found. Create one first.');
    return profile;
  }

  // ── Create / Update Profile ──────────────────────────────────────
  @Post('me/profile')
  async upsertProfile(
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: {
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
    },
  ) {
    if (!tenantId) throw new BadRequestException('x-tenant-id header is required.');
    if (!body.fullName) throw new BadRequestException('fullName is required.');
    return this.consultant.createConsultantProfile(tenantId, body);
  }

  // ── Update Profile ───────────────────────────────────────────────
  @Patch('me/profile')
  async updateProfile(
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: {
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
    },
  ) {
    if (!tenantId) throw new BadRequestException('x-tenant-id header is required.');
    const updated = await this.consultant.updateConsultantProfile(tenantId, body);
    if (!updated) throw new NotFoundException('Consultant profile not found.');
    return updated;
  }

  // ── Toggle Availability ──────────────────────────────────────────
  @Patch('me/availability')
  async setAvailability(
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: { isAvailable: boolean },
  ) {
    if (!tenantId) throw new BadRequestException('x-tenant-id header is required.');
    const updated = await this.consultant.setAvailability(tenantId, body.isAvailable);
    if (!updated) throw new NotFoundException('Consultant profile not found.');
    return updated;
  }

  // ── Reviews ──────────────────────────────────────────────────────
  @Get(':id/reviews')
  async getReviews(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.consultant.getReviews(id, {
      limit: parseInt(limit ?? '20', 10) || 20,
      offset: parseInt(offset ?? '0', 10) || 0,
    });
  }

  @Post(':id/reviews')
  async submitReview(
    @Param('id') id: string,
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: { rating: number; review?: string },
  ) {
    if (!tenantId) throw new BadRequestException('x-tenant-id header is required.');
    if (!body.rating || body.rating < 1 || body.rating > 5) {
      throw new BadRequestException('rating must be between 1 and 5');
    }
    return this.consultant.submitReview(id, tenantId, body.rating, body.review);
  }

  // ── Bookings ─────────────────────────────────────────────────────
  @Post(':id/book')
  async createBooking(
    @Param('id') id: string,
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: { message?: string },
  ) {
    if (!tenantId) throw new BadRequestException('x-tenant-id header is required.');
    return this.consultant.createBooking(id, tenantId, body?.message);
  }

  @Get('bookings/mine')
  async getMyBookings(
    @Headers('x-tenant-id') tenantId: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    if (!tenantId) throw new BadRequestException('x-tenant-id header is required.');
    return this.consultant.getBookings(tenantId, (role as 'client' | 'consultant') || 'client', {
      status,
      limit: parseInt(limit ?? '20', 10) || 20,
      offset: parseInt(offset ?? '0', 10) || 0,
    });
  }

  @Patch('bookings/:bookingId/status')
  async updateBookingStatus(
    @Param('bookingId') bookingId: string,
    @Body() body: { status: string },
  ) {
    if (!body.status) throw new BadRequestException('status is required.');
    return this.consultant.updateBookingStatus(
      bookingId,
      body.status as any,
    );
  }
}
