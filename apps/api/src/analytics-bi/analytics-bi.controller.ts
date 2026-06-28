// ═══════════════════════════════════════════════════════════════════════════
// analytics-bi.controller.ts — Analytics BI REST API
// ═══════════════════════════════════════════════════════════════════════════
// Route gốc: /v1/analytics
// Health report, tenant analytics, cross-tenant benchmarks, cohorts, trends.

import { Controller, Get, Headers, Query, BadRequestException } from '@nestjs/common';
import { AnalyticsBiService } from './analytics-bi.service';

@Controller('v1/analytics')
export class AnalyticsBiController {
  constructor(private readonly analytics: AnalyticsBiService) {}

  /**
   * GET /v1/analytics/health
   * Platform health report — active tenants, executions, success rate, anomalies, revenue.
   */
  @Get('health')
  async getHealth() {
    return this.analytics.getPlatformHealth();
  }

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
}
