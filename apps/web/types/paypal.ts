// ============================================================================
// PayPal Top-up UI — Type Definitions
// Theo bản thiết kế: docs/roadmap/PAYPAL-FRONTEND-UI-DESIGN.md (mục IX)
// Lượt 1 — Frontend apps/web (Next.js 16 App Router)
// ----------------------------------------------------------------------------
// Quy ước tên: giữ tên canonical theo design doc, đồng thời export các alias
// mà tác vụ Lượt 1 yêu cầu (PayPalOrderPayload, PayPalVerifyResponse,
// PayPalExchangeRate, PayPalMachineState) để các lượt sau import nhất quán.
// ============================================================================

// ─────────────── Phases (State Machine) ───────────────
export type PayPalTopupPhase =
  | "form" //     Màn hình nhập số tiền + tỷ giá
  | "loading" //  Đang tạo order / load SDK
  | "buttons" //  PayPal Smart Buttons đã sẵn sàng
  | "success" //  Thanh toán thành công
  | "cancel" //   Người dùng hủy trên PayPal Popup
  | "error"; //   Lỗi (network / server / PayPal)

// ─────────────── Exchange Rate ───────────────
// Canonical: PayPalFxRate. Alias yêu cầu Lượt 1: PayPalExchangeRate.
export interface PayPalFxRate {
  fxRate: number; //        VND per 1 USD (vd: 25400)
  spreadRate: number; //    0.01 = 1%
  spreadLabel: string; //   "1%"
  currencyPair: string; //  "USD/VND"
  updatedAt: string; //     ISO string
  source: string; //        "open-exchange-rates" | "fallback-hardcoded" | ...
}

/** Alias theo yêu cầu tác vụ Lượt 1 — đồng bộ với PayPalFxRate. */
export type PayPalExchangeRate = PayPalFxRate;

/** Kết quả tính toán quy đổi VND → USD (dùng cho Exchange Rate Widget). */
export interface PayPalExchangeQuote {
  vndInput: bigint; //      Số VND người dùng nhập (đã làm tròn bội số 1.000)
  fxRate: number; //        Tỷ giá gốc VND/USD
  spreadRate: number; //    Tỷ lệ spread (0.01 = 1%)
  usdBase: string; //       USD gốc chưa spread  (vndInput / fxRate)
  usdSpread: string; //     Phần USD cộng thêm do spread
  usdCharge: string; //     USD thực charge qua PayPal (usdBase * (1+spread))
  vndSpread: bigint; //     Số VND mất đi do spread (vndInput * spreadRate)
  vndReceived: bigint; //   Số VND thực nhận vào Ledger (vndInput * (1-spread))
}

// ─────────────── Create Order ───────────────
// Canonical: PayPalCreateOrderPayload. Alias yêu cầu Lượt 1: PayPalOrderPayload.
export interface PayPalCreateOrderPayload {
  orderId: string; //       AIFUT internal order ID (vd: PP-...)
  amount: string; //        BigInt as string (số VND)
  currency: string; //      "USD"
  description: string;
  returnUrl: string;
  cancelUrl: string;
}

/** Alias theo yêu cầu tác vụ Lượt 1 — đồng bộ với PayPalCreateOrderPayload. */
export type PayPalOrderPayload = PayPalCreateOrderPayload;

export interface PayPalCreateOrderResponse {
  success: boolean;
  data?: {
    paypalOrderId: string;
    approvalUrl: string;
    orderId: string;
    amount: string;
    currency: string;
  };
  error?: string;
}

// ─────────────── Verify ───────────────
export interface PayPalVerifyResponse {
  success: boolean;
  data?: {
    paypalOrderId: string;
    paypalOrderStatus: string;
    captureStatus?: string;
    reconciled: boolean;
    grossAmount?: string;
    netAmount?: string;
    currency?: string;
  };
  error?: string;
}

// ─────────────── UI / Machine State ───────────────
// Canonical: PayPalTopupState. Alias yêu cầu Lượt 1: PayPalMachineState.
export interface PayPalTopupState {
  phase: PayPalTopupPhase;
  vndInput: string; //          Raw user input (vd: "1.000.000")
  vndBigInt: bigint; //         Parsed BigInt (vd: 1000000n)
  usdCharge: string; //         USD charge (vd: "39.76")
  vndReceived: string; //       VND thực nhận sau spread
  fxRate: PayPalFxRate | null;
  paypalOrderId: string | null;
  approvalUrl: string | null;
  orderId: string | null; //    AIFUT internal order ID
  errorMessage: string | null;
  currentBalance: string | null; // Sau khi refresh success
  countdown: number; //         Auto-redirect countdown (success screen)
}

/** Alias theo yêu cầu tác vụ Lượt 1 — đồng bộ với PayPalTopupState. */
export type PayPalMachineState = PayPalTopupState;

// ─────────────── Provider Context value ───────────────
export interface PayPalTopupContextValue {
  state: PayPalTopupState;
  setVndAmount: (raw: string) => void;
  startPayment: () => Promise<void>;
  onApprove: (paypalOrderId: string) => Promise<void>;
  onCancel: () => void;
  onError: (message: string) => void;
  reset: () => void;
  refreshBalance: () => Promise<void>;
}
