import Link from "next/link";
import { AnalyticsClientShell } from "../../../../components/billing/analytics-client-shell";

// Server Component entry for /billing/analytics.
// force-dynamic ensures every navigation re-fetches live AI usage data
// rather than serving a stale ISR cache (data is tenant-scoped).
export const dynamic = "force-dynamic";

export default function AiAnalyticsDashboardPage() {
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
          AIFUT Analytics
        </div>
        <h1 style={{ fontSize: 36, margin: "8px 0 4px" }}>
          💰 AI Cost Analytics
        </h1>
        <p style={{ color: "#c8d2ff", fontSize: 16, margin: 0, maxWidth: 600 }}>
          Phân tích chi phí, token và hiệu năng của tất cả model AI mà tenant
          của bạn đã sử dụng trong các workflow.
        </p>
        <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
          <Link
            href="/billing"
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
            ← Billing Dashboard
          </Link>
          <Link
            href="/billing/subscription"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 18px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#c8d2ff",
              fontWeight: 600,
              fontSize: 14,
              textDecoration: "none",
              fontFamily: "Arial, sans-serif",
            }}
          >
            📋 Quản lý gói cước →
          </Link>
        </div>
      </header>

      <AnalyticsClientShell />
    </>
  );
}
