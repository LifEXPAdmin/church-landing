import type { Metadata } from "next";
import { FeedbackPage } from "@/components/platform/feedback-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Share feedback | God’s Churches" },
  robots: { index: false, follow: false }
};
export default async function Page({
  searchParams
}: {
  searchParams: Promise<{ prompt?: string }>;
}) {
  const value = (await searchParams).prompt;
  const promptClaimId =
    typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value)
      ? value
      : undefined;
  return <FeedbackPage view="new" promptClaimId={promptClaimId} />;
}
