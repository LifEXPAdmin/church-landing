import Link from "next/link";
import type { listTopics } from "@/lib/platform/topic-communities";
import { topicHref } from "@/lib/platform/topic-types";

export type TopicCatalogueResult = Awaited<ReturnType<typeof listTopics>>;
export type TopicCatalogueQuery = {
  q: string;
  after?: string;
  mine: boolean;
  owned: boolean;
};

// Shared presentation keeps public discovery and private choices consistent.
export function TopicCatalogue({
  result,
  query,
  path
}: {
  result: TopicCatalogueResult;
  query: TopicCatalogueQuery;
  path: string;
}) {
  const url = new URLSearchParams({
    ...(query.q ? { q: query.q } : {}),
    ...(query.mine ? { mine: "1" } : {}),
    ...(query.owned ? { owned: "1" } : {})
  });
  return (
    <div className="space-y-4">
      {query.after && (
        <a className="gc-button gc-button-quiet" href={path}>
          First topic page
        </a>
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
        <a
          className="gc-button gc-button-quiet"
          href={`/platform/topics?${new URLSearchParams({ ...Object.fromEntries(url), after: result.after })}`}
        >
          More topics
        </a>
      )}
    </div>
  );
}
