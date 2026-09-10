import type { Metadata } from "next";
import { ChurchClaimPage } from "@/components/platform/church-claim-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Church representative review | Godschurches" },
  robots: { index: false, follow: false }
};
export default async function Page({
  searchParams
}: {
  searchParams: Promise<{ cursor?: string; churchId?: string }>;
}) {
  const { cursor, churchId } = await searchParams;
  return (
    <ChurchClaimPage
      review
      churchId={
        typeof churchId === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(churchId)
          ? churchId
          : undefined
      }
      cursor={
        typeof cursor === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(cursor)
          ? cursor
          : undefined
      }
    />
  );
}
