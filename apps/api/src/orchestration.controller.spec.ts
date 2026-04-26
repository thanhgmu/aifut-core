import { Test, TestingModule } from '@nestjs/testing';
import { OrchestrationController } from './orchestration.controller';
import { ActorContextService } from './actor-context.service';
import { OrchestrationService } from './orchestration.service';

describe('OrchestrationController', () => {
  let controller: OrchestrationController;
  let actorContext: { resolve: jest.Mock };
  let orchestration: {
    buildRoadmapDraft: jest.Mock;
    buildParentWorkflowPlan: jest.Mock;
  };

  beforeEach(async () => {
    actorContext = {
      resolve: jest.fn(),
    };

    orchestration = {
      buildRoadmapDraft: jest.fn(),
      buildParentWorkflowPlan: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrchestrationController],
      providers: [
        {
          provide: ActorContextService,
          useValue: actorContext,
        },
        {
          provide: OrchestrationService,
          useValue: orchestration,
        },
      ],
    }).compile();

    controller = module.get<OrchestrationController>(OrchestrationController);
  });

  it('should ingest a roadmap draft in tenant/workspace context', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      activeWorkspace: { id: 'ws_1', slug: 'ops' },
      activeMembership: { role: 'ADMIN' },
    });
    orchestration.buildRoadmapDraft.mockReturnValue({
      id: 'draft:acme:ops:roadmap',
      sourceKind: 'diagram',
      title: 'Creator funnel',
      sourceRefs: ['img://roadmap-1'],
      interpretationStatus: 'pending',
    });

    const result = await controller.ingestRoadmap(
      {
        title: 'Creator funnel',
        sourceKind: 'diagram',
        content: 'Acquire -> nurture -> convert',
        sourceRefs: ['img://roadmap-1'],
      },
      'acme',
      'ops@acme.test',
      'ops',
      'ops.acme.test',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );

    expect(actorContext.resolve).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      hostname: 'ops.acme.test',
    });
    expect(orchestration.buildRoadmapDraft).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      sourceKind: 'diagram',
      title: 'Creator funnel',
      content: 'Acquire -> nurture -> convert',
      sourceRefs: ['img://roadmap-1'],
    });
    expect(result).toMatchObject({
      status: 'roadmap-ingested',
      roadmapDraft: {
        sourceKind: 'diagram',
        title: 'Creator funnel',
        sourceRefs: ['img://roadmap-1'],
        interpretationStatus: 'pending',
      },
      context: {
        tenant: { slug: 'acme' },
        activeWorkspace: { slug: 'ops' },
      },
    });
  });

  it('should draft a parent workflow plan in tenant/workspace context', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      activeWorkspace: { id: 'ws_1', slug: 'ops' },
      activeMembership: { role: 'ADMIN' },
    });
    orchestration.buildParentWorkflowPlan.mockReturnValue({
      id: 'plan:acme:ops:draft',
      roadmapDraftId: 'draft:acme:ops:roadmap',
      objective: 'Reduce operator workload and increase conversion',
      constraints: ['keep-tool-count-low'],
      appCoordination: {
        systemAssignments: [],
        dataflowEdges: [],
      },
      optimizationSummary: {
        status: 'draft',
      },
    });

    const result = await controller.draftPlan(
      {
        roadmapDraftId: 'draft:acme:ops:roadmap',
        objective: 'Reduce operator workload and increase conversion',
        constraints: ['keep-tool-count-low'],
      },
      'acme',
      'ops@acme.test',
      'ops',
      'ops.acme.test',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );

    expect(actorContext.resolve).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      hostname: 'ops.acme.test',
    });
    expect(orchestration.buildParentWorkflowPlan).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      roadmapDraftId: 'draft:acme:ops:roadmap',
      objective: 'Reduce operator workload and increase conversion',
      constraints: ['keep-tool-count-low'],
    });
    expect(result).toMatchObject({
      status: 'plan-drafted',
      parentWorkflowPlan: {
        roadmapDraftId: 'draft:acme:ops:roadmap',
        objective: 'Reduce operator workload and increase conversion',
        constraints: ['keep-tool-count-low'],
        appCoordination: {
          systemAssignments: [],
          dataflowEdges: [],
        },
        optimizationSummary: {
          status: 'draft',
        },
      },
      context: {
        tenant: { slug: 'acme' },
        activeWorkspace: { slug: 'ops' },
      },
    });
  });
});
