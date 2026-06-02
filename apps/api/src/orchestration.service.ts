import { BadRequestException, Injectable } from '@nestjs/common';
import {
  OrchestrationApprovalDecisionInput,
  OrchestrationApprovalDecisionRecord,
  OrchestrationApprovalDecisionOptionRecord,
  OrchestrationApprovalDecisionSummary,
  OrchestrationApprovalDispatchIntegrationRecord,
  OrchestrationApprovalTaskQueueRecord,
  OrchestrationApprovalTaskStateHintRecord,
  OrchestrationExecutionActionTopologyRecord,
  OrchestrationExecutionDispatchInput,
  OrchestrationExecutionDispatchRecord,
  OrchestrationExecutionDispatchSummary,
  OrchestrationExecutionReadinessSummary,
  OrchestrationExecutionRunDispatchQueueRecord,
  OrchestrationExecutionRunnerHintRecord,
  OrchestrationExecutionRunStateHintRecord,
  OrchestrationExecutionRunTopologyRecord,
  OrchestrationExecutionRunnerIntegrationRecord,
  OrchestrationExecutionRunnerTopologyRecord,
  OrchestrationExecutionStateTransitionBatch,
  OrchestrationExecutionTransitionQueueRecord,
  OrchestrationProjectedApprovalDecisionRecord,
  OrchestrationProjectedApprovalOutcomeRecord,
  OrchestrationProjectedDispatchOutcomeBatchRecord,
  OrchestrationProjectedDispatchOutcomeRecord,
  OrchestrationProjectedMutationBatch,
  OrchestrationProjectedMutationContract,
  OrchestrationProjectedOutcomeBatch,
  OrchestrationProjectedApprovalOutcomeBatchRecord,
  OrchestrationProjectedApprovalDecisionBatchRecord,
  OrchestrationProjectedRunDispatchBatchRecord,
  OrchestrationProjectedRunDispatchRecord,
  OrchestrationRuntimeContextInput,
  OrchestrationRuntimeEventRecord,
  OrchestrationLiveMutationBatch,
  OrchestrationLiveRuntimeSummary,
  OrchestrationMaterializedRuntimeResponse,
  OrchestrationPersistedRuntimeSnapshotRecord,
  OrchestrationRuntimeContractSummary,
  OrchestrationRuntimeDiagnosticsResponse,
  OrchestrationRuntimeHistoryQuery,
  OrchestrationRuntimeHistoryResponse,
  OrchestrationRuntimeMutationRecord,
  OrchestrationRuntimePersistenceResult,
  OrchestrationRuntimeScope,
  OrchestrationRuntimeSnapshotRecord,
  OrchestrationActionTransitionPolicy,
  OrchestrationRunTransitionPolicy,
  OrchestrationApprovalTaskTransitionPolicy,
  OrchestrationTransitionPolicyBatch,
  OrchestrationAiGovernanceDispatchOutcome,
  OrchestrationAiGovernanceOutcomeDiagnosticRecord,
} from './orchestration-runtime.models';
import { OrchestrationRuntimeHistoryService } from './orchestration-runtime-history.service';

@Injectable()
export class OrchestrationService {
  constructor(
    private readonly runtimeHistory?: OrchestrationRuntimeHistoryService,
  ) {}

  private buildRuntimeActorKey(input: {
    submittedBy?: string;
    decidedBy?: string;
    dispatchedBy?: string;
  }) {
    return (
      input.decidedBy?.trim() ||
      input.dispatchedBy?.trim() ||
      input.submittedBy?.trim() ||
      'system'
    );
  }

  private buildRuntimeRecordedAt() {
    return new Date().toISOString();
  }

  private buildRuntimeScope(
    input: OrchestrationRuntimeContextInput,
  ): OrchestrationRuntimeScope {
    return {
      tenantSlug: input.tenantSlug,
      workspaceSlug: input.workspaceSlug ?? null,
    };
  }

  async recordAiGovernanceDispatchOutcome(input: {
    tenantSlug: string;
    workspaceSlug?: string | null;
    planId: string;
    runKey: string;
    actorKey?: string;
    runtimeStatus: string;
    outcome: OrchestrationAiGovernanceDispatchOutcome;
    featureKey?: string;
    taskType?: string;
    requestedLane?: string | null;
    selectedLane?: string | null;
    credentialMode?: string | null;
    quotaPressure?: string | null;
    approvalReason?: string | null;
    blockReason?: string | null;
    downgradeReason?: string | null;
    policyKeys?: Record<string, string>;
    usageEventKey?: string | null;
    approvalAuditEventId?: string | null;
  }) {
    const recordedAt = this.buildRuntimeRecordedAt();
    const runtimeEvent: OrchestrationRuntimeEventRecord = {
      eventKey: `${input.planId}:${input.runKey}:ai-governance:${input.outcome}:${recordedAt}`,
      eventType: `ai-governance-dispatch-${input.outcome}`,
      planId: input.planId,
      runtimeStatus: input.runtimeStatus,
      actorKey: input.actorKey?.trim() || 'system',
      recordedAt,
      scope: {
        tenantSlug: input.tenantSlug,
        workspaceSlug: input.workspaceSlug ?? null,
      },
      relatedKeys: { runKey: input.runKey },
      metadata: {
        outcome: input.outcome,
        featureKey: input.featureKey,
        taskType: input.taskType,
        requestedLane: input.requestedLane,
        selectedLane: input.selectedLane,
        credentialMode: input.credentialMode,
        quotaPressure: input.quotaPressure,
        approvalReason: input.approvalReason,
        blockReason: input.blockReason,
        downgradeReason: input.downgradeReason,
        policyKeys: input.policyKeys ?? {},
        usageEventKey: input.usageEventKey,
        approvalAuditEventId: input.approvalAuditEventId,
      },
    };
    const persistedEventKeys = this.runtimeHistory
      ? await this.runtimeHistory.persistEvents([runtimeEvent])
      : [];

    return {
      outcome: input.outcome,
      runtimeEvent,
      persistedEventKey: persistedEventKeys[0] ?? null,
    };
  }

  private buildRuntimeSnapshotRecord(input: {
    planId: string;
    snapshotType: 'materialized-runtime' | 'approval-decision' | 'run-dispatch';
    runtimeStatus: string;
    actorKey: string;
    recordedAt: string;
    tenantSlug: string;
    workspaceSlug: string | null;
    contractSummary: OrchestrationRuntimeContractSummary;
    summary: OrchestrationRuntimeSnapshotRecord['summary'];
    mutationRecords: OrchestrationRuntimeMutationRecord[];
    eventRecords: OrchestrationRuntimeEventRecord[];
  }): OrchestrationRuntimeSnapshotRecord {
    return {
      snapshotKey: `${input.planId}:${input.snapshotType}:snapshot`,
      planId: input.planId,
      snapshotType: input.snapshotType,
      runtimeStatus: input.runtimeStatus,
      tenantSlug: input.tenantSlug,
      workspaceSlug: input.workspaceSlug,
      recordedBy: input.actorKey,
      recordedAt: input.recordedAt,
      contractSummary: input.contractSummary,
      summary: input.summary,
      mutationRecords: input.mutationRecords,
      eventRecords: input.eventRecords,
    };
  }

  private async persistRuntimeSnapshot(
    snapshot: OrchestrationRuntimeSnapshotRecord,
  ): Promise<OrchestrationRuntimePersistenceResult | null> {
    if (!this.runtimeHistory) {
      return null;
    }

    return this.runtimeHistory.persistRuntimeHistory(snapshot);
  }

  private async findLatestPersistedRuntimeSnapshot(input: {
    planId: string;
    tenantSlug?: string;
    workspaceSlug?: string | null;
  }) {
    if (!this.runtimeHistory) {
      return null;
    }

    return this.runtimeHistory.findLatestSnapshot(input);
  }

  private latestPersistedMutationStatus(
    snapshot: OrchestrationPersistedRuntimeSnapshotRecord | null,
    targetType: string,
    targetKey: string | null | undefined,
  ) {
    if (!snapshot || !targetKey) {
      return null;
    }

    const mutation = [...snapshot.mutationRecords]
      .reverse()
      .find(
        (record) =>
          record.targetType === targetType && record.targetKey === targetKey,
      );

    return mutation?.toStatus ?? null;
  }

  private async findLatestPersistedMutationStatus(input: {
    planId: string;
    tenantSlug?: string;
    workspaceSlug?: string | null;
    targetType: string;
    targetKey: string | null | undefined;
  }) {
    const statuses = await this.findLatestPersistedMutationStatuses({
      planId: input.planId,
      tenantSlug: input.tenantSlug,
      workspaceSlug: input.workspaceSlug,
      targets: [
        {
          targetType: input.targetType,
          targetKey: input.targetKey,
        },
      ],
    });

    return statuses[`${input.targetType}:${input.targetKey ?? ''}`] ?? null;
  }

  private async findLatestPersistedMutationStatuses(input: {
    planId: string;
    tenantSlug?: string;
    workspaceSlug?: string | null;
    targets: Array<{
      targetType: string;
      targetKey: string | null | undefined;
    }>;
  }) {
    const normalizedTargets = input.targets.filter(
      (target): target is { targetType: string; targetKey: string } =>
        Boolean(target.targetKey),
    );
    const emptyResult = Object.fromEntries(
      input.targets.map((target) => [
        `${target.targetType}:${target.targetKey ?? ''}`,
        null,
      ]),
    ) as Record<string, string | null>;

    if (!this.runtimeHistory || normalizedTargets.length === 0) {
      return emptyResult;
    }

    if ('findLatestMutations' in this.runtimeHistory) {
      const mutations = await this.runtimeHistory.findLatestMutations({
        planId: input.planId,
        tenantSlug: input.tenantSlug,
        workspaceSlug: input.workspaceSlug,
        targets: normalizedTargets,
      });

      return {
        ...emptyResult,
        ...Object.fromEntries(
          Object.entries(mutations).map(([key, mutation]) => [
            key,
            mutation?.toStatus ?? null,
          ]),
        ),
      };
    }

    if ('findLatestMutation' in this.runtimeHistory) {
      const mutations = await Promise.all(
        normalizedTargets.map(async (target) => {
          const mutation = await this.runtimeHistory?.findLatestMutation({
            planId: input.planId,
            tenantSlug: input.tenantSlug,
            workspaceSlug: input.workspaceSlug,
            targetType: target.targetType,
            targetKey: target.targetKey,
          });

          return [
            `${target.targetType}:${target.targetKey}`,
            mutation?.toStatus ?? null,
          ] as const;
        }),
      );

      return {
        ...emptyResult,
        ...Object.fromEntries(mutations),
      };
    }

    const latestSnapshot = await this.findLatestPersistedRuntimeSnapshot({
      planId: input.planId,
      tenantSlug: input.tenantSlug,
      workspaceSlug: input.workspaceSlug,
    });

    return {
      ...emptyResult,
      ...Object.fromEntries(
        normalizedTargets.map((target) => [
          `${target.targetType}:${target.targetKey}`,
          this.latestPersistedMutationStatus(
            latestSnapshot,
            target.targetType,
            target.targetKey,
          ),
        ]),
      ),
    };
  }

  private normalizeStringList(values?: string[]) {
    if (!values) {
      return [];
    }

    return Array.from(
      new Set(values.map((value) => value.trim()).filter(Boolean)),
    );
  }

  private normalizeRuntimeBindings(
    bindings?: Array<{
      runtimeKey?: string;
      systemKey?: string;
      deliveryMode?: string;
      approvalRequired?: boolean;
    }>,
  ) {
    if (!bindings) {
      return [];
    }

    const seen = new Set<string>();

    return bindings
      .map((binding) => ({
        runtimeKey: binding.runtimeKey?.trim() ?? '',
        systemKey: binding.systemKey?.trim() ?? '',
        deliveryMode: binding.deliveryMode?.trim() ?? '',
        approvalRequired: Boolean(binding.approvalRequired),
      }))
      .filter((binding) => binding.runtimeKey && binding.systemKey)
      .filter((binding) => {
        const key = `${binding.runtimeKey}::${binding.systemKey}::${binding.deliveryMode}`;

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });
  }

  private normalizeChildWorkflowContracts(
    contracts?: Array<{
      workflowKey?: string;
      runtimeKey?: string;
      systemKey?: string;
      triggerMode?: string;
      approvalRequired?: boolean;
      approvalCheckpointKey?: string;
    }>,
  ) {
    if (!contracts) {
      return [];
    }

    const seen = new Set<string>();

    return contracts
      .map((contract) => ({
        workflowKey: contract.workflowKey?.trim() ?? '',
        runtimeKey: contract.runtimeKey?.trim() ?? '',
        systemKey: contract.systemKey?.trim() ?? '',
        triggerMode: contract.triggerMode?.trim() ?? '',
        approvalRequired: Boolean(contract.approvalRequired),
        approvalCheckpointKey: contract.approvalCheckpointKey?.trim() ?? '',
      }))
      .filter(
        (contract) =>
          contract.workflowKey && contract.runtimeKey && contract.systemKey,
      )
      .filter((contract) => {
        const key = `${contract.workflowKey}::${contract.runtimeKey}::${contract.systemKey}::${contract.triggerMode}`;

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });
  }

  private normalizeApprovalContracts(
    contracts?: Array<{
      checkpointKey?: string;
      approverRole?: string;
      channel?: string;
      escalationMode?: string;
      required?: boolean;
    }>,
  ) {
    if (!contracts) {
      return [];
    }

    const seen = new Set<string>();

    return contracts
      .map((contract) => ({
        checkpointKey: contract.checkpointKey?.trim() ?? '',
        approverRole: contract.approverRole?.trim() ?? '',
        channel: contract.channel?.trim() ?? '',
        escalationMode: contract.escalationMode?.trim() ?? '',
        required: contract.required !== false,
      }))
      .filter((contract) => contract.checkpointKey && contract.approverRole)
      .filter((contract) => {
        const key = `${contract.checkpointKey}::${contract.approverRole}::${contract.channel}::${contract.escalationMode}`;

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });
  }

  private normalizeEscalationContracts(
    contracts?: Array<{
      escalationKey?: string;
      fromCheckpointKey?: string;
      targetRole?: string;
      triggerMode?: string;
      delayMinutes?: number;
    }>,
  ) {
    if (!contracts) {
      return [];
    }

    const seen = new Set<string>();

    return contracts
      .map((contract) => ({
        escalationKey: contract.escalationKey?.trim() ?? '',
        fromCheckpointKey: contract.fromCheckpointKey?.trim() ?? '',
        targetRole: contract.targetRole?.trim() ?? '',
        triggerMode: contract.triggerMode?.trim() ?? '',
        delayMinutes:
          typeof contract.delayMinutes === 'number' &&
          Number.isFinite(contract.delayMinutes) &&
          contract.delayMinutes >= 0
            ? contract.delayMinutes
            : 0,
      }))
      .filter(
        (contract) =>
          contract.escalationKey &&
          contract.fromCheckpointKey &&
          contract.targetRole,
      )
      .filter((contract) => {
        const key = `${contract.escalationKey}::${contract.fromCheckpointKey}::${contract.targetRole}::${contract.triggerMode}`;

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });
  }

  private normalizeRollbackContracts(
    contracts?: Array<{
      rollbackKey?: string;
      fromCheckpointKey?: string;
      targetSystemKey?: string;
      strategy?: string;
      preserveArtifacts?: boolean;
    }>,
  ) {
    if (!contracts) {
      return [];
    }

    const seen = new Set<string>();

    return contracts
      .map((contract) => ({
        rollbackKey: contract.rollbackKey?.trim() ?? '',
        fromCheckpointKey: contract.fromCheckpointKey?.trim() ?? '',
        targetSystemKey: contract.targetSystemKey?.trim() ?? '',
        strategy: contract.strategy?.trim() ?? '',
        preserveArtifacts: Boolean(contract.preserveArtifacts),
      }))
      .filter(
        (contract) =>
          contract.rollbackKey &&
          contract.fromCheckpointKey &&
          contract.targetSystemKey,
      )
      .filter((contract) => {
        const key = `${contract.rollbackKey}::${contract.fromCheckpointKey}::${contract.targetSystemKey}::${contract.strategy}`;

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });
  }

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
      sourceRefs: this.normalizeStringList(input.sourceRefs),
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
      constraints: this.normalizeStringList(input.constraints),
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
      hints: this.normalizeStringList(input.hints),
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
    lifecyclePhases?: Array<{
      phaseKey: string;
    }>;
  }) {
    const systemBoundaryByPhaseKey = new Map([
      ['market-discovery', 'research-intelligence'],
      ['supplier-validation', 'supplier-management'],
      ['go-to-market-planning', 'campaign-planning'],
      ['content-production', 'content-workspace'],
      ['channel-distribution', 'channel-publishing'],
      ['sales-conversion', 'crm-commerce'],
      ['operations-fulfillment', 'order-fulfillment'],
      ['customer-success', 'customer-support'],
    ]);
    const operatorCheckpoints = [
      {
        checkpointKey: 'approve-supplier-selection',
        phaseKey: 'supplier-validation',
        checkpointStatus: 'review-required',
        reason: 'Confirm sourcing, unit economics, and fulfillment risk before launch planning.',
      },
      {
        checkpointKey: 'approve-content-release',
        phaseKey: 'content-production',
        checkpointStatus: 'review-required',
        reason: 'Approve customer-facing assets before any channel publication.',
      },
      {
        checkpointKey: 'review-fulfillment-exceptions',
        phaseKey: 'operations-fulfillment',
        checkpointStatus: 'review-required',
        reason: 'Review operating exceptions before customer-impacting remediation.',
      },
    ];

    return {
      planId: input.planId,
      coordinationStatus: 'draft',
      objective:
        input.objective?.trim() ||
        'Assign workflow steps to the leanest viable mix of first-party modules and connected systems.',
      preferredSystems: this.normalizeStringList(input.preferredSystems),
      systemAssignments: (input.lifecyclePhases ?? []).map((phase) => ({
        phaseKey: phase.phaseKey,
        systemBoundaryKey:
          systemBoundaryByPhaseKey.get(phase.phaseKey) ?? 'operator-workspace',
        assignmentStatus: 'review-required',
        connectorActivationAllowed: false,
      })),
      connectorRecommendations: [],
      operatorCheckpoints,
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
    lifecyclePhases?: Array<{
      phaseKey: string;
      outputKeys: string[];
      nextPhaseKey: string;
    }>;
  }) {
    return {
      planId: input.planId,
      dataflowStatus: 'draft',
      objective:
        input.objective?.trim() ||
        'Model the leanest safe data movement across systems, approvals, and source-of-truth boundaries.',
      businessObjects: this.normalizeStringList(input.businessObjects),
      edges: (input.lifecyclePhases ?? []).flatMap((phase) =>
        phase.outputKeys.map((outputKey) => ({
          edgeKey: `${phase.phaseKey}:${outputKey}->${phase.nextPhaseKey}`,
          fromPhaseKey: phase.phaseKey,
          toPhaseKey: phase.nextPhaseKey,
          businessObjectKey: outputKey,
          edgeStatus: 'review-required',
        })),
      ),
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
      priorities: this.normalizeStringList(input.priorities),
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
    lifecyclePhases?: Array<{
      phaseKey: string;
      objective: string;
      nextPhaseKey: string;
    }>;
    operatorCheckpoints?: Array<{
      checkpointKey: string;
      phaseKey: string;
      checkpointStatus: string;
      reason: string;
    }>;
  }) {
    const lifecyclePhases = input.lifecyclePhases ?? [];
    const kpis = [
      {
        metricKey: 'validated-product-candidate-count',
        phaseKey: 'market-discovery',
        metricStatus: 'definition-review-required',
        measurementKind: 'count',
      },
      {
        metricKey: 'approved-content-asset-count',
        phaseKey: 'content-production',
        metricStatus: 'definition-review-required',
        measurementKind: 'count',
      },
      {
        metricKey: 'lead-to-order-conversion-rate',
        phaseKey: 'sales-conversion',
        metricStatus: 'definition-review-required',
        measurementKind: 'ratio',
      },
      {
        metricKey: 'fulfilled-order-rate',
        phaseKey: 'operations-fulfillment',
        metricStatus: 'definition-review-required',
        measurementKind: 'ratio',
      },
      {
        metricKey: 'repeat-purchase-signal-count',
        phaseKey: 'customer-success',
        metricStatus: 'definition-review-required',
        measurementKind: 'count',
      },
    ];

    return {
      planId: input.planId,
      graphStatus: 'draft',
      objective:
        input.objective?.trim() ||
        'Project the parent workflow into a renderable graph with lanes, nodes, edges, and approval checkpoints.',
      lanes: this.normalizeStringList(input.lanes),
      nodes: lifecyclePhases.map((phase) => ({
        nodeKey: phase.phaseKey,
        nodeType: 'business-lifecycle-phase',
        label: phase.phaseKey,
        objective: phase.objective,
      })),
      edges: lifecyclePhases.map((phase) => ({
        edgeKey: `${phase.phaseKey}->${phase.nextPhaseKey}`,
        fromNodeKey: phase.phaseKey,
        toNodeKey: phase.nextPhaseKey,
        edgeType: 'business-lifecycle-transition',
      })),
      overlays: {
        approvals: input.operatorCheckpoints ?? [],
        kpis,
      },
      contextScope: {
        tenantSlug: input.tenantSlug,
        workspaceSlug: input.workspaceSlug ?? null,
      },
    };
  }

  buildBusinessLifecycleDraft(input: {
    tenantSlug: string;
    workspaceSlug?: string | null;
    planId: string;
  }) {
    return {
      planId: input.planId,
      lifecycleStatus: 'draft-review-required',
      loopMode: 'closed-loop',
      phases: [
        {
          phaseKey: 'market-discovery',
          objective: 'Identify and rank product opportunities.',
          outputKeys: ['product-candidate-shortlist'],
          nextPhaseKey: 'supplier-validation',
        },
        {
          phaseKey: 'supplier-validation',
          objective: 'Validate sourcing, margin, fulfillment, and risk assumptions.',
          outputKeys: ['validated-supplier-options', 'unit-economics-draft'],
          nextPhaseKey: 'go-to-market-planning',
        },
        {
          phaseKey: 'go-to-market-planning',
          objective: 'Define audience, offer, channel, goals, and measurement.',
          outputKeys: ['go-to-market-plan', 'measurement-plan'],
          nextPhaseKey: 'content-production',
        },
        {
          phaseKey: 'content-production',
          objective: 'Draft, review, and approve content assets.',
          outputKeys: ['approved-content-assets'],
          nextPhaseKey: 'channel-distribution',
        },
        {
          phaseKey: 'channel-distribution',
          objective: 'Publish approved assets and capture demand signals.',
          outputKeys: ['campaign-events', 'lead-captures'],
          nextPhaseKey: 'sales-conversion',
        },
        {
          phaseKey: 'sales-conversion',
          objective: 'Qualify leads, close orders, and record attribution.',
          outputKeys: ['qualified-leads', 'orders', 'revenue-attribution'],
          nextPhaseKey: 'operations-fulfillment',
        },
        {
          phaseKey: 'operations-fulfillment',
          objective: 'Coordinate order fulfillment and operating exceptions.',
          outputKeys: ['fulfillment-events', 'operating-exceptions'],
          nextPhaseKey: 'customer-success',
        },
        {
          phaseKey: 'customer-success',
          objective: 'Support customers and feed evidence into the next iteration.',
          outputKeys: ['customer-feedback', 'repeat-purchase-signals'],
          nextPhaseKey: 'market-discovery',
        },
      ],
      feedbackLoops: [
        {
          fromPhaseKey: 'customer-success',
          toPhaseKey: 'market-discovery',
          signalKeys: [
            'customer-feedback',
            'repeat-purchase-signals',
            'refund-reasons',
          ],
        },
      ],
      contextScope: {
        tenantSlug: input.tenantSlug,
        workspaceSlug: input.workspaceSlug ?? null,
      },
    };
  }

  buildBusinessSystemBlueprintDraft(input: {
    tenantSlug: string;
    workspaceSlug?: string | null;
    naturalLanguageBrief?: string;
    constraints?: string[];
    preferredSystems?: string[];
    businessObjects?: string[];
    priorities?: string[];
    lanes?: string[];
  }) {
    const objective =
      input.naturalLanguageBrief?.trim() ||
      'Design a reviewable end-to-end business system from the user brief.';
    const roadmapDraft = this.buildRoadmapDraft({
      tenantSlug: input.tenantSlug,
      workspaceSlug: input.workspaceSlug,
      sourceKind: 'natural-language',
      title: 'Natural-language business system blueprint',
      content: objective,
    });
    const parentWorkflowPlan = this.buildParentWorkflowPlan({
      tenantSlug: input.tenantSlug,
      workspaceSlug: input.workspaceSlug,
      roadmapDraftId: roadmapDraft.id,
      objective,
      constraints: input.constraints,
    });
    const planId = parentWorkflowPlan.id;
    const businessLifecycle = this.buildBusinessLifecycleDraft({
      tenantSlug: input.tenantSlug,
      workspaceSlug: input.workspaceSlug,
      planId,
    });
    const appCoordination = this.buildAppCoordinationDraft({
      tenantSlug: input.tenantSlug,
      workspaceSlug: input.workspaceSlug,
      planId,
      objective,
      preferredSystems: input.preferredSystems,
      lifecyclePhases: businessLifecycle.phases,
    });

    return {
      blueprintStatus: 'draft-review-required',
      intentSurface: 'natural-language',
      executionPolicy: {
        mode: 'preview-only',
        externalActionsAllowed: false,
        approvalRequiredBeforeActivation: true,
      },
      roadmapDraft,
      interpretation: this.buildRoadmapInterpretation({
        tenantSlug: input.tenantSlug,
        workspaceSlug: input.workspaceSlug,
        roadmapDraftId: roadmapDraft.id,
        objective,
        hints: input.constraints,
      }),
      parentWorkflowPlan,
      appCoordination,
      dataflow: this.buildDataflowModelDraft({
        tenantSlug: input.tenantSlug,
        workspaceSlug: input.workspaceSlug,
        planId,
        objective,
        businessObjects: input.businessObjects,
        lifecyclePhases: businessLifecycle.phases,
      }),
      optimizationSummary: this.buildOptimizationSummaryDraft({
        tenantSlug: input.tenantSlug,
        workspaceSlug: input.workspaceSlug,
        planId,
        objective,
        priorities: input.priorities,
      }),
      workflowGraph: this.buildWorkflowGraphDraft({
        tenantSlug: input.tenantSlug,
        workspaceSlug: input.workspaceSlug,
        planId,
        objective,
        lanes: input.lanes,
        lifecyclePhases: businessLifecycle.phases,
        operatorCheckpoints: appCoordination.operatorCheckpoints,
      }),
      businessLifecycle,
      executionContractDraft: this.buildExecutionContractDraft({
        tenantSlug: input.tenantSlug,
        workspaceSlug: input.workspaceSlug,
        planId,
        objective,
        unboundChildWorkflowDrafts: appCoordination.systemAssignments.map(
          (assignment) => ({
            workflowKey: assignment.phaseKey,
            systemBoundaryKey: assignment.systemBoundaryKey,
            approvalCheckpointKey:
              appCoordination.operatorCheckpoints.find(
                (checkpoint) => checkpoint.phaseKey === assignment.phaseKey,
              )?.checkpointKey,
          }),
        ),
        approvalContracts: appCoordination.operatorCheckpoints.map(
          (checkpoint) => ({
            checkpointKey: checkpoint.checkpointKey,
            approverRole: 'operator',
            escalationMode: 'manual-review',
            required: true,
          }),
        ),
        activationReadiness: {
          sourceOfTruthAssignmentCount: 0,
          syncPolicyCount: 0,
        },
      }),
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
    runtimeBindings?: Array<{
      runtimeKey?: string;
      systemKey?: string;
      deliveryMode?: string;
      approvalRequired?: boolean;
    }>;
    childWorkflowContracts?: Array<{
      workflowKey?: string;
      runtimeKey?: string;
      systemKey?: string;
      triggerMode?: string;
      approvalRequired?: boolean;
      approvalCheckpointKey?: string;
    }>;
    unboundChildWorkflowDrafts?: Array<{
      workflowKey?: string;
      systemBoundaryKey?: string;
      approvalCheckpointKey?: string;
    }>;
    approvalContracts?: Array<{
      checkpointKey?: string;
      approverRole?: string;
      channel?: string;
      escalationMode?: string;
      required?: boolean;
    }>;
    escalationContracts?: Array<{
      escalationKey?: string;
      fromCheckpointKey?: string;
      targetRole?: string;
      triggerMode?: string;
      delayMinutes?: number;
    }>;
    rollbackContracts?: Array<{
      rollbackKey?: string;
      fromCheckpointKey?: string;
      targetSystemKey?: string;
      strategy?: string;
      preserveArtifacts?: boolean;
    }>;
    activationReadiness?: {
      sourceOfTruthAssignmentCount?: number;
      syncPolicyCount?: number;
    };
  }) {
    const executionModes = this.normalizeStringList(input.executionModes);
    const runtimeBindings = this.normalizeRuntimeBindings(input.runtimeBindings);
    const childWorkflowContracts = this.normalizeChildWorkflowContracts(
      input.childWorkflowContracts,
    );
    const unboundChildWorkflowDrafts = (input.unboundChildWorkflowDrafts ?? [])
      .map((draft) => ({
        workflowKey: draft.workflowKey?.trim() ?? '',
        systemBoundaryKey: draft.systemBoundaryKey?.trim() ?? '',
        approvalCheckpointKey: draft.approvalCheckpointKey?.trim() ?? '',
        runtimeBindingStatus: 'unassigned',
      }))
      .filter((draft) => draft.workflowKey && draft.systemBoundaryKey);
    const approvalContracts = this.normalizeApprovalContracts(
      input.approvalContracts,
    );
    const escalationContracts = this.normalizeEscalationContracts(
      input.escalationContracts,
    );
    const rollbackContracts = this.normalizeRollbackContracts(
      input.rollbackContracts,
    );
    const missingApprovalChannelCount = approvalContracts.filter(
      (contract) => contract.required && !contract.channel,
    ).length;
    const sourceOfTruthAssignmentCount =
      input.activationReadiness?.sourceOfTruthAssignmentCount ?? 0;
    const syncPolicyCount = input.activationReadiness?.syncPolicyCount ?? 0;
    const activationBlockers = [
      ...(unboundChildWorkflowDrafts.length > 0
        ? ['runtime-bindings-unassigned']
        : []),
      ...(missingApprovalChannelCount > 0
        ? ['approval-channels-unassigned']
        : []),
      ...(sourceOfTruthAssignmentCount === 0
        ? ['source-of-truth-assignments-unresolved']
        : []),
      ...(syncPolicyCount === 0 ? ['sync-policies-unresolved'] : []),
    ];
    const activationNextActions = [
      ...(unboundChildWorkflowDrafts.length > 0
        ? [
            {
              actionKey: 'assign-runtime-bindings',
              actionOrder: 1,
              actionStatus: 'required',
              reason: 'Bind each lifecycle workflow draft to a configured runtime and system connection.',
            },
          ]
        : []),
      ...(missingApprovalChannelCount > 0
        ? [
            {
              actionKey: 'configure-approval-channels',
              actionOrder: 2,
              actionStatus: 'required',
              reason: 'Choose delivery channels for required operator approvals.',
            },
          ]
        : []),
      ...(sourceOfTruthAssignmentCount === 0
        ? [
            {
              actionKey: 'assign-source-of-truth',
              actionOrder: 3,
              actionStatus: 'required',
              reason: 'Select the authoritative system for lifecycle business objects.',
            },
          ]
        : []),
      ...(syncPolicyCount === 0
        ? [
            {
              actionKey: 'define-sync-policies',
              actionOrder: 4,
              actionStatus: 'required',
              reason: 'Define how approved business-object updates synchronize across system boundaries.',
            },
          ]
        : []),
    ];

    return {
      planId: input.planId,
      executionContractStatus: 'draft',
      objective:
        input.objective?.trim() ||
        'Define the execution contract across workflows, approvals, connected systems, and failure-handling boundaries.',
      executionModes,
      runtimeBindings,
      childWorkflowContracts,
      unboundChildWorkflowDrafts,
      approvalContracts,
      escalationContracts,
      rollbackContracts,
      activationReadiness: {
        status:
          activationBlockers.length > 0
            ? 'blocked-pending-configuration'
            : 'ready-for-activation-review',
        activationAllowed: false,
        blockers: activationBlockers,
        nextActions: activationNextActions,
        missingRuntimeBindingCount: unboundChildWorkflowDrafts.length,
        missingApprovalChannelCount,
        sourceOfTruthAssignmentCount,
        syncPolicyCount,
      },
      draftSummary: {
        executionModeCount: executionModes.length,
        runtimeBindingCount: runtimeBindings.length,
        approvalRequiredRuntimeBindingCount: runtimeBindings.filter(
          (binding) => binding.approvalRequired,
        ).length,
        childWorkflowContractCount: childWorkflowContracts.length,
        unboundChildWorkflowDraftCount: unboundChildWorkflowDrafts.length,
        approvalRequiredChildWorkflowCount: childWorkflowContracts.filter(
          (contract) => contract.approvalRequired,
        ).length,
        childWorkflowCheckpointCount: childWorkflowContracts.filter(
          (contract) => Boolean(contract.approvalCheckpointKey),
        ).length,
        approvalContractCount: approvalContracts.length,
        requiredApprovalContractCount: approvalContracts.filter(
          (contract) => contract.required,
        ).length,
        escalationContractCount: escalationContracts.length,
        rollbackContractCount: rollbackContracts.length,
      },
      contextScope: {
        tenantSlug: input.tenantSlug,
        workspaceSlug: input.workspaceSlug ?? null,
      },
    };
  }

  submitExecutionContract(input: {
    tenantSlug: string;
    workspaceSlug?: string | null;
    planId: string;
    objective?: string;
    executionModes?: string[];
    runtimeBindings?: Array<{
      runtimeKey?: string;
      systemKey?: string;
      deliveryMode?: string;
      approvalRequired?: boolean;
    }>;
    childWorkflowContracts?: Array<{
      workflowKey?: string;
      runtimeKey?: string;
      systemKey?: string;
      triggerMode?: string;
      approvalRequired?: boolean;
      approvalCheckpointKey?: string;
    }>;
    approvalContracts?: Array<{
      checkpointKey?: string;
      approverRole?: string;
      channel?: string;
      escalationMode?: string;
      required?: boolean;
    }>;
    escalationContracts?: Array<{
      escalationKey?: string;
      fromCheckpointKey?: string;
      targetRole?: string;
      triggerMode?: string;
      delayMinutes?: number;
    }>;
    rollbackContracts?: Array<{
      rollbackKey?: string;
      fromCheckpointKey?: string;
      targetSystemKey?: string;
      strategy?: string;
      preserveArtifacts?: boolean;
    }>;
    submittedBy?: string;
    submissionNotes?: string;
  }) {
    const draft = this.buildExecutionContractDraft(input);
    if (draft.childWorkflowContracts.length === 0) {
      throw new BadRequestException(
        'Execution contract submission requires at least one child workflow contract.',
      );
    }

    const duplicateRuntimeBinding = draft.runtimeBindings.find(
      (binding, index) =>
        draft.runtimeBindings.findIndex(
          (candidate) =>
            candidate.runtimeKey === binding.runtimeKey &&
            candidate.systemKey === binding.systemKey,
        ) !== index,
    );

    if (duplicateRuntimeBinding) {
      throw new BadRequestException(
        `Execution contract cannot declare multiple runtime bindings for ${duplicateRuntimeBinding.runtimeKey}/${duplicateRuntimeBinding.systemKey}.`,
      );
    }

    const duplicateApprovalCheckpoint = draft.approvalContracts.find(
      (contract, index) =>
        draft.approvalContracts.findIndex(
          (candidate) => candidate.checkpointKey === contract.checkpointKey,
        ) !== index,
    );

    if (duplicateApprovalCheckpoint) {
      throw new BadRequestException(
        `Execution contract cannot declare multiple approval contracts for checkpoint ${duplicateApprovalCheckpoint.checkpointKey}.`,
      );
    }

    const duplicateChildWorkflowRoute = draft.childWorkflowContracts.find(
      (contract, index) =>
        draft.childWorkflowContracts.findIndex(
          (candidate) =>
            candidate.workflowKey === contract.workflowKey &&
            candidate.runtimeKey === contract.runtimeKey &&
            candidate.systemKey === contract.systemKey,
        ) !== index,
    );

    if (duplicateChildWorkflowRoute) {
      throw new BadRequestException(
        `Execution contract cannot declare multiple child workflow contracts for ${duplicateChildWorkflowRoute.workflowKey} on ${duplicateChildWorkflowRoute.runtimeKey}/${duplicateChildWorkflowRoute.systemKey}.`,
      );
    }

    const duplicateEscalationRoute = draft.escalationContracts.find(
      (contract, index) =>
        draft.escalationContracts.findIndex(
          (candidate) =>
            candidate.fromCheckpointKey === contract.fromCheckpointKey &&
            candidate.targetRole === contract.targetRole,
        ) !== index,
    );

    if (duplicateEscalationRoute) {
      throw new BadRequestException(
        `Execution contract cannot declare multiple escalation contracts for checkpoint ${duplicateEscalationRoute.fromCheckpointKey} targeting role ${duplicateEscalationRoute.targetRole}.`,
      );
    }

    const duplicateRollbackRoute = draft.rollbackContracts.find(
      (contract, index) =>
        draft.rollbackContracts.findIndex(
          (candidate) =>
            candidate.fromCheckpointKey === contract.fromCheckpointKey &&
            candidate.targetSystemKey === contract.targetSystemKey,
        ) !== index,
    );

    if (duplicateRollbackRoute) {
      throw new BadRequestException(
        `Execution contract cannot declare multiple rollback contracts for checkpoint ${duplicateRollbackRoute.fromCheckpointKey} targeting system ${duplicateRollbackRoute.targetSystemKey}.`,
      );
    }

    const requiredApprovalContracts = draft.approvalContracts.filter(
      (contract) => contract.required,
    );
    const optionalApprovalContract = draft.approvalContracts.find(
      (contract) => !contract.required,
    );

    if (optionalApprovalContract) {
      throw new BadRequestException(
        `Execution contract submission does not yet support optional approval contract ${optionalApprovalContract.checkpointKey}; declare it as required or remove it from the submission.`,
      );
    }

    const requiredApprovalCheckpointKeys = new Set(
      requiredApprovalContracts.map((contract) => contract.checkpointKey),
    );

    const hasApprovalRequiredChildWorkflow = draft.childWorkflowContracts.some(
      (contract) => contract.approvalRequired,
    );

    if (hasApprovalRequiredChildWorkflow && requiredApprovalContracts.length === 0) {
      throw new BadRequestException(
        'Approval-required child workflows require at least one required approval contract.',
      );
    }

    if (!hasApprovalRequiredChildWorkflow && draft.approvalContracts.length > 0) {
      throw new BadRequestException(
        'Approval contracts require at least one approval-required child workflow.',
      );
    }

    const approvalRequiredChildWithoutCheckpoint =
      draft.childWorkflowContracts.find(
        (contract) => contract.approvalRequired && !contract.approvalCheckpointKey,
      );

    if (approvalRequiredChildWithoutCheckpoint) {
      throw new BadRequestException(
        `Approval-required child workflow ${approvalRequiredChildWithoutCheckpoint.workflowKey} requires an approvalCheckpointKey.`,
      );
    }

    const nonApprovalChildWithCheckpoint = draft.childWorkflowContracts.find(
      (contract) => !contract.approvalRequired && contract.approvalCheckpointKey,
    );

    if (nonApprovalChildWithCheckpoint) {
      throw new BadRequestException(
        `Child workflow ${nonApprovalChildWithCheckpoint.workflowKey} cannot declare approvalCheckpointKey ${nonApprovalChildWithCheckpoint.approvalCheckpointKey} when approvalRequired is false.`,
      );
    }

    const approvalRequiredChildWithUnknownCheckpoint =
      draft.childWorkflowContracts.find(
        (contract) =>
          contract.approvalRequired &&
          contract.approvalCheckpointKey &&
          !requiredApprovalCheckpointKeys.has(contract.approvalCheckpointKey),
      );

    if (approvalRequiredChildWithUnknownCheckpoint) {
      throw new BadRequestException(
        `Approval-required child workflow ${approvalRequiredChildWithUnknownCheckpoint.workflowKey} references unknown required approval checkpoint ${approvalRequiredChildWithUnknownCheckpoint.approvalCheckpointKey}.`,
      );
    }

    const requiredApprovalContractWithoutMappedChildWorkflow =
      requiredApprovalContracts.find(
        (contract) =>
          !draft.childWorkflowContracts.some(
            (childWorkflow) =>
              childWorkflow.approvalRequired &&
              childWorkflow.approvalCheckpointKey === contract.checkpointKey,
          ),
      );

    if (requiredApprovalContractWithoutMappedChildWorkflow) {
      throw new BadRequestException(
        `Required approval contract ${requiredApprovalContractWithoutMappedChildWorkflow.checkpointKey} must be referenced by at least one approval-required child workflow.`,
      );
    }

    const escalationWithUnknownCheckpoint = draft.escalationContracts.find(
      (contract) => !requiredApprovalCheckpointKeys.has(contract.fromCheckpointKey),
    );

    if (escalationWithUnknownCheckpoint) {
      throw new BadRequestException(
        `Escalation contract ${escalationWithUnknownCheckpoint.escalationKey} references unknown required approval checkpoint ${escalationWithUnknownCheckpoint.fromCheckpointKey}.`,
      );
    }

    const escalationWithUnchangedApprovalRole = draft.escalationContracts.find(
      (contract) => {
        const matchingApprovalContract = requiredApprovalContracts.find(
          (approvalContract) =>
            approvalContract.checkpointKey === contract.fromCheckpointKey,
        );

        return (
          matchingApprovalContract != null &&
          matchingApprovalContract.approverRole === contract.targetRole
        );
      },
    );

    if (escalationWithUnchangedApprovalRole) {
      const matchingApprovalContract = requiredApprovalContracts.find(
        (approvalContract) =>
          approvalContract.checkpointKey ===
          escalationWithUnchangedApprovalRole.fromCheckpointKey,
      );

      throw new BadRequestException(
        `Escalation contract ${escalationWithUnchangedApprovalRole.escalationKey} must target a role different from the required approval role ${matchingApprovalContract?.approverRole ?? escalationWithUnchangedApprovalRole.targetRole} for checkpoint ${escalationWithUnchangedApprovalRole.fromCheckpointKey}.`,
      );
    }

    const rollbackWithUnknownCheckpoint = draft.rollbackContracts.find(
      (contract) => !requiredApprovalCheckpointKeys.has(contract.fromCheckpointKey),
    );

    if (rollbackWithUnknownCheckpoint) {
      throw new BadRequestException(
        `Rollback contract ${rollbackWithUnknownCheckpoint.rollbackKey} references unknown required approval checkpoint ${rollbackWithUnknownCheckpoint.fromCheckpointKey}.`,
      );
    }

    const childWorkflowSystemKeys = new Set(
      draft.childWorkflowContracts.map((contract) => contract.systemKey),
    );
    const rollbackWithUnknownTargetSystem = draft.rollbackContracts.find(
      (contract) => !childWorkflowSystemKeys.has(contract.targetSystemKey),
    );

    if (rollbackWithUnknownTargetSystem) {
      throw new BadRequestException(
        `Rollback contract ${rollbackWithUnknownTargetSystem.rollbackKey} references unknown child workflow target system ${rollbackWithUnknownTargetSystem.targetSystemKey}.`,
      );
    }

    const childWorkflowWithoutRuntimeBinding = draft.childWorkflowContracts.find(
      (contract) =>
        !draft.runtimeBindings.some(
          (binding) =>
            binding.runtimeKey === contract.runtimeKey &&
            binding.systemKey === contract.systemKey,
        ),
    );

    if (childWorkflowWithoutRuntimeBinding) {
      throw new BadRequestException(
        `Child workflow ${childWorkflowWithoutRuntimeBinding.workflowKey} references runtime/system ${childWorkflowWithoutRuntimeBinding.runtimeKey}/${childWorkflowWithoutRuntimeBinding.systemKey} without a matching runtime binding.`,
      );
    }

    const approvalRequiredChildWithNonApprovalRuntimeBinding =
      draft.childWorkflowContracts.find((contract) => {
        if (!contract.approvalRequired) {
          return false;
        }

        const matchingBinding = draft.runtimeBindings.find(
          (binding) =>
            binding.runtimeKey === contract.runtimeKey &&
            binding.systemKey === contract.systemKey,
        );

        return matchingBinding != null && !matchingBinding.approvalRequired;
      });

    if (approvalRequiredChildWithNonApprovalRuntimeBinding) {
      throw new BadRequestException(
        `Approval-required child workflow ${approvalRequiredChildWithNonApprovalRuntimeBinding.workflowKey} must reference a runtime binding marked approvalRequired for ${approvalRequiredChildWithNonApprovalRuntimeBinding.runtimeKey}/${approvalRequiredChildWithNonApprovalRuntimeBinding.systemKey}.`,
      );
    }

    const nonApprovalChildWithApprovalRuntimeBinding =
      draft.childWorkflowContracts.find((contract) => {
        if (contract.approvalRequired) {
          return false;
        }

        const matchingBinding = draft.runtimeBindings.find(
          (binding) =>
            binding.runtimeKey === contract.runtimeKey &&
            binding.systemKey === contract.systemKey,
        );

        return matchingBinding?.approvalRequired === true;
      });

    if (nonApprovalChildWithApprovalRuntimeBinding) {
      throw new BadRequestException(
        `Child workflow ${nonApprovalChildWithApprovalRuntimeBinding.workflowKey} cannot reference approval-required runtime binding ${nonApprovalChildWithApprovalRuntimeBinding.runtimeKey}/${nonApprovalChildWithApprovalRuntimeBinding.systemKey} when approvalRequired is false.`,
      );
    }

    const approvalRequiredRuntimeBindingWithoutMappedChild =
      draft.runtimeBindings.find(
        (binding) =>
          binding.approvalRequired &&
          !draft.childWorkflowContracts.some(
            (contract) =>
              contract.approvalRequired &&
              contract.runtimeKey === binding.runtimeKey &&
              contract.systemKey === binding.systemKey,
          ),
      );

    if (approvalRequiredRuntimeBindingWithoutMappedChild) {
      throw new BadRequestException(
        `Approval-required runtime binding ${approvalRequiredRuntimeBindingWithoutMappedChild.runtimeKey}/${approvalRequiredRuntimeBindingWithoutMappedChild.systemKey} must be referenced by at least one approval-required child workflow.`,
      );
    }

    const rollbackWithoutMappedChildWorkflow = draft.rollbackContracts.find(
      (contract) =>
        !draft.childWorkflowContracts.some(
          (childWorkflow) =>
            childWorkflow.approvalRequired &&
            childWorkflow.systemKey === contract.targetSystemKey &&
            childWorkflow.approvalCheckpointKey === contract.fromCheckpointKey,
        ),
    );

    if (rollbackWithoutMappedChildWorkflow) {
      throw new BadRequestException(
        `Rollback contract ${rollbackWithoutMappedChildWorkflow.rollbackKey} must map to at least one approval-required child workflow for checkpoint ${rollbackWithoutMappedChildWorkflow.fromCheckpointKey} on system ${rollbackWithoutMappedChildWorkflow.targetSystemKey}.`,
      );
    }

    const storedRuntimeBindings = draft.runtimeBindings.map(
      (binding, index) => ({
        bindingKey: `${input.planId}:binding:${index + 1}`,
        tenantSlug: input.tenantSlug,
        workspaceSlug: input.workspaceSlug ?? null,
        planId: input.planId,
        runtimeKey: binding.runtimeKey,
        systemKey: binding.systemKey,
        deliveryMode: binding.deliveryMode,
        approvalRequired: binding.approvalRequired,
        persistenceStatus: 'pending',
      }),
    );

    const childWorkflowContractRecords = draft.childWorkflowContracts.map(
      (contract, index) => ({
        contractKey: `${input.planId}:child:${index + 1}`,
        persistenceStatus: 'pending',
        runtimeBindingKey:
          storedRuntimeBindings.find(
            (binding) =>
              binding.runtimeKey === contract.runtimeKey &&
              binding.systemKey === contract.systemKey,
          )?.bindingKey ?? null,
        ...contract,
      }),
    );

    const storedChildWorkflowContracts = childWorkflowContractRecords.map(
      (contract) => ({
        contractKey: contract.contractKey,
        tenantSlug: input.tenantSlug,
        workspaceSlug: input.workspaceSlug ?? null,
        planId: input.planId,
        persistenceStatus: contract.persistenceStatus,
        runtimeBindingKey: contract.runtimeBindingKey,
        workflowKey: contract.workflowKey,
        runtimeKey: contract.runtimeKey,
        systemKey: contract.systemKey,
        triggerMode: contract.triggerMode,
        approvalRequired: contract.approvalRequired,
        approvalCheckpointKey: contract.approvalCheckpointKey,
      }),
    );

    const storedApprovalDispatches = draft.approvalContracts.map(
      (contract, index) => ({
        dispatchKey: `${input.planId}:approval:${index + 1}`,
        tenantSlug: input.tenantSlug,
        workspaceSlug: input.workspaceSlug ?? null,
        checkpointKey: contract.checkpointKey,
        approverRole: contract.approverRole,
        channel: contract.channel,
        escalationMode: contract.escalationMode,
        required: contract.required,
        dispatchStatus: 'pending',
        linkedChildContractKeys: childWorkflowContractRecords
          .filter(
            (childContract) =>
              childContract.approvalRequired &&
              childContract.approvalCheckpointKey === contract.checkpointKey,
          )
          .map((childContract) => childContract.contractKey),
      }),
    );

    const storedEscalationContracts = draft.escalationContracts.map(
      (contract, index) => ({
        escalationRecordKey: `${input.planId}:escalation:${index + 1}`,
        tenantSlug: input.tenantSlug,
        workspaceSlug: input.workspaceSlug ?? null,
        checkpointKey: contract.fromCheckpointKey,
        escalationKey: contract.escalationKey,
        targetRole: contract.targetRole,
        triggerMode: contract.triggerMode,
        delayMinutes: contract.delayMinutes,
        persistenceStatus: 'pending',
        linkedDispatchKeys: storedApprovalDispatches
          .filter(
            (dispatch) => dispatch.checkpointKey === contract.fromCheckpointKey,
          )
          .map((dispatch) => dispatch.dispatchKey),
      }),
    );

    const storedRollbackContracts = draft.rollbackContracts.map(
      (contract, index) => ({
        rollbackRecordKey: `${input.planId}:rollback:${index + 1}`,
        tenantSlug: input.tenantSlug,
        workspaceSlug: input.workspaceSlug ?? null,
        checkpointKey: contract.fromCheckpointKey,
        rollbackKey: contract.rollbackKey,
        targetSystemKey: contract.targetSystemKey,
        strategy: contract.strategy,
        preserveArtifacts: contract.preserveArtifacts,
        persistenceStatus: 'pending',
        linkedContractKeys: childWorkflowContractRecords
          .filter(
            (childContract) =>
              childContract.systemKey === contract.targetSystemKey &&
              childContract.approvalCheckpointKey === contract.fromCheckpointKey,
          )
          .map((childContract) => childContract.contractKey),
      }),
    );

    const storedExecutionRunnerRecords = childWorkflowContractRecords.map(
      (contract) => {
        const linkedApprovalDispatchKeys = contract.approvalRequired
          ? storedApprovalDispatches
              .filter(
                (dispatch) =>
                  dispatch.required &&
                  dispatch.checkpointKey === contract.approvalCheckpointKey,
              )
              .map((dispatch) => dispatch.dispatchKey)
          : [];
        const linkedRollbackRecordKeys = storedRollbackContracts
          .filter((rollback) =>
            rollback.linkedContractKeys.includes(contract.contractKey),
          )
          .map((rollback) => rollback.rollbackRecordKey);
        const readinessStatus = !contract.runtimeBindingKey
          ? 'blocked-missing-runtime-binding'
          : linkedApprovalDispatchKeys.length > 0
            ? 'awaiting-required-approval'
            : 'ready-for-dispatch';

        return {
          runnerKey: `${contract.contractKey}:runner`,
          tenantSlug: input.tenantSlug,
          workspaceSlug: input.workspaceSlug ?? null,
          contractKey: contract.contractKey,
          runtimeBindingKey: contract.runtimeBindingKey,
          workflowKey: contract.workflowKey,
          runtimeKey: contract.runtimeKey,
          systemKey: contract.systemKey,
          triggerMode: contract.triggerMode,
          runnerStatus: 'pending',
          readinessStatus,
          linkedApprovalDispatchKeys,
          linkedRollbackRecordKeys,
        };
      },
    );

    const childWorkflowContractLinkage = childWorkflowContractRecords.map(
      (contract) => ({
        contractKey: contract.contractKey,
        linkedApprovalDispatchKeys: storedApprovalDispatches
          .filter((dispatch) => dispatch.linkedChildContractKeys.includes(contract.contractKey))
          .map((dispatch) => dispatch.dispatchKey),
        linkedRunnerKey:
          storedExecutionRunnerRecords.find(
            (runner) => runner.contractKey === contract.contractKey,
          )?.runnerKey ?? null,
        linkedRollbackRecordKeys: storedRollbackContracts
          .filter((rollback) => rollback.linkedContractKeys.includes(contract.contractKey))
          .map((rollback) => rollback.rollbackRecordKey),
      }),
    );

    const runtimeBindingBatch = {
      batchKey: `${input.planId}:runtime-binding`,
      status: 'pending',
      records: storedRuntimeBindings.map((binding) => ({
        bindingKey: binding.bindingKey,
        persistenceStatus: binding.persistenceStatus,
        workspaceSlug: binding.workspaceSlug,
      })),
    };

    const contractPersistenceBatch = {
      batchKey: `${input.planId}:persistence`,
      status: 'pending',
      records: storedChildWorkflowContracts.map((contract) => ({
        contractKey: contract.contractKey,
        persistenceStatus: contract.persistenceStatus,
        workspaceSlug: contract.workspaceSlug,
        runtimeBindingKey: contract.runtimeBindingKey,
        linkedRunnerKey:
          childWorkflowContractLinkage.find(
            (linkage) => linkage.contractKey === contract.contractKey,
          )?.linkedRunnerKey ?? null,
      })),
    };

    const approvalDispatchBatch = {
      batchKey: `${input.planId}:approval-dispatch`,
      status: 'pending',
      records: storedApprovalDispatches.map((dispatch) => ({
        dispatchKey: dispatch.dispatchKey,
        dispatchStatus: dispatch.dispatchStatus,
        workspaceSlug: dispatch.workspaceSlug,
      })),
    };

    const escalationBatch = {
      batchKey: `${input.planId}:escalation`,
      status: 'pending',
      records: storedEscalationContracts.map((contract) => ({
        escalationRecordKey: contract.escalationRecordKey,
        persistenceStatus: contract.persistenceStatus,
        workspaceSlug: contract.workspaceSlug,
      })),
    };

    const rollbackBatch = {
      batchKey: `${input.planId}:rollback`,
      status: 'pending',
      records: storedRollbackContracts.map((contract) => ({
        rollbackRecordKey: contract.rollbackRecordKey,
        persistenceStatus: contract.persistenceStatus,
        workspaceSlug: contract.workspaceSlug,
      })),
    };

    const executionRunnerBatch = {
      batchKey: `${input.planId}:execution-runner`,
      status: 'pending',
      records: storedExecutionRunnerRecords.map((runner) => ({
        runnerKey: runner.runnerKey,
        runnerStatus: runner.runnerStatus,
        workspaceSlug: runner.workspaceSlug,
        runtimeBindingKey: runner.runtimeBindingKey,
        linkedApprovalDispatchKeys: runner.linkedApprovalDispatchKeys,
        linkedRollbackRecordKeys: runner.linkedRollbackRecordKeys,
      })),
    };

    const executionActionRecords = storedExecutionRunnerRecords.map(
      (runner, index) => {
        const actionType =
          runner.readinessStatus === 'awaiting-required-approval'
            ? 'dispatch-required-approval'
            : runner.readinessStatus === 'ready-for-dispatch'
              ? 'dispatch-child-workflow'
              : 'resolve-runtime-binding';
        const actionStatus =
          runner.readinessStatus === 'blocked-missing-runtime-binding'
            ? 'blocked'
            : 'pending';
        const actionTargetKey =
          actionType === 'dispatch-required-approval'
            ? runner.linkedApprovalDispatchKeys[0]
            : actionType === 'dispatch-child-workflow'
              ? runner.runnerKey
              : runner.contractKey;

        return {
          actionKey: `${input.planId}:action:${index + 1}`,
          tenantSlug: input.tenantSlug,
          workspaceSlug: input.workspaceSlug ?? null,
          actionType,
          actionStatus,
          actionTargetKey,
          runnerKey: runner.runnerKey,
          contractKey: runner.contractKey,
          runtimeBindingKey: runner.runtimeBindingKey,
          readinessStatus: runner.readinessStatus,
          linkedApprovalDispatchKeys: runner.linkedApprovalDispatchKeys,
          linkedRollbackRecordKeys: runner.linkedRollbackRecordKeys,
        };
      },
    );

    const executionActionBatch = {
      batchKey: `${input.planId}:execution-action`,
      status: executionActionRecords.some(
        (record) => record.actionStatus === 'blocked',
      )
        ? 'blocked'
        : 'pending',
      records: executionActionRecords.map((record) => ({
        actionKey: record.actionKey,
        actionType: record.actionType,
        actionStatus: record.actionStatus,
        actionTargetKey: record.actionTargetKey,
        workspaceSlug: record.workspaceSlug,
        runnerKey: record.runnerKey,
      })),
    };

    const executionRunRecords = storedExecutionRunnerRecords.map((runner) => {
      const nextAction = executionActionRecords.find(
        (action) => action.runnerKey === runner.runnerKey,
      );
      const runStatus =
        runner.readinessStatus === 'blocked-missing-runtime-binding'
          ? 'blocked'
          : runner.readinessStatus === 'awaiting-required-approval'
            ? 'awaiting-approval'
            : 'queued-for-dispatch';

      return {
        runKey: `${runner.runnerKey}:run`,
        tenantSlug: input.tenantSlug,
        workspaceSlug: input.workspaceSlug ?? null,
        runnerKey: runner.runnerKey,
        contractKey: runner.contractKey,
        runtimeBindingKey: runner.runtimeBindingKey,
        workflowKey: runner.workflowKey,
        runtimeKey: runner.runtimeKey,
        systemKey: runner.systemKey,
        triggerMode: runner.triggerMode,
        runStatus,
        readinessStatus: runner.readinessStatus,
        nextActionKey: nextAction?.actionKey ?? null,
        approvalTaskKeys: runner.linkedApprovalDispatchKeys.map(
          (dispatchKey) => `${dispatchKey}:task`,
        ),
        rollbackRecordKeys: runner.linkedRollbackRecordKeys,
      };
    });

    const approvalTaskRecords = storedApprovalDispatches.map((dispatch) => {
      const taskKey = `${dispatch.dispatchKey}:task`;

      return {
        taskKey,
        tenantSlug: input.tenantSlug,
        workspaceSlug: input.workspaceSlug ?? null,
        dispatchKey: dispatch.dispatchKey,
        checkpointKey: dispatch.checkpointKey,
        approverRole: dispatch.approverRole,
        channel: dispatch.channel,
        required: dispatch.required,
        taskStatus: dispatch.required ? 'pending-approval' : 'optional-pending',
        linkedChildContractKeys: dispatch.linkedChildContractKeys,
        linkedRunKeys: executionRunRecords
          .filter((run) => run.approvalTaskKeys.includes(taskKey))
          .map((run) => run.runKey),
      };
    });

    const executionRunBatch = {
      batchKey: `${input.planId}:execution-run`,
      status: executionRunRecords.some((record) => record.runStatus === 'blocked')
        ? 'blocked'
        : 'pending',
      records: executionRunRecords.map((record) => ({
        runKey: record.runKey,
        runnerKey: record.runnerKey,
        runStatus: record.runStatus,
        readinessStatus: record.readinessStatus,
        nextActionKey: record.nextActionKey,
        workspaceSlug: record.workspaceSlug,
      })),
    };

    const approvalTaskBatch = {
      batchKey: `${input.planId}:approval-task`,
      status: approvalTaskRecords.length > 0 ? 'pending' : 'empty',
      records: approvalTaskRecords.map((record) => ({
        taskKey: record.taskKey,
        dispatchKey: record.dispatchKey,
        checkpointKey: record.checkpointKey,
        approverRole: record.approverRole,
        taskStatus: record.taskStatus,
        workspaceSlug: record.workspaceSlug,
        linkedRunKeys: record.linkedRunKeys,
      })),
    };

    const executionTransitionQueue: OrchestrationExecutionTransitionQueueRecord[] = executionActionRecords.map((action) => ({
      transitionKey: `${action.actionKey}:transition`,
      sourceActionKey: action.actionKey,
      sourceRunnerKey: action.runnerKey,
      sourceContractKey: action.contractKey,
      transitionType:
        action.actionType === 'dispatch-required-approval'
          ? 'await-approval-decision'
          : action.actionType === 'dispatch-child-workflow'
            ? 'dispatch-runner'
            : 'resolve-runner-binding',
      transitionStatus:
        action.actionStatus === 'blocked' ? 'blocked' : 'pending',
      targetKey: action.actionTargetKey,
      readinessStatus: action.readinessStatus,
    }));

    const executionRunStateHints: OrchestrationExecutionRunStateHintRecord[] = executionRunRecords.map((run) => ({
      runKey: run.runKey,
      runStatus: run.runStatus,
      nextTransitionKey:
        executionTransitionQueue.find(
          (transition) => transition.sourceRunnerKey === run.runnerKey,
        )?.transitionKey ?? null,
      completionGate:
        run.runStatus === 'awaiting-approval'
          ? 'approval-decision'
          : run.runStatus === 'queued-for-dispatch'
            ? 'runner-dispatch'
            : 'runtime-binding-resolution',
    }));

    const approvalTaskStateHints: OrchestrationApprovalTaskStateHintRecord[] = approvalTaskRecords.map((task) => ({
      taskKey: task.taskKey,
      taskStatus: task.taskStatus,
      nextTransitionType: task.required ? 'record-approval-decision' : 'optional-review',
      linkedRunKeys: task.linkedRunKeys,
    }));

    const approvalDecisionOptions: OrchestrationApprovalDecisionOptionRecord[] = approvalTaskRecords.map((task) => ({
      taskKey: task.taskKey,
      dispatchKey: task.dispatchKey,
      decisionOptions: task.required
        ? ['approve', 'reject', 'request-changes']
        : ['approve', 'skip', 'request-review'],
      defaultDecision: task.required ? 'approve' : 'skip',
      affectedRunKeys: task.linkedRunKeys,
    }));

    const executionRunDispatchQueue: OrchestrationExecutionRunDispatchQueueRecord[] =
      executionRunRecords.map((run) => ({
        runKey: run.runKey,
        runnerKey: run.runnerKey,
        dispatchReadiness:
          run.runStatus === 'queued-for-dispatch'
            ? 'dispatchable'
            : run.runStatus === 'awaiting-approval'
              ? 'blocked-by-approval'
              : 'blocked-by-binding',
        nextTransitionKey:
          executionRunStateHints.find((hint) => hint.runKey === run.runKey)
            ?.nextTransitionKey ?? null,
        workflowKey: run.workflowKey,
        runtimeKey: run.runtimeKey,
        systemKey: run.systemKey,
      }));

    const executionStateTransitionBatch: OrchestrationExecutionStateTransitionBatch = {
      batchKey: `${input.planId}:execution-transition`,
      status: executionTransitionQueue.some(
        (transition) => transition.transitionStatus === 'blocked',
      )
        ? 'blocked'
        : 'pending',
      records: executionTransitionQueue.map((transition) => ({
        transitionKey: transition.transitionKey,
        transitionType: transition.transitionType,
        transitionStatus: transition.transitionStatus,
        targetKey: transition.targetKey,
        workspaceSlug: input.workspaceSlug ?? null,
      })),
    };

    const projectedApprovalDecisionRecords: OrchestrationProjectedApprovalDecisionRecord[] =
      approvalDecisionOptions.map((option, index) => ({
        decisionRecordKey: `${input.planId}:approval-decision:${index + 1}`,
        taskKey: option.taskKey,
        dispatchKey: option.dispatchKey,
        defaultDecision: option.defaultDecision,
        allowedDecisions: option.decisionOptions,
        projectedOutcomeStatus: 'awaiting-decision',
        affectedRunKeys: option.affectedRunKeys,
      }));

    const projectedRunDispatchRecords: OrchestrationProjectedRunDispatchRecord[] =
      executionRunDispatchQueue.map((run, index) => ({
        dispatchRecordKey: `${input.planId}:run-dispatch:${index + 1}`,
        runKey: run.runKey,
        runnerKey: run.runnerKey,
        dispatchReadiness: run.dispatchReadiness,
        projectedDispatchStatus:
          run.dispatchReadiness === 'dispatchable'
            ? 'ready-to-dispatch'
            : 'awaiting-prerequisite',
        nextTransitionKey: run.nextTransitionKey,
        workflowKey: run.workflowKey,
        runtimeKey: run.runtimeKey,
        systemKey: run.systemKey,
      }));

    const projectedMutationBatch: OrchestrationProjectedMutationBatch = {
      batchKey: `${input.planId}:projected-mutation`,
      status: projectedRunDispatchRecords.some(
        (record) => record.projectedDispatchStatus === 'ready-to-dispatch',
      )
        ? 'partially-ready'
        : 'pending',
      approvalDecisionRecords: projectedApprovalDecisionRecords.map(
        (record): OrchestrationProjectedApprovalDecisionBatchRecord => ({
          decisionRecordKey: record.decisionRecordKey,
          projectedOutcomeStatus: record.projectedOutcomeStatus,
          taskKey: record.taskKey,
        }),
      ),
      runDispatchRecords: projectedRunDispatchRecords.map(
        (record): OrchestrationProjectedRunDispatchBatchRecord => ({
          dispatchRecordKey: record.dispatchRecordKey,
          projectedDispatchStatus: record.projectedDispatchStatus,
          runKey: record.runKey,
        }),
      ),
    };

    const projectedApprovalOutcomeRecords: OrchestrationProjectedApprovalOutcomeRecord[] =
      projectedApprovalDecisionRecords.map((record) => ({
        outcomeRecordKey: `${record.decisionRecordKey}:outcome`,
        decisionRecordKey: record.decisionRecordKey,
        taskKey: record.taskKey,
        projectedResolution:
          record.defaultDecision === 'approve'
            ? 'approval-clears-run-gate'
            : 'approval-keeps-run-blocked',
        affectedRunKeys: record.affectedRunKeys,
        outcomeStatus: 'projected',
      }));

    const projectedDispatchOutcomeRecords: OrchestrationProjectedDispatchOutcomeRecord[] =
      projectedRunDispatchRecords.map((record) => ({
        outcomeRecordKey: `${record.dispatchRecordKey}:outcome`,
        dispatchRecordKey: record.dispatchRecordKey,
        runKey: record.runKey,
        runnerKey: record.runnerKey,
        projectedResolution:
          record.projectedDispatchStatus === 'ready-to-dispatch'
            ? 'runner-may-enter-dispatched-state'
            : 'runner-remains-pending-prerequisite',
        outcomeStatus: 'projected',
      }));

    const projectedOutcomeBatch: OrchestrationProjectedOutcomeBatch = {
      batchKey: `${input.planId}:projected-outcome`,
      status: 'projected',
      approvalOutcomes: projectedApprovalOutcomeRecords.map(
        (record): OrchestrationProjectedApprovalOutcomeBatchRecord => ({
          outcomeRecordKey: record.outcomeRecordKey,
          projectedResolution: record.projectedResolution,
          taskKey: record.taskKey,
        }),
      ),
      dispatchOutcomes: projectedDispatchOutcomeRecords.map(
        (record): OrchestrationProjectedDispatchOutcomeBatchRecord => ({
          outcomeRecordKey: record.outcomeRecordKey,
          projectedResolution: record.projectedResolution,
          runKey: record.runKey,
        }),
      ),
    };

    const actionTransitionPolicies: OrchestrationActionTransitionPolicy[] =
      executionActionRecords.map((action) => ({
      actionKey: action.actionKey,
      actionType: action.actionType,
      currentStatus: action.actionStatus,
      allowedNextStatuses:
        action.actionStatus === 'blocked'
          ? ['pending-runtime-resolution']
          : action.actionType === 'dispatch-required-approval'
            ? ['awaiting-approval-decision', 'cancelled']
            : action.actionType === 'dispatch-child-workflow'
              ? ['dispatched', 'dispatch-failed']
              : ['runtime-binding-resolved', 'cancelled'],
    }));

    const runTransitionPolicies: OrchestrationRunTransitionPolicy[] =
      executionRunRecords.map((run) => ({
      runKey: run.runKey,
      currentStatus: run.runStatus,
      allowedNextStatuses:
        run.runStatus === 'blocked'
          ? ['queued-for-dispatch']
          : run.runStatus === 'awaiting-approval'
            ? ['queued-for-dispatch', 'cancelled']
            : ['dispatched', 'dispatch-failed', 'cancelled'],
    }));

    const approvalTaskTransitionPolicies: OrchestrationApprovalTaskTransitionPolicy[] =
      approvalTaskRecords.map((task) => ({
      taskKey: task.taskKey,
      currentStatus: task.taskStatus,
      allowedNextStatuses: task.required
        ? ['approved', 'rejected', 'changes-requested']
        : ['approved', 'skipped', 'review-requested'],
    }));

    const transitionPolicyBatch: OrchestrationTransitionPolicyBatch = {
      batchKey: `${input.planId}:transition-policy`,
      status: 'draft',
      actionPolicies: actionTransitionPolicies,
      runPolicies: runTransitionPolicies,
      approvalTaskPolicies: approvalTaskTransitionPolicies,
    };

    const projectedMutationContract: OrchestrationProjectedMutationContract = {
      contractKey: `${input.planId}:projected-mutation-contract`,
      status: 'draft',
      approvalDecisionCount: projectedApprovalDecisionRecords.length,
      runDispatchCount: projectedRunDispatchRecords.length,
      approvalOutcomeCount: projectedApprovalOutcomeRecords.length,
      dispatchOutcomeCount: projectedDispatchOutcomeRecords.length,
      actionPolicyCount: actionTransitionPolicies.length,
      runPolicyCount: runTransitionPolicies.length,
      approvalTaskPolicyCount: approvalTaskTransitionPolicies.length,
      readyProjectedDispatchCount: projectedRunDispatchRecords.filter(
        (record) => record.projectedDispatchStatus === 'ready-to-dispatch',
      ).length,
      approvalDecisionKeys: projectedApprovalDecisionRecords.map(
        (record) => record.decisionRecordKey,
      ),
      runDispatchKeys: projectedRunDispatchRecords.map(
        (record) => record.dispatchRecordKey,
      ),
      outcomeKeys: [
        ...projectedApprovalOutcomeRecords.map((record) => record.outcomeRecordKey),
        ...projectedDispatchOutcomeRecords.map((record) => record.outcomeRecordKey),
      ],
    };

    return {
      ...draft,
      executionContractStatus: 'submitted',
      submittedBy: input.submittedBy?.trim() || 'system',
      submissionNotes: input.submissionNotes?.trim() || '',
      storedRuntimeBindings,
      childWorkflowContractRecords,
      storedChildWorkflowContracts: storedChildWorkflowContracts.map((contract) => ({
        ...contract,
        linkedApprovalDispatchKeys:
          childWorkflowContractLinkage.find(
            (linkage) => linkage.contractKey === contract.contractKey,
          )?.linkedApprovalDispatchKeys ?? [],
        linkedRunnerKey:
          childWorkflowContractLinkage.find(
            (linkage) => linkage.contractKey === contract.contractKey,
          )?.linkedRunnerKey ?? null,
        linkedRollbackRecordKeys:
          childWorkflowContractLinkage.find(
            (linkage) => linkage.contractKey === contract.contractKey,
          )?.linkedRollbackRecordKeys ?? [],
      })),
      storedApprovalDispatches,
      storedEscalationContracts,
      storedRollbackContracts,
      storedExecutionRunnerRecords,
      executionActionRecords,
      executionRunRecords,
      approvalTaskRecords,
      runtimeBindingBatch,
      contractPersistenceBatch,
      approvalDispatchBatch,
      escalationBatch,
      rollbackBatch,
      executionRunnerBatch: {
        ...executionRunnerBatch,
        records: executionRunnerBatch.records.map((runner) => ({
          ...runner,
          readinessStatus:
            storedExecutionRunnerRecords.find(
              (record) => record.runnerKey === runner.runnerKey,
            )?.readinessStatus ?? 'pending',
        })),
      },
      executionActionBatch,
      executionRunBatch,
      approvalTaskBatch,
      executionTransitionQueue,
      executionRunStateHints,
      approvalTaskStateHints,
      approvalDecisionOptions,
      executionRunDispatchQueue,
      executionStateTransitionBatch,
      projectedApprovalDecisionRecords,
      projectedRunDispatchRecords,
      projectedMutationBatch,
      projectedApprovalOutcomeRecords,
      projectedDispatchOutcomeRecords,
      projectedOutcomeBatch,
      actionTransitionPolicies,
      runTransitionPolicies,
      approvalTaskTransitionPolicies,
      transitionPolicyBatch,
      projectedMutationContract,
      executionReadinessSummary: <OrchestrationExecutionReadinessSummary>{
        blockedRunnerCount: storedExecutionRunnerRecords.filter(
          (runner) => runner.readinessStatus === 'blocked-missing-runtime-binding',
        ).length,
        awaitingApprovalRunnerCount: storedExecutionRunnerRecords.filter(
          (runner) => runner.readinessStatus === 'awaiting-required-approval',
        ).length,
        readyRunnerCount: storedExecutionRunnerRecords.filter(
          (runner) => runner.readinessStatus === 'ready-for-dispatch',
        ).length,
        unresolvedChildWorkflowContracts: childWorkflowContractRecords
          .filter((contract) => !contract.runtimeBindingKey)
          .map((contract) => ({
            contractKey: contract.contractKey,
            workflowKey: contract.workflowKey,
            runtimeKey: contract.runtimeKey,
            systemKey: contract.systemKey,
          })),
        pendingActionCount: executionActionRecords.filter(
          (record) => record.actionStatus === 'pending',
        ).length,
        blockedActionCount: executionActionRecords.filter(
          (record) => record.actionStatus === 'blocked',
        ).length,
        queuedRunCount: executionRunRecords.filter(
          (record) => record.runStatus === 'queued-for-dispatch',
        ).length,
        awaitingApprovalRunCount: executionRunRecords.filter(
          (record) => record.runStatus === 'awaiting-approval',
        ).length,
        blockedRunCount: executionRunRecords.filter(
          (record) => record.runStatus === 'blocked',
        ).length,
        pendingApprovalTaskCount: approvalTaskRecords.filter(
          (record) => record.taskStatus === 'pending-approval',
        ).length,
        pendingTransitionCount: executionTransitionQueue.filter(
          (transition) => transition.transitionStatus === 'pending',
        ).length,
        blockedTransitionCount: executionTransitionQueue.filter(
          (transition) => transition.transitionStatus === 'blocked',
        ).length,
        dispatchableRunCount: executionRunDispatchQueue.filter(
          (run) => run.dispatchReadiness === 'dispatchable',
        ).length,
        readyProjectedDispatchCount: projectedRunDispatchRecords.filter(
          (record) => record.projectedDispatchStatus === 'ready-to-dispatch',
        ).length,
        projectedOutcomeCount:
          projectedApprovalOutcomeRecords.length +
          projectedDispatchOutcomeRecords.length,
        transitionPolicyCount:
          actionTransitionPolicies.length +
          runTransitionPolicies.length +
          approvalTaskTransitionPolicies.length,
        projectedMutationContractCount: 1,
      },
      runtimeBindingTopology: storedRuntimeBindings.map((binding) => ({
        bindingKey: binding.bindingKey,
        runtimeKey: binding.runtimeKey,
        systemKey: binding.systemKey,
        deliveryMode: binding.deliveryMode,
        approvalRequired: binding.approvalRequired,
        linkedChildWorkflowContracts: childWorkflowContractRecords
          .filter((contract) => contract.runtimeBindingKey === binding.bindingKey)
          .map((contract) => ({
            contractKey: contract.contractKey,
            workflowKey: contract.workflowKey,
            triggerMode: contract.triggerMode,
            approvalRequired: contract.approvalRequired,
            approvalCheckpointKey: contract.approvalCheckpointKey,
          })),
        linkedRunnerKeys: storedExecutionRunnerRecords
          .filter((runner) => runner.runtimeBindingKey === binding.bindingKey)
          .map((runner) => runner.runnerKey),
      })),
      approvalDispatchQueue: storedApprovalDispatches.map((dispatch) => ({
        dispatchKey: dispatch.dispatchKey,
        dispatchStatus: dispatch.dispatchStatus,
        checkpointKey: dispatch.checkpointKey,
        approverRole: dispatch.approverRole,
        channel: dispatch.channel,
        escalationMode: dispatch.escalationMode,
        required: dispatch.required,
        linkedChildContractKeys: dispatch.linkedChildContractKeys,
        linkedEscalationRecordKeys: storedEscalationContracts
          .filter((contract) => contract.checkpointKey === dispatch.checkpointKey)
          .map((contract) => contract.escalationRecordKey),
      })),
      escalationTopology: storedEscalationContracts.map((contract) => ({
        escalationRecordKey: contract.escalationRecordKey,
        escalationKey: contract.escalationKey,
        checkpointKey: contract.checkpointKey,
        targetRole: contract.targetRole,
        triggerMode: contract.triggerMode,
        delayMinutes: contract.delayMinutes,
        linkedDispatchKeys: contract.linkedDispatchKeys,
      })),
      rollbackTopology: storedRollbackContracts.map((contract) => ({
        rollbackRecordKey: contract.rollbackRecordKey,
        rollbackKey: contract.rollbackKey,
        checkpointKey: contract.checkpointKey,
        targetSystemKey: contract.targetSystemKey,
        strategy: contract.strategy,
        preserveArtifacts: contract.preserveArtifacts,
        linkedContractKeys: contract.linkedContractKeys,
      })),
      approvalRoutingTopology: childWorkflowContractRecords.map((contract) => {
        const requiredApprovalDispatches = storedApprovalDispatches.filter(
          (dispatch) =>
            dispatch.required &&
            dispatch.checkpointKey === contract.approvalCheckpointKey,
        );
        const linkedEscalationRecordKeys = storedEscalationContracts
          .filter((escalation) =>
            requiredApprovalDispatches.some(
              (dispatch) => dispatch.checkpointKey === escalation.checkpointKey,
            ),
          )
          .map((escalation) => escalation.escalationRecordKey);

        return {
          contractKey: contract.contractKey,
          workflowKey: contract.workflowKey,
          approvalRequired: contract.approvalRequired,
          approvalCheckpointKey: contract.approvalCheckpointKey,
          requiredApprovalDispatchKeys: contract.approvalRequired
            ? requiredApprovalDispatches.map((dispatch) => dispatch.dispatchKey)
            : [],
          linkedEscalationRecordKeys: contract.approvalRequired
            ? linkedEscalationRecordKeys
            : [],
        };
      }),
      executionRunnerTopology: storedExecutionRunnerRecords.map(
        (runner): OrchestrationExecutionRunnerTopologyRecord => ({
          runnerKey: runner.runnerKey,
          contractKey: runner.contractKey,
          runtimeBindingKey: runner.runtimeBindingKey,
          workflowKey: runner.workflowKey,
          runtimeKey: runner.runtimeKey,
          systemKey: runner.systemKey,
          triggerMode: runner.triggerMode,
          runnerStatus: runner.runnerStatus,
          readinessStatus: runner.readinessStatus,
          nextActionKey:
            executionActionRecords.find(
              (action) => action.runnerKey === runner.runnerKey,
            )?.actionKey ?? null,
          linkedApprovalDispatchKeys: runner.linkedApprovalDispatchKeys,
          linkedRollbackRecordKeys: runner.linkedRollbackRecordKeys,
        }),
      ),
      executionActionTopology: executionActionRecords.map(
        (action): OrchestrationExecutionActionTopologyRecord => ({
          actionKey: action.actionKey,
          actionType: action.actionType,
          actionStatus: action.actionStatus,
          actionTargetKey: action.actionTargetKey,
          runnerKey: action.runnerKey,
          contractKey: action.contractKey,
          runtimeBindingKey: action.runtimeBindingKey,
          readinessStatus: action.readinessStatus,
          linkedApprovalDispatchKeys: action.linkedApprovalDispatchKeys,
          linkedRollbackRecordKeys: action.linkedRollbackRecordKeys,
        }),
      ),
      executionRunTopology: executionRunRecords.map(
        (run): OrchestrationExecutionRunTopologyRecord => ({
          runKey: run.runKey,
          runnerKey: run.runnerKey,
          contractKey: run.contractKey,
          runtimeBindingKey: run.runtimeBindingKey,
          workflowKey: run.workflowKey,
          runtimeKey: run.runtimeKey,
          systemKey: run.systemKey,
          triggerMode: run.triggerMode,
          runStatus: run.runStatus,
          readinessStatus: run.readinessStatus,
          nextActionKey: run.nextActionKey,
          approvalTaskKeys: run.approvalTaskKeys,
          rollbackRecordKeys: run.rollbackRecordKeys,
        }),
      ),
      approvalTaskQueue: approvalTaskRecords.map(
        (task): OrchestrationApprovalTaskQueueRecord => ({
          taskKey: task.taskKey,
          dispatchKey: task.dispatchKey,
          checkpointKey: task.checkpointKey,
          approverRole: task.approverRole,
          channel: task.channel,
          required: task.required,
          taskStatus: task.taskStatus,
          linkedChildContractKeys: task.linkedChildContractKeys,
          linkedRunKeys: task.linkedRunKeys,
        }),
      ),
      executionRunnerHints: storedExecutionRunnerRecords.map(
        (runner): OrchestrationExecutionRunnerHintRecord => ({
          contractKey: runner.contractKey,
          runnerStatus: runner.runnerStatus,
          readinessStatus: runner.readinessStatus,
          nextActionKey:
            executionActionRecords.find(
              (action) => action.runnerKey === runner.runnerKey,
            )?.actionKey ?? null,
          workflowKey: runner.workflowKey,
          runtimeKey: runner.runtimeKey,
          systemKey: runner.systemKey,
          triggerMode: runner.triggerMode,
          runtimeBindingKey: runner.runtimeBindingKey,
          linkedApprovalDispatchKeys: runner.linkedApprovalDispatchKeys,
          linkedRollbackRecordKeys: runner.linkedRollbackRecordKeys,
        }),
      ),
      contractSummary: {
        executionModeCount: draft.executionModes.length,
        runtimeBindingCount: draft.runtimeBindings.length,
        childWorkflowContractCount: draft.childWorkflowContracts.length,
        approvalContractCount: draft.approvalContracts.length,
        escalationContractCount: draft.escalationContracts.length,
        rollbackContractCount: draft.rollbackContracts.length,
        unresolvedRuntimeBindingCount: childWorkflowContractRecords.filter(
          (contract) => !contract.runtimeBindingKey,
        ).length,
      },
    };
  }

  async materializeExecutionRuntime(
    input: OrchestrationRuntimeContextInput,
    options?: { persistSnapshot?: boolean },
  ): Promise<ReturnType<OrchestrationService['submitExecutionContract']> & OrchestrationMaterializedRuntimeResponse> {
    const submission = this.submitExecutionContract(input);

    const approvalDispatchIntegrations: OrchestrationApprovalDispatchIntegrationRecord[] = submission.approvalTaskQueue.map((task) => {
      const decisionOption = submission.approvalDecisionOptions.find(
        (option) => option.taskKey === task.taskKey,
      );

      return {
        integrationKey: `${task.taskKey}:integration`,
        dispatchKey: task.dispatchKey,
        taskKey: task.taskKey,
        channel: task.channel,
        approverRole: task.approverRole,
        integrationStatus: task.required
          ? 'dispatched-for-approval'
          : 'optional-review-routed',
        appliedDispatchStatus: task.required ? 'dispatched' : 'optional-review',
        appliedTaskStatus: task.required ? 'awaiting-decision' : 'review-requested',
        defaultDecision: decisionOption?.defaultDecision ?? null,
        allowedDecisions: decisionOption?.decisionOptions ?? [],
        affectedRunKeys: task.linkedRunKeys,
      };
    });

    const executionRunnerIntegrations: OrchestrationExecutionRunnerIntegrationRecord[] = submission.executionRunDispatchQueue.map((run) => {
      const runner = submission.executionRunnerTopology.find(
        (record) => record.runnerKey === run.runnerKey,
      );
      const action = submission.executionActionTopology.find(
        (record) => record.runnerKey === run.runnerKey,
      );
      const transition = submission.executionTransitionQueue.find(
        (record) => record.sourceRunnerKey === run.runnerKey,
      );
      const projectedDispatch = submission.projectedRunDispatchRecords.find(
        (record) => record.runKey === run.runKey,
      );
      const isDispatchable = run.dispatchReadiness === 'dispatchable';
      const blockedByApproval = run.dispatchReadiness === 'blocked-by-approval';

      return {
        integrationKey: `${run.runKey}:integration`,
        runKey: run.runKey,
        runnerKey: run.runnerKey,
        actionKey: action?.actionKey ?? null,
        transitionKey: transition?.transitionKey ?? null,
        projectedDispatchRecordKey:
          projectedDispatch?.dispatchRecordKey ?? null,
        integrationStatus: isDispatchable
          ? 'runner-dispatched'
          : blockedByApproval
            ? 'awaiting-approval-clearance'
            : 'awaiting-runtime-binding',
        appliedRunnerStatus: isDispatchable
          ? 'dispatched'
          : runner?.runnerStatus ?? 'pending',
        appliedRunStatus: isDispatchable
          ? 'dispatched'
          : blockedByApproval
            ? 'awaiting-approval'
            : 'blocked',
        appliedActionStatus: isDispatchable
          ? 'dispatched'
          : blockedByApproval
            ? 'awaiting-approval-decision'
            : 'pending-runtime-resolution',
        appliedTransitionStatus: isDispatchable
          ? 'applied'
          : blockedByApproval
            ? 'awaiting-approval-decision'
            : 'blocked',
        runtimeKey: run.runtimeKey,
        systemKey: run.systemKey,
        workflowKey: run.workflowKey,
      };
    });

    const approvalDispatchMutationRecords = approvalDispatchIntegrations.flatMap(
      (integration) => [
        {
          mutationKey: `${integration.dispatchKey}:live-dispatch`,
          targetKey: integration.dispatchKey,
          targetType: 'approval-dispatch',
          fromStatus: 'pending',
          toStatus: integration.appliedDispatchStatus,
          mutationStatus: 'applied',
        },
        {
          mutationKey: `${integration.taskKey}:live-task`,
          targetKey: integration.taskKey,
          targetType: 'approval-task',
          fromStatus: 'pending-approval',
          toStatus: integration.appliedTaskStatus,
          mutationStatus: 'applied',
        },
      ],
    );

    const executionRunnerMutationRecords = executionRunnerIntegrations.flatMap(
      (integration) => {
        if (integration.integrationStatus === 'awaiting-runtime-binding') {
          return [
            {
              mutationKey: `${integration.runKey}:live-transition`,
              targetKey: integration.transitionKey,
              targetType: 'execution-transition',
              fromStatus: 'blocked',
              toStatus: integration.appliedTransitionStatus,
              mutationStatus: 'blocked',
            },
          ];
        }

        const mutations = [
          {
            mutationKey: `${integration.runKey}:live-run`,
            targetKey: integration.runKey,
            targetType: 'execution-run',
            fromStatus:
              integration.integrationStatus === 'runner-dispatched'
                ? 'queued-for-dispatch'
                : 'awaiting-approval',
            toStatus: integration.appliedRunStatus,
            mutationStatus:
              integration.integrationStatus === 'runner-dispatched'
                ? 'applied'
                : 'pending-approval',
          },
          {
            mutationKey: `${integration.runnerKey}:live-runner`,
            targetKey: integration.runnerKey,
            targetType: 'execution-runner',
            fromStatus: 'pending',
            toStatus: integration.appliedRunnerStatus,
            mutationStatus:
              integration.integrationStatus === 'runner-dispatched'
                ? 'applied'
                : 'pending-approval',
          },
          {
            mutationKey: `${integration.actionKey ?? integration.runKey}:live-action`,
            targetKey: integration.actionKey,
            targetType: 'execution-action',
            fromStatus:
              integration.integrationStatus === 'runner-dispatched'
                ? 'pending'
                : 'pending',
            toStatus: integration.appliedActionStatus,
            mutationStatus:
              integration.integrationStatus === 'runner-dispatched'
                ? 'applied'
                : 'pending-approval',
          },
          {
            mutationKey: `${integration.transitionKey ?? integration.runKey}:live-transition`,
            targetKey: integration.transitionKey,
            targetType: 'execution-transition',
            fromStatus: 'pending',
            toStatus: integration.appliedTransitionStatus,
            mutationStatus:
              integration.integrationStatus === 'runner-dispatched'
                ? 'applied'
                : 'pending-approval',
          },
        ];

        return mutations;
      },
    );

    const liveMutationBatch: OrchestrationLiveMutationBatch = {
      batchKey: `${input.planId}:live-mutation`,
      status: executionRunnerIntegrations.some(
        (integration) => integration.integrationStatus === 'runner-dispatched',
      )
        ? 'partially-applied'
        : executionRunnerIntegrations.some(
              (integration) =>
                integration.integrationStatus === 'awaiting-runtime-binding',
            )
          ? 'blocked'
          : 'pending-approval',
      approvalDispatchRecords: approvalDispatchMutationRecords,
      executionRunnerRecords: executionRunnerMutationRecords,
    };

    const liveRuntimeSummary: OrchestrationLiveRuntimeSummary = {
      dispatchedApprovalCount: approvalDispatchIntegrations.filter(
        (integration) => integration.integrationStatus === 'dispatched-for-approval',
      ).length,
      optionalReviewCount: approvalDispatchIntegrations.filter(
        (integration) => integration.integrationStatus === 'optional-review-routed',
      ).length,
      dispatchedRunnerCount: executionRunnerIntegrations.filter(
        (integration) => integration.integrationStatus === 'runner-dispatched',
      ).length,
      awaitingApprovalClearanceCount: executionRunnerIntegrations.filter(
        (integration) =>
          integration.integrationStatus === 'awaiting-approval-clearance',
      ).length,
      awaitingRuntimeBindingCount: executionRunnerIntegrations.filter(
        (integration) => integration.integrationStatus === 'awaiting-runtime-binding',
      ).length,
      appliedMutationCount: [
        ...approvalDispatchMutationRecords,
        ...executionRunnerMutationRecords,
      ].filter((record) => record.mutationStatus === 'applied').length,
      pendingApprovalMutationCount: executionRunnerMutationRecords.filter(
        (record) => record.mutationStatus === 'pending-approval',
      ).length,
      blockedMutationCount: executionRunnerMutationRecords.filter(
        (record) => record.mutationStatus === 'blocked',
      ).length,
    };

    const recordedAt = this.buildRuntimeRecordedAt();
    const actorKey = this.buildRuntimeActorKey({ submittedBy: input.submittedBy });
    const scope = this.buildRuntimeScope(input);
    const mutationRecords = [
      ...approvalDispatchMutationRecords,
      ...executionRunnerMutationRecords,
    ];
    const eventRecords: OrchestrationRuntimeEventRecord[] = [
      {
        eventKey: `${input.planId}:materialized`,
        eventType: 'execution-runtime-materialized',
        planId: input.planId,
        runtimeStatus: 'materialized',
        actorKey,
        recordedAt,
        scope,
        relatedKeys: {},
        metadata: {
          approvalDispatchCount: approvalDispatchIntegrations.length,
          runnerIntegrationCount: executionRunnerIntegrations.length,
          liveMutationBatchKey: liveMutationBatch.batchKey,
        },
      },
    ];
    const runtimeSnapshot = this.buildRuntimeSnapshotRecord({
      planId: input.planId,
      snapshotType: 'materialized-runtime',
      runtimeStatus: 'materialized',
      actorKey,
      recordedAt,
      tenantSlug: scope.tenantSlug,
      workspaceSlug: scope.workspaceSlug,
      contractSummary: submission.contractSummary,
      summary: liveRuntimeSummary,
      mutationRecords,
      eventRecords,
    });

    const persistence =
      options?.persistSnapshot === false
        ? null
        : await this.persistRuntimeSnapshot(runtimeSnapshot);

    return {
      ...submission,
      executionRuntimeStatus: 'materialized',
      approvalDispatchIntegrations,
      executionRunnerIntegrations,
      liveMutationBatch,
      liveRuntimeSummary,
      runtimeSnapshot,
      runtimeEventRecords: eventRecords,
      runtimePersistence: persistence,
    };
  }

  async applyApprovalDecision(input: OrchestrationApprovalDecisionInput) {
    const runtime = await this.materializeExecutionRuntime(input, {
      persistSnapshot: false,
    });
    const task = runtime.approvalTaskQueue.find(
      (record) => record.taskKey === input.taskKey,
    );

    if (!task) {
      throw new BadRequestException(
        `Approval task ${input.taskKey} does not exist in execution runtime ${input.planId}.`,
      );
    }

    const persistedTaskStatus = await this.findLatestPersistedMutationStatus({
      planId: input.planId,
      tenantSlug: input.tenantSlug,
      workspaceSlug: input.workspaceSlug,
      targetType: 'approval-task',
      targetKey: task.taskKey,
    });
    const persistedDispatchStatus = await this.findLatestPersistedMutationStatus({
      planId: input.planId,
      tenantSlug: input.tenantSlug,
      workspaceSlug: input.workspaceSlug,
      targetType: 'approval-dispatch',
      targetKey: task.dispatchKey,
    });
    const effectiveTaskStatus =
      persistedTaskStatus ??
      (task.taskStatus === 'pending-approval'
        ? 'awaiting-decision'
        : task.taskStatus);

    if (effectiveTaskStatus !== 'awaiting-decision') {
      throw new BadRequestException(
        `Approval task ${input.taskKey} is not awaiting a decision; current status is ${effectiveTaskStatus}.`,
      );
    }

    const taskDecisionStatus =
      input.decision === 'approve'
        ? 'approved'
        : input.decision === 'reject'
          ? 'rejected'
          : 'changes-requested';
    const linkedRunStatus =
      input.decision === 'approve'
        ? 'queued-for-dispatch'
        : 'cancelled';
    const linkedActionStatus =
      input.decision === 'approve'
        ? 'pending'
        : 'cancelled';
    const linkedTransitionStatus =
      input.decision === 'approve'
        ? 'pending'
        : 'cancelled';
    const linkedRunnerStatus =
      input.decision === 'approve'
        ? 'pending'
        : 'cancelled';

    const runIntegrations = task.linkedRunKeys.map((runKey) => ({
      runKey,
      runIntegration: runtime.executionRunnerIntegrations.find(
        (record) => record.runKey === runKey,
      ),
    }));
    const affectedRunMutationStatuses = await this.findLatestPersistedMutationStatuses({
      planId: input.planId,
      tenantSlug: input.tenantSlug,
      workspaceSlug: input.workspaceSlug,
      targets: runIntegrations.flatMap(({ runKey, runIntegration }) => [
        {
          targetType: 'execution-run',
          targetKey: runKey,
        },
        {
          targetType: 'execution-action',
          targetKey: runIntegration?.actionKey,
        },
        {
          targetType: 'execution-transition',
          targetKey: runIntegration?.transitionKey,
        },
        {
          targetType: 'execution-runner',
          targetKey: runIntegration?.runnerKey,
        },
      ]),
    });
    const affectedRunUpdates = runIntegrations.map(({ runKey, runIntegration }) => ({
      runKey,
      runnerKey: runIntegration?.runnerKey ?? null,
      actionKey: runIntegration?.actionKey ?? null,
      transitionKey: runIntegration?.transitionKey ?? null,
      fromRunStatus:
        affectedRunMutationStatuses[`execution-run:${runKey}`] ??
        'awaiting-approval',
      toRunStatus: linkedRunStatus,
      fromActionStatus:
        affectedRunMutationStatuses[
          `execution-action:${runIntegration?.actionKey ?? ''}`
        ] ?? 'awaiting-approval-decision',
      toActionStatus: linkedActionStatus,
      fromTransitionStatus:
        affectedRunMutationStatuses[
          `execution-transition:${runIntegration?.transitionKey ?? ''}`
        ] ?? 'awaiting-approval-decision',
      toTransitionStatus: linkedTransitionStatus,
      fromRunnerStatus:
        affectedRunMutationStatuses[
          `execution-runner:${runIntegration?.runnerKey ?? ''}`
        ] ?? 'pending',
      toRunnerStatus: linkedRunnerStatus,
    }));

    const approvalDecisionMutations: OrchestrationRuntimeMutationRecord[] = [
      {
        mutationKey: `${task.dispatchKey}:decision-dispatch`,
        targetKey: task.dispatchKey,
        targetType: 'approval-dispatch',
        fromStatus: persistedDispatchStatus ?? 'dispatched',
        toStatus: taskDecisionStatus,
        mutationStatus: 'applied',
      },
      {
        mutationKey: `${task.taskKey}:decision-task`,
        targetKey: task.taskKey,
        targetType: 'approval-task',
        fromStatus: effectiveTaskStatus,
        toStatus: taskDecisionStatus,
        mutationStatus: 'applied',
      },
      ...affectedRunUpdates.flatMap((update) => [
        {
          mutationKey: `${update.runKey}:decision-run`,
          targetKey: update.runKey,
          targetType: 'execution-run',
          fromStatus: update.fromRunStatus,
          toStatus: update.toRunStatus,
          mutationStatus: 'applied',
        },
        {
          mutationKey: `${update.runnerKey ?? update.runKey}:decision-runner`,
          targetKey: update.runnerKey,
          targetType: 'execution-runner',
          fromStatus: update.fromRunnerStatus,
          toStatus: update.toRunnerStatus,
          mutationStatus: 'applied',
        },
        {
          mutationKey: `${update.actionKey ?? update.runKey}:decision-action`,
          targetKey: update.actionKey,
          targetType: 'execution-action',
          fromStatus: update.fromActionStatus,
          toStatus: update.toActionStatus,
          mutationStatus: 'applied',
        },
        {
          mutationKey: `${update.transitionKey ?? update.runKey}:decision-transition`,
          targetKey: update.transitionKey,
          targetType: 'execution-transition',
          fromStatus: update.fromTransitionStatus,
          toStatus: update.toTransitionStatus,
          mutationStatus: 'applied',
        },
      ]),
    ];
    const approvalDecisionSummary: OrchestrationApprovalDecisionSummary = {
      approvedRunCount: input.decision === 'approve' ? affectedRunUpdates.length : 0,
      cancelledRunCount: input.decision === 'approve' ? 0 : affectedRunUpdates.length,
    };
    const recordedAt = this.buildRuntimeRecordedAt();
    const actorKey = this.buildRuntimeActorKey({
      decidedBy: input.decidedBy,
      submittedBy: input.submittedBy,
    });
    const scope = this.buildRuntimeScope(input);
    const approvalDecisionEvents: OrchestrationRuntimeEventRecord[] = [
      {
        eventKey: `${task.taskKey}:decision`,
        eventType: 'approval-decision-applied',
        planId: input.planId,
        runtimeStatus: 'decision-applied',
        actorKey,
        recordedAt,
        scope,
        relatedKeys: {
          taskKey: task.taskKey,
          dispatchKey: task.dispatchKey,
          runKey: affectedRunUpdates[0]?.runKey ?? null,
          runnerKey: affectedRunUpdates[0]?.runnerKey ?? null,
        },
        metadata: {
          decision: input.decision,
          affectedRunCount: affectedRunUpdates.length,
          taskStatus: taskDecisionStatus,
        },
      },
    ];
    const runtimeSnapshot = this.buildRuntimeSnapshotRecord({
      planId: input.planId,
      snapshotType: 'approval-decision',
      runtimeStatus: 'decision-applied',
      actorKey,
      recordedAt,
      tenantSlug: scope.tenantSlug,
      workspaceSlug: scope.workspaceSlug,
      contractSummary: runtime.contractSummary,
      summary: approvalDecisionSummary,
      mutationRecords: approvalDecisionMutations,
      eventRecords: approvalDecisionEvents,
    });

    const persistence = await this.persistRuntimeSnapshot(runtimeSnapshot);

    return {
      ...runtime,
      decisionApplicationStatus: 'applied',
      approvalDecision: {
        taskKey: task.taskKey,
        dispatchKey: task.dispatchKey,
        decision: input.decision,
        taskStatus: taskDecisionStatus,
        decidedBy: actorKey,
      } satisfies OrchestrationApprovalDecisionRecord,
      approvalDecisionMutations,
      approvalDecisionSummary,
      runtimeSnapshot,
      runtimeEventRecords: [...(runtime.runtimeEventRecords ?? []), ...approvalDecisionEvents],
      runtimePersistence: persistence,
    };
  }

  async dispatchExecutionRun(input: OrchestrationExecutionDispatchInput) {
    const runtime = await this.materializeExecutionRuntime(input, {
      persistSnapshot: false,
    });
    const run = runtime.executionRunDispatchQueue.find(
      (record) => record.runKey === input.runKey,
    );

    if (!run) {
      throw new BadRequestException(
        `Execution run ${input.runKey} does not exist in execution runtime ${input.planId}.`,
      );
    }

    const persistedRunStatus = await this.findLatestPersistedMutationStatus({
      planId: input.planId,
      tenantSlug: input.tenantSlug,
      workspaceSlug: input.workspaceSlug,
      targetType: 'execution-run',
      targetKey: input.runKey,
    });

    if (
      persistedRunStatus &&
      persistedRunStatus !== 'queued-for-dispatch'
    ) {
      throw new BadRequestException(
        `Execution run ${input.runKey} is not dispatchable; current status is ${persistedRunStatus}.`,
      );
    }

    const effectiveDispatchReadiness =
      run.dispatchReadiness === 'blocked-by-approval' &&
      persistedRunStatus === 'queued-for-dispatch'
        ? 'dispatchable'
        : run.dispatchReadiness;

    if (effectiveDispatchReadiness !== 'dispatchable') {
      throw new BadRequestException(
        `Execution run ${input.runKey} is not dispatchable; current readiness is ${effectiveDispatchReadiness}.`,
      );
    }

    const runIntegration = runtime.executionRunnerIntegrations.find(
      (record) => record.runKey === input.runKey,
    );
    const persistedStatuses = await this.findLatestPersistedMutationStatuses({
      planId: input.planId,
      tenantSlug: input.tenantSlug,
      workspaceSlug: input.workspaceSlug,
      targets: [
        {
          targetType: 'execution-runner',
          targetKey: run.runnerKey,
        },
        {
          targetType: 'execution-action',
          targetKey: runIntegration?.actionKey,
        },
        {
          targetType: 'execution-transition',
          targetKey: run.nextTransitionKey,
        },
      ],
    });
    const persistedRunnerStatus =
      persistedStatuses[`execution-runner:${run.runnerKey}`];
    const persistedActionStatus =
      persistedStatuses[`execution-action:${runIntegration?.actionKey ?? ''}`];
    const persistedTransitionStatus =
      persistedStatuses[`execution-transition:${run.nextTransitionKey ?? ''}`];

    const executionDispatchMutations: OrchestrationRuntimeMutationRecord[] = [
      {
        mutationKey: `${run.runKey}:dispatch-run`,
        targetKey: run.runKey,
        targetType: 'execution-run',
        fromStatus: persistedRunStatus ?? 'queued-for-dispatch',
        toStatus: 'dispatched',
        mutationStatus: 'applied',
      },
      {
        mutationKey: `${run.runnerKey}:dispatch-runner`,
        targetKey: run.runnerKey,
        targetType: 'execution-runner',
        fromStatus: persistedRunnerStatus ?? 'pending',
        toStatus: 'dispatched',
        mutationStatus: 'applied',
      },
      {
        mutationKey: `${runIntegration?.actionKey ?? run.runKey}:dispatch-action`,
        targetKey: runIntegration?.actionKey ?? null,
        targetType: 'execution-action',
        fromStatus: persistedActionStatus ?? 'dispatched',
        toStatus: 'completed',
        mutationStatus: 'applied',
      },
      {
        mutationKey: `${run.nextTransitionKey ?? run.runKey}:dispatch-transition`,
        targetKey: run.nextTransitionKey ?? null,
        targetType: 'execution-transition',
        fromStatus: persistedTransitionStatus ?? 'applied',
        toStatus: 'completed',
        mutationStatus: 'applied',
      },
    ];
    const executionDispatchSummary: OrchestrationExecutionDispatchSummary = {
      dispatchedRunCount: 1,
    };
    const recordedAt = this.buildRuntimeRecordedAt();
    const actorKey = this.buildRuntimeActorKey({
      dispatchedBy: input.dispatchedBy,
      submittedBy: input.submittedBy,
    });
    const scope = this.buildRuntimeScope(input);
    const executionDispatchEvents: OrchestrationRuntimeEventRecord[] = [
      {
        eventKey: `${run.runKey}:dispatch`,
        eventType: 'execution-run-dispatched',
        planId: input.planId,
        runtimeStatus: 'dispatch-applied',
        actorKey,
        recordedAt,
        scope,
        relatedKeys: {
          runKey: run.runKey,
          runnerKey: run.runnerKey,
        },
        metadata: {
          workflowKey: run.workflowKey,
          runtimeKey: run.runtimeKey,
          systemKey: run.systemKey,
        },
      },
    ];
    const runtimeSnapshot = this.buildRuntimeSnapshotRecord({
      planId: input.planId,
      snapshotType: 'run-dispatch',
      runtimeStatus: 'dispatch-applied',
      actorKey,
      recordedAt,
      tenantSlug: scope.tenantSlug,
      workspaceSlug: scope.workspaceSlug,
      contractSummary: runtime.contractSummary,
      summary: executionDispatchSummary,
      mutationRecords: executionDispatchMutations,
      eventRecords: executionDispatchEvents,
    });

    const persistence = await this.persistRuntimeSnapshot(runtimeSnapshot);

    return {
      ...runtime,
      runnerDispatchStatus: 'applied',
      executionDispatch: {
        runKey: run.runKey,
        runnerKey: run.runnerKey,
        workflowKey: run.workflowKey,
        runtimeKey: run.runtimeKey,
        systemKey: run.systemKey,
        dispatchedBy: actorKey,
      } satisfies OrchestrationExecutionDispatchRecord,
      executionDispatchMutations,
      executionDispatchSummary,
      runtimeSnapshot,
      runtimeEventRecords: [...(runtime.runtimeEventRecords ?? []), ...executionDispatchEvents],
      runtimePersistence: persistence,
    };
  }

  async getExecutionRuntimeHistory(
    input: OrchestrationRuntimeHistoryQuery,
  ): Promise<OrchestrationRuntimeHistoryResponse> {
    if (!this.runtimeHistory) {
      return {
        planId: input.planId,
        contextScope: {
          tenantSlug: input.tenantSlug,
          workspaceSlug: input.workspaceSlug ?? null,
        },
        historyStatus: 'unavailable',
        diagnosticsSummary: {
          snapshotCount: 0,
          eventCount: 0,
          latestSnapshotType: null,
          latestRuntimeStatus: null,
          latestRecordedAt: null,
          latestEventType: null,
          latestEventRecordedAt: null,
          mutatedTargetCount: 0,
        },
        latestSnapshot: null,
        latestMutationByTarget: {},
        snapshots: [],
        events: [],
      };
    }

    const history = await this.runtimeHistory.readRuntimeHistory({
      planId: input.planId,
      tenantSlug: input.tenantSlug,
      workspaceSlug: input.workspaceSlug,
      snapshotTake: input.snapshotTake,
      eventTake: input.eventTake,
    });

    return {
      planId: input.planId,
      contextScope: {
        tenantSlug: input.tenantSlug,
        workspaceSlug: input.workspaceSlug ?? null,
      },
      historyStatus: history.latestSnapshot ? 'available' : 'empty',
      diagnosticsSummary: {
        snapshotCount: history.snapshots.length,
        eventCount: history.events.length,
        latestSnapshotType: history.latestSnapshot?.snapshotType ?? null,
        latestRuntimeStatus: history.latestSnapshot?.runtimeStatus ?? null,
        latestRecordedAt:
          history.latestSnapshot?.recordedAt ?? history.latestSnapshot?.createdAt ?? null,
        latestEventType: history.events[0]?.eventType ?? null,
        latestEventRecordedAt: history.events[0]?.recordedAt ?? null,
        mutatedTargetCount: Object.values(history.latestMutationByTarget).filter(
          (mutation) => mutation !== null,
        ).length,
      },
      latestSnapshot: history.latestSnapshot,
      latestMutationByTarget: history.latestMutationByTarget,
      snapshots: history.snapshots,
      events: history.events,
    };
  }

  async getExecutionRuntimeDiagnostics(
    input: OrchestrationRuntimeHistoryQuery,
  ): Promise<OrchestrationRuntimeDiagnosticsResponse> {
    const history = await this.getExecutionRuntimeHistory(input);
    const governanceOutcomes = history.events.flatMap((event) => {
      const outcome = event.eventType.replace(
        'ai-governance-dispatch-',
        '',
      ) as OrchestrationAiGovernanceDispatchOutcome;
      if (
        !event.eventType.startsWith('ai-governance-dispatch-') ||
        !['held', 'approved-resumed', 'blocked', 'auto-dispatched'].includes(
          outcome,
        )
      ) {
        return [];
      }

      return [{
        eventKey: event.eventKey,
        outcome,
        runKey: event.relatedKeys.runKey ?? null,
        runtimeStatus: event.runtimeStatus,
        recordedAt: event.recordedAt,
      } satisfies OrchestrationAiGovernanceOutcomeDiagnosticRecord];
    });

    return {
      planId: history.planId,
      contextScope: history.contextScope,
      historyStatus: history.historyStatus,
      diagnosticsSummary: history.diagnosticsSummary,
      latestSnapshot: history.latestSnapshot
        ? {
            snapshotKey: history.latestSnapshot.snapshotKey,
            snapshotType: history.latestSnapshot.snapshotType,
            runtimeStatus: history.latestSnapshot.runtimeStatus,
            recordedAt:
              history.latestSnapshot.recordedAt ??
              history.latestSnapshot.createdAt ??
              null,
          }
        : null,
      latestEvent: history.events[0]
        ? {
            eventKey: history.events[0].eventKey,
            eventType: history.events[0].eventType,
            runtimeStatus: history.events[0].runtimeStatus,
            recordedAt: history.events[0].recordedAt ?? null,
          }
        : null,
      recentAiGovernanceOutcomes: {
        recentOutcomeCount: governanceOutcomes.length,
        heldCount: governanceOutcomes.filter((event) => event.outcome === 'held').length,
        approvedResumedCount: governanceOutcomes.filter(
          (event) => event.outcome === 'approved-resumed',
        ).length,
        blockedCount: governanceOutcomes.filter((event) => event.outcome === 'blocked').length,
        autoDispatchedCount: governanceOutcomes.filter(
          (event) => event.outcome === 'auto-dispatched',
        ).length,
        latestOutcome: governanceOutcomes[0] ?? null,
      },
    };
  }
}
