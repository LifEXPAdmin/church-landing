import type { Metadata } from "next";
import { MediaPlaylistWorkspace } from "@/components/platform/media-playlist-workspace";
import { PlatformShell } from "@/components/platform/platform-shell";
import { getCurrentPlatformUser } from "@/lib/platform/session";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Saved media",
  robots: { index: false, follow: false }
};
export default async function Page() {
  const user = await getCurrentPlatformUser();
  return (
    <PlatformShell user={user} signInReturnTo="/platform/media/saved">
      <div className="mx-auto max-w-4xl space-y-6 p-[12px] sm:p-6">
        <MediaPlaylistWorkspace owner={user?.id ?? null} mode="saved" />
      </div>
    </PlatformShell>
  );
}
