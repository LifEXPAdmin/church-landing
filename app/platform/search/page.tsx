import type { Metadata } from "next";
import Link from "next/link";
import { ExploreSearchForm } from "@/components/platform/explore-search-form";

import { readPosts } from "@/lib/platform/post-session";
import { PostCard } from "@/components/platform/post-card";
import { PlatformShell } from "@/components/platform/platform-shell";
import { readPeopleSearch } from "@/lib/platform/profile-session";
import { roleLabels } from "@/lib/platform/format";
import { getCurrentPlatformUser } from "@/lib/platform/session";

export const metadata: Metadata = {
  title: { absolute: "Explore | Godschurches" },
  description: "Find people and posts you can view on Godschurches."
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
        readPeopleSearch(q),
        readPosts({ search: q, limit: 20 })
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
          <ExploreSearchForm key={q} query={q} />
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
              <h2 className="text-3xl text-gc-text">Matching posts</h2>
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
            Search for a person’s name or words in a post. Church pages have
            their own search.
          </div>
        )}
      </section>
    </PlatformShell>
  );
}
