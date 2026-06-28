"use client";

// ============================================================================
// components/developer/sandbox-session-list.tsx
// Paginated sandbox-session table with inline create-dialog.
//
// Consumed by the Developer Sandbox Console.  Pulls pagination, session
// listing, and session creation through lib/sandbox.ts helpers.
//
// UI contract — Dark-theme inline styles matching the billing / workspace
// component conventions (CSS Grid table, rgba backgrounds, accent colours).
// ============================================================================

import { useCallback, useEffect, useState } from "react";

import { resolveTenantId } from "../../lib/sandbox";

import {
  fetchSandboxSessions,
  createSandboxSession,
  updateSessionStatus,
} from "../../lib/sandbox";

import type { SandboxSession } from "../../types/sandbox";

// ---------------------------------------------------------------------------
// Local type helpers (mirrors the PaginatedSessions contract from
// lib/sandbox.ts — kept inline so this component compiles independently
// while the full type set is migrated into types/sandbox.ts.)
// ---------------------------------------------------------------------------

interface PaginatedResult {
  items: SandboxSession[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Dialog state
// ---------------------------------------------------------------------------

interface CreateDialogState {
  open: boolean;
  name: string;
  submitting: boolean;
  error: string | null;
}

const DIALOG_INIT: CreateDialogState = {
  open: false,
  name: "",
  submitting: false,
  error: null,
};

// ---------------------------------------------------------------------------
// Session list — Client Component
// ---------------------------------------------------------------------------

type LoadStatus = "idle" | "loading" | "error" | "ready";

interface SandboxSessionListProps {
  tenantId: string;
  onSelectSession: (id: string | null) => void;
  selectedSessionId: string | null;
}

export function SandboxSessionList({ tenantId, onSelectSession, selectedSessionId }: SandboxSessionListProps) {
  /* ── Core state ──────────────────────────────────────────────────── */
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const [sessions, setSessions] = useState<SandboxSession[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [createDialog, setCreateDialog] =
    useState<CreateDialogState>(DIALOG_INIT);

  // ── Search & filter state ───────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "archived"
  >("all");

  const [actioningId, setActioningId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  /* ── Resolve tenant identity on mount ────────────────────────────── */
  useEffect(() => {
    resolveTenantId().then((id) => {
      if (!id) {
        setStatus("error");
        setError("Authentication required. Please sign in.");
      }
    });
  }, []);

  /* ── Fetch session list ──────────────────────────────────────────── */
  const load = useCallback(async () => {
    if (!tenantId) return;
    setStatus("loading");
    setError(null);

    try {
      const filterParam =
        statusFilter === "all" ? undefined : statusFilter;
      const raw = await fetchSandboxSessions(
        tenantId,
        page,
        pageSize,
        search || undefined,
        filterParam,
      );
      if (!raw) {
        setStatus("error");
        setError("Failed to load sandbox sessions.");
        return;
      }
      const result = raw;
      setSessions(result.data ?? []);
      setTotalCount(result.total ?? 0);
      setStatus("ready");
    } catch (e: unknown) {
      setStatus("error");
      setError(
        e instanceof Error ? e.message : "Unexpected error loading sessions.",
      );
    }
  }, [tenantId, page, pageSize, search, statusFilter]);

  useEffect(() => {
    if (tenantId) load();
  }, [tenantId, load]);

  /* ── Create session ──────────────────────────────────────────────── */
  const handleCreate = useCallback(async () => {
    if (!tenantId || !createDialog.name.trim()) return;
    setCreateDialog((p) => ({ ...p, submitting: true, error: null }));

    try {
      const session = await createSandboxSession(
        tenantId,
        createDialog.name.trim(),
      );
      if (!session) {
        setCreateDialog((p) => ({
          ...p,
          submitting: false,
          error:
            "Failed to create session. The name may be invalid or you may not have permission.",
        }));
        return;
      }
      setCreateDialog(DIALOG_INIT);
      setPage(1);
      await load();
    } catch (e: unknown) {
      setCreateDialog((p) => ({
        ...p,
        submitting: false,
        error:
          e instanceof Error
            ? e.message
            : "Unexpected error creating session.",
      }));
    }
  }, [tenantId, createDialog.name, load]);

  /* ── Format helpers ──────────────────────────────────────────────── */
  const fmtDate = (iso: string): string => {
    try {
      return new Date(iso).toLocaleDateString("vi-VN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  /* ── View switch ─────────────────────────────────────────────────── */
  if (status === "idle" || status === "loading") {
    return <LoadingSkeleton />;
  }

  if (status === "error" && sessions.length === 0) {
    return <ErrorCard message={error ?? "Unable to load sessions."} onRetry={load} />;
  }

  /* ── Render ──────────────────────────────────────────────────────── */
  return (
    <section style={sectionCard}>
      {/* Header bar */}
      <div style={headerRow}>
        <h2 style={title}>🧪 Sandbox Sessions</h2>
        <button
          onClick={() =>
            setCreateDialog({ ...DIALOG_INIT, open: true })
          }
          style={createBtn}
        >
          + Create Session
        </button>
      </div>

      {/* ── Search & Filter Bar ──────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="🔍 Search sessions by name..."
          style={{
            flex: 1,
            height: 32,
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.04)",
            color: "#f5f7ff",
            padding: "0 10px",
            fontSize: 12,
            outline: "none",
          }}
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as "all" | "active" | "archived");
            setPage(1);
          }}
          style={{
            height: 32,
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.04)",
            color: "#f5f7ff",
            padding: "0 10px",
            fontSize: 12,
            outline: "none",
          }}
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {sessions.length === 0 ? (
        <EmptyBox message="No sandbox sessions yet. Create one to get started." />
      ) : (
        <>
          {/* ── Table ─────────────────────────────────────────────── */}
          <div style={tableWrap}>
            <div style={tableHeader}>
              <div>Name</div>
              <div>Status</div>
              <div>Traces</div>
              <div style={{ textAlign: "center" }}>Actions</div>
              <div style={{ textAlign: "right" }}>Created At</div>
            </div>

            <div style={tableBody}>
              {sessions.map((s) => (
                <div key={s.id} style={tableRow}>
                  <div style={cellName}>{s.name}</div>
                  <div>
                    {s.isActive ? (
                      <span style={badgeActive}>● Active</span>
                    ) : (
                      <span style={badgeInactive}>○ Paused</span>
                    )}
                  </div>
                  <div style={cellNormal}>{s.traceCount}</div>
                  <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                    {s.isActive ? (
                      <button
                        disabled={actioningId === s.id}
                        onClick={async () => {
                          setActioningId(s.id);
                          await updateSessionStatus(tenantId, s.id, "pause");
                          setActioningId(null);
                          load();
                        }}
                        style={actionBtn}
                        title="Pause session"
                      >⏸</button>
                    ) : (
                      <button
                        disabled={actioningId === s.id}
                        onClick={async () => {
                          setActioningId(s.id);
                          await updateSessionStatus(tenantId, s.id, "resume");
                          setActioningId(null);
                          load();
                        }}
                        style={actionBtn}
                        title="Resume session"
                      >▶</button>
                    )}
                    <button
                      disabled={actioningId === s.id}
                      onClick={async () => {
                        setActioningId(s.id);
                        await updateSessionStatus(tenantId, s.id, "archive");
                        setActioningId(null);
                        load();
                      }}
                      style={{ ...actionBtn, opacity: 0.6 }}
                      title="Archive session"
                    >🗂</button>
                  </div>
                  <div style={cellDate}>{fmtDate(s.createdAt)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Pagination ────────────────────────────────────────── */}
          <PaginationBar
            page={page}
            totalPages={totalPages}
            totalCount={totalCount}
            onPage={setPage}
          />
        </>
      )}

      {/* ── Create dialog (modal overlay) ──────────────────────────── */}
      {createDialog.open && (
        <CreateDialogModal
          value={createDialog.name}
          submitting={createDialog.submitting}
          error={createDialog.error}
          onChange={(name) =>
            setCreateDialog((p) => ({ ...p, name, error: null }))
          }
          onCancel={() => setCreateDialog(DIALOG_INIT)}
          onSubmit={handleCreate}
        />
      )}
    </section>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

/* ── Pagination ──────────────────────────────────────────────────────── */

function PaginationBar({
  page,
  totalPages,
  totalCount,
  onPage,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  onPage: (p: number) => void;
}) {
  // Build page numbers: always show first, last, and up to 2 neighbours
  // of the current page, with ellipsis gaps.
  const pages: (number | "ellipsis")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (
      i === 1 ||
      i === totalPages ||
      Math.abs(i - page) <= 2
    ) {
      pages.push(i);
    }
  }
  const deduped: (number | "ellipsis")[] = [];
  for (const p of pages) {
    const last = deduped[deduped.length - 1];
    if (typeof last === "number" && typeof p === "number" && p - last > 1) {
      deduped.push("ellipsis");
    }
    deduped.push(p);
  }

  return (
    <div style={paginationWrap}>
      <div style={paginationInner}>
        <PageButton
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          ← Prev
        </PageButton>

        {deduped.map((p, i) =>
          p === "ellipsis" ? (
            <span key={`e-${i}`} style={ellipsis}>
              …
            </span>
          ) : (
            <PageButton
              key={p}
              active={p === page}
              onClick={() => onPage(p)}
            >
              {p}
            </PageButton>
          ),
        )}

        <PageButton
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Next →
        </PageButton>
      </div>

      <div style={pageMetaText}>
        Page {page} of {totalPages} · {totalCount} total sessions
      </div>
    </div>
  );
}

/* ── Page button ─────────────────────────────────────────────────────── */

function PageButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...pageBtnBase,
        background: active
          ? "#6d7cff"
          : disabled
            ? "transparent"
            : "rgba(255,255,255,0.03)",
        color: active
          ? "#fff"
          : disabled
            ? "#5a6488"
            : "#9fb0ff",
        fontWeight: active ? 700 : 500,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

/* ── Loading skeleton ────────────────────────────────────────────────── */

function LoadingSkeleton() {
  return (
    <section style={sectionCard}>
      <div style={{ height: 28, width: 200, background: "rgba(255,255,255,0.04)", borderRadius: 8, marginBottom: 24 }} />
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            height: 48,
            borderRadius: 12,
            background: "rgba(255,255,255,0.02)",
            marginBottom: 8,
          }}
        />
      ))}
    </section>
  );
}

/* ── Error card ──────────────────────────────────────────────────────── */

function ErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section style={sectionCard}>
      <div style={{ textAlign: "center", padding: 24 }}>
        <div style={{ color: "#f87171", fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          ⚠️ {message}
        </div>
        <button onClick={onRetry} style={retryBtn}>
          🔄 Retry
        </button>
      </div>
    </section>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────── */

function EmptyBox({ message }: { message: string }) {
  return (
    <div style={emptyBox}>
      {message}
    </div>
  );
}

/* ── Create session dialog (modal) ───────────────────────────────────── */

function CreateDialogModal({
  value,
  submitting,
  error,
  onChange,
  onCancel,
  onSubmit,
}: {
  value: string;
  submitting: boolean;
  error: string | null;
  onChange: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const canSubmit = !submitting && value.trim().length >= 1;

  return (
    <div style={overlay} onClick={onCancel}>
      <div style={dialogCard} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px", color: "#c8d2ff" }}>
          Create Session
        </h3>
        <p style={{ fontSize: 13, color: "#8899cc", margin: "0 0 20px" }}>
          Enter a name for your new sandbox session.
        </p>

        {error && (
          <div style={dialogError}>⚠️ {error}</div>
        )}

        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. Integration test — June 2026"
          disabled={submitting}
          style={dialogInput}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            onClick={onCancel}
            disabled={submitting}
            style={cancelBtn}
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={!canSubmit}
            style={{
              ...confirmBtn,
              background: canSubmit
                ? "#6d7cff"
                : "rgba(109,124,255,0.3)",
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {submitting ? "⏳ Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Style objects (dark-theme constants, kept at module level for reuse)
// ============================================================================

const sectionCard: React.CSSProperties = {
  padding: 24,
  borderRadius: 20,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 20,
};

const title: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  margin: 0,
  color: "#c8d2ff",
};

const createBtn: React.CSSProperties = {
  padding: "10px 20px",
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
  background: "#6d7cff",
  color: "#fff",
  transition: "background 0.15s",
};

const tableWrap: React.CSSProperties = {
  marginBottom: 12,
};

const tableHeader: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "2fr 1fr 1fr 1.5fr",
  gap: 12,
  padding: "0 12px 10px",
  fontSize: 11,
  color: "#9fb0ff",
  textTransform: "uppercase" as const,
  letterSpacing: 1,
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};

const tableBody: React.CSSProperties = {
  display: "grid",
  gap: 6,
  marginTop: 6,
};

const tableRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "2fr 1fr 1fr 1.5fr",
  gap: 12,
  alignItems: "center",
  padding: "12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.02)",
  fontSize: 14,
};

const cellName: React.CSSProperties = {
  fontWeight: 600,
  color: "#c8d2ff",
};

const cellNormal: React.CSSProperties = {
  color: "#c8d2ff",
};

const cellDate: React.CSSProperties = {
  color: "#8899cc",
  fontSize: 13,
  textAlign: "right" as const,
};

const badgeActive: React.CSSProperties = {
  color: "#34d399",
  fontWeight: 600,
  fontSize: 13,
};

const badgeInactive: React.CSSProperties = {
  color: "#f87171",
  fontWeight: 600,
  fontSize: 13,
};

const actionBtn: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6,
  color: "#c8d2ff",
  cursor: "pointer",
  fontSize: 14,
  width: 30,
  height: 28,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "all 0.1s",
};

const paginationWrap: React.CSSProperties = {
  marginTop: 16,
  paddingTop: 16,
  borderTop: "1px solid rgba(255,255,255,0.06)",
};

const paginationInner: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap" as const,
};

const ellipsis: React.CSSProperties = {
  color: "#5a6488",
  padding: "0 4px",
  fontSize: 13,
};

const pageMetaText: React.CSSProperties = {
  textAlign: "center" as const,
  color: "#5a6488",
  fontSize: 12,
  marginTop: 8,
};

const pageBtnBase: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.06)",
  fontSize: 13,
  transition: "background 0.15s",
};

const retryBtn: React.CSSProperties = {
  padding: "8px 18px",
  borderRadius: 8,
  border: "1px solid #6d7cff",
  background: "rgba(109,124,255,0.2)",
  color: "#6d7cff",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};

const emptyBox: React.CSSProperties = {
  padding: 40,
  textAlign: "center" as const,
  color: "#8899cc",
  fontSize: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.02)",
};

const overlay: React.CSSProperties = {
  position: "fixed" as const,
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const dialogCard: React.CSSProperties = {
  padding: 28,
  borderRadius: 20,
  background: "#1a1d2e",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
  width: 400,
  maxWidth: "90vw",
};

const dialogError: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(248,113,113,0.08)",
  border: "1px solid rgba(248,113,113,0.2)",
  color: "#f87171",
  fontSize: 13,
  marginBottom: 16,
};

const dialogInput: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.03)",
  color: "#c8d2ff",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box" as const,
  marginBottom: 20,
};

const cancelBtn: React.CSSProperties = {
  padding: "10px 20px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "transparent",
  color: "#9fb0ff",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const confirmBtn: React.CSSProperties = {
  padding: "10px 20px",
  borderRadius: 10,
  border: "none",
  color: "#fff",
  fontSize: 14,
  fontWeight: 700,
};
