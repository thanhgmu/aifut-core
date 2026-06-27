"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../../../../lib/auth";

// ── Types ────────────────────────────────────────────────────────────────

type AuditEntry = {
  id: string;
  timestamp: string;
  actor: string;
  actorType: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
};

type PaginatedAudit = {
  items: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type ComplianceReport = {
  period: { from: string; to: string };
  summary: {
    totalActions: number;
    uniqueActors: number;
    uniqueActions: number;
    topActions: Array<{ action: string; count: number }>;
    topActors: Array<{ actor: string; count: number }>;
    actionsByDay: Array<{ date: string; count: number }>;
  };
  generatedAt: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const t = typeof window !== "undefined" ? localStorage.getItem("aifut_token") : null;
  if (t) h["Authorization"] = `Bearer ${t}`;
  const ti = typeof window !== "undefined" ? localStorage.getItem("aifut_tenant_id") : null;
  if (ti) h["x-tenant-id"] = ti;
  return h;
}

function shorten(str: string | null, len: number = 30): string {
  if (!str) return "—";
  return str.length > len ? str.slice(0, len) + "..." : str;
}

function formatDate(ts: string): string {
  return new Date(ts).toLocaleDateString("vi-VN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDateShort(ts: string): string {
  return new Date(ts).toLocaleDateString("vi-VN", {
    month: "2-digit", day: "2-digit",
  });
}

const ACTOR_TYPE_STYLES: Record<string, string> = {
  user: "border-sky-200 bg-sky-50 text-sky-700",
  system: "border-slate-200 bg-slate-50 text-slate-700",
  api: "border-amber-200 bg-amber-50 text-amber-700",
  webhook: "border-purple-200 bg-purple-50 text-purple-700",
};

// ── Main Page ────────────────────────────────────────────────────────────

export default function CompliancePage() {
  const [tab, setTab] = useState<"audit-log" | "report">("audit-log");

  // Audit log state
  const [auditLog, setAuditLog] = useState<PaginatedAudit | null>(null);
  const [loadingLog, setLoadingLog] = useState(true);
  const [page, setPage] = useState(1);
  const [filterAction, setFilterAction] = useState("");
  const [filterActorType, setFilterActorType] = useState("");
  const [filterTargetType, setFilterTargetType] = useState("");

  // Report state
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportFrom, setReportFrom] = useState(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
  const [reportTo, setReportTo] = useState(new Date().toISOString().slice(0, 10));
  const [exportMsg, setExportMsg] = useState("");

  const fetchAuditLog = useCallback(async (p: number) => {
    setLoadingLog(true);
    const params = new URLSearchParams();
    params.set("page", String(p));
    params.set("pageSize", "20");
    if (filterAction) params.set("action", filterAction);
    if (filterActorType) params.set("actorType", filterActorType);
    if (filterTargetType) params.set("targetType", filterTargetType);

    try {
      const res = await fetch(`${API_BASE}/v1/compliance/audit-log?${params}`, { headers: getHeaders() });
      if (res.ok) setAuditLog(await res.json());
    } catch { /* silent */ }
    setLoadingLog(false);
  }, [filterAction, filterActorType, filterTargetType]);

  useEffect(() => { setPage(1); }, [filterAction, filterActorType, filterTargetType]);
  useEffect(() => { fetchAuditLog(page); }, [page, fetchAuditLog]);

  const fetchReport = useCallback(async () => {
    setLoadingReport(true);
    try {
      const params = new URLSearchParams();
      if (reportFrom) params.set("from", new Date(reportFrom).toISOString());
      if (reportTo) params.set("to", new Date(reportTo + "T23:59:59").toISOString());
      const res = await fetch(`${API_BASE}/v1/compliance/report?${params}`, { headers: getHeaders() });
      if (res.ok) setReport(await res.json());
    } catch { /* silent */ }
    setLoadingReport(false);
  }, [reportFrom, reportTo]);

  useEffect(() => { if (tab === "report") fetchReport(); }, [tab, fetchReport]);

  const doExport = async () => {
    setExportMsg("");
    try {
      const params = new URLSearchParams();
      params.set("format", "csv");
      if (reportFrom) params.set("from", new Date(reportFrom).toISOString());
      if (reportTo) params.set("to", new Date(reportTo + "T23:59:59").toISOString());

      const res = await fetch(`${API_BASE}/v1/compliance/export?${params}`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        // Download via blob
        const blob = new Blob([data.data], { type: data.mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = data.filename;
        a.click();
        URL.revokeObjectURL(url);
        setExportMsg("✅ Exported!");
      }
    } catch {
      setExportMsg("❌ Export failed");
    }
    setTimeout(() => setExportMsg(""), 3000);
  };

  // ── Render ───────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      {/* Toast */}
      {exportMsg && (
        <div className={`fixed right-4 top-4 z-50 rounded-lg border px-5 py-3 text-sm font-semibold shadow-lg backdrop-blur ${
          exportMsg.startsWith("✅") ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"
        }`}>
          {exportMsg}
        </div>
      )}

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        {/* Header */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-sky-700">Foundation / Compliance</p>
          <h1 className="mt-2 text-2xl font-bold tracking-normal text-slate-950">🔍 Compliance & Audit Trail</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Truy vấn nhật ký kiểm toán, tạo báo cáo tuân thủ và xuất dữ liệu phục vụ kiểm toán nội bộ.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {(["audit-log", "report"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`min-w-28 rounded-md px-4 py-2 text-sm font-semibold transition ${
                tab === t ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {t === "audit-log" ? "📋 Audit Log" : "📊 Compliance Report"}
            </button>
          ))}
        </div>

        {/* Tab: Audit Log */}
        {tab === "audit-log" && (
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            {/* Filters */}
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs font-semibold text-slate-500 mr-1">Filters:</span>
                <input value={filterAction} onChange={(e) => setFilterAction(e.target.value)}
                  placeholder="Action..." className="h-9 w-40 rounded-lg border border-slate-200 px-3 text-xs outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4" />
                <select value={filterActorType} onChange={(e) => setFilterActorType(e.target.value)}
                  className="h-9 rounded-lg border border-slate-200 px-3 text-xs outline-none">
                  <option value="">All actor types</option>
                  <option value="user">User</option>
                  <option value="system">System</option>
                  <option value="api">API</option>
                  <option value="webhook">Webhook</option>
                </select>
                <input value={filterTargetType} onChange={(e) => setFilterTargetType(e.target.value)}
                  placeholder="Target type..." className="h-9 w-40 rounded-lg border border-slate-200 px-3 text-xs outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4" />
                <span className="text-xs text-slate-400 ml-auto">
                  {auditLog ? `${auditLog.total} entries` : ""}
                </span>
              </div>
            </div>

            {loadingLog ? (
              <div className="flex items-center justify-center p-12 text-slate-400">Loading audit log...</div>
            ) : !auditLog || auditLog.items.length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-400">No audit log entries found.</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Timestamp</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Actor</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Action</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Target</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {auditLog.items.map((entry) => (
                        <tr key={entry.id} className="hover:bg-slate-50/50">
                          <td className="px-5 py-3 whitespace-nowrap text-xs text-slate-500">
                            {formatDate(entry.timestamp)}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${ACTOR_TYPE_STYLES[entry.actorType] || "border-slate-200 bg-slate-50 text-slate-600"}`}>
                                {entry.actorType}
                              </span>
                              <span className="text-sm text-slate-700">{entry.actor}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <span className="text-sm font-medium text-slate-900">{entry.action}</span>
                          </td>
                          <td className="px-5 py-3 text-sm text-slate-600">
                            {entry.targetType ? (
                              <span>
                                <span className="text-xs text-slate-400">{entry.targetType}:</span>{" "}
                                {shorten(entry.targetId)}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="px-5 py-3 text-xs text-slate-400 max-w-[200px] truncate">
                            {entry.metadata ? JSON.stringify(entry.metadata).slice(0, 80) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {auditLog.totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 border-t border-slate-100 px-5 py-4">
                    <button disabled={page <= 1} onClick={() => setPage(page - 1)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">← Prev</button>
                    <span className="text-xs text-slate-500">Page {page} / {auditLog.totalPages}</span>
                    <button disabled={page >= auditLog.totalPages} onClick={() => setPage(page + 1)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Next →</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Tab: Compliance Report */}
        {tab === "report" && (
          <div className="space-y-6">
            {/* Controls */}
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap gap-4 items-end">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">From</label>
                  <input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)}
                    className="h-9 rounded-lg border border-slate-200 px-3 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">To</label>
                  <input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)}
                    className="h-9 rounded-lg border border-slate-200 px-3 text-sm outline-none" />
                </div>
                <button onClick={fetchReport}
                  className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800">
                  {loadingReport ? "Loading..." : "Generate Report"}
                </button>
                <button onClick={doExport}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  📥 Export CSV
                </button>
              </div>
            </div>

            {/* Report Content */}
            {loadingReport ? (
              <div className="flex items-center justify-center p-12 text-slate-400">Generating report...</div>
            ) : !report ? (
              <div className="flex items-center justify-center p-12 text-slate-400">Click &quot;Generate Report&quot; to start.</div>
            ) : (
              <>
                {/* Summary Cards */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase text-slate-500">Total Actions</p>
                    <p className="mt-2 text-3xl font-bold text-slate-950">{report.summary.totalActions.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase text-slate-500">Unique Actors</p>
                    <p className="mt-2 text-3xl font-bold text-sky-700">{report.summary.uniqueActors}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase text-slate-500">Unique Actions</p>
                    <p className="mt-2 text-3xl font-bold text-emerald-700">{report.summary.uniqueActions}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase text-slate-500">Period</p>
                    <p className="mt-2 text-sm font-semibold text-slate-700">
                      {formatDateShort(report.period.from)} — {formatDateShort(report.period.to)}
                    </p>
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Top Actions */}
                  <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-sm font-semibold text-slate-950 mb-4">🔝 Top Actions</h2>
                    <div className="space-y-3">
                      {report.summary.topActions.map((item, i) => {
                        const maxCount = report.summary.topActions[0]?.count || 1;
                        return (
                          <div key={item.action}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-slate-700 truncate">{item.action}</span>
                              <span className="font-semibold text-slate-900">{item.count}</span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-100">
                              <div className="h-2 rounded-full bg-sky-500" style={{ width: `${(item.count / maxCount) * 100}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Top Actors */}
                  <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-sm font-semibold text-slate-950 mb-4">👤 Top Actors</h2>
                    <div className="space-y-3">
                      {report.summary.topActors.map((item, i) => {
                        const maxCount = report.summary.topActors[0]?.count || 1;
                        return (
                          <div key={item.actor}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-slate-700 truncate">{item.actor}</span>
                              <span className="font-semibold text-slate-900">{item.count}</span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-100">
                              <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${(item.count / maxCount) * 100}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Actions by Day */}
                <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-sm font-semibold text-slate-950 mb-4">📅 Actions by Day</h2>
                  <div className="flex items-end gap-1.5 h-32 overflow-x-auto pb-2">
                    {report.summary.actionsByDay.map((day) => {
                      const maxDay = Math.max(...report.summary.actionsByDay.map((d) => d.count), 1);
                      const height = (day.count / maxDay) * 100;
                      return (
                        <div key={day.date} className="flex flex-col items-center gap-1 min-w-[32px]">
                          <span className="text-xs text-slate-500">{day.count}</span>
                          <div
                            className="w-6 rounded-t bg-sky-500 transition-all"
                            style={{ height: `${Math.max(4, height)}%` }}
                            title={`${day.date}: ${day.count} actions`}
                          />
                          <span className="text-[10px] text-slate-400">{day.date.slice(5)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <p className="text-xs text-slate-400 text-center">
                  Report generated at {new Date(report.generatedAt).toLocaleString("vi-VN")}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
