// ============================================================================
// payments/analytics/analytics.service.ts
// Aggregate AI usage từ bảng UsageRecord theo tenantId (Batch 1 → Batch 4).
// Nguyên tắc: tenant-level isolation, BigInt VND-safe coercion, no raw client tenantId.
// Nâng cấp Lượt 2: totalRequests (G3), autoGranularity + model-level display,
//   engine tính toán Anomaly Score 3 tầng (G4, G5).
// Tham chiếu: BACKEND-ANALYTICS-BATCH4-DESIGN.md
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
const ANOMALY_SCORE_THRESHOLD = 30; // composite anomaly score trigger

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
  //   Bọc try/catch null-safe 100% runtime.
  // --------------------------------------------------------------------------

  /**
   * Ép một giá trị bất kỳ (number | bigint | Decimal-like | string) về number
   * an toàn. Tránh mất độ chính xác khi SUM VND lớn; trả 0 nếu không hợp lệ.
   * Bọc try/catch null-safe toàn bộ.
   */
  private toSafeNumber(input: unknown): number {
    try {
      if (input === null || input === undefined) return 0;
      if (typeof input === 'number') return Number.isFinite(input) ? input : 0;
      if (typeof input === 'bigint') return Number(input);
      if (typeof input === 'string') {
        const cleaned = input.replace(/[^0-9.\-eE+]/g, '');
        if (!cleaned) return 0;
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : 0;
      }
      // Decimal-like (Prisma.Decimal) — có hàm toNumber()/toString()
      if (typeof input === 'object' && input !== null) {
        const maybe = input as {
          toNumber?: () => number;
          toString?: () => string;
        };
        if (typeof maybe.toNumber === 'function') {
          const n = maybe.toNumber();
          return Number.isFinite(n) ? n : 0;
        }
        if (typeof maybe.toString === 'function') {
          const s = maybe.toString();
          if (!s) return 0;
          const n = Number(s);
          return Number.isFinite(n) ? n : 0;
        }
      }
      return 0;
    } catch {
      // Null-safe tuyệt đối: mọi lỗi BigInt/Decimal → 0.
      return 0;
    }
  }

  /**
   * Định dạng VND rút gọn (Km, M, B) khớp chuẩn Frontend:
   *   < 1.000₫     →  "999₫"
   *   >= 1K, < 1M   →  "1,5Km"
   *   >= 1M, < 1B   →  "2,3M"
   *   >= 1B         →  "1,2B"
   * Dùng dấu phẩy làm phân cách thập phân (locale vi-VN convention).
   */
  private formatVnd(value: number): string {
    try {
      const v = this.toSafeNumber(value);
      const abs = Math.abs(v);
      if (abs >= 1_000_000_000) {
        return `${(v / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1, minimumFractionDigits: 0 })}B`;
      }
      if (abs >= 1_000_000) {
        return `${(v / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1, minimumFractionDigits: 0 })}M`;
      }
      if (abs >= 1_000) {
        return `${(v / 1_000).toLocaleString('vi-VN', { maximumFractionDigits: 1, minimumFractionDigits: 0 })}Km`;
      }
      return `${Math.round(v).toLocaleString('vi-VN')}₫`;
    } catch {
      return '0₫';
    }
  }

  /** Định dạng token gọn: 1,2M / 422,1K / 980. */
  private formatCompactNumber(value: number): string {
    try {
      const v = this.toSafeNumber(value);
      const abs = Math.abs(v);
      if (abs >= 1_000_000) {
        return `${(v / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}M`;
      }
      if (abs >= 1_000) {
        return `${(v / 1_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}K`;
      }
      return `${Math.round(v).toLocaleString('vi-VN')}`;
    } catch {
      return '0';
    }
  }

  /** Định dạng latency: 1,8s hoặc 850ms. */
  private formatLatency(ms: number): string {
    try {
      const v = this.toSafeNumber(ms);
      if (v >= 1000) {
        return `${(v / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}s`;
      }
      return `${Math.round(v).toLocaleString('vi-VN')}ms`;
    } catch {
      return '0ms';
    }
  }

  /** % thay đổi an toàn, tránh chia cho 0. */
  private pctChange(current: number, previous: number): number {
    try {
      const cur = this.toSafeNumber(current);
      const prev = this.toSafeNumber(previous);
      if (!prev) return cur ? 100 : 0;
      return Number((((cur - prev) / prev) * 100).toFixed(1));
    } catch {
      return 0;
    }
  }

  /** Đọc metadata Json? thành shape AiUsageMetadata an toàn. */
  private readMetadata(metadata: unknown): AiUsageMetadata {
    try {
      if (metadata && typeof metadata === 'object') {
        return metadata as AiUsageMetadata;
      }
      return {};
    } catch {
      return {};
    }
  }

  /** Trích cost ưu tiên actualCost rồi estimatedCost, fallback value bản ghi. */
  private extractCost(
    record: RawUsageRecord,
    meta: AiUsageMetadata,
  ): number {
    try {
      if (meta.actualCost !== undefined) return this.toSafeNumber(meta.actualCost);
      if (meta.estimatedCost !== undefined) return this.toSafeNumber(meta.estimatedCost);
      return this.toSafeNumber(record.value);
    } catch {
      return 0;
    }
  }

  // --------------------------------------------------------------------------
  // Auto granularity resolver
  // --------------------------------------------------------------------------

  /**
   * Tự động chọn mức gom nhóm dựa trên độ dài khoảng thời gian:
   *   < 7 ngày   → 'day'
   *   7-30 ngày  → 'week'
   *   > 30 ngày  → 'month'
   */
  private resolveAutoGranularity(start: Date, end: Date): AnalyticsGranularity {
    try {
      const diffMs = end.getTime() - start.getTime();
      if (diffMs <= 0) return 'day';
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays <= 7) return 'day';
      if (diffDays <= 30) return 'week';
      return 'month';
    } catch {
      return 'day';
    }
  }

  // --------------------------------------------------------------------------
  // Anomaly Score Engine — 3 tầng
  // --------------------------------------------------------------------------

  /**
   * Tính điểm bất thường tổng hợp (composite) cho một model dựa trên 3 tầng:
   *   1. errorRateScore (40%)  — tỉ lệ lỗi > ngưỡng
   *   2. costSpikeScore (35%)  — chi phí trung bình/request đột biến
   *   3. volumeAnomalyScore (25%) — số lượng request khác biệt
   * Trả về score 0-100 + breakdown từng tầng.
   */
  private computeAnomalyScore(
    errorRate: number,
    avgCostPerRequest: number,
    totalRequests: number,
    globalAvgCostPerRequest: number,
    globalAvgRequests: number,
  ): { score: number; breakdown: { errorRateScore: number; costSpikeScore: number; volumeAnomalyScore: number } } {
    try {
      // Tầng 1: Error rate score (0-100)
      const errorRateScore =
        errorRate > ANOMALY_THRESHOLD
          ? Math.min(100, ((errorRate - ANOMALY_THRESHOLD) / ANOMALY_THRESHOLD) * 100)
          : 0;

      // Tầng 2: Cost spike score (0-100)
      // So sánh avgCostPerRequest của model này với trung bình toàn cục.
      // Nếu cao gấp 2x+ thì bắt đầu tính điểm.
      let costSpikeScore = 0;
      if (globalAvgCostPerRequest > 0 && avgCostPerRequest > globalAvgCostPerRequest * 1.5) {
        const ratio = avgCostPerRequest / globalAvgCostPerRequest;
        costSpikeScore = Math.min(100, Math.round((ratio - 1) * 40));
      }

      // Tầng 3: Volume anomaly score (0-100)
      // Model có lượng request khác biệt lớn so với trung bình (cả cao lẫn thấp).
      let volumeAnomalyScore = 0;
      if (globalAvgRequests > 0 && totalRequests > 0) {
        const deviation = Math.abs(totalRequests - globalAvgRequests) / globalAvgRequests;
        volumeAnomalyScore = Math.min(100, Math.round(deviation * 60));
      }

      // Tổng hợp có trọng số
      const score = Math.round(
        errorRateScore * 0.4 + costSpikeScore * 0.35 + volumeAnomalyScore * 0.25,
      );

      return {
        score,
        breakdown: {
          errorRateScore: Math.round(errorRateScore),
          costSpikeScore: Math.round(costSpikeScore),
          volumeAnomalyScore: Math.round(volumeAnomalyScore),
        },
      };
    } catch {
      return {
        score: 0,
        breakdown: { errorRateScore: 0, costSpikeScore: 0, volumeAnomalyScore: 0 },
      };
    }
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
    try {
      const rows = await this.prisma.usageRecord.findMany({
        where: {
          tenantId,
          category: AI_CATEGORY,
          recordedAt: { gte: start, lte: end },
        },
        select: {
          metric: true,
          value: true,
          recordedAt: true,
          metadata: true,
        },
        orderBy: { recordedAt: 'asc' },
      });
      return rows as RawUsageRecord[];
    } catch {
      return [];
    }
  }

  // --------------------------------------------------------------------------
  // Bucket helpers cho trend
  // --------------------------------------------------------------------------

  private bucketKey(date: Date, granularity: AnalyticsGranularity): string {
    try {
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
    } catch {
      return '1970-01-01';
    }
  }

  private bucketLabel(key: string, granularity: AnalyticsGranularity): string {
    try {
      const parts = key.split('-');
      if (granularity === 'month') return `${parts[1]}/${parts[0]}`; // MM/YYYY
      return `${parts[2]}/${parts[1]}`; // DD/MM
    } catch {
      return key;
    }
  }

  // --------------------------------------------------------------------------
  // Public API — 3 hàm aggregate
  // --------------------------------------------------------------------------

  /**
   * Zone 1 — Scorecard: tổng cost, tổng tokens, latency trung bình,
   * success rate, totalRequests (G3).
   * So sánh với kỳ liền trước (cùng độ dài) để tính % change.
   */
  async getScorecardMetrics(
    tenantId: string,
    start: Date,
    end: Date,
  ): Promise<AnalyticsScorecardView> {
    try {
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
    } catch {
      // Fallback tuyệt đối an toàn — luôn trả về object đầy đủ, không crash.
      return {
        totalCost: 0,
        totalCostDisplay: '0₫',
        totalCostChange: 0,
        totalTokens: 0,
        totalTokensDisplay: '0',
        totalTokensChange: 0,
        avgLatencyMs: 0,
        avgLatencyDisplay: '0ms',
        avgLatencyChange: 0,
        successRate: 100,
        successRateDisplay: '100.0%',
        successRateChange: 0,
        totalRequests: 0,
      };
    }
  }

  /** Tính các đại lượng lõi của scorecard từ tập bản ghi. */
  private computeScorecardCore(records: RawUsageRecord[]) {
    try {
      let totalCost = 0;
      let totalTokens = 0;
      let latencySum = 0;
      let latencyCount = 0;
      let successCount = 0;
      let requestCount = 0;

      for (const r of records) {
        try {
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
        } catch {
          // Skip record lỗi, tiếp tục vòng lặp.
          continue;
        }
      }

      const avgLatencyMs = latencyCount ? Math.round(latencySum / latencyCount) : 0;
      const successRate = requestCount
        ? Number(((successCount / requestCount) * 100).toFixed(1))
        : 100;

      return {
        totalCost,
        totalTokens,
        avgLatencyMs,
        successRate,
        totalRequests: requestCount,
      };
    } catch {
      return { totalCost: 0, totalTokens: 0, avgLatencyMs: 0, successRate: 100, totalRequests: 0 };
    }
  }

  /**
   * Zone 2 — Cost & Token trend theo bucket thời gian, có breakdown theo model.
   * `modelKeys` rỗng = tất cả model.
   * Nâng cấp: autoGranularity + model-level display (costDisplay/tokensDisplay).
   */
  async getCostTrends(
    tenantId: string,
    start: Date,
    end: Date,
    granularity: AnalyticsGranularity,
    modelKeys: string[],
  ): Promise<CostTrendPoint[]> {
    try {
      // Resolve autoGranularity nếu được yêu cầu
      const gran: AnalyticsGranularity =
        granularity === 'auto'
          ? this.resolveAutoGranularity(start, end)
          : granularity;

      const records = await this.fetchAiRecords(tenantId, start, end);
      const filter = new Set(modelKeys.map((m) => m.trim()).filter(Boolean));
      const useFilter = filter.size > 0;

      const buckets = new Map<string, CostTrendPoint>();

      for (const r of records) {
        try {
          const meta = this.readMetadata(r.metadata);
          const modelKey = meta.modelKey || 'unknown';
          if (useFilter && !filter.has(modelKey)) continue;

          const key = this.bucketKey(r.recordedAt, gran);
          let point = buckets.get(key);
          if (!point) {
            point = {
              date: key,
              label: this.bucketLabel(key, gran),
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
        } catch {
          // Skip record lỗi
          continue;
        }
      }

      // Build display values cho từng bucket và từng model
      const result: CostTrendPoint[] = [];
      for (const point of buckets.values()) {
        // Model-level display
        for (const [mk, md] of Object.entries(point.byModel)) {
          try {
            md.costDisplay = this.formatVnd(md.cost);
            md.tokensDisplay = this.formatCompactNumber(md.tokens);
          } catch {
            md.costDisplay = '0₫';
            md.tokensDisplay = '0';
          }
        }
        point.totalCostDisplay = this.formatVnd(point.totalCost);
        result.push(point);
      }

      return result.sort((a, b) => a.date.localeCompare(b.date));
    } catch {
      return [];
    }
  }

  /**
   * Zone 3 — Ma trận hiệu quả model: gom theo modelKey, tính error rate,
   * anomaly score 3 tầng (G4/G5), totalTokensDisplay, costDisplay.
   * Nâng cấp: tham số modelKeys để lọc mảng model (G2).
   */
  async getModelMatrix(
    tenantId: string,
    start: Date,
    end: Date,
    modelKeys: string[],
  ): Promise<{
    models: ModelMatrixRow[];
    anomalyCount: number;
    anomalyModels: string[];
    anomalyThreshold: number;
  }> {
    try {
      const records = await this.fetchAiRecords(tenantId, start, end);

      const filter = new Set(modelKeys.map((m) => m.trim()).filter(Boolean));
      const useFilter = filter.size > 0;

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
        try {
          const meta = this.readMetadata(r.metadata);
          const modelKey = meta.modelKey || 'unknown';
          // Lọc modelKeys nếu được yêu cầu
          if (useFilter && !filter.has(modelKey)) continue;

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
        } catch {
          continue;
        }
      }

      // Tính toán global avg cho anomaly engine
      let globalTotalCost = 0;
      let globalRequests = 0;
      for (const agg of map.values()) {
        globalTotalCost += agg.totalCost;
        globalRequests += agg.requests;
      }
      const globalCount = map.size || 1; // tránh chia 0
      const globalAvgCostPerRequest = globalRequests > 0 ? globalTotalCost / globalRequests : 0;
      const globalAvgRequests = globalRequests / globalCount;

      const models: ModelMatrixRow[] = [];
      const anomalyModels: string[] = [];

      for (const [modelKey, agg] of map.entries()) {
        try {
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

          // Anomaly Score 3 tầng (G4/G5)
          const anomalyResult = this.computeAnomalyScore(
            errorRate,
            avgCostPerRequest,
            requests,
            globalAvgCostPerRequest,
            globalAvgRequests,
          );

          const anomaly = anomalyResult.score > ANOMALY_SCORE_THRESHOLD || errorRate > ANOMALY_THRESHOLD;
          if (anomaly) anomalyModels.push(modelKey);

          // Xây dựng anomalyReason chi tiết
          let anomalyReason: string | undefined;
          if (anomaly) {
            const reasons: string[] = [];
            if (anomalyResult.breakdown.errorRateScore > 0)
              reasons.push(`Error rate ${errorRate}% (điểm: ${anomalyResult.breakdown.errorRateScore})`);
            if (anomalyResult.breakdown.costSpikeScore > 0)
              reasons.push(`Cost spike ${this.formatVnd(avgCostPerRequest)}/req (điểm: ${anomalyResult.breakdown.costSpikeScore})`);
            if (anomalyResult.breakdown.volumeAnomalyScore > 0)
              reasons.push(`Volume anomaly ${this.formatCompactNumber(requests)} req (điểm: ${anomalyResult.breakdown.volumeAnomalyScore})`);
            anomalyReason = reasons.length > 0
              ? `Anomaly ${anomalyResult.score}/100 — ${reasons.join('; ')}`
              : `Anomaly score ${anomalyResult.score}/100 vượt ngưỡng ${ANOMALY_SCORE_THRESHOLD}`;
          }

          models.push({
            modelKey,
            totalRequests: requests,
            totalCost: agg.totalCost,
            totalCostDisplay: this.formatVnd(agg.totalCost),
            avgCostPerRequest,
            avgCostPerRequestDisplay: this.formatVnd(avgCostPerRequest),
            totalTokens: agg.totalTokens,
            totalTokensDisplay: this.formatCompactNumber(agg.totalTokens),
            avgTokensPerRequest,
            avgLatencyMs,
            errorCount: agg.errorCount,
            errorRate,
            anomaly,
            anomalyScore: anomalyResult.score,
            anomalyBreakdown: anomalyResult.breakdown,
            anomalyReason,
            cacheHitRate,
          });
        } catch {
          // Skip model lỗi aggregate
          continue;
        }
      }

      // Sort theo totalCost giảm dần (model tốn tiền nhất lên đầu).
      models.sort((a, b) => b.totalCost - a.totalCost);

      return {
        models,
        anomalyCount: anomalyModels.length,
        anomalyModels,
        anomalyThreshold: ANOMALY_THRESHOLD,
      };
    } catch {
      return {
        models: [],
        anomalyCount: 0,
        anomalyModels: [],
        anomalyThreshold: ANOMALY_THRESHOLD,
      };
    }
  }
}
