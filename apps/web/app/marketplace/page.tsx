"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "../../lib/auth";

// ── Types ───────────────────────────────────────────────────────────────

type MarketplaceItem = {
  id: string; key: string; name: string; type: string;
  description: string | null; category: string | null;
  industry: string | null; price: number; currency: string;
  authorName: string | null; version: string; tags: string[];
  downloads: number; rating: number | null;
  isPublished: boolean; isOfficial: boolean;
  createdAt: string;
  /** ISO 3166-1 alpha-2 country code, e.g. "VN", "US", "SG" */
  region?: string | null;
};

type MarketplaceStats = {
  totalListings: number; totalDownloads: number;
  official: number; community: number;
  pendingApproval: number; averagePrice: number;
};

type PaginatedResult = {
  items: MarketplaceItem[];
  total: number; page: number; pageSize: number; totalPages: number;
};

type SortOpt = 'newest' | 'popular' | 'rating' | 'price_asc' | 'price_desc';

type ListingGroup = {
  label: string; icon: string; color: string;
};

const GROUPS: Record<string, ListingGroup> = {
  connector: { label: "Connectors", icon: "🔌", color: "#66c4ff" },
  template: { label: "Workflow Templates", icon: "📝", color: "#4ade80" },
  workflow: { label: "Workflows", icon: "⚡", color: "#facc15" },
};

const SORT_LABELS: Record<SortOpt, string> = {
  newest: "Newest",
  popular: "Most Popular",
  rating: "Highest Rated",
  price_asc: "Price: Low→High",
  price_desc: "Price: High→Low",
};

// ── Country / Region Data ──────────────────────────────────────────────

const REGIONS: Record<string, { code: string; name: string; flag: string }> = {
  all:  { code: "ALL", name: "All Regions",   flag: "🌍" },
  VN:   { code: "VN",  name: "Việt Nam",      flag: "🇻🇳" },
  SG:   { code: "SG",  name: "Singapore",     flag: "🇸🇬" },
  US:   { code: "US",  name: "United States",  flag: "🇺🇸" },
  JP:   { code: "JP",  name: "Japan",         flag: "🇯🇵" },
  TH:   { code: "TH",  name: "Thailand",      flag: "🇹🇭" },
};

/** Ordered list for the dropdown — only actual countries */
const REGION_OPTIONS = [
  REGIONS.VN, REGIONS.SG, REGIONS.US, REGIONS.JP, REGIONS.TH,
];

function RegionBadge({ region }: { region: string | null | undefined }) {
  const info = REGIONS[region ?? ""];
  if (!info) return null;
  return (
    <span
      title={info.name}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        fontSize: 11, padding: "2px 8px", borderRadius: 999,
        background: "rgba(240,248,255,0.08)",
        color: "#9fb0ff", border: "1px solid rgba(240,248,255,0.12)",
        fontWeight: 500,
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1 }}>{info.flag}</span>
      {info.code}
    </span>
  );
}

// ── Star Rating Component ──────────────────────────────────────────────

function StarRating({
  value, onChange, size = 18, readonly = false,
}: {
  value: number; onChange?: (v: number) => void; size?: number; readonly?: boolean;
}) {
  return (
    <span style={{ display: "inline-flex", gap: 2, cursor: readonly ? "default" : "pointer", alignItems: "center" }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          onClick={() => !readonly && onChange?.(star)}
          onMouseEnter={(e) => { if (!readonly) (e.target as HTMLElement).style.transform = "scale(1.3)"; }}
          onMouseLeave={(e) => { if (!readonly) (e.target as HTMLElement).style.transform = "scale(1)"; }}
          style={{ fontSize: size, transition: "transform 0.1s", filter: star <= value ? "none" : "grayscale(1) opacity(0.3)" }}
        >
          ⭐
        </span>
      ))}
    </span>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────

export default function MarketplacePage() {
  // Data
  const [result, setResult] = useState<PaginatedResult | null>(null);
  const [stats, setStats] = useState<MarketplaceStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterType, setFilterType] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOpt>("newest");
  const [region, setRegion] = useState("all");
  const [page, setPage] = useState(1);
  const [installMsg, setInstallMsg] = useState("");

  // Rating modal
  const [ratingModal, setRatingModal] = useState<{ key: string; name: string } | null>(null);
  const [rateVal, setRateVal] = useState(0);
  const [rateSent, setRateSent] = useState(false);

  const fetchListings = useCallback(async (p: number) => {
    const params = new URLSearchParams();
    if (filterType) params.set("type", filterType);
    if (search.trim()) params.set("search", search.trim());
    params.set("sort", sort);
    params.set("page", String(p));
    params.set("pageSize", "20");
    if (region && region !== "all") params.set("region", region);

    const [res, statsRes] = await Promise.all([
      fetch(`${API_BASE}/marketplace/listings?${params}`),
      fetch(`${API_BASE}/marketplace/stats`),
    ]);

    if (res.ok) {
      const data = await res.json();
      setResult(data);
    }
    if (statsRes.ok) {
      setStats(await statsRes.json());
    }
    setLoading(false);
  }, [filterType, search, sort, region]);

  useEffect(() => {
    setLoading(true);
    setPage(1);
    fetchListings(1);
  }, [fetchListings]);

  useEffect(() => {
    if (page > 1) fetchListings(page);
  }, [page, fetchListings]);

  // Install action
  const install = async (key: string, name: string) => {
    setInstallMsg(`Installing ${name}...`);
    try {
      const res = await fetch(`${API_BASE}/marketplace/listings/${key}/install`, {
        method: "POST", headers: { "x-tenant-slug": "" },
      });
      if (res.ok) {
        setInstallMsg(`✅ ${name} installed successfully!`);
      } else {
        const err = await res.json();
        setInstallMsg(`❌ ${err.message || "Install failed"}`);
      }
    } catch {
      setInstallMsg(`❌ Network error installing ${name}`);
    }
    setTimeout(() => setInstallMsg(""), 4000);
  };

  // Rate action
  const submitRating = async () => {
    if (!ratingModal || rateVal === 0) return;
    try {
      const res = await fetch(`${API_BASE}/marketplace/listings/${ratingModal.key}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: "demo", rating: rateVal }),
      });
      if (res.ok) {
        setRateSent(true);
        setTimeout(() => { setRatingModal(null); setRateSent(false); setRateVal(0); }, 1200);
        fetchListings(page);
      }
    } catch {
      /* silent */
    }
  };

  // ── Render ──────────────────────────────────────────────────────
  return (
    <main style={{
      minHeight: "100vh", background: "#0b1020", color: "#f5f7ff",
      fontFamily: "'Segoe UI', Arial, sans-serif", position: "relative",
    }}>
      {/* Install toast */}
      {installMsg && (
        <div style={{
          position: "fixed", top: 16, right: 16, zIndex: 100,
          padding: "12px 20px", borderRadius: 10,
          background: installMsg.startsWith("✅") ? "rgba(74,222,128,0.15)" : "rgba(255,80,80,0.15)",
          border: `1px solid ${installMsg.startsWith("✅") ? "rgba(74,222,128,0.3)" : "rgba(255,80,80,0.3)"}`,
          color: installMsg.startsWith("✅") ? "#4ade80" : "#ff5050",
          fontSize: 13, fontWeight: 600, backdropFilter: "blur(8px)",
          transition: "opacity 0.3s",
        }}>{installMsg}</div>
      )}

      {/* Rating modal */}
      {ratingModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 99, display: "flex",
          alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
        }} onClick={() => { setRatingModal(null); setRateSent(false); setRateVal(0); }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            padding: 32, borderRadius: 16, background: "#141b30",
            border: "1px solid rgba(255,255,255,0.08)", maxWidth: 400, width: "90%",
          }}>
            {rateSent ? (
              <>
                <div style={{ fontSize: 40, textAlign: "center", marginBottom: 12 }}>🎉</div>
                <div style={{ fontSize: 18, fontWeight: 700, textAlign: "center", color: "#4ade80" }}>Rating submitted!</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: "#c8d2ff" }}>
                  Rate <span style={{ color: "#f5f7ff" }}>{ratingModal.name}</span>
                </div>
                <div style={{ fontSize: 12, color: "#8899cc", marginBottom: 16 }}>Tap a star to rate this listing</div>
                <div style={{ textAlign: "center", marginBottom: 16 }}>
                  <StarRating value={rateVal} onChange={setRateVal} size={32} />
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={() => { setRatingModal(null); setRateVal(0); }}
                    style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#9fb0ff", cursor: "pointer", fontSize: 13 }}>
                    Cancel
                  </button>
                  <button onClick={submitRating} disabled={rateVal === 0} style={{
                    padding: "8px 20px", borderRadius: 8, border: "none",
                    background: rateVal === 0 ? "rgba(109,124,255,0.3)" : "#6d7cff",
                    color: rateVal === 0 ? "rgba(255,255,255,0.3)" : "white",
                    cursor: rateVal === 0 ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 13,
                  }}>
                    Submit Rating
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "24px 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ fontSize: 12, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
            AIFUT Marketplace
          </div>
          <h1 style={{ fontSize: 32, margin: 0 }}>Discover Connectors & Templates</h1>
          <p style={{ color: "#c8d2ff", fontSize: 15, marginTop: 4 }}>
            Browse official and community-built AIS-compliant connectors, workflow templates, and automation packs.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 32 }}>
        {/* Stats bar — live from API */}
        <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
          <div style={{ flex: 1, padding: "16px 20px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{stats?.totalListings ?? "—"}</div>
            <div style={{ fontSize: 12, color: "#9fb0ff", marginTop: 4 }}>Total Listings</div>
          </div>
          <div style={{ flex: 1, padding: "16px 20px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#4ade80" }}>{stats?.official ?? "—"}</div>
            <div style={{ fontSize: 12, color: "#9fb0ff", marginTop: 4 }}>Official</div>
          </div>
          <div style={{ flex: 1, padding: "16px 20px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#66c4ff" }}>{stats?.community ?? "—"}</div>
            <div style={{ fontSize: 12, color: "#9fb0ff", marginTop: 4 }}>Community</div>
          </div>
          <div style={{ flex: 1, padding: "16px 20px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{stats?.totalDownloads.toLocaleString() ?? "—"}</div>
            <div style={{ fontSize: 12, color: "#9fb0ff", marginTop: 4 }}>Total Downloads</div>
          </div>
        </div>

        {/* Search bar */}
        <div style={{ marginBottom: 16 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍  Search connectors, templates, tags..."
            style={{
              width: "100%", padding: "12px 16px", borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)",
              color: "#f5f7ff", fontSize: 14, outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Filters + Sort + Submit */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={() => setFilterType("")} style={{
              padding: "8px 16px", borderRadius: 8, border: "1px solid", cursor: "pointer", fontSize: 13,
              background: !filterType ? "#6d7cff" : "transparent",
              color: !filterType ? "white" : "#9fb0ff",
              borderColor: !filterType ? "#6d7cff" : "rgba(255,255,255,0.15)",
            }}>All {result ? `(${result.total})` : ""}</button>
            {Object.entries(GROUPS).map(([k, v]) => (
              <button key={k} onClick={() => setFilterType(k)} style={{
                padding: "8px 16px", borderRadius: 8, border: "1px solid", cursor: "pointer", fontSize: 13,
                background: filterType === k ? "#6d7cff" : "transparent",
                color: filterType === k ? "white" : "#9fb0ff",
                borderColor: filterType === k ? "#6d7cff" : "rgba(255,255,255,0.15)",
              }}>{v.icon} {v.label}</button>
            ))}

            {/* Sort dropdown */}
            <select value={sort} onChange={(e) => setSort(e.target.value as SortOpt)} style={{
              padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.03)", color: "#9fb0ff", fontSize: 13, cursor: "pointer", outline: "none",
            }}>
              {Object.entries(SORT_LABELS).map(([k, l]) => (
                <option key={k} value={k} style={{ background: "#0b1020" }}>{l}</option>
              ))}
            </select>

            {/* ── Region / Country Filter Dropdown ── */}
            <span style={{ color: "#555", fontSize: 12, margin: "0 2px" }}>|</span>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              style={{
                padding: "8px 12px", borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.03)", color: "#9fb0ff",
                fontSize: 13, cursor: "pointer", outline: "none",
              }}
            >
              <option value="all" style={{ background: "#0b1020" }}>
                🌍 All Regions
              </option>
              {REGION_OPTIONS.map((r) => (
<option key={r?.code} value={r?.code} style={{ background: "#0b1020" }}>
  {r?.flag} {r?.name} ({r?.code})
                </option>
              ))}
            </select>
          </div>

          <a href="/developer" style={{
            padding: "10px 20px", borderRadius: 10, background: "rgba(109,124,255,0.15)",
            color: "#6d7cff", border: "1px solid rgba(109,124,255,0.3)",
            textDecoration: "none", fontWeight: 600, fontSize: 14, whiteSpace: "nowrap",
          }}>+ Submit Your Connector</a>
        </div>

        {/* Listing grid */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#9fb0ff" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔄</div>
            Loading marketplace...
          </div>
        ) : !result || result.items.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#8899cc", background: "rgba(255,255,255,0.03)", borderRadius: 16 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 16, marginBottom: 8 }}>No listings found</div>
            <div style={{ fontSize: 13 }}>Try a different search term or be the first to submit your own.</div>
            <a href="/developer" style={{ display: "inline-block", marginTop: 16, padding: "12px 24px", background: "#6d7cff", color: "white", borderRadius: 10, textDecoration: "none", fontWeight: 600 }}>
              Submit a Connector
            </a>
          </div>
        ) : (
          <>
            {/* Results count */}
            <div style={{ fontSize: 13, color: "#8899cc", marginBottom: 12 }}>
              Showing {result.items.length} of {result.total} listing{result.total !== 1 ? "s" : ""}
              {region !== "all" && ` in ${REGIONS[region]?.name ?? region}`}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
              {result.items.map(item => {
                const group = GROUPS[item.type] || { icon: "📦", color: "#9fb0ff", label: item.type };
                return (
                  <div key={item.id} style={{
                    padding: 20, borderRadius: 14, background: "rgba(255,255,255,0.03)",
                    border: item.isOfficial ? "1px solid rgba(74,222,128,0.3)" : "1px solid rgba(255,255,255,0.06)",
                    transition: "all 0.15s",
                  }}>
                    {/* Header: icon + badges */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 28 }}>{group.icon}</span>
                        <RegionBadge region={item.region} />
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "rgba(74,222,128,0.1)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.2)" }}>
                          v{item.version}
                        </span>
                        {item.isOfficial ? (
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }}>
                            ✅ Official
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "rgba(102,196,255,0.1)", color: "#66c4ff", border: "1px solid rgba(102,196,255,0.2)" }}>
                            🧑‍💻 Community
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Name + Description */}
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{item.name}</div>
                    {item.description && (
                      <div style={{ color: "#c8d2ff", fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>
                        {item.description.length > 120 ? item.description.slice(0, 120) + "\u2026" : item.description}
                      </div>
                    )}

                    {/* Tags */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                      <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "rgba(255,255,255,0.05)", color: "#9fb0ff" }}>{group.label}</span>
                      {item.industry && <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "rgba(255,255,255,0.05)", color: "#9fb0ff" }}>{item.industry}</span>}
                      {item.category && <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "rgba(255,255,255,0.05)", color: "#9fb0ff" }}>{item.category}</span>}
                      {item.tags?.slice(0, 2).map(t => (
                        <span key={t} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "rgba(255,255,255,0.05)", color: "#8899cc" }}>#{t}</span>
                      ))}
                    </div>

                    {/* Footer: author, downloads, rating, price */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "#8899cc", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
                      <span>{item.authorName || "AIFUT"}</span>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <span>⬇️ {item.downloads}</span>
                        {item.rating ? (
                          <button onClick={() => setRatingModal({ key: item.key, name: item.name })}
                            style={{ background: "none", border: "none", color: "#8899cc", cursor: "pointer", padding: 0, fontSize: 12, display: "flex", alignItems: "center", gap: 2 }}>
                            <span>{item.rating.toFixed(1)}</span>
                            <span>⭐</span>
                            <span style={{ fontSize: 10, color: "#6d7cff" }}>rate</span>
                          </button>
                        ) : (
                          <button onClick={() => setRatingModal({ key: item.key, name: item.name })}
                            style={{ background: "none", border: "none", color: "#6d7cff", cursor: "pointer", padding: 0, fontSize: 11 }}>
                            ⭐ Be first to rate
                          </button>
                        )}
                        {item.price > 0 ? (
                          <span style={{ color: "#4ade80", fontWeight: 600 }}>
                            {new Intl.NumberFormat("vi-VN").format(item.price)}₫
                          </span>
                        ) : (
                          <span style={{ color: "#4ade80" }}>Free</span>
                        )}
                      </div>
                    </div>

                    {/* Install button */}
                    <div style={{ marginTop: 12 }}>
                      <button onClick={() => install(item.key, item.name)} style={{
                        width: "100%", padding: "8px 0", borderRadius: 8, border: "1px solid rgba(109,124,255,0.3)",
                        background: "rgba(109,124,255,0.1)", color: "#6d7cff", cursor: "pointer", fontSize: 13, fontWeight: 600,
                        transition: "all 0.15s",
                      }}
                        onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "rgba(109,124,255,0.2)"; }}
                        onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "rgba(109,124,255,0.1)"; }}>
                        Install
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {result.totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 32, alignItems: "center" }}>
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} style={{
                  padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)",
                  background: page <= 1 ? "transparent" : "rgba(255,255,255,0.03)",
                  color: page <= 1 ? "#555" : "#9fb0ff", cursor: page <= 1 ? "not-allowed" : "pointer", fontSize: 13,
                }}>← Prev</button>

                {Array.from({ length: Math.min(result.totalPages, 7) }, (_, i) => {
                  const p = Math.max(1, Math.min(page - 3, result.totalPages - 6)) + i;
                  if (p > result.totalPages) return null;
                  return (
                    <button key={p} onClick={() => setPage(p)} style={{
                      width: 36, height: 36, borderRadius: 8, border: "1px solid",
                      background: p === page ? "#6d7cff" : "transparent",
                      color: p === page ? "white" : "#9fb0ff",
                      borderColor: p === page ? "#6d7cff" : "rgba(255,255,255,0.1)",
                      cursor: "pointer", fontSize: 13, fontWeight: p === page ? 700 : 400,
                    }}>{p}</button>
                  );
                })}

                <button onClick={() => setPage(Math.min(result.totalPages, page + 1))} disabled={page >= result.totalPages} style={{
                  padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)",
                  background: page >= result.totalPages ? "transparent" : "rgba(255,255,255,0.03)",
                  color: page >= result.totalPages ? "#555" : "#9fb0ff", cursor: page >= result.totalPages ? "not-allowed" : "pointer", fontSize: 13,
                }}>Next →</button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
