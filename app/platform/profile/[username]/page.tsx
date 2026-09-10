import {
  publicProfileSelect,
  activePublicAccount
} from "@/lib/platform/public-profile";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Pencil, Rss, UserPlus, UsersRound } from "lucide-react";

import {
  followPlatformUser,
  unfollowPlatformUser
} from "@/app/platform/actions";
import { readProfilePosts } from "@/lib/platform/post-session";
import { PostCard } from "@/components/platform/post-card";
import { PlatformShell } from "@/components/platform/platform-shell";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { roleLabels } from "@/lib/platform/format";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { GuestAccountPrompt } from "@/components/platform/guest-account-prompt";

export async function generateMetadata({
  params
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return {
    title: { absolute: `@${username} | Godschurches` },
    description: "Sign in to view member profiles on Godschurches.",
    robots: { index: false, follow: false }
  };
}

export const dynamic = "force-dynamic";

export default async function PublicProfilePage({
  params,
  searchParams
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ before?: string; cursor?: string }>;
}) {
  const currentUser = await getCurrentPlatformUser();
  const { username } = await params;
  if (!currentUser)
    return (
      <PlatformShell user={null}>
        <GuestAccountPrompt
          next={`/platform/profile/${username}`}
          reason="profile"
        />
      </PlatformShell>
    );
  const profile = await prisma.platformUser.findUnique({
    where: { username, ...activePublicAccount },
    select: {
      ...publicProfileSelect,
      _count: {
        select: {
          followers: { where: { follower: activePublicAccount } },
          following: { where: { following: activePublicAccount } }
        }
      }
    }
  });

  if (!profile) {
    notFound();
  }

  const query = await searchParams;
  const before =
    typeof query.before === "string" &&
    /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(query.before) &&
    Number.isFinite(Date.parse(query.before))
      ? new Date(query.before)
      : null;
  const cursor =
    typeof query.cursor === "string" &&
    /^[A-Za-z0-9_-]{1,100}$/.test(query.cursor)
      ? query.cursor
      : null;
  const postPage = await readProfilePosts(profile.id, { before, cursor });
  const posts = postPage.posts.slice(0, 30),
    last = posts.at(-1);
  const profilePath = `/platform/profile/${profile.username}`;
  const currentPath =
    before && cursor
      ? `${profilePath}?${new URLSearchParams({ before: before.toISOString(), cursor })}`
      : profilePath;
  const more =
    postPage.posts.length > 30 && last
      ? `${profilePath}?${new URLSearchParams({ before: last.createdAt.toISOString(), cursor: last.id })}`
      : null;

  const isMe = currentUser?.id === profile.id;
  const isFollowing = currentUser
    ? Boolean(
        await prisma.platformFollow.findUnique({
          where: {
            followerId_followingId: {
              followerId: currentUser.id,
              followingId: profile.id
            }
          }
        })
      )
    : false;

  return (
    <PlatformShell user={currentUser}>
      <section className="container-shell py-8 sm:py-10">
        <div className="mb-6 overflow-hidden rounded-xl border border-gc-divider bg-gc-surface">
          <div className="h-32 bg-gc-subtle" />
          <div className="p-6 sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="-mt-20 mb-4 grid h-24 w-24 place-items-center rounded-full border-4 border-gc-surface bg-gc-action text-4xl font-bold text-gc-text">
                  {profile.name.charAt(0).toUpperCase()}
                </div>
                <h1 className="text-4xl text-gc-text">{profile.name}</h1>
                <p className="text-gc-muted">
                  @{profile.username} · {roleLabels[profile.role]}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {isMe ? (
                  <Button asChild className="rounded-full">
                    <Link href="/platform/profile/me">
                      <Pencil className="mr-2 h-4 w-4" /> Edit profile
                    </Link>
                  </Button>
                ) : currentUser ? (
                  <form
                    action={
                      isFollowing ? unfollowPlatformUser : followPlatformUser
                    }
                  >
                    <input
                      type="hidden"
                      name="followingId"
                      value={profile.id}
                    />
                    <input
                      type="hidden"
                      name="username"
                      value={profile.username}
                    />
                    <Button type="submit" className="rounded-full">
                      <UserPlus className="mr-2 h-4 w-4" />{" "}
                      {isFollowing ? "Following" : "Follow"}
                    </Button>
                  </form>
                ) : (
                  <Button asChild className="rounded-full">
                    <Link href="/platform/signup">
                      Create account to follow
                    </Link>
                  </Button>
                )}
              </div>
            </div>

            {profile.bio ? (
              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-gc-text">
                {profile.bio}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-3 text-sm text-gc-muted">
              {profile.location ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-4 w-4" /> {profile.location}
                </span>
              ) : null}
              {profile.website ? (
                <a
                  className="text-gc-accent hover:text-gc-muted"
                  href={profile.website}
                >
                  Website
                </a>
              ) : null}
            </div>
            <div className="mt-5 flex flex-wrap gap-3 text-sm">
              <span className="inline-flex items-center gap-1 rounded-full bg-gc-subtle px-3 py-1 text-gc-text">
                <Rss className="h-4 w-4 text-gc-accent" /> {postPage.count}{" "}
                posts
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-gc-subtle px-3 py-1 text-gc-text">
                <UsersRound className="h-4 w-4 text-gc-accent" />{" "}
                {profile._count.followers} followers
              </span>
              <span className="rounded-full bg-gc-subtle px-3 py-1 text-gc-text">
                {profile._count.following} following
              </span>
            </div>
            {profile.interests.length ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {profile.interests.map((interest) => (
                  <span
                    key={interest}
                    className="rounded-full border border-gc-divider px-3 py-1 text-sm text-gc-accent"
                  >
                    {interest}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-5">
          {before && cursor && (
            <Link
              className="inline-flex min-h-11 items-center text-gc-accent underline"
              href={profilePath}
            >
              Latest posts
            </Link>
          )}
          {posts.length ? (
            posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentUserId={currentUser?.id}
                redirectTo={currentPath}
              />
            ))
          ) : (
            <div className="rounded-xl border border-gc-divider bg-gc-surface p-8 text-gc-muted">
              No posts yet.
            </div>
          )}
          {more && (
            <Link
              className="inline-flex min-h-11 items-center text-gc-accent underline"
              href={more}
            >
              Older posts
            </Link>
          )}
        </div>
      </section>
    </PlatformShell>
  );
}
