import type { Metadata } from "next";
import { ChurchListingPage } from "@/components/platform/church-listing-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Church listings | Godschurches" },
  robots: { index: false, follow: false }
};
export default async function Page({
  searchParams
}: {
  searchParams: Promise<{ churchId?: string; q?: string }>;
}) {
  const { churchId, q } = await searchParams;
  return (
    <ChurchListingPage
      create
      churchId={
        typeof churchId === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(churchId)
          ? churchId
          : undefined
      }
      query={typeof q === "string" ? q : ""}
    />
  );
}
