export const dynamic = "force-dynamic";
export const revalidate = 0;

import dynamicImport from "next/dynamic";

const EarningsContent = dynamicImport(() => import("./EarningsContent"), {});

export default function DeveloperEarningsPage() {
  return <EarningsContent />;
}
