import type { Metadata } from "next";
import Link from "next/link";
import { ExploreSearchForm } from "@/components/platform/explore-search-form";
import { CommunitySearchResults } from "@/components/platform/community-search-results";
import { PlatformShell } from "@/components/platform/platform-shell";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import {
  parseCommunitySearchInput,
  searchUrlInput
} from "@/lib/platform/community-search";
import { PortalError } from "@/lib/platform/portal-policy";
import {
  searchHref,
  type SearchNavigation
} from "@/lib/platform/search-navigation";
export const metadata: Metadata = {
  title: { absolute: "Explore | God’s Churches" },
  description:
    "Find community posts, churches, events, listings, media and volunteer opportunities you can view."
};
export const dynamic = "force-dynamic";
export default async function PlatformSearchPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentPlatformUser(),
    p = await searchParams;
  let query: SearchNavigation = { q: "", kind: "posts" },
    inputError = "";
  try {
    const parameters = new URLSearchParams();
    for (const [key, value] of Object.entries(p))
      for (const item of Array.isArray(value)
        ? value
        : value === undefined
          ? []
          : [value])
        parameters.append(key, item);
    query = parseCommunitySearchInput(searchUrlInput(parameters));
  } catch (error) {
    if (!(error instanceof PortalError)) throw error;
    inputError = error.message;
  }
  return (
    <PlatformShell
      user={user}
      signInReturnTo={inputError ? "/platform/search" : searchHref(query)}
    >
      <section className="container-shell space-y-6 py-8 sm:py-10">
        <div className="rounded-xl border border-gc-divider bg-gc-surface p-6 text-gc-text sm:p-8">
          <p className="mb-3 text-sm uppercase tracking-widest text-gc-accent">
            Explore
          </p>
          <h1 className="text-4xl">Find your community.</h1>
          <Link
            className="inline-flex min-h-11 items-center underline"
            href={`/platform/topics${query.q && query.q.length <= 80 ? `?${new URLSearchParams({ q: query.q })}` : ""}`}
          >
            Explore topic communities
          </Link>
          <ExploreSearchForm
            key={`${user?.id ?? "guest"}:${JSON.stringify(query)}`}
            owner={user?.id ?? null}
            query={query.q}
            category={query.kind}
            topic={query.topic}
            churchId={query.churchId}
            after={query.after}
            country={query.country}
            placeId={query.placeId}
            radiusKm={query.radiusKm}
          />
        </div>
        {inputError ? (
          <p role="alert">
            {inputError}{" "}
            <Link href="/platform/search" className="underline">
              Restart search
            </Link>
          </p>
        ) : (
          <CommunitySearchResults
            key={`${user?.id ?? "guest"}:${JSON.stringify(query)}`}
            owner={user?.id ?? null}
            query={query}
          />
        )}
      </section>
    </PlatformShell>
  );
}
