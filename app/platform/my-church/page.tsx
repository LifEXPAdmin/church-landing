import type { Metadata } from "next";
import { PortalPage } from "@/components/platform/portal-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "My church | Godschurches" },
  robots: { index: false, follow: false }
};

export default function Page() {
  return <PortalPage view="my-church" />;
}
