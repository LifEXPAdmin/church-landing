import { publicResourceMetadata } from "@/lib/platform/share-metadata";
import type { Metadata } from "next";
import { PortalPage } from "@/components/platform/portal-page";

export const dynamic = "force-dynamic";
export async function generateMetadata({
  params
}: {
  params: Promise<{ churchId: string }>;
}): Promise<Metadata> {
  return publicResourceMetadata("church", (await params).churchId);
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
    <PortalPage
      view="discover"
      churchId={churchId}
      postBefore={query.postBefore}
      postCursor={query.postCursor}
    />
  );
}
