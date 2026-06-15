/**
 * AIFUT Integration Standard (AIS) — draft spec content.
 * This is the public open spec that third-party connectors must implement.
 */

export const AIS_SPEC = {
  version: '0.1.0-draft',
  title: 'AIFUT Integration Standard',
  status: 'draft',
  publishedAt: '2026-06-15',
  sections: [
    {
      id: 'overview',
      title: 'Overview',
      content: [
        'AIS defines the contract between AIFUT and any external system, service, or application.',
        'Any system implementing the AIS contract can be discovered, connected, and orchestrated by AIFUT as a native connector.',
        'This creates a plug-and-play ecosystem where third-party developers build once and reach all AIFUT tenants.',
      ],
    },
    {
      id: 'authentication',
      title: 'Authentication & Authorization',
      content: [
        'All AIS-compliant connectors MUST support at least ONE of:',
        '  - OAuth 2.0 (preferred, with refresh token flow)',
        '  - API Key (passed via Authorization header as Bearer token)',
        '  - Basic Auth (username:password base64-encoded, HTTPS only)',
        '',
        'Connectors SHOULD implement HTTPS exclusively.',
        'AIFUT will handle token refresh, rotation, and secure storage transparently.',
      ],
    },
    {
      id: 'discovery',
      title: 'Discovery & Metadata',
      content: [
        'AIS-compliant connectors MUST expose a /.well-known/ais endpoint that returns:',
        '  - ais_version: string',
        '  - connector_name: string',
        '  - connector_version: string',
        '  - capabilities: Capability[]',
        '  - actions: ActionDefinition[]',
        '  - triggers: TriggerDefinition[]',
        '  - auth_methods: string[]',
        '',
        'Capabilities include: read, write, webhook, batch, search.',
        'Actions define what operations the connector can perform.',
        'Triggers define what events the connector can emit.',
      ],
    },
    {
      id: 'actions',
      title: 'Action Contract',
      content: [
        'Each action MUST define:',
        '  - key: string (unique action identifier)',
        '  - name: string (human-readable)',
        '  - description: string',
        '  - input: JSON Schema (parameters the action accepts)',
        '  - output: JSON Schema (what the action returns)',
        '  - idempotent: boolean (true if safe to retry)',
        '  - timeout_ms: number (max execution time)',
        '',
        'Actions are invoked via POST /ais/actions/{action_key} with the input payload.',
        'Responses use standard HTTP status codes: 200 success, 400 bad request, 429 rate limited, 503 unavailable.',
      ],
    },
    {
      id: 'triggers',
      title: 'Trigger Contract',
      content: [
        'Triggers allow AIFUT workflows to react to events in external systems.',
        'Each trigger MUST define:',
        '  - key: string',
        '  - name: string',
        '  - description: string',
        '  - event_schema: JSON Schema',
        '  - delivery: "webhook" | "polling"',
        '',
        'For webhook delivery: connector sends POST to AIFUT-provided callback URL.',
        'For polling delivery: AIFUT calls GET /ais/triggers/{key}/events at configured interval.',
        'Event payload MUST include: event_id, event_type, occurred_at, and data.',
      ],
    },
    {
      id: 'data-models',
      title: 'Data Model Contract',
      content: [
        'Connectors SHOULD declare their data models for AIFUT to understand the shape of data.',
        'Data models are declared as JSON Schema in the discovery endpoint.',
        'AIFUT uses this to auto-map between connector data and workflow contexts.',
        'Common object types: contact, order, product, invoice, ticket, appointment.',
      ],
    },
    {
      id: 'webhooks',
      title: 'Webhook Standard',
      content: [
        'AIFUT webhooks follow standard patterns for reliability:',
        '  - Payload: JSON with envelope { event_id, event_type, occurred_at, data }',
        '  - Retry: exponential backoff (1s, 2s, 4s, 8s, 16s, max 3 retries)',
        '  - Signature: HMAC-SHA256 with shared secret in X-AIS-Signature header',
        '  - Response: connector SHOULD return 200 within 5 seconds',
        '  - Idempotency: event_id is unique, connectors MUST deduplicate',
        '',
        'Webhook endpoints SHOULD be registered via the AIS discovery endpoint.',
      ],
    },
    {
      id: 'rate-limiting',
      title: 'Rate Limiting & Reliability',
      content: [
        'AIS-compliant connectors MUST declare rate limits in the discovery endpoint.',
        'Rate limit response: 429 with Retry-After header.',
        'AIFUT will respect rate limits and queue requests accordingly.',
        'Connectors SHOULD aim for 99.9% uptime for production use.',
      ],
    },
  ],
};

/**
 * Developer portal roadmap.
 */
export const DEV_PORTAL_ROADMAP = [
  { phase: '1', item: 'API documentation', status: 'done' },
  { phase: '1', item: 'Template packs marketplace', status: 'done' },
  { phase: '2', item: 'AIS specification v0.1', status: 'draft' },
  { phase: '2', item: 'Webhook & event documentation', status: 'draft' },
  { phase: '2', item: 'Node.js SDK', status: 'planned' },
  { phase: '2', item: 'Python SDK', status: 'planned' },
  { phase: '3', item: 'Developer sandbox environment', status: 'planned' },
  { phase: '3', item: 'Connector certification program', status: 'planned' },
  { phase: '3', item: 'API analytics dashboard', status: 'planned' },
];

/**
 * Connector certification checklist.
 */
export const CERTIFICATION_CHECKLIST = [
  { id: 'ais-discovery', name: 'Implement AIS discovery endpoint', required: true },
  { id: 'auth-oauth', name: 'OAuth 2.0 or API Key auth', required: true },
  { id: 'actions', name: 'Define all connector actions', required: true },
  { id: 'triggers', name: 'Define event triggers (if applicable)', required: false },
  { id: 'webhooks', name: 'Implement webhook receiver', required: false },
  { id: 'rate-limits', name: 'Declare rate limits', required: true },
  { id: 'error-handling', name: 'Standard error responses', required: true },
  { id: 'test-suite', name: 'Pass AIFUT connector test suite', required: true },
  { id: 'docs', name: 'Integration guide for AIFUT operators', required: true },
];
