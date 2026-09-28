import type { Metadata } from "next";
import { PlatformShell } from "@/components/platform/platform-shell";
import { TopicCreateScope } from "@/components/platform/topic-create-workspace";
import {
  TopicFollowingScope,
  TopicFollowingWorkspace
} from "@/components/platform/topic-following-workspace";
import {
  TopicAccountLinks,
  TopicNavigation
} from "@/components/platform/topic-page-ui";
import { readerDate, readerId } from "@/lib/platform/reader-navigation";
import { getCurrentPlatformUser } from "@/lib/platform/session";
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
    input = await searchParams;
  const before = readerDate(input.before),
    cursor = readerId(input.cursor);
  const query =
    before && cursor ? { before: before.toISOString(), cursor } : {};
  const content = (
    <PlatformShell user={user}>
      <section className="container-shell py-8 sm:py-10">
        <div className="mx-auto max-w-3xl space-y-6">
          <h1 className="text-4xl">Topics I follow</h1>
          <p>
            The latest public posts from your followed topics. Following is a
            private reading choice and does not turn on phone alerts.
          </p>
          <TopicNavigation />
          {user ? (
            <TopicFollowingWorkspace />
          ) : (
            <TopicAccountLinks next="/platform/topics/following" />
          )}
        </div>
      </section>
    </PlatformShell>
  );
  return (
    <TopicCreateScope
      key={`${query.before ?? ""}:${query.cursor ?? ""}`}
      owner={user?.id ?? null}
      workLabel="followed topic work"
    >
      {user ? (
        <TopicFollowingScope
          owner={user.id}
          before={query.before}
          cursor={query.cursor}
        >
          {content}
        </TopicFollowingScope>
      ) : (
        content
      )}
    </TopicCreateScope>
  );
}
