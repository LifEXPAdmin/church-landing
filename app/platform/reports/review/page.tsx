import type { Metadata } from "next";
import { PlatformShell } from "@/components/platform/platform-shell";
import { GuestAccountPrompt } from "@/components/platform/guest-account-prompt";
import { CommunityReportReview } from "@/components/platform/community-report-review";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { readerId } from "@/lib/platform/reader-navigation";
import { reportReviewHref } from "@/lib/platform/community-report-types";
export const metadata: Metadata = {
  title: "Review reports",
  robots: { index: false, follow: false }
};
export const dynamic = "force-dynamic";
export default async function ReportReviewPage({
  searchParams
}: {
  searchParams: Promise<{ id?: string; status?: string; after?: string }>;
}) {
  const user = await getCurrentPlatformUser(),
    q = await searchParams;
  const id = readerId(q.id) || undefined,
    after = readerId(q.after) || undefined,
    closed = q.status === "CLOSED";
  return (
    <PlatformShell user={user}>
      {user ? (
        <section className="container-shell py-10">
          <div className="mx-auto max-w-2xl">
            <CommunityReportReview
              key={`${user.id}-${id ?? "queue"}-${closed}-${after ?? "first"}`}
              owner={user.id}
              id={id}
              closed={closed}
              after={after}
            />
          </div>
        </section>
      ) : (
        <GuestAccountPrompt
          next={reportReviewHref(id, closed, after)}
          reason="account"
        />
      )}
    </PlatformShell>
  );
}
