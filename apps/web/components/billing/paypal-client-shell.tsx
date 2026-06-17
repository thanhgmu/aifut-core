"use client";

// ============================================================================
// PayPal Client Shell — Orchestration State Machine
// Theo bản thiết kế: docs/roadmap/PAYPAL-FRONTEND-UI-DESIGN.md (mục VII)
// Lượt 2 — phối hợp nạp dữ liệu, loading states, error boundaries
// ----------------------------------------------------------------------------
// Shell này quản lý state machine toàn bộ luồng nạp tiền PayPal:
//   form → loading → buttons → success | cancel | error
// ============================================================================

import React, { useCallback, useEffect, useRef, useState } from "react";
import { PayPalProvider } from "./paypal-provider";
import { PayPalExchangeRateCard } from "./paypal-exchange-rate-card";
import { PayPalButtonsShell } from "./paypal-buttons";
import { PayPalStatusScreen } from "./paypal-status-screen";
import { API_BASE, getStoredToken } from "../../lib/auth";
import type { PayPalTopupPhase, PayPalFxRate } from "../../types/paypal";
// import { fetchWalletBalance } from "../../lib/wallet"; // sẵn có, dùng sau

// ── Hằng số ──────────────────────────────────────────────────────────────
const WALLET_URL = "/billing/wallet";
const MIN_VND = 10_000;
const FALLBACK_FX_RATE = 25_400;
const FALLBACK_SPREAD = 0.01;

// ── Trạng thái nội bộ ────────────────────────────────────────────────────

interface ShellState {
  phase: PayPalTopupPhase;
  vndInput: string;
  vndBigInt: bigint;
  usdCharge: string;
  vndReceived: string;
  fxRate: PayPalFxRate | null;
  paypalOrderId: string | null;
  approvalUrl: string | null;
  orderId: string | null;
  errorMessage: string | null;
  currentBalance: string | null;
  walletLocked: boolean;
}

const INITIAL_STATE: ShellState = {
  phase: "form",
  vndInput: "",
  vndBigInt: 0n,
  usdCharge: "0.00",
  vndReceived: "0",
  fxRate: null,
  paypalOrderId: null,
  approvalUrl: null,
  orderId: null,
  errorMessage: null,
  currentBalance: null,
  walletLocked: false,
};

// ── Helpers ──────────────────────────────────────────────────────────────

function authHeaders(json = false): Record<string, string> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

/** Parse BigInt an toàn từ string input. */
function parseVndInput(raw: string): bigint {
  const digits = (raw || "").replace(/[^0-9]/g, "");
  if (!digits) return 0n;
  try {
    return BigInt(digits);
  } catch {
    return 0n;
  }
}

/** Format số VND có dấu chấm hàng nghìn. */
function formatVnd(vnd: bigint): string {
  return vnd.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Làm tròn xuống bội số 1.000₫. */
function roundDownVnd(vnd: bigint): bigint {
  if (vnd <= 0n) return 0n;
  return (vnd / 1_000n) * 1_000n;
}

/**
 * Tính USD charge + VND received từ input VND + FX rate + spread.
 * Công thức theo design doc mục 5.2.
 */
function computeQuote(
  vndInput: bigint,
  fxRate: number,
  spreadRate: number,
): { usdCharge: string; vndReceived: string } {
  const vnd = roundDownVnd(vndInput);
  const fx = fxRate > 0 ? fxRate : FALLBACK_FX_RATE;
  const spr = spreadRate >= 0 ? spreadRate : FALLBACK_SPREAD;

  const usdBase = Number(vnd) / fx;
  const usdChargeNum = Math.round(usdBase * (1 + spr) * 100) / 100;

  const spreadBp = BigInt(Math.round(spr * 10_000));
  const vndSpread = (vnd * spreadBp) / 10_000n;
  const vndReceivedNum = vnd - vndSpread;

  return {
    usdCharge: usdChargeNum.toFixed(2),
    vndReceived: vndReceivedNum.toString(),
  };
}

// ── Error Boundary Component ─────────────────────────────────────────────

class PayPalErrorBoundary extends React.Component<
  { children: React.ReactNode; onError?: (error: Error) => void },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; onError?: (error: Error) => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 32,
            borderRadius: 16,
            background: "rgba(255,80,80,0.08)",
            border: "1px solid rgba(255,80,80,0.2)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: "#ff6b6b", marginBottom: 8 }}>
            ❌ Đã xảy ra lỗi hiển thị
          </div>
          <div style={{ color: "#ff9b9b", fontSize: 13, marginBottom: 16, wordBreak: "break-word" }}>
            {this.state.error?.message ?? "Lỗi không xác định"}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              border: "none",
              background: "linear-gradient(135deg, #6d7cff, #4a5aff)",
              color: "#ffffff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Tải lại trang
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}



// ── Main Component ────────────────────────────────────────────────────────

/**
 * PayPal Client Shell — Orchestrator toàn bộ luồng nạp tiền PayPal.
 *
 * Quản lý:
 *   - State machine 6 phase (form → loading → buttons → success|cancel|error)
 *   - Fetch FX rate khi mount
 *   - Tính toán quote real-time khi user nhập số tiền
 *   - Tạo order, verify, reconcile
 *   - Auto-redirect countdown
 *   - Error boundary bọc toàn bộ component
 */
export function PayPalClientShell() {
  const [state, setState] = useState<ShellState>(INITIAL_STATE);
  const fxFetchedRef = useRef(false);
  const balanceFetchedRef = useRef(false);

  // ── Effect 1: Fetch FX rate khi mount ──────────────────────────────────
  useEffect(() => {
    if (fxFetchedRef.current) return;
    fxFetchedRef.current = true;

    const doFetchFx = async () => {
      try {
        const res = await fetch(`${API_BASE}/payments/paypal/fx-rate`, {
          headers: authHeaders(),
          cache: "no-store",
        });

        if (res.ok) {
          const data: PayPalFxRate = await res.json();
          setState((prev) => ({ ...prev, fxRate: data }));
        } else {
          // Fallback: hardcode 25.400 + 1%
          setState((prev) => ({
            ...prev,
            fxRate: {
              fxRate: FALLBACK_FX_RATE,
              spreadRate: FALLBACK_SPREAD,
              spreadLabel: "1%",
              currencyPair: "USD/VND",
              updatedAt: new Date().toISOString(),
              source: "fallback-hardcoded",
            },
          }));
        }
      } catch {
        // Network error → fallback
        setState((prev) => ({
          ...prev,
          fxRate: {
            fxRate: FALLBACK_FX_RATE,
            spreadRate: FALLBACK_SPREAD,
            spreadLabel: "1%",
            currencyPair: "USD/VND",
            updatedAt: new Date().toISOString(),
            source: "fallback-hardcoded",
          },
        }));
      }
    };

    doFetchFx();
  }, []);

  // ── Effect 2: Fetch wallet balance + lock status khi mount ──────────────
  useEffect(() => {
    if (balanceFetchedRef.current) return;
    balanceFetchedRef.current = true;

    const doFetchBalance = async () => {
      try {
        const res = await fetch(`${API_BASE}/billing/wallet/balance`, {
          headers: authHeaders(),
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          setState((prev) => ({
            ...prev,
            currentBalance: String(data?.balance ?? prev.currentBalance ?? "0"),
            walletLocked: data?.status === "locked",
          }));
        }
      } catch {
        // Silent — balance không critical
      }
    };

    doFetchBalance();
  }, []);

  // ── Input change handler ────────────────────────────────────────────────
  const handleVndChange = useCallback(
    (raw: string) => {
      const vndBigInt = parseVndInput(raw);
      const fx = state.fxRate;

      if (vndBigInt === 0n) {
        setState((prev) => ({
          ...prev,
          vndInput: raw,
          vndBigInt: 0n,
          usdCharge: "0.00",
          vndReceived: "0",
        }));
        return;
      }

      const { usdCharge, vndReceived } = computeQuote(
        vndBigInt,
        fx?.fxRate ?? FALLBACK_FX_RATE,
        fx?.spreadRate ?? FALLBACK_SPREAD,
      );

      setState((prev) => ({
        ...prev,
        vndInput: raw,
        vndBigInt,
        usdCharge,
        vndReceived,
      }));
    },
    [state.fxRate],
  );

  // ── Start payment ──────────────────────────────────────────────────────
  const handleStartPayment = useCallback(() => {
    if (state.walletLocked) {
      setState((prev) => ({
        ...prev,
        phase: "error",
        errorMessage: "Ví đang bị khóa. Vui lòng liên hệ admin.",
      }));
      return;
    }

    const vndNum = Number(state.vndBigInt);
    if (vndNum < MIN_VND) {
      setState((prev) => ({
        ...prev,
        phase: "error",
        errorMessage: `Số tiền tối thiểu: ${formatVnd(BigInt(MIN_VND))}₫`,
      }));
      return;
    }

    // Transition: form → loading
    setState((prev) => ({
      ...prev,
      phase: "loading",
      errorMessage: null,
    }));
  }, [state.walletLocked, state.vndBigInt]);

  // ── Order created callback (từ buttons) ────────────────────────────────
  const handleOrderCreated = useCallback(
    (paypalOrderId: string, approvalUrl: string) => {
      setState((prev) => ({
        ...prev,
        phase: "buttons", // SDK buttons sẽ render
        paypalOrderId,
        approvalUrl,
      }));
    },
    [],
  );

  // ── Approve complete (từ buttons) ──────────────────────────────────────
  const handleApproveComplete = useCallback(
    async (paypalOrderId: string) => {
      // Refresh wallet balance
      let newBalance: string | null = null;
      try {
        const res = await fetch(`${API_BASE}/billing/wallet/balance`, {
          headers: authHeaders(),
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          newBalance = String(data?.balance ?? "0");
        }
      } catch {
        // Silent
      }

      setState((prev) => ({
        ...prev,
        phase: "success",
        paypalOrderId,
        currentBalance: newBalance ?? prev.currentBalance,
      }));
    },
    [],
  );

  // ── Cancel handler ──────────────────────────────────────────────────
  const handleCancel = useCallback(() => {
    setState((prev) => ({ ...prev, phase: "cancel" }));
  }, []);

  // ── Error handler ───────────────────────────────────────────────────
  const handleError = useCallback((message: string) => {
    setState((prev) => ({ ...prev, phase: "error", errorMessage: message }));
  }, []);

  // ── Retry ────────────────────────────────────────────────────────────
  const handleRetry = useCallback(() => {
    setState((prev) => ({
      ...prev,
      phase: "form",
      errorMessage: null,
      paypalOrderId: null,
      approvalUrl: null,
      orderId: null,
    }));
  }, []);

  // ── Cancel loading (quay về form) ─────────────────────────────────────
  const handleCancelLoading = useCallback(() => {
    setState((prev) => ({
      ...prev,
      phase: "form",
      errorMessage: null,
    }));
  }, []);

  // ── Auto-redirect ─────────────────────────────────────────────────────
  const handleAutoRedirect = useCallback(() => {
    window.location.href = WALLET_URL;
  }, []);

  // ── Render theo phase ──────────────────────────────────────────────────
  const renderContent = () => {
    switch (state.phase) {
      case "form":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <PayPalExchangeRateCard
              vndInput={state.vndInput}
              fxRate={state.fxRate}
              onChange={handleVndChange}
              currentBalance={state.currentBalance}
              disabled={state.walletLocked}
            />

            {/* Wallet locked banner */}
            {state.walletLocked && (
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: 10,
                  background: "rgba(255,200,100,0.1)",
                  border: "1px solid rgba(255,200,100,0.2)",
                  color: "#ffd27a",
                  fontSize: 14,
                  fontWeight: 600,
                  textAlign: "center",
                }}
              >
                🔒 Ví đang bị khóa. Vui lòng liên hệ admin để mở khóa.
              </div>
            )}

            {/* Start payment button */}
            {!state.walletLocked && (
              <button
                onClick={handleStartPayment}
                disabled={
                  Number(state.vndBigInt) < MIN_VND || state.vndBigInt === 0n
                }
                style={{
                  width: "100%",
                  padding: "14px 20px",
                  borderRadius: 12,
                  border: "none",
                  background:
                    Number(state.vndBigInt) < MIN_VND || state.vndBigInt === 0n
                      ? "rgba(120,140,255,0.15)"
                      : "linear-gradient(135deg, #0070ba, #1546a0)",
                  color:
                    Number(state.vndBigInt) < MIN_VND || state.vndBigInt === 0n
                      ? "#9fb0ff"
                      : "#ffffff",
                  fontSize: 16,
                  fontWeight: 700,
                  cursor:
                    Number(state.vndBigInt) < MIN_VND || state.vndBigInt === 0n
                      ? "not-allowed"
                      : "pointer",
                  transition: "opacity 0.15s",
                  opacity: 1,
                }}
                onMouseEnter={(e) => {
                  if (
                    Number(state.vndBigInt) >= MIN_VND &&
                    state.vndBigInt !== 0n
                  ) {
                    e.currentTarget.style.opacity = "0.85";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = "1";
                }}
              >
                🌍 Nạp qua PayPal
              </button>
            )}

            {/* Footer info */}
            <div
              style={{
                textAlign: "center",
                color: "#9fb0ff",
                fontSize: 12,
                opacity: 0.7,
              }}
            >
              Được bảo vệ bởi PayPal Seller Protection.
              <br />
              Bạn sẽ được chuyển đến PayPal để hoàn tất thanh toán.
            </div>
          </div>
        );

      case "loading":
        return (
          <>
            {/* Loading screen hiển thị khi đợi createOrder */}
            <PayPalStatusScreen
              phase="loading"
              onCancelLoading={handleCancelLoading}
            />

            {/* Ẩn: tạo order và chuyển sang buttons */}
            <div style={{ display: "none" }}>
              <PayPalProvider>
                <PayPalButtonsShell
                  vndAmount={state.vndBigInt.toString()}
                  usdCharge={state.usdCharge}
                  vndReceived={state.vndReceived}
                  fxRate={state.fxRate?.fxRate ?? FALLBACK_FX_RATE}
                  spreadRate={state.fxRate?.spreadRate ?? FALLBACK_SPREAD}
                  onOrderCreated={handleOrderCreated}
                  onApproveComplete={handleApproveComplete}
                  onCancel={handleCancel}
                  onError={handleError}
                />
              </PayPalProvider>
            </div>
          </>
        );

      case "buttons":
        return (
          <PayPalProvider>
            <PayPalButtonsShell
              vndAmount={state.vndBigInt.toString()}
              usdCharge={state.usdCharge}
              vndReceived={state.vndReceived}
              fxRate={state.fxRate?.fxRate ?? FALLBACK_FX_RATE}
              spreadRate={state.fxRate?.spreadRate ?? FALLBACK_SPREAD}
              onOrderCreated={handleOrderCreated}
              onApproveComplete={handleApproveComplete}
              onCancel={handleCancel}
              onError={handleError}
            />
          </PayPalProvider>
        );

      case "success":
        return (
          <PayPalStatusScreen
            phase="success"
            vndReceived={state.vndReceived}
            currentBalance={state.currentBalance}
            transactionId={state.paypalOrderId}
            onRetry={handleRetry}
            onAutoRedirect={handleAutoRedirect}
          />
        );

      case "cancel":
        return (
          <PayPalStatusScreen
            phase="cancel"
            onRetry={handleRetry}
            onAutoRedirect={handleAutoRedirect}
          />
        );

      case "error":
        return (
          <PayPalStatusScreen
            phase="error"
            errorMessage={state.errorMessage}
            onRetry={handleRetry}
            onAutoRedirect={handleAutoRedirect}
          />
        );

      default:
        return null;
    }
  };

  return (
    <PayPalErrorBoundary onError={(err) => handleError(err.message)}>
      <div
        style={{
          maxWidth: 560,
          margin: "0 auto",
          position: "relative",
        }}
      >
        {renderContent()}
      </div>
    </PayPalErrorBoundary>
  );
}

export default PayPalClientShell;
