import type { Metadata } from "next";
import { ExchangeHandoffsPage } from "@/components/platform/exchange-handoff-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Private Exchange handoff",
  robots: { index: false, follow: false }
};
export default async function Page({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  return <ExchangeHandoffsPage id={(await params).id} />;
}
