import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from './prisma.service';

type AiCredentialMode = 'aifut-managed' | 'byo';
type AiPolicyScopeType = 'tenant' | 'workspace';
type AiQuotaPressure = 'normal' | 'near-limit' | 'hard-limit';
type AiExecutionLane =
  | 'deterministic'
  | 'artifact-cache'
  | 'cheap-model'
  | 'balanced-model'
  | 'premium-model'
  | 'background-batch';

type BuildRoutingPolicyInput = {
  tenantSlug?: string;
  workspaceSlug?: string | null;
  featureKey?: string;
  taskType?: string;
  defaultLane?: AiExecutionLane;
  maxLane?: AiExecutionLane;
  preferredCredentialMode?: AiCredentialMode;
  allowByoKeys?: boolean;
  requireApprovalAboveLane?: AiExecutionLane;
  downgradeAtQuotaPressure?: AiQuotaPressure;
  cacheEnabled?: boolean;
  deterministicFirst?: boolean;
  source?: string;
};

type BuildBudgetPolicyInput = {
  tenantSlug?: string;
  workspaceSlug?: string | null;
  featureKey?: string;
  monthlyTokenBudget?: number;
  hardMonthlyTokenLimit?: number;
  premiumExecutionCap?: number;
  blockOnHardLimit?: boolean;
  requireApprovalAtProjectedCost?: number;
  source?: string;
};

type BuildUsageEventInput = {
  tenantSlug?: string;
  workspaceSlug?: string | null;
  actorKey?: string;
  featureKey?: string;
  taskType?: string;
  providerKey?: string;
  modelKey?: string;
  credentialMode?: AiCredentialMode;
  executionLane?: AiExecutionLane;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
  actualCost?: number;
  cacheHit?: boolean;
  retryCount?: number;
  escalationCount?: number;
  status?: 'success' | 'failure' | 'cancelled';
  source?: string;
  occurredAt?: Date;
};

type AiGovernancePrismaClient = {
  aiRoutingPolicy: {
    upsert(input: unknown): Promise<unknown>;
  };
  aiBudgetPolicy: {
    upsert(input: unknown): Promise<unknown>;
  };
  aiUsageEvent: {
    create(input: unknown): Promise<unknown>;
  };
};

@Injectable()
export class AiGovernancePersistenceService {
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  buildRoutingPolicyRecord(input: BuildRoutingPolicyInput) {
    const scope = this.resolveScope(input.tenantSlug, input.workspaceSlug);
    const featureKey = this.normalizeKey(input.featureKey, 'general');
    const taskType = this.normalizeKey(input.taskType, 'general');
    const defaultLane = input.defaultLane ?? 'cheap-model';
    const maxLane = input.maxLane ?? 'balanced-model';

    if (this.laneRank(maxLane) < this.laneRank(defaultLane)) {
      throw new BadRequestException(
        'AI routing policy max lane cannot be lower than default lane.',
      );
    }

    const preferredCredentialMode = this.resolveCredentialMode(
      input.preferredCredentialMode,
      input.allowByoKeys,
    );

    return {
      policyKey: `${scope.scopeKey}:feature:${featureKey}:task:${taskType}`,
      scope,
      featureKey,
      taskType,
      routing: {
        defaultLane,
        maxLane,
        deterministicFirst: input.deterministicFirst ?? true,
        cacheEnabled: input.cacheEnabled ?? true,
        preferredCredentialMode,
        allowByoKeys: Boolean(input.allowByoKeys),
        downgradeAtQuotaPressure: input.downgradeAtQuotaPressure ?? 'near-limit',
        requireApprovalAboveLane:
          input.requireApprovalAboveLane ??
          (this.laneRank(maxLane) >= this.laneRank('premium-model')
            ? 'balanced-model'
            : null),
      },
      source: this.normalizeKey(input.source, 'aifut-policy'),
    };
  }

  buildBudgetPolicyRecord(input: BuildBudgetPolicyInput) {
    const scope = this.resolveScope(input.tenantSlug, input.workspaceSlug);
    const featureKey = this.normalizeKey(input.featureKey, 'general');
    const monthlyTokenBudget = this.normalizeNonNegativeInteger(
      input.monthlyTokenBudget,
    );
    const hardMonthlyTokenLimit = this.normalizeNonNegativeInteger(
      input.hardMonthlyTokenLimit,
    );
    const premiumExecutionCap = this.normalizeNonNegativeInteger(
      input.premiumExecutionCap,
    );
    const requireApprovalAtProjectedCost = this.normalizeNonNegativeNumber(
      input.requireApprovalAtProjectedCost,
    );

    if (
      hardMonthlyTokenLimit > 0 &&
      hardMonthlyTokenLimit < monthlyTokenBudget
    ) {
      throw new BadRequestException(
        'AI hard monthly token limit cannot be lower than monthly token budget.',
      );
    }

    return {
      policyKey: `${scope.scopeKey}:feature:${featureKey}:budget`,
      scope,
      featureKey,
      budget: {
        monthlyTokenBudget,
        hardMonthlyTokenLimit,
        premiumExecutionCap,
        blockOnHardLimit: input.blockOnHardLimit ?? true,
        requireApprovalAtProjectedCost,
      },
      source: this.normalizeKey(input.source, 'aifut-budget'),
    };
  }

  buildUsageEventRecord(input: BuildUsageEventInput) {
    const scope = this.resolveScope(input.tenantSlug, input.workspaceSlug);
    const occurredAt = input.occurredAt ?? new Date();
    const actorKey = this.normalizeKey(input.actorKey, 'system');
    const featureKey = this.normalizeKey(input.featureKey, 'general');
    const taskType = this.normalizeKey(input.taskType, 'general');
    const providerKey = this.normalizeKey(input.providerKey, 'unknown-provider');
    const modelKey = this.normalizeKey(input.modelKey, 'unknown-model');
    const inputTokens = this.normalizeNonNegativeInteger(input.inputTokens);
    const outputTokens = this.normalizeNonNegativeInteger(input.outputTokens);
    const totalTokens = inputTokens + outputTokens;

    return {
      eventKey: this.buildEventKey({
        scopeKey: scope.scopeKey,
        featureKey,
        taskType,
        actorKey,
        occurredAt,
      }),
      scope,
      actorKey,
      featureKey,
      taskType,
      providerKey,
      modelKey,
      credentialMode: input.credentialMode ?? 'aifut-managed',
      executionLane: input.executionLane ?? 'cheap-model',
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
        estimatedCost: this.normalizeNonNegativeNumber(input.estimatedCost),
        actualCost: this.normalizeNonNegativeNumber(input.actualCost),
        cacheHit: Boolean(input.cacheHit),
        retryCount: this.normalizeNonNegativeInteger(input.retryCount),
        escalationCount: this.normalizeNonNegativeInteger(input.escalationCount),
      },
      status: input.status ?? 'success',
      source: this.normalizeKey(input.source, 'ai-gateway'),
      occurredAt,
    };
  }

  async persistRoutingPolicyRecord(input: BuildRoutingPolicyInput) {
    const record = this.buildRoutingPolicyRecord(input);
    const prisma = this.requirePrisma();

    return prisma.aiRoutingPolicy.upsert({
      where: { policyKey: record.policyKey },
      update: {
        scopeType: record.scope.scopeType,
        tenantSlug: record.scope.tenantSlug,
        workspaceSlug: record.scope.workspaceSlug,
        featureKey: record.featureKey,
        taskType: record.taskType,
        defaultLane: record.routing.defaultLane,
        maxLane: record.routing.maxLane,
        preferredCredentialMode: record.routing.preferredCredentialMode,
        allowByoKeys: record.routing.allowByoKeys,
        requireApprovalAboveLane: record.routing.requireApprovalAboveLane,
        downgradeAtQuotaPressure: record.routing.downgradeAtQuotaPressure,
        cacheEnabled: record.routing.cacheEnabled,
        deterministicFirst: record.routing.deterministicFirst,
        source: record.source,
      },
      create: {
        policyKey: record.policyKey,
        scopeType: record.scope.scopeType,
        tenantSlug: record.scope.tenantSlug,
        workspaceSlug: record.scope.workspaceSlug,
        featureKey: record.featureKey,
        taskType: record.taskType,
        defaultLane: record.routing.defaultLane,
        maxLane: record.routing.maxLane,
        preferredCredentialMode: record.routing.preferredCredentialMode,
        allowByoKeys: record.routing.allowByoKeys,
        requireApprovalAboveLane: record.routing.requireApprovalAboveLane,
        downgradeAtQuotaPressure: record.routing.downgradeAtQuotaPressure,
        cacheEnabled: record.routing.cacheEnabled,
        deterministicFirst: record.routing.deterministicFirst,
        source: record.source,
      },
    });
  }

  async persistBudgetPolicyRecord(input: BuildBudgetPolicyInput) {
    const record = this.buildBudgetPolicyRecord(input);
    const prisma = this.requirePrisma();

    return prisma.aiBudgetPolicy.upsert({
      where: { policyKey: record.policyKey },
      update: {
        scopeType: record.scope.scopeType,
        tenantSlug: record.scope.tenantSlug,
        workspaceSlug: record.scope.workspaceSlug,
        featureKey: record.featureKey,
        monthlyTokenBudget: record.budget.monthlyTokenBudget,
        hardMonthlyTokenLimit: record.budget.hardMonthlyTokenLimit,
        premiumExecutionCap: record.budget.premiumExecutionCap,
        blockOnHardLimit: record.budget.blockOnHardLimit,
        requireApprovalAtProjectedCost:
          record.budget.requireApprovalAtProjectedCost,
        source: record.source,
      },
      create: {
        policyKey: record.policyKey,
        scopeType: record.scope.scopeType,
        tenantSlug: record.scope.tenantSlug,
        workspaceSlug: record.scope.workspaceSlug,
        featureKey: record.featureKey,
        monthlyTokenBudget: record.budget.monthlyTokenBudget,
        hardMonthlyTokenLimit: record.budget.hardMonthlyTokenLimit,
        premiumExecutionCap: record.budget.premiumExecutionCap,
        blockOnHardLimit: record.budget.blockOnHardLimit,
        requireApprovalAtProjectedCost:
          record.budget.requireApprovalAtProjectedCost,
        source: record.source,
      },
    });
  }

  async persistUsageEventRecord(input: BuildUsageEventInput) {
    const record = this.buildUsageEventRecord(input);
    const prisma = this.requirePrisma();

    return prisma.aiUsageEvent.create({
      data: {
        eventKey: record.eventKey,
        scopeType: record.scope.scopeType,
        tenantSlug: record.scope.tenantSlug,
        workspaceSlug: record.scope.workspaceSlug,
        actorKey: record.actorKey,
        featureKey: record.featureKey,
        taskType: record.taskType,
        providerKey: record.providerKey,
        modelKey: record.modelKey,
        credentialMode: record.credentialMode,
        executionLane: record.executionLane,
        inputTokens: record.usage.inputTokens,
        outputTokens: record.usage.outputTokens,
        totalTokens: record.usage.totalTokens,
        estimatedCost: record.usage.estimatedCost,
        actualCost: record.usage.actualCost,
        cacheHit: record.usage.cacheHit,
        retryCount: record.usage.retryCount,
        escalationCount: record.usage.escalationCount,
        status: record.status,
        source: record.source,
        occurredAt: record.occurredAt,
      },
    });
  }

  private resolveScope(tenantSlug?: string, workspaceSlug?: string | null) {
    const normalizedTenantSlug = this.normalizeRequiredSlug(tenantSlug, 'tenant slug');
    const normalizedWorkspaceSlug = workspaceSlug?.trim().toLowerCase() || null;

    return normalizedWorkspaceSlug
      ? {
          scopeKey: `${normalizedTenantSlug}:workspace:${normalizedWorkspaceSlug}`,
          scopeType: 'workspace' as AiPolicyScopeType,
          tenantSlug: normalizedTenantSlug,
          workspaceSlug: normalizedWorkspaceSlug,
        }
      : {
          scopeKey: `${normalizedTenantSlug}:tenant:default`,
          scopeType: 'tenant' as AiPolicyScopeType,
          tenantSlug: normalizedTenantSlug,
          workspaceSlug: null,
        };
  }

  private resolveCredentialMode(
    preferred: AiCredentialMode | undefined,
    allowByoKeys?: boolean,
  ) {
    if (preferred === 'byo' && !allowByoKeys) {
      throw new BadRequestException(
        'AI routing policy cannot prefer BYO credentials when BYO is disabled.',
      );
    }

    return preferred ?? 'aifut-managed';
  }

  private laneRank(lane: AiExecutionLane) {
    switch (lane) {
      case 'deterministic':
      case 'artifact-cache':
        return 0;
      case 'cheap-model':
      case 'background-batch':
        return 1;
      case 'balanced-model':
        return 2;
      case 'premium-model':
        return 3;
      default:
        return 0;
    }
  }

  private buildEventKey(input: {
    scopeKey: string;
    featureKey: string;
    taskType: string;
    actorKey: string;
    occurredAt: Date;
  }) {
    return [
      'ai-usage',
      input.scopeKey,
      input.featureKey,
      input.taskType,
      input.actorKey,
      input.occurredAt.toISOString(),
    ].join(':');
  }

  private requirePrisma(): AiGovernancePrismaClient {
    if (!this.prisma) {
      throw new BadRequestException(
        'AI governance persistence requires PrismaService.',
      );
    }

    return this.prisma as unknown as AiGovernancePrismaClient;
  }

  private normalizeRequiredSlug(value: string | undefined, label: string) {
    const normalized = value?.trim().toLowerCase();

    if (!normalized) {
      throw new BadRequestException(`Missing ${label}.`);
    }

    return normalized;
  }

  private normalizeKey(value: string | undefined | null, fallback: string) {
    return value?.trim().toLowerCase() || fallback;
  }

  private normalizeNonNegativeInteger(value?: number) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? Math.floor(value)
      : 0;
  }

  private normalizeNonNegativeNumber(value?: number) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? value
      : 0;
  }
}
