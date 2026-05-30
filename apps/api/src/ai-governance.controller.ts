import { Body, Controller, Get, Headers, Post, Query, UseGuards } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { AccessPolicyGuard } from './access-policy.guard';
import { RequireAccessPolicy } from './access-policy.decorator';
import { AiGovernancePersistenceService } from './ai-governance-persistence.service';

type AiCredentialMode = 'aifut-managed' | 'byo';
type AiQuotaPressure = 'normal' | 'near-limit' | 'hard-limit';
type AiExecutionLane =
  | 'deterministic'
  | 'artifact-cache'
  | 'cheap-model'
  | 'balanced-model'
  | 'premium-model'
  | 'background-batch';

type GatewayDecisionBody = {
  tenantSlug?: string;
  workspaceSlug?: string | null;
  featureKey?: string;
  taskType?: string;
  requestedLane?: AiExecutionLane;
  preferredCredentialMode?: AiCredentialMode;
  projectedTokens?: number;
  projectedCost?: number;
  deterministicEligible?: boolean;
  cacheHitAvailable?: boolean;
  occurredAt?: string | Date;
};

type RoutingPolicyBody = {
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

type BudgetPolicyBody = {
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

type GatewayUsageBody = {
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
  occurredAt?: string | Date;
  gatewayDecision?: {
    featureKey?: string;
    taskType?: string;
    selectedLane?: AiExecutionLane | null;
    credentialMode?: AiCredentialMode;
    quotaPressure?: AiQuotaPressure;
  };
};

@Controller('ai-governance')
export class AiGovernanceController {
  constructor(
    private readonly governancePersistence: AiGovernancePersistenceService,
  ) {}

  @Post('routing-policies')
  @UseGuards(AccessPolicyGuard)
  @RequireAccessPolicy({
    minimumRole: MembershipRole.ADMIN,
    scope: 'tenant-admin',
  })
  async upsertRoutingPolicy(
    @Body() body: RoutingPolicyBody,
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
  ) {
    const policy =
      await this.governancePersistence.persistRoutingPolicyRecord({
        ...body,
        tenantSlug: tenantSlugHeader ?? body.tenantSlug,
        workspaceSlug: workspaceSlugHeader ?? body.workspaceSlug,
      });

    return {
      capability: 'ai-governance',
      status: 'routing-policy-upserted',
      policy,
    };
  }

  @Post('budget-policies')
  @UseGuards(AccessPolicyGuard)
  @RequireAccessPolicy({
    minimumRole: MembershipRole.ADMIN,
    scope: 'tenant-admin',
  })
  async upsertBudgetPolicy(
    @Body() body: BudgetPolicyBody,
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
  ) {
    const policy = await this.governancePersistence.persistBudgetPolicyRecord({
      ...body,
      tenantSlug: tenantSlugHeader ?? body.tenantSlug,
      workspaceSlug: workspaceSlugHeader ?? body.workspaceSlug,
    });

    return {
      capability: 'ai-governance',
      status: 'budget-policy-upserted',
      policy,
    };
  }

  @Post('gateway-decision')
  @UseGuards(AccessPolicyGuard)
  @RequireAccessPolicy({
    minimumRole: MembershipRole.OPERATOR,
    scope: 'operator-control',
  })
  async gatewayDecision(
    @Body() body: GatewayDecisionBody,
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
  ) {
    const decision = await this.governancePersistence.buildGatewayDecision({
      ...body,
      tenantSlug: tenantSlugHeader ?? body.tenantSlug,
      workspaceSlug: workspaceSlugHeader ?? body.workspaceSlug,
      occurredAt: this.optionalDate(body.occurredAt),
    });

    return {
      capability: 'ai-governance',
      status: decision.blockReason ? 'blocked' : 'decision-ready',
      decision,
    };
  }

  @Post('usage-events')
  @UseGuards(AccessPolicyGuard)
  @RequireAccessPolicy({
    minimumRole: MembershipRole.OPERATOR,
    scope: 'operator-control',
  })
  async recordUsageEvent(
    @Body() body: GatewayUsageBody,
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
  ) {
    const { gatewayDecision, ...eventBody } = body;
    const event = await this.governancePersistence.persistUsageEventRecord({
      ...eventBody,
      tenantSlug: tenantSlugHeader ?? body.tenantSlug,
      workspaceSlug: workspaceSlugHeader ?? body.workspaceSlug,
      actorKey: body.actorKey ?? userEmailHeader,
      featureKey: body.featureKey ?? gatewayDecision?.featureKey,
      taskType: body.taskType ?? gatewayDecision?.taskType,
      credentialMode: body.credentialMode ?? gatewayDecision?.credentialMode,
      executionLane:
        body.executionLane ?? gatewayDecision?.selectedLane ?? undefined,
      source: body.source ?? 'ai-gateway-execution',
      occurredAt: this.optionalDate(body.occurredAt),
    });

    return {
      capability: 'ai-governance',
      status: 'usage-event-recorded',
      event,
    };
  }

  @Get('usage-summary')
  @UseGuards(AccessPolicyGuard)
  @RequireAccessPolicy({
    minimumRole: MembershipRole.OPERATOR,
    scope: 'operator-control',
  })
  async usageSummary(
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('featureKey') featureKeyQuery?: string,
    @Query('taskType') taskTypeQuery?: string,
    @Query('occurredFrom') occurredFromQuery?: string,
    @Query('occurredTo') occurredToQuery?: string,
    @Query('take') takeQuery?: string,
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
  ) {
    const summary = await this.governancePersistence.summarizeUsageLedger({
      tenantSlug: tenantSlugHeader ?? tenantSlugQuery,
      workspaceSlug: workspaceSlugHeader ?? workspaceSlugQuery,
      featureKey: featureKeyQuery,
      taskType: taskTypeQuery,
      occurredFrom: this.optionalDate(occurredFromQuery),
      occurredTo: this.optionalDate(occurredToQuery),
      take: this.optionalPositiveInteger(takeQuery),
    });

    return {
      capability: 'ai-governance',
      status: 'usage-summary-fetched',
      summary,
    };
  }

  private optionalDate(value?: string | Date) {
    return value ? new Date(value) : undefined;
  }

  private optionalPositiveInteger(value?: string) {
    if (!value) {
      return undefined;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
}
