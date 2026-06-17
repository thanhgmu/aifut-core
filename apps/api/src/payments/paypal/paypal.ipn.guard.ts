/**
 * PayPal Gateway SDK — Webhook Idempotency Guard (3-layer).
 *
 * PayPal may deliver the same webhook event multiple times, and concurrent
 * deliveries (plus the active reconcile cron) can race. This guard enforces
 * exactly-once settlement using a three-layer defense backed by the database:
 *
 *   Layer 1 — Pre-check (read):
 *       Look up the PaymentTransaction by (gateway='paypal', captureId), with a
 *       fallback to (gateway='paypal', metadata.paypalOrderId). If already in a
 *       terminal state (success/failed/refunded) → duplicate. Also validates
 *       the reported amount against the recorded amount within a ±2% tolerance
 *       band (cross-currency / cross-border fee cushion).
 *
 *   Layer 2 — CAS row-lock (compare-and-swap):
 *       Transition the row pending -> processing inside a single `updateMany`
 *       WHERE status='pending'. Postgres row-level locking guarantees exactly
 *       one concurrent caller flips it; count===0 means someone else claimed it.
 *
 *   Layer 3 — Serializable transaction (race fence):
 *       Finalize the settle inside an interactive transaction with Serializable
 *       isolation, re-validating the row is still `processing` before committing
 *       the terminal state. On failure the claim is released back to `pending`
 *       so a PayPal redelivery (or reconcile) can recover.
 *
 * Differences vs VnpayIpnGuard / MomoIpnGuard:
 *   - Lookup key: paypalCaptureId → paypalOrderId (metadata), not vnp_TxnRef.
 *   - Amount match: ±2% tolerance (cross-currency spread + PayPal fee), not
 *     exact VND equality.
 *   - Settlement patch carries gross_amount, net_amount and paypal_fee in
 *     metadata; the internal `amount` is never mutated by PayPal fees.
 *
 * Signature authenticity is proven separately by
 * PayPalService.verifyWebhookSignature() (POST-back verify API).
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { isAmountWithinTolerance } from './paypal.utils';

export type PayPalIdempotencyDecision =
  | 'claimed' // caller won the claim, may proceed to settle
  | 'duplicate' // already terminal, ignore safely
  | 'in-progress' // another worker holds the claim right now
  | 'not-found' // no matching transaction row (webhook may precede record)
  | 'amount-mismatch'; // integrity violation beyond tolerance, reject

export interface PayPalIdempotencyClaim {
  decision: PayPalIdempotencyDecision;
  transactionId?: string;
  currentStatus?: string;
  reason?: string;
}

const TERMINAL_STATES = new Set(['success', 'failed', 'refunded']);
/** Cross-currency / cross-border fee tolerance for amount reconciliation. */
const AMOUNT_TOLERANCE_RATE = 0.02;

@Injectable()
export class PayPalIpnGuard {
  private readonly logger = new Logger(PayPalIpnGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Attempt to claim a transaction for settlement.
   *
   * @param orderId    Internal order id (resource.invoice_id), primary anchor.
   * @param captureId  PayPal capture id (resource.id), persisted for cross-check.
   * @param amount     Reported amount converted to internal smallest units,
   *                   validated against the DB-recorded amount within ±2%.
   */
  async claim(
    orderId: string,
    captureId: string | undefined,
    amount: bigint,
  ): Promise<PayPalIdempotencyClaim> {
    // ---- Layer 1: fast pre-check -------------------------------------------
    // Primary lookup by captureId (most specific), fallback by paypalOrderId,
    // then by internal order id stored in gatewayTxId.
    let resolved =
      captureId !== undefined
        ? await this.prisma.paymentTransaction.findFirst({
            where: {
              gateway: 'paypal',
              metadata: { path: ['paypalCaptureId'], equals: captureId },
            },
            select: { id: true, status: true, amount: true },
          })
        : null;

    resolved =
      resolved ??
      (await this.prisma.paymentTransaction.findFirst({
        where: {
          gateway: 'paypal',
          metadata: { path: ['paypalOrderId'], equals: orderId },
        },
        select: { id: true, status: true, amount: true },
      }));

    resolved =
      resolved ??
      (await this.prisma.paymentTransaction.findFirst({
        where: { gateway: 'paypal', gatewayTxId: orderId },
        select: { id: true, status: true, amount: true },
      }));

    if (!resolved) {
      // Webhook may arrive before the transaction record is persisted; the
      // controller should return 200 so PayPal retries later.
      this.logger.warn(`Webhook for unknown PayPal order=${orderId}`);
      return { decision: 'not-found', reason: 'No matching transaction' };
    }

    if (TERMINAL_STATES.has(resolved.status)) {
      return {
        decision: 'duplicate',
        transactionId: resolved.id,
        currentStatus: resolved.status,
        reason: 'Transaction already in terminal state',
      };
    }

    // Integrity: reported amount must be within ±2% of the recorded amount.
    const recorded = BigInt(Math.round(resolved.amount));
    if (!isAmountWithinTolerance(recorded, amount, AMOUNT_TOLERANCE_RATE)) {
      this.logger.error(
        `Amount mismatch tx=${resolved.id}: db=${resolved.amount} paypal=${amount.toString()} (>2%)`,
      );
      return {
        decision: 'amount-mismatch',
        transactionId: resolved.id,
        currentStatus: resolved.status,
        reason: `Amount mismatch db=${resolved.amount} paypal=${amount.toString()}`,
      };
    }

    // ---- Layer 2: CAS row-lock claim ---------------------------------------
    const claimed = await this.prisma.paymentTransaction.updateMany({
      where: { id: resolved.id, status: 'pending' },
      data: {
        status: 'processing',
        gatewayTxId: captureId ?? resolved.id,
        updatedAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      // Lost the race: re-read to distinguish duplicate vs in-progress.
      const after = await this.prisma.paymentTransaction.findUnique({
        where: { id: resolved.id },
        select: { status: true },
      });
      const decision: PayPalIdempotencyDecision = TERMINAL_STATES.has(
        after?.status ?? '',
      )
        ? 'duplicate'
        : 'in-progress';
      return {
        decision,
        transactionId: resolved.id,
        currentStatus: after?.status,
        reason:
          decision === 'duplicate'
            ? 'Settled concurrently by another worker'
            : 'Claimed concurrently by another worker',
      };
    }

    return {
      decision: 'claimed',
      transactionId: resolved.id,
      currentStatus: 'processing',
    };
  }

  /**
   * Layer 3: finalize the settlement inside a Serializable transaction.
   * Must only be called after a successful `claim()` (decision === 'claimed').
   *
   * Re-validates the row is still `processing` before committing the terminal
   * state, fencing off any interleaved mutation between claim and settle. The
   * `patch` should carry PayPal breakdown (gross/net/fee) in metadata.
   */
  async settle(
    transactionId: string,
    finalStatus: 'success' | 'failed',
    patch: Prisma.PaymentTransactionUpdateInput,
  ): Promise<boolean> {
    try {
      return await this.prisma.$transaction(
        async (txClient) => {
          const row = await txClient.paymentTransaction.findUnique({
            where: { id: transactionId },
            select: { status: true },
          });

          if (!row || row.status !== 'processing') {
            this.logger.warn(
              `Settle fence rejected tx=${transactionId} status=${row?.status}`,
            );
            return false;
          }

          await txClient.paymentTransaction.update({
            where: { id: transactionId },
            data: {
              ...patch,
              status: finalStatus,
              paidAt: finalStatus === 'success' ? new Date() : null,
              updatedAt: new Date(),
            },
          });
          return true;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err) {
      this.logger.error(
        `Settle transaction failed tx=${transactionId}: ${(err as Error).message}`,
      );
      // Release the claim back to pending so a webhook redelivery can recover.
      await this.prisma.paymentTransaction
        .updateMany({
          where: { id: transactionId, status: 'processing' },
          data: { status: 'pending', updatedAt: new Date() },
        })
        .catch(() => undefined);
      return false;
    }
  }
}
