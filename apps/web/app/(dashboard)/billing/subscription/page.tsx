import { SubscriptionClientShell } from "../../../../components/billing/subscription-client-shell";

// Server Component entry for /billing/subscription.
// Giữ route static/streamable; mọi data fetching và interactivity
// được delegate xuống SubscriptionClientShell.
export const dynamic = "force-dynamic";

export default function SubscriptionPage() {
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
          AIFUT Subscription
        </div>
        <h1 style={{ fontSize: 36, margin: "8px 0 4px" }}>
          Gói cước &amp; Bảng giá
        </h1>
        <p style={{ color: "#c8d2ff", fontSize: 16, margin: 0 }}>
          Quản lý gói cước, theo dõi hạn mức sử dụng tài nguyên, so sánh và
          nâng cấp gói dịch vụ phù hợp.
        </p>
      </header>

      <SubscriptionClientShell />
    </>
  );
}
