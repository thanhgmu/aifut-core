"use client";

// ═══════════════════════════════════════════════════════════════════════════
// foundation/data-marketplace/page.tsx — Data Product Marketplace UI
// Phase 3: Browse, purchase, publish data products, manage consents.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../../../../lib/auth";

// ── Types ────────────────────────────────────────────────────────────────

type DataProduct = {
  id: string; tenantId: string; name: string; description: string | null;
  category: string | null; tags: string[]; format: string;
  price: number; currency: string; rowCount: number; sizeBytes: string;
  downloads: number; rating: number | null; createdAt: string;
};

type ProductResult = { total: number; items: DataProduct[] };

type Tab = "marketplace" | "my-products" | "purchases" | "consents";

// ── Helpers ──────────────────────────────────────────────────────────────

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const t = typeof window !== "undefined" ? localStorage.getItem("aifut_token") : null;
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}

function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(price);
}

function formatBytes(bytes: string): string {
  const n = Number(bytes);
  if (n === 0) return "—";
  if (n > 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)} GB`;
  if (n > 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n > 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

// ── Product Card ─────────────────────────────────────────────────────────

function ProductCard({ product, onPurchase }: { product: DataProduct; onPurchase: (id: string) => void }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-950 truncate">{product.name}</h3>
          {product.description && (
            <p className="mt-1 text-xs text-slate-500 line-clamp-2">{product.description}</p>
          )}
        </div>
        <span className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
          {product.category || "General"}
        </span>
      </div>

      {/* Tags */}
      {product.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {product.tags.slice(0, 3).map((t) => (
            <span key={t} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600">{t}</span>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded bg-slate-50 p-2">
          <p className="font-semibold text-slate-950">{product.rowCount.toLocaleString()}</p>
          <p className="text-slate-400 mt-0.5">Rows</p>
        </div>
        <div className="rounded bg-slate-50 p-2">
          <p className="font-semibold text-slate-950">{formatBytes(product.sizeBytes)}</p>
          <p className="text-slate-400 mt-0.5">Size</p>
        </div>
        <div className="rounded bg-slate-50 p-2">
          <p className="font-semibold text-slate-950">{product.downloads}</p>
          <p className="text-slate-400 mt-0.5">Downloads</p>
        </div>
      </div>

      {/* Bottom */}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-lg font-bold text-slate-950">
          {product.price === 0 ? "Free" : formatPrice(product.price, product.currency)}
        </span>
        <span className="text-[11px] text-slate-400">{product.format.toUpperCase()}</span>
      </div>
      <button onClick={() => onPurchase(product.id)}
        className="mt-3 w-full rounded-lg bg-slate-950 py-2 text-xs font-semibold text-white transition hover:bg-slate-800">
        {product.price === 0 ? "Download" : "Purchase"}
      </button>
    </article>
  );
}

// ── My Products Tab ──────────────────────────────────────────────────────

function MyProductsTab() {
  const [products, setProducts] = useState<DataProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", category: "", format: "json", price: 0, tags: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/v1/data-marketplace/my-products`, { headers: getHeaders() });
      if (r.ok) setProducts(await r.json());
    } catch { /* noop */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const createProduct = async () => {
    if (!form.name.trim()) return;
    setSaving(true); setMsg("");
    try {
      const r = await fetch(`${API_BASE}/v1/data-marketplace/products`, {
        method: "POST", headers: getHeaders(),
        body: JSON.stringify({
          name: form.name, description: form.description || null,
          category: form.category || null, format: form.format,
          price: form.price, tags: form.tags.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      if (r.ok) { setMsg("✅ Product created!"); setShowForm(false); fetchProducts(); }
      else setMsg("❌ Failed to create");
    } catch { setMsg("❌ Network error"); }
    setSaving(false);
    setTimeout(() => setMsg(""), 3000);
  };

  const publishToggle = async (productId: string, isPublished: boolean) => {
    const r = await fetch(`${API_BASE}/v1/data-marketplace/products/${productId}/${isPublished ? "unpublish" : "publish"}`, {
      method: "PUT", headers: getHeaders(),
    });
    if (r.ok) fetchProducts();
  };

  return (
    <div className="space-y-4">
      {msg && (
        <div className={`rounded-lg border px-4 py-3 text-sm font-semibold ${msg.startsWith("✅") ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{msg}</div>
      )}

      <div className="flex justify-end">
        <button onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800">
          {showForm ? "✕ Cancel" : "+ New Product"}
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-950 mb-4">Create Data Product</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Name *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Format</label>
              <select value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}
                className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none">
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
                <option value="parquet">Parquet</option>
                <option value="xml">XML</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Price (USD)</label>
              <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tags (comma-separated)</label>
              <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="e.g. sales, q2, analytics"
                className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4" />
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <button onClick={createProduct} disabled={!form.name.trim() || saving}
              className="rounded-lg bg-slate-950 px-6 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300">
              {saving ? "Creating..." : "Create Product"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-sm text-slate-400">Loading...</div>
      ) : products.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center text-sm text-slate-400">No products yet. Create your first data product!</div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Name</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Category</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Price</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Downloads</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Status</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/50">
                  <td className="px-5 py-4 text-sm font-medium text-slate-900 truncate max-w-[200px]">{p.name}</td>
                  <td className="px-5 py-4 text-sm text-slate-600">{p.category || "—"}</td>
                  <td className="px-5 py-4 text-sm font-semibold text-slate-700">{p.price === 0 ? "Free" : formatPrice(p.price, p.currency)}</td>
                  <td className="px-5 py-4 text-sm text-slate-600">{p.downloads}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${p.isPublished ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                      {p.isPublished ? "Published" : "Draft"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button onClick={() => publishToggle(p.id, p.isPublished)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">
                      {p.isPublished ? "Unpublish" : "Publish"}
                    </button>
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

// ── Consents Tab ─────────────────────────────────────────────────────────

function ConsentsTab() {
  const [consents, setConsents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newConsent, setNewConsent] = useState({ purpose: "", scope: "" });
  const [msg, setMsg] = useState("");

  const fetchConsents = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/v1/data-marketplace/consents`, { headers: getHeaders() });
      if (r.ok) setConsents(await r.json());
    } catch { /* noop */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchConsents(); }, [fetchConsents]);

  const addConsent = async () => {
    if (!newConsent.purpose || !newConsent.scope) return;
    try {
      const r = await fetch(`${API_BASE}/v1/data-marketplace/consents`, {
        method: "POST", headers: getHeaders(),
        body: JSON.stringify(newConsent),
      });
      if (r.ok) { setMsg("✅ Consent added"); setNewConsent({ purpose: "", scope: "" }); fetchConsents(); }
      else setMsg("❌ Failed");
    } catch { setMsg("❌ Error"); }
    setTimeout(() => setMsg(""), 3000);
  };

  return (
    <div className="space-y-4">
      {msg && (
        <div className={`rounded-lg border px-4 py-3 text-sm font-semibold ${msg.startsWith("✅") ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{msg}</div>
      )}

      {/* Add Consent */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-950 mb-3">Grant Data Consent</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Purpose</label>
            <input value={newConsent.purpose} onChange={(e) => setNewConsent({ ...newConsent, purpose: e.target.value })}
              placeholder="e.g. analytics"
              className="h-9 w-48 rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Scope</label>
            <input value={newConsent.scope} onChange={(e) => setNewConsent({ ...newConsent, scope: e.target.value })}
              placeholder="e.g. transaction_data"
              className="h-9 w-48 rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4" />
          </div>
          <button onClick={addConsent} disabled={!newConsent.purpose || !newConsent.scope}
            className="h-9 rounded-lg bg-slate-950 px-4 text-xs font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300">
            Grant
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-sm text-slate-400">Loading consents...</div>
      ) : consents.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center text-sm text-slate-400">No consents granted yet.</div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Purpose</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Scope</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Status</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Granted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {consents.map((c: any) => (
                <tr key={c.id}>
                  <td className="px-5 py-4 text-sm font-medium text-slate-900">{c.purpose}</td>
                  <td className="px-5 py-4 text-sm text-slate-600">{c.scope}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${c.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                      {c.isActive ? "Active" : "Revoked"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-500">{new Date(c.grantedAt).toLocaleDateString("vi-VN")}</td>
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

export default function DataMarketplacePage() {
  const [tab, setTab] = useState<Tab>("marketplace");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [results, setResults] = useState<ProductResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchased, setPurchased] = useState<any[]>([]);
  const [showPurchased, setShowPurchased] = useState(false);

  const doSearch = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (category) params.set("category", category);
      const r = await fetch(`${API_BASE}/v1/data-marketplace/products?${params}`, { headers: getHeaders() });
      if (r.ok) setResults(await r.json());
    } catch { /* noop */ }
    setLoading(false);
  }, [search, category]);

  useEffect(() => { doSearch(); }, [doSearch]);

  const doPurchase = async (productId: string) => {
    try {
      const r = await fetch(`${API_BASE}/v1/data-marketplace/purchase`, {
        method: "POST", headers: getHeaders(),
        body: JSON.stringify({ productId }),
      });
      if (r.ok) {
        const data = await r.json();
        setShowPurchased(true);
        fetchPurchases();
      }
    } catch { /* noop */ }
  };

  const fetchPurchases = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/v1/data-marketplace/my-purchases`, { headers: getHeaders() });
      if (r.ok) setPurchased(await r.json());
    } catch { /* noop */ }
  }, []);

  useEffect(() => { if (tab === "purchases") fetchPurchases(); }, [tab, fetchPurchases]);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        {/* Header */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-sky-700">Foundation / Data Marketplace</p>
          <h1 className="mt-2 text-2xl font-bold tracking-normal text-slate-950">📊 Data Marketplace</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Mua, bán và quản lý datasets. Đăng ký consent cho phép chia sẻ dữ liệu cross-tenant.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {(["marketplace", "my-products", "purchases", "consents"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`min-w-28 rounded-md px-4 py-2 text-sm font-semibold transition ${tab === t ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
              {t === "marketplace" ? "🏪 Marketplace" : t === "my-products" ? "📦 My Products" : t === "purchases" ? "📥 Purchases" : "🔐 Consents"}
            </button>
          ))}
        </div>

        {/* Marketplace Tab */}
        {tab === "marketplace" && (
          <>
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Search</label>
                  <input value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Name or description..."
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4" />
                </div>
                <div className="w-40">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
                  <input value={category} onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. sales"
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4" />
                </div>
                <button onClick={doSearch}
                  className="h-9 rounded-lg bg-slate-950 px-4 text-xs font-semibold text-white hover:bg-slate-800">
                  Browse
                </button>
                {results && <span className="text-xs text-slate-400">{results.total} datasets</span>}
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center p-12 text-slate-400">Loading...</div>
            ) : !results || results.items.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white p-12 text-center text-sm text-slate-400">
                No datasets available. Try adjusting filters.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {results.items.map((p) => (
                  <ProductCard key={p.id} product={p} onPurchase={doPurchase} />
                ))}
              </div>
            )}
          </>
        )}

        {tab === "my-products" && <MyProductsTab />}

        {tab === "purchases" && (
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-950">My Purchased Datasets</h2>
            </div>
            {purchased.length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-400">No purchases yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Dataset</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Category</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Format</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Rows</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Purchased</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {purchased.map((p: any) => (
                      <tr key={p.id}>
                        <td className="px-5 py-4 text-sm font-medium text-slate-900">{p.product?.name ?? p.productId}</td>
                        <td className="px-5 py-4 text-sm text-slate-600">{p.product?.category || "—"}</td>
                        <td className="px-5 py-4 text-sm text-slate-600">{p.product?.format || "—"}</td>
                        <td className="px-5 py-4 text-sm text-slate-600">{p.product?.rowCount?.toLocaleString() || "—"}</td>
                        <td className="px-5 py-4 text-sm text-slate-500">{new Date(p.createdAt).toLocaleDateString("vi-VN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "consents" && <ConsentsTab />}
      </div>
    </main>
  );
}
