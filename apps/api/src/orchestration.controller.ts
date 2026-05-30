import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { AccessPolicyGuard } from './access-policy.guard';
import { RequireAccessPolicy } from './access-policy.decorator';
import { ActorContextService } from './actor-context.service';
import { AiGovernancePersistenceService } from './ai-governance-persistence.service';
import { AiTokenGovernanceService } from './ai-token-governance.service';
import { AuditEventsService } from './audit-events.service';
import { ORCHESTRATION_FOUNDATION_ROADMAP } from './orchestration.constants';
import {
  OrchestrationApprovalContractInput,
  OrchestrationChildWorkflowContractInput,
  OrchestrationEscalationContractInput,
  OrchestrationRollbackContractInput,
  OrchestrationRuntimeBindingInput,
} from './orchestration-runtime.models';
import { OrchestrationService } from './orchestration.service';
import { resolveAuthUserId } from './orchestration-auth-context.util';

@Controller('orchestration')
export class OrchestrationController {
  constructor(
    private readonly actorContext: ActorContextService,
    private readonly orchestration: OrchestrationService,
    private readonly aiTokenGovernance: AiTokenGovernanceService,
    private readonly aiGovernancePersistence: AiGovernancePersistenceService,
    private readonly auditEvents: AuditEventsService,
  ) {}

  private resolveActorContext(input: {
    authorizationHeader?: string;
    tenantSlug?: string;
    userEmail?: string;
    workspaceSlug?: string;
    hostname?: string;
  }) {
    const authUserId = resolveAuthUserId(input.authorizationHeader);

    return this.actorContext.resolve({
      tenantSlug: input.tenantSlug,
      userEmail: input.userEmail,
      workspaceSlug: input.workspaceSlug,
      hostname: input.hostname,
      ...(authUserId ? { authUserId } : {}),
    });
  }

  @Get('capabilities')
  capabilities() {
    return {
      capability: 'orchestration',
      status: 'foundation',
      channels: ['in-app-chat', 'telegram', 'whatsapp', 'discord'],
      planning: {
        roadmapIngestion: true,
        parentWorkflowDrafts: true,
        appCoordinationDrafts: true,
        dataflowDrafts: true,
      },
      next: ORCHESTRATION_FOUNDATION_ROADMAP,
    };
  }

  @Post('roadmaps/ingest')
  async ingestRoadmap(
    @Body()
    body: {
      tenantSlug?: string;
      userEmail?: string;
      workspaceSlug?: string;
      sourceKind?: string;
      title?: string;
      content?: string;
      sourceRefs?: string[];
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('hostname') hostnameQuery?: string,
    @Headers('authorization') authorizationHeader?: string,
  ) {
    const context = await this.resolveActorContext({
      tenantSlug:
        tenantSlugHeader ?? tenantSlugQuery ?? body.tenantSlug,
      userEmail: userEmailHeader ?? userEmailQuery ?? body.userEmail,
      workspaceSlug:
        workspaceSlugHeader ?? workspaceSlugQuery ?? body.workspaceSlug,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
      authorizationHeader,
    });

    return {
      capability: 'orchestration',
      status: 'roadmap-ingested',
      context: {
        tenant: context.tenant,
        activeWorkspace: context.activeWorkspace,
        activeMembership: context.activeMembership,
      },
      roadmapDraft: this.orchestration.buildRoadmapDraft({
        tenantSlug: context.tenant.slug,
        workspaceSlug: context.activeWorkspace?.slug,
        sourceKind: body.sourceKind,
        title: body.title,
        content: body.content,
        sourceRefs: body.sourceRefs,
      }),
      next: [
        'roadmap-interpretation',
        'parent-workflow-draft',
        'optimization-summary',
      ],
    };
  }

  @Post('plans/draft')
  async draftPlan(
    @Body()
    body: {
      tenantSlug?: string;
      userEmail?: string;
      workspaceSlug?: string;
      roadmapDraftId?: string;
      objective?: string;
      constraints?: string[];
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('hostname') hostnameQuery?: string,
    @Headers('authorization') authorizationHeader?: string,
  ) {
    const context = await this.resolveActorContext({
      tenantSlug:
        tenantSlugHeader ?? tenantSlugQuery ?? body.tenantSlug,
      userEmail: userEmailHeader ?? userEmailQuery ?? body.userEmail,
      workspaceSlug:
        workspaceSlugHeader ?? workspaceSlugQuery ?? body.workspaceSlug,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
      authorizationHeader,
    });

    return {
      capability: 'orchestration',
      status: 'plan-drafted',
      context: {
        tenant: context.tenant,
        activeWorkspace: context.activeWorkspace,
        activeMembership: context.activeMembership,
      },
      parentWorkflowPlan: this.orchestration.buildParentWorkflowPlan({
        tenantSlug: context.tenant.slug,
        workspaceSlug: context.activeWorkspace?.slug,
        roadmapDraftId: body.roadmapDraftId,
        objective: body.objective,
        constraints: body.constraints,
      }),
      next: [
        'app-coordination-draft',
        'dataflow-modeling',
        'workflow-graph-projection',
      ],
    };
  }

  @Post('roadmaps/:draftId/interpret')
  async interpretRoadmap(
    @Param('draftId') draftId: string,
    @Body()
    body: {
      tenantSlug?: string;
      userEmail?: string;
      workspaceSlug?: string;
      objective?: string;
      hints?: string[];
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('hostname') hostnameQuery?: string,
    @Headers('authorization') authorizationHeader?: string,
  ) {
    const context = await this.resolveActorContext({
      tenantSlug:
        tenantSlugHeader ?? tenantSlugQuery ?? body.tenantSlug,
      userEmail: userEmailHeader ?? userEmailQuery ?? body.userEmail,
      workspaceSlug:
        workspaceSlugHeader ?? workspaceSlugQuery ?? body.workspaceSlug,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
      authorizationHeader,
    });

    return {
      capability: 'orchestration',
      status: 'roadmap-interpreted',
      context: {
        tenant: context.tenant,
        activeWorkspace: context.activeWorkspace,
        activeMembership: context.activeMembership,
      },
      interpretation: this.orchestration.buildRoadmapInterpretation({
        tenantSlug: context.tenant.slug,
        workspaceSlug: context.activeWorkspace?.slug,
        roadmapDraftId: draftId,
        objective: body.objective,
        hints: body.hints,
      }),
      next: [
        'parent-workflow-draft',
        'app-coordination-draft',
        'dataflow-modeling',
      ],
    };
  }

  @Post('plans/:planId/app-coordination')
  async draftAppCoordination(
    @Param('planId') planId: string,
    @Body()
    body: {
      tenantSlug?: string;
      userEmail?: string;
      workspaceSlug?: string;
      objective?: string;
      preferredSystems?: string[];
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('hostname') hostnameQuery?: string,
    @Headers('authorization') authorizationHeader?: string,
  ) {
    const context = await this.resolveActorContext({
      tenantSlug:
        tenantSlugHeader ?? tenantSlugQuery ?? body.tenantSlug,
      userEmail: userEmailHeader ?? userEmailQuery ?? body.userEmail,
      workspaceSlug:
        workspaceSlugHeader ?? workspaceSlugQuery ?? body.workspaceSlug,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
      authorizationHeader,
    });

    return {
      capability: 'orchestration',
      status: 'app-coordination-drafted',
      context: {
        tenant: context.tenant,
        activeWorkspace: context.activeWorkspace,
        activeMembership: context.activeMembership,
      },
      appCoordination: this.orchestration.buildAppCoordinationDraft({
        tenantSlug: context.tenant.slug,
        workspaceSlug: context.activeWorkspace?.slug,
        planId,
        objective: body.objective,
        preferredSystems: body.preferredSystems,
      }),
      next: ['dataflow-modeling', 'workflow-graph-projection', 'optimization-summary'],
    };
  }

  @Post('plans/:planId/dataflow')
  async draftDataflow(
    @Param('planId') planId: string,
    @Body()
    body: {
      tenantSlug?: string;
      userEmail?: string;
      workspaceSlug?: string;
      objective?: string;
      businessObjects?: string[];
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('hostname') hostnameQuery?: string,
    @Headers('authorization') authorizationHeader?: string,
  ) {
    const context = await this.resolveActorContext({
      tenantSlug:
        tenantSlugHeader ?? tenantSlugQuery ?? body.tenantSlug,
      userEmail: userEmailHeader ?? userEmailQuery ?? body.userEmail,
      workspaceSlug:
        workspaceSlugHeader ?? workspaceSlugQuery ?? body.workspaceSlug,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
      authorizationHeader,
    });

    return {
      capability: 'orchestration',
      status: 'dataflow-drafted',
      context: {
        tenant: context.tenant,
        activeWorkspace: context.activeWorkspace,
        activeMembership: context.activeMembership,
      },
      dataflow: this.orchestration.buildDataflowModelDraft({
        tenantSlug: context.tenant.slug,
        workspaceSlug: context.activeWorkspace?.slug,
        planId,
        objective: body.objective,
        businessObjects: body.businessObjects,
      }),
      next: ['workflow-graph-projection', 'optimization-summary', 'execution-contracts'],
    };
  }

  @Post('plans/:planId/optimize')
  async draftOptimizationSummary(
    @Param('planId') planId: string,
    @Body()
    body: {
      tenantSlug?: string;
      userEmail?: string;
      workspaceSlug?: string;
      objective?: string;
      priorities?: string[];
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('hostname') hostnameQuery?: string,
    @Headers('authorization') authorizationHeader?: string,
  ) {
    const context = await this.resolveActorContext({
      tenantSlug:
        tenantSlugHeader ?? tenantSlugQuery ?? body.tenantSlug,
      userEmail: userEmailHeader ?? userEmailQuery ?? body.userEmail,
      workspaceSlug:
        workspaceSlugHeader ?? workspaceSlugQuery ?? body.workspaceSlug,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
      authorizationHeader,
    });

    return {
      capability: 'orchestration',
      status: 'optimization-drafted',
      context: {
        tenant: context.tenant,
        activeWorkspace: context.activeWorkspace,
        activeMembership: context.activeMembership,
      },
      optimizationSummary: this.orchestration.buildOptimizationSummaryDraft({
        tenantSlug: context.tenant.slug,
        workspaceSlug: context.activeWorkspace?.slug,
        planId,
        objective: body.objective,
        priorities: body.priorities,
      }),
      next: ['workflow-graph-projection', 'execution-contracts', 'variant-scoring'],
    };
  }

  @Post('plans/:planId/graph')
  async draftWorkflowGraph(
    @Param('planId') planId: string,
    @Body()
    body: {
      tenantSlug?: string;
      userEmail?: string;
      workspaceSlug?: string;
      objective?: string;
      lanes?: string[];
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('hostname') hostnameQuery?: string,
    @Headers('authorization') authorizationHeader?: string,
  ) {
    const context = await this.resolveActorContext({
      tenantSlug:
        tenantSlugHeader ?? tenantSlugQuery ?? body.tenantSlug,
      userEmail: userEmailHeader ?? userEmailQuery ?? body.userEmail,
      workspaceSlug:
        workspaceSlugHeader ?? workspaceSlugQuery ?? body.workspaceSlug,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
      authorizationHeader,
    });

    return {
      capability: 'orchestration',
      status: 'workflow-graph-drafted',
      context: {
        tenant: context.tenant,
        activeWorkspace: context.activeWorkspace,
        activeMembership: context.activeMembership,
      },
      workflowGraph: this.orchestration.buildWorkflowGraphDraft({
        tenantSlug: context.tenant.slug,
        workspaceSlug: context.activeWorkspace?.slug,
        planId,
        objective: body.objective,
        lanes: body.lanes,
      }),
      next: ['execution-contracts', 'variant-scoring', 'ui-graph-rendering'],
    };
  }

  @Post('plans/:planId/execution-contracts')
  async draftExecutionContracts(
    @Param('planId') planId: string,
    @Body()
    body: {
      tenantSlug?: string;
      userEmail?: string;
      workspaceSlug?: string;
      objective?: string;
      executionModes?: string[];
      runtimeBindings?: Array<{
        runtimeKey?: string;
        systemKey?: string;
        deliveryMode?: string;
        approvalRequired?: boolean;
      }>;
      childWorkflowContracts?: Array<{
        workflowKey?: string;
        runtimeKey?: string;
        systemKey?: string;
        triggerMode?: string;
        approvalRequired?: boolean;
        approvalCheckpointKey?: string;
      }>;
      approvalContracts?: Array<{
        checkpointKey?: string;
        approverRole?: string;
        channel?: string;
        escalationMode?: string;
        required?: boolean;
      }>;
      escalationContracts?: Array<{
        escalationKey?: string;
        fromCheckpointKey?: string;
        targetRole?: string;
        triggerMode?: string;
        delayMinutes?: number;
      }>;
      rollbackContracts?: Array<{
        rollbackKey?: string;
        fromCheckpointKey?: string;
        targetSystemKey?: string;
        strategy?: string;
        preserveArtifacts?: boolean;
      }>;
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('hostname') hostnameQuery?: string,
    @Headers('authorization') authorizationHeader?: string,
  ) {
    const context = await this.resolveActorContext({
      tenantSlug:
        tenantSlugHeader ?? tenantSlugQuery ?? body.tenantSlug,
      userEmail: userEmailHeader ?? userEmailQuery ?? body.userEmail,
      workspaceSlug:
        workspaceSlugHeader ?? workspaceSlugQuery ?? body.workspaceSlug,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
      authorizationHeader,
    });

    return {
      capability: 'orchestration',
      status: 'execution-contracts-drafted',
      context: {
        tenant: context.tenant,
        activeWorkspace: context.activeWorkspace,
        activeMembership: context.activeMembership,
      },
      executionContracts: this.orchestration.buildExecutionContractDraft({
        tenantSlug: context.tenant.slug,
        workspaceSlug: context.activeWorkspace?.slug,
        planId,
        objective: body.objective,
        executionModes: body.executionModes,
        runtimeBindings: body.runtimeBindings,
        childWorkflowContracts: body.childWorkflowContracts,
        approvalContracts: body.approvalContracts,
        escalationContracts: body.escalationContracts,
        rollbackContracts: body.rollbackContracts,
      }),
      next: ['variant-scoring', 'ui-graph-rendering', 'runtime-binding'],
    };
  }

  @Post('plans/:planId/execution-contracts/submit')
  async submitExecutionContracts(
    @Param('planId') planId: string,
    @Body()
    body: {
      tenantSlug?: string;
      userEmail?: string;
      workspaceSlug?: string;
      objective?: string;
      executionModes?: string[];
      runtimeBindings?: OrchestrationRuntimeBindingInput[];
      childWorkflowContracts?: OrchestrationChildWorkflowContractInput[];
      approvalContracts?: OrchestrationApprovalContractInput[];
      escalationContracts?: OrchestrationEscalationContractInput[];
      rollbackContracts?: OrchestrationRollbackContractInput[];
      submissionNotes?: string;
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('hostname') hostnameQuery?: string,
    @Headers('authorization') authorizationHeader?: string,
  ) {
    const context = await this.resolveActorContext({
      tenantSlug:
        tenantSlugHeader ?? tenantSlugQuery ?? body.tenantSlug,
      userEmail: userEmailHeader ?? userEmailQuery ?? body.userEmail,
      workspaceSlug:
        workspaceSlugHeader ?? workspaceSlugQuery ?? body.workspaceSlug,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
      authorizationHeader,
    });

    return {
      capability: 'orchestration',
      status: 'execution-contracts-submitted',
      context: {
        tenant: context.tenant,
        activeWorkspace: context.activeWorkspace,
        activeMembership: context.activeMembership,
      },
      executionContractSubmission: this.orchestration.submitExecutionContract({
        tenantSlug: context.tenant.slug,
        workspaceSlug: context.activeWorkspace?.slug,
        planId,
        objective: body.objective,
        executionModes: body.executionModes,
        runtimeBindings: body.runtimeBindings,
        childWorkflowContracts: body.childWorkflowContracts,
        approvalContracts: body.approvalContracts,
        escalationContracts: body.escalationContracts,
        rollbackContracts: body.rollbackContracts,
        submittedBy: userEmailHeader ?? userEmailQuery ?? body.userEmail ?? context.user.email,
        submissionNotes: body.submissionNotes,
      }),
      next: ['execution-runner', 'approval-dispatch', 'verification-history'],
    };
  }

  @Post('plans/:planId/execution-runtime/activate')
  async activateExecutionRuntime(
    @Param('planId') planId: string,
    @Body()
    body: {
      tenantSlug?: string;
      userEmail?: string;
      workspaceSlug?: string;
      objective?: string;
      executionModes?: string[];
      runtimeBindings?: Array<{
        runtimeKey?: string;
        systemKey?: string;
        deliveryMode?: string;
        approvalRequired?: boolean;
      }>;
      childWorkflowContracts?: Array<{
        workflowKey?: string;
        runtimeKey?: string;
        systemKey?: string;
        triggerMode?: string;
        approvalRequired?: boolean;
        approvalCheckpointKey?: string;
      }>;
      approvalContracts?: Array<{
        checkpointKey?: string;
        approverRole?: string;
        channel?: string;
        escalationMode?: string;
        required?: boolean;
      }>;
      escalationContracts?: Array<{
        escalationKey?: string;
        fromCheckpointKey?: string;
        targetRole?: string;
        triggerMode?: string;
        delayMinutes?: number;
      }>;
      rollbackContracts?: Array<{
        rollbackKey?: string;
        fromCheckpointKey?: string;
        targetSystemKey?: string;
        strategy?: string;
        preserveArtifacts?: boolean;
      }>;
      submissionNotes?: string;
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('hostname') hostnameQuery?: string,
    @Headers('authorization') authorizationHeader?: string,
  ) {
    const context = await this.resolveActorContext({
      tenantSlug:
        tenantSlugHeader ?? tenantSlugQuery ?? body.tenantSlug,
      userEmail: userEmailHeader ?? userEmailQuery ?? body.userEmail,
      workspaceSlug:
        workspaceSlugHeader ?? workspaceSlugQuery ?? body.workspaceSlug,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
      authorizationHeader,
    });

    return {
      capability: 'orchestration',
      status: 'execution-runtime-activated',
      context: {
        tenant: context.tenant,
        activeWorkspace: context.activeWorkspace,
        activeMembership: context.activeMembership,
      },
      executionRuntime: await this.orchestration.materializeExecutionRuntime({
        tenantSlug: context.tenant.slug,
        workspaceSlug: context.activeWorkspace?.slug,
        planId,
        objective: body.objective,
        executionModes: body.executionModes,
        runtimeBindings: body.runtimeBindings,
        childWorkflowContracts: body.childWorkflowContracts,
        approvalContracts: body.approvalContracts,
        escalationContracts: body.escalationContracts,
        rollbackContracts: body.rollbackContracts,
        submittedBy: userEmailHeader ?? userEmailQuery ?? body.userEmail ?? context.user.email,
        submissionNotes: body.submissionNotes,
      }),
      next: ['approval-decision', 'runner-execution', 'verification-history'],
    };
  }

  @Post('plans/:planId/execution-runtime/approval-decision')
  async applyExecutionApprovalDecision(
    @Param('planId') planId: string,
    @Body()
    body: {
      tenantSlug?: string;
      userEmail?: string;
      workspaceSlug?: string;
      objective?: string;
      executionModes?: string[];
      runtimeBindings?: OrchestrationRuntimeBindingInput[];
      childWorkflowContracts?: OrchestrationChildWorkflowContractInput[];
      approvalContracts?: OrchestrationApprovalContractInput[];
      escalationContracts?: OrchestrationEscalationContractInput[];
      rollbackContracts?: OrchestrationRollbackContractInput[];
      submissionNotes?: string;
      taskKey: string;
      decision: 'approve' | 'reject' | 'request-changes';
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('hostname') hostnameQuery?: string,
    @Headers('authorization') authorizationHeader?: string,
  ) {
    const context = await this.resolveActorContext({
      tenantSlug:
        tenantSlugHeader ?? tenantSlugQuery ?? body.tenantSlug,
      userEmail: userEmailHeader ?? userEmailQuery ?? body.userEmail,
      workspaceSlug:
        workspaceSlugHeader ?? workspaceSlugQuery ?? body.workspaceSlug,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
      authorizationHeader,
    });

    return {
      capability: 'orchestration',
      status: 'execution-approval-decision-applied',
      context: {
        tenant: context.tenant,
        activeWorkspace: context.activeWorkspace,
        activeMembership: context.activeMembership,
      },
      executionApprovalDecision: await this.orchestration.applyApprovalDecision({
        tenantSlug: context.tenant.slug,
        workspaceSlug: context.activeWorkspace?.slug,
        planId,
        objective: body.objective,
        executionModes: body.executionModes,
        runtimeBindings: body.runtimeBindings,
        childWorkflowContracts: body.childWorkflowContracts,
        approvalContracts: body.approvalContracts,
        escalationContracts: body.escalationContracts,
        rollbackContracts: body.rollbackContracts,
        submittedBy: userEmailHeader ?? userEmailQuery ?? body.userEmail ?? context.user.email,
        submissionNotes: body.submissionNotes,
        taskKey: body.taskKey,
        decision: body.decision,
        decidedBy: userEmailHeader ?? userEmailQuery ?? body.userEmail ?? context.user.email,
      }),
      next: ['runner-execution', 'verification-history'],
    };
  }

  @Post('plans/:planId/execution-runtime/dispatch-run')
  @UseGuards(AccessPolicyGuard)
  @RequireAccessPolicy({
    minimumRole: MembershipRole.OPERATOR,
    scope: 'operator-control',
  })
  async dispatchExecutionRuntimeRun(
    @Param('planId') planId: string,
    @Body()
    body: {
      tenantSlug?: string;
      userEmail?: string;
      workspaceSlug?: string;
      objective?: string;
      executionModes?: string[];
      runtimeBindings?: OrchestrationRuntimeBindingInput[];
      childWorkflowContracts?: OrchestrationChildWorkflowContractInput[];
      approvalContracts?: OrchestrationApprovalContractInput[];
      escalationContracts?: OrchestrationEscalationContractInput[];
      rollbackContracts?: OrchestrationRollbackContractInput[];
      submissionNotes?: string;
      runKey: string;
      aiGovernance?: {
        featureKey?: string;
        taskType?: string;
        requestedLane?:
          | 'deterministic'
          | 'artifact-cache'
          | 'cheap-model'
          | 'balanced-model'
          | 'premium-model'
          | 'background-batch';
        preferredCredentialMode?: 'aifut-managed' | 'byo';
        projectedTokens?: number;
        projectedCost?: number;
        deterministicEligible?: boolean;
        cacheHitAvailable?: boolean;
        providerKey?: string;
        modelKey?: string;
        inputTokens?: number;
        outputTokens?: number;
        estimatedCost?: number;
        actualCost?: number;
        cacheHit?: boolean;
        approval?: {
          decision: 'approve';
          note?: string;
        };
      };
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('hostname') hostnameQuery?: string,
    @Headers('authorization') authorizationHeader?: string,
  ) {
    const context = await this.resolveActorContext({
      tenantSlug:
        tenantSlugHeader ?? tenantSlugQuery ?? body.tenantSlug,
      userEmail: userEmailHeader ?? userEmailQuery ?? body.userEmail,
      workspaceSlug:
        workspaceSlugHeader ?? workspaceSlugQuery ?? body.workspaceSlug,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
      authorizationHeader,
    });

    const actorKey =
      userEmailHeader ?? userEmailQuery ?? body.userEmail ?? context.user.email;
    const governanceInput = body.aiGovernance ?? {};
    const aiGovernanceDecision =
      await this.aiGovernancePersistence.buildGatewayDecision({
        tenantSlug: context.tenant.slug,
        workspaceSlug: context.activeWorkspace?.slug,
        featureKey: governanceInput.featureKey ?? 'orchestration-runtime',
        taskType: governanceInput.taskType ?? 'dispatch-run',
        requestedLane: governanceInput.requestedLane,
        preferredCredentialMode: governanceInput.preferredCredentialMode,
        projectedTokens: governanceInput.projectedTokens,
        projectedCost: governanceInput.projectedCost,
        deterministicEligible: governanceInput.deterministicEligible,
        cacheHitAvailable: governanceInput.cacheHitAvailable,
      });

    if (
      aiGovernanceDecision.blockReason ||
      aiGovernanceDecision.executionPolicy?.canDispatch === false
    ) {
      return {
        capability: 'orchestration',
        status: 'execution-run-blocked-by-ai-governance',
        context: {
          tenant: context.tenant,
          activeWorkspace: context.activeWorkspace,
          activeMembership: context.activeMembership,
        },
        aiGovernanceDecision,
        next: ['review-ai-budget-policy', 'reduce-projected-usage'],
      };
    }

    const requiresAiGovernanceApproval =
      aiGovernanceDecision.requiresApproval ||
      aiGovernanceDecision.executionPolicy?.requiresHumanApproval ||
      aiGovernanceDecision.executionPolicy?.canAutoDispatch === false;
    const aiGovernanceApproval =
      requiresAiGovernanceApproval &&
      governanceInput.approval?.decision === 'approve'
        ? {
            status: 'approved-for-dispatch',
            decision: governanceInput.approval.decision,
            approvedBy: actorKey,
            note: governanceInput.approval.note?.trim() || null,
          }
        : null;

    if (requiresAiGovernanceApproval && !aiGovernanceApproval) {
      return {
        capability: 'orchestration',
        status: 'execution-run-awaiting-ai-governance-approval',
        context: {
          tenant: context.tenant,
          activeWorkspace: context.activeWorkspace,
          activeMembership: context.activeMembership,
        },
        aiGovernanceDecision,
        next: ['approve-ai-governance-decision', 'adjust-ai-routing-policy'],
      };
    }

    const executionDispatch = await this.orchestration.dispatchExecutionRun({
      tenantSlug: context.tenant.slug,
      workspaceSlug: context.activeWorkspace?.slug,
      planId,
      objective: body.objective,
      executionModes: body.executionModes,
      runtimeBindings: body.runtimeBindings,
      childWorkflowContracts: body.childWorkflowContracts,
      approvalContracts: body.approvalContracts,
      escalationContracts: body.escalationContracts,
      rollbackContracts: body.rollbackContracts,
      submittedBy: actorKey,
      submissionNotes: body.submissionNotes,
      runKey: body.runKey,
      dispatchedBy: actorKey,
    });
    const aiUsageEvent = await this.aiGovernancePersistence.persistUsageEventRecord({
      tenantSlug: context.tenant.slug,
      workspaceSlug: context.activeWorkspace?.slug,
      actorKey,
      featureKey: aiGovernanceDecision.featureKey,
      taskType: aiGovernanceDecision.taskType,
      providerKey: governanceInput.providerKey ?? 'orchestration-runtime',
      modelKey: governanceInput.modelKey ?? aiGovernanceDecision.selectedLane ?? 'blocked',
      credentialMode: aiGovernanceDecision.credentialMode,
      executionLane: aiGovernanceDecision.selectedLane ?? undefined,
      inputTokens: governanceInput.inputTokens ?? governanceInput.projectedTokens,
      outputTokens: governanceInput.outputTokens,
      estimatedCost: governanceInput.estimatedCost ?? governanceInput.projectedCost,
      actualCost: governanceInput.actualCost,
      cacheHit: governanceInput.cacheHit ?? governanceInput.cacheHitAvailable,
      source: aiGovernanceApproval
        ? 'orchestration-dispatch-run-approved'
        : 'orchestration-dispatch-run',
      status: 'success',
    });
    const aiGovernanceApprovalAudit = aiGovernanceApproval
      ? await this.auditEvents.write({
          tenantSlug: context.tenant.slug,
          userEmail: actorKey,
          workspaceSlug: context.activeWorkspace?.slug,
          hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
          action: 'ai-governance.approval-dispatch-resumed',
          targetType: 'orchestration-execution-run',
          targetId: body.runKey,
          metadata: {
            planId,
            runKey: body.runKey,
            approval: aiGovernanceApproval,
            governanceDecision: {
              featureKey: aiGovernanceDecision.featureKey,
              taskType: aiGovernanceDecision.taskType,
              selectedLane: aiGovernanceDecision.selectedLane,
              credentialMode: aiGovernanceDecision.credentialMode,
              approvalReason: aiGovernanceDecision.approvalReason,
              outcome: aiGovernanceDecision.outcome,
            },
            usageEventKey: aiUsageEvent.eventKey,
          },
        })
      : null;

    return {
      capability: 'orchestration',
      status: aiGovernanceApproval
        ? 'execution-run-dispatched-after-ai-governance-approval'
        : 'execution-run-dispatched',
      context: {
        tenant: context.tenant,
        activeWorkspace: context.activeWorkspace,
        activeMembership: context.activeMembership,
      },
      aiGovernanceDecision,
      aiGovernanceApproval,
      aiGovernanceApprovalAudit,
      aiUsageEvent,
      executionDispatch,
      next: ['verification-history', 'dispatch-outcome-tracking', 'ai-usage-ledger'],
    };
  }

  @Get('plans/:planId/execution-runtime/history')
  async getExecutionRuntimeHistory(
    @Param('planId') planId: string,
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('hostname') hostnameQuery?: string,
    @Query('snapshotTake') snapshotTakeQuery?: string,
    @Query('eventTake') eventTakeQuery?: string,
    @Headers('authorization') authorizationHeader?: string,
  ) {
    const context = await this.resolveActorContext({
      tenantSlug: tenantSlugHeader ?? tenantSlugQuery,
      userEmail: userEmailHeader ?? userEmailQuery,
      workspaceSlug: workspaceSlugHeader ?? workspaceSlugQuery,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
      authorizationHeader,
    });

    const parseOptionalPositiveInt = (value?: string) => {
      if (!value) {
        return undefined;
      }

      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    };

    return {
      capability: 'orchestration',
      status: 'execution-runtime-history-fetched',
      context: {
        tenant: context.tenant,
        activeWorkspace: context.activeWorkspace,
        activeMembership: context.activeMembership,
      },
      runtimeHistory: await this.orchestration.getExecutionRuntimeHistory({
        tenantSlug: context.tenant.slug,
        workspaceSlug: context.activeWorkspace?.slug,
        planId,
        snapshotTake: parseOptionalPositiveInt(snapshotTakeQuery),
        eventTake: parseOptionalPositiveInt(eventTakeQuery),
      }),
      next: ['approval-decision', 'runner-execution', 'verification-history'],
    };
  }

  @Get('plans/:planId/execution-runtime/diagnostics')
  async getExecutionRuntimeDiagnostics(
    @Param('planId') planId: string,
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('hostname') hostnameQuery?: string,
    @Query('snapshotTake') snapshotTakeQuery?: string,
    @Query('eventTake') eventTakeQuery?: string,
    @Headers('authorization') authorizationHeader?: string,
  ) {
    const context = await this.resolveActorContext({
      tenantSlug: tenantSlugHeader ?? tenantSlugQuery,
      userEmail: userEmailHeader ?? userEmailQuery,
      workspaceSlug: workspaceSlugHeader ?? workspaceSlugQuery,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
      authorizationHeader,
    });

    const parseOptionalPositiveInt = (value?: string) => {
      if (!value) {
        return undefined;
      }

      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    };

    return {
      capability: 'orchestration',
      status: 'execution-runtime-diagnostics-fetched',
      context: {
        tenant: context.tenant,
        activeWorkspace: context.activeWorkspace,
        activeMembership: context.activeMembership,
      },
      runtimeDiagnostics: await this.orchestration.getExecutionRuntimeDiagnostics({
        tenantSlug: context.tenant.slug,
        workspaceSlug: context.activeWorkspace?.slug,
        planId,
        snapshotTake: parseOptionalPositiveInt(snapshotTakeQuery),
        eventTake: parseOptionalPositiveInt(eventTakeQuery),
      }),
      next: ['approval-decision', 'runner-execution', 'verification-history'],
    };
  }

  @Get('roadmap')
  roadmap() {
    return {
      capability: 'orchestration',
      roadmap: ORCHESTRATION_FOUNDATION_ROADMAP,
    };
  }

  @Post('ai/routing-preview')
  async previewAiRouting(
    @Body()
    body: {
      tenantSlug?: string;
      userEmail?: string;
      workspaceSlug?: string;
      packagePolicy: {
        packageKey?: string;
        includedMonthlyTokens?: number;
        allowByoKeys?: boolean;
        platformFeePercentForByo?: number;
        hardMonthlyTokenLimit?: number;
        allowedModelKeys?: string[];
      };
      modelPolicies: Array<{
        providerKey?: string;
        modelKey?: string;
        inputTokenCost?: number;
        outputTokenCost?: number;
        markupPercent?: number;
        currency?: string;
        allowedCredentialModes?: Array<'aifut-managed' | 'byo'>;
      }>;
      taskType?: string;
      riskLevel?: 'low' | 'medium' | 'high';
      qualityRequirement?: 'economy' | 'balanced' | 'premium';
      latencyBudget?: 'interactive' | 'background';
      costBudgetClass?: 'strict-economy' | 'balanced' | 'premium-controlled';
      preferCredentialMode?: 'aifut-managed' | 'byo';
      deterministicEligible?: boolean;
      cacheHitAvailable?: boolean;
      quotaPressure?: 'normal' | 'near-limit' | 'hard-limit';
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('hostname') hostnameQuery?: string,
    @Headers('authorization') authorizationHeader?: string,
  ) {
    const context = await this.resolveActorContext({
      tenantSlug: tenantSlugHeader ?? tenantSlugQuery ?? body.tenantSlug,
      userEmail: userEmailHeader ?? userEmailQuery ?? body.userEmail,
      workspaceSlug:
        workspaceSlugHeader ?? workspaceSlugQuery ?? body.workspaceSlug,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
      authorizationHeader,
    });

    return {
      capability: 'orchestration',
      status: 'ai-routing-previewed',
      context: {
        tenant: context.tenant,
        activeWorkspace: context.activeWorkspace,
        activeMembership: context.activeMembership,
      },
      aiRoutingPreview: this.aiTokenGovernance.previewRouting({
        tenantSlug: context.tenant.slug,
        workspaceSlug: context.activeWorkspace?.slug,
        packagePolicy: body.packagePolicy,
        modelPolicies: body.modelPolicies,
        taskType: body.taskType,
        riskLevel: body.riskLevel,
        qualityRequirement: body.qualityRequirement,
        latencyBudget: body.latencyBudget,
        costBudgetClass: body.costBudgetClass,
        preferCredentialMode: body.preferCredentialMode,
        deterministicEligible: body.deterministicEligible,
        cacheHitAvailable: body.cacheHitAvailable,
        quotaPressure: body.quotaPressure,
      }),
      next: ['model-routing', 'package-quota-enforcement', 'usage-estimation'],
    };
  }

  @Post('ai/usage-estimate')
  async estimateAiUsage(
    @Body()
    body: {
      tenantSlug?: string;
      userEmail?: string;
      workspaceSlug?: string;
      packagePolicy: {
        packageKey?: string;
        includedMonthlyTokens?: number;
        allowByoKeys?: boolean;
        platformFeePercentForByo?: number;
        hardMonthlyTokenLimit?: number;
        allowedModelKeys?: string[];
      };
      modelPolicy: {
        providerKey?: string;
        modelKey?: string;
        inputTokenCost?: number;
        outputTokenCost?: number;
        markupPercent?: number;
        currency?: string;
        allowedCredentialModes?: Array<'aifut-managed' | 'byo'>;
      };
      credentialMode?: 'aifut-managed' | 'byo';
      estimatedInputTokens?: number;
      estimatedOutputTokens?: number;
      alreadyUsedMonthlyTokens?: number;
    },
    @Headers('x-tenant-slug') tenantSlugHeader?: string,
    @Headers('x-user-email') userEmailHeader?: string,
    @Headers('x-workspace-slug') workspaceSlugHeader?: string,
    @Headers('x-forwarded-host') forwardedHostHeader?: string,
    @Headers('host') hostHeader?: string,
    @Query('tenantSlug') tenantSlugQuery?: string,
    @Query('userEmail') userEmailQuery?: string,
    @Query('workspaceSlug') workspaceSlugQuery?: string,
    @Query('hostname') hostnameQuery?: string,
    @Headers('authorization') authorizationHeader?: string,
  ) {
    const context = await this.resolveActorContext({
      tenantSlug: tenantSlugHeader ?? tenantSlugQuery ?? body.tenantSlug,
      userEmail: userEmailHeader ?? userEmailQuery ?? body.userEmail,
      workspaceSlug:
        workspaceSlugHeader ?? workspaceSlugQuery ?? body.workspaceSlug,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
      authorizationHeader,
    });

    return {
      capability: 'orchestration',
      status: 'ai-usage-estimated',
      context: {
        tenant: context.tenant,
        activeWorkspace: context.activeWorkspace,
        activeMembership: context.activeMembership,
      },
      aiUsageEstimate: this.aiTokenGovernance.estimateUsage({
        tenantSlug: context.tenant.slug,
        workspaceSlug: context.activeWorkspace?.slug,
        packagePolicy: body.packagePolicy,
        modelPolicy: body.modelPolicy,
        credentialMode: body.credentialMode,
        estimatedInputTokens: body.estimatedInputTokens,
        estimatedOutputTokens: body.estimatedOutputTokens,
        alreadyUsedMonthlyTokens: body.alreadyUsedMonthlyTokens,
      }),
      next: ['token-usage-ledger', 'package-quota-enforcement', 'model-routing'],
    };
  }
}
