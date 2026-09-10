import {
  communityAuthorSelect,
  activePublicAccount
} from "@/lib/platform/public-profile";
import Link from "next/link";
import { ArrowRight, MessageCircle, PenLine } from "lucide-react";
import { PostCard } from "@/components/platform/post-card";
import { PostComposer } from "@/components/platform/post-composer";
import { FeedReader } from "@/components/platform/feed-reader";
import { ComposePostButton } from "@/components/platform/compose-post-button";
import { PlatformShell } from "@/components/platform/platform-shell";
import { prisma } from "@/lib/prisma";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { homeFeedAudience, homeFeedMode } from "@/lib/platform/home-feed";
import { accountDeliveryAvailable } from "@/lib/platform/account-availability";

export type FeedParams = {
  before?: string;
  cursor?: string;
  post?: string;
  mode?: string;
};

export default async function HomeFeedPage({
  searchParams
}: {
  searchParams: Promise<FeedParams>;
}) {
  const currentUser = await getCurrentPlatformUser();
  const params = await searchParams;
  const community = homeFeedMode() === "community" || !currentUser;
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
      ...(await homeFeedAudience(prisma, currentUser?.id)),
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
      author: { select: communityAuthorSelect },
      likes: { where: { user: activePublicAccount } },
      _count: {
        select: { comments: { where: { author: activePublicAccount } } }
      },
      comments: {
        where: { author: activePublicAccount },
        include: { author: { select: communityAuthorSelect } },
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
              {community
                ? "Public posts from everyone, newest first."
                : "From you and the people you follow."}
            </p>
          </div>
          {currentUser && <ComposePostButton />}
        </div>
        {currentUser &&
          !currentUser.emailVerifiedAt &&
          accountDeliveryAvailable() && (
            <div className="gc-welcome">
              <h2>Verify your email</h2>
              <p>
                Check your inbox and spam folder for your verification email.
                You can keep browsing and posting while you get ready to use
                church tools.
              </p>
              <Link
                href="/platform/account/verify"
                className="gc-button gc-button-quiet"
              >
                Verify email or resend link
              </Link>
            </div>
          )}
        {!currentUser && (
          <div className="gc-welcome">
            <h2>Take a look around.</h2>
            <p>
              Read public posts and comments, discover churches, and get to know
              Godschurches at your own pace. Join whenever you’re ready to take
              part.
            </p>
            <Link
              href="/platform/churches"
              className="gc-button gc-button-quiet"
            >
              Explore churches
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
              emptyContent={
                <div className="gc-empty">
                  <MessageCircle aria-hidden="true" />
                  <h2>No posts yet.</h2>
                  <p>
                    {currentUser && !community
                      ? "This space grows with the people you follow. Find someone to connect with, or share the first word of encouragement."
                      : "Public conversations will appear here as people share. You can explore church pages while this community grows."}
                  </p>
                  <Link
                    href={
                      currentUser ? "/platform/search" : "/platform/churches"
                    }
                    className="gc-button gc-button-quiet"
                  >
                    {currentUser ? "Find your people" : "Explore churches"}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </div>
              }
            />
          </div>
          <aside className="gc-context">
            <section>
              <p className="gc-eyebrow mb-3">Rooted in real life</p>
              <h2>Your local church matters.</h2>
              <p>
                Online connection is a beginning, not a replacement for
                gathering together.
              </p>
              <Link
                href={
                  currentUser ? "/platform/my-church" : "/platform/churches"
                }
              >
                {currentUser ? "My church connection" : "Explore church pages"}{" "}
                <span aria-hidden="true">→</span>
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
