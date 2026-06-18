// ============================================================================
// types/analytics.ts
// UI-facing TypeScript interfaces for the AI Cost Analytics Dashboard.
// Consumed by components/billing/analytics-scorecard.tsx,
// cost-trend-charts.tsx, and their shared filter-bar / shell orchestrator.
// ============================================================================

/** Granularity for trend aggregation (Zone 2). */
export type AiGranularity = "day" | "week" | "month";

// ---------------------------------------------------------------------------
// Zone 1 — Scorecard
// ---------------------------------------------------------------------------

/** Aggregated scorecard view-model powering the four KPI cards. */
export interface AnalyticsScorecard {
  totalCost: number;
  totalCostDisplay: string;
  totalCostChange: number;
  totalTokens: number;
  totalTokensDisplay: string;
  totalTokensChange: number;
  avgLatencyMs: number;
  avgLatencyDisplay: string;
  avgLatencyChange: number;
  successRate: number;
  successRateDisplay: string;
  successRateChange: number;
}

// ---------------------------------------------------------------------------
// Zone 2 — Cost & Token Burn Trends
// ---------------------------------------------------------------------------

/** Per-model breakdown within a single time bucket. */
export interface ModelBucket {
  cost: number;
  tokens: number;
}

/** One data point on the cost / token-burn time-series chart. */
export interface CostTrendPoint {
  date: string;
  label: string;
  totalCost: number;
  totalTokens: number;
  byModel: Record<string, ModelBucket>;
}

// ---------------------------------------------------------------------------
// Zone 3 — Model Efficiency Matrix
// ---------------------------------------------------------------------------

/** Single row in the model efficiency sortable table. */
export interface ModelEfficiencyRow {
  modelKey: string;
  totalRequests: number;
  totalCost: number;
  avgCostPerRequest: number;
  totalTokens: number;
  avgTokensPerRequest: number;
  avgLatencyMs: number;
  errorCount: number;
  errorRate: number;
  anomaly: boolean;
  anomalyReason?: string;
  cacheHitRate: number;
}

/** Full model efficiency API response. */
export interface ModelEfficiencyData {
  models: ModelEfficiencyRow[];
  anomalyCount: number;
  anomalyModels: string[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Shared dashboard view-models
// ---------------------------------------------------------------------------

/** Aggregated payload that powers the entire AI Analytics Dashboard shell. */
export interface AiAnalyticsDashboardData {
  scorecard: AnalyticsScorecard;
  costTrend: CostTrendPoint[];
  modelEfficiency: ModelEfficiencyData;
  period: { start: string; end: string };
  generatedAt: string;
}

/** Client-side filter state shared across all three zones. */
export interface AiAnalyticsFilters {
  startDate: string;
  endDate: string;
  granularity: AiGranularity;
  selectedModels: string[];
}
