// ═══════════════════════════════════════════════════════════════════════════
// licensing.controller.ts — License Key REST API
// ═══════════════════════════════════════════════════════════════════════════
// Route gốc: /v1/licensing
// Quản lý activation & validation cho on-premise deployment.

import {
  Controller,
  Get,
  Post,
  Patch,
  Headers,
  Body,
  Param,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { LicensingService } from './licensing.service';
import { LicenseTier } from '@prisma/client';

@Controller('v1/licensing')
export class LicensingController {
  constructor(private readonly licensing: LicensingService) {}

  /**
   * POST /v1/licensing/generate
   * Tạo license key mới (admin-only).
   */
  @Post('generate')
  async generateKey(
    @Body()
    body: {
      tier: string;
      maxUsers?: number;
      maxWorkflows?: number;
      features?: string[];
      issuedTo?: string;
      issuedEmail?: string;
      validityDays?: number;
    },
  ) {
    this.requireValue(body.tier, 'tier');
    const tier = body.tier.toUpperCase() as LicenseTier;
    if (!Object.values(LicenseTier).includes(tier)) {
      throw new BadRequestException(
        `tier phải là: ${Object.values(LicenseTier).join(', ')}`,
      );
    }

    return this.licensing.generateKey({
      tier,
      maxUsers: body.maxUsers,
      maxWorkflows: body.maxWorkflows,
      features: body.features,
      issuedTo: body.issuedTo,
      issuedEmail: body.issuedEmail,
      validityDays: body.validityDays,
    });
  }

  /**
   * POST /v1/licensing/activate
   * Kích hoạt license key cho tenant.
   */
  @Post('activate')
  async activateKey(
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: { key: string },
  ) {
    this.requireTenant(tenantId);
    this.requireValue(body.key, 'key');
    return this.licensing.activateKey({
      key: body.key.trim().toUpperCase(),
      tenantId: tenantId.trim(),
    });
  }

  /**
   * GET /v1/licensing/status
   * Kiểm tra trạng thái license của tenant.
   */
  @Get('status')
  async getStatus(@Headers('x-tenant-id') tenantId: string) {
    this.requireTenant(tenantId);
    return this.licensing.validateLicense(tenantId.trim());
  }

  /**
   * GET /v1/licensing/tenant
   * Lấy thông tin license hiện tại của tenant.
   */
  @Get('tenant')
  async getTenantLicense(@Headers('x-tenant-id') tenantId: string) {
    this.requireTenant(tenantId);
    return this.licensing.getTenantLicense(tenantId.trim());
  }

  /**
   * GET /v1/licensing/list
   * Danh sách tất cả license (admin).
   */
  @Get('list')
  async listLicenses(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.licensing.listLicenses({
      status,
      page: parseInt(page ?? '1', 10) || 1,
      pageSize: parseInt(pageSize ?? '20', 10) || 20,
    });
  }

  /**
   * PATCH /v1/licensing/:id/revoke
   * Thu hồi license (admin).
   */
  @Patch(':id/revoke')
  async revokeLicense(@Param('id') id: string) {
    this.requireValue(id, 'id');
    return this.licensing.revokeLicense(id.trim());
  }

  /**
   * POST /v1/licensing/trial
   * Tạo trial key cho tenant mới.
   */
  @Post('trial')
  async generateTrial(@Headers('x-tenant-id') tenantId: string) {
    this.requireTenant(tenantId);
    return this.licensing.generateTrialKey(tenantId.trim());
  }

  private requireTenant(tenantId?: string): asserts tenantId is string {
    if (
      !tenantId ||
      typeof tenantId !== 'string' ||
      tenantId.trim().length === 0
    ) {
      throw new BadRequestException('x-tenant-id header là bắt buộc.');
    }
  }

  private requireValue(
    value: unknown,
    name: string,
  ): asserts value is string {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`'${name}' là bắt buộc.`);
    }
  }
}
