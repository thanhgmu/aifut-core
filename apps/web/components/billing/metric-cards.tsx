"use client";

import type { AnalyticsMetric, MetricTrend } from "../../types/billing";

/** Visual treatment for each trend direction (color + arrow glyph). */
const TREND_STYLE: Record<MetricTrend, { color: string; arrow: string }> = {
  up: { color: "#34d399", arrow: "▲" },
  down: { color: "#f87171", arrow: "▼" },
  flat: { color: "#9fb0ff", arrow: "→" },
};

/**
 * Responsive row of the four headline financial KPIs:
 * MRR, GTV, Churn Rate, LTV.
 */
export function MetricCards({ metrics }: { metrics: AnalyticsMetric[] }) {
  if (!metrics.length) return null;

  return (
    <section>
      <h2 style={{ fontSize: 20, margin: "0 0 16px" }}>Payment analytics</h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 18,
        }}
      >
        {metrics.map((metric) => (
          <MetricCard key={metric.key} metric={metric} />
        ))}
      </div>
    </section>
  );
}

function MetricCard({ metric }: { metric: AnalyticsMetric }) {
  const trend = TREND_STYLE[metric.trend] ?? TREND_STYLE.flat;

  return (
    <div
      style={{
        padding: 22,
        borderRadius: 18,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div style={{ fontSize: 13, color: "#9fb0ff", fontWeight: 600 }}>
        {metric.label}
      </div>

      <div style={{ fontSize: 32, fontWeight: 800, marginTop: 10 }}>
        {metric.valueDisplay}
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
        <span style={{ color: trend.color, fontWeight: 700 }}>
          {trend.arrow} {metric.changeDisplay}
        </span>
        {metric.caption && (
          <span style={{ color: "#7c89bf" }}>{metric.caption}</span>
        )}
      </div>
    </div>
  );
}
