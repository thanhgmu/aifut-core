"use client";

// ============================================================================
// PayPal Smart Buttons — tích hợp @paypal/react-paypal-js
// Theo bản thiết kế: docs/roadmap/PAYPAL-FRONTEND-UI-DESIGN.md (mục IV)
// Lượt 2 — xử lý luồng createOrder gốc sang backend + onApprove retry 3 lần
// ----------------------------------------------------------------------------
// File này CHỈ tập trung vào render PayPalButtons gốc của SDK.
// State machine do paypal-client-shell.tsx quản lý.
// ============================================================================

import { useCallback, useRef, useState } from "react";
import { PayPalButtons, usePayPalScriptReducer } from "@paypal/react-paypal-js";
import { API_BASE, getStoredToken } from "../../lib/auth";
import type { PayPalTopupPhase } from "../../types/paypal";

// ── Hằng số ──────────────────────────────────────────────────────────────
const CREATE_ORDER_MAX_RETRIES = 2; //     Design doc mục 4.3: createOrder timeout 15s, retry 2 lần
const CREATE_ORDER_TIMEOUT_MS = 15_000; // Timeout gốc cho mỗi lần gọi createOrder
const VERIFY_RETRIES = 3; //               Design doc mục 4.3: verify retry mỗi 2s × 3 lần
const VERIFY_RETRY_DELAY_MS = 2_000;
const RECONCILE_PATH = "/payments/paypal/reconcile";

// ── Props ─────────────────────────────────────────────────────────────────

interface PayPalButtonsShellProps {
  /** Số VND đã parse (BigInt string) — gửi sang backend createOrder. */
  vndAmount: string;
  /** USD charge đã tính (decimal string) — backend dùng để tạo PayPal order. */
  usdCharge: string;
  /** Số VND thực nhận (display). */
  vndReceived: string;
  /** FX rate (VND/USD) — backend cần cho tính toán. */
  fxRate: number;
  /** Spread rate (decimal, vd: 0.01). */
  spreadRate: number;
  /** Callback khi order được tạo thành công (phase → "buttons" contextual). */
  onOrderCreated?: (paypalOrderId: string, approvalUrl: string) => void;
  /** Callback khi thanh toán xác nhận thành công. */
  onApproveComplete?: (paypalOrderId: string) => void;
  /** Callback khi user hủy popup. */
  onCancel?: () => void;
  /** Callback khi có lỗi. */
  onError?: (message: string) => void;
  /** Force disable buttons (đang xử lý). */
  disabled?: boolean;
}

// ── Inline API helpers (không phụ thuộc lib/paypal.ts) ────────────────────

function authHeaders(json = false): Record<string, string> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

/**
 * POST /payments/paypal/create-order với timeout + retry.
 * Retry tối đa CREATE_ORDER_MAX_RETRIES lần.
 */
async function createPayPalOrderRemote(
  vndAmount: string,
  usdCharge: string,
  fxRate: number,
  spreadRate: number,
  signal?: AbortSignal,
): Promise<{ paypalOrderId: string; approvalUrl: string }> {
  const description =
    `Nạp tiền Ví AIFUT (${vndAmount} VND ~ $${usdCharge} USD)`;

  // Tạo internal orderId client-side (design doc lib/paypal.ts generateOrderId)
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  const orderId = `PP-${ts}${rand}`;

  for (let attempt = 0; attempt <= CREATE_ORDER_MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CREATE_ORDER_TIMEOUT_MS);

      // Gộp cả signal bên ngoài (nếu có)
      const combinedSignal = signal
        ? combineAbortSignals(signal, controller.signal)
        : controller.signal;

      const res = await fetch(`${API_BASE}/payments/paypal/create-order`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          orderId,
          amount: vndAmount,
          currency: "USD",
          description,
          returnUrl: window.location.href,
          cancelUrl: window.location.href,
          fxRate,
          spreadRate,
        }),
        signal: combinedSignal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error ?? errBody?.message ?? `HTTP ${res.status}`);
      }

      const json = await res.json();

      if (!json.success || !json.data?.paypalOrderId) {
        throw new Error(json?.error ?? "Backend trả về success=false");
      }

      return {
        paypalOrderId: json.data.paypalOrderId,
        approvalUrl: json.data.approvalUrl ?? "",
      };
    } catch (err: unknown) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      const isLast = attempt >= CREATE_ORDER_MAX_RETRIES;

      if (isLast || isAbort) {
        throw new Error(
          isAbort
            ? `Không thể tạo đơn hàng PayPal (quá thời gian chờ sau ${CREATE_ORDER_MAX_RETRIES + 1} lần thử)`
            : `Không thể tạo đơn hàng PayPal: ${err instanceof Error ? err.message : "Lỗi không xác định"}`,
        );
      }

      // Chờ 1s rồi retry
      await new Promise((r) => setTimeout(r, 1_000));
    }
  }

  throw new Error("Không thể tạo đơn hàng PayPal");
}

/**
 * GET /payments/paypal/verify/:orderId — retry tối đa VERIFY_RETRIES lần,
 * mỗi lần cách VERIFY_RETRY_DELAY_MS. Nếu vẫn pending, gọi reconcile fallback.
 */
async function verifyPayPalOrderRemote(
  paypalOrderId: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < VERIFY_RETRIES; attempt++) {
    try {
      const res = await fetch(
        `${API_BASE}/payments/paypal/verify/${encodeURIComponent(paypalOrderId)}`,
        { headers: authHeaders(), cache: "no-store" },
      );

      if (!res.ok) {
        if (attempt < VERIFY_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, VERIFY_RETRY_DELAY_MS));
          continue;
        }
        break;
      }

      const json = await res.json();

      if (json.success && json.data?.reconciled) {
        return true; // ✅ Thành công
      }

      if (json.success && json.data?.captureStatus === "COMPLETED") {
        // Order captured nhưng chưa reconciled → retry một lần nữa
        if (attempt < VERIFY_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, VERIFY_RETRY_DELAY_MS));
          continue;
        }
      }

      if (attempt < VERIFY_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, VERIFY_RETRY_DELAY_MS));
      }
    } catch {
      if (attempt < VERIFY_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, VERIFY_RETRY_DELAY_MS));
      }
    }
  }

  // Fallback: gọi reconcile để backend đồng bộ
  try {
    const reconcileRes = await fetch(`${API_BASE}${RECONCILE_PATH}`, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ paypalOrderId }),
    });
    const reconcileJson = await reconcileRes.json();
    return Boolean(reconcileJson.success && reconcileJson.data?.reconciled);
  } catch {
    return false;
  }
}

/** Helper: gộp 2 AbortSignal (polyfill khi cần). */
function combineAbortSignals(
  s1: AbortSignal,
  s2: AbortSignal,
): AbortSignal {
  if (s1.aborted || s2.aborted) {
    return AbortSignal.abort();
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  s1.addEventListener("abort", onAbort, { once: true });
  s2.addEventListener("abort", onAbort, { once: true });
  return controller.signal;
}

// ── Component ─────────────────────────────────────────────────────────────

/**
 * PayPal Smart Buttons wrapper.
 *
 * Luồng xử lý:
 *   1. SDK ready → render nút PayPal
 *   2. User click → createOrder → POST /payments/paypal/create-order (retry 2×)
 *   3. PayPal popup → user approve → onApprove → verify (retry 3×) → reconcile fallback
 *   4. Cancel / Error → callback
 *
 * Edge cases (design doc mục 4.3):
 *   - Double-click: disable nút sau click đầu
 *   - createOrder timeout: retry 2 lần
 *   - onApprove webhook chưa kịp: retry verify 3 × 2s → reconcile fallback
 *   - Popup blocked: handled bởi SDK (shows approvalUrl fallback)
 */
export function PayPalButtonsShell({
  vndAmount,
  usdCharge,
  vndReceived,
  fxRate,
  spreadRate,
  onOrderCreated,
  onApproveComplete,
  onCancel,
  onError,
  disabled = false,
}: PayPalButtonsShellProps) {
  const [{ isPending, isRejected }] = usePayPalScriptReducer();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Ref để tránh double-fire trong strict mode
  const isProcessingRef = useRef(false);

  // ── createOrder ─────────────────────────────────────────────────────────
  const handleCreateOrder = useCallback(async (): Promise<string | null> => {
    if (isProcessingRef.current) return null;
    isProcessingRef.current = true;
    setIsSubmitting(true);

    try {
      const { paypalOrderId, approvalUrl } = await createPayPalOrderRemote(
        vndAmount,
        usdCharge,
        fxRate,
        spreadRate,
      );

      onOrderCreated?.(paypalOrderId, approvalUrl);

      // Trả về paypalOrderId cho SDK (PayPal cần order ID để mở popup)
      return paypalOrderId;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Không thể khởi tạo thanh toán";
      onError?.(message);
      return null; // SDK sẽ không mở popup
    } finally {
      setIsSubmitting(false);
      isProcessingRef.current = false;
    }
  }, [vndAmount, usdCharge, fxRate, spreadRate, onOrderCreated, onError]);

  // ── onApprove ───────────────────────────────────────────────────────────
  const handleApprove = useCallback(
    async (data: { orderID: string }) => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;
      setIsSubmitting(true);

      try {
        const success = await verifyPayPalOrderRemote(data.orderID);

        if (success) {
          onApproveComplete?.(data.orderID);
        } else {
          onError?.(
            "Giao dịch PayPal chưa được xác nhận. " +
              "Vui lòng kiểm tra số dư Ví sau. " +
              "Nếu tiền đã trừ, liên hệ hỗ trợ.",
          );
        }
      } catch (err: unknown) {
        onError?.(
          err instanceof Error
            ? err.message
            : "Lỗi xác nhận giao dịch PayPal",
        );
      } finally {
        setIsSubmitting(false);
        isProcessingRef.current = false;
      }
    },
    [onApproveComplete, onError],
  );

  // ── onCancel ────────────────────────────────────────────────────────────
  const handleCancel = useCallback(() => {
    onCancel?.();
  }, [onCancel]);

  // ── Render ──────────────────────────────────────────────────────────────

  // SDK failed to load
  if (isRejected) {
    return (
      <div
        style={{
          padding: 20,
          borderRadius: 12,
          background: "rgba(255,80,80,0.1)",
          border: "1px solid rgba(255,80,80,0.25)",
          color: "#ff9b9b",
          fontSize: 14,
          textAlign: "center",
        }}
      >
        ❌ Không thể tải PayPal SDK. Vui lòng tải lại trang hoặc liên hệ hỗ trợ.
      </div>
    );
  }

  // SDK is pending (deferred loading)
  if (isPending) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          padding: 24,
          color: "#c8d2ff",
          fontSize: 14,
        }}
      >
        <span style={{ animation: "spin 1s linear infinite" }}>🔄</span>
        Đang tải PayPal...
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      {/* Lớp phủ khi đang xử lý (chống double-click) */}
      {(isSubmitting || disabled) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            background: "rgba(0,0,0,0.3)",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#c8d2ff",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {isSubmitting ? "⏳ Đang xử lý..." : ""}
        </div>
      )}

      <PayPalButtons
        style={{ layout: "vertical", color: "gold", shape: "rect", label: "paypal" }}
        disabled={isSubmitting || disabled}
        createOrder={async (data, actions) => {
  const orderId = await handleCreateOrder();
  if (!orderId) throw new Error("PAYPAL_CREATE_ORDER_FAILED");
  return orderId;
}}
        onApprove={handleApprove}
        onCancel={handleCancel}
onError={(err: any) => {
  const errorMsg = String(err?.message || err || "Lỗi không xác định từ PayPal SDK");
  onError?.(errorMsg);
}}
      />

      {/* Thông tin thêm dưới nút */}
      <div
        style={{
          marginTop: 12,
          textAlign: "center",
          color: "#9fb0ff",
          fontSize: 12,
          opacity: 0.7,
        }}
      >
        Bạn sẽ charge ${usdCharge} USD — nhận +{vndReceived} VND vào Ví
      </div>
    </div>
  );
}

export default PayPalButtonsShell;
