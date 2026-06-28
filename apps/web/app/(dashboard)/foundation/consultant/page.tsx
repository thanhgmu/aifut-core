"use client";

// ═══════════════════════════════════════════════════════════════════════════
// foundation/consultant/page.tsx — Consultant/Expert Directory & Booking UI
// Phase 3: Consultant profiles, search, reviews, booking, availability.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../../../../lib/auth";

// ── Types ────────────────────────────────────────────────────────────────

type ConsultantSearchItem = {
  id: string; fullName: string; avatarUrl: string | null;
  title: string | null; bio: string | null;
  skills: string[]; rating: number | null; reviewCount: number;
  completedJobs: number; isAvailable: boolean;
  rateType: string | null; rateAmount: number | null; currency: string;
  isVerified: boolean; createdAt: string;
};

type SearchResult = { total: number; items: ConsultantSearchItem[] };

type Tab = "browse" | "my-profile" | "my-bookings";

// ── Helpers ──────────────────────────────────────────────────────────────

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const t = typeof window !== "undefined" ? localStorage.getItem("aifut_token") : null;
  if (t) h["Authorization"] = `Bearer ${t}`;
  const ti = typeof window !== "undefined" ? localStorage.getItem("aifut_tenant_id") : null;
  if (ti) h["x-tenant-id"] = ti;
  return h;
}

function formatCurrency(amount: number | null, currency: string): string {
  if (amount === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

// ── Consultant Card ──────────────────────────────────────────────────────

function ConsultantCard({
  consultant,
  onBook,
}: {
  consultant: ConsultantSearchItem;
  onBook: (id: string) => void;
}) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sky-100 text-lg font-bold text-sky-700">
          {consultant.fullName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-950 truncate">{consultant.fullName}</h3>
              {consultant.title && (
                <p className="text-xs text-slate-500 mt-0.5">{consultant.title}</p>
              )}
            </div>
            {consultant.isVerified && (
              <span className="shrink-0 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                ✓ Verified
              </span>
            )}
          </div>

          {/* Skills */}
          {consultant.skills.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {consultant.skills.slice(0, 4).map((skill) => (
                <span key={skill} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                  {skill}
                </span>
              ))}
              {consultant.skills.length > 4 && (
                <span className="text-[10px] text-slate-400">+{consultant.skills.length - 4}</span>
              )}
            </div>
          )}

          {/* Stats */}
          <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
            <span>⭐ {consultant.rating ? consultant.rating.toFixed(1) : "—"}</span>
            <span>{consultant.reviewCount} reviews</span>
            <span>{consultant.completedJobs} jobs</span>
            {consultant.rateAmount !== null && (
              <span className="font-semibold text-slate-700">
                {formatCurrency(consultant.rateAmount, consultant.currency)}{consultant.rateType === "hourly" ? "/hr" : ""}
              </span>
            )}
          </div>

          {/* Availability + Book */}
          <div className="mt-3 flex items-center justify-between">
            <span className={`inline-flex items-center gap-1 text-xs font-semibold ${consultant.isAvailable ? "text-emerald-700" : "text-slate-400"}`}>
              <span className={`inline-block h-2 w-2 rounded-full ${consultant.isAvailable ? "bg-emerald-500" : "bg-slate-300"}`} />
              {consultant.isAvailable ? "Available" : "Unavailable"}
            </span>
            <button
              type="button"
              disabled={!consultant.isAvailable}
              onClick={() => onBook(consultant.id)}
              className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Book Now
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

// ── My Profile Form ──────────────────────────────────────────────────────

function MyProfileTab() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ fullName: "", title: "", bio: "", skills: "", rateType: "hourly", rateAmount: 0, currency: "USD", isAvailable: true });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/v1/consultant/me`, { headers: getHeaders() });
      if (r.ok) {
        const data = await r.json();
        setProfile(data);
        setForm({
          fullName: data.fullName ?? "",
          title: data.title ?? "",
          bio: data.bio ?? "",
          skills: (data.skills ?? []).join(", "),
          rateType: data.rateType ?? "hourly",
          rateAmount: data.rateAmount ?? 0,
          currency: data.currency ?? "USD",
          isAvailable: data.isAvailable ?? true,
        });
      }
    } catch { /* noop */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const saveProfile = async () => {
    setSaving(true); setMsg("");
    try {
      const body = {
        fullName: form.fullName,
        title: form.title || null,
        bio: form.bio || null,
        skills: form.skills.split(",").map((s: string) => s.trim()).filter(Boolean),
        rateType: form.rateType || null,
        rateAmount: form.rateAmount > 0 ? form.rateAmount : null,
        currency: form.currency,
        isAvailable: form.isAvailable,
      };
      const r = await fetch(`${API_BASE}/v1/consultant/profile`, {
        method: "POST", headers: getHeaders(),
        body: JSON.stringify(body),
      });
      if (r.ok) { setMsg("✅ Profile saved!"); fetchProfile(); }
      else { setMsg("❌ Failed to save profile"); }
    } catch { setMsg("❌ Network error"); }
    setSaving(false);
    setTimeout(() => setMsg(""), 3000);
  };

  if (loading) return <div className="p-12 text-center text-sm text-slate-400">Loading profile...</div>;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      {msg && (
        <div className={`mb-4 rounded-lg border px-4 py-3 text-sm font-semibold ${msg.startsWith("✅") ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          {msg}
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Full Name *</label>
          <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Title</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-600 mb-1">Bio</label>
          <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })}
            rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Skills (comma-separated)</label>
          <input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })}
            className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4" />
        </div>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-600 mb-1">Rate</label>
            <input type="number" value={form.rateAmount} onChange={(e) => setForm({ ...form, rateAmount: Number(e.target.value) })}
              className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4" />
          </div>
          <div className="w-28">
            <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
            <select value={form.rateType} onChange={(e) => setForm({ ...form, rateType: e.target.value })}
              className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none">
              <option value="hourly">Hourly</option>
              <option value="fixed">Fixed</option>
              <option value="project">Project</option>
            </select>
          </div>
          <div className="w-24">
            <label className="block text-xs font-medium text-slate-600 mb-1">Currency</label>
            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}
              className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none">
              <option value="USD">USD</option>
              <option value="VND">VND</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isAvailable} onChange={(e) => setForm({ ...form, isAvailable: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-sky-600 ring-sky-500/20 focus:ring-4" />
            <span className="text-sm text-slate-700">Available for booking</span>
          </label>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button onClick={saveProfile} disabled={!form.fullName.trim() || saving}
          className="rounded-lg bg-slate-950 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">
          {saving ? "Saving..." : profile ? "Update Profile" : "Create Profile"}
        </button>
      </div>
    </div>
  );
}

// ── My Bookings Tab ──────────────────────────────────────────────────────

function MyBookingsTab() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<"client" | "consultant">("client");

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/v1/consultant/bookings?role=${role}`, { headers: getHeaders() });
      if (r.ok) { const d = await r.json(); setBookings(d.items ?? []); }
    } catch { /* noop */ }
    setLoading(false);
  }, [role]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const statusColors: Record<string, string> = {
    requested: "border-amber-200 bg-amber-50 text-amber-700",
    confirmed: "border-sky-200 bg-sky-50 text-sky-700",
    in_progress: "border-indigo-200 bg-indigo-50 text-indigo-700",
    completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
    cancelled: "border-slate-200 bg-slate-50 text-slate-500",
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-950">My Bookings</h2>
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {(["client", "consultant"] as const).map((r) => (
            <button key={r} onClick={() => setRole(r)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${role === r ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
              {r === "client" ? "As Client" : "As Consultant"}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="p-12 text-center text-sm text-slate-400">Loading bookings...</div>
      ) : bookings.length === 0 ? (
        <div className="p-12 text-center text-sm text-slate-400">No bookings found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">ID</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Status</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Date</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bookings.map((b: any) => (
                <tr key={b.id} className="hover:bg-slate-50/50">
                  <td className="px-5 py-4 text-xs font-mono text-slate-500">{b.id.slice(0, 12)}...</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusColors[b.status] || "border-slate-200 bg-slate-50 text-slate-600"}`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600">
                    {new Date(b.createdAt).toLocaleDateString("vi-VN")}
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-500 max-w-[200px] truncate">
                    {b.message || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════════════

export default function ConsultantDirectoryPage() {
  const [tab, setTab] = useState<Tab>("browse");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [skillFilter, setSkillFilter] = useState("");

  const doSearch = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (skillFilter) params.set("skills", skillFilter);
      const r = await fetch(`${API_BASE}/v1/consultant/search?${params}`, { headers: getHeaders() });
      if (r.ok) setResults(await r.json());
    } catch { /* noop */ }
    setLoading(false);
  }, [search, skillFilter]);

  useEffect(() => { doSearch(); }, [doSearch]);

  const bookConsultant = async (consultantId: string) => {
    try {
      await fetch(`${API_BASE}/v1/consultant/${consultantId}/book`, {
        method: "POST", headers: getHeaders(),
        body: JSON.stringify({ message: "Interested in your services" }),
      });
    } catch { /* noop */ }
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        {/* Header */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-sky-700">Foundation / Consultant Directory</p>
          <h1 className="mt-2 text-2xl font-bold tracking-normal text-slate-950">👥 Consultant & Expert Directory</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Tìm kiếm chuyên gia tư vấn, xem hồ sơ, đánh giá và đặt lịch tư vấn trực tiếp.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {(["browse", "my-profile", "my-bookings"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`min-w-28 rounded-md px-4 py-2 text-sm font-semibold transition ${tab === t ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
              {t === "browse" ? "🔍 Browse" : t === "my-profile" ? "👤 My Profile" : "📅 My Bookings"}
            </button>
          ))}
        </div>

        {/* Browse Tab */}
        {tab === "browse" && (
          <>
            {/* Search */}
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Search</label>
                  <input value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Name, title, or bio..."
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4" />
                </div>
                <div className="w-40">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Skill</label>
                  <input value={skillFilter} onChange={(e) => setSkillFilter(e.target.value)}
                    placeholder="e.g. ai, workflow"
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4" />
                </div>
                <button onClick={doSearch}
                  className="h-9 rounded-lg bg-slate-950 px-4 text-xs font-semibold text-white hover:bg-slate-800">
                  Search
                </button>
                {results && (
                  <span className="text-xs text-slate-400">{results.total} consultants</span>
                )}
              </div>
            </div>

            {/* Results */}
            {loading ? (
              <div className="flex items-center justify-center p-12 text-slate-400">Searching...</div>
            ) : !results || results.items.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white p-12 text-center text-sm text-slate-400">
                No consultants found. Try adjusting your search.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {results.items.map((c) => (
                  <ConsultantCard key={c.id} consultant={c} onBook={bookConsultant} />
                ))}
              </div>
            )}
          </>
        )}

        {/* My Profile Tab */}
        {tab === "my-profile" && <MyProfileTab />}

        {/* My Bookings Tab */}
        {tab === "my-bookings" && <MyBookingsTab />}
      </div>
    </main>
  );
}
