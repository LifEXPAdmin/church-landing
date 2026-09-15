import { createHash } from "node:crypto";
import Link from "next/link";
import { PortalError } from "@/lib/platform/portal-policy";
import { accountEntryHref } from "@/lib/platform/account-entry";
import { readPosts } from "@/lib/platform/post-session";
import { readerDate, readerId } from "@/lib/platform/reader-navigation";
import { PostCard } from "./post-card";

export const topicChecksum = (data: unknown) =>
  createHash("sha256").update(JSON.stringify(data)).digest("hex");
export function TopicNavigation() {
  return (
    <nav
      aria-label="Topic navigation"
      className="flex flex-wrap gap-x-5 gap-y-1"
    >
      <Link
        prefetch={false}
        className="inline-flex min-h-11 items-center underline"
        href="/platform/topics"
      >
        Discover topics
      </Link>
      <Link
        prefetch={false}
        className="inline-flex min-h-11 items-center underline"
        href="/platform/topics/following"
      >
        Topics I follow
      </Link>
      <Link
        prefetch={false}
        className="inline-flex min-h-11 items-center underline"
        href="/platform/topics?mine=1"
      >
        My topic choices
      </Link>
      <Link
        prefetch={false}
        className="inline-flex min-h-11 items-center underline"
        href="/platform/topics?owned=1"
      >
        Topics I own
      </Link>
      <Link
        prefetch={false}
        className="inline-flex min-h-11 items-center underline"
        href="/platform/topics/new"
      >
        Create a topic
      </Link>
    </nav>
  );
}
export function TopicUnavailable({
  error,
  href = "/platform/topics"
}: {
  error: unknown;
  href?: string;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-gc-divider p-5">
      <h1 className="text-3xl">Topic information unavailable</h1>
      <p role="status">
        {error instanceof PortalError
          ? error.message
          : "This page could not be loaded. Your saved choices are unchanged. Reconnect and try again."}
      </p>
      <Link prefetch={false} className="gc-button gc-button-quiet" href={href}>
        Reload current topic page
      </Link>
      <TopicNavigation />
    </div>
  );
}
export function TopicAccountLinks({ next }: { next: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link
        prefetch={false}
        className="gc-button"
        href={accountEntryHref("signup", next, "topic")}
      >
        Create an account to participate
      </Link>
      <Link
        prefetch={false}
        className="gc-button gc-button-quiet"
        href={accountEntryHref("login", next, "topic")}
      >
        Sign in
      </Link>
    </div>
  );
}
export async function TopicPosts({
  communityId,
  followed = false,
  path,
  owner,
  query
}: {
  communityId?: string;
  followed?: boolean;
  path: string;
  owner?: string;
  query: { before?: string; cursor?: string };
}) {
  const before = readerDate(query.before),
    cursor = readerId(query.cursor);
  const all = await readPosts({
    topicCommunityId: communityId,
    followedTopics: followed,
    before,
    cursor,
    limit: 21
  });
  const posts = all.slice(0, 20),
    last = posts.at(-1);
  const currentPath =
    path +
    (before && cursor
      ? `?${new URLSearchParams({ before: before.toISOString(), cursor })}`
      : "");
  return (
    <section
      aria-label={followed ? "Posts in topics you follow" : "Topic discussions"}
      className="space-y-5"
    >
      <h2 className="text-2xl">
        {followed ? "Posts in topics you follow" : "Topic discussions"}
      </h2>
      {before && cursor && (
        <Link
          prefetch={false}
          className="gc-button gc-button-quiet"
          href={path}
        >
          Latest topic posts
        </Link>
      )}
      {!posts.length && (
        <p>
          {followed
            ? "No posts to show here yet. Follow a public topic to add its discussions to this stream."
            : "No public discussions on this page yet. Join and accept the rules to start one."}
        </p>
      )}
      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          currentUserId={owner}
          redirectTo={currentPath}
        />
      ))}
      {all.length > 20 && last && (
        <Link
          prefetch={false}
          className="gc-button gc-button-quiet"
          href={`${path}?${new URLSearchParams({ before: last.createdAt.toISOString(), cursor: last.id })}`}
        >
          Older topic posts
        </Link>
      )}
    </section>
  );
}
