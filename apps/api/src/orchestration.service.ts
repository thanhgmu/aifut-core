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
}
