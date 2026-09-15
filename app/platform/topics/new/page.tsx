import type { Metadata } from "next";
import Link from "next/link";
import { PlatformShell } from "@/components/platform/platform-shell";
import { PrivateSnapshotGuard } from "@/components/platform/private-snapshot-guard";
import { TopicCreateForm } from "@/components/platform/topic-controls";
import {
  TopicAccountLinks,
  TopicNavigation,
  TopicUnavailable,
  topicChecksum
} from "@/components/platform/topic-page-ui";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { topicAccountPage } from "@/lib/platform/topic-session";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Create a topic",
  robots: { index: false, follow: false }
};
export default async function CreateTopicPage() {
  const user = await getCurrentPlatformUser();
  let content;
  if (!user) content = <TopicAccountLinks next="/platform/topics/new" />;
  else {
    try {
      const access = await topicAccountPage();
      content = (
        <PrivateSnapshotGuard
          key={user.id}
          owner={user.id}
          url="/api/platform/topics?view=eligibility"
          checksum={topicChecksum(access)}
          label="topic account access"
        >
          {access.eligible ? (
            <TopicCreateForm owner={user.id} />
          ) : (
            <div className="space-y-3">
              <p>
                Verify your email and adult participation before creating or
                joining topics.
              </p>
              <Link
                className="gc-button gc-button-quiet"
                href="/platform/settings/account"
              >
                Review account verification
              </Link>
            </div>
          )}
        </PrivateSnapshotGuard>
      );
    } catch (error) {
      content = <TopicUnavailable error={error} href="/platform/topics/new" />;
    }
  }
  return (
    <PlatformShell user={user}>
      <section className="container-shell py-8 sm:py-10">
        <div className="mx-auto max-w-3xl space-y-6">
          <h1 className="text-4xl">Create a topic community</h1>
          <p>
            A public place for discussion, with clear rules and a responsible
            owner. A topic is separate from a church or ministry team.
          </p>
          <TopicNavigation />
          {content}
        </div>
      </section>
    </PlatformShell>
  );
}
