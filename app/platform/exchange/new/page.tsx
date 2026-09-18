import type { Metadata } from "next";
import { ExchangeEditorPage } from "@/components/platform/exchange-page-ui";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Create a listing",
  robots: { index: false, follow: false }
};
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  return <ExchangeEditorPage pantryCategory={typeof query.pantryCategory === "string" ? query.pantryCategory : undefined} />;
}
