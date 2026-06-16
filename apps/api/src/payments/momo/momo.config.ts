/**
 * MoMo Wallet SDK — Configuration provider.
 *
 * Centralizes all MoMo credentials and endpoints, sourced from environment
 * variables. Throws early (fail-fast) when credentials are requested but
 * missing, while still allowing the module to boot in an unconfigured state
 * for environments where MoMo is disabled.
 */

import { Injectable } from '@nestjs/common';

export interface MomoCredentials {
  partnerCode: string;
  accessKey: string;
  secretKey: string;
  /** AIO v2 create endpoint, e.g. https://test-payment.momo.vn/v2/gateway/api/create */
  createEndpoint: string;
  /** Query/refund endpoint base, e.g. https://test-payment.momo.vn/v2/gateway/api/query */
  queryEndpoint: string;
  /** URL the user is redirected to after paying. */
  redirectUrl: string;
  /** Server-to-server IPN callback URL. */
  ipnUrl: string;
  /** Display name shown on the MoMo payment page. */
  partnerName: string;
  /** Optional store identifier. */
  storeId: string;
}

@Injectable()
export class MomoConfig {
  private credentials: MomoCredentials | null = null;

  onModuleInit(): void {
    this.load();
  }

  /** Load credentials from environment. Safe to call repeatedly. */
  load(): void {
    const partnerCode = process.env['MOMO_PARTNER_CODE'];
    const accessKey = process.env['MOMO_ACCESS_KEY'];
    const secretKey = process.env['MOMO_SECRET_KEY'];

    if (!partnerCode || !accessKey || !secretKey) {
      this.credentials = null;
      return;
    }

    this.credentials = {
      partnerCode,
      accessKey,
      secretKey,
      createEndpoint:
        process.env['MOMO_CREATE_ENDPOINT'] ||
        'https://test-payment.momo.vn/v2/gateway/api/create',
      queryEndpoint:
        process.env['MOMO_QUERY_ENDPOINT'] ||
        'https://test-payment.momo.vn/v2/gateway/api/query',
      redirectUrl:
        process.env['MOMO_RETURN_URL'] || 'http://localhost:3000/payment/return',
      ipnUrl:
        process.env['MOMO_IPN_URL'] || 'http://localhost:3002/payments/momo/ipn',
      partnerName: process.env['MOMO_PARTNER_NAME'] || 'AIFUT',
      storeId: process.env['MOMO_STORE_ID'] || 'AIFUT-STORE',
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
  require(): MomoCredentials {
    if (!this.credentials) {
      throw new Error(
        'MoMo gateway not configured. Set MOMO_PARTNER_CODE, MOMO_ACCESS_KEY and MOMO_SECRET_KEY.',
      );
    }
    return this.credentials;
  }

  /** Non-throwing accessor; returns null when unconfigured. */
  tryGet(): MomoCredentials | null {
    return this.credentials;
  }
}
