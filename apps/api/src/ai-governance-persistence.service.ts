import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from './prisma.service';

type AiCredentialMode = 'aifut-managed' | 'byo';
type AiPolicyScopeType = 'tenant' | 'workspace';
type AiQuotaPressure = 'normal' | 'near-limit' | 'hard-limit';
type AiGatewayDecisionOutcome =
  | 'allowed'
  | 'downgraded'
  | 'approval-required'
  | 'blocked';
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

type ResolveAiPolicyInput = {
  tenantSlug?: string;
  workspaceSlug?: string | null;
  featureKey?: string;
  taskType?: string;
};

type BuildGatewayDecisionInput = ResolveAiPolicyInput & {
  requestedLane?: AiExecutionLane;
  preferredCredentialMode?: AiCredentialMode;
  projectedTokens?: number;
  projectedCost?: number;
  deterministicEligible?: boolean;
  cacheHitAvailable?: boolean;
  occurredAt?: Date;
};

type UsageLedgerSummaryInput = ResolveAiPolicyInput & {
  occurredFrom?: Date;
  occurredTo?: Date;
  take?: number;
};

type AiGovernancePrismaClient = {
  aiRoutingPolicy: {
    upsert(input: unknown): Promise<unknown>;
    findFirst(input: unknown): Promise<Record<string, unknown> | null>;
  };
  aiBudgetPolicy: {
    upsert(input: unknown): Promise<unknown>;
    findFirst(input: unknown): Promise<Record<string, unknown> | null>;
  };
  aiUsageEvent: {
    create(input: unknown): Promise<unknown>;
    findMany(input: unknown): Promise<Array<Record<string, unknown>>>;
    aggregate(input: unknown): Promise<{
      _sum?: {
        totalTokens?: number | null;
        actualCost?: number | null;
        estimatedCost?: number | null;
      };
    }>;
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

  async summarizeUsageLedger(input: UsageLedgerSummaryInput) {
    const scope = this.resolveScope(input.tenantSlug, input.workspaceSlug);
    const featureKey = this.normalizeKey(input.featureKey, 'general');
    const taskType = this.normalizeKey(input.taskType, 'general');
    const prisma = this.requirePrisma();
    const occurredAt =
      input.occurredFrom || input.occurredTo
        ? {
            ...(input.occurredFrom ? { gte: input.occurredFrom } : {}),
            ...(input.occurredTo ? { lte: input.occurredTo } : {}),
          }
        : undefined;
    const where = {
      tenantSlug: scope.tenantSlug,
      ...(scope.workspaceSlug ? { workspaceSlug: scope.workspaceSlug } : {}),
      featureKey,
      taskType,
      ...(occurredAt ? { occurredAt } : {}),
    };
    const take = this.normalizeTake(input.take);
    const [usage, events] = await Promise.all([
      prisma.aiUsageEvent.aggregate({
        where,
        _sum: {
          totalTokens: true,
          actualCost: true,
          estimatedCost: true,
        },
      }),
      prisma.aiUsageEvent.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        take,
      }),
    ]);
    const actualCost = this.normalizeNonNegativeNumber(
      this.numberValue(usage._sum?.actualCost),
    );
    const estimatedCost = this.normalizeNonNegativeNumber(
      this.numberValue(usage._sum?.estimatedCost),
    );

    return {
      scope,
      featureKey,
      taskType,
      totals: {
        totalTokens: this.normalizeNonNegativeInteger(
          this.numberValue(usage._sum?.totalTokens),
        ),
        actualCost,
        estimatedCost,
        effectiveCost: actualCost || estimatedCost,
      },
      filters: {
        occurredFrom: input.occurredFrom ?? null,
        occurredTo: input.occurredTo ?? null,
        take,
      },
      recentEvents: events.map((event) => ({
        eventKey: String(event.eventKey ?? ''),
        actorKey: String(event.actorKey ?? 'system'),
        providerKey: String(event.providerKey ?? 'unknown-provider'),
        modelKey: String(event.modelKey ?? 'unknown-model'),
        credentialMode:
          this.normalizeCredentialMode(event.credentialMode) ?? 'aifut-managed',
        executionLane: this.normalizeLane(event.executionLane, 'cheap-model'),
        totalTokens: this.normalizeNonNegativeInteger(
          this.numberValue(event.totalTokens),
        ),
        actualCost: this.normalizeNonNegativeNumber(
          this.numberValue(event.actualCost),
        ),
        estimatedCost: this.normalizeNonNegativeNumber(
          this.numberValue(event.estimatedCost),
        ),
        status:
          event.status === 'failure' || event.status === 'cancelled'
            ? event.status
            : 'success',
        source: String(event.source ?? 'ai-gateway'),
        occurredAt: event.occurredAt ?? null,
      })),
    };
  }

  async resolveEffectiveRoutingPolicy(input: ResolveAiPolicyInput) {
    const scope = this.resolveScope(input.tenantSlug, input.workspaceSlug);
    const featureKey = this.normalizeKey(input.featureKey, 'general');
    const taskType = this.normalizeKey(input.taskType, 'general');
    const prisma = this.requirePrisma();
    const persisted = await this.findScopedPolicy({
      delegate: prisma.aiRoutingPolicy,
      tenantSlug: scope.tenantSlug,
      workspaceSlug: scope.workspaceSlug,
      featureKey,
      taskType,
    });

    return persisted
      ? this.normalizePersistedRoutingPolicy(persisted)
      : this.buildRoutingPolicyRecord({
          tenantSlug: scope.tenantSlug,
          workspaceSlug: scope.workspaceSlug,
          featureKey,
          taskType,
        });
  }

  async resolveBudgetPressure(input: ResolveAiPolicyInput & {
    projectedTokens?: number;
    projectedCost?: number;
    occurredAt?: Date;
  }) {
    const scope = this.resolveScope(input.tenantSlug, input.workspaceSlug);
    const featureKey = this.normalizeKey(input.featureKey, 'general');
    const prisma = this.requirePrisma();
    const persistedBudgetPolicy = await this.findScopedPolicy({
      delegate: prisma.aiBudgetPolicy,
      tenantSlug: scope.tenantSlug,
      workspaceSlug: scope.workspaceSlug,
      featureKey,
    });
    const budgetPolicy = persistedBudgetPolicy
      ? this.normalizePersistedBudgetPolicy(persistedBudgetPolicy)
      : this.buildBudgetPolicyRecord({
          tenantSlug: scope.tenantSlug,
          workspaceSlug: scope.workspaceSlug,
          featureKey,
        });
    const periodStart = this.startOfMonth(input.occurredAt ?? new Date());
    const usage = await prisma.aiUsageEvent.aggregate({
      where: {
        tenantSlug: scope.tenantSlug,
        ...(scope.workspaceSlug ? { workspaceSlug: scope.workspaceSlug } : {}),
        featureKey,
        status: 'success',
        occurredAt: { gte: periodStart },
      },
      _sum: {
        totalTokens: true,
        actualCost: true,
        estimatedCost: true,
      },
    });
    const usedTokens = this.normalizeNonNegativeInteger(
      usage._sum?.totalTokens ?? 0,
    );
    const usedCost = this.normalizeNonNegativeNumber(
      usage._sum?.actualCost ?? usage._sum?.estimatedCost ?? 0,
    );
    const projectedTokens = this.normalizeNonNegativeInteger(
      input.projectedTokens,
    );
    const projectedCost = this.normalizeNonNegativeNumber(input.projectedCost);
    const projectedMonthlyTokens = usedTokens + projectedTokens;
    const projectedMonthlyCost = usedCost + projectedCost;
    const hardLimit = budgetPolicy.budget.hardMonthlyTokenLimit;
    const monthlyBudget = budgetPolicy.budget.monthlyTokenBudget;
    const pressure: AiQuotaPressure =
      hardLimit > 0 && projectedMonthlyTokens >= hardLimit
        ? 'hard-limit'
        : monthlyBudget > 0 && projectedMonthlyTokens >= monthlyBudget * 0.85
          ? 'near-limit'
          : 'normal';

    return {
      scope,
      featureKey,
      budgetPolicy,
      usageWindow: {
        periodStart,
        usedTokens,
        usedCost,
        projectedTokens,
        projectedCost,
        projectedMonthlyTokens,
        projectedMonthlyCost,
      },
      pressure,
      blockReason:
        pressure === 'hard-limit' && budgetPolicy.budget.blockOnHardLimit
          ? `Projected AI token usage reaches hard monthly limit of ${hardLimit}.`
          : null,
      approvalReason:
        budgetPolicy.budget.requireApprovalAtProjectedCost > 0 &&
        projectedCost >= budgetPolicy.budget.requireApprovalAtProjectedCost
          ? `Projected AI cost requires approval at ${budgetPolicy.budget.requireApprovalAtProjectedCost}.`
          : null,
    };
  }

  async buildGatewayDecision(input: BuildGatewayDecisionInput) {
    const routingPolicy = await this.resolveEffectiveRoutingPolicy(input);
    const budgetPressure = await this.resolveBudgetPressure(input);
    const requestedLane =
      input.requestedLane ??
      (input.deterministicEligible
        ? 'deterministic'
        : input.cacheHitAvailable
          ? 'artifact-cache'
          : routingPolicy.routing.defaultLane);
    const cappedLane =
      this.laneRank(requestedLane) > this.laneRank(routingPolicy.routing.maxLane)
        ? routingPolicy.routing.maxLane
        : requestedLane;
    const pressureLane =
      budgetPressure.pressure === routingPolicy.routing.downgradeAtQuotaPressure
        ? this.lowerLane(cappedLane)
        : cappedLane;
    const selectedLane = budgetPressure.blockReason
      ? null
      : input.deterministicEligible && routingPolicy.routing.deterministicFirst
        ? 'deterministic'
        : input.cacheHitAvailable && routingPolicy.routing.cacheEnabled
          ? 'artifact-cache'
          : pressureLane;
    const requestedCredentialMode =
      input.preferredCredentialMode ?? routingPolicy.routing.preferredCredentialMode;
    const credentialMode =
      requestedCredentialMode === 'byo' && !routingPolicy.routing.allowByoKeys
        ? 'aifut-managed'
        : requestedCredentialMode;
    const approvalLane = routingPolicy.routing.requireApprovalAboveLane;
    const approvalReason =
      selectedLane &&
      approvalLane &&
      this.laneRank(selectedLane) > this.laneRank(approvalLane)
        ? `Selected lane ${selectedLane} requires approval above ${approvalLane}.`
        : budgetPressure.approvalReason;
    const blockReason = budgetPressure.blockReason;
    const downgradeReason =
      selectedLane && selectedLane !== cappedLane
        ? `Quota pressure ${budgetPressure.pressure} downgraded lane from ${cappedLane} to ${selectedLane}.`
        : null;
    const outcomeStatus = this.resolveDecisionOutcome({
      blockReason,
      approvalReason,
      downgradeReason,
    });

    return {
      scope: routingPolicy.scope,
      featureKey: routingPolicy.featureKey,
      taskType: routingPolicy.taskType,
      requestedLane,
      selectedLane,
      credentialMode,
      quotaPressure: budgetPressure.pressure,
      requiresApproval: Boolean(approvalReason),
      approvalReason,
      blockReason,
      downgradeReason,
      outcome: {
        status: outcomeStatus,
        label: this.decisionOutcomeLabel(outcomeStatus),
        reasons: [blockReason, approvalReason, downgradeReason].filter(Boolean),
      },
      executionPolicy: {
        canDispatch: !blockReason,
        canAutoDispatch: !blockReason && !approvalReason,
        requiresHumanApproval: Boolean(approvalReason),
        shouldRecordUsageEvent: !blockReason,
      },
      policyKeys: {
        routingPolicyKey: routingPolicy.policyKey,
        budgetPolicyKey: budgetPressure.budgetPolicy.policyKey,
      },
      usageWindow: budgetPressure.usageWindow,
    };
  }

  private resolveDecisionOutcome(input: {
    blockReason: string | null;
    approvalReason: string | null;
    downgradeReason: string | null;
  }): AiGatewayDecisionOutcome {
    if (input.blockReason) {
      return 'blocked';
    }

    if (input.approvalReason) {
      return 'approval-required';
    }

    if (input.downgradeReason) {
      return 'downgraded';
    }

    return 'allowed';
  }

  private decisionOutcomeLabel(outcome: AiGatewayDecisionOutcome) {
    switch (outcome) {
      case 'blocked':
        return 'Blocked before dispatch';
      case 'approval-required':
        return 'Approval required before automatic dispatch';
      case 'downgraded':
        return 'Allowed with lower-cost lane';
      case 'allowed':
      default:
        return 'Allowed for automatic dispatch';
    }
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

  private async findScopedPolicy(input: {
    delegate: {
      findFirst(input: unknown): Promise<Record<string, unknown> | null>;
    };
    tenantSlug: string;
    workspaceSlug: string | null;
    featureKey: string;
    taskType?: string;
  }) {
    const baseWhere = {
      tenantSlug: input.tenantSlug,
      featureKey: input.featureKey,
      ...(input.taskType ? { taskType: input.taskType } : {}),
    };

    if (input.workspaceSlug) {
      const workspacePolicy = await input.delegate.findFirst({
        where: {
          ...baseWhere,
          workspaceSlug: input.workspaceSlug,
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      });

      if (workspacePolicy) {
        return workspacePolicy;
      }
    }

    return input.delegate.findFirst({
      where: {
        ...baseWhere,
        workspaceSlug: null,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private normalizePersistedRoutingPolicy(record: Record<string, unknown>) {
    return this.buildRoutingPolicyRecord({
      tenantSlug: String(record.tenantSlug ?? ''),
      workspaceSlug:
        typeof record.workspaceSlug === 'string' ? record.workspaceSlug : null,
      featureKey: String(record.featureKey ?? 'general'),
      taskType: String(record.taskType ?? 'general'),
      defaultLane: this.normalizeLane(record.defaultLane, 'cheap-model'),
      maxLane: this.normalizeLane(record.maxLane, 'balanced-model'),
      preferredCredentialMode: this.normalizeCredentialMode(
        record.preferredCredentialMode,
      ),
      allowByoKeys: Boolean(record.allowByoKeys),
      requireApprovalAboveLane:
        typeof record.requireApprovalAboveLane === 'string'
          ? this.normalizeLane(record.requireApprovalAboveLane, 'balanced-model')
          : undefined,
      downgradeAtQuotaPressure: this.normalizeQuotaPressure(
        record.downgradeAtQuotaPressure,
      ),
      cacheEnabled:
        typeof record.cacheEnabled === 'boolean' ? record.cacheEnabled : true,
      deterministicFirst:
        typeof record.deterministicFirst === 'boolean'
          ? record.deterministicFirst
          : true,
      source: String(record.source ?? 'aifut-policy'),
    });
  }

  private normalizePersistedBudgetPolicy(record: Record<string, unknown>) {
    return this.buildBudgetPolicyRecord({
      tenantSlug: String(record.tenantSlug ?? ''),
      workspaceSlug:
        typeof record.workspaceSlug === 'string' ? record.workspaceSlug : null,
      featureKey: String(record.featureKey ?? 'general'),
      monthlyTokenBudget: this.numberValue(record.monthlyTokenBudget),
      hardMonthlyTokenLimit: this.numberValue(record.hardMonthlyTokenLimit),
      premiumExecutionCap: this.numberValue(record.premiumExecutionCap),
      blockOnHardLimit:
        typeof record.blockOnHardLimit === 'boolean'
          ? record.blockOnHardLimit
          : true,
      requireApprovalAtProjectedCost: this.numberValue(
        record.requireApprovalAtProjectedCost,
      ),
      source: String(record.source ?? 'aifut-budget'),
    });
  }

  private normalizeLane(value: unknown, fallback: AiExecutionLane): AiExecutionLane {
    return value === 'deterministic' ||
      value === 'artifact-cache' ||
      value === 'cheap-model' ||
      value === 'balanced-model' ||
      value === 'premium-model' ||
      value === 'background-batch'
      ? value
      : fallback;
  }

  private normalizeCredentialMode(value: unknown): AiCredentialMode | undefined {
    return value === 'aifut-managed' || value === 'byo' ? value : undefined;
  }

  private normalizeQuotaPressure(value: unknown): AiQuotaPressure | undefined {
    return value === 'normal' || value === 'near-limit' || value === 'hard-limit'
      ? value
      : undefined;
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

  private lowerLane(lane: AiExecutionLane): AiExecutionLane {
    switch (lane) {
      case 'premium-model':
        return 'balanced-model';
      case 'balanced-model':
        return 'cheap-model';
      default:
        return lane;
    }
  }

  private startOfMonth(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }

  private numberValue(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
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

  private normalizeTake(value?: number) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? Math.min(Math.floor(value), 50)
      : 10;
  }
}
