import type { Metadata } from "next";
import { ExchangeHandoffsPage } from "@/components/platform/exchange-handoff-page";
import type { ExchangeQuery } from "@/components/platform/exchange-page-ui";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "My Exchange inquiries",
  robots: { index: false, follow: false }
};
export default async function Page({
  searchParams
}: {
  searchParams: Promise<ExchangeQuery>;
}) {
  return <ExchangeHandoffsPage query={await searchParams} />;
}
