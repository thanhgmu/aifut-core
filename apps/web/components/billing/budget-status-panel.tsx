"use client";

// ============================================================
// components/billing/budget-status-panel.tsx
// Khối hiển thị 3 trạng thái ACTIVE / SOFT_LOCKED / HARD_LOCKED
// cho Hệ thống Hạn mức Chi phí AI (Budget Caps).
//
// Hiển thị:
//   • Header period + trạng thái (pill màu)
//   • Progress Bar mức tiêu thụ lũy kế (phần trăm)
//   • Số tiền đã tiêu / hạn mức tối đa
//   • Alert threshold indicator
//   • Nút Emergency Unlock (chỉ khi bị khoá)
//   • Thời gian period (periodStart → periodEnd)
//
// Pattern: Inline styles (React.CSSProperties) — nhất quán
// với các component billing hiện hữu trong codebase.
// ============================================================

import type { CSSProperties } from "react";
import { useState } from "react";
import type { BudgetLimit, BudgetPeriod, BudgetStatus } from "../../types/budget";
import {
  BUDGET_PERIOD_LABELS,
  BUDGET_STATUS_LABELS,
  BUDGET_STATUS_COLORS,
} from "../../types/budget";
import {
  formatVNDFromString,
  displayThresholdPercent,
  emergencyUnlockBudget,
} from "../../lib/budget";

// ─────────────────────────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────────────────────────

interface BudgetStatusPanelProps {
  /** Limit data cho 1 period */
  limit: BudgetLimit;
  /** Callback sau khi unlock thành công → refresh parent */
  onUnlocked: (period: BudgetPeriod) => void;
  /** Callback khi có lỗi unlock */
  onError: (message: string) => void;
  /** Disable nút unlock khi đang xử lý */
  disableActions?: boolean;
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export function BudgetStatusPanel({
  limit,
  onUnlocked,
  onError,
  disableActions = false,
}: BudgetStatusPanelProps) {
  const [unlocking, setUnlocking] = useState(false);

  const isLocked =
    limit.status === "SOFT_LOCKED" || limit.status === "HARD_LOCKED";
  const usagePercent = Math.min(limit.usagePercent, 100);

  /** Màu Progress Bar: xanh → cam → đỏ dần theo % */
  function barColor(pct: number): string {
    if (pct >= 90) return "#ff6b6b";
    if (pct >= 75) return "#ff8c42";
    if (pct >= 60) return "#ffb366";
    if (pct >= 40) return "#ffd93d";
    return "#80e0a0";
  }

  async function handleEmergencyUnlock() {
    if (unlocking || disableActions) return;
    setUnlocking(true);
    try {
      const result = await emergencyUnlockBudget(limit.period);
      if (result) {
        onUnlocked(limit.period);
      } else {
        onError("Không thể unlock budget. Vui lòng thử lại.");
      }
    } catch (err) {
      onError(
        err instanceof Error ? err.message : "Lỗi kết nối khi unlock budget.",
      );
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <section style={panelWrapper(limit.status)}>
      {/* ─── Row 1: Period label + Status pill ─── */}
      <div style={headerRow}>
        <div style={periodLabel}>
          {BUDGET_PERIOD_LABELS[limit.period]}
        </div>
        <StatusPill status={limit.status} />
      </div>

      {/* ─── Row 2: Progress bar + percentages ─── */}
      <div style={progressArea}>
        <div style={progressBarContainer}>
          <div
            style={progressBarFill(usagePercent, barColor(usagePercent))}
            role="progressbar"
            aria-valuenow={usagePercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Đã sử dụng ${usagePercent.toFixed(1)}% hạn mức`}
          />
          {/* Vạch alert threshold indicator */}
          <div
            style={thresholdIndicator(limit.alertThreshold)}
            title={`Ngưỡng cảnh báo: ${displayThresholdPercent(limit.alertThreshold)}`}
          />
        </div>

        {/* Con số % */}
        <div style={percentRow}>
          <span style={percentText(usagePercent)}>
            {usagePercent.toFixed(1)}%
          </span>
          <span style={thresholdLabel}>
            Ngưỡng: {displayThresholdPercent(limit.alertThreshold)}
          </span>
        </div>
      </div>

      {/* ─── Row 3: Số tiền đã tiêu / Hạn mức ─── */}
      <div style={amountRow}>
        <div style={amountItem}>
          <span style={amountLabel}>Đã tiêu</span>
          <span style={spentValue(usagePercent)}>
            {formatVNDFromString(limit.currentCostSpent)}
          </span>
        </div>
        <div style={amountDivider}>/</div>
        <div style={amountItem}>
          <span style={amountLabel}>Hạn mức</span>
          <span style={limitValue}>
            {formatVNDFromString(limit.maxCostAmount)}
          </span>
        </div>
      </div>

      {/* ─── Row 4: Period window ─── */}
      <div style={periodWindowRow}>
        <span style={periodWindowIcon}>📅</span>
        <span style={periodWindowText}>
          {formatDate(limit.periodStart)} → {formatDate(limit.periodEnd)}
        </span>
      </div>

      {/* ─── Row 5: Emergency Unlock (chỉ hiện khi bị khoá) ─── */}
      {isLocked && (
        <div style={actionRow}>
          <button
            onClick={handleEmergencyUnlock}
            disabled={unlocking || disableActions}
            style={unlockBtn(unlocking)}
            type="button"
          >
            {unlocking ? "🔄 Đang mở khoá…" : "🚨 Mở khoá khẩn cấp"}
          </button>
          <span style={lockHint}>
            {limit.status === "SOFT_LOCKED"
              ? "Đã vượt ngưỡng cảnh báo — AI request mới không ưu tiên bị chặn"
              : "Đã vượt hạn mức tối đa — mọi request AI bị chặn hoàn toàn"}
          </span>
        </div>
      )}

      {/* ─── Row 6: Timestamps ─── */}
      <div style={timestampRow}>
        {limit.lastResetAt && (
          <TimestampBadge
            label="Reset lần cuối"
            value={limit.lastResetAt}
          />
        )}
        {limit.softLockedAt && (
          <TimestampBadge
            label="Soft-lock"
            value={limit.softLockedAt}
          />
        )}
        {limit.hardLockedAt && (
          <TimestampBadge
            label="Hard-lock"
            value={limit.hardLockedAt}
          />
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: BudgetStatus }) {
  const color = BUDGET_STATUS_COLORS[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 12px",
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 700,
        background: `${color}18`,
        border: `1px solid ${color}40`,
        color,
        letterSpacing: 0.3,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          display: "inline-block",
        }}
      />
      {BUDGET_STATUS_LABELS[status]}
    </span>
  );
}

function TimestampBadge({ label, value }: { label: string; value: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        color: "#7a86b8",
        background: "rgba(255,255,255,0.03)",
        padding: "3px 10px",
        borderRadius: 6,
        whiteSpace: "nowrap",
      }}
    >
      {label}: {formatDate(value)}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ─────────────────────────────────────────────────────────────
// INLINE STYLES
// ─────────────────────────────────────────────────────────────

const panelWrapper = (status: BudgetStatus): CSSProperties => {
  const borderColor =
    status === "HARD_LOCKED"
      ? "rgba(255,80,80,0.25)"
      : status === "SOFT_LOCKED"
        ? "rgba(255,180,100,0.25)"
        : "rgba(128,224,160,0.15)";
  const bgTint =
    status === "HARD_LOCKED"
      ? "rgba(255,80,80,0.04)"
      : status === "SOFT_LOCKED"
        ? "rgba(255,180,100,0.04)"
        : "transparent";

  return {
    background: bgTint,
    border: `1px solid ${borderColor}`,
    borderRadius: 16,
    padding: "20px 24px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  };
};

const headerRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const periodLabel: CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  color: "#f5f7ff",
};

const progressArea: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const progressBarContainer: CSSProperties = {
  position: "relative",
  height: 12,
  borderRadius: 6,
  background: "rgba(255,255,255,0.08)",
  overflow: "hidden",
};

const progressBarFill = (percent: number, color: string): CSSProperties => ({
  width: `${Math.max(percent, 2)}%`,
  height: "100%",
  borderRadius: 6,
  background: color,
  transition: "width 0.4s ease, background 0.3s ease",
});

const thresholdIndicator = (threshold: number): CSSProperties => ({
  position: "absolute",
  top: 0,
  left: `${threshold * 100}%`,
  width: 3,
  height: "100%",
  background: "rgba(255,255,255,0.5)",
  borderRadius: 2,
  transform: "translateX(-50%)",
  pointerEvents: "none",
  zIndex: 1,
});

const percentRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const percentText = (percent: number): CSSProperties => ({
  fontSize: 24,
  fontWeight: 800,
  color: percent >= 80 ? "#ff6b6b" : percent >= 60 ? "#ffb366" : "#80e0a0",
});

const thresholdLabel: CSSProperties = {
  fontSize: 12,
  color: "#9fb0ff",
};

const amountRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
};

const amountItem: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const amountLabel: CSSProperties = {
  fontSize: 11,
  color: "#9fb0ff",
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const spentValue = (percent: number): CSSProperties => ({
  fontSize: 20,
  fontWeight: 700,
  color: percent >= 80 ? "#ff6b6b" : "#f5f7ff",
});

const limitValue: CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  color: "#c8d2ff",
};

const amountDivider: CSSProperties = {
  fontSize: 20,
  color: "#4a5a8a",
  fontWeight: 300,
  paddingBottom: 2,
};

const periodWindowRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const periodWindowIcon: CSSProperties = {
  fontSize: 14,
};

const periodWindowText: CSSProperties = {
  fontSize: 13,
  color: "#7a86b8",
};

const actionRow: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  paddingTop: 4,
  borderTop: "1px solid rgba(255,255,255,0.06)",
};

const unlockBtn = (loading: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "10px 20px",
  borderRadius: 10,
  border: "1px solid rgba(255,107,107,0.3)",
  background: loading ? "rgba(255,107,107,0.1)" : "rgba(255,107,107,0.12)",
  color: "#ff6b6b",
  fontWeight: 700,
  fontSize: 14,
  cursor: loading ? "not-allowed" : "pointer",
  transition: "background 0.2s",
  width: "fit-content",
});

const lockHint: CSSProperties = {
  fontSize: 12,
  color: "#9fb0ff",
  lineHeight: 1.4,
};

const timestampRow: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  paddingTop: 4,
  borderTop: "1px solid rgba(255,255,255,0.04)",
};
