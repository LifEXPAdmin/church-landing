import type { Metadata } from "next";
import { PortalPage } from "@/components/platform/portal-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Church details | Godschurches" },
  robots: { index: false, follow: false }
};

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
