"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import {
  searchHref,
  type SearchNavigation
} from "@/lib/platform/search-navigation";
type Base = { id: string; label: string };
type Result = Base & {
  href?: string;
  type?: string;
  topics?: string[];
  publishedAt?: string;
  username?: string;
  requiresSignIn?: boolean;
  city?: string;
  region?: string;
  startAt?: string;
  endAt?: string;
  timeZone?: string;
  filter?: { kind: "posts"; topic: string };
};
type Page = {
  kind: string;
  query: string;
  items: Result[];
  nextCursor: string | null;
};
export function CommunitySearchResults({
  owner,
  query
}: {
  owner: string | null;
  query: SearchNavigation;
}) {
  const router = useRouter(),
    seq = useRef(0);
  const [data, setData] = useState<Page | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const path =
    "/api/platform/search" + searchHref(query).slice("/platform/search".length);
  const load = useCallback(async () => {
    const current = ++seq.current;
    setData(null);
    setBusy(true);
    setError("");
    try {
      const r = await socialRequest<Page>(path, undefined, owner);
      if (current === seq.current) setData(r.data);
    } catch (e) {
      if (current === seq.current) {
        setError(
          e instanceof Error ? e.message : "Search could not be loaded."
        );
        if (e instanceof SocialClientError && e.status === 401)
          router.refresh();
      }
    } finally {
      if (current === seq.current) setBusy(false);
    }
  }, [path, owner, router]);
  useEffect(() => {
    void load();
    const conceal = () => {
      seq.current++;
      setData(null);
      setBusy(false);
    };
    const restore = () => {
      if (document.visibilityState !== "hidden") void load();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? conceal() : restore();
    window.addEventListener("blur", conceal);
    window.addEventListener("focus", restore);
    window.addEventListener("social-relationships-changed", restore);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      conceal();
      window.removeEventListener("blur", conceal);
      window.removeEventListener("focus", restore);
      window.removeEventListener("social-relationships-changed", restore);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load]);
  return (
    <section aria-label="Search results" className="space-y-4" aria-busy={busy}>
      <h2 className="text-3xl capitalize">{query.kind}</h2>
      {busy && <p role="status">Searching permitted {query.kind}…</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => void load()}
          >
            Retry search
          </button>
          {query.after && (
            <Link
              className="gc-button gc-button-quiet"
              href={searchHref({ ...query, after: undefined })}
            >
              Restart search
            </Link>
          )}
        </div>
      )}
      {data && !data.items.length && (
        <p role="status">
          {!query.q && !query.topic
            ? "Enter words to search this category."
            : `No matching ${query.kind} available to you.`}
        </p>
      )}
      {data?.items.map((item) => (
        <article
          data-search-id={item.id}
          key={item.id}
          className="space-y-2 rounded-xl border border-gc-divider bg-gc-surface p-4"
        >
          <p className="text-sm text-gc-muted">
            {query.kind === "posts"
              ? (item.type?.toLowerCase().replaceAll("_", " ") ?? "Post")
              : query.kind === "people"
                ? "Community author"
                : query.kind === "churches"
                  ? "Church"
                  : query.kind === "events"
                    ? "Church event occurrence"
                    : "Topic"}
          </p>
          {item.href ? (
            <Link
              prefetch={false}
              className="block whitespace-pre-wrap break-words text-xl text-gc-accent underline"
              href={item.href}
            >
              {item.label || "Open post"}
            </Link>
          ) : (
            <p className="text-xl">{item.label}</p>
          )}
          {query.kind === "people" && (
            <>
              <p>@{item.username}</p>
              {item.requiresSignIn && (
                <p className="text-sm text-gc-muted">
                  Sign in to view this member’s profile.
                </p>
              )}
            </>
          )}
          {query.kind === "churches" && (
            <p>{[item.city, item.region].filter(Boolean).join(", ")}</p>
          )}
          {query.kind === "posts" && Boolean(item.topics?.length) && (
            <p>Topics: {item.topics?.join(", ")}</p>
          )}
          {query.kind === "events" && item.startAt && item.timeZone && (
            <p>
              <time dateTime={item.startAt}>
                {new Intl.DateTimeFormat("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: item.timeZone
                }).format(new Date(item.startAt))}
              </time>{" "}
              · {item.timeZone}
            </p>
          )}
          {item.filter && (
            <Link
              prefetch={false}
              className="gc-button gc-button-quiet"
              href={searchHref({
                q: "",
                kind: "posts",
                topic: item.filter.topic
              })}
            >
              View posts about {item.filter.topic}
            </Link>
          )}
        </article>
      ))}
      {data?.nextCursor && (
        <Link
          prefetch={false}
          className="gc-button gc-button-quiet"
          href={searchHref({ ...query, after: data.nextCursor })}
        >
          More {query.kind}
        </Link>
      )}
    </section>
  );
}
