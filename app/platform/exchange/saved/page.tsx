import type { Metadata } from "next";
import {
  ExchangeSavedPage,
  type ExchangeQuery
} from "@/components/platform/exchange-page-ui";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Saved Exchange choices",
  robots: { index: false, follow: false }
};
export default async function Page({
  searchParams
}: {
  searchParams: Promise<ExchangeQuery>;
}) {
  return <ExchangeSavedPage query={await searchParams} />;
}
