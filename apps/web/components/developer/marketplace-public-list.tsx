"use client";

// ============================================================================
// components/developer/marketplace-public-list.tsx
// Marketplace Public List Component — Flat Grid with Glassy Frost Cards.
//
// Consumes GET /v1/marketplace/public (paginated) and renders each approved
// WorkflowTemplate as a frosted-glass card showing name, author, developer
// notes, and an "Install Template" action button.
//
// Pagination is driven entirely by the backend's { page, totalPages } contract.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Single approved WorkflowTemplate as returned by the public listing endpoint. */
export interface MarketplacePublicItem {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string | null;
  industry: string | null;
  tags: string[];
  developerNotes: string | null;
  version: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

/** Paginated response shape from GET /v1/marketplace/public. */
export interface PaginatedPublicResult {
  items: MarketplacePublicItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/** ISO string → readable Vietnamese locale. */
const fmtDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleDateString("vi-VN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
};

/** Truncate long text with ellipsis at a given max length. */
const truncate = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max)}…` : text;

/** Extract a display-able author label from metadata or fallback. */
const extractAuthor = (item: MarketplacePublicItem): string => {
  // If metadata holds an ownerTenantName, use it
  if (item.metadata && typeof item.metadata.ownerTenantName === "string") {
    return item.metadata.ownerTenantName;
  }
  // Fallback: show a shorthand from key
  const parts = item.key.split("_");
  return parts.length > 1 ? parts[0] : "Community";
};

// ---------------------------------------------------------------------------
// Status type
// ---------------------------------------------------------------------------

type LoadStatus = "idle" | "loading" | "error" | "ready";

// ────────────────────────────────────────────────────────────────────────────
// MarketplacePublicList — Client Component
// ────────────────────────────────────────────────────────────────────────────

export interface MarketplacePublicListProps {
  /** Optional tenant ID for install-authorization checks (can be empty for anonymous browsing). */
  tenantId?: string;
  /** Called after a successful install so the parent can refresh or toast. */
  onInstalled?: (item: MarketplacePublicItem) => void;
}

export function MarketplacePublicList({
  tenantId,
  onInstalled,
}: MarketplacePublicListProps) {
  /* ── Core state ──────────────────────────────────────────────────── */
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const [items, setItems] = useState<MarketplacePublicItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const pageSize = 20;

  /* ── Install-tracker ─────────────────────────────────────────────── */
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);

  /* ── Fetch public listing ────────────────────────────────────────── */
  const load = useCallback(async () => {
    setStatus("loading");
    setError(null);

    try {
      const res = await fetch(
        `/v1/marketplace/public?page=${page}&pageSize=${pageSize}`,
        { method: "GET" },
      );

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          body
            ? `Server error (${res.status}): ${body}`
            : `Failed to load marketplace (${res.status}).`,
        );
      }

      const result: PaginatedPublicResult = await res.json();
      setItems(result.items ?? []);
      setTotal(result.total ?? 0);
      setTotalPages(result.totalPages ?? 0);
      setStatus("ready");
    } catch (e: unknown) {
      setStatus("error");
      setError(
        e instanceof Error ? e.message : "Unexpected error loading marketplace.",
      );
    }
  }, [page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  /* ── Install handler ─────────────────────────────────────────────── */
  const handleInstall = useCallback(
    async (item: MarketplacePublicItem) => {
      if (!tenantId) {
        setInstallError("Please sign in to install templates.");
        return;
      }

      setInstallingId(item.id);
      setInstallError(null);

      try {
        const res = await fetch(
          `/v1/marketplace/install/${encodeURIComponent(item.key)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-tenant-id": tenantId,
            },
          },
        );

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(
            body
              ? `Install failed (${res.status}): ${body}`
              : "Installation request failed.",
          );
        }

        onInstalled?.(item);
      } catch (e: unknown) {
        setInstallError(
          e instanceof Error ? e.message : "Unexpected install error.",
        );
      } finally {
        setInstallingId(null);
      }
    },
    [tenantId, onInstalled],
  );

  /* ── Card-level tag grouper ──────────────────────────────────────── */
  const displayTags = useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        tags: (item.tags ?? []).slice(0, 4),
      })),
    [items],
  );

  const tagMap = useMemo(
    () => new Map(displayTags.map((d) => [d.id, d.tags])),
    [displayTags],
  );

  /* ── Render by status ────────────────────────────────────────────── */
  if (status === "idle" || status === "loading") {
    return <LoadingGrid />;
  }

  if (status === "error" && items.length === 0) {
    return <ErrorCard message={error ?? "Unable to load marketplace."} onRetry={load} />;
  }

  return (
    <section style={sectionRoot}>
      {/* ── Header ───────────────────────────────────────────────── */}
      <div style={headerRow}>
        <div>
          <h2 style={title}>📦 Community Marketplace</h2>
          <p style={subtitle}>
            Browse approved workflow templates contributed by the community.
          </p>
        </div>
        <span style={countBadge}>{total} templates</span>
      </div>

      {/* ── Global install error banner ──────────────────────────── */}
      {installError && (
        <div style={installErrorBanner}>
          ⚠️ {installError}
          <button
            style={dismissBtn}
            onClick={() => setInstallError(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────── */}
      {items.length === 0 ? (
        <EmptyBox message="No templates available in the marketplace yet. Check back soon!" />
      ) : (
        <>
          {/* ── Flat grid ────────────────────────────────────────── */}
          <div style={gridContainer}>
            {items.map((item) => {
              const tags = tagMap.get(item.id) ?? [];

              return (
                <div key={item.id} style={cardRoot}>
                  {/* Glass highlight */}
                  <div style={cardShine} />

                  {/* Icon / category badge */}
                  <div style={cardHeader}>
                    <span style={categoryBadge}>
                      {item.category ?? "General"}
                    </span>
                    <span style={versionBadge}>v{item.version}</span>
                  </div>

                  {/* Name */}
                  <h3 style={cardTitle}>{item.name}</h3>

                  {/* Author */}
                  <div style={cardAuthor}>
                    <span style={authorIcon}>👤</span>
                    <span style={authorLabel}>
                      {extractAuthor(item)}
                    </span>
                  </div>

                  {/* Description */}
                  {item.description && (
                    <p style={cardDesc}>
                      {truncate(item.description, 140)}
                    </p>
                  )}

                  {/* Developer Notes */}
                  {item.developerNotes && (
                    <div style={devNotesBox}>
                      <span style={devNotesLabel}>📝 Dev notes</span>
                      <p style={devNotesText}>
                        {truncate(item.developerNotes, 120)}
                      </p>
                    </div>
                  )}

                  {/* Tags */}
                  {tags.length > 0 && (
                    <div style={tagRow}>
                      {tags.map((tag) => (
                        <span key={tag} style={tagChip}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Footer */}
                  <div style={cardFooter}>
                    <span style={dateLabel}>
                      {fmtDate(item.createdAt)}
                    </span>
                    <button
                      style={{
                        ...installBtn,
                        opacity:
                          installingId === item.id ? 0.6 : 1,
                        cursor:
                          installingId === item.id
                            ? "wait"
                            : "pointer",
                      }}
                      disabled={installingId === item.id}
                      onClick={() => handleInstall(item)}
                    >
                      {installingId === item.id
                        ? "⏳ Installing…"
                        : "⬇ Install Template"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Pagination ──────────────────────────────────────── */}
          <PaginationBar
            page={page}
            totalPages={totalPages}
            totalCount={total}
            onPage={(p) => {
              setPage(p);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        </>
      )}
    </section>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

/* ── Loading grid (skeleton) ───────────────────────────────────────── */
function LoadingGrid() {
  return (
    <section style={sectionRoot}>
      <div
        style={{
          height: 28,
          width: 280,
          background: "rgba(255,255,255,0.04)",
          borderRadius: 8,
          marginBottom: 24,
        }}
      />
      <div style={gridContainer}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} style={skeletonCard}>
            <div
              style={{
                height: 14,
                width: "40%",
                background: "rgba(255,255,255,0.05)",
                borderRadius: 6,
                marginBottom: 14,
              }}
            />
            <div
              style={{
                height: 20,
                width: "70%",
                background: "rgba(255,255,255,0.05)",
                borderRadius: 6,
                marginBottom: 10,
              }}
            />
            <div
              style={{
                height: 12,
                width: "50%",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 6,
                marginBottom: 18,
              }}
            />
            <div
              style={{
                height: 36,
                width: "100%",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 10,
              }}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Error card ────────────────────────────────────────────────────── */
function ErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section style={sectionRoot}>
      <div style={{ textAlign: "center", padding: 48 }}>
        <div
          style={{
            color: "#f87171",
            fontSize: 16,
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          ⚠️ {message}
        </div>
        <button onClick={onRetry} style={retryBtn}>
          🔄 Retry
        </button>
      </div>
    </section>
  );
}

/* ── Empty state ───────────────────────────────────────────────────── */
function EmptyBox({ message }: { message: string }) {
  return (
    <div style={emptyBox}>
      <span style={{ fontSize: 32, marginBottom: 12, display: "block" }}>
        📭
      </span>
      {message}
    </div>
  );
}

/* ── Pagination ────────────────────────────────────────────────────── */
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
  // Build page numbers: always show first, last, and up to 2 neighbours,
  // with ellipsis gaps between segments.
  const pages: (number | "ellipsis")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 2) {
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

  if (totalPages <= 1) return null;

  return (
    <div style={paginationWrap}>
      <div style={paginationInner}>
        <PageButton disabled={page <= 1} onClick={() => onPage(page - 1)}>
          ← Previous
        </PageButton>

        {deduped.map((p, i) =>
          p === "ellipsis" ? (
            <span key={`e-${i}`} style={ellipsis}>
              …
            </span>
          ) : (
            <PageButton key={p} active={p === page} onClick={() => onPage(p)}>
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
        Page {page} of {totalPages} · {totalCount} total templates
      </div>
    </div>
  );
}

/* ── Page button ───────────────────────────────────────────────────── */
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

// ============================================================================
// Style constants — Glassy Frost dark-theme (inline styles)
// ============================================================================

const sectionRoot: React.CSSProperties = {
  padding: 24,
  borderRadius: 24,
  background: "rgba(255,255,255,0.02)",
  border: "1px solid rgba(255,255,255,0.06)",
  backdropFilter: "blur(4px)",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: 24,
  gap: 16,
};

const title: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  margin: 0,
  color: "#e0e8ff",
  letterSpacing: "-0.3px",
};

const subtitle: React.CSSProperties = {
  fontSize: 13,
  color: "#7a8abf",
  margin: "4px 0 0",
};

const countBadge: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 20,
  background: "rgba(109,124,255,0.12)",
  border: "1px solid rgba(109,124,255,0.2)",
  color: "#9fb0ff",
  fontSize: 13,
  fontWeight: 600,
  whiteSpace: "nowrap",
};

/* ── Grid layout ───────────────────────────────────────────────────── */
const gridContainer: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
  gap: 20,
};

/* ── Card — glassy frost ───────────────────────────────────────────── */
const cardRoot: React.CSSProperties = {
  position: "relative",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  borderRadius: 20,
  padding: 24,
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
  border: "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(12px)",
  boxShadow: "0 4px 24px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.08)",
  transition: "transform 0.2s ease, box-shadow 0.2s ease",
};

//     cardRoot unfortunately can't use :hover directly from inline styles,
//     but we attach onMouseEnter/onMouseLeave in a sibling approach further
//     below. For now the static look is the glassy frost spec.

const cardShine: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  height: "60%",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 100%)",
  pointerEvents: "none",
  borderRadius: "20px 20px 0 0",
};

const cardHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 12,
  position: "relative",
  zIndex: 1,
};

const categoryBadge: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 8,
  background: "rgba(109,124,255,0.12)",
  color: "#9fb0ff",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const versionBadge: React.CSSProperties = {
  padding: "2px 8px",
  borderRadius: 6,
  background: "rgba(255,255,255,0.04)",
  color: "#5a6488",
  fontSize: 11,
  fontWeight: 500,
};

const cardTitle: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 700,
  margin: "0 0 8px",
  color: "#e0e8ff",
  lineHeight: 1.3,
  position: "relative",
  zIndex: 1,
};

const cardAuthor: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  marginBottom: 12,
  position: "relative",
  zIndex: 1,
};

const authorIcon: React.CSSProperties = {
  fontSize: 13,
};

const authorLabel: React.CSSProperties = {
  fontSize: 13,
  color: "#8899cc",
  fontWeight: 500,
};

const cardDesc: React.CSSProperties = {
  fontSize: 13,
  color: "#7a8abf",
  lineHeight: 1.5,
  margin: "0 0 12px",
  position: "relative",
  zIndex: 1,
};

const devNotesBox: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(250,204,21,0.05)",
  border: "1px solid rgba(250,204,21,0.12)",
  marginBottom: 14,
  position: "relative",
  zIndex: 1,
};

const devNotesLabel: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "#facc15",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  marginBottom: 4,
};

const devNotesText: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: "#e2ddaa",
  lineHeight: 1.4,
  fontStyle: "italic",
};

const tagRow: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginBottom: 16,
  position: "relative",
  zIndex: 1,
};

const tagChip: React.CSSProperties = {
  padding: "3px 8px",
  borderRadius: 6,
  background: "rgba(255,255,255,0.04)",
  color: "#7a8abf",
  fontSize: 11,
  fontWeight: 500,
};

const cardFooter: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: "auto",
  paddingTop: 16,
  borderTop: "1px solid rgba(255,255,255,0.06)",
  position: "relative",
  zIndex: 1,
};

const dateLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#5a6488",
};

const installBtn: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 12,
  border: "none",
  fontSize: 13,
  fontWeight: 700,
  background:
    "linear-gradient(135deg, #6d7cff 0%, #8b5cf6 100%)",
  color: "#fff",
  boxShadow: "0 2px 10px rgba(109,124,255,0.25)",
  transition: "opacity 0.15s, box-shadow 0.15s",
};

/* ── Skeleton ──────────────────────────────────────────────────────── */
const skeletonCard: React.CSSProperties = {
  padding: 24,
  borderRadius: 20,
  background: "rgba(255,255,255,0.02)",
  border: "1px solid rgba(255,255,255,0.04)",
};

/* ── Pagination ────────────────────────────────────────────────────── */
const paginationWrap: React.CSSProperties = {
  marginTop: 28,
  paddingTop: 20,
  borderTop: "1px solid rgba(255,255,255,0.06)",
};

const paginationInner: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
};

const ellipsis: React.CSSProperties = {
  color: "#5a6488",
  padding: "0 4px",
  fontSize: 13,
};

const pageMetaText: React.CSSProperties = {
  textAlign: "center",
  color: "#5a6488",
  fontSize: 12,
  marginTop: 8,
};

const pageBtnBase: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.06)",
  fontSize: 13,
  transition: "background 0.15s",
};

/* ── Error / Retry ─────────────────────────────────────────────────── */
const retryBtn: React.CSSProperties = {
  padding: "8px 20px",
  borderRadius: 10,
  border: "1px solid #6d7cff",
  background: "rgba(109,124,255,0.15)",
  color: "#6d7cff",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};

/* ── Empty state ───────────────────────────────────────────────────── */
const emptyBox: React.CSSProperties = {
  padding: 56,
  textAlign: "center",
  color: "#7a8abf",
  fontSize: 14,
  borderRadius: 16,
  background: "rgba(255,255,255,0.02)",
  border: "1px dashed rgba(255,255,255,0.08)",
};

/* ── Install error banner ──────────────────────────────────────────── */
const installErrorBanner: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 16px",
  borderRadius: 12,
  background: "rgba(248,113,113,0.08)",
  border: "1px solid rgba(248,113,113,0.15)",
  color: "#f87171",
  fontSize: 13,
  marginBottom: 20,
};

const dismissBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#f87171",
  fontSize: 16,
  cursor: "pointer",
  padding: "2px 6px",
  borderRadius: 4,
};
