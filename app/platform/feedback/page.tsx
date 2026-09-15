import type { Metadata } from "next";
import { FeedbackPage } from "@/components/platform/feedback-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Share feedback | God’s Churches" },
  robots: { index: false, follow: false }
};
export default function Page() {
  return <FeedbackPage view="new" />;
}
