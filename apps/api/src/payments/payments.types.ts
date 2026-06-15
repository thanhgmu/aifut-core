/**
 * Payment gateway types and constants.
 */

export type PaymentGateway = 'vnpay' | 'momo' | 'stripe' | 'manual';

export type PaymentStatus = 'pending' | 'success' | 'failed' | 'refunded';

export interface PaymentRequest {
  amount: number;
  currency: string;
  description: string;
  invoiceId?: string;
  returnUrl: string;
  ipnUrl: string;
  orderId: string;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

export interface PaymentResponse {
  success: boolean;
  paymentUrl?: string;
  transactionId?: string;
  errorMessage?: string;
  gateway: PaymentGateway;
}

export interface IpnPayload {
  /** Raw payload from gateway */
  raw: Record<string, any>;
  gateway: PaymentGateway;
}

export interface IpnResult {
  success: boolean;
  gatewayTxId?: string;
  amount?: number;
  status: PaymentStatus;
  errorMessage?: string;
}

export interface PaymentCapabilities {
  gateway: PaymentGateway;
  name: string;
  supportedCurrencies: string[];
  paymentMethods: string[];
}
