"use client";
import Link from "next/link";
import { RegionalTime } from "./regional-presentation";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import { PostContentNote } from "./post-content-note";
import { useReadVisibility } from "./read-visibility";
import {
  searchHref,
  searchCategoryLabel,
  type SearchNavigation
} from "@/lib/platform/search-navigation";
type Base = { id: string; label: string };
type Result = Base & {
  summary?: string;
  detail?: string;
  contentNote?: string | null;
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
  ownerId: string | null;
  kind: string;
  query: string;
  items: Result[];
  nextCursor: string | null;
  order?: string;
  limitReached?: boolean;
};
export function CommunitySearchResults({
  owner,
  query
}: {
  owner: string | null;
  query: SearchNavigation;
}) {
  const router = useRouter(),
    seq = useRef(0),
    active = useRef(false);
  const parentVisible = useReadVisibility();
  const [snapshot, setSnapshot] = useState<{
      path: string;
      owner: string | null;
      page: Page;
    } | null>(null),
    [busy, setBusy] = useState(true),
    [paused, setPaused] = useState(false),
    [error, setError] = useState("");
  const path =
    "/api/platform/search" + searchHref(query).slice("/platform/search".length);
  const data =
    parentVisible && snapshot?.path === path && snapshot.owner === owner
      ? snapshot.page
      : null;
  const setData = useCallback(
    (page: Page | null) => setSnapshot(page ? { path, owner, page } : null),
    [path, owner]
  );
  const load = useCallback(async () => {
    if (
      !parentVisible ||
      !active.current ||
      !navigator.onLine ||
      document.visibilityState === "hidden"
    )
      return;
    const current = ++seq.current;
    setData(null);
    setBusy(true);
    setPaused(false);
    setError("");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const r = await Promise.race([
        socialRequest<Page>(path, undefined, owner),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  "Search could not be confirmed. Retry when connected."
                )
              ),
            15000
          );
        })
      ]);
      if (r.data.ownerId !== owner)
        throw new SocialClientError(
          401,
          "Your sign-in changed. Reload before continuing."
        );
      if (current === seq.current && active.current) setData(r.data);
    } catch (e) {
      if (current === seq.current) {
        setError(
          e instanceof Error ? e.message : "Search could not be loaded."
        );
        if (e instanceof SocialClientError && e.status === 401)
          router.refresh();
      }
    } finally {
      clearTimeout(timer);
      if (current === seq.current) setBusy(false);
    }
  }, [path, owner, router, parentVisible, setData]);
  useEffect(() => {
    const conceal = () => {
      active.current = false;
      seq.current++;
      setData(null);
      setBusy(false);
      setPaused(true);
      setError("");
    };
    const restore = () => {
      if (
        parentVisible &&
        navigator.onLine &&
        document.visibilityState !== "hidden" &&
        document.hasFocus()
      ) {
        active.current = true;
        void load();
      }
    };
    const refresh = () => {
      if (active.current) void load();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? conceal() : restore();
    const pageShow = (event: PageTransitionEvent) => {
      if (event.persisted) restore();
    };
    conceal();
    restore();
    window.addEventListener("blur", conceal);
    window.addEventListener("offline", conceal);
    window.addEventListener("pagehide", conceal);
    window.addEventListener("online", restore);
    window.addEventListener("focus", restore);
    window.addEventListener("pageshow", pageShow);
    window.addEventListener("social-relationships-changed", refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      conceal();
      window.removeEventListener("blur", conceal);
      window.removeEventListener("offline", conceal);
      window.removeEventListener("pagehide", conceal);
      window.removeEventListener("online", restore);
      window.removeEventListener("focus", restore);
      window.removeEventListener("pageshow", pageShow);
      window.removeEventListener("social-relationships-changed", refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load, parentVisible, setData]);
  return (
    <section aria-label="Search results" className="space-y-4" aria-busy={busy}>
      <h2 className="text-3xl">{searchCategoryLabel(query.kind)}</h2>
      {busy && <p role="status">Searching permitted {query.kind}…</p>}
      {paused && (
        <div className="space-y-2">
          <p role="status">
            Results are hidden until this tab checks your current access.
          </p>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => {
              active.current = document.hasFocus();
              void load();
            }}
          >
            Resume search
          </button>
        </div>
      )}
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
          {!query.q &&
          !query.topic &&
          !["listings", "media", "opportunities", "groups"].includes(query.kind)
            ? "Enter words to search this category."
            : data.nextCursor
              ? "No available matches on this page. Continue to check the next page."
              : `No matching ${query.kind} available to you.`}
        </p>
      )}
      {data?.order && (
        <p className="text-sm text-gc-muted">
          {data.order} Only results available to you are shown.
        </p>
      )}
      {data?.limitReached && (
        <p role="status">
          Narrow your words or filters to continue beyond this search limit.
        </p>
      )}
      {data?.items.map((item) => (
        <article
          data-search-id={item.id}
          key={item.id}
          className="min-w-0 space-y-2 break-words rounded-xl border border-gc-divider bg-gc-surface p-4"
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
                    : query.kind === "topics"
                      ? "Topic"
                      : searchCategoryLabel(query.kind)}
          </p>
          <PostContentNote note={item.contentNote} />
          {item.detail && (
            <p className="text-sm text-gc-muted">{item.detail}</p>
          )}
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
          {item.summary && (
            <p className="whitespace-pre-wrap break-words">{item.summary}</p>
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
                <RegionalTime
                  value={item.startAt}
                  options={{
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: item.timeZone
                  }}
                />
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
