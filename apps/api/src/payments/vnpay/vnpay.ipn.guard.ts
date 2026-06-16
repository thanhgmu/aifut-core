/**
 * VNPay SDK — IPN Idempotency Guard (3-layer).
 *
 * VNPay may deliver the same IPN callback multiple times, and concurrent
 * deliveries can race. This guard enforces exactly-once settlement using a
 * three-layer defense strategy backed by the database:
 *
 *   Layer 1 — Pre-check (read):
 *       Look up the PaymentTransaction by (gateway='vnpay', vnp_TxnRef).
 *       If it is already in a terminal state (success/failed/refunded),
 *       short-circuit and report a duplicate. Cheap, catches the common case,
 *       and also validates the gateway amount against the recorded amount.
 *
 *   Layer 2 — CAS row-lock (conditional write / compare-and-swap):
 *       Transition the row from `pending` -> `processing` inside a single
 *       `updateMany` WHERE status='pending'. Postgres row-level locking
 *       guarantees exactly one concurrent caller flips the row; count===0
 *       means another worker already claimed it.
 *
 *   Layer 3 — Serializable transaction (race fence):
 *       Finalize the settle inside an interactive transaction with
 *       Serializable isolation, re-validating the row is still `processing`
 *       before committing the terminal state. Defends against TOCTOU and any
 *       mutation interleaved between claim and settle.
 *
 * The guard never trusts the wire payload alone — settlement is gated on the
 * database state machine, which is the single source of truth. Signature
 * authenticity is proven separately by VnpayService.verifyCallback().
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

export type VnpayIdempotencyDecision =
  | 'claimed' // caller won the claim, may proceed to settle
  | 'duplicate' // already terminal, ignore safely
  | 'in-progress' // another worker holds the claim right now
  | 'not-found' // no matching transaction row
  | 'amount-mismatch'; // integrity violation, reject

export interface VnpayIdempotencyClaim {
  decision: VnpayIdempotencyDecision;
  transactionId?: string;
  currentStatus?: string;
  reason?: string;
}

const TERMINAL_STATES = new Set(['success', 'failed', 'refunded']);

@Injectable()
export class VnpayIpnGuard {
  private readonly logger = new Logger(VnpayIpnGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Attempt to claim a transaction for settlement.
   *
   * @param txnRef     VNPay vnp_TxnRef (our order id).
   * @param transactionNo VNPay vnp_TransactionNo, persisted for cross-checking.
   * @param amount     Amount in VND dong reported by the IPN (already /100),
   *                   validated against the DB-recorded amount.
   */
  async claim(
    txnRef: string,
    transactionNo: string | undefined,
    amount: number,
  ): Promise<VnpayIdempotencyClaim> {
    // ---- Layer 1: fast pre-check -------------------------------------------
    const tx = await this.prisma.paymentTransaction.findFirst({
      where: { gateway: 'vnpay', gatewayTxId: txnRef },
      select: { id: true, status: true, amount: true },
    });

    // Fallback lookup by metadata vnp_TxnRef when gatewayTxId stores something else.
    const resolved =
      tx ??
      (await this.prisma.paymentTransaction.findFirst({
        where: {
          gateway: 'vnpay',
          metadata: { path: ['vnp_TxnRef'], equals: txnRef },
        },
        select: { id: true, status: true, amount: true },
      }));

    if (!resolved) {
      this.logger.warn(`IPN for unknown VNPay txnRef=${txnRef}`);
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

    // Integrity: the IPN amount must match the recorded amount (dong-safe).
    if (Math.round(resolved.amount) !== Math.round(amount)) {
      this.logger.error(
        `Amount mismatch for tx=${resolved.id}: db=${resolved.amount} ipn=${amount}`,
      );
      return {
        decision: 'amount-mismatch',
        transactionId: resolved.id,
        currentStatus: resolved.status,
        reason: `Amount mismatch db=${resolved.amount} ipn=${amount}`,
      };
    }

    // ---- Layer 2: CAS row-lock claim ---------------------------------------
    const claimed = await this.prisma.paymentTransaction.updateMany({
      where: { id: resolved.id, status: 'pending' },
      data: {
        status: 'processing',
        gatewayTxId: transactionNo ?? resolved.id,
        updatedAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      // Lost the race: re-read to distinguish duplicate vs in-progress.
      const after = await this.prisma.paymentTransaction.findUnique({
        where: { id: resolved.id },
        select: { status: true },
      });
      const decision: VnpayIdempotencyDecision = TERMINAL_STATES.has(
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
   * Re-validates that the row is still in `processing` (the state set by the
   * claim) before committing the terminal state, fencing off any interleaved
   * mutation that slipped between claim and settle.
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
      // Release the claim back to pending so an IPN redelivery can recover.
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
