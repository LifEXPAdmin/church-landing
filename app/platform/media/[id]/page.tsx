import type { Metadata } from "next";
import { publicResourceMetadata } from "@/lib/platform/share-metadata";
import { publicPageIdentity, type PublicQuery } from "@/lib/indexing-policy";
import { PublicStructuredData } from "@/components/platform/public-structured-data";
import { MediaReader } from "@/components/platform/media-catalog-reader";
import { PlatformShell } from "@/components/platform/platform-shell";
import { getCurrentPlatformUser } from "@/lib/platform/session";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<PublicQuery>;
}): Promise<Metadata> {
  return publicResourceMetadata("media", (await params).id, await searchParams);
}
export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<PublicQuery>;
}) {
  const [user, { id }, query] = await Promise.all([
    getCurrentPlatformUser(),
    params,
    searchParams
  ]);
  const path = `/platform/media/${encodeURIComponent(id)}`,
    owner = user?.id ?? null;
  return (
    <PlatformShell user={user}>
      {!publicPageIdentity(path, query).filtered && (
        <PublicStructuredData kind="media" id={id} />
      )}
      <div className="mx-auto max-w-4xl space-y-6 p-[12px] sm:p-6">
        <MediaReader owner={owner} id={id} />
      </div>
    </PlatformShell>
  );
}
