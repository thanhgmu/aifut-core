import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "AI Cost Analytics · AIFUT",
  description:
    "Track AI usage costs, token consumption, model efficiency, and detect anomalies across all connected AI providers.",
};

/**
 * Server Component layout for the `/billing/analytics` route.
 *
 * This route lives inside the billing dashboard group which already provides
 * the dark theme shell and max-width container. Children are hydrated by
 * page.tsx, which renders the client-side <AnalyticsClientShell />.
 */
export default function AiAnalyticsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
