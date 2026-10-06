import type { Metadata } from "next";
import { MediaPlaylistWorkspace } from "@/components/platform/media-playlist-workspace";
import { PlatformShell } from "@/components/platform/platform-shell";
import { getCurrentPlatformUser } from "@/lib/platform/session";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Media playlist",
  robots: { index: false, follow: false }
};
export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const user = await getCurrentPlatformUser(),
    { id } = await params,
    editing = (await searchParams).edit === "1";
  return (
    <PlatformShell
      user={user}
      signInReturnTo={`/platform/media/playlists/${encodeURIComponent(id)}${editing ? "?edit=1" : ""}`}
    >
      <div className="mx-auto max-w-4xl space-y-6 p-[12px] sm:p-6">
        <MediaPlaylistWorkspace
          owner={user?.id ?? null}
          mode="detail"
          id={id}
          editing={editing}
        />
      </div>
    </PlatformShell>
  );
}
