/**
 * VNPay SDK — Core service.
 *
 * Implements createPaymentUrl(): builds the canonical VNPay PaymentV2 raw
 * signature, signs it with HMAC-SHA512 using the merchant HashSecret, and
 * returns the live, fully-signed payUrl the user opens to pay.
 *
 * Signature contract (VNPay PaymentV2):
 *   1. Collect every non-empty `vnp_*` field except vnp_SecureHash[Type].
 *   2. Sort keys in strict ascending (alphabetical/lexicographic) order.
 *   3. Build the raw "hash data" string as key=value joined by '&', where each
 *      value is URL-encoded and spaces are encoded as '+' (application/x-www-
 *      form-urlencoded), matching VNPay's reference exactly. The SAME encoding
 *      is reused to build the query string so the signed bytes equal the
 *      transmitted bytes.
 *   4. secureHash = HMAC-SHA512(hashData, HashSecret) as lowercase hex.
 *   5. Append &vnp_SecureHash=<hash> to the query string.
 *
 * Any divergence between the encoding used for signing and for the query
 * string yields VNPay error code 70/72 (invalid checksum), so both are derived
 * from the single `encodeFormValue` helper below.
 */

import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { VnpayConfig } from './vnpay.config';
import {
  VnpayCallbackParams,
  VnpayCreatePaymentInput,
  VnpayCreatePaymentResult,
  VnpayPaymentParams,
  VnpayVerification,
} from './vnpay.types';
import { resolveVnpayResponseCode } from './vnpay.result-codes';

const MAX_ORDER_INFO = 255;
const DEFAULT_EXPIRE_MIN = 15;
const VNP_VERSION = '2.1.0';
const VNP_COMMAND = 'pay';
const VNP_CURRENCY = 'VND';
const VNP_DEFAULT_ORDER_TYPE = '190000';

@Injectable()
export class VnpayService {
  private readonly logger = new Logger(VnpayService.name);

  constructor(private readonly config: VnpayConfig) {}

  get isConfigured(): boolean {
    return this.config.isConfigured;
  }

  /**
   * Build a live, signed VNPay payment URL.
   */
  createPaymentUrl(
    input: VnpayCreatePaymentInput,
  ): VnpayCreatePaymentResult {
    let creds;
    try {
      creds = this.config.require();
    } catch (err) {
      return {
        success: false,
        orderId: input.orderId,
        amount: input.amount,
        errorMessage: (err as Error).message,
      };
    }

    const amount = Math.round(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return {
        success: false,
        orderId: input.orderId,
        amount: input.amount,
        errorMessage: 'Số tiền không hợp lệ.',
      };
    }

    const now = new Date();
    const createDate = this.formatDate(now);
    const expireMinutes = input.expireMinutes ?? DEFAULT_EXPIRE_MIN;
    const expireDate = this.formatDate(
      new Date(now.getTime() + expireMinutes * 60_000),
    );

    const params: VnpayPaymentParams = {
      vnp_Version: VNP_VERSION,
      vnp_Command: VNP_COMMAND,
      vnp_TmnCode: creds.tmnCode,
      vnp_Amount: String(amount * 100), // VNPay expects amount in the smallest unit (x100)
      vnp_CurrCode: VNP_CURRENCY,
      vnp_TxnRef: input.orderId,
      vnp_OrderInfo: (input.orderInfo || 'Thanh toan AIFUT').slice(
        0,
        MAX_ORDER_INFO,
      ),
      vnp_OrderType: input.orderType ?? VNP_DEFAULT_ORDER_TYPE,
      vnp_Locale: input.locale ?? creds.locale,
      vnp_ReturnUrl: creds.returnUrl,
      vnp_IpAddr: input.ipAddress || '127.0.0.1',
      vnp_CreateDate: createDate,
      vnp_ExpireDate: expireDate,
    };

    // Optional bank/method preselection.
    if (input.bankCode) {
      params.vnp_BankCode = input.bankCode;
    }

    // 1-2-3: filter empties, sort keys alphabetically.
    const sortedKeys = Object.keys(params)
      .filter((k) => params[k] !== undefined && params[k] !== '')
      .sort();

    // 3: raw hash data + 5: query string share one encoding.
    const hashData = sortedKeys
      .map((k) => `${k}=${this.encodeFormValue(params[k] as string)}`)
      .join('&');

    // 4: HMAC-SHA512 with HashSecret, lowercase hex.
    const secureHash = this.sign(hashData, creds.hashSecret);

    const payUrl = `${creds.payUrl}?${hashData}&vnp_SecureHash=${secureHash}`;

    return {
      success: true,
      payUrl,
      orderId: input.orderId,
      amount,
      createDate,
    };
  }

  /**
   * Verify the secure hash on a VNPay Return or IPN callback. Proves
   * authenticity only; business-state idempotency is handled by VnpayIpnGuard.
   *
   * Verification rebuilds the hash data from every `vnp_*` field EXCEPT
   * vnp_SecureHash and vnp_SecureHashType, using the identical sort + encoding
   * as createPaymentUrl, then timing-safe compares against vnp_SecureHash.
   */
  verifyCallback(query: VnpayCallbackParams): VnpayVerification {
    let creds;
    try {
      creds = this.config.require();
    } catch (err) {
      return {
        valid: false,
        signatureValid: false,
        message: (err as Error).message,
        reason: 'not-configured',
      };
    }

    const received = query.vnp_SecureHash ?? '';
    if (!received) {
      return {
        valid: false,
        signatureValid: false,
        message: 'Thiếu vnp_SecureHash.',
        reason: 'missing-hash',
      };
    }

    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(query)) {
      if (key === 'vnp_SecureHash' || key === 'vnp_SecureHashType') continue;
      if (value === undefined || value === '') continue;
      fields[key] = String(value);
    }

    const sortedKeys = Object.keys(fields).sort();
    const hashData = sortedKeys
      .map((k) => `${k}=${this.encodeFormValue(fields[k])}`)
      .join('&');

    const expected = this.sign(hashData, creds.hashSecret);
    const signatureValid = this.timingSafeEqual(expected, received);

    const responseCode = query.vnp_ResponseCode;
    const transactionStatus = query.vnp_TransactionStatus;
    const entry = resolveVnpayResponseCode(responseCode);
    const amountRaw = query.vnp_Amount
      ? parseInt(query.vnp_Amount, 10) / 100
      : undefined;

    // A transaction is only valid when the signature matches AND both the
    // response code and the settlement status report success ('00').
    const businessOk =
      responseCode === '00' &&
      (transactionStatus === undefined || transactionStatus === '00');

    return {
      valid: signatureValid && businessOk,
      signatureValid,
      responseCode,
      transactionStatus,
      orderId: query.vnp_TxnRef,
      transactionNo: query.vnp_TransactionNo,
      amount: amountRaw,
      message: entry.message,
      reason: signatureValid ? undefined : 'Invalid secure hash',
    };
  }

  // --------------------------------------------------------------------------
  // Internals
  // --------------------------------------------------------------------------

  private sign(raw: string, hashSecret: string): string {
    return crypto
      .createHmac('sha512', hashSecret)
      .update(Buffer.from(raw, 'utf8'))
      .digest('hex');
  }

  /**
   * application/x-www-form-urlencoded value encoding, matching VNPay's
   * reference implementation: encodeURIComponent then spaces as '+'.
   */
  private encodeFormValue(value: string): string {
    return encodeURIComponent(value).replace(/%20/g, '+');
  }

  private timingSafeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  /** VNPay timestamp format: yyyyMMddHHmmss in GMT+7 (Asia/Ho_Chi_Minh). */
  private formatDate(date: Date): string {
    // VNPay expects the merchant's local time (GMT+7). Convert deterministically.
    const gmt7 = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    const y = gmt7.getUTCFullYear();
    const m = String(gmt7.getUTCMonth() + 1).padStart(2, '0');
    const d = String(gmt7.getUTCDate()).padStart(2, '0');
    const h = String(gmt7.getUTCHours()).padStart(2, '0');
    const mi = String(gmt7.getUTCMinutes()).padStart(2, '0');
    const s = String(gmt7.getUTCSeconds()).padStart(2, '0');
    return `${y}${m}${d}${h}${mi}${s}`;
  }
}
