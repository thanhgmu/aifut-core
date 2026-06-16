/**
 * MoMo Wallet SDK — IPN Idempotency Guard (3-layer).
 *
 * MoMo may deliver the same IPN callback multiple times, and concurrent
 * deliveries can race. This guard enforces exactly-once settlement using a
 * three-layer defense strategy backed by the database:
 *
 *   Layer 1 — Fast pre-check (read):
 *       Look up the PaymentTransaction by (gateway, gatewayTxId/orderId).
 *       If it is already in a terminal state (success/failed/refunded),
 *       short-circuit and report a duplicate. Cheap, catches the common case.
 *
 *   Layer 2 — Atomic claim (conditional write / compare-and-swap):
 *       Attempt to transition the row from `pending` -> `processing` inside a
 *       single `updateMany` WHERE status='pending'. Postgres row-level locking
 *       guarantees only one concurrent caller can flip the row, so exactly one
 *       worker wins the claim. count===0 means another worker already claimed.
 *
 *   Layer 3 — Serialized transaction + amount integrity (race fence):
 *       Run the final settle inside an interactive transaction with
 *       Serializable isolation, re-reading the row FOR UPDATE semantics and
 *       validating the gateway amount matches the recorded amount before
 *       committing the terminal state. Defends against TOCTOU and tampering.
 *
 * The guard never trusts the wire payload alone — settlement is gated on the
 * database state machine, which is the single source of truth.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

export type IdempotencyDecision =
  | 'claimed' // caller won the claim, may proceed to settle
  | 'duplicate' // already terminal, ignore safely
  | 'in-progress' // another worker holds the claim right now
  | 'not-found' // no matching transaction row
  | 'amount-mismatch'; // integrity violation, reject

export interface IdempotencyClaim {
  decision: IdempotencyDecision;
  transactionId?: string;
  currentStatus?: string;
  reason?: string;
}

const TERMINAL_STATES = new Set(['success', 'failed', 'refunded']);

@Injectable()
export class MomoIpnGuard {
  private readonly logger = new Logger(MomoIpnGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Attempt to claim a transaction for settlement.
   *
   * @param orderId   MoMo orderId (mapped to our transaction lookup).
   * @param gatewayTxId MoMo transId, persisted for cross-checking.
   * @param amount    Amount reported by the IPN, validated against the DB.
   */
  async claim(
    orderId: string,
    gatewayTxId: string | number | undefined,
    amount: number,
  ): Promise<IdempotencyClaim> {
    // ---- Layer 1: fast pre-check -------------------------------------------
    const existing = await this.prisma.paymentTransaction.findFirst({
      where: { gateway: 'momo', metadata: { path: ['orderId'], equals: orderId } },
      select: { id: true, status: true, amount: true },
    });

    // Fallback lookup by gatewayTxId when orderId is not stored in metadata.
    const tx =
      existing ??
      (gatewayTxId != null
        ? await this.prisma.paymentTransaction.findFirst({
            where: { gateway: 'momo', gatewayTxId: String(gatewayTxId) },
            select: { id: true, status: true, amount: true },
          })
        : null);

    if (!tx) {
      this.logger.warn(`IPN for unknown MoMo orderId=${orderId}`);
      return { decision: 'not-found', reason: 'No matching transaction' };
    }

    if (TERMINAL_STATES.has(tx.status)) {
      return {
        decision: 'duplicate',
        transactionId: tx.id,
        currentStatus: tx.status,
        reason: 'Transaction already in terminal state',
      };
    }

    // Integrity: the IPN amount must match the recorded amount (cents-safe).
    if (Math.round(tx.amount) !== Math.round(amount)) {
      this.logger.error(
        `Amount mismatch for tx=${tx.id}: db=${tx.amount} ipn=${amount}`,
      );
      return {
        decision: 'amount-mismatch',
        transactionId: tx.id,
        currentStatus: tx.status,
        reason: `Amount mismatch db=${tx.amount} ipn=${amount}`,
      };
    }

    // ---- Layer 2: atomic compare-and-swap claim ----------------------------
    const claimed = await this.prisma.paymentTransaction.updateMany({
      where: { id: tx.id, status: 'pending' },
      data: { status: 'processing', updatedAt: new Date() },
    });

    if (claimed.count === 0) {
      // Lost the race: re-read to distinguish duplicate vs in-progress.
      const after = await this.prisma.paymentTransaction.findUnique({
        where: { id: tx.id },
        select: { status: true },
      });
      const decision: IdempotencyDecision = TERMINAL_STATES.has(
        after?.status ?? '',
      )
        ? 'duplicate'
        : 'in-progress';
      return {
        decision,
        transactionId: tx.id,
        currentStatus: after?.status,
        reason:
          decision === 'duplicate'
            ? 'Settled concurrently by another worker'
            : 'Claimed concurrently by another worker',
      };
    }

    return { decision: 'claimed', transactionId: tx.id, currentStatus: 'processing' };
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
      // Release the claim back to pending so a retry/IPN redelivery can recover.
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
