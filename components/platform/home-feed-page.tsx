import { readHomeFeed } from "@/lib/platform/post-session";
import { readerId } from "@/lib/platform/reader-navigation";
import Link from "next/link";
import { ArrowRight, MessageCircle } from "lucide-react";
import { PostCard } from "@/components/platform/post-card";
import { PostComposer } from "@/components/platform/post-composer";
import { FeedReader } from "@/components/platform/feed-reader";
import { ComposePostButton } from "@/components/platform/compose-post-button";
import { PlatformShell } from "@/components/platform/platform-shell";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { discoveryMode } from "@/lib/platform/discovery-options";
import { feedChoices, feedMode } from "@/lib/platform/feed-options";
import { PortalError } from "@/lib/platform/portal-policy";
import { accountEntryHref } from "@/lib/platform/account-entry";
import { accountDeliveryAvailable } from "@/lib/platform/account-availability";
import { DiscoverySettings } from "./discovery-settings";

export type FeedParams = {
  feed?: string;
  feedCursor?: string;
  feedScope?: string;
  refreshFeed?: string;
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
  let result;
  try {
    result = await readHomeFeed({
      mode: params.feed,
      cursor: params.feedCursor,
      scope: params.feedScope,
      refresh: params.refreshFeed,
      legacyThrough: params.through,
      legacyAnchor: params.anchor,
      legacyBefore: params.before,
      legacyCursor: params.cursor
    });
  } catch (error) {
    if (!(error instanceof PortalError)) throw error;
    const mode = feedMode(params.feed) ?? "latest";
    return (
      <PlatformShell user={currentUser}>
        <section className="container-shell space-y-4 py-8">
          <h1>{feedChoices[mode].label}</h1>
          <p role="status">{error.message}</p>
          <Link className="gc-button" href={`/platform?feed=${mode}`}>
            Refresh posts
          </Link>{" "}
          <Link
            className="gc-button gc-button-quiet"
            href="/platform?feed=latest"
          >
            Open Latest
          </Link>
          <Link
            className="gc-button gc-button-quiet"
            href="/platform/settings/feed/discovery"
          >
            Review Feed Settings
          </Link>
          {!currentUser && (
            <DiscoverySettings owner={null} initialMode={mode} />
          )}
        </section>
      </PlatformShell>
    );
  }
  const posts = result.posts;
  const selectedFeed = result.mode;
  const displayQuery: Record<string, string> =
    params.mode === "list" || params.mode === "pages"
      ? { mode: params.mode }
      : {};
  const feedQuery = new URLSearchParams({
    ...displayQuery,
    feed: selectedFeed,
    feedScope: result.scope,
    feedCursor: result.pageCursor
  });
  const moreHref = result.nextCursor
    ? `/platform?${new URLSearchParams({ feed: selectedFeed, feedScope: result.scope, feedCursor: result.nextCursor })}`
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
              Choose what to read, then explore at your own pace.
            </p>
          </div>
          {currentUser && <ComposePostButton />}
        </div>
        <Link
          className="mb-4 inline-flex min-h-11 items-center underline"
          href="/platform/topics"
        >
          Explore topic communities
        </Link>
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
              <Link href={`/platform?${feedQuery}`} aria-current="page">
                Home
              </Link>
              <Link href={`/platform/feed?${feedQuery}`}>My feed</Link>
            </nav>
          )}
          <div className="min-w-0">
            {currentUser && <PostComposer id="compose-post" />}
            <FeedReader
              feedNotice={result.notice}
              feedChoice={{
                mode: result.mode,
                scope: result.scope,
                ownerId: result.ownerId,
                preferenceVersion: result.preferenceVersion,
                pageCursor: result.pageCursor,
                requestedCursor: params.feedCursor
              }}
              items={posts.map((post) => ({
                id: post.id,
                label: post.author.name,
                content: (
                  <PostCard
                    post={post}
                    feedMode={selectedFeed}
                    feedKey={result.feedKey}
                    discoveryExplanation={
                      result.discovery?.explanations[post.id]
                    }
                    currentUserId={currentUser?.id}
                    redirectTo={`/platform?${feedQuery}&post=${post.id}`}
                  />
                )
              }))}
              initialPost={readerId(params.post)}
              initialMode={
                params.mode === "pages" || params.mode === "list"
                  ? params.mode
                  : undefined
              }
              moreHref={moreHref}
              emptyContent={
                <div className="gc-empty">
                  <MessageCircle aria-hidden="true" />
                  <h2>{feedChoices[selectedFeed].empty}</h2>
                  <p>
                    {selectedFeed === "friends"
                      ? currentUser
                        ? "Connect with friends, or browse Latest while you wait for their posts."
                        : "Sign in to see posts from your accepted friends."
                      : selectedFeed === "latest"
                        ? "Conversations will appear here as people share."
                        : discoveryMode(selectedFeed)
                          ? "You have reached the end of this selection. Review Feed Settings, check your connections, or refresh when you are ready for new posts."
                          : "Try Latest for new posts from across the community."}
                  </p>
                  {discoveryMode(selectedFeed) &&
                    [
                      "following",
                      "favorites",
                      "churches",
                      "your-church"
                    ].includes(selectedFeed) && (
                      <Link
                        prefetch={false}
                        className="gc-button gc-button-quiet"
                        href={
                          !currentUser
                            ? accountEntryHref(
                                "login",
                                `/platform?feed=${selectedFeed}`
                              )
                            : selectedFeed === "your-church"
                              ? "/platform/my-church"
                              : "/platform/relationships"
                        }
                      >
                        {!currentUser
                          ? "Sign in"
                          : selectedFeed === "your-church"
                            ? "Review church connections"
                            : "Review follows and favorites"}
                      </Link>
                    )}
                  {selectedFeed === "friends" && (
                    <Link
                      href={
                        currentUser
                          ? "/platform/share"
                          : accountEntryHref("login", "/platform?feed=friends")
                      }
                      className="gc-button gc-button-quiet"
                    >
                      {currentUser ? "Invite friends" : "Sign in"}
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  )}
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
