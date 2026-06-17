"use client";

// ─────────────────────────────────────────────────────────────
// subscription-client-shell.tsx — Shell orchestration quản lý
// loading/ready/empty/error states cho route /billing/subscription.
// Phase 3 · Frontend apps/web · Inline styles (React.CSSProperties)
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from "react";
import type { CSSProperties } from "react";
import type {
  CurrentSubscriptionInfo,
  CurrentUsageStats,
  PlanColumnView,
} from "../../types/subscription";
import {
  fetchSubscriptionCurrent,
  fetchSubscriptionPlans,
  cancelSubscription,
  buildPlanColumns,
  formatBillingDate,
} from "../../lib/subscription";
import { CurrentPlanWidget } from "./current-plan-widget";
import { PricingComparisonMatrix } from "./pricing-comparison-matrix";
import { UpgradePreviewModal } from "./upgrade-preview-modal";

// ─── Load state type ──────────────────────────────

type LoadPhase = "loading" | "ready" | "empty" | "error";

/** Data shape cho toàn bộ subscription dashboard */
interface SubscriptionDashboardData {
  subscription: CurrentSubscriptionInfo;
  usage: CurrentUsageStats;
  planColumns: PlanColumnView[];
}

/** Inline shimmer block matching wallet-client-shell pattern */
function ShimmerBlock() {
  return (
    <div
      style={{
        padding: 24,
        borderRadius: 20,
        background:
          "linear-gradient(135deg, rgba(109,124,255,0.08), rgba(109,124,255,0.02))",
        border: "1px solid rgba(109,124,255,0.12)",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          width: "30%",
          height: 12,
          borderRadius: 4,
          background:
            "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.5s infinite",
          marginBottom: 18,
        }}
      />
      <div
        style={{
          width: "45%",
          height: 36,
          borderRadius: 6,
          background:
            "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.04) 75%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.5s infinite",
          marginBottom: 12,
        }}
      />
      <div
        style={{
          width: "60%",
          height: 14,
          borderRadius: 4,
          background:
            "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.5s infinite",
        }}
      />
      {/* Usage bars placeholder */}
      <div style={{ marginTop: 20 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <div
              style={{
                width: `${40 + i * 15}%`,
                height: 14,
                borderRadius: 4,
                background:
                  "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)",
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s infinite",
                marginBottom: 8,
              }}
            />
            <div
              style={{
                width: "100%",
                height: 8,
                borderRadius: 4,
                background: "rgba(255,255,255,0.06)",
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Reusable status panel: loading / empty / error */
function PanelMessage({
  tone,
  message,
  onRetry,
}: {
  tone: "muted" | "error" | "empty";
  message: string;
  onRetry?: () => void;
}) {
  const colorMap: Record<string, string> = {
    muted: "#c8d2ff",
    error: "#ff6b6b",
    empty: "#9fb0ff",
  };
  const bgMap: Record<string, string> = {
    muted: "rgba(255,255,255,0.03)",
    error: "rgba(255,107,107,0.08)",
    empty: "rgba(255,255,255,0.02)",
  };
  const borderMap: Record<string, string> = {
    muted: "1px solid rgba(255,255,255,0.06)",
    error: "1px solid rgba(255,107,107,0.2)",
    empty: "1px solid rgba(255,255,255,0.04)",
  };

  return (
    <div
      style={{
        padding: 40,
        borderRadius: 20,
        textAlign: "center",
        color: colorMap[tone],
        background: bgMap[tone],
        border: borderMap[tone],
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ fontSize: 16, marginBottom: tone === "error" ? 16 : 0 }}>
        {message}
      </div>
      {tone === "error" && onRetry && (
        <button
          type="button"
          style={{
            padding: "10px 24px",
            borderRadius: 10,
            background: "rgba(109,124,255,0.12)",
            color: "#6d7cff",
            fontWeight: 700,
            border: "1px solid rgba(109,124,255,0.25)",
            cursor: "pointer",
            fontSize: 14,
            fontFamily: "Arial, sans-serif",
          }}
          onClick={onRetry}
        >
          Thử lại
        </button>
      )}
    </div>
  );
}

// ─── Main Shell ──────────────────────────────────

export function SubscriptionClientShell() {
  const [phase, setPhase] = useState<LoadPhase>("loading");
  const [data, setData] = useState<SubscriptionDashboardData | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  // Upgrade modal state
  const [modalOpen, setModalOpen] = useState(false);

  // Notice banner (success/error feedback)
  const [notice, setNotice] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const errorRef = useRef<string | null>(null);

  // ─── Load all data ────────────────────────────
  const loadAll = useCallback(async () => {
    setPhase("loading");
    errorRef.current = null;
    setNotice(null);

    try {
      const [currentRes, plansRes] = await Promise.all([
        fetchSubscriptionCurrent(),
        fetchSubscriptionPlans(),
      ]);

      if (!currentRes && !plansRes) {
        setData(null);
        setPhase("empty");
        return;
      }

      const planColumns = buildPlanColumns(
        plansRes?.plans ?? [],
        currentRes?.subscription?.planKey ?? null,
      );

      // If no current subscription, show empty but still allow plan browsing
      if (!currentRes?.subscription) {
        setData({
          subscription: null as unknown as CurrentSubscriptionInfo,
          usage: null as unknown as CurrentUsageStats,
          planColumns,
        });
        setPhase("empty");
        return;
      }

      setData({
        subscription: currentRes.subscription,
        usage: currentRes.usage,
        planColumns,
      });
      setPhase("ready");
    } catch (err) {
      errorRef.current =
        err instanceof Error
          ? err.message
          : "Không thể tải dữ liệu gói cước";
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ─── Change plan handler ──────────────────────
  const handlePlanAction = useCallback(
    (planKey: string) => {
      setPendingKey(planKey);
      setModalOpen(true);
    },
    [],
  );

  // ─── Cancel plan handler ──────────────────────
  const handleCancelPlan = useCallback(async () => {
    if (!data?.subscription?.subscriptionId) return;

    const confirmed = window.confirm(
      "Bạn có chắc muốn hủy gói cước hiện tại? " +
        "Thời gian còn lại sẽ được hoàn tiền về ví.",
    );
    if (!confirmed) return;

    setNotice(null);
    const result = await cancelSubscription(
      data.subscription.subscriptionId,
    );

    if (result.success) {
      setNotice({ ok: true, message: result.message });
      await loadAll();
    } else {
      setNotice({ ok: false, message: result.message });
    }
  }, [data?.subscription?.subscriptionId, loadAll]);

  // ─── After upgrade success ────────────────────
  const handleUpgradeSuccess = useCallback(() => {
    setModalOpen(false);
    setPendingKey(null);
    setNotice({
      ok: true,
      message: "Gói cước đã được nâng cấp thành công!",
    });
    loadAll();
  }, [loadAll]);

  // ─── Render ───────────────────────────────────
  return (
    <div style={{ display: "grid", gap: 28 }}>
      {/* ─── Loading ─── */}
      {phase === "loading" && (
        <div style={{ display: "grid", gap: 22 }}>
          <ShimmerBlock />
          {/* Matrix skeleton */}
          <div
            style={{
              padding: 22,
              borderRadius: 20,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div
              style={{
                width: 140,
                height: 16,
                borderRadius: 4,
                background:
                  "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)",
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s infinite",
                marginBottom: 18,
              }}
            />
            <PanelMessage tone="muted" message="Đang tải dữ liệu gói cước…" />
          </div>
        </div>
      )}

      {/* ─── Error ─── */}
      {phase === "error" && (
        <PanelMessage
          tone="error"
          message={errorRef.current ?? "Không thể tải dữ liệu gói cước"}
          onRetry={loadAll}
        />
      )}

      {/* ─── Empty ─── */}
      {phase === "empty" && (
        <div style={{ display: "grid", gap: 22 }}>
          <PanelMessage
            tone="empty"
            message="Chưa có gói cước đang kích hoạt. Chọn một gói bên dưới để bắt đầu."
          />
          {data?.planColumns && data.planColumns.length > 0 && (
            <PricingComparisonMatrix
              plans={data.planColumns}
              currentPlanKey={null}
              onPlanAction={handlePlanAction}
              pendingKey={pendingKey}
            />
          )}
        </div>
      )}

      {/* ─── Ready ─── */}
      {phase === "ready" && data?.subscription && (
        <>
          {/* Notice banner */}
          {notice && (
            <div
              style={{
                padding: 14,
                borderRadius: 12,
                background: notice.ok
                  ? "rgba(80,200,120,0.1)"
                  : "rgba(255,80,80,0.1)",
                border: `1px solid ${notice.ok ? "rgba(80,200,120,0.2)" : "rgba(255,80,80,0.2)"}`,
                color: notice.ok ? "#b3ffcc" : "#ffb3b3",
                fontSize: 14,
                fontFamily: "Arial, sans-serif",
              }}
            >
              {notice.message}
            </div>
          )}

          {/* Current plan widget (Khu vực 3) */}
          <CurrentPlanWidget
            subscription={data.subscription}
            usage={data.usage}
            planName={data.subscription.planName}
            onChangePlan={() => setModalOpen(true)}
            onCancelPlan={handleCancelPlan}
          />

          {/* Pricing comparison matrix (Khu vực 1) */}
          <PricingComparisonMatrix
            plans={data.planColumns}
            currentPlanKey={data.subscription.planKey}
            onPlanAction={handlePlanAction}
            pendingKey={pendingKey}
          />

          {/* Upgrade preview modal (Khu vực 2) */}
          <UpgradePreviewModal
            open={modalOpen}
            onClose={() => {
              setModalOpen(false);
              setPendingKey(null);
            }}
            onSuccess={handleUpgradeSuccess}
            currentSubscriptionId={data.subscription.subscriptionId}
            currentPlanKey={data.subscription.planKey}
            currentPlanName={data.subscription.planName}
            plans={data.planColumns}
          />
        </>
      )}

      {/* ─── Shimmer animation keyframes ─── */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  );
}

export default SubscriptionClientShell;
