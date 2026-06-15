"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "../../lib/auth";

type PlatformSummary = {
  platform: { tenants: number; users: number; activeSubscriptions: number; templates: number; marketplaceListings: number };
  workflows: { total: number; executions: number; active: number };
  notifications: { total: number };
  backups: { total: number };
  ai: { totalUsage: number };
  generatedAt: string;
};

type RevenueSummary = {
  totalRevenue: number; monthlyRevenue: number; activeSubscriptions: number;
  invoices: { total: number; paid: number; pending: number };
  currency: string; generatedAt: string;
};

type IndustryAdoption = { industry: string; templateCount: number }[];

type CertificationStats = { total: number; approved: number; rejected: number; pending: number; expired: number; approvalRate: number };

function formatVND(amount: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);
}

function Card({ title, value, subtitle, color }: { title: string; value: string | number; subtitle?: string; color?: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: "20px 24px",
      border: "1px solid rgba(255,255,255,0.06)", minWidth: 180,
    }}>
      <div style={{ fontSize: 12, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || "#f5f7ff" }}>{value}</div>
      {subtitle && <div style={{ fontSize: 13, color: "#8899cc", marginTop: 4 }}>{subtitle}</div>}
    </div>
  );
}

function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
        <span style={{ color: "#c8d2ff" }}>{label}</span>
        <span style={{ color: "#9fb0ff" }}>{value}</span>
      </div>
      <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "#6d7cff", borderRadius: 3, transition: "width 0.5s" }} />
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);
  const [industries, setIndustries] = useState<IndustryAdoption>([]);
  const [certStats, setCertStats] = useState<CertificationStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [sumRes, revRes, indRes, certRes] = await Promise.all([
        fetch(`${API_BASE}/analytics/summary`).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE}/analytics/revenue`).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE}/analytics/industries`).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE}/certification/stats/summary`).then(r => r.json()).catch(() => null),
      ]);
      setSummary(sumRes);
      setRevenue(revRes);
      setIndustries(indRes || []);
      setCertStats(certRes);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", background: "#0b1020", color: "#f5f7ff", fontFamily: "Arial, sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 14, color: "#9fb0ff" }}>Loading analytics...</div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "#0b1020", color: "#f5f7ff", fontFamily: "Arial, sans-serif" }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "24px 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ fontSize: 12, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Analytics Dashboard</div>
          <h1 style={{ fontSize: 32, margin: 0 }}>Platform Analytics</h1>
          <p style={{ color: "#c8d2ff", fontSize: 15, marginTop: 4 }}>
            Platform-wide metrics, revenue tracking, and industry adoption. {summary?.generatedAt && `Last updated: ${new Date(summary.generatedAt).toLocaleString("vi-VN")}`}
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 32 }}>
        {/* ── Platform Overview ─────────────────────────────────────────── */}
        <h2 style={{ fontSize: 18, margin: "0 0 16px", color: "#c8d2ff" }}>📊 Platform Overview</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 32 }}>
          <Card title="Tenants" value={summary?.platform.tenants ?? 0} subtitle="Registered organizations" />
          <Card title="Users" value={summary?.platform.users ?? 0} subtitle="Active accounts" />
          <Card title="Active Subscriptions" value={summary?.platform.activeSubscriptions ?? 0} subtitle="Paying tenants" color="#4ade80" />
          <Card title="Templates" value={summary?.platform.templates ?? 0} subtitle="Industry workflow templates" />
          <Card title="Marketplace Listings" value={summary?.platform.marketplaceListings ?? 0} subtitle="Published connectors & templates" />
        </div>

        {/* ── Workflows & Executions ────────────────────────────────────── */}
        <h2 style={{ fontSize: 18, margin: "0 0 16px", color: "#c8d2ff" }}>⚡ Workflows</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 32 }}>
          <Card title="Total Workflows" value={summary?.workflows.total ?? 0} />
          <Card title="Executions" value={summary?.workflows.executions ?? 0} />
          <Card title="Active Now" value={summary?.workflows.active ?? 0} color="#facc15" />
          <Card title="Notifications Sent" value={summary?.notifications.total ?? 0} />
          <Card title="Backups Created" value={summary?.backups.total ?? 0} />
          <Card title="AI Token Usage"
            value={summary ? `${(summary.ai.totalUsage / 1000).toFixed(0)}K` : "0"}
            subtitle="Total tokens consumed"
          />
        </div>

        {/* ── Revenue ───────────────────────────────────────────────────── */}
        <h2 style={{ fontSize: 18, margin: "0 0 16px", color: "#c8d2ff" }}>💰 Revenue</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 32 }}>
          <Card title="Total Revenue" value={revenue ? formatVND(revenue.totalRevenue) : "0"} color="#4ade80" />
          <Card title="Monthly Revenue (30d)" value={revenue ? formatVND(revenue.monthlyRevenue) : "0"} subtitle="Last 30 days" color="#22d3ee" />
          <Card title="Active Subscriptions" value={revenue?.activeSubscriptions ?? 0} subtitle="Paying tenants" />
          <Card title="Paid Invoices" value={revenue?.invoices.paid ?? 0} subtitle={`of ${revenue?.invoices.total ?? 0} total`} />
          <Card title="Pending Invoices" value={revenue?.invoices.pending ?? 0} subtitle="Awaiting payment" color="#facc15" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginBottom: 32 }}>
          {/* ── Industry Adoption ────────────────────────────────────────── */}
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 24, border: "1px solid rgba(255,255,255,0.06)" }}>
            <h3 style={{ fontSize: 15, margin: "0 0 16px", color: "#c8d2ff" }}>🏭 Industry Adoption</h3>
            {industries.length === 0 && (
              <div style={{ color: "#8899cc", fontSize: 13 }}>No industry data yet.</div>
            )}
            {industries.map((ind) => {
              const maxCount = Math.max(...industries.map(i => i.templateCount), 1);
              return (
                <ProgressBar
                  key={ind.industry}
                  label={ind.industry}
                  value={ind.templateCount}
                  max={maxCount}
                />
              );
            })}
          </div>

          {/* ── Connector Certification ──────────────────────────────────── */}
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 24, border: "1px solid rgba(255,255,255,0.06)" }}>
            <h3 style={{ fontSize: 15, margin: "0 0 16px", color: "#c8d2ff" }}>✅ Connector Certification</h3>
            {certStats ? (
              <>
                <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                  <div style={{ flex: 1, textAlign: "center", padding: 16, background: "rgba(255,255,255,0.04)", borderRadius: 8 }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: "#4ade80" }}>{certStats.approved}</div>
                    <div style={{ fontSize: 11, color: "#8899cc", marginTop: 4 }}>Approved</div>
                  </div>
                  <div style={{ flex: 1, textAlign: "center", padding: 16, background: "rgba(255,255,255,0.04)", borderRadius: 8 }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: "#facc15" }}>{certStats.pending}</div>
                    <div style={{ fontSize: 11, color: "#8899cc", marginTop: 4 }}>Pending</div>
                  </div>
                  <div style={{ flex: 1, textAlign: "center", padding: 16, background: "rgba(255,255,255,0.04)", borderRadius: 8 }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: "#f87171" }}>{certStats.rejected}</div>
                    <div style={{ fontSize: 11, color: "#8899cc", marginTop: 4 }}>Rejected</div>
                  </div>
                </div>
                <ProgressBar label="Approval Rate" value={certStats.approvalRate} max={100} />
                <div style={{ marginTop: 12, fontSize: 12, color: "#8899cc" }}>
                  {certStats.total} total submissions · {certStats.expired} expired
                </div>
              </>
            ) : (
              <div style={{ color: "#8899cc", fontSize: 13 }}>
                No certification data yet. Submit a connector to start.
              </div>
            )}
          </div>
        </div>

        {/* ── Invoices Breakdown ─────────────────────────────────────────── */}
        {revenue && revenue.invoices.total > 0 && (
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 24, border: "1px solid rgba(255,255,255,0.06)", marginBottom: 32 }}>
            <h3 style={{ fontSize: 15, margin: "0 0 16px", color: "#c8d2ff" }}>📄 Invoice Status</h3>
            <ProgressBar label="Paid" value={revenue.invoices.paid} max={revenue.invoices.total} />
            <ProgressBar label="Pending" value={revenue.invoices.pending} max={revenue.invoices.total} />
            <div style={{ fontSize: 12, color: "#8899cc", marginTop: 8 }}>
              {Math.round((revenue.invoices.paid / Math.max(revenue.invoices.total, 1)) * 100)}% payment rate
            </div>
          </div>
        )}

        {/* ── Capabilities ──────────────────────────────────────────────── */}
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 24, border: "1px solid rgba(255,255,255,0.06)" }}>
          <h3 style={{ fontSize: 15, margin: "0 0 12px", color: "#c8d2ff" }}>🔌 Analytics Capabilities</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[
              { name: "Platform Summary", ok: true },
              { name: "Revenue Tracking", ok: true },
              { name: "Tenant Analytics", ok: true },
              { name: "Industry Adoption", ok: true },
              { name: "Time Series", ok: false },
              { name: "Benchmarks", ok: false },
            ].map((c) => (
              <span key={c.name} style={{
                padding: "4px 12px", borderRadius: 999, fontSize: 12,
                background: c.ok ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
                color: c.ok ? "#4ade80" : "#f87171",
                border: `1px solid ${c.ok ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`,
              }}>
                {c.ok ? "✅" : "⏳"} {c.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
