/**
 * MoMo Wallet SDK — Core service.
 *
 * Implements createPayment(): builds the canonical MoMo AIO v2 raw signature,
 * signs it with HMAC-SHA256 using the merchant secretKey, POSTs to the MoMo
 * `/create` endpoint, and returns the real payUrl + qrCodeUrl.
 *
 * Signature contract (MoMo AIO v2, fields concatenated in strict alphabetical
 * order as key=value joined by '&'):
 *
 *   accessKey, amount, extraData, ipnUrl, orderId, orderInfo,
 *   partnerCode, redirectUrl, requestId, requestType
 *
 * NOTE: MoMo requires the full ordered field set above for the signature to
 * validate server-side; omitting any field yields resultCode 20 (bad format).
 * The raw string is built deterministically below to guarantee correctness.
 */

import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { MomoConfig, MomoCredentials } from './momo.config';
import {
  MomoCreatePaymentApiResponse,
  MomoCreatePaymentInput,
  MomoCreatePaymentPayload,
  MomoCreatePaymentResult,
  MomoIpnPayload,
  MomoIpnVerification,
} from './momo.types';
import { resolveMomoResultCode } from './momo.result-codes';

const MAX_ORDER_INFO = 200;
const HTTP_TIMEOUT_MS = 15_000;

@Injectable()
export class MomoService {
  private readonly logger = new Logger(MomoService.name);

  constructor(private readonly config: MomoConfig) {}

  get isConfigured(): boolean {
    return this.config.isConfigured;
  }

  /**
   * Create a MoMo payment and return the live payUrl / qrCodeUrl.
   */
  async createPayment(
    input: MomoCreatePaymentInput,
  ): Promise<MomoCreatePaymentResult> {
    const creds = this.config.require();

    const amount = Math.round(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return this.fail(input.orderId, 'Số tiền không hợp lệ.', 21);
    }

    const orderId = input.orderId;
    const requestId = `${creds.partnerCode}-${Date.now()}-${crypto
      .randomBytes(4)
      .toString('hex')}`;
    const orderInfo = (input.orderInfo || 'Thanh toan AIFUT').slice(
      0,
      MAX_ORDER_INFO,
    );
    const requestType = input.requestType ?? 'captureWallet';
    const lang = input.lang ?? 'vi';
    const extraData = input.extraData
      ? Buffer.from(JSON.stringify(input.extraData)).toString('base64')
      : '';

    // --- Build the canonical raw signature string (alphabetical order) ------
    const rawSignature = this.buildRawSignature(creds, {
      amount,
      extraData,
      orderId,
      orderInfo,
      requestId,
      requestType,
    });

    const signature = this.sign(rawSignature, creds.secretKey);

    const payload: MomoCreatePaymentPayload = {
      partnerCode: creds.partnerCode,
      partnerName: creds.partnerName,
      storeId: creds.storeId,
      requestId,
      amount,
      orderId,
      orderInfo,
      redirectUrl: creds.redirectUrl,
      ipnUrl: creds.ipnUrl,
      requestType,
      extraData,
      lang,
      signature,
    };

    try {
      const res = await this.postJson<MomoCreatePaymentApiResponse>(
        creds.createEndpoint,
        payload,
      );

      const entry = resolveMomoResultCode(res.resultCode);
      const success = res.resultCode === 0;

      if (!success && entry.status === 'failed') {
        this.logger.warn(
          `MoMo create failed order=${orderId} code=${res.resultCode} msg=${res.message}`,
        );
      }

      return {
        success,
        resultCode: res.resultCode,
        message: res.message || entry.message,
        orderId: res.orderId ?? orderId,
        requestId: res.requestId ?? requestId,
        amount: res.amount ?? amount,
        payUrl: res.payUrl,
        qrCodeUrl: res.qrCodeUrl,
        deeplink: res.deeplink,
        errorMessage: success ? undefined : res.message || entry.message,
      };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`MoMo create error order=${orderId}: ${message}`);
      return this.fail(orderId, `Lỗi kết nối MoMo: ${message}`, 99, requestId, amount);
    }
  }

  /**
   * Verify a MoMo IPN signature. Business-state idempotency is handled
   * separately by MomoIpnGuard; this method only proves authenticity.
   */
  verifyIpn(payload: MomoIpnPayload): MomoIpnVerification {
    const creds = this.config.require();

    const raw =
      `accessKey=${creds.accessKey}` +
      `&amount=${payload.amount}` +
      `&extraData=${payload.extraData}` +
      `&message=${payload.message}` +
      `&orderId=${payload.orderId}` +
      `&orderInfo=${payload.orderInfo}` +
      `&orderType=${payload.orderType}` +
      `&partnerCode=${payload.partnerCode}` +
      `&payType=${payload.payType}` +
      `&requestId=${payload.requestId}` +
      `&responseTime=${payload.responseTime}` +
      `&resultCode=${payload.resultCode}` +
      `&transId=${payload.transId}`;

    const expected = this.sign(raw, creds.secretKey);
    const signatureValid = this.timingSafeEqual(expected, payload.signature);
    const entry = resolveMomoResultCode(payload.resultCode);

    return {
      valid: signatureValid && payload.resultCode === 0,
      signatureValid,
      resultCode: payload.resultCode,
      orderId: payload.orderId,
      transId: payload.transId,
      amount: payload.amount,
      message: payload.message || entry.message,
      reason: signatureValid ? undefined : 'Invalid IPN signature',
    };
  }

  // --------------------------------------------------------------------------
  // Internals
  // --------------------------------------------------------------------------

  /** Assemble the strict alphabetical key=value raw signature string. */
  private buildRawSignature(
    creds: MomoCredentials,
    p: {
      amount: number;
      extraData: string;
      orderId: string;
      orderInfo: string;
      requestId: string;
      requestType: string;
    },
  ): string {
    return (
      `accessKey=${creds.accessKey}` +
      `&amount=${p.amount}` +
      `&extraData=${p.extraData}` +
      `&ipnUrl=${creds.ipnUrl}` +
      `&orderId=${p.orderId}` +
      `&orderInfo=${p.orderInfo}` +
      `&partnerCode=${creds.partnerCode}` +
      `&redirectUrl=${creds.redirectUrl}` +
      `&requestId=${p.requestId}` +
      `&requestType=${p.requestType}`
    );
  }

  private sign(raw: string, secretKey: string): string {
    return crypto.createHmac('sha256', secretKey).update(raw).digest('hex');
  }

  private timingSafeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  private fail(
    orderId: string,
    message: string,
    resultCode: number,
    requestId = '',
    amount = 0,
  ): MomoCreatePaymentResult {
    return {
      success: false,
      resultCode,
      message,
      orderId,
      requestId,
      amount,
      errorMessage: message,
    };
  }

  /** Minimal JSON POST using the global fetch (Node 18+/24). */
  private async postJson<T>(url: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}
