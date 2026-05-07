export interface OrchestrationRuntimeBindingInput {
  runtimeKey?: string;
  systemKey?: string;
  deliveryMode?: string;
  approvalRequired?: boolean;
}

export interface OrchestrationChildWorkflowContractInput {
  workflowKey?: string;
  runtimeKey?: string;
  systemKey?: string;
  triggerMode?: string;
  approvalRequired?: boolean;
  approvalCheckpointKey?: string;
}

export interface OrchestrationApprovalContractInput {
  checkpointKey?: string;
  approverRole?: string;
  channel?: string;
  escalationMode?: string;
  required?: boolean;
}

export interface OrchestrationEscalationContractInput {
  escalationKey?: string;
  fromCheckpointKey?: string;
  targetRole?: string;
  triggerMode?: string;
  delayMinutes?: number;
}

export interface OrchestrationRollbackContractInput {
  rollbackKey?: string;
  fromCheckpointKey?: string;
  targetSystemKey?: string;
  strategy?: string;
  preserveArtifacts?: boolean;
}

export interface OrchestrationRuntimeContextInput {
  tenantSlug: string;
  workspaceSlug?: string | null;
  planId: string;
  objective?: string;
  executionModes?: string[];
  runtimeBindings?: OrchestrationRuntimeBindingInput[];
  childWorkflowContracts?: OrchestrationChildWorkflowContractInput[];
  approvalContracts?: OrchestrationApprovalContractInput[];
  escalationContracts?: OrchestrationEscalationContractInput[];
  rollbackContracts?: OrchestrationRollbackContractInput[];
  submittedBy?: string;
  submissionNotes?: string;
}

export interface OrchestrationApprovalDecisionInput
  extends OrchestrationRuntimeContextInput {
  taskKey: string;
  decision: 'approve' | 'reject' | 'request-changes';
  decidedBy?: string;
}

export interface OrchestrationExecutionDispatchInput
  extends OrchestrationRuntimeContextInput {
  runKey: string;
  dispatchedBy?: string;
}

export interface OrchestrationRuntimeMutationRecord {
  mutationKey: string;
  targetKey: string | null;
  targetType: string;
  fromStatus: string;
  toStatus: string;
  mutationStatus: string;
}

export interface OrchestrationRuntimeEventRecord {
  eventKey: string;
  eventType: string;
  planId: string;
  runtimeStatus: string;
  actorKey: string;
  recordedAt: string;
  scope: {
    tenantSlug: string;
    workspaceSlug: string | null;
  };
  relatedKeys: {
    taskKey?: string | null;
    runKey?: string | null;
    runnerKey?: string | null;
    dispatchKey?: string | null;
  };
  metadata: Record<string, unknown>;
}

export interface OrchestrationRuntimeSnapshotRecord {
  snapshotKey: string;
  planId: string;
  snapshotType: 'materialized-runtime' | 'approval-decision' | 'run-dispatch';
  runtimeStatus: string;
  tenantSlug: string;
  workspaceSlug: string | null;
  recordedBy: string;
  recordedAt: string;
  contractSummary: {
    executionModeCount: number;
    runtimeBindingCount: number;
    childWorkflowContractCount: number;
    approvalContractCount: number;
    escalationContractCount: number;
    rollbackContractCount: number;
    unresolvedRuntimeBindingCount: number;
  };
  summary: Record<string, number | string | boolean | null>;
  mutationRecords: OrchestrationRuntimeMutationRecord[];
  eventRecords: OrchestrationRuntimeEventRecord[];
}
