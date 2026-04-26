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

  @Get('roadmap')
  roadmap() {
    return {
      capability: 'orchestration',
      roadmap: ORCHESTRATION_FOUNDATION_ROADMAP,
    };
  }
}
