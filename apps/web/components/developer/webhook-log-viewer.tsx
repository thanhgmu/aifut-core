// ============================================================================
// components/developer/webhook-log-viewer.tsx
// Webhook Inspector — Real-time log viewer with a 2-column Master-Detail
// layout.  Left column: filtered, paginated log feed (HTTP method, path,
// status, latency, direction colour).  Right column: selected-log detail
// panel with tree-ified headers and payload.
//
// Client component.  Polls fetchWebhookLogs() at a configurable interval.
// Uses shared helpers from lib/sandbox.ts and lib/sandbox-format.ts.
// ============================================================================
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WebhookDirection, WebhookInspectionLog } from "../../types/sandbox";
import { fetchWebhookLogs } from "../../lib/sandbox";
import { formatLatency, statusCodeColor } from "../../lib/sandbox-format";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape we expect from the backend paginated response. */
interface PaginatedWebhookData {
  data: WebhookInspectionLog[];
  total: number;
  page: number;
  pageSize: number;
}

export interface WebhookLogViewerProps {
  /** Resolved tenant UUID (passed from parent to avoid per-component auth). */
  tenantId: string | null;
  /** Polling interval in ms (default 5 000). */
  pollIntervalMs?: number;
}

// ---------------------------------------------------------------------------
// Filter state
// ---------------------------------------------------------------------------

interface ActiveFilter {
  direction: WebhookDirection | "";
  method: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Status badge colour
// ---------------------------------------------------------------------------

const STATUS_BG: Record<string, string> = {
  green: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  gray: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  amber:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  red: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const DIRECTION_COLOUR: Record<WebhookDirection, string> = {
  INBOUND:
    "border-l-blue-500 bg-blue-50 dark:bg-blue-950/20 dark:border-l-blue-600",
  OUTBOUND:
    "border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 dark:border-l-emerald-600",
};

const DIRECTION_BADGE: Record<WebhookDirection, string> = {
  INBOUND:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  OUTBOUND:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncatePath(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "/";
  const body = payload as Record<string, unknown>;
  return typeof body.path === "string"
    ? body.path
    : typeof body.url === "string"
      ? body.url
      : "/";
}

function methodBadgeColour(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300";
    case "POST":
      return "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300";
    case "PUT":
    case "PATCH":
      return "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300";
    case "DELETE":
      return "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300";
    default:
      return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  }
}

/** Stable list of methods shown in the dropdown. */
const METHOD_OPTIONS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

// ---------------------------------------------------------------------------
// Simple JSON tree renderer (no external dep)
// ---------------------------------------------------------------------------

function JsonTree({ data }: { data: unknown }) {
  if (data === null || data === undefined) {
    return <span className="italic text-gray-400">null</span>;
  }
  if (typeof data === "string") {
    return (
      <span className="break-all text-green-700 dark:text-green-400">
        &quot;{data}&quot;
      </span>
    );
  }
  if (typeof data === "number" || typeof data === "boolean") {
    return (
      <span className="text-amber-700 dark:text-amber-400">
        {String(data)}
      </span>
    );
  }
  if (Array.isArray(data)) {
    return (
      <CollapsibleBlock bracket="[]" count={data.length}>
        <ul className="space-y-0.5">
          {data.map((item, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="shrink-0 text-gray-400">{i}:</span>
              <JsonTree data={item} />
            </li>
          ))}
        </ul>
      </CollapsibleBlock>
    );
  }
  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);
    return (
      <CollapsibleBlock bracket="{ }" count={entries.length}>
        <ul className="space-y-0.5">
          {entries.map(([key, val]) => (
            <li key={key} className="flex gap-1.5">
              <span className="shrink-0 text-indigo-600 dark:text-indigo-400">
                {key}:
              </span>
              <JsonTree data={val} />
            </li>
          ))}
        </ul>
      </CollapsibleBlock>
    );
  }
  return <span className="italic text-gray-400">{String(data)}</span>;
}

function CollapsibleBlock({
  bracket,
  count,
  children,
}: {
  bracket: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
      >
        <span className="w-3 text-center">{open ? "▼" : "▶"}</span>
        {bracket}
        <span className="text-gray-400 dark:text-gray-500">
          {" "}
          {count} item{count !== 1 ? "s" : ""}
        </span>
      </button>
      {open && <div className="ml-3 border-l border-gray-200 pl-2.5 dark:border-gray-700">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

function DetailPanel({ log }: { log: WebhookInspectionLog }) {
  return (
    <div className="flex h-full flex-col">
      {/* ——— Metadata bar ——— */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-2 dark:border-gray-700">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${DIRECTION_BADGE[log.direction]}`}
        >
          {log.direction === "INBOUND" ? "← Inbound" : "→ Outbound"}
        </span>
        <span
          className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold ${methodBadgeColour(log.method)}`}
        >
          {log.method}
        </span>
        {log.responseStatus !== null && (
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold ${STATUS_BG[statusCodeColor(log.responseStatus)]}`}
          >
            {log.responseStatus}
          </span>
        )}
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {formatLatency(log.durationMs)}
        </span>
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
          {new Date(log.createdAt).toLocaleString()}
        </span>
      </div>

      {/* ——— Endpoint ID ——— */}
      {log.endpointId && (
        <div className="border-b border-gray-100 px-4 py-1.5 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
          Endpoint: <code className="ml-1 rounded bg-gray-100 px-1 py-0.5 font-mono text-xs dark:bg-gray-800">{log.endpointId}</code>
        </div>
      )}

      {/* ——— Scrollable tab sections ——— */}
      <div className="flex-1 overflow-y-auto">
        {/* Headers */}
        <Section title="Headers">
          <JsonTree data={log.headers} />
        </Section>

        {/* Request / Payload */}
        <Section title="Payload" defaultOpen={true}>
          <JsonTree data={log.payload} />
        </Section>

        {/* Response body (raw text) */}
        {log.responseBody !== null && (
          <Section title="Raw Response">
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded border border-gray-200 bg-gray-50 p-3 font-mono text-xs dark:border-gray-700 dark:bg-gray-900/50">
              {log.responseBody}
            </pre>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-100 last:border-0 dark:border-gray-800">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-900/40"
      >
        <span className="text-[10px]">{open ? "▼" : "▶"}</span>
        {title}
      </button>
      {open && <div className="px-4 pb-3 pt-1">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty / Error states
// ---------------------------------------------------------------------------

function EmptyState({
  hasFilter,
  onClear,
}: {
  hasFilter: boolean;
  onClear: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-gray-400 dark:text-gray-500">
      <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
      <p>
        {hasFilter
          ? "No webhook logs match the current filters."
          : "No webhook logs yet."}
      </p>
      {hasFilter && (
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-blue-600 underline hover:text-blue-800 dark:text-blue-400"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm">
      <svg className="h-10 w-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="text-red-600 dark:text-red-400">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-xs text-blue-600 underline hover:text-blue-800 dark:text-blue-400"
      >
        Retry
      </button>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export default function WebhookLogViewer({
  tenantId,
  pollIntervalMs = 5_000,
}: WebhookLogViewerProps) {
  // ---- state ---------------------------------------------------------------
  const [logs, setLogs] = useState<WebhookInspectionLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ActiveFilter>({
    direction: "",
    method: "",
    status: "",
  });
  const [searchText, setSearchText] = useState("");

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // ---- derived -------------------------------------------------------------
  const selectedLog =
    logs.find((l) => l.id === selectedId) ?? null;
  const hasActiveFilter =
    filter.direction !== "" || filter.method !== "" || filter.status !== "";

  // ---- fetch ---------------------------------------------------------------
  const load = useCallback(
    async (p: number) => {
      if (!tenantId) {
        setError("Authentication required — tenant context unavailable.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);

      try {
        const result = await fetchWebhookLogs(tenantId, {
          page: p,
          pageSize: 50,
          direction: filter.direction || undefined,
          method: filter.method || undefined,
          status: filter.status ? Number(filter.status) : undefined,
        });

        if (!result) {
          setError("Failed to load webhook logs — request returned empty.");
          setLogs([]);
          setTotal(0);
          return;
        }

        const data = (result as unknown as PaginatedWebhookData).data ?? [];
        setLogs(data);
        setTotal(
          (result as unknown as PaginatedWebhookData).total ?? data.length,
        );

        // Reset selection if the selected log disappeared from the current page
        if (selectedId && !data.some((l) => l.id === selectedId)) {
      setSelectedId(data.length > 0 ? (data[0]?.id || null) : null);
        } else if (data.length > 0 && !selectedId) {
      setSelectedId(data[0]?.id || null);
        }
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "An unexpected error occurred.",
        );
        setLogs([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [tenantId, filter, selectedId],
  );

  // ---- initial load + poll -------------------------------------------------
  useEffect(() => {
    load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filter]);

  useEffect(() => {
    if (!tenantId) return;
    pollRef.current = setInterval(() => load(page), pollIntervalMs);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, pollIntervalMs, page, filter]);

  // ---- filter helpers ------------------------------------------------------
  const updateFilter = (patch: Partial<ActiveFilter>) => {
    setFilter((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilter({ direction: "", method: "", status: "" });
    setSearchText("");
    setPage(1);
  };

  // ---- search / filter applied client-side for searchText ------------------
  const displayedLogs = searchText.trim()
    ? logs.filter((l) => {
        const q = searchText.toLowerCase();
        return (
          l.method.toLowerCase().includes(q) ||
          l.direction.toLowerCase().includes(q) ||
          String(l.responseStatus ?? "").includes(q) ||
          l.id.toLowerCase().includes(q) ||
          truncatePath(l.payload).toLowerCase().includes(q)
        );
      })
    : logs;

  // ---- pagination ----------------------------------------------------------
  const totalPages = Math.max(1, Math.ceil(total / 50));

  // ---- render --------------------------------------------------------------
  return (
    <div className="flex h-full flex-col rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
      {/* ============ Toolbar ============ */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        {/* Direction filter */}
        <select
          value={filter.direction}
          onChange={(e) =>
            updateFilter({ direction: e.target.value as WebhookDirection | "" })
          }
          className="h-8 rounded border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          aria-label="Filter by direction"
        >
          <option value="">All directions</option>
          <option value="INBOUND">Inbound</option>
          <option value="OUTBOUND">Outbound</option>
        </select>

        {/* Method filter */}
        <select
          value={filter.method}
          onChange={(e) => updateFilter({ method: e.target.value })}
          className="h-8 rounded border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          aria-label="Filter by HTTP method"
        >
          <option value="">All methods</option>
          {METHOD_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={filter.status}
          onChange={(e) => updateFilter({ status: e.target.value })}
          className="h-8 rounded border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          aria-label="Filter by status code range"
        >
          <option value="">All status</option>
          <option value="2">2xx Success</option>
          <option value="3">3xx Redirect</option>
          <option value="4">4xx Client Error</option>
          <option value="5">5xx Server Error</option>
        </select>

        {/* Client-side search */}
        <div className="relative flex-1 min-w-[160px]">
          <svg
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search logs…"
            className="h-8 w-full rounded border border-gray-300 bg-white pl-7 pr-2 text-xs placeholder:text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:placeholder:text-gray-500"
          />
        </div>

        {/* Polling indicator */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
          <span
            className={`inline-block h-2 w-2 rounded-full ${loading ? "animate-pulse bg-blue-500" : "bg-green-500"}`}
          />
          {loading ? "Polling…" : `${total} log${total !== 1 ? "s" : ""}`}
        </div>

        {/* Manual refresh */}
        <button
          type="button"
          onClick={() => load(page)}
          disabled={loading}
          className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-300 bg-white text-gray-500 hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
          title="Refresh now"
          aria-label="Refresh webhook logs"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 9a9 9 0 0116.46-3M20 15a9 9 0 01-16.46 3" />
          </svg>
        </button>
      </div>

      {/* ============ 2-column body ============ */}
      <div className="flex flex-1 overflow-hidden">
        {/* ---- Column: Master (log list) ---- */}
        <div className="flex w-1/2 flex-col border-r border-gray-200 dark:border-gray-700">
          {error ? (
            <ErrorState message={error} onRetry={() => load(page)} />
          ) : displayedLogs.length === 0 && !loading ? (
            <EmptyState hasFilter={hasActiveFilter || searchText !== ""} onClear={clearFilters} />
          ) : (
            <>
              {/* Scrollable log list */}
              <div ref={listRef} className="flex-1 overflow-y-auto">
                {displayedLogs.map((log) => {
                  const isSelected = log.id === selectedId;
                  const dirClass = DIRECTION_COLOUR[log.direction];
                  const sc = statusCodeColor(log.responseStatus);
                  return (
                    <button
                      key={log.id}
                      type="button"
                      onClick={() => setSelectedId(log.id)}
                      className={`w-full border-l-4 text-left transition-colors ${
                        isSelected
                          ? `${dirClass} bg-opacity-70 ring-1 ring-inset ring-blue-200 dark:ring-blue-800`
                          : `${dirClass} hover:bg-opacity-80`
                      }`}
                    >
                      <div className="flex items-center gap-2 px-3 py-2">
                        {/* Method badge */}
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold leading-tight ${methodBadgeColour(log.method)}`}
                        >
                          {log.method}
                        </span>

                        {/* Path (extracted from payload) */}
                        <span className="flex-1 truncate font-mono text-xs text-gray-700 dark:text-gray-300">
                          {truncatePath(log.payload)}
                        </span>

                        {/* Status + latency group */}
                        <div className="flex shrink-0 items-center gap-1.5">
                          {log.responseStatus !== null && (
                            <span
                              className={`inline-flex items-center rounded px-1 py-0.5 text-[11px] font-bold leading-none ${STATUS_BG[sc]}`}
                            >
                              {log.responseStatus}
                            </span>
                          )}
                          <span className="text-[11px] text-gray-400 dark:text-gray-500">
                            {formatLatency(log.durationMs)}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Pagination bar */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-200 px-3 py-1.5 dark:border-gray-700">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-800"
                  >
                    ← Prev
                  </button>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-800"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ---- Column: Detail (selected log) ---- */}
        <div className="flex w-1/2 flex-col">
          {selectedLog ? (
            <DetailPanel log={selectedLog} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-400 dark:text-gray-500">
              {loading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
                  <span>Loading logs…</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
                  </svg>
                  <p>Select a log entry to inspect</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
