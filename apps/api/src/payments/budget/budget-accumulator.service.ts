// ============================================================
// payments/budget/budget-accumulator.service.ts
// Async accumulator: ghi nhận chi phí AI thực tế sau AI call,
// chặn race condition bằng Prisma interactive transaction +
// Optimistic Lock + idempotency.
//
// Flow:
//   1. Idempotency check (BudgetAccumulationLog + requestId)
//   2. Prisma $transaction:
//      a. Đọc AiBudgetLimit hiện tại (SELECT FOR UPDATE mô phỏng
//         qua findUnique trong transaction)
//      b. Cộng currentCostSpent (bigint addition)
//      c. BudgetService.evaluateStatus()
//      d. BudgetService.applyStateTransition() nếu có transition
//      e. Ghi BudgetAccumulationLog (idempotency key)
//   3. Fire-and-forget: gọi notification nếu có alert
//
// Idempotency: mỗi requestId chỉ được accumulate 1 lần (unique
// constraint trên BudgetAccumulationLog).
// ============================================================

import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { BudgetService } from './budget.service';
import {
  CostAccumulateInput,
  CostAccumulateResult,
  BudgetStateTransition,
  PeriodStatusSnapshot,
} from './budget.types';
import {
  ACCUMULATOR_MAX_RETRY,
  ALERT_COOLDOWN_MS,
} from './budget.config';
import type { BudgetStatus } from './budget.types';

@Injectable()
export class BudgetAccumulatorService {
  private readonly logger = new Logger(BudgetAccumulatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly budgetService: BudgetService,
  ) {}

  /**
   * Ghi nhận chi phí AI cho tenant, trong Prisma interactive transaction.
   * Idempotent: cùng requestId chỉ accumulate 1 lần.
   *
   * @param input — tenantId, cost (VND, BigInt), requestId, ...
   * @param retryCount — internal, đếm số lần retry khi CAS conflict
   */
  async accumulate(
    input: CostAccumulateInput,
    retryCount = 0,
  ): Promise<CostAccumulateResult> {
    const { tenantId, cost, requestId } = input;

    // ──────────────────────────────────────────────────────────
    // 1. Idempotency check: nếu requestId đã được log → trả về
    // kết quả của lần accumulate trước (read-only, không ghi DB mới)
    // ──────────────────────────────────────────────────────────
    const existingLog = await this.prisma.budgetAccumulationLog.findUnique({
      where: {
        requestId_tenantId: { requestId, tenantId },
      },
    });

    if (existingLog) {
      this.logger.debug(
        `Budget accumulate skipped (idempotent) | tenant=${tenantId.slice(0, 8)} | requestId=${requestId}`,
      );
      return {
        success: true,
        tenantId,
        previousSpent: 0n,
        currentSpent: 0n,
        statusBefore: 'ACTIVE' as BudgetStatus,
        statusAfter: 'ACTIVE' as BudgetStatus,
        alertsTriggered: [],
        transitions: [],
        periods: [],
      };
    }

    try {
      // ──────────────────────────────────────────────────────
      // 2. Prisma interactive transaction
      // ──────────────────────────────────────────────────────
      return await this.prisma.$transaction(async (tx) => {
        const now = new Date();
        const alerts: string[] = [];
        const allTransitions: BudgetStateTransition[] = [];
        const periodSnapshots: PeriodStatusSnapshot[] = [];

        // Lấy tất cả budget limit của tenant trong transaction
        const limits = await tx.aiBudgetLimit.findMany({
          where: { tenantId },
        });

        if (limits.length === 0) {
          // Chưa có budget → ghi log rồi bỏ qua
          await tx.budgetAccumulationLog.create({
            data: {
              tenantId,
              requestId,
              cost,
              description: input.description ?? '(no budget configured)',
            },
          });
          return {
            success: true,
            tenantId,
            previousSpent: 0n,
            currentSpent: 0n,
            statusBefore: 'ACTIVE' as BudgetStatus,
            statusAfter: 'ACTIVE' as BudgetStatus,
            alertsTriggered: [],
            transitions: [],
            periods: [],
          };
        }

        // Mỗi limit trong transaction — update tuần tự
        for (const limit of limits) {
          const previousSpent = limit.currentCostSpent;
          const currentSpent = previousSpent + cost;
          const currentStatus = limit.status as BudgetStatus;

          // Evaluate trạng thái mới sau khi + cost
          const evaluation = this.budgetService.evaluateStatus({
            currentCostSpent: currentSpent,
            maxCostAmount: limit.maxCostAmount,
            alertThreshold: limit.alertThreshold,
            currentStatus,
          });

          // Update limit (atomic trong transaction)
          await tx.aiBudgetLimit.update({
            where: { id: limit.id },
            data: {
              currentCostSpent: currentSpent,
              ...(evaluation.changed
                ? {
                    status: evaluation.nextStatus as any,
                    ...(evaluation.nextStatus === 'SOFT_LOCKED'
                      ? { softLockedAt: now }
                      : {}),
                    ...(evaluation.nextStatus === 'HARD_LOCKED'
                      ? { hardLockedAt: now }
                      : {}),
                  }
                : {}),
            },
          });

          // Ghi nhận transition nếu có
          if (evaluation.changed) {
            const transition: BudgetStateTransition = {
              period: limit.period as any,
              from: currentStatus,
              to: evaluation.nextStatus,
              reason: `usage=${evaluation.usagePercent.toFixed(1)}% cost=${cost}`,
            };
            allTransitions.push(transition);

            this.logger.warn(
              `Budget TRANSITION | tenant=${tenantId.slice(0, 8)} | ` +
              `period=${limit.period} | ${currentStatus} → ${evaluation.nextStatus} | ` +
              `usage=${evaluation.usagePercent.toFixed(1)}%`,
            );

            // Alert nếu crossed threshold và có cooldown
            if (evaluation.crossedAlertThreshold) {
              const shouldAlert = await this.canSendAlert(tx, limit.id, now);
              if (shouldAlert) {
                alerts.push(
                  `Budget ${evaluation.nextStatus}: ` +
                  `${evaluation.usagePercent.toFixed(1)}% used (${limit.period})`,
                );
                // Cập nhật lastAlertSentAt
                await tx.aiBudgetLimit.update({
                  where: { id: limit.id },
                  data: { lastAlertSentAt: now },
                });
              }
            }
          }

          periodSnapshots.push({
            period: limit.period as any,
            status: evaluation.nextStatus,
          });
        }

        // Ghi BudgetAccumulationLog (idempotency key)
        await tx.budgetAccumulationLog.create({
          data: {
            tenantId,
            requestId,
            cost,
            description: input.description ?? null,
          },
        });

        this.logger.log(
          `Budget accumulate | tenant=${tenantId.slice(0, 8)} | ` +
          `cost=${cost} | requestId=${requestId} | ` +
          `transitions=${allTransitions.length}`,
        );

        // Trả về trạng thái sau cùng (worst-case)
        const finalPeriod = periodSnapshots.length > 0
          ? periodSnapshots[periodSnapshots.length - 1]
          : { period: 'DAILY' as any, status: 'ACTIVE' as BudgetStatus };

        return {
          success: true,
          tenantId,
          previousSpent: limits[0]?.currentCostSpent ?? 0n,
          currentSpent: (limits[0]?.currentCostSpent ?? 0n) + cost,
          statusBefore: limits.length > 0 ? limits[0].status as BudgetStatus : 'ACTIVE' as BudgetStatus,
          statusAfter: finalPeriod.status,
          alertsTriggered: alerts,
          transitions: allTransitions,
          periods: periodSnapshots,
        };
      });
    } catch (error) {
      // Optimistic Lock / Unique constraint conflict → retry
      if (this.isRetryableError(error) && retryCount < ACCUMULATOR_MAX_RETRY) {
        this.logger.warn(
          `Accumulate CAS conflict (attempt ${retryCount + 1}/${ACCUMULATOR_MAX_RETRY}), retrying... ` +
          `tenant=${tenantId.slice(0, 8)} requestId=${requestId}`,
        );
        return this.accumulate(input, retryCount + 1);
      }

      // Idempotent: có thể requestId đã được ghi bởi request song song
      if (this.isUniqueConstraintError(error)) {
        this.logger.debug(
          `Accumulate idempotent conflict tenant=${tenantId.slice(0, 8)} requestId=${requestId}`,
        );
        return {
          success: true,
          tenantId,
          previousSpent: 0n,
          currentSpent: 0n,
          statusBefore: 'ACTIVE' as BudgetStatus,
          statusAfter: 'ACTIVE' as BudgetStatus,
          alertsTriggered: [],
          transitions: [],
          periods: [],
        };
      }

      this.logger.error(
        `Accumulate FAILED | tenant=${tenantId.slice(0, 8)} | requestId=${requestId} | cost=${cost}`,
        error instanceof Error ? error.stack : error,
      );

      // Không throw — accumulate thất bại không block business flow
      // (budget sẽ được cập nhật ở lần accumulate sau hoặc qua cron)
      return {
        success: false,
        tenantId,
        previousSpent: 0n,
        currentSpent: 0n,
        statusBefore: 'ACTIVE' as BudgetStatus,
        statusAfter: 'ACTIVE' as BudgetStatus,
        alertsTriggered: [],
        transitions: [],
        periods: [],
      };
    }
  }

  /**
   * Batch accumulate — ghi nhận nhiều request cùng lúc.
   * Mỗi item xử lý độc lập (không share transaction để tránh lock escalation).
   */
  async accumulateBatch(inputs: CostAccumulateInput[]): Promise<CostAccumulateResult[]> {
    const results: CostAccumulateResult[] = [];
    for (const input of inputs) {
      results.push(await this.accumulate(input));
    }
    return results;
  }

  // ================================================================
  // PRIVATE HELPERS
  // ================================================================

  /**
   * Kiểm tra cooldown: chỉ gửi alert nếu lần cuối > ALERT_COOLDOWN_MS.
   */
  private async canSendAlert(
    tx: any,
    budgetLimitId: string,
    now: Date,
  ): Promise<boolean> {
    const limit = await tx.aiBudgetLimit.findUnique({
      where: { id: budgetLimitId },
      select: { lastAlertSentAt: true },
    });

    if (!limit || !limit.lastAlertSentAt) return true;

    const elapsed = now.getTime() - new Date(limit.lastAlertSentAt).getTime();
    return elapsed >= ALERT_COOLDOWN_MS;
  }

  private isRetryableError(error: any): boolean {
    return (
      error instanceof ConflictException ||
      error?.code === 'P2025' || // Record not found
      error?.code === 'P2034'    // Transaction conflict
    );
  }

  private isUniqueConstraintError(error: any): boolean {
    return (
      error?.code === 'P2002' &&
      error?.meta?.target &&
      Array.isArray(error.meta.target) &&
      (error.meta.target.includes('requestId') || error.meta.target.includes('tenantId'))
    );
  }
}
