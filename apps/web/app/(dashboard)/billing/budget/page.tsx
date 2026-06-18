// ============================================================
// app/(dashboard)/billing/budget/page.tsx
// Server Component entry cho Hệ thống Hạn mức Chi phí AI
// (Anti-Drain Budget Caps).
//
// Đây là page orchestrator nạp toàn bộ các widget panel và
// form cấu hình vào layout hoàn chỉnh. Route tĩnh / streamable;
// mọi data fetching và interactivity delegate xuống client shell.
//
// Endpoint pattern đồng bộ với:
//   GET    /billing/budget/limits           ← BudgetLimit[]
//   GET    /billing/budget/limits/:period   ← BudgetLimit
//   POST   /billing/budget/limits           ← upsert
//   PATCH  /billing/budget/limits/:period   ← partial update
//   POST   /billing/budget/limits/unlock/:period ← force unlock
//   GET    /billing/budget/limits/health    ← BudgetHealth
//
// ============================================================

import { BudgetClientShell } from "./budget-client-shell";

export const dynamic = "force-dynamic";

export default function BudgetPage() {
  return (
    <>
      {/* ─── Page header ─── */}
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
          AIFUT Budget
        </div>
        <h1 style={{ fontSize: 36, margin: "8px 0 4px" }}>
          Hạn mức chi phí AI
        </h1>
        <p style={{ color: "#c8d2ff", fontSize: 16, margin: 0 }}>
          Thiết lập ngân sách AI theo chu kỳ để kiểm soát chi phí tự động.
          Hệ thống tự động khoá request AI khi vượt ngưỡng — tránh drain
          tài khoản do tác vụ bất thường hoặc lỗi vòng lặp.
        </p>
      </header>

      {/* ─── Budget Client Shell (interactive) ─── */}
      <BudgetClientShell />
    </>
  );
}
