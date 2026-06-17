// ============================================================================
// PayPal Topup Route — Server Component Layout
// Theo bản thiết kế: docs/roadmap/PAYPAL-FRONTEND-UI-DESIGN.md (mục VIII.1)
// Lượt 2 — metadata SEO + layout shell cho route /billing/paypal
// ----------------------------------------------------------------------------
// Server Component — không dùng "use client", không có hooks.
// Kế thừa theme và layout từ route group (dashboard).
// ============================================================================

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Nạp tiền PayPal · AIFUT",
  description:
    "Nạp tiền vào Ví Ledger AIFUT bằng USD qua PayPal Smart Buttons. " +
    "Hỗ trợ thẻ tín dụng và thẻ quốc tế.",
  openGraph: {
    title: "Nạp tiền PayPal · AIFUT",
    description:
      "Nạp tiền vào Ví Ledger AIFUT bằng USD qua PayPal. " +
      "Chuyển đổi tự động USD/VND với tỷ giá real-time.",
  },
};

export default function PayPalTopupLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div
      style={{
        paddingTop: 4,
        minHeight: "100%",
      }}
    >
      {children}
    </div>
  );
}
