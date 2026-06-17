"use client";

// ─────────────────────────────────────────────────────────────
// Refund Request Modal — State Machine 7 giai đoạn
// Phase 3 (Operator Ready) · Frontend apps/web
// Inline styles (React.CSSProperties) — kế thừa pattern billing dashboard.
// ─────────────────────────────────────────────────────────────

import { useState, useCallback, useEffect } from "react";
import type { CSSProperties } from "react";
import {
  checkRefundIntegrity,
  submitRefundRequest,
  formatWalletAmount,
} from "../../lib/wallet";
import type { RefundIntegrityResult } from "../../types/wallet";

// ─── State machine: 7 phases ─────────────────────────

type FormPhase =
  | "idle" // form sạch, sẵn sàng nhập
  | "checking" // đang gọi POST /billing/refund/check
  | "checked_ok" // integrity pass, nút Submit sáng
  | "checked_fail" // integrity fail, show lỗi chi tiết
  | "submitting" // đang gọi POST /billing/refund/request
  | "success" // hoàn tiền thành công
  | "error"; // lỗi không recover được

// ─── Form state ──────────────────────────────────────

interface RefundFormData {
  originalReferenceId: string;
  amount: string;
  description: string;
}

interface RefundFormErrors {
  originalReferenceId?: string;
  amount?: string;
  general?: string;
}

// ─── Props ───────────────────────────────────────────

interface RefundRequestModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void; // refresh wallet/ledger sau khi thành công
}

// ─── Inline styles ───────────────────────────────────

const STYLE: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed" as const,
    inset: 0,
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.65)",
    backdropFilter: "blur(4px)",
    fontFamily: "Arial, sans-serif",
  },
  modal: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "90vh",
    overflowY: "auto",
    background: "#131833",
    borderRadius: 20,
    border: "1px solid rgba(109,124,255,0.2)",
    padding: 28,
    position: "relative" as const,
  },
  closeBtn: {
    position: "absolute" as const,
    top: 16,
    right: 16,
    background: "rgba(255,255,255,0.05)",
    border: "none",
    color: "#9fb0ff",
    width: 32,
    height: 32,
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 14,
    fontWeight: 700,
    color: "#9fb0ff",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 24,
  },
  fieldGroup: {
    marginBottom: 18,
  },
  label: {
    display: "block",
    fontSize: 13,
    color: "#c8d2ff",
    fontWeight: 600,
    marginBottom: 6,
  },
  input: {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 10,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#f5f7ff",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box" as const,
    fontFamily: "Arial, sans-serif",
  },
  textarea: {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 10,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#f5f7ff",
    fontSize: 14,
    outline: "none",
    resize: "vertical" as const,
    minHeight: 64,
    boxSizing: "border-box" as const,
    fontFamily: "Arial, sans-serif",
  },
  inputError: {
    border: "1px solid rgba(255,107,107,0.5)",
  },
  fieldError: {
    fontSize: 12,
    color: "#ff6b6b",
    marginTop: 4,
  },
  generalError: {
    padding: "10px 14px",
    borderRadius: 10,
    background: "rgba(255,107,107,0.1)",
    border: "1px solid rgba(255,107,107,0.25)",
    color: "#ff6b6b",
    fontSize: 13,
    marginBottom: 16,
  },
  actions: {
    display: "flex",
    gap: 12,
    justifyContent: "flex-end",
    marginTop: 22,
  },
  btnSecondary: {
    padding: "10px 20px",
    borderRadius: 10,
    background: "rgba(255,255,255,0.05)",
    color: "#c8d2ff",
    fontWeight: 700,
    border: "1px solid rgba(255,255,255,0.1)",
    cursor: "pointer",
    fontSize: 14,
    fontFamily: "Arial, sans-serif",
  },
  btnCheck: {
    padding: "10px 20px",
    borderRadius: 10,
    background: "rgba(109,124,255,0.15)",
    color: "#6d7cff",
    fontWeight: 700,
    border: "1px solid rgba(109,124,255,0.3)",
    cursor: "pointer",
    fontSize: 14,
    fontFamily: "Arial, sans-serif",
  },
  btnSubmit: {
    padding: "10px 20px",
    borderRadius: 10,
    background: "#80e0a0",
    color: "#0b1020",
    fontWeight: 700,
    border: "none",
    cursor: "pointer",
    fontSize: 14,
    fontFamily: "Arial, sans-serif",
  },
  btnDisabled: {
    opacity: 0.45,
    cursor: "not-allowed",
  },
  // ─── Integrity result panel ───
  integrityPanel: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  integrityPass: {
    background: "rgba(128,224,160,0.08)",
    border: "1px solid rgba(128,224,160,0.25)",
  },
  integrityFail: {
    background: "rgba(255,107,107,0.08)",
    border: "1px solid rgba(255,107,107,0.25)",
  },
  integrityTitle: {
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 10,
  },
  integrityLine: {
    fontSize: 13,
    color: "#c8d2ff",
    marginBottom: 4,
  },
  progressWrapper: {
    marginTop: 12,
  },
  progressLabel: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 12,
    color: "#9fb0ff",
    marginBottom: 6,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    background: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
    transition: "width 0.4s ease",
  },
  // ─── Success panel ───
  successPanel: {
    padding: 24,
    textAlign: "center" as const,
  },
  successIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: "#80e0a0",
    marginBottom: 8,
  },
  successSub: {
    fontSize: 14,
    color: "#c8d2ff",
    marginBottom: 20,
  },
};

// ─── Component ───────────────────────────────────────

export function RefundRequestModal({
  open,
  onClose,
  onSuccess,
}: RefundRequestModalProps) {
  // ─── State ─────────────────────────────────────────
  const [phase, setPhase] = useState<FormPhase>("idle");
  const [form, setForm] = useState<RefundFormData>({
    originalReferenceId: "",
    amount: "",
    description: "",
  });
  const [errors, setErrors] = useState<RefundFormErrors>({});
  const [integrity, setIntegrity] = useState<RefundIntegrityResult | null>(null);

  // Reset form khi mở lại modal
  useEffect(() => {
    if (open) {
      setPhase("idle");
      setForm({ originalReferenceId: "", amount: "", description: "" });
      setErrors({});
      setIntegrity(null);
    }
  }, [open]);

  // ─── Client-side validation ────────────────────────
  const validate = useCallback((): boolean => {
    const e: RefundFormErrors = {};
    const trimmedId = form.originalReferenceId.trim();
    if (!trimmedId) {
      e.originalReferenceId = "Vui lòng nhập mã giao dịch gốc";
    }
    const parsed = Number(form.amount);
    if (!form.amount.trim()) {
      e.amount = "Vui lòng nhập số tiền";
    } else if (!Number.isFinite(parsed) || parsed <= 0) {
      e.amount = "Số tiền phải lớn hơn 0";
    } else if (!Number.isInteger(parsed)) {
      e.amount = "Số tiền phải là số nguyên";
    }
    if (form.description && form.description.length > 500) {
      e.general = "Lý do hoàn tiền không quá 500 ký tự";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [form]);

  // ─── Integrity check ───────────────────────────────
  const handleCheck = useCallback(async () => {
    if (!validate()) return;
    setPhase("checking");
    setErrors({});
    setIntegrity(null);
    try {
      const result = await checkRefundIntegrity({
        originalReferenceId: form.originalReferenceId.trim(),
        amount: Math.round(Number(form.amount)),
        description: form.description.trim() || undefined,
      });
      setIntegrity(result);
      setPhase(result.pass ? "checked_ok" : "checked_fail");
    } catch (err) {
      setErrors({
        general:
          err instanceof Error
            ? err.message
            : "Lỗi kết nối, vui lòng thử lại",
      });
      setPhase("error");
    }
  }, [form, validate]);

  // ─── Submit refund ─────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (phase !== "checked_ok") return;
    setPhase("submitting");
    try {
      const result = await submitRefundRequest({
        originalReferenceId: form.originalReferenceId.trim(),
        amount: Math.round(Number(form.amount)),
        description: form.description.trim() || undefined,
      });
      if (result.success) {
        setPhase("success");
      } else {
        setErrors({ general: result.error ?? "Yêu cầu hoàn tiền thất bại" });
        setPhase("error");
      }
    } catch (err) {
      setErrors({
        general:
          err instanceof Error ? err.message : "Lỗi hệ thống, vui lòng thử lại sau",
      });
      setPhase("error");
    }
  }, [phase, form]);

  // ─── Close + success callback ──────────────────────
  const handleClose = useCallback(() => {
    if (phase === "success" || phase === "error") {
      onClose();
      if (phase === "success") {
        // Trigger refresh sau một khoảng ngắn để modal kịp đóng
        setTimeout(onSuccess, 100);
      }
    } else {
      onClose();
    }
  }, [phase, onClose, onSuccess]);

  // ─── Form field updater ────────────────────────────
  const updateField = useCallback(
    (field: keyof RefundFormData, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      // Clear error khi user sửa
      setErrors((prev) => ({
        ...prev,
        [field]: undefined,
        general: undefined,
      }));
      // Reset integrity nếu form thay đổi
      if (integrity) {
        setIntegrity(null);
        if (phase === "checked_ok" || phase === "checked_fail") {
          setPhase("idle");
        }
      }
    },
    [integrity, phase],
  );

  // Tính phần trăm đã hoàn (cho progress bar)
  const refundPercent =
    integrity && integrity.remainingAvailable !== "0"
      ? Math.min(
          100,
          Math.round(
            (Number(integrity.totalRefunded) /
              (Number(integrity.totalRefunded) + Number(integrity.remainingAvailable))) *
              100,
          ),
        )
      : 0;

  // ─── Render ────────────────────────────────────────
  if (!open) return null;

  // Phí đóng khi đang xử lý
  const canClose =
    phase !== "checking" && phase !== "submitting";
  const formDisabled =
    phase === "checking" || phase === "submitting" || phase === "success";
  const checkLabel =
    phase === "checking" ? "Đang kiểm tra…" : "✅ Kiểm tra tính hợp lệ";
  const submitLabel =
    phase === "submitting" ? "Đang xử lý…" : "✅ Gửi yêu cầu";
  const submitEnabled = phase === "checked_ok";

  return (
    <div style={STYLE.overlay} onClick={canClose ? onClose : undefined}>
      <div
        style={STYLE.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Yêu cầu hoàn tiền"
      >
        {/* ─── Close button ─── */}
        {canClose && (
          <button type="button" style={STYLE.closeBtn} onClick={handleClose} aria-label="Đóng">
            ✕
          </button>
        )}

        {/* ─── SUCCESS state ─── */}
        {phase === "success" ? (
          <div style={STYLE.successPanel}>
            <div style={STYLE.successIcon}>✅</div>
            <div style={STYLE.successTitle}>Hoàn tiền thành công!</div>
            <div style={STYLE.successSub}>
              Số tiền{" "}
              <strong style={{ color: "#80e0a0" }}>
                {formatWalletAmount(String(Math.round(Number(form.amount))))}
              </strong>{" "}
              đã được ghi có vào ví của bạn.
            </div>
            <button
              type="button"
              style={{ ...STYLE.btnSubmit, padding: "12px 32px" }}
              onClick={handleClose}
            >
              Đóng
            </button>
          </div>
        ) : (
          <>
            {/* ─── Title ─── */}
            <div style={STYLE.title}>Yêu cầu hoàn tiền</div>

            {/* ─── General error ─── */}
            {errors.general && (
              <div style={STYLE.generalError}>{errors.general}</div>
            )}

            {/* ─── Form fields ─── */}
            <div style={STYLE.fieldGroup}>
              <label style={STYLE.label}>
                Mã giao dịch gốc <span style={{ color: "#ff6b6b" }}>*</span>
              </label>
              <input
                style={{
                  ...STYLE.input,
                  ...(errors.originalReferenceId ? STYLE.inputError : {}),
                }}
                placeholder="PAY-********"
                value={form.originalReferenceId}
                onChange={(e) => updateField("originalReferenceId", e.target.value)}
                disabled={formDisabled}
              />
              {errors.originalReferenceId && (
                <div style={STYLE.fieldError}>{errors.originalReferenceId}</div>
              )}
            </div>

            <div style={STYLE.fieldGroup}>
              <label style={STYLE.label}>
                Số tiền hoàn (VND)
                <span style={{ color: "#ff6b6b" }}>*</span>
              </label>
              <input
                style={{
                  ...STYLE.input,
                  ...(errors.amount ? STYLE.inputError : {}),
                }}
                type="text"
                inputMode="numeric"
                placeholder="50.000"
                value={form.amount}
                onChange={(e) => updateField("amount", e.target.value.replace(/[^\d]/g, ""))}
                disabled={formDisabled}
              />
              {errors.amount && (
                <div style={STYLE.fieldError}>{errors.amount}</div>
              )}
            </div>

            <div style={STYLE.fieldGroup}>
              <label style={STYLE.label}>Lý do hoàn tiền</label>
              <textarea
                style={STYLE.textarea}
                placeholder="Khách hàng yêu cầu hủy đơn hàng…"
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
                disabled={formDisabled}
                maxLength={500}
              />
              <div
                style={{
                  fontSize: 11,
                  color: "#5a6488",
                  textAlign: "right",
                  marginTop: 4,
                }}
              >
                {form.description.length}/500
              </div>
            </div>

            {/* ─── Integrity result panel ─── */}
            {integrity && (
              <div
                style={{
                  ...STYLE.integrityPanel,
                  ...(integrity.pass ? STYLE.integrityPass : STYLE.integrityFail),
                }}
              >
                <div
                  style={{
                    ...STYLE.integrityTitle,
                    color: integrity.pass ? "#80e0a0" : "#ff6b6b",
                  }}
                >
                  {integrity.pass ? "✅ Hợp lệ" : "❌ Không hợp lệ"}
                </div>
                <div style={STYLE.integrityLine}>
                  Giao dịch gốc:{" "}
                  <strong style={{ color: "#f5f7ff" }}>
                    {formatWalletAmount(integrity.originalAmount)}
                  </strong>
                </div>
                <div style={STYLE.integrityLine}>
                  Đã hoàn:{" "}
                  <strong style={{ color: "#ffb86b" }}>
                    {formatWalletAmount(integrity.totalRefunded)}
                  </strong>
                </div>
                <div style={STYLE.integrityLine}>
                  Yêu cầu:{" "}
                  <strong style={{ color: "#6d7cff" }}>
                    {formatWalletAmount(integrity.requestedAmount)}
                  </strong>
                </div>
                <div style={STYLE.integrityLine}>
                  Còn khả dụng:{" "}
                  <strong style={{ color: "#80e0a0" }}>
                    {formatWalletAmount(integrity.remainingAvailable)}
                  </strong>
                </div>

                {/* ─── Anti-over-refund progress bar ─── */}
                <div style={STYLE.progressWrapper}>
                  <div style={STYLE.progressLabel}>
                    <span>
                      Đã hoàn: {formatWalletAmount(integrity.totalRefunded)}
                    </span>
                    <span>
                      / {formatWalletAmount(integrity.originalAmount)}
                    </span>
                  </div>
                  <div style={STYLE.progressTrack}>
                    <div
                      style={{
                        ...STYLE.progressFill,
                        width: `${Math.min(100, refundPercent)}%`,
                        background:
                          refundPercent > 80
                            ? "#ff6b6b"
                            : refundPercent > 50
                              ? "#ffb86b"
                              : "#80e0a0",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#5a6488",
                      marginTop: 4,
                    }}
                  >
                    Còn lại: {formatWalletAmount(integrity.remainingAvailable)}
                  </div>
                </div>

                {/* Integrity fail details */}
                {!integrity.pass && integrity.details.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    {integrity.details.map((d, i) => (
                      <div
                        key={i}
                        style={{
                          fontSize: 12,
                          color: "#ff6b6b",
                          paddingLeft: 12,
                          marginBottom: 2,
                        }}
                      >
                        • {d}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ─── Action buttons ─── */}
            <div style={STYLE.actions}>
              {canClose && (
                <button
                  type="button"
                  style={STYLE.btnSecondary}
                  onClick={handleClose}
                >
                  Hủy bỏ
                </button>
              )}

              <button
                type="button"
                style={{
                  ...STYLE.btnCheck,
                  ...(phase === "checking" ? STYLE.btnDisabled : {}),
                }}
                onClick={handleCheck}
                disabled={phase === "checking" || formDisabled}
              >
                {checkLabel}
              </button>

              <button
                type="button"
                style={{
                  ...STYLE.btnSubmit,
                  ...(submitEnabled ? {} : STYLE.btnDisabled),
                }}
                onClick={handleSubmit}
                disabled={
                  !submitEnabled ||
                  (phase as string) === "submitting" ||
                  formDisabled
                }
              >
                {submitLabel}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default RefundRequestModal;
