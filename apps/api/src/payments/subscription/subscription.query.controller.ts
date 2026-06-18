// ================================================================
// subscription.query.controller.ts — Subscription READ-ONLY Controller
// ================================================================
// Module: apps/api/src/payments/subscription
//
// Tách riêng họ endpoint READ-ONLY khỏi mutation controller để phân
// định rõ quyền hạn (query vs mutation). KHÔNG bao giờ mutate dữ liệu.
//
//   GET /billing/subscription/current — gói active + usageStats[] + plan
//   GET /billing/subscription/plans   — ma trận PLAN_DEFINITIONS (view model)
//   GET /billing/subscription/prorate — preview proration (pure calc)
//
// CHỐNG IDOR: tenantId LUÔN phân giải qua SubscriptionIdorProvider từ
// header context (x-tenant-id | x-tenant-slug). TUYỆT ĐỐI không lấy
// tenantId từ body/query/params. Mọi truy vấn DB ràng buộc theo tenantId
// đã phân giải → cô lập tuyệt đối context của từng tenant.
// ================================================================

import {
  Controller,
  Get,
  Query,
  Headers,
  Header,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import {
  SubscriptionService,
  SubscriptionCurrentView,
  PlanColumnView,
} from './subscription.service';
import { SubscriptionIdorProvider } from './subscription.idor.provider';
import {
  BillingCycle,
  PlanKey,
  getPlan,
  getActivePlans,
  comparePlanKeys,
} from './plan.config';

/** Hệ số quy đổi đơn vị nhỏ nhất (Wallet/Ledger BigInt) → VND */
const UNIT_SCALE = 100;

// ================================================================
// VIEW MODELS riêng cho query controller
// ================================================================

export interface AvailablePlansView {
  plans: PlanColumnView[];
  currentPlanKey: PlanKey | null;
  metadata: {
    recommendedKey: PlanKey | null;
    planCount: number;
    monthlyTotal: number;
    cheapestMonthly: number;
    currency: string;
    currencySymbol: string;
  };
}

export interface ProrationPreviewView {
  currentPlanKey: PlanKey;
  currentPlanName: string;
  targetPlanKey: PlanKey;
  targetPlanName: string;
  direction: 'upgrade' | 'downgrade' | 'crossgrade' | 'same';

  oldPlanRemainingDays: number;
  oldPlanTotalDays: number;
  oldPlanRemainingValue: number;
  oldPlanRemainingDisplay: string;
  newPlanTotalPrice: number;
  newPlanTotalDisplay: string;
  newPlanProratedPrice: number;
  newPlanProratedDisplay: string;
  chargeAmount: number;
  chargeDisplay: string;
  creditAmount: number;
  creditDisplay: string;

  effectiveFrom: string;
  effectiveFromDisplay: string;
  newExpiresAt: string;
  newExpiresAtDisplay: string;

  walletBalance: number;
  walletBalanceDisplay: string;
  sufficientBalance: boolean;
  shortfallAmount: number;
  shortfallDisplay: string;

  scheduled: boolean;
  scheduledNextPeriodStartDisplay: string | null;
}

// ================================================================

@Controller('billing/subscription')
export class SubscriptionQueryController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly idor: SubscriptionIdorProvider,
    private readonly prisma: PrismaService,
  ) {}

  // ────────────────────────────────────────────────────────────
  // GET /billing/subscription/current
  // ────────────────────────────────────────────────────────────

  @Get('current')
  @Header('Cache-Control', 'private, max-age=60')
  async getCurrent(
    @Headers() headers: Record<string, any>,
  ): Promise<SubscriptionCurrentView> {
    // IDOR: required — phải xác định tenant rõ ràng để đọc gói riêng
    const tenantId = await this.idor.resolveTenantId(headers, true);
    return this.subscriptionService.getCurrentSubscriptionDetails(tenantId);
  }

  // ────────────────────────────────────────────────────────────
  // GET /billing/subscription/plans
  // ────────────────────────────────────────────────────────────

  @Get('plans')
  @Header('Cache-Control', 'public, max-age=300, s-maxage=600')
  async getPlans(
    @Headers() headers: Record<string, any>,
  ): Promise<AvailablePlansView> {
    // IDOR: optional — dùng được cho marketing khi tenant chưa đăng nhập.
    // Nếu có header hợp lệ → suy ra currentPlanKey để bôi đậm gói hiện tại.
    const tenantId = await this.idor.resolveTenantId(headers, false);

    let currentPlanKey: PlanKey | null = null;
    if (tenantId) {
      const sub = await this.prisma.subscription.findFirst({
        where: { tenantId, status: { in: ['active', 'trialing'] } },
        orderBy: { createdAt: 'desc' },
        select: { planKey: true },
      });
      currentPlanKey = (sub?.planKey as PlanKey) ?? null;
    }

    const activePlans = getActivePlans();
    const plans = activePlans.map((p) =>
      this.subscriptionService.toPlanColumnView(p.key, currentPlanKey),
    );

    const monthlyPrices = plans.map((p) => p.monthlyPrice);
    const recommended = activePlans.find((p) => p.tag === 'Phổ biến');

    return {
      plans,
      currentPlanKey,
      metadata: {
        recommendedKey: (recommended?.key as PlanKey) ?? null,
        planCount: plans.length,
        monthlyTotal: monthlyPrices.reduce((sum, v) => sum + v, 0),
        cheapestMonthly: monthlyPrices.length ? Math.min(...monthlyPrices) : 0,
        currency: 'VND',
        currencySymbol: '₫',
      },
    };
  }

  // ────────────────────────────────────────────────────────────
  // GET /billing/subscription/prorate
  // ────────────────────────────────────────────────────────────

  @Get('prorate')
  @Header('Cache-Control', 'private, max-age=30')
  async getProrate(
    @Query('subscriptionId') subscriptionId: string,
    @Query('targetPlanKey') targetPlanKey: string,
    @Query('targetCycle') targetCycle: string,
    @Query('immediate') immediate: string | undefined,
    @Headers() headers: Record<string, any>,
  ): Promise<ProrationPreviewView> {
    if (!subscriptionId) throw new BadRequestException('subscriptionId is required');
    if (!targetPlanKey) throw new BadRequestException('targetPlanKey is required');

    const newPlan = getPlan(targetPlanKey as PlanKey);
    if (!newPlan) throw new BadRequestException(`Invalid plan key: ${targetPlanKey}`);

    // IDOR: required + load subscription ràng buộc tenantId
    const tenantId = await this.idor.resolveTenantId(headers, true);
    const cycle: BillingCycle = targetCycle === 'yearly' ? 'yearly' : 'monthly';
    const scheduled = immediate === 'false';

    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, tenantId, status: { in: ['active', 'trialing'] } },
    });
    if (!sub) {
      throw new BadRequestException('No active subscription found for this tenant');
    }

    const oldPlanKey = sub.planKey as PlanKey;
    const now = new Date();

    const detail = this.subscriptionService.calculateProratedPricing({
      oldPlanKey,
      newPlanKey: targetPlanKey as PlanKey,
      oldCycle: 'monthly',
      newCycle: cycle,
      currentPeriodStart: sub.startedAt ?? now,
      currentPeriodEnd: sub.expiresAt ?? now,
      upgradeTime: now,
    });

    // Số dư ví hiện tại (read-only, ràng buộc tenantId)
    const wallet = await this.prisma.wallet.findUnique({ where: { tenantId } });
    const walletBalance = wallet ? Number(BigInt(wallet.balance)) / UNIT_SCALE : 0;

    const direction = comparePlanKeys(oldPlanKey, targetPlanKey as PlanKey);
    const charge = detail.chargeAmount;
    const shortfall = Math.max(0, charge - walletBalance);

    const fmtVnd = (n: number) => this.subscriptionService.formatVnd(n);
    const fmtDate = (d: Date) => this.subscriptionService.formatDate(d);

    return {
      currentPlanKey: oldPlanKey,
      currentPlanName: getPlan(oldPlanKey)?.name ?? oldPlanKey,
      targetPlanKey: targetPlanKey as PlanKey,
      targetPlanName: newPlan.name,
      direction,

      oldPlanRemainingDays: detail.oldPlanRemainingDays,
      oldPlanTotalDays: detail.oldPlanTotalDays,
      oldPlanRemainingValue: detail.oldPlanRemainingValue,
      oldPlanRemainingDisplay: fmtVnd(detail.oldPlanRemainingValue),
      newPlanTotalPrice: detail.newPlanTotalPrice,
      newPlanTotalDisplay: fmtVnd(detail.newPlanTotalPrice),
      newPlanProratedPrice: detail.newPlanProratedPrice,
      newPlanProratedDisplay: fmtVnd(detail.newPlanProratedPrice),
      chargeAmount: charge,
      chargeDisplay: fmtVnd(charge),
      creditAmount: detail.creditAmount,
      creditDisplay: fmtVnd(detail.creditAmount),

      effectiveFrom: detail.effectiveFrom.toISOString(),
      effectiveFromDisplay: fmtDate(detail.effectiveFrom),
      newExpiresAt: detail.newExpiresAt.toISOString(),
      newExpiresAtDisplay: fmtDate(detail.newExpiresAt),

      walletBalance,
      walletBalanceDisplay: fmtVnd(walletBalance),
      sufficientBalance: walletBalance >= charge,
      shortfallAmount: shortfall,
      shortfallDisplay: fmtVnd(shortfall),

      scheduled,
      scheduledNextPeriodStartDisplay: scheduled ? fmtDate(detail.newExpiresAt) : null,
    };
  }
}
