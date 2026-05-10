import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Pencil, Rss, UserPlus, UsersRound } from "lucide-react";

import {
  followPlatformUser,
  unfollowPlatformUser
} from "@/app/platform/actions";
import { PostCard } from "@/components/platform/post-card";
import { PlatformShell } from "@/components/platform/platform-shell";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { roleLabels } from "@/lib/platform/format";
import { getCurrentPlatformUser } from "@/lib/platform/session";

export async function generateMetadata({
  params
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `@${username} on Church`,
    description: `View @${username}'s Church platform profile.`
  };
}

export const dynamic = "force-dynamic";

export default async function PublicProfilePage({
  params
}: {
  params: Promise<{ username: string }>;
}) {
  const currentUser = await getCurrentPlatformUser();
  const { username } = await params;
  const profile = await prisma.platformUser.findUnique({
    where: { username },
    include: {
      posts: {
        include: {
          author: true,
          likes: true,
          comments: {
            include: { author: true },
            orderBy: { createdAt: "desc" },
            take: 6
          }
        },
        orderBy: { createdAt: "desc" }
      },
      _count: {
        select: {
          posts: true,
          followers: true,
          following: true
        }
      }
    }
  });

  if (!profile) {
    notFound();
  }

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
        <div className="mb-6 overflow-hidden rounded-[2rem] border border-[#f2d8af]/20 bg-[#1a120c]">
          <div className="h-32 bg-[radial-gradient(circle_at_top_left,rgba(244,201,140,0.52),rgba(42,29,18,0.92)_48%,rgba(16,11,7,1))]" />
          <div className="p-6 sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="-mt-20 mb-4 grid h-24 w-24 place-items-center rounded-full border-4 border-[#1a120c] bg-[#c38a45] text-4xl font-bold text-white">
                  {profile.name.charAt(0).toUpperCase()}
                </div>
                <p className="text-4xl text-white">{profile.name}</p>
                <p className="text-[#cdbb9d]">
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
                    <Link href="/platform/login">Create account to follow</Link>
                  </Button>
                )}
              </div>
            </div>

            {profile.bio ? (
              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[#f8ead6]">
                {profile.bio}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-3 text-sm text-[#d8c4a8]">
              {profile.location ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-4 w-4" /> {profile.location}
                </span>
              ) : null}
              {profile.website ? (
                <a
                  className="text-[#f4c98c] hover:text-[#ffe0b1]"
                  href={profile.website}
                >
                  Website
                </a>
              ) : null}
            </div>
            <div className="mt-5 flex flex-wrap gap-3 text-sm">
              <span className="bg-black/24 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[#f8ead6]">
                <Rss className="h-4 w-4 text-[#f4c98c]" />{" "}
                {profile._count.posts} posts
              </span>
              <span className="bg-black/24 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[#f8ead6]">
                <UsersRound className="h-4 w-4 text-[#f4c98c]" />{" "}
                {profile._count.followers} followers
              </span>
              <span className="bg-black/24 rounded-full px-3 py-1 text-[#f8ead6]">
                {profile._count.following} following
              </span>
            </div>
            {profile.interests.length ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {profile.interests.map((interest) => (
                  <span
                    key={interest}
                    className="border-[#f2d8af]/18 rounded-full border px-3 py-1 text-sm text-[#f4c98c]"
                  >
                    {interest}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-5">
          {profile.posts.length ? (
            profile.posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentUserId={currentUser?.id}
                redirectTo={`/platform/profile/${profile.username}`}
              />
            ))
          ) : (
            <div className="border-[#f2d8af]/18 rounded-3xl border bg-[#1a120c] p-8 text-[#d8c4a8]">
              No posts yet.
            </div>
          )}
        </div>
      </section>
    </PlatformShell>
  );
}
