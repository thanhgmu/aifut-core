"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AnalyticsScorecards } from "./analytics-scorecard";
import { CostTrendCharts } from "./cost-trend-charts";
import { ModelEfficiencyMatrix } from "./model-efficiency-matrix";

import { fetchAiAnalyticsDashboard } from "../../lib/analytics";
import type {
  AiAnalyticsDashboardData,
  AiAnalyticsFilters,
  AiGranularity,
  CostTrendPoint,
  ModelEfficiencyData,
} from "../../types/analytics";

// ============================================================================
// analytics-client-shell.tsx
// Client Orchestrator Shell (Batch 3) — AI Analytics Dashboard.
//
// Responsibilities:
// 1. Fetch data concurrently from 3 API endpoints via lib/analytics helpers
// 2. Manage filter state (date range, model keys, granularity)
// 3. Manage Loading skeleton / Empty data / Error boundary tri-state
// 4. Pass data + callbacks down to Zone 1 (Scorecard), Zone 2 (Charts),
//    and Zone 3 (Matrix)
// 5. Distribute filter-context so the chart model chips stay in sync
// ============================================================================

/* ========== Constants ========== */

/** Default filter: this calendar month. */
function defaultFilters(): AiAnalyticsFilters {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: now.toISOString().slice(0, 10),
    granularity: "day",
    selectedModels: [],
  };
}

/** Quick-date presets for the filter bar. */
const QUICK_PRESETS: Array<{ label: string; daysBack: number }> = [
  { label: "Hôm nay", daysBack: 0 },
  { label: "7 ngày", daysBack: 7 },
  { label: "30 ngày", daysBack: 30 },
];

/** Max renderings before we drop outdated responses (safety net). */
const MAX_RENDER_CYCLE = 10;

/* ========== Phase state machine ========== */

type ShellPhase = "loading" | "ready" | "empty" | "error";

/* ========== Loading skeleton ========== */

function LoadingSkeleton() {
  const shimmer =
    "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Skeleton scorecard row */}
      <section>
        <div
          style={{
            height: 20,
            width: 200,
            borderRadius: 8,
            background: shimmer,
            marginBottom: 16,
          }}
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 18 }}>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                height: 130,
                borderRadius: 18,
                background: shimmer,
              }}
            />
          ))}
        </div>
      </section>

      {/* Skeleton chart */}
      <section>
        <div
          style={{
            height: 20,
            width: 220,
            borderRadius: 8,
            background: shimmer,
            marginBottom: 16,
          }}
        />
        <div
          style={{
            height: 360,
            borderRadius: 18,
            background: shimmer,
          }}
        />
      </section>

      {/* Skeleton table */}
      <section>
        <div
          style={{
            height: 20,
            width: 240,
            borderRadius: 8,
            background: shimmer,
            marginBottom: 16,
          }}
        />
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              height: 44,
              borderRadius: 8,
              background: shimmer,
              marginBottom: 6,
            }}
          />
        ))}
      </section>
    </div>
  );
}

/* ========== Empty state ========== */

function EmptyState() {
  return (
    <section
      style={{
        padding: "60px 24px",
        borderRadius: 18,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        textAlign: "center",
        color: "#7c89bf",
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
      <h2 style={{ color: "#e8edff", margin: "0 0 8px" }}>
        Chưa có dữ liệu AI Analytics
      </h2>
      <p style={{ maxWidth: 420, margin: "0 auto 20px", lineHeight: 1.6 }}>
        Dữ liệu phân tích AI sẽ xuất hiện sau khi bạn tạo workflow AI đầu tiên.
        Hãy bắt đầu bằng cách thiết lập một kết nối AI model và tạo workflow.
      </p>
      <a
        href="/workflows"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 24px",
          borderRadius: 12,
          background: "linear-gradient(135deg, #6d7cff, #4f46e5)",
          color: "#fff",
          fontWeight: 700,
          fontSize: 15,
          textDecoration: "none",
        }}
      >
        ✨ Tạo workflow AI đầu tiên
      </a>
    </section>
  );
}

/* ========== Error boundary display ========== */

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section
      style={{
        padding: "40px 24px",
        borderRadius: 18,
        background: "rgba(248,113,113,0.06)",
        border: "1px solid rgba(248,113,113,0.2)",
        textAlign: "center",
        color: "#f87171",
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
      <h2 style={{ color: "#f87171", margin: "0 0 8px" }}>
        Không thể tải dữ liệu
      </h2>
      <p style={{ margin: "0 auto 20px", maxWidth: 500, color: "#c8d2ff" }}>
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        style={{
          padding: "10px 22px",
          borderRadius: 10,
          border: "1px solid rgba(248,113,113,0.3)",
          background: "rgba(248,113,113,0.1)",
          color: "#f87171",
          fontWeight: 700,
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        🔄 Thử lại
      </button>
    </section>
  );
}

/* ========== Filter bar component (inline) ========== */

function AnalyticsFilterBar({
  filters,
  availableModels,
  onFiltersChange,
}: {
  filters: AiAnalyticsFilters;
  availableModels: string[];
  onFiltersChange: (f: AiAnalyticsFilters) => void;
}) {
  /* ---- Date range presets ---- */
  const applyPreset = useCallback(
    (daysBack: number) => {
      const now = new Date();
      let start: Date;
      if (daysBack === 0) {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else {
        start = new Date(now);
        start.setDate(start.getDate() - daysBack);
      }
      onFiltersChange({
        ...filters,
        startDate: start.toISOString().slice(0, 10),
        endDate: now.toISOString().slice(0, 10),
      });
    },
    [filters, onFiltersChange],
  );

  const setGranularity = useCallback(
    (g: AiGranularity) => {
      onFiltersChange({ ...filters, granularity: g });
    },
    [filters, onFiltersChange],
  );

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        alignItems: "center",
        padding: 16,
        borderRadius: 16,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* ---- Quick presets ---- */}
      <div style={{ display: "flex", gap: 6 }}>
        {QUICK_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p.daysBack)}
            style={{
              padding: "6px 12px",
              borderRadius: 20,
              border: "1px solid rgba(255,255,255,0.1)",
              background: "transparent",
              color: "#9fb0ff",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            onFiltersChange({
              ...filters,
              startDate: start.toISOString().slice(0, 10),
              endDate: now.toISOString().slice(0, 10),
            });
          }}
          style={{
            padding: "6px 12px",
            borderRadius: 20,
            border: "1px solid rgba(109,124,255,0.3)",
            background: "rgba(109,124,255,0.12)",
            color: "#6d7cff",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Tháng này
        </button>
      </div>

      {/* ---- Date inputs ---- */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 4 }}>
        <span style={{ fontSize: 12, color: "#7c89bf" }}>📅</span>
        <input
          type="date"
          value={filters.startDate}
          onChange={(e) =>
            onFiltersChange({ ...filters, startDate: e.target.value })
          }
          style={dateInputStyle}
        />
        <span style={{ color: "#7c89bf", fontSize: 12 }}>→</span>
        <input
          type="date"
          value={filters.endDate}
          onChange={(e) =>
            onFiltersChange({ ...filters, endDate: e.target.value })
          }
          style={dateInputStyle}
        />
      </div>

      {/* ---- Granularity ---- */}
      <div style={{ display: "flex", gap: 4 }}>
        {(["day", "week", "month"] as AiGranularity[]).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGranularity(g)}
            style={{
              padding: "5px 10px",
              borderRadius: 6,
              border:
                filters.granularity === g
                  ? "1px solid #6d7cff"
                  : "1px solid rgba(255,255,255,0.1)",
              background:
                filters.granularity === g
                  ? "rgba(109,124,255,0.18)"
                  : "transparent",
              color: filters.granularity === g ? "#6d7cff" : "#9fb0ff",
              fontSize: 11,
              fontWeight: filters.granularity === g ? 700 : 500,
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {g === "day" ? "Ngày" : g === "week" ? "Tuần" : "Tháng"}
          </button>
        ))}
      </div>

      {/* ---- Model count badge ---- */}
      {availableModels.length > 0 && (
        <span style={{ fontSize: 12, color: "#7c89bf", marginLeft: "auto" }}>
          🤖 {availableModels.length} model khả dụng
        </span>
      )}
    </div>
  );
}

const dateInputStyle: React.CSSProperties = {
  padding: "5px 8px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.04)",
  color: "#e8edff",
  fontSize: 13,
  fontFamily: "Arial, sans-serif",
  outline: "none",
  colorScheme: "dark",
};

/* ========== Main orchestration component ========== */

/**
 * Client shell that orchestrates the entire AI Analytics Dashboard.
 *
 * Lifecycle:
 *   Mount → loading → fetchAiAnalyticsDashboard(filters) → ready | empty | error
 *   Filter change → re-fetch (debounce handled by React batched update)
 *   Error → retry button clears error + re-fetches
 */
export function AnalyticsClientShell() {
  const [phase, setPhase] = useState<ShellPhase>("loading");
  const [data, setData] = useState<AiAnalyticsDashboardData | null>(null);
  const [filters, setFilters] = useState<AiAnalyticsFilters>(defaultFilters);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [renderCycle, setRenderCycle] = useState(0);

  /* ---- Track available model keys from fetched data ---- */
  const availableModels = useMemo(() => {
    const models = new Set<string>();

    // Collect from cost trend byModel
    if (data?.costTrend) {
      for (const point of data.costTrend) {
        for (const modelKey of Object.keys(point.byModel)) {
          models.add(modelKey);
        }
      }
    }

    // Collect from model efficiency
    if (data?.modelEfficiency?.models) {
      for (const m of data.modelEfficiency.models) {
        models.add(m.modelKey);
      }
    }

    return [...models].sort();
  }, [data]);

  /* ---- Fetch data ---- */
  const loadData = useCallback(async () => {
    setPhase("loading");
    setErrorMessage("");

    try {
      const result = await fetchAiAnalyticsDashboard(filters);

      // Safety: drop stale responses if too many re-renders happened
      setRenderCycle((c) => c + 1);
      if (renderCycle > MAX_RENDER_CYCLE) {
        setPhase("error");
        setErrorMessage("Phát hiện vòng lặp render bất thường. Vui lòng thử lại sau.");
        return;
      }

      if (!result) {
        setPhase("empty");
        setData(null);
        return;
      }

      const isEmpty =
        result.scorecard.totalCost === 0 &&
        result.costTrend.length === 0 &&
        (result.modelEfficiency?.models?.length ?? 0) === 0;

      if (isEmpty) {
        setPhase("empty");
        setData(result);
      } else {
        setPhase("ready");
        setData(result);
      }
    } catch (err) {
      setPhase("error");
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Lỗi kết nối mạng. Vui lòng kiểm tra kết nối và thử lại.",
      );
    }
  }, [filters, renderCycle]);

  /* ---- Initial load + reload on filter change ---- */
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  /* ---- Re-filter when chart model chips change ---- */
  const handleFilterChange = useCallback(
    (next: AiAnalyticsFilters) => {
      setFilters(next);
    },
    [],
  );

  /* ---- Model click: filter chart to show only that model ---- */
  const handleModelClick = useCallback(
    (modelKey: string) => {
      setFilters((prev) => {
        // If already the only selected model, clear the filter
        if (
          prev.selectedModels.length === 1 &&
          prev.selectedModels[0] === modelKey
        ) {
          return { ...prev, selectedModels: [] };
        }
        return { ...prev, selectedModels: [modelKey] };
      });
    },
    [],
  );

  /* ---- Retry handler ---- */
  const handleRetry = useCallback(() => {
    setRenderCycle(0);
    loadData();
  }, [loadData]);

  /* ========== Render ========== */

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* ---- Filter bar (always visible except on error) ---- */}
      {phase !== "error" && (
        <AnalyticsFilterBar
          filters={filters}
          availableModels={availableModels}
          onFiltersChange={handleFilterChange}
        />
      )}

      {/* ---- Phase-based body ---- */}
      {phase === "loading" && <LoadingSkeleton />}

      {phase === "error" && (
        <ErrorState message={errorMessage} onRetry={handleRetry} />
      )}

      {phase === "empty" && <EmptyState />}

      {phase === "ready" && data && (
        <>
          {/* Zone 1 — Scorecard */}
          <AnalyticsScorecards
            scorecard={data.scorecard}
            periodLabel={`${new Date(filters.startDate).toLocaleDateString("vi-VN", { day: "2-digit", month: "long" })} – ${new Date(filters.endDate).toLocaleDateString("vi-VN", { day: "2-digit", month: "long", year: "numeric" })}`}
          />

          {/* Zone 2 — Cost & Token Charts */}
          <CostTrendCharts
            data={data.costTrend}
            availableModels={availableModels}
            selectedModels={filters.selectedModels}
            onModelsChange={(models) =>
              setFilters((prev) => ({ ...prev, selectedModels: models }))
            }
          />

          {/* Zone 3 — Model Efficiency Matrix */}
          <ModelEfficiencyMatrix
            data={data.modelEfficiency}
            onModelClick={handleModelClick}
          />
        </>
      )}

      {/* ---- Generated-at timestamp in footer ---- */}
      {phase === "ready" && data?.generatedAt && (
        <div
          style={{
            textAlign: "right",
            fontSize: 12,
            color: "#5d6a99",
            marginTop: -8,
          }}
        >
          Dữ liệu cập nhật lần cuối:{" "}
          {new Date(data.generatedAt).toLocaleString("vi-VN")}
        </div>
      )}
    </div>
  );
}
