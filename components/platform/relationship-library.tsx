"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SocialClientError, socialRequest } from "@/lib/platform/social-client";
import { RelationshipControls } from "./relationship-controls";
import {
  relationshipViews,
  type RelationshipView
} from "@/lib/platform/relationship-navigation";
const labels: Record<RelationshipView, string> = {
  following: "Following",
  favorites: "Favorites",
  muted: "Muted and snoozed",
  blocked: "Blocked",
  churches: "Churches"
};
type Target = { id: string; name: string; username?: string };
type Row = {
  id: string;
  following?: Target;
  settings?: { muted: boolean; snoozedUntil: string | null };
  target?: Target | null;
  targetUserId?: string | null;
  churchId?: string | null;
  muted?: boolean;
  snoozedUntil?: string | null;
  blocked?: boolean;
};
type Page = { items: Row[]; nextCursor: string | null };
export function RelationshipLibrary({
  owner,
  view,
  after,
  search = ""
}: {
  owner: string;
  view: RelationshipView;
  after?: string;
  search?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(search);
  const searchable = view === "blocked" || view === "muted";
  const listHref = (cursor?: string) =>
    `/platform/relationships?${new URLSearchParams({ view, ...(search ? { q: search } : {}), ...(cursor ? { after: cursor } : {}) })}`;
  const [data, setData] = useState<Page | null>(null),
    [hidden, setHidden] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const generation = useRef(0),
    inFlight = useRef(false);
  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const seq = ++generation.current;
    setHidden(true);
    setBusy(true);
    setMessage("");
    try {
      const r = await socialRequest<Page>(
        `/api/platform/relationships?${new URLSearchParams({ view, ...(after ? { after } : {}), ...(search ? { q: search } : {}) })}`,
        undefined,
        owner
      );
      if (seq !== generation.current) return;
      setData(r.data);
      setHidden(false);
    } catch (e) {
      if (seq === generation.current) {
        setData(null);
        setMessage(
          e instanceof Error
            ? e.message
            : "Your connections could not be loaded."
        );
        if (e instanceof SocialClientError && e.status === 401)
          router.refresh();
      }
    } finally {
      if (seq === generation.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }, [owner, view, after, search, router]);
  useEffect(() => {
    void load();
    const conceal = () => {
      generation.current++;
      inFlight.current = false;
      setBusy(false);
      setHidden(true);
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
      // Request-generation counter, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      window.removeEventListener("blur", conceal);
      window.removeEventListener("focus", restore);
      window.removeEventListener("social-relationships-changed", restore);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load]);
  return (
    <section aria-label="Private relationship library" className="space-y-4">
      {searchable && (
        <Link className="underline" href="/platform/settings/safety">
          Back to Safety settings
        </Link>
      )}
      <p>
        These lists belong to your account. Following a church is separate from
        membership and church access.
      </p>
      <nav aria-label="Relationship views" className="flex flex-wrap gap-2">
        {relationshipViews.map((tab) => (
          <Link
            key={tab}
            prefetch={false}
            className="gc-button gc-button-quiet"
            href={`/platform/relationships?view=${tab}`}
            aria-current={view === tab ? "page" : undefined}
          >
            {labels[tab]}
          </Link>
        ))}
      </nav>
      {searchable && (
        <form
          role="search"
          className="gc-settings-search"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(
              `/platform/relationships?${new URLSearchParams({ view, ...(query.trim() ? { q: query.trim() } : {}) })}`
            );
          }}
        >
          <label htmlFor="relationship-search">
            Search{" "}
            {view === "blocked"
              ? "blocked accounts"
              : "muted accounts and churches"}
          </label>
          <input
            id="relationship-search"
            type="search"
            maxLength={100}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="gc-button gc-button-quiet" type="submit">
            Search this list
          </button>
          {search && (
            <Link
              className="underline"
              href={`/platform/relationships?view=${view}`}
            >
              Clear list search
            </Link>
          )}
        </form>
      )}
      <p role="status">{busy ? "Loading your connections…" : message}</p>
      <button
        type="button"
        className="gc-button gc-button-quiet"
        disabled={busy}
        onClick={() => void load()}
      >
        Refresh connections
      </button>
      {!hidden && data && (
        <>
          <h2 className="text-2xl">{labels[view]}</h2>
          {!data.items.length && (
            <p>
              {search
                ? "No matching accounts in this list. Try another name or clear your search."
                : view === "blocked"
                  ? "You haven’t blocked any accounts. Open a person’s profile and their Connections controls to block them."
                  : view === "muted"
                    ? "You haven’t muted or snoozed any accounts or churches. Open their Connections controls to choose Mute or Snooze."
                    : "No connections in this view."}
            </p>
          )}
          <div className="space-y-3">
            {data.items.map((row) => {
              const person = row.following ?? row.target;
              const kind = row.churchId ? "church" : "person";
              const expiry = row.settings?.snoozedUntil ?? row.snoozedUntil;
              const muted = row.settings?.muted ?? row.muted;
              return (
                <article
                  key={row.id}
                  data-relationship-id={row.id}
                  className="space-y-2 rounded border p-3"
                >
                  {person ? (
                    <>
                      <h3 className="font-semibold">{person.name}</h3>
                      {!row.blocked && (
                        <Link
                          prefetch={false}
                          className="underline"
                          href={
                            kind === "church"
                              ? `/platform/churches/${person.id}`
                              : `/platform/profile/${person.username}`
                          }
                        >
                          Open {kind === "church" ? "church" : "profile"}
                        </Link>
                      )}
                      {muted && <p>Muted in feed</p>}
                      {expiry && (
                        <p>
                          {Date.parse(expiry) > Date.now()
                            ? "Snoozed until "
                            : "Snooze ended "}
                          <time dateTime={expiry}>
                            {new Date(expiry).toLocaleString()}
                          </time>
                        </p>
                      )}
                      <RelationshipControls
                        kind={kind}
                        targetId={person.id}
                        name={person.name}
                      />
                    </>
                  ) : (
                    <p>
                      {kind === "church"
                        ? "Church unavailable"
                        : "Account unavailable"}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
          <nav aria-label="Relationship pages" className="flex flex-wrap gap-2">
            {after && (
              <Link
                prefetch={false}
                className="gc-button gc-button-quiet"
                href={listHref()}
              >
                First page
              </Link>
            )}
            {data.nextCursor && (
              <Link
                prefetch={false}
                className="gc-button gc-button-quiet"
                href={listHref(data.nextCursor)}
              >
                More connections
              </Link>
            )}
          </nav>
        </>
      )}
    </section>
  );
}
