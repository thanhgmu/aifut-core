"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../../../../lib/auth";

// ── Types ────────────────────────────────────────────────────────────────

type DeveloperProfile = {
  id: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  country: string | null;
  website: string | null;
  company: string | null;
  tier: "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";
  skills: { skill: string; level: number }[];
  createdAt: string;
  updatedAt: string;
};

type DevStats = {
  totalListings: number;
  totalSales: number;
  totalRevenue: number;
  totalDownloads: number;
  avgRating: number;
  certificationCount: number;
};

// ── Tier Badge Config ────────────────────────────────────────────────────

const TIER_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  BRONZE: { label: "🥉 Bronze", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  SILVER: { label: "🥈 Silver", color: "text-slate-600", bg: "bg-slate-50", border: "border-slate-300" },
  GOLD: { label: "🥇 Gold", color: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-300" },
  PLATINUM: { label: "💎 Platinum", color: "text-cyan-700", bg: "bg-cyan-50", border: "border-cyan-300" },
};

// ── Helpers ──────────────────────────────────────────────────────────────

function getAuthHeaders(): Record<string, string> {
  const t = typeof window !== "undefined" ? localStorage.getItem("aifut_token") : null;
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (t) h["Authorization"] = `Bearer ${t}`;
  // Also include tenant-id if available
  const ti = typeof window !== "undefined" ? localStorage.getItem("aifut_tenant_id") : null;
  if (ti) h["x-tenant-id"] = ti;
  return h;
}

function TierBadge({ tier }: { tier: string }) {
  const cfg = TIER_CONFIG[tier] || TIER_CONFIG.BRONZE!;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      {cfg.label}
    </span>
  );
}

function SkillBadge({ skill, level }: { skill: string; level: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm">
      {skill}
      <span className="text-slate-400">·</span>
      <span className="text-emerald-600 font-semibold">{level}/5</span>
    </span>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────

export default function ProfileContent() {
  const [profile, setProfile] = useState<DeveloperProfile | null>(null);
  const [stats, setStats] = useState<DevStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form state
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [country, setCountry] = useState("");
  const [website, setWebsite] = useState("");
  const [company, setCompany] = useState("");
  const [newSkill, setNewSkill] = useState("");

  const loadProfile = useCallback(async () => {
    try {
      const [profileRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/v1/developer/profile`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE}/v1/developer/profile/stats`, { headers: getAuthHeaders() }),
      ]);
      if (profileRes.ok) {
        const data = await profileRes.json();
        setProfile(data);
        setDisplayName(data.displayName ?? "");
        setBio(data.bio ?? "");
        setAvatarUrl(data.avatarUrl ?? "");
        setCountry(data.country ?? "");
        setWebsite(data.website ?? "");
        setCompany(data.company ?? "");
      }
      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
    } catch {
      // No profile yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const saveProfile = async () => {
    setSaving(true);
    setMessage(null);
    try {
      if (profile) {
        // Update
        const res = await fetch(`${API_BASE}/v1/developer/profile`, {
          method: "PUT",
          headers: getAuthHeaders(),
          body: JSON.stringify({ displayName, bio, avatarUrl, country, website, company }),
        });
        if (!res.ok) throw new Error((await res.json()).message || "Update failed");
        setMessage({ type: "success", text: "✅ Profile updated!" });
        loadProfile();
      } else {
        // Register
        const res = await fetch(`${API_BASE}/v1/developer/profile/register`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ displayName, bio, avatarUrl, country, website, company }),
        });
        if (!res.ok) throw new Error((await res.json()).message || "Register failed");
        setMessage({ type: "success", text: "✅ Developer profile created!" });
        loadProfile();
      }
    } catch (err: any) {
      setMessage({ type: "error", text: `❌ ${err.message}` });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const addSkill = async () => {
    if (!newSkill.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/v1/developer/profile/skills`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ skill: newSkill.trim(), level: 3 }),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed");
      setNewSkill("");
      loadProfile();
    } catch (err: any) {
      setMessage({ type: "error", text: `❌ ${err.message}` });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const removeSkill = async (skill: string) => {
    try {
      await fetch(`${API_BASE}/v1/developer/profile/skills/${encodeURIComponent(skill)}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      loadProfile();
    } catch {
      // silent
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="text-center text-slate-500">
          <div className="mb-3 text-3xl">🔄</div>
          Loading profile...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      {/* Toast */}
      {message && (
        <div className={`fixed right-4 top-4 z-50 rounded-lg border px-5 py-3 text-sm font-semibold shadow-lg backdrop-blur transition ${
          message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"
        }`}>
          {message.text}
        </div>
      )}

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
        {/* Header */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-sky-700">Developer / Profile</p>
          <h1 className="mt-2 text-2xl font-bold tracking-normal text-slate-950">Hồ sơ nhà phát triển</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Đăng ký và quản lý hồ sơ developer của bạn trên AIFUT Marketplace. Kỹ năng, chứng nhận và báo cáo doanh thu.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* ── Left: Form ── */}
          <div className="space-y-6">
            {/* Profile Form */}
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-slate-950">Thông tin hồ sơ</h2>
              <p className="mt-1 text-sm text-slate-500">Thông tin sẽ hiển thị công khai trên Marketplace.</p>

              <div className="mt-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Display Name *</label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4"
                    placeholder="Your public name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Bio</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4"
                    placeholder="Short bio about yourself..."
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Avatar URL</label>
                    <input
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Country</label>
                    <input
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4"
                      placeholder="VN, US, SG..."
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Website</label>
                    <input
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4"
                      placeholder="https://your-website.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Company</label>
                    <input
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4"
                      placeholder="Your company name"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={saving}
                  onClick={saveProfile}
                  className="mt-2 rounded-lg bg-slate-950 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {saving ? "Saving..." : profile ? "Cập nhật hồ sơ" : "Đăng ký hồ sơ"}
                </button>
              </div>
            </div>

            {/* Skills Management */}
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-slate-950">Kỹ năng</h2>
              <p className="mt-1 text-sm text-slate-500">Thêm kỹ năng chuyên môn để tăng cơ hội kết nối.</p>

              <div className="mt-4 flex gap-2">
                <input
                  value={newSkill}
                  onChange={(e) => setNewSkill(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addSkill(); }}
                  className="mt-1 h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4"
                  placeholder="e.g. NestJS, React, Connector Dev..."
                />
                <button
                  type="button"
                  onClick={addSkill}
                  disabled={!newSkill.trim()}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-sky-300"
                >
                  + Add
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {(!profile || profile.skills.length === 0) && (
                  <p className="text-sm text-slate-400 italic">No skills added yet.</p>
                )}
                {profile?.skills.map((s) => (
                  <div key={s.skill} className="group relative">
                    <SkillBadge skill={s.skill} level={s.level} />
                    <button
                      type="button"
                      onClick={() => removeSkill(s.skill)}
                      className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-xs text-white group-hover:flex"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Right: Stats / Summary ── */}
          <div className="space-y-6">
            {/* Tier & Summary Card */}
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-slate-950">Developer Tier</h2>
              {profile && (
                <div className="mt-3">
                  <TierBadge tier={profile.tier} />
                </div>
              )}

              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-sm text-slate-600">Listings</span>
                  <span className="text-sm font-semibold text-slate-900">{stats?.totalListings ?? 0}</span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-sm text-slate-600">Total Sales</span>
                  <span className="text-sm font-semibold text-slate-900">{stats?.totalSales ?? 0}</span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-sm text-slate-600">Revenue</span>
                  <span className="text-sm font-semibold text-emerald-700">
                    {((stats?.totalRevenue ?? 0) / 100).toLocaleString()}₫
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-sm text-slate-600">Downloads</span>
                  <span className="text-sm font-semibold text-slate-900">{stats?.totalDownloads ?? 0}</span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-sm text-slate-600">Avg Rating</span>
                  <span className="text-sm font-semibold text-slate-900">
                    {stats?.avgRating ? `${stats.avgRating.toFixed(1)} ⭐` : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Certifications</span>
                  <span className="text-sm font-semibold text-slate-900">{stats?.certificationCount ?? 0}</span>
                </div>
              </div>
            </div>

            {/* Quick Links */}
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-slate-950">Quick Links</h2>
              <div className="mt-4 space-y-2">
                <a href="/marketplace/orders" className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700">
                  🛒 Order History
                </a>
                <a href="/developers" className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700">
                  🔍 Developer Discovery
                </a>
                <a href="/foundation/connector-certification" className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700">
                  ✅ Connector Certification
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
