"use client";

import { useState, useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { CostTrendPoint } from "../../types/analytics";
import { formatAnalyticsVND, formatCompactToken } from "../../lib/analytics";

// ============================================================================
// cost-trend-charts.tsx
// Zone 2 — Cost Trend Area Chart + Token Burn Stacked Bar Chart.
// Powered by Recharts with #6d7cff gradient fills, custom VND/token
// tooltips, and dynamic model-key filter chips.
// ============================================================================

/* ---------- Constants ---------- */

const ACCENT = "#6d7cff";
const MODEL_COLORS = [
  "#6d7cff",
  "#34d399",
  "#facc15",
  "#f87171",
  "#a78bfa",
  "#38bdf8",
  "#fb923c",
  "#e879f9",
];

type ChartMode = "area-cost" | "stacked-tokens";

/* ---------- Toggle button component ---------- */

function ToggleBtn({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 14px",
        borderRadius: 8,
        border: active
          ? "1px solid #6d7cff"
          : "1px solid rgba(255,255,255,0.12)",
        background: active ? "rgba(109,124,255,0.18)" : "transparent",
        color: active ? "#6d7cff" : "#9fb0ff",
        fontSize: 13,
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

/* ---------- Model filter chip ---------- */

function ModelChip({
  label,
  selected,
  color,
  onToggle,
}: {
  label: string;
  selected: boolean;
  color: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 10px",
        borderRadius: 20,
        border: selected
          ? `1px solid ${color}`
          : "1px solid rgba(255,255,255,0.10)",
        background: selected ? `${color}22` : "transparent",
        color: selected ? color : "#7c89bf",
        fontSize: 12,
        fontWeight: selected ? 600 : 400,
        cursor: "pointer",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: selected ? color : "rgba(255,255,255,0.15)",
          display: "inline-block",
        }}
      />
      {label}
    </button>
  );
}

/* ---------- Custom tooltip content ---------- */

function CostTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; dataKey: string }>;
  label?: string;
}) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div
      style={{
        background: "#11152b",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 12,
        padding: "10px 14px",
        fontSize: 13,
        color: "#e8edff",
      }}
    >
      <div style={{ color: "#9fb0ff", marginBottom: 4, fontWeight: 600 }}>
        {label}
      </div>
      {payload.map((entry) => (
        <div key={entry.dataKey} style={{ display: "flex", gap: 8 }}>
          <span style={{ color: "#7c89bf" }}>{entry.name}:</span>
          <span style={{ fontWeight: 700 }}>
            {formatAnalyticsVND(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function TokenTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; dataKey: string }>;
  label?: string;
}) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div
      style={{
        background: "#11152b",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 12,
        padding: "10px 14px",
        fontSize: 13,
        color: "#e8edff",
      }}
    >
      <div style={{ color: "#9fb0ff", marginBottom: 4, fontWeight: 600 }}>
        {label}
      </div>
      {payload.map((entry) => (
        <div key={entry.dataKey} style={{ display: "flex", gap: 8 }}>
          <span style={{ color: "#7c89bf" }}>{entry.name}:</span>
          <span style={{ fontWeight: 700 }}>
            {formatCompactToken(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Main component ---------- */

export interface CostTrendChartsProps {
  /** Time-series data from the backend. */
  data: CostTrendPoint[];
  /** All distinct model keys present across the data set. */
  availableModels: string[];
  /** Currently selected model keys (controlled externally or lifted state). */
  selectedModels: string[];
  /** Called when the user toggles a model filter chip. */
  onModelsChange: (models: string[]) => void;
  /** Optional title override. */
  title?: string;
}

/**
 * Renders a toggleable chart zone:
 * - "Cost Trend" (Area chart with gradient fill) — default
 * - "Token Burn" (Stacked bar by model)
 *
 * Users can filter visible models via clickable chips. When no model chips
 * are selected, the cost area shows the aggregate totalCost/totalTokens and
 * the stacked bar shows all available models.
 */
export function CostTrendCharts({
  data,
  availableModels,
  selectedModels,
  onModelsChange,
  title = "Cost & Token Burn Trends",
}: CostTrendChartsProps) {
  const [chartMode, setChartMode] = useState<ChartMode>("area-cost");

  const modelsToShow = useMemo(() => {
    if (selectedModels.length > 0) return selectedModels;
    return availableModels;
  }, [selectedModels, availableModels]);

  /* ---- Filter data points that have any relevant model data ---- */
  const chartData = useMemo(() => {
    if (chartMode === "area-cost") return data;
    // For stacked bar we only need points that have ≥1 selected model
    return data.map((point) => {
      const filteredByModel: Record<string, { cost: number; tokens: number }> = {};
      for (const model of modelsToShow) {
        if (point.byModel[model]) {
          filteredByModel[model] = point.byModel[model];
        }
      }
      return { ...point, byModel: filteredByModel };
    });
  }, [data, modelsToShow, chartMode]);

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
      {/* ---- Header row ---- */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <h2 style={{ fontSize: 20, margin: 0, color: "#e8edff" }}>{title}</h2>

        <div style={{ display: "flex", gap: 8 }}>
          <ToggleBtn
            active={chartMode === "area-cost"}
            label="📈 Cost Trend"
            onClick={() => setChartMode("area-cost")}
          />
          <ToggleBtn
            active={chartMode === "stacked-tokens"}
            label="📊 Token Burn"
            onClick={() => setChartMode("stacked-tokens")}
          />
        </div>
      </div>

      {/* ---- Model filter chips ---- */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginBottom: 18,
        }}
      >
        {availableModels.map((model, idx) => (
          <ModelChip
            key={model}
            label={model}
            color={MODEL_COLORS[idx % MODEL_COLORS.length] || '#6d7cff'}
            selected={selectedModels.includes(model)}
            onToggle={() => {
              if (selectedModels.includes(model)) {
                onModelsChange(
                  selectedModels.filter((m) => m !== model),
                );
              } else {
                onModelsChange([...selectedModels, model]);
              }
            }}
          />
        ))}
      </div>

      {/* ---- Chart area ---- */}
      <div style={{ width: "100%", height: 360 }}>
        <ResponsiveContainer width="100%" height="100%">
          {chartMode === "area-cost" ? (
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
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
                width={60}
                tickFormatter={(v: number) => formatAnalyticsVND(v)}
              />
              <Tooltip content={<CostTooltip />} />

              <Area
                type="monotone"
                dataKey="totalCost"
                name="Total Cost"
                stroke={ACCENT}
                strokeWidth={2.5}
                fill="url(#costGradient)"
              />
            </AreaChart>
          ) : (
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
            >
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
                width={60}
                tickFormatter={(v: number) => formatCompactToken(v)}
              />
              <Tooltip content={<TokenTooltip />} />

              {modelsToShow.map((model, idx) => (
                <Bar
                  key={model}
                  dataKey={`byModel.${model}.tokens`}
                  name={model}
                  stackId="stack"
                  fill={MODEL_COLORS[idx % MODEL_COLORS.length]}
                  stroke="none"
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </section>
  );
}
