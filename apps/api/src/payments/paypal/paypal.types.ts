/**
 * PayPal Gateway SDK — TypeScript interfaces.
 *
 * Three layers of types:
 *   1. Internal AIFUT contracts (Input/Result) consumed by controllers/services.
 *   2. Webhook envelope + resource shapes delivered by PayPal.
 *   3. Raw PayPal REST API response shapes (for parsing /v2/checkout/orders and
 *      /v2/payments/captures).
 *
 * Amounts crossing the AIFUT boundary are BigInt in the smallest internal unit
 * (Wallet.balance convention = VND * 100). PayPal transports decimal strings
 * ("19.99"); conversion is centralized in paypal.utils.ts.
 *
 * Specification: https://developer.paypal.com/api/rest/
 */

// ── OAuth2 ───────────────────────────────────────────────────────────────────

export interface PayPalOAuthToken {
  accessToken: string;
  /** Absolute expiry derived from PayPal `expires_in`. */
  expiresAt: Date;
}

/** Raw shape of POST /v1/oauth2/token. */
export interface PayPalOAuthResponse {
  scope: string;
  access_token: string;
  token_type: string;
  app_id: string;
  expires_in: number;
  nonce?: string;
}

// ── Create Order ──────────────────────────────────────────────────────────────

export interface PayPalCreateOrderInput {
  /** Internal order ID (AIFUT-xxx). */
  orderId: string;
  /** Tenant requesting payment. */
  tenantId: string;
  /** Amount in smallest internal unit (BigInt). */
  amount: bigint;
  /** ISO 4217 currency code (USD, THB, VND…). */
  currency: string;
  /** Human-readable description (truncated to 127 chars). */
  description: string;
  /** URL to redirect user after PayPal approves. Must be HTTPS in production. */
  returnUrl: string;
  /** URL to redirect if user cancels. */
  cancelUrl: string;
  /** Originating client IP (for risk analysis). */
  ipAddress: string;
}

export interface PayPalCreateOrderResult {
  success: boolean;
  /** PayPal Order ID (e.g. "7XH12345678901234"). */
  paypalOrderId?: string;
  /** URL to redirect the user's browser for PayPal approval. */
  approvalUrl?: string;
  /** Echoed amount in internal smallest unit. */
  amount: bigint;
  /** Echoed currency. */
  currency: string;
  /** Internal order ID for reconciliation. */
  orderId: string;
  errorMessage?: string;
}

// ── Capture Order — Input/Result (mới) ────────────────────────────────────────

/**
 * Đầu vào cho capturePayPalOrder().
 * tenantId LUÔN được phân giải từ auth context (x-tenant-id / x-tenant-slug),
 * KHÔNG BAO GIỜ nhận từ body (chống IDOR).
 */
export interface PayPalCaptureOrderInput {
  /** PayPal Order ID trả về từ create-order. */
  paypalOrderId: string;
  /** Tenant phân giải từ context (IDOR-safe). */
  tenantId: string;
  /** orderId nội bộ kỳ vọng (đối soát chéo, tuỳ chọn). */
  expectedOrderId?: string;
}

/** Kết quả trả về từ capturePayPalOrder(). */
export interface PayPalCaptureOrderResult {
  success: boolean;
  paypalOrderId: string;
  captureId?: string;
  /** COMPLETED | DECLINED | PENDING. */
  captureStatus?: string;
  /** PayPal decimal string (tổng thu). */
  grossAmount?: string;
  /** Số tiền sau phí PayPal. */
  netAmount?: string;
  /** Phí PayPal (decimal string). */
  paypalFee?: string;
  /** Currency code. */
  currency?: string;
  /** Internal BigInt đã nạp vào ví (smallest unit). */
  internalAmount?: bigint;
  /** Đã nạp ví thành công. */
  walletCredited: boolean;
  /** Hiển thị số dư mới (format VNĐ). */
  newBalanceDisplay?: string;
  /** Ledger transaction ID (nếu nạp thành công). */
  ledgerTransactionId?: string;
  /** Subscription được kích hoạt (best-effort). */
  subscriptionActivated: boolean;
  errorMessage?: string;
}

// ── FX Rate (mới) ──────────────────────────────────────────────────────────────

/** Kết quả trả về từ PayPalFxService.getUsdVndRate(). */
export interface FxRateResult {
  /** Đồng tiền gốc. */
  base: 'USD';
  /** Đồng tiền đích. */
  quote: 'VND';
  /** VND per 1 USD trước spread. */
  baseRate: number;
  /** Spread áp dụng (0.01 = 1%). */
  spreadRate: number;
  /** VND per 1 USD sau khi cộng spread — số user thực chịu. */
  effectiveRate: number;
  /** Nguồn tỷ giá. */
  source: 'config' | 'provider';
  /** Thời gian lấy tỷ giá. */
  asOf: string;
}

// ── Webhook ────────────────────────────────────────────────────────────────────

export interface PayPalWebhookHeaders {
  'paypal-transmission-id': string;
  'paypal-transmission-sig': string;
  'paypal-cert-url': string;
  'paypal-auth-algo': string;
  'paypal-transmission-time'?: string;
}

export interface PayPalMoney {
  currency_code: string;
  value: string;
}

export interface PayPalSellerReceivableBreakdown {
  gross_amount: PayPalMoney;
  paypal_fee: PayPalMoney;
  net_amount: PayPalMoney;
  [key: string]: unknown;
}

export interface PayPalCaptureResource {
  /** Capture ID. */
  id: string;
  status: 'COMPLETED' | 'DENIED' | 'REFUNDED' | 'REVERSED' | string;
  amount: PayPalMoney;
  seller_receivable_breakdown?: PayPalSellerReceivableBreakdown;
  /** tenantId echoed back. */
  custom_id?: string;
  /** internal orderId echoed back. */
  invoice_id?: string;
  create_time: string;
  update_time: string;
}

export interface PayPalWebhookEvent {
  /** Webhook event ID. */
  id: string;
  /** e.g. 'PAYMENT.CAPTURE.COMPLETED'. */
  event_type: string;
  event_version: string;
  resource_type: string;
  resource: PayPalCaptureResource;
  summary?: string;
  create_time: string;
}

export interface PayPalWebhookResult {
  received: boolean;
  eventType: string;
  /** Found matching transaction. */
  matched: boolean;
  /** Successfully settled. */
  settled: boolean;
  /** Subscription activated. */
  activated: boolean;
  errorMessage?: string;
}

// ── Verification ────────────────────────────────────────────────────────────────

export interface PayPalVerificationResult {
  verified: boolean;
  paypalOrderId: string;
  /** CREATED | APPROVED | COMPLETED | VOIDED. */
  paypalOrderStatus: string;
  /** COMPLETED | DENIED | REFUNDED. */
  captureStatus?: string;
  /** PayPal decimal string. */
  grossAmount?: string;
  /** After PayPal fee. */
  netAmount?: string;
  /** PayPal transaction fee. */
  paypalFee?: string;
  currency?: string;
  /** Internal BigInt representation. */
  internalAmount?: bigint;
  /** gross matches internal within tolerance. */
  amountMatch: boolean;
  /** Successfully reconciled internal state. */
  reconciled: boolean;
  errorMessage?: string;
}

// ── Raw PayPal REST API response shapes ──────────────────────────────────────────

export interface PayPalApiLink {
  href: string;
  rel: string;
  method: string;
}

export interface PayPalPurchaseUnit {
  reference_id: string;
  amount: PayPalMoney;
  payee?: { email_address?: string; merchant_id?: string };
  payments?: {
    captures?: Array<{
      id: string;
      status: string;
      amount: PayPalMoney;
      seller_receivable_breakdown?: PayPalSellerReceivableBreakdown;
    }>;
  };
  custom_id?: string;
  invoice_id?: string;
}

export interface PayPalApiOrderResponse {
  id: string;
  status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | string;
  purchase_units: PayPalPurchaseUnit[];
  links: PayPalApiLink[];
  create_time?: string;
  update_time?: string;
}

export interface PayPalApiCaptureResponse {
  id: string;
  status:
    | 'COMPLETED'
    | 'DENIED'
    | 'PARTIALLY_REFUNDED'
    | 'REFUNDED'
    | 'FAILED'
    | string;
  amount: PayPalMoney;
  seller_receivable_breakdown?: PayPalSellerReceivableBreakdown;
  custom_id?: string;
  invoice_id?: string;
  create_time: string;
  update_time: string;
  [key: string]: unknown;
}

export interface PayPalVerifyWebhookResponse {
  verification_status: 'SUCCESS' | 'FAILURE';
}

export interface PayPalApiError {
  name: string;
  message: string;
  details?: Array<{ issue: string; field?: string; description?: string }>;
  debug_id: string;
}
