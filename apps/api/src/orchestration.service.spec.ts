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

  it('should build an app coordination draft with normalized defaults', () => {
    const result = service.buildAppCoordinationDraft({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:draft',
    });

    expect(result).toMatchObject({
      planId: 'plan:acme:ops:draft',
      coordinationStatus: 'draft',
      objective:
        'Assign workflow steps to the leanest viable mix of first-party modules and connected systems.',
      preferredSystems: [],
      systemAssignments: [],
      connectorRecommendations: [],
      operatorCheckpoints: [],
      contextScope: {
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
      },
    });
  });

  it('should build a dataflow model draft with normalized defaults', () => {
    const result = service.buildDataflowModelDraft({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:draft',
    });

    expect(result).toMatchObject({
      planId: 'plan:acme:ops:draft',
      dataflowStatus: 'draft',
      objective:
        'Model the leanest safe data movement across systems, approvals, and source-of-truth boundaries.',
      businessObjects: [],
      edges: [],
      syncPolicies: [],
      sourceOfTruthAssignments: [],
      contextScope: {
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
      },
    });
  });
});
