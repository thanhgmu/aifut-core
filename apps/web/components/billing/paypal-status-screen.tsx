"use client";

// ============================================================================
// PayPal Payment Status Screen — State Machine 6 giai đoạn
// Theo bản thiết kế: docs/roadmap/PAYPAL-FRONTEND-UI-DESIGN.md (mục VI)
// Lượt 2 — màn hình điều hướng trạng thái, auto-redirect về Ví sau 5 giây
// ----------------------------------------------------------------------------
// Các phase: loading | success | cancel | error
// (form và buttons do paypal-client-shell.tsx render riêng)
// ============================================================================

import { useEffect, useRef, useState, useCallback } from "react";
import type { PayPalTopupPhase } from "../../types/paypal";

// ── Hằng số ──────────────────────────────────────────────────────────────
const AUTO_REDIRECT_SECONDS = 5; //    Design doc mục 6.1.2: auto redirect sau 5s
const WALLET_URL = "/billing/wallet";

// ── Props ─────────────────────────────────────────────────────────────────

interface PayPalStatusScreenProps {
  /** Phase hiện tại (loading | success | cancel | error). */
  phase: Extract<PayPalTopupPhase, "loading" | "success" | "cancel" | "error">;
  /** Số VND thực nhận (hiển thị ở success). */
  vndReceived?: string;
  /** Số dư hiện tại sau nạp (hiển thị ở success). */
  currentBalance?: string | null;
  /** Mã giao dịch / order ID (hiển thị ở success). */
  transactionId?: string | null;
  /** Thông báo lỗi (hiển thị ở error). */
  errorMessage?: string | null;
  /** Callback khi user click "Thử lại" / "Nạp tiền lại". */
  onRetry?: () => void;
  /** Callback khi user click "Hủy" trong khi loading (nếu còn có thể hủy). */
  onCancelLoading?: () => void;
  /** Callback khi auto-redirect countdown kết thúc. */
  onAutoRedirect?: () => void;
}

// ── Helper: format VND ────────────────────────────────────────────────────

function formatVndDisplay(raw: string | undefined | null): string {
  if (!raw) return "0";
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return "0";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// ── Loading Screen ────────────────────────────────────────────────────────

function LoadingScreen({
  onCancelLoading,
}: {
  onCancelLoading?: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 24,
        padding: "40px 24px",
        textAlign: "center",
      }}
    >
      {/* Spinner */}
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          border: "4px solid rgba(120,140,255,0.15)",
          borderTopColor: "#6d7cff",
          animation: "spin 0.8s linear infinite",
        }}
      />

      <div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "#ffffff",
            marginBottom: 8,
          }}
        >
          🔄 ĐANG XỬ LÝ
        </div>
        <div style={{ color: "#c8d2ff", fontSize: 14 }}>
          Đang kết nối cổng thanh toán PayPal...
        </div>
      </div>

      {/* Progress bar */}
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          height: 6,
          background: "rgba(120,140,255,0.12)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: "35%",
            height: "100%",
            background: "linear-gradient(90deg, #6d7cff, #9fb0ff)",
            borderRadius: 3,
            animation: "shimmer 1.5s ease-in-out infinite",
          }}
        />
      </div>

      <div style={{ color: "#9fb0ff", fontSize: 12, opacity: 0.7 }}>
        Vui lòng không đóng trang này
      </div>

      {onCancelLoading && (
        <button
          onClick={onCancelLoading}
          style={{
            padding: "8px 20px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "transparent",
            color: "#c8d2ff",
            fontSize: 13,
            cursor: "pointer",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.05)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          Hủy
        </button>
      )}
    </div>
  );
}

// ── Success Screen ────────────────────────────────────────────────────────

function SuccessScreen({
  vndReceived,
  currentBalance,
  transactionId,
  countdown,
  onGoToWallet,
  onViewInvoice,
}: {
  vndReceived?: string;
  currentBalance?: string | null;
  transactionId?: string | null;
  countdown: number;
  onGoToWallet: () => void;
  onViewInvoice?: () => void;
}) {
  const formattedReceived = formatVndDisplay(vndReceived);
  const balanceAfter = currentBalance
    ? formatVndDisplay(currentBalance)
    : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 24,
        padding: "40px 24px",
        textAlign: "center",
      }}
    >
      {/* Checkmark animation */}
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: "rgba(128,224,160,0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: "successPopIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        <span style={{ fontSize: 36 }}>✅</span>
      </div>

      <div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: "#80e0a0",
            marginBottom: 6,
          }}
        >
          NẠP TIỀN THÀNH CÔNG
        </div>
        <div style={{ color: "#9fb0ff", fontSize: 13 }}>
          Số dư đã được cập nhật
        </div>
      </div>

      {/* Thông tin giao dịch */}
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          padding: 20,
          borderRadius: 12,
          background: "rgba(128,224,160,0.06)",
          border: "1px solid rgba(128,224,160,0.18)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 10,
            fontSize: 14,
          }}
        >
          <span style={{ color: "#c8d2ff" }}>Số tiền nạp</span>
          <span style={{ color: "#80e0a0", fontWeight: 700, fontSize: 18 }}>
            +{formattedReceived}₫
          </span>
        </div>

        {balanceAfter && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 10,
              fontSize: 14,
            }}
          >
            <span style={{ color: "#c8d2ff" }}>Số dư hiện tại</span>
            <span style={{ color: "#ffffff", fontWeight: 700 }}>
              {balanceAfter}₫
            </span>
          </div>
        )}

        {transactionId && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 13,
              paddingTop: 10,
              borderTop: "1px solid rgba(128,224,160,0.12)",
            }}
          >
            <span style={{ color: "#c8d2ff" }}>Mã giao dịch</span>
            <span
              style={{
                color: "#9fb0ff",
                fontFamily: "monospace",
                fontSize: 12,
                cursor: "pointer",
              }}
              title="Click để copy"
              onClick={() => {
                navigator.clipboard.writeText(transactionId).catch(() => {});
              }}
            >
              {transactionId} 📋
            </span>
          </div>
        )}
      </div>

      {/* Countdown */}
      <div style={{ color: "#9fb0ff", fontSize: 13 }}>
        Tự động chuyển về Ví sau{" "}
        <span style={{ fontWeight: 700, color: "#ffffff" }}>{countdown}s</span>
        ...
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 12 }}>
        <button
          onClick={onGoToWallet}
          style={{
            padding: "10px 24px",
            borderRadius: 10,
            border: "none",
            background: "linear-gradient(135deg, #6d7cff, #4a5aff)",
            color: "#ffffff",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.85";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
        >
          Về Ví
        </button>

        {onViewInvoice && (
          <button
            onClick={onViewInvoice}
            style={{
              padding: "10px 24px",
              borderRadius: 10,
              border: "1px solid rgba(120,140,255,0.25)",
              background: "transparent",
              color: "#c8d2ff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(120,140,255,0.08)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            Xem hóa đơn
          </button>
        )}
      </div>
    </div>
  );
}

// ── Cancel Screen ─────────────────────────────────────────────────────────

function CancelScreen({ onRetry }: { onRetry?: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 24,
        padding: "40px 24px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: "rgba(255,200,100,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 36 }}>↩️</span>
      </div>

      <div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "#ffd27a",
            marginBottom: 8,
          }}
        >
          ĐÃ HỦY GIAO DỊCH
        </div>
        <div style={{ color: "#c8d2ff", fontSize: 14, maxWidth: 320 }}>
          Bạn đã hủy thanh toán qua PayPal. Không có khoản phí nào bị trừ.
        </div>
      </div>

      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            padding: "10px 24px",
            borderRadius: 10,
            border: "none",
            background: "linear-gradient(135deg, #6d7cff, #4a5aff)",
            color: "#ffffff",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.85";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
        >
          Nạp tiền lại
        </button>
      )}
    </div>
  );
}

// ── Error Screen ──────────────────────────────────────────────────────────

function ErrorScreen({
  errorMessage,
  onRetry,
}: {
  errorMessage?: string | null;
  onRetry?: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 20,
        padding: "40px 24px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: "rgba(255,80,80,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 36 }}>❌</span>
      </div>

      <div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "#ff6b6b",
            marginBottom: 8,
          }}
        >
          NẠP TIỀN THẤT BẠI
        </div>
        <div
          style={{
            color: "#ff9b9b",
            fontSize: 13,
            maxWidth: 360,
            wordBreak: "break-word",
          }}
        >
          {errorMessage ?? "Đã xảy ra lỗi không xác định. Vui lòng thử lại."}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
        {onRetry && (
          <button
            onClick={onRetry}
            style={{
              padding: "10px 24px",
              borderRadius: 10,
              border: "none",
              background: "linear-gradient(135deg, #6d7cff, #4a5aff)",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "0.85";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "1";
            }}
          >
            Thử lại
          </button>
        )}

        <button
          onClick={() => {
            window.location.href = WALLET_URL;
          }}
          style={{
            padding: "10px 24px",
            borderRadius: 10,
            border: "1px solid rgba(120,140,255,0.25)",
            background: "transparent",
            color: "#c8d2ff",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(120,140,255,0.08)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          Liên hệ hỗ trợ
        </button>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

/**
 * Màn hình trạng thái 6 giai đoạn (State Machine panels).
 *
 * Props:
 *   - phase: loading | success | cancel | error
 *   - Các prop hiển thị tương ứng
 *   - Auto-redirect countdown ở phase "success"
 *
 * Lưu ý: component này KHÔNG quản lý auto-redirect logic bên trong (vì
 * countdown state cần sync với shell). Nhận countdown từ shell.
 */
export function PayPalStatusScreen({
  phase,
  vndReceived,
  currentBalance,
  transactionId,
  errorMessage,
  onRetry,
  onCancelLoading,
  onAutoRedirect,
}: PayPalStatusScreenProps) {
  // Countdown internal (shell có thể override bằng cách truyền countdown prop)
  const [countdown, setCountdown] = useState(AUTO_REDIRECT_SECONDS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const redirectFired = useRef(false);

  // Auto-redirect countdown (chỉ active khi phase === "success")
  useEffect(() => {
    if (phase !== "success") {
      // Reset countdown khi rời success
      setCountdown(AUTO_REDIRECT_SECONDS);
      redirectFired.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Phase === "success" => start countdown
    setCountdown(AUTO_REDIRECT_SECONDS);
    redirectFired.current = false;

    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          // Clear interval trước
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          // Fire auto-redirect một lần
          if (!redirectFired.current) {
            redirectFired.current = true;
            // Dùng setTimeout để tránh setState trong cleanup
            setTimeout(() => {
              onAutoRedirect?.();
            }, 0);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1_000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [phase, onAutoRedirect]);

  // Navigate về wallet
  const goToWallet = useCallback(() => {
    window.location.href = WALLET_URL;
  }, []);

  // View invoice placeholder
  const viewInvoice = useCallback(() => {
    if (transactionId) {
      window.location.href = `/billing/invoices?id=${transactionId}`;
    }
  }, [transactionId]);

  switch (phase) {
    case "loading":
      return <LoadingScreen onCancelLoading={onCancelLoading} />;

    case "success":
      return (
        <SuccessScreen
          vndReceived={vndReceived}
          currentBalance={currentBalance}
          transactionId={transactionId}
          countdown={countdown}
          onGoToWallet={goToWallet}
          onViewInvoice={transactionId ? viewInvoice : undefined}
        />
      );

    case "cancel":
      return <CancelScreen onRetry={onRetry} />;

    case "error":
      return <ErrorScreen errorMessage={errorMessage} onRetry={onRetry} />;

    default:
      return null;
  }
}

export default PayPalStatusScreen;
