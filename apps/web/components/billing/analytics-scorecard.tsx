"use client";

import type { AnalyticsScorecard } from "../../types/analytics";

// ============================================================================
// analytics-scorecard.tsx
// Zone 1 — Four KPI headline cards: Cost, Tokens, Latency, Success Rate.
// Follows the established glassy-card / trend-arrow pattern from
// metric-cards.tsx, extended with AI-specific colouring.
// ============================================================================

/* ---------- Card descriptors ---------- */

interface CardDescriptor {
  key: keyof AnalyticsScorecardValueSet;
  label: string;
  icon: string;
  /** The card's "good" direction so we know which way is green. */
  goodDirection: "down" | "up";
}

/** Extracted value/change/display tuple so we don't repeat four times. */
interface AnalyticsScorecardValueSet {
  valueDisplay: string;
  changePercent: number;
}

const CARDS: any[] = [
  { key: "cost", label: "Total AI Cost", icon: "💰", goodDirection: "down" },
  { key: "tokens", label: "Total Tokens Burned", icon: "🔥", goodDirection: "down" },
  { key: "latency", label: "Avg Latency", icon: "⚡", goodDirection: "down" },
  { key: "successRate", label: "Success Rate", icon: "✅", goodDirection: "up" },
];

/** Arrow and colour for each trend direction. */
function trendStyle(
  changePercent: number,
  goodDirection: "up" | "down",
): { color: string; arrow: string } {
  if (changePercent === 0) return { color: "#9fb0ff", arrow: "→" };

  const isImprovement =
    goodDirection === "up" ? changePercent > 0 : changePercent < 0;

  if (isImprovement) {
    return { color: "#34d399", arrow: "▲" };
  }
  return { color: "#f87171", arrow: "▼" };
}

/** Format change percent with sign. */
function formatChange(change: number): string {
  if (change === 0) return "0%";
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
}

/* ---------- Component ---------- */

export interface AnalyticsScorecardProps {
  scorecard: AnalyticsScorecard;
  /** Optional label describing the active period (e.g. "Tháng 6, 2026"). */
  periodLabel?: string | null;
}

/**
 * Renders the four KPI headline cards that summarise AI usage cost,
 * token consumption, average latency, and success rate for the tenant.
 *
 * Each card includes:
 * - Icon + label
 * - Large formatted value
 * - Trend indicator (▲/▼/→) with % change vs previous period
 * - Colour that reflects whether the direction is "good" or "bad"
 */
export function AnalyticsScorecards({
  scorecard,
  periodLabel,
}: AnalyticsScorecardProps) {
  const values: Record<string, AnalyticsScorecardValueSet> = {
    cost: {
      valueDisplay: scorecard.totalCostDisplay,
      changePercent: scorecard.totalCostChange,
    },
    tokens: {
      valueDisplay: scorecard.totalTokensDisplay,
      changePercent: scorecard.totalTokensChange,
    },
    latency: {
      valueDisplay: scorecard.avgLatencyDisplay,
      changePercent: scorecard.avgLatencyChange,
    },
    successRate: {
      valueDisplay: scorecard.successRateDisplay,
      changePercent: scorecard.successRateChange,
    },
  };

  return (
    <section>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 16,
        }}
      >
        <h2 style={{ fontSize: 20, margin: 0, color: "#e8edff" }}>
          AI Usage Scorecard
        </h2>
        {periodLabel && (
          <span style={{ fontSize: 13, color: "#9fb0ff" }}>
            {periodLabel}
          </span>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 18,
        }}
      >
        {CARDS.map((card) => {
          const v = values[card.key];
          const trend = trendStyle(v?.changePercent || 0, card.goodDirection);

          return (
            <div
              key={card.key}
              style={{
                padding: 22,
                borderRadius: 18,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                backdropFilter: "blur(6px)",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: "#9fb0ff",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>{card.icon}</span>
                <span>{card.label}</span>
              </div>

              <div
                style={{
                  fontSize: 30,
                  fontWeight: 800,
                  marginTop: 12,
                  color: "#e8edff",
                  letterSpacing: "-0.02em",
                }}
              >
                {v?.valueDisplay || '0'}
              </div>

              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                }}
              >
                <span
                  style={{
                    color: trend.color,
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  {trend.arrow} {formatChange(v?.changePercent || 0)}
                </span>
                <span style={{ color: "#7c89bf", fontSize: 12 }}>
                  vs kỳ trước
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
