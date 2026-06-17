import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Subscription & Plans · AIFUT",
  description:
    "Manage your subscription plan, view usage quotas, compare tiers, and upgrade or downgrade your plan.",
};

/**
 * Server Component layout shell for /billing/subscription.
 * Kế thừa parent layout từ /billing (màu nền #0b1020, Arial).
 * Chỉ cần metadata + padding, content render ở page.tsx.
 */
export default function SubscriptionLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
