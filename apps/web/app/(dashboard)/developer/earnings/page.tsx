"use client";
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../../../../lib/auth";

// ── Types ────────────────────────────────────────────────────────────────

type BalanceInfo = {
  availableBalance: string;
  pendingBalance: string;
  paidOut: string;
  totalEarnings: string;
  currency: string;
};

type PayoutRecord = {
  id: string;
  amount: string;
  currency: string;
  type: string;
  description: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
};

type TransactionRecord = PayoutRecord;

type PaginatedTxs = {
  items: TransactionRecord[];
  summary: { totalItems: number; netEarnings: string };
  page: number;
  pageSize: number;
  totalPages: number;
};

type PaginatedPayouts = {
  items: PayoutRecord[];
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

function formatVND(value: string | bigint): string {
  const n = typeof value === "string" ? BigInt(value) : value;
  const isNegative = n < BigInt(0);
  const abs = isNegative ? -n : n;
  // Value is in smallest unit (VND * 100). Divide by 100 for VND display.
  const vndAmount = Number(abs) / 100;
  const formatted = new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(vndAmount);
  return isNegative ? `-${formatted}` : formatted;
}

const TYPE_STYLES: Record<string, string> = {
  sale: "border-emerald-200 bg-emerald-50 text-emerald-700",
  commission: "border-sky-200 bg-sky-50 text-sky-700",
  bonus: "border-yellow-200 bg-yellow-50 text-yellow-700",
  payout: "border-rose-200 bg-rose-50 text-rose-700",
  pending_payout: "border-amber-200 bg-amber-50 text-amber-700",
};

const TYPE_LABELS: Record<string, string> = {
  sale: "Sale",
  commission: "Commission",
  bonus: "Bonus",
  payout: "Payout",
  pending_payout: "Pending",
};

// ── Main Page ────────────────────────────────────────────────────────────

export default function DeveloperEarningsPage() {
  const [tab, setTab] = useState<"overview" | "transactions" | "payouts">("overview");
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [transactions, setTransactions] = useState<PaginatedTxs | null>(null);
  const [payouts, setPayouts] = useState<PaginatedPayouts | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Payout form
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [notes, setNotes] = useState("");
  const [requesting, setRequesting] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);

  const loadBalance = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/v1/developer/payout/balance`, { headers: getHeaders() });
      if (res.ok) setBalance(await res.json());
    } catch { /* silent */ }
  }, []);

  const loadTransactions = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/v1/developer/payout/transactions?page=${p}&pageSize=20`, { headers: getHeaders() });
      if (res.ok) setTransactions(await res.json());
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  const loadPayouts = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/v1/developer/payout/history?page=${p}&pageSize=20`, { headers: getHeaders() });
      if (res.ok) setPayouts(await res.json());
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadBalance(); }, [loadBalance]);
  useEffect(() => {
    if (tab === "transactions") loadTransactions(page);
    if (tab === "payouts") loadPayouts(page);
  }, [tab, page, loadTransactions, loadPayouts]);
  useEffect(() => { setPage(1); }, [tab]);

  const doRequestPayout = async () => {
    if (!amount || BigInt(amount) <= BigInt(0)) return;
    setRequesting(true);
    setMessage(null);
    try {
      const body: any = {
        amount,
        method,
        notes: notes || undefined,
      };
      if (method === "bank_transfer") {
        body.accountInfo = { accountNumber, accountName };
      }

      const res = await fetch(`${API_BASE}/v1/developer/payout/request`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "✅ Payout completed!" });
        setAmount("");
        setAccountNumber("");
        setAccountName("");
        setNotes("");
        loadBalance();
        loadPayouts(1);
      } else {
        const err = await res.json();
        throw new Error(err.message || "Payout failed");
      }
    } catch (err: any) {
      setMessage({ type: "error", text: `❌ ${err.message}` });
    } finally {
      setRequesting(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const available = balance ? BigInt(balance.availableBalance) : BigInt(0);
  const pending = balance ? BigInt(balance.pendingBalance) : BigInt(0);
  const paidOut = balance ? BigInt(balance.paidOut) : BigInt(0);
  const totalEarned = balance ? BigInt(balance.totalEarnings) : BigInt(0);

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
          <p className="text-xs font-semibold uppercase tracking-normal text-sky-700">Developer / Earnings</p>
          <h1 className="mt-2 text-2xl font-bold tracking-normal text-slate-950">Thu nhập & Payout</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Quản lý thu nhập từ marketplace, yêu cầu rút tiền và theo dõi lịch sử giao dịch.
          </p>
        </div>

        {/* Balance Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-500">Available</p>
            <p className="mt-2 text-2xl font-bold text-emerald-700">{formatVND(available)}</p>
            <p className="mt-1 text-xs text-slate-400">Ready to withdraw</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-500">Pending</p>
            <p className="mt-2 text-2xl font-bold text-amber-700">{formatVND(pending)}</p>
            <p className="mt-1 text-xs text-slate-400">In processing</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-500">Paid Out</p>
            <p className="mt-2 text-2xl font-bold text-sky-700">{formatVND(paidOut)}</p>
            <p className="mt-1 text-xs text-slate-400">Total withdrawn</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-500">Total Earned</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{formatVND(totalEarned)}</p>
            <p className="mt-1 text-xs text-slate-400">Lifetime earnings</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {(["overview", "transactions", "payouts"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`min-w-28 rounded-md px-4 py-2 text-sm font-semibold transition ${
                tab === t ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {t === "overview" ? "🏦 Overview" : t === "transactions" ? "📋 Transactions" : "💸 Payouts"}
            </button>
          ))}
        </div>

        {/* Tab: Overview */}
        {tab === "overview" && (
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            {/* Payout Request Form */}
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-slate-950">Request Payout</h2>
              <p className="mt-1 text-sm text-slate-500">
                Rút tiền từ số dư khả dụng. Tối thiểu 10,000₫.
              </p>

              <div className="mt-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Amount (VND smallest unit)</label>
                  <div className="mt-1 flex gap-2">
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      min="1000000" // 10000 VND * 100
                      className="h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4"
                      placeholder="e.g. 10000000 (100,000₫)"
                    />
                    <button
                      type="button"
                      onClick={() => setAmount(available.toString())}
                      className="rounded-lg border border-slate-200 px-3 text-xs font-semibold text-sky-600 hover:bg-sky-50"
                    >
                      Max
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Available: {formatVND(available)} · Enter amount × 100 (e.g. 10,000₫ = 1,000,000)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Method</label>
                  <select value={method} onChange={(e) => setMethod(e.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none">
                    <option value="bank_transfer">🏦 Bank Transfer</option>
                    <option value="wallet">💳 Wallet</option>
                    <option value="paypal">🌐 PayPal</option>
                  </select>
                </div>

                {method === "bank_transfer" && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Account Number</label>
                      <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4"
                        placeholder="Bank account number" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Account Name</label>
                      <input value={accountName} onChange={(e) => setAccountName(e.target.value)}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4"
                        placeholder="Account holder name" />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700">Notes (optional)</label>
                  <input value={notes} onChange={(e) => setNotes(e.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none ring-sky-500/20 focus:border-sky-500 focus:ring-4"
                    placeholder="Any notes about this payout" />
                </div>

                <button
                  type="button"
                  disabled={requesting || !amount || BigInt(amount) <= BigInt(0) || BigInt(amount) > available}
                  onClick={doRequestPayout}
                  className="w-full rounded-lg bg-slate-950 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {requesting ? "Processing..." : "Yêu cầu rút tiền"}
                </button>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-slate-950">Recent Activity</h2>
              <p className="mt-1 text-sm text-slate-500">Last 5 transactions.</p>

              <div className="mt-4 space-y-3">
                {!transactions || transactions.items.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">No transactions yet.</p>
                ) : (
                  transactions.items.slice(0, 5).map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                      <div>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${TYPE_STYLES[tx.type] || "border-slate-200 bg-slate-50 text-slate-600"}`}>
                          {TYPE_LABELS[tx.type] || tx.type}
                        </span>
                        <p className="mt-1 text-xs text-slate-500">{tx.description || "—"}</p>
                      </div>
                      <span className={`text-sm font-semibold ${tx.type === "payout" ? "text-rose-600" : "text-emerald-700"}`}>
                        {formatVND(tx.amount)}
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <a href="/developer/profile"
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-center text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  ← Profile
                </a>
                <a href="/marketplace"
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-center text-xs font-semibold text-sky-600 hover:bg-sky-50">
                  Marketplace →
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Transactions */}
        {tab === "transactions" && (
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-950">Transaction History</h2>
              <p className="mt-1 text-sm text-slate-500">
                {transactions ? `${transactions.summary.totalItems} transaction${transactions.summary.totalItems !== 1 ? "s" : ""}` : "Loading..."}
                {transactions && ` · Net: ${formatVND(transactions.summary.netEarnings)}`}
              </p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center p-12 text-slate-400">Loading transactions...</div>
            ) : !transactions || transactions.items.length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-400">No transactions yet.</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Type</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Description</th>
                        <th className="px-5 py-3 text-right text-xs font-semibold uppercase text-slate-500">Amount</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {transactions.items.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-50/50">
                          <td className="px-5 py-4">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${TYPE_STYLES[tx.type] || "border-slate-200 bg-slate-50 text-slate-600"}`}>
                              {TYPE_LABELS[tx.type] || tx.type}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-600">{tx.description || "—"}</td>
                          <td className={`px-5 py-4 text-right text-sm font-semibold ${tx.type === "payout" || tx.amount.startsWith("-") ? "text-rose-600" : "text-emerald-700"}`}>
                            {formatVND(tx.amount)}
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-500">
                            {new Date(tx.createdAt).toLocaleDateString("vi-VN")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {transactions.totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 border-t border-slate-100 px-5 py-4">
                    <button disabled={page <= 1} onClick={() => setPage(page - 1)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">← Prev</button>
                    <span className="text-xs text-slate-500">Page {page} / {transactions.totalPages}</span>
                    <button disabled={page >= transactions.totalPages} onClick={() => setPage(page + 1)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Next →</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Tab: Payout History */}
        {tab === "payouts" && (
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-950">Payout History</h2>
              <p className="mt-1 text-sm text-slate-500">
                {payouts ? `${payouts.total} payout${payouts.total !== 1 ? "s" : ""}` : "Loading..."}
              </p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center p-12 text-slate-400">Loading payouts...</div>
            ) : !payouts || payouts.items.length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-400">No payouts yet.</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Reference</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Description</th>
                        <th className="px-5 py-3 text-right text-xs font-semibold uppercase text-slate-500">Amount</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {payouts.items.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/50">
                          <td className="px-5 py-4">
                            <span className="font-mono text-xs text-slate-500">{p.referenceId || "—"}</span>
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-600">{p.description || "Payout"}</td>
                          <td className="px-5 py-4 text-right text-sm font-semibold text-rose-600">{formatVND(p.amount)}</td>
                          <td className="px-5 py-4 text-sm text-slate-500">
                            {new Date(p.createdAt).toLocaleDateString("vi-VN")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {payouts.totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 border-t border-slate-100 px-5 py-4">
                    <button disabled={page <= 1} onClick={() => setPage(page - 1)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">← Prev</button>
                    <span className="text-xs text-slate-500">Page {page} / {payouts.totalPages}</span>
                    <button disabled={page >= payouts.totalPages} onClick={() => setPage(page + 1)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Next →</button>
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
