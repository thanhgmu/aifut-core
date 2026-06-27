"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "../../../../lib/auth";

// ── Types ────────────────────────────────────────────────────────────────

type ChecklistItem = {
  id: string;
  label: string;
  description: string;
  required: boolean;
};

type ChecklistResponse = {
  standard: string;
  version: string;
  items: ChecklistItem[];
  total: number;
  required: number;
};

type CertStats = {
  total: number;
  certified: number;
  pending: number;
  rejected: number;
  byTier?: Record<string, number>;
};

type ConnectorStatus = "Certified" | "Pending" | "Failed Test";

type Connector = {
  id: string;
  name: string;
  developer: string;
  category: string;
  status: ConnectorStatus;
  securityScore: number;
  sandboxQueue: number;
  icon: string;
};

const connectors: Connector[] = [
  { id: "zalo-zns", name: "Zalo ZNS", developer: "AIFUT Vietnam Labs", category: "Messaging", status: "Certified", securityScore: 100, sandboxQueue: 0, icon: "ZN" },
  { id: "vnpay-gateway", name: "VNPay Gateway", developer: "Payment Bridge Team", category: "Payment", status: "Certified", securityScore: 100, sandboxQueue: 0, icon: "VP" },
  { id: "gmail-automation", name: "Gmail Automation", developer: "Workspace Automation", category: "Email", status: "Pending", securityScore: 86, sandboxQueue: 5, icon: "GM" },
  { id: "shopify-sync", name: "Shopify Sync", developer: "Commerce Ops", category: "Commerce", status: "Certified", securityScore: 100, sandboxQueue: 0, icon: "SH" },
  { id: "notion-knowledge", name: "Notion Knowledge", developer: "Knowledge Graph Unit", category: "Knowledge Base", status: "Pending", securityScore: 91, sandboxQueue: 3, icon: "NT" },
  { id: "telegram-bot-relay", name: "Telegram Bot Relay", developer: "Realtime Channel Team", category: "ChatOps", status: "Failed Test", securityScore: 68, sandboxQueue: 8, icon: "TG" },
];

const statusStyles: Record<ConnectorStatus, string> = {
  Certified: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Pending: "border-amber-200 bg-amber-50 text-amber-700",
  "Failed Test": "border-rose-200 bg-rose-50 text-rose-700",
};

// ── Tier Badge Config ────────────────────────────────────────────────────

const TIERS = [
  { key: "BRONZE", label: "🥉 Bronze", desc: "Basic security & functionality checks", minScore: 60 },
  { key: "SILVER", label: "🥈 Silver", desc: "Advanced validation + test coverage", minScore: 80 },
  { key: "GOLD", label: "🥇 Gold", desc: "Full audit + performance benchmarks", minScore: 90 },
  { key: "PLATINUM", label: "💎 Platinum", desc: "Highest trust tier — enterprise ready", minScore: 100 },
];

function TierDisplayCard({ tier, index }: { tier: typeof TIERS[0]; index: number }) {
  const colors = [
    "border-amber-300 bg-amber-50",
    "border-slate-300 bg-slate-50",
    "border-yellow-300 bg-yellow-50",
    "border-cyan-300 bg-cyan-50",
  ];
  return (
    <div className={`rounded-lg border p-4 ${colors[index]} shadow-sm`}>
      <div className="flex items-center justify-between">
        <span className="text-lg font-bold">{tier.label}</span>
        <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-semibold">
          Score {tier.minScore}+
        </span>
      </div>
      <p className="mt-1 text-sm opacity-75">{tier.desc}</p>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const t = typeof window !== "undefined" ? localStorage.getItem("aifut_token") : null;
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}

// ── Main Page ────────────────────────────────────────────────────────────

export default function ConnectorCertificationPage() {
  const [runningId, setRunningId] = useState<string | null>(null);
  const [submittedIds, setSubmittedIds] = useState<string[]>([]);
  const [checklist, setChecklist] = useState<ChecklistResponse | null>(null);
  const [stats, setStats] = useState<CertStats | null>(null);
  const [loadingChecklist, setLoadingChecklist] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Submit form
  const [submitOpen, setSubmitOpen] = useState(false);
  const [connectorKey, setConnectorKey] = useState("");
  const [connectorName, setConnectorName] = useState("");
  const [devEmail, setDevEmail] = useState("");
  const [devName, setDevName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoadingChecklist(true);
    try {
      const [checklistRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/certification/checklist`, { headers: getHeaders() }),
        fetch(`${API_BASE}/certification/stats/summary`, { headers: getHeaders() }),
      ]);
      if (checklistRes.ok) setChecklist(await checklistRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch {
      // silent
    } finally {
      setLoadingChecklist(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const metrics = useMemo(() => {
    const certified = connectors.filter((c) => c.status === "Certified").length;
    const queued = connectors.reduce((t, c) => t + c.sandboxQueue, 0);
    return [
      { label: "Connectors", value: connectors.length.toString(), detail: "Đang hoạt động trong foundation layer" },
      { label: "Certified", value: certified.toString(), detail: "Đạt tiêu chí chứng nhận marketplace" },
      { label: "Queue", value: queued.toString(), detail: "Đang đợi kiểm thử tự động" },
    ];
  }, []);

  const runSandbox = (connectorId: string) => {
    if (runningId) return;
    setRunningId(connectorId);
    setTimeout(() => setRunningId(null), 1200);
  };

  const submitToMarketplace = (connectorId: string) => {
    setSubmittedIds((current) => current.includes(connectorId) ? current : [...current, connectorId]);
  };

  const doSubmitCert = async () => {
    if (!connectorKey.trim() || !connectorName.trim()) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const ti = typeof window !== "undefined" ? localStorage.getItem("aifut_tenant_id") : "demo";
      const res = await fetch(`${API_BASE}/certification/submit`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          tenantId: ti,
          connectorKey: connectorKey.trim(),
          connectorName: connectorName.trim(),
          developerEmail: devEmail.trim() || undefined,
          developerName: devName.trim() || undefined,
        }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: "✅ Submitted for certification!" });
        setSubmitOpen(false);
        setConnectorKey("");
        setConnectorName("");
        fetchData();
      } else {
        const err = await res.json();
        throw new Error(err.message || "Submit failed");
      }
    } catch (err: any) {
      setMessage({ type: "error", text: `❌ ${err.message}` });
    } finally {
      setSubmitting(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#f8fafc_0,#eef6ff_32%,#f7faf9_58%,#ffffff_100%)] px-5 py-8 text-slate-950 sm:px-8 lg:px-10">
      {/* Toast */}
      {message && (
        <div className={`fixed right-4 top-4 z-50 rounded-lg border px-5 py-3 text-sm font-semibold shadow-lg backdrop-blur ${
          message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"
        }`}>
          {message.text}
        </div>
      )}

      {/* Submit Modal */}
      {submitOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setSubmitOpen(false)}>
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-950">Submit for Certification</h2>
            <p className="mt-1 text-sm text-slate-500">Submit a connector for AIS certification review.</p>
            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Connector Key *</label>
                <input value={connectorKey} onChange={(e) => setConnectorKey(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4"
                  placeholder="e.g. my-connector" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Connector Name *</label>
                <input value={connectorName} onChange={(e) => setConnectorName(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4"
                  placeholder="e.g. My Awesome Connector" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Developer Email</label>
                  <input value={devEmail} onChange={(e) => setDevEmail(e.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4"
                    placeholder="dev@example.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Developer Name</label>
                  <input value={devName} onChange={(e) => setDevName(e.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4"
                    placeholder="Your name" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setSubmitOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
                <button onClick={doSubmitCert} disabled={submitting || !connectorKey.trim() || !connectorName.trim()}
                  className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300">
                  {submitting ? "Submitting..." : "Submit"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <section className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-700">
              Foundation / Connector Certification
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
              Chương trình chứng nhận kết nối
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Quản lý trạng thái chứng nhận, điểm bảo mật và luồng sandbox
              trước khi đưa connector lên Marketplace.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 rounded-lg border border-cyan-100 bg-white/75 px-4 py-3 shadow-sm backdrop-blur">
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-500" />
              <span className="text-sm font-medium text-slate-700">
                AIS {checklist?.version ?? "—"} · {checklist?.required ?? "—"} checks
              </span>
            </div>
            <button onClick={() => setSubmitOpen(true)}
              className="rounded-lg bg-cyan-600 px-4 py-3 text-sm font-semibold text-white hover:bg-cyan-500 transition">
              + Submit Connector
            </button>
          </div>
        </div>

        {/* Tier Display */}
        <section>
          <h2 className="text-lg font-semibold text-slate-950 mb-3">Chứng nhận theo Tier</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TIERS.map((tier, i) => <TierDisplayCard key={tier.key} tier={tier} index={i} />)}
          </div>
        </section>

        {/* Metrics */}
        <section className="grid gap-4 md:grid-cols-3">
          {metrics.map((metric) => (
            <article key={metric.label} className="rounded-lg border border-white/80 bg-white/70 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
              <p className="text-sm font-medium text-slate-500">{metric.label}</p>
              <div className="mt-4 flex items-end justify-between gap-4">
                <strong className="text-4xl font-semibold tracking-normal text-slate-950">{metric.value}</strong>
                <span className="rounded-full border border-cyan-100 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">Live</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">{metric.detail}</p>
            </article>
          ))}
        </section>

        {/* Checklist Section */}
        {checklist && (
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-950">Certification Checklist</h2>
            <p className="mt-1 text-sm text-slate-500">
              {checklist.standard} v{checklist.version} · {checklist.total} items ({checklist.required} required)
            </p>
            <div className="mt-4 space-y-2">
              {checklist.items.slice(0, 6).map((item) => (
                <div key={item.id} className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-3">
                  <span className={`mt-0.5 text-sm ${item.required ? "text-rose-500" : "text-slate-400"}`}>
                    {item.required ? "🔴" : "⚪"}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{item.label}</p>
                    <p className="text-xs text-slate-500">{item.description}</p>
                  </div>
                </div>
              ))}
              {checklist.items.length > 6 && (
                <p className="text-center text-xs text-slate-400 pt-2">
                  +{checklist.items.length - 6} more items
                </p>
              )}
            </div>
          </div>
        )}

        {/* Connector Grid */}
        <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {connectors.map((connector) => {
            const isRunning = runningId === connector.id;
            const isSubmitted = submittedIds.includes(connector.id);
            const canSubmit = connector.status === "Certified" && connector.securityScore === 100;

            return (
              <article key={connector.id} className="flex min-h-[260px] flex-col justify-between rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-md">
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="grid h-12 w-12 place-items-center rounded-lg bg-slate-950 text-sm font-semibold text-white">{connector.icon}</div>
                      <div>
                        <h2 className="text-lg font-semibold text-slate-950">{connector.name}</h2>
                        <p className="mt-1 text-sm text-slate-500">{connector.category}</p>
                      </div>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${statusStyles[connector.status]}`}>
                      <span className={`h-2 w-2 rounded-full ${
                        connector.status === "Certified" ? "bg-emerald-500" : connector.status === "Pending" ? "bg-amber-500" : "bg-rose-500"
                      }`} />
                      {connector.status}
                    </span>
                  </div>
                  <div className="mt-6 space-y-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Developer</p>
                      <p className="mt-1 text-sm font-medium text-slate-700">{connector.developer}</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-600">Security Score</span>
                        <strong className="font-semibold text-slate-950">{connector.securityScore}%</strong>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-slate-100">
                        <div className={`h-2 rounded-full ${
                          connector.securityScore === 100 ? "bg-emerald-500" : connector.securityScore >= 85 ? "bg-cyan-500" : "bg-rose-500"
                        }`} style={{ width: `${connector.securityScore}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <button type="button" disabled={Boolean(runningId)} onClick={() => runSandbox(connector.id)}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-cyan-300 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-60">
                    {isRunning ? "Running..." : "Run Sandbox Test"}
                  </button>
                  <button type="button" disabled={!canSubmit || isSubmitted} onClick={() => submitToMarketplace(connector.id)}
                    className="rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                    {isSubmitted ? "Submitted" : "Submit to Marketplace"}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      </section>
    </main>
  );
}
