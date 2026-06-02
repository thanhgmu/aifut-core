import { BadRequestException } from '@nestjs/common';
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

  it('should build an optimization summary draft with normalized defaults', () => {
    const result = service.buildOptimizationSummaryDraft({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:draft',
    });

    expect(result).toMatchObject({
      planId: 'plan:acme:ops:draft',
      optimizationStatus: 'draft',
      objective:
        'Explain the leanest tradeoff-balanced execution path across cost, complexity, speed, and operator effort.',
      priorities: [],
      preferredStrategy:
        'Lean hybrid orchestration draft pending concrete scoring and system-fit evidence.',
      tradeoffs: [],
      variantScores: [],
      contextScope: {
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
      },
    });
  });

  it('should build a workflow graph draft with normalized defaults', () => {
    const result = service.buildWorkflowGraphDraft({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:draft',
    });

    expect(result).toMatchObject({
      planId: 'plan:acme:ops:draft',
      graphStatus: 'draft',
      objective:
        'Project the parent workflow into a renderable graph with lanes, nodes, edges, and approval checkpoints.',
      lanes: [],
      nodes: [],
      edges: [],
      overlays: {
        approvals: [],
        kpis: [],
      },
      contextScope: {
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
      },
    });
  });

  it('should compose a preview-only business system blueprint from natural language', () => {
    const result = service.buildBusinessSystemBlueprintDraft({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      naturalLanguageBrief: '  Find and validate a product for Vietnam.  ',
      constraints: [' low-starting-capital ', 'low-starting-capital'],
      preferredSystems: [' n8n ', 'nexovaflow'],
      businessObjects: ['product-candidate', 'supplier', 'lead', 'order'],
      priorities: [' cost ', 'time-to-first-sale'],
      lanes: ['research', 'content', 'sales', 'support'],
    });

    expect(result).toMatchObject({
      blueprintStatus: 'draft-review-required',
      intentSurface: 'natural-language',
      executionPolicy: {
        mode: 'preview-only',
        externalActionsAllowed: false,
        approvalRequiredBeforeActivation: true,
      },
      roadmapDraft: {
        id: 'draft:acme:ops:roadmap',
        sourceKind: 'natural-language',
        contentPreview: 'Find and validate a product for Vietnam.',
      },
      interpretation: {
        hints: ['low-starting-capital'],
      },
      parentWorkflowPlan: {
        id: 'plan:acme:ops:draft',
        constraints: ['low-starting-capital'],
      },
      appCoordination: {
        preferredSystems: ['n8n', 'nexovaflow'],
      },
      dataflow: {
        businessObjects: ['product-candidate', 'supplier', 'lead', 'order'],
      },
      optimizationSummary: {
        priorities: ['cost', 'time-to-first-sale'],
      },
      workflowGraph: {
        lanes: ['research', 'content', 'sales', 'support'],
        nodes: [
          { nodeKey: 'market-discovery' },
          { nodeKey: 'supplier-validation' },
          { nodeKey: 'go-to-market-planning' },
          { nodeKey: 'content-production' },
          { nodeKey: 'channel-distribution' },
          { nodeKey: 'sales-conversion' },
          { nodeKey: 'operations-fulfillment' },
          { nodeKey: 'customer-success' },
        ],
        edges: expect.arrayContaining([
          expect.objectContaining({
            edgeKey: 'market-discovery->supplier-validation',
            fromNodeKey: 'market-discovery',
            toNodeKey: 'supplier-validation',
          }),
          expect.objectContaining({
            edgeKey: 'customer-success->market-discovery',
            fromNodeKey: 'customer-success',
            toNodeKey: 'market-discovery',
          }),
        ]),
      },
      businessLifecycle: {
        planId: 'plan:acme:ops:draft',
        lifecycleStatus: 'draft-review-required',
        loopMode: 'closed-loop',
        phases: [
          { phaseKey: 'market-discovery' },
          { phaseKey: 'supplier-validation' },
          { phaseKey: 'go-to-market-planning' },
          { phaseKey: 'content-production' },
          { phaseKey: 'channel-distribution' },
          { phaseKey: 'sales-conversion' },
          { phaseKey: 'operations-fulfillment' },
          {
            phaseKey: 'customer-success',
            nextPhaseKey: 'market-discovery',
          },
        ],
        feedbackLoops: [
          {
            fromPhaseKey: 'customer-success',
            toPhaseKey: 'market-discovery',
          },
        ],
      },
      executionContractDraft: {
        planId: 'plan:acme:ops:draft',
        executionContractStatus: 'draft',
        objective: 'Find and validate a product for Vietnam.',
        runtimeBindings: [],
        childWorkflowContracts: [],
        approvalContracts: [],
        escalationContracts: [],
        rollbackContracts: [],
        draftSummary: {
          runtimeBindingCount: 0,
          childWorkflowContractCount: 0,
          approvalContractCount: 0,
          escalationContractCount: 0,
          rollbackContractCount: 0,
        },
      },
      contextScope: {
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
      },
    });
  });

  it('should build an execution contract draft with normalized defaults', () => {
    const result = service.buildExecutionContractDraft({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:draft',
    });

    expect(result).toMatchObject({
      planId: 'plan:acme:ops:draft',
      executionContractStatus: 'draft',
      objective:
        'Define the execution contract across workflows, approvals, connected systems, and failure-handling boundaries.',
      executionModes: [],
      runtimeBindings: [],
      childWorkflowContracts: [],
      approvalContracts: [],
      escalationContracts: [],
      rollbackContracts: [],
      draftSummary: {
        executionModeCount: 0,
        runtimeBindingCount: 0,
        approvalRequiredRuntimeBindingCount: 0,
        childWorkflowContractCount: 0,
        approvalRequiredChildWorkflowCount: 0,
        childWorkflowCheckpointCount: 0,
        approvalContractCount: 0,
        requiredApprovalContractCount: 0,
        escalationContractCount: 0,
        rollbackContractCount: 0,
      },
      contextScope: {
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
      },
    });
  });

  it('should normalize duplicate and blank execution modes', () => {
    const result = service.buildExecutionContractDraft({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:draft',
      executionModes: [' human-approved ', '', 'event-driven', 'human-approved'],
    });

    expect(result.executionModes).toEqual(['human-approved', 'event-driven']);
  });

  it('should normalize runtime binding semantics for execution contracts', () => {
    const result = service.buildExecutionContractDraft({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:draft',
      runtimeBindings: [
        {
          runtimeKey: ' n8n ',
          systemKey: ' lead-router ',
          deliveryMode: ' webhook ',
          approvalRequired: true,
        },
        {
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
          deliveryMode: 'webhook',
          approvalRequired: false,
        },
        {
          runtimeKey: 'openclaw',
          systemKey: 'ops-agent',
          deliveryMode: 'human-review',
        },
        {
          runtimeKey: ' ',
          systemKey: 'ignored',
        },
      ],
    });

    expect(result.runtimeBindings).toEqual([
      {
        runtimeKey: 'n8n',
        systemKey: 'lead-router',
        deliveryMode: 'webhook',
        approvalRequired: true,
      },
      {
        runtimeKey: 'openclaw',
        systemKey: 'ops-agent',
        deliveryMode: 'human-review',
        approvalRequired: false,
      },
    ]);
  });

  it('should normalize child workflow contract semantics for execution contracts', () => {
    const result = service.buildExecutionContractDraft({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:draft',
      childWorkflowContracts: [
        {
          workflowKey: ' qualify-lead ',
          runtimeKey: ' n8n ',
          systemKey: ' lead-router ',
          triggerMode: ' webhook ',
          approvalRequired: true,
          approvalCheckpointKey: ' approve-copy ',
        },
        {
          workflowKey: 'qualify-lead',
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
          triggerMode: 'webhook',
          approvalRequired: false,
        },
        {
          workflowKey: 'handoff-ops',
          runtimeKey: 'openclaw',
          systemKey: 'ops-agent',
          triggerMode: 'human-review',
        },
        {
          workflowKey: ' ',
          runtimeKey: 'ignored',
          systemKey: 'ignored',
        },
      ],
    });

    expect(result.childWorkflowContracts).toEqual([
      {
        workflowKey: 'qualify-lead',
        runtimeKey: 'n8n',
        systemKey: 'lead-router',
        triggerMode: 'webhook',
        approvalRequired: true,
        approvalCheckpointKey: 'approve-copy',
      },
      {
        workflowKey: 'handoff-ops',
        runtimeKey: 'openclaw',
        systemKey: 'ops-agent',
        triggerMode: 'human-review',
        approvalRequired: false,
        approvalCheckpointKey: '',
      },
    ]);
  });

  it('should normalize approval contract semantics for execution contracts', () => {
    const result = service.buildExecutionContractDraft({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:draft',
      approvalContracts: [
        {
          checkpointKey: ' approve-copy ',
          approverRole: ' operator ',
          channel: ' telegram ',
          escalationMode: ' timeout-escalate ',
        },
        {
          checkpointKey: 'approve-copy',
          approverRole: 'operator',
          channel: 'telegram',
          escalationMode: 'timeout-escalate',
          required: false,
        },
        {
          checkpointKey: 'approve-legal',
          approverRole: 'legal',
          channel: 'web-ui',
          required: false,
        },
        {
          checkpointKey: ' ',
          approverRole: 'ignored',
        },
      ],
    });

    expect(result.approvalContracts).toEqual([
      {
        checkpointKey: 'approve-copy',
        approverRole: 'operator',
        channel: 'telegram',
        escalationMode: 'timeout-escalate',
        required: true,
      },
      {
        checkpointKey: 'approve-legal',
        approverRole: 'legal',
        channel: 'web-ui',
        escalationMode: '',
        required: false,
      },
    ]);
  });

  it('should surface execution contract draft summary counts', () => {
    const result = service.buildExecutionContractDraft({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:draft',
      executionModes: ['human-approved', 'event-driven'],
      runtimeBindings: [
        {
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
          approvalRequired: true,
        },
        {
          runtimeKey: 'openclaw',
          systemKey: 'ops-agent',
        },
      ],
      childWorkflowContracts: [
        {
          workflowKey: 'qualify-lead',
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
          approvalRequired: true,
          approvalCheckpointKey: 'approve-copy',
        },
        {
          workflowKey: 'handoff-ops',
          runtimeKey: 'openclaw',
          systemKey: 'ops-agent',
          approvalRequired: false,
        },
      ],
      approvalContracts: [
        {
          checkpointKey: 'approve-copy',
          approverRole: 'operator',
          required: true,
        },
        {
          checkpointKey: 'approve-optional',
          approverRole: 'manager',
          required: false,
        },
      ],
      escalationContracts: [
        {
          escalationKey: 'copy-timeout',
          fromCheckpointKey: 'approve-copy',
          targetRole: 'manager',
        },
      ],
      rollbackContracts: [
        {
          rollbackKey: 'undo-router',
          fromCheckpointKey: 'approve-copy',
          targetSystemKey: 'lead-router',
        },
      ],
    });

    expect(result.draftSummary).toEqual({
      executionModeCount: 2,
      runtimeBindingCount: 2,
      approvalRequiredRuntimeBindingCount: 1,
      childWorkflowContractCount: 2,
      approvalRequiredChildWorkflowCount: 1,
      childWorkflowCheckpointCount: 1,
      approvalContractCount: 2,
      requiredApprovalContractCount: 1,
      escalationContractCount: 1,
      rollbackContractCount: 1,
    });
  });

  it('should normalize escalation contract semantics for execution contracts', () => {
    const result = service.buildExecutionContractDraft({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:draft',
      escalationContracts: [
        {
          escalationKey: ' copy-timeout ',
          fromCheckpointKey: ' approve-copy ',
          targetRole: ' manager ',
          triggerMode: ' timeout ',
          delayMinutes: 30,
        },
        {
          escalationKey: 'copy-timeout',
          fromCheckpointKey: 'approve-copy',
          targetRole: 'manager',
          triggerMode: 'timeout',
          delayMinutes: 45,
        },
        {
          escalationKey: 'legal-escalation',
          fromCheckpointKey: 'approve-legal',
          targetRole: 'legal-lead',
          triggerMode: 'manual',
          delayMinutes: -5,
        },
        {
          escalationKey: ' ',
          fromCheckpointKey: 'ignored',
          targetRole: 'ignored',
        },
      ],
    });

    expect(result.escalationContracts).toEqual([
      {
        escalationKey: 'copy-timeout',
        fromCheckpointKey: 'approve-copy',
        targetRole: 'manager',
        triggerMode: 'timeout',
        delayMinutes: 30,
      },
      {
        escalationKey: 'legal-escalation',
        fromCheckpointKey: 'approve-legal',
        targetRole: 'legal-lead',
        triggerMode: 'manual',
        delayMinutes: 0,
      },
    ]);
  });

  it('should normalize rollback contract semantics for execution contracts', () => {
    const result = service.buildExecutionContractDraft({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:draft',
      rollbackContracts: [
        {
          rollbackKey: ' undo-router ',
          fromCheckpointKey: ' approve-copy ',
          targetSystemKey: ' lead-router ',
          strategy: ' compensate ',
          preserveArtifacts: true,
        },
        {
          rollbackKey: 'undo-router',
          fromCheckpointKey: 'approve-copy',
          targetSystemKey: 'lead-router',
          strategy: 'compensate',
          preserveArtifacts: false,
        },
        {
          rollbackKey: 'notify-ops',
          fromCheckpointKey: 'approve-ops',
          targetSystemKey: 'ops-agent',
          strategy: 'manual-review',
        },
        {
          rollbackKey: ' ',
          fromCheckpointKey: 'ignored',
          targetSystemKey: 'ignored',
        },
      ],
    });

    expect(result.rollbackContracts).toEqual([
      {
        rollbackKey: 'undo-router',
        fromCheckpointKey: 'approve-copy',
        targetSystemKey: 'lead-router',
        strategy: 'compensate',
        preserveArtifacts: true,
      },
      {
        rollbackKey: 'notify-ops',
        fromCheckpointKey: 'approve-ops',
        targetSystemKey: 'ops-agent',
        strategy: 'manual-review',
        preserveArtifacts: false,
      },
    ]);
  });

  it('should reject approval-required child workflows without a required approval contract', () => {
    expect(() =>
      service.submitExecutionContract({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        planId: 'plan:acme:ops:draft',
        runtimeBindings: [
          {
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: 'qualify-lead',
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            approvalRequired: true,
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('should reject approval-required child workflows without an approvalCheckpointKey', () => {
    expect(() =>
      service.submitExecutionContract({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        planId: 'plan:acme:ops:draft',
        runtimeBindings: [
          {
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: 'qualify-lead',
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            approvalRequired: true,
          },
        ],
        approvalContracts: [
          {
            checkpointKey: 'approve-copy',
            approverRole: 'operator',
            required: true,
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('should reject execution contract submissions without child workflow contracts', () => {
    expect(() =>
      service.submitExecutionContract({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        planId: 'plan:acme:ops:draft',
        runtimeBindings: [
          {
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
          },
        ],
        childWorkflowContracts: [],
      }),
    ).toThrow(
      'Execution contract submission requires at least one child workflow contract.',
    );
  });

  it('should reject child workflows that do not map to a submitted runtime binding', () => {
    expect(() =>
      service.submitExecutionContract({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        planId: 'plan:acme:ops:draft',
        runtimeBindings: [
          {
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: 'handoff-ops',
            runtimeKey: 'openclaw',
            systemKey: 'ops-agent',
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('should reject multiple runtime bindings for the same runtime/system pair', () => {
    expect(() =>
      service.submitExecutionContract({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        planId: 'plan:acme:ops:draft',
        runtimeBindings: [
          {
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            deliveryMode: 'webhook',
          },
          {
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            deliveryMode: 'queue',
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: 'qualify-lead',
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
          },
        ],
      }),
    ).toThrow(
      'Execution contract cannot declare multiple runtime bindings for n8n/lead-router.',
    );
  });

  it('should reject multiple approval contracts for the same checkpoint', () => {
    expect(() =>
      service.submitExecutionContract({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        planId: 'plan:acme:ops:draft',
        runtimeBindings: [
          {
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            approvalRequired: true,
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: 'qualify-lead',
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            approvalRequired: true,
            approvalCheckpointKey: 'approve-copy',
          },
        ],
        approvalContracts: [
          {
            checkpointKey: 'approve-copy',
            approverRole: 'operator',
            required: true,
          },
          {
            checkpointKey: 'approve-copy',
            approverRole: 'manager',
            required: true,
          },
        ],
      }),
    ).toThrow(
      'Execution contract cannot declare multiple approval contracts for checkpoint approve-copy.',
    );
  });

  it('should reject multiple child workflow contracts for the same workflow/runtime/system route', () => {
    expect(() =>
      service.submitExecutionContract({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        planId: 'plan:acme:ops:draft',
        runtimeBindings: [
          {
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: 'qualify-lead',
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            triggerMode: 'event',
          },
          {
            workflowKey: 'qualify-lead',
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            triggerMode: 'manual',
          },
        ],
      }),
    ).toThrow(
      'Execution contract cannot declare multiple child workflow contracts for qualify-lead on n8n/lead-router.',
    );
  });

  it('should reject multiple escalation contracts for the same checkpoint and target role', () => {
    expect(() =>
      service.submitExecutionContract({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        planId: 'plan:acme:ops:draft',
        runtimeBindings: [
          {
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            approvalRequired: true,
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: 'qualify-lead',
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            approvalRequired: true,
            approvalCheckpointKey: 'approve-copy',
          },
        ],
        approvalContracts: [
          {
            checkpointKey: 'approve-copy',
            approverRole: 'operator',
            required: true,
          },
        ],
        escalationContracts: [
          {
            escalationKey: 'escalate-ops-1',
            fromCheckpointKey: 'approve-copy',
            targetRole: 'ops-manager',
            triggerMode: 'manual',
          },
          {
            escalationKey: 'escalate-ops-2',
            fromCheckpointKey: 'approve-copy',
            targetRole: 'ops-manager',
            triggerMode: 'timeout',
          },
        ],
      }),
    ).toThrow(
      'Execution contract cannot declare multiple escalation contracts for checkpoint approve-copy targeting role ops-manager.',
    );
  });

  it('should reject multiple rollback contracts for the same checkpoint and target system', () => {
    expect(() =>
      service.submitExecutionContract({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        planId: 'plan:acme:ops:draft',
        runtimeBindings: [
          {
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            approvalRequired: true,
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: 'qualify-lead',
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            approvalRequired: true,
            approvalCheckpointKey: 'approve-copy',
          },
        ],
        approvalContracts: [
          {
            checkpointKey: 'approve-copy',
            approverRole: 'operator',
            required: true,
          },
        ],
        rollbackContracts: [
          {
            rollbackKey: 'rollback-1',
            fromCheckpointKey: 'approve-copy',
            targetSystemKey: 'lead-router',
            strategy: 'manual-review',
          },
          {
            rollbackKey: 'rollback-2',
            fromCheckpointKey: 'approve-copy',
            targetSystemKey: 'lead-router',
            strategy: 'requeue',
          },
        ],
      }),
    ).toThrow(
      'Execution contract cannot declare multiple rollback contracts for checkpoint approve-copy targeting system lead-router.',
    );
  });

  it('should reject required approval contracts when no child workflow needs approval', () => {
    expect(() =>
      service.submitExecutionContract({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        planId: 'plan:acme:ops:draft',
        runtimeBindings: [
          {
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: 'qualify-lead',
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            approvalRequired: false,
          },
        ],
        approvalContracts: [
          {
            checkpointKey: 'approve-copy',
            approverRole: 'operator',
            required: true,
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('should reject optional approval contracts even when no child workflow needs approval', () => {
    expect(() =>
      service.submitExecutionContract({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        planId: 'plan:acme:ops:draft',
        runtimeBindings: [
          {
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: 'qualify-lead',
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            approvalRequired: false,
          },
        ],
        approvalContracts: [
          {
            checkpointKey: 'approve-optional',
            approverRole: 'operator',
            required: false,
          },
        ],
      }),
    ).toThrow(
      'Execution contract submission does not yet support optional approval contract approve-optional; declare it as required or remove it from the submission.',
    );
  });

  it('should reject non-approval child workflows that still declare an approvalCheckpointKey', () => {
    expect(() =>
      service.submitExecutionContract({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        planId: 'plan:acme:ops:draft',
        runtimeBindings: [
          {
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: 'qualify-lead',
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            approvalRequired: false,
            approvalCheckpointKey: 'approve-copy',
          },
        ],
        approvalContracts: [
          {
            checkpointKey: 'approve-copy',
            approverRole: 'operator',
            required: true,
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('should reject approval-required child workflows that reference unknown required approval checkpoints', () => {
    expect(() =>
      service.submitExecutionContract({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        planId: 'plan:acme:ops:draft',
        runtimeBindings: [
          {
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: 'qualify-lead',
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            approvalRequired: true,
            approvalCheckpointKey: 'approve-legal',
          },
        ],
        approvalContracts: [
          {
            checkpointKey: 'approve-copy',
            approverRole: 'operator',
            required: true,
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('should reject required approval contracts that are not mapped by any approval-required child workflow', () => {
    expect(() =>
      service.submitExecutionContract({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        planId: 'plan:acme:ops:draft',
        runtimeBindings: [
          {
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            approvalRequired: true,
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: 'qualify-lead',
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            approvalRequired: true,
            approvalCheckpointKey: 'approve-copy',
          },
        ],
        approvalContracts: [
          {
            checkpointKey: 'approve-copy',
            approverRole: 'operator',
            required: true,
          },
          {
            checkpointKey: 'approve-legal',
            approverRole: 'legal',
            required: true,
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('should reject optional approval contracts even when required approval routing is otherwise valid', () => {
    expect(() =>
      service.submitExecutionContract({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        planId: 'plan:acme:ops:draft',
        runtimeBindings: [
          {
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            approvalRequired: true,
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: 'qualify-lead',
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            approvalRequired: true,
            approvalCheckpointKey: 'approve-copy',
          },
        ],
        approvalContracts: [
          {
            checkpointKey: 'approve-copy',
            approverRole: 'operator',
            required: true,
          },
          {
            checkpointKey: 'approve-optional',
            approverRole: 'operator',
            required: false,
          },
        ],
      }),
    ).toThrow(
      'Execution contract submission does not yet support optional approval contract approve-optional; declare it as required or remove it from the submission.',
    );
  });

  it('should reject approval-required child workflows that map to runtime bindings without approval gating', () => {
    expect(() =>
      service.submitExecutionContract({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        planId: 'plan:acme:ops:draft',
        runtimeBindings: [
          {
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            approvalRequired: false,
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: 'qualify-lead',
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            approvalRequired: true,
            approvalCheckpointKey: 'approve-copy',
          },
        ],
        approvalContracts: [
          {
            checkpointKey: 'approve-copy',
            approverRole: 'operator',
            required: true,
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('should reject non-approval child workflows that map to approval-required runtime bindings', () => {
    expect(() =>
      service.submitExecutionContract({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        planId: 'plan:acme:ops:draft',
        runtimeBindings: [
          {
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            approvalRequired: true,
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: 'qualify-lead',
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            approvalRequired: false,
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('should reject approval-required runtime bindings that are not mapped by any approval-required child workflow', () => {
    expect(() =>
      service.submitExecutionContract({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        planId: 'plan:acme:ops:draft',
        runtimeBindings: [
          {
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            approvalRequired: true,
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: 'qualify-lead',
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            approvalRequired: false,
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('should link approval-gated child workflows only to their mapped required approval checkpoints', () => {
    const result = service.submitExecutionContract({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:mapped-approvals',
      runtimeBindings: [
        {
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
          approvalRequired: true,
        },
        {
          runtimeKey: 'openclaw',
          systemKey: 'ops-agent',
          approvalRequired: true,
        },
      ],
      childWorkflowContracts: [
        {
          workflowKey: 'qualify-lead',
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
          approvalRequired: true,
          approvalCheckpointKey: 'approve-copy',
        },
        {
          workflowKey: 'handoff-ops',
          runtimeKey: 'openclaw',
          systemKey: 'ops-agent',
          approvalRequired: true,
          approvalCheckpointKey: 'approve-ops',
        },
      ],
      approvalContracts: [
        {
          checkpointKey: 'approve-copy',
          approverRole: 'operator',
          required: true,
        },
        {
          checkpointKey: 'approve-ops',
          approverRole: 'manager',
          required: true,
        },
      ],
    });

    expect(result.approvalDispatchQueue).toEqual([
      expect.objectContaining({
        checkpointKey: 'approve-copy',
        linkedChildContractKeys: ['plan:acme:ops:mapped-approvals:child:1'],
      }),
      expect.objectContaining({
        checkpointKey: 'approve-ops',
        linkedChildContractKeys: ['plan:acme:ops:mapped-approvals:child:2'],
      }),
    ]);
    expect(result.approvalRoutingTopology).toEqual([
      expect.objectContaining({
        contractKey: 'plan:acme:ops:mapped-approvals:child:1',
        approvalCheckpointKey: 'approve-copy',
        requiredApprovalDispatchKeys: ['plan:acme:ops:mapped-approvals:approval:1'],
      }),
      expect.objectContaining({
        contractKey: 'plan:acme:ops:mapped-approvals:child:2',
        approvalCheckpointKey: 'approve-ops',
        requiredApprovalDispatchKeys: ['plan:acme:ops:mapped-approvals:approval:2'],
      }),
    ]);
  });

  it('should reject escalation contracts that reference unknown required approval checkpoints', () => {
    expect(() =>
      service.submitExecutionContract({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        planId: 'plan:acme:ops:draft',
        approvalContracts: [
          {
            checkpointKey: 'approve-copy',
            approverRole: 'operator',
            required: true,
          },
        ],
        escalationContracts: [
          {
            escalationKey: 'copy-timeout',
            fromCheckpointKey: 'approve-legal',
            targetRole: 'legal-lead',
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('should reject escalation contracts that target the same role as the required approval contract', () => {
    expect(() =>
      service.submitExecutionContract({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        planId: 'plan:acme:ops:escalation-loop',
        runtimeBindings: [
          {
            runtimeKey: 'openclaw',
            systemKey: 'ops-agent',
            approvalRequired: true,
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: 'review-ops-brief',
            runtimeKey: 'openclaw',
            systemKey: 'ops-agent',
            approvalRequired: true,
            approvalCheckpointKey: 'approve-ops',
          },
        ],
        approvalContracts: [
          {
            checkpointKey: 'approve-ops',
            approverRole: 'manager',
            required: true,
          },
        ],
        escalationContracts: [
          {
            escalationKey: 'ops-timeout',
            fromCheckpointKey: 'approve-ops',
            targetRole: 'manager',
          },
        ],
      }),
    ).toThrow(
      'Escalation contract ops-timeout must target a role different from the required approval role manager for checkpoint approve-ops.',
    );
  });

  it('should reject rollback contracts that reference unknown required approval checkpoints', () => {
    expect(() =>
      service.submitExecutionContract({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        planId: 'plan:acme:ops:draft',
        approvalContracts: [
          {
            checkpointKey: 'approve-copy',
            approverRole: 'operator',
            required: true,
          },
        ],
        rollbackContracts: [
          {
            rollbackKey: 'undo-router',
            fromCheckpointKey: 'approve-legal',
            targetSystemKey: 'lead-router',
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('should reject rollback contracts that reference unknown child workflow target systems', () => {
    expect(() =>
      service.submitExecutionContract({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        planId: 'plan:acme:ops:draft',
        approvalContracts: [
          {
            checkpointKey: 'approve-copy',
            approverRole: 'operator',
            required: true,
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: 'qualify-lead',
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            approvalRequired: true,
            approvalCheckpointKey: 'approve-copy',
          },
        ],
        rollbackContracts: [
          {
            rollbackKey: 'undo-router',
            fromCheckpointKey: 'approve-copy',
            targetSystemKey: 'crm-sync',
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('should reject rollback contracts that do not map to any approval-required child workflow at the same checkpoint and target system', () => {
    expect(() =>
      service.submitExecutionContract({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        planId: 'plan:acme:ops:rollback-mismatch',
        runtimeBindings: [
          {
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            approvalRequired: true,
          },
          {
            runtimeKey: 'openclaw',
            systemKey: 'legal-review',
            approvalRequired: true,
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: 'qualify-lead',
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            approvalRequired: true,
            approvalCheckpointKey: 'approve-copy',
          },
          {
            workflowKey: 'legal-signoff',
            runtimeKey: 'openclaw',
            systemKey: 'legal-review',
            approvalRequired: true,
            approvalCheckpointKey: 'approve-legal',
          },
        ],
        approvalContracts: [
          {
            checkpointKey: 'approve-copy',
            approverRole: 'operator',
            required: true,
          },
          {
            checkpointKey: 'approve-legal',
            approverRole: 'legal',
            required: true,
          },
        ],
        rollbackContracts: [
          {
            rollbackKey: 'undo-router',
            fromCheckpointKey: 'approve-legal',
            targetSystemKey: 'lead-router',
          },
        ],
      }),
    ).toThrow(
      'Rollback contract undo-router must map to at least one approval-required child workflow for checkpoint approve-legal on system lead-router.',
    );
  });

  it('should submit an execution contract with normalized summary and runtime-binding-linked child workflow records', () => {
    const result = service.submitExecutionContract({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:draft',
      executionModes: [' human-approved '],
      runtimeBindings: [
        {
          runtimeKey: ' n8n ',
          systemKey: ' lead-router ',
          deliveryMode: ' webhook ',
          approvalRequired: true,
        },
      ],
      childWorkflowContracts: [
        {
          workflowKey: ' qualify-lead ',
          runtimeKey: ' n8n ',
          systemKey: ' lead-router ',
          triggerMode: ' webhook ',
          approvalRequired: true,
          approvalCheckpointKey: ' approve-copy ',
        },
      ],
      approvalContracts: [
        {
          checkpointKey: ' approve-copy ',
          approverRole: ' operator ',
        },
      ],
      escalationContracts: [
        {
          escalationKey: ' copy-timeout ',
          fromCheckpointKey: ' approve-copy ',
          targetRole: ' manager ',
        },
      ],
      rollbackContracts: [
        {
          rollbackKey: ' undo-router ',
          fromCheckpointKey: ' approve-copy ',
          targetSystemKey: ' lead-router ',
        },
      ],
      submittedBy: ' ops@acme.test ',
      submissionNotes: ' ready for rollout ',
    });

    expect(result).toMatchObject({
      planId: 'plan:acme:ops:draft',
      executionContractStatus: 'submitted',
      submittedBy: 'ops@acme.test',
      submissionNotes: 'ready for rollout',
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
          runtimeBindingKey: 'plan:acme:ops:draft:binding:1',
          workflowKey: 'qualify-lead',
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
          triggerMode: 'webhook',
          approvalRequired: true,
          approvalCheckpointKey: 'approve-copy',
          linkedApprovalDispatchKeys: ['plan:acme:ops:draft:approval:1'],
          linkedRunnerKey: 'plan:acme:ops:draft:child:1:runner',
          linkedRollbackRecordKeys: ['plan:acme:ops:draft:rollback:1'],
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
          workspaceSlug: 'ops',
          checkpointKey: 'approve-copy',
          escalationKey: 'copy-timeout',
          targetRole: 'manager',
          triggerMode: '',
          delayMinutes: 0,
          persistenceStatus: 'pending',
          linkedDispatchKeys: ['plan:acme:ops:draft:approval:1'],
        },
      ],
      storedRollbackContracts: [
        {
          rollbackRecordKey: 'plan:acme:ops:draft:rollback:1',
          tenantSlug: 'acme',
          workspaceSlug: 'ops',
          checkpointKey: 'approve-copy',
          rollbackKey: 'undo-router',
          targetSystemKey: 'lead-router',
          strategy: '',
          preserveArtifacts: false,
          persistenceStatus: 'pending',
          linkedContractKeys: ['plan:acme:ops:draft:child:1'],
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
            linkedRunnerKey: 'plan:acme:ops:draft:child:1:runner',
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
            readinessStatus: 'awaiting-required-approval',
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
          required: true,
          linkedChildContractKeys: ['plan:acme:ops:draft:child:1'],
          linkedEscalationRecordKeys: ['plan:acme:ops:draft:escalation:1'],
        },
      ],
      escalationTopology: [
        {
          escalationRecordKey: 'plan:acme:ops:draft:escalation:1',
          escalationKey: 'copy-timeout',
          checkpointKey: 'approve-copy',
          targetRole: 'manager',
          triggerMode: '',
          delayMinutes: 0,
          linkedDispatchKeys: ['plan:acme:ops:draft:approval:1'],
        },
      ],
      rollbackTopology: [
        {
          rollbackRecordKey: 'plan:acme:ops:draft:rollback:1',
          rollbackKey: 'undo-router',
          checkpointKey: 'approve-copy',
          targetSystemKey: 'lead-router',
          strategy: '',
          preserveArtifacts: false,
          linkedContractKeys: ['plan:acme:ops:draft:child:1'],
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
      executionReadinessSummary: {
        blockedRunnerCount: 0,
        awaitingApprovalRunnerCount: 1,
        readyRunnerCount: 0,
        unresolvedChildWorkflowContracts: [],
        pendingActionCount: 1,
        blockedActionCount: 0,
        queuedRunCount: 0,
        awaitingApprovalRunCount: 1,
        blockedRunCount: 0,
        pendingApprovalTaskCount: 1,
        pendingTransitionCount: 1,
        blockedTransitionCount: 0,
        dispatchableRunCount: 0,
        readyProjectedDispatchCount: 0,
        projectedOutcomeCount: 2,
        transitionPolicyCount: 3,
        projectedMutationContractCount: 1,
      },
      executionTransitionQueue: [
        {
          transitionKey: 'plan:acme:ops:draft:action:1:transition',
          sourceActionKey: 'plan:acme:ops:draft:action:1',
          sourceRunnerKey: 'plan:acme:ops:draft:child:1:runner',
          sourceContractKey: 'plan:acme:ops:draft:child:1',
          transitionType: 'await-approval-decision',
          transitionStatus: 'pending',
          targetKey: 'plan:acme:ops:draft:approval:1',
          readinessStatus: 'awaiting-required-approval',
        },
      ],
      executionRunStateHints: [
        {
          runKey: 'plan:acme:ops:draft:child:1:runner:run',
          runStatus: 'awaiting-approval',
          nextTransitionKey: 'plan:acme:ops:draft:action:1:transition',
          completionGate: 'approval-decision',
        },
      ],
      approvalTaskStateHints: [
        {
          taskKey: 'plan:acme:ops:draft:approval:1:task',
          taskStatus: 'pending-approval',
          nextTransitionType: 'record-approval-decision',
          linkedRunKeys: ['plan:acme:ops:draft:child:1:runner:run'],
        },
      ],
      approvalDecisionOptions: [
        {
          taskKey: 'plan:acme:ops:draft:approval:1:task',
          dispatchKey: 'plan:acme:ops:draft:approval:1',
          decisionOptions: ['approve', 'reject', 'request-changes'],
          defaultDecision: 'approve',
          affectedRunKeys: ['plan:acme:ops:draft:child:1:runner:run'],
        },
      ],
      executionRunDispatchQueue: [
        {
          runKey: 'plan:acme:ops:draft:child:1:runner:run',
          runnerKey: 'plan:acme:ops:draft:child:1:runner',
          dispatchReadiness: 'blocked-by-approval',
          nextTransitionKey: 'plan:acme:ops:draft:action:1:transition',
          workflowKey: 'qualify-lead',
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
        },
      ],
      executionStateTransitionBatch: {
        batchKey: 'plan:acme:ops:draft:execution-transition',
        status: 'pending',
        records: [
          {
            transitionKey: 'plan:acme:ops:draft:action:1:transition',
            transitionType: 'await-approval-decision',
            transitionStatus: 'pending',
            targetKey: 'plan:acme:ops:draft:approval:1',
            workspaceSlug: 'ops',
          },
        ],
      },
      projectedApprovalDecisionRecords: [
        {
          decisionRecordKey: 'plan:acme:ops:draft:approval-decision:1',
          taskKey: 'plan:acme:ops:draft:approval:1:task',
          dispatchKey: 'plan:acme:ops:draft:approval:1',
          defaultDecision: 'approve',
          allowedDecisions: ['approve', 'reject', 'request-changes'],
          projectedOutcomeStatus: 'awaiting-decision',
          affectedRunKeys: ['plan:acme:ops:draft:child:1:runner:run'],
        },
      ],
      projectedRunDispatchRecords: [
        {
          dispatchRecordKey: 'plan:acme:ops:draft:run-dispatch:1',
          runKey: 'plan:acme:ops:draft:child:1:runner:run',
          runnerKey: 'plan:acme:ops:draft:child:1:runner',
          dispatchReadiness: 'blocked-by-approval',
          projectedDispatchStatus: 'awaiting-prerequisite',
          nextTransitionKey: 'plan:acme:ops:draft:action:1:transition',
          workflowKey: 'qualify-lead',
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
        },
      ],
      projectedMutationBatch: {
        batchKey: 'plan:acme:ops:draft:projected-mutation',
        status: 'pending',
        approvalDecisionRecords: [
          {
            decisionRecordKey: 'plan:acme:ops:draft:approval-decision:1',
            projectedOutcomeStatus: 'awaiting-decision',
            taskKey: 'plan:acme:ops:draft:approval:1:task',
          },
        ],
        runDispatchRecords: [
          {
            dispatchRecordKey: 'plan:acme:ops:draft:run-dispatch:1',
            projectedDispatchStatus: 'awaiting-prerequisite',
            runKey: 'plan:acme:ops:draft:child:1:runner:run',
          },
        ],
      },
      projectedApprovalOutcomeRecords: [
        {
          outcomeRecordKey: 'plan:acme:ops:draft:approval-decision:1:outcome',
          decisionRecordKey: 'plan:acme:ops:draft:approval-decision:1',
          taskKey: 'plan:acme:ops:draft:approval:1:task',
          projectedResolution: 'approval-clears-run-gate',
          affectedRunKeys: ['plan:acme:ops:draft:child:1:runner:run'],
          outcomeStatus: 'projected',
        },
      ],
      projectedDispatchOutcomeRecords: [
        {
          outcomeRecordKey: 'plan:acme:ops:draft:run-dispatch:1:outcome',
          dispatchRecordKey: 'plan:acme:ops:draft:run-dispatch:1',
          runKey: 'plan:acme:ops:draft:child:1:runner:run',
          runnerKey: 'plan:acme:ops:draft:child:1:runner',
          projectedResolution: 'runner-remains-pending-prerequisite',
          outcomeStatus: 'projected',
        },
      ],
      projectedOutcomeBatch: {
        batchKey: 'plan:acme:ops:draft:projected-outcome',
        status: 'projected',
        approvalOutcomes: [
          {
            outcomeRecordKey: 'plan:acme:ops:draft:approval-decision:1:outcome',
            projectedResolution: 'approval-clears-run-gate',
            taskKey: 'plan:acme:ops:draft:approval:1:task',
          },
        ],
        dispatchOutcomes: [
          {
            outcomeRecordKey: 'plan:acme:ops:draft:run-dispatch:1:outcome',
            projectedResolution: 'runner-remains-pending-prerequisite',
            runKey: 'plan:acme:ops:draft:child:1:runner:run',
          },
        ],
      },
      actionTransitionPolicies: [
        {
          actionKey: 'plan:acme:ops:draft:action:1',
          actionType: 'dispatch-required-approval',
          currentStatus: 'pending',
          allowedNextStatuses: ['awaiting-approval-decision', 'cancelled'],
        },
      ],
      runTransitionPolicies: [
        {
          runKey: 'plan:acme:ops:draft:child:1:runner:run',
          currentStatus: 'awaiting-approval',
          allowedNextStatuses: ['queued-for-dispatch', 'cancelled'],
        },
      ],
      approvalTaskTransitionPolicies: [
        {
          taskKey: 'plan:acme:ops:draft:approval:1:task',
          currentStatus: 'pending-approval',
          allowedNextStatuses: ['approved', 'rejected', 'changes-requested'],
        },
      ],
      transitionPolicyBatch: {
        batchKey: 'plan:acme:ops:draft:transition-policy',
        status: 'draft',
        actionPolicies: [
          {
            actionKey: 'plan:acme:ops:draft:action:1',
            currentStatus: 'pending',
            allowedNextStatuses: ['awaiting-approval-decision', 'cancelled'],
          },
        ],
        runPolicies: [
          {
            runKey: 'plan:acme:ops:draft:child:1:runner:run',
            currentStatus: 'awaiting-approval',
            allowedNextStatuses: ['queued-for-dispatch', 'cancelled'],
          },
        ],
        approvalTaskPolicies: [
          {
            taskKey: 'plan:acme:ops:draft:approval:1:task',
            currentStatus: 'pending-approval',
            allowedNextStatuses: ['approved', 'rejected', 'changes-requested'],
          },
        ],
      },
      projectedMutationContract: {
        contractKey: 'plan:acme:ops:draft:projected-mutation-contract',
        status: 'draft',
        approvalDecisionCount: 1,
        runDispatchCount: 1,
        approvalOutcomeCount: 1,
        dispatchOutcomeCount: 1,
        actionPolicyCount: 1,
        runPolicyCount: 1,
        approvalTaskPolicyCount: 1,
        readyProjectedDispatchCount: 0,
        approvalDecisionKeys: ['plan:acme:ops:draft:approval-decision:1'],
        runDispatchKeys: ['plan:acme:ops:draft:run-dispatch:1'],
        outcomeKeys: [
          'plan:acme:ops:draft:approval-decision:1:outcome',
          'plan:acme:ops:draft:run-dispatch:1:outcome',
        ],
      },
      executionRunRecords: [
        {
          runKey: 'plan:acme:ops:draft:child:1:runner:run',
          tenantSlug: 'acme',
          workspaceSlug: 'ops',
          runnerKey: 'plan:acme:ops:draft:child:1:runner',
          contractKey: 'plan:acme:ops:draft:child:1',
          runtimeBindingKey: 'plan:acme:ops:draft:binding:1',
          workflowKey: 'qualify-lead',
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
          triggerMode: 'webhook',
          runStatus: 'awaiting-approval',
          readinessStatus: 'awaiting-required-approval',
          nextActionKey: 'plan:acme:ops:draft:action:1',
          approvalTaskKeys: ['plan:acme:ops:draft:approval:1:task'],
          rollbackRecordKeys: ['plan:acme:ops:draft:rollback:1'],
        },
      ],
      approvalTaskRecords: [
        {
          taskKey: 'plan:acme:ops:draft:approval:1:task',
          tenantSlug: 'acme',
          workspaceSlug: 'ops',
          dispatchKey: 'plan:acme:ops:draft:approval:1',
          checkpointKey: 'approve-copy',
          approverRole: 'operator',
          channel: '',
          required: true,
          taskStatus: 'pending-approval',
          linkedChildContractKeys: ['plan:acme:ops:draft:child:1'],
          linkedRunKeys: ['plan:acme:ops:draft:child:1:runner:run'],
        },
      ],
      executionRunBatch: {
        batchKey: 'plan:acme:ops:draft:execution-run',
        status: 'pending',
        records: [
          {
            runKey: 'plan:acme:ops:draft:child:1:runner:run',
            runnerKey: 'plan:acme:ops:draft:child:1:runner',
            runStatus: 'awaiting-approval',
            readinessStatus: 'awaiting-required-approval',
            nextActionKey: 'plan:acme:ops:draft:action:1',
            workspaceSlug: 'ops',
          },
        ],
      },
      approvalTaskBatch: {
        batchKey: 'plan:acme:ops:draft:approval-task',
        status: 'pending',
        records: [
          {
            taskKey: 'plan:acme:ops:draft:approval:1:task',
            dispatchKey: 'plan:acme:ops:draft:approval:1',
            checkpointKey: 'approve-copy',
            approverRole: 'operator',
            taskStatus: 'pending-approval',
            workspaceSlug: 'ops',
            linkedRunKeys: ['plan:acme:ops:draft:child:1:runner:run'],
          },
        ],
      },
      executionRunTopology: [
        {
          runKey: 'plan:acme:ops:draft:child:1:runner:run',
          runnerKey: 'plan:acme:ops:draft:child:1:runner',
          contractKey: 'plan:acme:ops:draft:child:1',
          runtimeBindingKey: 'plan:acme:ops:draft:binding:1',
          workflowKey: 'qualify-lead',
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
          triggerMode: 'webhook',
          runStatus: 'awaiting-approval',
          readinessStatus: 'awaiting-required-approval',
          nextActionKey: 'plan:acme:ops:draft:action:1',
          approvalTaskKeys: ['plan:acme:ops:draft:approval:1:task'],
          rollbackRecordKeys: ['plan:acme:ops:draft:rollback:1'],
        },
      ],
      approvalTaskQueue: [
        {
          taskKey: 'plan:acme:ops:draft:approval:1:task',
          dispatchKey: 'plan:acme:ops:draft:approval:1',
          checkpointKey: 'approve-copy',
          approverRole: 'operator',
          channel: '',
          required: true,
          taskStatus: 'pending-approval',
          linkedChildContractKeys: ['plan:acme:ops:draft:child:1'],
          linkedRunKeys: ['plan:acme:ops:draft:child:1:runner:run'],
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
          readinessStatus: 'awaiting-required-approval',
          nextActionKey: 'plan:acme:ops:draft:action:1',
          linkedApprovalDispatchKeys: ['plan:acme:ops:draft:approval:1'],
          linkedRollbackRecordKeys: ['plan:acme:ops:draft:rollback:1'],
        },
      ],
      executionActionTopology: [
        {
          actionKey: 'plan:acme:ops:draft:action:1',
          actionType: 'dispatch-required-approval',
          actionStatus: 'pending',
          actionTargetKey: 'plan:acme:ops:draft:approval:1',
          runnerKey: 'plan:acme:ops:draft:child:1:runner',
          contractKey: 'plan:acme:ops:draft:child:1',
          runtimeBindingKey: 'plan:acme:ops:draft:binding:1',
          readinessStatus: 'awaiting-required-approval',
          linkedApprovalDispatchKeys: ['plan:acme:ops:draft:approval:1'],
          linkedRollbackRecordKeys: ['plan:acme:ops:draft:rollback:1'],
        },
      ],
      executionRunnerHints: [
        {
          contractKey: 'plan:acme:ops:draft:child:1',
          runnerStatus: 'pending',
          readinessStatus: 'awaiting-required-approval',
          nextActionKey: 'plan:acme:ops:draft:action:1',
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
        unresolvedRuntimeBindingCount: 0,
      },
    });
  });

  it('should classify execution runners by readiness state', () => {
    const result = service.submitExecutionContract({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:readiness',
      runtimeBindings: [
        {
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
          deliveryMode: 'webhook',
          approvalRequired: true,
        },
        {
          runtimeKey: 'openclaw',
          systemKey: 'ops-agent',
          deliveryMode: 'human-review',
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
        {
          workflowKey: 'fanout-post-approval',
          runtimeKey: 'openclaw',
          systemKey: 'ops-agent',
          triggerMode: 'human-review',
          approvalRequired: false,
        },
      ],
      approvalContracts: [
        {
          checkpointKey: 'approve-copy',
          approverRole: 'operator',
          required: true,
        },
      ],
    });

    expect(result.executionReadinessSummary).toEqual({
      blockedRunnerCount: 0,
      awaitingApprovalRunnerCount: 1,
      readyRunnerCount: 1,
      unresolvedChildWorkflowContracts: [],
      pendingActionCount: 2,
      blockedActionCount: 0,
      queuedRunCount: 1,
      awaitingApprovalRunCount: 1,
      blockedRunCount: 0,
      pendingApprovalTaskCount: 1,
      pendingTransitionCount: 2,
      blockedTransitionCount: 0,
      dispatchableRunCount: 1,
      readyProjectedDispatchCount: 1,
      projectedOutcomeCount: 3,
      transitionPolicyCount: 5,
      projectedMutationContractCount: 1,
    });
    expect(result.executionRunnerTopology).toEqual([
      expect.objectContaining({
        contractKey: 'plan:acme:ops:readiness:child:1',
        readinessStatus: 'awaiting-required-approval',
        runtimeBindingKey: 'plan:acme:ops:readiness:binding:1',
        nextActionKey: 'plan:acme:ops:readiness:action:1',
      }),
      expect.objectContaining({
        contractKey: 'plan:acme:ops:readiness:child:2',
        readinessStatus: 'ready-for-dispatch',
        runtimeBindingKey: 'plan:acme:ops:readiness:binding:2',
        nextActionKey: 'plan:acme:ops:readiness:action:2',
      }),
    ]);
    expect(result.executionRunnerBatch).toMatchObject({
      batchKey: 'plan:acme:ops:readiness:execution-runner',
      status: 'pending',
      records: [
        expect.objectContaining({
          runnerKey: 'plan:acme:ops:readiness:child:1:runner',
          readinessStatus: 'awaiting-required-approval',
        }),
        expect.objectContaining({
          runnerKey: 'plan:acme:ops:readiness:child:2:runner',
          readinessStatus: 'ready-for-dispatch',
        }),
      ],
    });
    expect(result.executionActionRecords).toEqual([
      expect.objectContaining({
        actionKey: 'plan:acme:ops:readiness:action:1',
        actionType: 'dispatch-required-approval',
        actionStatus: 'pending',
        actionTargetKey: 'plan:acme:ops:readiness:approval:1',
        runnerKey: 'plan:acme:ops:readiness:child:1:runner',
        readinessStatus: 'awaiting-required-approval',
      }),
      expect.objectContaining({
        actionKey: 'plan:acme:ops:readiness:action:2',
        actionType: 'dispatch-child-workflow',
        actionStatus: 'pending',
        actionTargetKey: 'plan:acme:ops:readiness:child:2:runner',
        runnerKey: 'plan:acme:ops:readiness:child:2:runner',
        readinessStatus: 'ready-for-dispatch',
      }),
    ]);
    expect(result.executionActionBatch).toMatchObject({
      batchKey: 'plan:acme:ops:readiness:execution-action',
      status: 'pending',
      records: [
        expect.objectContaining({
          actionKey: 'plan:acme:ops:readiness:action:1',
          actionType: 'dispatch-required-approval',
          actionStatus: 'pending',
        }),
        expect.objectContaining({
          actionKey: 'plan:acme:ops:readiness:action:2',
          actionType: 'dispatch-child-workflow',
          actionStatus: 'pending',
        }),
      ],
    });
    expect(result.executionActionTopology).toEqual([
      expect.objectContaining({
        actionKey: 'plan:acme:ops:readiness:action:1',
        actionType: 'dispatch-required-approval',
        actionTargetKey: 'plan:acme:ops:readiness:approval:1',
        runnerKey: 'plan:acme:ops:readiness:child:1:runner',
      }),
      expect.objectContaining({
        actionKey: 'plan:acme:ops:readiness:action:2',
        actionType: 'dispatch-child-workflow',
        actionTargetKey: 'plan:acme:ops:readiness:child:2:runner',
        runnerKey: 'plan:acme:ops:readiness:child:2:runner',
      }),
    ]);
    expect(result.executionRunTopology).toEqual([
      expect.objectContaining({
        runKey: 'plan:acme:ops:readiness:child:1:runner:run',
        runnerKey: 'plan:acme:ops:readiness:child:1:runner',
        runStatus: 'awaiting-approval',
        approvalTaskKeys: ['plan:acme:ops:readiness:approval:1:task'],
      }),
      expect.objectContaining({
        runKey: 'plan:acme:ops:readiness:child:2:runner:run',
        runnerKey: 'plan:acme:ops:readiness:child:2:runner',
        runStatus: 'queued-for-dispatch',
        approvalTaskKeys: [],
      }),
    ]);
    expect(result.approvalTaskQueue).toEqual([
      expect.objectContaining({
        taskKey: 'plan:acme:ops:readiness:approval:1:task',
        dispatchKey: 'plan:acme:ops:readiness:approval:1',
        taskStatus: 'pending-approval',
        linkedRunKeys: ['plan:acme:ops:readiness:child:1:runner:run'],
      }),
    ]);
    expect(result.executionTransitionQueue).toEqual([
      expect.objectContaining({
        transitionKey: 'plan:acme:ops:readiness:action:1:transition',
        transitionType: 'await-approval-decision',
        targetKey: 'plan:acme:ops:readiness:approval:1',
      }),
      expect.objectContaining({
        transitionKey: 'plan:acme:ops:readiness:action:2:transition',
        transitionType: 'dispatch-runner',
        targetKey: 'plan:acme:ops:readiness:child:2:runner',
      }),
    ]);
    expect(result.executionRunStateHints).toEqual([
      expect.objectContaining({
        runKey: 'plan:acme:ops:readiness:child:1:runner:run',
        completionGate: 'approval-decision',
      }),
      expect.objectContaining({
        runKey: 'plan:acme:ops:readiness:child:2:runner:run',
        completionGate: 'runner-dispatch',
      }),
    ]);
    expect(result.approvalTaskStateHints).toEqual([
      expect.objectContaining({
        taskKey: 'plan:acme:ops:readiness:approval:1:task',
        nextTransitionType: 'record-approval-decision',
      }),
    ]);
    expect(result.approvalDecisionOptions).toEqual([
      expect.objectContaining({
        taskKey: 'plan:acme:ops:readiness:approval:1:task',
        decisionOptions: ['approve', 'reject', 'request-changes'],
        defaultDecision: 'approve',
      }),
    ]);
    expect(result.executionRunDispatchQueue).toEqual([
      expect.objectContaining({
        runKey: 'plan:acme:ops:readiness:child:1:runner:run',
        dispatchReadiness: 'blocked-by-approval',
      }),
      expect.objectContaining({
        runKey: 'plan:acme:ops:readiness:child:2:runner:run',
        dispatchReadiness: 'dispatchable',
      }),
    ]);
    expect(result.executionStateTransitionBatch).toMatchObject({
      batchKey: 'plan:acme:ops:readiness:execution-transition',
      status: 'pending',
      records: [
        expect.objectContaining({
          transitionKey: 'plan:acme:ops:readiness:action:1:transition',
          transitionType: 'await-approval-decision',
        }),
        expect.objectContaining({
          transitionKey: 'plan:acme:ops:readiness:action:2:transition',
          transitionType: 'dispatch-runner',
        }),
      ],
    });
    expect(result.projectedApprovalDecisionRecords).toEqual([
      expect.objectContaining({
        decisionRecordKey: 'plan:acme:ops:readiness:approval-decision:1',
        projectedOutcomeStatus: 'awaiting-decision',
      }),
    ]);
    expect(result.projectedRunDispatchRecords).toEqual([
      expect.objectContaining({
        dispatchRecordKey: 'plan:acme:ops:readiness:run-dispatch:1',
        projectedDispatchStatus: 'awaiting-prerequisite',
      }),
      expect.objectContaining({
        dispatchRecordKey: 'plan:acme:ops:readiness:run-dispatch:2',
        projectedDispatchStatus: 'ready-to-dispatch',
      }),
    ]);
    expect(result.projectedMutationBatch).toMatchObject({
      batchKey: 'plan:acme:ops:readiness:projected-mutation',
      status: 'partially-ready',
      approvalDecisionRecords: [
        expect.objectContaining({
          decisionRecordKey: 'plan:acme:ops:readiness:approval-decision:1',
        }),
      ],
      runDispatchRecords: [
        expect.objectContaining({
          dispatchRecordKey: 'plan:acme:ops:readiness:run-dispatch:1',
        }),
        expect.objectContaining({
          dispatchRecordKey: 'plan:acme:ops:readiness:run-dispatch:2',
        }),
      ],
    });
    expect(result.projectedApprovalOutcomeRecords).toEqual([
      expect.objectContaining({
        outcomeRecordKey: 'plan:acme:ops:readiness:approval-decision:1:outcome',
        projectedResolution: 'approval-clears-run-gate',
      }),
    ]);
    expect(result.projectedDispatchOutcomeRecords).toEqual([
      expect.objectContaining({
        outcomeRecordKey: 'plan:acme:ops:readiness:run-dispatch:1:outcome',
        projectedResolution: 'runner-remains-pending-prerequisite',
      }),
      expect.objectContaining({
        outcomeRecordKey: 'plan:acme:ops:readiness:run-dispatch:2:outcome',
        projectedResolution: 'runner-may-enter-dispatched-state',
      }),
    ]);
    expect(result.projectedOutcomeBatch).toMatchObject({
      batchKey: 'plan:acme:ops:readiness:projected-outcome',
      status: 'projected',
      approvalOutcomes: [
        expect.objectContaining({
          outcomeRecordKey: 'plan:acme:ops:readiness:approval-decision:1:outcome',
        }),
      ],
      dispatchOutcomes: [
        expect.objectContaining({
          outcomeRecordKey: 'plan:acme:ops:readiness:run-dispatch:1:outcome',
        }),
        expect.objectContaining({
          outcomeRecordKey: 'plan:acme:ops:readiness:run-dispatch:2:outcome',
        }),
      ],
    });
    expect(result.actionTransitionPolicies).toEqual([
      expect.objectContaining({
        actionKey: 'plan:acme:ops:readiness:action:1',
        allowedNextStatuses: ['awaiting-approval-decision', 'cancelled'],
      }),
      expect.objectContaining({
        actionKey: 'plan:acme:ops:readiness:action:2',
        allowedNextStatuses: ['dispatched', 'dispatch-failed'],
      }),
    ]);
    expect(result.runTransitionPolicies).toEqual([
      expect.objectContaining({
        runKey: 'plan:acme:ops:readiness:child:1:runner:run',
        allowedNextStatuses: ['queued-for-dispatch', 'cancelled'],
      }),
      expect.objectContaining({
        runKey: 'plan:acme:ops:readiness:child:2:runner:run',
        allowedNextStatuses: ['dispatched', 'dispatch-failed', 'cancelled'],
      }),
    ]);
    expect(result.approvalTaskTransitionPolicies).toEqual([
      expect.objectContaining({
        taskKey: 'plan:acme:ops:readiness:approval:1:task',
        allowedNextStatuses: ['approved', 'rejected', 'changes-requested'],
      }),
    ]);
    expect(result.transitionPolicyBatch).toMatchObject({
      batchKey: 'plan:acme:ops:readiness:transition-policy',
      status: 'draft',
    });
    expect(result.projectedMutationContract).toMatchObject({
      contractKey: 'plan:acme:ops:readiness:projected-mutation-contract',
      status: 'draft',
      approvalDecisionCount: 1,
      runDispatchCount: 2,
      approvalOutcomeCount: 1,
      dispatchOutcomeCount: 2,
      actionPolicyCount: 2,
      runPolicyCount: 2,
      approvalTaskPolicyCount: 1,
      readyProjectedDispatchCount: 1,
    });
    expect(result.contractSummary).toMatchObject({
      unresolvedRuntimeBindingCount: 0,
    });
  });

  it('should scope rollback linkage to child workflows that match both checkpoint and target system', () => {
    const result = service.submitExecutionContract({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:rollback-scope',
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
        {
          workflowKey: 'replay-lead',
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
          triggerMode: 'webhook',
          approvalRequired: true,
          approvalCheckpointKey: 'approve-legal',
        },
      ],
      approvalContracts: [
        {
          checkpointKey: 'approve-copy',
          approverRole: 'operator',
          required: true,
        },
        {
          checkpointKey: 'approve-legal',
          approverRole: 'legal',
          required: true,
        },
      ],
      rollbackContracts: [
        {
          rollbackKey: 'undo-router',
          fromCheckpointKey: 'approve-copy',
          targetSystemKey: 'lead-router',
        },
      ],
    });

    expect(result.rollbackTopology).toEqual([
      expect.objectContaining({
        rollbackKey: 'undo-router',
        checkpointKey: 'approve-copy',
        linkedContractKeys: ['plan:acme:ops:rollback-scope:child:1'],
      }),
    ]);
    expect(result.storedChildWorkflowContracts).toEqual([
      expect.objectContaining({
        contractKey: 'plan:acme:ops:rollback-scope:child:1',
        linkedRollbackRecordKeys: ['plan:acme:ops:rollback-scope:rollback:1'],
      }),
      expect.objectContaining({
        contractKey: 'plan:acme:ops:rollback-scope:child:2',
        linkedRollbackRecordKeys: [],
      }),
    ]);
    expect(result.executionRunnerTopology).toEqual([
      expect.objectContaining({
        contractKey: 'plan:acme:ops:rollback-scope:child:1',
        linkedRollbackRecordKeys: ['plan:acme:ops:rollback-scope:rollback:1'],
      }),
      expect.objectContaining({
        contractKey: 'plan:acme:ops:rollback-scope:child:2',
        linkedRollbackRecordKeys: [],
      }),
    ]);
  });

  it('should reject approval-required child workflows that only map to optional approval contracts', () => {
    expect(() =>
      service.submitExecutionContract({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        planId: 'plan:acme:ops:optional-approval',
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
            approvalCheckpointKey: 'optional-ops-review',
          },
        ],
        approvalContracts: [
          {
            checkpointKey: 'optional-ops-review',
            approverRole: 'manager',
            required: false,
          },
        ],
      }),
    ).toThrow(
      'Execution contract submission does not yet support optional approval contract optional-ops-review; declare it as required or remove it from the submission.',
    );
  });

  it('should materialize approval dispatches and dispatchable runners into live runtime mutations', async () => {
    const result = await service.materializeExecutionRuntime({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:live-runtime',
      runtimeBindings: [
        {
          runtimeKey: 'openclaw',
          systemKey: 'ops-agent',
          deliveryMode: 'human-review',
          approvalRequired: true,
        },
        {
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
          deliveryMode: 'webhook',
          approvalRequired: false,
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
        {
          workflowKey: 'dispatch-router',
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
          triggerMode: 'webhook',
          approvalRequired: false,
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
      submittedBy: 'ops@acme.test',
      submissionNotes: 'materialize runtime',
    });

    expect(result.executionRuntimeStatus).toBe('materialized');
    expect(result.approvalDispatchIntegrations).toEqual([
      expect.objectContaining({
        integrationKey:
          'plan:acme:ops:live-runtime:approval:1:task:integration',
        integrationStatus: 'dispatched-for-approval',
        appliedDispatchStatus: 'dispatched',
        appliedTaskStatus: 'awaiting-decision',
      }),
    ]);
    expect(result.executionRunnerIntegrations).toEqual([
      expect.objectContaining({
        runKey: 'plan:acme:ops:live-runtime:child:1:runner:run',
        integrationStatus: 'awaiting-approval-clearance',
        appliedRunStatus: 'awaiting-approval',
        appliedActionStatus: 'awaiting-approval-decision',
      }),
      expect.objectContaining({
        runKey: 'plan:acme:ops:live-runtime:child:2:runner:run',
        integrationStatus: 'runner-dispatched',
        appliedRunStatus: 'dispatched',
        appliedRunnerStatus: 'dispatched',
      }),
    ]);
    expect(result.liveMutationBatch).toMatchObject({
      batchKey: 'plan:acme:ops:live-runtime:live-mutation',
      status: 'partially-applied',
    });
    expect(result.liveRuntimeSummary).toMatchObject({
      dispatchedApprovalCount: 1,
      dispatchedRunnerCount: 1,
      awaitingApprovalClearanceCount: 1,
      awaitingRuntimeBindingCount: 0,
    });
    expect(result.runtimeSnapshot).toMatchObject({
      snapshotKey: 'plan:acme:ops:live-runtime:materialized-runtime:snapshot',
      snapshotType: 'materialized-runtime',
      runtimeStatus: 'materialized',
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      recordedBy: 'ops@acme.test',
      contractSummary: {
        executionModeCount: 0,
        runtimeBindingCount: 2,
        childWorkflowContractCount: 2,
        approvalContractCount: 1,
        escalationContractCount: 0,
        rollbackContractCount: 0,
        unresolvedRuntimeBindingCount: 0,
      },
      summary: {
        dispatchedApprovalCount: 1,
        dispatchedRunnerCount: 1,
      },
    });
    expect(result.runtimeEventRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'execution-runtime-materialized',
          planId: 'plan:acme:ops:live-runtime',
        }),
      ]),
    );
  });

  it('should apply an approval decision to awaiting runtime tasks and advance linked runs', async () => {
    const result = await service.applyApprovalDecision({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:decision-runtime',
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
      taskKey: 'plan:acme:ops:decision-runtime:approval:1:task',
      decision: 'approve',
      decidedBy: 'operator@acme.test',
    });

    expect(result.decisionApplicationStatus).toBe('applied');
    expect(result.approvalDecision).toMatchObject({
      taskKey: 'plan:acme:ops:decision-runtime:approval:1:task',
      decision: 'approve',
      taskStatus: 'approved',
      decidedBy: 'operator@acme.test',
    });
    expect(result.approvalDecisionMutations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetType: 'approval-task',
          fromStatus: 'awaiting-decision',
          toStatus: 'approved',
        }),
        expect.objectContaining({
          targetType: 'execution-run',
          fromStatus: 'awaiting-approval',
          toStatus: 'queued-for-dispatch',
        }),
      ]),
    );
    expect(result.approvalDecisionSummary).toMatchObject({
      approvedRunCount: 1,
      cancelledRunCount: 0,
    });
    expect(result.runtimeSnapshot).toMatchObject({
      snapshotKey: 'plan:acme:ops:decision-runtime:approval-decision:snapshot',
      snapshotType: 'approval-decision',
      runtimeStatus: 'decision-applied',
      summary: {
        approvedRunCount: 1,
        cancelledRunCount: 0,
      },
    });
    expect(result.runtimeEventRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'approval-decision-applied',
          relatedKeys: expect.objectContaining({
            taskKey: 'plan:acme:ops:decision-runtime:approval:1:task',
          }),
        }),
      ]),
    );
  });

  it('should reject approval decisions when persisted history shows the task is no longer awaiting a decision', async () => {
    const runtimeHistory = {
      persistRuntimeHistory: jest.fn().mockResolvedValue({
        persistedSnapshotKey:
          'plan:acme:ops:decision-runtime:materialized-runtime:snapshot',
        persistedEventKeys: [
          'plan:acme:ops:decision-runtime:approval:1:task:integration',
        ],
      }),
      findLatestMutations: jest.fn().mockResolvedValue({
        'approval-task:plan:acme:ops:decision-runtime:approval:1:task': {
          mutationKey:
            'plan:acme:ops:decision-runtime:approval:1:task:decision-task',
          targetKey: 'plan:acme:ops:decision-runtime:approval:1:task',
          targetType: 'approval-task',
          fromStatus: 'awaiting-decision',
          toStatus: 'approved',
          mutationStatus: 'applied',
        },
      }),
      findLatestMutation: jest.fn(),
      findLatestSnapshot: jest.fn(),
    };
    const serviceWithHistory = new OrchestrationService(
      runtimeHistory as never,
    );

    await expect(
      serviceWithHistory.applyApprovalDecision({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        planId: 'plan:acme:ops:decision-runtime',
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
        taskKey: 'plan:acme:ops:decision-runtime:approval:1:task',
        decision: 'approve',
        decidedBy: 'operator@acme.test',
      }),
    ).rejects.toThrow(
      'Approval task plan:acme:ops:decision-runtime:approval:1:task is not awaiting a decision; current status is approved.',
    );

    expect(runtimeHistory.findLatestMutations).toHaveBeenCalledWith({
      planId: 'plan:acme:ops:decision-runtime',
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      targets: [
        {
          targetType: 'approval-task',
          targetKey: 'plan:acme:ops:decision-runtime:approval:1:task',
        },
      ],
    });
    expect(runtimeHistory.findLatestMutation).not.toHaveBeenCalled();
    expect(runtimeHistory.findLatestSnapshot).not.toHaveBeenCalled();
  });

  it('should dispatch a ready execution run into applied runtime state', async () => {
    const result = await service.dispatchExecutionRun({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:dispatch-runtime',
      runtimeBindings: [
        {
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
          deliveryMode: 'webhook',
          approvalRequired: false,
        },
      ],
      childWorkflowContracts: [
        {
          workflowKey: 'dispatch-router',
          runtimeKey: 'n8n',
          systemKey: 'lead-router',
          triggerMode: 'webhook',
          approvalRequired: false,
        },
      ],
      runKey: 'plan:acme:ops:dispatch-runtime:child:1:runner:run',
      dispatchedBy: 'runner@acme.test',
    });

    expect(result.runnerDispatchStatus).toBe('applied');
    expect(result.executionDispatch).toMatchObject({
      runKey: 'plan:acme:ops:dispatch-runtime:child:1:runner:run',
      runnerKey: 'plan:acme:ops:dispatch-runtime:child:1:runner',
      dispatchedBy: 'runner@acme.test',
    });
    expect(result.executionDispatchMutations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetType: 'execution-run',
          fromStatus: 'queued-for-dispatch',
          toStatus: 'dispatched',
        }),
        expect.objectContaining({
          targetType: 'execution-runner',
          fromStatus: 'pending',
          toStatus: 'dispatched',
        }),
      ]),
    );
    expect(result.executionDispatchSummary).toMatchObject({
      dispatchedRunCount: 1,
    });
    expect(result.runtimeSnapshot).toMatchObject({
      snapshotKey: 'plan:acme:ops:dispatch-runtime:run-dispatch:snapshot',
      snapshotType: 'run-dispatch',
      runtimeStatus: 'dispatch-applied',
      summary: {
        dispatchedRunCount: 1,
      },
    });
    expect(result.runtimeEventRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'execution-run-dispatched',
          relatedKeys: expect.objectContaining({
            runKey: 'plan:acme:ops:dispatch-runtime:child:1:runner:run',
          }),
        }),
      ]),
    );
  });

  it('should allow dispatch when persisted approval history advanced the run state', async () => {
    const runtimeHistory = {
      persistRuntimeHistory: jest.fn().mockResolvedValue({
        persistedSnapshotKey:
          'plan:acme:ops:progression-runtime:run-dispatch:snapshot',
        persistedEventKeys: [
          'plan:acme:ops:progression-runtime:child:1:runner:run:dispatch',
        ],
      }),
      findLatestMutations: jest.fn().mockResolvedValue({
        'execution-run:plan:acme:ops:progression-runtime:child:1:runner:run': {
          mutationKey: 'plan:acme:ops:progression-runtime:child:1:runner:run:decision-run',
          targetKey: 'plan:acme:ops:progression-runtime:child:1:runner:run',
          targetType: 'execution-run',
          fromStatus: 'awaiting-approval',
          toStatus: 'queued-for-dispatch',
          mutationStatus: 'applied',
        },
        'execution-runner:plan:acme:ops:progression-runtime:child:1:runner': null,
        'execution-action:plan:acme:ops:progression-runtime:child:1:runner:action': null,
        'execution-transition:plan:acme:ops:progression-runtime:child:1:runner:transition:1': null,
      }),
      findLatestMutation: jest.fn(),
      findLatestSnapshot: jest.fn(),
    };
    const serviceWithHistory = new OrchestrationService(
      runtimeHistory as never,
    );

    const result = await serviceWithHistory.dispatchExecutionRun({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:progression-runtime',
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
      runKey: 'plan:acme:ops:progression-runtime:child:1:runner:run',
      dispatchedBy: 'runner@acme.test',
    });

    expect(runtimeHistory.findLatestMutations).toHaveBeenCalledWith({
      planId: 'plan:acme:ops:progression-runtime',
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      targets: [
        {
          targetType: 'execution-run',
          targetKey: 'plan:acme:ops:progression-runtime:child:1:runner:run',
        },
      ],
    });
    expect(runtimeHistory.findLatestMutation).not.toHaveBeenCalled();
    expect(runtimeHistory.findLatestSnapshot).not.toHaveBeenCalled();
    expect(result.runnerDispatchStatus).toBe('applied');
    expect(result.executionDispatchMutations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetType: 'execution-run',
          fromStatus: 'queued-for-dispatch',
          toStatus: 'dispatched',
        }),
      ]),
    );
  });

  it('should reject dispatch when persisted history already moved the run past dispatchable state', async () => {
    const runtimeHistory = {
      persistRuntimeHistory: jest.fn(),
      findLatestMutations: jest.fn().mockResolvedValue({
        'execution-run:plan:acme:ops:progression-runtime:child:1:runner:run': {
          mutationKey: 'plan:acme:ops:progression-runtime:child:1:runner:run:dispatch-run',
          targetKey: 'plan:acme:ops:progression-runtime:child:1:runner:run',
          targetType: 'execution-run',
          fromStatus: 'queued-for-dispatch',
          toStatus: 'dispatched',
          mutationStatus: 'applied',
        },
      }),
      findLatestMutation: jest.fn(),
      findLatestSnapshot: jest.fn(),
    };
    const serviceWithHistory = new OrchestrationService(
      runtimeHistory as never,
    );

    await expect(
      serviceWithHistory.dispatchExecutionRun({
        tenantSlug: 'acme',
        workspaceSlug: 'ops',
        planId: 'plan:acme:ops:progression-runtime',
        runtimeBindings: [
          {
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            deliveryMode: 'webhook',
            approvalRequired: false,
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: 'dispatch-router',
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            triggerMode: 'webhook',
            approvalRequired: false,
          },
        ],
        runKey: 'plan:acme:ops:progression-runtime:child:1:runner:run',
        dispatchedBy: 'runner@acme.test',
      }),
    ).rejects.toThrow(
      'Execution run plan:acme:ops:progression-runtime:child:1:runner:run is not dispatchable; current status is dispatched.',
    );

    expect(runtimeHistory.findLatestMutations).toHaveBeenCalledWith({
      planId: 'plan:acme:ops:progression-runtime',
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      targets: [
        {
          targetType: 'execution-run',
          targetKey: 'plan:acme:ops:progression-runtime:child:1:runner:run',
        },
      ],
    });
    expect(runtimeHistory.persistRuntimeHistory).not.toHaveBeenCalled();
    expect(runtimeHistory.findLatestMutation).not.toHaveBeenCalled();
    expect(runtimeHistory.findLatestSnapshot).not.toHaveBeenCalled();
  });

  it('should read persisted execution runtime history when runtime history is available', async () => {
    const runtimeHistory = {
      readRuntimeHistory: jest.fn().mockResolvedValue({
        latestSnapshot: {
          snapshotKey: 'plan:acme:ops:progression-runtime:run-dispatch:snapshot',
          snapshotType: 'run-dispatch',
          runtimeStatus: 'dispatch-applied',
          recordedAt: '2026-05-07T00:46:00.000Z',
          mutationRecords: [
            {
              mutationKey: 'plan:acme:ops:progression-runtime:child:1:runner:run:dispatch-run',
              targetKey: 'plan:acme:ops:progression-runtime:child:1:runner:run',
              targetType: 'execution-run',
              fromStatus: 'queued-for-dispatch',
              toStatus: 'dispatched',
              mutationStatus: 'applied',
            },
          ],
          contractSummary: {
            executionModeCount: 1,
            runtimeBindingCount: 1,
            childWorkflowContractCount: 1,
            approvalContractCount: 1,
            escalationContractCount: 0,
            rollbackContractCount: 0,
            unresolvedRuntimeBindingCount: 0,
          },
        },
        latestMutationByTarget: {
          'execution-run:plan:acme:ops:progression-runtime:child:1:runner:run': {
            mutationKey:
              'plan:acme:ops:progression-runtime:child:1:runner:run:dispatch-run',
            targetKey:
              'plan:acme:ops:progression-runtime:child:1:runner:run',
            targetType: 'execution-run',
            fromStatus: 'queued-for-dispatch',
            toStatus: 'dispatched',
            mutationStatus: 'applied',
          },
        },
        snapshots: [
          {
            snapshotKey:
              'plan:acme:ops:progression-runtime:run-dispatch:snapshot',
            snapshotType: 'run-dispatch',
            contractSummary: {
              executionModeCount: 1,
              runtimeBindingCount: 1,
              childWorkflowContractCount: 1,
              approvalContractCount: 1,
              escalationContractCount: 0,
              rollbackContractCount: 0,
              unresolvedRuntimeBindingCount: 0,
            },
          },
        ],
        events: [
          {
            eventKey:
              'plan:acme:ops:progression-runtime:child:1:runner:run:dispatch',
            eventType: 'execution-run-dispatched',
            recordedAt: '2026-05-07T00:46:05.000Z',
          },
        ],
      }),
    };
    const serviceWithHistory = new OrchestrationService(
      runtimeHistory as never,
    );

    const result = await serviceWithHistory.getExecutionRuntimeHistory({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:progression-runtime',
      snapshotTake: 3,
      eventTake: 5,
    });

    expect(runtimeHistory.readRuntimeHistory).toHaveBeenCalledWith({
      planId: 'plan:acme:ops:progression-runtime',
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      snapshotTake: 3,
      eventTake: 5,
    });
    expect(result).toMatchObject({
      planId: 'plan:acme:ops:progression-runtime',
      historyStatus: 'available',
      diagnosticsSummary: {
        snapshotCount: 1,
        eventCount: 1,
        latestSnapshotType: 'run-dispatch',
        latestRuntimeStatus: 'dispatch-applied',
        latestRecordedAt: '2026-05-07T00:46:00.000Z',
        latestEventType: 'execution-run-dispatched',
        latestEventRecordedAt: '2026-05-07T00:46:05.000Z',
        mutatedTargetCount: 1,
      },
      latestSnapshot: {
        snapshotKey:
          'plan:acme:ops:progression-runtime:run-dispatch:snapshot',
      },
      latestMutationByTarget: {
        'execution-run:plan:acme:ops:progression-runtime:child:1:runner:run': {
          mutationKey:
            'plan:acme:ops:progression-runtime:child:1:runner:run:dispatch-run',
          targetKey:
            'plan:acme:ops:progression-runtime:child:1:runner:run',
          targetType: 'execution-run',
          fromStatus: 'queued-for-dispatch',
          toStatus: 'dispatched',
          mutationStatus: 'applied',
        },
      },
      events: [
        {
          eventKey:
            'plan:acme:ops:progression-runtime:child:1:runner:run:dispatch',
        },
      ],
    });
    expect(result.contextScope).toEqual({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
    });
  });

  it('should derive lightweight runtime diagnostics from persisted execution history', async () => {
    const runtimeHistory = {
      readRuntimeHistory: jest.fn().mockResolvedValue({
        latestSnapshot: {
          snapshotKey: 'plan:acme:ops:progression-runtime:run-dispatch:snapshot',
          snapshotType: 'run-dispatch',
          runtimeStatus: 'dispatch-applied',
          recordedAt: '2026-05-07T00:46:00.000Z',
        },
        latestMutationByTarget: {
          'execution-run:plan:acme:ops:progression-runtime:child:1:runner:run': {
            mutationKey:
              'plan:acme:ops:progression-runtime:child:1:runner:run:dispatch-run',
            targetKey: 'plan:acme:ops:progression-runtime:child:1:runner:run',
            targetType: 'execution-run',
            fromStatus: 'queued-for-dispatch',
            toStatus: 'dispatched',
            mutationStatus: 'applied',
          },
        },
        snapshots: [
          {
            snapshotKey:
              'plan:acme:ops:progression-runtime:run-dispatch:snapshot',
            snapshotType: 'run-dispatch',
          },
        ],
        events: [
          {
            eventKey:
              'plan:acme:ops:progression-runtime:child:1:runner:run:dispatch',
            eventType: 'execution-run-dispatched',
            runtimeStatus: 'dispatch-applied',
            recordedAt: '2026-05-07T00:46:05.000Z',
          },
        ],
      }),
    };
    const serviceWithHistory = new OrchestrationService(
      runtimeHistory as never,
    );

    const result = await serviceWithHistory.getExecutionRuntimeDiagnostics({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:progression-runtime',
      snapshotTake: 3,
      eventTake: 5,
    });

    expect(result).toMatchObject({
      planId: 'plan:acme:ops:progression-runtime',
      historyStatus: 'available',
      diagnosticsSummary: {
        snapshotCount: 1,
        eventCount: 1,
        latestSnapshotType: 'run-dispatch',
        latestEventType: 'execution-run-dispatched',
        mutatedTargetCount: 1,
      },
      latestSnapshot: {
        snapshotKey: 'plan:acme:ops:progression-runtime:run-dispatch:snapshot',
        snapshotType: 'run-dispatch',
      },
      latestEvent: {
        eventKey:
          'plan:acme:ops:progression-runtime:child:1:runner:run:dispatch',
        eventType: 'execution-run-dispatched',
      },
      recentAiGovernanceOutcomes: {
        recentOutcomeCount: 0,
        heldCount: 0,
        approvedResumedCount: 0,
        blockedCount: 0,
        autoDispatchedCount: 0,
        latestOutcome: null,
      },
    });
    expect(result.contextScope).toEqual({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
    });
  });

  it('should persist a compact AI-governance dispatch outcome event', async () => {
    const runtimeHistory = {
      persistEvents: jest.fn().mockImplementation(async ([event]) => [event.eventKey]),
    };
    const serviceWithHistory = new OrchestrationService(runtimeHistory as never);

    const result = await serviceWithHistory.recordAiGovernanceDispatchOutcome({
      tenantSlug: 'acme',
      workspaceSlug: 'ops',
      planId: 'plan:acme:ops:runtime',
      runKey: 'run:1',
      actorKey: 'ops@acme.test',
      runtimeStatus: 'approval-required',
      outcome: 'held',
      approvalReason: 'Premium lane requires approval.',
    });

    expect(runtimeHistory.persistEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        eventType: 'ai-governance-dispatch-held',
        relatedKeys: { runKey: 'run:1' },
        metadata: expect.objectContaining({ outcome: 'held' }),
      }),
    ]);
    expect(result.persistedEventKey).toContain(':ai-governance:held:');
  });

  it('should degrade AI-governance outcome recording when runtime history is unavailable', async () => {
    await expect(
      service.recordAiGovernanceDispatchOutcome({
        tenantSlug: 'acme',
        planId: 'plan:acme:tenant:runtime',
        runKey: 'run:1',
        runtimeStatus: 'blocked',
        outcome: 'blocked',
      }),
    ).resolves.toMatchObject({
      outcome: 'blocked',
      persistedEventKey: null,
    });
  });

  it('should summarize recent AI-governance outcomes in runtime diagnostics', async () => {
    const runtimeHistory = {
      readRuntimeHistory: jest.fn().mockResolvedValue({
        latestSnapshot: null,
        latestMutationByTarget: {},
        snapshots: [],
        events: [
          {
            eventKey: 'event:blocked',
            eventType: 'ai-governance-dispatch-blocked',
            runtimeStatus: 'blocked',
            relatedKeys: { runKey: 'run:2' },
            recordedAt: '2026-05-31T00:00:02.000Z',
          },
          {
            eventKey: 'event:held',
            eventType: 'ai-governance-dispatch-held',
            runtimeStatus: 'approval-required',
            relatedKeys: { runKey: 'run:1' },
            recordedAt: '2026-05-31T00:00:01.000Z',
          },
          {
            eventKey: 'event:approved-resumed',
            eventType: 'ai-governance-dispatch-approved-resumed',
            runtimeStatus: 'dispatch-applied',
            relatedKeys: { runKey: 'run:0' },
            recordedAt: '2026-05-31T00:00:00.500Z',
          },
          {
            eventKey: 'event:auto-dispatched',
            eventType: 'ai-governance-dispatch-auto-dispatched',
            runtimeStatus: 'dispatch-applied',
            relatedKeys: { runKey: 'run:-1' },
            recordedAt: '2026-05-31T00:00:00.250Z',
          },
          {
            eventKey: 'event:ordinary',
            eventType: 'execution-run-dispatched',
            runtimeStatus: 'dispatch-applied',
            relatedKeys: { runKey: 'run:-2' },
            recordedAt: '2026-05-31T00:00:00.000Z',
          },
        ],
      }),
    };
    const serviceWithHistory = new OrchestrationService(runtimeHistory as never);

    const result = await serviceWithHistory.getExecutionRuntimeDiagnostics({
      tenantSlug: 'acme',
      planId: 'plan:acme:tenant:runtime',
    });

    expect(result.recentAiGovernanceOutcomes).toEqual({
      recentOutcomeCount: 4,
      heldCount: 1,
      approvedResumedCount: 1,
      blockedCount: 1,
      autoDispatchedCount: 1,
      latestOutcome: {
        eventKey: 'event:blocked',
        outcome: 'blocked',
        runKey: 'run:2',
        runtimeStatus: 'blocked',
        recordedAt: '2026-05-31T00:00:02.000Z',
      },
    });
  });
});
