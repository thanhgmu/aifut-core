/**
 * VNPay SDK — Type definitions.
 *
 * Strongly-typed contracts for the VNPay PaymentV2 gateway integration.
 * These types isolate the VNPay transport layer from the generic
 * `payments.types.ts` domain layer so that VNPay-specific request/response
 * shapes (the `vnp_*` field family) never leak into the shared payment kernel.
 *
 * Specification: https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html
 */

/** Locale supported by the VNPay hosted payment page. */
export type VnpayLocale = 'vn' | 'en';

/** Card / payment method bank code (optional; empty = let user choose). */
export type VnpayBankCode = 'VNPAYQR' | 'VNBANK' | 'INTCARD' | string;

/** Input arguments for VnpayService.createPaymentUrl(). */
export interface VnpayCreatePaymentInput {
  /** Order identifier — maps to vnp_TxnRef. Must be unique per attempt. */
  orderId: string;
  /** Amount in VND (integer dong; multiplied by 100 internally per spec). */
  amount: number;
  /** Human-readable order description — maps to vnp_OrderInfo. */
  orderInfo: string;
  /** Originating client IP — maps to vnp_IpAddr. */
  ipAddress: string;
  /** Optional order category code. Defaults to '190000' (other). */
  orderType?: string;
  /** Optional locale override. Defaults to config locale. */
  locale?: VnpayLocale;
  /** Optional bank/method preselection. Empty lets the user choose. */
  bankCode?: VnpayBankCode;
  /** Optional expiry in minutes from now. Defaults to 15. */
  expireMinutes?: number;
}

/**
 * The canonical `vnp_*` parameter map sent to the hosted payment page.
 * Field order here is documentation only; the HMAC raw signature is always
 * assembled with keys sorted alphabetically (see vnpay.service.ts).
 */
export interface VnpayPaymentParams {
  vnp_Version: string;
  vnp_Command: string;
  vnp_TmnCode: string;
  vnp_Amount: string;
  vnp_CurrCode: string;
  vnp_TxnRef: string;
  vnp_OrderInfo: string;
  vnp_OrderType: string;
  vnp_Locale: string;
  vnp_ReturnUrl: string;
  vnp_IpAddr: string;
  vnp_CreateDate: string;
  vnp_ExpireDate: string;
  vnp_BankCode?: string;
  [key: string]: string | undefined;
}

/** Normalized result returned by VnpayService.createPaymentUrl(). */
export interface VnpayCreatePaymentResult {
  success: boolean;
  /** The fully-signed redirect URL the user opens to pay. */
  payUrl?: string;
  /** Echoed order id (vnp_TxnRef). */
  orderId: string;
  /** Amount in VND dong (not the *100 wire value). */
  amount: number;
  /** The deterministic vnp_CreateDate used (yyyyMMddHHmmss). */
  createDate?: string;
  errorMessage?: string;
}

/**
 * Raw IPN / Return query parameters delivered by VNPay. VNPay returns every
 * field as a string; `vnp_SecureHash` carries the signature to verify.
 */
export interface VnpayCallbackParams {
  vnp_TmnCode?: string;
  vnp_Amount?: string;
  vnp_BankCode?: string;
  vnp_BankTranNo?: string;
  vnp_CardType?: string;
  vnp_PayDate?: string;
  vnp_OrderInfo?: string;
  vnp_TransactionNo?: string;
  vnp_ResponseCode?: string;
  vnp_TransactionStatus?: string;
  vnp_TxnRef?: string;
  vnp_SecureHashType?: string;
  vnp_SecureHash?: string;
  [key: string]: string | undefined;
}

/** Outcome of IPN/Return signature + business validation. */
export interface VnpayVerification {
  /** Signature valid AND responseCode === '00' AND txnStatus === '00'. */
  valid: boolean;
  /** Whether the HMAC-SHA512 secure hash matched. */
  signatureValid: boolean;
  /** vnp_ResponseCode raw value. */
  responseCode?: string;
  /** vnp_TransactionStatus raw value. */
  transactionStatus?: string;
  /** Our order id (vnp_TxnRef). */
  orderId?: string;
  /** VNPay transaction number (vnp_TransactionNo). */
  transactionNo?: string;
  /** Amount in VND dong (wire value divided by 100). */
  amount?: number;
  /** Human-readable Vietnamese message resolved from the response code. */
  message: string;
  reason?: string;
}

/**
 * VNPay's required IPN acknowledgement body. The IPN endpoint must echo this
 * exact shape so VNPay stops redelivering the notification.
 */
export interface VnpayIpnAck {
  RspCode: string;
  Message: string;
}
