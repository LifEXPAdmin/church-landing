import type { Metadata } from "next";
import { FeedbackIdeasPage } from "@/components/platform/feedback-ideas-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Reviewed idea | God’s Churches" },
  robots: { index: false, follow: false }
};
export default async function Page({
  params
}: {
  params: Promise<{ ideaId: string }>;
}) {
  return <FeedbackIdeasPage id={(await params).ideaId} />;
}
