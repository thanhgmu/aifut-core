export const dynamic = "force-dynamic";
export const revalidate = 0;

import dynamicImport from "next/dynamic";

const ProfileContent = dynamicImport(() => import("./ProfileContent"), {});

export default function DeveloperProfilePage() {
  return <ProfileContent />;
}
