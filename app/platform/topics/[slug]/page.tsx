import Link from "next/link";
import { PlatformShell } from "@/components/platform/platform-shell";
import { PrivateSnapshotGuard } from "@/components/platform/private-snapshot-guard";
import { TopicReadBoundary } from "@/components/platform/topic-read-boundary";
import { TopicParticipation } from "@/components/platform/topic-controls";
import { PublicShareControls } from "@/components/platform/public-share-controls";
import {
  TopicAccountLinks,
  TopicNavigation,
  TopicPosts,
  TopicUnavailable,
  topicChecksum
} from "@/components/platform/topic-page-ui";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { topicPage } from "@/lib/platform/topic-session";
import { topicHref } from "@/lib/platform/topic-types";
import { publicResourceMetadata } from "@/lib/platform/share-metadata";
import type { PublicQuery } from "@/lib/indexing-policy";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<PublicQuery>;
}) {
  return publicResourceMetadata(
    "topic",
    (await params).slug,
    await searchParams
  );
}
export default async function PublicTopicPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ before?: string; cursor?: string }>;
}) {
  const user = await getCurrentPlatformUser(),
    { slug } = await params,
    query = await searchParams,
    path = topicHref(slug);
  let content;
  try {
    const view = await topicPage(slug),
      topic = view.community;
    content = (
      <TopicReadBoundary
        key={user?.id ?? "guest"}
        owner={user?.id ?? null}
        url={`/api/platform/topics?${new URLSearchParams({ view: "public", slug })}`}
        checksum={topicChecksum(topic)}
      >
        <div className="space-y-6">
          <header className="space-y-3">
            <p className="gc-eyebrow">Public topic community</p>
            <h1 className="break-words text-4xl">{topic.name}</h1>
            <p className="whitespace-pre-wrap break-words">
              {topic.description}
            </p>
          </header>
          <section
            className="space-y-3 rounded-xl border border-gc-divider bg-gc-surface p-5"
            aria-label="Community rules"
          >
            <h2 className="text-2xl">Community rules</h2>
            <p className="whitespace-pre-wrap break-words">{topic.rules}</p>
            <p className="text-sm text-gc-muted">
              Public discussions are readable by guests. Members post as
              themselves.
            </p>
          </section>
          <div className="flex flex-wrap items-center gap-4">
            <PublicShareControls kind="topic" id={slug} />
            <Link
              className="inline-flex min-h-11 items-center underline"
              href={`/platform/reports?${new URLSearchParams({ targetType: "TOPIC", targetId: topic.id })}`}
            >
              Report this topic
            </Link>
          </div>
          {user ? (
            <PrivateSnapshotGuard
              owner={user.id}
              url={`/api/platform/topics?${new URLSearchParams({ view: "topic", slug })}`}
              checksum={topicChecksum(view)}
              label="topic participation"
            >
              <TopicParticipation view={view} owner={user.id} />
            </PrivateSnapshotGuard>
          ) : (
            <TopicAccountLinks next={path} />
          )}
          <TopicPosts
            communityId={topic.id}
            path={path}
            owner={user?.id}
            query={query}
          />
        </div>
      </TopicReadBoundary>
    );
  } catch (error) {
    content = <TopicUnavailable error={error} href={path} />;
  }
  return (
    <PlatformShell user={user}>
      <section className="container-shell py-8 sm:py-10">
        <div className="mx-auto max-w-3xl space-y-6">
          <TopicNavigation />
          {content}
        </div>
      </section>
    </PlatformShell>
  );
}
