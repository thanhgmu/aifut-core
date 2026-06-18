// ============================================================================
// payments/analytics/analytics.controller.ts
// REST endpoints cho AI Cost Analytics Dashboard (Batch 1).
//   GET /billing/analytics/scorecard
//   GET /billing/analytics/trends
//   GET /billing/analytics/matrix
// Bảo mật chống IDOR: tenantId LUÔN được resolve từ header x-tenant-slug
// (resolveTenantId), KHÔNG BAO GIỜ nhận tenantId trực tiếp từ client query.
// ============================================================================

import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Query,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { AnalyticsService } from './analytics.service';
import type {
  AnalyticsGranularity,
  CostTrendResponse,
  ModelMatrixResponse,
  ScorecardResponse,
} from './analytics.types';

@Controller('billing/analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly prisma: PrismaService,
  ) {}

  // --------------------------------------------------------------------------
  // Tenant isolation — chống IDOR
  // --------------------------------------------------------------------------

  /**
   * Resolve tenantId từ header context (x-tenant-slug). Đây là biên giới cô lập
   * dữ liệu đa thuê nhà: client không thể truyền tenantId tùy ý qua query.
   */
  private async resolveTenantId(slug?: string): Promise<string> {
    if (!slug || !slug.trim()) {
      throw new BadRequestException('x-tenant-slug header required');
    }
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: slug.trim() } });
    if (!tenant) throw new NotFoundException(`Tenant '${slug}' not found`);
    return tenant.id;
  }

  // --------------------------------------------------------------------------
  // Date / param parsing helpers
  // --------------------------------------------------------------------------

  /** Đầu tháng hiện tại (UTC) làm mặc định startDate. */
  private defaultStart(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  }

  /** Cuối ngày hôm nay (UTC) làm mặc định endDate. */
  private defaultEnd(): Date {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
    );
  }

  /** Parse ISO date an toàn; fallback về giá trị mặc định nếu thiếu/invalid. */
  private parseDate(value: string | undefined, fallback: Date, endOfDay = false): Date {
    if (!value) return fallback;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }
    if (endOfDay && value.length <= 10) {
      d.setUTCHours(23, 59, 59, 999);
    }
    return d;
  }

  /** Chuẩn hóa khoảng thời gian + chặn range đảo ngược. */
  private resolveRange(startDate?: string, endDate?: string): { start: Date; end: Date } {
    const start = this.parseDate(startDate, this.defaultStart());
    const end = this.parseDate(endDate, this.defaultEnd(), true);
    if (start.getTime() > end.getTime()) {
      throw new BadRequestException('startDate must be before endDate');
    }
    return { start, end };
  }

  private parseGranularity(value?: string): AnalyticsGranularity {
    if (value === 'week' || value === 'month') return value;
    return 'day';
  }

  private parseModelKeys(value?: string): string[] {
    if (!value || value.trim().toLowerCase() === 'all') return [];
    return value
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
  }

  private isoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  // --------------------------------------------------------------------------
  // Endpoints
  // --------------------------------------------------------------------------

  /** Zone 1 — KPI scorecard. */
  @Get('scorecard')
  async scorecard(
    @Headers('x-tenant-slug') slug: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<ScorecardResponse> {
    const tenantId = await this.resolveTenantId(slug);
    const { start, end } = this.resolveRange(startDate, endDate);
    const scorecard = await this.analytics.getScorecardMetrics(tenantId, start, end);
    return {
      tenantId,
      period: { start: this.isoDate(start), end: this.isoDate(end) },
      scorecard,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Zone 2 — Cost & token trend time-series. */
  @Get('trends')
  async trends(
    @Headers('x-tenant-slug') slug: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('granularity') granularity?: string,
    @Query('modelKeys') modelKeys?: string,
  ): Promise<CostTrendResponse> {
    const tenantId = await this.resolveTenantId(slug);
    const { start, end } = this.resolveRange(startDate, endDate);
    const gran = this.parseGranularity(granularity);
    const models = this.parseModelKeys(modelKeys);
    const costTrend = await this.analytics.getCostTrends(tenantId, start, end, gran, models);
    return {
      tenantId,
      period: { start: this.isoDate(start), end: this.isoDate(end) },
      granularity: gran,
      costTrend,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Zone 3 — Model efficiency matrix + anomaly. */
  @Get('matrix')
  async matrix(
    @Headers('x-tenant-slug') slug: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<ModelMatrixResponse> {
    const tenantId = await this.resolveTenantId(slug);
    const { start, end } = this.resolveRange(startDate, endDate);
    const result = await this.analytics.getModelMatrix(tenantId, start, end);
    return {
      tenantId,
      period: { start: this.isoDate(start), end: this.isoDate(end) },
      models: result.models,
      anomalyCount: result.anomalyCount,
      anomalyModels: result.anomalyModels,
      anomalyThreshold: result.anomalyThreshold,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Capabilities probe (đồng bộ pattern với các controller khác). */
  @Get('capabilities')
  capabilities() {
    return {
      capability: 'billing-analytics',
      status: 'active',
      supports: {
        scorecard: true,
        costTrend: true,
        modelMatrix: true,
        anomalyDetection: true,
        tenantIsolation: true,
      },
    };
  }
}
