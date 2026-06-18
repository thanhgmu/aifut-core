// ============================================================
// payments/budget/budget.guard.ts
// BudgetGuard — NestJS Guard tự động gác cost threshold
// trước request AI, ném ForbiddenException (403) với message
// BUDGET_LIMIT_EXCEEDED nếu budget đã đạt ngưỡng chặn.
//
// State machine:
//   ACTIVE        → cho qua (mọi request)
//   SOFT_LOCKED   → chặn request THƯỜNG, request ƯU TIÊN
//                    (có @RequireBudgetPriority(true)) vẫn được phép
//   HARD_LOCKED   → chặn HOÀN TOÀN mọi request AI
//
// Cách dùng:
//   @Controller('ai')
//   export class AiController {
//     @Post('generate')
//     @UseGuards(BudgetGuard)
//     async generate() { ... }
//   }
//
//   @Post('critical')
//   @UseGuards(BudgetGuard)
//   @RequireBudgetPriority(true)
//   async criticalInference() { ... }
// ============================================================

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BudgetService } from './budget.service';
import {
  BUDGET_PRIORITY_METADATA_KEY,
} from './budget.decorator';
import {
  HARD_LOCK_MESSAGE,
  SOFT_LOCK_MESSAGE,
  BUDGET_LIMIT_EXCEEDED,
} from './budget.config';
import type { RequestWithContext } from '../../common/middleware/dev-context.middleware';
import type { BudgetStatus, BudgetCheckResult } from './budget.types';

interface GuardResponse {
  allowed: boolean;
  status: BudgetStatus;
  blockReason: string | null;
  budgetCheck: BudgetCheckResult;
}

@Injectable()
export class BudgetGuard implements CanActivate {
  private readonly logger = new Logger(BudgetGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly budgetService: BudgetService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Đọc metadata budget priority từ handler/class
    const isPriorityRequest = this.reflector.getAllAndOverride<boolean>(
      BUDGET_PRIORITY_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    ) ?? false;

    // 2. Lấy tenant context từ request
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const tenantId = request.context?.tenant?.id;

    if (!tenantId) {
      // Không có tenant context → không thể check budget
      // Cho qua để không block anonymous routes; budget
      // enforcement là optional cho route không xác định tenant.
      this.logger.warn(
        'BudgetGuard: No tenant context — skipping budget check',
      );
      return true;
    }

    // 3. Kiểm tra budget
    const result = await this.budgetService.checkBudget(tenantId);

    // 4. Log checkpoint
    if (result.status !== 'ACTIVE') {
      this.logger.warn(
        `BudgetGuard CHECK | tenant=${tenantId.slice(0, 8)} | ` +
        `status=${result.status} | ` +
        `usage=${result.usagePercent.toFixed(1)}% | ` +
        `priority=${isPriorityRequest}`,
      );
    }

    // 5. Enforce theo state machine
    if (result.status === 'HARD_LOCKED') {
      // HARD_LOCKED: chặn MỌI request AI, kể cả ưu tiên
      this.throwBlocked(result, HARD_LOCK_MESSAGE);
    }

    if (result.status === 'SOFT_LOCKED' && !isPriorityRequest) {
      // SOFT_LOCKED: chặn request thường, cho qua request ưu tiên
      this.throwBlocked(result, SOFT_LOCK_MESSAGE);
    }

    // ACTIVE hoặc SOFT_LOCKED + priority → cho qua
    return true;
  }

  /**
   * Ném ForbiddenException với body chuẩn hoá.
   */
  private throwBlocked(result: GuardResponse['budgetCheck'], message: string): never {
    throw new ForbiddenException({
      statusCode: 403,
      error: BUDGET_LIMIT_EXCEEDED,
      message,
      details: {
        currentCostSpent: result.currentCostSpent.toString(),
        maxCostAmount: result.maxCostAmount.toString(),
        usagePercent: result.usagePercent,
        blockedByPeriods: result.blockedByPeriods,
      },
    });
  }
}
