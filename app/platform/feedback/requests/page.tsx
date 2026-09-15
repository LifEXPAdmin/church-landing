import type { Metadata } from "next";
import { FeedbackPage } from "@/components/platform/feedback-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "My feedback | God’s Churches" },
  robots: { index: false, follow: false }
};
export default async function Page({
  searchParams
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  return <FeedbackPage view="requests" page={page} />;
}
