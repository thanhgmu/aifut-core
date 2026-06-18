// ============================================================
// payments/budget/budget.controller.ts
// REST endpoints cấu hình budget limit và gỡ block thủ công.
//
// Anti-IDOR: mọi tenantId lấy từ req.context.tenant.id
// (xác thực từ middleware), không từ URL params hay body.
// Admin routes dùng role check riêng.
//
// Endpoints:
//   GET    /billing/budget/limits           → danh sách limit của tenant
//   GET    /billing/budget/limits/:period   → 1 limit theo period
//   POST   /billing/budget/limits           → upsert limit (tạo/cập nhật)
//   PATCH  /billing/budget/limits/:period   → cập nhật + force-unlock
//   POST   /billing/budget/limits/:period/unlock  → force unlock về ACTIVE
//   GET    /billing/budget/limits/health    → trạng thái budget hiện tại
//   POST   /billing/budget/cron/run-now     → force chạy cron reset
//
// ============================================================

import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Req,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { RequestWithContext } from '../../common/middleware/dev-context.middleware';
import { BudgetService } from './budget.service';
import { BudgetAccumulatorService } from './budget-accumulator.service';
import { BudgetSchedulerService } from './budget-scheduler.service';
import { BUDGET_LIMIT_EXCEEDED } from './budget.config';
import type {
  UpsertBudgetLimitRequestBody,
  BudgetStatus,
  BudgetLimitResponse,
} from './budget.types';

/** Request body cho PATCH unlock */
interface UnlockBody {
  /** Period cần unlock (DAILY | WEEKLY | MONTHLY) */
  period: string;
}

@Controller('billing/budget')
export class BudgetController {
  private readonly logger = new Logger(BudgetController.name);

  constructor(
    private readonly budgetService: BudgetService,
    private readonly budgetAccumulator: BudgetAccumulatorService,
    private readonly budgetScheduler: BudgetSchedulerService,
  ) {}

  // ================================================================
  // GET /billing/budget/limits
  // Danh sách tất cả budget limit của tenant hiện tại.
  // ================================================================
  @Get('limits')
  async getLimits(@Req() req: Request): Promise<BudgetLimitResponse[]> {
    const tenantId = this.resolveTenantId(req);

    this.logger.debug(`GET limits | tenant=${tenantId.slice(0, 8)}`);

    return this.budgetService.getTenantLimits(tenantId);
  }

  // ================================================================
  // GET /billing/budget/limits/:period
  // Chi tiết 1 limit theo period.
  // ================================================================
  @Get('limits/:period')
  async getLimit(
    @Req() req: Request,
    @Param('period') period: string,
  ): Promise<BudgetLimitResponse> {
    const tenantId = this.resolveTenantId(req);
    this.validatePeriod(period);

    const limit = await this.budgetService.getLimit(tenantId, period.toUpperCase());
    if (!limit) {
      throw new NotFoundException(`Budget limit not found: period=${period}`);
    }

    return limit;
  }

  // ================================================================
  // POST /billing/budget/limits
  // Tạo hoặc cập nhật budget limit.
  // Body có thể chứa maxCostAmount (string BigInt-safe), period,
  // currency, alertThreshold.
  //
  // Anti-IDOR: tenantId từ context, không từ body.
  // ================================================================
  @Post('limits')
  async upsertLimit(
    @Req() req: Request,
    @Body() body: UpsertBudgetLimitRequestBody,
  ): Promise<BudgetLimitResponse> {
    const tenantId = this.resolveTenantId(req);
    this.validatePeriod(body.period);

    // Parse BigInt từ string (JSON-safe)
    let maxCostAmount: bigint;
    try {
      maxCostAmount = BigInt(body.maxCostAmount);
    } catch {
      throw new BadRequestException(
        `Invalid maxCostAmount: must be a valid integer string (received: ${body.maxCostAmount})`,
      );
    }

    if (maxCostAmount <= 0n) {
      throw new BadRequestException('maxCostAmount phải lớn hơn 0');
    }

    // Validate alertThreshold
    const threshold = body.alertThreshold ?? 0.8;
    if (threshold < 0 || threshold > 1) {
      throw new BadRequestException(
        `alertThreshold phải từ 0.0 đến 1.0 (received: ${threshold})`,
      );
    }

    const result = await this.budgetService.upsertBudgetLimit({
      tenantId,
      maxCostAmount,
      currency: body.currency ?? 'VND',
      period: body.period as any,
      alertThreshold: threshold,
    });

    this.logger.log(
      `POST limit | tenant=${tenantId.slice(0, 8)} | ` +
      `period=${body.period} | amount=${maxCostAmount}`,
    );

    // Trả về response view
    const limit = await this.budgetService.getLimit(tenantId, body.period);
    if (!limit) {
      throw new NotFoundException('Budget limit created but not found');
    }
    return limit;
  }

  // ================================================================
  // PATCH /billing/budget/limits/:period
  // Cập nhật partial + force-unlock.
  // Body tuỳ chọn: maxCostAmount, alertThreshold, forceStatus.
  // ================================================================
  @Patch('limits/:period')
  async updateLimit(
    @Req() req: Request,
    @Param('period') period: string,
    @Body() body: Partial<UpsertBudgetLimitRequestBody & { forceStatus: string }>,
  ): Promise<BudgetLimitResponse> {
    const tenantId = this.resolveTenantId(req);
    this.validatePeriod(period);
    const periodUpper = period.toUpperCase() as any;

    // Parse optional BigInt
    let maxCostAmount: bigint | undefined;
    if (body.maxCostAmount !== undefined) {
      try {
        maxCostAmount = BigInt(body.maxCostAmount);
      } catch {
        throw new BadRequestException('Invalid maxCostAmount');
      }
      if (maxCostAmount <= 0n) {
        throw new BadRequestException('maxCostAmount phải lớn hơn 0');
      }
    }

    // Validate threshold
    if (body.alertThreshold !== undefined) {
      if (body.alertThreshold < 0 || body.alertThreshold > 1) {
        throw new BadRequestException('alertThreshold phải từ 0.0 đến 1.0');
      }
    }

    // Validate forceStatus
    let forceStatus: BudgetStatus | undefined;
    if (body.forceStatus) {
      const valid = ['ACTIVE', 'SOFT_LOCKED', 'HARD_LOCKED'];
      if (!valid.includes(body.forceStatus)) {
        throw new BadRequestException(
          `forceStatus must be one of: ${valid.join(', ')}`,
        );
      }
      forceStatus = body.forceStatus as BudgetStatus;

      this.logger.warn(
        `PATCH limit force-status | tenant=${tenantId.slice(0, 8)} | ` +
        `period=${period} | forceStatus=${forceStatus}`,
      );
    }

    const result = await this.budgetService.updateBudgetLimit({
      tenantId,
      period: periodUpper,
      maxCostAmount,
      currency: body.currency,
      alertThreshold: body.alertThreshold,
      forceStatus,
    });

    const limit = await this.budgetService.getLimit(tenantId, period);
    if (!limit) {
      throw new NotFoundException('Budget limit not found after update');
    }
    return limit;
  }

  // ================================================================
  // POST /billing/budget/limits/unlock/:period
  // Force unlock một period về ACTIVE.
  // Tiện lợi: tương đương PATCH với forceStatus=ACTIVE.
  // Ghi log audit riêng.
  // ================================================================
  @Post('limits/unlock/:period')
  async unlockLimit(
    @Req() req: Request,
    @Param('period') period: string,
  ): Promise<BudgetLimitResponse> {
    const tenantId = this.resolveTenantId(req);
    this.validatePeriod(period);

    this.logger.warn(
      `MANUAL UNLOCK | tenant=${tenantId.slice(0, 8)} | period=${period} | ` +
      `initiated by user ${(req as any).user?.email ?? 'unknown'}`,
    );

    // Force reset tenant period (reset spent + set ACTIVE)
    await this.budgetService.resetTenantPeriod(tenantId);

    // Force-set status = ACTIVE
    await this.budgetService.updateBudgetLimit({
      tenantId,
      period: period.toUpperCase() as any,
      forceStatus: 'ACTIVE' as BudgetStatus,
    });

    const limit = await this.budgetService.getLimit(tenantId, period);
    if (!limit) {
      throw new NotFoundException('Budget limit not found after unlock');
    }
    return limit;
  }

  // ================================================================
  // GET /billing/budget/limits/health
  // Trạng thái budget hiện tại (cho dashboard / health check).
  // ================================================================
  @Get('limits/health')
  async getHealth(@Req() req: Request) {
    const tenantId = this.resolveTenantId(req);

    const check = await this.budgetService.checkBudget(tenantId);

    return {
      tenantId,
      allowed: check.allowed,
      status: check.status,
      currentCostSpent: check.currentCostSpent.toString(),
      maxCostAmount: check.maxCostAmount.toString(),
      usagePercent: check.usagePercent,
      blockReason: check.blockReason,
      blockedByPeriods: check.blockedByPeriods,
    };
  }

  // ================================================================
  // POST /billing/budget/cron/run-now
  // Force chạy cron reset ngay (admin/maintenance).
  // Yêu cầu xác thực tenant.
  // ================================================================
  @Post('cron/run-now')
  async runCronNow(@Req() req: Request) {
    const tenantId = this.resolveTenantId(req);

    this.logger.log(
      `Manual cron triggered | user=${(req as RequestWithContext).context?.user?.email ?? 'unknown'}`,
    );

    const summary = await this.budgetScheduler.runImmediateReset();

    return {
      success: true,
      resetCount: summary.resetCount,
      hardLockedResetCount: summary.hardLockedResetCount,
      triggeredBy: tenantId.slice(0, 8),
    };
  }

  // ================================================================
  // POST /billing/budget/admin/unlock/:tenantId/:period
  // Admin endpoint — force unlock bất kỳ tenant nào.
  // Yêu cầu admin role (check trong handler).
  // ================================================================
  @Post('admin/unlock/:targetTenantId/:period')
  async adminUnlock(
    @Req() req: Request,
    @Param('targetTenantId') targetTenantId: string,
    @Param('period') period: string,
  ): Promise<{ success: boolean; message: string }> {
    // Kiểm tra quyền admin
    const ctx = (req as RequestWithContext).context;
    if (!ctx?.membership || ctx.membership.role !== 'admin') {
      throw new ForbiddenException('Chỉ admin mới có quyền unlock budget cho tenant khác');
    }

    this.validatePeriod(period);

    this.logger.warn(
      `ADMIN UNLOCK | admin=${ctx.user?.email ?? 'unknown'} | ` +
      `target=${targetTenantId.slice(0, 8)} | period=${period}`,
    );

    // Reset period cho target tenant
    await this.budgetService.resetTenantPeriod(targetTenantId);
    await this.budgetService.updateBudgetLimit({
      tenantId: targetTenantId,
      period: period.toUpperCase() as any,
      forceStatus: 'ACTIVE' as BudgetStatus,
    });

    return {
      success: true,
      message: `Budget ${period} đã được reset thành ACTIVE cho tenant ${targetTenantId.slice(0, 8)}`,
    };
  }

  // ================================================================
  // PRIVATE HELPERS
  // ================================================================

  /**
   * Anti-IDOR: tenantId luôn lấy từ context đã xác thực.
   */
  private resolveTenantId(req: Request): string {
    const ctx = (req as RequestWithContext).context;
    if (!ctx?.tenant?.id) {
      throw new UnauthorizedException('Yêu cầu xác thực tenant');
    }
    return ctx.tenant.id;
  }

  /**
   * Validate period enum.
   */
  private validatePeriod(period: string): void {
    const valid = ['DAILY', 'WEEKLY', 'MONTHLY'];
    const upper = period.toUpperCase();
    if (!valid.includes(upper)) {
      throw new BadRequestException(
        `Invalid period '${period}'. Must be one of: ${valid.join(', ')}`,
      );
    }
  }
}
