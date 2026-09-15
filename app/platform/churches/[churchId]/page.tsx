import { publicResourceMetadata } from "@/lib/platform/share-metadata";
import type { Metadata } from "next";
import type { PublicQuery } from "@/lib/indexing-policy";
import { PublicStructuredData } from "@/components/platform/public-structured-data";
import { PortalPage } from "@/components/platform/portal-page";

export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
  searchParams
}: {
  params: Promise<{ churchId: string }>;
  searchParams: Promise<PublicQuery>;
}): Promise<Metadata> {
  return publicResourceMetadata(
    "church",
    (await params).churchId,
    await searchParams
  );
}

export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ churchId: string }>;
  searchParams: Promise<{ postBefore?: string; postCursor?: string }>;
}) {
  const { churchId } = await params;
  const query = await searchParams;
  return (
    <>
      <PublicStructuredData kind="church" id={churchId} />
      <PortalPage
        view="discover"
        churchId={churchId}
        postBefore={query.postBefore}
        postCursor={query.postCursor}
      />
    </>
  );
}
