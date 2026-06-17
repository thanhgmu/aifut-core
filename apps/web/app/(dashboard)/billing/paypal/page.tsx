// ============================================================================
// PayPal Topup Route — Server Component Page Entry
// Theo bản thiết kế: docs/roadmap/PAYPAL-FRONTEND-UI-DESIGN.md (mục VIII.2)
// Lượt 2 — force-dynamic, đón người dùng truy cập /billing/paypal
// ----------------------------------------------------------------------------
// Server Component — render header + <PayPalClientShell />.
// ============================================================================

import { PayPalClientShell } from "../../../../components/billing/paypal-client-shell";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function PayPalTopupPage() {
  return (
    <>
      {/* Header */}
      <header
        style={{
          marginBottom: 32,
          maxWidth: 640,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: "#9fb0ff",
            textTransform: "uppercase",
            letterSpacing: 1,
            marginBottom: 8,
          }}
        >
          AIFUT Billing
        </div>

        <h1
          style={{
            fontSize: 36,
            fontWeight: 800,
            margin: "0 0 8px",
            color: "#ffffff",
            lineHeight: 1.2,
          }}
        >
          Nạp tiền quốc tế
        </h1>

        <p
          style={{
            color: "#c8d2ff",
            fontSize: 16,
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          Nạp tiền vào Ví Ledger bằng USD qua PayPal. Hỗ trợ thẻ tín dụng và
          thẻ quốc tế. Tỷ giá quy đổi USD/VND được cập nhật real-time.
        </p>
      </header>

      {/* Client Shell — State Machine Orchestrator */}
      <PayPalClientShell />
    </>
  );
}
