"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "../../../../lib/auth";

// ── Types ────────────────────────────────────────────────────────────────

type PlatformHealth = {
  timestamp: string;
  activeTenants: number;
  growthTenants: number;
  totalExecutions: number;
  executionSuccessRate: number;
  totalAiTokens: string;
  totalRevenue: string;
  anomalyCount: number;
  topIndustries: Array<{ industry: string; count: number }>;
  topCostTenants: Array<{ tenantSlug: string; totalCost: string }>;
};

type TimeGrain = "hourly" | "daily" | "monthly";
type AnomalyStatus = "open" | "investigating" | "resolved" | "ignored";

type AnomalyRecord = {
  id: string;
  anomalyType: string;
  severityScore: number;
  workspaceId: string;
  status: AnomalyStatus;
  detectedAt: string;
};

// ── Static data (anomalies are for demo — real backend returns them) ────

const timeGrains: Array<{ value: TimeGrain; label: string }> = [
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "monthly", label: "Monthly" },
];

const statusLabels: Record<AnomalyStatus, string> = {
  open: "Open",
  investigating: "Investigating",
  resolved: "Resolved",
  ignored: "Ignored",
};

const statusClassNames: Record<AnomalyStatus, string> = {
  open: "border-rose-200 bg-rose-50 text-rose-700",
  investigating: "border-amber-200 bg-amber-50 text-amber-700",
  resolved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  ignored: "border-slate-200 bg-slate-50 text-slate-600",
};

// ── Helpers ──────────────────────────────────────────────────────────────

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const t = typeof window !== "undefined" ? localStorage.getItem("aifut_token") : null;
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}

function formatCurrency(v: string | number): string {
  const n = typeof v === "string" ? Number(v) : v;
  if (isNaN(n)) return "—";
  // Values are in VND*100 (BigInt cents). Divide by 100.
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(n / 100);
}

function formatNumber(v: number): string {
  return new Intl.NumberFormat("en-US").format(v);
}

// ── Components ───────────────────────────────────────────────────────────

function FilterToolbar({
  timeGrain,
  loading,
  onTimeGrainChange,
}: {
  timeGrain: TimeGrain;
  loading: boolean;
  onTimeGrainChange: (value: TimeGrain) => void;
}) {
  return (
    <section className="flex flex-col gap-3 border-b border-slate-200 bg-white px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h2 className="text-sm font-semibold text-slate-950">Filter Toolbar</h2>
        <p className="mt-1 text-xs text-slate-500">
          Điều phối mốc thời gian cho dashboard phân tích toàn sàn.
        </p>
      </div>
      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
        {timeGrains.map((item) => (
          <button
            key={item.value}
            type="button"
            disabled={loading}
            onClick={() => onTimeGrainChange(item.value)}
            className={`min-w-20 rounded-md px-3 py-2 text-xs font-semibold transition ${
              timeGrain === item.value
                ? "bg-white text-slate-950 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function ExecutiveMetricCard({
  label,
  value,
  detail,
  loading,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  loading?: boolean;
  tone: "emerald" | "sky" | "rose" | "amber";
}) {
  const toneClassName =
    tone === "emerald" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : tone === "sky" ? "border-sky-200 bg-sky-50 text-sky-700"
    : tone === "rose" ? "border-rose-200 bg-rose-50 text-rose-700"
    : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClassName}`}>
        {label}
      </div>
      <div className="mt-4 text-3xl font-bold tracking-normal text-slate-950">
        {loading ? <span className="text-slate-300">...</span> : value}
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p>
    </article>
  );
}

function BenchmarkBar({ label, current, median, higherIsBetter, unit }: {
  label: string;
  current: number;
  median: number;
  higherIsBetter: boolean;
  unit: string;
}) {
  const maxValue = Math.max(current, median, 1);
  const delta = current - median;
  const isBetter = higherIsBetter ? current >= median : current <= median;
  const deltaLabel = unit === "%"
    ? `${delta >= 0 ? "+" : ""}${delta.toFixed(2)} pts`
    : `${delta >= 0 ? "+" : ""}${Math.round(delta)} ${unit}`;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">{label}</h3>
          <p className="mt-1 text-xs text-slate-500">Platform so với Benchmark</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
          isBetter ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-rose-700 bg-rose-50 border-rose-200"
        }`}>{deltaLabel}</span>
      </div>
      <div className="mt-5 space-y-4">
        <div>
          <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-600">
            <span>Current</span>
            <span>{unit === "%" ? `${current.toFixed(2)}%` : `${Math.round(current)} ${unit}`}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-sky-600" style={{ width: `${Math.max(8, Math.min(100, (current / maxValue) * 100))}%` }} />
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-600">
            <span>Platform median</span>
            <span>{unit === "%" ? `${median.toFixed(2)}%` : `${Math.round(median)} ${unit}`}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-slate-400" style={{ width: `${Math.max(8, Math.min(100, (median / maxValue) * 100))}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function AnomalyAlertTable({
  records,
  loadingActionId,
  onIgnore,
  onRepair,
}: {
  records: AnomalyRecord[];
  loadingActionId: string | null;
  onIgnore: (recordId: string) => void;
  onRepair: (recordId: string) => void;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-950">Anomaly Alert Table</h2>
        <p className="mt-1 text-sm text-slate-500">
          Cảnh báo tài nguyên bất thường được phát hiện bởi lớp phân tích vận hành.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Anomaly Type</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Severity</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Workspace</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Status</th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase text-slate-500">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {records.map((record) => {
              const isLoading = loadingActionId === record.id;
              const canAct = record.status !== "resolved" && record.status !== "ignored";
              return (
                <tr key={record.id}>
                  <td className="px-5 py-4">
                    <div className="font-medium text-slate-950">{record.anomalyType}</div>
                    <div className="mt-1 text-xs text-slate-500">{record.id} · {record.detectedAt}</div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex min-w-36 items-center gap-3">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${
                          record.severityScore >= 80 ? "bg-rose-500" : record.severityScore >= 60 ? "bg-amber-500" : "bg-sky-500"
                        }`} style={{ width: `${record.severityScore}%` }} />
                      </div>
                      <span className="text-sm font-semibold text-slate-800">{record.severityScore}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm font-medium text-slate-600">{record.workspaceId}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClassNames[record.status]}`}>
                      {statusLabels[record.status]}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <button type="button" disabled={!canAct || isLoading} onClick={() => onIgnore(record.id)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45">
                        {isLoading ? "..." : "Ignore"}
                      </button>
                      <button type="button" disabled={!canAct || isLoading} onClick={() => onRepair(record.id)}
                        className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">
                        {isLoading ? "..." : "Repair"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────

export default function AnalyticsBiDashboardPage() {
  const [health, setHealth] = useState<PlatformHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeGrain, setTimeGrain] = useState<TimeGrain>("daily");
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);

  // Demo anomalies (the backend anomaly data comes from AnomalyRecord table)
  const [anomalyRecords] = useState<AnomalyRecord[]>([
    { id: "ANM-24091", anomalyType: "Token spike above learned tenant baseline", severityScore: 92, workspaceId: "ws-enterprise-core", status: "open", detectedAt: "08:15" },
    { id: "ANM-24088", anomalyType: "Revenue event delay near checkout flow", severityScore: 76, workspaceId: "ws-retail-alpha", status: "investigating", detectedAt: "07:42" },
    { id: "ANM-24074", anomalyType: "Embedding cache miss burst", severityScore: 61, workspaceId: "ws-finops-lab", status: "resolved", detectedAt: "06:30" },
    { id: "ANM-24063", anomalyType: "Repeated billing webhook retry", severityScore: 48, workspaceId: "ws-enterprise-core", status: "open", detectedAt: "05:05" },
  ]);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/v1/analytics/health`, { headers: getHeaders(), cache: "no-store" });
      if (res.ok) setHealth(await res.json());
    } catch {
      // Keep existing or null
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  const runMockAction = (recordId: string) => {
    setLoadingActionId(recordId);
    window.setTimeout(() => setLoadingActionId(null), 850);
  };

  // Compute derived metrics
  const successRate = health ? (health.executionSuccessRate * 100).toFixed(2) + "%" : "—";
  const revenueGrowth = health && health.totalRevenue
    ? `${formatCurrency(health.totalRevenue)}`
    : "—";

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <FilterToolbar timeGrain={timeGrain} loading={loading} onTimeGrainChange={setTimeGrain} />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-sky-700">
              Foundation / Analytics BI
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-normal text-slate-950">
              Bảng điều khiển Phân tích doanh nghiệp
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Phân tích hiệu năng toàn sàn, tốc độ tăng trưởng, biên token AI và cảnh báo tài nguyên bất thường.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
            <span className="text-slate-500">Cadence</span>
            <strong className="ml-2 text-slate-950">{timeGrain.toUpperCase()}</strong>
          </div>
        </header>

        {/* Executive Metrics — 4-column */}
        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <ExecutiveMetricCard
            label="Active Tenants"
            value={health ? formatNumber(health.activeTenants) : "—"}
            detail={health ? `+${health.growthTenants} new in last 30 days` : "Loading..."}
            tone="emerald"
          />
          <ExecutiveMetricCard
            label="Total Executions"
            value={health ? formatNumber(health.totalExecutions) : "—"}
            detail="Workflow executions in last 24 hours"
            tone="sky"
          />
          <ExecutiveMetricCard
            label="Success Rate"
            value={successRate}
            detail="Execution success rate across all tenants"
            tone={health && health.executionSuccessRate >= 0.95 ? "emerald" : "amber"}
          />
          <ExecutiveMetricCard
            label="Revenue (24h)"
            value={revenueGrowth}
            detail={health ? `Anomalies: ${health.anomalyCount}` : "Loading..."}
            tone="sky"
          />
        </section>

        {/* Benchmark Section */}
        <section className="grid gap-5 lg:grid-cols-[1.35fr_0.85fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950">Platform Benchmark</h2>
                <p className="mt-1 text-sm text-slate-500">
                  So sánh Success Rate và Execution count giữa platform hiện tại và benchmark.
                </p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                Global Benchmark
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <BenchmarkBar
                label="Execution Success Rate"
                current={health ? health.executionSuccessRate * 100 : 97}
                median={97.5}
                higherIsBetter={true}
                unit="%"
              />
              <BenchmarkBar
                label="Active Tenants"
                current={health ? health.activeTenants : 0}
                median={50}
                higherIsBetter={true}
                unit="count"
              />
            </div>
          </div>

          <div className="space-y-5">
            {/* Top Industries */}
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-950">Top Industries</h2>
              <div className="mt-4 space-y-3">
                {health && health.topIndustries.length > 0 ? health.topIndustries.map((ind) => (
                  <div key={ind.industry} className="flex items-center justify-between">
                    <span className="text-sm text-slate-700 capitalize">{ind.industry}</span>
                    <span className="text-sm font-semibold text-slate-900">{ind.count}</span>
                  </div>
                )) : (
                  <p className="text-sm text-slate-400">No industry data yet.</p>
                )}
              </div>
            </div>

            {/* Quick summary */}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-emerald-800">Platform Health</h2>
              <p className="mt-2 text-sm text-emerald-700">
                {loading ? "Loading..." : health
                  ? `✅ ${health.activeTenants} active tenants · ${health.anomalyCount} anomalies`
                  : "⚠️ Unable to fetch health data. Check API connection."
                }
              </p>
            </div>
          </div>
        </section>

        <AnomalyAlertTable
          records={anomalyRecords}
          loadingActionId={loadingActionId}
          onIgnore={runMockAction}
          onRepair={runMockAction}
        />
      </div>
    </main>
  );
}
