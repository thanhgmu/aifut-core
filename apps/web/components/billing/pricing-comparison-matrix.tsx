"use client";

// ─────────────────────────────────────────────────────────────
// pricing-comparison-matrix.tsx — Thẻ so sánh 4 gói cước
// lấy từ PLAN_DEFINITIONS (Khu vực 1).
// Phase 3 · Frontend apps/web · Inline styles (React.CSSProperties)
// ─────────────────────────────────────────────────────────────

import { useState, useMemo } from "react";
import type { CSSProperties } from "react";
import type {
  PlanColumnView,
  BillingCycle,
  ResourceLimitDisplay,
} from "../../types/subscription";

interface PricingComparisonMatrixProps {
  plans: PlanColumnView[];
  currentPlanKey: string | null;
  /** Callback khi user click upgrade/downgrade */
  onPlanAction: (planKey: string, cycle: BillingCycle) => void;
  /** Đang xử lý plan nào? (pending) */
  pendingKey: string | null;
}

/** Bảng so sánh gói cước 4 cột — khu vực hiển thị số 1 */
export function PricingComparisonMatrix({
  plans,
  currentPlanKey,
  onPlanAction,
  pendingKey,
}: PricingComparisonMatrixProps) {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const sortedPlans = useMemo(
    () => [...plans].sort((a, b) => a.sortOrder - b.sortOrder),
    [plans],
  );

  if (sortedPlans.length === 0) return null;

  return (
    <section>
      {/* ─── Section header + cycle toggle ─── */}
      <div style={sectionHeader}>
        <div style={sectionTitle}>💳 Chọn gói cước</div>
        <CycleToggle cycle={cycle} onChange={setCycle} />
      </div>

      {/* ─── 4-column grid ─── */}
      <div style={gridStyle}>
        {sortedPlans.map((plan) => (
          <PlanColumn
            key={plan.key}
            plan={plan}
            cycle={cycle}
            pending={pendingKey === plan.key}
            isCurrent={plan.key === currentPlanKey}
            onAction={onPlanAction}
          />
        ))}
      </div>
    </section>
  );
}

// ─── Sub-components ──────────────────────────────

function CycleToggle({
  cycle,
  onChange,
}: {
  cycle: BillingCycle;
  onChange: (c: BillingCycle) => void;
}) {
  const monthlyActive = cycle === "monthly";
  return (
    <div style={toggleWrapper}>
      <button
        style={{ ...toggleBtn, ...(monthlyActive ? toggleActive : {}) }}
        onClick={() => onChange("monthly")}
      >
        Trả theo tháng
      </button>
      <button
        style={{ ...toggleBtn, ...(!monthlyActive ? toggleActive : {}) }}
        onClick={() => onChange("yearly")}
      >
        Trả theo năm
      </button>
    </div>
  );
}

function PlanColumn({
  plan,
  cycle,
  pending,
  isCurrent,
  onAction,
}: {
  plan: PlanColumnView;
  cycle: BillingCycle;
  pending: boolean;
  isCurrent: boolean;
  onAction: (planKey: string, cycle: BillingCycle) => void;
}) {
  const priceDisplay =
    cycle === "yearly" && plan.yearlyPrice > 0
      ? plan.yearlyPriceDisplay
      : plan.monthlyPriceDisplay;
  const periodLabel =
    cycle === "yearly" && plan.yearlyPrice > 0 ? "/năm" : "/tháng";
  const isPaid = plan.monthlyPrice > 0;

  // CTA
  let ctaDisabled = false;
  let ctaLabel = plan.ctaLabel;
  if (isCurrent) {
    ctaDisabled = true;
    ctaLabel = "Gói hiện tại";
  } else if (pending) {
    ctaDisabled = true;
    ctaLabel = "Đang xử lý…";
  } else if (plan.ctaType === "contact") {
    ctaLabel = "Liên hệ";
  }

  const handleClick = () => {
    if (!ctaDisabled && plan.ctaType !== "contact") {
      onAction(plan.key, cycle);
    }
    if (plan.ctaType === "contact") {
      window.open("mailto:sales@aifut.com", "_blank");
    }
  };

  const columnBg: CSSProperties = plan.highlighted
    ? {
        background:
          "linear-gradient(180deg, rgba(109,124,255,0.12), rgba(109,124,255,0.03))",
      }
    : { background: "rgba(255,255,255,0.04)" };

  return (
    <div
      style={{
        ...columnStyle,
        ...columnBg,
        border: plan.highlighted
          ? "2px solid rgba(109,124,255,0.5)"
          : "1px solid rgba(255,255,255,0.08)",
        position: "relative" as const,
      }}
    >
      {/* Tag badge */}
      {plan.tag && <div style={tagBadge}>{plan.tag}</div>}

      {/* Plan name + description */}
      <div style={planNameStyle}>{plan.name}</div>
      {plan.description && (
        <div style={planDescStyle}>{plan.description}</div>
      )}

      {/* Price */}
      <div style={priceRowStyle}>
        <span style={priceValueStyle}>
          {plan.monthlyPrice === 0 ? "Miễn phí" : priceDisplay}
        </span>
        {isPaid && plan.monthlyPrice > 0 && (
          <span style={periodStyle}>{periodLabel}</span>
        )}
      </div>

      {/* Trial badge */}
      {plan.trialDays > 0 && !isCurrent && (
        <div style={trialBadge}>Dùng thử {plan.trialDays} ngày</div>
      )}

      {/* Yearly discount */}
      {cycle === "yearly" && plan.yearlyDiscountPercent > 0 && (
        <div style={discountBadge}>
          Tiết kiệm {plan.yearlyDiscountPercent}%
        </div>
      )}

      {/* CTA button */}
      <button
        style={{
          ...ctaBtnStyle,
          ...(isCurrent ? ctaCurrentStyle : {}),
          ...(pending ? ctaPendingStyle : {}),
          ...(plan.ctaType === "contact" ? ctaContactStyle : {}),
        }}
        onClick={handleClick}
        disabled={ctaDisabled}
      >
        {ctaLabel}
      </button>

      {/* Resource limits section */}
      <div style={limitsSectionStyle}>
        <div style={limitsHeaderStyle}>Hạn mức tài nguyên</div>
        {plan.limits.map((limit) => (
          <LimitRow key={limit.key} limit={limit} />
        ))}
      </div>

      {/* Feature flags section */}
      <div style={featuresSectionStyle}>
        <div style={limitsHeaderStyle}>Tính năng</div>
        {plan.features.map((feature) => (
          <FeatureRow key={feature.key} included={feature.value} label={feature.key} />
        ))}
      </div>
    </div>
  );
}

function LimitRow({ limit }: { limit: ResourceLimitDisplay }) {
  return (
    <div style={limitRowStyle}>
      <span style={limitIconStyle}>{limit.icon}</span>
      <span style={limitLabelStyle}>{limit.label}</span>
      <span style={limitValueStyle(limit.unlimited)}>
        {limit.displayValue}
      </span>
    </div>
  );
}

function FeatureRow({ included, label }: { included: boolean; label: string }) {
  return (
    <div style={featureRowStyle}>
      <span
        style={{
          color: included ? "#80e0a0" : "#5a6488",
          fontWeight: included ? 700 : 400,
        }}
      >
        {included ? "✓" : "—"}
      </span>
      <span
        style={{
          color: included ? "#c8d2ff" : "#5a6488",
          fontSize: 13,
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ─── Style constants ──────────────────────────────

const sectionHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 24,
  flexWrap: "wrap",
  gap: 12,
};

const sectionTitle: CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
};

const toggleWrapper: CSSProperties = {
  display: "flex",
  background: "rgba(255,255,255,0.05)",
  borderRadius: 10,
  padding: 3,
};

const toggleBtn: CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "none",
  background: "transparent",
  color: "#9fb0ff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "Arial, sans-serif",
};

const toggleActive: CSSProperties = {
  background: "rgba(109,124,255,0.2)",
  color: "#f5f7ff",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: 16,
  alignItems: "stretch",
};

const columnStyle: CSSProperties = {
  borderRadius: 20,
  padding: "28px 20px",
  display: "flex",
  flexDirection: "column",
};

const tagBadge: CSSProperties = {
  position: "absolute",
  top: -10,
  left: "50%",
  transform: "translateX(-50%)",
  background: "#6d7cff",
  color: "white",
  padding: "3px 14px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 1,
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

const planNameStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  marginBottom: 6,
};

const planDescStyle: CSSProperties = {
  fontSize: 13,
  color: "#c8d2ff",
  marginBottom: 14,
  lineHeight: 1.6,
};

const priceRowStyle: CSSProperties = {
  margin: "16px 0 8px",
};

const priceValueStyle: CSSProperties = {
  fontSize: 32,
  fontWeight: 800,
};

const periodStyle: CSSProperties = {
  fontSize: 14,
  color: "#9fb0ff",
  fontWeight: 400,
  marginLeft: 4,
};

const trialBadge: CSSProperties = {
  fontSize: 12,
  color: "#ffb366",
  background: "rgba(255,179,102,0.1)",
  padding: "4px 10px",
  borderRadius: 6,
  display: "inline-block",
  marginBottom: 10,
};

const discountBadge: CSSProperties = {
  fontSize: 12,
  color: "#80e0a0",
  background: "rgba(128,224,160,0.1)",
  padding: "4px 10px",
  borderRadius: 6,
  display: "inline-block",
  marginBottom: 10,
};

const ctaBtnStyle: CSSProperties = {
  width: "100%",
  padding: "14px",
  borderRadius: 12,
  border: "none",
  background: "#6d7cff",
  color: "white",
  fontWeight: 700,
  fontSize: 15,
  cursor: "pointer",
  fontFamily: "Arial, sans-serif",
  marginBottom: 20,
};

const ctaCurrentStyle: CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  color: "#9fb0ff",
  cursor: "default",
};

const ctaPendingStyle: CSSProperties = {
  opacity: 0.7,
  cursor: "wait",
};

const ctaContactStyle: CSSProperties = {
  background: "rgba(255,255,255,0.1)",
  color: "#f5f7ff",
};

const limitsSectionStyle: CSSProperties = {
  marginBottom: 16,
};

const limitsHeaderStyle: CSSProperties = {
  fontSize: 11,
  color: "#9fb0ff",
  textTransform: "uppercase",
  letterSpacing: 1,
  fontWeight: 700,
  marginBottom: 12,
};

const limitRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 0",
  fontSize: 13,
};

const limitIconStyle: CSSProperties = {
  width: 18,
  textAlign: "center",
  fontSize: 14,
};

const limitLabelStyle: CSSProperties = {
  color: "#c8d2ff",
  flex: 1,
};

const limitValueStyle = (unlimited: boolean): CSSProperties => ({
  fontWeight: 700,
  color: unlimited ? "#9fb0ff" : "#f5f7ff",
});

const featuresSectionStyle: CSSProperties = {
  borderTop: "1px solid rgba(255,255,255,0.06)",
  paddingTop: 14,
};

const featureRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "5px 0",
};
