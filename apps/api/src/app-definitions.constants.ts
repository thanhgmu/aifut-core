export const APP_DEFINITION_ROLES = [
  'agent-runtime',
  'workflow-runtime',
  'generation-engine',
  'affiliate-engine',
  'crm-domain',
] as const;

export const APP_DEFINITION_STATUS = [
  'recommended',
  'candidate',
  'planned',
] as const;

export const APP_DEFINITION_FOUNDATION = [
  {
    key: 'openclaw',
    name: 'OpenClaw',
    role: 'agent-runtime',
    status: 'recommended',
    adapterKey: 'openclaw-adapter',
    connectorKey: 'generic-rest',
    capabilities: [
      'interpret-business-intent',
      'draft-parent-workflow',
      'draft-child-workflows',
      'generate-recommendation',
      'explain-remediation',
    ],
    capabilityContractKeys: ['openclaw-intent-drafting'],
    minimumSlice: [
      'structured-prompt-ingestion',
      'normalized-json-draft-output',
      'approval-gated-activation',
    ],
    ownershipBoundary: [
      'never-own-canonical-workflow-state',
      'never-own-approval-truth',
      'never-own-commercial-truth',
    ],
  },
  {
    key: 'n8n',
    name: 'n8n',
    role: 'workflow-runtime',
    status: 'recommended',
    adapterKey: 'n8n-adapter',
    connectorKey: 'n8n',
    capabilities: [
      'deploy-child-workflow',
      'activate-workflow',
      'deactivate-workflow',
      'run-test',
      'fetch-runtime-status',
      'fetch-run-summary',
    ],
    capabilityContractKeys: ['n8n-runtime-handoff'],
    minimumSlice: [
      'compile-child-workflow-artifact',
      'deploy-runtime-artifact',
      'store-runtime-artifact-ref',
      'normalize-run-summary-into-execution-run',
    ],
    ownershipBoundary: [
      'never-own-parent-workflow-truth',
      'never-own-canonical-approval-state',
      'never-own-business-meaning',
    ],
  },
  {
    key: 'magica',
    name: 'MagiCA / e.aifut.net',
    role: 'generation-engine',
    status: 'recommended',
    adapterKey: 'magica-adapter',
    connectorKey: 'generic-rest',
    capabilities: [
      'create-generation-job',
      'fetch-generation-status',
      'fetch-generation-outputs',
      'fetch-template-refs',
    ],
    capabilityContractKeys: ['magica-generation-job'],
    minimumSlice: [
      'submit-generation-job',
      'store-external-job-ref',
      'map-output-assets',
      'return-generation-summary',
    ],
    ownershipBoundary: [
      'never-own-campaign-truth',
      'never-own-workflow-truth',
      'never-own-cross-app-performance-truth',
    ],
  },
  {
    key: 'aff-nexovaflow',
    name: 'aff.nexovaflow.com',
    role: 'affiliate-engine',
    status: 'recommended',
    adapterKey: 'aff-nexovaflow-adapter',
    connectorKey: 'generic-rest',
    capabilities: [
      'create-affiliate-link-ref',
      'fetch-commission-summary',
      'fetch-payout-summary',
      'fetch-referral-tree-summary',
    ],
    capabilityContractKeys: ['affiliate-summary-ingest'],
    minimumSlice: [
      'create-or-sync-affiliate-link-context',
      'ingest-commission-summary',
      'expose-payout-and-referral-summary',
    ],
    ownershipBoundary: [
      'never-own-marketplace-approval-truth',
      'never-own-product-governance-truth',
      'never-own-package-attachment-truth',
    ],
  },
  {
    key: 'perfex-nexovaflow',
    name: 'Perfex / NexovaFlow',
    role: 'crm-domain',
    status: 'recommended',
    adapterKey: 'perfex-nexovaflow-adapter',
    connectorKey: 'nexovaflow',
    capabilities: [
      'fetch-lead-summaries',
      'fetch-contact-summaries',
      'fetch-deal-summaries',
      'create-lead',
      'create-task',
      'append-note',
      'update-deal-stage',
    ],
    capabilityContractKeys: ['perfex-summary-and-task-bridge'],
    minimumSlice: [
      'connect-crm-instance',
      'fetch-lightweight-crm-summaries',
      'safe-task-and-note-actions',
      'lead-create-after-mapping-stabilization',
    ],
    ownershipBoundary: [
      'never-own-platform-kernel-truth',
      'never-own-parent-workflow-truth',
      'never-own-behavior-intelligence-backbone',
    ],
  },
] as const;

export const APP_DEFINITION_ROADMAP = [
  'shared-adapter-interface-types',
  'app-definition-api-surface',
  'connection-instance-linkage',
  'seeded-app-catalog',
] as const;
