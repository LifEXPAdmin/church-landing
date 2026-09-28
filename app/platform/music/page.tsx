import type { Metadata } from "next";
import { PlatformShell } from "@/components/platform/platform-shell";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { ArtistLibrary } from "@/components/platform/artist-library";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Artists and music",
  robots: { index: false, follow: false }
};
export default async function Page() {
  const user = await getCurrentPlatformUser(),
    owner = user?.id ?? null;
  return (
    <PlatformShell user={user}>
      <div className="mx-auto max-w-4xl space-y-6 p-[12px] sm:p-6">
        <ArtistLibrary key={`${owner ?? "guest"}:music`} owner={owner} />
      </div>
    </PlatformShell>
  );
}
