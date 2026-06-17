"use client";

// ─────────────────────────────────────────────────────────────
// current-plan-widget.tsx — Khối hiển thị tiến trình sử dụng
// tài nguyên trực quan của gói hiện tại (Khu vực 3).
// Phase 3 · Frontend apps/web · Inline styles (React.CSSProperties)
// ─────────────────────────────────────────────────────────────

import type { CSSProperties } from "react";
import type {
  CurrentSubscriptionInfo,
  CurrentUsageStats,
  SubscriptionStatusUI,
} from "../../types/subscription";
import {
  formatBillingDate,
  daysUntil,
  subscriptionStatusColor,
  formatVND,
} from "../../lib/subscription";

interface CurrentPlanWidgetProps {
  subscription: CurrentSubscriptionInfo;
  usage: CurrentUsageStats;
  planName: string;
  onChangePlan: () => void;
  onCancelPlan: () => Promise<void>;
}

/** Widget header hiển thị gói cước hiện tại + hạn + usage progress bars */
export function CurrentPlanWidget({
  subscription,
  usage,
  planName,
  onChangePlan,
  onCancelPlan,
}: CurrentPlanWidgetProps) {
  const daysLeft = daysUntil(subscription.expiresAt);
  const isExpiring = daysLeft !== null && daysLeft <= 7;
  const isCancelled = subscription.status === "cancelled";
  const isTrialing = subscription.status === "trialing";

  return (
    <section style={wrapper}>
      {/* ─── Row 1: Plan info + Expiry ─── */}
      <div style={row1}>
        {/* Left: plan name + status + price */}
        <div style={planInfoBlock}>
          <div style={planNameRow}>
            <span style={planNameText}>{planName}</span>
            <StatusPill status={subscription.status} />
          </div>

          {/* Price display */}
          <div style={priceRow}>
            <span style={priceLabel}>Giá hiện tại:</span>
            <span style={priceValue}>
              {subscription.planKey === "free" ? "Miễn phí" : "Theo gói"}
            </span>
          </div>

          {/* Auto-renew or cancelled indicator */}
          <div style={renewRow}>
            {isCancelled ? (
              <span style={{ color: "#ff6b6b", fontSize: 13 }}>
                ✕ Đã hủy — gói sẽ hết hạn vào {formatBillingDate(subscription.expiresAt)}
              </span>
            ) : subscription.autoRenew ? (
              <span style={{ color: "#80e0a0", fontSize: 13 }}>
                🔄 Tự động gia hạn
              </span>
            ) : (
              <span style={{ color: "#ffb366", fontSize: 13 }}>
                ⚠️ Gia hạn thủ công
              </span>
            )}
          </div>

          {isTrialing && subscription.trialEndsAt && (
            <div style={trialNote}>
              🎉 Dùng thử đến {formatBillingDate(subscription.trialEndsAt)}
            </div>
          )}
        </div>

        {/* Right: expiry + days remaining */}
        <div style={expiryBlock}>
          <div style={expiryLabel}>Hết hạn</div>
          <div style={expiryDate}>
            {formatBillingDate(subscription.expiresAt)}
          </div>
          {daysLeft !== null && (
            <div
              style={{
                ...daysBadge,
                background: isExpiring
                  ? "rgba(255,107,107,0.12)"
                  : "rgba(109,124,255,0.12)",
                color: isExpiring ? "#ff6b6b" : "#9fb0ff",
              }}
            >
              còn {daysLeft} ngày
            </div>
          )}
        </div>
      </div>

      {/* ─── Row 2: Usage meters ─── */}
      <div style={usageSection}>
        <div style={usageTitle}>SỬ DỤNG TÀI NGUYÊN TRONG KỲ</div>

        <UsageBar
          icon="🤖"
          label="AI Calls"
          used={usage.aiCallsUsed}
          limit={usage.aiCallsLimit}
          percent={usage.aiCallsPercent}
          note={usage.aiCallsPercent > 80 ? "Billable" : undefined}
        />

        <UsageBar
          icon="💾"
          label="Lưu trữ"
          used={usage.storageUsedGB}
          limit={usage.storageLimitGB}
          percent={usage.storagePercent}
          unit="GB"
          note={usage.storagePercent > 80 ? "Cảnh báo" : undefined}
        />

        <UsageBar
          icon="⚡"
          label="Workflows Active"
          used={usage.activeWorkflows}
          limit={usage.workflowLimit}
          percent={usage.workflowPercent}
          unlimited={usage.workflowLimit < 0}
          note={usage.workflowLimit < 0 ? "Không giới hạn" : undefined}
        />
      </div>

      {/* ─── Row 3: Action buttons ─── */}
      <div style={actionRow}>
        <button onClick={onChangePlan} style={changePlanBtn}>
          🔄 Đổi gói cước
        </button>
        {subscription.planKey !== "free" && (
          <button onClick={onCancelPlan} style={cancelBtn}>
            ✕ Hủy gói cước
          </button>
        )}
      </div>
    </section>
  );
}

// ─── Sub-components ──────────────────────────────

function StatusPill({ status }: { status: SubscriptionStatusUI }) {
  const color = subscriptionStatusColor(status);
  return (
    <span
      style={{
        padding: "4px 12px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        textTransform: "capitalize" as const,
        color,
        background: `${color}1a`,
        border: `1px solid ${color}40`,
      }}
    >
      {status}
    </span>
  );
}

interface UsageBarProps {
  icon: string;
  label: string;
  used: number;
  limit: number;
  percent: number;
  unit?: string;
  unlimited?: boolean;
  note?: string;
}

function UsageBar({ icon, label, used, limit, percent, unit, unlimited, note }: UsageBarProps) {
  const barColor =
    percent > 80 ? "#ff6b6b" : percent > 60 ? "#ffb366" : "#6d7cff";
  const displayLimit = unlimited ? "∞" : unit ? `${limit} ${unit}` : String(limit);
  const displayUsed = unlimited ? "—" : unit ? `${used} ${unit}` : String(used);

  return (
    <div style={usageBarWrapper}>
      <div style={usageBarHeader}>
        <span>
          {icon} {label}
        </span>
        <span style={usageBarCount}>
          {unlimited ? "∞" : `${used.toLocaleString()}`} / {displayLimit}
        </span>
      </div>

      <div style={barTrack}>
        <div
          style={{
            ...barFill,
            width: unlimited ? "0%" : `${Math.min(percent, 100)}%`,
            background: barColor,
          }}
        />
      </div>

      <div style={usageBarFooter}>
        <span style={{ color: "#9fb0ff", fontSize: 12 }}>
          {unlimited ? "0%" : `${percent}%`}
        </span>
        {note && (
          <span
            style={{
              fontSize: 12,
              color:
                note === "Billable"
                  ? "#ffb366"
                  : note === "Cảnh báo"
                    ? "#ff6b6b"
                    : "#9fb0ff",
              fontWeight: 600,
            }}
          >
            ({note})
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Style constants ──────────────────────────────

const wrapper: CSSProperties = {
  padding: 24,
  borderRadius: 20,
  background:
    "linear-gradient(135deg, rgba(109,124,255,0.1), rgba(109,124,255,0.03))",
  border: "1px solid rgba(109,124,255,0.2)",
  fontFamily: "Arial, sans-serif",
};

const row1: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
  marginBottom: 24,
};

const planInfoBlock: CSSProperties = {
  flex: 1,
  minWidth: 200,
};

const planNameRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 8,
};

const planNameText: CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
};

const priceRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 4,
};

const priceLabel: CSSProperties = {
  fontSize: 13,
  color: "#9fb0ff",
};

const priceValue: CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: "#c8d2ff",
};

const renewRow: CSSProperties = {
  marginTop: 4,
};

const trialNote: CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  color: "#ffb366",
  fontWeight: 600,
};

const expiryBlock: CSSProperties = {
  textAlign: "right" as const,
  padding: "12px 16px",
  borderRadius: 14,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  minWidth: 160,
};

const expiryLabel: CSSProperties = {
  fontSize: 11,
  color: "#9fb0ff",
  textTransform: "uppercase",
  letterSpacing: 1,
  marginBottom: 4,
};

const expiryDate: CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  marginBottom: 6,
};

const daysBadge: CSSProperties = {
  display: "inline-block",
  padding: "3px 10px",
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 700,
};

const usageSection: CSSProperties = {
  marginBottom: 20,
};

const usageTitle: CSSProperties = {
  fontSize: 11,
  color: "#9fb0ff",
  letterSpacing: 1,
  fontWeight: 700,
  textTransform: "uppercase",
  marginBottom: 16,
};

const usageBarWrapper: CSSProperties = {
  marginBottom: 16,
};

const usageBarHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 8,
};

const usageBarCount: CSSProperties = {
  color: "#c8d2ff",
  fontSize: 13,
  fontWeight: 400,
};

const barTrack: CSSProperties = {
  height: 8,
  borderRadius: 4,
  background: "rgba(255,255,255,0.06)",
  overflow: "hidden",
};

const barFill: CSSProperties = {
  height: "100%",
  borderRadius: 4,
  transition: "width 0.5s ease",
};

const usageBarFooter: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  marginTop: 6,
};

const actionRow: CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
};

const changePlanBtn: CSSProperties = {
  padding: "12px 20px",
  borderRadius: 12,
  border: "none",
  background: "#6d7cff",
  color: "white",
  fontWeight: 700,
  fontSize: 15,
  cursor: "pointer",
  fontFamily: "Arial, sans-serif",
};

const cancelBtn: CSSProperties = {
  padding: "12px 20px",
  borderRadius: 12,
  border: "1px solid rgba(255,107,107,0.3)",
  background: "rgba(255,107,107,0.08)",
  color: "#ff6b6b",
  fontWeight: 700,
  fontSize: 15,
  cursor: "pointer",
  fontFamily: "Arial, sans-serif",
};
