import { ActionDefinition, TriggerDefinition, AisDiscoveryResponse, AuthMethod, ConnectorCapabilities, ActionRequest, ActionResponse } from './types';

/**
 * AIS-compliant connector builder.
 */
export class AisConnector {
  private readonly name: string;
  private readonly version: string;
  private readonly actions: Map<string, ActionDefinition & { handler: Function }>;
  private readonly triggers: Map<string, TriggerDefinition>;
  private readonly authMethods: AuthMethod[];
  private readonly capabilities: ConnectorCapabilities;

  constructor(config: {
    name: string;
    version: string;
    actions?: (ActionDefinition & { handler: (input: any, ctx?: any) => Promise<any> })[];
    triggers?: TriggerDefinition[];
    authMethods?: AuthMethod[];
    capabilities?: Partial<ConnectorCapabilities>;
  }) {
    this.name = config.name;
    this.version = config.version;
    this.actions = new Map((config.actions || []).map((a) => [a.key, a]));
    this.triggers = new Map((config.triggers || []).map((t) => [t.key, t]));
    this.authMethods = config.authMethods || ['api_key'];
    this.capabilities = {
      read: true,
      write: true,
      webhook: false,
      batch: false,
      search: false,
      ...config.capabilities,
    };
  }

  /**
   * Get the AIS discovery response.
   * This is served at GET /.well-known/ais
   */
  getDiscovery(): AisDiscoveryResponse {
    return {
      aisVersion: '0.1',
      connectorName: this.name,
      connectorVersion: this.version,
      capabilities: this.capabilities,
      actions: Array.from(this.actions.values()).map(({ handler, ...action }) => action),
      triggers: Array.from(this.triggers.values()),
      authMethods: this.authMethods,
    };
  }

  /**
   * Execute a connector action by key.
   * This is served at POST /ais/actions/:key
   */
  async executeAction(req: ActionRequest): Promise<ActionResponse> {
    const start = Date.now();
    const action = this.actions.get(req.actionKey);

    if (!action) {
      return {
        success: false,
        error: `Unknown action: ${req.actionKey}`,
        meta: { durationMs: Date.now() - start, retryable: false },
      };
    }

    try {
      const data = await action.handler(req.input, req.context);
      return {
        success: true,
        data,
        meta: { durationMs: Date.now() - start, retryable: action.idempotent },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        meta: { durationMs: Date.now() - start, retryable: action.idempotent },
      };
    }
  }

  /**
   * Get all action keys for validation purposes.
   */
  getActionKeys(): string[] {
    return Array.from(this.actions.keys());
  }

  /**
   * Validate input against an action's schema.
   */
  validateActionInput(actionKey: string, input: any): { valid: boolean; errors: string[] } {
    const action = this.actions.get(actionKey);
    if (!action) return { valid: false, errors: [`Unknown action: ${actionKey}`] };

    const errors: string[] = [];
    const schema = action.input;

    if (schema.required) {
      for (const field of schema.required) {
        if (input[field] === undefined || input[field] === null) {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
