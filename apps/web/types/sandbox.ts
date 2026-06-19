// ============================================================================
// types/sandbox.ts
// UI-facing TypeScript interfaces for the Developer Sandbox Console.
// Consumed by the console shell, trace table, session list, and
// webhook-inspection panels in the sandbox workspace.
// Contract: fully aligned with backend developer-sandbox service DTOs.
// BigInt-safe fields are serialised as strings to avoid JSON precision loss.
// ============================================================================

// ---------------------------------------------------------------------------
// Enums / Literal Unions
// ---------------------------------------------------------------------------

/** Categories of actions that can be traced inside a sandbox session. */
export type SandboxActionType =
  | "AI_ROUTING"
  | "CONNECTOR_EXEC"
  | "WORKFLOW_RUN";

/** Direction of a webhook log entry relative to the sandbox tenant. */
export type WebhookDirection = "INBOUND" | "OUTBOUND";

// ---------------------------------------------------------------------------
// Sandbox Session
// ---------------------------------------------------------------------------

/** A single developer sandbox session — a sandboxed, replayable workspace. */
export interface SandboxSession {
  /** UUID of the session. */
  id: string;
  /** Tenant that owns this sandbox session. */
  tenantId: string;
  /** Human-readable label (set by the developer). */
  name: string;
  /** Whether the session is currently accepting new traces. */
  isActive: boolean;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 last-update timestamp. */
  updatedAt: string;
  /** Total trace count (denormalised counter). */
  traceCount: number;
}

// ---------------------------------------------------------------------------
// Sandbox Trace
// ---------------------------------------------------------------------------

/**
 * A single trace entry within a sandbox session.
 * Every connector execution, AI routing call, or workflow run inside the
 * sandbox is recorded as a trace so the developer can inspect, mock, or
 * replay it later.
 */
export interface SandboxTrace {
  /** UUID of the trace. */
  id: string;
  /** Parent sandbox session. */
  sessionId: string;
  /** Workflow / connector node that produced this trace (nullable for top-level entries). */
  nodeId: string | null;
  /** The kind of action that was sandboxed. */
  actionType: string;
  /** Raw input payload forwarded to the downstream connector / AI / workflow. */
  inputPayload: Record<string, any>;
  /** Output returned by the downstream system (null until the trace completes). */
  outputPayload: Record<string, any> | null;
  /** Whether this trace used mocked data instead of hitting the real system. */
  isMocked: boolean;
  /** Wall-clock latency in milliseconds. */
  latencyMs: number;
  /** Whether the downstream call completed without an application error. */
  isSuccess: boolean;
  /** Human-readable error message when isSuccess === false. */
  errorMessage: string | null;
  /**
   * Virtual cost incurred by this trace, represented as a string-safe
   * BigInt value to avoid JSON serialisation precision loss.
   * Unit: nano-AIFUT credits (10^-18 of a full credit).
   */
  virtualCostBigInt: string;
}

// ---------------------------------------------------------------------------
// Webhook Inspection Log
// ---------------------------------------------------------------------------

/**
 * A logged webhook event visible in the sandbox webhook-inspector panel.
 * Covers both inbound (received by the tenant) and outbound (fired by
 * the sandbox) webhooks for debugging and replay.
 */
export interface WebhookInspectionLog {
  /** UUID of this log entry. */
  id: string;
  /** Tenant to which this webhook belongs. */
  tenantId: string;
  /** The webhook endpoint definition UUID (nullable for ad-hoc logs). */
  endpointId: string | null;
  /** HTTP method used (e.g. "POST", "GET"). */
  method: string;
  /** Request / response headers as a key-value map. */
  headers: Record<string, any>;
  /** Parsed request / response body payload. */
  payload: Record<string, any>;
  /** HTTP response status from the upstream system (null if no response received). */
  responseStatus: number | null;
  /** Raw response body text (null if no response or for non-text content-types). */
  responseBody: string | null;
  /** Total round-trip duration in milliseconds. */
  durationMs: number;
  /** Whether this webhook was inbound to the tenant or outbound from it. */
  direction: WebhookDirection;
  /** ISO-8601 creation timestamp of this log entry. */
  createdAt: string;
}

export interface ExecuteResult {
  sandbox: boolean;
  virtualCost: {
    amount: string;
    action: string;
    latencyMs: number;
  };
  trace: {
    nodeId: string | null;
    actionType: string;
    inputPayload: Record<string, any>;
    outputPayload: Record<string, any> | null;
    virtualCostBigInt: string;
    latencyMs: number;
    isSuccess: boolean;
    createdAt: string;
  };
  data: any;
}

export interface PaginatedSessions {
  data: SandboxSession[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginatedWebhookLogs {
  data: WebhookInspectionLog[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface WebhookQueryFilter {
  page: number;
  pageSize: number;
  direction?: 'INBOUND' | 'OUTBOUND';
  method?: string;
  status?: number;
}
