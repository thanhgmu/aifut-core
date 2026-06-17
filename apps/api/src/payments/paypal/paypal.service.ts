/**
 * PayPal Gateway SDK — Core service.
 *
 * Lượt 1 scope (this commit):
 *   - getAccessToken(): OAuth2 client-credentials token mint + in-memory cache
 *     with a coalescing refresh lock (no thundering herd).
 *   - createPayPalOrder(): POST /v2/checkout/orders (intent=CAPTURE), returns
 *     the payer-action approval URL for browser redirect, and best-effort
 *     persists the internal↔PayPal order mapping in PaymentTransaction.metadata.
 *
 * Webhook verification (handlePayPalWebhook) and active reconciliation
 * (verifyPayPalOrder) are declared in the design and land in subsequent waves.
 *
 * Security: the OAuth2 access token and client secret are NEVER logged. Only
 * non-sensitive identifiers (order ids, status) appear in logs.
 *
 * Specification: https://developer.paypal.com/api/rest/
 */

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { PayPalConfig } from './paypal.config';
import {
  PayPalApiError,
  PayPalApiOrderResponse,
  PayPalCreateOrderInput,
  PayPalCreateOrderResult,
  PayPalOAuthResponse,
} from './paypal.types';
import { internalToPayPalDecimal, truncateDescription } from './paypal.utils';

const ORDERS_PATH = '/v2/checkout/orders';
const OAUTH_PATH = '/v1/oauth2/token';
/** Network timeout for PayPal REST calls. */
const REQUEST_TIMEOUT_MS = 15_000;

@Injectable()
export class PayPalService {
  private readonly logger = new Logger(PayPalService.name);

  constructor(
    private readonly config: PayPalConfig,
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  get isConfigured(): boolean {
    return this.config.isConfigured;
  }

  // ── Hàm #1: createPayPalOrder ────────────────────────────────────────────

  /**
   * Create a PayPal Order (intent=CAPTURE) and return the approval URL.
   */
  async createPayPalOrder(
    input: PayPalCreateOrderInput,
  ): Promise<PayPalCreateOrderResult> {
    const base: Pick<
      PayPalCreateOrderResult,
      'amount' | 'currency' | 'orderId'
    > = {
      amount: input.amount,
      currency: input.currency,
      orderId: input.orderId,
    };

    // ---- 1. VALIDATE & CONVERT ---------------------------------------------
    let creds;
    try {
      creds = this.config.require();
    } catch (err) {
      return { success: false, ...base, errorMessage: (err as Error).message };
    }

    if (typeof input.amount !== 'bigint' || input.amount <= 0n) {
      return {
        success: false,
        ...base,
        errorMessage: 'Số tiền không hợp lệ.',
      };
    }

    const currency = (input.currency || creds.defaultCurrency).toUpperCase();
    let decimalValue: string;
    try {
      decimalValue = internalToPayPalDecimal(input.amount);
    } catch (err) {
      return { success: false, ...base, errorMessage: (err as Error).message };
    }

    // ---- 2. GET OAUTH2 ACCESS TOKEN ----------------------------------------
    let token: string;
    try {
      token = await this.getAccessToken();
    } catch (err) {
      this.logger.error(
        `PayPal token mint failed for order=${input.orderId}: ${(err as Error).message}`,
      );
      return {
        success: false,
        ...base,
        errorMessage: 'Không lấy được token xác thực PayPal.',
      };
    }

    // ---- 3. CREATE ORDER (POST /v2/checkout/orders) ------------------------
    const requestId = randomUUID();
    const body = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: input.orderId,
          description: truncateDescription(input.description),
          custom_id: input.tenantId,
          invoice_id: input.orderId,
          amount: { currency_code: currency, value: decimalValue },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
            user_action: 'PAY_NOW',
          },
        },
      },
    };

    let order: PayPalApiOrderResponse;
    try {
      order = await this.postJson<PayPalApiOrderResponse>(
        `${creds.baseUrl}${ORDERS_PATH}`,
        body,
        token,
        { 'PayPal-Request-Id': requestId },
      );
    } catch (err) {
      const message = this.friendlyError(err);
      this.logger.error(
        `PayPal create order failed order=${input.orderId}: ${message}`,
      );
      return { success: false, ...base, errorMessage: message };
    }

    // ---- 4. HANDLE RESPONSE -------------------------------------------------
    const approvalUrl =
      order.links?.find((l) => l.rel === 'payer-action')?.href ??
      order.links?.find((l) => l.rel === 'approve')?.href;

    if (!order.id || !approvalUrl) {
      return {
        success: false,
        ...base,
        errorMessage: 'PayPal không trả về approval URL.',
      };
    }

    // Best-effort: persist internal↔PayPal mapping for later reconciliation.
    await this.persistOrderMapping(input.orderId, order.id, requestId).catch(
      (err) =>
        this.logger.warn(
          `Order mapping persist skipped order=${input.orderId}: ${(err as Error).message}`,
        ),
    );

    return {
      success: true,
      ...base,
      paypalOrderId: order.id,
      approvalUrl,
    };
  }

  // ── OAuth2 token (cache + coalesced refresh) ─────────────────────────────

  /**
   * Resolve a valid OAuth2 access token, reusing the cached one when still
   * valid. Concurrent callers during a refresh share the same in-flight mint.
   */
  private async getAccessToken(): Promise<string> {
    const cached = this.config.getCachedToken();
    if (cached) return cached;

    const inFlight = this.config.getRefreshLock();
    if (inFlight) return inFlight;

    const minting = this.mintAccessToken().finally(() => {
      this.config.setRefreshLock(null);
    });
    this.config.setRefreshLock(minting);
    return minting;
  }

  /** Mint a fresh OAuth2 token via client-credentials grant. */
  private async mintAccessToken(): Promise<string> {
    const creds = this.config.require();
    const res = await this.fetchWithTimeout(`${creds.baseUrl}${OAUTH_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${this.config.basicAuthHeader()}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
    });

    if (!res.ok) {
      this.config.clearCachedToken();
      throw new Error(`OAuth2 token HTTP ${res.status}`);
    }

    const json = (await res.json()) as PayPalOAuthResponse;
    if (!json.access_token) {
      throw new Error('OAuth2 response missing access_token');
    }
    this.config.setCachedToken(json.access_token, json.expires_in ?? 0);
    return json.access_token;
  }

  // ── HTTP helpers ──────────────────────────────────────────────────────────

  private async postJson<T>(
    url: string,
    body: unknown,
    token: string,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const res = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    const parsed = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const err = parsed as PayPalApiError;
      throw new Error(
        err?.message
          ? `${err.name ?? 'PAYPAL_ERROR'}: ${err.message}`
          : `PayPal HTTP ${res.status}`,
      );
    }
    return parsed as T;
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /** Map a thrown error to a user-friendly message (no secret leakage). */
  private friendlyError(err: unknown): string {
    const message = (err as Error)?.message ?? 'Lỗi không xác định từ PayPal.';
    return message;
  }

  /**
   * Persist the internal↔PayPal order mapping into an existing pending
   * PaymentTransaction's metadata. Best-effort; the caller swallows failures.
   */
  private async persistOrderMapping(
    orderId: string,
    paypalOrderId: string,
    requestId: string,
  ): Promise<void> {
    const existing = await this.prisma.paymentTransaction.findFirst({
      where: { gateway: 'paypal', gatewayTxId: orderId, status: 'pending' },
      select: { id: true, metadata: true },
    });
    if (!existing) return;

    const prevMeta =
      existing.metadata && typeof existing.metadata === 'object'
        ? (existing.metadata as Record<string, unknown>)
        : {};

    await this.prisma.paymentTransaction.update({
      where: { id: existing.id },
      data: {
        metadata: {
          ...prevMeta,
          paypalOrderId,
          paypalRequestId: requestId,
        },
        updatedAt: new Date(),
      },
    });
    // ledger is injected for downstream settle/activate waves; referenced here
    // to keep the dependency graph explicit without side effects.
    void this.ledger;
  }
}
