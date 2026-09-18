import { createHash } from "node:crypto";
import { PrivateSnapshotGuard } from "@/components/platform/private-snapshot-guard";
import { publicResourceMetadata } from "@/lib/platform/share-metadata";
import { DiscussionBack } from "@/components/platform/discussion-back";
import type { Metadata } from "next";
import type { PublicQuery } from "@/lib/indexing-policy";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PostCard } from "@/components/platform/post-card";
import { PlatformShell } from "@/components/platform/platform-shell";
import { readPost, readPostEditor } from "@/lib/platform/post-session";
import { PostControls } from "@/components/platform/post-controls";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { GroupQuestion } from "@/components/platform/group-question";

export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
  searchParams
}: {
  params: Promise<{ postId: string }>;
  searchParams: Promise<PublicQuery>;
}): Promise<Metadata> {
  return publicResourceMetadata(
    "post",
    (await params).postId,
    await searchParams
  );
}
export default async function PostPage({
  params,
  searchParams
}: {
  params: Promise<{ postId: string }>;
  searchParams: Promise<{ before?: string; cursor?: string; comment?: string }>;
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
  // An independent current-permission read may fail if access changed since the
  // post read. Never render management data or a partial editor in that case.
  const editor =
    post.canWithdraw || post.canModerate
      ? await readPostEditor(post.id).catch(() => null)
      : null;
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
            <DiscussionBack />
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
            commentId={
              typeof query.comment === "string" &&
              /^[a-zA-Z0-9_-]{1,100}$/.test(query.comment)
                ? query.comment
                : undefined
            }
            moreCommentsHref={more}
          />
          {editor && user && (
            <PrivateSnapshotGuard
              owner={user.id}
              url={`/api/platform/posts?postId=${encodeURIComponent(post.id)}`}
              checksum={createHash("sha256")
                .update(JSON.stringify(editor))
                .digest("hex")}
              label="post management"
            >
              <PostControls post={editor} ownerId={user.id} />
            </PrivateSnapshotGuard>
          )}
          {post.group && user && <GroupQuestion post={post} owner={user.id}/>}
        </div>
      </section>
    </PlatformShell>
  );
}
