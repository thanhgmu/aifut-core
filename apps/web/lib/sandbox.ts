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
// Types
// ---------------------------------------------------------------------------

export interface SessionStats {
  sessionId: string;
  sessionName: string;
  isActive: boolean;
  totalExecutions: number;
  successCount: number;
  failCount: number;
  successRate: number;
  totalVirtualCost: string;
  avgLatencyMs: number;
  actionBreakdown: Record<string, number>;
  createdAt: string;
}

export interface TenantSandboxSummary {
  totalSessions: number;
  activeSessions: number;
  archivedSessions: number;
  totalExecutions: number;
  successRate: number;
  totalVirtualCost: string;
  lastExecution: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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
// Sandbox — Sessions
// ---------------------------------------------------------------------------

export async function fetchSandboxSessions(
  tenantId: string,
  page: number = 1,
  pageSize: number = 20,
  search?: string,
  statusFilter?: "active" | "archived",
): Promise<PaginatedSessions | null> {
  const headers = await sandboxHeaders(tenantId);
  if (!headers) return null;

  const params = new URLSearchParams();
  params.set("page", String(clampPage(page)));
  params.set("pageSize", String(clampPageSize(pageSize)));
  if (search) params.set("search", search);
  if (statusFilter) params.set("statusFilter", statusFilter);

  try {
    const res = await fetch(
      `${API_BASE}/v1/sandbox/sessions?${params.toString()}`,
      { headers, cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as PaginatedSessions;
  } catch {
    return null;
  }
}

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

/** Pause / Resume / Archive a sandbox session. */
export async function updateSessionStatus(
  tenantId: string,
  sessionId: string,
  action: "pause" | "resume" | "archive",
): Promise<SandboxSession | null> {
  const headers = await sandboxHeaders(tenantId);
  if (!headers) return null;
  try {
    const res = await fetch(
      `${API_BASE}/v1/sandbox/sessions/${sessionId}/${action}`,
      { method: "PATCH", headers, cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as SandboxSession;
  } catch {
    return null;
  }
}

/** Fetch statistics for a single sandbox session. */
export async function fetchSessionStats(
  tenantId: string,
  sessionId: string,
): Promise<SessionStats | null> {
  const headers = await sandboxHeaders(tenantId);
  if (!headers) return null;
  try {
    const res = await fetch(
      `${API_BASE}/v1/sandbox/sessions/${sessionId}/stats`,
      { headers, cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as SessionStats;
  } catch {
    return null;
  }
}

/** Fetch tenant-level sandbox summary. */
export async function fetchTenantSummary(
  tenantId: string,
): Promise<TenantSandboxSummary | null> {
  const headers = await sandboxHeaders(tenantId);
  if (!headers) return null;
  try {
    const res = await fetch(`${API_BASE}/v1/sandbox/tenant/summary`, {
      headers,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as TenantSandboxSummary;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sandbox — Execute action
// ---------------------------------------------------------------------------

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
      body: JSON.stringify({ sessionId, action, input: input ?? null }),
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

  const VALID_DIRECTIONS = new Set(["INBOUND", "OUTBOUND"]);
  if (filter.direction && VALID_DIRECTIONS.has(filter.direction)) {
    params.set("direction", filter.direction);
  }
  if (filter.method) params.set("method", filter.method.toUpperCase());
  if (filter.status !== undefined && filter.status !== null && filter.status >= 100 && filter.status <= 599) {
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

// ---------------------------------------------------------------------------
// Param helpers
// ---------------------------------------------------------------------------

function clampPage(page: number): number {
  return Math.max(1, Math.floor(page));
}

function clampPageSize(pageSize: number): number {
  const raw = Math.floor(pageSize);
  if (Number.isNaN(raw) || raw < 1) return 20;
  return Math.min(raw, 100);
}
