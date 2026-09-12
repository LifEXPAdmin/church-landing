import type { Metadata } from "next";
import { ExploreSearchForm } from "@/components/platform/explore-search-form";
import { CommunitySearchResults } from "@/components/platform/community-search-results";
import { PlatformShell } from "@/components/platform/platform-shell";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import {
  searchCategories,
  type SearchCategory
} from "@/lib/platform/search-navigation";
export const metadata: Metadata = {
  title: { absolute: "Explore | Godschurches" },
  description:
    "Find community posts, author labels, churches, events and topics you can view."
};
export const dynamic = "force-dynamic";
export default async function PlatformSearchPage({
  searchParams
}: {
  searchParams: Promise<{
    q?: string;
    kind?: string;
    after?: string;
    topic?: string;
    churchId?: string;
  }>;
}) {
  const user = await getCurrentPlatformUser(),
    p = await searchParams;
  const query = {
    q: typeof p.q === "string" ? p.q.trim().slice(0, 200) : "",
    kind: searchCategories.includes(p.kind as SearchCategory)
      ? (p.kind as SearchCategory)
      : ("posts" as const),
    ...(typeof p.after === "string" ? { after: p.after.slice(0, 257) } : {}),
    ...(typeof p.topic === "string" ? { topic: p.topic.slice(0, 100) } : {}),
    ...(typeof p.churchId === "string"
      ? { churchId: p.churchId.slice(0, 101) }
      : {})
  };
  return (
    <PlatformShell user={user}>
      <section className="container-shell space-y-6 py-8 sm:py-10">
        <div className="rounded-xl border border-gc-divider bg-gc-surface p-6 text-gc-text sm:p-8">
          <p className="mb-3 text-sm uppercase tracking-widest text-gc-accent">
            Explore
          </p>
          <h1 className="text-4xl">Find your community.</h1>
          <ExploreSearchForm
            key={JSON.stringify(query)}
            query={query.q}
            category={query.kind}
            topic={query.topic}
            churchId={query.churchId}
          />
        </div>
        <CommunitySearchResults
          key={`${user?.id ?? "guest"}:${JSON.stringify(query)}`}
          owner={user?.id ?? null}
          query={query}
        />
      </section>
    </PlatformShell>
  );
}
