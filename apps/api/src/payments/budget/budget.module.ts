// ============================================================
// payments/budget/budget.module.ts
// Anti-Drain Budget Caps (Phase 4).
//
// Đóng gói toàn bộ phân hệ budget:
//   - BudgetService      : state machine, upsert, query
//   - BudgetAccumulator  : accumulate cost sau AI call
//   - BudgetScheduler    : cron reset period
//   - BudgetGuard        : NestJS Guard chặn request vượt ngưỡng
//   - BudgetController   : REST API endpoints
//
// Export:
//   - BudgetService        : cho accumulator, guard, module khác
//   - BudgetGuard          : cho các module AI dùng @UseGuards()
//   - BudgetAccumulator    : cho AI module gọi accumulate()
//   - BudgetScheduler      : cho controller / admin API
//
// KHÔNG @Global() — mỗi module import chủ động.
// ============================================================

import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { BudgetService } from './budget.service';
import { BudgetAccumulatorService } from './budget-accumulator.service';
import { BudgetSchedulerService } from './budget-scheduler.service';
import { BudgetGuard } from './budget.guard';
import { BudgetController } from './budget.controller';

@Module({
  controllers: [BudgetController],
  providers: [
    BudgetService,
    BudgetAccumulatorService,
    BudgetSchedulerService,
    BudgetGuard,
    PrismaService,
  ],
  exports: [
    BudgetService,
    BudgetAccumulatorService,
    BudgetGuard,
    BudgetSchedulerService,
  ],
})
export class BudgetModule {}
