import type { Metadata } from "next";
import { ChurchClaimPage } from "@/components/platform/church-claim-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Church setup | Godschurches" },
  robots: { index: false, follow: false }
};
export default async function Page({
  searchParams
}: {
  searchParams: Promise<{ churchId?: string; q?: string }>;
}) {
  const { churchId, q } = await searchParams;
  return (
    <ChurchClaimPage
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
