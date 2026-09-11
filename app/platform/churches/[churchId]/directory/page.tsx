import type { Metadata } from "next";
import { PortalPage } from "@/components/platform/portal-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Member directory | Godschurches" },
  robots: { index: false, follow: false }
};

export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ churchId: string }>;
  searchParams: Promise<{ focus?: string }>;
}) {
  const { churchId } = await params;
  const { focus } = await searchParams;
  return <PortalPage view="directory" churchId={churchId} focus={focus} />;
}
