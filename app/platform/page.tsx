import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Search, ShieldCheck, UsersRound } from "lucide-react";

import { PostCard } from "@/components/platform/post-card";
import { PostComposer } from "@/components/platform/post-composer";
import { PlatformShell } from "@/components/platform/platform-shell";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { getCurrentPlatformUser } from "@/lib/platform/session";

export const metadata: Metadata = {
  title: "Church Platform Preview",
  description: "A working preview of the Church connection platform."
};

export const dynamic = "force-dynamic";

async function getFeed(userId?: string) {
  const following = userId
    ? await prisma.platformFollow.findMany({
        where: { followerId: userId },
        select: { followingId: true }
      })
    : [];

  const authorIds = userId
    ? [userId, ...following.map((item) => item.followingId)]
    : undefined;

  return prisma.platformPost.findMany({
    where: authorIds?.length ? { authorId: { in: authorIds } } : undefined,
    include: { author: true },
    orderBy: { createdAt: "desc" },
    take: 30
  });
}

export default async function PlatformPage() {
  const currentUser = await getCurrentPlatformUser();
  const posts = await getFeed(currentUser?.id);
  const newestMembers = await prisma.platformUser.findMany({
    orderBy: { createdAt: "desc" },
    take: 5
  });

  return (
    <PlatformShell user={currentUser}>
      <section className="container-shell py-8 sm:py-10">
        {!currentUser ? (
          <div className="mb-8 rounded-[2rem] border border-[#f2d8af]/20 bg-[radial-gradient(circle_at_top_left,rgba(195,138,69,0.26),rgba(26,18,12,0.96)_48%)] p-7 text-[#f8ead6] sm:p-10">
            <p className="mb-3 text-sm uppercase tracking-[0.18em] text-[#f4c98c]">
              Platform Preview
            </p>
            <h1 className="max-w-3xl text-balance text-5xl leading-tight text-white sm:text-6xl">
              A Christian connection platform built around faith, fellowship,
              and real service.
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-[#e8d3b2]">
              Create a test account, post updates, follow people, search
              profiles, and shape the first version of Church.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-full">
                <Link href="/platform/login">Create a test account</Link>
              </Button>
              <Button
                asChild
                size="lg"
                className="rounded-full border-[#f2d8af]/40 bg-transparent text-[#f8ead6] hover:bg-white/10"
              >
                <Link href="/">Back to landing page</Link>
              </Button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-5">
            {currentUser ? <PostComposer /> : null}

            {posts.length > 0 ? (
              posts.map((post) => <PostCard key={post.id} post={post} />)
            ) : (
              <div className="border-[#f2d8af]/18 rounded-3xl border bg-[#1a120c] p-8 text-center text-[#e8d3b2]">
                <p className="text-3xl text-white">No posts yet.</p>
                <p className="mt-2">
                  Create an account and share the first testimony, prayer
                  request, or update.
                </p>
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="border-[#f2d8af]/18 rounded-3xl border bg-[#1a120c] p-5">
              <div className="mb-3 flex items-center gap-2 text-[#f4c98c]">
                <ShieldCheck className="h-5 w-5" />
                <p className="font-semibold">Preview rules</p>
              </div>
              <p className="text-sm leading-relaxed text-[#d8c4a8]">
                This is a live skeleton for testing. Keep posts Christ-honoring,
                useful, and kind while we build moderation.
              </p>
            </div>

            <Link
              href="/platform/search"
              className="border-[#f2d8af]/18 flex items-center justify-between rounded-3xl border bg-[#1a120c] p-5 text-[#f8ead6] hover:border-[#f4c98c]/50"
            >
              <span className="inline-flex items-center gap-2">
                <Search className="h-5 w-5 text-[#f4c98c]" /> Search people and
                posts
              </span>
              <ArrowRight className="h-4 w-4" />
            </Link>

            <div className="border-[#f2d8af]/18 rounded-3xl border bg-[#1a120c] p-5">
              <div className="mb-4 flex items-center gap-2 text-[#f4c98c]">
                <UsersRound className="h-5 w-5" />
                <p className="font-semibold">Newest members</p>
              </div>
              <div className="space-y-3">
                {newestMembers.map((member) => (
                  <Link
                    key={member.id}
                    href={`/platform/profile/${member.username}`}
                    className="bg-black/24 hover:bg-black/34 block rounded-2xl p-3"
                  >
                    <p className="font-semibold text-white">{member.name}</p>
                    <p className="text-sm text-[#cdbb9d]">@{member.username}</p>
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </section>
    </PlatformShell>
  );
}
