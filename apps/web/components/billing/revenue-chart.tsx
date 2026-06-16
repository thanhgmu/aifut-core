"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { RevenueTrendPoint } from "../../types/billing";

/** Brand accent used for the gradient stroke + fill. */
const ACCENT = "#6d7cff";

interface RevenueChartProps {
  data: RevenueTrendPoint[];
  /** Optional title override for the card header. */
  title?: string;
  /** Optional subtitle (e.g. the active range label). */
  rangeLabel?: string | null;
}

/**
 * Revenue trend area chart powered by Recharts.
 * Renders gross + net cashflow with a #6d7cff gradient fill.
 */
export function RevenueChart({
  data,
  title = "Revenue trend",
  rangeLabel,
}: RevenueChartProps) {
  if (!data.length) return null;

  return (
    <section
      style={{
        padding: 24,
        borderRadius: 18,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 18,
        }}
      >
        <h2 style={{ fontSize: 20, margin: 0 }}>{title}</h2>
        {rangeLabel && (
          <span style={{ fontSize: 13, color: "#9fb0ff" }}>{rangeLabel}</span>
        )}
      </div>

      <div style={{ width: "100%", height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity={0.45} />
                <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="netRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.06)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fill: "#9fb0ff", fontSize: 12 }}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#9fb0ff", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={56}
              tickFormatter={(value: number) => formatCompact(value)}
            />
            <Tooltip
              contentStyle={{
                background: "#11152b",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
                color: "#e8edff",
                fontSize: 13,
              }}
              labelStyle={{ color: "#9fb0ff" }}
              formatter={(value: any, name: any) => [
                formatCompact(value),
                name === "netRevenue" ? "Net revenue" : "Gross revenue",
              ]}
            />

            <Area
              type="monotone"
              dataKey="revenue"
              stroke={ACCENT}
              strokeWidth={2.5}
              fill="url(#revenueGradient)"
            />
            <Area
              type="monotone"
              dataKey="netRevenue"
              stroke="#34d399"
              strokeWidth={2}
              fill="url(#netRevenueGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

/** Compact currency-ish formatter for axis ticks + tooltip values. */
function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return `$${value.toLocaleString()}`;
}
