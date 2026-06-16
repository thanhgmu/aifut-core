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
          }}
        >
          AIFUT Billing
        </div>
        <h1 style={{ fontSize: 36, margin: "8px 0 4px" }}>Billing &amp; Subscription</h1>
        <p style={{ color: "#c8d2ff", fontSize: 16, margin: 0 }}>
          Track consumption, manage your plan, and review past invoices.
        </p>
      </header>

      <BillingClientShell />
    </>
  );
}
