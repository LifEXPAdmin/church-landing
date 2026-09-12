import type { Metadata } from "next";
import { PlatformShell } from "@/components/platform/platform-shell";
import { GuestAccountPrompt } from "@/components/platform/guest-account-prompt";
import { CommunityReportForm } from "@/components/platform/community-report-form";
import { CommunityReportReceipts } from "@/components/platform/community-report-receipts";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { readerId } from "@/lib/platform/reader-navigation";
import {
  communityReportTargets,
  type CommunityReportTarget
} from "@/lib/platform/community-report-types";
export const metadata: Metadata = {
  title: "Private reports",
  robots: { index: false, follow: false }
};
export const dynamic = "force-dynamic";
export default async function ReportsPage({
  searchParams
}: {
  searchParams: Promise<{
    targetType?: string;
    targetId?: string;
    receipt?: string;
    after?: string;
  }>;
}) {
  const user = await getCurrentPlatformUser(),
    q = await searchParams;
  const targetType = communityReportTargets.includes(
    q.targetType as CommunityReportTarget
  )
    ? (q.targetType as CommunityReportTarget)
    : undefined;
  const targetId = readerId(q.targetId),
    receipt = readerId(q.receipt),
    after = readerId(q.after);
  const query = new URLSearchParams({
    ...(targetType && targetId ? { targetType, targetId } : {}),
    ...(receipt ? { receipt } : {}),
    ...(after ? { after } : {})
  });
  return (
    <PlatformShell user={user}>
      {user ? (
        <section className="container-shell py-10">
          <div className="mx-auto max-w-2xl space-y-5">
            {targetType && targetId ? (
              <CommunityReportForm
                key={`${user.id}-${targetType}-${targetId}`}
                owner={user.id}
                type={targetType}
                id={targetId}
              />
            ) : (
              <CommunityReportReceipts
                key={`${user.id}-${receipt ?? "list"}-${after ?? "first"}`}
                owner={user.id}
                id={receipt}
                after={after}
              />
            )}
          </div>
        </section>
      ) : (
        <GuestAccountPrompt
          next={`/platform/reports?${query}`}
          reason="account"
        />
      )}
    </PlatformShell>
  );
}
