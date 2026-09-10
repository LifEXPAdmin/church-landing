import type { Metadata } from "next";
import { ChurchClaimPage } from "@/components/platform/church-claim-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Church setup | Godschurches" },
  robots: { index: false, follow: false }
};
export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { id } = await params;
  const { preview } = await searchParams;
  return <ChurchClaimPage id={id} preview={preview === "1"} />;
}
