import type { Metadata } from "next";
import { MediaReader } from "@/components/platform/media-catalog-reader";
import { PlatformShell } from "@/components/platform/platform-shell";
import { getCurrentPlatformUser } from "@/lib/platform/session";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Media",
  robots: { index: false, follow: false }
};
export default async function Page({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentPlatformUser(),
    owner = user?.id ?? null;
  return (
    <PlatformShell
      user={user}
      signInReturnTo={`/platform/media/${encodeURIComponent((await params).id)}`}
    >
      <div className="mx-auto max-w-4xl space-y-6 p-[12px] sm:p-6">
        <MediaReader owner={owner} id={(await params).id} />
      </div>
    </PlatformShell>
  );
}
