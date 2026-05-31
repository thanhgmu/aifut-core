import { Test, TestingModule } from '@nestjs/testing';
import { MembershipRole } from '@prisma/client';
import { ACCESS_POLICY_METADATA_KEY } from './access-policy.constants';
import { AccessPolicyService } from './access-policy.service';
import { OrchestrationController } from './orchestration.controller';
import { ActorContextService } from './actor-context.service';
import { AiGovernancePersistenceService } from './ai-governance-persistence.service';
import { AiTokenGovernanceService } from './ai-token-governance.service';
import { AuditEventsService } from './audit-events.service';
import { OrchestrationService } from './orchestration.service';
import * as orchestrationAuthContext from './orchestration-auth-context.util';

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
    submitExecutionContract: jest.Mock;
    materializeExecutionRuntime: jest.Mock;
    applyApprovalDecision: jest.Mock;
    dispatchExecutionRun: jest.Mock;
    recordAiGovernanceDispatchOutcome: jest.Mock;
    getExecutionRuntimeHistory: jest.Mock;
    getExecutionRuntimeDiagnostics: jest.Mock;
  };
  let aiTokenGovernance: {
    previewRouting: jest.Mock;
    estimateUsage: jest.Mock;
  };
  let aiGovernancePersistence: {
    buildGatewayDecision: jest.Mock;
    persistUsageEventRecord: jest.Mock;
  };
  let auditEvents: {
    write: jest.Mock;
    listAiGovernanceApprovalDispatchResumes: jest.Mock;
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
      submitExecutionContract: jest.fn(),
      materializeExecutionRuntime: jest.fn(),
      applyApprovalDecision: jest.fn(),
      dispatchExecutionRun: jest.fn(),
      recordAiGovernanceDispatchOutcome: jest.fn().mockImplementation((input) => ({
        outcome: input.outcome,
      })),
      getExecutionRuntimeHistory: jest.fn(),
      getExecutionRuntimeDiagnostics: jest.fn(),
    };

    aiTokenGovernance = {
      previewRouting: jest.fn(),
      estimateUsage: jest.fn(),
    };
    aiGovernancePersistence = {
      buildGatewayDecision: jest.fn(),
      persistUsageEventRecord: jest.fn(),
    };
    auditEvents = {
      write: jest.fn(),
      listAiGovernanceApprovalDispatchResumes: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrchestrationController],
      providers: [
        {
          provide: ActorContextService,
          useValue: actorContext,
        },
        {
          provide: AccessPolicyService,
          useValue: { resolveAndRequire: jest.fn() },
        },
        {
          provide: OrchestrationService,
          useValue: orchestration,
        },
        {
          provide: AiTokenGovernanceService,
          useValue: aiTokenGovernance,
        },
        {
          provide: AiGovernancePersistenceService,
          useValue: aiGovernancePersistence,
        },
        {
          provide: AuditEventsService,
          useValue: auditEvents,
        },
      ],
    }).compile();

    controller = module.get<OrchestrationController>(OrchestrationController);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should guard runtime history, diagnostics, and approval-history reads as operator controls', () => {
    const requirement = {
      minimumRole: MembershipRole.OPERATOR,
      requireWorkspace: true,
      scope: 'operator-control',
    };

    expect(
      Reflect.getMetadata(
        ACCESS_POLICY_METADATA_KEY,
        controller.getExecutionRuntimeHistory,
      ),
    ).toEqual(requirement);
    expect(
      Reflect.getMetadata(
        ACCESS_POLICY_METADATA_KEY,
        controller.getExecutionRuntimeDiagnostics,
      ),
    ).toEqual(requirement);
    expect(
      Reflect.getMetadata(
        ACCESS_POLICY_METADATA_KEY,
        controller.getExecutionRuntimeApprovalHistory,
      ),
    ).toEqual(requirement);
  });

  it('should resolve orchestration context from bearer identity when explicit tenant/user headers are absent', async () => {
    jest
      .spyOn(orchestrationAuthContext, 'resolveAuthUserId')
      .mockReturnValue('user_1');

    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      user: { id: 'user_1', email: 'owner@acme.test' },
      activeWorkspace: { id: 'ws_1', slug: 'ops' },
      activeMembership: { role: 'ADMIN' },
    });
    orchestration.buildRoadmapDraft.mockReturnValue({
      id: 'draft:acme:ops:roadmap',
      sourceKind: 'note',
      title: 'Runtime hardening',
      interpretationStatus: 'pending',
    });

    await controller.ingestRoadmap(
      {
        title: 'Runtime hardening',
        sourceKind: 'note',
        content: 'Use bearer identity when available',
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'Bearer token-123',
    );

    expect(actorContext.resolve).toHaveBeenCalledWith({
      tenantSlug: undefined,
      userEmail: undefined,
      workspaceSlug: undefined,
      hostname: undefined,
      authUserId: 'user_1',
    });
  });

  it('should preview AI routing in resolved tenant/workspace context', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      activeWorkspace: { id: 'ws_1', slug: 'ops' },
      activeMembership: { role: 'ADMIN' },
    });
    aiTokenGovernance.previewRouting.mockReturnValue({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      packageKey: 'operator-pro',
      routingDecision: 'model-inference-lane',
      recommendedTier: 'tier-2',
      selectedModel: {
        providerKey: 'openai',
        modelKey: 'gpt-balanced',
      },
    });

    const result = await controller.previewAiRouting(
      {
        packagePolicy: {
          packageKey: 'operator-pro',
          allowByoKeys: true,
          allowedModelKeys: ['gpt-balanced', 'gpt-mini'],
        },
        modelPolicies: [
          {
            providerKey: 'openai',
            modelKey: 'gpt-balanced',
            inputTokenCost: 0.000002,
            outputTokenCost: 0.000006,
            allowedCredentialModes: ['aifut-managed', 'byo'],
          },
          {
            providerKey: 'openai',
            modelKey: 'gpt-mini',
            inputTokenCost: 0.000001,
            outputTokenCost: 0.000002,
            allowedCredentialModes: ['aifut-managed'],
          },
        ],
        taskType: 'workflow-draft-generation',
        riskLevel: 'medium',
        qualityRequirement: 'balanced',
        latencyBudget: 'interactive',
        costBudgetClass: 'balanced',
        preferCredentialMode: 'byo',
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
    expect(aiTokenGovernance.previewRouting).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      packagePolicy: {
        packageKey: 'operator-pro',
        allowByoKeys: true,
        allowedModelKeys: ['gpt-balanced', 'gpt-mini'],
      },
      modelPolicies: [
        {
          providerKey: 'openai',
          modelKey: 'gpt-balanced',
          inputTokenCost: 0.000002,
          outputTokenCost: 0.000006,
          allowedCredentialModes: ['aifut-managed', 'byo'],
        },
        {
          providerKey: 'openai',
          modelKey: 'gpt-mini',
          inputTokenCost: 0.000001,
          outputTokenCost: 0.000002,
          allowedCredentialModes: ['aifut-managed'],
        },
      ],
      taskType: 'workflow-draft-generation',
      riskLevel: 'medium',
      qualityRequirement: 'balanced',
      latencyBudget: 'interactive',
      costBudgetClass: 'balanced',
      preferCredentialMode: 'byo',
      deterministicEligible: undefined,
      cacheHitAvailable: undefined,
      quotaPressure: undefined,
    });
    expect(result).toMatchObject({
      status: 'ai-routing-previewed',
      aiRoutingPreview: {
        packageKey: 'operator-pro',
        recommendedTier: 'tier-2',
        selectedModel: {
          modelKey: 'gpt-balanced',
        },
      },
      next: ['model-routing', 'package-quota-enforcement', 'usage-estimation'],
    });
  });

  it('should estimate AI usage in resolved tenant/workspace context', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      activeWorkspace: { id: 'ws_1', slug: 'ops' },
      activeMembership: { role: 'ADMIN' },
    });
    aiTokenGovernance.estimateUsage.mockReturnValue({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      packageKey: 'free-ecosystem',
      providerKey: 'openai',
      modelKey: 'gpt-lean',
      credentialMode: 'byo',
      totalTokens: 1500,
      estimatedCharge: 0.0003,
      quotaStatus: 'usage-chargeable',
    });

    const result = await controller.estimateAiUsage(
      {
        packagePolicy: {
          packageKey: 'free-ecosystem',
          allowByoKeys: true,
          platformFeePercentForByo: 10,
          allowedModelKeys: ['gpt-lean'],
        },
        modelPolicy: {
          providerKey: 'openai',
          modelKey: 'gpt-lean',
          inputTokenCost: 0.000001,
          outputTokenCost: 0.000003,
          allowedCredentialModes: ['byo'],
        },
        credentialMode: 'byo',
        estimatedInputTokens: 1000,
        estimatedOutputTokens: 500,
        alreadyUsedMonthlyTokens: 2000,
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
    expect(aiTokenGovernance.estimateUsage).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      packagePolicy: {
        packageKey: 'free-ecosystem',
        allowByoKeys: true,
        platformFeePercentForByo: 10,
        allowedModelKeys: ['gpt-lean'],
      },
      modelPolicy: {
        providerKey: 'openai',
        modelKey: 'gpt-lean',
        inputTokenCost: 0.000001,
        outputTokenCost: 0.000003,
        allowedCredentialModes: ['byo'],
      },
      credentialMode: 'byo',
      estimatedInputTokens: 1000,
      estimatedOutputTokens: 500,
      alreadyUsedMonthlyTokens: 2000,
    });
    expect(result).toMatchObject({
      status: 'ai-usage-estimated',
      aiUsageEstimate: {
        packageKey: 'free-ecosystem',
        credentialMode: 'byo',
        totalTokens: 1500,
      },
      next: ['token-usage-ledger', 'package-quota-enforcement', 'model-routing'],
    });
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
      runtimeBindings: [
        {
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
          deliveryMode: 'webhook',
          approvalRequired: true,
        },
      ],
      childWorkflowContracts: [
        {
          workflowKey: 'qualify-lead',
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
          triggerMode: 'webhook',
          approvalRequired: true,
          approvalCheckpointKey: 'approve-copy',
        },
      ],
      approvalContracts: [
        {
          checkpointKey: 'approve-copy',
          approverRole: 'operator',
          channel: 'telegram',
          escalationMode: 'timeout-escalate',
          required: true,
        },
      ],
      escalationContracts: [
        {
          escalationKey: 'copy-timeout',
          fromCheckpointKey: 'approve-copy',
          targetRole: 'manager',
          triggerMode: 'timeout',
          delayMinutes: 30,
        },
      ],
      rollbackContracts: [
        {
          rollbackKey: 'undo-router',
          fromCheckpointKey: 'approve-copy',
          targetSystemKey: 'lead-router',
          strategy: 'compensate',
          preserveArtifacts: true,
        },
      ],
      draftSummary: {
        executionModeCount: 2,
        runtimeBindingCount: 1,
        approvalRequiredRuntimeBindingCount: 1,
        childWorkflowContractCount: 1,
        approvalRequiredChildWorkflowCount: 1,
        childWorkflowCheckpointCount: 1,
        approvalContractCount: 1,
        requiredApprovalContractCount: 1,
        escalationContractCount: 1,
        rollbackContractCount: 1,
      },
    });

    const result = await controller.draftExecutionContracts(
      'plan:acme:ops:draft',
      {
        objective: 'Define guarded execution boundaries',
        executionModes: ['human-approved', 'event-driven'],
        runtimeBindings: [
          {
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            deliveryMode: 'webhook',
            approvalRequired: true,
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: 'qualify-lead',
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            triggerMode: 'webhook',
            approvalRequired: true,
            approvalCheckpointKey: 'approve-copy',
          },
        ],
        approvalContracts: [
          {
            checkpointKey: 'approve-copy',
            approverRole: ' operator ',
            channel: ' telegram ',
            escalationMode: ' timeout-escalate ',
            required: true,
          },
        ],
        escalationContracts: [
          {
            escalationKey: ' copy-timeout ',
            fromCheckpointKey: ' approve-copy ',
            targetRole: ' manager ',
            triggerMode: ' timeout ',
            delayMinutes: 30,
          },
        ],
        rollbackContracts: [
          {
            rollbackKey: ' undo-router ',
            fromCheckpointKey: ' approve-copy ',
            targetSystemKey: ' lead-router ',
            strategy: ' compensate ',
            preserveArtifacts: true,
          },
        ],
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
      runtimeBindings: [
        {
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
          deliveryMode: 'webhook',
          approvalRequired: true,
        },
      ],
      childWorkflowContracts: [
        {
          workflowKey: 'qualify-lead',
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
          triggerMode: 'webhook',
          approvalRequired: true,
          approvalCheckpointKey: 'approve-copy',
        },
      ],
      approvalContracts: [
        {
          checkpointKey: 'approve-copy',
          approverRole: ' operator ',
          channel: ' telegram ',
          escalationMode: ' timeout-escalate ',
          required: true,
        },
      ],
      escalationContracts: [
        {
          escalationKey: ' copy-timeout ',
          fromCheckpointKey: ' approve-copy ',
          targetRole: ' manager ',
          triggerMode: ' timeout ',
          delayMinutes: 30,
        },
      ],
      rollbackContracts: [
        {
          rollbackKey: ' undo-router ',
          fromCheckpointKey: ' approve-copy ',
          targetSystemKey: ' lead-router ',
          strategy: ' compensate ',
          preserveArtifacts: true,
        },
      ],
    });
    expect(result).toMatchObject({
      status: 'execution-contracts-drafted',
      executionContracts: {
        planId: 'plan:acme:ops:draft',
        executionContractStatus: 'draft',
        objective: 'Define guarded execution boundaries',
        executionModes: ['human-approved', 'event-driven'],
        runtimeBindings: [
          {
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            deliveryMode: 'webhook',
            approvalRequired: true,
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: 'qualify-lead',
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            triggerMode: 'webhook',
            approvalRequired: true,
            approvalCheckpointKey: 'approve-copy',
          },
        ],
        approvalContracts: [
          {
            checkpointKey: 'approve-copy',
            approverRole: 'operator',
            channel: 'telegram',
            escalationMode: 'timeout-escalate',
            required: true,
          },
        ],
        escalationContracts: [
          {
            escalationKey: 'copy-timeout',
            fromCheckpointKey: 'approve-copy',
            targetRole: 'manager',
            triggerMode: 'timeout',
            delayMinutes: 30,
          },
        ],
        rollbackContracts: [
          {
            rollbackKey: 'undo-router',
            fromCheckpointKey: 'approve-copy',
            targetSystemKey: 'lead-router',
            strategy: 'compensate',
            preserveArtifacts: true,
          },
        ],
        draftSummary: {
          executionModeCount: 2,
          runtimeBindingCount: 1,
          approvalRequiredRuntimeBindingCount: 1,
          childWorkflowContractCount: 1,
          approvalRequiredChildWorkflowCount: 1,
          childWorkflowCheckpointCount: 1,
          approvalContractCount: 1,
          requiredApprovalContractCount: 1,
          escalationContractCount: 1,
          rollbackContractCount: 1,
        },
      },
      context: {
        tenant: { slug: 'acme' },
        activeWorkspace: { slug: 'ops' },
      },
    });
  });

  it('should submit execution contracts in tenant/workspace context', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      activeWorkspace: { id: 'ws_1', slug: 'ops' },
      activeMembership: { role: 'ADMIN' },
    });
    orchestration.submitExecutionContract.mockReturnValue({
      planId: 'plan:acme:ops:draft',
      executionContractStatus: 'submitted',
      submittedBy: 'ops@acme.test',
      submissionNotes: 'Ready for guarded rollout',
      storedRuntimeBindings: [
        {
          bindingKey: 'plan:acme:ops:draft:binding:1',
          tenantSlug: 'acme',
          workspaceSlug: 'ops',
          planId: 'plan:acme:ops:draft',
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
          deliveryMode: 'webhook',
          approvalRequired: true,
          persistenceStatus: 'pending',
        },
      ],
      childWorkflowContractRecords: [
        {
          contractKey: 'plan:acme:ops:draft:child:1',
          persistenceStatus: 'pending',
          runtimeBindingKey: 'plan:acme:ops:draft:binding:1',
          workflowKey: 'qualify-lead',
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
          triggerMode: 'webhook',
          approvalRequired: true,
          approvalCheckpointKey: 'approve-copy',
        },
      ],
      storedChildWorkflowContracts: [
        {
          contractKey: 'plan:acme:ops:draft:child:1',
          tenantSlug: 'acme',
          workspaceSlug: 'ops',
          planId: 'plan:acme:ops:draft',
          persistenceStatus: 'pending',
          workflowKey: 'qualify-lead',
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
          triggerMode: 'webhook',
          approvalRequired: true,
          approvalCheckpointKey: 'approve-copy',
          linkedRunnerKey: 'plan:acme:ops:draft:child:1:runner',
        },
      ],
      storedApprovalDispatches: [
        {
          dispatchKey: 'plan:acme:ops:draft:approval:1',
          tenantSlug: 'acme',
          workspaceSlug: 'ops',
          checkpointKey: 'approve-copy',
          approverRole: 'operator',
          dispatchStatus: 'pending',
          required: true,
          linkedChildContractKeys: ['plan:acme:ops:draft:child:1'],
        },
      ],
      storedEscalationContracts: [
        {
          escalationRecordKey: 'plan:acme:ops:draft:escalation:1',
          tenantSlug: 'acme',
          checkpointKey: 'approve-copy',
        },
      ],
      storedRollbackContracts: [
        {
          rollbackRecordKey: 'plan:acme:ops:draft:rollback:1',
          tenantSlug: 'acme',
          targetSystemKey: 'lead-router',
        },
      ],
      storedExecutionRunnerRecords: [
        {
          runnerKey: 'plan:acme:ops:draft:child:1:runner',
          tenantSlug: 'acme',
          workspaceSlug: 'ops',
          contractKey: 'plan:acme:ops:draft:child:1',
          runtimeBindingKey: 'plan:acme:ops:draft:binding:1',
          workflowKey: 'qualify-lead',
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
          runnerStatus: 'pending',
          triggerMode: 'webhook',
          linkedApprovalDispatchKeys: ['plan:acme:ops:draft:approval:1'],
          linkedRollbackRecordKeys: ['plan:acme:ops:draft:rollback:1'],
        },
      ],
      runtimeBindingBatch: {
        batchKey: 'plan:acme:ops:draft:runtime-binding',
        status: 'pending',
        records: [
          {
            bindingKey: 'plan:acme:ops:draft:binding:1',
            persistenceStatus: 'pending',
            workspaceSlug: 'ops',
          },
        ],
      },
      contractPersistenceBatch: {
        batchKey: 'plan:acme:ops:draft:persistence',
        status: 'pending',
        records: [
          {
            contractKey: 'plan:acme:ops:draft:child:1',
            persistenceStatus: 'pending',
            workspaceSlug: 'ops',
            runtimeBindingKey: 'plan:acme:ops:draft:binding:1',
          },
        ],
      },
      approvalDispatchBatch: {
        batchKey: 'plan:acme:ops:draft:approval-dispatch',
        status: 'pending',
        records: [
          {
            dispatchKey: 'plan:acme:ops:draft:approval:1',
            dispatchStatus: 'pending',
            workspaceSlug: 'ops',
          },
        ],
      },
      escalationBatch: {
        batchKey: 'plan:acme:ops:draft:escalation',
        status: 'pending',
        records: [
          {
            escalationRecordKey: 'plan:acme:ops:draft:escalation:1',
            persistenceStatus: 'pending',
            workspaceSlug: 'ops',
          },
        ],
      },
      rollbackBatch: {
        batchKey: 'plan:acme:ops:draft:rollback',
        status: 'pending',
        records: [
          {
            rollbackRecordKey: 'plan:acme:ops:draft:rollback:1',
            persistenceStatus: 'pending',
            workspaceSlug: 'ops',
          },
        ],
      },
      executionRunnerBatch: {
        batchKey: 'plan:acme:ops:draft:execution-runner',
        status: 'pending',
        records: [
          {
            runnerKey: 'plan:acme:ops:draft:child:1:runner',
            runnerStatus: 'pending',
            workspaceSlug: 'ops',
            runtimeBindingKey: 'plan:acme:ops:draft:binding:1',
            linkedApprovalDispatchKeys: ['plan:acme:ops:draft:approval:1'],
            linkedRollbackRecordKeys: ['plan:acme:ops:draft:rollback:1'],
          },
        ],
      },
      runtimeBindingTopology: [
        {
          bindingKey: 'plan:acme:ops:draft:binding:1',
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
          deliveryMode: 'webhook',
          approvalRequired: true,
          linkedChildWorkflowContracts: [
            {
              contractKey: 'plan:acme:ops:draft:child:1',
              workflowKey: 'qualify-lead',
              triggerMode: 'webhook',
              approvalRequired: true,
              approvalCheckpointKey: 'approve-copy',
            },
          ],
          linkedRunnerKeys: ['plan:acme:ops:draft:child:1:runner'],
        },
      ],
      approvalDispatchQueue: [
        {
          dispatchKey: 'plan:acme:ops:draft:approval:1',
          dispatchStatus: 'pending',
          checkpointKey: 'approve-copy',
          approverRole: 'operator',
          channel: 'telegram',
          escalationMode: 'timeout-escalate',
          required: true,
          linkedChildContractKeys: ['plan:acme:ops:draft:child:1'],
          linkedEscalationRecordKeys: ['plan:acme:ops:draft:escalation:1'],
        },
      ],
      escalationTopology: [
        {
          escalationRecordKey: 'plan:acme:ops:draft:escalation:1',
          escalationKey: 'copy-timeout',
        },
      ],
      rollbackTopology: [
        {
          rollbackRecordKey: 'plan:acme:ops:draft:rollback:1',
          rollbackKey: 'undo-router',
        },
      ],
      approvalRoutingTopology: [
        {
          contractKey: 'plan:acme:ops:draft:child:1',
          workflowKey: 'qualify-lead',
          approvalRequired: true,
          approvalCheckpointKey: 'approve-copy',
          requiredApprovalDispatchKeys: ['plan:acme:ops:draft:approval:1'],
          linkedEscalationRecordKeys: ['plan:acme:ops:draft:escalation:1'],
        },
      ],
      executionRunnerTopology: [
        {
          runnerKey: 'plan:acme:ops:draft:child:1:runner',
          contractKey: 'plan:acme:ops:draft:child:1',
          runtimeBindingKey: 'plan:acme:ops:draft:binding:1',
          workflowKey: 'qualify-lead',
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
          triggerMode: 'webhook',
          runnerStatus: 'pending',
          linkedApprovalDispatchKeys: ['plan:acme:ops:draft:approval:1'],
          linkedRollbackRecordKeys: ['plan:acme:ops:draft:rollback:1'],
        },
      ],
      executionRunnerHints: [
        {
          contractKey: 'plan:acme:ops:draft:child:1',
          runnerStatus: 'pending',
          workflowKey: 'qualify-lead',
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
          triggerMode: 'webhook',
          runtimeBindingKey: 'plan:acme:ops:draft:binding:1',
          linkedApprovalDispatchKeys: ['plan:acme:ops:draft:approval:1'],
          linkedRollbackRecordKeys: ['plan:acme:ops:draft:rollback:1'],
        },
      ],
      contractSummary: {
        executionModeCount: 1,
        runtimeBindingCount: 1,
        childWorkflowContractCount: 1,
        approvalContractCount: 1,
        escalationContractCount: 1,
        rollbackContractCount: 1,
      },
    });

    const result = await controller.submitExecutionContracts(
      'plan:acme:ops:draft',
      {
        objective: 'Guard multi-runtime execution',
        executionModes: ['human-approved'],
        runtimeBindings: [
          {
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            deliveryMode: 'webhook',
            approvalRequired: true,
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: 'qualify-lead',
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            triggerMode: 'webhook',
            approvalRequired: true,
            approvalCheckpointKey: 'approve-copy',
          },
        ],
        approvalContracts: [
          {
            checkpointKey: 'approve-copy',
            approverRole: 'operator',
            channel: 'telegram',
            escalationMode: 'timeout-escalate',
            required: true,
          },
        ],
        escalationContracts: [
          {
            escalationKey: 'copy-timeout',
            fromCheckpointKey: 'approve-copy',
            targetRole: 'manager',
            triggerMode: 'timeout',
            delayMinutes: 30,
          },
        ],
        rollbackContracts: [
          {
            rollbackKey: 'undo-router',
            fromCheckpointKey: 'approve-copy',
            targetSystemKey: 'lead-router',
            strategy: 'compensate',
            preserveArtifacts: true,
          },
        ],
        submissionNotes: 'Ready for guarded rollout',
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
    expect(orchestration.submitExecutionContract).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:draft',
      objective: 'Guard multi-runtime execution',
      executionModes: ['human-approved'],
      runtimeBindings: [
        {
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
          deliveryMode: 'webhook',
          approvalRequired: true,
        },
      ],
      childWorkflowContracts: [
        {
          workflowKey: 'qualify-lead',
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
          triggerMode: 'webhook',
          approvalRequired: true,
          approvalCheckpointKey: 'approve-copy',
        },
      ],
      approvalContracts: [
        {
          checkpointKey: 'approve-copy',
          approverRole: 'operator',
          channel: 'telegram',
          escalationMode: 'timeout-escalate',
          required: true,
        },
      ],
      escalationContracts: [
        {
          escalationKey: 'copy-timeout',
          fromCheckpointKey: 'approve-copy',
          targetRole: 'manager',
          triggerMode: 'timeout',
          delayMinutes: 30,
        },
      ],
      rollbackContracts: [
        {
          rollbackKey: 'undo-router',
          fromCheckpointKey: 'approve-copy',
          targetSystemKey: 'lead-router',
          strategy: 'compensate',
          preserveArtifacts: true,
        },
      ],
      submittedBy: 'ops@acme.test',
      submissionNotes: 'Ready for guarded rollout',
    });
    expect(result).toMatchObject({
      status: 'execution-contracts-submitted',
      executionContractSubmission: {
        planId: 'plan:acme:ops:draft',
        executionContractStatus: 'submitted',
        submittedBy: 'ops@acme.test',
        storedRuntimeBindings: [
          {
            bindingKey: 'plan:acme:ops:draft:binding:1',
            tenantSlug: 'acme',
          },
        ],
        storedChildWorkflowContracts: [
          {
            contractKey: 'plan:acme:ops:draft:child:1',
            tenantSlug: 'acme',
            linkedRunnerKey: 'plan:acme:ops:draft:child:1:runner',
          },
        ],
        storedApprovalDispatches: [
          {
            dispatchKey: 'plan:acme:ops:draft:approval:1',
            tenantSlug: 'acme',
            linkedChildContractKeys: ['plan:acme:ops:draft:child:1'],
          },
        ],
        storedEscalationContracts: [
          {
            escalationRecordKey: 'plan:acme:ops:draft:escalation:1',
            tenantSlug: 'acme',
          },
        ],
        storedRollbackContracts: [
          {
            rollbackRecordKey: 'plan:acme:ops:draft:rollback:1',
            tenantSlug: 'acme',
          },
        ],
        storedExecutionRunnerRecords: [
          {
            runnerKey: 'plan:acme:ops:draft:child:1:runner',
            contractKey: 'plan:acme:ops:draft:child:1',
          },
        ],
        runtimeBindingBatch: {
          batchKey: 'plan:acme:ops:draft:runtime-binding',
          status: 'pending',
        },
        contractPersistenceBatch: {
          batchKey: 'plan:acme:ops:draft:persistence',
          status: 'pending',
        },
        approvalDispatchBatch: {
          batchKey: 'plan:acme:ops:draft:approval-dispatch',
          status: 'pending',
        },
        escalationBatch: {
          batchKey: 'plan:acme:ops:draft:escalation',
          status: 'pending',
        },
        rollbackBatch: {
          batchKey: 'plan:acme:ops:draft:rollback',
          status: 'pending',
        },
        executionRunnerBatch: {
          batchKey: 'plan:acme:ops:draft:execution-runner',
          status: 'pending',
        },
        approvalRoutingTopology: [
          {
            contractKey: 'plan:acme:ops:draft:child:1',
            requiredApprovalDispatchKeys: ['plan:acme:ops:draft:approval:1'],
          },
        ],
        executionRunnerTopology: [
          {
            runnerKey: 'plan:acme:ops:draft:child:1:runner',
            contractKey: 'plan:acme:ops:draft:child:1',
            runtimeBindingKey: 'plan:acme:ops:draft:binding:1',
          },
        ],
        runtimeBindingTopology: [
          {
            bindingKey: 'plan:acme:ops:draft:binding:1',
            runtimeKey: 'n8n',
            linkedRunnerKeys: ['plan:acme:ops:draft:child:1:runner'],
          },
        ],
        approvalDispatchQueue: [
          {
            dispatchKey: 'plan:acme:ops:draft:approval:1',
            dispatchStatus: 'pending',
            checkpointKey: 'approve-copy',
            linkedChildContractKeys: ['plan:acme:ops:draft:child:1'],
          },
        ],
        escalationTopology: [
          {
            escalationRecordKey: 'plan:acme:ops:draft:escalation:1',
            escalationKey: 'copy-timeout',
          },
        ],
        rollbackTopology: [
          {
            rollbackRecordKey: 'plan:acme:ops:draft:rollback:1',
            rollbackKey: 'undo-router',
          },
        ],
        executionRunnerHints: [
          {
            contractKey: 'plan:acme:ops:draft:child:1',
            runnerStatus: 'pending',
            workflowKey: 'qualify-lead',
            runtimeBindingKey: 'plan:acme:ops:draft:binding:1',
            linkedApprovalDispatchKeys: ['plan:acme:ops:draft:approval:1'],
            linkedRollbackRecordKeys: ['plan:acme:ops:draft:rollback:1'],
          },
        ],
        contractSummary: {
          executionModeCount: 1,
          runtimeBindingCount: 1,
          childWorkflowContractCount: 1,
        },
      },
      context: {
        tenant: { slug: 'acme' },
        activeWorkspace: { slug: 'ops' },
      },
    });
  });

  it('should prefer orchestration execution-contract headers over query and body context', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      activeWorkspace: { id: 'ws_1', slug: 'ops' },
      activeMembership: { role: 'ADMIN' },
    });
    orchestration.buildExecutionContractDraft.mockReturnValue({
      planId: 'plan:acme:ops:draft',
      executionContractStatus: 'draft',
      objective: 'Guard multi-runtime execution',
      executionModes: ['human-approved'],
      runtimeBindings: [
        {
          runtimeKey: 'openclaw',
          systemKey: 'ops-agent',
          deliveryMode: 'human-review',
          approvalRequired: true,
        },
      ],
      childWorkflowContracts: [
        {
          workflowKey: 'handoff-ops',
          runtimeKey: 'openclaw',
          systemKey: 'ops-agent',
          triggerMode: 'human-review',
          approvalRequired: true,
        },
      ],
      approvalContracts: [
        {
          checkpointKey: 'approve-ops',
          approverRole: 'operator',
          channel: 'web-ui',
          escalationMode: 'manager-review',
          required: false,
        },
      ],
      escalationContracts: [
        {
          escalationKey: 'ops-review',
          fromCheckpointKey: 'approve-ops',
          targetRole: 'ops-manager',
          triggerMode: 'manual',
          delayMinutes: 0,
        },
      ],
      rollbackContracts: [
        {
          rollbackKey: 'notify-ops',
          fromCheckpointKey: 'approve-ops',
          targetSystemKey: 'ops-agent',
          strategy: 'manual-review',
          preserveArtifacts: false,
        },
      ],
    });

    const result = await controller.draftExecutionContracts(
      'plan:acme:ops:draft',
      {
        tenantSlug: 'body-tenant',
        userEmail: 'body@acme.test',
        workspaceSlug: 'body-workspace',
        objective: 'Guard multi-runtime execution',
        executionModes: ['human-approved'],
        runtimeBindings: [
          {
            runtimeKey: ' openclaw ',
            systemKey: ' ops-agent ',
            deliveryMode: ' human-review ',
            approvalRequired: true,
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: ' handoff-ops ',
            runtimeKey: ' openclaw ',
            systemKey: ' ops-agent ',
            triggerMode: ' human-review ',
            approvalRequired: true,
          },
        ],
        approvalContracts: [
          {
            checkpointKey: ' approve-ops ',
            approverRole: ' operator ',
            channel: ' web-ui ',
            escalationMode: ' manager-review ',
            required: false,
          },
        ],
        escalationContracts: [
          {
            escalationKey: ' ops-review ',
            fromCheckpointKey: ' approve-ops ',
            targetRole: ' ops-manager ',
            triggerMode: ' manual ',
            delayMinutes: -5,
          },
        ],
        rollbackContracts: [
          {
            rollbackKey: ' notify-ops ',
            fromCheckpointKey: ' approve-ops ',
            targetSystemKey: ' ops-agent ',
            strategy: ' manual-review ',
          },
        ],
      },
      'acme',
      'ops@acme.test',
      'ops',
      'forwarded.ops.acme.test',
      'fallback.ops.acme.test',
      'query-tenant',
      'query@acme.test',
      'query-workspace',
      'query.ops.acme.test',
    );

    expect(actorContext.resolve).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      hostname: 'forwarded.ops.acme.test',
    });
    expect(orchestration.buildExecutionContractDraft).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:draft',
      objective: 'Guard multi-runtime execution',
      executionModes: ['human-approved'],
      runtimeBindings: [
        {
          runtimeKey: ' openclaw ',
          systemKey: ' ops-agent ',
          deliveryMode: ' human-review ',
          approvalRequired: true,
        },
      ],
      childWorkflowContracts: [
        {
          workflowKey: ' handoff-ops ',
          runtimeKey: ' openclaw ',
          systemKey: ' ops-agent ',
          triggerMode: ' human-review ',
          approvalRequired: true,
        },
      ],
      approvalContracts: [
        {
          checkpointKey: ' approve-ops ',
          approverRole: ' operator ',
          channel: ' web-ui ',
          escalationMode: ' manager-review ',
          required: false,
        },
      ],
      escalationContracts: [
        {
          escalationKey: ' ops-review ',
          fromCheckpointKey: ' approve-ops ',
          targetRole: ' ops-manager ',
          triggerMode: ' manual ',
          delayMinutes: -5,
        },
      ],
      rollbackContracts: [
        {
          rollbackKey: ' notify-ops ',
          fromCheckpointKey: ' approve-ops ',
          targetSystemKey: ' ops-agent ',
          strategy: ' manual-review ',
        },
      ],
    });
    expect(result).toMatchObject({
      status: 'execution-contracts-drafted',
      context: {
        tenant: { slug: 'acme' },
        activeWorkspace: { slug: 'ops' },
      },
      executionContracts: {
        planId: 'plan:acme:ops:draft',
        executionContractStatus: 'draft',
        objective: 'Guard multi-runtime execution',
      },
    });
  });

  it('should prefer orchestration execution-contract submission headers over query and body context', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      activeWorkspace: { id: 'ws_1', slug: 'ops' },
      activeMembership: { role: 'ADMIN' },
    });
    orchestration.submitExecutionContract.mockReturnValue({
      planId: 'plan:acme:ops:draft',
      executionContractStatus: 'submitted',
      submittedBy: 'ops@acme.test',
      executionReadinessSummary: {
        blockedRunnerCount: 0,
        awaitingApprovalRunnerCount: 1,
        readyRunnerCount: 0,
        unresolvedChildWorkflowContracts: [],
      },
      contractSummary: {
        executionModeCount: 1,
        runtimeBindingCount: 1,
        childWorkflowContractCount: 1,
        approvalContractCount: 1,
        escalationContractCount: 1,
        rollbackContractCount: 1,
        unresolvedRuntimeBindingCount: 0,
      },
    });

    const result = await controller.submitExecutionContracts(
      'plan:acme:ops:draft',
      {
        tenantSlug: 'body-tenant',
        userEmail: 'body@acme.test',
        workspaceSlug: 'body-workspace',
        objective: 'Guard multi-runtime execution',
        executionModes: ['human-approved'],
        runtimeBindings: [
          {
            runtimeKey: ' openclaw ',
            systemKey: ' ops-agent ',
            deliveryMode: ' human-review ',
            approvalRequired: true,
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: ' handoff-ops ',
            runtimeKey: ' openclaw ',
            systemKey: ' ops-agent ',
            triggerMode: ' human-review ',
            approvalRequired: true,
            approvalCheckpointKey: ' approve-ops ',
          },
        ],
        approvalContracts: [
          {
            checkpointKey: ' approve-ops ',
            approverRole: ' operator ',
            channel: ' web-ui ',
            escalationMode: ' manager-review ',
            required: true,
          },
        ],
        escalationContracts: [
          {
            escalationKey: ' ops-review ',
            fromCheckpointKey: ' approve-ops ',
            targetRole: ' ops-manager ',
            triggerMode: ' manual ',
            delayMinutes: 5,
          },
        ],
        rollbackContracts: [
          {
            rollbackKey: ' notify-ops ',
            fromCheckpointKey: ' approve-ops ',
            targetSystemKey: ' ops-agent ',
            strategy: ' manual-review ',
          },
        ],
        submissionNotes: 'body submission notes',
      },
      'acme',
      'ops@acme.test',
      'ops',
      'forwarded.ops.acme.test',
      'fallback.ops.acme.test',
      'query-tenant',
      'query@acme.test',
      'query-workspace',
      'query.ops.acme.test',
    );

    expect(actorContext.resolve).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      hostname: 'forwarded.ops.acme.test',
    });
    expect(orchestration.submitExecutionContract).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:draft',
      objective: 'Guard multi-runtime execution',
      executionModes: ['human-approved'],
      runtimeBindings: [
        {
          runtimeKey: ' openclaw ',
          systemKey: ' ops-agent ',
          deliveryMode: ' human-review ',
          approvalRequired: true,
        },
      ],
      childWorkflowContracts: [
        {
          workflowKey: ' handoff-ops ',
          runtimeKey: ' openclaw ',
          systemKey: ' ops-agent ',
          triggerMode: ' human-review ',
          approvalRequired: true,
          approvalCheckpointKey: ' approve-ops ',
        },
      ],
      approvalContracts: [
        {
          checkpointKey: ' approve-ops ',
          approverRole: ' operator ',
          channel: ' web-ui ',
          escalationMode: ' manager-review ',
          required: true,
        },
      ],
      escalationContracts: [
        {
          escalationKey: ' ops-review ',
          fromCheckpointKey: ' approve-ops ',
          targetRole: ' ops-manager ',
          triggerMode: ' manual ',
          delayMinutes: 5,
        },
      ],
      rollbackContracts: [
        {
          rollbackKey: ' notify-ops ',
          fromCheckpointKey: ' approve-ops ',
          targetSystemKey: ' ops-agent ',
          strategy: ' manual-review ',
        },
      ],
      submittedBy: 'ops@acme.test',
      submissionNotes: 'body submission notes',
    });
    expect(result).toMatchObject({
      status: 'execution-contracts-submitted',
      context: {
        tenant: { slug: 'acme' },
        activeWorkspace: { slug: 'ops' },
      },
      executionContractSubmission: {
        planId: 'plan:acme:ops:draft',
        executionContractStatus: 'submitted',
        submittedBy: 'ops@acme.test',
        executionReadinessSummary: {
          awaitingApprovalRunnerCount: 1,
        },
        contractSummary: {
          runtimeBindingCount: 1,
          approvalContractCount: 1,
        },
      },
    });
  });

  it('should prefer orchestration execution-contract submission query context over body when headers are absent', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_query', slug: 'query-tenant' },
      activeWorkspace: { id: 'ws_query', slug: 'query-workspace' },
      activeMembership: { role: 'ADMIN' },
    });
    orchestration.submitExecutionContract.mockReturnValue({
      planId: 'plan:query-tenant:query-workspace:draft',
      executionContractStatus: 'submitted',
      submittedBy: 'query@acme.test',
      executionReadinessSummary: {
        blockedRunnerCount: 0,
        awaitingApprovalRunnerCount: 0,
        readyRunnerCount: 1,
        unresolvedChildWorkflowContracts: [],
      },
      contractSummary: {
        executionModeCount: 1,
        runtimeBindingCount: 1,
        childWorkflowContractCount: 1,
        approvalContractCount: 1,
        escalationContractCount: 0,
        rollbackContractCount: 0,
        unresolvedRuntimeBindingCount: 0,
      },
    });

    const result = await controller.submitExecutionContracts(
      'plan:query-tenant:query-workspace:draft',
      {
        tenantSlug: 'body-tenant',
        userEmail: 'body@acme.test',
        workspaceSlug: 'body-workspace',
        objective: 'Body fallback execution submission',
        executionModes: ['human-approved'],
        runtimeBindings: [
          {
            runtimeKey: ' openclaw ',
            systemKey: ' ops-agent ',
            deliveryMode: ' human-review ',
            approvalRequired: true,
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: ' handoff-ops ',
            runtimeKey: ' openclaw ',
            systemKey: ' ops-agent ',
            triggerMode: ' human-review ',
            approvalRequired: true,
            approvalCheckpointKey: ' approve-ops ',
          },
        ],
        approvalContracts: [
          {
            checkpointKey: ' approve-ops ',
            approverRole: ' operator ',
            channel: ' web-ui ',
            required: true,
          },
        ],
        submissionNotes: 'submit via body structures',
      },
      undefined,
      undefined,
      undefined,
      undefined,
      'query-host.acme.test',
      'query-tenant',
      'query@acme.test',
      'query-workspace',
      undefined,
    );

    expect(actorContext.resolve).toHaveBeenCalledWith({
      tenantSlug: 'query-tenant',
      userEmail: 'query@acme.test',
      workspaceSlug: 'query-workspace',
      hostname: 'query-host.acme.test',
    });
    expect(orchestration.submitExecutionContract).toHaveBeenCalledWith({
      tenantSlug: 'query-tenant',
      workspaceSlug: 'query-workspace',
      planId: 'plan:query-tenant:query-workspace:draft',
      objective: 'Body fallback execution submission',
      executionModes: ['human-approved'],
      runtimeBindings: [
        {
          runtimeKey: ' openclaw ',
          systemKey: ' ops-agent ',
          deliveryMode: ' human-review ',
          approvalRequired: true,
        },
      ],
      childWorkflowContracts: [
        {
          workflowKey: ' handoff-ops ',
          runtimeKey: ' openclaw ',
          systemKey: ' ops-agent ',
          triggerMode: ' human-review ',
          approvalRequired: true,
          approvalCheckpointKey: ' approve-ops ',
        },
      ],
      approvalContracts: [
        {
          checkpointKey: ' approve-ops ',
          approverRole: ' operator ',
          channel: ' web-ui ',
          required: true,
        },
      ],
      escalationContracts: undefined,
      rollbackContracts: undefined,
      submittedBy: 'query@acme.test',
      submissionNotes: 'submit via body structures',
    });
    expect(result).toMatchObject({
      status: 'execution-contracts-submitted',
      context: {
        tenant: { slug: 'query-tenant' },
        activeWorkspace: { slug: 'query-workspace' },
      },
      executionContractSubmission: {
        planId: 'plan:query-tenant:query-workspace:draft',
        executionContractStatus: 'submitted',
        submittedBy: 'query@acme.test',
        executionReadinessSummary: {
          readyRunnerCount: 1,
        },
      },
    });
  });

  it('should prefer orchestration execution-contract draft query context over body when headers are absent', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_query', slug: 'query-tenant' },
      activeWorkspace: { id: 'ws_query', slug: 'query-workspace' },
      activeMembership: { role: 'ADMIN' },
    });
    orchestration.buildExecutionContractDraft.mockReturnValue({
      planId: 'plan:query-tenant:query-workspace:draft',
      executionContractStatus: 'draft',
      objective: 'Query fallback execution draft',
      executionModes: ['event-driven'],
      runtimeBindings: [],
      childWorkflowContracts: [],
      approvalContracts: [],
      escalationContracts: [],
      rollbackContracts: [],
    });

    const result = await controller.draftExecutionContracts(
      'plan:query-tenant:query-workspace:draft',
      {
        tenantSlug: 'body-tenant',
        userEmail: 'body@acme.test',
        workspaceSlug: 'body-workspace',
        objective: 'Query fallback execution draft',
        executionModes: ['event-driven'],
      },
      undefined,
      undefined,
      undefined,
      undefined,
      'query-host.acme.test',
      'query-tenant',
      'query@acme.test',
      'query-workspace',
      undefined,
    );

    expect(actorContext.resolve).toHaveBeenCalledWith({
      tenantSlug: 'query-tenant',
      userEmail: 'query@acme.test',
      workspaceSlug: 'query-workspace',
      hostname: 'query-host.acme.test',
    });
    expect(orchestration.buildExecutionContractDraft).toHaveBeenCalledWith({
      tenantSlug: 'query-tenant',
      workspaceSlug: 'query-workspace',
      planId: 'plan:query-tenant:query-workspace:draft',
      objective: 'Query fallback execution draft',
      executionModes: ['event-driven'],
      runtimeBindings: undefined,
      childWorkflowContracts: undefined,
      approvalContracts: undefined,
      escalationContracts: undefined,
      rollbackContracts: undefined,
    });
    expect(result).toMatchObject({
      status: 'execution-contracts-drafted',
      context: {
        tenant: { slug: 'query-tenant' },
        activeWorkspace: { slug: 'query-workspace' },
      },
      executionContracts: {
        planId: 'plan:query-tenant:query-workspace:draft',
        executionContractStatus: 'draft',
        objective: 'Query fallback execution draft',
      },
    });
  });

  it('should preserve body execution-contract draft structures while preferring query context when headers are absent', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_query', slug: 'query-tenant' },
      activeWorkspace: { id: 'ws_query', slug: 'query-workspace' },
      activeMembership: { role: 'ADMIN' },
    });
    orchestration.buildExecutionContractDraft.mockReturnValue({
      planId: 'plan:query-tenant:query-workspace:draft',
      executionContractStatus: 'draft',
      objective: 'Query fallback execution draft',
      executionModes: ['human-approved'],
      runtimeBindings: [
        {
          runtimeKey: 'openclaw',
          systemKey: 'ops-agent',
          deliveryMode: 'human-review',
          approvalRequired: true,
        },
      ],
      childWorkflowContracts: [
        {
          workflowKey: 'handoff-ops',
          runtimeKey: 'openclaw',
          systemKey: 'ops-agent',
          triggerMode: 'human-review',
          approvalRequired: true,
          approvalCheckpointKey: 'approve-ops',
        },
      ],
      approvalContracts: [
        {
          checkpointKey: 'approve-ops',
          approverRole: 'operator',
          channel: 'web-ui',
          escalationMode: 'manager-review',
          required: true,
        },
      ],
      escalationContracts: [
        {
          escalationKey: 'ops-review',
          fromCheckpointKey: 'approve-ops',
          targetRole: 'ops-manager',
          triggerMode: 'manual',
          delayMinutes: 5,
        },
      ],
      rollbackContracts: [
        {
          rollbackKey: 'notify-ops',
          fromCheckpointKey: 'approve-ops',
          targetSystemKey: 'ops-agent',
          strategy: 'manual-review',
          preserveArtifacts: false,
        },
      ],
    });

    const result = await controller.draftExecutionContracts(
      'plan:query-tenant:query-workspace:draft',
      {
        tenantSlug: 'body-tenant',
        userEmail: 'body@acme.test',
        workspaceSlug: 'body-workspace',
        objective: 'Query fallback execution draft',
        executionModes: ['human-approved'],
        runtimeBindings: [
          {
            runtimeKey: ' openclaw ',
            systemKey: ' ops-agent ',
            deliveryMode: ' human-review ',
            approvalRequired: true,
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: ' handoff-ops ',
            runtimeKey: ' openclaw ',
            systemKey: ' ops-agent ',
            triggerMode: ' human-review ',
            approvalRequired: true,
            approvalCheckpointKey: ' approve-ops ',
          },
        ],
        approvalContracts: [
          {
            checkpointKey: ' approve-ops ',
            approverRole: ' operator ',
            channel: ' web-ui ',
            escalationMode: ' manager-review ',
            required: true,
          },
        ],
        escalationContracts: [
          {
            escalationKey: ' ops-review ',
            fromCheckpointKey: ' approve-ops ',
            targetRole: ' ops-manager ',
            triggerMode: ' manual ',
            delayMinutes: 5,
          },
        ],
        rollbackContracts: [
          {
            rollbackKey: ' notify-ops ',
            fromCheckpointKey: ' approve-ops ',
            targetSystemKey: ' ops-agent ',
            strategy: ' manual-review ',
          },
        ],
      },
      undefined,
      undefined,
      undefined,
      undefined,
      'query-host.acme.test',
      'query-tenant',
      'query@acme.test',
      'query-workspace',
      undefined,
    );

    expect(actorContext.resolve).toHaveBeenCalledWith({
      tenantSlug: 'query-tenant',
      userEmail: 'query@acme.test',
      workspaceSlug: 'query-workspace',
      hostname: 'query-host.acme.test',
    });
    expect(orchestration.buildExecutionContractDraft).toHaveBeenCalledWith({
      tenantSlug: 'query-tenant',
      workspaceSlug: 'query-workspace',
      planId: 'plan:query-tenant:query-workspace:draft',
      objective: 'Query fallback execution draft',
      executionModes: ['human-approved'],
      runtimeBindings: [
        {
          runtimeKey: ' openclaw ',
          systemKey: ' ops-agent ',
          deliveryMode: ' human-review ',
          approvalRequired: true,
        },
      ],
      childWorkflowContracts: [
        {
          workflowKey: ' handoff-ops ',
          runtimeKey: ' openclaw ',
          systemKey: ' ops-agent ',
          triggerMode: ' human-review ',
          approvalRequired: true,
          approvalCheckpointKey: ' approve-ops ',
        },
      ],
      approvalContracts: [
        {
          checkpointKey: ' approve-ops ',
          approverRole: ' operator ',
          channel: ' web-ui ',
          escalationMode: ' manager-review ',
          required: true,
        },
      ],
      escalationContracts: [
        {
          escalationKey: ' ops-review ',
          fromCheckpointKey: ' approve-ops ',
          targetRole: ' ops-manager ',
          triggerMode: ' manual ',
          delayMinutes: 5,
        },
      ],
      rollbackContracts: [
        {
          rollbackKey: ' notify-ops ',
          fromCheckpointKey: ' approve-ops ',
          targetSystemKey: ' ops-agent ',
          strategy: ' manual-review ',
        },
      ],
    });
    expect(result).toMatchObject({
      status: 'execution-contracts-drafted',
      context: {
        tenant: { slug: 'query-tenant' },
        activeWorkspace: { slug: 'query-workspace' },
      },
      executionContracts: {
        planId: 'plan:query-tenant:query-workspace:draft',
        executionContractStatus: 'draft',
        runtimeBindings: [
          {
            runtimeKey: 'openclaw',
            systemKey: 'ops-agent',
          },
        ],
        approvalContracts: [
          {
            checkpointKey: 'approve-ops',
          },
        ],
      },
    });
  });

  it('should fall back to body context for orchestration execution-contract drafts when headers and query are absent', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_body', slug: 'body-tenant' },
      activeWorkspace: { id: 'ws_body', slug: 'body-workspace' },
      activeMembership: { role: 'ADMIN' },
    });
    orchestration.buildExecutionContractDraft.mockReturnValue({
      planId: 'plan:body-tenant:body-workspace:draft',
      executionContractStatus: 'draft',
      objective: 'Body fallback execution draft',
      executionModes: ['event-driven'],
      runtimeBindings: [],
      childWorkflowContracts: [],
      approvalContracts: [],
      escalationContracts: [],
      rollbackContracts: [],
    });

    const result = await controller.draftExecutionContracts(
      'plan:body-tenant:body-workspace:draft',
      {
        tenantSlug: 'body-tenant',
        userEmail: 'body@acme.test',
        workspaceSlug: 'body-workspace',
        objective: 'Body fallback execution draft',
        executionModes: ['event-driven'],
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );

    expect(actorContext.resolve).toHaveBeenCalledWith({
      tenantSlug: 'body-tenant',
      userEmail: 'body@acme.test',
      workspaceSlug: 'body-workspace',
      hostname: undefined,
    });
    expect(orchestration.buildExecutionContractDraft).toHaveBeenCalledWith({
      tenantSlug: 'body-tenant',
      workspaceSlug: 'body-workspace',
      planId: 'plan:body-tenant:body-workspace:draft',
      objective: 'Body fallback execution draft',
      executionModes: ['event-driven'],
      runtimeBindings: undefined,
      childWorkflowContracts: undefined,
      approvalContracts: undefined,
      escalationContracts: undefined,
      rollbackContracts: undefined,
    });
    expect(result).toMatchObject({
      status: 'execution-contracts-drafted',
      executionContracts: {
        planId: 'plan:body-tenant:body-workspace:draft',
        executionContractStatus: 'draft',
      },
      context: {
        tenant: { slug: 'body-tenant' },
        activeWorkspace: { slug: 'body-workspace' },
      },
    });
  });

  it('should preserve body execution-contract structures for drafts when headers and query are absent', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_body', slug: 'body-tenant' },
      activeWorkspace: { id: 'ws_body', slug: 'body-workspace' },
      activeMembership: { role: 'ADMIN' },
    });
    orchestration.buildExecutionContractDraft.mockReturnValue({
      planId: 'plan:body-tenant:body-workspace:draft',
      executionContractStatus: 'draft',
      objective: 'Body fallback execution draft',
      executionModes: ['human-approved'],
      runtimeBindings: [
        {
          runtimeKey: 'openclaw',
          systemKey: 'ops-agent',
          deliveryMode: 'human-review',
          approvalRequired: true,
        },
      ],
      childWorkflowContracts: [
        {
          workflowKey: 'handoff-ops',
          runtimeKey: 'openclaw',
          systemKey: 'ops-agent',
          triggerMode: 'human-review',
          approvalRequired: true,
          approvalCheckpointKey: 'approve-ops',
        },
      ],
      approvalContracts: [
        {
          checkpointKey: 'approve-ops',
          approverRole: 'operator',
          channel: 'web-ui',
          escalationMode: 'manager-review',
          required: true,
        },
      ],
      escalationContracts: [
        {
          escalationKey: 'ops-review',
          fromCheckpointKey: 'approve-ops',
          targetRole: 'ops-manager',
          triggerMode: 'manual',
          delayMinutes: 5,
        },
      ],
      rollbackContracts: [
        {
          rollbackKey: 'notify-ops',
          fromCheckpointKey: 'approve-ops',
          targetSystemKey: 'ops-agent',
          strategy: 'manual-review',
          preserveArtifacts: false,
        },
      ],
    });

    const result = await controller.draftExecutionContracts(
      'plan:body-tenant:body-workspace:draft',
      {
        tenantSlug: 'body-tenant',
        userEmail: 'body@acme.test',
        workspaceSlug: 'body-workspace',
        objective: 'Body fallback execution draft',
        executionModes: ['human-approved'],
        runtimeBindings: [
          {
            runtimeKey: ' openclaw ',
            systemKey: ' ops-agent ',
            deliveryMode: ' human-review ',
            approvalRequired: true,
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: ' handoff-ops ',
            runtimeKey: ' openclaw ',
            systemKey: ' ops-agent ',
            triggerMode: ' human-review ',
            approvalRequired: true,
            approvalCheckpointKey: ' approve-ops ',
          },
        ],
        approvalContracts: [
          {
            checkpointKey: ' approve-ops ',
            approverRole: ' operator ',
            channel: ' web-ui ',
            escalationMode: ' manager-review ',
            required: true,
          },
        ],
        escalationContracts: [
          {
            escalationKey: ' ops-review ',
            fromCheckpointKey: ' approve-ops ',
            targetRole: ' ops-manager ',
            triggerMode: ' manual ',
            delayMinutes: 5,
          },
        ],
        rollbackContracts: [
          {
            rollbackKey: ' notify-ops ',
            fromCheckpointKey: ' approve-ops ',
            targetSystemKey: ' ops-agent ',
            strategy: ' manual-review ',
          },
        ],
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );

    expect(orchestration.buildExecutionContractDraft).toHaveBeenCalledWith({
      tenantSlug: 'body-tenant',
      workspaceSlug: 'body-workspace',
      planId: 'plan:body-tenant:body-workspace:draft',
      objective: 'Body fallback execution draft',
      executionModes: ['human-approved'],
      runtimeBindings: [
        {
          runtimeKey: ' openclaw ',
          systemKey: ' ops-agent ',
          deliveryMode: ' human-review ',
          approvalRequired: true,
        },
      ],
      childWorkflowContracts: [
        {
          workflowKey: ' handoff-ops ',
          runtimeKey: ' openclaw ',
          systemKey: ' ops-agent ',
          triggerMode: ' human-review ',
          approvalRequired: true,
          approvalCheckpointKey: ' approve-ops ',
        },
      ],
      approvalContracts: [
        {
          checkpointKey: ' approve-ops ',
          approverRole: ' operator ',
          channel: ' web-ui ',
          escalationMode: ' manager-review ',
          required: true,
        },
      ],
      escalationContracts: [
        {
          escalationKey: ' ops-review ',
          fromCheckpointKey: ' approve-ops ',
          targetRole: ' ops-manager ',
          triggerMode: ' manual ',
          delayMinutes: 5,
        },
      ],
      rollbackContracts: [
        {
          rollbackKey: ' notify-ops ',
          fromCheckpointKey: ' approve-ops ',
          targetSystemKey: ' ops-agent ',
          strategy: ' manual-review ',
        },
      ],
    });
    expect(result).toMatchObject({
      status: 'execution-contracts-drafted',
      executionContracts: {
        planId: 'plan:body-tenant:body-workspace:draft',
        executionContractStatus: 'draft',
        approvalContracts: [
          {
            checkpointKey: 'approve-ops',
          },
        ],
      },
    });
  });

  it('should fall back to body context for orchestration execution-contract submission when headers and query are absent', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_body', slug: 'body-tenant' },
      activeWorkspace: { id: 'ws_body', slug: 'body-workspace' },
      activeMembership: { role: 'ADMIN' },
    });
    orchestration.submitExecutionContract.mockReturnValue({
      planId: 'plan:body-tenant:body-workspace:draft',
      executionContractStatus: 'submitted',
      submittedBy: 'body@acme.test',
      executionReadinessSummary: {
        blockedRunnerCount: 0,
        awaitingApprovalRunnerCount: 0,
        readyRunnerCount: 0,
        unresolvedChildWorkflowContracts: [],
      },
      contractSummary: {
        executionModeCount: 1,
        runtimeBindingCount: 0,
        childWorkflowContractCount: 0,
        approvalContractCount: 0,
        escalationContractCount: 0,
        rollbackContractCount: 0,
        unresolvedRuntimeBindingCount: 0,
      },
    });

    const result = await controller.submitExecutionContracts(
      'plan:body-tenant:body-workspace:draft',
      {
        tenantSlug: 'body-tenant',
        userEmail: 'body@acme.test',
        workspaceSlug: 'body-workspace',
        objective: 'Body fallback execution submission',
        executionModes: ['human-approved'],
        submissionNotes: 'submit via body context',
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );

    expect(actorContext.resolve).toHaveBeenCalledWith({
      tenantSlug: 'body-tenant',
      userEmail: 'body@acme.test',
      workspaceSlug: 'body-workspace',
      hostname: undefined,
    });
    expect(orchestration.submitExecutionContract).toHaveBeenCalledWith({
      tenantSlug: 'body-tenant',
      workspaceSlug: 'body-workspace',
      planId: 'plan:body-tenant:body-workspace:draft',
      objective: 'Body fallback execution submission',
      executionModes: ['human-approved'],
      runtimeBindings: undefined,
      childWorkflowContracts: undefined,
      approvalContracts: undefined,
      escalationContracts: undefined,
      rollbackContracts: undefined,
      submittedBy: 'body@acme.test',
      submissionNotes: 'submit via body context',
    });
    expect(result).toMatchObject({
      status: 'execution-contracts-submitted',
      executionContractSubmission: {
        planId: 'plan:body-tenant:body-workspace:draft',
        executionContractStatus: 'submitted',
        submittedBy: 'body@acme.test',
        executionReadinessSummary: {
          blockedRunnerCount: 0,
          awaitingApprovalRunnerCount: 0,
          readyRunnerCount: 0,
          unresolvedChildWorkflowContracts: [],
        },
        contractSummary: {
          executionModeCount: 1,
          unresolvedRuntimeBindingCount: 0,
        },
      },
      context: {
        tenant: { slug: 'body-tenant' },
        activeWorkspace: { slug: 'body-workspace' },
      },
    });
  });

  it('should preserve body execution-contract structures for submission when headers and query are absent', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_body', slug: 'body-tenant' },
      activeWorkspace: { id: 'ws_body', slug: 'body-workspace' },
      activeMembership: { role: 'ADMIN' },
    });
    orchestration.submitExecutionContract.mockReturnValue({
      planId: 'plan:body-tenant:body-workspace:draft',
      executionContractStatus: 'submitted',
      submittedBy: 'body@acme.test',
      executionReadinessSummary: {
        blockedRunnerCount: 0,
        awaitingApprovalRunnerCount: 1,
        readyRunnerCount: 0,
        unresolvedChildWorkflowContracts: [],
      },
      contractSummary: {
        executionModeCount: 1,
        runtimeBindingCount: 1,
        childWorkflowContractCount: 1,
        approvalContractCount: 1,
        escalationContractCount: 1,
        rollbackContractCount: 1,
        unresolvedRuntimeBindingCount: 0,
      },
    });

    const result = await controller.submitExecutionContracts(
      'plan:body-tenant:body-workspace:draft',
      {
        tenantSlug: 'body-tenant',
        userEmail: 'body@acme.test',
        workspaceSlug: 'body-workspace',
        objective: 'Body fallback execution submission',
        executionModes: ['human-approved'],
        runtimeBindings: [
          {
            runtimeKey: ' openclaw ',
            systemKey: ' ops-agent ',
            deliveryMode: ' human-review ',
            approvalRequired: true,
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: ' handoff-ops ',
            runtimeKey: ' openclaw ',
            systemKey: ' ops-agent ',
            triggerMode: ' human-review ',
            approvalRequired: true,
            approvalCheckpointKey: ' approve-ops ',
          },
        ],
        approvalContracts: [
          {
            checkpointKey: ' approve-ops ',
            approverRole: ' operator ',
            channel: ' web-ui ',
            escalationMode: ' manager-review ',
            required: true,
          },
        ],
        escalationContracts: [
          {
            escalationKey: ' ops-review ',
            fromCheckpointKey: ' approve-ops ',
            targetRole: ' ops-manager ',
            triggerMode: ' manual ',
            delayMinutes: 5,
          },
        ],
        rollbackContracts: [
          {
            rollbackKey: ' notify-ops ',
            fromCheckpointKey: ' approve-ops ',
            targetSystemKey: ' ops-agent ',
            strategy: ' manual-review ',
          },
        ],
        submissionNotes: 'submit via body structures',
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );

    expect(orchestration.submitExecutionContract).toHaveBeenCalledWith({
      tenantSlug: 'body-tenant',
      workspaceSlug: 'body-workspace',
      planId: 'plan:body-tenant:body-workspace:draft',
      objective: 'Body fallback execution submission',
      executionModes: ['human-approved'],
      runtimeBindings: [
        {
          runtimeKey: ' openclaw ',
          systemKey: ' ops-agent ',
          deliveryMode: ' human-review ',
          approvalRequired: true,
        },
      ],
      childWorkflowContracts: [
        {
          workflowKey: ' handoff-ops ',
          runtimeKey: ' openclaw ',
          systemKey: ' ops-agent ',
          triggerMode: ' human-review ',
          approvalRequired: true,
          approvalCheckpointKey: ' approve-ops ',
        },
      ],
      approvalContracts: [
        {
          checkpointKey: ' approve-ops ',
          approverRole: ' operator ',
          channel: ' web-ui ',
          escalationMode: ' manager-review ',
          required: true,
        },
      ],
      escalationContracts: [
        {
          escalationKey: ' ops-review ',
          fromCheckpointKey: ' approve-ops ',
          targetRole: ' ops-manager ',
          triggerMode: ' manual ',
          delayMinutes: 5,
        },
      ],
      rollbackContracts: [
        {
          rollbackKey: ' notify-ops ',
          fromCheckpointKey: ' approve-ops ',
          targetSystemKey: ' ops-agent ',
          strategy: ' manual-review ',
        },
      ],
      submittedBy: 'body@acme.test',
      submissionNotes: 'submit via body structures',
    });
    expect(result).toMatchObject({
      status: 'execution-contracts-submitted',
      executionContractSubmission: {
        planId: 'plan:body-tenant:body-workspace:draft',
        executionContractStatus: 'submitted',
        executionReadinessSummary: {
          awaitingApprovalRunnerCount: 1,
        },
        contractSummary: {
          runtimeBindingCount: 1,
          approvalContractCount: 1,
        },
      },
    });
  });

  it('should activate execution runtime in resolved tenant/workspace context', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      activeWorkspace: { id: 'ws_1', slug: 'ops' },
      activeMembership: { role: 'ADMIN' },
    });
    orchestration.materializeExecutionRuntime.mockReturnValue({
      planId: 'plan:acme:ops:runtime',
      executionContractStatus: 'submitted',
      executionRuntimeStatus: 'materialized',
      liveRuntimeSummary: {
        dispatchedApprovalCount: 1,
        dispatchedRunnerCount: 1,
        awaitingApprovalClearanceCount: 1,
      },
    });

    const result = await controller.activateExecutionRuntime(
      'plan:acme:ops:runtime',
      {
        objective: 'Activate runtime bridge',
        executionModes: ['human-approved', 'event-driven'],
        runtimeBindings: [
          {
            runtimeKey: 'openclaw',
            systemKey: 'ops-agent',
            deliveryMode: 'human-review',
            approvalRequired: true,
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: 'review-ops-brief',
            runtimeKey: 'openclaw',
            systemKey: 'ops-agent',
            triggerMode: 'human-review',
            approvalRequired: true,
            approvalCheckpointKey: 'approve-ops',
          },
        ],
        approvalContracts: [
          {
            checkpointKey: 'approve-ops',
            approverRole: 'operator',
            channel: 'web-ui',
            required: true,
          },
        ],
        submissionNotes: 'activate runtime bridge',
      },
      'acme',
      'ops@acme.test',
      'ops',
      'acme.test',
      'acme.test',
      undefined,
      undefined,
      undefined,
      undefined,
    );

    expect(actorContext.resolve).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      hostname: 'acme.test',
    });
    expect(orchestration.materializeExecutionRuntime).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:runtime',
      objective: 'Activate runtime bridge',
      executionModes: ['human-approved', 'event-driven'],
      runtimeBindings: [
        {
          runtimeKey: 'openclaw',
          systemKey: 'ops-agent',
          deliveryMode: 'human-review',
          approvalRequired: true,
        },
      ],
      childWorkflowContracts: [
        {
          workflowKey: 'review-ops-brief',
          runtimeKey: 'openclaw',
          systemKey: 'ops-agent',
          triggerMode: 'human-review',
          approvalRequired: true,
          approvalCheckpointKey: 'approve-ops',
        },
      ],
      approvalContracts: [
        {
          checkpointKey: 'approve-ops',
          approverRole: 'operator',
          channel: 'web-ui',
          required: true,
        },
      ],
      escalationContracts: undefined,
      rollbackContracts: undefined,
      submittedBy: 'ops@acme.test',
      submissionNotes: 'activate runtime bridge',
    });
    expect(result).toMatchObject({
      status: 'execution-runtime-activated',
      executionRuntime: {
        planId: 'plan:acme:ops:runtime',
        executionRuntimeStatus: 'materialized',
        liveRuntimeSummary: {
          dispatchedApprovalCount: 1,
          dispatchedRunnerCount: 1,
          awaitingApprovalClearanceCount: 1,
        },
      },
      context: {
        tenant: { slug: 'acme' },
        activeWorkspace: { slug: 'ops' },
      },
    });
  });

  it('should apply an execution approval decision in resolved tenant/workspace context', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      activeWorkspace: { id: 'ws_1', slug: 'ops' },
      activeMembership: { role: 'ADMIN' },
    });
    orchestration.applyApprovalDecision.mockReturnValue({
      planId: 'plan:acme:ops:runtime',
      decisionApplicationStatus: 'applied',
      approvalDecision: {
        taskKey: 'plan:acme:ops:runtime:approval:1:task',
        decision: 'approve',
      },
      approvalDecisionSummary: {
        approvedRunCount: 1,
      },
    });

    const result = await controller.applyExecutionApprovalDecision(
      'plan:acme:ops:runtime',
      {
        taskKey: 'plan:acme:ops:runtime:approval:1:task',
        decision: 'approve',
        childWorkflowContracts: [
          {
            workflowKey: 'review-ops-brief',
            runtimeKey: 'openclaw',
            systemKey: 'ops-agent',
            triggerMode: 'human-review',
            approvalRequired: true,
            approvalCheckpointKey: 'approve-ops',
          },
        ],
      },
      'acme',
      'ops@acme.test',
      'ops',
      'acme.test',
      'acme.test',
      undefined,
      undefined,
      undefined,
      undefined,
    );

    expect(orchestration.applyApprovalDecision).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:runtime',
      objective: undefined,
      executionModes: undefined,
      runtimeBindings: undefined,
      childWorkflowContracts: [
        {
          workflowKey: 'review-ops-brief',
          runtimeKey: 'openclaw',
          systemKey: 'ops-agent',
          triggerMode: 'human-review',
          approvalRequired: true,
          approvalCheckpointKey: 'approve-ops',
        },
      ],
      approvalContracts: undefined,
      escalationContracts: undefined,
      rollbackContracts: undefined,
      submittedBy: 'ops@acme.test',
      submissionNotes: undefined,
      taskKey: 'plan:acme:ops:runtime:approval:1:task',
      decision: 'approve',
      decidedBy: 'ops@acme.test',
    });
    expect(result).toMatchObject({
      status: 'execution-approval-decision-applied',
      executionApprovalDecision: {
        decisionApplicationStatus: 'applied',
        approvalDecision: {
          taskKey: 'plan:acme:ops:runtime:approval:1:task',
          decision: 'approve',
        },
      },
    });
  });

  it('should dispatch an execution runtime run in resolved tenant/workspace context', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      activeWorkspace: { id: 'ws_1', slug: 'ops' },
      activeMembership: { role: 'ADMIN' },
    });
    orchestration.dispatchExecutionRun.mockReturnValue({
      planId: 'plan:acme:ops:runtime',
      runnerDispatchStatus: 'applied',
      executionDispatch: {
        runKey: 'plan:acme:ops:runtime:child:1:runner:run',
      },
      executionDispatchSummary: {
        dispatchedRunCount: 1,
      },
    });
    aiGovernancePersistence.buildGatewayDecision.mockResolvedValue({
      featureKey: 'orchestration-runtime',
      taskType: 'dispatch-run',
      selectedLane: 'cheap-model',
      credentialMode: 'aifut-managed',
      quotaPressure: 'normal',
      blockReason: null,
      requiresApproval: false,
      executionPolicy: {
        canDispatch: true,
        canAutoDispatch: true,
        requiresHumanApproval: false,
        shouldRecordUsageEvent: true,
      },
    });
    aiGovernancePersistence.persistUsageEventRecord.mockResolvedValue({
      eventKey:
        'ai-usage:acme:workspace:ops:orchestration-runtime:dispatch-run:ops@acme.test:2026-05-30T00:00:00.000Z',
      executionLane: 'cheap-model',
      status: 'success',
    });
    const result = await controller.dispatchExecutionRuntimeRun(
      'plan:acme:ops:runtime',
      {
        runKey: 'plan:acme:ops:runtime:child:1:runner:run',
        runtimeBindings: [
          {
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            deliveryMode: 'webhook',
            approvalRequired: false,
          },
        ],
      },
      'acme',
      'ops@acme.test',
      'ops',
      'acme.test',
      'acme.test',
      undefined,
      undefined,
      undefined,
      undefined,
    );

    expect(aiGovernancePersistence.buildGatewayDecision).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      featureKey: 'orchestration-runtime',
      taskType: 'dispatch-run',
      requestedLane: undefined,
      preferredCredentialMode: undefined,
      projectedTokens: undefined,
      projectedCost: undefined,
      deterministicEligible: undefined,
      cacheHitAvailable: undefined,
    });
    expect(orchestration.dispatchExecutionRun).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:runtime',
      objective: undefined,
      executionModes: undefined,
      runtimeBindings: [
        {
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
          deliveryMode: 'webhook',
          approvalRequired: false,
        },
      ],
      childWorkflowContracts: undefined,
      approvalContracts: undefined,
      escalationContracts: undefined,
      rollbackContracts: undefined,
      submittedBy: 'ops@acme.test',
      submissionNotes: undefined,
      runKey: 'plan:acme:ops:runtime:child:1:runner:run',
      dispatchedBy: 'ops@acme.test',
    });
    expect(aiGovernancePersistence.persistUsageEventRecord).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      actorKey: 'ops@acme.test',
      featureKey: 'orchestration-runtime',
      taskType: 'dispatch-run',
      providerKey: 'orchestration-runtime',
      modelKey: 'cheap-model',
      credentialMode: 'aifut-managed',
      executionLane: 'cheap-model',
      inputTokens: undefined,
      outputTokens: undefined,
      estimatedCost: undefined,
      actualCost: undefined,
      cacheHit: undefined,
      source: 'orchestration-dispatch-run',
      status: 'success',
    });
    expect(orchestration.recordAiGovernanceDispatchOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'auto-dispatched' }),
    );
    expect(result).toMatchObject({
      status: 'execution-run-dispatched',
      aiGovernanceDecision: {
        selectedLane: 'cheap-model',
        blockReason: null,
      },
      aiUsageEvent: {
        executionLane: 'cheap-model',
        status: 'success',
      },
      aiGovernanceDispatchOutcome: {
        outcome: 'auto-dispatched',
      },
      executionDispatch: {
        runnerDispatchStatus: 'applied',
        executionDispatch: {
          runKey: 'plan:acme:ops:runtime:child:1:runner:run',
        },
      },
    });
  });

  it('should block execution runtime dispatch when AI governance hard limit is reached', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      user: { email: 'ops@acme.test' },
      activeWorkspace: { id: 'ws_1', slug: 'ops' },
      activeMembership: { role: 'ADMIN' },
    });
    aiGovernancePersistence.buildGatewayDecision.mockResolvedValue({
      featureKey: 'orchestration-runtime',
      taskType: 'dispatch-run',
      selectedLane: null,
      credentialMode: 'aifut-managed',
      quotaPressure: 'hard-limit',
      blockReason: 'Projected AI token usage reaches hard monthly limit of 1000.',
      executionPolicy: {
        canDispatch: false,
        canAutoDispatch: false,
        requiresHumanApproval: false,
        shouldRecordUsageEvent: false,
      },
    });

    const result = await controller.dispatchExecutionRuntimeRun(
      'plan:acme:ops:runtime',
      {
        runKey: 'plan:acme:ops:runtime:child:1:runner:run',
        aiGovernance: {
          projectedTokens: 1200,
          projectedCost: 0.45,
          requestedLane: 'balanced-model',
        },
      },
      'acme',
      'ops@acme.test',
      'ops',
      'acme.test',
      'acme.test',
      undefined,
      undefined,
      undefined,
      undefined,
    );

    expect(aiGovernancePersistence.buildGatewayDecision).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      featureKey: 'orchestration-runtime',
      taskType: 'dispatch-run',
      requestedLane: 'balanced-model',
      preferredCredentialMode: undefined,
      projectedTokens: 1200,
      projectedCost: 0.45,
      deterministicEligible: undefined,
      cacheHitAvailable: undefined,
    });
    expect(orchestration.dispatchExecutionRun).not.toHaveBeenCalled();
    expect(aiGovernancePersistence.persistUsageEventRecord).not.toHaveBeenCalled();
    expect(orchestration.recordAiGovernanceDispatchOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'blocked' }),
    );
    expect(result).toMatchObject({
      status: 'execution-run-blocked-by-ai-governance',
      aiGovernanceDecision: {
        quotaPressure: 'hard-limit',
        blockReason: 'Projected AI token usage reaches hard monthly limit of 1000.',
      },
      aiGovernanceDispatchOutcome: {
        outcome: 'blocked',
      },
      next: ['review-ai-budget-policy', 'reduce-projected-usage'],
    });
  });

  it('should hold execution runtime dispatch when AI governance requires approval', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      user: { email: 'ops@acme.test' },
      activeWorkspace: { id: 'ws_1', slug: 'ops' },
      activeMembership: { role: 'ADMIN' },
    });
    aiGovernancePersistence.buildGatewayDecision.mockResolvedValue({
      featureKey: 'orchestration-runtime',
      taskType: 'dispatch-run',
      selectedLane: 'premium-model',
      credentialMode: 'aifut-managed',
      quotaPressure: 'normal',
      requiresApproval: true,
      approvalReason:
        'Selected lane premium-model requires approval above balanced-model.',
      blockReason: null,
      outcome: {
        status: 'approval-required',
      },
      executionPolicy: {
        canDispatch: true,
        canAutoDispatch: false,
        requiresHumanApproval: true,
        shouldRecordUsageEvent: true,
      },
    });

    const result = await controller.dispatchExecutionRuntimeRun(
      'plan:acme:ops:runtime',
      {
        runKey: 'plan:acme:ops:runtime:child:1:runner:run',
        aiGovernance: {
          requestedLane: 'premium-model',
          projectedTokens: 800,
          projectedCost: 12,
        },
      },
      'acme',
      'ops@acme.test',
      'ops',
      'acme.test',
      'acme.test',
      undefined,
      undefined,
      undefined,
      undefined,
    );

    expect(orchestration.dispatchExecutionRun).not.toHaveBeenCalled();
    expect(aiGovernancePersistence.persistUsageEventRecord).not.toHaveBeenCalled();
    expect(orchestration.recordAiGovernanceDispatchOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'held' }),
    );
    expect(result).toMatchObject({
      status: 'execution-run-awaiting-ai-governance-approval',
      aiGovernanceDecision: {
        selectedLane: 'premium-model',
        requiresApproval: true,
        outcome: {
          status: 'approval-required',
        },
        executionPolicy: {
          canAutoDispatch: false,
          requiresHumanApproval: true,
        },
      },
      aiGovernanceDispatchOutcome: {
        outcome: 'held',
      },
      next: ['approve-ai-governance-decision', 'adjust-ai-routing-policy'],
    });
  });

  it('should resume an AI-governance-held dispatch after explicit actor approval', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      user: { email: 'ops@acme.test' },
      activeWorkspace: { id: 'ws_1', slug: 'ops' },
      activeMembership: { role: 'ADMIN' },
    });
    orchestration.dispatchExecutionRun.mockReturnValue({
      planId: 'plan:acme:ops:runtime',
      runnerDispatchStatus: 'applied',
      executionDispatch: {
        runKey: 'plan:acme:ops:runtime:child:1:runner:run',
      },
    });
    aiGovernancePersistence.buildGatewayDecision.mockResolvedValue({
      featureKey: 'orchestration-runtime',
      taskType: 'dispatch-run',
      selectedLane: 'premium-model',
      credentialMode: 'aifut-managed',
      quotaPressure: 'normal',
      requiresApproval: true,
      approvalReason:
        'Selected lane premium-model requires approval above balanced-model.',
      blockReason: null,
      outcome: {
        status: 'approval-required',
      },
      executionPolicy: {
        canDispatch: true,
        canAutoDispatch: false,
        requiresHumanApproval: true,
        shouldRecordUsageEvent: true,
      },
    });
    aiGovernancePersistence.persistUsageEventRecord.mockResolvedValue({
      eventKey:
        'ai-usage:acme:workspace:ops:orchestration-runtime:dispatch-run:ops@acme.test:2026-05-31T00:00:00.000Z',
      executionLane: 'premium-model',
      source: 'orchestration-dispatch-run-approved',
      status: 'success',
    });
    auditEvents.write.mockResolvedValue({
      capability: 'audit',
      status: 'recorded',
      event: {
        id: 'audit_1',
        action: 'ai-governance.approval-dispatch-resumed',
      },
    });

    const result = await controller.dispatchExecutionRuntimeRun(
      'plan:acme:ops:runtime',
      {
        runKey: 'plan:acme:ops:runtime:child:1:runner:run',
        aiGovernance: {
          requestedLane: 'premium-model',
          projectedTokens: 800,
          projectedCost: 12,
          approval: {
            decision: 'approve',
            note: '  approved for customer deadline  ',
          },
        },
      },
      'acme',
      'ops@acme.test',
      'ops',
      'acme.test',
      'acme.test',
      undefined,
      undefined,
      undefined,
      undefined,
    );

    expect(orchestration.dispatchExecutionRun).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        planId: 'plan:acme:ops:runtime',
        runKey: 'plan:acme:ops:runtime:child:1:runner:run',
        dispatchedBy: 'ops@acme.test',
      }),
    );
    expect(aiGovernancePersistence.persistUsageEventRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        actorKey: 'ops@acme.test',
        executionLane: 'premium-model',
        source: 'orchestration-dispatch-run-approved',
        status: 'success',
      }),
    );
    expect(auditEvents.write).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      hostname: 'acme.test',
      action: 'ai-governance.approval-dispatch-resumed',
      targetType: 'orchestration-execution-run',
      targetId: 'plan:acme:ops:runtime:child:1:runner:run',
      metadata: {
        planId: 'plan:acme:ops:runtime',
        runKey: 'plan:acme:ops:runtime:child:1:runner:run',
        approval: {
          status: 'approved-for-dispatch',
          decision: 'approve',
          approvedBy: 'ops@acme.test',
          note: 'approved for customer deadline',
        },
        governanceDecision: {
          featureKey: 'orchestration-runtime',
          taskType: 'dispatch-run',
          selectedLane: 'premium-model',
          credentialMode: 'aifut-managed',
          approvalReason:
            'Selected lane premium-model requires approval above balanced-model.',
          outcome: {
            status: 'approval-required',
          },
        },
        usageEventKey:
          'ai-usage:acme:workspace:ops:orchestration-runtime:dispatch-run:ops@acme.test:2026-05-31T00:00:00.000Z',
      },
    });
    expect(orchestration.recordAiGovernanceDispatchOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'approved-resumed',
        approvalAuditEventId: 'audit_1',
      }),
    );
    expect(result).toMatchObject({
      status: 'execution-run-dispatched-after-ai-governance-approval',
      aiGovernanceApproval: {
        status: 'approved-for-dispatch',
        decision: 'approve',
        approvedBy: 'ops@acme.test',
        note: 'approved for customer deadline',
      },
      aiGovernanceDecision: {
        outcome: {
          status: 'approval-required',
        },
      },
      aiGovernanceApprovalAudit: {
        capability: 'audit',
        status: 'recorded',
        event: {
          id: 'audit_1',
          action: 'ai-governance.approval-dispatch-resumed',
        },
      },
      aiGovernanceDispatchOutcome: {
        outcome: 'approved-resumed',
      },
      executionDispatch: {
        runnerDispatchStatus: 'applied',
      },
    });
  });

  it('should fetch execution runtime history in resolved tenant/workspace context', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      activeWorkspace: { id: 'ws_1', slug: 'ops' },
      activeMembership: { role: 'ADMIN' },
    });
    orchestration.getExecutionRuntimeHistory.mockResolvedValue({
      planId: 'plan:acme:ops:runtime',
      historyStatus: 'available',
      diagnosticsSummary: {
        snapshotCount: 2,
        eventCount: 3,
        latestSnapshotType: 'run-dispatch',
        latestRuntimeStatus: 'dispatch-applied',
        latestRecordedAt: '2026-05-07T00:46:00.000Z',
        latestEventType: 'execution-run-dispatched',
        latestEventRecordedAt: '2026-05-07T00:46:05.000Z',
        mutatedTargetCount: 1,
      },
      latestSnapshot: {
        snapshotKey: 'plan:acme:ops:runtime:run-dispatch:snapshot',
      },
      events: [
        {
          eventKey: 'plan:acme:ops:runtime:child:1:runner:run:dispatch',
        },
      ],
    });

    const result = await controller.getExecutionRuntimeHistory(
      'plan:acme:ops:runtime',
      'acme',
      'ops@acme.test',
      'ops',
      'ops.acme.test',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      '5',
      '7',
    );

    expect(actorContext.resolve).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      hostname: 'ops.acme.test',
      authorizationHeader: undefined,
    });
    expect(orchestration.getExecutionRuntimeHistory).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:runtime',
      snapshotTake: 5,
      eventTake: 7,
    });
    expect(result).toMatchObject({
      status: 'execution-runtime-history-fetched',
      runtimeHistory: {
        historyStatus: 'available',
        diagnosticsSummary: {
          snapshotCount: 2,
          eventCount: 3,
          latestSnapshotType: 'run-dispatch',
          latestRuntimeStatus: 'dispatch-applied',
          latestRecordedAt: '2026-05-07T00:46:00.000Z',
          latestEventType: 'execution-run-dispatched',
          latestEventRecordedAt: '2026-05-07T00:46:05.000Z',
          mutatedTargetCount: 1,
        },
        latestSnapshot: {
          snapshotKey: 'plan:acme:ops:runtime:run-dispatch:snapshot',
        },
      },
    });
  });

  it('should fetch execution runtime diagnostics in resolved tenant/workspace context', async () => {
    actorContext.resolve.mockResolvedValue({
      tenant: { id: 'tenant_1', slug: 'acme' },
      activeWorkspace: { id: 'ws_1', slug: 'ops' },
      activeMembership: { role: 'ADMIN' },
    });
    orchestration.getExecutionRuntimeDiagnostics.mockResolvedValue({
      planId: 'plan:acme:ops:runtime',
      historyStatus: 'available',
      diagnosticsSummary: {
        snapshotCount: 2,
        eventCount: 3,
        latestSnapshotType: 'run-dispatch',
        latestRuntimeStatus: 'dispatch-applied',
        latestRecordedAt: '2026-05-07T00:46:00.000Z',
        latestEventType: 'execution-run-dispatched',
        latestEventRecordedAt: '2026-05-07T00:46:05.000Z',
        mutatedTargetCount: 1,
      },
      latestSnapshot: {
        snapshotKey: 'plan:acme:ops:runtime:run-dispatch:snapshot',
        snapshotType: 'run-dispatch',
        runtimeStatus: 'dispatch-applied',
        recordedAt: '2026-05-07T00:46:00.000Z',
      },
      latestEvent: {
        eventKey: 'plan:acme:ops:runtime:child:1:runner:run:dispatch',
        eventType: 'execution-run-dispatched',
        runtimeStatus: 'dispatch-applied',
        recordedAt: '2026-05-07T00:46:05.000Z',
      },
    });

    const result = await controller.getExecutionRuntimeDiagnostics(
      'plan:acme:ops:runtime',
      'acme',
      'ops@acme.test',
      'ops',
      'ops.acme.test',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      '5',
      '7',
    );

    expect(actorContext.resolve).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      hostname: 'ops.acme.test',
      authorizationHeader: undefined,
    });
    expect(orchestration.getExecutionRuntimeDiagnostics).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:runtime',
      snapshotTake: 5,
      eventTake: 7,
    });
    expect(result).toMatchObject({
      status: 'execution-runtime-diagnostics-fetched',
      runtimeDiagnostics: {
        historyStatus: 'available',
        diagnosticsSummary: {
          snapshotCount: 2,
          eventCount: 3,
          latestSnapshotType: 'run-dispatch',
        },
        latestSnapshot: {
          snapshotKey: 'plan:acme:ops:runtime:run-dispatch:snapshot',
        },
        latestEvent: {
          eventKey: 'plan:acme:ops:runtime:child:1:runner:run:dispatch',
        },
      },
    });
  });

  it('should fetch compact AI governance approval history for an execution plan', async () => {
    auditEvents.listAiGovernanceApprovalDispatchResumes.mockResolvedValue({
      capability: 'audit',
      status: 'resolved',
      tenant: { id: 'tenant_1', slug: 'acme' },
      workspace: { id: 'ws_1', slug: 'ops' },
      planId: 'plan:acme:ops:runtime',
      count: 1,
      approvalDispatchResumes: [
        {
          id: 'audit_1',
          targetId: 'run_1',
          createdAt: '2026-05-31T02:00:00.000Z',
        },
      ],
    });

    const result = await controller.getExecutionRuntimeApprovalHistory(
      'plan:acme:ops:runtime',
      'acme',
      'ops@acme.test',
      'ops',
      'ops.acme.test',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      '7',
    );

    expect(auditEvents.listAiGovernanceApprovalDispatchResumes).toHaveBeenCalledWith({
      tenantSlug: 'acme',
      userEmail: 'ops@acme.test',
      workspaceSlug: 'ops',
      hostname: 'ops.acme.test',
      planId: 'plan:acme:ops:runtime',
      limit: 7,
    });
    expect(result).toMatchObject({
      status: 'execution-runtime-approval-history-fetched',
      approvalHistory: {
        planId: 'plan:acme:ops:runtime',
        count: 1,
        approvalDispatchResumes: [{ id: 'audit_1', targetId: 'run_1' }],
      },
    });
  });
});
