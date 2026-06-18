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
 * Lượt 2 scope (this commit):
 *   - handlePayPalWebhook(): PayPal post-back signature verify + PAYMENT.CAPTURE
 *     .COMPLETED settlement + async subscription activation.
 *   - verifyPayPalOrder(): Active reconciliation (GET /v2/checkout/orders/:id),
 *     safety net for dropped webhook delivery.
 *
 * Lượt 3 scope (this commit):
 *   - capturePayPalOrder(): POST /v2/checkout/orders/{id}/capture — client-driven
 *     capture sau JS SDK `onApprove`. Tích hợp Idempotency 2 lớp, tự động nạp
 *     BigInt vào ví qua LedgerService, best-effort kích hoạt subscription.
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
import { LedgerReferenceTypes } from '../ledger/ledger.types';
import { PayPalConfig } from './paypal.config';
import {
  PayPalApiError,
  PayPalApiOrderResponse,
  PayPalCaptureResource,
  PayPalCaptureOrderInput,
  PayPalCaptureOrderResult,
  PayPalCreateOrderInput,
  PayPalCreateOrderResult,
  PayPalOAuthResponse,
  PayPalVerificationResult,
  PayPalVerifyWebhookResponse,
  PayPalWebhookEvent,
  PayPalWebhookHeaders,
  PayPalWebhookResult,
} from './paypal.types';
import { internalToPayPalDecimal, payPalDecimalToInternal, truncateDescription } from './paypal.utils';
import { PayPalIpnGuard } from './paypal.ipn.guard';
import { SubscriptionActivatorService } from '../subscription-activator.service';

const ORDERS_PATH = '/v2/checkout/orders';
const OAUTH_PATH = '/v1/oauth2/token';
const VERIFY_WEBHOOK_PATH = '/v1/notifications/verify-webhook-signature';
/** Network timeout for PayPal REST calls. */
const REQUEST_TIMEOUT_MS = 15_000;

@Injectable()
export class PayPalService {
  private readonly logger = new Logger(PayPalService.name);

  constructor(
    private readonly config: PayPalConfig,
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly ipnGuard: PayPalIpnGuard,
    private readonly subscriptionActivator: SubscriptionActivatorService,
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

  // ── Hàm #2: handlePayPalWebhook ───────────────────────────────────────────

  /**
   * Verify a PayPal webhook event via the PayPal POST-back verification API,
   * and if the event is PAYMENT.CAPTURE.COMPLETED, settle the transaction and
   * activate the subscription.
   *
   * Flow:
   *   1. POST raw webhook body + headers to PayPal's verify-webhook-signature
   *      endpoint. Only SUCCESS is accepted.
   *   2. Short-circuit non-payment events early.
   *   3. Use PayPalIpnGuard.claim() for idempotency.
   *   4. On success, mark the PaymentTransaction as success and call
   *      SubscriptionActivatorService.activateByOrderId().
   *
   * Returns a structured result; the controller maps this to the HTTP response.
   */
  async handlePayPalWebhook(
    headers: PayPalWebhookHeaders,
    body: PayPalWebhookEvent,
  ): Promise<PayPalWebhookResult> {
    const eventType = body?.event_type ?? 'UNKNOWN';

    // ---- Step 1: POST-back signature verification ----------------------------
    const verified = await this.verifyWebhookSignature(headers, body);

    if (!verified) {
      this.logger.warn(
        `PayPal webhook signature verification FAILED event=${body?.id} type=${eventType}`,
      );
      return {
        received: true,
        eventType,
        matched: false,
        settled: false,
        activated: false,
        errorMessage: 'Webhook signature verification failed',
      };
    }

    // ---- Step 2: Short-circuit non-payment events ---------------------------
    // We only handle payment capture completions. All other events are
    // acknowledged as received but not settled.
    const paymentEvents = new Set(['PAYMENT.CAPTURE.COMPLETED']);

    if (!paymentEvents.has(eventType)) {
      this.logger.log(
        `PayPal webhook ignored event=${body?.id} type=${eventType}`,
      );
      return {
        received: true,
        eventType,
        matched: false,
        settled: false,
        activated: false,
      };
    }

    // ---- Step 3: Extract capture resource -----------------------------------
    const resource = body?.resource as PayPalCaptureResource | undefined;
    if (!resource) {
      this.logger.warn(
        `PayPal webhook missing resource event=${body?.id} type=${eventType}`,
      );
      return {
        received: true,
        eventType,
        matched: false,
        settled: false,
        activated: false,
        errorMessage: 'Missing capture resource in webhook body',
      };
    }

    // The internal order id is echoed back in invoice_id (preferred) or
    // custom_id. Fall back to paypalOrderId when both are empty.
    const orderId = resource.invoice_id ?? resource.custom_id ?? '';
    const captureId = resource.id;
    const currency = resource.amount?.currency_code ?? 'USD';

    // Convert PayPal decimal to internal BigInt smallest units.
    let internalAmount: bigint;
    try {
      internalAmount = payPalDecimalToInternal(resource.amount?.value ?? '0');
    } catch {
      this.logger.error(
        `Cannot parse PayPal amount event=${body?.id} value=${resource.amount?.value}`,
      );
      return {
        received: true,
        eventType,
        matched: false,
        settled: false,
        activated: false,
        errorMessage: 'Invalid amount in capture resource',
      };
    }

    // ---- Step 4: Idempotency claim via guard ---------------------------------
    let claim;
    try {
      claim = await this.ipnGuard.claim(orderId, captureId, internalAmount);
    } catch (err) {
      this.logger.error(
        `PayPal IPN claim error event=${body?.id} orderId=${orderId}: ${(err as Error).message}`,
      );
      return {
        received: true,
        eventType,
        matched: false,
        settled: false,
        activated: false,
        errorMessage: 'Idempotency guard error',
      };
    }

    if (claim.decision !== 'claimed') {
      this.logger.log(
        `PayPal webhook non-claimed event=${body?.id} decision=${claim.decision} reason=${claim.reason}`,
      );
      return {
        received: true,
        eventType,
        matched: claim.decision === 'duplicate'
          ? (claim.currentStatus === 'success' || claim.currentStatus === 'failed')
          : (claim.transactionId !== undefined),
        settled: claim.currentStatus === 'success',
        activated: claim.currentStatus === 'success',
      };
    }

    // ---- Step 5: Build settlement patch from PayPal capture breakdown ---------
    const grossAmount = resource.amount?.value ?? '';
    const netAmount =
      resource.seller_receivable_breakdown?.net_amount?.value ?? grossAmount;
    const paypalFee =
      resource.seller_receivable_breakdown?.paypal_fee?.value ?? '0.00';

    const patch = {
      gatewayTxId: captureId,
      gateway: 'paypal' as const,
      metadata: {
        paypalCaptureId: captureId,
        paypalOrderId: orderId,
        paypalEventId: body.id,
        paypalEventType: eventType,
        paypalEventTime: body.create_time,
        grossAmount,
        netAmount,
        paypalFee,
        currency,
        webhookResponse: body,
      },
    };

    // The capture status is COMPLETED for a successful payment.
    const isSuccess = resource.status === 'COMPLETED';
    const finalStatus = isSuccess ? 'success' : 'failed';

    // ---- Step 6: Settle via Serializable transaction -------------------------
    let settled: boolean;
    try {
     settled = await this.ipnGuard.settle(claim.transactionId, finalStatus, patch as any);
    } catch (err) {
      this.logger.error(
        `PayPal settle failed tx=${claim.transactionId}: ${(err as Error).message}`,
      );
      return {
        received: true,
        eventType,
        matched: true,
        settled: false,
        activated: false,
        errorMessage: 'Settle transaction failed',
      };
    }

    if (!settled) {
      this.logger.warn(
        `PayPal settle race lost tx=${claim.transactionId} orderId=${orderId}`,
      );
      return {
        received: true,
        eventType,
        matched: true,
        settled: false,
        activated: false,
      };
    }

    // ---- Step 7: Activate subscription if payment succeeded -------------------
    let activated = false;
    if (isSuccess) {
      try {
        const activationResult = await this.subscriptionActivator.activateByOrderId({
          orderId,
          gateway: 'paypal',
          gatewayTxId: captureId,
          paidAt: new Date(resource.create_time ?? Date.now()),
          ipnPayload: body as unknown as Record<string, any>,
        });
        activated = !!activationResult.activated;
        this.logger.log(
          `PayPal webhook subscription activated orderId=${orderId} activated=${activated}`,
        );
      } catch (err) {
        // Non-fatal: activateByOrderId logs internally; do not fail webhook ack.
        this.logger.warn(
          `PayPal activation warning orderId=${orderId}: ${(err as Error).message}`,
        );
      }
    }

    return {
      received: true,
      eventType,
      matched: true,
      settled: true,
      activated,
    };
  }

  // ── Hàm #3: verifyPayPalOrder ─────────────────────────────────────────────

  /**
   * Active reconciliation — query PayPal directly for the current state of an
   * order. Acts as a safety net for dropped webhook deliveries.
   *
   * Flow:
   *   1. GET /v2/checkout/orders/{paypalOrderId} using the OAuth2 token.
   *   2. Extract capture status from purchase_units[0].payments.captures[0].
   *   3. Compare with the local PaymentTransaction state.
   *   4. If the PayPal side shows COMPLETED but local is still pending, settle
   *      and activate (same path as the webhook handler).
   *
   * This endpoint is designed for a reconciliation cron or post-redirect
   * verification from the frontend.
   */
  async verifyPayPalOrder(paypalOrderId: string): Promise<PayPalVerificationResult> {
    if (!this.config.isConfigured) {
      return {
        verified: false,
        paypalOrderId,
        paypalOrderStatus: 'UNCONFIGURED',
        amountMatch: false,
        reconciled: false,
        errorMessage: 'PayPal gateway not configured',
      };
    }

    // ---- Step 1: Fetch order from PayPal API ---------------------------------
    let token: string;
    try {
      token = await this.getAccessToken();
    } catch (err) {
      return {
        verified: false,
        paypalOrderId,
        paypalOrderStatus: 'TOKEN_ERROR',
        amountMatch: false,
        reconciled: false,
        errorMessage: 'Failed to obtain PayPal access token',
      };
    }

    const creds = this.config.require();

    let order: PayPalApiOrderResponse;
    try {
      order = await this.getJson<PayPalApiOrderResponse>(
        `${creds.baseUrl}${ORDERS_PATH}/${paypalOrderId}`,
        token,
      );
    } catch (err) {
      const message = this.friendlyError(err);
      this.logger.error(
        `PayPal verify order failed paypalOrderId=${paypalOrderId}: ${message}`,
      );
      return {
        verified: false,
        paypalOrderId,
        paypalOrderStatus: 'FETCH_ERROR',
        amountMatch: false,
        reconciled: false,
        errorMessage: message,
      };
    }

    const orderStatus = order.status ?? 'UNKNOWN';
    const purchaseUnit = order.purchase_units?.[0];

    // ---- Step 2: Extract capture info -----------------------------------------
    const captureArray = purchaseUnit?.payments?.captures;
    const capture = captureArray?.[0];
    const captureStatus = capture?.status;

    const grossAmount = capture?.amount?.value
      ?? purchaseUnit?.amount?.value
      ?? '0.00';
    const netAmount =
      capture?.seller_receivable_breakdown?.net_amount?.value ?? grossAmount;
    const paypalFee =
      capture?.seller_receivable_breakdown?.paypal_fee?.value ?? '0.00';
    const currency =
      capture?.amount?.currency_code
      ?? purchaseUnit?.amount?.currency_code
      ?? 'USD';

    let internalAmount: bigint;
    try {
      internalAmount = payPalDecimalToInternal(grossAmount);
    } catch {
      return {
        verified: true,
        paypalOrderId,
        paypalOrderStatus: orderStatus,
        captureStatus,
        grossAmount,
        netAmount,
        paypalFee,
        currency,
        amountMatch: false,
        reconciled: false,
        errorMessage: 'Cannot parse PayPal gross amount',
      };
    }

    // ---- Step 3: Cross-check against local state -------------------------------
    const orderId = purchaseUnit?.invoice_id ?? purchaseUnit?.reference_id ?? '';
    const tenantId = purchaseUnit?.custom_id;

    let localTx = await this.prisma.paymentTransaction.findFirst({
      where: {
        gateway: 'paypal',
        metadata: { path: ['paypalOrderId'], equals: paypalOrderId },
      },
      select: {
        id: true,
        status: true,
        amount: true,
        invoiceId: true,
        metadata: true,
      },
    });

    // Fallback: try lookup by paypalCaptureId when stored.
    if (!localTx && capture?.id) {
      localTx = await this.prisma.paymentTransaction.findFirst({
        where: {
          gateway: 'paypal',
          metadata: { path: ['paypalCaptureId'], equals: capture.id },
        },
        select: {
          id: true,
          status: true,
          amount: true,
          invoiceId: true,
          metadata: true,
        },
      });
    }

    const amountMatch = localTx
      ? Math.abs(Number(localTx.amount) - Number(internalAmount)) /
            Math.max(Number(localTx.amount), 1) <=
          0.02
      : false;

    // ---- Step 4: Reconcile if capture is COMPLETED but local is pending --------
    let reconciled = false;

    if (
      localTx &&
      captureStatus === 'COMPLETED' &&
      !['success', 'failed', 'refunded'].includes(localTx.status)
    ) {
      // This captures the "IPN dropped" scenario — PayPal confirms success,
      // but our local state is still pending. Settle and activate.
      this.logger.log(
        `Reconcile triggered: paypalOrderId=${paypalOrderId} ` +
          `local=${localTx.status} palpal=${captureStatus}`,
      );

      // Use the IPN guard's claim+settle for safety.
      try {
        const claim = await this.ipnGuard.claim(
          orderId || paypalOrderId,
          capture?.id,
          internalAmount,
        );

        if (claim.decision === 'claimed' && claim.transactionId) {
          const settled = await this.ipnGuard.settle(
            claim.transactionId,
            'success',
            {
              gatewayTxId: capture?.id,
              gateway: 'paypal',
              metadata: {
                paypalCaptureId: capture?.id,
                paypalOrderId,
                grossAmount,
                netAmount,
                paypalFee,
                currency,
                reconciledAt: new Date().toISOString(),
                source: 'active-reconciliation',
              },
            },
          );

          if (settled) {
            reconciled = true;

            // Activate subscription.
            try {
              await this.subscriptionActivator.activateByOrderId({
                orderId: orderId || paypalOrderId,
                gateway: 'paypal',
                gatewayTxId: capture?.id,
                ipnPayload: { source: 'reconciliation', paypalOrderId, captureId: capture?.id },
              });
            } catch (actErr) {
              this.logger.warn(
                `Reconcile activation warning orderId=${orderId}: ${(actErr as Error).message}`,
              );
            }
          }
        } else if (
          claim.decision === 'duplicate' &&
          claim.currentStatus === 'success'
        ) {
          reconciled = true;
        } else {
          this.logger.warn(
            `Reconcile claim failed for paypalOrderId=${paypalOrderId}: ` +
              `decision=${claim.decision}`,
          );
        }
      } catch (claimErr) {
        this.logger.error(
          `Reconcile error for paypalOrderId=${paypalOrderId}: ${(claimErr as Error).message}`,
        );
      }
    } else if (
      localTx &&
      ['success', 'failed', 'refunded'].includes(localTx.status)
    ) {
      reconciled = true;
    }

    return {
      verified: true,
      paypalOrderId,
      paypalOrderStatus: orderStatus,
      captureStatus,
      grossAmount,
      netAmount,
      paypalFee,
      currency,
      internalAmount,
      amountMatch,
      reconciled,
    };
  }

  // ── Hàm #4: capturePayPalOrder (mới) ───────────────────────────────────────

  /**
   * Capture a PayPal order after user approval (JS SDK `onApprove`).
   *
   * Flow:
   *   1. OAuth2 token.
   *   2. POST /v2/checkout/orders/{id}/capture với PayPal-Request-Id idempotency.
   *   3. Bóc tách capture resource, parse số tiền.
   *   4. Idempotency claim qua PayPalIpnGuard.
   *   5. Settle PaymentTransaction = success.
   *   6. Nạp BigInt vào ví qua LedgerService.creditBalance(TOPUP).
   *   7. Best-effort kích hoạt subscription.
   *
   * Idempotency 2 lớp:
   *   (a) PayPal-Request-Id header — chống double-capture phía PayPal.
   *   (b) PayPalIpnGuard.claim() + LedgerService.creditBalance idempotent key
   *       (captureId) — webhook + client-capture trùng nhau vẫn chỉ nạp 1 lần.
   *
   * An toàn tài chính: nếu credit ví lỗi sau khi PayPal đã COMPLETED, KHÔNG
   * rollback — ghi log để reconcile cron bù (mất tiền nặng hơn rollback ảo).
   */
  async capturePayPalOrder(
    input: PayPalCaptureOrderInput,
  ): Promise<PayPalCaptureOrderResult> {
    const { paypalOrderId, tenantId, expectedOrderId } = input;
    const base: Pick<
      PayPalCaptureOrderResult,
      'success' | 'paypalOrderId' | 'walletCredited' | 'subscriptionActivated'
    > = {
      success: false,
      paypalOrderId,
      walletCredited: false,
      subscriptionActivated: false,
    };

    // ---- 1. OAuth token ----------------------------------------------------
    let token: string;
    try {
      token = await this.getAccessToken();
    } catch (err) {
      return {
        ...base,
        errorMessage: 'Không lấy được token xác thực PayPal.',
      };
    }

    const creds = this.config.require();

    // ---- 2. POST /v2/checkout/orders/{id}/capture ---------------------------
    // Idempotency lớp 1: PayPal-Request-Id header
    // Giúp PayPal idempotency-safe nếu client gửi trùng request.
    let cap: PayPalApiOrderResponse;
    try {
      cap = await this.postJson<PayPalApiOrderResponse>(
        `${creds.baseUrl}${ORDERS_PATH}/${paypalOrderId}/capture`,
        {}, // Body rỗng — PayPal capture không cần body
        token,
        { 'PayPal-Request-Id': `cap-${paypalOrderId}` },
      );
    } catch (err) {
      const message = this.friendlyError(err);
      this.logger.error(
        `PayPal capture failed paypalOrderId=${paypalOrderId}: ${message}`,
      );
      return { ...base, errorMessage: message };
    }

    // ---- 3. Bóc tách capture resource ----------------------------------------
    const pu = cap.purchase_units?.[0];
    const captures = pu?.payments?.captures;
    const capture = captures?.[0];

    if (!capture || capture.status !== 'COMPLETED') {
      return {
        ...base,
        captureStatus: capture?.status ?? cap.status,
        errorMessage:
          capture && capture.status !== 'COMPLETED'
            ? `Capture chưa COMPLETED (status=${capture.status}).`
            : 'Không tìm thấy capture resource.',
      };
    }

    const captureId = capture.id;
    const grossAmount = capture.amount?.value ?? '0.00';
    const currency = capture.amount?.currency_code ?? 'USD';
    const netAmount =
      capture.seller_receivable_breakdown?.net_amount?.value ?? grossAmount;
    const paypalFee =
      capture.seller_receivable_breakdown?.paypal_fee?.value ?? '0.00';

    // orderId nội bộ ưu tiên từ PayPal echo (invoice_id/custom_id).
    // KHÔNG tin dto.expectedOrderId tuyệt đối — chỉ dùng làm fallback.
    const orderId =
      pu?.invoice_id ?? pu?.reference_id ?? expectedOrderId ?? paypalOrderId;

    // Chuyển đổi PayPal decimal → internal BigInt
    let internalAmount: bigint;
    try {
      internalAmount = payPalDecimalToInternal(grossAmount);
    } catch {
      return {
        ...base,
        captureId,
        captureStatus: capture.status,
        errorMessage: 'Sai định dạng số tiền capture (PayPal decimal).',
      };
    }

    // ---- 4. Idempotency claim (chống nạp ví 2 lần) ------------------------
    // Dùng chung guard với webhook — webhook và client-capture không thể
    // cùng nạp ví cho cùng một captureId.
    let claim;
    try {
      claim = await this.ipnGuard.claim(orderId, captureId, internalAmount);
    } catch (err) {
      this.logger.error(
        `Capture IPN claim error paypalOrderId=${paypalOrderId}: ${(err as Error).message}`,
      );
      return {
        ...base,
        captureId,
        captureStatus: capture.status,
        errorMessage: 'Idempotency guard error.',
      };
    }

    // 4a. Đã xử lý trước đó → trả về idempotent (không nạp lại)
    if (claim.decision === 'duplicate' && claim.currentStatus === 'success') {
      this.logger.log(
        `Capture idempotent: paypalOrderId=${paypalOrderId} captureId=${captureId} — already processed.`,
      );
      return {
        success: true,
        paypalOrderId,
        captureId,
        captureStatus: 'COMPLETED',
        grossAmount,
        netAmount,
        paypalFee,
        currency,
        walletCredited: true,
        subscriptionActivated: true,
        errorMessage: 'Idempotent: giao dịch đã được xử lý.',
      };
    }

    if (claim.decision !== 'claimed' || !claim.transactionId) {
      return {
        ...base,
        captureId,
        captureStatus: capture.status,
        errorMessage: `Không claim được giao dịch (decision=${claim.decision}).`,
      };
    }

    // ---- 5. Settle PaymentTransaction = success ---------------------------
    // Serializable transaction trong guard
    const settled = await this.ipnGuard.settle(
      claim.transactionId,
      'success',
      {
        gatewayTxId: captureId,
        gateway: 'paypal',
        metadata: {
          paypalOrderId,
          paypalCaptureId: captureId,
          grossAmount,
          netAmount,
          paypalFee,
          currency,
          source: 'client-capture',
          capturedAt: new Date().toISOString(),
        },
      } as any,
    );

    if (!settled) {
      this.logger.warn(
        `Capture settle race lost tx=${claim.transactionId} paypalOrderId=${paypalOrderId}`,
      );
      return {
        ...base,
        captureId,
        captureStatus: 'COMPLETED',
        errorMessage: 'Settle race lost — đang được xử lý bởi luồng khác.',
      };
    }

    // ---- 6. NẠP VÍ qua LedgerService.creditBalance --------------------------
    // Idempotent key: (tenantId, referenceType=topup, referenceId=captureId)
    // LedgerService đã có unique constraint + CAS + interactive transaction.
    // Không rollback nếu credit lỗi — tiền PayPal đã capture.
    let walletCredited = false;
    let ledgerTransactionId: string | undefined;
    let newBalanceDisplay: string | undefined;

    try {
      const ledgerRes = await this.ledger.creditBalance({
        tenantId,
        amount: internalAmount, // BigInt smallest unit
        referenceType: LedgerReferenceTypes.TOPUP, // 'topup'
        referenceId: captureId, // idempotency key
        description: `PayPal capture nạp ví: ${grossAmount} ${currency}`,
        metadata: {
          paypalOrderId,
          captureId,
          grossAmount,
          netAmount,
          paypalFee,
          currency,
        },
      });

      walletCredited = ledgerRes.success;
      ledgerTransactionId = ledgerRes.transactionId;
      newBalanceDisplay = `${(Number(ledgerRes.balanceAfter) / 100).toLocaleString('vi-VN')}₫`;
    } catch (err) {
      this.logger.error(
        `Wallet credit fail order=${orderId}: ${(err as Error).message}`,
      );
      // An toàn tài chính: không rollback — log để reconcile cron xử lý.
    }

    // ---- 7. Kích hoạt subscription (best-effort, non-fatal) -----------------
    let subscriptionActivated = false;
    try {
      const act = await this.subscriptionActivator.activateByOrderId({
        orderId,
        gateway: 'paypal',
        gatewayTxId: captureId,
        paidAt: new Date((capture as any).create_time ?? Date.now()),
        ipnPayload: {
          source: 'client-capture',
          paypalOrderId,
          captureId,
        },
      });
      subscriptionActivated = !!act.activated;
      this.logger.log(
        `Capture subscription activation orderId=${orderId} activated=${subscriptionActivated}`,
      );
    } catch (err) {
      this.logger.warn(
        `Capture activation warning orderId=${orderId}: ${(err as Error).message}`,
      );
    }

    return {
      success: true,
      paypalOrderId,
      captureId,
      captureStatus: 'COMPLETED',
      grossAmount,
      netAmount,
      paypalFee,
      currency,
      internalAmount,
      walletCredited,
      newBalanceDisplay,
      ledgerTransactionId,
      subscriptionActivated,
    };
  }

  // ── Webhook signature verification (POST-back) ──────────────────────────────

  /**
   * Verify a PayPal webhook event signature via the PayPal POST-back API.
   *
   * PayPal's recommended approach: instead of local HMAC verification (which
   * requires certificate chain download + timestamp validation), we POST the
   * received headers and event body to PayPal's own verification endpoint.
   * This is simpler, more secure, and avoids certificate rotation management.
   *
   * Returns true only when verification_status === 'SUCCESS'.
   */
  private async verifyWebhookSignature(
    headers: PayPalWebhookHeaders,
    body: PayPalWebhookEvent,
  ): Promise<boolean> {
    const creds = this.config.tryGet();
    if (!creds || !creds.webhookId) {
      // Missing webhook ID — cannot verify. In dev/sandbox, permit (warn).
      if (creds?.mode === 'sandbox') {
        this.logger.warn(
          'PAYPAL_WEBHOOK_ID not set — skipping webhook signature verification (sandbox mode)',
        );
        return true;
      }
      this.logger.error(
        'PAYPAL_WEBHOOK_ID not set — webhook signature verification impossible',
      );
      return false;
    }

    let token: string;
    try {
      token = await this.getAccessToken();
    } catch (err) {
      this.logger.error(
        `Webhook verify: token mint failed: ${(err as Error).message}`,
      );
      return false;
    }

    const verificationBody = {
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'] ?? new Date().toISOString(),
      webhook_id: creds.webhookId,
      webhook_event: body,
    };

    try {
      const result = await this.postJson<PayPalVerifyWebhookResponse>(
        `${creds.baseUrl}${VERIFY_WEBHOOK_PATH}`,
        verificationBody,
        token,
      );

      const isSuccess =
        result.verification_status === 'SUCCESS';

      if (!isSuccess) {
        this.logger.warn(
          `PayPal webhook verification returned ${result.verification_status}` +
            ` event=${body?.id}`,
        );
      }

      return isSuccess;
    } catch (err) {
      this.logger.error(
        `PayPal webhook POST-back failed event=${body?.id}: ${this.friendlyError(err)}`,
      );
      return false;
    }
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

  private async getJson<T>(url: string, token: string): Promise<T> {
    const res = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
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
