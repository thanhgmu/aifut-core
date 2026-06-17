// ================================================================
// subscription.controller.ts — Subscription REST Controller
// ================================================================
// Module: apps/api/src/payments/subscription
//
// Endpoints điều khiển gói cước:
//   POST /billing/subscription/upgrade — nâng cấp / hạ cấp gói
//   POST /billing/subscription/cancel  — hủy gói kèm hoàn tiền
//
// Endpoints READ-ONLY phục vụ Subscription UI (không mutate dữ liệu):
//   GET  /billing/subscription/current — gói hiện tại + thống kê usage
//   GET  /billing/subscription/plans   — danh sách PLAN_DEFINITIONS (view model)
//   GET  /billing/subscription/prorate — preview proration (pure calc)
//
// CHỐNG IDOR: tenantId LUÔN được phân giải từ auth/header context
// (x-tenant-id hoặc x-tenant-slug), KHÔNG BAO GIỜ lấy từ request body
// hay query string. Query/body chỉ chứa tham số tác vụ (targetPlanKey,
// subscriptionId…). Mọi truy vấn read-only đều ràng buộc theo tenantId
// đã phân giải để tenant A không thể đọc dữ liệu của tenant B.
// ================================================================

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Headers,
  UseGuards,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { PrismaService } from '../../prisma.service';
import { PlanGuard } from './plan.guard';
import { PlanLimit } from './plan.decorator';
import { UpgradeSubscriptionInput, CancelResult, UpgradeResult } from './subscription.types';
import {
  BillingCycle,
  PlanKey,
  PLAN_DEFINITIONS,
  getPlan,
  getPlanPrice,
  getActivePlans,
  isUnlimited,
  comparePlanKeys,
  cycleMonths,
} from './plan.config';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
/** Hệ số quy đổi đơn vị nhỏ nhất (Wallet/Ledger BigInt) → VND */
const UNIT_SCALE = 100;

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

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly prisma: PrismaService,
  ) {}

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

  // ================================================================
  // READ-ONLY ENDPOINTS — phục vụ Subscription UI
  // ================================================================

  /**
   * GET /billing/subscription/current
   *
   * Trả về gói cước đang hoạt động của tenant + thống kê sử dụng tài
   * nguyên trong chu kỳ + plan definition đầy đủ.
   *
   * CHỐNG IDOR: tenantId phân giải từ header (x-tenant-id|x-tenant-slug),
   * mọi truy vấn đều ràng buộc theo tenantId đó.
   */
  @Get('current')
  async getCurrent(
    @Headers('x-tenant-id') tenantIdHeader?: string,
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
  ) {
    const tenantId = await this.resolveTenantId(tenantIdHeader, tenantSlugHeader);

    // Lấy subscription đang active/trialing mới nhất của tenant
    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId, status: { in: ['active', 'trialing'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (!sub) {
      return { subscription: null, usage: null, planDefinition: null };
    }

    const planKey = sub.planKey as PlanKey;
    const plan = getPlan(planKey);
    const limits = plan?.limits;

    // Mốc bắt đầu chu kỳ để cộng dồn usage
    const periodStart = sub.startedAt ?? sub.createdAt;
    const daysRemaining = this.daysBetween(new Date(), sub.expiresAt);

    // ── Aggregations read-only theo tenantId (ràng buộc IDOR) ──
    const [aiAgg, storageAgg, workflowCount] = await Promise.all([
      this.prisma.usageRecord.aggregate({
        _sum: { value: true },
        where: { tenantId, category: 'ai', recordedAt: { gte: periodStart } },
      }),
      this.prisma.usageRecord.aggregate({
        _sum: { value: true },
        where: { tenantId, category: 'storage', recordedAt: { gte: periodStart } },
      }),
      this.prisma.workflowTemplate.count({ where: { tenantId } }).catch(() => 0),
    ]);

    const aiCallsUsed = Math.round(aiAgg._sum.value ?? 0);
    const aiCallsLimit = limits?.aiCallsMonthly ?? 0;
    // storage UsageRecord lưu theo MB → quy đổi GB
    const storageUsedGB = Math.round(((storageAgg._sum.value ?? 0) / 1024) * 100) / 100;
    const storageLimitGB = limits?.storageGB ?? 0;
    const activeWorkflows = workflowCount ?? 0;
    const workflowLimit = limits?.maxWorkflows ?? 0;

    const usage = {
      aiCallsUsed,
      aiCallsLimit,
      aiCallsPercent: this.percent(aiCallsUsed, aiCallsLimit),
      storageUsedGB,
      storageLimitGB,
      storagePercent: this.percent(storageUsedGB, storageLimitGB),
      activeWorkflows,
      workflowLimit,
      workflowPercent: this.percent(activeWorkflows, workflowLimit),
    };

    const subscription = {
      subscriptionId: sub.id,
      planKey,
      planName: plan?.name ?? planKey,
      status: sub.status,
      startedAt: sub.startedAt ? sub.startedAt.toISOString() : null,
      expiresAt: sub.expiresAt ? sub.expiresAt.toISOString() : null,
      trialEndsAt: sub.trialEndsAt ? sub.trialEndsAt.toISOString() : null,
      autoRenew: sub.autoRenew,
      billingCycle: 'monthly' as BillingCycle,
      daysRemaining,
    };

    return {
      subscription,
      usage,
      planDefinition: this.toPlanColumnView(planKey, planKey),
    };
  }

  /**
   * GET /billing/subscription/plans
   *
   * Trả về toàn bộ plan definitions (từ PLAN_DEFINITIONS) dưới dạng
   * view-model PlanColumnView để frontend render bảng so sánh.
   * currentPlanKey suy ra từ subscription đang active (nếu tenant
   * phân giải được — endpoint vẫn dùng được cho marketing khi chưa login).
   */
  @Get('plans')
  async getPlans(
    @Headers('x-tenant-id') tenantIdHeader?: string,
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
  ) {
    let currentPlanKey: PlanKey | null = null;
    const tenantId = await this.resolveTenantId(tenantIdHeader, tenantSlugHeader, false);
    if (tenantId) {
      const sub = await this.prisma.subscription.findFirst({
        where: { tenantId, status: { in: ['active', 'trialing'] } },
        orderBy: { createdAt: 'desc' },
        select: { planKey: true },
      });
      currentPlanKey = (sub?.planKey as PlanKey) ?? null;
    }

    const plans = getActivePlans().map((p) =>
      this.toPlanColumnView(p.key, currentPlanKey),
    );

    return { plans, currentPlanKey };
  }

  /**
   * GET /billing/subscription/prorate
   *
   * Preview proration (pure calculation, KHÔNG mutate). Dùng để hiển thị
   * chi phí dự kiến trước khi user xác nhận nâng/hạ cấp.
   *
   * Query (không chứa tenantId): subscriptionId, targetPlanKey,
   * targetCycle, immediate.
   * CHỐNG IDOR: subscription được tải kèm ràng buộc tenantId phân giải
   * từ header — không thể prorate trên subscription của tenant khác.
   */
  @Get('prorate')
  async getProrate(
    @Query('subscriptionId') subscriptionId: string,
    @Query('targetPlanKey') targetPlanKey: string,
    @Query('targetCycle') targetCycle: string,
    @Query('immediate') immediate?: string,
    @Headers('x-tenant-id') tenantIdHeader?: string,
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
  ) {
    if (!subscriptionId) throw new BadRequestException('subscriptionId is required');
    if (!targetPlanKey) throw new BadRequestException('targetPlanKey is required');

    const tenantId = await this.resolveTenantId(tenantIdHeader, tenantSlugHeader);
    const newPlan = getPlan(targetPlanKey as PlanKey);
    if (!newPlan) throw new BadRequestException(`Invalid plan key: ${targetPlanKey}`);

    const cycle: BillingCycle = targetCycle === 'yearly' ? 'yearly' : 'monthly';

    // Tải subscription ràng buộc tenantId (chống IDOR)
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
    const oldPlanName = getPlan(oldPlanKey)?.name ?? oldPlanKey;
    const newPlanName = newPlan.name;
    const charge = detail.chargeAmount;
    const shortfall = Math.max(0, charge - walletBalance);

    // ProrationPreviewView — view model friendly cho frontend
    return {
      oldPlanKey,
      newPlanKey: targetPlanKey,
      oldPlanName,
      newPlanName,
      oldPlanRemainingDays: detail.oldPlanRemainingDays,
      oldPlanTotalDays: detail.oldPlanTotalDays,
      oldPlanRemainingValue: detail.oldPlanRemainingValue,
      oldPlanRemainingDisplay: this.formatVnd(detail.oldPlanRemainingValue),
      newPlanTotalPrice: detail.newPlanTotalPrice,
      newPlanTotalDisplay: this.formatVnd(detail.newPlanTotalPrice),
      newPlanProratedPrice: detail.newPlanProratedPrice,
      newPlanProratedDisplay: this.formatVnd(detail.newPlanProratedPrice),
      direction,
      chargeAmount: charge,
      chargeDisplay: this.formatVnd(charge),
      creditAmount: detail.creditAmount,
      creditDisplay: this.formatVnd(detail.creditAmount),
      effectiveFromDisplay: this.formatDate(detail.effectiveFrom),
      newExpiresAtDisplay: this.formatDate(detail.newExpiresAt),
      walletBalanceDisplay: this.formatVnd(walletBalance),
      sufficientBalance: walletBalance >= charge,
      shortfallAmount: shortfall,
      shortfallDisplay: this.formatVnd(shortfall),
    };
  }

  // ================================================================
  // Helpers (private) — phân giải tenant, view-model, format
  // ================================================================

  /**
   * Phân giải tenantId từ header context (chống IDOR).
   * Ưu tiên x-tenant-id; nếu thiếu thì tra Tenant theo x-tenant-slug.
   * @param required ném BadRequest khi không phân giải được (mặc định true)
   */
  private async resolveTenantId(
    tenantIdHeader?: string,
    tenantSlugHeader?: string,
    required = true,
  ): Promise<string> {
    if (tenantIdHeader) {
      const t = await this.prisma.tenant.findUnique({
        where: { id: tenantIdHeader },
        select: { id: true },
      });
      if (t) return t.id;
    }
    if (tenantSlugHeader) {
      const t = await this.prisma.tenant.findUnique({
        where: { slug: tenantSlugHeader },
        select: { id: true },
      });
      if (t) return t.id;
    }
    if (required) {
      throw new BadRequestException(
        'x-tenant-id or x-tenant-slug header is required for IDOR protection',
      );
    }
    return '';
  }

  /** Map một PlanKey → PlanColumnView (view model cho bảng so sánh) */
  private toPlanColumnView(key: PlanKey, currentPlanKey: PlanKey | null) {
    const plan = PLAN_DEFINITIONS[key];
    const monthlyTier = plan.prices.find((p) => p.billingCycle === 'monthly');
    const yearlyTier = plan.prices.find((p) => p.billingCycle === 'yearly');
    const monthlyPrice = monthlyTier?.priceVnd ?? getPlanPrice(key, 'monthly');
    const yearlyPrice = yearlyTier?.priceVnd ?? 0;

    const l = plan.limits;
    const limits = [
      this.limitRow('maxUsers', 'Thành viên', '👥', l.maxUsers, ' người'),
      this.limitRow('maxWorkspaces', 'Khu vực', '📦', l.maxWorkspaces, ' nơi'),
      this.limitRow('maxWorkflows', 'Workflow', '🔧', l.maxWorkflows, ' mẫu'),
      this.limitRow('maxConnectors', 'Kết nối', '🔗', l.maxConnectors, ' kết nối'),
      this.limitRow('aiCallsMonthly', 'AI Calls', '🤖', l.aiCallsMonthly, '/tháng'),
      this.limitRow('storageGB', 'Lưu trữ', '💾', l.storageGB, 'GB'),
      this.limitRow('bandwidthGB', 'Băng thông', '🌐', l.bandwidthGB, 'GB'),
    ];

    const f = plan.features;
    const features = [
      { key: 'cloudBackup', value: f.cloudBackup },
      { key: 'multiDevice', value: f.multiDevice },
      { key: 'marketplace', value: f.marketplace },
      { key: 'apiAccess', value: f.apiAccess },
      { key: 'analytics', value: f.analytics },
      { key: 'customDomain', value: f.customDomain },
      { key: 'whiteLabel', value: f.whiteLabel },
      { key: 'prioritySupport', value: f.prioritySupport },
      { key: 'slaGuarantee', value: f.slaGuarantee },
    ];

    const isCurrent = currentPlanKey === key;
    let ctaType: 'current' | 'upgrade' | 'downgrade' | 'contact' | 'trial' = 'upgrade';
    let ctaLabel = 'Nâng cấp';

    if (isCurrent) {
      ctaType = 'current';
      ctaLabel = 'Gói hiện tại';
    } else if (key === 'enterprise') {
      ctaType = 'contact';
      ctaLabel = 'Liên hệ';
    } else if (currentPlanKey) {
      const dir = comparePlanKeys(currentPlanKey, key);
      if (dir === 'downgrade') {
        ctaType = 'downgrade';
        ctaLabel = 'Chuyển sang';
      } else {
        ctaType = 'upgrade';
        ctaLabel = 'Nâng cấp';
      }
    } else if ((monthlyTier?.trialDays ?? 0) > 0) {
      ctaType = 'trial';
      ctaLabel = `Dùng thử ${monthlyTier?.trialDays} ngày`;
    }

    return {
      key,
      name: plan.name,
      nameEn: plan.nameEn,
      description: plan.description,
      tag: plan.tag && plan.tag.length > 0 ? plan.tag : null,
      sortOrder: plan.sortOrder,
      monthlyPrice,
      monthlyPriceDisplay: monthlyPrice === 0 ? 'Miễn phí' : this.formatVnd(monthlyPrice),
      yearlyPrice,
      yearlyPriceDisplay: yearlyPrice === 0 ? '—' : this.formatVnd(yearlyPrice),
      yearlyDiscountPercent: yearlyTier?.discountPercent ?? 0,
      trialDays: monthlyTier?.trialDays ?? 0,
      limits,
      features,
      isCurrent,
      highlighted: key === 'pro',
      ctaType,
      ctaLabel,
    };
  }

  /** Tạo một ResourceLimitDisplay */
  private limitRow(
    key: string,
    label: string,
    icon: string,
    rawValue: number,
    unit: string,
  ) {
    const unlimited = isUnlimited(rawValue);
    return {
      key,
      label,
      icon,
      displayValue: unlimited ? 'Không giới hạn' : `${rawValue.toLocaleString('vi-VN')}${unit}`,
      rawValue,
      unlimited,
    };
  }

  /** % sử dụng (0-100); limit <= 0 hoặc unlimited → 0 */
  private percent(used: number, limit: number): number {
    if (!limit || limit <= 0) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
  }

  /** Số ngày từ hôm nay đến mốc (>= 0) */
  private daysBetween(from: Date, to: Date | null): number {
    if (!to) return 0;
    return Math.max(0, Math.ceil((to.getTime() - from.getTime()) / MS_PER_DAY));
  }

  /** Format VND server-side (đồng bộ với lib/subscription.ts formatVND) */
  private formatVnd(amount: number): string {
    if (!Number.isFinite(amount)) return '0₫';
    const rounded = Math.round(amount);
    if (rounded >= 1_000_000_000) {
      return `${(rounded / 1_000_000_000).toLocaleString('vi-VN', {
        maximumFractionDigits: 1,
      })} tỷ₫`;
    }
    return `${rounded.toLocaleString('vi-VN')}₫`;
  }

  /** Format ngày ISO → "24 Thg 6, 2026" */
  private formatDate(d: Date | null | undefined): string {
    if (!d) return '—';
    const date = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
}
