"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../../lib/auth";

// ── Types ────────────────────────────────────────────────────────────────

type OrderRecord = {
  id: string;
  listingKey: string;
  listingName: string;
  type: string;
  price: number;
  currency: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED";
  tenantId: string;
  buyerDisplayName?: string;
  createdAt: string;
};

type SaleRecord = {
  id: string;
  listingKey: string;
  listingName: string;
  type: string;
  price: number;
  currency: string;
  status: string;
  buyerDisplayName?: string;
  createdAt: string;
};

type PaginatedOrders = {
  items: OrderRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type PaginatedSales = {
  items: SaleRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
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

const STATUS_STYLES: Record<string, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  FAILED: "border-rose-200 bg-rose-50 text-rose-700",
  REFUNDED: "border-slate-200 bg-slate-50 text-slate-600",
};

// ── Main Page ────────────────────────────────────────────────────────────

export default function MarketplaceOrdersPage() {
  const [tab, setTab] = useState<"orders" | "purchase" | "sales">("orders");
  const [orders, setOrders] = useState<PaginatedOrders | null>(null);
  const [sales, setSales] = useState<PaginatedSales | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Purchase form
  const [listingKey, setListingKey] = useState("");
  const [purchasing, setPurchasing] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);

  const fetchOrders = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const url = `${API_BASE}/v1/marketplace/orders?page=${p}&pageSize=20`;
      const res = await fetch(url, { headers: getHeaders() });
      if (res.ok) setOrders(await res.json());
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  const fetchSales = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const url = `${API_BASE}/v1/marketplace/orders/sales?page=${p}&pageSize=20`;
      const res = await fetch(url, { headers: getHeaders() });
      if (res.ok) setSales(await res.json());
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (tab === "orders" || tab === "purchase") fetchOrders(page);
    if (tab === "sales") fetchSales(page);
  }, [tab, page, fetchOrders, fetchSales]);

  useEffect(() => { setPage(1); }, [tab]);

  const doPurchase = async () => {
    if (!listingKey.trim()) return;
    setPurchasing(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/v1/marketplace/orders/purchase`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ listingKey: listingKey.trim() }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: "✅ Purchase successful!" });
        setListingKey("");
        fetchOrders(1);
      } else {
        const err = await res.json();
        throw new Error(err.message || "Purchase failed");
      }
    } catch (err: any) {
      setMessage({ type: "error", text: `❌ ${err.message}` });
    } finally {
      setPurchasing(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      {/* Toast */}
      {message && (
        <div className={`fixed right-4 top-4 z-50 rounded-lg border px-5 py-3 text-sm font-semibold shadow-lg backdrop-blur ${
          message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"
        }`}>
          {message.text}
        </div>
      )}

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
        {/* Header */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-sky-700">Marketplace / Orders</p>
          <h1 className="mt-2 text-2xl font-bold tracking-normal text-slate-950">Lịch sử giao dịch</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Quản lý giao dịch mua, bán và báo cáo doanh số trên AIFUT Marketplace.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {(["orders", "purchase", "sales"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`min-w-24 rounded-md px-4 py-2 text-sm font-semibold transition ${
                tab === t ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {t === "orders" ? "📋 My Orders" : t === "purchase" ? "🛒 Purchase" : "📊 Sales Report"}
            </button>
          ))}
        </div>

        {tab === "purchase" && (
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-950">Purchase a Listing</h2>
            <p className="mt-1 text-sm text-slate-500">
              Nhập Listing Key (từ Marketplace) để mua connector hoặc workflow template.
            </p>
            <div className="mt-4 flex gap-2">
              <input
                value={listingKey}
                onChange={(e) => setListingKey(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") doPurchase(); }}
                className="h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4"
                placeholder="Listing Key (e.g. shopify-sync, zalo-zns)..."
              />
              <button
                type="button"
                disabled={purchasing || !listingKey.trim()}
                onClick={doPurchase}
                className="rounded-lg bg-slate-950 px-6 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {purchasing ? "Processing..." : "Purchase"}
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              💡 Find listing keys on the{" "}
              <a href="/marketplace" className="text-sky-600 underline">Marketplace</a>.
            </p>
          </div>
        )}

        {/* Orders Table */}
        {(tab === "orders" || tab === "purchase") && (
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-950">Order History</h2>
              <p className="mt-1 text-sm text-slate-500">
                {orders ? `${orders.total} order${orders.total !== 1 ? "s" : ""}` : "Loading..."}
              </p>
            </div>
            {loading ? (
              <div className="flex items-center justify-center p-12 text-slate-400">Loading orders...</div>
            ) : !orders || orders.items.length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-400">No orders yet. Head to Marketplace to make a purchase.</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Listing</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Type</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Price</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Status</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {orders.items.map((order) => (
                        <tr key={order.id} className="hover:bg-slate-50/50">
                          <td className="px-5 py-4">
                            <div className="font-medium text-slate-950">{order.listingName}</div>
                            <div className="text-xs text-slate-400">{order.listingKey}</div>
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-600">{order.type}</td>
                          <td className="px-5 py-4 text-sm font-semibold text-slate-900">
                            {order.price > 0 ? `${order.price.toLocaleString()}₫` : "Free"}
                          </td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[order.status] || STATUS_STYLES.PENDING}`}>
                              {order.status}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-500">
                            {new Date(order.createdAt).toLocaleDateString("vi-VN")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Pagination */}
                {orders.totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 border-t border-slate-100 px-5 py-4">
                    <button disabled={page <= 1} onClick={() => setPage(page - 1)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                      ← Prev
                    </button>
                    <span className="text-xs text-slate-500">Page {page} / {orders.totalPages}</span>
                    <button disabled={page >= orders.totalPages} onClick={() => setPage(page + 1)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Sales Report */}
        {tab === "sales" && (
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-950">Sales Report (Developer)</h2>
              <p className="mt-1 text-sm text-slate-500">
                {sales ? `${sales.total} sale${sales.total !== 1 ? "s" : ""}` : "Loading..."}
              </p>
            </div>
            {loading ? (
              <div className="flex items-center justify-center p-12 text-slate-400">Loading sales...</div>
            ) : !sales || sales.items.length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-400">
                No sales yet. Submit your connectors to the Marketplace to start earning.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Listing</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Buyer</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Price</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Status</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sales.items.map((sale) => (
                        <tr key={sale.id} className="hover:bg-slate-50/50">
                          <td className="px-5 py-4">
                            <div className="font-medium text-slate-950">{sale.listingName}</div>
                            <div className="text-xs text-slate-400">{sale.listingKey}</div>
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-600">{sale.buyerDisplayName || "—"}</td>
                          <td className="px-5 py-4 text-sm font-semibold text-emerald-700">
                            {sale.price > 0 ? `+${sale.price.toLocaleString()}₫` : "Free"}
                          </td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[sale.status] || STATUS_STYLES.PENDING}`}>
                              {sale.status}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-500">
                            {new Date(sale.createdAt).toLocaleDateString("vi-VN")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {sales.totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 border-t border-slate-100 px-5 py-4">
                    <button disabled={page <= 1} onClick={() => setPage(page - 1)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                      ← Prev
                    </button>
                    <span className="text-xs text-slate-500">Page {page} / {sales.totalPages}</span>
                    <button disabled={page >= sales.totalPages} onClick={() => setPage(page + 1)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
