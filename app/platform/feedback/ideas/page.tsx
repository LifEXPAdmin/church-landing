import type { Metadata } from "next";
import { FeedbackIdeasPage } from "@/components/platform/feedback-ideas-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Reviewed ideas | God’s Churches" },
  robots: { index: false, follow: false }
};
export default async function Page({
  searchParams
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  return <FeedbackIdeasPage {...await searchParams} />;
}
