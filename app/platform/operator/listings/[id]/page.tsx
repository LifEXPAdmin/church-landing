import type { Metadata } from "next";
import { ChurchListingPage } from "@/components/platform/church-listing-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Church listings | Godschurches" },
  robots: { index: false, follow: false }
};
export default async function Page({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ChurchListingPage id={id} review />;
}
