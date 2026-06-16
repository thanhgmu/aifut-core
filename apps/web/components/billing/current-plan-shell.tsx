"use client";

import Link from "next/link";
import { formatBillingDate, statusColor } from "../../lib/billing";
import type { CurrentPlanInfo } from "../../types/billing";

/** Header banner summarizing the tenant's active subscription. */
export function CurrentPlanShell({ plan }: { plan: CurrentPlanInfo }) {
  const isFree = plan.key === "free" || plan.priceDisplay === "Free";

  return (
    <section
      style={{
        padding: 24,
        borderRadius: 20,
        background: "linear-gradient(135deg, rgba(109,124,255,0.1), rgba(109,124,255,0.03))",
        border: "1px solid rgba(109,124,255,0.2)",
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <div>
        <div
          style={{
            fontSize: 12,
            color: "#9fb0ff",
            textTransform: "uppercase",
            letterSpacing: 1,
            marginBottom: 6,
          }}
        >
          Current plan
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 28, fontWeight: 800 }}>{plan.name}</span>
          <StatusPill status={plan.status} />
        </div>

        {plan.trialEndsAt && (
          <div style={{ marginTop: 8, color: "#ffb366", fontSize: 14 }}>
            Trial ends: {formatBillingDate(plan.trialEndsAt)}
          </div>
        )}

        {plan.renewsAt && plan.status === "active" && (
          <div style={{ marginTop: 8, color: "#c8d2ff", fontSize: 14 }}>
            Renews: {formatBillingDate(plan.renewsAt)}
            {plan.autoRenew ? " (auto-renew)" : ""}
          </div>
        )}
      </div>

      <Link
        href="/pricing"
        style={{
          padding: "12px 20px",
          borderRadius: 12,
          background: "#6d7cff",
          color: "white",
          textDecoration: "none",
          fontWeight: 700,
          fontSize: 15,
        }}
      >
        {isFree ? "Upgrade Plan" : "Change Plan"}
      </Link>
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const color = statusColor(status);
  return (
    <span
      style={{
        padding: "4px 12px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        textTransform: "capitalize",
        color,
        background: `${color}1f`,
        border: `1px solid ${color}40`,
      }}
    >
      {status}
    </span>
  );
}
