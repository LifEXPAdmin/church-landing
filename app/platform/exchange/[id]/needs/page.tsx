import type { Metadata } from "next";
import { ExchangeNeedsPage } from "@/components/platform/exchange-needs-page";
import type { ExchangeQuery } from "@/components/platform/exchange-page-ui";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Church Needs",
  robots: { index: false, follow: false }
};
export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ExchangeQuery>;
}) {
  return (
    <ExchangeNeedsPage
      listingId={(await params).id}
      query={await searchParams}
    />
  );
}
