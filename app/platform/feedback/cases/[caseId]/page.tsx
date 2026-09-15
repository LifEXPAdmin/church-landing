import type { Metadata } from "next";
import { FeedbackPage } from "@/components/platform/feedback-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Feedback receipt | God’s Churches" },
  robots: { index: false, follow: false }
};
export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ page?: string; received?: string }>;
}) {
  const [{ caseId }, q] = await Promise.all([params, searchParams]);
  return (
    <FeedbackPage
      view="detail"
      caseId={caseId}
      page={q.page}
      received={q.received === "1"}
    />
  );
}
