// ═══════════════════════════════════════════════════════════════════════════
// compliance.controller.ts — Compliance & Audit Trail REST API
// ═══════════════════════════════════════════════════════════════════════════
// Route gốc: /v1/compliance
// Audit log viewer, compliance reports, data export.

import {
  Controller,
  Get,
  Headers,
  Query,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ComplianceService } from './compliance.service';

@Controller('v1/compliance')
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  /**
   * GET /v1/compliance/audit-log
   * Lấy audit log với filter + pagination (model AuditEvent).
   */
  @Get('audit-log')
  async getAuditLog(
    @Headers('x-tenant-id') tenantId: string,
    @Query('action') action?: string,
    @Query('actorType') actorType?: string,
    @Query('targetType') targetType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    this.requireTenant(tenantId);
    return this.compliance.getAuditLog(tenantId, {
      action,
      actorType,
      targetType,
      from,
      to,
      search,
      page: parseInt(page ?? '1', 10) || 1,
      pageSize: parseInt(pageSize ?? '20', 10) || 20,
    });
  }

  /**
   * GET /v1/compliance/audit-log/v2
   * Backup query dùng model AuditLog.
   */
  @Get('audit-log/v2')
  async getAuditLogV2(
    @Headers('x-tenant-id') tenantId: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    this.requireTenant(tenantId);
    return this.compliance.getAuditLogV2(tenantId, {
      action,
      from,
      to,
      page: parseInt(page ?? '1', 10) || 1,
      pageSize: parseInt(pageSize ?? '20', 10) || 20,
    });
  }

  /**
   * GET /v1/compliance/report
   * Compliance report — summary stats.
   */
  @Get('report')
  async getReport(
    @Headers('x-tenant-id') tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    this.requireTenant(tenantId);
    return this.compliance.getComplianceReport(tenantId, { from, to });
  }

  /**
   * GET /v1/compliance/export
   * Export audit log — CSV hoặc JSON.
   */
  @Get('export')
  async exportAuditLog(
    @Headers('x-tenant-id') tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('format') format?: 'csv' | 'json',
  ) {
    this.requireTenant(tenantId);
    const result = await this.compliance.exportAuditLog(tenantId, { from, to, format });
    return result;
  }

  private requireTenant(tenantId?: string): asserts tenantId is string {
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
      throw new BadRequestException('x-tenant-id header is required.');
    }
  }
}
