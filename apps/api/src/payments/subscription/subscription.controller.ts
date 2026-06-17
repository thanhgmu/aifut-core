// ================================================================
// subscription.controller.ts — Subscription REST Controller
// ================================================================
// Module: apps/api/src/payments/subscription
//
// Endpoints điều khiển gói cước:
//   POST /billing/subscription/upgrade — nâng cấp / hạ cấp gói
//   POST /billing/subscription/cancel  — hủy gói kèm hoàn tiền
//
// CHỐNG IDOR: tenantId được lấy từ auth context (x-tenant-id header
// hoặc accessPolicy), KHÔNG từ request body. Request body chỉ chứa
// các tham số tác vụ (targetPlanKey, targetCycle…).
// ================================================================

import {
  Controller,
  Post,
  Body,
  Headers,
  UseGuards,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { PlanGuard } from './plan.guard';
import { PlanLimit } from './plan.decorator';
import { UpgradeSubscriptionInput, CancelResult, UpgradeResult } from './subscription.types';
import { BillingCycle, PlanKey } from './plan.config';

// ================================================================
// DTOs — đầu vào từ client (không chứa tenantId)
// ================================================================

export interface UpgradeSubscriptionDto {
  /** ID của subscription hiện tại */
  currentSubscriptionId: string;
  /** Plan key muốn chuyển sang: free | starter | pro | enterprise */
  targetPlanKey: PlanKey;
  /** Chu kỳ thanh toán: monthly | yearly */
  targetCycle: BillingCycle;
  /** immediate=true: áp dụng ngay, false: lên lịch kỳ kế tiếp */
  immediate: boolean;
}

export interface CancelSubscriptionDto {
  /** ID của subscription cần hủy */
  subscriptionId: string;
}

// ================================================================

@Controller('billing/subscription')
export class SubscriptionController {
  private readonly logger = new Logger(SubscriptionController.name);

  constructor(private readonly subscriptionService: SubscriptionService) {}

  /**
   * POST /billing/subscription/upgrade
   *
   * Nâng cấp / hạ cấp gói cước.
   * tenantId được lấy từ x-tenant-id header (không lấy từ body)
   * để chống IDOR.
   *
   * Body (DTO — không chứa tenantId):
   *   { currentSubscriptionId, targetPlanKey, targetCycle, immediate }
   */
  @Post('upgrade')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlanGuard)
  @PlanLimit({ resource: 'users', action: 'create' })
  async upgrade(
    @Body() dto: UpgradeSubscriptionDto,
    @Headers('x-tenant-id') tenantId?: string,
  ): Promise<UpgradeResult> {
    // Validate required fields
    if (!dto.currentSubscriptionId) {
      throw new BadRequestException('currentSubscriptionId is required');
    }
    if (!dto.targetPlanKey) {
      throw new BadRequestException('targetPlanKey is required');
    }
    if (!dto.targetCycle) {
      throw new BadRequestException('targetCycle is required');
    }
    if (!tenantId) {
      throw new BadRequestException('x-tenant-id header is required for IDOR protection');
    }

    this.logger.log(
      `Upgrade requested: tenant=${tenantId.slice(0, 8)} ` +
        `sub=${dto.currentSubscriptionId.slice(0, 8)} ` +
        `target=${dto.targetPlanKey}/${dto.targetCycle} ` +
        `immediate=${dto.immediate}`,
    );

    const input: UpgradeSubscriptionInput = {
      tenantId,
      currentSubscriptionId: dto.currentSubscriptionId,
      targetPlanKey: dto.targetPlanKey,
      targetCycle: dto.targetCycle,
      immediate: dto.immediate,
    };

    return this.subscriptionService.upgradeSubscriptionPlan(input);
  }

  /**
   * POST /billing/subscription/cancel
   *
   * Hủy gói cước kèm hoàn tiền theo tỷ lệ ngày còn lại.
   * tenantId được lấy từ x-tenant-id header để chống IDOR.
   *
   * Body (DTO — không chứa tenantId):
   *   { subscriptionId }
   */
  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Body() dto: CancelSubscriptionDto,
    @Headers('x-tenant-id') tenantId?: string,
  ): Promise<CancelResult> {
    if (!dto.subscriptionId) {
      throw new BadRequestException('subscriptionId is required');
    }
    if (!tenantId) {
      throw new BadRequestException('x-tenant-id header is required for IDOR protection');
    }

    this.logger.log(
      `Cancel requested: tenant=${tenantId.slice(0, 8)} ` +
        `sub=${dto.subscriptionId.slice(0, 8)}`,
    );

    return this.subscriptionService.cancelWithRefund(dto.subscriptionId, tenantId);
  }
}
