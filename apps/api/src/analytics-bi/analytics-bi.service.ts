// ═══════════════════════════════════════════════════════════════════════════
// analytics-bi.service.ts — Cross-Tenant BI Analytics Engine
// ═══════════════════════════════════════════════════════════════════════════
// Tổng hợp và phân tích dữ liệu cross-tenant cho AIFUT Platform:
//   • Hourly/Daily aggregation từ bảng UsageRecord, WorkflowExecution, AiUsageEvent
//   • Platform benchmark (avg, median, p90, p95) theo industry
//   • Anomaly detection cho cost/token/execution spike
//   • Tenant health scoring
//   • Revenue analytics & cohort analysis
//   • Cross-tenant anonymized analytics & trend data
//   • Anomaly record CRUD, query, resolve, acknowledge
// ═══════════════════════════════════════════════════════════════════════════

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';

// ── Types ─────────────────────────────────────────────────────────────────

export interface PlatformHealthReport {
  timestamp: Date;
  activeTenants: number;
  growthTenants: number; // new tenants in last 30d
  totalExecutions: number;
  executionSuccessRate: number;
  totalAiTokens: string;
  totalRevenue: string;
  anomalyCount: number;
  topIndustries: Array<{ industry: string; count: number }>;
  topCostTenants: Array<{ tenantSlug: string; totalCost: string }>;
}

export interface TenantBenchmarkComparison {
  tenantId: string;
  industry: string;
  period: string;
  windowDate: Date | null;
  metrics: Array<{
    name: string;
    tenantValue: number;
    industryAvg: number;
    industryMedian: number;
    industryP90: number;
    industryP95: number;
    industryMin: number;
    industryMax: number;
    deviation: number;
    percentile: number;
    ranking: 'top' | 'above_avg' | 'avg' | 'below_avg' | 'bottom';
    betterThan: number;
    totalPeers: number;
  }>;
  overallScore: number;
}

export interface TenantAnalyticsSnapshot {
  tenantId: string;
  timestamp: Date;
  period: 'HOURLY' | 'DAILY';
  executions: { total: number; success: number; failed: number; avgDurationMs: number };
  ai: { totalTokens: string; totalCost: string; callCount: number };
  revenue: { total: string; invoiceCount: number; paymentCount: number };
  users: { active: number; new: number };
  storage: { totalBytes: string; deltaBytes: string };
  notifications: { sent: number; failed: number };
}

export interface AnomalyRecordResponse {
  id: string;
  tenantId: string;
  anomalyType: string;
  severity: string;
  title: string;
  description: string | null;
  metricName: string | null;
  metricValue: number | null;
  baselineValue: number | null;
  deviationScore: number | null;
  isResolved: boolean;
  resolvedAt: Date | null;
  detectedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnomalyQueryResult {
  items: AnomalyRecordResponse[];
  total: number;
  unresolvedCount: number;
}

// ── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class AnalyticsBiService {
  private readonly logger = new Logger(AnalyticsBiService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ═════════════════════════════════════════════════════════════════════
  //  HOURLY AGGREGATION
  // ═════════════════════════════════════════════════════════════════════

  /**
   * aggregateHourly
   * ───────────────
   * Chạy 1 lần mỗi giờ. Tổng hợp dữ liệu từ các bảng nguồn:
   *   - WorkflowExecution execution metrics
   *   - AiUsageEvent AI cost/token metrics
   *   - Invoice/PaymentTransaction revenue metrics
   *   - Membership active user metrics
   * Ghi vào bảng TenantAnalyticsSummary.
   */
  async aggregateHourly(): Promise<{ tenantsProcessed: number }> {
    this.logger.log('Starting hourly analytics aggregation...');
    const now = new Date();
    const hourStart = new Date(now);
    hourStart.setMinutes(0, 0, 0);
    hourStart.setHours(hourStart.getHours() - 1);

    const tenants = await this.prisma.tenant.findMany({
      select: { id: true, slug: true },
    });

    let processedCount = 0;

    for (const tenant of tenants) {
      try {
        // ── Workflow executions in last hour ───────────────────────────
        const executions = await this.prisma.workflowExecution.findMany({
          where: {
            tenantId: tenant.id,
            createdAt: { gte: hourStart, lt: now },
          },
          select: { status: true, id: true },
        });

        const totalExecs = executions.length;
        const successExecs = executions.filter((e) => e.status === 'COMPLETED').length;
        const failedExecs = executions.filter((e) => e.status === 'FAILED').length;

        // ── AI usage in last hour ──────────────────────────────────────
        const aiEvents = await this.prisma.aiUsageEvent.findMany({
          where: {
            tenantSlug: tenant.slug,
            occurredAt: { gte: hourStart, lt: now },
          },
          select: {
            inputTokens: true,
            outputTokens: true,
            totalTokens: true,
            estimatedCost: true,
            actualCost: true,
          },
        });

        const totalAiTokens = aiEvents.reduce((s, e) => s + e.totalTokens, 0);
        const totalInputTokens = aiEvents.reduce((s, e) => s + e.inputTokens, 0);
        const totalOutputTokens = aiEvents.reduce((s, e) => s + e.outputTokens, 0);
        const totalAiCost = BigInt(Math.round(aiEvents.reduce((s, e) => s + (e.actualCost || e.estimatedCost), 0) * 100));
        const aiCallCount = aiEvents.length;

        // ── Revenue in last hour ──────────────────────────────────────
        const invoices = await this.prisma.invoice.findMany({
          where: {
            tenantId: tenant.id,
            createdAt: { gte: hourStart, lt: now },
            status: 'paid',
          },
          select: { amount: true },
        });

        const totalRevenue = BigInt(Math.round(invoices.reduce((s, inv) => s + inv.amount, 0) * 100));
        const invoiceCount = invoices.length;

        // ── Active users (sessions in last hour) ───────────────────────
        const activeSessions = await this.prisma.session.findMany({
          where: {
            tenantId: tenant.id,
            lastSeenAt: { gte: hourStart },
          },
          select: { userId: true },
        });
        const uniqueUsers = new Set(activeSessions.map((s) => s.userId)).size;

        // ── Upsert into TenantAnalyticsSummary ─────────────────────────
        await this.prisma.tenantAnalyticsSummary.upsert({
          where: {
            tenantId_period_timestamp_workspaceId: {
              tenantId: tenant.id,
              period: 'HOURLY',
              timestamp: hourStart,
              workspaceId: 'null',
            },
          },
          create: {
            tenantId: tenant.id,
            workspaceId: null,
            period: 'HOURLY',
            timestamp: hourStart,
            totalExecutions: totalExecs,
            successfulExecutions: successExecs,
            failedExecutions: failedExecs,
            avgExecutionDurationMs: 0,
            totalAiTokens,
            totalInputTokens,
            totalOutputTokens,
            totalAiCost,
            aiCallCount,
            totalRevenue,
            invoiceCount,
            paymentCount: 0,
            totalPaymentAmount: BigInt(0),
            activeUserCount: uniqueUsers,
            newUserCount: 0,
            newIntegrationCount: 0,
            storageBytesTotal: BigInt(0),
            storageBytesDelta: BigInt(0),
            notificationSentCount: 0,
            notificationFailedCount: 0,
            metadata: Prisma.JsonNull,
          },
          update: {
            totalExecutions: totalExecs,
            successfulExecutions: successExecs,
            failedExecutions: failedExecs,
            totalAiTokens,
            totalInputTokens,
            totalOutputTokens,
            totalAiCost,
            aiCallCount,
            totalRevenue,
            invoiceCount,
            activeUserCount: uniqueUsers,
          },
        });

        processedCount++;
      } catch (err: any) {
        this.logger.warn(
          `Failed to aggregate tenant ${tenant.slug}: ${err.message}`,
        );
      }
    }

    this.logger.log(
      `Hourly aggregation completed: ${processedCount}/${tenants.length} tenants processed`,
    );
    return { tenantsProcessed: processedCount };
  }

  // ═════════════════════════════════════════════════════════════════════
  //  PLATFORM BENCHMARK (Daily)
  // ═════════════════════════════════════════════════════════════════════

  /**
   * computePlatformBenchmarks
   * ─────────────────────────
   * Tính toán benchmark toàn sàn theo industry mỗi ngày.
   * Ghi vào bảng GlobalPlatformBenchmark.
   */
  async computePlatformBenchmarks(): Promise<{ metricsComputed: number }> {
    this.logger.log('Starting daily platform benchmark computation...');
    const now = new Date();
    const yesterdayStart = new Date(now);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterdayStart);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const tenants = await this.prisma.tenant.findMany({
      select: {
        id: true,
        slug: true,
        marketplaceListings: {
          where: { isPublished: true },
          select: { industry: true },
          take: 1,
        },
      },
    });

    const tenantIndustry: Record<string, string> = {};
    for (const t of tenants) {
      tenantIndustry[t.id] = t.marketplaceListings[0]?.industry ?? 'general';
    }

    const metrics = [
      'totalExecutions',
      'executionSuccessRate',
      'totalAiTokens',
      'totalAiCost',
      'totalRevenue',
      'activeUserCount',
    ];

    let metricsComputed = 0;
    const industries = [...new Set(Object.values(tenantIndustry))];

    for (const industry of industries) {
      const tenantIds = Object.entries(tenantIndustry)
        .filter(([_, ind]) => ind === industry)
        .map(([id]) => id);

      if (tenantIds.length < 3) continue;

      const summaries = await this.prisma.tenantAnalyticsSummary.findMany({
        where: {
          tenantId: { in: tenantIds },
          period: 'DAILY',
          timestamp: { gte: yesterdayStart, lt: yesterdayEnd },
        },
        select: {
          totalExecutions: true,
          successfulExecutions: true,
          totalAiTokens: true,
          totalAiCost: true,
          totalRevenue: true,
          activeUserCount: true,
        },
      });

      for (const metric of metrics) {
        const values = summaries
          .map((s) => {
            switch (metric) {
              case 'totalExecutions': return s.totalExecutions;
              case 'executionSuccessRate': {
                const total = s.totalExecutions;
                return total > 0 ? s.successfulExecutions / total : 1;
              }
              case 'totalAiTokens': return Number(s.totalAiTokens);
              case 'totalAiCost': return Number(s.totalAiCost);
              case 'totalRevenue': return Number(s.totalRevenue);
              case 'activeUserCount': return s.activeUserCount;
              default: return 0;
            }
          })
          .filter((v): v is number => typeof v === 'number' && !isNaN(v))
          .sort((a, b) => a - b);

        if (values.length < 3) continue;

        const avg = values.reduce((s, v) => s + v, 0) / values.length;
        const median = values.length % 2 === 0
          ? (values[values.length / 2 - 1] + values[values.length / 2]) / 2
          : values[Math.floor(values.length / 2)];
        const p90 = values[Math.floor(values.length * 0.9)];
        const p95 = values[Math.floor(values.length * 0.95)];
        const p99 = values[Math.floor(values.length * 0.99)];
        const min = values[0];
        const max = values[values.length - 1];
        const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
        const stdDev = Math.sqrt(variance);

        await this.prisma.globalPlatformBenchmark.create({
          data: {
            industry,
            metricName: metric,
            totalTenants: values.length,
            avgValue: avg,
            medianValue: median,
            p90Value: p90,
            p95Value: p95,
            p99Value: p99,
            minValue: min,
            maxValue: max,
            stdDev,
            windowStartDate: yesterdayStart,
            windowEndDate: yesterdayEnd,
          },
        });

        metricsComputed++;
      }
    }

    this.logger.log(`Platform benchmark: ${metricsComputed} metrics computed for ${industries.length} industries`);
    return { metricsComputed };
  }

  // ═════════════════════════════════════════════════════════════════════
  //  HEALTH REPORT
  // ═════════════════════════════════════════════════════════════════════

  /**
   * getPlatformHealth
   * ─────────────────
   * Báo cáo sức khoẻ toàn sàn — dùng cho admin dashboard.
   */
  async getPlatformHealth(): Promise<PlatformHealthReport> {
    const now = new Date();
    const last30d = new Date(now);
    last30d.setDate(last30d.getDate() - 30);
    const last24h = new Date(now);
    last24h.setHours(last24h.getHours() - 24);

    const [
      totalTenants,
      newTenants30d,
      recentExecutions,
      recentAnomalies,
      dailySummaries,
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { createdAt: { gte: last30d } } }),
      this.prisma.workflowExecution.findMany({
        where: { createdAt: { gte: last24h } },
        select: { status: true },
      }),
      this.prisma.anomalyRecord.count({
        where: { detectedAt: { gte: last24h }, isResolved: false },
      }),
      this.prisma.tenantAnalyticsSummary.findMany({
        where: {
          period: 'HOURLY',
          timestamp: { gte: last24h },
        },
        select: {
          totalExecutions: true,
          totalAiCost: true,
          totalRevenue: true,
        },
      }),
    ]);

    const totalExecs = recentExecutions.length;
    const successExecs = recentExecutions.filter((e) => e.status === 'COMPLETED').length;
    const successRate = totalExecs > 0 ? successExecs / totalExecs : 1;

    const totalAiCost = dailySummaries.reduce((s, r) => s + Number(r.totalAiCost), 0);
    const totalRevenue = dailySummaries.reduce((s, r) => s + Number(r.totalRevenue), 0);

    const industries = await this.prisma.marketplaceListing.groupBy({
      by: ['industry'],
      where: { isPublished: true, industry: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { industry: 'desc' as const } },
      take: 5,
    });

    const topIndustries = (industries as any[]).map((i: any) => ({
      industry: i.industry ?? 'general',
      count: i._count?._all ?? 0,
    }));

    return {
      timestamp: now,
      activeTenants: totalTenants,
      growthTenants: newTenants30d,
      totalExecutions: totalExecs,
      executionSuccessRate: successRate,
      totalAiTokens: '0',
      totalRevenue: totalRevenue.toString(),
      anomalyCount: recentAnomalies,
      topIndustries,
      topCostTenants: [],
    };
  }

  // ═════════════════════════════════════════════════════════════════════
  //  TENANT ANALYTICS (Single Tenant View)
  // ═════════════════════════════════════════════════════════════════════

  /**
   * getTenantAnalytics
   * ──────────────────
   * Lấy analytics snapshot cho một tenant cụ thể.
   */
  async getTenantAnalytics(
    tenantId: string,
    period: 'HOURLY' | 'DAILY' = 'DAILY',
    since?: Date,
  ): Promise<TenantAnalyticsSnapshot[]> {
    const where: any = { tenantId, period };
    if (since) where.timestamp = { gte: since };

    const summaries = await this.prisma.tenantAnalyticsSummary.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: 100,
    });

    return summaries.map((s) => ({
      tenantId: s.tenantId,
      timestamp: s.timestamp,
      period: s.period as 'HOURLY' | 'DAILY',
      executions: {
        total: s.totalExecutions,
        success: s.successfulExecutions,
        failed: s.failedExecutions,
        avgDurationMs: s.avgExecutionDurationMs,
      },
      ai: {
        totalTokens: s.totalAiTokens.toString(),
        totalCost: s.totalAiCost.toString(),
        callCount: s.aiCallCount,
      },
      revenue: {
        total: s.totalRevenue.toString(),
        invoiceCount: s.invoiceCount,
        paymentCount: s.paymentCount,
      },
      users: {
        active: s.activeUserCount,
        new: s.newUserCount,
      },
      storage: {
        totalBytes: s.storageBytesTotal.toString(),
        deltaBytes: s.storageBytesDelta.toString(),
      },
      notifications: {
        sent: s.notificationSentCount,
        failed: s.notificationFailedCount,
      },
    }));
  }

  // ═════════════════════════════════════════════════════════════════════
  //  CROSS-TENANT ANALYTICS (Anonymized)
  // ═════════════════════════════════════════════════════════════════════

  /**
   * getCrossTenantBenchmarks
   * ─────────────────────────
   * Lấy benchmark toàn sàn từ GlobalPlatformBenchmark.
   * Anonymized — không expose tenant identity.
   */
  async getCrossTenantBenchmarks(options: {
    industry?: string;
    metricName?: string;
    limit?: number;
  } = {}): Promise<{
    items: Array<{
      industry: string;
      metricName: string;
      totalTenants: number;
      avgValue: number;
      medianValue: number;
      p90Value: number;
      p95Value: number;
      minValue: number;
      maxValue: number;
      stdDev: number;
      windowStartDate: Date;
    }>;
    total: number;
  }> {
    const { industry, metricName, limit = 20 } = options;
    const where: any = {};
    if (industry) where.industry = industry;
    if (metricName) where.metricName = metricName;

    const [items, total] = await Promise.all([
      this.prisma.globalPlatformBenchmark.findMany({
        where,
        orderBy: { windowStartDate: 'desc' },
        take: Math.min(limit, 100),
      }),
      this.prisma.globalPlatformBenchmark.count({ where }),
    ]);

    return {
      items: items.map((b) => ({
        industry: b.industry,
        metricName: b.metricName,
        totalTenants: b.totalTenants,
        avgValue: b.avgValue,
        medianValue: b.medianValue,
        p90Value: b.p90Value,
        p95Value: b.p95Value,
        minValue: b.minValue,
        maxValue: b.maxValue,
        stdDev: b.stdDev,
        windowStartDate: b.windowStartDate,
      })),
      total,
    };
  }

  /**
   * getCohortAnalysis
   * ─────────────────
   * Cohort analysis: phân nhóm tenant theo quy mô.
   * Anonymized — aggregate stats không kèm tenant identity.
   */
  async getCohortAnalysis(options: {
    period?: 'HOURLY' | 'DAILY';
    from?: Date;
    to?: Date;
  } = {}): Promise<{
    cohorts: Array<{
      cohort: string;
      count: number;
      avgExecutions: number;
      avgSuccessRate: number;
      avgAiCost: string;
      avgRevenue: string;
      totalAiTokens: string;
    }>;
    period: string;
  }> {
    const { period = 'DAILY', from, to } = options;
    const where: any = { period };
    if (from) where.timestamp = { ...(where.timestamp || {}), gte: from };
    if (to) where.timestamp = { ...(where.timestamp || {}), lte: to };

    const summaries = await this.prisma.tenantAnalyticsSummary.findMany({
      where,
      select: {
        tenantId: true,
        totalExecutions: true,
        successfulExecutions: true,
        totalAiCost: true,
        totalRevenue: true,
        totalAiTokens: true,
        activeUserCount: true,
      },
      take: 500,
    });

    if (summaries.length === 0) {
      return { cohorts: [], period };
    }

    const cohorts = new Map<string, {
      count: number;
      totalExecs: number;
      totalSuccess: number;
      totalAiCost: BigInt;
      totalRevenue: BigInt;
      totalTokens: number;
    }>();

    for (const s of summaries) {
      const size = s.activeUserCount;
      let cohort = 'small';
      if (size >= 100) cohort = 'enterprise';
      else if (size >= 20) cohort = 'growing';
      else if (size >= 5) cohort = 'active';

      const existing = cohorts.get(cohort) || {
        count: 0, totalExecs: 0, totalSuccess: 0,
        totalAiCost: BigInt(0), totalRevenue: BigInt(0), totalTokens: 0,
      };
      existing.count++;
      existing.totalExecs += s.totalExecutions;
      existing.totalSuccess += s.successfulExecutions;
      existing.totalAiCost = BigInt(Number(existing.totalAiCost) + Number(s.totalAiCost));
      existing.totalRevenue = BigInt(Number(existing.totalRevenue) + Number(s.totalRevenue));
      existing.totalTokens += Number(s.totalAiTokens);
      cohorts.set(cohort, existing);
    }

    const result = Array.from(cohorts.entries()).map(([cohort, data]) => ({
      cohort,
      count: data.count,
      avgExecutions: data.count > 0 ? Math.round(data.totalExecs / data.count) : 0,
      avgSuccessRate: data.totalExecs > 0 ? data.totalSuccess / data.totalExecs : 0,
      avgAiCost: (data.count > 0 ? BigInt(Math.round(Number(data.totalAiCost) / data.count)) : BigInt(0)).toString(),
      avgRevenue: (data.count > 0 ? BigInt(Math.round(Number(data.totalRevenue) / data.count)) : BigInt(0)).toString(),
      totalAiTokens: data.totalTokens.toString(),
    }));

    return { cohorts: result, period };
  }

  /**
   * getTrendData
   * ────────────
   * Trend data: daily aggregated totals from TenantAnalyticsSummary.
   * Anonymized — tổng hợp, không expose tenant data.
   */
  async getTrendData(options: {
    period?: 'HOURLY' | 'DAILY';
    days?: number;
  } = {}): Promise<{
    trends: Array<{
      date: string;
      totalExecutions: number;
      totalRevenue: string;
      totalAiCost: string;
      totalAiTokens: string;
      uniqueTenants: number;
    }>;
    period: string;
  }> {
    const { period = 'DAILY', days = 30 } = options;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const summaries = await this.prisma.tenantAnalyticsSummary.findMany({
      where: {
        period,
        timestamp: { gte: since },
      },
      select: {
        timestamp: true,
        tenantId: true,
        totalExecutions: true,
        totalRevenue: true,
        totalAiCost: true,
        totalAiTokens: true,
      },
      orderBy: { timestamp: 'asc' },
      take: 10000,
    });

    const dayBuckets = new Map<string, {
      executions: number; revenue: BigInt; aiCost: BigInt; tokens: number; tenants: Set<string>;
    }>();

    for (const s of summaries) {
      const day = s.timestamp.toISOString().slice(0, 10);
      const existing = dayBuckets.get(day) || {
        executions: 0, revenue: BigInt(0), aiCost: BigInt(0), tokens: 0, tenants: new Set(),
      };
      existing.executions += s.totalExecutions;
      existing.revenue = BigInt(Number(existing.revenue) + Number(s.totalRevenue));
      existing.aiCost = BigInt(Number(existing.aiCost) + Number(s.totalAiCost));
      existing.tokens += Number(s.totalAiTokens);
      existing.tenants.add(s.tenantId);
      dayBuckets.set(day, existing);
    }

    const trends = Array.from(dayBuckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        totalExecutions: data.executions,
        totalRevenue: data.revenue.toString(),
        totalAiCost: data.aiCost.toString(),
        totalAiTokens: data.tokens.toString(),
        uniqueTenants: data.tenants.size,
      }));

    return { trends, period };
  }

  // ═════════════════════════════════════════════════════════════════════
  //  TENANT BENCHMARK COMPARISON (Self vs Industry)
  // ═════════════════════════════════════════════════════════════════════

  /**
   * getTenantBenchmarkComparison
   * ─────────────────────────────
   * So sánh metrics của tenant với industry benchmark.
   * Dùng cho Tenant Benchmark Dashboard — tenant thấy "mình đang ở đâu so với peers".
   * Anonymized: chỉ trả về benchmark aggregate, không expose tenant identity.
   */
  async getTenantBenchmarkComparison(
    tenantId: string,
    options: { period?: 'HOURLY' | 'DAILY'; industry?: string } = {},
  ): Promise<TenantBenchmarkComparison> {
    const period = options.period || 'DAILY';

    // ── Xác định industry của tenant ───────────────────────────────────
    let industry = options.industry;
    if (!industry) {
      const listing = await this.prisma.marketplaceListing.findFirst({
        where: { tenantId, isPublished: true, industry: { not: null } },
        select: { industry: true },
      });
      industry = listing?.industry ?? 'general';
    }

    // ── Latest daily summary cho tenant ────────────────────────────────
    const latestSummary = await this.prisma.tenantAnalyticsSummary.findFirst({
      where: { tenantId, period },
      orderBy: { timestamp: 'desc' },
    });

    if (!latestSummary) {
      return {
        tenantId,
        industry,
        period,
        windowDate: null,
        metrics: [],
        overallScore: 0,
      };
    }

    // ── Industry benchmarks cùng kỳ ────────────────────────────────────
    const benchmarks = await this.prisma.globalPlatformBenchmark.findMany({
      where: {
        industry,
        windowStartDate: { lte: latestSummary.timestamp },
      },
      orderBy: { windowStartDate: 'desc' },
      take: 1,
    });

    const latestBenchmark = benchmarks[0] ?? null;

    // ── So sánh từng metric ────────────────────────────────────────────
    const metrics: TenantBenchmarkComparison['metrics'] = [];

    const metricDefs: Array<{
      name: string;
      getTenantValue: () => number;
      getBenchmark: (b: typeof latestBenchmark) => number | null;
    }> = [
      {
        name: 'totalExecutions',
        getTenantValue: () => latestSummary.totalExecutions,
        getBenchmark: (b) => b?.avgValue ?? null,
      },
      {
        name: 'executionSuccessRate',
        getTenantValue: () => latestSummary.totalExecutions > 0
          ? latestSummary.successfulExecutions / latestSummary.totalExecutions
          : 1,
        getBenchmark: (b) => b?.avgValue ?? null,
      },
      {
        name: 'totalAiTokens',
        getTenantValue: () => Number(latestSummary.totalAiTokens),
        getBenchmark: (b) => b?.avgValue ?? null,
      },
      {
        name: 'totalAiCost',
        getTenantValue: () => Number(latestSummary.totalAiCost),
        getBenchmark: (b) => b?.avgValue ?? null,
      },
      {
        name: 'totalRevenue',
        getTenantValue: () => Number(latestSummary.totalRevenue),
        getBenchmark: (b) => b?.avgValue ?? null,
      },
      {
        name: 'activeUserCount',
        getTenantValue: () => latestSummary.activeUserCount,
        getBenchmark: (b) => b?.avgValue ?? null,
      },
    ];

    let totalScore = 0;
    let scoredMetrics = 0;

    for (const def of metricDefs) {
      const tenantValue = def.getTenantValue();
      const benchmarkAvg = def.getBenchmark(latestBenchmark);

      if (benchmarkAvg === null || benchmarkAvg === 0) {
        metrics.push({
          name: def.name,
          tenantValue,
          industryAvg: benchmarkAvg ?? 0,
          industryMedian: latestBenchmark?.medianValue ?? 0,
          industryP90: latestBenchmark?.p90Value ?? 0,
          industryP95: latestBenchmark?.p95Value ?? 0,
          industryMin: latestBenchmark?.minValue ?? 0,
          industryMax: latestBenchmark?.maxValue ?? 0,
          deviation: 0,
          percentile: 0.5,
          ranking: 'avg',
          betterThan: 0,
          totalPeers: latestBenchmark?.totalTenants ?? 0,
        });
        continue;
      }

      const deviation = benchmarkAvg > 0
        ? (tenantValue - benchmarkAvg) / benchmarkAvg
        : 0;

      // Ước lượng percentile từ phân phối chuẩn (stdDev + avg)
      const stdDev = latestBenchmark?.stdDev ?? 0;
      let percentile = 0.5;
      if (stdDev > 0) {
        // Z-score
        const zScore = (tenantValue - benchmarkAvg) / stdDev;
        // Approximate CDF using normal distribution
        percentile = this.approximateNormalCdf(zScore);
      }

      // Ranking dựa trên percentile
      let ranking: 'top' | 'above_avg' | 'avg' | 'below_avg' | 'bottom';
      if (percentile >= 0.95) ranking = 'top';
      else if (percentile >= 0.7) ranking = 'above_avg';
      else if (percentile >= 0.3) ranking = 'avg';
      else if (percentile >= 0.1) ranking = 'below_avg';
      else ranking = 'bottom';

      const totalPeers = latestBenchmark?.totalTenants ?? 0;
      const betterThan = Math.round(percentile * totalPeers);

      metrics.push({
        name: def.name,
        tenantValue,
        industryAvg: benchmarkAvg,
        industryMedian: latestBenchmark?.medianValue ?? 0,
        industryP90: latestBenchmark?.p90Value ?? 0,
        industryP95: latestBenchmark?.p95Value ?? 0,
        industryMin: latestBenchmark?.minValue ?? 0,
        industryMax: latestBenchmark?.maxValue ?? 0,
        deviation,
        percentile: Math.round(percentile * 100) / 100,
        ranking,
        betterThan,
        totalPeers,
      });

      // Health score: normalize percentile-based
      if (['executionSuccessRate', 'totalRevenue', 'activeUserCount'].includes(def.name)) {
        totalScore += percentile * 20; // each metric contributes up to 20 pts
        scoredMetrics++;
      }
    }

    const overallScore = scoredMetrics > 0
      ? Math.min(100, Math.round((totalScore / scoredMetrics) * 5))
      : 0;

    return {
      tenantId,
      industry,
      period,
      windowDate: latestBenchmark?.windowEndDate ?? null,
      metrics,
      overallScore,
    };
  }

  /**
   * approximateNormalCdf
   * ─────────────────────
   * Xấp xỉ CDF của phân phối chuẩn (Abramowitz & Stegun 26.2.17).
   * Cho z-score, trả về percentile (0..1).
   */
  private approximateNormalCdf(z: number): number {
    if (z > 6) return 1;
    if (z < -6) return 0;
    const b0 = 0.2316419, b1 = 0.319381530, b2 = -0.356563782;
    const b3 = 1.781477937, b4 = -1.821255978, b5 = 1.330274429;
    const t = 1 / (1 + b0 * Math.abs(z));
    const poly = t * (b1 + t * (b2 + t * (b3 + t * (b4 + t * b5))));
    const cdf = 1 - poly * Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
    return z >= 0 ? cdf : 1 - cdf;
  }

  // ═════════════════════════════════════════════════════════════════════
  //  ANOMALY RECORD CRUD
  // ═════════════════════════════════════════════════════════════════════

  /**
   * queryAnomalies
   * ──────────────
   * Truy vấn danh sách anomaly records với filter.
   * Hỗ trợ: tenantId, severity, anomalyType, isResolved, date range, pagination.
   */
  async queryAnomalies(options: {
    tenantId?: string;
    severity?: string;
    anomalyType?: string;
    isResolved?: boolean;
    from?: Date;
    to?: Date;
    limit?: number;
    offset?: number;
    orderBy?: 'detectedAt' | 'severity' | 'createdAt';
    orderDir?: 'asc' | 'desc';
  } = {}): Promise<AnomalyQueryResult> {
    const {
      tenantId, severity, anomalyType, isResolved,
      from, to, limit = 50, offset = 0,
      orderBy = 'detectedAt', orderDir = 'desc',
    } = options;

    const where: any = {};

    if (tenantId) where.tenantId = tenantId;
    if (severity) where.severity = severity;
    if (anomalyType) where.anomalyType = anomalyType;
    if (isResolved !== undefined) where.isResolved = isResolved;
    if (from || to) {
      where.detectedAt = {};
      if (from) where.detectedAt.gte = from;
      if (to) where.detectedAt.lte = to;
    }

    const [items, total, unresolvedCount] = await Promise.all([
      this.prisma.anomalyRecord.findMany({
        where,
        orderBy: { [orderBy]: orderDir },
        take: limit,
        skip: offset,
        select: {
          id: true,
          tenantId: true,
          anomalyType: true,
          severity: true,
          title: true,
          description: true,
          metricName: true,
          metricValue: true,
          baselineValue: true,
          deviationScore: true,
          isResolved: true,
          resolvedAt: true,
          detectedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.anomalyRecord.count({ where }),
      this.prisma.anomalyRecord.count({
        where: { ...where, isResolved: false },
      }),
    ]);

    return { items: items as any, total, unresolvedCount };
  }

  /**
   * getAnomalyById
   * ──────────────
   * Lấy chi tiết một anomaly record.
   */
  async getAnomalyById(id: string): Promise<AnomalyRecordResponse | null> {
    const record = await this.prisma.anomalyRecord.findUnique({
      where: { id },
    });
    if (!record) return null;
    return record as any;
  }

  /**
   * resolveAnomaly
   * ──────────────
   * Đánh dấu anomaly là đã xử lý.
   */
  async resolveAnomaly(
    id: string,
    resolvedBy?: string,
  ): Promise<AnomalyRecordResponse> {
    const record = await this.prisma.anomalyRecord.update({
      where: { id },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
        resolvedBy: resolvedBy ?? null,
      },
    });
    return record as any;
  }

  /**
   * acknowledgeAnomaly
   * ──────────────────
   * Đánh dấu anomaly đã được acknowledge (đã xem).
   */
  async acknowledgeAnomaly(id: string): Promise<AnomalyRecordResponse> {
    const record = await this.prisma.anomalyRecord.update({
      where: { id },
      data: {
        acknowledgedAt: new Date(),
      },
    });
    return record as any;
  }

  /**
   * batchResolveAnomalies
   * ─────────────────────
   * Resolve nhiều anomaly cùng lúc theo filter.
   * Dùng cho "mark all as resolved" trên dashboard.
   */
  async batchResolveAnomalies(options: {
    tenantId?: string;
    anomalyType?: string;
    severity?: string;
    from?: Date;
    to?: Date;
    resolvedBy?: string;
  }): Promise<{ resolved: number }> {
    const where: any = { isResolved: false };
    if (options.tenantId) where.tenantId = options.tenantId;
    if (options.anomalyType) where.anomalyType = options.anomalyType;
    if (options.severity) where.severity = options.severity;
    if (options.from || options.to) {
      where.detectedAt = {};
      if (options.from) where.detectedAt.gte = options.from;
      if (options.to) where.detectedAt.lte = options.to;
    }

    const result = await this.prisma.anomalyRecord.updateMany({
      where,
      data: {
        isResolved: true,
        resolvedAt: new Date(),
        resolvedBy: options.resolvedBy ?? null,
      },
    });

    return { resolved: result.count };
  }

  /**
   * getAnomalyStats
   * ───────────────
   * Thống kê anomaly theo severity và type.
   * Dùng cho dashboard tổng quan.
   */
  async getAnomalyStats(options: {
    tenantId?: string;
    from?: Date;
    to?: Date;
  } = {}): Promise<{
    total: number;
    unresolved: number;
    bySeverity: Array<{ severity: string; count: number }>;
    byType: Array<{ anomalyType: string; count: number }>;
    trend: Array<{ date: string; count: number; unresolved: number }>;
  }> {
    const where: any = {};
    if (options.tenantId) where.tenantId = options.tenantId;
    if (options.from || options.to) {
      where.detectedAt = {};
      if (options.from) where.detectedAt.gte = options.from;
      if (options.to) where.detectedAt.lte = options.to;
    }

    const [total, unresolved, bySeverity, byType, records] = await Promise.all([
      this.prisma.anomalyRecord.count({ where }),
      this.prisma.anomalyRecord.count({ where: { ...where, isResolved: false } }),
      this.prisma.anomalyRecord.groupBy({
        by: ['severity'],
        where,
        _count: { _all: true },
        orderBy: { _count: { severity: 'desc' as const } },
      }),
      this.prisma.anomalyRecord.groupBy({
        by: ['anomalyType'],
        where,
        _count: { _all: true },
        orderBy: { _count: { anomalyType: 'desc' as const } },
        take: 10,
      }),
      this.prisma.anomalyRecord.findMany({
        where,
        select: { detectedAt: true, isResolved: true },
        orderBy: { detectedAt: 'asc' },
        take: 1000,
      }),
    ]);

    // Trend theo ngày
    const dayBuckets = new Map<string, { total: number; unresolved: number }>();
    for (const r of records) {
      const day = r.detectedAt.toISOString().slice(0, 10);
      const existing = dayBuckets.get(day) || { total: 0, unresolved: 0 };
      existing.total++;
      if (!r.isResolved) existing.unresolved++;
      dayBuckets.set(day, existing);
    }

    const trend = Array.from(dayBuckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30) // Last 30 days
      .map(([date, data]) => ({
        date,
        count: data.total,
        unresolved: data.unresolved,
      }));

    return {
      total,
      unresolved,
      bySeverity: (bySeverity as any[]).map((s: any) => ({
        severity: s.severity,
        count: s._count._all,
      })),
      byType: (byType as any[]).map((t: any) => ({
        anomalyType: t.anomalyType,
        count: t._count._all,
      })),
      trend,
    };
  }

  /**
   * deleteAnomaly
   * ─────────────
   * Xoá một anomaly record (manual cleanup).
   */
  async deleteAnomaly(id: string): Promise<boolean> {
    try {
      await this.prisma.anomalyRecord.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * purgeOldAnomalies
   * ─────────────────
   * Xoá các anomaly records cũ hơn N ngày.
   * Dùng cho cleanup định kỳ.
   */
  async purgeOldAnomalies(olderThanDays: number = 90): Promise<{ deleted: number }> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const result = await this.prisma.anomalyRecord.deleteMany({
      where: {
        detectedAt: { lt: cutoff },
        isResolved: true, // Chỉ xoá cái đã resolve
      },
    });

    return { deleted: result.count };
  }
}
