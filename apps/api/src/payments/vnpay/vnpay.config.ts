/**
 * VNPay SDK — Configuration provider.
 *
 * Centralizes all VNPay merchant credentials and endpoints, sourced from
 * environment variables. Boots in an unconfigured state when credentials are
 * absent (so the module can load on environments where VNPay is disabled),
 * and fails fast via `require()` inside payment flows where a missing
 * configuration is a hard error.
 *
 * Specification: https://sandbox.vnpayment.vn/apis/docs/
 */

import { Injectable } from '@nestjs/common';

export interface VnpayCredentials {
  /** Merchant terminal code issued by VNPay. */
  tmnCode: string;
  /** Secret used to sign HMAC-SHA512 secure hashes. Never logged. */
  hashSecret: string;
  /** Hosted payment page, e.g. https://sandbox.vnpayment.vn/paymentv2/vpcpay.html */
  payUrl: string;
  /** Merchant API base for query/refund, e.g. https://sandbox.vnpayment.vn/merchant_webapi/api/transaction */
  apiUrl: string;
  /** URL the user is redirected back to after paying (browser return). */
  returnUrl: string;
  /** Server-to-server IPN callback URL. */
  ipnUrl: string;
  /** Default locale for the hosted payment page. */
  locale: 'vn' | 'en';
}

@Injectable()
export class VnpayConfig {
  private credentials: VnpayCredentials | null = null;

  onModuleInit(): void {
    this.load();
  }

  /** Load credentials from environment. Safe to call repeatedly. */
  load(): void {
    const tmnCode = process.env['VNPAY_TMN_CODE'];
    const hashSecret = process.env['VNPAY_HASH_SECRET'];

    if (!tmnCode || !hashSecret) {
      this.credentials = null;
      return;
    }

    const locale = process.env['VNPAY_LOCALE'] === 'en' ? 'en' : 'vn';

    this.credentials = {
      tmnCode,
      hashSecret,
      payUrl:
        process.env['VNPAY_URL'] ||
        'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
      apiUrl:
        process.env['VNPAY_API_URL'] ||
        'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction',
      returnUrl:
        process.env['VNPAY_RETURN_URL'] ||
        'http://localhost:3000/payment/return',
      ipnUrl:
        process.env['VNPAY_IPN_URL'] ||
        'http://localhost:3002/payments/vnpay/ipn',
      locale,
    };
  }

  /** True when valid credentials are present. */
  get isConfigured(): boolean {
    return this.credentials !== null;
  }

  /**
   * Resolve credentials or throw. Use inside payment flows where a missing
   * configuration is a hard error rather than a silently skipped feature.
   */
  require(): VnpayCredentials {
    if (!this.credentials) {
      throw new Error(
        'VNPay gateway not configured. Set VNPAY_TMN_CODE and VNPAY_HASH_SECRET.',
      );
    }
    return this.credentials;
  }

  /** Non-throwing accessor; returns null when unconfigured. */
  tryGet(): VnpayCredentials | null {
    return this.credentials;
  }
}
