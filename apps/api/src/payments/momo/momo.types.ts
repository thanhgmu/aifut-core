/**
 * MoMo Wallet SDK — Type definitions.
 *
 * Strongly-typed contracts for the MoMo AIO v2 gateway integration.
 * Specification: https://developers.momo.vn/v3/
 *
 * These types isolate the MoMo transport layer from the generic
 * `payments.types.ts` domain layer so that MoMo-specific request/response
 * shapes never leak into the shared payment kernel.
 */

/** MoMo request types supported by the AIO v2 create endpoint. */
export type MomoRequestType =
  | 'captureWallet'
  | 'payWithATM'
  | 'payWithCC'
  | 'payWithMethod';

/** Language for the MoMo hosted payment page. */
export type MomoLang = 'vi' | 'en';

/**
 * Raw payload POSTed to the MoMo `/create` endpoint.
 * Field order here is documentation only; the HMAC raw signature is
 * always assembled alphabetically (see momo.service.ts).
 */
export interface MomoCreatePaymentPayload {
  partnerCode: string;
  partnerName?: string;
  storeId?: string;
  requestId: string;
  amount: number;
  orderId: string;
  orderInfo: string;
  redirectUrl: string;
  ipnUrl: string;
  requestType: MomoRequestType;
  extraData: string;
  lang: MomoLang;
  autoCapture?: boolean;
  orderGroupId?: string;
  signature: string;
}

/** Response body returned by the MoMo `/create` endpoint. */
export interface MomoCreatePaymentApiResponse {
  partnerCode: string;
  requestId: string;
  orderId: string;
  amount: number;
  responseTime: number;
  message: string;
  resultCode: number;
  payUrl?: string;
  deeplink?: string;
  qrCodeUrl?: string;
  deeplinkMiniApp?: string;
  applink?: string;
  signature?: string;
}

/** Normalized result returned by MomoService.createPayment(). */
export interface MomoCreatePaymentResult {
  success: boolean;
  resultCode: number;
  message: string;
  orderId: string;
  requestId: string;
  amount: number;
  /** Hosted payment page URL (web). */
  payUrl?: string;
  /** Raw QR code content URL for self-rendered QR. */
  qrCodeUrl?: string;
  /** Mobile deeplink into the MoMo app. */
  deeplink?: string;
  errorMessage?: string;
}

/**
 * Raw IPN (Instant Payment Notification) callback body from MoMo.
 * Delivered server-to-server to the configured `ipnUrl`.
 */
export interface MomoIpnPayload {
  partnerCode: string;
  orderId: string;
  requestId: string;
  amount: number;
  orderInfo: string;
  orderType: string;
  transId: number;
  resultCode: number;
  message: string;
  payType: string;
  responseTime: number;
  extraData: string;
  signature: string;
}

/** Outcome of IPN signature + business validation. */
export interface MomoIpnVerification {
  valid: boolean;
  signatureValid: boolean;
  resultCode: number;
  orderId: string;
  transId?: number;
  amount: number;
  message: string;
  reason?: string;
}

/** Input arguments for MomoService.createPayment(). */
export interface MomoCreatePaymentInput {
  /** Order identifier — must be unique per attempt for MoMo. */
  orderId: string;
  /** Amount in VND (integer; MoMo rejects decimals). */
  amount: number;
  /** Human-readable order description (max 200 chars enforced). */
  orderInfo: string;
  /** Optional extra metadata, base64-encoded into extraData. */
  extraData?: Record<string, unknown>;
  /** Optional override for the request type. Defaults to captureWallet. */
  requestType?: MomoRequestType;
  /** Optional language override. Defaults to 'vi'. */
  lang?: MomoLang;
}
