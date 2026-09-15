import type { Metadata } from "next";
import { ChurchClaimPage } from "@/components/platform/church-claim-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Church representative review | God’s Churches" },
  robots: { index: false, follow: false }
};
export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams:Promise<{adminReturnTo?:string}>;
}) {
  const { id } = await params;
  const query=await searchParams;
  return <ChurchClaimPage id={id} review adminBack={query.adminReturnTo}/>;
}
