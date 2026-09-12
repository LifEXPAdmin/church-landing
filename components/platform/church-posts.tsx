import Link from "next/link";
import { readChurchPostFeed } from "@/lib/platform/post-session";
import { PostCard } from "./post-card";
import { PostComposer } from "./post-composer";
import { PortalRetry } from "./portal-retry";
export async function ChurchPosts({
  churchId,
  before,
  cursor
}: {
  churchId: string;
  before?: string;
  cursor?: string;
}) {
  const date =
    before &&
    /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(before) &&
    Number.isFinite(Date.parse(before))
      ? new Date(before)
      : null;
  const afterId =
    cursor && /^[a-zA-Z0-9_-]{1,100}$/.test(cursor) ? cursor : null;
  let result;
  try {
    result = await readChurchPostFeed(churchId, {
      before: date,
      cursor: afterId
    });
  } catch {
    return (
      <section className="mt-8 space-y-3">
        <h2 className="text-3xl">Church posts</h2>
        <p role="alert">Church posts could not be loaded. Please try again.</p>
        <PortalRetry />
      </section>
    );
  }
  const posts = result.posts.slice(0, 30),
    last = posts.at(-1),
    path = `/platform/churches/${churchId}`;
  return (
    <section
      aria-label="Church posts"
      className="mx-auto mt-8 max-w-3xl space-y-5"
    >
      <h2 className="text-3xl">Church posts</h2>
      <p className="text-gc-muted">
        Updates from this church and personal posts deliberately shared here.
        Each post keeps its own audience.
      </p>
      {result.canShare && (
        <PostComposer
          initialChurch={churchId}
          label="Share on this church page"
        />
      )}
      {result.pinned.length > 0 && (
        <section aria-label="Pinned church notices" className="space-y-4">
          <h3 className="text-2xl">Pinned notices</h3>
          {result.pinned.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={result.viewerId ?? undefined}
              redirectTo={path}
            />
          ))}
        </section>
      )}
      {date && afterId && (
        <Link
          className="inline-flex min-h-11 items-center text-gc-accent underline"
          href={path}
        >
          Latest church posts
        </Link>
      )}
      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          currentUserId={result.viewerId ?? undefined}
          redirectTo={path}
        />
      ))}
      {!posts.length && (
        <p className="text-gc-muted">
          {date && afterId
            ? "No older posts are available."
            : "No more posts are available to this audience yet."}
        </p>
      )}
      {result.posts.length > 30 && last && (
        <Link
          className="inline-flex min-h-11 items-center text-gc-accent underline"
          href={`${path}?${new URLSearchParams({ postBefore: last.createdAt.toISOString(), postCursor: last.id })}`}
        >
          Older church posts
        </Link>
      )}
    </section>
  );
}
