"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../../lib/auth";

// ── Types ────────────────────────────────────────────────────────────────

type DevRecord = {
  id: string;
  tenantId: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  country: string | null;
  company: string | null;
  website: string | null;
  tier: "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";
  skills: { skill: string; level: number }[];
  stats?: {
    totalListings: number;
    totalSales: number;
    avgRating: number | null;
    totalDownloads: number;
  };
  createdAt: string;
};

type PaginatedDevs = {
  items: DevRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

// ── Tier Badge Config ────────────────────────────────────────────────────

const TIER_CFG: Record<string, { label: string; color: string; bg: string }> = {
  BRONZE: { label: "🥉 Bronze", color: "text-amber-700", bg: "bg-amber-50" },
  SILVER: { label: "🥈 Silver", color: "text-slate-600", bg: "bg-slate-50" },
  GOLD: { label: "🥇 Gold", color: "text-yellow-700", bg: "bg-yellow-50" },
  PLATINUM: { label: "💎 Platinum", color: "text-cyan-700", bg: "bg-cyan-50" },
};

const TIER_LIST = ["", "BRONZE", "SILVER", "GOLD", "PLATINUM"];

// ── Helpers ──────────────────────────────────────────────────────────────

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const t = typeof window !== "undefined" ? localStorage.getItem("aifut_token") : null;
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}

function SkillBadge({ skill, level }: { skill: string; level: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm">
      {skill}
      <span className="text-slate-400">·</span>
      <span className="text-emerald-600 font-semibold">{level}/5</span>
    </span>
  );
}

function StarRating({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-xs text-slate-400">No ratings</span>;
  return (
    <span className="text-sm" title={`${rating.toFixed(1)} / 5`}>
      {"⭐".repeat(Math.round(rating))}
      <span className="ml-1 text-xs text-slate-500">({rating.toFixed(1)})</span>
    </span>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────

export default function DevelopersBrowsePage() {
  const [result, setResult] = useState<PaginatedDevs | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState("");
  const [skill, setSkill] = useState("");
  const [country, setCountry] = useState("");
  const [page, setPage] = useState(1);
  const [selectedDev, setSelectedDev] = useState<DevRecord | null>(null);

  const fetchDevs = useCallback(async (p: number) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (tier) params.set("tier", tier);
    if (skill.trim()) params.set("skill", skill.trim());
    if (country.trim()) params.set("country", country.trim());
    if (search.trim()) params.set("search", search.trim());
    params.set("page", String(p));
    params.set("pageSize", "12");

    try {
      const res = await fetch(`${API_BASE}/v1/developer/profile/developers?${params}`, {
        headers: getHeaders(),
      });
      if (res.ok) setResult(await res.json());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [tier, skill, country, search]);

  useEffect(() => {
    setPage(1);
    fetchDevs(1);
  }, [tier, skill, country, search, fetchDevs]);

  useEffect(() => {
    if (page > 1) fetchDevs(page);
  }, [page, fetchDevs]);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        {/* Header */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-sky-700">Developer Discovery</p>
          <h1 className="mt-2 text-2xl font-bold tracking-normal text-slate-950">Khám phá nhà phát triển</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Duyệt hồ sơ developer trên AIFUT Marketplace. Tìm theo kỹ năng, chứng nhận và quốc gia.
          </p>
        </div>

        {/* Search & Filters */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍  Search developers..."
              className="h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4"
            />
            <select value={tier} onChange={(e) => setTier(e.target.value)}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none">
              <option value="">All Tiers</option>
              {TIER_LIST.filter(Boolean).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
              placeholder="Skill filter..."
              className="h-10 w-40 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4"
            />
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Country (VN, US...)"
              className="h-10 w-32 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4"
            />
          </div>
        </div>

        {/* Results count */}
        {result && !loading && (
          <div className="text-sm text-slate-500">
            Showing {result.items.length} of {result.total} developer{result.total !== 1 ? "s" : ""}
          </div>
        )}

        {/* Developer Grid */}
        {loading ? (
          <div className="flex items-center justify-center p-16 text-slate-400">
            <div className="text-center">
              <div className="mb-3 text-3xl">🔄</div>
              Loading developers...
            </div>
          </div>
        ) : !result || result.items.length === 0 ? (
          <div className="flex items-center justify-center p-16 text-slate-400">
            <div className="text-center">
              <div className="mb-3 text-4xl">🔍</div>
              <div className="text-base font-medium text-slate-500">No developers found</div>
              <div className="mt-1 text-sm">Try different search terms or filters.</div>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {result.items.map((dev) => {
                const tierInfo = TIER_CFG[dev.tier] || TIER_CFG.BRONZE;
                return (
                  <button
                    key={dev.id}
                    type="button"
                    onClick={() => setSelectedDev(dev)}
                    className="group flex flex-col rounded-lg border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md"
                  >
                    {/* Avatar + Name */}
                    <div className="flex items-center gap-3">
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-slate-200 text-lg font-bold text-slate-600 overflow-hidden">
                        {dev.avatarUrl ? (
                          <img src={dev.avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          dev.displayName?.charAt(0).toUpperCase() || "D"
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-slate-950 truncate">
                          {dev.displayName || `Developer #${dev.id.slice(0, 6)}`}
                        </h3>
                        {dev.company && (
                          <p className="text-xs text-slate-500 truncate">{dev.company}</p>
                        )}
                      </div>
                    </div>

                    {/* Tier Badge */}
                    <div className="mt-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tierInfo.color} ${tierInfo.bg}`}>
                        {tierInfo.label}
                      </span>
                      {dev.country && (
                        <span className="ml-2 text-xs text-slate-400">📍 {dev.country}</span>
                      )}
                    </div>

                    {/* Bio */}
                    <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-600">
                      {dev.bio || "No bio available."}
                    </p>

                    {/* Skills */}
                    {dev.skills && dev.skills.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {dev.skills.slice(0, 3).map((s) => (
                          <SkillBadge key={s.skill} skill={s.skill} level={s.level} />
                        ))}
                        {dev.skills.length > 3 && (
                          <span className="text-xs text-slate-400">+{dev.skills.length - 3}</span>
                        )}
                      </div>
                    )}

                    {/* Stats */}
                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                      <span>📦 {dev.stats?.totalListings ?? 0}</span>
                      <span>⬇️ {dev.stats?.totalDownloads ?? 0}</span>
                      <span>
                        <StarRating rating={dev.stats?.avgRating ?? null} />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Pagination */}
            {result.totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-4">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                  ← Prev
                </button>
                <span className="text-sm text-slate-500">Page {page} / {result.totalPages}</span>
                <button disabled={page >= result.totalPages} onClick={() => setPage(page + 1)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Detail Modal ── */}
      {selectedDev && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setSelectedDev(null)}>
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="grid h-16 w-16 place-items-center rounded-full bg-slate-200 text-2xl font-bold text-slate-600 overflow-hidden">
                  {selectedDev.avatarUrl ? (
                    <img src={selectedDev.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    selectedDev.displayName?.charAt(0).toUpperCase() || "D"
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-950">
                    {selectedDev.displayName || `Developer ${selectedDev.id.slice(0, 6)}`}
                  </h2>
                  {selectedDev.company && (
                    <p className="text-sm text-slate-500">{selectedDev.company}</p>
                  )}
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${TIER_CFG[selectedDev.tier]?.color} ${TIER_CFG[selectedDev.tier]?.bg}`}>
                      {TIER_CFG[selectedDev.tier]?.label}
                    </span>
                    {selectedDev.country && (
                      <span className="text-xs text-slate-400">📍 {selectedDev.country}</span>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedDev(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
            </div>

            {/* Bio */}
            <p className="mt-4 text-sm leading-6 text-slate-600">{selectedDev.bio || "No bio available."}</p>

            {/* Skills */}
            {selectedDev.skills && selectedDev.skills.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold uppercase text-slate-400 mb-2">Skills</h3>
                <div className="flex flex-wrap gap-1.5">
                  {selectedDev.skills.map((s) => (
                    <SkillBadge key={s.skill} skill={s.skill} level={s.level} />
                  ))}
                </div>
              </div>
            )}

            {/* Links */}
            <div className="mt-4 flex gap-2">
              {selectedDev.website && (
                <a href={selectedDev.website} target="_blank" rel="noopener noreferrer"
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-sky-600 hover:bg-sky-50">
                  🌐 Website
                </a>
              )}
              <button onClick={() => setSelectedDev(null)}
                className="ml-auto rounded-lg bg-slate-950 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">
                Close
              </button>
            </div>

            {/* Stats */}
            <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="text-center">
                <div className="text-lg font-bold text-slate-950">{selectedDev.stats?.totalListings ?? 0}</div>
                <div className="text-xs text-slate-500">Listings</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-slate-950">{selectedDev.stats?.totalSales ?? 0}</div>
                <div className="text-xs text-slate-500">Sales</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-slate-950">
                  {selectedDev.stats?.avgRating ? selectedDev.stats.avgRating.toFixed(1) : "—"}
                </div>
                <div className="text-xs text-slate-500">Rating</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
