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
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { cursor } = await searchParams;
  return (
    <ChurchClaimPage
      cursor={
        typeof cursor === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(cursor)
          ? cursor
          : undefined
      }
    />
  );
}
