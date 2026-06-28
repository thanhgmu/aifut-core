export const dynamic = "force-dynamic";
export const revalidate = 0;

import dynamicImport from "next/dynamic";

const SandboxContent = dynamicImport(() => import("./SandboxContent"), {});

export default function DeveloperSandboxPage() {
  return <SandboxContent />;
}
