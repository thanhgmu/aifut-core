export const ADAPTER_CONTRACT_STATUSES = [
  'foundation',
  'planned',
  'gated',
] as const;

export const ADAPTER_OPERATION_MODES = [
  'draft',
  'read',
  'write',
  'runtime',
] as const;

export const ADAPTER_CONTRACT_FOUNDATION = [
  {
    key: 'openclaw-intent-drafting',
    appDefinitionKey: 'openclaw',
    connectorKey: 'generic-rest',
    status: 'foundation',
    operationMode: 'draft',
    capabilities: [
      'interpret-business-intent',
      'draft-parent-workflow',
      'draft-child-workflows',
      'generate-recommendation',
      'explain-remediation',
    ],
    requiredInputs: [
      'actor-context',
      'tenant-context',
      'workspace-context',
      'allowed-capability-scope',
      'budget-policy',
      'prompt',
    ],
    outputArtifacts: [
      'business-goal-draft',
      'parent-workflow-draft',
      'child-workflow-draft',
      'recommendation-artifact',
    ],
    safetyBoundaries: [
      'approval-before-activation-beyond-safe-scope',
      'never-own-canonical-workflow-state',
    ],
  },
  {
    key: 'n8n-runtime-handoff',
    appDefinitionKey: 'n8n',
    connectorKey: 'n8n',
    status: 'foundation',
    operationMode: 'runtime',
    capabilities: [
      'deploy-child-workflow',
      'activate-workflow',
      'deactivate-workflow',
      'run-test',
      'fetch-runtime-status',
      'fetch-run-summary',
    ],
    requiredInputs: [
      'child-workflow-definition',
      'mapping-profile',
      'sync-policy',
      'runtime-config-reference',
    ],
    outputArtifacts: [
      'workflow-runtime-artifact-ref',
      'execution-run-summary',
      'health-hints',
    ],
    safetyBoundaries: [
      'never-own-parent-workflow-truth',
      'never-own-approval-truth',
    ],
  },
  {
    key: 'magica-generation-job',
    appDefinitionKey: 'magica',
    connectorKey: 'generic-rest',
    status: 'foundation',
    operationMode: 'runtime',
    capabilities: [
      'create-generation-job',
      'fetch-generation-status',
      'fetch-generation-outputs',
      'fetch-template-refs',
    ],
    requiredInputs: [
      'content-plan',
      'asset-request',
      'prompt-or-template-reference',
      'budget-policy',
    ],
    outputArtifacts: [
      'generation-job-summary',
      'asset-record-refs',
      'cost-summary',
    ],
    safetyBoundaries: [
      'never-own-campaign-truth',
      'never-own-cross-app-performance-truth',
    ],
  },
  {
    key: 'affiliate-summary-ingest',
    appDefinitionKey: 'aff-nexovaflow',
    connectorKey: 'generic-rest',
    status: 'foundation',
    operationMode: 'read',
    capabilities: [
      'create-affiliate-link-ref',
      'fetch-commission-summary',
      'fetch-payout-summary',
      'fetch-referral-tree-summary',
    ],
    requiredInputs: [
      'offer-context',
      'campaign-context',
      'tracking-context',
    ],
    outputArtifacts: [
      'affiliate-link-ref',
      'commission-summary',
      'payout-summary',
      'referral-summary',
    ],
    safetyBoundaries: [
      'never-own-marketplace-approval-truth',
      'never-own-product-governance-truth',
    ],
  },
  {
    key: 'perfex-summary-and-task-bridge',
    appDefinitionKey: 'perfex-nexovaflow',
    connectorKey: 'nexovaflow',
    status: 'foundation',
    operationMode: 'write',
    capabilities: [
      'fetch-lead-summaries',
      'fetch-contact-summaries',
      'fetch-deal-summaries',
      'create-lead',
      'create-task',
      'append-note',
      'update-deal-stage',
    ],
    requiredInputs: [
      'connection-instance',
      'field-mapping-profile',
      'action-request',
      'approval-state-when-required',
    ],
    outputArtifacts: [
      'lead-summary',
      'contact-summary',
      'deal-summary',
      'task-action-result',
      'note-action-result',
    ],
    safetyBoundaries: [
      'summary-first-read-heavy-start',
      'safe-write-scope-before-deeper-crm-ownership',
      'approval-gated-deal-stage-updates',
    ],
  },
] as const;

export const ADAPTER_CONTRACT_ROADMAP = [
  'contract-to-connection-instance-linkage',
  'contract-aware-setup-wizard-defaults',
  'contract-seeded-app-catalog',
  'runtime-artifact-binding',
] as const;
