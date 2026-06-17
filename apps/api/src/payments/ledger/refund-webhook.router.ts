// ============================================================
// refund-webhook.router.ts — Refund Webhook Router Service
// ============================================================
// Module: apps/api/src/payments/ledger
// Mô tả: Đấu nối webhook hoàn tiền từ các payment gateway vào
// LedgerRefundService. Xử lý bất đồng bộ:
//   - Stripe: bắt sự kiện 'charge.refunded' → syncRefundStatus()
//   - MoMo: bắt phản hồi hoàn tiền từ IPN → syncRefundStatus()
//
// Cung cấp phương thức syncRefundStatus() public để PaymentsWebhookService
// gọi khi phát hiện sự kiện charge.refunded từ Stripe hoặc phản hồi
// refund thành công từ MoMo.
//
// Flow:
//   1. Nhận event payload từ webhook (gateway + event type + metadata)
//   2. Parse & map sang RefundInput
//   3. Kiểm tra idempotency (đã có refund record?)
//   4. Gọi LedgerRefundService.processRefundCredit()
//   5. Cập nhật PaymentTransaction.status = 'refunded' nếu hoàn toàn bộ
//   6. Log kết quả cho reconciliation
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { LedgerRefundService } from './ledger-refund.service';
import type { RefundInput, RefundResult } from './ledger-refund.types';

/**
 * RefundEventPayload
 * ==================
 * Cấu trúc dữ liệu đầu vào chuẩn hóa cho syncRefundStatus(),
 * bất kể gateway (Stripe, MoMo, VNPay...).
 */
export interface RefundEventPayload {
  /** Gateway name: 'stripe' | 'momo' | 'vnpay' */
  gateway: string;

  /** Event type từ gateway webhook (vd: 'charge.refunded') */
  eventType: string;

  /** ID giao dịch gốc trên gateway (gatewayTxId của PaymentTransaction) */
  gatewayTxId: string;

  /** Số tiền hoàn (đơn vị đồng, number từ gateway) */
  amount: number;

  /** Tenant ID (từ metadata của giao dịch gốc) */
  tenantId: string;

  /** ID giao dịch nội bộ (PaymentTransaction.id) — optional, resolve từ gatewayTxId nếu thiếu */
  originalTransactionId?: string;

  /** Currency (mặc định VND) */
  currency?: string;

  /** Thời gian gateway báo refund */
  refundedAt?: string;

  /** Raw payload gốc từ gateway (cho debug) */
  rawPayload?: Record<string, unknown>;
}

/**
 * RefundWebhookResult
 * ===================
 * Kết quả xử lý webhook refund.
 */
export interface RefundWebhookResult {
  handled: boolean;
  refundRecordId?: string;
  transactionId?: string;
  amount?: string;
  status: 'SUCCESS' | 'SKIPPED' | 'FAILED';
  reason?: string;
}

@Injectable()
export class RefundWebhookRouter {
  private readonly logger = new Logger(RefundWebhookRouter.name);

  constructor(
    private readonly refundService: LedgerRefundService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * syncRefundStatus
   * ================
   * Entry point duy nhất cho mọi webhook hoàn tiền từ payment gateway.
   *
   * Flow:
   *   1. Kiểm tra idempotency: đã có RefundRecord cho giao dịch này chưa?
   *   2. Tra cứu PaymentTransaction gốc
   *   3. Map sang RefundInput
   *   4. Gọi LedgerRefundService.processRefundCredit()
   *   5. Cập nhật PaymentTransaction.status = 'refunded' nếu hoàn toàn bộ
   *
   * @param payload - RefundEventPayload chuẩn hóa
   * @returns       - RefundWebhookResult
   */
  async syncRefundStatus(payload: RefundEventPayload): Promise<RefundWebhookResult> {
    this.logger.log(
      `Refund webhook received | gateway=${payload.gateway} | ` +
        `event=${payload.eventType} | gatewayTxId=${payload.gatewayTxId} | ` +
        `amount=${payload.amount}`,
    );

    try {
      // ── 1. Tra cứu PaymentTransaction gốc ─────────────────────
      let transaction = await this.resolvePaymentTransaction(payload);

      if (!transaction) {
        this.logger.warn(
          `Refund webhook: không tìm thấy PaymentTransaction | ` +
            `gatewayTxId=${payload.gatewayTxId}`,
        );
        return {
          handled: false,
          status: 'SKIPPED',
          reason: 'Không tìm thấy giao dịch gốc.',
        };
      }

      const tenantId = transaction.tenantId;
      const originalTxId = transaction.id;
      const amount = BigInt(Math.round(payload.amount));

      // ── 2. Kiểm tra idempotency ──────────────────────────────
      const existingRefund = await this.prisma.refundRecord.findFirst({
        where: {
          originalReferenceId: originalTxId,
          status: 'SUCCESS',
        },
      });

      if (existingRefund) {
        this.logger.warn(
          `Refund webhook: đã xử lý refund cho giao dịch này | ` +
            `originalReferenceId=${originalTxId} | ` +
            `existingRefundRecord=${existingRefund.id}`,
        );
        return {
          handled: true,
          refundRecordId: existingRefund.id,
          status: 'SKIPPED',
          reason: 'Refund đã được xử lý trước đó.',
        };
      }

      // ── 3. Tạo RefundInput ────────────────────────────────────
      const refundInput: RefundInput = {
        tenantId,
        originalReferenceId: originalTxId,
        amount,
        description: `Hoàn tiền tự động từ ${payload.gateway} | ` +
          `event=${payload.eventType} | gatewayTxId=${payload.gatewayTxId}`,
        metadata: {
          gateway: payload.gateway,
          eventType: payload.eventType,
          gatewayTxId: payload.gatewayTxId,
          refundedAt: payload.refundedAt ?? new Date().toISOString(),
          rawPayload: payload.rawPayload ?? null,
        },
      };

      // ── 4. Gọi processRefundCredit ────────────────────────────
      const result: RefundResult = await this.refundService.processRefundCredit(refundInput);

      // ── 5. Cập nhật PaymentTransaction.status → refunded ─────
      await this.markTransactionRefunded(transaction.id, payload);

      this.logger.log(
        `Refund webhook SUCCESS | gateway=${payload.gateway} | ` +
          `originalTx=${originalTxId} | ` +
          `refundRecord=${result.refundRecordId} | ` +
          `ledgerTx=${result.transactionId} | amount=${result.amount}`,
      );

      return {
        handled: true,
        refundRecordId: result.refundRecordId,
        transactionId: result.transactionId,
        amount: result.amount.toString(),
        status: 'SUCCESS',
      };
    } catch (error: any) {
      this.logger.error(
        `Refund webhook FAILED | gateway=${payload.gateway} | ` +
          `gatewayTxId=${payload.gatewayTxId} | error=${error.message}`,
        error.stack,
      );
      return {
        handled: false,
        status: 'FAILED',
        reason: error.message,
      };
    }
  }

  /**
   * handleStripeChargeRefunded
   * ===========================
   * Xử lý sự kiện Stripe 'charge.refunded'.
   * Parse event payload từ Stripe, map sang RefundEventPayload,
   * sau đó gọi syncRefundStatus().
   *
   * Stripe charge.refunded event data.object chứa:
   *   - id: charge ID (gatewayTxId)
   *   - amount_refunded: số tiền đã refund (cents)
   *   - metadata.tenantId: tenant ID (nếu có)
   *   - metadata.transactionId: PaymentTransaction.id (nếu có)
   *
   * @param event - Stripe event object (raw)
   */
  async handleStripeChargeRefunded(event: Record<string, any>): Promise<RefundWebhookResult> {
    const charge = event?.data?.object ?? {};
    const metadata: Record<string, any> = charge.metadata ?? {};

    const payload: RefundEventPayload = {
      gateway: 'stripe',
      eventType: event.type ?? 'charge.refunded',
      gatewayTxId: charge.id as string,
      amount: Math.round((charge.amount_refunded as number ?? 0) / 100), // cents → VND
      tenantId: metadata.tenantId as string ?? '',
      originalTransactionId: metadata.transactionId as string ?? undefined,
      currency: charge.currency?.toUpperCase() ?? 'VND',
      refundedAt: new Date((charge.refunded_at as number ?? Date.now()) * 1000).toISOString(),
      rawPayload: event,
    };

    // Nếu không có tenantId trong metadata, cố gắng resolve từ DB
    if (!payload.tenantId) {
      const tx = await this.prisma.paymentTransaction.findFirst({
        where: { gatewayTxId: payload.gatewayTxId },
      });
      if (tx) {
        payload.tenantId = tx.tenantId;
        payload.originalTransactionId = tx.id;
      } else {
        return {
          handled: false,
          status: 'SKIPPED',
          reason: 'Không thể resolve tenantId từ Stripe charge.refunded event.',
        };
      }
    }

    return this.syncRefundStatus(payload);
  }

  /**
   * handleMomoRefundCallback
   * =========================
   * Xử lý phản hồi hoàn tiền thành công từ MoMo.
   * MoMo gửi callback/lPN kết quả refund với:
   *   - orderId: mã đơn hàng
   *   - transId: mã giao dịch MoMo
   *   - resultCode: 0 = thành công
   *   - amount: số tiền
   *
   * @param payload - raw payload từ MoMo callback
   */
  async handleMomoRefundCallback(payload: Record<string, any>): Promise<RefundWebhookResult> {
    const orderId = payload['orderId'] as string | undefined;
    const transId = payload['transId'] as number | undefined;
    const resultCode = payload['resultCode'] as number | undefined;
    const amount = payload['amount'] as number | undefined;
    const tenantId = payload['tenantId'] as string | undefined;

    // Chỉ xử lý khi resultCode = 0 (thành công)
    if (resultCode !== 0) {
      this.logger.warn(
        `MoMo refund callback: kết quả không thành công | resultCode=${resultCode} | orderId=${orderId}`,
      );
      return {
        handled: false,
        status: 'SKIPPED',
        reason: `MoMo refund không thành công (resultCode=${resultCode}).`,
      };
    }

    const mappedPayload: RefundEventPayload = {
      gateway: 'momo',
      eventType: 'refund.callback',
      gatewayTxId: String(transId ?? ''),
      amount: amount ?? 0,
      tenantId: tenantId ?? '',
      currency: 'VND',
      refundedAt: new Date().toISOString(),
      rawPayload: payload,
    };

    // Resolve tenantId + transaction từ orderId nếu thiếu
    if (!mappedPayload.tenantId && orderId) {
      const tx = await this.prisma.paymentTransaction.findFirst({
        where: { gatewayTxId: orderId },
      });
      if (tx) {
        mappedPayload.tenantId = tx.tenantId;
        mappedPayload.originalTransactionId = tx.id;
      }
    }

    if (!mappedPayload.tenantId) {
      return {
        handled: false,
        status: 'SKIPPED',
        reason: 'Không thể resolve tenantId từ MoMo refund callback.',
      };
    }

    return this.syncRefundStatus(mappedPayload);
  }

  // ================================================================
  // PRIVATE HELPERS
  // ================================================================

  /**
   * Tra cứu PaymentTransaction gốc từ webhook payload.
   * Ưu tiên: originalTransactionId (nếu có) → gatewayTxId.
   */
  private async resolvePaymentTransaction(payload: RefundEventPayload) {
    // Ưu tiên ID nội bộ
    if (payload.originalTransactionId) {
      const byId = await this.prisma.paymentTransaction.findUnique({
        where: { id: payload.originalTransactionId },
      });
      if (byId) return byId;
    }

    // Fallback: gatewayTxId + gateway name
    if (payload.gatewayTxId) {
      const byGateway = await this.prisma.paymentTransaction.findFirst({
        where: {
          gatewayTxId: payload.gatewayTxId,
          gateway: payload.gateway,
        },
      });
      if (byGateway) return byGateway;
    }

    // Final fallback: gatewayTxId không cần gateway
    if (payload.gatewayTxId) {
      const byAny = await this.prisma.paymentTransaction.findFirst({
        where: { gatewayTxId: payload.gatewayTxId },
      });
      if (byAny) return byAny;
    }

    return null;
  }

  /**
   * Đánh dấu PaymentTransaction là đã refund.
   * Chỉ cập nhật nếu chưa ở trạng thái refunded.
   */
  private async markTransactionRefunded(
    transactionId: string,
    payload: RefundEventPayload,
  ): Promise<void> {
    try {
      await this.prisma.paymentTransaction.updateMany({
        where: {
          id: transactionId,
          status: { not: 'refunded' },
        },
        data: {
          status: 'refunded',
          errorMessage: `Auto-refunded via ${payload.gateway} webhook | event=${payload.eventType}`,
        },
      });
    } catch (error: any) {
      // Non-critical: log warning, không block refund
      this.logger.warn(
        `Không thể cập nhật PaymentTransaction.status = refunded | ` +
          `id=${transactionId} | error=${error.message}`,
      );
    }
  }
}
