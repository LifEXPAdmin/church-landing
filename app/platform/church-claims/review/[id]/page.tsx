import type { Metadata } from "next";
import { ChurchClaimPage } from "@/components/platform/church-claim-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Church representative review | Godschurches" },
  robots: { index: false, follow: false }
};
export default async function Page({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ChurchClaimPage id={id} review />;
}
