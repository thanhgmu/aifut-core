// ============================================================================
// payments/analytics/analytics.types.ts
// Domain types for the AI Cost Analytics backend (Batch 1).
// Tham chiếu thiết kế: docs/roadmap/AI-ANALYTICS-DASHBOARD-DESIGN.md
// ============================================================================

/** Mức gom nhóm thời gian cho biểu đồ xu hướng. */
export type AnalyticsGranularity = 'day' | 'week' | 'month';

/**
 * Hình dạng metadata được `AiBillingMeterService.recordAiUsage()` ghi kèm
 * mỗi bản ghi `UsageRecord` (category = 'ai').
 * Lưu ý: cost có thể được trung chuyển dưới dạng number | string (BigInt-safe).
 */
export interface AiUsageMetadata {
  modelKey?: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number | string;
  actualCost?: number | string;
  featureKey?: string;
  taskType?: string;
  cacheHit?: boolean;
  latencyMs?: number;
  success?: boolean;
}

/** Khoảng thời gian phân tích (inclusive). */
export interface AnalyticsPeriod {
  start: string; // ISO date
  end: string; // ISO date
}

/**
 * Zone 1 — Thẻ tổng quan hiệu năng AI.
 * Mọi giá trị VND được trung chuyển vừa dạng number an toàn vừa dạng string
 * hiển thị để tránh mất độ chính xác phía client.
 */
export interface AnalyticsScorecardView {
  totalCost: number;
  totalCostDisplay: string;
  totalCostChange: number; // % thay đổi so với kỳ trước
  totalTokens: number;
  totalTokensDisplay: string;
  totalTokensChange: number;
  avgLatencyMs: number;
  avgLatencyDisplay: string;
  avgLatencyChange: number;
  successRate: number; // 0-100
  successRateDisplay: string;
  successRateChange: number;
  totalRequests: number;
}

/** Một điểm trên chuỗi thời gian (Zone 2). */
export interface CostTrendPoint {
  date: string; // khóa bucket (ISO date / tuần / tháng)
  label: string; // nhãn hiển thị locale vi-VN
  totalCost: number;
  totalCostDisplay: string;
  totalTokens: number;
  byModel: Record<
    string,
    {
      cost: number;
      tokens: number;
    }
  >;
}

/** Một dòng trong ma trận hiệu quả model (Zone 3). */
export interface ModelMatrixRow {
  modelKey: string;
  totalRequests: number;
  totalCost: number;
  totalCostDisplay: string;
  avgCostPerRequest: number;
  avgCostPerRequestDisplay: string;
  totalTokens: number;
  avgTokensPerRequest: number;
  avgLatencyMs: number;
  errorCount: number;
  errorRate: number; // 0-100
  anomaly: boolean;
  anomalyReason?: string;
  cacheHitRate: number; // 0-100
}

/** Response bao bọc cho endpoint scorecard. */
export interface ScorecardResponse {
  tenantId: string;
  period: AnalyticsPeriod;
  scorecard: AnalyticsScorecardView;
  generatedAt: string;
}

/** Response bao bọc cho endpoint trends. */
export interface CostTrendResponse {
  tenantId: string;
  period: AnalyticsPeriod;
  granularity: AnalyticsGranularity;
  costTrend: CostTrendPoint[];
  generatedAt: string;
}

/** Response bao bọc cho endpoint matrix. */
export interface ModelMatrixResponse {
  tenantId: string;
  period: AnalyticsPeriod;
  models: ModelMatrixRow[];
  anomalyCount: number;
  anomalyModels: string[];
  anomalyThreshold: number;
  generatedAt: string;
}

/** Tham số lọc dùng chung cho các truy vấn aggregate. */
export interface AnalyticsQueryFilters {
  startDate: string;
  endDate: string;
  granularity: AnalyticsGranularity;
  modelKeys: string[];
}
