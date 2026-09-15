import { createHash } from "node:crypto";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlatformShell } from "@/components/platform/platform-shell";
import { GuestAccountPrompt } from "@/components/platform/guest-account-prompt";
import { PrivateSnapshotGuard } from "@/components/platform/private-snapshot-guard";
import { PostControls } from "@/components/platform/post-controls";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { readPostEditor } from "@/lib/platform/post-session";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Manage scheduled post",
  robots: { index: false, follow: false }
};
export default async function ScheduledPostPage({
  params
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  if (!/^[\w-]{1,100}$/.test(postId)) notFound();
  const user = await getCurrentPlatformUser();
  const post = user ? await readPostEditor(postId).catch(() => null) : null;
  if (user && (!post || !post.churchAuthor || !post.canEdit)) notFound();
  return (
    <PlatformShell user={user}>
      {user && post ? (
        <section className="container-shell py-10">
          <div className="mx-auto max-w-2xl space-y-6">
            <h1 className="text-4xl">Manage scheduled post</h1>
            <Link
              className="gc-button gc-button-quiet"
              href="/platform/scheduled-posts"
            >
              Scheduled church posts
            </Link>
            <PrivateSnapshotGuard
              owner={user.id}
              url={`/api/platform/posts?postId=${encodeURIComponent(post.id)}`}
              checksum={createHash("sha256")
                .update(JSON.stringify(post))
                .digest("hex")}
              label="scheduled post"
            >
              {post.status === "PUBLISHED" ? (
                <>
                  <p>This post has been published.</p>
                  <Link
                    className="gc-button"
                    href={`/platform/posts/${post.id}`}
                  >
                    View published post
                  </Link>
                </>
              ) : (
                <PostControls post={post} ownerId={user.id} />
              )}
            </PrivateSnapshotGuard>
          </div>
        </section>
      ) : (
        <GuestAccountPrompt
          next={`/platform/scheduled-posts/${postId}`}
          reason="account"
        />
      )}
    </PlatformShell>
  );
}
