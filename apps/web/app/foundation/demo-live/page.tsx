export const dynamic = "force-dynamic";
export const revalidate = 0;

import dynamicImport from "next/dynamic";

const DemoLiveContent = dynamicImport(() => import("./DemoContent"), {});

export default function DemoLivePage() {
  return <DemoLiveContent />;
}
