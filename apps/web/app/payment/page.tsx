"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { API_BASE, getStoredToken } from "../../lib/auth";

type Transaction = {
  id: string;
  invoiceId: string | null;
  gateway: string;
  gatewayTxId: string | null;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string | null;
  paidAt: string | null;
  createdAt: string;
  invoice: { number: string; description: string } | null;
};

export default function PaymentPage() {
  const [token, setToken] = useState("");
  const [me, setMe] = useState<any>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [capabilities, setCapabilities] = useState<any[]>([]);

  const [payAmount, setPayAmount] = useState(99000);
  const [payDesc, setPayDesc] = useState("AIFUT Starter Plan");
  const [payResult, setPayResult] = useState<{ url?: string; error?: string } | null>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    const saved = getStoredToken();
    setToken(saved);

    const load = async () => {
      setLoading(true);
      try {
        // Load capabilities
        const capsRes = await fetch(`${API_BASE}/payments/capabilities`);
        if (capsRes.ok) setCapabilities(await capsRes.json());

        if (!saved) return;

        // Load user
        const meRes = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${saved}` } });
        if (meRes.ok) {
          const meData = await meRes.json();
          setMe(meData);

          // Load payment history
          const tenantSlug = meData.tenant?.slug;
          if (tenantSlug) {
            const tenantRes = await fetch(`${API_BASE}/tenancy/current`, { headers: { Authorization: `Bearer ${saved}`, "x-tenant-slug": tenantSlug } });
            if (tenantRes.ok) {
              const tenantInfo = await tenantRes.json();
              const txRes = await fetch(`${API_BASE}/payments/history/${tenantInfo.id}`, { headers: { Authorization: `Bearer ${saved}` } });
              if (txRes.ok) {
                const txData = await txRes.json();
                setTransactions(txData.transactions || []);
                setTotal(txData.total || 0);
              }
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load payment data");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleCreatePayment = useCallback(async () => {
    if (!me || !token) return;
    setPaying(true);
    setPayResult(null);

    try {
      const meRes = await fetch(`${API_BASE}/tenancy/current`, { headers: { Authorization: `Bearer ${token}`, "x-tenant-slug": me.tenant?.slug } });
      const tenantInfo = await meRes.json();

      const res = await fetch(`${API_BASE}/payments/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          tenantId: tenantInfo.id,
          accountId: `${tenantInfo.id}`,
          amount: payAmount,
          currency: "VND",
          description: payDesc,
          returnUrl: window.location.origin + "/payment",
        }),
      });

      const data = await res.json();
      if (data.success && data.paymentUrl) {
        setPayResult({ url: data.paymentUrl });
      } else {
        setPayResult({ error: data.errorMessage || "Payment creation failed" });
      }
    } catch (err) {
      setPayResult({ error: err instanceof Error ? err.message : "Network error" });
    } finally {
      setPaying(false);
    }
  }, [me, token, payAmount, payDesc]);

  function formatPrice(amount: number, currency: string) {
    if (currency === "VND") return `${amount.toLocaleString("vi-VN")}₫`;
    return `$${amount.toFixed(2)}`;
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  const statusColors: Record<string, string> = {
    pending: "#ffb366",
    success: "#80e0a0",
    failed: "#ff8080",
    refunded: "#9fb0ff",
  };

  return (
    <main style={{ minHeight: "100vh", background: "#0b1020", color: "#f5f7ff", fontFamily: "Arial, sans-serif", padding: "40px 24px 80px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 12, color: "#9fb0ff", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>AIFUT Payment</div>
          <h1 style={{ fontSize: 36, margin: "8px 0 4px" }}>Payment Center</h1>
          <p style={{ color: "#c8d2ff", fontSize: 16 }}>Make payments and view transaction history.</p>
        </div>

        {/* Payment Form */}
        <div style={{ padding: 24, borderRadius: 20, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", marginBottom: 28 }}>
          <h2 style={{ fontSize: 20, marginBottom: 16 }}>Make a Payment</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: "block", color: "#9fb0ff", fontSize: 13, marginBottom: 6 }}>Amount (VND)</label>
              <input type="number" value={payAmount} onChange={(e) => setPayAmount(Number(e.target.value))} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.3)", color: "#f5f7ff", fontSize: 16, fontWeight: 700, outline: "none" }} />
            </div>
            <div>
              <label style={{ display: "block", color: "#9fb0ff", fontSize: 13, marginBottom: 6 }}>Description</label>
              <input type="text" value={payDesc} onChange={(e) => setPayDesc(e.target.value)} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.3)", color: "#f5f7ff", fontSize: 14, outline: "none" }} />
            </div>
          </div>

          {capabilities.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: "#9fb0ff", fontSize: 13, marginBottom: 8 }}>Payment Gateways</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {capabilities.map((cap: any) => (
                  <span key={cap.gateway} style={{ padding: "6px 14px", borderRadius: 8, background: "rgba(109,124,255,0.1)", color: "#6d7cff", fontSize: 13, fontWeight: 600 }}>
                    {cap.name} ({cap.paymentMethods.join(", ")})
                  </span>
                ))}
              </div>
            </div>
          )}

          {payResult?.url ? (
            <div style={{ padding: 16, borderRadius: 12, background: "rgba(80,200,120,0.1)", border: "1px solid rgba(80,200,120,0.2)", color: "#80e0a0", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>✅ Payment URL created</div>
              <a href={payResult.url} target="_blank" rel="noopener noreferrer" style={{ color: "#6d7cff", textDecoration: "underline", fontSize: 14, wordBreak: "break-all" }}>{payResult.url}</a>
            </div>
          ) : payResult?.error ? (
            <div style={{ padding: 16, borderRadius: 12, background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.2)", color: "#ffb3b3", marginBottom: 16 }}>{payResult.error}</div>
          ) : null}

          <button onClick={handleCreatePayment} disabled={paying || !token} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: paying ? "#4a56b3" : "#6d7cff", color: "white", fontWeight: 700, fontSize: 16, cursor: paying ? "not-allowed" : "pointer" }}>
            {paying ? "Creating payment..." : `Pay ${formatPrice(payAmount, "VND")}`}
          </button>

          {!token && <div style={{ marginTop: 12, color: "#9fb0ff", fontSize: 13, textAlign: "center" }}><Link href="/login" style={{ color: "#6d7cff" }}>Sign in</Link> to make payments.</div>}
        </div>

        {/* Transaction History */}
        <div style={{ padding: 24, borderRadius: 20, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <h2 style={{ fontSize: 20, marginBottom: 16 }}>Transaction History ({total})</h2>

          {loading ? (
            <div style={{ color: "#9fb0ff", fontSize: 14, textAlign: "center", padding: 20 }}>Loading transactions...</div>
          ) : transactions.length === 0 ? (
            <div style={{ color: "#9fb0ff", fontSize: 14, textAlign: "center", padding: 20 }}>No transactions yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {transactions.map((tx) => (
                <div key={tx.id} style={{ padding: "14px 18px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{tx.invoice?.description || "Payment"}</div>
                    <div style={{ color: "#9fb0ff", fontSize: 12, marginTop: 2 }}>{formatDate(tx.createdAt)} · {tx.gateway} {tx.paymentMethod && `· ${tx.paymentMethod}`}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{formatPrice(tx.amount, tx.currency)}</div>
                    <span style={{ fontSize: 12, color: statusColors[tx.status] || "#9fb0ff", fontWeight: 600, textTransform: "uppercase" }}>{tx.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16, color: "#9fb0ff", fontSize: 13 }}>
          <div>© 2026 AIFUT — Payment Center</div>
          <div style={{ display: "flex", gap: 16 }}>
            <Link href="/" style={{ color: "#9fb0ff", textDecoration: "none" }}>Home</Link>
            <Link href="/billing" style={{ color: "#9fb0ff", textDecoration: "none" }}>Billing</Link>
            <Link href="/templates" style={{ color: "#9fb0ff", textDecoration: "none" }}>Templates</Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
