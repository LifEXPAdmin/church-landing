"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MediaTopicLinks } from "./media-topic-links";
import { mediaTopicSuggestions } from "@/lib/platform/media-topic-options";
import { useCallback, useEffect, useRef, useState } from "react";
import { socialRequest } from "@/lib/platform/social-client";
import { useReadVisibility } from "./read-visibility";
import { mediaFormatNames } from "@/lib/platform/media-catalog-options";
import type { MediaPublic } from "@/lib/platform/media-catalog-reads";
import { scriptureSystems } from "@/lib/platform/scripture-registry";
export function useMediaRead<T>(url: string, owner: string | null) {
  const parent = useReadVisibility(),
    [snapshot, setSnapshot] = useState<{
      url: string;
      owner: string | null;
      tick: number;
      value: T;
    } | null>(null),
    [error, setError] = useState(""),
    [tick, setTick] = useState(0);
  const reload = useCallback(() => {
      setSnapshot(null);
      setTick((n) => n + 1);
    }, []),
    generation = useRef(0);
  useEffect(() => {
    let live = true,
      focused = document.hasFocus(),
      connected = navigator.onLine;
    const active = () =>
      live &&
      parent &&
      focused &&
      connected &&
      document.visibilityState !== "hidden";
    const hide = () => {
      generation.current++;
      setSnapshot(null);
    };
    const read = async () => {
      if (!active()) return;
      const seq = ++generation.current;
      try {
        const r = await socialRequest<T>(url, undefined, owner);
        if (seq === generation.current && active()) {
          setSnapshot({ url, owner, tick, value: r.data });
          setError("");
        }
      } catch (e) {
        if (seq === generation.current && active()) {
          setSnapshot(null);
          setError(
            e instanceof Error
              ? e.message
              : "Media is unavailable. Reconnect and retry."
          );
        }
      }
    };
    const blur = () => {
        focused = false;
        hide();
      },
      focus = () => {
        focused = true;
        hide();
        void read();
      },
      offline = () => {
        connected = false;
        hide();
      },
      online = () => {
        connected = true;
        hide();
        void read();
      },
      visibility = () =>
        document.visibilityState === "hidden" ? blur() : focus(),
      change = () => {
        hide();
        void read();
      };
    hide();
    void read();
    const timer = setInterval(() => void read(), 30000);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    window.addEventListener("pagehide", blur);
    window.addEventListener("pageshow", focus);
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    window.addEventListener("social-relationships-changed", change);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      live = false;
      hide();
      clearInterval(timer);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
      window.removeEventListener("pagehide", blur);
      window.removeEventListener("pageshow", focus);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      window.removeEventListener("social-relationships-changed", change);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [url, owner, parent, tick]);
  return {
    data:
      parent &&
      snapshot?.url === url &&
      snapshot.owner === owner &&
      snapshot.tick === tick
        ? snapshot.value
        : null,
    error,
    reload
  };
}
export function MediaNavigation() {
  return (
    <nav aria-label="Media navigation" className="flex flex-wrap gap-5">
      <Link
        prefetch={false}
        href="/platform/media"
        className="min-h-11 py-2 underline"
      >
        Browse media
      </Link>
      <Link
        prefetch={false}
        href="/platform/media/studio"
        className="min-h-11 py-2 underline"
      >
        Publishing studio
      </Link>
    </nav>
  );
}
export function MediaReadNotice({
  error,
  reload
}: {
  error: string;
  reload: () => void;
}) {
  return (
    <div role="status" className="rounded-xl border p-5">
      <p>
        {error ||
          "Checking current media access. Return to this window and reconnect to continue."}
      </p>
      <button className="gc-button gc-button-quiet mt-3" onClick={reload}>
        Check again
      </button>
    </div>
  );
}
type StudioRow = {
  id: string;
  title: string;
  format: string | null;
  state: string;
  sourceState: string;
  recoveryRequired: boolean;
  ownerChurch: { name: string } | null;
};
export function MediaLibrary({
  owner,
  studio = false
}: {
  owner: string | null;
  studio?: boolean;
}) {
  const search = useSearchParams(),
    router = useRouter();
  const [studioPage, setStudioPage] = useState(0);
  const filters = new URLSearchParams();
  if (!studio)
    for (const name of [
      "q",
      "format",
      "speaker",
      "series",
      "topic",
      "referenceSystem",
      "scripture"
    ]) {
      const value = search.get(name);
      if (value) filters.set(name, value);
    }
  const query = filters.size ? "&" + filters.toString() : "";
  const requestedPage = Number(search.get("page") ?? 0);
  const page = studio
    ? studioPage
    : Number.isInteger(requestedPage) &&
        requestedPage >= 0 &&
        requestedPage <= 999
      ? requestedPage
      : 0;
  const setPage = (value: number) => {
    if (studio) return setStudioPage(value);
    const params = new URLSearchParams(filters);
    if (value) params.set("page", String(value));
    router.push(`/platform/media${params.size ? "?" + params.toString() : ""}`);
  };
  const { data, error, reload } = useMediaRead<{
    items: (MediaPublic & StudioRow)[];
    total: number;
    page: number;
  }>(
    `/api/platform/media-catalog?view=${studio ? "studio" : "library"}&page=${page}${query}`,
    owner
  );
  return (
    <section className="space-y-5">
      <MediaNavigation />
      <header>
        <p className="text-sm uppercase tracking-wide">
          {studio ? "Your publishing workspace" : "Listen and watch"}
        </p>
        <h1 className="text-3xl font-semibold">
          {studio ? "Publishing studio" : "Media library"}
        </h1>
        <p className="mt-2">
          {studio
            ? "Save private drafts, review the audience and source rights, then publish when ready."
            : "Explore sermons, podcasts, testimonies, services and teaching. Playback opens on the named external provider."}
        </p>
      </header>
      {studio ? (
        <Link className="gc-button" prefetch={false} href="/platform/media/new">
          Create media draft
        </Link>
      ) : (
        <>
          <section
            aria-label="Explore topics"
            className="space-y-2 rounded-xl border p-4"
          >
            <h2 className="text-xl font-semibold">Explore a topic</h2>
            <p>
              Browse optional publisher-selected labels. These are topics in
              recordings, not an assessment of you. Choosing one starts a new
              search.
            </p>
            <MediaTopicLinks topics={mediaTopicSuggestions} />
          </section>
          <form
            key={query}
            aria-label="Search media"
            className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const params = new URLSearchParams();
              new FormData(e.currentTarget).forEach((v, k) => {
                if (String(v).trim()) params.set(k, String(v).trim());
              });
              router.push(
                `/platform/media${params.size ? "?" + params.toString() : ""}`
              );
            }}
          >
            <label>
              Keywords
              <input
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
                name="q"
                defaultValue={filters.get("q") ?? ""}
                maxLength={160}
                placeholder="Title or description"
              />
            </label>
            <label>
              Format
              <select
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
                name="format"
                defaultValue={filters.get("format") ?? ""}
              >
                <option value="">All formats</option>
                {Object.entries(mediaFormatNames).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Speaker name
              <input
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
                name="speaker"
                defaultValue={filters.get("speaker") ?? ""}
                maxLength={120}
              />
            </label>
            <label>
              Series
              <input
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
                name="series"
                defaultValue={filters.get("series") ?? ""}
                maxLength={160}
              />
            </label>
            <label>
              Topic
              <input
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
                name="topic"
                defaultValue={filters.get("topic") ?? ""}
                maxLength={40}
              />
            </label>
            <label>
              Scripture reference system
              <select
                name="referenceSystem"
                defaultValue={filters.get("referenceSystem") ?? ""}
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
              >
                <option value="">Choose for passage search</option>
                {scriptureSystems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Scripture passage
              <input
                name="scripture"
                defaultValue={filters.get("scripture") ?? ""}
                maxLength={4000}
                placeholder="John 3:16-18"
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
              />
            </label>
            <p className="text-sm sm:col-span-2">
              Passage search matches overlapping publisher-supplied tags in the
              chosen reference system. For multiple passages, use full book
              names separated by semicolons.
            </p>
            <button className="gc-button self-end" type="submit">
              Search media
            </button>
            <Link
              prefetch={false}
              href="/platform/media"
              className="min-h-11 py-2 underline"
            >
              Clear filters
            </Link>
          </form>
          {filters.size > 0 && (
            <p
              aria-label="Applied media filters"
              className="break-words text-sm"
            >
              Applied filters:{" "}
              {Array.from(filters.entries())
                .map(
                  ([key, value]) =>
                    `${({ q: "Keywords", format: "Format", speaker: "Speaker", series: "Series", topic: "Topic", referenceSystem: "Reference system", scripture: "Passage" } as Record<string, string>)[key]}: ${value}`
                )
                .join("; ")}
            </p>
          )}
        </>
      )}
      {!data ? (
        <MediaReadNotice error={error} reload={reload} />
      ) : (
        <>
          <p role="status">
            {data.total} {data.total === 1 ? "item" : "items"} available
          </p>
          {!data.items.length ? (
            <p className="rounded-xl border p-6">
              {studio
                ? "No media drafts yet. Start with a title and save privately."
                : "No matching media is available. Try another search or format."}
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {data.items.map((item) => (
                <article
                  key={item.id}
                  className="rounded-xl border bg-white p-5"
                >
                  <p className="text-sm">
                    {mediaFormatNames[
                      item.format as keyof typeof mediaFormatNames
                    ] ?? "Draft"}
                    {studio ? ` · ${item.state.toLowerCase()}` : ""}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold">
                    <Link
                      prefetch={false}
                      className="underline"
                      href={`/platform/media/${encodeURIComponent(item.id)}${studio ? "/edit" : ""}`}
                    >
                      {item.title || "Untitled private draft"}
                    </Link>
                  </h2>
                  {!studio && (
                    <p className="mt-2 whitespace-pre-wrap">
                      {item.description.slice(0, 220)}
                    </p>
                  )}
                  {!studio && item.topics.length > 0 && (
                    <section
                      aria-label="Publisher topics"
                      className="mt-3 space-y-2"
                    >
                      <p className="text-sm">Publisher-selected topics</p>
                      <MediaTopicLinks topics={item.topics} />
                    </section>
                  )}
                  <p className="mt-3 text-sm">
                    {item.ownerChurch?.name ??
                      (studio
                        ? "Personal media"
                        : (item.owner?.name ?? "Publisher"))}
                  </p>
                  {studio && item.recoveryRequired && (
                    <p>Source review required after recovery.</p>
                  )}
                </article>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="gc-button gc-button-quiet whitespace-nowrap"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <span className="whitespace-nowrap py-2">Page {page + 1}</span>
            <button
              className="gc-button gc-button-quiet whitespace-nowrap"
              disabled={(page + 1) * 20 >= data.total || page >= 999}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}
