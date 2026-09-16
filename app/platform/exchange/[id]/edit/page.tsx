import type { Metadata } from "next";
import { ExchangeEditorPage } from "@/components/platform/exchange-page-ui";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Manage listing",
  robots: { index: false, follow: false }
};
export default async function Page({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  return <ExchangeEditorPage id={(await params).id} />;
}
