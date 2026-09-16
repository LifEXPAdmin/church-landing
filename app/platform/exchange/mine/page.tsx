import type { Metadata } from "next";
import {
  ExchangeList,
  type ExchangeQuery
} from "@/components/platform/exchange-page-ui";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "My listings",
  robots: { index: false, follow: false }
};
export default async function Page({
  searchParams
}: {
  searchParams: Promise<ExchangeQuery>;
}) {
  return <ExchangeList query={await searchParams} mine />;
}
