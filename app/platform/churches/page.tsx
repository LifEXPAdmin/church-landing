import type { Metadata } from "next";
import { PortalPage } from "@/components/platform/portal-page";
import { churchSearchQuery } from "@/lib/platform/church-search";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Find your church | Godschurches" },
  robots: { index: false, follow: false }
};

export default async function Page({
  searchParams
}: {
  searchParams: Promise<{ cursor?: string; q?: string }>;
}) {
  const { cursor, q } = await searchParams;
  return (
    <PortalPage
      view="discover"
      query={churchSearchQuery(q)}
      cursor={
        typeof cursor === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(cursor)
          ? cursor
          : undefined
      }
    />
  );
}
