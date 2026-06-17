// ================================================================
// subscription.service.ts — Subscription Upgrade / Downgrade Core
// ================================================================
// Module: apps/api/src/payments/subscription
//
// upgradeSubscriptionPlan():
//   1. Pre-flight: đảm bảo Wallet tồn tại (qua LedgerService.getOrCreateWallet)
//   2. Prisma INTERACTIVE TRANSACTION:
//      - Row-level lock Subscription + Wallet bằng SELECT ... FOR UPDATE
//        (dùng tx.$queryRaw tagged-template — parameterized, chống SQL injection)
//      - Tính prorated pricing (khấu trừ tiền thừa/thiếu theo số ngày còn lại)
//      - Móc nối ví: ghi DEBIT (upgrade) hoặc CREDIT (downgrade) vào ledger
//        INLINE trong cùng transaction để giữ nguyên row-lock + tính nguyên tử.
//        (LedgerService.debit/credit mở $transaction riêng nên KHÔNG join được
//         vào interactive tx này — do đó ledger write phải nội tuyến.)
//      - Cập nhật Subscription cũ → 'changed', tạo Subscription mới
//      - Xuất Invoice prorated cho khoản thu (nếu có)
//
// LƯU Ý SCHEMA THỰC TẾ:
//   - Wallet.balance là BigInt, lưu theo đơn vị nhỏ nhất (VND * 100).
//   - Subscription KHÔNG có cột metadata/billingCycle → chi tiết proration
//     được lưu trong Invoice.metadata và LedgerTransaction.metadata.
// ================================================================

import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import {
  PlanKey,
  BillingCycle,
  PLAN_DEFINITIONS,
  getPlan,
  getPlanPrice,
  comparePlanKeys,
  cycleMonths,
} from './plan.config';
import {
  UpgradeSubscriptionInput,
  UpgradeResult,
  ProratedPricingInput,
  ProrationDetail,
  CancelResult,
  SubscriptionRecord,
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_LEDGER_REF,
} from './subscription.types';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
/** Hệ số quy đổi VND → đơn vị nhỏ nhất lưu trong Wallet/Ledger (BigInt) */
const UNIT_SCALE = 100;

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  // ================================================================
  // CORE: upgradeSubscriptionPlan()
  // ================================================================

  async upgradeSubscriptionPlan(
    input: UpgradeSubscriptionInput,
  ): Promise<UpgradeResult> {
    const { tenantId, currentSubscriptionId, targetPlanKey, targetCycle, immediate } = input;

    // --- Validate target plan ---
    const newPlan = getPlan(targetPlanKey);
    if (!newPlan) {
      throw new BadRequestException(`Invalid plan key: ${targetPlanKey}`);
    }

    // --- Pre-flight: đảm bảo Wallet tồn tại trước khi lock FOR UPDATE ---
    // (Nếu chưa có ví, FOR UPDATE sẽ trả về rỗng → tạo trước qua LedgerService)
    await this.ledger.getOrCreateWallet(tenantId);

    return this.prisma.$transaction(async (tx) => {
      // ═══════════════════════════════════════════════════════════
      // 1. LOCK current subscription row (FOR UPDATE)
      // ═══════════════════════════════════════════════════════════
      const subRows = await tx.$queryRaw<any[]>`
        SELECT * FROM "Subscription"
        WHERE "id" = ${currentSubscriptionId}
          AND "tenantId" = ${tenantId}
          AND "status" IN ('active', 'trialing')
        FOR UPDATE
      `;
      const currentSub = subRows[0] ?? null;
      if (!currentSub) {
        throw new BadRequestException('No active subscription found for this tenant');
      }

      const oldPlanKey = currentSub.planKey as PlanKey;
      const direction = comparePlanKeys(oldPlanKey, targetPlanKey);
      if (direction === 'same') {
        throw new BadRequestException(`Already subscribed to ${targetPlanKey}`);
      }

      // ═══════════════════════════════════════════════════════════
      // 2. LOCK tenant wallet (FOR UPDATE)
      // ═══════════════════════════════════════════════════════════
      const walletRows = await tx.$queryRaw<any[]>`
        SELECT * FROM "Wallet"
        WHERE "tenantId" = ${tenantId}
        FOR UPDATE
      `;
      const wallet = walletRows[0] ?? null;
      if (!wallet) {
        throw new BadRequestException('Wallet not found for tenant');
      }
      const walletBalance: bigint = BigInt(wallet.balance);
      const walletVersion: number = Number(wallet.version);

      // ═══════════════════════════════════════════════════════════
      // 3. Tính prorated pricing
      // ═══════════════════════════════════════════════════════════
      const now = new Date();
      const oldCycle = (currentSub.billingCycle as BillingCycle) ?? 'monthly';
      const proration = this.calculateProratedPricing({
        oldPlanKey,
        newPlanKey: targetPlanKey,
        oldCycle,
        newCycle: targetCycle,
        currentPeriodStart: currentSub.startedAt ? new Date(currentSub.startedAt) : now,
        currentPeriodEnd: currentSub.expiresAt ? new Date(currentSub.expiresAt) : now,
        upgradeTime: now,
      });

      // Scheduled (không immediate): thu full giá gói mới ở kỳ kế tiếp
      if (!immediate) {
        proration.effectiveFrom = proration.newPlanTotalPrice >= 0 ? this.cyclesEnd(currentSub, now) : now;
        const months = cycleMonths(targetCycle);
        const newExp = new Date(proration.effectiveFrom);
        newExp.setMonth(newExp.getMonth() + months);
        proration.newExpiresAt = newExp;
        proration.chargeAmount = direction === 'upgrade' ? proration.newPlanTotalPrice : 0;
        proration.creditAmount = 0;
      }

      // ═══════════════════════════════════════════════════════════
      // 4. Balance check (chỉ với khoản phải thu)
      // ═══════════════════════════════════════════════════════════
      if (proration.chargeAmount > 0) {
        const balanceVnd = Number(walletBalance) / UNIT_SCALE;
        if (balanceVnd < proration.chargeAmount) {
          throw new BadRequestException(
            `Insufficient balance. Required: ${proration.chargeAmount} VND, ` +
              `Available: ${balanceVnd} VND`,
          );
        }
      }

      // ═══════════════════════════════════════════════════════════
      // 5. DEBIT: thu khoản prorated (nếu có) — INLINE trong tx
      // ═══════════════════════════════════════════════════════════
      let debitTxId: string | undefined;
      let creditTxId: string | undefined;

      if (proration.chargeAmount > 0) {
        const amountUnit = BigInt(Math.round(proration.chargeAmount * UNIT_SCALE));
        const newBalance = walletBalance - amountUnit;

        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: newBalance, version: walletVersion + 1 },
        });

        const debitTx = await tx.ledgerTransaction.create({
          data: {
            tenantId,
            type: 'DEBIT',
            amount: amountUnit,
            balanceAfter: newBalance,
            referenceType: SUBSCRIPTION_LEDGER_REF.UPGRADE,
            referenceId: `${currentSubscriptionId}:${now.getTime()}`,
            description: `Upgrade: ${oldPlanKey} → ${targetPlanKey}`,
            metadata: {
              oldPlanKey,
              newPlanKey: targetPlanKey,
              chargeAmount: proration.chargeAmount,
              creditAmount: proration.creditAmount,
              remainingDays: proration.oldPlanRemainingDays,
              prorated: true,
            } as any,
          },
        });
        debitTxId = debitTx.id;
      }

      // ═══════════════════════════════════════════════════════════
      // 6. CREDIT: hoàn tiền prorated (downgrade, nếu có) — INLINE
      // ═══════════════════════════════════════════════════════════
      if (proration.creditAmount > 0) {
        const amountUnit = BigInt(Math.round(proration.creditAmount * UNIT_SCALE));
        // Đọc lại version hiện tại nếu đã debit ở trên (không xảy ra đồng thời
        // vì upgrade/downgrade loại trừ nhau, nhưng giữ an toàn version).
        const baseVersion = debitTxId ? walletVersion + 1 : walletVersion;
        const baseBalance = debitTxId
          ? walletBalance - BigInt(Math.round(proration.chargeAmount * UNIT_SCALE))
          : walletBalance;
        const newBalance = baseBalance + amountUnit;

        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: newBalance, version: baseVersion + 1 },
        });

        const creditTx = await tx.ledgerTransaction.create({
          data: {
            tenantId,
            type: 'CREDIT',
            amount: amountUnit,
            balanceAfter: newBalance,
            referenceType: SUBSCRIPTION_LEDGER_REF.DOWNGRADE,
            referenceId: `${currentSubscriptionId}:${now.getTime()}`,
            description: `Downgrade refund: ${oldPlanKey} → ${targetPlanKey}`,
            metadata: {
              oldPlanKey,
              newPlanKey: targetPlanKey,
              creditAmount: proration.creditAmount,
              prorated: true,
            } as any,
          },
        });
        creditTxId = creditTx.id;
      }

      // ═══════════════════════════════════════════════════════════
      // 7. Cập nhật Subscription: đóng gói cũ, mở gói mới
      // ═══════════════════════════════════════════════════════════
      await tx.subscription.update({
        where: { id: currentSubscriptionId },
        data: {
          status: SUBSCRIPTION_STATUS.CHANGED,
          cancelledAt: now,
          autoRenew: false,
        },
      });

      const newSub = await tx.subscription.create({
        data: {
          accountId: currentSub.accountId,
          planKey: targetPlanKey,
          tenantId,
          status: SUBSCRIPTION_STATUS.ACTIVE,
          startedAt: proration.effectiveFrom,
          expiresAt: proration.newExpiresAt,
          autoRenew: true,
        },
      });

      // ═══════════════════════════════════════════════════════════
      // 8. Xuất Invoice cho khoản thu prorated (nếu có)
      // ═══════════════════════════════════════════════════════════
      let invoiceId: string | undefined;
      if (proration.chargeAmount > 0) {
        const invNum =
          `INV-PRO-${now.getFullYear()}-` +
          `${String(now.getMonth() + 1).padStart(2, '0')}-${Date.now()}`;
        const invoice = await tx.invoice.create({
          data: {
            accountId: currentSub.accountId,
            subscriptionId: newSub.id,
            tenantId,
            number: invNum,
            amount: proration.chargeAmount,
            currency: 'VND',
            status: 'paid',
            description: `Prorated upgrade: ${oldPlanKey} → ${targetPlanKey}`,
            paidAt: now,
            metadata: {
              proration: true,
              oldPlanKey,
              newPlanKey: targetPlanKey,
              remainingDays: proration.oldPlanRemainingDays,
              chargeAmount: proration.chargeAmount,
              creditAmount: proration.creditAmount,
            } as any,
          },
        });
        invoiceId = invoice.id;
      }

      this.logger.log(
        `Plan ${direction}: ${oldPlanKey} → ${targetPlanKey} ` +
          `(tenant=${tenantId}, charge=${proration.chargeAmount}, credit=${proration.creditAmount})`,
      );

      return {
        success: true,
        oldPlanKey,
        newPlanKey: targetPlanKey,
        proration,
        ledgerTransactionId: debitTxId ?? creditTxId,
        invoiceId,
        subscription: newSub as unknown as SubscriptionRecord,
      };
    });
  }

  // ================================================================
  // Prorated pricing calculator (pure function, testable)
  // ================================================================

  calculateProratedPricing(input: ProratedPricingInput): ProrationDetail {
    const {
      oldPlanKey,
      newPlanKey,
      oldCycle,
      newCycle,
      currentPeriodStart,
      currentPeriodEnd,
      upgradeTime,
    } = input;

    // Tổng số ngày của chu kỳ hiện tại (tối thiểu 1 để tránh chia 0)
    const totalDays = Math.max(
      1,
      Math.ceil((currentPeriodEnd.getTime() - currentPeriodStart.getTime()) / MS_PER_DAY),
    );

    // Số ngày đã dùng
    const usedDays = Math.max(
      0,
      Math.ceil((upgradeTime.getTime() - currentPeriodStart.getTime()) / MS_PER_DAY),
    );

    // Số ngày còn lại
    const remainingDays = Math.max(0, totalDays - usedDays);

    // Giá gói
    const oldPrice = getPlanPrice(oldPlanKey, oldCycle);
    const newPrice = getPlanPrice(newPlanKey, newCycle);

    // Đơn giá / ngày
    const oldDailyRate = oldPrice / totalDays;
    const newDailyRate = newPrice / totalDays;

    // Giá trị prorated
    const oldPlanRemainingValue = oldDailyRate * remainingDays;
    const newPlanProratedPrice = newDailyRate * remainingDays;

    const direction = comparePlanKeys(oldPlanKey, newPlanKey);

    let chargeAmount = 0;
    let creditAmount = 0;

    if (direction === 'upgrade') {
      // Trả thêm phần chênh lệch cho số ngày còn lại
      chargeAmount = Math.max(0, Math.ceil(newPlanProratedPrice - oldPlanRemainingValue));
    } else if (direction === 'downgrade') {
      // Hoàn lại phần chênh lệch
      creditAmount = Math.max(0, Math.ceil(oldPlanRemainingValue - newPlanProratedPrice));
    }
    // 'crossgrade' / 'same' → không thu, không hoàn

    // Hiệu lực & hạn mới
    const effectiveFrom = new Date(upgradeTime);
    let newExpiresAt: Date;

    if (direction === 'upgrade') {
      // Upgrade: giữ nguyên hạn cũ (đã trả phần chênh cho thời gian còn lại)
      newExpiresAt = new Date(currentPeriodEnd);
    } else {
      // Downgrade / crossgrade: mở chu kỳ mới từ thời điểm hiện tại
      newExpiresAt = new Date(upgradeTime);
      newExpiresAt.setMonth(newExpiresAt.getMonth() + cycleMonths(newCycle));
    }

    return {
      oldPlanRemainingDays: remainingDays,
      oldPlanTotalDays: totalDays,
      oldPlanRemainingValue: Math.round(oldPlanRemainingValue),
      newPlanTotalPrice: newPrice,
      newPlanProratedPrice: Math.round(newPlanProratedPrice),
      isUpgrade: direction === 'upgrade',
      chargeAmount,
      creditAmount,
      effectiveFrom,
      newExpiresAt,
    };
  }

  // ================================================================
  // cancelWithRefund() — hủy gói kèm hoàn tiền theo ngày còn lại
  // ================================================================

  async cancelWithRefund(subscriptionId: string, tenantId: string): Promise<CancelResult> {
    await this.ledger.getOrCreateWallet(tenantId);

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<any[]>`
        SELECT * FROM "Subscription"
        WHERE "id" = ${subscriptionId}
          AND "tenantId" = ${tenantId}
          AND "status" = 'active'
        FOR UPDATE
      `;
      const sub = rows[0] ?? null;
      if (!sub) {
        throw new BadRequestException('Active subscription not found');
      }

      const now = new Date();
      const startedAt = sub.startedAt ? new Date(sub.startedAt) : now;
      const expiresAt = sub.expiresAt ? new Date(sub.expiresAt) : now;

      const totalDays = Math.max(
        1,
        Math.ceil((expiresAt.getTime() - startedAt.getTime()) / MS_PER_DAY),
      );
      const remainingDays = Math.max(
        0,
        Math.ceil((expiresAt.getTime() - now.getTime()) / MS_PER_DAY),
      );
      const planPrice = getPlanPrice(sub.planKey as PlanKey);
      const dailyRate = planPrice / totalDays;
      const refundAmount = Math.round(dailyRate * remainingDays);

      await tx.subscription.update({
        where: { id: subscriptionId },
        data: { status: SUBSCRIPTION_STATUS.CANCELLED, cancelledAt: now, autoRenew: false },
      });

      let ledgerTransactionId: string | undefined;
      if (refundAmount > 0) {
        const walletRows = await tx.$queryRaw<any[]>`
          SELECT * FROM "Wallet" WHERE "tenantId" = ${tenantId} FOR UPDATE
        `;
        const wallet = walletRows[0];
        if (wallet) {
          const amountUnit = BigInt(Math.round(refundAmount * UNIT_SCALE));
          const newBalance = BigInt(wallet.balance) + amountUnit;
          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: newBalance, version: Number(wallet.version) + 1 },
          });
          const ledgerTx = await tx.ledgerTransaction.create({
            data: {
              tenantId,
              type: 'CREDIT',
              amount: amountUnit,
              balanceAfter: newBalance,
              referenceType: SUBSCRIPTION_LEDGER_REF.CANCEL_REFUND,
              referenceId: `${subscriptionId}:${now.getTime()}`,
              description: `Subscription cancellation refund: ${refundAmount} VND`,
              metadata: { remainingDays, refundAmount, planKey: sub.planKey } as any,
            },
          });
          ledgerTransactionId = ledgerTx.id;
        }
      }

      this.logger.log(
        `Cancel subscription ${subscriptionId} (tenant=${tenantId}, refund=${refundAmount})`,
      );

      return { cancelled: true, subscriptionId, refundAmount, ledgerTransactionId };
    });
  }

  // ================================================================
  // Helpers
  // ================================================================

  /** Mốc kết thúc chu kỳ hiện tại (fallback về now nếu thiếu expiresAt) */
  private cyclesEnd(currentSub: any, fallback: Date): Date {
    return currentSub.expiresAt ? new Date(currentSub.expiresAt) : fallback;
  }
}
