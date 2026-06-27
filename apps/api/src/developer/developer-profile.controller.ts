// ═══════════════════════════════════════════════════════════════════════════
// developer-profile.controller.ts — Developer Profile REST API
// ═══════════════════════════════════════════════════════════════════════════
// Route gốc: /v1/developer/profile
// Tenant isolation qua x-tenant-id header — chống IDOR tuyệt đối.

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Headers,
  Param,
  Body,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { DeveloperProfileService } from './developer-profile.service';
import type { CreateDeveloperProfileInput, AddSkillInput } from './developer-profile.service';

@Controller('v1/developer/profile')
export class DeveloperProfileController {
  constructor(private readonly devProfile: DeveloperProfileService) {}

  /**
   * POST /v1/developer/profile/register
   * Đăng ký hồ sơ developer cho tenant hiện tại.
   */
  @Post('register')
  async register(
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: CreateDeveloperProfileInput,
  ) {
    this.requireTenantId(tenantId);
    return this.devProfile.register(tenantId, body);
  }

  /**
   * PUT /v1/developer/profile
   * Cập nhật hồ sơ developer.
   */
  @Put()
  async update(
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: Partial<CreateDeveloperProfileInput>,
  ) {
    this.requireTenantId(tenantId);
    return this.devProfile.updateProfile(tenantId, body);
  }

  /**
   * GET /v1/developer/profile
   * Lấy hồ sơ developer hiện tại.
   */
  @Get()
  async get(
    @Headers('x-tenant-id') tenantId: string,
  ) {
    this.requireTenantId(tenantId);
    return this.devProfile.getProfile(tenantId);
  }

  /**
   * GET /v1/developer/profile/stats
   * Thống kê tổng hợp cho developer dashboard.
   */
  @Get('stats')
  async stats(
    @Headers('x-tenant-id') tenantId: string,
  ) {
    this.requireTenantId(tenantId);
    return this.devProfile.getStats(tenantId);
  }

  /**
   * POST /v1/developer/profile/skills
   * Thêm hoặc cập nhật kỹ năng.
   */
  @Post('skills')
  async addSkill(
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: AddSkillInput,
  ) {
    this.requireTenantId(tenantId);
    if (!body.skill || body.skill.trim().length === 0) {
      throw new BadRequestException('skill is required.');
    }
    return this.devProfile.addSkill(tenantId, body);
  }

  /**
   * DELETE /v1/developer/profile/skills/:skill
   * Xoá kỹ năng khỏi hồ sơ.
   */
  @Delete('skills/:skill')
  async removeSkill(
    @Headers('x-tenant-id') tenantId: string,
    @Param('skill') skill: string,
  ) {
    this.requireTenantId(tenantId);
    return this.devProfile.removeSkill(tenantId, skill);
  }

  /**
   * GET /v1/developer/profile/developers
   * Public listing — tìm kiếm developer theo kỹ năng, tier, quốc gia.
   */
  @Get('developers')
  async listDevelopers(
    @Query('tier') tier?: string,
    @Query('skill') skill?: string,
    @Query('country') country?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.devProfile.listDevelopers({
      tier,
      skill,
      country,
      search,
      page: parseInt(page ?? '1', 10) || 1,
      pageSize: parseInt(pageSize ?? '20', 10) || 20,
    });
  }

  /**
   * GET /v1/developer/profile/:id
   * Public lookup — xem hồ sơ developer theo ID.
   */
  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.devProfile.getProfileById(id);
  }

  // ── Private ────────────────────────────────────────────────────────────

  private requireTenantId(tenantId?: string): asserts tenantId is string {
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
      throw new BadRequestException('x-tenant-id header is required.');
    }
  }
}
