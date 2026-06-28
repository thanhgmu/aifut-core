// ═══════════════════════════════════════════════════════════════════════════
// analytics-bi.controller.ts — Analytics BI REST API
// ═══════════════════════════════════════════════════════════════════════════
// Route gốc: /v1/analytics
// Health report, tenant analytics, cross-tenant benchmarks, cohorts, trends,
// anomaly detection records, stats, resolve/acknowledge,
// predictive recommendations (connectors, templates, workflows).
// ═══════════════════════════════════════════════════════════════════════════

import {
  Controller, Get, Post, Patch, Delete,
  Headers, Query, Param, Body,
  BadRequestException, NotFoundException,
} from '@nestjs/common';
import { AnalyticsBiService } from './analytics-bi.service';
import { AnomalyDetectorService } from './anomaly-detector.service';
import { RecommendationService } from './recommendation.service';

@Controller('v1/analytics')
export class AnalyticsBiController {
  constructor(
    private readonly analytics: AnalyticsBiService,
    private readonly anomalyDetector: AnomalyDetectorService,
    private readonly recommendation: RecommendationService,
  ) {}

  // ═════════════════════════════════════════════════════════════════════
  //  PLATFORM HEALTH
  // ═════════════════════════════════════════════════════════════════════

  /**
   * GET /v1/analytics/health
   * Platform health report — active tenants, executions, success rate, anomalies, revenue.
   */
  @Get('health')
  async getHealth() {
    return this.analytics.getPlatformHealth();
  }

  // ═════════════════════════════════════════════════════════════════════
  //  TENANT ANALYTICS
  // ═════════════════════════════════════════════════════════════════════

  /**
   * GET /v1/analytics/tenant
   * Lấy analytics snapshot cho tenant hiện tại.
   */
  @Get('tenant')
  async getTenantAnalytics(
    @Headers('x-tenant-id') tenantId: string,
    @Query('period') period?: string,
    @Query('since') since?: string,
  ) {
    if (!tenantId) throw new BadRequestException('x-tenant-id header is required.');
    return this.analytics.getTenantAnalytics(
      tenantId,
      (period as 'HOURLY' | 'DAILY') || 'DAILY',
      since ? new Date(since) : undefined,
    );
  }

  /**
   * GET /v1/analytics/tenant/benchmark
   * Tenant benchmark dashboard: so sánh tenant hiện tại với industry peers.
   * Trả về percentile ranking, deviation, composite health score.
   */
  @Get('tenant/benchmark')
  async getTenantBenchmark(
    @Headers('x-tenant-id') tenantId: string,
    @Query('period') period?: string,
    @Query('industry') industry?: string,
  ) {
    if (!tenantId) throw new BadRequestException('x-tenant-id header is required.');
    return this.analytics.getTenantBenchmarkComparison(
      tenantId,
      {
        period: (period as 'HOURLY' | 'DAILY') || 'DAILY',
        industry,
      },
    );
  }

  // ═════════════════════════════════════════════════════════════════════
  //  CROSS-TENANT ANALYTICS
  // ═════════════════════════════════════════════════════════════════════

  /**
   * GET /v1/analytics/cross-tenant/benchmarks
   * Cross-tenant benchmarks (anonymized) từ GlobalPlatformBenchmark.
   */
  @Get('cross-tenant/benchmarks')
  async getCrossTenantBenchmarks(
    @Query('industry') industry?: string,
    @Query('metricName') metricName?: string,
    @Query('limit') limit?: string,
  ) {
    return this.analytics.getCrossTenantBenchmarks({
      industry,
      metricName,
      limit: parseInt(limit ?? '20', 10) || 20,
    });
  }

  /**
   * GET /v1/analytics/cross-tenant/cohorts
   * Cohort analysis: phân nhóm tenant theo quy mô.
   */
  @Get('cross-tenant/cohorts')
  async getCohortAnalysis(
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.getCohortAnalysis({
      period: (period as 'HOURLY' | 'DAILY') || 'DAILY',
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  /**
   * GET /v1/analytics/cross-tenant/trends
   * Trend data: daily aggregated totals (anonymized).
   */
  @Get('cross-tenant/trends')
  async getTrendData(
    @Query('period') period?: string,
    @Query('days') days?: string,
  ) {
    return this.analytics.getTrendData({
      period: (period as 'HOURLY' | 'DAILY') || 'DAILY',
      days: parseInt(days ?? '30', 10) || 30,
    });
  }

  // ═════════════════════════════════════════════════════════════════════
  //  PREDICTIVE RECOMMENDATIONS
  // ═════════════════════════════════════════════════════════════════════

  /**
   * GET /v1/analytics/recommendations/connectors
   * Gợi ý connectors cho tenant dựa trên peer installs + content similarity + popularity.
   *
   * Query params:
   *   limit     — max items (default 10)
   *   minScore  — minimum combined score (default 0.1)
   *   coldStart — set true to skip collaborative filtering (new tenant)
   *   industry  — filter by industry (for cold start)
   */
  @Get('recommendations/connectors')
  async getConnectorRecommendations(
    @Headers('x-tenant-id') tenantId: string,
    @Query('limit') limit?: string,
    @Query('minScore') minScore?: string,
    @Query('coldStart') coldStart?: string,
    @Query('industry') industry?: string,
  ) {
    if (!tenantId) throw new BadRequestException('x-tenant-id header is required.');

    if (coldStart === 'true') {
      return this.recommendation.getColdStartRecommendations(tenantId, 'connector', {
        limit: parseInt(limit ?? '10', 10) || 10,
        industry,
      });
    }

    return this.recommendation.getConnectorRecommendations(tenantId, {
      limit: parseInt(limit ?? '10', 10) || 10,
      minScore: parseFloat(minScore ?? '0.1') || 0.1,
    });
  }

  /**
   * GET /v1/analytics/recommendations/templates
   * Gợi ý workflow templates cho tenant.
   */
  @Get('recommendations/templates')
  async getTemplateRecommendations(
    @Headers('x-tenant-id') tenantId: string,
    @Query('limit') limit?: string,
    @Query('minScore') minScore?: string,
    @Query('coldStart') coldStart?: string,
    @Query('industry') industry?: string,
  ) {
    if (!tenantId) throw new BadRequestException('x-tenant-id header is required.');

    if (coldStart === 'true') {
      return this.recommendation.getColdStartRecommendations(tenantId, 'template', {
        limit: parseInt(limit ?? '10', 10) || 10,
        industry,
      });
    }

    return this.recommendation.getTemplateRecommendations(tenantId, {
      limit: parseInt(limit ?? '10', 10) || 10,
      minScore: parseFloat(minScore ?? '0.1') || 0.1,
    });
  }

  /**
   * GET /v1/analytics/recommendations/workflows
   * Gợi ý workflows cho tenant.
   */
  @Get('recommendations/workflows')
  async getWorkflowRecommendations(
    @Headers('x-tenant-id') tenantId: string,
    @Query('limit') limit?: string,
    @Query('minScore') minScore?: string,
    @Query('coldStart') coldStart?: string,
    @Query('industry') industry?: string,
  ) {
    if (!tenantId) throw new BadRequestException('x-tenant-id header is required.');

    if (coldStart === 'true') {
      return this.recommendation.getColdStartRecommendations(tenantId, 'workflow', {
        limit: parseInt(limit ?? '10', 10) || 10,
        industry,
      });
    }

    return this.recommendation.getWorkflowRecommendations(tenantId, {
      limit: parseInt(limit ?? '10', 10) || 10,
      minScore: parseFloat(minScore ?? '0.1') || 0.1,
    });
  }

  // ═════════════════════════════════════════════════════════════════════
  //  ANOMALY DETECTION — CRUD
  // ═════════════════════════════════════════════════════════════════════

  /**
   * GET /v1/analytics/anomalies
   * Query anomaly records với filter.
   *
   * Query params:
   *   tenantId     — filter by tenant
   *   severity     — LOW | MEDIUM | HIGH | CRITICAL
   *   anomalyType  — SPIKING_COST | SPIKING_TOKENS | ...
   *   isResolved   — true | false
   *   from         — ISO date (detectedAt >=)
   *   to           — ISO date (detectedAt <=)
   *   limit        — max items (default 50)
   *   offset       — pagination offset
   *   orderBy      — detectedAt | severity | createdAt
   *   orderDir     — asc | desc
   */
  @Get('anomalies')
  async queryAnomalies(
    @Query('tenantId') tenantId?: string,
    @Query('severity') severity?: string,
    @Query('anomalyType') anomalyType?: string,
    @Query('isResolved') isResolved?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('orderBy') orderBy?: string,
    @Query('orderDir') orderDir?: string,
  ) {
    return this.analytics.queryAnomalies({
      tenantId,
      severity,
      anomalyType,
      isResolved: isResolved !== undefined ? isResolved === 'true' : undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit: parseInt(limit ?? '50', 10) || 50,
      offset: parseInt(offset ?? '0', 10) || 0,
      orderBy: (orderBy as any) || 'detectedAt',
      orderDir: (orderDir as 'asc' | 'desc') || 'desc',
    });
  }

  /**
   * GET /v1/analytics/anomalies/stats
   * Thống kê anomaly: tổng, unresolved, phân bố severity/type, trend theo ngày.
   */
  @Get('anomalies/stats')
  async getAnomalyStats(
    @Query('tenantId') tenantId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.getAnomalyStats({
      tenantId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  /**
   * GET /v1/analytics/anomalies/:id
   * Lấy chi tiết một anomaly record.
   */
  @Get('anomalies/:id')
  async getAnomalyById(@Param('id') id: string) {
    const record = await this.analytics.getAnomalyById(id);
    if (!record) throw new NotFoundException(`Anomaly record ${id} not found`);
    return record;
  }

  /**
   * POST /v1/analytics/anomalies/detect/tenant/:tenantId
   * Run anomaly detection for a specific tenant (on-demand).
   * Returns detection results directly.
   */
  @Post('anomalies/detect/tenant/:tenantId')
  async detectForTenant(
    @Param('tenantId') tenantId: string,
    @Query('period') period?: string,
  ) {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    return this.anomalyDetector.detectForTenant(tenantId, {
      period: (period as 'HOURLY' | 'DAILY') || 'HOURLY',
    });
  }

  /**
   * POST /v1/analytics/anomalies/detect/all
   * Run anomaly detection for all tenants (on-demand).
   * Useful for admin to trigger a manual detection pass.
   */
  @Post('anomalies/detect/all')
  async detectAllTenants(
    @Query('period') period?: string,
  ) {
    return this.anomalyDetector.runAllTenantDetection({
      period: (period as 'HOURLY' | 'DAILY') || 'HOURLY',
    });
  }

  /**
   * PATCH /v1/analytics/anomalies/:id/resolve
   * Resolve một anomaly.
   */
  @Patch('anomalies/:id/resolve')
  async resolveAnomaly(
    @Param('id') id: string,
    @Body() body: { resolvedBy?: string },
  ) {
    return this.analytics.resolveAnomaly(id, body?.resolvedBy);
  }

  /**
   * PATCH /v1/analytics/anomalies/:id/acknowledge
   * Acknowledge một anomaly (đã xem).
   */
  @Patch('anomalies/:id/acknowledge')
  async acknowledgeAnomaly(@Param('id') id: string) {
    return this.analytics.acknowledgeAnomaly(id);
  }

  /**
   * POST /v1/analytics/anomalies/batch-resolve
   * Batch resolve anomalies theo filter.
   *
   * Body:
   *   tenantId     — optional
   *   anomalyType  — optional
   *   severity     — optional
   *   from         — optional
   *   to           — optional
   *   resolvedBy   — optional
   */
  @Post('anomalies/batch-resolve')
  async batchResolveAnomalies(
    @Body() body: {
      tenantId?: string;
      anomalyType?: string;
      severity?: string;
      from?: string;
      to?: string;
      resolvedBy?: string;
    },
  ) {
    return this.analytics.batchResolveAnomalies({
      tenantId: body.tenantId,
      anomalyType: body.anomalyType,
      severity: body.severity,
      resolvedBy: body.resolvedBy,
      from: body.from ? new Date(body.from) : undefined,
      to: body.to ? new Date(body.to) : undefined,
    });
  }

  /**
   * DELETE /v1/analytics/anomalies/:id
   * Xoá một anomaly record.
   */
  @Delete('anomalies/:id')
  async deleteAnomaly(@Param('id') id: string) {
    const deleted = await this.analytics.deleteAnomaly(id);
    if (!deleted) throw new NotFoundException(`Anomaly record ${id} not found`);
    return { deleted: true };
  }

  /**
   * POST /v1/analytics/anomalies/purge
   * Xoá các anomaly records cũ đã resolve (mặc định > 90 ngày).
   *
   * Body: { olderThanDays?: number }
   */
  @Post('anomalies/purge')
  async purgeOldAnomalies(
    @Body() body: { olderThanDays?: number },
  ) {
    return this.analytics.purgeOldAnomalies(body?.olderThanDays ?? 90);
  }
}
