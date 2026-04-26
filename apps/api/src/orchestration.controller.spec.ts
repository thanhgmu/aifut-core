import { Test, TestingModule } from '@nestjs/testing';
import { OrchestrationController } from './orchestration.controller';
import { ActorContextService } from './actor-context.service';

describe('OrchestrationController', () => {
  let controller: OrchestrationController;
  let actorContext: { resolve: jest.Mock };

  beforeEach(async () => {
    actorContext = {
      resolve: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrchestrationController],
      providers: [
        {
          provide: ActorContextService,
          useValue: actorContext,
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
