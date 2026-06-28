"use client";

// ═══════════════════════════════════════════════════════════════════════════
// foundation/licensing/page.tsx — On-Premise License Key Management UI
// Phase 3: Generate, list, activate, revoke licenses, feature check.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../../../../lib/auth";

// ── Types ────────────────────────────────────────────────────────────────

type License = {
  id: string; key: string; tier: string; status: string;
  tenantId: string | null; maxUsers: number; maxWorkflows: number;
  features: string[]; issuedTo: string | null; issuedEmail: string | null;
  issuedAt: string; activatedAt: string | null; expiresAt: string | null;
  isExpired: boolean; daysRemaining: number | null;
};

type LicenseListResult = { items: License[]; total: number; page: number; pageSize: number; totalPages: number };

// ── Helpers ──────────────────────────────────────────────────────────────

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const t = typeof window !== "undefined" ? localStorage.getItem("aifut_token") : null;
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}

const statusStyles: Record<string, string> = {
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  EXPIRED: "border-rose-200 bg-rose-50 text-rose-700",
  REVOKED: "border-slate-200 bg-slate-50 text-slate-500",
};

const tiers = ["STARTER", "PRO", "TEAM", "ENTERPRISE"];

function formatDate(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("vi-VN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

// ═══════════════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════════════

export default function LicensingPage() {
  const [licenses, setLicenses] = useState<LicenseListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [msg, setMsg] = useState("");

  // Generate form
  const [showGenerate, setShowGenerate] = useState(false);
  const [genForm, setGenForm] = useState({ tier: "PRO", maxUsers: 5, maxWorkflows: -1, issuedTo: "", issuedEmail: "", validityDays: 365 });
  const [generating, setGenerating] = useState(false);

  // Activation
  const [activateKey, setActivateKey] = useState("");
  const [activateTenant, setActivateTenant] = useState("");

  // Tenant license info
  const [tenantLicense, setTenantLicense] = useState<License | null>(null);
  const [tenantLoading, setTenantLoading] = useState(true);

  const fetchLicenses = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(p));
      params.set("pageSize", "20");
      if (statusFilter) params.set("status", statusFilter);
      const r = await fetch(`${API_BASE}/v1/licensing/list?${params}`, { headers: getHeaders() });
      if (r.ok) setLicenses(await r.json());
    } catch { /* noop */ }
    setLoading(false);
  }, [statusFilter]);

  const fetchTenantLicense = useCallback(async () => {
    setTenantLoading(true);
    try {
      const r = await fetch(`${API_BASE}/v1/licensing/tenant`, { headers: getHeaders() });
      if (r.ok) setTenantLicense(await r.json());
    } catch { setTenantLicense(null); }
    setTenantLoading(false);
  }, []);

  useEffect(() => { fetchLicenses(page); fetchTenantLicense(); }, [page, fetchLicenses, fetchTenantLicense]);

  const generateLicense = async () => {
    setGenerating(true); setMsg("");
    try {
      const r = await fetch(`${API_BASE}/v1/licensing/generate`, {
        method: "POST", headers: getHeaders(),
        body: JSON.stringify({
          tier: genForm.tier,
          maxUsers: genForm.maxUsers,
          maxWorkflows: genForm.maxWorkflows,
          issuedTo: genForm.issuedTo || null,
          issuedEmail: genForm.issuedEmail || null,
          validityDays: genForm.validityDays,
        }),
      });
      if (r.ok) { setMsg("✅ License generated!"); setShowGenerate(false); fetchLicenses(page); }
      else { const err = await r.json(); setMsg(`❌ ${err.message || "Failed"}`); }
    } catch { setMsg("❌ Network error"); }
    setGenerating(false);
    setTimeout(() => setMsg(""), 4000);
  };

  const activateLicense = async () => {
    if (!activateKey || !activateTenant) return;
    setMsg("");
    try {
      const r = await fetch(`${API_BASE}/v1/licensing/activate`, {
        method: "POST", headers: getHeaders(),
        body: JSON.stringify({ key: activateKey, tenantId: activateTenant }),
      });
      if (r.ok) { setMsg("✅ License activated!"); setActivateKey(""); setActivateTenant(""); fetchLicenses(page); fetchTenantLicense(); }
      else { const err = await r.json(); setMsg(`❌ ${err.message || "Failed"}`); }
    } catch { setMsg("❌ Network error"); }
    setTimeout(() => setMsg(""), 4000);
  };

  const revokeLicense = async (licenseId: string) => {
    try {
      const r = await fetch(`${API_BASE}/v1/licensing/${licenseId}/revoke`, { method: "PUT", headers: getHeaders() });
      if (r.ok) { fetchLicenses(page); fetchTenantLicense(); }
      else { const err = await r.json(); setMsg(`❌ ${err.message}`); }
    } catch { setMsg("❌ Network error"); }
    setTimeout(() => setMsg(""), 3000);
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      {msg && (
        <div className={`fixed right-4 top-4 z-50 rounded-lg border px-5 py-3 text-sm font-semibold shadow-lg backdrop-blur ${
          msg.startsWith("✅") ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"
        }`}>{msg}</div>
      )}

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        {/* Header */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-sky-700">Foundation / Licensing</p>
          <h1 className="mt-2 text-2xl font-bold tracking-normal text-slate-950">🔑 License Key Management</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Tạo, kích hoạt và quản lý license key cho on-premise / air-gapped deployment.
          </p>
        </div>

        {/* Tenant License Info */}
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-950 mb-3">Current Tenant License</h2>
          {tenantLoading ? (
            <p className="text-sm text-slate-400">Loading...</p>
          ) : !tenantLicense ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-amber-700 font-semibold">⚠️ No active license</span>
              <span className="text-slate-400">Generate and activate a license below.</span>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-5">
              <div>
                <p className="text-xs text-slate-500">Tier</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{tenantLicense.tier}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Status</p>
                <span className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[tenantLicense.status] || "border-slate-200 bg-slate-50 text-slate-600"}`}>
                  {tenantLicense.status}
                </span>
              </div>
              <div>
                <p className="text-xs text-slate-500">Max Users</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{tenantLicense.maxUsers === -1 ? "∞" : tenantLicense.maxUsers}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Expires</p>
                <p className="mt-1 text-sm text-slate-700">{tenantLicense.expiresAt ? formatDate(tenantLicense.expiresAt) : "Never"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Days Left</p>
                <p className="mt-1 text-sm font-bold text-slate-950">{tenantLicense.daysRemaining !== null ? tenantLicense.daysRemaining : "∞"}</p>
              </div>
            </div>
          )}

          {/* Features */}
          {tenantLicense && tenantLicense.features.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              {tenantLicense.features.map((f) => (
                <span key={f} className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-medium text-sky-700">
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <button onClick={() => setShowGenerate(!showGenerate)}
            className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800">
            {showGenerate ? "✕ Cancel" : "+ Generate License"}
          </button>
        </div>

        {/* Generate Form */}
        {showGenerate && (
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-950 mb-4">Generate License Key</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Tier</label>
                <select value={genForm.tier} onChange={(e) => setGenForm({ ...genForm, tier: e.target.value })}
                  className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none">
                  {tiers.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Max Users (-1 = unlimited)</label>
                <input type="number" value={genForm.maxUsers} onChange={(e) => setGenForm({ ...genForm, maxUsers: Number(e.target.value) })}
                  className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Validity (days)</label>
                <input type="number" value={genForm.validityDays} onChange={(e) => setGenForm({ ...genForm, validityDays: Number(e.target.value) })}
                  className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Issued To</label>
                <input value={genForm.issuedTo} onChange={(e) => setGenForm({ ...genForm, issuedTo: e.target.value })}
                  className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Issued Email</label>
                <input type="email" value={genForm.issuedEmail} onChange={(e) => setGenForm({ ...genForm, issuedEmail: e.target.value })}
                  className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4" />
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button onClick={generateLicense} disabled={generating}
                className="rounded-lg bg-slate-950 px-6 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300">
                {generating ? "Generating..." : "Generate"}
              </button>
            </div>
          </div>
        )}

        {/* Activate License */}
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-950 mb-3">Activate License</h3>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">License Key</label>
              <input value={activateKey} onChange={(e) => setActivateKey(e.target.value.toUpperCase())}
                placeholder="AIFUT-XXXX-XXXX-XXXX-XXXX"
                className="h-9 w-72 rounded-lg border border-slate-200 px-3 text-sm font-mono outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tenant ID</label>
              <input value={activateTenant} onChange={(e) => setActivateTenant(e.target.value)}
                placeholder="tenant-id"
                className="h-9 w-48 rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4" />
            </div>
            <button onClick={activateLicense} disabled={!activateKey || !activateTenant}
              className="h-9 rounded-lg bg-slate-950 px-4 text-xs font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300">
              Activate
            </button>
          </div>
        </div>

        {/* License List */}
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-950">All Licenses</h2>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 rounded-lg border border-slate-200 px-3 text-xs outline-none">
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="PENDING">Pending</option>
              <option value="EXPIRED">Expired</option>
              <option value="REVOKED">Revoked</option>
            </select>
          </div>

          {loading ? (
            <div className="p-12 text-center text-sm text-slate-400">Loading licenses...</div>
          ) : !licenses || licenses.items.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-400">No licenses found.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Key</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Tier</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Status</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Tenant</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Expires</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {licenses.items.map((lic) => (
                      <tr key={lic.id} className="hover:bg-slate-50/50">
                        <td className="px-5 py-4">
                          <span className="text-xs font-mono font-medium text-slate-800">{lic.key}</span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                            {lic.tier}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[lic.status] || "border-slate-200 bg-slate-50 text-slate-600"}`}>
                            {lic.isExpired ? "EXPIRED" : lic.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-500 font-mono">
                          {lic.tenantId ? lic.tenantId.slice(0, 16) + "..." : "—"}
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-500">
                          {lic.expiresAt ? formatDate(lic.expiresAt) : "Never"}
                        </td>
                        <td className="px-5 py-4 text-right">
                          {lic.status === "ACTIVE" || lic.status === "PENDING" ? (
                            <button onClick={() => revokeLicense(lic.id)}
                              className="rounded-lg border border-rose-200 px-3 py-1.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-50">
                              Revoke
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {licenses.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 border-t border-slate-100 px-5 py-4">
                  <button disabled={page <= 1} onClick={() => setPage(page - 1)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                    ← Prev
                  </button>
                  <span className="text-xs text-slate-500">Page {page} / {licenses.totalPages}</span>
                  <button disabled={page >= licenses.totalPages} onClick={() => setPage(page + 1)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
