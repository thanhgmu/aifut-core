// ============================================================================
// lib/analytics.ts
// API fetch helpers + number formatting utilities for the AI Cost Analytics
// Dashboard. Extends the established pattern from lib/billing.ts.
// ============================================================================

import { API_BASE, getStoredToken } from "./auth";
import { resolveTenantSlug } from "./billing";
import type {
  AiAnalyticsDashboardData,
  AiAnalyticsFilters,
  AnalyticsScorecard,
  CostTrendPoint,
  ModelEfficiencyData,
} from "../types/analytics";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Compact token formatter: renders large token counts in human-readable
 * shorthand (e.g. 1_234_567 → "1.2M", 89_400 → "89.4K").
 * Direct render for zone-1 scorecard display.
 */
export function formatCompactToken(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toLocaleString("vi-VN");
}

/**
 * Format a numeric VND amount with thousands separators and the ₫ suffix.
 * Shares the same visual contract as formatVND in lib/billing.ts but is
 * re-exported here so the analytics module remains self-contained.
 */
export function formatAnalyticsVND(amount: number): string {
  if (!Number.isFinite(amount)) return "0₫";
  if (Math.abs(amount) >= 1_000_000_000) {
    return `${(amount / 1_000_000_000).toFixed(1)}B₫`;
  }
  if (Math.abs(amount) >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1)}M₫`;
  }
  return `${Math.round(amount).toLocaleString("vi-VN")}₫`;
}

/**
 * Format a millisecond duration into a human-readable second-string.
 * e.g. 1650 → "1.7s", 200 → "0.2s".
 */
export function formatMsToSeconds(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  return `${(ms / 1000).toFixed(1)}s`;
}

// ---------------------------------------------------------------------------
// Zone 1 — Scorecard metrics
// ---------------------------------------------------------------------------

/**
 * Fetch the AI usage scorecard (4 KPI cards: Cost, Tokens, Latency,
 * Success Rate) for the given date window.
 *
 * Headers: x-tenant-slug (auto-resolved) + Authorization Bearer.
 */
export async function fetchScorecardMetrics(
  startDate: string,
  endDate: string,
): Promise<AnalyticsScorecard | null> {
  const token = getStoredToken();
  if (!token) return null;

  const slug = await resolveTenantSlug();
  if (!slug) return null;

  try {
    const res = await fetch(
      `${API_BASE}/ai-analytics/scorecard?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
      {
        headers: {
          "x-tenant-slug": slug,
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.scorecard as AnalyticsScorecard;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Zone 2 — Cost & token-burn trends
// ---------------------------------------------------------------------------

/**
 * Fetch cost / token time-series data for the chart zone.
 * Supports granularity (day/week/month) and optional model-key filtering
 * via the AiAnalyticsFilters.selectedModels array (serialized as CSV).
 */
export async function fetchCostTrends(
  filters: AiAnalyticsFilters,
): Promise<CostTrendPoint[]> {
  const token = getStoredToken();
  if (!token) return [];

  const slug = await resolveTenantSlug();
  if (!slug) return [];

  try {
    const params = new URLSearchParams({
      startDate: filters.startDate,
      endDate: filters.endDate,
      granularity: filters.granularity,
    });
    if (filters.selectedModels.length > 0) {
      params.set("modelKeys", filters.selectedModels.join(","));
    }

    const res = await fetch(
      `${API_BASE}/ai-analytics/cost-trend?${params.toString()}`,
      {
        headers: {
          "x-tenant-slug": slug,
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.costTrend ?? []) as CostTrendPoint[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Zone 3 — Model efficiency matrix
// ---------------------------------------------------------------------------

/**
 * Fetch the per-model efficiency matrix: requests, cost, latency, error
 * rate, and anomaly flags for each AI model used by this tenant.
 */
export async function fetchModelMatrix(
  startDate: string,
  endDate: string,
): Promise<ModelEfficiencyData | null> {
  const token = getStoredToken();
  if (!token) return null;

  const slug = await resolveTenantSlug();
  if (!slug) return null;

  try {
    const res = await fetch(
      `${API_BASE}/ai-analytics/model-efficiency?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
      {
        headers: {
          "x-tenant-slug": slug,
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as ModelEfficiencyData;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Composite — Fetch all three zones in parallel
// ---------------------------------------------------------------------------

/**
 * Convenience aggregator that fetches scorecard, cost trends, and model
 * efficiency simultaneously. Returns a fully shaped AiAnalyticsDashboardData
 * that the shell component can consume directly, including safe fallbacks
 * when any individual endpoint is unavailable or empty.
 */
export async function fetchAiAnalyticsDashboard(
  filters: AiAnalyticsFilters,
): Promise<AiAnalyticsDashboardData | null> {
  const [scorecard, costTrend, modelEfficiency] = await Promise.all([
    fetchScorecardMetrics(filters.startDate, filters.endDate),
    fetchCostTrends(filters),
    fetchModelMatrix(filters.startDate, filters.endDate),
  ]);

  if (!scorecard && costTrend.length === 0 && !modelEfficiency) return null;

  return {
    scorecard: scorecard ?? {
      totalCost: 0,
      totalCostDisplay: "0₫",
      totalCostChange: 0,
      totalTokens: 0,
      totalTokensDisplay: "0",
      totalTokensChange: 0,
      avgLatencyMs: 0,
      avgLatencyDisplay: "0s",
      avgLatencyChange: 0,
      successRate: 100,
      successRateDisplay: "100%",
      successRateChange: 0,
    },
    costTrend,
    modelEfficiency: modelEfficiency ?? {
      models: [],
      anomalyCount: 0,
      anomalyModels: [],
      generatedAt: new Date().toISOString(),
    },
    period: { start: filters.startDate, end: filters.endDate },
    generatedAt: new Date().toISOString(),
  };
}
