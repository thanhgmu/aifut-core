import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Billing & Subscription · AIFUT",
  description: "Track usage, manage your subscription, and review invoices.",
};

/**
 * Server Component layout shell for the billing dashboard route group.
 * Provides the page chrome (background, max-width container) while the
 * interactive data layer lives in the client shell rendered by page.tsx.
 */
export default function BillingDashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0b1020",
        color: "#f5f7ff",
        fontFamily: "Arial, sans-serif",
        padding: "40px 24px 80px",
      }}
    >
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>{children}</div>
    </div>
  );
}
