"use client";

// ============================================================
// components/billing/budget-config-form.tsx
// Form cấu hình hạn mức chi phí AI (Budget Caps).
//
// Cho phép người dùng (kể cả phi kỹ thuật) cấu hình:
//   • Số tiền tối đa (VND) — tự động format tiền tệ thời gian thực
//   • Chu kỳ (DAILY / WEEKLY / MONTHLY) — chọn từ dropdown
//   • Ngưỡng cảnh báo (alertThreshold) — slider 50%–95%
//   • Nút Lưu / Reset
//
// Pattern: Inline styles (React.CSSProperties) — nhất quán
// với các component billing hiện hữu.
// ============================================================

import type { CSSProperties, ChangeEvent } from "react";
import { useState, useCallback } from "react";
import type { BudgetLimit, BudgetPeriod } from "../../types/budget";
import { BUDGET_PERIODS, BUDGET_PERIOD_LABELS } from "../../types/budget";
import {
  formatVNDFromString,
  parseToBigIntString,
  displayThresholdPercent,
  upsertBudgetLimit,
} from "../../lib/budget";

// ─────────────────────────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────────────────────────

interface BudgetConfigFormProps {
  /** Limit hiện tại (nếu đã có) — để hiển thị giá trị mặc định */
  existingLimit: BudgetLimit | null;
  /** Period đang được cấu hình */
  period: BudgetPeriod;
  /** Callback sau khi lưu thành công */
  onSaved: (limit: BudgetLimit) => void;
  /** Callback khi có lỗi */
  onError: (message: string) => void;
  /** Disable form khi đang xử lý */
  disabled?: boolean;
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export function BudgetConfigForm({
  existingLimit,
  period,
  onSaved,
  onError,
  disabled = false,
}: BudgetConfigFormProps) {
  // ─── State form ───
  const [rawAmount, setRawAmount] = useState<string>(
    existingLimit ? existingLimit.maxCostAmount : "",
  );
  const [selectedPeriod, setSelectedPeriod] = useState<BudgetPeriod>(period);
  const [threshold, setThreshold] = useState<number>(
    existingLimit?.alertThreshold ?? 0.8,
  );
  const [saving, setSaving] = useState(false);

  // ─── Derived display ───
  const displayAmount = rawAmount
    ? formatVNDFromString(parseToBigIntString(rawAmount))
    : "0₫";
  const isValidAmount =
    rawAmount.trim() !== "" && BigInt(parseToBigIntString(rawAmount)) > 0n;

  // ─── Handlers ───

  const handleAmountChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    // Chỉ cho phép nhập số
    const value = e.target.value.replace(/[^\d]/g, "");
    setRawAmount(value);
  }, []);

  const handleThresholdChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setThreshold(Number(e.target.value));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!isValidAmount || saving || disabled) return;
    setSaving(true);
    try {
      const result = await upsertBudgetLimit({
        maxCostAmount: parseToBigIntString(rawAmount),
        period: selectedPeriod,
        alertThreshold: threshold,
        currency: "VND",
      });
      if (result) {
        onSaved(result);
      } else {
        onError("Không thể lưu cấu hình hạn mức. Vui lòng thử lại.");
      }
    } catch (err) {
      onError(
        err instanceof Error
          ? err.message
          : "Lỗi kết nối khi lưu hạn mức.",
      );
    } finally {
      setSaving(false);
    }
  }, [isValidAmount, saving, disabled, rawAmount, selectedPeriod, threshold, onSaved, onError]);

  const handleReset = useCallback(() => {
    setRawAmount(existingLimit?.maxCostAmount ?? "");
    setSelectedPeriod(period);
    setThreshold(existingLimit?.alertThreshold ?? 0.8);
  }, [existingLimit, period]);

  // ─── Render ───

  return (
    <div style={formWrapper}>
      {/* ─── Header ─── */}
      <div style={formHeader}>
        <span style={formIcon}>⚙️</span>
        <span style={formTitle}>
          Cấu hình hạn mức — {BUDGET_PERIOD_LABELS[period]}
        </span>
      </div>

      {/* ─── Row 1: Số tiền tối đa ─── */}
      <div style={fieldRow}>
        <label style={fieldLabel} htmlFor={`budget-amount-${period}`}>
          Số tiền tối đa (VND)
        </label>
        <div style={inputGroup}>
          <input
            id={`budget-amount-${period}`}
            type="text"
            inputMode="numeric"
            value={rawAmount}
            onChange={handleAmountChange}
            placeholder="Nhập số tiền, vd: 5000000"
            disabled={saving || disabled}
            style={amountInput}
          />
          {/* Preview format tiền tệ thời gian thực */}
          <div style={previewRow}>
            <span style={previewLabel}>Hiển thị:</span>
            <span style={previewValue(isValidAmount)}>{displayAmount}</span>
          </div>
        </div>
      </div>

      {/* ─── Row 2: Chu kỳ ─── */}
      <div style={fieldRow}>
        <label style={fieldLabel}>Chu kỳ</label>
        <div style={periodToggle}>
          {BUDGET_PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setSelectedPeriod(p)}
              disabled={saving || disabled}
              style={periodBtn(selectedPeriod === p)}
            >
              {BUDGET_PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Row 3: Alert threshold ─── */}
      <div style={fieldRow}>
        <label style={fieldLabel} htmlFor={`threshold-${period}`}>
          Ngưỡng cảnh báo:{" "}
          <span style={thresholdHighlight}>{displayThresholdPercent(threshold)}</span>
        </label>
        <div style={sliderGroup}>
          <input
            id={`threshold-${period}`}
            type="range"
            min={0.5}
            max={0.95}
            step={0.05}
            value={threshold}
            onChange={handleThresholdChange}
            disabled={saving || disabled}
            style={slider}
          />
          <div style={sliderLabels}>
            <span style={sliderLabel}>50%</span>
            <span style={sliderLabel}>95%</span>
          </div>
        </div>
      </div>

      {/* ─── Row 4: Actions ─── */}
      <div style={actionRow}>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isValidAmount || saving || disabled}
          style={saveBtn(saving)}
        >
          {saving ? "🔄 Đang lưu…" : "💾 Lưu cấu hình"}
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={saving || disabled}
          style={resetBtn}
        >
          ↩️ Đặt lại
        </button>
      </div>

      {/* ─── Existing limit info ─── */}
      {existingLimit && (
        <div style={existingInfo}>
          <span style={existingInfoIcon}>ℹ️</span>
          <span style={existingInfoText}>
            Hạn mức hiện tại:{" "}
            <strong>{formatVNDFromString(existingLimit.maxCostAmount)}</strong>{" "}
            · Trạng thái:{" "}
            <strong>{existingLimit.status}</strong> · Đã tiêu:{" "}
            <strong>{formatVNDFromString(existingLimit.currentCostSpent)}</strong>
          </span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// INLINE STYLES
// ─────────────────────────────────────────────────────────────

const formWrapper: CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 16,
  padding: "24px",
  display: "flex",
  flexDirection: "column",
  gap: 20,
};

const formHeader: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const formIcon: CSSProperties = {
  fontSize: 20,
};

const formTitle: CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  color: "#f5f7ff",
};

const fieldRow: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const fieldLabel: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#c8d2ff",
};

const inputGroup: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const amountInput: CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.05)",
  color: "#f5f7ff",
  fontSize: 16,
  fontFamily: "monospace",
  outline: "none",
  boxSizing: "border-box",
};

const previewRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 12px",
  borderRadius: 8,
  background: "rgba(109,124,255,0.08)",
};

const previewLabel: CSSProperties = {
  fontSize: 12,
  color: "#9fb0ff",
};

const previewValue = (valid: boolean): CSSProperties => ({
  fontSize: 16,
  fontWeight: 700,
  color: valid ? "#80e0a0" : "#ff6b6b",
  fontFamily: "monospace",
});

const periodToggle: CSSProperties = {
  display: "flex",
  gap: 8,
};

const periodBtn = (active: boolean): CSSProperties => ({
  flex: 1,
  padding: "10px 14px",
  borderRadius: 10,
  border: active
    ? "1px solid rgba(109,124,255,0.4)"
    : "1px solid rgba(255,255,255,0.08)",
  background: active ? "rgba(109,124,255,0.15)" : "rgba(255,255,255,0.03)",
  color: active ? "#6d7cff" : "#c8d2ff",
  fontWeight: active ? 700 : 500,
  fontSize: 14,
  cursor: "pointer",
  transition: "all 0.2s",
  textAlign: "center",
});

const sliderGroup: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const slider: CSSProperties = {
  width: "100%",
  height: 6,
  borderRadius: 3,
  accentColor: "#6d7cff",
  cursor: "pointer",
};

const sliderLabels: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
};

const sliderLabel: CSSProperties = {
  fontSize: 11,
  color: "#7a86b8",
};

const thresholdHighlight: CSSProperties = {
  color: "#ffb366",
  fontWeight: 800,
};

const actionRow: CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
};

const saveBtn = (loading: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "10px 24px",
  borderRadius: 10,
  border: "none",
  background: loading ? "rgba(109,124,255,0.3)" : "#6d7cff",
  color: "#ffffff",
  fontWeight: 700,
  fontSize: 14,
  cursor: loading ? "not-allowed" : "pointer",
  transition: "background 0.2s",
});

const resetBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "10px 18px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "transparent",
  color: "#c8d2ff",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
  transition: "all 0.2s",
};

const existingInfo: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(109,124,255,0.06)",
  border: "1px solid rgba(109,124,255,0.12)",
  fontSize: 12,
  color: "#9fb0ff",
  lineHeight: 1.5,
};

const existingInfoIcon: CSSProperties = {
  fontSize: 14,
  flexShrink: 0,
  marginTop: 1,
};

const existingInfoText: CSSProperties = {
  flex: 1,
};
