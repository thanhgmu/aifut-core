import { randomUUID } from 'crypto';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  SANDBOX_VERSION,
  SANDBOX_DEFAULT_ENV,
  SANDBOX_ENV_TEMPLATES,
  SANDBOX_DEFAULT_TIMEOUT_MS,
  SANDBOX_MAX_ENV_KEYS,
  SANDBOX_MAX_RUN_HISTORY,
  SANDBOX_ERRORS,
} from './sandbox.constants';

// ── Domain types ────────────────────────────────────────────────────────────

export interface SandboxInstance {
  id: string;
  tenantId: string;
  label: string;
  createdAt: string;
  expiresAt: string;
  env: Record<string, string>;
  active: boolean;
  runHistory: SandboxRunTrace[];
}

export interface SandboxRunTrace {
  runId: string;
  action: string;
  payload: any;
  result: SandboxExecutionResult;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  envSnapshot: Record<string, string>;
  logs: string[];
}

export interface SandboxExecutionResult {
  success: boolean;
  statusCode?: number;
  data?: any;
  error?: string;
  durationMs: number;
}

export interface CreateSandboxInput {
  tenantId: string;
  label?: string;
  ttlMs?: number;
  env?: Record<string, string>;
  template?: string;
}

export interface SetEnvInput {
  env: Record<string, string>;
  mode?: 'merge' | 'replace';
}

export interface ExecuteConnectorInput {
  action: string;
  payload: any;
  baseUrl?: string;
  method?: string;
  endpoint?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/** Default sandbox time-to-live (30 minutes) */
const DEFAULT_TTL_MS = 30 * 60 * 1000;

// ── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class SandboxService {
  /** In-memory sandbox store (volatile; persists only for the process lifetime) */
  private readonly sandboxes = new Map<string, SandboxInstance>();

  /**
   * Initialize a new developer sandbox.
   * Creates an isolated environment with default env, optional template, and expiry.
   */
  createSandbox(input: CreateSandboxInput): SandboxInstance {
    const id = randomUUID();
    const now = Date.now();
    const ttl = input.ttlMs ?? DEFAULT_TTL_MS;

    // Build environment: defaults + template (if provided) + custom env
    let env: Record<string, string> = { ...SANDBOX_DEFAULT_ENV };
    if (input.template && SANDBOX_ENV_TEMPLATES[input.template]) {
      env = { ...env, ...SANDBOX_ENV_TEMPLATES[input.template] };
    }
    if (input.env) {
      const merged = { ...env, ...input.env };
      if (Object.keys(merged).length > SANDBOX_MAX_ENV_KEYS) {
        throw new BadRequestException(
          `Sandbox environment exceeds maximum of ${SANDBOX_MAX_ENV_KEYS} keys`,
        );
      }
      env = merged;
    }

    const instance: SandboxInstance = {
      id,
      tenantId: input.tenantId,
      label: input.label ?? `sandbox-${id.slice(0, 8)}`,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttl).toISOString(),
      env,
      active: true,
      runHistory: [],
    };

    this.sandboxes.set(id, instance);
    return this.stripRunHistory(instance);
  }

  /**
   * Get a sandbox by ID. Throws if not found, expired, or inactive.
   */
  getSandbox(id: string, tenantId: string): SandboxInstance {
    const sb = this.sandboxes.get(id);
    if (!sb) {
      throw new NotFoundException({
        code: SANDBOX_ERRORS.NOT_FOUND,
        message: `Sandbox '${id}' not found`,
      });
    }
    if (sb.tenantId !== tenantId) {
      throw new NotFoundException({
        code: SANDBOX_ERRORS.NOT_FOUND,
        message: `Sandbox '${id}' not found for this tenant`,
      });
    }
    if (!sb.active) {
      throw new BadRequestException({
        code: SANDBOX_ERRORS.EXPIRED,
        message: `Sandbox '${id}' is inactive`,
      });
    }
    if (new Date(sb.expiresAt) < new Date()) {
      sb.active = false;
      throw new BadRequestException({
        code: SANDBOX_ERRORS.EXPIRED,
        message: `Sandbox '${id}' has expired`,
      });
    }
    return sb;
  }

  /**
   * List all active sandboxes for a tenant.
   */
  listSandboxes(tenantId: string): SandboxInstance[] {
    const result: SandboxInstance[] = [];
    for (const sb of this.sandboxes.values()) {
      if (sb.tenantId === tenantId) {
        result.push(this.stripRunHistory(sb));
      }
    }
    return result;
  }

  /**
   * Delete (deactivate) a sandbox.
   */
  deleteSandbox(id: string, tenantId: string): { deleted: boolean } {
    const sb = this.getSandbox(id, tenantId);
    sb.active = false;
    return { deleted: true };
  }

  /**
   * Set or merge environment variables into an active sandbox.
   * - mode = 'merge' (default): shallow-merge the provided keys into the existing env.
   * - mode = 'replace': replace the entire env (keeping only defaults + new env).
   */
  setSandboxEnv(id: string, tenantId: string, input: SetEnvInput): SandboxInstance {
    const sb = this.getSandbox(id, tenantId);
    const mode = input.mode ?? 'merge';

    if (mode === 'replace') {
      const newEnv = { ...SANDBOX_DEFAULT_ENV, ...input.env };
      if (Object.keys(newEnv).length > SANDBOX_MAX_ENV_KEYS) {
        throw new BadRequestException(
          `Sandbox environment exceeds maximum of ${SANDBOX_MAX_ENV_KEYS} keys`,
        );
      }
      sb.env = newEnv;
    } else {
      // merge mode
      const merged = { ...sb.env, ...input.env };
      if (Object.keys(merged).length > SANDBOX_MAX_ENV_KEYS) {
        throw new BadRequestException(
          `Sandbox environment exceeds maximum of ${SANDBOX_MAX_ENV_KEYS} keys`,
        );
      }
      sb.env = merged;
    }

    return this.stripRunHistory(sb);
  }

  /**
   * Get all environment variables for a sandbox.
   */
  getSandboxEnv(id: string, tenantId: string): Record<string, string> {
    const sb = this.getSandbox(id, tenantId);
    return { ...sb.env };
  }

  /**
   * Execute a connector action within the sandbox environment.
   * This is a **simulated** execution — no real network calls, no production side effects.
   * Records a full trace in the sandbox run history.
   */
  async executeConnector(
    id: string,
    tenantId: string,
    input: ExecuteConnectorInput,
  ): Promise<SandboxRunTrace> {
    const sb = this.getSandbox(id, tenantId);
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    const startMs = Date.now();

    // Cap run history
    if (sb.runHistory.length >= SANDBOX_MAX_RUN_HISTORY) {
      sb.runHistory.shift();
    }

    // Validate action
    if (!this.isSupportedAction(input.action)) {
      const trace: SandboxRunTrace = {
        runId,
        action: input.action,
        payload: input.payload,
        result: {
          success: false,
          statusCode: 400,
          error: `Unsupported sandbox action '${input.action}'`,
          durationMs: 0,
        },
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: 0,
        envSnapshot: { ...sb.env },
        logs: [`[SANDBOX] Unsupported action: ${input.action}`],
      };
      sb.runHistory.push(trace);
      return trace;
    }

    // Simulate execution delay (50–200ms jitter for realism)
    const simulatedDelay = 50 + Math.floor(Math.random() * 150);
    await new Promise((resolve) => setTimeout(resolve, simulatedDelay));

    const logs: string[] = [];
    const method = (input.method ?? 'POST').toUpperCase();
    const endpoint = input.endpoint ?? '';
    const timeout = input.timeoutMs ?? SANDBOX_DEFAULT_TIMEOUT_MS;

    logs.push(`[SANDBOX] Action: ${input.action}`);
    logs.push(`[SANDBOX] Method: ${method}`);
    logs.push(`[SANDBOX] Endpoint: ${endpoint || '(none)'}`);
    logs.push(`[SANDBOX] Timeout: ${timeout}ms`);
    logs.push(`[SANDBOX] Base URL: ${input.baseUrl || '(not set)'}`);
    logs.push(`[SANDBOX] Payload keys: ${Object.keys(input.payload ?? {}).length}`);
    logs.push(`[SANDBOX] Headers: ${JSON.stringify(input.headers ?? {})}`);

    // Build simulated result based on action type
    let result: SandboxExecutionResult;

    switch (input.action) {
      case 'ais.discovery': {
        logs.push('[SANDBOX] Returning AIS discovery endpoint mock');
        result = {
          success: true,
          statusCode: 200,
          data: {
            ais_version: '0.1.0',
            connector_name: input.headers?.['X-Connector-Name'] ?? 'sandbox-connector',
            connector_version: '1.0.0-sandbox',
            capabilities: ['read', 'write', 'webhook', 'batch', 'search'],
            actions: [
              { key: 'create_record', name: 'Create Record', idempotent: false },
              { key: 'get_record', name: 'Get Record', idempotent: true },
              { key: 'list_records', name: 'List Records', idempotent: true },
              { key: 'update_record', name: 'Update Record', idempotent: true },
              { key: 'delete_record', name: 'Delete Record', idempotent: false },
            ],
            triggers: [
              { key: 'record.created', delivery: 'webhook', name: 'Record Created' },
              { key: 'record.updated', delivery: 'webhook', name: 'Record Updated' },
            ],
            auth_methods: ['api_key'],
          },
          durationMs: Date.now() - startMs,
        };
        break;
      }

      case 'ais.action.invoke': {
        logs.push(`[SANDBOX] Simulating action invocation: ${input.payload?.action_key ?? '(not specified)'}`);

        // Attempt a real HTTP call only if a baseUrl is explicitly provided
        if (input.baseUrl) {
          logs.push(`[SANDBOX] Real endpoint configured at ${input.baseUrl} — performing simulated check only`);
          result = {
            success: true,
            statusCode: 200,
            data: {
              sandbox_status: 'simulated',
              provided_base_url: input.baseUrl,
              action_key: input.payload?.action_key,
              action_response: {
                simulated: true,
                message: 'Action would execute against the provided base URL in production.',
                received_payload: input.payload,
              },
            },
            durationMs: Date.now() - startMs,
          };
        } else {
          // Fully mocked
          result = {
            success: true,
            statusCode: 200,
            data: {
              sandbox_status: 'simulated',
              action_key: input.payload?.action_key ?? 'unknown',
              action_response: {
                simulated: true,
                records_affected: 0,
                message: 'Connector executed successfully in sandbox mode.',
              },
            },
            durationMs: Date.now() - startMs,
          };
        }
        break;
      }

      case 'ais.trigger.poll': {
        logs.push('[SANDBOX] Simulating trigger polling (empty result set)');
        result = {
          success: true,
          statusCode: 200,
          data: {
            events: [],
            poll_interval_ms: 5000,
          },
          durationMs: Date.now() - startMs,
        };
        break;
      }

      case 'ais.health.check': {
        logs.push('[SANDBOX] Running health check');
        result = {
          success: true,
          statusCode: 200,
          data: {
            status: 'healthy',
            uptime_ms: process.uptime() * 1000,
            version: SANDBOX_VERSION,
            env_vars_count: Object.keys(sb.env).length,
          },
          durationMs: Date.now() - startMs,
        };
        break;
      }

      default: {
        logs.push(`[SANDBOX] Fallthrough — no handler for action '${input.action}'`);
        result = {
          success: true,
          statusCode: 200,
          data: {
            sandbox_status: 'simulated',
            action: input.action,
            message: 'Unrecognized action executed in pass-through sandbox mode.',
          },
          durationMs: Date.now() - startMs,
        };
      }
    }

    const completedAt = new Date().toISOString();
    const trace: SandboxRunTrace = {
      runId,
      action: input.action,
      payload: input.payload,
      result,
      startedAt,
      completedAt,
      durationMs: Date.now() - startMs,
      envSnapshot: { ...sb.env },
      logs,
    };

    sb.runHistory.push(trace);
    return trace;
  }

  /**
   * Retrieve a specific run trace by run ID.
   */
  getRunTrace(sandboxId: string, tenantId: string, runId: string): SandboxRunTrace {
    const sb = this.getSandbox(sandboxId, tenantId);
    const trace = sb.runHistory.find((r) => r.runId === runId);
    if (!trace) {
      throw new NotFoundException({
        code: SANDBOX_ERRORS.NOT_FOUND,
        message: `Run trace '${runId}' not found in sandbox '${sandboxId}'`,
      });
    }
    return trace;
  }

  /**
   * List all run traces for a sandbox (newest first).
   */
  listRunTraces(sandboxId: string, tenantId: string): SandboxRunTrace[] {
    const sb = this.getSandbox(sandboxId, tenantId);
    return [...sb.runHistory].reverse();
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private isSupportedAction(action: string): boolean {
    return true; // Allow any action string; unknown ones get pass-through
  }

  /** Return a sandbox without the full run history for list/get responses */
  private stripRunHistory(instance: SandboxInstance): SandboxInstance {
    return {
      ...instance,
      runHistory: [], // consumers use dedicated run trace endpoints
    };
  }
}
