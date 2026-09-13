import { readPosts } from "@/lib/platform/post-session";
import { readerDate, readerId } from "@/lib/platform/reader-navigation";
import Link from "next/link";
import { ArrowRight, MessageCircle } from "lucide-react";
import { PostCard } from "@/components/platform/post-card";
import { PostComposer } from "@/components/platform/post-composer";
import { FeedReader } from "@/components/platform/feed-reader";
import { ComposePostButton } from "@/components/platform/compose-post-button";
import { PlatformShell } from "@/components/platform/platform-shell";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { homeFeedMode } from "@/lib/platform/home-feed";
import { accountEntryHref } from "@/lib/platform/account-entry";
import { accountDeliveryAvailable } from "@/lib/platform/account-availability";

export type FeedParams = {
  before?: string;
  cursor?: string;
  post?: string;
  mode?: string;
  through?: string;
  anchor?: string;
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
  const through = readerDate(params.through),
    anchor = readerId(params.anchor);
  const result = await readPosts({
    feed: true,
    before,
    cursor,
    through,
    anchor
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
        {!currentUser && (
          <section className="gc-mission" aria-labelledby="home-mission-title">
            <p className="gc-eyebrow">
              A CHRISTIAN COMMUNITY FOR FAITH IN ACTION
            </p>
            <h1 id="home-mission-title">
              <span>Jesus gave us a mission.</span>{" "}
              <span>You have a part to play.</span>
            </h1>
            <p className="gc-mission-description">
              We’re building Godschurches to equip everyday believers to share
              the gospel, serve their neighbors, and make disciples—together.
            </p>
            <p>
              Connect with believers, discover churches, and build relationships
              that carry your faith into everyday life.
            </p>
            <div className="gc-mission-actions">
              <Link href={accountEntryHref("signup")} className="gc-button">
                Create an account
              </Link>
              <Link
                href="/platform/search"
                className="gc-button gc-button-quiet"
              >
                Explore the community <ArrowRight aria-hidden="true" />
              </Link>
              <Link href="/about#our-mission" className="gc-mission-link">
                Our mission
              </Link>
            </div>
          </section>
        )}
        <div className="gc-screen-heading">
          <div>
            <p className="gc-eyebrow">Life together</p>
            {currentUser ? <h1>Home</h1> : <h2 className="text-3xl">Home</h2>}
            <p className="text-gc-muted">
              {community
                ? "From across the community, newest first."
                : "From you, the people you follow and your church communities."}
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
        <div className="gc-home-columns">
          {currentUser && (
            <nav
              className="mb-3 flex gap-4 lg:col-span-2"
              aria-label="Feed choices"
            >
              <Link href="/platform" aria-current="page">
                Home
              </Link>
              <Link href="/platform/feed">My feed</Link>
            </nav>
          )}
          <div className="min-w-0">
            {currentUser && <PostComposer id="compose-post" />}
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
              initialPost={readerId(params.post)}
              anchor={
                posts[0]
                  ? {
                      id: anchor && through ? anchor : posts[0].id,
                      at: (anchor && through
                        ? through
                        : posts[0].createdAt
                      ).toISOString()
                    }
                  : undefined
              }
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
                      : "Conversations will appear here as people share. In the meantime, learn how this community works."}
                  </p>
                  <Link
                    href={currentUser ? "/platform/search" : "/about"}
                    className="gc-button gc-button-quiet"
                  >
                    {currentUser ? "Find your people" : "About Godschurches"}
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
                Share with care. Check the audience before publishing and keep
                private prayer details and personal contact information out of
                your feed.
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
