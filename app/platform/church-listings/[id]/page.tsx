import type { Metadata } from "next";
import { ChurchListingPage } from "@/components/platform/church-listing-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Church listings | Godschurches" },
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
  return <ChurchListingPage id={id} preview={preview === "1"} />;
}
