export const dynamic = "force-dynamic";
export const revalidate = 0;

import dynamicImport from "next/dynamic";

const DeveloperDashboardContent = dynamicImport(() => import("./DeveloperContent"), {});

export default function DeveloperPage() {
  return <DeveloperDashboardContent />;
}
