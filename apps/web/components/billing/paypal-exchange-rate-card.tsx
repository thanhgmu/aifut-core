"use client";

// ============================================================================
// PayPal Exchange Rate Card — Widget tỷ giá quy đổi USD/VND
// Theo bản thiết kế: docs/roadmap/PAYPAL-FRONTEND-UI-DESIGN.md (mục V)
// Lượt 1 — nhận input số tiền VND, tính USD charge + spread 1% + VND thực nhận.
// ============================================================================

import { useMemo } from "react";
import type {
  PayPalExchangeRate,
  PayPalExchangeQuote,
} from "../../types/paypal";

// ── Hằng số validation (design doc mục 5.4) ──────────────────────────────
const MIN_VND = 10_000n; //         Số tiền tối thiểu 10.000₫
const LARGE_VND = 100_000_000n; //  Ngưỡng cảnh báo giao dịch lớn
const ROUND_STEP = 1_000n; //       Làm tròn xuống bội số 1.000₫
const FALLBACK_FX = 25_400; //      Tỷ giá fallback khi chưa có server rate
const FALLBACK_SPREAD = 0.01; //    Spread fallback 1%

// ── Helpers ──────────────────────────────────────────────────────────────

/** Bỏ mọi ký tự không phải số rồi parse thành BigInt (an toàn, không NaN). */
export function parseVndInput(raw: string): bigint {
  const digits = (raw || "").replace(/[^0-9]/g, "");
  if (!digits) return 0n;
  try {
    return BigInt(digits);
  } catch {
    return 0n;
  }
}

/** Làm tròn xuống bội số của 1.000₫ (design doc mục 5.4). */
export function roundDownVnd(vnd: bigint): bigint {
  if (vnd <= 0n) return 0n;
  return (vnd / ROUND_STEP) * ROUND_STEP;
}

/** Định dạng số VND có dấu chấm phân tách hàng nghìn (vi-VN). */
export function formatVnd(vnd: bigint): string {
  return vnd.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Tính toàn bộ quote quy đổi theo công thức design doc mục 5.2:
 *   usdBase   = vnd / fxRate
 *   usdCharge = usdBase * (1 + spreadRate)   (làm tròn 2 chữ số thập phân)
 *   vndReceived = vnd * (1 - spreadRate)      (số VND thực vào Ledger)
 */
export function computeExchangeQuote(
  vndRaw: bigint,
  rate: PayPalExchangeRate | null,
): PayPalExchangeQuote {
  const fxRate = rate?.fxRate && rate.fxRate > 0 ? rate.fxRate : FALLBACK_FX;
  const spreadRate =
    rate?.spreadRate && rate.spreadRate >= 0 ? rate.spreadRate : FALLBACK_SPREAD;

  const vndInput = roundDownVnd(vndRaw);

  // USD gốc và USD charge — dùng Number cho phần thập phân, an toàn ở scale này.
  const usdBaseNum = Number(vndInput) / fxRate;
  const usdChargeNum = Math.round(usdBaseNum * (1 + spreadRate) * 100) / 100;
  const usdSpreadNum = Math.round((usdChargeNum - usdBaseNum) * 100) / 100;

  // Spread tính trên VND (BigInt, không mất chính xác).
  const spreadBp = BigInt(Math.round(spreadRate * 10_000)); // basis points
  const vndSpread = (vndInput * spreadBp) / 10_000n;
  const vndReceived = vndInput - vndSpread;

  return {
    vndInput,
    fxRate,
    spreadRate,
    usdBase: usdBaseNum.toFixed(2),
    usdSpread: usdSpreadNum.toFixed(2),
    usdCharge: usdChargeNum.toFixed(2),
    vndSpread,
    vndReceived,
  };
}

// ── Component ──────────────────────────────────────────────────────────────

interface PayPalExchangeRateCardProps {
  /** Giá trị input thô từ ô nhập (controlled). */
  vndInput: string;
  /** Tỷ giá hiện tại (từ Provider / server). Null = dùng fallback. */
  fxRate: PayPalExchangeRate | null;
  /** Callback khi người dùng thay đổi số tiền. */
  onChange: (raw: string) => void;
  /** Số dư ví hiện tại để hiển thị "số dư sau nạp" (BigInt string, optional). */
  currentBalance?: string | null;
  /** Khóa ô input khi ví bị khóa hoặc đang xử lý. */
  disabled?: boolean;
}

export function PayPalExchangeRateCard({
  vndInput,
  fxRate,
  onChange,
  currentBalance,
  disabled = false,
}: PayPalExchangeRateCardProps) {
  const vndRaw = useMemo(() => parseVndInput(vndInput), [vndInput]);
  const quote = useMemo(
    () => computeExchangeQuote(vndRaw, fxRate),
    [vndRaw, fxRate],
  );

  const tooSmall = quote.vndInput > 0n && quote.vndInput < MIN_VND;
  const isLarge = quote.vndInput > LARGE_VND;
  const spreadLabel = fxRate?.spreadLabel ?? "1%";

  const balanceBig = (() => {
    try {
      return currentBalance ? BigInt(currentBalance.replace(/[^0-9]/g, "")) : 0n;
    } catch {
      return 0n;
    }
  })();
  const balanceAfter = balanceBig + quote.vndReceived;

  return (
    <div
      style={{
        background: "rgba(12,18,42,0.6)",
        border: "1px solid rgba(120,140,255,0.18)",
        borderRadius: 16,
        padding: 24,
        maxWidth: 520,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 1,
          color: "#9fb0ff",
          textTransform: "uppercase",
          marginBottom: 18,
        }}
      >
        💱 Tỷ giá nạp tiền
      </div>

      {/* Ô nhập số tiền VND */}
      <label
        style={{
          display: "block",
          fontSize: 13,
          color: "#c8d2ff",
          marginBottom: 6,
        }}
      >
        Số tiền nạp (VND)
      </label>
      <div style={{ position: "relative", marginBottom: 18 }}>
        <input
          inputMode="numeric"
          value={formatVnd(parseVndInput(vndInput))}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="1.000.000"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "12px 40px 12px 14px",
            fontSize: 20,
            fontWeight: 700,
            color: "#ffffff",
            background: "rgba(0,0,0,0.25)",
            border: tooSmall
              ? "1px solid rgba(255,120,120,0.6)"
              : "1px solid rgba(120,140,255,0.3)",
            borderRadius: 10,
            outline: "none",
          }}
        />
        <span
          style={{
            position: "absolute",
            right: 14,
            top: "50%",
            transform: "translateY(-50%)",
            color: "#9fb0ff",
            fontSize: 18,
            fontWeight: 700,
          }}
        >
          ₫
        </span>
      </div>

      {tooSmall && (
        <div style={{ color: "#ff9b9b", fontSize: 13, marginBottom: 14 }}>
          Số tiền tối thiểu: {formatVnd(MIN_VND)}₫
        </div>
      )}
      {isLarge && (
        <div style={{ color: "#ffd27a", fontSize: 13, marginBottom: 14 }}>
          ⚠️ Giao dịch lớn, vui lòng liên hệ admin nếu cần hỗ trợ.
        </div>
      )}

      {/* Bảng quy đổi */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          rowGap: 10,
          columnGap: 12,
          fontSize: 14,
          padding: "14px 0",
          borderTop: "1px solid rgba(120,140,255,0.15)",
          borderBottom: "1px solid rgba(120,140,255,0.15)",
        }}
      >
        <span style={{ color: "#c8d2ff" }}>Tỷ giá gốc (USD/VND)</span>
        <span style={{ textAlign: "right", color: "#fff" }}>
          {formatVnd(BigInt(Math.round(quote.fxRate)))}
        </span>

        <span style={{ color: "#c8d2ff" }}>USD gốc</span>
        <span style={{ textAlign: "right", color: "#fff" }}>
          ${quote.usdBase}
        </span>

        <span style={{ color: "#c8d2ff" }}>Spread ({spreadLabel})</span>
        <span style={{ textAlign: "right", color: "#ffd27a" }}>
          +${quote.usdSpread} &nbsp;/&nbsp; -{formatVnd(quote.vndSpread)}₫
        </span>

        <span style={{ color: "#c8d2ff", fontWeight: 700 }}>
          USD charge qua PayPal
        </span>
        <span style={{ textAlign: "right", color: "#7ec8ff", fontWeight: 700 }}>
          ${quote.usdCharge}
        </span>
      </div>

      {/* VND thực nhận */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginTop: 16,
        }}
      >
        <span style={{ color: "#c8d2ff", fontSize: 14 }}>
          Số VND thực nhận vào Ví
        </span>
        <span style={{ color: "#80e0a0", fontSize: 22, fontWeight: 800 }}>
          +{formatVnd(quote.vndReceived)}₫
        </span>
      </div>

      {currentBalance != null && quote.vndInput > 0n && (
        <div
          style={{
            color: "#9fb0ff",
            fontSize: 13,
            marginTop: 6,
            textAlign: "right",
          }}
        >
          Số dư sau nạp: {formatVnd(balanceAfter)}₫
        </div>
      )}

      <div
        style={{
          marginTop: 18,
          padding: "10px 14px",
          background: "rgba(0,150,255,0.08)",
          border: "1px solid rgba(0,150,255,0.2)",
          borderRadius: 10,
          color: "#9fc8ff",
          fontSize: 12.5,
          lineHeight: 1.5,
        }}
      >
        💡 Phí spread {spreadLabel} được áp dụng cho giao dịch quốc tế qua PayPal.
        USD là loại tiền charge bắt buộc của PayPal.
      </div>
    </div>
  );
}

export default PayPalExchangeRateCard;
