import { WalletClientShell } from "../../../../components/billing/wallet-client-shell";

// Server Component entry for /billing/wallet (dashboard route group).
// Luôn fetch dữ liệu mới (force-dynamic).
// Delegates all interactivity to <WalletClientShell />.
export const dynamic = "force-dynamic";

export default function WalletPage() {
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
        <h1 style={{ fontSize: 36, margin: "8px 0 4px" }}>Wallet &amp; Refund</h1>
        <p style={{ color: "#c8d2ff", fontSize: 16, margin: 0 }}>
          Monitor your wallet balance, review transaction history, and submit refund
          requests.
        </p>
      </header>

      <WalletClientShell />
    </>
  );
}
