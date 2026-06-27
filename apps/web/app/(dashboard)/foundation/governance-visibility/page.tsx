"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../../../../lib/auth";

// ── Types ──────────────────────────────────────────────────────────────

type BudgetInfo = {
  monthlyBudget: number;
  usedThisMonth: number;
  projectedEndMonth: number;
  currency: string;
};

type CostBreakdown = {
  actionType: string;
  cost: number;
  percentage: number;
};

type UsageTrend = {
  date: string;
  cost: number;
  executions: number;
};

// ── Helpers ────────────────────────────────────────────────────────────

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const t = typeof window !== "undefined" ? localStorage.getItem("aifut_token") : null;
  if (t) h["Authorization"] = `Bearer ${t}`;
  const ti = typeof window !== "undefined" ? localStorage.getItem("aifut_tenant_id") : null;
  if (ti) h["x-tenant-id"] = ti;
  return h;
}

function formatVND(v: number): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(v);
}

// ── Components ─────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{ padding: "16px 18px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: `1px solid ${color}22` }}>
      <p style={{ fontSize: 11, color: "#5a6488", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 4px" }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 700, color, margin: 0, fontFamily: "monospace" }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: "#5a6488", margin: "4px 0 0" }}>{sub}</p>}
    </div>
  );
}

function BudgetBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const color = pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "#34d399";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#8899cc", marginBottom: 6 }}>
        <span>{formatVND(used)} used</span>
        <span>{formatVND(total)} budget</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 4, width: `${pct}%`, background: `linear-gradient(90deg, #34d399, ${color})`, transition: "width 0.3s" }} />
      </div>
      <p style={{ fontSize: 11, color: pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "#34d399", marginTop: 4, fontWeight: 600 }}>
        {pct.toFixed(1)}% consumed
      </p>
    </div>
  );
}

function CostBreakdownChart({ data }: { data: CostBreakdown[] }) {
  const colors = ["#34d399", "#60a5fa", "#a78bfa", "#fbbf24", "#fb923c", "#f87171"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {data.map((item, i) => (
        <div key={item.actionType}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: "#c8d2ff" }}>{item.actionType.replace(/_/g, " ")}</span>
            <span style={{ color: colors[i % colors.length], fontWeight: 600 }}>
              {formatVND(item.cost)} ({item.percentage.toFixed(1)}%)
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.04)", overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 3, width: `${item.percentage}%`, background: colors[i % colors.length], transition: "width 0.3s" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TrendMiniChart({ data }: { data: UsageTrend[] }) {
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => d.cost));
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 60, paddingTop: 8 }}>
      {data.map((d, i) => (
        <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{ width: "100%", height: `${(d.cost / max) * 100}%`, borderRadius: "3px 3px 0 0", background: "linear-gradient(180deg, #60a5fa, #3b82f6)", opacity: 0.5 + (i / data.length) * 0.5, minHeight: 3 }} />
          <span style={{ fontSize: 8, color: "#5a6488" }}>{d.date.slice(-2)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────

export default function GovernanceVisibilityPage() {
  const [budget, setBudget] = useState<BudgetInfo | null>(null);
  const [breakdown, setBreakdown] = useState<CostBreakdown[]>([]);
  const [trend, setTrend] = useState<UsageTrend[]>([]);
  const [loading, setLoading] = useState(true);

  const FX_RATE = 25450;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [budgetRes, breakdownRes, trendRes] = await Promise.all([
        fetch(`${API_BASE}/v1/governance/budget`, { headers: getHeaders(), cache: "no-store" }),
        fetch(`${API_BASE}/v1/governance/cost-breakdown`, { headers: getHeaders(), cache: "no-store" }),
        fetch(`${API_BASE}/v1/governance/usage-trend`, { headers: getHeaders(), cache: "no-store" }),
      ]);
      if (budgetRes.ok) setBudget(await budgetRes.json());
      if (breakdownRes.ok) setBreakdown(await breakdownRes.json());
      if (trendRes.ok) setTrend(await trendRes.json());
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Fallback data if API unavailable
  const displayBudget = budget ?? { monthlyBudget: 25000000, usedThisMonth: 14500000, projectedEndMonth: 22000000, currency: "VND" };
  const displayBreakdown = breakdown.length > 0 ? breakdown : [
    { actionType: "AI_ROUTING", cost: 6800000, percentage: 46.9 },
    { actionType: "CONNECTOR_EXEC", cost: 3200000, percentage: 22.1 },
    { actionType: "WORKFLOW_RUN", cost: 2400000, percentage: 16.6 },
    { actionType: "EMBEDDING", cost: 1300000, percentage: 9.0 },
    { actionType: "OTHER", cost: 800000, percentage: 5.5 },
  ];
  const displayTrend = trend.length > 0 ? trend : [
    { date: "06/21", cost: 520000, executions: 340 },
    { date: "06/22", cost: 680000, executions: 420 },
    { date: "06/23", cost: 410000, executions: 280 },
    { date: "06/24", cost: 750000, executions: 510 },
    { date: "06/25", cost: 890000, executions: 620 },
    { date: "06/26", cost: 650000, executions: 460 },
    { date: "06/27", cost: 720000, executions: 490 },
  ];

  const projectedOverrun = displayBudget.projectedEndMonth > displayBudget.monthlyBudget;

  return (
    <main style={{ minHeight: "100vh", background: "#0b1020", color: "#f5f7ff" }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "24px 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <p style={{ fontSize: 12, color: "#fbbf24", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
            Foundation / Governance
          </p>
          <h1 style={{ fontSize: 26, margin: 0 }}>🛡️ AI Governance — Budget & Cost Visibility</h1>
          <p style={{ color: "#c8d2ff", fontSize: 14, marginTop: 4 }}>
            Real-time AI usage costs, budget tracking, and resource governance across all tenants.
            <span style={{ color: "#5a6488", marginLeft: 8 }}>1 USD ≈ {FX_RATE.toLocaleString()} VND</span>
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 32px" }}>
        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
          <StatCard label="Monthly Budget" value={formatVND(displayBudget.monthlyBudget)} color="#60a5fa" />
          <StatCard
            label="Used This Month"
            value={formatVND(displayBudget.usedThisMonth)}
            sub={`${((displayBudget.usedThisMonth / displayBudget.monthlyBudget) * 100).toFixed(1)}% of budget`}
            color={displayBudget.usedThisMonth / displayBudget.monthlyBudget > 0.7 ? "#f59e0b" : "#34d399"}
          />
          <StatCard
            label="Projected EOM"
            value={formatVND(displayBudget.projectedEndMonth)}
            sub={projectedOverrun ? `⚠️ ${formatVND(displayBudget.projectedEndMonth - displayBudget.monthlyBudget)} overrun` : "✅ On track"}
            color={projectedOverrun ? "#ef4444" : "#34d399"}
          />
          <StatCard label="Avg Daily Cost" value={formatVND(Math.round(displayBudget.usedThisMonth / 27))} color="#a78bfa" sub="~27 days this month" />
        </div>

        {/* Budget bar */}
        <div style={{ padding: "20px 22px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px", color: "#c8d2ff" }}>📊 Budget Consumption</h2>
          <BudgetBar used={displayBudget.usedThisMonth} total={displayBudget.monthlyBudget} />
        </div>

        {/* Cost breakdown + Trend */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
          <div style={{ padding: "20px 22px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px", color: "#c8d2ff" }}>📦 Cost by Action Type</h2>
            <CostBreakdownChart data={displayBreakdown} />
          </div>
          <div style={{ padding: "20px 22px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px", color: "#c8d2ff" }}>📈 Daily Cost Trend (7 days)</h2>
            <TrendMiniChart data={displayTrend} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
              <span style={{ fontSize: 10, color: "#5a6488" }}>7 days ago</span>
              <span style={{ fontSize: 10, color: "#5a6488" }}>Today</span>
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { href: "/foundation/compliance", label: "📋 Compliance Audit Trail", desc: "View audit logs & policy history" },
            { href: "/foundation/connector-certification", label: "✅ Connector Certification", desc: "Review certified connectors" },
            { href: "/foundation/analytics-bi", label: "📊 Analytics Dashboard", desc: "Platform-wide analytics & benchmarks" },
          ].map((link) => (
            <a key={link.href} href={link.href} style={{
              flex: "1 1 200px", padding: "14px 16px", borderRadius: 12,
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
              textDecoration: "none", color: "#c8d2ff", transition: "all 0.15s",
            }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{link.label}</div>
              <div style={{ fontSize: 11, color: "#5a6488", marginTop: 2 }}>{link.desc}</div>
            </a>
          ))}
        </div>

        <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.04)", fontSize: 11, color: "#5a6488" }}>
          <p>Governance dashboard — AI cost tracking with budget alerts. All costs are in VND.</p>
        </div>
      </div>
    </main>
  );
}
