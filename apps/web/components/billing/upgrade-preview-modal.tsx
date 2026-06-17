"use client";

// ─────────────────────────────────────────────────────────────
// upgrade-preview-modal.tsx — Ô cửa sổ xem trước chi phí
// proration triển khai chuẩn State Machine 7 giai đoạn (Khu vực 2).
// Phase 3 · Frontend apps/web · Inline styles (React.CSSProperties)
// ─────────────────────────────────────────────────────────────

import { useState, useCallback, useEffect } from "react";
import type { CSSProperties } from "react";
import type {
  PlanColumnView,
  BillingCycle,
  ProrationPreviewView,
  UpgradeModalPhase,
  UpgradeResult,
} from "../../types/subscription";
import {
  fetchProrationPreview,
  upgradeSubscription,
  formatVND,
  formatBillingDate,
} from "../../lib/subscription";

interface UpgradePreviewModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentSubscriptionId: string;
  currentPlanKey: string;
  currentPlanName: string;
  plans: PlanColumnView[];
}

export function UpgradePreviewModal({
  open,
  onClose,
  onSuccess,
  currentSubscriptionId,
  currentPlanKey,
  currentPlanName,
  plans,
}: UpgradePreviewModalProps) {
  // ─── State machine ──────────────────────────────────
  const [phase, setPhase] = useState<UpgradeModalPhase>("closed");
  const [targetKey, setTargetKey] = useState<string>("");
  const [targetCycle, setTargetCycle] = useState<BillingCycle>("monthly");
  const [proration, setProration] = useState<ProrationPreviewView | null>(null);
  const [result, setResult] = useState<UpgradeResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Reset khi mở modal
  useEffect(() => {
    if (open) {
      setPhase("selecting_plan");
      setTargetKey("");
      setProration(null);
      setResult(null);
      setErrorMsg("");
    } else {
      setPhase("closed");
    }
  }, [open]);

  // ─── Fetch proration ────────────────────────────────
  const handlePreview = useCallback(
    async (planKey: string, cycle: BillingCycle) => {
      setTargetKey(planKey);
      setTargetCycle(cycle);
      setPhase("preview_loading");
      setProration(null);
      setErrorMsg("");

      try {
        const result = await fetchProrationPreview({
          currentSubscriptionId,
          targetPlanKey: planKey as any,
          targetCycle: cycle,
          immediate: true,
        });

        if (result) {
          setProration(result);
          setPhase("preview_ready");
        } else {
          setErrorMsg("Không thể tính toán proration. Vui lòng thử lại.");
          setPhase("preview_error");
        }
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : "Lỗi kết nối khi tính proration",
        );
        setPhase("preview_error");
      }
    },
    [currentSubscriptionId],
  );

  // ─── Confirm upgrade ────────────────────────────────
  const handleConfirm = useCallback(async () => {
    if (!targetKey) return;
    setPhase("confirming");

    try {
      const res = await upgradeSubscription({
        currentSubscriptionId,
        targetPlanKey: targetKey,
        targetCycle,
        immediate: true,
      });

      setResult(res);

      if (res.success) {
        setPhase("success");
        onSuccess();
      } else {
        setPhase("error");
      }
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : "Lỗi kết nối",
      });
      setPhase("error");
    }
  }, [currentSubscriptionId, targetKey, targetCycle, onSuccess]);

  // ─── Available plans (exclude current) ──────────────
  const availablePlans = plans.filter((p) => p.key !== currentPlanKey);

  if (!open) return null;

  return (
    <div style={overlay}>
      <div style={modalContainer}>
        {/* ─── Header ─── */}
        <div style={modalHeader}>
          <span style={modalTitle}>
            {phase === "success" ? "✅ Nâng cấp thành công" : "🔄 Nâng cấp gói cước"}
          </span>
          <button style={closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        {/* ─── Phase: selecting_plan ─── */}
        {phase === "selecting_plan" && (
          <div style={modalBody}>
            <SectionLabel>CHỌN GÓI MỚI</SectionLabel>
            <CurrentPlanIndicator name={currentPlanName} />
            <CycleSelector cycle={targetCycle} onChange={setTargetCycle} />
            <div style={planGrid}>
              {availablePlans.map((plan) => (
                <SelectablePlanCard
                  key={plan.key}
                  plan={plan}
                  cycle={targetCycle}
                  onSelect={() => handlePreview(plan.key, targetCycle)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ─── Phase: preview_loading ─── */}
        {phase === "preview_loading" && <PreviewLoading />}

        {/* ─── Phase: preview_error ─── */}
        {phase === "preview_error" && (
          <ErrorState
            message={errorMsg}
            onRetry={() => handlePreview(targetKey, targetCycle)}
            onBack={() => setPhase("selecting_plan")}
          />
        )}

        {/* ─── Phase: preview_ready ─── */}
        {phase === "preview_ready" && proration && (
          <ProrationPreviewPanel
            proration={proration}
            onBack={() => setPhase("selecting_plan")}
            onConfirm={handleConfirm}
          />
        )}

        {/* ─── Phase: confirming ─── */}
        {phase === "confirming" && (
          <div style={centeredSpinner}>
            <div style={spinnerIcon}>⏳</div>
            <div style={{ color: "#c8d2ff" }}>Đang xử lý nâng cấp gói cước…</div>
          </div>
        )}

        {/* ─── Phase: success ─── */}
        {phase === "success" && result?.success && (
          <SuccessPanel result={result} proration={proration} onClose={onClose} />
        )}

        {/* ─── Phase: error ─── */}
        {phase === "error" && result && !result.success && (
          <ErrorState
            message={result.message}
            onRetry={handleConfirm}
            onBack={() => setPhase("preview_ready")}
          />
        )}
      </div>
    </div>
  );
}

// ================================================================
// Sub-components
// ================================================================

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={sectionLabelStyle}>
      {children}
    </div>
  );
}

function CurrentPlanIndicator({ name }: { name: string }) {
  return (
    <div style={currentPlanBox}>
      <span style={{ color: "#9fb0ff" }}>Gói hiện tại:</span>
      <span style={{ fontWeight: 700, marginLeft: 8 }}>{name}</span>
    </div>
  );
}

function CycleSelector({
  cycle,
  onChange,
}: {
  cycle: BillingCycle;
  onChange: (c: BillingCycle) => void;
}) {
  return (
    <div style={cycleRow}>
      <button
        style={{
          ...cycleBtn,
          background:
            cycle === "monthly"
              ? "rgba(109,124,255,0.2)"
              : "rgba(255,255,255,0.05)",
          color: cycle === "monthly" ? "#f5f7ff" : "#9fb0ff",
        }}
        onClick={() => onChange("monthly")}
      >
        Trả theo tháng
      </button>
      <button
        style={{
          ...cycleBtn,
          background:
            cycle === "yearly"
              ? "rgba(109,124,255,0.2)"
              : "rgba(255,255,255,0.05)",
          color: cycle === "yearly" ? "#f5f7ff" : "#9fb0ff",
        }}
        onClick={() => onChange("yearly")}
      >
        Trả theo năm — tiết kiệm 17%
      </button>
    </div>
  );
}

function SelectablePlanCard({
  plan,
  cycle,
  onSelect,
}: {
  plan: PlanColumnView;
  cycle: BillingCycle;
  onSelect: () => void;
}) {
  const priceDisplay =
    cycle === "yearly" && plan.yearlyPrice > 0
      ? plan.yearlyPriceDisplay
      : plan.monthlyPriceDisplay;
  const periodLabel =
    cycle === "yearly" && plan.yearlyPrice > 0 ? "/năm" : "/tháng";

  return (
    <button
      onClick={onSelect}
      style={{
        padding: 16,
        borderRadius: 14,
        background:
          "linear-gradient(180deg, rgba(109,124,255,0.08), rgba(255,255,255,0.02))",
        border: "1px solid rgba(109,124,255,0.3)",
        cursor: "pointer",
        textAlign: "left" as const,
        color: "#f5f7ff",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>
        {plan.name}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>
        {priceDisplay}
        {plan.monthlyPrice > 0 && (
          <span style={{ fontSize: 13, color: "#9fb0ff", fontWeight: 400 }}>
            {periodLabel}
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: "#c8d2ff", lineHeight: 1.5 }}>
        {plan.limits.slice(0, 3).map((l) => (
          <div key={l.key}>
            {l.icon} {l.label}: {l.displayValue}
          </div>
        ))}
      </div>
      {plan.trialDays > 0 && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: "#ffb366",
            fontWeight: 700,
          }}
        >
          🎁 Dùng thử {plan.trialDays} ngày
        </div>
      )}
    </button>
  );
}

/** Vòng tròn loading khi fetch proration */
function PreviewLoading() {
  return (
    <div style={centeredSpinner}>
      <div style={spinnerCircle} />
      <div style={{ color: "#c8d2ff", fontSize: 14 }}>
        Đang tính toán proration…
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/** Trạng thái lỗi */
function ErrorState({
  message,
  onRetry,
  onBack,
}: {
  message: string;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <div style={centeredSpinner}>
      <div style={{ color: "#ff6b6b", fontSize: 32, marginBottom: 12 }}>⚠️</div>
      <div style={{ color: "#ffb3b3", marginBottom: 20, fontSize: 14, maxWidth: 360 }}>
        {message}
      </div>
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <button onClick={onBack} style={secondaryBtn}>
          Quay lại
        </button>
        <button onClick={onRetry} style={primaryBtn}>
          Thử lại
        </button>
      </div>
    </div>
  );
}

/** Proration preview panel */
function ProrationPreviewPanel({
  proration,
  onBack,
  onConfirm,
}: {
  proration: ProrationPreviewView;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const isUpgrade = proration.direction === "upgrade";

  return (
    <div style={modalBody}>
      {/* Comparison summary */}
      <SectionLabel>SO SÁNH GÓI CƯỚC</SectionLabel>
      <div style={comparisonCard}>
        <div style={comparisonRow}>
          <div style={comparisonCol}>
            <div style={compLabel}>Gói cũ</div>
            <div style={compValueOld}>{proration.oldPlanName}</div>
          </div>
          <div style={{ color: "#9fb0ff", fontSize: 20, padding: "0 12px" }}>
            →
          </div>
          <div style={comparisonCol}>
            <div style={compLabel}>Gói mới</div>
            <div style={compValueNew}>{proration.newPlanName}</div>
          </div>
        </div>
      </div>

      {/* Proration detail */}
      <SectionLabel>CHI TIẾT THANH TOÁN</SectionLabel>
      <div style={detailCard}>
        <DetailRow
          label="Ngày đã dùng"
          value={`${proration.oldPlanTotalDays - proration.oldPlanRemainingDays}/${proration.oldPlanTotalDays} ngày`}
        />
        <DetailRow
          label="Số ngày còn lại"
          value={`${proration.oldPlanRemainingDays} ngày`}
        />
        <div style={divider} />

        <DetailRow
          label="Giá trị gói cũ còn lại"
          value={proration.oldPlanRemainingDisplay}
          valueColor="#9fb0ff"
        />
        <DetailRow
          label="Chi phí gói mới (prorated)"
          value={proration.newPlanProratedDisplay}
          valueColor="#c8d2ff"
        />

        {isUpgrade && (
          <>
            <div style={divider} />
            <DetailRow
              label="📌 Số tiền cần nạp thêm"
              value={proration.chargeDisplay}
              valueColor="#ffb366"
              bold
            />
          </>
        )}

        {!isUpgrade && proration.creditAmount > 0 && (
          <>
            <div style={divider} />
            <DetailRow
              label="💰 Số tiền được hoàn"
              value={proration.creditDisplay}
              valueColor="#80e0a0"
              bold
            />
          </>
        )}

        <div style={divider} />

        <DetailRow
          label="Hiệu lực từ"
          value={proration.effectiveFromDisplay}
        />
        <DetailRow
          label="Ngày gia hạn mới"
          value={proration.newExpiresAtDisplay}
          bold
        />
      </div>

      {/* Wallet balance */}
      <SectionLabel>SỐ DƯ VÍ</SectionLabel>
      <div style={walletCard}>
        <div style={walletRow}>
          <span style={{ color: "#9fb0ff", fontSize: 14 }}>
            Số dư khả dụng
          </span>
          <span
            style={{
              fontWeight: 800,
              fontSize: 18,
              color: proration.sufficientBalance ? "#80e0a0" : "#ff6b6b",
            }}
          >
            {proration.walletBalanceDisplay}
          </span>
        </div>
        {!proration.sufficientBalance && (
          <div style={shortfallBox}>
            ⚠️ Bạn cần nạp thêm {proration.shortfallDisplay} để nâng cấp gói này.
            <br />
            <span style={{ fontSize: 12, color: "#ffb366" }}>
              Nạp tiền qua cổng VNPay/MoMo
            </span>
          </div>
        )}
        {proration.sufficientBalance && (
          <div style={sufficientBox}>✅ Đủ tiền</div>
        )}
      </div>

      {/* Footer actions */}
      <div style={modalFooter}>
        <button onClick={onBack} style={secondaryBtn}>
          Quay lại
        </button>
        <button
          onClick={onConfirm}
          style={{
            ...primaryBtn,
            opacity:
              proration.chargeAmount > 0 && !proration.sufficientBalance
                ? 0.5
                : 1,
            cursor:
              proration.chargeAmount > 0 && !proration.sufficientBalance
                ? "not-allowed"
                : "pointer",
          }}
          disabled={
            proration.chargeAmount > 0 && !proration.sufficientBalance
          }
        >
          {proration.chargeAmount > 0
            ? `💰 Xác nhận — Trả ${proration.chargeDisplay}`
            : "✅ Xác nhận nâng cấp"}
        </button>
      </div>

      <div style={disclaimer}>
        ⚠️ Gói cũ sẽ tự động hủy khi nâng cấp. Thời gian còn lại được quy đổi
        thành tín dụng cho gói mới.
      </div>
    </div>
  );
}

/** Success panel sau khi upgrade */
function SuccessPanel({
  result,
  proration,
  onClose,
}: {
  result: UpgradeResult | null;
  proration: ProrationPreviewView | null;
  onClose: () => void;
}) {
  return (
    <div style={successPanel}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>
        Nâng cấp thành công!
      </div>
      <div
        style={{
          color: "#c8d2ff",
          fontSize: 14,
          marginBottom: 24,
          lineHeight: 1.7,
        }}
      >
        Gói cước đã được chuyển đổi.
        {proration && (
          <>
            <br />
            {proration.oldPlanName} → {proration.newPlanName}
          </>
        )}
      </div>

      {result && (
        <div style={successDetailCard}>
          {result.newExpiresAt && (
            <div style={successRow}>
              <span>Ngày hết hạn</span>
              <span style={{ fontWeight: 700 }}>
                {formatBillingDate(result.newExpiresAt)}
              </span>
            </div>
          )}
          {result.invoiceId && (
            <div style={successRow}>
              <span>Hóa đơn</span>
              <span style={{ color: "#9fb0ff", fontSize: 13 }}>
                {result.invoiceId}
              </span>
            </div>
          )}
          {result.ledgerTransactionId && (
            <div style={successRow}>
              <span>Mã giao dịch</span>
              <span style={{ color: "#9fb0ff", fontSize: 13 }}>
                {result.ledgerTransactionId}
              </span>
            </div>
          )}
        </div>
      )}

      <button onClick={onClose} style={primaryBtn}>
        Quay lại Billing
      </button>
    </div>
  );
}

// ─── Utility sub-components ──────────────────────

function DetailRow({
  label,
  value,
  valueColor,
  bold,
}: {
  label: string;
  value: string;
  valueColor?: string;
  bold?: boolean;
}) {
  return (
    <div style={detailRow}>
      <span style={{ color: "#9fb0ff" }}>{label}</span>
      <span
        style={{
          color: valueColor ?? "#f5f7ff",
          fontWeight: bold ? 700 : 400,
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Style constants ──────────────────────────────

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.65)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: 16,
};

const modalContainer: CSSProperties = {
  width: "100%",
  maxWidth: 640,
  maxHeight: "90vh",
  overflowY: "auto",
  background: "#0b1020",
  borderRadius: 24,
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#f5f7ff",
  fontFamily: "Arial, sans-serif",
};

const modalHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "24px 28px 0",
};

const modalTitle: CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
};

const closeBtn: CSSProperties = {
  background: "none",
  border: "none",
  color: "#9fb0ff",
  fontSize: 20,
  cursor: "pointer",
  padding: 8,
};

const modalBody: CSSProperties = {
  padding: "0 28px 24px",
};

const modalFooter: CSSProperties = {
  display: "flex",
  gap: 12,
  justifyContent: "flex-end",
  marginTop: 24,
  paddingTop: 16,
  borderTop: "1px solid rgba(255,255,255,0.06)",
};

const primaryBtn: CSSProperties = {
  padding: "12px 24px",
  borderRadius: 12,
  border: "none",
  background: "#6d7cff",
  color: "white",
  fontWeight: 700,
  fontSize: 15,
  cursor: "pointer",
  fontFamily: "Arial, sans-serif",
};

const secondaryBtn: CSSProperties = {
  padding: "12px 24px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "transparent",
  color: "#c8d2ff",
  fontWeight: 600,
  fontSize: 15,
  cursor: "pointer",
  fontFamily: "Arial, sans-serif",
};

const sectionLabelStyle: CSSProperties = {
  fontSize: 11,
  color: "#9fb0ff",
  letterSpacing: 1,
  fontWeight: 700,
  textTransform: "uppercase",
  marginBottom: 12,
  marginTop: 20,
};

const currentPlanBox: CSSProperties = {
  padding: "12px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  marginBottom: 16,
  fontSize: 14,
};

const cycleRow: CSSProperties = {
  display: "flex",
  gap: 8,
  marginBottom: 16,
};

const cycleBtn: CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "none",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 13,
  fontFamily: "Arial, sans-serif",
};

const planGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const centeredSpinner: CSSProperties = {
  padding: 40,
  textAlign: "center",
};

const spinnerCircle: CSSProperties = {
  width: 32,
  height: 32,
  border: "3px solid rgba(109,124,255,0.2)",
  borderTop: "3px solid #6d7cff",
  borderRadius: "50%",
  animation: "spin 0.8s linear infinite",
  margin: "0 auto 16px",
};

const spinnerIcon: CSSProperties = {
  marginBottom: 12,
  fontSize: 32,
};

const comparisonCard: CSSProperties = {
  padding: 16,
  borderRadius: 14,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  marginBottom: 8,
};

const comparisonRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const comparisonCol: CSSProperties = {
  flex: 1,
};

const compLabel: CSSProperties = {
  fontSize: 11,
  color: "#9fb0ff",
  textTransform: "uppercase",
  letterSpacing: 1,
  marginBottom: 4,
};

const compValueOld: CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: "#9fb0ff",
};

const compValueNew: CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: "#f5f7ff",
};

const detailCard: CSSProperties = {
  padding: 16,
  borderRadius: 14,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
  marginBottom: 8,
};

const detailRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "6px 0",
  fontSize: 14,
};

const divider: CSSProperties = {
  height: 1,
  background: "rgba(255,255,255,0.06)",
  margin: "8px 0",
};

const walletCard: CSSProperties = {
  padding: 16,
  borderRadius: 14,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
  marginBottom: 8,
};

const walletRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const shortfallBox: CSSProperties = {
  marginTop: 12,
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,107,107,0.1)",
  border: "1px solid rgba(255,107,107,0.2)",
  color: "#ffb3b3",
  fontSize: 13,
  lineHeight: 1.6,
};

const sufficientBox: CSSProperties = {
  marginTop: 12,
  padding: "6px 14px",
  borderRadius: 8,
  background: "rgba(128,224,160,0.1)",
  color: "#80e0a0",
  fontSize: 13,
  display: "inline-block",
};

const successPanel: CSSProperties = {
  padding: "32px 28px",
  textAlign: "center",
};

const successDetailCard: CSSProperties = {
  display: "grid",
  gap: 8,
  padding: 16,
  borderRadius: 14,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
  marginBottom: 24,
  fontSize: 14,
};

const successRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  color: "#c8d2ff",
};

const disclaimer: CSSProperties = {
  marginTop: 16,
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,179,102,0.08)",
  border: "1px solid rgba(255,179,102,0.15)",
  color: "#ffb366",
  fontSize: 12,
  lineHeight: 1.6,
};
