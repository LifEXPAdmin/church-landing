import { discoveryMetadata } from "@/lib/platform/discovery-metadata";
import type { PublicQuery } from "@/lib/indexing-policy";
import { PlatformShell } from "@/components/platform/platform-shell";
import { TopicPrivateCatalogue } from "@/components/platform/topic-private-catalogue";
import { TopicCatalogue } from "@/components/platform/topic-catalogue";
import { TopicReadBoundary } from "@/components/platform/topic-read-boundary";
import {
  TopicAccountLinks,
  TopicNavigation,
  TopicUnavailable,
  topicChecksum
} from "@/components/platform/topic-page-ui";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { topicListPage } from "@/lib/platform/topic-session";

export const dynamic = "force-dynamic";
export async function generateMetadata({
  searchParams
}: {
  searchParams: Promise<PublicQuery>;
}) {
  return discoveryMetadata("topics", await searchParams);
}
export default async function TopicDiscoveryPage({
  searchParams
}: {
  searchParams: Promise<{
    q?: string;
    after?: string;
    mine?: string;
    owned?: string;
  }>;
}) {
  const user = await getCurrentPlatformUser(),
    p = await searchParams;
  const query = {
    q: typeof p.q === "string" ? p.q.trim() : "",
    after: typeof p.after === "string" ? p.after : undefined,
    mine: p.mine === "1",
    owned: p.owned === "1"
  };
  const url = new URLSearchParams({
    ...(query.q ? { q: query.q } : {}),
    ...(query.mine ? { mine: "1" } : {}),
    ...(query.owned ? { owned: "1" } : {})
  });
  const path = "/platform/topics" + (url.size ? "?" + url : "");
  let content;
  if (!user && (query.mine || query.owned))
    content = <TopicAccountLinks next={path} />;
  else if (user && (query.mine || query.owned)) {
    const readUrl = `/api/platform/topics?${new URLSearchParams({ ...Object.fromEntries(url), ...(query.after ? { after: query.after } : {}) })}`;
    content = (
      <TopicPrivateCatalogue
        key={`${user.id}:${readUrl}`}
        owner={user.id}
        url={readUrl}
        query={query}
        path={path}
      />
    );
  } else {
    try {
      const result = await topicListPage(query);
      const readUrl = `/api/platform/topics?${new URLSearchParams({ ...Object.fromEntries(url), ...(query.after ? { after: query.after } : {}) })}`;
      content = (
        <TopicReadBoundary
          key={user?.id ?? "guest"}
          owner={user?.id ?? null}
          url={readUrl}
          checksum={topicChecksum(result)}
        >
          <TopicCatalogue result={result} query={query} path={path} />
        </TopicReadBoundary>
      );
    } catch (error) {
      content = <TopicUnavailable error={error} href={path} />;
    }
  }
  return (
    <PlatformShell user={user}>
      <section className="container-shell space-y-6 py-8 sm:py-10">
        <header className="space-y-3">
          <p className="gc-eyebrow">Public conversations</p>
          <h1 className="text-4xl">
            {query.owned
              ? "Topics I own"
              : query.mine
                ? "My topic choices"
                : "Topic communities"}
          </h1>
          <p className="text-gc-muted">
            Find people discussing faith and everyday life. Read freely, then
            join when you want to participate.
          </p>
        </header>
        <TopicNavigation />
        <form
          action="/platform/topics"
          className="flex flex-wrap items-end gap-3"
          role="search"
          aria-label="Search topic communities"
        >
          {query.mine && <input type="hidden" name="mine" value="1" />}
          {query.owned && <input type="hidden" name="owned" value="1" />}
          <label className="min-w-0 flex-1 space-y-2">
            <span className="block font-semibold">Search topics</span>
            <input
              name="q"
              type="search"
              defaultValue={query.q}
              className="w-full rounded-lg border border-gc-divider bg-gc-surface p-3"
            />
          </label>
          <button className="gc-button" type="submit">
            Search topics
          </button>
        </form>
        {content}
      </section>
    </PlatformShell>
  );
}
