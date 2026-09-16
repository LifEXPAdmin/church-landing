import type { Metadata } from "next";
import { ExchangeEditorPage } from "@/components/platform/exchange-page-ui";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Create a listing",
  robots: { index: false, follow: false }
};
export default function Page() {
  return <ExchangeEditorPage />;
}
