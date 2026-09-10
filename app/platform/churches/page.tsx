import type { Metadata } from "next";
import { PortalPage } from "@/components/platform/portal-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Find your church | Godschurches" },
  robots: { index: false, follow: false }
};

export default async function Page({
  searchParams
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { cursor } = await searchParams;
  return (
    <PortalPage
      view="discover"
      cursor={
        typeof cursor === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(cursor)
          ? cursor
          : undefined
      }
    />
  );
}
