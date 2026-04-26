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
    buildRoadmapInterpretation: jest.Mock;
    buildAppCoordinationDraft: jest.Mock;
    buildDataflowModelDraft: jest.Mock;
    buildOptimizationSummaryDraft: jest.Mock;
    buildWorkflowGraphDraft: jest.Mock;
    buildExecutionContractDraft: jest.Mock;
  };

  beforeEach(async () => {
    actorContext = {
      resolve: jest.fn(),
    };

    orchestration = {
      buildRoadmapDraft: jest.fn(),
      buildParentWorkflowPlan: jest.fn(),
      buildRoadmapInterpretation: jest.fn(),
      buildAppCoordinationDraft: jest.fn(),
      buildDataflowModelDraft: jest.fn(),
      buildOptimizationSummaryDraft: jest.fn(),
      buildWorkflowGraphDraft: jest.fn(),
      buildExecutionContractDraft: jest.fn(),
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

  it('should interpret a roadmap draft in tenant/workspace context', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      activeWorkspace: { id: 'ws_1', slug: 'ops' },
      activeMembership: { role: 'ADMIN' },
    });
    orchestration.buildRoadmapInterpretation.mockReturnValue({
      draftId: 'draft:acme:ops:roadmap',
      interpretationStatus: 'draft',
      objective: 'Extract phases and automation opportunities',
      hints: ['keep-tool-count-low'],
      phases: [],
      goals: [],
      decisionGates: [],
      automationOpportunities: [],
    });

    const result = await controller.interpretRoadmap(
      'draft:acme:ops:roadmap',
      {
        objective: 'Extract phases and automation opportunities',
        hints: ['keep-tool-count-low'],
      },
      'acme',
      'ops@acme.test',
      'ops',
      'ops.acme.test',
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
    expect(orchestration.buildRoadmapInterpretation).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      roadmapDraftId: 'draft:acme:ops:roadmap',
      objective: 'Extract phases and automation opportunities',
      hints: ['keep-tool-count-low'],
    });
    expect(result).toMatchObject({
      status: 'roadmap-interpreted',
      interpretation: {
        draftId: 'draft:acme:ops:roadmap',
        interpretationStatus: 'draft',
        objective: 'Extract phases and automation opportunities',
        hints: ['keep-tool-count-low'],
      },
      context: {
        tenant: { slug: 'acme' },
        activeWorkspace: { slug: 'ops' },
      },
    });
  });

  it('should draft app coordination in tenant/workspace context', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      activeWorkspace: { id: 'ws_1', slug: 'ops' },
      activeMembership: { role: 'ADMIN' },
    });
    orchestration.buildAppCoordinationDraft.mockReturnValue({
      planId: 'plan:acme:ops:draft',
      coordinationStatus: 'draft',
      objective: 'Map the leanest system mix',
      preferredSystems: ['nexovaflow', 'sheets'],
      systemAssignments: [],
      connectorRecommendations: [],
      operatorCheckpoints: [],
    });

    const result = await controller.draftAppCoordination(
      'plan:acme:ops:draft',
      {
        objective: 'Map the leanest system mix',
        preferredSystems: ['nexovaflow', 'sheets'],
      },
      'acme',
      'ops@acme.test',
      'ops',
      'ops.acme.test',
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
    expect(orchestration.buildAppCoordinationDraft).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:draft',
      objective: 'Map the leanest system mix',
      preferredSystems: ['nexovaflow', 'sheets'],
    });
    expect(result).toMatchObject({
      status: 'app-coordination-drafted',
      appCoordination: {
        planId: 'plan:acme:ops:draft',
        coordinationStatus: 'draft',
        objective: 'Map the leanest system mix',
        preferredSystems: ['nexovaflow', 'sheets'],
      },
      context: {
        tenant: { slug: 'acme' },
        activeWorkspace: { slug: 'ops' },
      },
    });
  });

  it('should draft dataflow modeling in tenant/workspace context', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      activeWorkspace: { id: 'ws_1', slug: 'ops' },
      activeMembership: { role: 'ADMIN' },
    });
    orchestration.buildDataflowModelDraft.mockReturnValue({
      planId: 'plan:acme:ops:draft',
      dataflowStatus: 'draft',
      objective: 'Map customer and order sync paths',
      businessObjects: ['customer', 'order'],
      edges: [],
      syncPolicies: [],
      sourceOfTruthAssignments: [],
    });

    const result = await controller.draftDataflow(
      'plan:acme:ops:draft',
      {
        objective: 'Map customer and order sync paths',
        businessObjects: ['customer', 'order'],
      },
      'acme',
      'ops@acme.test',
      'ops',
      'ops.acme.test',
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
    expect(orchestration.buildDataflowModelDraft).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:draft',
      objective: 'Map customer and order sync paths',
      businessObjects: ['customer', 'order'],
    });
    expect(result).toMatchObject({
      status: 'dataflow-drafted',
      dataflow: {
        planId: 'plan:acme:ops:draft',
        dataflowStatus: 'draft',
        objective: 'Map customer and order sync paths',
        businessObjects: ['customer', 'order'],
      },
      context: {
        tenant: { slug: 'acme' },
        activeWorkspace: { slug: 'ops' },
      },
    });
  });

  it('should draft optimization summary in tenant/workspace context', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      activeWorkspace: { id: 'ws_1', slug: 'ops' },
      activeMembership: { role: 'ADMIN' },
    });
    orchestration.buildOptimizationSummaryDraft.mockReturnValue({
      planId: 'plan:acme:ops:draft',
      optimizationStatus: 'draft',
      objective: 'Balance cost and operator effort',
      priorities: ['cost', 'operator-effort'],
      preferredStrategy: 'Lean hybrid orchestration draft pending concrete scoring and system-fit evidence.',
      tradeoffs: [],
      variantScores: [],
    });

    const result = await controller.draftOptimizationSummary(
      'plan:acme:ops:draft',
      {
        objective: 'Balance cost and operator effort',
        priorities: ['cost', 'operator-effort'],
      },
      'acme',
      'ops@acme.test',
      'ops',
      'ops.acme.test',
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
    expect(orchestration.buildOptimizationSummaryDraft).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:draft',
      objective: 'Balance cost and operator effort',
      priorities: ['cost', 'operator-effort'],
    });
    expect(result).toMatchObject({
      status: 'optimization-drafted',
      optimizationSummary: {
        planId: 'plan:acme:ops:draft',
        optimizationStatus: 'draft',
        objective: 'Balance cost and operator effort',
        priorities: ['cost', 'operator-effort'],
      },
      context: {
        tenant: { slug: 'acme' },
        activeWorkspace: { slug: 'ops' },
      },
    });
  });

  it('should draft workflow graph in tenant/workspace context', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      activeWorkspace: { id: 'ws_1', slug: 'ops' },
      activeMembership: { role: 'ADMIN' },
    });
    orchestration.buildWorkflowGraphDraft.mockReturnValue({
      planId: 'plan:acme:ops:draft',
      graphStatus: 'draft',
      objective: 'Render a lane-based coordination graph',
      lanes: ['operator', 'nexovaflow'],
      nodes: [],
      edges: [],
      overlays: {
        approvals: [],
        kpis: [],
      },
    });

    const result = await controller.draftWorkflowGraph(
      'plan:acme:ops:draft',
      {
        objective: 'Render a lane-based coordination graph',
        lanes: ['operator', 'nexovaflow'],
      },
      'acme',
      'ops@acme.test',
      'ops',
      'ops.acme.test',
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
    expect(orchestration.buildWorkflowGraphDraft).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:draft',
      objective: 'Render a lane-based coordination graph',
      lanes: ['operator', 'nexovaflow'],
    });
    expect(result).toMatchObject({
      status: 'workflow-graph-drafted',
      workflowGraph: {
        planId: 'plan:acme:ops:draft',
        graphStatus: 'draft',
        objective: 'Render a lane-based coordination graph',
        lanes: ['operator', 'nexovaflow'],
      },
      context: {
        tenant: { slug: 'acme' },
        activeWorkspace: { slug: 'ops' },
      },
    });
  });

  it('should draft execution contracts in tenant/workspace context', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      activeWorkspace: { id: 'ws_1', slug: 'ops' },
      activeMembership: { role: 'ADMIN' },
    });
    orchestration.buildExecutionContractDraft.mockReturnValue({
      planId: 'plan:acme:ops:draft',
      executionContractStatus: 'draft',
      objective: 'Define guarded execution boundaries',
      executionModes: ['human-approved', 'event-driven'],
      childWorkflowContracts: [],
      approvalContracts: [],
      escalationContracts: [],
      rollbackContracts: [],
    });

    const result = await controller.draftExecutionContracts(
      'plan:acme:ops:draft',
      {
        objective: 'Define guarded execution boundaries',
        executionModes: ['human-approved', 'event-driven'],
      },
      'acme',
      'ops@acme.test',
      'ops',
      'ops.acme.test',
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
    expect(orchestration.buildExecutionContractDraft).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:draft',
      objective: 'Define guarded execution boundaries',
      executionModes: ['human-approved', 'event-driven'],
    });
    expect(result).toMatchObject({
      status: 'execution-contracts-drafted',
      executionContracts: {
        planId: 'plan:acme:ops:draft',
        executionContractStatus: 'draft',
        objective: 'Define guarded execution boundaries',
        executionModes: ['human-approved', 'event-driven'],
      },
      context: {
        tenant: { slug: 'acme' },
        activeWorkspace: { slug: 'ops' },
      },
    });
  });
});
