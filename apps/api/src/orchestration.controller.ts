import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { ActorContextService } from './actor-context.service';
import { ORCHESTRATION_FOUNDATION_ROADMAP } from './orchestration.constants';
import { OrchestrationService } from './orchestration.service';

@Controller('orchestration')
export class OrchestrationController {
  constructor(
    private readonly actorContext: ActorContextService,
    private readonly orchestration: OrchestrationService,
  ) {}

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
  ) {
    const context = await this.actorContext.resolve({
      tenantSlug:
        tenantSlugHeader ?? tenantSlugQuery ?? body.tenantSlug,
      userEmail: userEmailHeader ?? userEmailQuery ?? body.userEmail,
      workspaceSlug:
        workspaceSlugHeader ?? workspaceSlugQuery ?? body.workspaceSlug,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
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
  ) {
    const context = await this.actorContext.resolve({
      tenantSlug:
        tenantSlugHeader ?? tenantSlugQuery ?? body.tenantSlug,
      userEmail: userEmailHeader ?? userEmailQuery ?? body.userEmail,
      workspaceSlug:
        workspaceSlugHeader ?? workspaceSlugQuery ?? body.workspaceSlug,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
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
  ) {
    const context = await this.actorContext.resolve({
      tenantSlug:
        tenantSlugHeader ?? tenantSlugQuery ?? body.tenantSlug,
      userEmail: userEmailHeader ?? userEmailQuery ?? body.userEmail,
      workspaceSlug:
        workspaceSlugHeader ?? workspaceSlugQuery ?? body.workspaceSlug,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
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
  ) {
    const context = await this.actorContext.resolve({
      tenantSlug:
        tenantSlugHeader ?? tenantSlugQuery ?? body.tenantSlug,
      userEmail: userEmailHeader ?? userEmailQuery ?? body.userEmail,
      workspaceSlug:
        workspaceSlugHeader ?? workspaceSlugQuery ?? body.workspaceSlug,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
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
  ) {
    const context = await this.actorContext.resolve({
      tenantSlug:
        tenantSlugHeader ?? tenantSlugQuery ?? body.tenantSlug,
      userEmail: userEmailHeader ?? userEmailQuery ?? body.userEmail,
      workspaceSlug:
        workspaceSlugHeader ?? workspaceSlugQuery ?? body.workspaceSlug,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
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
  ) {
    const context = await this.actorContext.resolve({
      tenantSlug:
        tenantSlugHeader ?? tenantSlugQuery ?? body.tenantSlug,
      userEmail: userEmailHeader ?? userEmailQuery ?? body.userEmail,
      workspaceSlug:
        workspaceSlugHeader ?? workspaceSlugQuery ?? body.workspaceSlug,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
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
  ) {
    const context = await this.actorContext.resolve({
      tenantSlug:
        tenantSlugHeader ?? tenantSlugQuery ?? body.tenantSlug,
      userEmail: userEmailHeader ?? userEmailQuery ?? body.userEmail,
      workspaceSlug:
        workspaceSlugHeader ?? workspaceSlugQuery ?? body.workspaceSlug,
      hostname: forwardedHostHeader ?? hostHeader ?? hostnameQuery,
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

  @Get('roadmap')
  roadmap() {
    return {
      capability: 'orchestration',
      roadmap: ORCHESTRATION_FOUNDATION_ROADMAP,
    };
  }
}
