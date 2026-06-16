"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchBillingDashboard, subscribeToPlan } from "../../lib/billing";
import type { BillingDashboardData } from "../../types/billing";
import { CurrentPlanShell } from "./current-plan-shell";
import { UsageMeterGrid } from "./usage-meter-grid";
import { PricingTierCards } from "./pricing-tier-cards";
import { InvoiceTransactionTable } from "./invoice-transaction-table";

type LoadState = "loading" | "ready" | "empty" | "error";

/**
 * Client orchestration shell: loads the billing dashboard view-model and
 * composes the presentational sub-components. Handles loading / empty / error
 * states and the subscribe action plumbing.
 */
export function BillingClientShell() {
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<BillingDashboardData | null>(null);
  const [error, setError] = useState<string>("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  async function load() {
    setState("loading");
    setError("");
    try {
      const result = await fetchBillingDashboard();
      if (!result) {
        setState("empty");
        return;
      }
      setData(result);
      setState("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load billing data");
      setState("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubscribe(planKey: string) {
    setPendingKey(planKey);
    setNotice(null);
    const result = await subscribeToPlan(planKey);
    setNotice({ ok: result.success, message: result.message ?? (result.success ? "Subscribed" : "Failed") });
    setPendingKey(null);
    if (result.success) await load();
  }

  if (state === "loading") {
    return <PanelMessage tone="muted">Loading billing data…</PanelMessage>;
  }

  if (state === "error") {
    return (
      <PanelMessage tone="error">
        {error || "Something went wrong."}
        <div style={{ marginTop: 12 }}>
          <button onClick={load} style={retryBtn}>Retry</button>
        </div>
      </PanelMessage>
    );
  }

  if (state === "empty" || !data) {
    return (
      <PanelMessage tone="muted">
        Billing data is not available yet. Sign in and seed the billing plans to continue.
        <div style={{ marginTop: 12 }}>
          <Link href="/login" style={{ color: "#6d7cff", fontWeight: 700 }}>
            Sign in →
          </Link>
        </div>
      </PanelMessage>
    );
  }

  return (
    <div style={{ display: "grid", gap: 28 }}>
      {notice && (
        <div
          style={{
            padding: 14,
            borderRadius: 12,
            background: notice.ok ? "rgba(80,200,120,0.1)" : "rgba(255,80,80,0.1)",
            border: `1px solid ${notice.ok ? "rgba(80,200,120,0.2)" : "rgba(255,80,80,0.2)"}`,
            color: notice.ok ? "#b3ffcc" : "#ffb3b3",
          }}
        >
          {notice.message}
        </div>
      )}

      <CurrentPlanShell plan={data.currentPlan} />
      <UsageMeterGrid meters={data.meters} />
      <PricingTierCards tiers={data.tiers} pendingKey={pendingKey} onSubscribe={handleSubscribe} />
      <InvoiceTransactionTable invoices={data.invoices} transactions={data.transactions} />
    </div>
  );
}

function PanelMessage({ children, tone }: { children: React.ReactNode; tone: "muted" | "error" }) {
  return (
    <div
      style={{
        padding: 32,
        borderRadius: 20,
        textAlign: "center",
        background: tone === "error" ? "rgba(255,80,80,0.08)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${tone === "error" ? "rgba(255,80,80,0.2)" : "rgba(255,255,255,0.08)"}`,
        color: tone === "error" ? "#ffb3b3" : "#c8d2ff",
      }}
    >
      {children}
    </div>
  );
}

const retryBtn: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 10,
  border: "none",
  background: "#6d7cff",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};
