import type { Metadata } from "next";
import { ExchangeNeedsPage } from "@/components/platform/exchange-needs-page";
import type { ExchangeQuery } from "@/components/platform/exchange-page-ui";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "My Needs contributions",
  robots: { index: false, follow: false }
};
export default async function Page({
  searchParams
}: {
  searchParams: Promise<ExchangeQuery>;
}) {
  return <ExchangeNeedsPage query={await searchParams} />;
}
