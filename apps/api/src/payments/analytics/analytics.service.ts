// ============================================================================
// payments/analytics/analytics.service.ts
// Aggregate AI usage từ bảng UsageRecord theo tenantId (Batch 1).
// Nguyên tắc: tenant-level isolation, BigInt VND-safe coercion, no raw client tenantId.
// Tham chiếu: docs/roadmap/AI-ANALYTICS-DASHBOARD-DESIGN.md (mục VII, VIII).
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import type {
  AiUsageMetadata,
  AnalyticsGranularity,
  AnalyticsScorecardView,
  CostTrendPoint,
  ModelMatrixRow,
} from './analytics.types';

const AI_CATEGORY = 'ai';
const METRIC_COST = 'cost';
const METRIC_TOKENS = 'tokens';
const ANOMALY_THRESHOLD = 5; // % error rate

/** Bản ghi UsageRecord ở dạng tối thiểu cần cho aggregate. */
interface RawUsageRecord {
  metric: string;
  value: number;
  recordedAt: Date;
  metadata: unknown;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  // --------------------------------------------------------------------------
  // Helpers — BigInt / Decimal / string VND-safe coercion
  // --------------------------------------------------------------------------

  /**
   * Ép một giá trị bất kỳ (number | bigint | Decimal-like | string) về number
   * an toàn. Tránh mất độ chính xác khi SUM VND lớn; trả 0 nếu không hợp lệ.
   */
  private toSafeNumber(input: unknown): number {
    if (input === null || input === undefined) return 0;
    if (typeof input === 'number') return Number.isFinite(input) ? input : 0;
    if (typeof input === 'bigint') return Number(input);
    if (typeof input === 'string') {
      const parsed = Number(input.replace(/[^0-9.-]/g, ''));
      return Number.isFinite(parsed) ? parsed : 0;
    }
    // Decimal-like (Prisma.Decimal) — có hàm toString/toNumber
    if (typeof input === 'object') {
      const maybe = input as { toNumber?: () => number; toString?: () => string };
      if (typeof maybe.toNumber === 'function') {
        const n = maybe.toNumber();
        return Number.isFinite(n) ? n : 0;
      }
      if (typeof maybe.toString === 'function') {
        const n = Number(maybe.toString());
        return Number.isFinite(n) ? n : 0;
      }
    }
    return 0;
  }

  /** Định dạng VND: "135.684₫" (dấu chấm ngăn cách nghìn, locale vi-VN). */
  private formatVnd(value: number): string {
    const rounded = Math.round(this.toSafeNumber(value));
    return `${rounded.toLocaleString('vi-VN')}₫`;
  }

  /** Định dạng token gọn: 1.2M / 422.1K / 980. */
  private formatCompactNumber(value: number): string {
    const v = this.toSafeNumber(value);
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return `${Math.round(v)}`;
  }

  /** Định dạng latency: 1.8s hoặc 850ms. */
  private formatLatency(ms: number): string {
    const v = this.toSafeNumber(ms);
    if (v >= 1000) return `${(v / 1000).toFixed(1)}s`;
    return `${Math.round(v)}ms`;
  }

  /** % thay đổi an toàn, tránh chia cho 0. */
  private pctChange(current: number, previous: number): number {
    if (!previous) return current ? 100 : 0;
    return Number((((current - previous) / previous) * 100).toFixed(1));
  }

  /** Đọc metadata Json? thành shape AiUsageMetadata an toàn. */
  private readMetadata(metadata: unknown): AiUsageMetadata {
    if (metadata && typeof metadata === 'object') {
      return metadata as AiUsageMetadata;
    }
    return {};
  }

  /** Trích cost ưu tiên actualCost rồi estimatedCost, fallback value bản ghi. */
  private extractCost(record: RawUsageRecord, meta: AiUsageMetadata): number {
    if (meta.actualCost !== undefined) return this.toSafeNumber(meta.actualCost);
    if (meta.estimatedCost !== undefined) return this.toSafeNumber(meta.estimatedCost);
    return this.toSafeNumber(record.value);
  }

  // --------------------------------------------------------------------------
  // Data access
  // --------------------------------------------------------------------------

  /**
   * Lấy toàn bộ bản ghi AI của tenant trong khoảng [start, end].
   * Luôn ràng buộc tenantId — không bao giờ nhận tenantId từ client query.
   */
  private async fetchAiRecords(
    tenantId: string,
    start: Date,
    end: Date,
  ): Promise<RawUsageRecord[]> {
    const rows = await this.prisma.usageRecord.findMany({
      where: {
        tenantId,
        category: AI_CATEGORY,
        recordedAt: { gte: start, lte: end },
      },
      select: { metric: true, value: true, recordedAt: true, metadata: true },
      orderBy: { recordedAt: 'asc' },
    });
    return rows as RawUsageRecord[];
  }

  // --------------------------------------------------------------------------
  // Bucket helpers cho trend
  // --------------------------------------------------------------------------

  private bucketKey(date: Date, granularity: AnalyticsGranularity): string {
    const y = date.getUTCFullYear();
    const m = `${date.getUTCMonth() + 1}`.padStart(2, '0');
    const d = `${date.getUTCDate()}`.padStart(2, '0');
    if (granularity === 'month') return `${y}-${m}`;
    if (granularity === 'week') {
      // Khóa theo thứ Hai đầu tuần (UTC).
      const tmp = new Date(Date.UTC(y, date.getUTCMonth(), date.getUTCDate()));
      const day = tmp.getUTCDay() || 7; // CN = 7
      tmp.setUTCDate(tmp.getUTCDate() - (day - 1));
      const wy = tmp.getUTCFullYear();
      const wm = `${tmp.getUTCMonth() + 1}`.padStart(2, '0');
      const wd = `${tmp.getUTCDate()}`.padStart(2, '0');
      return `${wy}-${wm}-${wd}`;
    }
    return `${y}-${m}-${d}`;
  }

  private bucketLabel(key: string, granularity: AnalyticsGranularity): string {
    const parts = key.split('-');
    if (granularity === 'month') return `${parts[1]}/${parts[0]}`; // MM/YYYY
    return `${parts[2]}/${parts[1]}`; // DD/MM
  }

  // --------------------------------------------------------------------------
  // Public API — 3 hàm aggregate
  // --------------------------------------------------------------------------

  /**
   * Zone 1 — Scorecard: tổng cost, tổng tokens, latency trung bình, success rate.
   * So sánh với kỳ liền trước (cùng độ dài) để tính % change.
   */
  async getScorecardMetrics(
    tenantId: string,
    start: Date,
    end: Date,
  ): Promise<AnalyticsScorecardView> {
    const spanMs = Math.max(end.getTime() - start.getTime(), 0);
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - spanMs);

    const [current, previous] = await Promise.all([
      this.fetchAiRecords(tenantId, start, end),
      this.fetchAiRecords(tenantId, prevStart, prevEnd),
    ]);

    const cur = this.computeScorecardCore(current);
    const prev = this.computeScorecardCore(previous);

    return {
      totalCost: cur.totalCost,
      totalCostDisplay: this.formatVnd(cur.totalCost),
      totalCostChange: this.pctChange(cur.totalCost, prev.totalCost),
      totalTokens: cur.totalTokens,
      totalTokensDisplay: this.formatCompactNumber(cur.totalTokens),
      totalTokensChange: this.pctChange(cur.totalTokens, prev.totalTokens),
      avgLatencyMs: cur.avgLatencyMs,
      avgLatencyDisplay: this.formatLatency(cur.avgLatencyMs),
      avgLatencyChange: this.pctChange(cur.avgLatencyMs, prev.avgLatencyMs),
      successRate: cur.successRate,
      successRateDisplay: `${cur.successRate.toFixed(1)}%`,
      successRateChange: this.pctChange(cur.successRate, prev.successRate),
      totalRequests: cur.totalRequests,
    };
  }

  /** Tính các đại lượng lõi của scorecard từ tập bản ghi. */
  private computeScorecardCore(records: RawUsageRecord[]) {
    let totalCost = 0;
    let totalTokens = 0;
    let latencySum = 0;
    let latencyCount = 0;
    let successCount = 0;
    let requestCount = 0;

    for (const r of records) {
      const meta = this.readMetadata(r.metadata);
      if (r.metric === METRIC_COST) {
        totalCost += this.extractCost(r, meta);
        // Cost record = bản ghi canonical cho mỗi lần gọi → đếm request/latency tại đây.
        requestCount += 1;
        if (typeof meta.latencyMs === 'number') {
          latencySum += meta.latencyMs;
          latencyCount += 1;
        }
        // success mặc định true nếu không track tường minh.
        if (meta.success !== false) successCount += 1;
      } else if (r.metric === METRIC_TOKENS) {
        totalTokens += this.toSafeNumber(r.value);
      }
    }

    const avgLatencyMs = latencyCount ? Math.round(latencySum / latencyCount) : 0;
    const successRate = requestCount
      ? Number(((successCount / requestCount) * 100).toFixed(1))
      : 100;

    return { totalCost, totalTokens, avgLatencyMs, successRate, totalRequests: requestCount };
  }

  /**
   * Zone 2 — Cost & Token trend theo bucket thời gian, có breakdown theo model.
   * `modelKeys` rỗng = tất cả model.
   */
  async getCostTrends(
    tenantId: string,
    start: Date,
    end: Date,
    granularity: AnalyticsGranularity,
    modelKeys: string[],
  ): Promise<CostTrendPoint[]> {
    const records = await this.fetchAiRecords(tenantId, start, end);
    const filter = new Set(modelKeys.map((m) => m.trim()).filter(Boolean));
    const useFilter = filter.size > 0;

    const buckets = new Map<string, CostTrendPoint>();

    for (const r of records) {
      const meta = this.readMetadata(r.metadata);
      const modelKey = meta.modelKey || 'unknown';
      if (useFilter && !filter.has(modelKey)) continue;

      const key = this.bucketKey(r.recordedAt, granularity);
      let point = buckets.get(key);
      if (!point) {
        point = {
          date: key,
          label: this.bucketLabel(key, granularity),
          totalCost: 0,
          totalCostDisplay: this.formatVnd(0),
          totalTokens: 0,
          byModel: {},
        };
        buckets.set(key, point);
      }

      if (!point.byModel[modelKey]) {
        point.byModel[modelKey] = { cost: 0, tokens: 0 };
      }

      if (r.metric === METRIC_COST) {
        const cost = this.extractCost(r, meta);
        point.totalCost += cost;
        point.byModel[modelKey].cost += cost;
      } else if (r.metric === METRIC_TOKENS) {
        const tokens = this.toSafeNumber(r.value);
        point.totalTokens += tokens;
        point.byModel[modelKey].tokens += tokens;
      }
    }

    return Array.from(buckets.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((p) => ({ ...p, totalCostDisplay: this.formatVnd(p.totalCost) }));
  }

  /**
   * Zone 3 — Ma trận hiệu quả model: gom theo modelKey, tính error rate, anomaly.
   */
  async getModelMatrix(
    tenantId: string,
    start: Date,
    end: Date,
  ): Promise<{
    models: ModelMatrixRow[];
    anomalyCount: number;
    anomalyModels: string[];
    anomalyThreshold: number;
  }> {
    const records = await this.fetchAiRecords(tenantId, start, end);

    interface Agg {
      totalCost: number;
      totalTokens: number;
      requests: number;
      latencySum: number;
      latencyCount: number;
      errorCount: number;
      cacheHitCount: number;
    }
    const map = new Map<string, Agg>();

    const ensure = (key: string): Agg => {
      let agg = map.get(key);
      if (!agg) {
        agg = {
          totalCost: 0,
          totalTokens: 0,
          requests: 0,
          latencySum: 0,
          latencyCount: 0,
          errorCount: 0,
          cacheHitCount: 0,
        };
        map.set(key, agg);
      }
      return agg;
    };

    for (const r of records) {
      const meta = this.readMetadata(r.metadata);
      const modelKey = meta.modelKey || 'unknown';
      const agg = ensure(modelKey);

      if (r.metric === METRIC_COST) {
        agg.totalCost += this.extractCost(r, meta);
        agg.requests += 1;
        if (typeof meta.latencyMs === 'number') {
          agg.latencySum += meta.latencyMs;
          agg.latencyCount += 1;
        }
        if (meta.success === false) agg.errorCount += 1;
        if (meta.cacheHit === true) agg.cacheHitCount += 1;
      } else if (r.metric === METRIC_TOKENS) {
        agg.totalTokens += this.toSafeNumber(r.value);
      }
    }

    const models: ModelMatrixRow[] = [];
    const anomalyModels: string[] = [];

    for (const [modelKey, agg] of map.entries()) {
      const requests = agg.requests || 0;
      const errorRate = requests
        ? Number(((agg.errorCount / requests) * 100).toFixed(1))
        : 0;
      const avgCostPerRequest = requests
        ? Number((agg.totalCost / requests).toFixed(2))
        : 0;
      const avgTokensPerRequest = requests
        ? Number((agg.totalTokens / requests).toFixed(1))
        : 0;
      const avgLatencyMs = agg.latencyCount
        ? Math.round(agg.latencySum / agg.latencyCount)
        : 0;
      const cacheHitRate = requests
        ? Number(((agg.cacheHitCount / requests) * 100).toFixed(1))
        : 0;
      const anomaly = errorRate > ANOMALY_THRESHOLD;
      if (anomaly) anomalyModels.push(modelKey);

      models.push({
        modelKey,
        totalRequests: requests,
        totalCost: agg.totalCost,
        totalCostDisplay: this.formatVnd(agg.totalCost),
        avgCostPerRequest,
        avgCostPerRequestDisplay: this.formatVnd(avgCostPerRequest),
        totalTokens: agg.totalTokens,
        avgTokensPerRequest,
        avgLatencyMs,
        errorCount: agg.errorCount,
        errorRate,
        anomaly,
        anomalyReason: anomaly
          ? `Error rate ${errorRate}% vượt ngưỡng ${ANOMALY_THRESHOLD}%`
          : undefined,
        cacheHitRate,
      });
    }

    // Mặc định sort theo totalCost giảm dần (model tốn tiền nhất lên đầu).
    models.sort((a, b) => b.totalCost - a.totalCost);

    return {
      models,
      anomalyCount: anomalyModels.length,
      anomalyModels,
      anomalyThreshold: ANOMALY_THRESHOLD,
    };
  }
}
