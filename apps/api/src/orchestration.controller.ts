import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { ActorContextService } from './actor-context.service';
import { ORCHESTRATION_FOUNDATION_ROADMAP } from './orchestration.constants';

@Controller('orchestration')
export class OrchestrationController {
  constructor(private readonly actorContext: ActorContextService) {}

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

    const sourceKind = body.sourceKind?.trim() || 'text';
    const title = body.title?.trim() || 'Untitled roadmap draft';
    const content = body.content?.trim() || '';

    return {
      capability: 'orchestration',
      status: 'roadmap-ingested',
      context: {
        tenant: context.tenant,
        activeWorkspace: context.activeWorkspace,
        activeMembership: context.activeMembership,
      },
      roadmapDraft: {
        id: `draft:${context.tenant.slug}:${context.activeWorkspace?.slug ?? 'tenant'}:roadmap`,
        sourceKind,
        title,
        sourceRefs: body.sourceRefs ?? [],
        contentPreview: content.slice(0, 280),
        interpretationStatus: 'pending',
        extractedStructure: {
          phases: [],
          goals: [],
          decisionGates: [],
        },
      },
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
      parentWorkflowPlan: {
        id: `plan:${context.tenant.slug}:${context.activeWorkspace?.slug ?? 'tenant'}:draft`,
        roadmapDraftId:
          body.roadmapDraftId ??
          `draft:${context.tenant.slug}:${context.activeWorkspace?.slug ?? 'tenant'}:roadmap`,
        objective:
          body.objective?.trim() ||
          'Design the leanest workable parent workflow for the tenant context.',
        constraints: body.constraints ?? [],
        childWorkflows: [],
        appCoordination: {
          systemAssignments: [],
          dataflowEdges: [],
        },
        optimizationSummary: {
          status: 'draft',
          preferredStrategy:
            'Lean multi-app orchestration draft pending roadmap interpretation.',
          tradeoffs: [],
        },
      },
      next: [
        'app-coordination-draft',
        'dataflow-modeling',
        'workflow-graph-projection',
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
