import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { BillingService } from './billing/billing.service';

@Injectable()
export class AiBillingMeterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  /**
   * Record AI usage as a billable event.
   * Called by the AI gateway after every AI execution.
   *
   * Mỗi lần gọi tạo 2 bản ghi UsageRecord:
   *   1. metric:'tokens'   — tổng token tiêu thụ (input + output)
   *   2. metric:'cost'     — chi phí thực tế của lần gọi
   *
   * metadata của bản ghi cost chứa latencyMs + success để
   * Analytics Service tính Avg Latency + Success Rate thay
   * vì mặc định 0ms / 100%.
   */
  async recordAiUsage(input: {
    tenantId: string;
    modelKey: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCost: number;
    actualCost?: number;
    featureKey?: string;
    taskType?: string;
    cacheHit?: boolean;
    /** Thời gian phản hồi thực tế (ms) — nếu caller không cung cấp, ghi 0 */
    latencyMs?: number;
    /** Kết quả lần gọi: true=thành công, false=lỗi/timeout — mặc định true */
    success?: boolean;
  }) {
    const cost = input.actualCost ?? input.estimatedCost;
    // Ghi bản ghi token
    await this.billing.recordUsage({
      tenantId: input.tenantId,
      category: 'ai',
      metric: 'tokens',
      value: input.totalTokens,
      metadata: {
        modelKey: input.modelKey,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        estimatedCost: input.estimatedCost,
        actualCost: input.actualCost,
        featureKey: input.featureKey ?? 'general',
        taskType: input.taskType ?? 'general',
        cacheHit: input.cacheHit ?? false,
      },
    });

    // Ghi bản ghi cost (kèm latencyMs + success cho Analytics)
    if (cost > 0) {
      await this.billing.recordUsage({
        tenantId: input.tenantId,
        category: 'ai',
        metric: 'cost',
        value: cost,
        metadata: {
          modelKey: input.modelKey,
          tokens: input.totalTokens,
          featureKey: input.featureKey ?? 'general',
          latencyMs: input.latencyMs ?? 0,
          success: input.success ?? true,
        },
      });
    }
  }

  /**
   * Get current month billing summary for a tenant.
   * Returns usage vs plan limits.
   */
  async getBillingSummary(tenantId: string) {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    // Get current subscription + plan
    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId, status: { in: ['active', 'trialing'] } },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });

    // Aggregate AI usage this month
    const aiUsage = await this.prisma.usageRecord.aggregate({
      where: {
        tenantId,
        category: 'ai',
        recordedAt: { gte: monthStart },
      },
      _sum: { value: true },
    });

    // Aggregate AI cost this month
    const aiCost = await this.prisma.usageRecord.aggregate({
      where: {
        tenantId,
        category: 'ai',
        metric: 'cost',
        recordedAt: { gte: monthStart },
      },
      _sum: { value: true },
    });

    // Count workflows used
    const workflowCount = await this.prisma.workflowExecution.count({
      where: {
        tenantId,
        createdAt: { gte: monthStart },
      },
    });

    const plan = subscription?.plan;
    const aiCallsUsed = aiUsage._sum?.value ?? 0;
    const aiCallsLimit = plan?.aiCallsMonthly ?? 500;
    const storageUsed = await this.getStorageUsed(tenantId);
    const storageLimit = plan?.storageGB ?? 1;

    return {
      tenantId,
      planKey: plan?.key ?? 'free',
      planName: plan?.name ?? 'Miễn phí',
      period: { monthStart, currentDate: now },
      ai: {
        callsUsed: Number(aiCallsUsed),
        callsLimit: aiCallsLimit,
        callsPercent: aiCallsLimit > 0 ? Math.round((Number(aiCallsUsed) / aiCallsLimit) * 100) : 0,
        cost: Number(aiCost._sum?.value ?? 0),
      },
      storage: {
        usedGB: storageUsed,
        limitGB: storageLimit,
        percentFull: storageLimit > 0 ? Math.round((storageUsed / storageLimit) * 100) : 0,
      },
      workflows: {
        active: workflowCount,
        limit: plan?.maxWorkflows ?? 3,
      },
      subscription: subscription
        ? {
            status: subscription.status,
            startedAt: subscription.startedAt,
            expiresAt: subscription.expiresAt,
            trialEndsAt: subscription.trialEndsAt,
            autoRenew: subscription.autoRenew,
          }
        : null,
    };
  }

  /**
   * Check if a tenant has exceeded their plan limits.
   * Returns gating decisions for the feature guard.
   */
  async checkFeatureAccess(tenantId: string, feature: string): Promise<{
    allowed: boolean;
    reason: string | null;
    limit: number | null;
    current: number | null;
  }> {
    const summary = await this.getBillingSummary(tenantId);

    switch (feature) {
      case 'ai':
        if (summary.ai.callsLimit <= 0) {
          return { allowed: false, reason: 'AI features not available on this plan', limit: 0, current: null };
        }
        if (summary.ai.callsUsed >= summary.ai.callsLimit) {
          return {
            allowed: false,
            reason: `AI call limit reached (${summary.ai.callsUsed}/${summary.ai.callsLimit} this month)`,
            limit: summary.ai.callsLimit,
            current: summary.ai.callsUsed,
          };
        }
        return { allowed: true, reason: null, limit: summary.ai.callsLimit, current: summary.ai.callsUsed };

      case 'workflow':
        if (summary.workflows.limit < 0) {
          return { allowed: true, reason: null, limit: null, current: null };
        }
        if (summary.workflows.active >= summary.workflows.limit) {
          return {
            allowed: false,
            reason: `Workflow limit reached (${summary.workflows.active}/${summary.workflows.limit})`,
            limit: summary.workflows.limit,
            current: summary.workflows.active,
          };
        }
        return { allowed: true, reason: null, limit: summary.workflows.limit, current: summary.workflows.active };

      case 'storage':
        if (summary.storage.usedGB >= summary.storage.limitGB) {
          return {
            allowed: false,
            reason: `Storage limit reached (${summary.storage.usedGB}GB/${summary.storage.limitGB}GB)`,
            limit: summary.storage.limitGB,
            current: summary.storage.usedGB,
          };
        }
        return { allowed: true, reason: null, limit: summary.storage.limitGB, current: summary.storage.usedGB };

      case 'feature:cloudBackup':
        if (summary.planKey === 'free') {
          return { allowed: false, reason: 'Cloud backup requires a paid plan', limit: null, current: null };
        }
        return { allowed: true, reason: null, limit: null, current: null };

      case 'feature:marketplace':
        if (summary.planKey === 'free' || summary.planKey === 'starter') {
          return { allowed: false, reason: 'Marketplace requires Pro plan or higher', limit: null, current: null };
        }
        return { allowed: true, reason: null, limit: null, current: null };

      case 'feature:api':
        if (summary.planKey !== 'team') {
          return { allowed: false, reason: 'API access requires Team plan', limit: null, current: null };
        }
        return { allowed: true, reason: null, limit: null, current: null };

      case 'feature:analytics':
        if (summary.planKey !== 'team') {
          return { allowed: false, reason: 'Analytics requires Team plan', limit: null, current: null };
        }
        return { allowed: true, reason: null, limit: null, current: null };

      default:
        return { allowed: true, reason: null, limit: null, current: null };
    }
  }

  private async getStorageUsed(tenantId: string): Promise<number> {
    // Sum backup storage used across backup jobs
    const backupUsage = await this.prisma.backupJob.aggregate({
      where: { tenantId, status: 'COMPLETED' },
      _sum: { totalSize: true },
    });
    const bytes = backupUsage._sum?.totalSize ?? 0;

    return Math.round(Number(bytes) / (1024 * 1024 * 1024) * 100) / 100; // Convert to GB with 2 decimals
  }
}
