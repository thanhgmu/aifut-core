import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
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

  private optionalDate(value?: string | Date) {
    return value ? new Date(value) : undefined;
  }
}
