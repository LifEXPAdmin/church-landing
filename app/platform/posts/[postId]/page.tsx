import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PostCard } from "@/components/platform/post-card";
import { PlatformShell } from "@/components/platform/platform-shell";
import { readPost } from "@/lib/platform/post-session";
import { getCurrentPlatformUser } from "@/lib/platform/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Post and discussion",
  description: "Read a public post and its comments on Godschurches."
};
export default async function PostPage({
  params,
  searchParams
}: {
  params: Promise<{ postId: string }>;
  searchParams: Promise<{ before?: string; cursor?: string }>;
}) {
  const { postId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(postId)) notFound();
  const user = await getCurrentPlatformUser();
  const query = await searchParams;
  const before =
    typeof query.before === "string" &&
    /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(query.before) &&
    Number.isFinite(Date.parse(query.before))
      ? new Date(query.before)
      : null;
  const cursor =
    typeof query.cursor === "string" &&
    /^[a-zA-Z0-9_-]{1,100}$/.test(query.cursor)
      ? query.cursor
      : null;
  const post = await readPost(postId, { before, cursor });
  if (!post) notFound();
  const comments = post.comments.slice(0, 30);
  const last = comments.at(-1);
  const path = `/platform/posts/${post.id}`;
  const more =
    post.comments.length > 30 && last
      ? `${path}?${new URLSearchParams({ before: last.createdAt.toISOString(), cursor: last.id })}`
      : undefined;
  const currentPath =
    before && cursor
      ? `${path}?${new URLSearchParams({ before: before.toISOString(), cursor })}`
      : path;
  return (
    <PlatformShell user={user}>
      <section className="container-shell py-8 sm:py-10">
        <div className="mx-auto max-w-3xl space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-4xl text-gc-text">Post and discussion</h1>
            <Link
              className="inline-flex min-h-11 items-center text-gc-accent underline"
              href="/platform"
            >
              Browse posts
            </Link>
          </div>
          {before && cursor && (
            <Link
              className="inline-flex min-h-11 items-center text-gc-accent underline"
              href={path}
            >
              Latest comments
            </Link>
          )}
          <PostCard
            post={{ ...post, comments }}
            currentUserId={user?.id}
            redirectTo={currentPath}
            fullDiscussion
            moreCommentsHref={more}
          />
        </div>
      </section>
    </PlatformShell>
  );
}
