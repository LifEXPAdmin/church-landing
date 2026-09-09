import {
  publicProfileSelect,
  activePublicAccount
} from "@/lib/platform/public-profile";
import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";

import { PostCard } from "@/components/platform/post-card";
import { PlatformShell } from "@/components/platform/platform-shell";
import { prisma } from "@/lib/prisma";
import { roleLabels } from "@/lib/platform/format";
import { getCurrentPlatformUser } from "@/lib/platform/session";

export const metadata: Metadata = {
  title: { absolute: "Explore | Godschurches" },
  description: "Find people and public posts on Godschurches."
};

export const dynamic = "force-dynamic";

export default async function PlatformSearchPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const currentUser = await getCurrentPlatformUser();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 200) : "";

  const [people, posts] = q
    ? await Promise.all([
        prisma.platformUser.findMany({
          select: publicProfileSelect,
          where: {
            ...activePublicAccount,
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { username: { contains: q.toLowerCase(), mode: "insensitive" } },
              { bio: { contains: q, mode: "insensitive" } }
            ]
          },
          take: 20
        }),
        prisma.platformPost.findMany({
          where: {
            author: activePublicAccount,
            OR: [
              { content: { contains: q, mode: "insensitive" } },
              { scripture: { contains: q, mode: "insensitive" } }
            ]
          },
          include: {
            author: { select: publicProfileSelect },
            likes: { where: { user: activePublicAccount } },
            comments: {
              where: { author: activePublicAccount },
              include: { author: { select: publicProfileSelect } },
              orderBy: { createdAt: "desc" },
              take: 6
            }
          },
          orderBy: { createdAt: "desc" },
          take: 20
        })
      ])
    : [[], []];

  return (
    <PlatformShell user={currentUser}>
      <section className="container-shell py-8 sm:py-10">
        <div className="mb-6 rounded-xl border border-gc-divider bg-gc-surface p-6 text-gc-text sm:p-8">
          <p className="mb-3 text-sm uppercase tracking-[0.16em] text-gc-accent">
            Explore
          </p>
          <h1 className="text-5xl text-gc-text">
            Find your people. Discover their stories.
          </h1>
          <form className="mt-6 flex flex-col gap-3 sm:flex-row">
            <input
              name="q"
              type="search"
              aria-label="Search people and public posts"
              maxLength={200}
              defaultValue={q}
              placeholder="Search prayer, creators, churches, testimony"
              className="min-w-0 flex-1 rounded-full border border-gc-divider bg-gc-canvas px-5 py-3 outline-none focus:border-gc-action"
            />
            <button className="inline-flex items-center justify-center rounded-full bg-gc-action px-6 py-3 font-semibold text-gc-text hover:bg-gc-hover">
              <Search className="mr-2 h-4 w-4" /> Search
            </button>
          </form>
        </div>

        {q ? (
          <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
            <aside className="space-y-3">
              <h2 className="text-3xl text-gc-text">People</h2>
              {people.length ? (
                people.map((person) => (
                  <Link
                    key={person.id}
                    href={`/platform/profile/${person.username}`}
                    className="block rounded-xl border border-gc-divider bg-gc-surface p-4 hover:border-gc-action"
                  >
                    <p className="font-semibold text-gc-text">{person.name}</p>
                    <p className="text-sm text-gc-muted">
                      @{person.username} · {roleLabels[person.role]}
                    </p>
                  </Link>
                ))
              ) : (
                <p className="rounded-xl bg-gc-surface p-4 text-gc-muted">
                  No people found.
                </p>
              )}
            </aside>
            <div className="space-y-5">
              <h2 className="text-3xl text-gc-text">Posts</h2>
              {posts.length ? (
                posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    currentUserId={currentUser?.id}
                    redirectTo={`/platform/search?q=${encodeURIComponent(q)}`}
                  />
                ))
              ) : (
                <p className="rounded-xl bg-gc-surface p-4 text-gc-muted">
                  No posts found.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-gc-divider bg-gc-surface p-8 text-gc-muted">
            Try searching for prayer, testimony, church, creator, or a
            person&apos;s name.
          </div>
        )}
      </section>
    </PlatformShell>
  );
}
