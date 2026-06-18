// ============================================================
// payments/budget/budget-scheduler.service.ts
// Hệ thống tự động dọn dẹp và reset currentCostSpent về 0
// khi periodEnd < now.
//
// KHÔNG dùng @nestjs/schedule (tránh dependency nặng).
// Dùng setInterval + OnModuleInit tự nhiên của NestJS.
//
// Flow:
//   1. Module khởi tạo → onModuleInit() → setInterval 5 phút
//   2. Mỗi lần chạy: query AiBudgetLimit WHERE periodEnd <= NOW()
//      → reset currentCostSpent = 0, tính period mới
//      → evaluate lại trạng thái (reset về ACTIVE)
//   3. Maintenance daily: xoá log cũ > 90 ngày
//
// Safety:
//   - Interval dùng hàm async IIFE để tránh unhandled rejection
//   - Lỗi được log, không throw ra ngoài (không crash process)
// ============================================================

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { BudgetService } from './budget.service';
import type { PeriodResetSummary } from './budget.types';

/**
 * Số ms giữa các lần check reset (5 phút).
 */
const RESET_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Số ms giữa các lần maintenance (1 giờ).
 */
const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Số ngày giữ log accumulation trước khi purge.
 */
const LOG_RETENTION_DAYS = 90;

@Injectable()
export class BudgetSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(BudgetSchedulerService.name);

  private resetTimer: ReturnType<typeof setInterval> | null = null;
  private maintenanceTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly budgetService: BudgetService,
  ) {}

  /**
   * NestJS lifecycle hook: tự động khởi động cron timer khi module init.
   * Gọi 1 lần duy nhất.
   */
  onModuleInit() {
    // ── Reset budget period ───────────────────────────────────
    this.resetTimer = setInterval(() => {
      this.handlePeriodReset().catch((err) => {
        this.logger.error(
          'Period reset handler threw (non-fatal)',
          err instanceof Error ? err.stack : err,
        );
      });
    }, RESET_INTERVAL_MS);

    // Chạy lần đầu ngay sau khi init
    this.handlePeriodReset().catch((err) => {
      this.logger.error(
        'Initial period reset threw (non-fatal)',
        err instanceof Error ? err.stack : err,
      );
    });

    // ── Maintenance: purge old logs ───────────────────────────
    this.maintenanceTimer = setInterval(() => {
      this.handleDailyMaintenance().catch((err) => {
        this.logger.error(
          'Maintenance handler threw (non-fatal)',
          err instanceof Error ? err.stack : err,
        );
      });
    }, MAINTENANCE_INTERVAL_MS);

    this.logger.log(
      `BudgetScheduler initialized: reset every ${RESET_INTERVAL_MS / 1000}s, ` +
      `maintenance every ${MAINTENANCE_INTERVAL_MS / 1000}s`,
    );
  }

  /**
   * Kiểm tra và reset budget limits đã hết hạn period.
   * Gọi định kỳ (mặc định mỗi 5 phút).
   *
   * Hard-locked budget được ưu tiên: reset là cơ hội unlock cho tenant.
   */
  async handlePeriodReset(): Promise<PeriodResetSummary> {
    const summary = await this.budgetService.resetExpiredPeriods();

    if (summary.resetCount > 0) {
      this.logger.log(
        `Budget cron: reset ${summary.resetCount} limits ` +
        `(including ${summary.hardLockedResetCount} hard-locked)`,
      );
    }

    return summary;
  }

  /**
   * Dọn dẹp BudgetAccumulationLog cũ > LOG_RETENTION_DAYS ngày.
   * Chạy mỗi giờ (maintenance interval).
   */
  async handleDailyMaintenance() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - LOG_RETENTION_DAYS);

    const deleteResult = await this.prisma.budgetAccumulationLog.deleteMany({
      where: {
        createdAt: { lt: cutoff },
      },
    });

    if (deleteResult.count > 0) {
      this.logger.log(
        `Budget maintenance: purged ${deleteResult.count} old accumulation logs (before ${cutoff.toISOString()})`,
      );
    }

    return deleteResult.count;
  }

  /**
   * Force chạy 1 lần reset ngay (gọi từ controller / admin).
   * Trả về summary.
   */
  async runImmediateReset(): Promise<PeriodResetSummary> {
    this.logger.log('Budget cron: manual immediate reset triggered');
    return this.handlePeriodReset();
  }
}
