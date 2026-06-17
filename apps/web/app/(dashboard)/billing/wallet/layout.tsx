import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Wallet & Refund · AIFUT",
  description: "View wallet balance, transaction history, and request refunds.",
};

/**
 * Server Component layout shell for /billing/wallet.
 * Kế thừa dark theme từ billing dashboard layout cha.
 * Container maxWidth 1040px được quản lý bởi layout billing cha.
 * Chỉ thêm padding-top nhỏ và metadata.
 */
export default function WalletLayout({ children }: { children: ReactNode }) {
  return <div style={{ paddingTop: 4 }}>{children}</div>;
}
