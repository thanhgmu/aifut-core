"use client";

// ============================================================================
// sandbox-trace-viewer.tsx
// Client component that displays a live, filterable trace log for a single
// Developer Sandbox session.  Every connector execution, AI-routing decision,
// or workflow run is recorded as a SandboxTrace — this viewer lets developers
// inspect latency, virtual cost, status, and the full input/output payload.
// ----------------------------------------------------------------------------
// Requirements implemented:
//  1. Client Component receiving `sessionId: string`.
//  2. List-layout displaying: Action Type (via actionTypeLabel), Latency
//     (via formatLatency), Status (success/error with colour), Virtual Cost
//     (via formatSimulatedCredits).
//  3. Click-to-expand JSON Tree (dark-styled pre/code) for inputPayload
//     and outputPayload, enabling real-time debugging.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE, getStoredToken } from "../../lib/auth";
import { resolveTenantId } from "../../lib/sandbox";
import {
  actionTypeLabel,
  formatLatency,
  formatSimulatedCredits,
} from "../../lib/sandbox-format";
import type { SandboxTrace } from "../../types/sandbox";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PaginatedTraces {
  data: SandboxTrace[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

// ---------------------------------------------------------------------------
// Fetch helper (mirrors sandbox.ts contract but for traces endpoint)
// ---------------------------------------------------------------------------

async function fetchSandboxTraces(
  tenantId: string,
  sessionId: string,
  page: number = 1,
  pageSize: number = 50,
): Promise<PaginatedTraces | null> {
  const token = getStoredToken();
  if (!token) return null;

  const safePage = Math.max(1, Math.floor(page));
  const safeSize = Math.max(1, Math.min(100, Math.floor(pageSize)));

  try {
    const res = await fetch(
      `${API_BASE}/v1/sandbox/sessions/${sessionId}/traces?page=${safePage}&pageSize=${safeSize}`,
      {
        headers: {
          "x-tenant-id": tenantId,
          "x-aifut-sandbox": "true",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as PaginatedTraces;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Dot indicator: green for success, red for error. */
function StatusDot({ success }: { success: boolean }) {
  return (
    <span
      className={
        "inline-block w-2 h-2 rounded-full shrink-0 " +
        (success ? "bg-emerald-500" : "bg-red-500")
      }
      title={success ? "Success" : "Error"}
      aria-label={success ? "Success" : "Error"}
    />
  );
}

/** Badge showing the human-readable action type. */
function ActionBadge({ action }: { action: string }) {
  const label = actionTypeLabel(action);
  return (
    <span
      className={
        "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium " +
        "rounded-md border border-zinc-700 bg-zinc-800/60 text-zinc-200 " +
        "whitespace-nowrap"
      }
    >
      {label}
    </span>
  );
}

/** Gentle loading skeleton mimicking a trace card row. */
function TraceSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg bg-zinc-800/40 px-4 py-3"
        >
          <div className="w-2 h-2 rounded-full bg-zinc-700" />
          <div className="h-3 w-24 rounded bg-zinc-700" />
          <div className="h-3 w-14 rounded bg-zinc-700" />
          <div className="ml-auto h-3 w-20 rounded bg-zinc-700" />
        </div>
      ))}
    </div>
  );
}

/** Empty state shown when the session has no traces yet. */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <svg
        className="w-12 h-12 text-zinc-600 mb-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.958H19.3a2.25 2.25 0 002.227-1.958l.857-6A2.25 2.25 0 0020.5 9.776m-16.5 0V6.75a2.25 2.25 0 012.25-2.25h12a2.25 2.25 0 012.25 2.25v3.026"
        />
      </svg>
      <p className="text-zinc-400 text-sm font-medium">No Traces Yet</p>
      <p className="text-zinc-600 text-xs mt-1 max-w-xs">
        Execute a connector, AI routing, or workflow action inside this
        sandbox session to generate traces.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface SandboxTraceViewerProps {
  /** UUID of the sandbox session whose traces should be displayed. */
  sessionId: string;
  /** Optional initial page size (default 50, clamped 1–100). */
  initialPageSize?: number;
  /** Optional CSS class override for the root wrapper. */
  className?: string;
}

/**
 * SandboxTraceViewer
 *
 * Renders a dark-themed, expandable trace log for the given sandbox session.
 * Every trace row shows action type, latency, status, and virtual cost.
 * Clicking a row expands the full input/output JSON payload for debugging.
 *
 * @example
 * ```tsx
 * <SandboxTraceViewer sessionId="uuid-of-session" />
 * ```
 */
export default function SandboxTraceViewer({
  sessionId,
  initialPageSize = 50,
  className = "",
}: SandboxTraceViewerProps) {
  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------

  const [traces, setTraces] = useState<SandboxTrace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const mountedRef = useRef(true);
  const loadingRef = useRef(false);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const loadTraces = useCallback(
    async (targetPage: number) => {
      if (loadingRef.current) return;
      loadingRef.current = true;

      try {
        setLoading(true);
        setError(null);

        const tenantId = await resolveTenantId();
        if (!tenantId) {
          setError(
            "Unable to resolve tenant identity. Are you logged in?",
          );
          return;
        }

        const result = await fetchSandboxTraces(
          tenantId,
          sessionId,
          targetPage,
          initialPageSize,
        );
        if (!result) {
          setError("Failed to load sandbox traces. The session may have expired.");
          return;
        }

        if (mountedRef.current) {
          setTraces(result.data);
          setPage(result.meta.page);
          setTotalPages(result.meta.totalPages);
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(
            err instanceof Error ? err.message : "Unexpected error loading traces.",
          );
        }
      } finally {
        loadingRef.current = false;
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [sessionId, initialPageSize],
  );

  useEffect(() => {
    mountedRef.current = true;
    loadTraces(1);
    return () => {
      mountedRef.current = false;
    };
  }, [loadTraces]);

  // -----------------------------------------------------------------------
  // Toggle expand
  // -----------------------------------------------------------------------

  const toggleExpand = useCallback((traceId: string) => {
    setExpandedId((prev) => (prev === traceId ? null : traceId));
  }, []);

  // -----------------------------------------------------------------------
  // Pagination handlers
  // -----------------------------------------------------------------------

  const goPrev = useCallback(() => {
    if (page > 1) loadTraces(page - 1);
  }, [page, loadTraces]);

  const goNext = useCallback(() => {
    if (page < totalPages) loadTraces(page + 1);
  }, [page, totalPages, loadTraces]);

  // -----------------------------------------------------------------------
  // Render: JSON detail block
  // -----------------------------------------------------------------------

  function renderPayloadBlock(
    label: string,
    payload: Record<string, unknown> | null,
  ) {
    if (!payload) {
      return (
        <div className="mb-3">
          <p className="text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wide">
            {label}
          </p>
          <code className="text-xs text-zinc-600 italic">null</code>
        </div>
      );
    }

    return (
      <div className="mb-3">
        <p className="text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wide">
          {label}
        </p>
        <pre
          className={
            "overflow-auto rounded-md bg-zinc-950 p-3 text-xs leading-relaxed " +
            "text-zinc-300 border border-zinc-800 max-h-80"
          }
        >
          <code>{JSON.stringify(payload, null, 2)}</code>
        </pre>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: single trace row
  // -----------------------------------------------------------------------

  function renderTrace(trace: SandboxTrace) {
    const isExpanded = expandedId === trace.id;

    return (
      <div
        key={trace.id}
        className={
          "group rounded-lg border transition-colors duration-150 " +
          (isExpanded
            ? "border-indigo-500/40 bg-zinc-800/80"
            : "border-zinc-800 hover:border-zinc-700 bg-zinc-800/40")
        }
      >
        {/* -- Clickable header row -- */}
        <button
          type="button"
          onClick={() => toggleExpand(trace.id)}
          className={
            "w-full flex items-center gap-3 px-4 py-3 text-left " +
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 " +
            "focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 rounded-lg"
          }
          aria-expanded={isExpanded}
          aria-controls={`trace-detail-${trace.id}`}
        >
          {/* Status dot */}
          <StatusDot success={trace.isSuccess} />

          {/* Action badge */}
          <ActionBadge action={trace.actionType} />

          {/* Latency */}
          <span className="text-xs text-zinc-400 font-mono tabular-nums whitespace-nowrap">
            {formatLatency(trace.latencyMs)}
          </span>

          {/* Virtual cost */}
          <span className="text-xs text-zinc-400 font-mono tabular-nums whitespace-nowrap">
            {formatSimulatedCredits(trace.virtualCostBigInt)}
          </span>

          {/* Mock badge (if mocked) */}
          {trace.isMocked && (
            <span
              className={
                "inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold " +
                "rounded bg-amber-900/40 text-amber-400 border border-amber-800/50 " +
                "uppercase tracking-wider"
              }
              title="This trace used mocked data"
            >
              Mock
            </span>
          )}

          {/* Error message hint (if error) */}
          {!trace.isSuccess && trace.errorMessage && (
            <span className="text-xs text-red-400 truncate ml-1 hidden sm:inline">
              {trace.errorMessage.substring(0, 60)}
              {trace.errorMessage.length > 60 ? "…" : ""}
            </span>
          )}

          {/* Expand chevron */}
          <span className="ml-auto shrink-0 text-zinc-600 group-hover:text-zinc-400 transition-colors">
            <svg
              className={"w-4 h-4 transition-transform duration-200 " + (isExpanded ? "rotate-180" : "")}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>

        {/* -- Expanded payload section -- */}
        {isExpanded && (
          <div
            id={`trace-detail-${trace.id}`}
            className="border-t border-zinc-700/50 px-4 py-3 space-y-3 animate-fade-in"
          >
            {/* Error detail (if failed) */}
            {!trace.isSuccess && trace.errorMessage && (
              <div className="mb-3 rounded-md bg-red-900/20 border border-red-800/40 px-3 py-2">
                <p className="text-xs font-semibold text-red-400 mb-0.5">Error</p>
                <p className="text-xs text-red-300/90 font-mono break-words">
                  {trace.errorMessage}
                </p>
              </div>
            )}

            {/* Payload blocks */}
            {renderPayloadBlock("Input Payload", trace.inputPayload)}
            {renderPayloadBlock("Output Payload", trace.outputPayload)}

            {/* Metadata row */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-600 pt-1 border-t border-zinc-800/60">
              <span>
                Trace ID:{" "}
                <code className="font-mono text-zinc-500">{trace.id}</code>
              </span>
              {trace.nodeId && (
                <span>
                  Node:{" "}
                  <code className="font-mono text-zinc-500">{trace.nodeId}</code>
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: root
  // -----------------------------------------------------------------------

  return (
    <div
      className={
        "flex flex-col gap-3 " + className
      }
    >
      {/* Header / toolbar */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-200 tracking-tight">
          Trace Log
          {traces.length > 0 && (
            <span className="ml-2 text-xs font-normal text-zinc-500">
              ({traces.length} trace{traces.length !== 1 ? "s" : ""})
            </span>
          )}
        </h3>

        {/* Refresh button */}
        <button
          type="button"
          onClick={() => loadTraces(page)}
          disabled={loading}
          className={
            "text-xs px-2.5 py-1 rounded-md border " +
            "transition-colors duration-150 " +
            (loading
              ? "border-zinc-700 text-zinc-600 cursor-not-allowed"
              : "border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200")
          }
          aria-label="Refresh traces"
        >
          {loading ? (
            <span className="inline-flex items-center gap-1.5">
              <svg
                className="animate-spin w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
              Loading…
            </span>
          ) : (
            "Refresh"
          )}
        </button>
      </div>

      {/* ---- Content area ---- */}
      <div className="space-y-2">
        {/* Loading skeleton */}
        {loading && traces.length === 0 && <TraceSkeleton />}

        {/* Error state */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <svg
              className="w-10 h-10 text-red-500/60 mb-3"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
            <p className="text-red-400 text-sm font-medium">{error}</p>
            <button
              type="button"
              onClick={() => loadTraces(1)}
              className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && traces.length === 0 && <EmptyState />}

        {/* Trace list */}
        {!loading && traces.length > 0 && (
          <div className="space-y-1.5">
            {traces.map(renderTrace)}
          </div>
        )}
      </div>

      {/* ---- Pagination ---- */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={goPrev}
            disabled={page <= 1 || loading}
            className={
              "text-xs px-2.5 py-1 rounded-md border transition-colors " +
              (page <= 1 || loading
                ? "border-zinc-800 text-zinc-700 cursor-not-allowed"
                : "border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200")
            }
          >
            ← Prev
          </button>

          <span className="text-xs text-zinc-500 tabular-nums">
            Page {page} of {totalPages}
          </span>

          <button
            type="button"
            onClick={goNext}
            disabled={page >= totalPages || loading}
            className={
              "text-xs px-2.5 py-1 rounded-md border transition-colors " +
              (page >= totalPages || loading
                ? "border-zinc-800 text-zinc-700 cursor-not-allowed"
                : "border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200")
            }
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
