"use client";

// ============================================================================
// PayPal SDK Script Provider — bọc '@paypal/react-paypal-js'
// Theo bản thiết kế: docs/roadmap/PAYPAL-FRONTEND-UI-DESIGN.md (mục IV, XI)
// Lượt 1 — thiết lập trình nạp script PayPal an toàn (PayPalScriptProvider),
// kế thừa ClientID từ biến môi trường hệ thống (NEXT_PUBLIC_PAYPAL_CLIENT_ID).
// ----------------------------------------------------------------------------
// Ghi chú: file này CHỈ phụ trách nạp SDK chính thức + cấu hình script options.
// Phần React Context state-machine (usePayPalTopup) sẽ được bổ sung ở lượt sau
// theo mục XI của design doc, để tách biệt rõ "SDK loader" và "state orchestrator".
// ============================================================================

import { type ReactNode, useMemo } from "react";
import {
  PayPalScriptProvider,
  type ReactPayPalScriptOptions,
} from "@paypal/react-paypal-js";

/**
 * ClientID lấy từ env hệ thống. PayPal Smart Buttons chỉ charge bằng USD
 * (xem design doc mục V — PAYPAL_CURRENCY mismatch). Dùng "sb" (sandbox) làm
 * fallback an toàn cho môi trường dev nếu env chưa cấu hình, tránh crash UI.
 */
const PAYPAL_CLIENT_ID =
  process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim() || "sb";

const PAYPAL_CURRENCY =
  process.env.NEXT_PUBLIC_PAYPAL_CURRENCY?.trim() || "USD";

interface PayPalProviderProps {
  children: ReactNode;
  /** Cho phép override clientId (vd: multi-tenant) — mặc định lấy từ env. */
  clientId?: string;
  /** Override currency — mặc định USD (PayPal chỉ hỗ trợ USD cho luồng này). */
  currency?: string;
}

/**
 * Bọc cây component thanh toán bằng PayPalScriptProvider. Đặt deferLoading=true
 * để KHÔNG nạp SDK ngay khi mount (tiết kiệm tài nguyên ở phase "form"); SDK
 * chỉ thực sự được kích hoạt khi component con (paypal-buttons.tsx) yêu cầu
 * render Smart Buttons ở phase "buttons".
 */
export function PayPalProvider({
  children,
  clientId,
  currency,
}: PayPalProviderProps) {
  const resolvedClientId = (clientId?.trim() || PAYPAL_CLIENT_ID) ?? "sb";
  const resolvedCurrency = (currency?.trim() || PAYPAL_CURRENCY) ?? "USD";

  const options = useMemo<ReactPayPalScriptOptions>(
    () => ({
      clientId: resolvedClientId,
      currency: resolvedCurrency,
      intent: "capture",
      components: "buttons",
      // Tải SDK theo yêu cầu, không nạp ngay khi mount provider.
      // (component con bật loading thông qua usePayPalScriptReducer dispatch).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }),
    [resolvedClientId, resolvedCurrency],
  );

  // Cảnh báo dev nếu thiếu clientId thật (chỉ log, không chặn render).
  if (
    typeof window !== "undefined" &&
    process.env.NODE_ENV !== "production" &&
    resolvedClientId === "sb"
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      "[PayPalProvider] NEXT_PUBLIC_PAYPAL_CLIENT_ID chưa được cấu hình — đang dùng sandbox 'sb'.",
    );
  }

  return (
    <PayPalScriptProvider options={options} deferLoading={true}>
      {children}
    </PayPalScriptProvider>
  );
}

export default PayPalProvider;
