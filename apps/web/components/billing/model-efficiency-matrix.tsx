"use client";

import { useMemo, useState, useCallback } from "react";

import type { ModelEfficiencyRow, ModelEfficiencyData } from "../../types/analytics";

// ============================================================================
// model-efficiency-matrix.tsx
// Zone 3 — Model Efficiency Matrix Table (Batch 3, AI Analytics Dashboard).
//
// Renders a sortable, searchable table with per-model performance metrics
// (requests, cost, tokens, latency, error rate) and anomaly detection.
// Error rates exceeding 5% trigger a pulsing red-glow warning border.
// If ≥2 models are flagged, a global banner appears above the table.
// ============================================================================

/* ---------- Constants ---------- */

const ANOMALY_THRESHOLD = 5; // percent

/** Provider-colour mapping for model-key badges. */
const PROVIDER_COLORS: Record<string, string> = {
  "gpt-4o": "#10a37f",
  "gpt-4o-mini": "#10a37f",
  "gpt-4": "#10a37f",
  "gpt-3.5-turbo": "#10a37f",
  "claude-3-5-sonnet": "#d97706",
  "claude-3-opus": "#d97706",
  "claude-3-haiku": "#d97706",
  "claude-2": "#d97706",
  "deepseek-chat": "#4f46e5",
  "deepseek-coder": "#4f46e5",
  "gemini-2.0-flash": "#4285f4",
  "gemini-2.0-pro": "#4285f4",
  "gemini-1.5-pro": "#4285f4",
  mistral: "#f97316",
  "mistral-large": "#f97313",
  llama: "#a855f7",
  "llama-3-70b": "#a855f7",
};
const DEFAULT_PROVIDER_COLOR = "#6d7cff";

/* ---------- Column descriptor ---------- */

type SortKey = keyof ModelEfficiencyRow;
type SortDir = "asc" | "desc";

interface ColumnDef {
  key: SortKey;
  label: string;
  align?: "left" | "right" | "center";
  format?: "text" | "currency" | "compact" | "percent" | "duration";
  width?: number;
}

const COLUMNS: ColumnDef[] = [
  { key: "modelKey", label: "Model Key", align: "left", format: "text", width: 160 },
  { key: "totalRequests", label: "Total Requests", align: "right", format: "compact", width: 110 },
  { key: "avgCostPerRequest", label: "Avg Cost/Req", align: "right", format: "currency", width: 100 },
  { key: "totalCost", label: "Total Cost", align: "right", format: "currency", width: 110 },
  { key: "totalTokens", label: "Total Tokens", align: "right", format: "compact", width: 110 },
  { key: "avgLatencyMs", label: "Avg Latency", align: "right", format: "duration", width: 100 },
  { key: "errorRate", label: "Error Rate", align: "right", format: "percent", width: 100 },
  { key: "cacheHitRate", label: "Cache Hit", align: "right", format: "percent", width: 90 },
];

const SORT_INDICATOR = { asc: " ▲", desc: " ▼" } as const;

/* ---------- Formatters ---------- */

function fmtCurrency(v: number): string {
  if (!Number.isFinite(v)) return "0₫";
  return `${Math.round(v).toLocaleString("vi-VN")}₫`;
}

function fmtCompact(v: number): string {
  if (!Number.isFinite(v)) return "0";
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString("vi-VN");
}

function fmtPercent(v: number): string {
  if (!Number.isFinite(v)) return "0%";
  return `${v.toFixed(1)}%`;
}

function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCell(row: ModelEfficiencyRow, col: ColumnDef): string {
  const raw = row[col.key];
  if (raw == null) return "—";
  const value = raw as number;
  switch (col.format) {
    case "currency":
      return fmtCurrency(value);
    case "compact":
      return fmtCompact(value);
    case "percent":
      return fmtPercent(value);
    case "duration":
      return fmtDuration(value);
    default:
      return String(raw);
  }
}

/* ---------- Sorting ---------- */

function sortModels(
  models: ModelEfficiencyRow[],
  key: SortKey,
  dir: SortDir,
): ModelEfficiencyRow[] {
  return [...models].sort((a, b) => {
    const va = a[key] ?? 0;
    const vb = b[key] ?? 0;
    if (typeof va === "string" && typeof vb === "string") {
      return dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    const na = Number(va);
    const nb = Number(vb);
    return dir === "asc" ? na - nb : nb - na;
  });
}

/* ---------- Sub-components ---------- */

function ModelBadge({ modelKey }: { modelKey: string }) {
  const color = PROVIDER_COLORS[modelKey] ?? DEFAULT_PROVIDER_COLOR;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: 20,
        background: `${color}18`,
        border: `1px solid ${color}44`,
        color,
        fontWeight: 600,
        fontSize: 13,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block" }} />
      {modelKey}
    </span>
  );
}

function AnomalyBadge({ reason }: { reason?: string }) {
  return (
    <span
      title={reason ?? "Anomaly detected"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 10px",
        borderRadius: 20,
        background: "rgba(248,113,113,0.15)",
        border: "1px solid rgba(248,113,113,0.4)",
        color: "#f87171",
        fontWeight: 700,
        fontSize: 12,
        cursor: "default",
        animation: "anomalyPulse 1.5s ease-in-out infinite",
      }}
    >
      ⚠️ Anomaly
    </span>
  );
}

function OkBadge() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 10px",
        borderRadius: 20,
        background: "rgba(52,211,153,0.12)",
        border: "1px solid rgba(52,211,153,0.25)",
        color: "#34d399",
        fontWeight: 600,
        fontSize: 12,
      }}
    >
      ✅ Normal
    </span>
  );
}

function GlobalAnomalyBanner({ count, models }: { count: number; models: string[] }) {
  return (
    <div
      style={{
        padding: "14px 18px",
        borderRadius: 14,
        background: "rgba(248,113,113,0.08)",
        border: "1px solid rgba(248,113,113,0.25)",
        color: "#f87171",
        fontSize: 14,
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 16,
        animation: "anomalyPulse 2s ease-in-out infinite",
      }}
    >
      <span style={{ fontSize: 20 }}>🚨</span>
      <span>
        Phát hiện <strong>{count}</strong> model có tỷ lệ lỗi vượt ngưỡng {ANOMALY_THRESHOLD}%:
        {" "}{models.join(", ")}
        . Khuyến nghị kiểm tra API key hoặc chuyển sang model dự phòng.
      </span>
    </div>
  );
}

/* ---------- Keyframe injection ---------- */

// Injected once via a <style> fragment at the component root.
const ANOMALY_KEYFRAMES = `
@keyframes anomalyPulse {
  0%, 100% { box-shadow: 0 0 4px rgba(248,113,113,0.3); }
  50% { box-shadow: 0 0 14px rgba(248,113,113,0.7); }
}
@keyframes rowAnomalyGlow {
  0%, 100% { box-shadow: inset 0 0 6px rgba(248,113,113,0.08); }
  50% { box-shadow: inset 0 0 18px rgba(248,113,113,0.2); }
}
`;

/* ---------- Main component ---------- */

export interface ModelEfficiencyMatrixProps {
  /** Model efficiency data from the API. */
  data: ModelEfficiencyData;
  /** Optional threshold override for anomaly detection (default 5%). */
  anomalyThreshold?: number;
  /** Invoked when a model row is clicked (e.g. to filter chart). */
  onModelClick?: (modelKey: string) => void;
}

/**
 * Sortable table rendering per-model AI efficiency metrics.
 * - Default sort: Total Cost descending (most expensive model first)
 * - Anomaly rows (errorRate > 5%) get a pulsing red glow + ⚠️ badge
 * - Global banner when ≥2 models are anomalous
 * - Clickable row to filter chart by model
 */
export function ModelEfficiencyMatrix({
  data,
  anomalyThreshold = ANOMALY_THRESHOLD,
  onModelClick,
}: ModelEfficiencyMatrixProps) {
  const { models: rawModels } = data;

  const [sortKey, setSortKey] = useState<SortKey>("totalCost");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  /* ---- Toggle sort ---- */
  const handleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("desc");
      }
    },
    [sortKey],
  );

  /* ---- Apply anomaly flags ---- */
  const enriched = useMemo(
    () =>
      rawModels.map((m) => ({
        ...m,
        anomaly: m.errorRate > anomalyThreshold,
        anomalyReason: m.errorRate > anomalyThreshold
          ? `Error rate ${m.errorRate.toFixed(1)}% vượt ngưỡng ${anomalyThreshold}%. Khuyến nghị kiểm tra API key hoặc chuyển sang model dự phòng.`
          : undefined,
      })),
    [rawModels, anomalyThreshold],
  );

  /* ---- Sort ---- */
  const sorted = useMemo(
    () => sortModels(enriched, sortKey, sortDir),
    [enriched, sortKey, sortDir],
  );

  /* ---- Anomaly summary ---- */
  const anomalyModels = enriched.filter((m) => m.anomaly);
  const showGlobalBanner = anomalyModels.length >= 2;

  if (!rawModels.length) {
    return (
      <section
        style={{
          padding: 24,
          borderRadius: 18,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <h2 style={{ fontSize: 20, margin: 0 }}>Model Efficiency Matrix</h2>
        <p style={{ color: "#7c89bf", marginTop: 16 }}>
          Chưa có dữ liệu hiệu năng model. Hãy tạo workflow AI đầu tiên để bắt đầu theo dõi.
        </p>
      </section>
    );
  }

  return (
    <section
      style={{
        padding: 24,
        borderRadius: 18,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <style>{ANOMALY_KEYFRAMES}</style>

      {/* ---- Header ---- */}
      <h2 style={{ fontSize: 20, margin: "0 0 16px", color: "#e8edff" }}>
        Model Efficiency Matrix
      </h2>

      {/* ---- Global anomaly banner ---- */}
      {showGlobalBanner && (
        <GlobalAnomalyBanner
          count={anomalyModels.length}
          models={anomalyModels.map((m) => m.modelKey)}
        />
      )}

      {/* ---- Table wrapper (horizontal scroll for narrow screens) ---- */}
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
            color: "#e8edff",
          }}
        >
          {/* ---- Table head ---- */}
          <thead>
            <tr>
              {COLUMNS.map((col) => {
                const isActive = sortKey === col.key;
                const indicator = isActive ? SORT_INDICATOR[sortDir] : "";
                return (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    style={{
                      textAlign: col.align ?? "left",
                      padding: "10px 12px",
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                      color: isActive ? "#6d7cff" : "#9fb0ff",
                      fontWeight: isActive ? 700 : 600,
                      fontSize: 12,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      cursor: "pointer",
                      userSelect: "none",
                      whiteSpace: "nowrap",
                      width: col.width ?? undefined,
                    }}
                  >
                    {col.label}
                    {indicator}
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* ---- Table body ---- */}
          <tbody>
            {sorted.map((row, idx) => {
              const isAnomaly = row.anomaly;
              return (
                <tr
                  key={row.modelKey}
                  onClick={() => onModelClick?.(row.modelKey)}
                  style={{
                    cursor: onModelClick ? "pointer" : "default",
                    transition: "background 0.15s",
                    background: isAnomaly
                      ? "rgba(248,113,113,0.04)"
                      : idx % 2 === 1
                        ? "rgba(255,255,255,0.02)"
                        : "transparent",
                    animation: isAnomaly ? "rowAnomalyGlow 2s ease-in-out infinite" : undefined,
                  }}
                >
                  {COLUMNS.map((col) => {
                    const cellValue = formatCell(row, col);
                    const cellStyle: React.CSSProperties = {
                      textAlign: col.align ?? "left",
                      padding: "10px 12px",
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                      whiteSpace: "nowrap",
                    };

                    // Special rendering for model key column
                    if (col.key === "modelKey") {
                      return (
                        <td key={col.key} style={cellStyle}>
                          <ModelBadge modelKey={row.modelKey} />
                        </td>
                      );
                    }

                    // Special rendering for error rate column — colour-code it
                    if (col.key === "errorRate") {
                      const color = row.errorRate > anomalyThreshold ? "#f87171" : "#34d399";
                      return (
                        <td key={col.key} style={{ ...cellStyle, color, fontWeight: 700 }}>
                          {cellValue}
                        </td>
                      );
                    }

                    // Status column (anomaly badge + tooltip)
                    if (col.key === "cacheHitRate") {
                      // We render status inline after error rate — use cacheHitRate position as status
                      return (
                        <td key={col.key} style={cellStyle}>
                          <span style={{ color: row.cacheHitRate > 20 ? "#34d399" : "#9fb0ff", fontWeight: row.cacheHitRate > 20 ? 600 : 400 }}>
                            {cellValue}
                          </span>
                        </td>
                      );
                    }

                    // Generic cell
                    return (
                      <td key={col.key} style={cellStyle}>
                        {cellValue}
                      </td>
                    );
                  })}

                  {/* Status column — appended after all COLUMNS */}
                  <td
                    style={{
                      textAlign: "center",
                      padding: "10px 12px",
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {isAnomaly ? (
                      <AnomalyBadge reason={row.anomalyReason} />
                    ) : (
                      <OkBadge />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---- Footer summary ---- */}
      <div
        style={{
          marginTop: 14,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 13,
          color: "#7c89bf",
        }}
      >
        <span>
          {rawModels.length} model
          {anomalyModels.length > 0 && (
            <span style={{ color: "#f87171", fontWeight: 600, marginLeft: 8 }}>
              · {anomalyModels.length} bất thường
            </span>
          )}
        </span>
        {data.generatedAt && (
          <span>Cập nhật: {new Date(data.generatedAt).toLocaleString("vi-VN")}</span>
        )}
      </div>
    </section>
  );
}
