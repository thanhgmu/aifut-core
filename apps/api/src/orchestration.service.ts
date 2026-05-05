import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class OrchestrationService {
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
  }) {
    return {
      planId: input.planId,
      coordinationStatus: 'draft',
      objective:
        input.objective?.trim() ||
        'Assign workflow steps to the leanest viable mix of first-party modules and connected systems.',
      preferredSystems: this.normalizeStringList(input.preferredSystems),
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
      businessObjects: this.normalizeStringList(input.businessObjects),
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
  }) {
    return {
      planId: input.planId,
      graphStatus: 'draft',
      objective:
        input.objective?.trim() ||
        'Project the parent workflow into a renderable graph with lanes, nodes, edges, and approval checkpoints.',
      lanes: this.normalizeStringList(input.lanes),
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
  }) {
    const executionModes = this.normalizeStringList(input.executionModes);
    const runtimeBindings = this.normalizeRuntimeBindings(input.runtimeBindings);
    const childWorkflowContracts = this.normalizeChildWorkflowContracts(
      input.childWorkflowContracts,
    );
    const approvalContracts = this.normalizeApprovalContracts(
      input.approvalContracts,
    );
    const escalationContracts = this.normalizeEscalationContracts(
      input.escalationContracts,
    );
    const rollbackContracts = this.normalizeRollbackContracts(
      input.rollbackContracts,
    );

    return {
      planId: input.planId,
      executionContractStatus: 'draft',
      objective:
        input.objective?.trim() ||
        'Define the execution contract across workflows, approvals, connected systems, and failure-handling boundaries.',
      executionModes,
      runtimeBindings,
      childWorkflowContracts,
      approvalContracts,
      escalationContracts,
      rollbackContracts,
      draftSummary: {
        executionModeCount: executionModes.length,
        runtimeBindingCount: runtimeBindings.length,
        approvalRequiredRuntimeBindingCount: runtimeBindings.filter(
          (binding) => binding.approvalRequired,
        ).length,
        childWorkflowContractCount: childWorkflowContracts.length,
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

    const executionTransitionQueue = executionActionRecords.map((action) => ({
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

    const executionRunStateHints = executionRunRecords.map((run) => ({
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

    const approvalTaskStateHints = approvalTaskRecords.map((task) => ({
      taskKey: task.taskKey,
      taskStatus: task.taskStatus,
      nextTransitionType: task.required ? 'record-approval-decision' : 'optional-review',
      linkedRunKeys: task.linkedRunKeys,
    }));

    const approvalDecisionOptions = approvalTaskRecords.map((task) => ({
      taskKey: task.taskKey,
      dispatchKey: task.dispatchKey,
      decisionOptions: task.required
        ? ['approve', 'reject', 'request-changes']
        : ['approve', 'skip', 'request-review'],
      defaultDecision: task.required ? 'approve' : 'skip',
      affectedRunKeys: task.linkedRunKeys,
    }));

    const executionRunDispatchQueue = executionRunRecords.map((run) => ({
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

    const executionStateTransitionBatch = {
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

    const projectedApprovalDecisionRecords = approvalDecisionOptions.map(
      (option, index) => ({
        decisionRecordKey: `${input.planId}:approval-decision:${index + 1}`,
        taskKey: option.taskKey,
        dispatchKey: option.dispatchKey,
        defaultDecision: option.defaultDecision,
        allowedDecisions: option.decisionOptions,
        projectedOutcomeStatus: 'awaiting-decision',
        affectedRunKeys: option.affectedRunKeys,
      }),
    );

    const projectedRunDispatchRecords = executionRunDispatchQueue.map(
      (run, index) => ({
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
      }),
    );

    const projectedMutationBatch = {
      batchKey: `${input.planId}:projected-mutation`,
      status: projectedRunDispatchRecords.some(
        (record) => record.projectedDispatchStatus === 'ready-to-dispatch',
      )
        ? 'partially-ready'
        : 'pending',
      approvalDecisionRecords: projectedApprovalDecisionRecords.map((record) => ({
        decisionRecordKey: record.decisionRecordKey,
        projectedOutcomeStatus: record.projectedOutcomeStatus,
        taskKey: record.taskKey,
      })),
      runDispatchRecords: projectedRunDispatchRecords.map((record) => ({
        dispatchRecordKey: record.dispatchRecordKey,
        projectedDispatchStatus: record.projectedDispatchStatus,
        runKey: record.runKey,
      })),
    };

    const projectedApprovalOutcomeRecords = projectedApprovalDecisionRecords.map(
      (record) => ({
        outcomeRecordKey: `${record.decisionRecordKey}:outcome`,
        decisionRecordKey: record.decisionRecordKey,
        taskKey: record.taskKey,
        projectedResolution:
          record.defaultDecision === 'approve'
            ? 'approval-clears-run-gate'
            : 'approval-keeps-run-blocked',
        affectedRunKeys: record.affectedRunKeys,
        outcomeStatus: 'projected',
      }),
    );

    const projectedDispatchOutcomeRecords = projectedRunDispatchRecords.map(
      (record) => ({
        outcomeRecordKey: `${record.dispatchRecordKey}:outcome`,
        dispatchRecordKey: record.dispatchRecordKey,
        runKey: record.runKey,
        runnerKey: record.runnerKey,
        projectedResolution:
          record.projectedDispatchStatus === 'ready-to-dispatch'
            ? 'runner-may-enter-dispatched-state'
            : 'runner-remains-pending-prerequisite',
        outcomeStatus: 'projected',
      }),
    );

    const projectedOutcomeBatch = {
      batchKey: `${input.planId}:projected-outcome`,
      status: 'projected',
      approvalOutcomes: projectedApprovalOutcomeRecords.map((record) => ({
        outcomeRecordKey: record.outcomeRecordKey,
        projectedResolution: record.projectedResolution,
        taskKey: record.taskKey,
      })),
      dispatchOutcomes: projectedDispatchOutcomeRecords.map((record) => ({
        outcomeRecordKey: record.outcomeRecordKey,
        projectedResolution: record.projectedResolution,
        runKey: record.runKey,
      })),
    };

    const actionTransitionPolicies = executionActionRecords.map((action) => ({
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

    const runTransitionPolicies = executionRunRecords.map((run) => ({
      runKey: run.runKey,
      currentStatus: run.runStatus,
      allowedNextStatuses:
        run.runStatus === 'blocked'
          ? ['queued-for-dispatch']
          : run.runStatus === 'awaiting-approval'
            ? ['queued-for-dispatch', 'cancelled']
            : ['dispatched', 'dispatch-failed', 'cancelled'],
    }));

    const approvalTaskTransitionPolicies = approvalTaskRecords.map((task) => ({
      taskKey: task.taskKey,
      currentStatus: task.taskStatus,
      allowedNextStatuses: task.required
        ? ['approved', 'rejected', 'changes-requested']
        : ['approved', 'skipped', 'review-requested'],
    }));

    const transitionPolicyBatch = {
      batchKey: `${input.planId}:transition-policy`,
      status: 'draft',
      actionPolicies: actionTransitionPolicies.map((policy) => ({
        actionKey: policy.actionKey,
        currentStatus: policy.currentStatus,
        allowedNextStatuses: policy.allowedNextStatuses,
      })),
      runPolicies: runTransitionPolicies.map((policy) => ({
        runKey: policy.runKey,
        currentStatus: policy.currentStatus,
        allowedNextStatuses: policy.allowedNextStatuses,
      })),
      approvalTaskPolicies: approvalTaskTransitionPolicies.map((policy) => ({
        taskKey: policy.taskKey,
        currentStatus: policy.currentStatus,
        allowedNextStatuses: policy.allowedNextStatuses,
      })),
    };

    const projectedMutationContract = {
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
      executionReadinessSummary: {
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
      executionRunnerTopology: storedExecutionRunnerRecords.map((runner) => ({
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
      })),
      executionActionTopology: executionActionRecords.map((action) => ({
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
      })),
      executionRunTopology: executionRunRecords.map((run) => ({
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
      })),
      approvalTaskQueue: approvalTaskRecords.map((task) => ({
        taskKey: task.taskKey,
        dispatchKey: task.dispatchKey,
        checkpointKey: task.checkpointKey,
        approverRole: task.approverRole,
        channel: task.channel,
        required: task.required,
        taskStatus: task.taskStatus,
        linkedChildContractKeys: task.linkedChildContractKeys,
        linkedRunKeys: task.linkedRunKeys,
      })),
      executionRunnerHints: storedExecutionRunnerRecords.map((runner) => ({
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
      })),
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
}
