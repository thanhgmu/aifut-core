export const CONNECTOR_CATEGORIES = [
  'crm',
  'commerce',
  'lms',
  'workflow',
  'analytics',
  'messaging',
  'ai',
  'storage',
  'payments',
  'custom',
] as const;

export const CONNECTOR_AUTH_MODES = [
  'api-key',
  'oauth2',
  'basic',
  'webhook-shared-secret',
  'custom',
] as const;

export const CONNECTOR_SYNC_DIRECTIONS = [
  'pull',
  'push',
  'bidirectional',
  'event-driven',
] as const;

export const CONNECTOR_REGISTRY_FOUNDATION = [
  {
    key: 'generic-rest',
    name: 'Generic REST Connector',
    category: 'custom',
    authModes: ['api-key', 'oauth2', 'basic', 'custom'],
    syncDirections: ['pull', 'push', 'bidirectional'],
    capabilities: [
      'custom-endpoint-mapping',
      'tenant-owned-app-bridge',
      'advanced-field-mapping',
    ],
    audience: 'technical-and-partner',
  },
  {
    key: 'webhook-bridge',
    name: 'Webhook/Event Bridge',
    category: 'custom',
    authModes: ['webhook-shared-secret', 'custom'],
    syncDirections: ['event-driven'],
    capabilities: [
      'event-ingestion',
      'event-dispatch',
      'low-code-system-bridge',
    ],
    audience: 'mixed',
  },
  {
    key: 'n8n',
    name: 'n8n Bridge',
    category: 'workflow',
    authModes: ['api-key', 'oauth2'],
    syncDirections: ['push', 'event-driven', 'bidirectional'],
    capabilities: [
      'workflow-runtime-handoff',
      'visual-automation-bridge',
      'non-technical-flow-composition',
    ],
    audience: 'mixed',
  },
  {
    key: 'perfex',
    name: 'Perfex CRM Connector',
    category: 'crm',
    authModes: ['api-key', 'basic', 'custom'],
    syncDirections: ['pull', 'push', 'bidirectional'],
    capabilities: [
      'crm-bridge',
      'customer-sync',
      'invoice-sync',
      'migration-surface',
    ],
    audience: 'operator-and-partner',
  },
  {
    key: 'nexovaflow',
    name: 'NexovaFlow Operations Connector',
    category: 'crm',
    authModes: ['api-key', 'basic', 'custom'],
    syncDirections: ['pull', 'push', 'bidirectional', 'event-driven'],
    capabilities: [
      'crm-bridge',
      'natural-language-ops-bridge',
      'lead-task-action-contracts',
      'workflow-handoff',
      'perfex-compatible-adapter',
    ],
    audience: 'operator-and-partner',
  },
  {
    key: 'shopify',
    name: 'Shopify Connector',
    category: 'commerce',
    authModes: ['oauth2', 'api-key'],
    syncDirections: ['pull', 'push', 'event-driven', 'bidirectional'],
    capabilities: [
      'customer-sync',
      'order-events',
      'product-sync',
      'commerce-workflow-handoff',
    ],
    audience: 'mixed',
  },
  {
    key: 'moodle',
    name: 'Moodle Connector',
    category: 'lms',
    authModes: ['api-key', 'oauth2', 'custom'],
    syncDirections: ['pull', 'push', 'bidirectional'],
    capabilities: [
      'enrollment-sync',
      'course-progress-sync',
      'learning-event-bridge',
    ],
    audience: 'mixed',
  },
] as const;

export const CONNECTOR_REGISTRY_ROADMAP = [
  'connection-instance-model',
  'credential-reference-boundaries',
  'mapping-profile-contracts',
  'health-and-drift-diagnostics',
  'ai-assisted-integration-setup',
] as const;
