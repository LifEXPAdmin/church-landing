import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";

import { PostCard } from "@/components/platform/post-card";
import { PlatformShell } from "@/components/platform/platform-shell";
import { prisma } from "@/lib/prisma";
import { roleLabels } from "@/lib/platform/format";
import { getCurrentPlatformUser } from "@/lib/platform/session";

export const metadata: Metadata = {
  title: "Search Church",
  description: "Search people and posts on the Church platform preview."
};

export const dynamic = "force-dynamic";

export default async function PlatformSearchPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const currentUser = await getCurrentPlatformUser();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";

  const [people, posts] = q
    ? await Promise.all([
        prisma.platformUser.findMany({
          where: {
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
            OR: [
              { content: { contains: q, mode: "insensitive" } },
              { scripture: { contains: q, mode: "insensitive" } }
            ]
          },
          include: { author: true },
          orderBy: { createdAt: "desc" },
          take: 20
        })
      ])
    : [[], []];

  return (
    <PlatformShell user={currentUser}>
      <section className="container-shell py-8 sm:py-10">
        <div className="mb-6 rounded-[2rem] border border-[#f2d8af]/20 bg-[#1a120c] p-6 text-[#f8ead6] sm:p-8">
          <p className="mb-3 text-sm uppercase tracking-[0.16em] text-[#f4c98c]">
            Search
          </p>
          <h1 className="text-5xl text-white">
            Find people, posts, and needs.
          </h1>
          <form className="mt-6 flex flex-col gap-3 sm:flex-row">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search prayer, creators, churches, testimony"
              className="min-w-0 flex-1 rounded-full border border-[#f2d8af]/20 bg-[#100b07] px-5 py-3 outline-none focus:border-[#f4c98c]"
            />
            <button className="inline-flex items-center justify-center rounded-full bg-[#c38a45] px-6 py-3 font-semibold text-white hover:bg-[#aa7537]">
              <Search className="mr-2 h-4 w-4" /> Search
            </button>
          </form>
        </div>

        {q ? (
          <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
            <aside className="space-y-3">
              <h2 className="text-3xl text-white">People</h2>
              {people.length ? (
                people.map((person) => (
                  <Link
                    key={person.id}
                    href={`/platform/profile/${person.username}`}
                    className="border-[#f2d8af]/16 block rounded-2xl border bg-[#1a120c] p-4 hover:border-[#f4c98c]/50"
                  >
                    <p className="font-semibold text-white">{person.name}</p>
                    <p className="text-sm text-[#cdbb9d]">
                      @{person.username} · {roleLabels[person.role]}
                    </p>
                  </Link>
                ))
              ) : (
                <p className="rounded-2xl bg-[#1a120c] p-4 text-[#d8c4a8]">
                  No people found.
                </p>
              )}
            </aside>
            <div className="space-y-5">
              <h2 className="text-3xl text-white">Posts</h2>
              {posts.length ? (
                posts.map((post) => <PostCard key={post.id} post={post} />)
              ) : (
                <p className="rounded-2xl bg-[#1a120c] p-4 text-[#d8c4a8]">
                  No posts found.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="border-[#f2d8af]/18 rounded-3xl border bg-[#1a120c] p-8 text-[#d8c4a8]">
            Try searching for prayer, testimony, church, creator, or a
            person&apos;s name.
          </div>
        )}
      </section>
    </PlatformShell>
  );
}
