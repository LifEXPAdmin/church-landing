import type { Metadata } from "next";
import { PlatformShell } from "@/components/platform/platform-shell";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { TopicCreateScope } from "@/components/platform/topic-create-workspace";
import { ArtistEditor } from "@/components/platform/artist-editor";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Artists and music",
  robots: { index: false, follow: false }
};
export default async function Page() {
  const user = await getCurrentPlatformUser(),
    owner = user?.id ?? null;
  return (
    <TopicCreateScope owner={owner} workLabel="artist workspace">
      <PlatformShell user={user}>
        <div className="mx-auto max-w-4xl space-y-6 p-[12px] sm:p-6">
          <ArtistEditor key={`${owner ?? "guest"}:new`} owner={owner} />
        </div>
      </PlatformShell>
    </TopicCreateScope>
  );
}
