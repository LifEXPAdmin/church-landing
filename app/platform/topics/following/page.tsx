import type { Metadata } from "next";
import { PlatformShell } from "@/components/platform/platform-shell";
import { PrivateSnapshotGuard } from "@/components/platform/private-snapshot-guard";
import {
  TopicAccountLinks,
  TopicNavigation,
  TopicPosts,
  TopicUnavailable,
  topicChecksum
} from "@/components/platform/topic-page-ui";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { topicFollowingPage } from "@/lib/platform/topic-session";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Topics I follow",
  robots: { index: false, follow: false }
};
export default async function FollowedTopicsPage({
  searchParams
}: {
  searchParams: Promise<{ before?: string; cursor?: string }>;
}) {
  const user = await getCurrentPlatformUser(),
    query = await searchParams;
  let content;
  if (!user) content = <TopicAccountLinks next="/platform/topics/following" />;
  else {
    try {
      const scope = await topicFollowingPage();
      content = (
        <PrivateSnapshotGuard
          key={user.id}
          owner={user.id}
          url="/api/platform/topics?view=following"
          checksum={topicChecksum(scope)}
          label="followed topics"
        >
          <TopicPosts
            followed
            path="/platform/topics/following"
            owner={user.id}
            query={query}
          />
        </PrivateSnapshotGuard>
      );
    } catch (error) {
      content = (
        <TopicUnavailable error={error} href="/platform/topics/following" />
      );
    }
  }
  return (
    <PlatformShell user={user}>
      <section className="container-shell py-8 sm:py-10">
        <div className="mx-auto max-w-3xl space-y-6">
          <h1 className="text-4xl">Topics I follow</h1>
          <p>
            The latest public posts from your followed topics. Following is a
            private reading choice and does not turn on phone alerts.
          </p>
          <TopicNavigation />
          {content}
        </div>
      </section>
    </PlatformShell>
  );
}
