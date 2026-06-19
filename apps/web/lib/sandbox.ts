// ============================================================================
// lib/sandbox.ts
// API fetch helpers for Developer Sandbox Console + Webhook Inspector.
// Own header injector (x-tenant-id, x-aifut-sandbox) — separate contract
// from analytics.ts which uses x-tenant-slug.  All functions return null
// on auth/tenant failure so callers can render empty/login state gracefully.
// ============================================================================

import { API_BASE, getStoredToken } from "./auth";
import type {
  ExecuteResult,
  PaginatedSessions,
  PaginatedWebhookLogs,
  SandboxSession,
  WebhookQueryFilter,
} from "../types/sandbox";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the current user's tenant UUID (NOT slug) from the auth token.
 * This is intentionally separate from `resolveTenantSlug` in billing.ts
 * because the sandbox / webhook-inspector backend enforces IDOR protection
 * via `x-tenant-id` (UUID), while the analytics module uses `x-tenant-slug`.
 * Returns `null` when unauthenticated or the tenant cannot be resolved.
 */
export async function resolveTenantId(): Promise<string | null> {
  const token = getStoredToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const me = await res.json();
    return me?.tenant?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Build the standard header set for every sandbox / webhook-inspector
 * request.  Automatically injects:
 *   - `x-tenant-id` (UUID — IDOR guard, matches backend @TenantGuard)
 *   - `x-aifut-sandbox` (flag signals sandbox execution environment)
 *   - `Authorization` (Bearer token)
 *   - `Content-Type` (application/json)
 *
 * Returns `null` when authentication or tenant context is unavailable.
 */
async function sandboxHeaders(
  tenantId: string | null,
  extra?: Record<string, string>,
): Promise<HeadersInit | null> {
  const token = getStoredToken();
  if (!token || !tenantId) return null;
  return {
    "x-tenant-id": tenantId,
    "x-aifut-sandbox": "true",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Parameter validation (client-side clamp, mirrors backend enforcement)
// ---------------------------------------------------------------------------

function clampPage(page: number): number {
  return Math.max(1, Math.floor(page));
}

function clampPageSize(pageSize: number): number {
  const raw = Math.floor(pageSize);
  if (Number.isNaN(raw) || raw < 1) return 20;
  return Math.min(raw, 100);
}

const VALID_DIRECTIONS = new Set(["INBOUND", "OUTBOUND"]);

// ---------------------------------------------------------------------------
// Sandbox — Sessions
// ---------------------------------------------------------------------------

/**
 * Fetch a paginated list of sandbox sessions for the given tenant.
 * Page and pageSize are clamped client-side (1…100) before the round-trip
 * to avoid unnecessary 400 responses from the backend.
 *
 * Returns `null` when auth/tenant is missing or the request fails.
 */
export async function fetchSandboxSessions(
  tenantId: string,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedSessions | null> {
  const headers = await sandboxHeaders(tenantId);
  if (!headers) return null;

  const safePage = clampPage(page);
  const safeSize = clampPageSize(pageSize);

  try {
    const res = await fetch(
      `${API_BASE}/v1/sandbox/sessions?page=${safePage}&pageSize=${safeSize}`,
      { headers, cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as PaginatedSessions;
  } catch {
    return null;
  }
}

/**
 * Create a new sandbox session with the given human-readable name.
 * The backend enforces name length 1…256; we mirror the constraint
 * client-side to fail fast and avoid wasted round-trips.
 *
 * Returns `null` on auth/tenant failure, network error, or validation
 * rejection.
 */
export async function createSandboxSession(
  tenantId: string,
  name: string,
): Promise<SandboxSession | null> {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 256) return null;

  const headers = await sandboxHeaders(tenantId);
  if (!headers) return null;

  try {
    const res = await fetch(`${API_BASE}/v1/sandbox/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: trimmed }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as SandboxSession;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sandbox — Execute action
// ---------------------------------------------------------------------------

/**
 * Execute a sandboxed action inside an existing session.
 * The execution is isolated and recorded as a trace entry with latency,
 * outcome, and virtual cost (BigInt-safe).
 *
 * @param tenantId  - Tenant UUID (auto-injected into x-tenant-id).
 * @param sessionId - Target sandbox session UUID.
 * @param action    - Action type label (e.g. "AI_ROUTING", "CONNECTOR_EXEC",
 *                    "WORKFLOW_RUN").  Passed as-is to the backend.
 * @param input     - Arbitrary JSON-serialisable payload forwarded to the
 *                    downstream connector / AI / workflow node.
 *
 * Returns `null` when auth/tenant is missing or the request fails.
 */
export async function executeSandboxAction(
  tenantId: string,
  sessionId: string,
  action: string,
  input?: unknown,
): Promise<ExecuteResult | null> {
  const headers = await sandboxHeaders(tenantId);
  if (!headers) return null;

  try {
    const res = await fetch(`${API_BASE}/v1/sandbox/execute`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        sessionId,
        action,
        input: input ?? null,
      }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ExecuteResult;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Webhook Inspector — Logs
// ---------------------------------------------------------------------------

/**
 * Fetch paginated webhook-inspector logs with optional filters.
 * Supported filter keys:
 *   - direction: "INBOUND" | "OUTBOUND"
 *   - method: HTTP method string (e.g. "POST", "GET")
 *   - status: HTTP status code (100–599)
 *
 * Invalid enum values / out-of-range status codes are silently dropped
 * before serialization to mirror the backend's own validation.
 *
 * Returns `null` when auth/tenant is missing or the request fails.
 */
export async function fetchWebhookLogs(
  tenantId: string,
  filter: WebhookQueryFilter,
): Promise<PaginatedWebhookLogs | null> {
  const headers = await sandboxHeaders(tenantId);
  if (!headers) return null;

  const params = new URLSearchParams();
  const safePage = clampPage(filter.page ?? 1);
  const safeSize = clampPageSize(filter.pageSize ?? 20);
  params.set("page", String(safePage));
  params.set("pageSize", String(safeSize));

  if (filter.direction && VALID_DIRECTIONS.has(filter.direction)) {
    params.set("direction", filter.direction);
  }
  if (filter.method) {
    params.set("method", filter.method.toUpperCase());
  }
  if (
    filter.status !== undefined &&
    filter.status !== null &&
    filter.status >= 100 &&
    filter.status <= 599
  ) {
    params.set("status", String(filter.status));
  }

  try {
    const res = await fetch(
      `${API_BASE}/v1/developer/webhook-logs?${params.toString()}`,
      { headers, cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as PaginatedWebhookLogs;
  } catch {
    return null;
  }
}
