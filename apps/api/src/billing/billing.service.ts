import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Account ────────────────────────────────────────────────────────────────

  async getOrCreateAccount(tenantId: string) {
    let acct = await this.prisma.billingAccount.findUnique({ where: { tenantId } });
    if (!acct) {
      acct = await this.prisma.billingAccount.create({
        data: { tenantId, currency: 'VND', billingPeriod: 'monthly' },
      });
    }
    return acct;
  }

  // ── Plans ──────────────────────────────────────────────────────────────────

  async seedDefaultPlans() {
    const plans = [
      {
        key: 'free',
        name: 'Miễn phí',
        price: 0,
        interval: 'MONTHLY' as const,
        maxUsers: 1,
        maxWorkflows: 3,
        aiCallsMonthly: 500,
        storageGB: 1,
        features: { localOnly: true },
      },
      {
        key: 'starter',
        name: 'Cơ bản',
        price: 99000,
        interval: 'MONTHLY' as const,
        maxUsers: 1,
        maxWorkflows: 10,
        aiCallsMonthly: 1000,
        storageGB: 5,
        features: { cloudBackup: true },
      },
      {
        key: 'pro',
        name: 'Chuyên nghiệp',
        price: 490000,
        interval: 'MONTHLY' as const,
        maxUsers: 3,
        maxWorkflows: -1,
        aiCallsMonthly: 5000,
        storageGB: 50,
        features: { cloudBackup: true, multiDevice: true, marketplace: true },
      },
      {
        key: 'team',
        name: 'Doanh nghiệp',
        price: 990000,
        interval: 'MONTHLY' as const,
        maxUsers: 10,
        maxWorkflows: -1,
        aiCallsMonthly: 20000,
        storageGB: 200,
        features: { cloudBackup: true, multiDevice: true, marketplace: true, api: true, analytics: true },
      },
    ];

    for (const plan of plans) {
      const exists = await this.prisma.subscriptionPlan.findUnique({ where: { key: plan.key } });
      if (!exists) {
        await this.prisma.subscriptionPlan.create({ data: plan });
      }
    }
    return this.prisma.subscriptionPlan.findMany({ orderBy: { price: 'asc' } });
  }

  async listPlans() {
    return this.prisma.subscriptionPlan.findMany({ where: { isActive: true }, orderBy: { price: 'asc' } });
  }

  async getPlan(key: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { key } });
    if (!plan) throw new NotFoundException(`Plan '${key}' not found`);
    return plan;
  }

  // ── Subscription ───────────────────────────────────────────────────────────

  async subscribe(tenantId: string, planKey: string, trialDays = 0) {
    const plan = await this.getPlan(planKey);
    const account = await this.getOrCreateAccount(tenantId);

    // Deactivate existing active subscriptions
    await this.prisma.subscription.updateMany({
      where: { accountId: account.id, status: 'active' },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });

    const now = new Date();
    let expiresAt: Date | null = null;
    let trialEndsAt: Date | null = null;

    if (plan.interval !== 'ONE_TIME') {
      const months = plan.interval === 'YEARLY' ? 12 : 1;
      expiresAt = new Date(now);
      expiresAt.setMonth(expiresAt.getMonth() + months);
    }

    if (trialDays > 0) {
      trialEndsAt = new Date(now);
      trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);
    }

    const sub = await this.prisma.subscription.create({
      data: {
        accountId: account.id,
        planKey,
        tenantId,
        status: trialDays > 0 ? 'trialing' : 'active',
        startedAt: now,
        expiresAt,
        trialEndsAt,
      },
    });

    return sub;
  }

  async getCurrentSubscription(tenantId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId, status: { in: ['active', 'trialing'] } },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });
    return sub ?? { status: 'none', tenantId, description: 'No active subscription' };
  }

  async cancelSubscription(subscriptionId: string) {
    return this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: 'cancelled', cancelledAt: new Date(), autoRenew: false },
    });
  }

  // ── Usage ──────────────────────────────────────────────────────────────────

  async recordUsage(input: {
    tenantId: string; category: string; metric: string; value: number; metadata?: any;
  }) {
    const account = await this.getOrCreateAccount(input.tenantId);
    return this.prisma.usageRecord.create({
      data: {
        accountId: account.id,
        tenantId: input.tenantId,
        category: input.category,
        metric: input.metric,
        value: input.value,
        recordedAt: new Date(),
        metadata: input.metadata ?? {},
      },
    });
  }

  async getUsage(tenantId: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    return this.prisma.usageRecord.findMany({
      where: { tenantId, recordedAt: { gte: since } },
      orderBy: { recordedAt: 'desc' },
      take: 1000,
    });
  }
}
