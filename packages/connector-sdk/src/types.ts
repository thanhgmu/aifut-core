/**
 * AIS (AIFUT Integration Standard) type definitions.
 */

/** Authentication methods supported by AIS */
export type AuthMethod = 'oauth2' | 'api_key' | 'basic';

/** Connector capability flags */
export interface ConnectorCapabilities {
  read: boolean;
  write: boolean;
  webhook: boolean;
  batch: boolean;
  search: boolean;
}

/** JSON Schema definition for action input/output */
export interface JsonSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  description?: string;
  enum?: string[];
  default?: any;
}

/** Action definition — what operations the connector can perform */
export interface ActionDefinition {
  key: string;
  name: string;
  description: string;
  input: JsonSchema;
  output: JsonSchema;
  idempotent: boolean;
  timeoutMs: number;
}

/** Trigger definition — what events the connector can emit */
export interface TriggerDefinition {
  key: string;
  name: string;
  description: string;
  eventSchema: JsonSchema;
  delivery: 'webhook' | 'polling';
}

/** AIS discovery endpoint response */
export interface AisDiscoveryResponse {
  aisVersion: string;
  connectorName: string;
  connectorVersion: string;
  capabilities: ConnectorCapabilities;
  actions: ActionDefinition[];
  triggers: TriggerDefinition[];
  authMethods: AuthMethod[];
  rateLimits?: {
    requestsPerSecond: number;
    burstLimit: number;
  };
}

/** Webhook event envelope */
export interface WebhookEvent {
  eventId: string;      // uuid, used for dedup
  eventType: string;    // e.g. "order.created"
  occurredAt: string;   // ISO-8601
  data: Record<string, any>;
}

/** Action invocation request */
export interface ActionRequest {
  actionKey: string;
  input: Record<string, any>;
  context?: {
    tenantId?: string;
    requestId?: string;
    retryCount?: number;
  };
}

/** Action invocation response */
export interface ActionResponse {
  success: boolean;
  data?: Record<string, any>;
  error?: string;
  meta?: {
    durationMs: number;
    retryable: boolean;
  };
}
