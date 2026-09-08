import type { Metadata } from "next";
import { PortalPage } from "@/components/platform/portal-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Review connections | Godschurches" },
  robots: { index: false, follow: false }
};

export default async function Page({
  params
}: {
  params: Promise<{ churchId: string }>;
}) {
  const { churchId } = await params;
  return <PortalPage view="review" churchId={churchId} />;
}
