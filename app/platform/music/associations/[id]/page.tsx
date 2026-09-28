import type { Metadata } from "next";
import { PlatformShell } from "@/components/platform/platform-shell";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { ArtistAssociationReview } from "@/components/platform/artist-delegates";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Artists and music",
  robots: { index: false, follow: false }
};
export default async function Page({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentPlatformUser(),
    owner = user?.id ?? null;
  const { id } = await params;
  return (
    <PlatformShell user={user}>
      <div className="mx-auto max-w-4xl space-y-6 p-[12px] sm:p-6">
        <ArtistAssociationReview key={`${owner ?? "guest"}:[id]${id}`} owner={owner} id={id} />
      </div>
    </PlatformShell>
  );
}
