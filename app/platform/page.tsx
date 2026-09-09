import {
  publicProfileSelect,
  activePublicAccount
} from "@/lib/platform/public-profile";
import { publicMetadata } from "@/lib/site-metadata";
import Link from "next/link";
import { ArrowRight, MessageCircle, PenLine } from "lucide-react";
import { PostCard } from "@/components/platform/post-card";
import { PostComposer } from "@/components/platform/post-composer";
import { FeedReader } from "@/components/platform/feed-reader";
import { ComposePostButton } from "@/components/platform/compose-post-button";
import { PlatformShell } from "@/components/platform/platform-shell";
import { prisma } from "@/lib/prisma";
import { getCurrentPlatformUser } from "@/lib/platform/session";

export const metadata = publicMetadata(
  "Home",
  "Grow in faith, connect with your community, and share everyday life on Godschurches.",
  "/platform"
);
export const dynamic = "force-dynamic";
type FeedParams = {
  before?: string;
  cursor?: string;
  post?: string;
  mode?: string;
};

export default async function PlatformPage({
  searchParams
}: {
  searchParams: Promise<FeedParams>;
}) {
  const currentUser = await getCurrentPlatformUser();
  const params = await searchParams;
  const following = currentUser
    ? await prisma.platformFollow.findMany({
        where: { followerId: currentUser.id, following: activePublicAccount },
        select: { followingId: true }
      })
    : [];
  const before =
    params.before &&
    /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(params.before) &&
    Number.isFinite(Date.parse(params.before))
      ? new Date(params.before)
      : null;
  const cursor =
    params.cursor && /^[a-zA-Z0-9_-]{1,100}$/.test(params.cursor)
      ? params.cursor
      : null;
  const result = await prisma.platformPost.findMany({
    where: {
      author: activePublicAccount,
      ...(currentUser
        ? {
            authorId: {
              in: [currentUser.id, ...following.map((f) => f.followingId)]
            }
          }
        : {}),
      ...(before && cursor
        ? {
            OR: [
              { createdAt: { lt: before } },
              { createdAt: before, id: { lt: cursor } }
            ]
          }
        : {})
    },
    include: {
      author: { select: publicProfileSelect },
      likes: { where: { user: activePublicAccount } },
      _count: {
        select: { comments: { where: { author: activePublicAccount } } }
      },
      comments: {
        where: { author: activePublicAccount },
        include: { author: { select: publicProfileSelect } },
        orderBy: { createdAt: "desc" },
        take: 6
      }
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 31
  });
  const posts = result.slice(0, 30);
  const last = posts.at(-1);
  const moreHref =
    result.length > 30 && last
      ? `/platform?before=${encodeURIComponent(last.createdAt.toISOString())}&cursor=${encodeURIComponent(last.id)}`
      : undefined;
  return (
    <PlatformShell user={currentUser}>
      <section className="container-shell">
        <div className="gc-screen-heading">
          <div>
            <p className="gc-eyebrow">Life together</p>
            <h1>Home</h1>
            <p className="text-gc-muted">
              {currentUser
                ? "From you and the people you follow."
                : "Faith, fellowship, and everyday life."}
            </p>
          </div>
          {currentUser && <ComposePostButton />}
        </div>
        {!currentUser && (
          <div className="gc-welcome">
            <h2>There is a place for you here.</h2>
            <p>
              Read public posts from people growing in faith. Create an account
              to share a testimony, prayer request, or update, and follow people
              you want to hear from.
            </p>
            <Link href="/platform/signup" className="gc-button">
              Create an account
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        )}
        <div className="gc-home-columns">
          <div className="min-w-0">
            {currentUser && (
              <details id="compose-post" className="gc-composer">
                <summary>
                  <PenLine aria-hidden="true" />
                  Share what&apos;s on your heart
                </summary>
                <PostComposer />
              </details>
            )}
            {posts.length ? (
              <FeedReader
                items={posts.map((post) => ({
                  id: post.id,
                  label: post.author.name,
                  content: (
                    <PostCard
                      post={post}
                      currentUserId={currentUser?.id}
                      redirectTo={`/platform?post=${post.id}`}
                    />
                  )
                }))}
                initialPost={params.post}
                initialMode={
                  params.mode === "pages" || params.mode === "list"
                    ? params.mode
                    : undefined
                }
                moreHref={moreHref}
              />
            ) : (
              <div className="gc-empty">
                <MessageCircle aria-hidden="true" />
                <h2>No posts yet.</h2>
                <p>
                  {currentUser
                    ? "This space grows with the people you follow. Find someone to connect with, or share the first word of encouragement."
                    : "Every community starts with a conversation. Create an account to share a testimony, prayer request, or update."}
                </p>
                <Link
                  href={currentUser ? "/platform/search" : "/platform/signup"}
                  className="gc-button gc-button-quiet"
                >
                  {currentUser ? "Find your people" : "Join the conversation"}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </div>
            )}
          </div>
          <aside className="gc-context">
            <section>
              <p className="gc-eyebrow mb-3">Rooted in real life</p>
              <h2>Your local church matters.</h2>
              <p>
                Online connection is a beginning, not a replacement for
                gathering together.
              </p>
              <Link href="/platform/my-church">
                My church connection <span aria-hidden="true">→</span>
              </Link>
            </section>
            <section>
              <h2>A thoughtful place</h2>
              <p>
                Share with care. Posts are public, so keep private prayer
                details and personal contact information out of your feed.
              </p>
              <Link href="/platform/help">Find help and contacts</Link>
            </section>
          </aside>
        </div>
        <p className="mt-8 text-sm text-gc-muted">
          New to the church tools?{" "}
          <Link
            href="/platform/demo"
            className="inline-flex min-h-11 items-center text-gc-action underline underline-offset-4"
          >
            Take the read-only tour
          </Link>
          . The tour uses fictional information.
        </p>
      </section>
    </PlatformShell>
  );
}
