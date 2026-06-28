"use client";

// =====================================================================
// (dashboard)/developer/page.tsx — Developer Dashboard Home
// Phase 3 ecosystem depth: revenue trend, listing performance,
// earnings activity, tier progress at a glance.
// =====================================================================

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../../../lib/auth";

// ── Types ──────────────────────────────────────────────────────────────

type DevSummary = {
  displayName: string | null;
  tier: string;
  totalListings: number;
  totalSales: number;
  totalRevenue: number;
  totalDownloads: number;
  avgRating: number | null;
  certificationCount: number;
};

type TransactionItem = {
  id: string;
  amount: string;
  currency: string;
  type: string;
  description: string | null;
  createdAt: string;
};

type PaginatedTxs = {
  items: TransactionItem[];
  summary: { totalItems: number; netEarnings: string };
};

// ── Tier config ────────────────────────────────────────────────────────

const TIER_INFO: Record<string, { label: string; color: string; next: string; minSales: number; icon: string }> = {
  BRONZE:   { label: "🥉 Bronze",   color: "#d97706", next: "Silver",   minSales: 0,    icon: "🥉" },
  SILVER:   { label: "🥈 Silver",   color: "#64748b", next: "Gold",     minSales: 10,   icon: "🥈" },
  GOLD:     { label: "🥇 Gold",     color: "#ca8a04", next: "Platinum", minSales: 50,   icon: "🥇" },
  PLATINUM: { label: "💎 Platinum", color: "#06b6d4", next: "—",        minSales: 200,  icon: "💎" },
};

const TYPE_STYLES: Record<string, string> = {
  sale: "#059669", commission: "#0284c7", bonus: "#ca8a04",
  payout: "#dc2626", pending_payout: "#d97706",
};

// ── Headers ────────────────────────────────────────────────────────────

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const t = typeof window !== "undefined" ? localStorage.getItem("aifut_token") : null;
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}

// ── Helpers ────────────────────────────────────────────────────────────

function formatVND(n: number | bigint | string): string {
  const v = typeof n === "string" ? BigInt(n) : BigInt(n ?? 0);
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(Number(v) / 100);
}

function fmtCount(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("vi-VN");
}

// ── Components ─────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{
      padding: "16px 18px", borderRadius: 12,
      background: "rgba(255,255,255,0.02)",
      border: `1px solid ${color}22`,
    }}>
      <p style={{ fontSize: 11, color: "#5a6488", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 4px" }}>
        {label}
      </p>
      <p style={{ fontSize: 22, fontWeight: 700, color, margin: 0, fontFamily: "monospace" }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 11, color: "#5a6488", margin: "4px 0 0" }}>{sub}</p>}
    </div>
  );
}

function TrendBarChart() {
  // Mock revenue trend (last 7 periods)
  const bars = [42, 68, 55, 78, 91, 73, 84];
  const max = Math.max(...bars);
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 100, paddingTop: 8 }}>
      {bars.map((v, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div style={{
            width: "100%", height: `${(v / max) * 100}%`, borderRadius: "4px 4px 0 0",
            background: "linear-gradient(180deg, #34d399, #059669)",
            opacity: 0.8 + (i / bars.length) * 0.2,
            minHeight: 4,
            transition: "height 0.3s",
          }} />
          <span style={{ fontSize: 9, color: "#5a6488" }}>{v}%</span>
        </div>
      ))}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────

export default function DeveloperDashboardContent() {
  const [summary, setSummary] = useState<DevSummary | null>(null);
  const [txs, setTxs] = useState<PaginatedTxs | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [profileRes, statsRes, txsRes] = await Promise.all([
        fetch(`${API_BASE}/v1/developer/profile`, { headers: getHeaders(), cache: "no-store" }),
        fetch(`${API_BASE}/v1/developer/profile/stats`, { headers: getHeaders(), cache: "no-store" }),
        fetch(`${API_BASE}/v1/developer/payout/transactions?page=1&pageSize=8`, { headers: getHeaders(), cache: "no-store" }),
      ]);

      if (profileRes.ok) {
        const profile = await profileRes.json();
        if (statsRes.ok) {
          const stats = await statsRes.json();
          setSummary({
            displayName: profile.displayName,
            tier: profile.tier ?? "BRONZE",
            totalListings: stats.totalListings ?? 0,
            totalSales: stats.totalSales ?? 0,
            totalRevenue: stats.totalRevenue ?? 0,
            totalDownloads: stats.totalDownloads ?? 0,
            avgRating: stats.avgRating ?? null,
            certificationCount: stats.certificationCount ?? 0,
          });
        }
      }
      if (txsRes.ok) setTxs(await txsRes.json());
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const tier = summary ? TIER_INFO[summary.tier] ?? TIER_INFO.BRONZE! : TIER_INFO.BRONZE!;
  const nextTier = tier.next !== "—" ? TIER_INFO[tier.next] ?? null : null;
  const salesForNext = nextTier ? Math.max(0, nextTier.minSales - (summary?.totalSales ?? 0)) : 0;

  return (
    <main style={{
      minHeight: "100vh", background: "#0b1020", color: "#f5f7ff",
      fontFamily: "'Segoe UI', Arial, sans-serif",
    }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "24px 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <p style={{ fontSize: 12, color: "#34d399", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
            Developer Dashboard
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ fontSize: 26, margin: 0 }}>
              {loading ? "" : summary?.displayName ? `👋 ${summary.displayName}` : "🔧 Developer Console"}
            </h1>
            {summary && (
              <span style={{
                fontSize: 12, padding: "4px 12px", borderRadius: 999,
                background: `${tier.color}18`, color: tier.color,
                border: `1px solid ${tier.color}44`, fontWeight: 600,
              }}>
                {tier.label}
              </span>
            )}
          </div>
          <p style={{ color: "#c8d2ff", fontSize: 14, marginTop: 4 }}>
            Revenue overview, listing performance, and ecosystem growth — at a glance.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 32px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#5a6488" }}>
            <p style={{ fontSize: 14 }}>Loading dashboard...</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* ── Stats Grid ────────────────────────────────────── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <StatCard label="Total Sales" value={fmtCount(summary?.totalSales ?? 0)} color="#34d399" />
              <StatCard
                label="Revenue"
                value={summary ? formatVND(summary.totalRevenue) : "—"}
                color="#fbbf24"
              />
              <StatCard
                label="Avg Rating"
                value={summary?.avgRating ? `${summary.avgRating.toFixed(1)} ⭐` : "—"}
                color="#66c4ff"
              />
              <StatCard
                label="Downloads"
                value={fmtCount(summary?.totalDownloads ?? 0)}
                color="#a78bfa"
              />
              <StatCard
                label="Listings"
                value={fmtCount(summary?.totalListings ?? 0)}
                color="#fb923c"
              />
              <StatCard
                label="Certifications"
                value={fmtCount(summary?.certificationCount ?? 0)}
                color="#34d399"
              />
            </div>

            {/* ── Revenue Trend + Tier Progress ─────────────────── */}
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16 }}>
              {/* Revenue Trend */}
              <div style={{
                padding: "20px 22px", borderRadius: 14,
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px", color: "#c8d2ff" }}>
                  📈 Revenue Trend (7 periods)
                </h2>
                <p style={{ fontSize: 12, color: "#5a6488", margin: "0 0 16px" }}>
                  Normalized earnings velocity over recent periods.
                </p>
                <TrendBarChart />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                  <span style={{ fontSize: 10, color: "#5a6488" }}>Oldest</span>
                  <span style={{ fontSize: 10, color: "#5a6488" }}>Latest</span>
                </div>
              </div>

              {/* Tier Progress */}
              <div style={{
                padding: "20px 22px", borderRadius: 14,
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px", color: "#c8d2ff" }}>
                  🏆 Tier Progress
                </h2>
                <div style={{ marginTop: 16, textAlign: "center" }}>
                  <div style={{ fontSize: 40, marginBottom: 4 }}>{tier.icon}</div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: tier.color, margin: 0 }}>
                    {tier.label}
                  </p>
                  {nextTier ? (
                    <>
                      <p style={{ fontSize: 12, color: "#5a6488", marginTop: 8 }}>
                        Next: {nextTier.icon} {nextTier.label}
                      </p>
                      <div style={{
                        marginTop: 8, height: 6, borderRadius: 3,
                        background: "rgba(255,255,255,0.06)", overflow: "hidden",
                      }}>
                        <div style={{
                          height: "100%", borderRadius: 3,
                          width: `${Math.min(100, ((summary?.totalSales ?? 0) / nextTier.minSales) * 100)}%`,
                          background: `linear-gradient(90deg, ${tier.color}, ${nextTier.color})`,
                          transition: "width 0.5s",
                        }} />
                      </div>
                      <p style={{ fontSize: 11, color: "#5a6488", marginTop: 6 }}>
                        {salesForNext} more sale{salesForNext !== 1 ? "s" : ""} to reach {nextTier.label}
                      </p>
                    </>
                  ) : (
                    <p style={{ fontSize: 12, color: "#fbbf24", marginTop: 8 }}>🏆 Highest tier achieved!</p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Quick Links Row ───────────────────────────────── */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { href: "/developer/earnings", label: "💰 Earnings & Payouts", desc: "Revenue, balance, withdraw" },
                { href: "/developer/profile", label: "📝 Profile & Skills", desc: "Edit your developer profile" },
                { href: "/developer/sandbox", label: "🛡️ Sandbox Console", desc: "Test connectors & workflows" },
                { href: "/marketplace", label: "🏪 Marketplace", desc: "Browse & submit listings" },
                { href: "/marketplace/orders", label: "📋 Orders & Sales", desc: "Transaction history" },
              ].map((link) => (
                <a key={link.href} href={link.href} style={{
                  flex: "1 1 180px", padding: "14px 16px", borderRadius: 12,
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  textDecoration: "none", color: "#c8d2ff",
                  transition: "all 0.15s",
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{link.label}</div>
                  <div style={{ fontSize: 11, color: "#5a6488", marginTop: 2 }}>{link.desc}</div>
                </a>
              ))}
            </div>

            {/* ── Recent Activity ───────────────────────────────── */}
            <div style={{
              padding: "20px 22px", borderRadius: 14,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "#c8d2ff" }}>
                  📋 Recent Activity
                </h2>
                <a href="/developer/earnings" style={{
                  fontSize: 12, color: "#6d7cff", textDecoration: "none", fontWeight: 600,
                }}>
                  View all →
                </a>
              </div>

              {!txs || txs.items.length === 0 ? (
                <p style={{ fontSize: 13, color: "#5a6488", textAlign: "center", padding: 20 }}>
                  No transaction activity yet. Submit your first connector to the Marketplace to start earning.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {txs.items.slice(0, 6).map((tx) => (
                    <div key={tx.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "10px 14px", borderRadius: 10,
                      background: "rgba(255,255,255,0.015)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{
                          width: 8, height: 8, borderRadius: "50%",
                          background: TYPE_STYLES[tx.type] ?? "#5a6488",
                        }} />
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 500, margin: 0, color: "#c8d2ff" }}>
                            {tx.description || tx.type}
                          </p>
                          <p style={{ fontSize: 11, color: "#5a6488", margin: "2px 0 0" }}>
                            {timeAgo(tx.createdAt)}
                          </p>
                        </div>
                      </div>
                      <span style={{
                        fontSize: 13, fontWeight: 700, fontFamily: "monospace",
                        color: tx.amount.startsWith("-") || tx.type === "payout" ? "#ef4444" : "#34d399",
                      }}>
                        {tx.amount.startsWith("-") ? "" : "+"}{formatVND(tx.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.04)", fontSize: 11, color: "#5a6488" }}>
          <p>Developer Dashboard — AIFUT Ecosystem. Data updates in real-time from the Marketplace.</p>
        </div>
      </div>
    </main>
  );
}
