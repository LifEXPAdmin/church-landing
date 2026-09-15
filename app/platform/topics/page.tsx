import type { Metadata } from "next";
import Link from "next/link";
import { PlatformShell } from "@/components/platform/platform-shell";
import { PrivateSnapshotGuard } from "@/components/platform/private-snapshot-guard";
import { TopicReadBoundary } from "@/components/platform/topic-read-boundary";
import {
  TopicAccountLinks,
  TopicNavigation,
  TopicUnavailable,
  topicChecksum
} from "@/components/platform/topic-page-ui";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { topicListPage } from "@/lib/platform/topic-session";
import { topicHref } from "@/lib/platform/topic-types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Topic communities | God’s Churches" },
  description:
    "Explore public communities and conversations about faith and everyday life."
};
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
  else {
    try {
      const result = await topicListPage(query);
      const readUrl = `/api/platform/topics?${new URLSearchParams({ ...Object.fromEntries(url), ...(query.after ? { after: query.after } : {}) })}`;
      const rows = (
        <div className="space-y-4">
          {query.after && (
            <Link
              prefetch={false}
              className="gc-button gc-button-quiet"
              href={path}
            >
              First topic page
            </Link>
          )}
          {!result.topics.length && (
            <p>
              {query.q
                ? "No topics match this search."
                : query.owned
                  ? "You do not own any topics yet."
                  : query.mine
                    ? "You have not joined or followed a public topic yet."
                    : "No public topics yet. Create a community around a topic you care about."}
            </p>
          )}
          <ul className="grid gap-4 sm:grid-cols-2">
            {result.topics.map((topic) => (
              <li
                key={topic.id}
                className="min-w-0 space-y-3 rounded-xl border border-gc-divider bg-gc-surface p-5"
              >
                <h2 className="break-words text-2xl">
                  <Link
                    prefetch={false}
                    className="underline"
                    href={`${topicHref(topic.slug)}${query.owned ? "/manage" : ""}`}
                  >
                    {topic.name}
                  </Link>
                </h2>
                <p className="whitespace-pre-wrap break-words text-gc-muted">
                  {topic.description}
                </p>
              </li>
            ))}
          </ul>
          {result.after && (
            <Link
              prefetch={false}
              className="gc-button gc-button-quiet"
              href={`/platform/topics?${new URLSearchParams({ ...Object.fromEntries(url), after: result.after })}`}
            >
              More topics
            </Link>
          )}
        </div>
      );
      content =
        user && (query.mine || query.owned) ? (
          <PrivateSnapshotGuard
            key={user.id}
            owner={user.id}
            url={readUrl}
            checksum={topicChecksum(result)}
            label="topic choices"
          >
            {rows}
          </PrivateSnapshotGuard>
        ) : (
          <TopicReadBoundary
            key={user?.id ?? "guest"}
            owner={user?.id ?? null}
            url={readUrl}
            checksum={topicChecksum(result)}
          >
            {rows}
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
