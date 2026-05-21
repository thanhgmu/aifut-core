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

export interface OrchestrationRuntimeScope {
  tenantSlug: string;
  workspaceSlug: string | null;
}

export interface OrchestrationExecutionRunnerTopologyRecord {
  runnerKey: string;
  contractKey: string;
  runtimeBindingKey: string | null;
  workflowKey: string;
  runtimeKey: string;
  systemKey: string;
  triggerMode: string;
  runnerStatus: string;
  readinessStatus: string;
  nextActionKey: string | null;
  linkedApprovalDispatchKeys: string[];
  linkedRollbackRecordKeys: string[];
}

export interface OrchestrationExecutionActionTopologyRecord {
  actionKey: string;
  actionType: string;
  actionStatus: string;
  actionTargetKey: string | null;
  runnerKey: string;
  contractKey: string;
  runtimeBindingKey: string | null;
  readinessStatus: string;
  linkedApprovalDispatchKeys: string[];
  linkedRollbackRecordKeys: string[];
}

export interface OrchestrationExecutionRunTopologyRecord {
  runKey: string;
  runnerKey: string;
  contractKey: string;
  runtimeBindingKey: string | null;
  workflowKey: string;
  runtimeKey: string;
  systemKey: string;
  triggerMode: string;
  runStatus: string;
  readinessStatus: string;
  nextActionKey: string | null;
  approvalTaskKeys: string[];
  rollbackRecordKeys: string[];
}

export interface OrchestrationExecutionRunnerHintRecord {
  contractKey: string;
  runnerStatus: string;
  readinessStatus: string;
  nextActionKey: string | null;
  workflowKey: string;
  runtimeKey: string;
  systemKey: string;
  triggerMode: string;
  runtimeBindingKey: string | null;
  linkedApprovalDispatchKeys: string[];
  linkedRollbackRecordKeys: string[];
}

export interface OrchestrationApprovalTaskQueueRecord {
  taskKey: string;
  dispatchKey: string;
  checkpointKey: string;
  approverRole: string;
  channel: string;
  required: boolean;
  taskStatus: string;
  linkedChildContractKeys: string[];
  linkedRunKeys: string[];
}

export interface OrchestrationExecutionRunDispatchQueueRecord {
  runKey: string;
  runnerKey: string;
  dispatchReadiness: string;
  nextTransitionKey: string | null;
  workflowKey: string;
  runtimeKey: string;
  systemKey: string;
}

export interface OrchestrationExecutionTransitionQueueRecord {
  transitionKey: string;
  sourceActionKey: string;
  sourceRunnerKey: string;
  sourceContractKey: string;
  transitionType: string;
  transitionStatus: string;
  targetKey: string | null;
  readinessStatus: string;
}

export interface OrchestrationExecutionRunStateHintRecord {
  runKey: string;
  runStatus: string;
  nextTransitionKey: string | null;
  completionGate: string;
}

export interface OrchestrationApprovalTaskStateHintRecord {
  taskKey: string;
  taskStatus: string;
  nextTransitionType: string;
  linkedRunKeys: string[];
}

export interface OrchestrationApprovalDecisionOptionRecord {
  taskKey: string;
  dispatchKey: string;
  decisionOptions: string[];
  defaultDecision: string;
  affectedRunKeys: string[];
}

export interface OrchestrationExecutionTransitionBatchRecord {
  transitionKey: string;
  transitionType: string;
  transitionStatus: string;
  targetKey: string | null;
  workspaceSlug: string | null;
}

export interface OrchestrationExecutionStateTransitionBatch {
  batchKey: string;
  status: string;
  records: OrchestrationExecutionTransitionBatchRecord[];
}

export interface OrchestrationProjectedApprovalDecisionRecord {
  decisionRecordKey: string;
  taskKey: string;
  dispatchKey: string;
  defaultDecision: string;
  allowedDecisions: string[];
  projectedOutcomeStatus: string;
  affectedRunKeys: string[];
}

export interface OrchestrationProjectedRunDispatchRecord {
  dispatchRecordKey: string;
  runKey: string;
  runnerKey: string;
  dispatchReadiness: string;
  projectedDispatchStatus: string;
  nextTransitionKey: string | null;
  workflowKey: string;
  runtimeKey: string;
  systemKey: string;
}

export interface OrchestrationProjectedApprovalOutcomeRecord {
  outcomeRecordKey: string;
  decisionRecordKey: string;
  taskKey: string;
  projectedResolution: string;
  affectedRunKeys: string[];
  outcomeStatus: string;
}

export interface OrchestrationProjectedDispatchOutcomeRecord {
  outcomeRecordKey: string;
  dispatchRecordKey: string;
  runKey: string;
  runnerKey: string;
  projectedResolution: string;
  outcomeStatus: string;
}

export interface OrchestrationProjectedApprovalDecisionBatchRecord {
  decisionRecordKey: string;
  projectedOutcomeStatus: string;
  taskKey: string;
}

export interface OrchestrationProjectedRunDispatchBatchRecord {
  dispatchRecordKey: string;
  projectedDispatchStatus: string;
  runKey: string;
}

export interface OrchestrationProjectedMutationBatch {
  batchKey: string;
  status: string;
  approvalDecisionRecords: OrchestrationProjectedApprovalDecisionBatchRecord[];
  runDispatchRecords: OrchestrationProjectedRunDispatchBatchRecord[];
}

export interface OrchestrationProjectedApprovalOutcomeBatchRecord {
  outcomeRecordKey: string;
  projectedResolution: string;
  taskKey: string;
}

export interface OrchestrationProjectedDispatchOutcomeBatchRecord {
  outcomeRecordKey: string;
  projectedResolution: string;
  runKey: string;
}

export interface OrchestrationProjectedOutcomeBatch {
  batchKey: string;
  status: string;
  approvalOutcomes: OrchestrationProjectedApprovalOutcomeBatchRecord[];
  dispatchOutcomes: OrchestrationProjectedDispatchOutcomeBatchRecord[];
}

export interface OrchestrationActionTransitionPolicy {
  actionKey: string;
  actionType: string;
  currentStatus: string;
  allowedNextStatuses: string[];
}

export interface OrchestrationRunTransitionPolicy {
  runKey: string;
  currentStatus: string;
  allowedNextStatuses: string[];
}

export interface OrchestrationApprovalTaskTransitionPolicy {
  taskKey: string;
  currentStatus: string;
  allowedNextStatuses: string[];
}

export interface OrchestrationTransitionPolicyBatch {
  batchKey: string;
  status: string;
  actionPolicies: OrchestrationActionTransitionPolicy[];
  runPolicies: OrchestrationRunTransitionPolicy[];
  approvalTaskPolicies: OrchestrationApprovalTaskTransitionPolicy[];
}

export interface OrchestrationProjectedMutationContract {
  contractKey: string;
  status: string;
  approvalDecisionCount: number;
  runDispatchCount: number;
  approvalOutcomeCount: number;
  dispatchOutcomeCount: number;
  actionPolicyCount: number;
  runPolicyCount: number;
  approvalTaskPolicyCount: number;
  readyProjectedDispatchCount: number;
  approvalDecisionKeys: string[];
  runDispatchKeys: string[];
  outcomeKeys: string[];
}

export interface OrchestrationExecutionReadinessUnresolvedContractRecord {
  contractKey: string;
  workflowKey: string;
  runtimeKey: string;
  systemKey: string;
}

export interface OrchestrationExecutionReadinessSummary {
  blockedRunnerCount: number;
  awaitingApprovalRunnerCount: number;
  readyRunnerCount: number;
  unresolvedChildWorkflowContracts: OrchestrationExecutionReadinessUnresolvedContractRecord[];
  pendingActionCount: number;
  blockedActionCount: number;
  queuedRunCount: number;
  awaitingApprovalRunCount: number;
  blockedRunCount: number;
  pendingApprovalTaskCount: number;
  pendingTransitionCount: number;
  blockedTransitionCount: number;
  dispatchableRunCount: number;
  readyProjectedDispatchCount: number;
  projectedOutcomeCount: number;
  transitionPolicyCount: number;
  projectedMutationContractCount: number;
}

export interface OrchestrationRuntimeEventRelatedKeys {
  taskKey?: string | null;
  runKey?: string | null;
  runnerKey?: string | null;
  dispatchKey?: string | null;
}

export interface OrchestrationRuntimeEventRecord {
  eventKey: string;
  eventType: string;
  planId: string;
  runtimeStatus: string;
  actorKey: string;
  recordedAt: string;
  scope: OrchestrationRuntimeScope;
  relatedKeys: OrchestrationRuntimeEventRelatedKeys;
  metadata: Record<string, unknown>;
}

export type OrchestrationRuntimeSnapshotType =
  | 'materialized-runtime'
  | 'approval-decision'
  | 'run-dispatch';

export interface OrchestrationRuntimeContractSummary {
  executionModeCount: number;
  runtimeBindingCount: number;
  childWorkflowContractCount: number;
  approvalContractCount: number;
  escalationContractCount: number;
  rollbackContractCount: number;
  unresolvedRuntimeBindingCount: number;
}

export type OrchestrationRuntimeSnapshotSummary =
  | OrchestrationLiveRuntimeSummary
  | OrchestrationApprovalDecisionSummary
  | OrchestrationExecutionDispatchSummary;

export interface OrchestrationRuntimeSnapshotRecord {
  snapshotKey: string;
  planId: string;
  snapshotType: OrchestrationRuntimeSnapshotType;
  runtimeStatus: string;
  tenantSlug: string;
  workspaceSlug: string | null;
  recordedBy: string;
  recordedAt: string;
  contractSummary: OrchestrationRuntimeContractSummary;
  summary: OrchestrationRuntimeSnapshotSummary;
  mutationRecords: OrchestrationRuntimeMutationRecord[];
  eventRecords: OrchestrationRuntimeEventRecord[];
}

export interface OrchestrationRuntimePersistenceResult {
  persistedSnapshotKey: string | null;
  persistedEventKeys: string[];
}

export interface OrchestrationRuntimeHistoryQuery {
  planId: string;
  tenantSlug: string;
  workspaceSlug?: string | null;
  snapshotTake?: number;
  eventTake?: number;
}

export type OrchestrationPersistedRuntimeRelatedKeys =
  OrchestrationRuntimeEventRelatedKeys;

export interface OrchestrationPersistedRuntimeEventRecord {
  eventKey: string;
  planId: string;
  eventType: string;
  runtimeStatus: string;
  tenantSlug: string;
  workspaceSlug: string | null;
  actorKey: string;
  relatedKeys: OrchestrationPersistedRuntimeRelatedKeys;
  metadata: Record<string, unknown>;
  recordedAt: string;
  createdAt?: string;
}

export interface OrchestrationPersistedRuntimeSnapshotRecord {
  snapshotKey: string;
  planId: string;
  snapshotType: OrchestrationRuntimeSnapshotType;
  runtimeStatus: string;
  tenantSlug: string;
  workspaceSlug: string | null;
  recordedBy: string;
  recordedAt?: string;
  contractSummary: OrchestrationRuntimeContractSummary;
  summary: OrchestrationRuntimeSnapshotSummary;
  mutationRecords: OrchestrationRuntimeMutationRecord[];
  eventRecords: OrchestrationPersistedRuntimeEventRecord[];
  createdAt?: string;
}

export interface OrchestrationRuntimeHistoryResult {
  latestSnapshot: OrchestrationPersistedRuntimeSnapshotRecord | null;
  latestMutationByTarget: Record<string, OrchestrationRuntimeMutationRecord | null>;
  snapshots: OrchestrationPersistedRuntimeSnapshotRecord[];
  events: OrchestrationPersistedRuntimeEventRecord[];
}

export interface OrchestrationRuntimeDiagnosticsSummary {
  snapshotCount: number;
  eventCount: number;
  latestSnapshotType: OrchestrationRuntimeSnapshotType | null;
  latestRuntimeStatus: string | null;
  latestRecordedAt: string | null;
  latestEventType: string | null;
  latestEventRecordedAt: string | null;
  mutatedTargetCount: number;
}

export interface OrchestrationRuntimeHistoryResponse {
  planId: string;
  contextScope: OrchestrationRuntimeScope;
  historyStatus: 'unavailable' | 'empty' | 'available';
  diagnosticsSummary: OrchestrationRuntimeDiagnosticsSummary;
  latestSnapshot: OrchestrationPersistedRuntimeSnapshotRecord | null;
  latestMutationByTarget: Record<string, OrchestrationRuntimeMutationRecord | null>;
  snapshots: OrchestrationPersistedRuntimeSnapshotRecord[];
  events: OrchestrationPersistedRuntimeEventRecord[];
}

export interface OrchestrationApprovalDispatchIntegrationRecord {
  integrationKey: string;
  dispatchKey: string;
  taskKey: string;
  channel: string;
  approverRole: string;
  integrationStatus: 'dispatched-for-approval' | 'optional-review-routed';
  appliedDispatchStatus: 'dispatched' | 'optional-review';
  appliedTaskStatus: 'awaiting-decision' | 'review-requested';
  defaultDecision: string | null;
  allowedDecisions: string[];
  affectedRunKeys: string[];
}

export interface OrchestrationExecutionRunnerIntegrationRecord {
  integrationKey: string;
  runKey: string;
  runnerKey: string;
  actionKey: string | null;
  transitionKey: string | null;
  projectedDispatchRecordKey: string | null;
  integrationStatus:
    | 'runner-dispatched'
    | 'awaiting-approval-clearance'
    | 'awaiting-runtime-binding';
  appliedRunnerStatus: string;
  appliedRunStatus: string;
  appliedActionStatus: string;
  appliedTransitionStatus: string;
  runtimeKey: string;
  systemKey: string;
  workflowKey: string;
}

export interface OrchestrationLiveMutationBatch {
  batchKey: string;
  status: 'partially-applied' | 'blocked' | 'pending-approval';
  approvalDispatchRecords: OrchestrationRuntimeMutationRecord[];
  executionRunnerRecords: OrchestrationRuntimeMutationRecord[];
}

export interface OrchestrationLiveRuntimeSummary {
  dispatchedApprovalCount: number;
  optionalReviewCount: number;
  dispatchedRunnerCount: number;
  awaitingApprovalClearanceCount: number;
  awaitingRuntimeBindingCount: number;
  appliedMutationCount: number;
  pendingApprovalMutationCount: number;
  blockedMutationCount: number;
}

export interface OrchestrationApprovalDecisionRecord {
  taskKey: string;
  dispatchKey: string;
  decision: 'approve' | 'reject' | 'request-changes';
  taskStatus: 'approved' | 'rejected' | 'changes-requested';
  decidedBy: string;
}

export interface OrchestrationApprovalDecisionSummary {
  approvedRunCount: number;
  cancelledRunCount: number;
}

export interface OrchestrationExecutionDispatchRecord {
  runKey: string;
  runnerKey: string;
  workflowKey: string;
  runtimeKey: string;
  systemKey: string;
  dispatchedBy: string;
}

export interface OrchestrationExecutionDispatchSummary {
  dispatchedRunCount: number;
}

export interface OrchestrationMaterializedRuntimeResponse {
  executionRuntimeStatus: 'materialized';
  approvalDispatchIntegrations: OrchestrationApprovalDispatchIntegrationRecord[];
  executionRunnerIntegrations: OrchestrationExecutionRunnerIntegrationRecord[];
  liveMutationBatch: OrchestrationLiveMutationBatch;
  liveRuntimeSummary: OrchestrationLiveRuntimeSummary;
  runtimeSnapshot: OrchestrationRuntimeSnapshotRecord;
  runtimeEventRecords: OrchestrationRuntimeEventRecord[];
  runtimePersistence: OrchestrationRuntimePersistenceResult | null;
}
