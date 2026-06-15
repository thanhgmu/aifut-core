"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "../../lib/auth";

type MarketplaceItem = {
  id: string; key: string; name: string; type: string;
  description: string | null; category: string | null;
  industry: string | null; price: number; currency: string;
  authorName: string | null; version: string; tags: string[];
  downloads: number; rating: number | null;
  isPublished: boolean; isOfficial: boolean;
  createdAt: string;
};

type ListingGroup = {
  label: string; icon: string; color: string;
};

const GROUPS: Record<string, ListingGroup> = {
  connector: { label: "Connectors", icon: "🔌", color: "#66c4ff" },
  template: { label: "Workflow Templates", icon: "📝", color: "#4ade80" },
  workflow: { label: "Workflows", icon: "⚡", color: "#facc15" },
};

export default function MarketplacePage() {
  const [listings, setListings] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/marketplace/listings`)
      .then(r => r.json())
      .then(data => {
        setListings(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = filterType
    ? listings.filter(l => l.type === filterType)
    : listings;

  const total = listings.length;
  const official = listings.filter(l => l.isOfficial).length;
  const community = listings.filter(l => !l.isOfficial).length;

  return (
    <main style={{ minHeight: "100vh", background: "#0b1020", color: "#f5f7ff", fontFamily: "Arial, sans-serif" }}>
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
        {/* Stats bar */}
        <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
          <div style={{ flex: 1, padding: "16px 20px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{total}</div>
            <div style={{ fontSize: 12, color: "#9fb0ff", marginTop: 4 }}>Total Listings</div>
          </div>
          <div style={{ flex: 1, padding: "16px 20px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#4ade80" }}>{official}</div>
            <div style={{ fontSize: 12, color: "#9fb0ff", marginTop: 4 }}>Official</div>
          </div>
          <div style={{ flex: 1, padding: "16px 20px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#66c4ff" }}>{community}</div>
            <div style={{ fontSize: 12, color: "#9fb0ff", marginTop: 4 }}>Community</div>
          </div>
          <div style={{ flex: 1, padding: "16px 20px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>
              {listings.reduce((a, b) => a + b.downloads, 0)}
            </div>
            <div style={{ fontSize: 12, color: "#9fb0ff", marginTop: 4 }}>Total Downloads</div>
          </div>
        </div>

        {/* Filters + Submit */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setFilterType("")} style={{
              padding: "8px 16px", borderRadius: 8, border: "1px solid", cursor: "pointer", fontSize: 13,
              background: !filterType ? "#6d7cff" : "transparent",
              color: !filterType ? "white" : "#9fb0ff",
              borderColor: !filterType ? "#6d7cff" : "rgba(255,255,255,0.15)",
            }}>All</button>
            {Object.entries(GROUPS).map(([k, v]) => (
              <button key={k} onClick={() => setFilterType(k)} style={{
                padding: "8px 16px", borderRadius: 8, border: "1px solid", cursor: "pointer", fontSize: 13,
                background: filterType === k ? "#6d7cff" : "transparent",
                color: filterType === k ? "white" : "#9fb0ff",
                borderColor: filterType === k ? "#6d7cff" : "rgba(255,255,255,0.15)",
              }}>{v.icon} {v.label}</button>
            ))}
          </div>
          <a href="/developer" style={{
            padding: "10px 20px", borderRadius: 10, background: "rgba(109,124,255,0.15)",
            color: "#6d7cff", border: "1px solid rgba(109,124,255,0.3)",
            textDecoration: "none", fontWeight: 600, fontSize: 14,
          }}>+ Submit Your Connector</a>
        </div>

        {/* Listing grid */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#9fb0ff" }}>Loading marketplace...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#8899cc", background: "rgba(255,255,255,0.03)", borderRadius: 16 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 16, marginBottom: 8 }}>No listings found</div>
            <div style={{ fontSize: 13 }}>Be the first to submit a connector or template to the marketplace.</div>
            <a href="/developer" style={{ display: "inline-block", marginTop: 16, padding: "12px 24px", background: "#6d7cff", color: "white", borderRadius: 10, textDecoration: "none", fontWeight: 600 }}>Submit a Connector</a>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
            {filtered.map(item => {
              const group = GROUPS[item.type] || { icon: "📦", color: "#9fb0ff", label: item.type };
              return (
                <div key={item.id} style={{
                  padding: 20, borderRadius: 14, background: "rgba(255,255,255,0.03)",
                  border: item.isOfficial ? "1px solid rgba(74,222,128,0.3)" : "1px solid rgba(255,255,255,0.06)",
                  transition: "all 0.15s",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div style={{ fontSize: 28 }}>{group.icon}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "rgba(74,222,128,0.1)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.2)" }}>
                        v{item.version}
                      </span>
                      {item.isOfficial ? (
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }}>
                          Official
                        </span>
                      ) : (
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "rgba(102,196,255,0.1)", color: "#66c4ff", border: "1px solid rgba(102,196,255,0.2)" }}>
                          Community
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{item.name}</div>
                  {item.description && (
                    <div style={{ color: "#c8d2ff", fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>{item.description}</div>
                  )}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                    <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "rgba(255,255,255,0.05)", color: "#9fb0ff" }}>{group.label}</span>
                    {item.industry && <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "rgba(255,255,255,0.05)", color: "#9fb0ff" }}>{item.industry}</span>}
                    {item.category && <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "rgba(255,255,255,0.05)", color: "#9fb0ff" }}>{item.category}</span>}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "#8899cc", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
                    <span>{item.authorName || "AIFUT"}</span>
                    <div style={{ display: "flex", gap: 12 }}>
                      <span>⬇️ {item.downloads}</span>
                      {item.rating && <span>⭐ {item.rating.toFixed(1)}</span>}
                      {item.price > 0 ? (
                        <span style={{ color: "#4ade80", fontWeight: 600 }}>
                          {new Intl.NumberFormat("vi-VN").format(item.price)}₫
                        </span>
                      ) : (
                        <span style={{ color: "#4ade80" }}>Free</span>
                      )}
                    </div>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <button style={{
                      width: "100%", padding: "8px 0", borderRadius: 8, border: "1px solid rgba(109,124,255,0.3)",
                      background: "rgba(109,124,255,0.1)", color: "#6d7cff", cursor: "pointer", fontSize: 13, fontWeight: 600,
                    }}>Install</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
