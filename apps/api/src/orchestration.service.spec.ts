import { OrchestrationService } from './orchestration.service';

describe('OrchestrationService', () => {
  let service: OrchestrationService;

  beforeEach(() => {
    service = new OrchestrationService();
  });

  it('should build a roadmap draft with normalized defaults', () => {
    const result = service.buildRoadmapDraft({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      content: '  Acquire -> nurture -> convert  ',
    });

    expect(result).toMatchObject({
      id: 'draft:acme:ops:roadmap',
      sourceKind: 'text',
      title: 'Untitled roadmap draft',
      contentPreview: 'Acquire -> nurture -> convert',
      interpretationStatus: 'pending',
    });
  });

  it('should build a parent workflow plan with default objective', () => {
    const result = service.buildParentWorkflowPlan({
      tenantSlug: 'acme',
    });

    expect(result).toMatchObject({
      id: 'plan:acme:tenant:draft',
      roadmapDraftId: 'draft:acme:tenant:roadmap',
      objective: 'Design the leanest workable parent workflow for the tenant context.',
      constraints: [],
      appCoordination: {
        systemAssignments: [],
        dataflowEdges: [],
      },
      optimizationSummary: {
        status: 'draft',
      },
    });
  });

  it('should build a roadmap interpretation draft with normalized defaults', () => {
    const result = service.buildRoadmapInterpretation({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      roadmapDraftId: 'draft:acme:ops:roadmap',
    });

    expect(result).toMatchObject({
      draftId: 'draft:acme:ops:roadmap',
      interpretationStatus: 'draft',
      objective:
        'Interpret roadmap into phases, goals, decision gates, and automation opportunities.',
      hints: [],
      phases: [],
      goals: [],
      decisionGates: [],
      automationOpportunities: [],
      contextScope: {
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
      },
    });
  });
});
