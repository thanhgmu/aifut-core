import Link from "next/link";
import { BillingClientShell } from "../../../components/billing/billing-client-shell";

// Server Component entry for /billing (dashboard route group).
// Keeps the route static/streamable; all token-bound data fetching and
// interactivity is delegated to the client shell below.
export const dynamic = "force-dynamic";

export default function BillingDashboardPage() {
  return (
    <>
      <header style={{ marginBottom: 32 }}>
        <div
          style={{
            fontSize: 12,
            color: "#9fb0ff",
            textTransform: "uppercase",
            letterSpacing: 1,
            marginBottom: 6,
          }}
        >
          AIFUT Billing
        </div>
        <h1 style={{ fontSize: 36, margin: "8px 0 4px" }}>Billing &amp; Subscription</h1>
        <p style={{ color: "#c8d2ff", fontSize: 16, margin: 0 }}>
          Track consumption, manage your plan, and review past invoices.
        </p>
        <div style={{ marginTop: 12 }}>
          <Link
            href="/billing/subscription"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 18px",
              borderRadius: 10,
              background: "rgba(109,124,255,0.12)",
              border: "1px solid rgba(109,124,255,0.25)",
              color: "#6d7cff",
              fontWeight: 700,
              fontSize: 14,
              textDecoration: "none",
              fontFamily: "Arial, sans-serif",
            }}
          >
            📋 Quản lý gói cước →
          </Link>
        </div>
      </header>

      <BillingClientShell />
    </>
  );
}
