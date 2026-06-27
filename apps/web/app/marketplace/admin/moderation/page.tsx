"use client";

// =====================================================================
// marketplace/admin/moderation/page.tsx
// Admin moderation dashboard — review queue for pending marketplace
// submissions (connectors + workflow templates).
//
// Endpoints used:
//   GET  /marketplace/pending              — pending submissions
//   POST /marketplace/listings/:key/approve — approve connector
//   POST /marketplace/listings/:key/reject  — reject connector
//   POST /v1/marketplace/templates/:id/review — review template
//   GET  /v1/marketplace/templates/pending  — pending templates
// =====================================================================

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../../../lib/auth";

// ── Types ──────────────────────────────────────────────────────────────

interface PendingListing {
  id: string;
  key: string;
  name: string;
  type: string;
  description: string | null;
  authorName: string | null;
  authorEmail: string | null;
  version: string;
  region: string | null;
  industry: string | null;
  category: string | null;
  price: number;
  currency: string;
  tags: string[];
  isOfficial: boolean;
  createdAt: string;
}

interface PendingTemplate {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string | null;
  industry: string | null;
  tags: string[];
  developerNotes: string | null;
  version: string | null;
  createdAt: string;
}

type ModerationTab = "connectors" | "templates";

// ── Styled button helpers ──────────────────────────────────────────────

const btnApprove: React.CSSProperties = {
  padding: "8px 18px", borderRadius: 8, border: "none",
  background: "#059669", color: "#fff", fontWeight: 600,
  fontSize: 13, cursor: "pointer", transition: "opacity 0.1s",
};
const btnReject: React.CSSProperties = {
  padding: "8px 18px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)",
  background: "rgba(239,68,68,0.08)", color: "#ef4444", fontWeight: 600,
  fontSize: 13, cursor: "pointer", transition: "opacity 0.1s",
};

// ── Loading Skeleton ───────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{
      padding: "18px 20px", borderRadius: 14,
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.06)",
      animation: "moderation-pulse 1.5s ease-in-out infinite",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ height: 18, width: "60%", borderRadius: 6, background: "rgba(255,255,255,0.06)", marginBottom: 6 }} />
          <div style={{ height: 14, width: "40%", borderRadius: 4, background: "rgba(255,255,255,0.04)" }} />
        </div>
        <div style={{ height: 20, width: 70, borderRadius: 999, background: "rgba(255,255,255,0.05)" }} />
      </div>
      <div style={{ height: 14, width: "80%", borderRadius: 4, background: "rgba(255,255,255,0.04)", marginBottom: 10 }} />
      <div style={{ height: 14, width: "50%", borderRadius: 4, background: "rgba(255,255,255,0.03)", marginBottom: 14 }} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <div style={{ height: 34, width: 90, borderRadius: 8, background: "rgba(255,255,255,0.04)" }} />
        <div style={{ height: 34, width: 140, borderRadius: 8, background: "rgba(255,255,255,0.04)" }} />
      </div>
    </div>
  );
}

function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
      <style>{`
        @keyframes moderation-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────

export default function MarketplaceModerationPage() {
  const [tab, setTab] = useState<ModerationTab>("connectors");

  // Connectors
  const [listings, setListings] = useState<PendingListing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);

  // Templates
  const [templates, setTemplates] = useState<PendingTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);

  // Action state
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  // Headers
  const getHeaders = (): Record<string, string> => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    const t = typeof window !== "undefined" ? localStorage.getItem("aifut_token") : null;
    if (t) h["Authorization"] = `Bearer ${t}`;
    return h;
  };

  // ── Fetch pending listings ──────────────────────────────────────────

  const fetchListings = useCallback(async () => {
    setListingsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/marketplace/pending`, {
        headers: getHeaders(),
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setListings(Array.isArray(data) ? data : data?.items ?? []);
      }
    } catch { /* silent */ }
    setListingsLoading(false);
  }, []);

  // ── Fetch pending templates ─────────────────────────────────────────

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/v1/marketplace/templates/pending`, {
        headers: getHeaders(),
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setTemplates(Array.isArray(data) ? data : data?.items ?? []);
      }
    } catch { /* silent */ }
    setTemplatesLoading(false);
  }, []);

  useEffect(() => {
    fetchListings();
    fetchTemplates();
  }, [fetchListings, fetchTemplates]);

  // ── Approve connector ───────────────────────────────────────────────

  const approveConnector = useCallback(async (key: string) => {
    setProcessing(key);
    try {
      const res = await fetch(`${API_BASE}/marketplace/listings/${key}/approve`, {
        method: "POST", headers: getHeaders(),
      });
      if (res.ok) {
        setActionMsg({ type: "success", text: `✅ "${key}" approved & published` });
        setListings((prev) => prev.filter((l) => l.key !== key));
      } else {
        const err = await res.json().catch(() => ({}));
        setActionMsg({ type: "error", text: `❌ Approve failed: ${err.message || res.statusText}` });
      }
    } catch (e: any) {
      setActionMsg({ type: "error", text: `❌ Network error: ${e.message}` });
    }
    setProcessing(null);
    setTimeout(() => setActionMsg(null), 4000);
  }, []);

  // ── Reject connector ────────────────────────────────────────────────

  const rejectConnector = useCallback(async (key: string) => {
    setProcessing(key);
    try {
      const res = await fetch(`${API_BASE}/marketplace/listings/${key}/reject`, {
        method: "POST", headers: getHeaders(),
      });
      if (res.ok) {
        setActionMsg({ type: "success", text: `🗑️ "${key}" rejected & removed` });
        setListings((prev) => prev.filter((l) => l.key !== key));
      } else {
        const err = await res.json().catch(() => ({}));
        setActionMsg({ type: "error", text: `❌ Reject failed: ${err.message || res.statusText}` });
      }
    } catch (e: any) {
      setActionMsg({ type: "error", text: `❌ Network error: ${e.message}` });
    }
    setProcessing(null);
    setTimeout(() => setActionMsg(null), 4000);
  }, []);

  // ── Review template (approve/reject) ────────────────────────────────

  const reviewTemplate = useCallback(async (id: string, status: "APPROVED" | "REJECTED", name: string) => {
    setProcessing(id);
    try {
      const res = await fetch(`${API_BASE}/v1/marketplace/templates/${id}/review`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          status,
          adminComment: status === "APPROVED"
            ? "Approved by admin — published to marketplace"
            : "Rejected by admin — review notes sent to developer",
        }),
      });
      if (res.ok) {
        setActionMsg({ type: "success", text: status === "APPROVED" ? `✅ "${name}" approved` : `🗑️ "${name}" rejected` });
        setTemplates((prev) => prev.filter((t) => t.id !== id));
      } else {
        const err = await res.json().catch(() => ({}));
        setActionMsg({ type: "error", text: `❌ Review failed: ${err.message || res.statusText}` });
      }
    } catch (e: any) {
      setActionMsg({ type: "error", text: `❌ Network error: ${e.message}` });
    }
    setProcessing(null);
    setTimeout(() => setActionMsg(null), 4000);
  }, []);

  // ── Render ──────────────────────────────────────────────────────────

  const totalPending = (listings?.length ?? 0) + (templates?.length ?? 0);

  return (
    <main style={{
      minHeight: "100vh", background: "#0b1020", color: "#f5f7ff",
      fontFamily: "'Segoe UI', Arial, sans-serif",
    }}>
      {/* Toast */}
      {actionMsg && (
        <div style={{
          position: "fixed", top: 16, right: 16, zIndex: 100,
          padding: "12px 20px", borderRadius: 10,
          background: actionMsg.type === "success"
            ? "rgba(5,150,105,0.15)" : "rgba(239,68,68,0.15)",
          border: `1px solid ${actionMsg.type === "success" ? "rgba(5,150,105,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: actionMsg.type === "success" ? "#34d399" : "#ef4444",
          fontSize: 13, fontWeight: 600, backdropFilter: "blur(8px)",
        }}>{actionMsg.text}</div>
      )}

      {/* Header */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "24px 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ fontSize: 12, color: "#fbbf24", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
            Admin
          </div>
          <h1 style={{ fontSize: 28, margin: 0 }}>🛡️ Marketplace Moderation</h1>
          <p style={{ color: "#c8d2ff", fontSize: 14, marginTop: 4 }}>
            Review queue — {totalPending} pending submission{totalPending !== 1 ? "s" : ""} await{totalPending === 1 ? "s" : ""} approval
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 32px" }}>
        {/* Stats bar */}
        <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
          <div style={{
            flex: 1, padding: "14px 18px", borderRadius: 12,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#fbbf24" }}>
              {listingsLoading ? "..." : listings?.length ?? 0}
            </div>
            <div style={{ fontSize: 12, color: "#9fb0ff", marginTop: 2 }}>
              Pending Connectors
            </div>
          </div>
          <div style={{
            flex: 1, padding: "14px 18px", borderRadius: 12,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#66c4ff" }}>
              {templatesLoading ? "..." : templates?.length ?? 0}
            </div>
            <div style={{ fontSize: 12, color: "#9fb0ff", marginTop: 2 }}>
              Pending Templates
            </div>
          </div>
          <div style={{
            flex: 1, padding: "14px 18px", borderRadius: 12,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#34d399" }}>
              {listingsLoading ? "..." : listings?.filter((l) => l.region).length ?? 0}
            </div>
            <div style={{ fontSize: 12, color: "#9fb0ff", marginTop: 2 }}>
              With Region Specified
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex", gap: 4, marginBottom: 20,
          background: "rgba(255,255,255,0.02)",
          borderRadius: 10, padding: 4, width: "fit-content",
        }}>
          <button
            onClick={() => setTab("connectors")}
            style={{
              padding: "10px 22px", borderRadius: 8, border: "none",
              background: tab === "connectors" ? "#6d7cff" : "transparent",
              color: tab === "connectors" ? "#fff" : "#8899cc",
              fontWeight: 600, fontSize: 14, cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            🔌 Connectors {listings && `(${listings.length})`}
          </button>
          <button
            onClick={() => setTab("templates")}
            style={{
              padding: "10px 22px", borderRadius: 8, border: "none",
              background: tab === "templates" ? "#6d7cff" : "transparent",
              color: tab === "templates" ? "#fff" : "#8899cc",
              fontWeight: 600, fontSize: 14, cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            📝 Workflow Templates {templates && `(${templates.length})`}
          </button>
        </div>

        {/* Connectors tab */}
        {tab === "connectors" && (
          <>
            {listingsLoading ? (
              <SkeletonList count={3} />
            ) : listings.length === 0 ? (
              <div style={{
                textAlign: "center", padding: 48, color: "#5a6488",
                background: "rgba(255,255,255,0.02)", borderRadius: 14,
                border: "1px dashed rgba(255,255,255,0.05)",
              }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#34d399", marginBottom: 4 }}>
                  All caught up!
                </div>
                <div style={{ fontSize: 13 }}>No pending connectors waiting for review.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {listings.map((item) => {
                  const isProcessing = processing === item.key;
                  return (
                    <div
                      key={item.id}
                      style={{
                        padding: "18px 20px", borderRadius: 14,
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        opacity: isProcessing ? 0.5 : 1,
                        transition: "opacity 0.2s",
                      }}
                    >
                      {/* Header row */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 700 }}>{item.name}</div>
                          <div style={{ fontSize: 12, color: "#8899cc", marginTop: 2, fontFamily: "monospace" }}>
                            {item.key} · v{item.version}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <span style={{
                            fontSize: 10, padding: "3px 10px", borderRadius: 999,
                            background: "rgba(251,191,36,0.12)", color: "#fbbf24",
                            border: "1px solid rgba(251,191,36,0.25)", fontWeight: 600,
                          }}>
                            PENDING
                          </span>
                          {item.region && (
                            <span style={{
                              fontSize: 10, padding: "3px 10px", borderRadius: 999,
                              background: "rgba(102,196,255,0.1)", color: "#66c4ff",
                              border: "1px solid rgba(102,196,255,0.2)", fontWeight: 500,
                            }}>
                              {item.region}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Details */}
                      <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#8899cc", marginBottom: 12, flexWrap: "wrap" }}>
                        {item.authorName && <span>👤 {item.authorName}</span>}
                        {item.authorEmail && <span>📧 {item.authorEmail}</span>}
                        {item.industry && <span>🏭 {item.industry}</span>}
                        {item.category && <span>📂 {item.category}</span>}
                        {item.price > 0 && <span>💰 {item.price.toLocaleString()}₫</span>}
                      </div>

                      {/* Description */}
                      {item.description && (
                        <div style={{ fontSize: 13, color: "#c8d2ff", marginBottom: 12, lineHeight: 1.5 }}>
                          {item.description.length > 200
                            ? item.description.slice(0, 200) + "\u2026"
                            : item.description}
                        </div>
                      )}

                      {/* Tags */}
                      {item.tags && item.tags.length > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                          {item.tags.map((t) => (
                            <span key={t} style={{
                              fontSize: 11, padding: "2px 8px", borderRadius: 6,
                              background: "rgba(255,255,255,0.05)", color: "#5a6488",
                            }}>
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Actions */}
                      <div style={{
                        display: "flex", gap: 8, borderTop: "1px solid rgba(255,255,255,0.04)",
                        paddingTop: 12, justifyContent: "flex-end",
                      }}>
                        <button
                          onClick={() => rejectConnector(item.key)}
                          disabled={isProcessing}
                          style={{ ...btnReject, opacity: isProcessing ? 0.5 : 1, cursor: isProcessing ? "not-allowed" : "pointer" }}
                        >
                          {isProcessing ? "⏳" : "✕ Reject"}
                        </button>
                        <button
                          onClick={() => approveConnector(item.key)}
                          disabled={isProcessing}
                          style={{ ...btnApprove, opacity: isProcessing ? 0.5 : 1, cursor: isProcessing ? "not-allowed" : "pointer" }}
                        >
                          {isProcessing ? "⏳" : "✓ Approve & Publish"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Templates tab */}
        {tab === "templates" && (
          <>
            {templatesLoading ? (
              <SkeletonList count={2} />
            ) : templates.length === 0 ? (
              <div style={{
                textAlign: "center", padding: 48, color: "#5a6488",
                background: "rgba(255,255,255,0.02)", borderRadius: 14,
                border: "1px dashed rgba(255,255,255,0.05)",
              }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#34d399", marginBottom: 4 }}>
                  All templates reviewed!
                </div>
                <div style={{ fontSize: 13 }}>No workflow templates awaiting review.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {templates.map((item) => {
                  const isProcessing = processing === item.id;
                  return (
                    <div
                      key={item.id}
                      style={{
                        padding: "18px 20px", borderRadius: 14,
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        opacity: isProcessing ? 0.5 : 1,
                        transition: "opacity 0.2s",
                      }}
                    >
                      {/* Header */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 700 }}>{item.name}</div>
                          <div style={{ fontSize: 12, color: "#8899cc", marginTop: 2, fontFamily: "monospace" }}>
                            {item.key ?? item.id.slice(0, 12)} · v{item.version ?? "1.0.0"}
                          </div>
                        </div>
                        <span style={{
                          fontSize: 10, padding: "3px 10px", borderRadius: 999,
                          background: "rgba(251,191,36,0.12)", color: "#fbbf24",
                          border: "1px solid rgba(251,191,36,0.25)", fontWeight: 600,
                        }}>
                          PENDING
                        </span>
                      </div>

                      {/* Details */}
                      <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#8899cc", marginBottom: 12, flexWrap: "wrap" }}>
                        {item.category && <span>📂 {item.category}</span>}
                        {item.industry && <span>🏭 {item.industry}</span>}
                      </div>

                      {/* Description */}
                      {item.description && (
                        <div style={{ fontSize: 13, color: "#c8d2ff", marginBottom: 12, lineHeight: 1.5 }}>
                          {item.description.length > 200
                            ? item.description.slice(0, 200) + "\u2026"
                            : item.description}
                        </div>
                      )}

                      {/* Developer notes */}
                      {item.developerNotes && (
                        <div style={{
                          fontSize: 12, color: "#9fb0ff", marginBottom: 12,
                          padding: "8px 12px", borderRadius: 8,
                          background: "rgba(109,124,255,0.06)",
                          border: "1px solid rgba(109,124,255,0.1)",
                        }}>
                          <span style={{ fontWeight: 600 }}>Developer Notes: </span>
                          {item.developerNotes}
                        </div>
                      )}

                      {/* Tags */}
                      {item.tags && item.tags.length > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                          {item.tags.map((t) => (
                            <span key={t} style={{
                              fontSize: 11, padding: "2px 8px", borderRadius: 6,
                              background: "rgba(255,255,255,0.05)", color: "#5a6488",
                            }}>
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Actions */}
                      <div style={{
                        display: "flex", gap: 8, borderTop: "1px solid rgba(255,255,255,0.04)",
                        paddingTop: 12, justifyContent: "flex-end",
                      }}>
                        <button
                          onClick={() => reviewTemplate(item.id, "REJECTED", item.name)}
                          disabled={isProcessing}
                          style={{ ...btnReject, opacity: isProcessing ? 0.5 : 1, cursor: isProcessing ? "not-allowed" : "pointer" }}
                        >
                          {isProcessing ? "⏳" : "✕ Reject"}
                        </button>
                        <button
                          onClick={() => reviewTemplate(item.id, "APPROVED", item.name)}
                          disabled={isProcessing}
                          style={{ ...btnApprove, opacity: isProcessing ? 0.5 : 1, cursor: isProcessing ? "not-allowed" : "pointer" }}
                        >
                          {isProcessing ? "⏳" : "✓ Approve & Publish"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div style={{
          marginTop: 32, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.06)",
          fontSize: 12, color: "#5a6488",
        }}>
          <p>
            Approving a connector publishes it to the Marketplace and may trigger certification.
            Rejecting removes the pending submission entirely. Review notes are sent to the developer.
          </p>
          <p style={{ marginTop: 4, color: "#fbbf24" }}>
            ⚡ Actions are immediate and cannot be undone.
          </p>
        </div>
      </div>
    </main>
  );
}
