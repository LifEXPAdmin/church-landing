import type { Metadata } from "next";
import { ExchangeDefaultsPage } from "@/components/platform/exchange-handoff-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Personal listing defaults",
  robots: { index: false, follow: false }
};
export default function Page() {
  return <ExchangeDefaultsPage />;
}
