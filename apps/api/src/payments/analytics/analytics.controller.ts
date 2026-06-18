// ============================================================================
// payments/analytics/analytics.controller.ts
// REST endpoints cho AI Cost Analytics Dashboard (Batch 1 → Batch 4).
//   GET /ai-analytics/scorecard
//   GET /ai-analytics/trends
//   GET /ai-analytics/matrix
// Bảo mật chống IDOR: tenantId LUÔN được resolve từ header, KHÔNG BAO GIỜ
// nhận tenantId trực tiếp từ client query.
// Resolver hỗ trợ đồng thời:
//   - x-tenant-id   (ưu tiên — UUID, khớp auth-context các module khác)
//   - x-tenant-slug (fallback — DX/khả dụng từ FE hiện tại)
// Route đã nắn về @Controller('ai-analytics') khớp URL Frontend gọi sang (G1).
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

@Controller('ai-analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly prisma: PrismaService,
  ) {}

  // --------------------------------------------------------------------------
  // Tenant isolation — chống IDOR
  // --------------------------------------------------------------------------

  /**
   * Resolve tenantId từ header context (x-tenant-id ưu tiên, x-tenant-slug
   * fallback). Đây là biên giới cô lập dữ liệu đa thuê nhà: client không thể
   * truyền tenantId tùy ý qua query.
   *
   * Luồng phân giải:
   *   1. Nếu có x-tenant-id   → prisma.tenant.findUnique({ where:{ id }})
   *   2. Else nếu x-tenant-slug → prisma.tenant.findUnique({ where:{ slug }})
   *   3. Else → BadRequest('x-tenant-id hoặc x-tenant-slug header required')
   */
  private async resolveTenantId(
    slug?: string,
    id?: string,
  ): Promise<string> {
    // Ưu tiên x-tenant-id (UUID)
    if (id && id.trim()) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: id.trim() },
      });
      if (!tenant)
        throw new NotFoundException(`Tenant '${id}' not found by x-tenant-id`);
      return tenant.id;
    }

    // Fallback x-tenant-slug
    if (slug && slug.trim()) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug: slug.trim() },
      });
      if (!tenant)
        throw new NotFoundException(`Tenant '${slug}' not found by x-tenant-slug`);
      return tenant.id;
    }

    throw new BadRequestException(
      'x-tenant-id hoặc x-tenant-slug header required',
    );
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
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException(`Invalid date: ${value}`);
      }
      if (endOfDay && value.length <= 10) {
        d.setUTCHours(23, 59, 59, 999);
      }
      return d;
    } catch {
      return fallback;
    }
  }

  /** Chuẩn hóa khoảng thời gian + chặn range đảo ngược. */
  private resolveRange(
    startDate?: string,
    endDate?: string,
  ): { start: Date; end: Date } {
    const start = this.parseDate(startDate, this.defaultStart());
    const end = this.parseDate(endDate, this.defaultEnd(), true);
    if (start.getTime() > end.getTime()) {
      throw new BadRequestException('startDate must be before endDate');
    }
    return { start, end };
  }

  private parseGranularity(value?: string): AnalyticsGranularity {
    if (value === 'day' || value === 'week' || value === 'month' || value === 'auto')
      return value;
    return 'day';
  }

  private parseModelKeys(value?: string): string[] {
    if (!value || value.trim().toLowerCase() === 'all') return [];
    return value
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
  }

  // --------------------------------------------------------------------------
  // Endpoints
  // --------------------------------------------------------------------------

  /** Zone 1 — KPI scorecard. */
  @Get('scorecard')
  async scorecard(
    @Headers('x-tenant-slug') slug: string,
    @Headers('x-tenant-id') tenantIdHeader: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<ScorecardResponse> {
    const tenantId = await this.resolveTenantId(slug, tenantIdHeader);
    const { start, end } = this.resolveRange(startDate, endDate);
    const scorecard = await this.analytics.getScorecardMetrics(tenantId, start, end);
    return {
      tenantId,
      period: {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
      },
      scorecard,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Zone 2 — Cost & token trend time-series. */
  @Get('trends')
  async trends(
    @Headers('x-tenant-slug') slug: string,
    @Headers('x-tenant-id') tenantIdHeader: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('granularity') granularity?: string,
    @Query('modelKeys') modelKeys?: string,
  ): Promise<CostTrendResponse> {
    const tenantId = await this.resolveTenantId(slug, tenantIdHeader);
    const { start, end } = this.resolveRange(startDate, endDate);
    const gran = this.parseGranularity(granularity);
    const models = this.parseModelKeys(modelKeys);
    const costTrend = await this.analytics.getCostTrends(
      tenantId,
      start,
      end,
      gran,
      models,
    );
    return {
      tenantId,
      period: {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
      },
      granularity: gran,
      costTrend,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Zone 3 — Model efficiency matrix + anomaly 3 tầng. */
  @Get('matrix')
  async matrix(
    @Headers('x-tenant-slug') slug: string,
    @Headers('x-tenant-id') tenantIdHeader: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('modelKeys') modelKeys?: string,
  ): Promise<ModelMatrixResponse> {
    const tenantId = await this.resolveTenantId(slug, tenantIdHeader);
    const { start, end } = this.resolveRange(startDate, endDate);
    const models = this.parseModelKeys(modelKeys);
    const result = await this.analytics.getModelMatrix(
      tenantId,
      start,
      end,
      models,
    );
    return {
      tenantId,
      period: {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
      },
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
      capability: 'ai-analytics',
      status: 'active',
      supports: {
        scorecard: true,
        costTrend: true,
        modelMatrix: true,
        anomalyDetection: true,
        autoGranularity: true,
        modelKeysFilter: true,
        tenantIsolation: true,
      },
    };
  }
}
