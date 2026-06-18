import Link from "next/link";
import type { CSSProperties } from "react";
import { BillingClientShell } from "../../../components/billing/billing-client-shell";

// Server Component entry for /billing (dashboard route group).
// Keeps the route static/streamable; all token-bound data fetching and
// interactivity is delegated to the client shell below.
export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// Billing Dashboard Nav — đấu nối điều hướng dòng tiền
//   /billing/subscription → quản lý gói cước
//   /billing/paypal       → nạp tiền quốc tế (PayPal Smart Buttons)
//   /billing/analytics    → đồ thị Trí tuệ nhân tạo (AI cost analytics)
//   /billing/budget       → 🛡️ Hạn mức chi phí AI (giới hạn ngân sách)
// Inline styles kế thừa pattern dashboard hiện hữu.
// ─────────────────────────────────────────────────────────────

const navBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "10px 18px",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 14,
  textDecoration: "none",
  fontFamily: "Arial, sans-serif",
};

type NavKey = "subscription" | "paypal" | "analytics" | "budget";

const navVariants: Record<NavKey, CSSProperties> = {
  subscription: {
    background: "rgba(109,124,255,0.12)",
    border: "1px solid rgba(109,124,255,0.25)",
    color: "#6d7cff",
  },
  paypal: {
    // Nổi bật hơn — đây là cổng nạp tiền quốc tế (revenue critical path).
    background: "#6d7cff",
    border: "1px solid #6d7cff",
    color: "#ffffff",
  },
  analytics: {
    background: "rgba(128,224,160,0.12)",
    border: "1px solid rgba(128,224,160,0.3)",
    color: "#80e0a0",
  },
  budget: {
    // Glassy frost — hạn mức chi phí AI, ánh vàng nhẹ
    background: "rgba(255, 215, 0, 0.08)",
    border: "1px solid rgba(255, 215, 0, 0.2)",
    color: "#ffd700",
    boxShadow: "0 0 12px rgba(255, 215, 0, 0.06)",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
  },
};

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

        {/* ─── Billing Dashboard Nav ─── */}
        <nav
          aria-label="Điều hướng dòng tiền"
          style={{
            marginTop: 16,
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <Link
            href="/billing/subscription"
            style={{ ...navBase, ...navVariants.subscription }}
          >
            📋 Quản lý gói cước →
          </Link>
          <Link
            href="/billing/paypal"
            style={{ ...navBase, ...navVariants.paypal }}
          >
            💳 Nạp tiền quốc tế (PayPal) →
          </Link>
          <Link
            href="/billing/analytics"
            style={{ ...navBase, ...navVariants.analytics }}
          >
            📊 Phân tích chi phí AI →
          </Link>
          <Link
            href="/billing/budget"
            style={{ ...navBase, ...navVariants.budget }}
          >
            🛡️ Hạn mức chi phí AI →
          </Link>
        </nav>
      </header>

      <BillingClientShell />
    </>
  );
}
