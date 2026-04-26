import { Injectable } from '@nestjs/common';

@Injectable()
export class OrchestrationService {
  buildRoadmapDraft(input: {
    tenantSlug: string;
    workspaceSlug?: string | null;
    sourceKind?: string;
    title?: string;
    content?: string;
    sourceRefs?: string[];
  }) {
    const sourceKind = input.sourceKind?.trim() || 'text';
    const title = input.title?.trim() || 'Untitled roadmap draft';
    const content = input.content?.trim() || '';

    return {
      id: `draft:${input.tenantSlug}:${input.workspaceSlug ?? 'tenant'}:roadmap`,
      sourceKind,
      title,
      sourceRefs: input.sourceRefs ?? [],
      contentPreview: content.slice(0, 280),
      interpretationStatus: 'pending',
      extractedStructure: {
        phases: [],
        goals: [],
        decisionGates: [],
      },
    };
  }

  buildParentWorkflowPlan(input: {
    tenantSlug: string;
    workspaceSlug?: string | null;
    roadmapDraftId?: string;
    objective?: string;
    constraints?: string[];
  }) {
    return {
      id: `plan:${input.tenantSlug}:${input.workspaceSlug ?? 'tenant'}:draft`,
      roadmapDraftId:
        input.roadmapDraftId ??
        `draft:${input.tenantSlug}:${input.workspaceSlug ?? 'tenant'}:roadmap`,
      objective:
        input.objective?.trim() ||
        'Design the leanest workable parent workflow for the tenant context.',
      constraints: input.constraints ?? [],
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
    };
  }

  buildRoadmapInterpretation(input: {
    tenantSlug: string;
    workspaceSlug?: string | null;
    roadmapDraftId: string;
    objective?: string;
    hints?: string[];
  }) {
    return {
      draftId: input.roadmapDraftId,
      interpretationStatus: 'draft',
      objective:
        input.objective?.trim() ||
        'Interpret roadmap into phases, goals, decision gates, and automation opportunities.',
      hints: input.hints ?? [],
      phases: [],
      goals: [],
      decisionGates: [],
      automationOpportunities: [],
      contextScope: {
        tenantSlug: input.tenantSlug,
        workspaceSlug: input.workspaceSlug ?? null,
      },
    };
  }

  buildAppCoordinationDraft(input: {
    tenantSlug: string;
    workspaceSlug?: string | null;
    planId: string;
    objective?: string;
    preferredSystems?: string[];
  }) {
    return {
      planId: input.planId,
      coordinationStatus: 'draft',
      objective:
        input.objective?.trim() ||
        'Assign workflow steps to the leanest viable mix of first-party modules and connected systems.',
      preferredSystems: input.preferredSystems ?? [],
      systemAssignments: [],
      connectorRecommendations: [],
      operatorCheckpoints: [],
      contextScope: {
        tenantSlug: input.tenantSlug,
        workspaceSlug: input.workspaceSlug ?? null,
      },
    };
  }

  buildDataflowModelDraft(input: {
    tenantSlug: string;
    workspaceSlug?: string | null;
    planId: string;
    objective?: string;
    businessObjects?: string[];
  }) {
    return {
      planId: input.planId,
      dataflowStatus: 'draft',
      objective:
        input.objective?.trim() ||
        'Model the leanest safe data movement across systems, approvals, and source-of-truth boundaries.',
      businessObjects: input.businessObjects ?? [],
      edges: [],
      syncPolicies: [],
      sourceOfTruthAssignments: [],
      contextScope: {
        tenantSlug: input.tenantSlug,
        workspaceSlug: input.workspaceSlug ?? null,
      },
    };
  }

  buildOptimizationSummaryDraft(input: {
    tenantSlug: string;
    workspaceSlug?: string | null;
    planId: string;
    objective?: string;
    priorities?: string[];
  }) {
    return {
      planId: input.planId,
      optimizationStatus: 'draft',
      objective:
        input.objective?.trim() ||
        'Explain the leanest tradeoff-balanced execution path across cost, complexity, speed, and operator effort.',
      priorities: input.priorities ?? [],
      preferredStrategy:
        'Lean hybrid orchestration draft pending concrete scoring and system-fit evidence.',
      tradeoffs: [],
      variantScores: [],
      contextScope: {
        tenantSlug: input.tenantSlug,
        workspaceSlug: input.workspaceSlug ?? null,
      },
    };
  }

  buildWorkflowGraphDraft(input: {
    tenantSlug: string;
    workspaceSlug?: string | null;
    planId: string;
    objective?: string;
    lanes?: string[];
  }) {
    return {
      planId: input.planId,
      graphStatus: 'draft',
      objective:
        input.objective?.trim() ||
        'Project the parent workflow into a renderable graph with lanes, nodes, edges, and approval checkpoints.',
      lanes: input.lanes ?? [],
      nodes: [],
      edges: [],
      overlays: {
        approvals: [],
        kpis: [],
      },
      contextScope: {
        tenantSlug: input.tenantSlug,
        workspaceSlug: input.workspaceSlug ?? null,
      },
    };
  }

  buildExecutionContractDraft(input: {
    tenantSlug: string;
    workspaceSlug?: string | null;
    planId: string;
    objective?: string;
    executionModes?: string[];
  }) {
    return {
      planId: input.planId,
      executionContractStatus: 'draft',
      objective:
        input.objective?.trim() ||
        'Define the execution contract across workflows, approvals, connected systems, and failure-handling boundaries.',
      executionModes: input.executionModes ?? [],
      childWorkflowContracts: [],
      approvalContracts: [],
      escalationContracts: [],
      rollbackContracts: [],
      contextScope: {
        tenantSlug: input.tenantSlug,
        workspaceSlug: input.workspaceSlug ?? null,
      },
    };
  }
}
