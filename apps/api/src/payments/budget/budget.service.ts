// ============================================================
// payments/budget/budget.service.ts
// State Machine: ACTIVE → SOFT_LOCKED → HARD_LOCKED
//
// Triển khai logic chuyển trạng thái dựa trên currentCostSpent
// so với maxCostAmount và alertThreshold.
//
// Được gọi bởi:
//   - BudgetAccumulatorService: sau mỗi lần accumulate (ghi nhận
//     chi phí thực tế)
//   - BudgetController: khi admin force-status hoặc upsert limit
//   - BudgetSchedulerService: sau reset period (evaluate lại)
// ============================================================

import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import type {
  BudgetLimitInput,
  BudgetLimitUpdatePayload,
  BudgetStatus,
  StatusEvaluationInput,
  StatusEvaluationResult,
  PeriodWindow,
  PeriodResetSummary,
  BudgetLimitResponse,
} from './budget.types';
import {
  DEFAULT_BUDGET_LIMIT,
  DEFAULT_ALERT_THRESHOLD,
  DEFAULT_CURRENCY,
  DEFAULT_PERIOD,
} from './budget.config';

/**
 * Format BigInt VND thành chuỗi hiển thị thân thiện (vd: "5.000.000₫").
 * Tách riêng để tránh dependency với vat-calculator module.
 */
function formatVnd(amount: bigint): string {
  const str = amount.toString();
  // Thêm dấu chấm phân cách hàng nghìn
  const withSeparator = str.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${withSeparator}₫`;
}

/**
 * Map BudgetPeriod → số giờ trong 1 kỳ.
 */
function periodToHours(period: string): number {
  switch (period) {
    case 'DAILY':   return 24;
    case 'WEEKLY':  return 168; // 7*24
    case 'MONTHLY': return 720; // 30*24
    default:        return 24;
  }
}

/**
 * Tính periodStart/periodEnd cho 1 period dựa trên thời điểm hiện tại.
 */
function calcPeriodWindow(period: string, now: Date = new Date()): PeriodWindow {
  const hours = periodToHours(period);
  const start = new Date(now);

  switch (period) {
    case 'DAILY':
      start.setUTCHours(0, 0, 0, 0);
      return {
        periodStart: start,
        periodEnd: new Date(start.getTime() + 24 * 60 * 60 * 1000),
      };

    case 'WEEKLY': {
      // Bắt đầu từ thứ 2 (ISO: Monday = 1)
      const day = start.getUTCDay();
      const diff = day === 0 ? -6 : 1 - day; // Chủ nhật (0) → lui 6 ngày
      start.setUTCDate(start.getUTCDate() + diff);
      start.setUTCHours(0, 0, 0, 0);
      return {
        periodStart: start,
        periodEnd: new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000),
      };
    }

    case 'MONTHLY':
      start.setUTCDate(1);
      start.setUTCHours(0, 0, 0, 0);
      return {
        periodStart: start,
        periodEnd: new Date(start.getFullYear(), start.getMonth() + 1, 1),
      };

    default:
      return {
        periodStart: start,
        periodEnd: new Date(start.getTime() + 24 * 60 * 60 * 1000),
      };
  }
}

@Injectable()
export class BudgetService {
  private readonly logger = new Logger(BudgetService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ================================================================
  // PUBLIC API — State Machine
  // ================================================================

  /**
   * Đánh giá trạng thái dựa trên currentCostSpent so với hạn mức.
   * Thuần logic — không ghi DB.
   *
   * State machine:
   *   - currentCostSpent >= maxCostAmount          → HARD_LOCKED
   *   - currentCostSpent >= maxCostAmount * threshold → SOFT_LOCKED
   *   - currentCostSpent <  maxCostAmount * threshold → ACTIVE (nếu không đang locked)
   *
   * Lưu ý: SOFT_LOCKED → HARD_LOCKED là 1 chiều.
   * HARD_LOCKED → ACTIVE chỉ xảy ra khi reset period (scheduler gọi)
   * hoặc admin force-status.
   */
  evaluateStatus(input: StatusEvaluationInput): StatusEvaluationResult {
    const { currentCostSpent, maxCostAmount, alertThreshold, currentStatus } = input;

    const maxNum = Number(maxCostAmount);
    const spentNum = Number(currentCostSpent);
    const usagePercent = maxNum > 0 ? (spentNum / maxNum) * 100 : 0;
    const alertAmount = maxCostAmount * BigInt(Math.round(alertThreshold * 100)) / 100n;

    let nextStatus: BudgetStatus;
    let crossedAlertThreshold = false;

    if (currentCostSpent >= maxCostAmount) {
      nextStatus = 'HARD_LOCKED' as BudgetStatus;
      // Kiểm tra nếu vừa lần đầu chạm HARD (trước đó là SOFT hoặc ACTIVE)
      crossedAlertThreshold = currentStatus !== 'HARD_LOCKED';
    } else if (currentCostSpent >= alertAmount) {
      nextStatus = 'SOFT_LOCKED' as BudgetStatus;
      crossedAlertThreshold = currentStatus === 'ACTIVE';
    } else {
      // ACTIVE (hoặc thoát khỏi SOFT/HARD khi đã reset)
      nextStatus = 'ACTIVE' as BudgetStatus;
    }

    return {
      nextStatus,
      changed: nextStatus !== currentStatus,
      usagePercent: Math.min(usagePercent, 100),
      crossedAlertThreshold,
    };
  }

  /**
   * Tạo hoặc cập nhật budget limit cho tenant trong Prisma interactive transaction.
   * State machine được evaluate lại sau mỗi lần upsert.
   */
  async upsertBudgetLimit(input: BudgetLimitInput) {
    const now = new Date();
    const window = calcPeriodWindow(input.period, now);

    // Evaluate trạng thái ban đầu
    const evaluation = this.evaluateStatus({
      currentCostSpent: 0n,
      maxCostAmount: input.maxCostAmount,
      alertThreshold: input.alertThreshold ?? DEFAULT_ALERT_THRESHOLD,
      currentStatus: 'ACTIVE' as BudgetStatus,
    });

    const limit = await this.prisma.aiBudgetLimit.upsert({
      where: {
        tenantId_period: {
          tenantId: input.tenantId,
          period: input.period as any,
        },
      },
      update: {
        maxCostAmount: input.maxCostAmount,
        currency: input.currency ?? DEFAULT_CURRENCY,
        alertThreshold: input.alertThreshold ?? DEFAULT_ALERT_THRESHOLD,
        periodStart: window.periodStart,
        periodEnd: window.periodEnd,
      },
      create: {
        tenantId: input.tenantId,
        maxCostAmount: input.maxCostAmount,
        currency: input.currency ?? DEFAULT_CURRENCY,
        period: input.period as any,
        alertThreshold: input.alertThreshold ?? DEFAULT_ALERT_THRESHOLD,
        status: evaluation.nextStatus as any,
        periodStart: window.periodStart,
        periodEnd: window.periodEnd,
      },
    });

    this.logger.log(
      `Upserted budget | tenant=${input.tenantId.slice(0, 8)} | ` +
      `period=${input.period} | amount=${input.maxCostAmount}`,
    );

    return limit;
  }

  /**
   * Cập nhật partial budget limit.
   * TenantId + Period là khoá. Có thể force status.
   */
  async updateBudgetLimit(payload: BudgetLimitUpdatePayload) {
    const existing = await this.prisma.aiBudgetLimit.findUnique({
      where: {
        tenantId_period: {
          tenantId: payload.tenantId,
          period: payload.period as any,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException(
        `Budget limit not found: tenant=${payload.tenantId.slice(0, 8)}, period=${payload.period}`,
      );
    }

    const updateData: Record<string, any> = {};

    if (payload.maxCostAmount !== undefined) updateData.maxCostAmount = payload.maxCostAmount;
    if (payload.currency !== undefined) updateData.currency = payload.currency;
    if (payload.alertThreshold !== undefined) updateData.alertThreshold = payload.alertThreshold;

    // Nếu force status → set trực tiếp, không evaluate
    if (payload.forceStatus !== undefined) {
      updateData.status = payload.forceStatus;

      // Cập nhật timestamp tương ứng
      const now = new Date();
      if (payload.forceStatus === 'SOFT_LOCKED') {
        updateData.softLockedAt = existing.softLockedAt ?? now;
      } else if (payload.forceStatus === 'HARD_LOCKED') {
        updateData.hardLockedAt = existing.hardLockedAt ?? now;
      }
    }

    const updated = await this.prisma.aiBudgetLimit.update({
      where: {
        tenantId_period: {
          tenantId: payload.tenantId,
          period: payload.period as any,
        },
      },
      data: updateData,
    });

    this.logger.log(
      `Updated budget | tenant=${payload.tenantId.slice(0, 8)} | ` +
      `period=${payload.period} | forceStatus=${payload.forceStatus ?? '(auto)'}`,
    );

    return updated;
  }

  /**
   * Ghi state transition vào DB.
   * Gọi sau mỗi lần evaluate trạng thái có changed=true.
   * Dùng Prisma interactive transaction.
   */
  async applyStateTransition(
    tx: any,
    budgetLimitId: string,
    newStatus: BudgetStatus,
    usagePercent: number,
  ) {
    const now = new Date();
    const updateData: Record<string, any> = {
      status: newStatus as any,
    };

    // Cập nhật timestamp tương ứng khi chuyển trạng thái
    if (newStatus === 'SOFT_LOCKED') {
      updateData.softLockedAt = now;
    } else if (newStatus === 'HARD_LOCKED') {
      updateData.hardLockedAt = now;
    }

    await tx.aiBudgetLimit.update({
      where: { id: budgetLimitId },
      data: updateData,
    });

    this.logger.warn(
      `Budget transition | id=${budgetLimitId.slice(0, 8)} | ` +
      `→ ${newStatus} | usage=${usagePercent.toFixed(1)}%`,
    );
  }

  // ================================================================
  // Period Reset
  // ================================================================

  /**
   * Reset currentCostSpent về 0 cho các limit đã hết hạn period.
   * Gọi từ BudgetSchedulerService (cron job).
   * Trả về số lượng record đã reset.
   */
  async resetExpiredPeriods(): Promise<PeriodResetSummary> {
    const now = new Date();

    const expiredLimits = await this.prisma.aiBudgetLimit.findMany({
      where: {
        periodEnd: { lte: now },
      },
    });

    let resetCount = 0;
    let hardLockedResetCount = 0;

    for (const limit of expiredLimits) {
      const window = calcPeriodWindow(limit.period, now);

      // Evaluate lại trạng thái sau khi reset currentCostSpent = 0
      const evaluation = this.evaluateStatus({
        currentCostSpent: 0n,
        maxCostAmount: limit.maxCostAmount,
        alertThreshold: limit.alertThreshold,
        currentStatus: limit.status as any,
      });

      await this.prisma.aiBudgetLimit.update({
        where: { id: limit.id },
        data: {
          currentCostSpent: 0n,
          status: evaluation.nextStatus as any,
          periodStart: window.periodStart,
          periodEnd: window.periodEnd,
          lastResetAt: now,
          // Clear lock timestamps
          softLockedAt: null,
          hardLockedAt: null,
          lastAlertSentAt: null,
        },
      });

      if (limit.period === 'DAILY' as any) {
        this.logger.log(
          `Reset budget | tenant=${limit.tenantId.slice(0, 8)} | period=${limit.period} | ` +
          `status=${limit.status} → ${evaluation.nextStatus}`,
        );
      }

      resetCount++;
      if (limit.status === 'HARD_LOCKED') {
        hardLockedResetCount++;
      }
    }

    if (resetCount > 0) {
      this.logger.log(
        `Budget reset complete: ${resetCount} limits reset ` +
        `(including ${hardLockedResetCount} hard-locked)`,
      );
    }

    return { resetCount, hardLockedResetCount };
  }

  /**
   * Reset cho 1 tenant cụ thể (gọi từ API unlock).
   */
  async resetTenantPeriod(tenantId: string): Promise<number> {
    const now = new Date();
    const limits = await this.prisma.aiBudgetLimit.findMany({
      where: { tenantId, periodEnd: { lte: now } },
    });

    let count = 0;
    for (const limit of limits) {
      const window = calcPeriodWindow(limit.period, now);

      const evaluation = this.evaluateStatus({
        currentCostSpent: 0n,
        maxCostAmount: limit.maxCostAmount,
        alertThreshold: limit.alertThreshold,
        currentStatus: limit.status as any,
      });

      await this.prisma.aiBudgetLimit.update({
        where: { id: limit.id },
        data: {
          currentCostSpent: 0n,
          status: evaluation.nextStatus as any,
          periodStart: window.periodStart,
          periodEnd: window.periodEnd,
          lastResetAt: now,
          softLockedAt: null,
          hardLockedAt: null,
          lastAlertSentAt: null,
        },
      });
      count++;
    }

    if (count > 0) {
      this.logger.log(
        `Budget reset for tenant ${tenantId.slice(0, 8)}: ${count} limits`,
      );
    }
    return count;
  }

  // ================================================================
  // Query
  // ================================================================

  /**
   * Lấy danh sách budget limits của 1 tenant.
   * Dùng cho dashboard / admin xem.
   */
  async getTenantLimits(tenantId: string): Promise<BudgetLimitResponse[]> {
    const limits = await this.prisma.aiBudgetLimit.findMany({
      where: { tenantId },
      orderBy: { period: 'asc' },
    });

    return limits.map((l) => this.toResponse(l));
  }

  /**
   * Lấy 1 limit cụ thể theo tenant + period.
   */
  async getLimit(tenantId: string, period: string): Promise<BudgetLimitResponse | null> {
    const limit = await this.prisma.aiBudgetLimit.findUnique({
      where: {
        tenantId_period: { tenantId, period: period as any },
      },
    });

    return limit ? this.toResponse(limit) : null;
  }

  /**
   * Kiểm tra nhanh budget hiện tại (không throw).
   * Dùng bởi BudgetGuard.
   */
  async checkBudget(tenantId: string) {
    const limits = await this.prisma.aiBudgetLimit.findMany({
      where: { tenantId },
    });

    // Nếu chưa có budget nào → mặc định tạo DAILY
    if (limits.length === 0) {
      await this.upsertBudgetLimit({
        tenantId,
        maxCostAmount: DEFAULT_BUDGET_LIMIT,
        period: DEFAULT_PERIOD as any,
      });

      return {
        allowed: true,
        status: 'ACTIVE' as BudgetStatus,
        currentCostSpent: 0n,
        maxCostAmount: DEFAULT_BUDGET_LIMIT,
        usagePercent: 0,
        blockReason: null,
        blockedByPeriods: [],
      };
    }

    // Evaluate tất cả period — worst-case wins
    let worstStatus: BudgetStatus = 'ACTIVE' as BudgetStatus;
    let worstUsagePercent = 0;
    let worstSpent = 0n;
    let worstMax = 0n;
    const blockedPeriods: Array<{
      period: string;
      status: BudgetStatus;
      currentCostSpent: bigint;
      maxCostAmount: bigint;
    }> = [];

    for (const limit of limits) {
      const status = limit.status as BudgetStatus;
      const maxNum = Number(limit.maxCostAmount);
      const spentNum = Number(limit.currentCostSpent);
      const usagePercent = maxNum > 0 ? (spentNum / maxNum) * 100 : 0;

      if (usagePercent > worstUsagePercent) {
        worstUsagePercent = usagePercent;
        worstSpent = limit.currentCostSpent;
        worstMax = limit.maxCostAmount;
      }

      // Status priority: HARD_LOCKED > SOFT_LOCKED > ACTIVE
      if (status === 'HARD_LOCKED') {
        worstStatus = 'HARD_LOCKED' as BudgetStatus;
        blockedPeriods.push({
          period: limit.period,
          status: status as BudgetStatus,
          currentCostSpent: limit.currentCostSpent,
          maxCostAmount: limit.maxCostAmount,
        });
      } else if (status === 'SOFT_LOCKED' && worstStatus !== 'HARD_LOCKED') {
        worstStatus = 'SOFT_LOCKED' as BudgetStatus;
        blockedPeriods.push({
          period: limit.period,
          status: status as BudgetStatus,
          currentCostSpent: limit.currentCostSpent,
          maxCostAmount: limit.maxCostAmount,
        });
      }
    }

    const allowed = worstStatus === 'ACTIVE';
    const blockReason = allowed
      ? null
      : worstStatus === 'HARD_LOCKED'
        ? 'Hạn mức AI budget đã đầy. Vui lòng nâng cấp hoặc đợi reset.'
        : 'Hạn mức AI budget gần đầy. Chỉ request ưu tiên được phép.';

    return {
      allowed,
      status: worstStatus,
      currentCostSpent: worstSpent,
      maxCostAmount: worstMax,
      usagePercent: Math.min(worstUsagePercent, 100),
      blockReason,
      blockedByPeriods: blockedPeriods as any,
    };
  }

  // ================================================================
  // PRIVATE HELPERS
  // ================================================================

  /**
   * Chuyển Prisma model → BudgetLimitResponse (BigInt → string).
   */
  private toResponse(l: any): BudgetLimitResponse {
    return {
      id: l.id,
      tenantId: l.tenantId,
      maxCostAmount: l.maxCostAmount.toString(),
      maxCostAmountDisplay: formatVnd(l.maxCostAmount),
      currency: l.currency,
      period: l.period,
      currentCostSpent: l.currentCostSpent.toString(),
      currentCostSpentDisplay: formatVnd(l.currentCostSpent),
      usagePercent: Number(l.maxCostAmount) > 0
        ? (Number(l.currentCostSpent) / Number(l.maxCostAmount)) * 100
        : 0,
      status: l.status,
      alertThreshold: l.alertThreshold,
      periodStart: l.periodStart instanceof Date ? l.periodStart.toISOString() : String(l.periodStart),
      periodEnd: l.periodEnd instanceof Date ? l.periodEnd.toISOString() : String(l.periodEnd),
      lastResetAt: l.lastResetAt instanceof Date ? l.lastResetAt.toISOString() : l.lastResetAt,
      softLockedAt: l.softLockedAt instanceof Date ? l.softLockedAt.toISOString() : l.softLockedAt,
      hardLockedAt: l.hardLockedAt instanceof Date ? l.hardLockedAt.toISOString() : l.hardLockedAt,
      lastAlertSentAt: l.lastAlertSentAt instanceof Date ? l.lastAlertSentAt.toISOString() : l.lastAlertSentAt,
      createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : String(l.createdAt),
      updatedAt: l.updatedAt instanceof Date ? l.updatedAt.toISOString() : String(l.updatedAt),
    };
  }
}
