"use client";
import Link from "next/link";
import { flushSync } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMediaRead } from "./media-catalog-library";
import { settlePhotoNavigation } from "./use-photo-back-guard";
import type { ArtistContinuation } from "./artist-editor-workspace";
import {
  currentSocialOwner,
  socialRequest,
  SocialClientError
} from "@/lib/platform/social-client";
import { artistRoles, type ArtistItem } from "@/lib/platform/artist-types";
import { DiscoveryPlacePicker } from "./discovery-place-picker";
export const artistFieldClass =
  "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900";
export function ArtistNavigation() {
  return (
    <nav aria-label="Music navigation" className="flex flex-wrap gap-4">
      {[
        ["/platform/music", "Discover music"],
        ["/platform/music/following", "Followed artists"],
        ["/platform/music/studio", "Artist studio"]
      ].map(([href, label]) => (
        <Link
          key={href}
          href={href}
          prefetch={false}
          className="min-h-11 py-2 underline"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
export function ArtistReadNotice({
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
          "Checking current artist access. Return to this window and reconnect to continue."}
      </p>
      <button className="gc-button mt-3" onClick={reload}>
        Check again
      </button>
    </div>
  );
}
const pending = new Map<string, string>();
export function useArtistWrite(
  owner: string | null,
  scope: string,
  onSaved: (
    r: { id: string; version: number; message: string },
    body: Record<string, unknown>
  ) => void,
  endpoint = "/api/platform/artists",
  access?: ArtistContinuation
) {
  const key = `${owner}:${endpoint}:${scope}`,
    [uncertain, setUncertain] = useState<string | null>(
      pending.get(key) ?? null
    ),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [retryAt, setRetryAt] = useState(0),
    [clock, setClock] = useState(0);
  const accepted = useRef<{
    id: string;
    version: number;
    message: string;
  } | null>(null);
  const cooling = retryAt > clock;
  useEffect(() => {
    if (!cooling) return;
    const timer = window.setTimeout(() => setClock(Date.now()), 1000);
    return () => window.clearTimeout(timer);
  }, [cooling, clock]);
  const lock = useRef(false),
    live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  async function submit(body: string, recovery = false) {
    const ticket = access?.current(recovery);
    if (
      lock.current ||
      !owner ||
      (access && ticket === null) ||
      Date.now() < retryAt
    )
      return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    pending.set(key, body);
    if (access) setUncertain(body);
    const allowed = () => !access || access.current(recovery) === ticket;
    try {
      const data =
        accepted.current ??
        (
          await socialRequest<{
            id: string;
            version: number;
            message: string;
          }>(endpoint, body, owner)
        ).data;
      if (!live.current) return;
      if (access) {
        if (
          !data ||
          typeof data.id !== "string" ||
          !Number.isInteger(data.version) ||
          typeof data.message !== "string"
        )
          throw new SocialClientError(
            503,
            "The saved artist change could not be confirmed. Retry the exact change."
          );
        accepted.current = data;
        if (!allowed()) {
          setMessage(
            "Your change was saved. Return to the original account and deliberately continue after the saved change."
          );
          return;
        }
        flushSync(() => setConfirmed(true));
        await settlePhotoNavigation();
        if (!live.current) return;
        if (
          !allowed() ||
          (await currentSocialOwner()) !== owner ||
          !allowed()
        ) {
          setMessage(
            "Your change was saved. Recheck the original account, then continue after the saved change."
          );
          return;
        }
      }
      pending.delete(key);
      flushSync(() => {
        setBusy(false);
        setUncertain(null);
        setConfirmed(false);
        setMessage(data.message);
        if (access) onSaved(data, JSON.parse(body));
      });
      if (!access) onSaved(data, JSON.parse(body));
      accepted.current = null;
    } catch (e) {
      if (live.current) {
        if (
          !access &&
          e instanceof SocialClientError &&
          e.status < 500 &&
          e.status !== 401 &&
          !uncertain
        ) {
          pending.delete(key);
          setUncertain(null);
          setMessage(e.message);
        } else {
          setUncertain(body);
          setMessage(
            access && e instanceof Error
              ? e.message
              : "This change could not be confirmed. Retry the exact change to check its result."
          );
          if (access && e instanceof SocialClientError && e.retryAfter) {
            const now = Date.now();
            setClock(now);
            setRetryAt(now + e.retryAfter * 1000);
          }
        }
      }
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  }
  function act(body: Record<string, unknown>) {
    if (busy || uncertain || (access && access.current() === null)) return;
    setConfirmed(false);
    void submit(JSON.stringify({ ...body, mutationId: crypto.randomUUID() }));
  }
  function abandon() {
    if (busy || !uncertain) return;
    if (
      !window.confirm(
        "The earlier change may already have completed. Stop retrying and discard this local pending change? This does not undo saved work. Review the current state before another change."
      )
    )
      return;
    pending.delete(key);
    accepted.current = null;
    setConfirmed(false);
    setRetryAt(0);
    setUncertain(null);
    setMessage("Local retry discarded. Review the current saved state.");
    onSaved({ id: "", version: 0, message: "" }, { operation: "abandon" });
  }
  return {
    act,
    busy,
    uncertain,
    confirmed,
    message,
    controls: (
      <div className="space-y-3" aria-live="polite">
        {message && (
          <p role="status">
            {access && !access.visible
              ? "Your local change is retained. Return to the original account and recheck access to continue."
              : message}
          </p>
        )}
        {uncertain && (
          <div className="rounded-xl border border-amber-400 p-4">
            <p>
              The outcome is uncertain. Edited requests cannot replace this
              pending change.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                className="gc-button"
                disabled={
                  busy || cooling || (access && access.current(true) === null)
                }
                onClick={() => void submit(uncertain, true)}
              >
                {cooling
                  ? "Wait before retrying"
                  : accepted.current
                    ? "Continue after saved artist change"
                    : "Retry exact change"}
              </button>
              <button
                className="gc-button-secondary"
                disabled={busy}
                onClick={abandon}
              >
                Stop retrying and review
              </button>
            </div>
          </div>
        )}
      </div>
    )
  };
}
type Library = {
  viewerId: string | null;
  items: ArtistItem[];
  unavailable?: { artistId: string; version: number }[];
  total?: number;
  page?: number;
  pages?: number;
  invitations?: {
    id: string;
    artistId: string;
    version: number;
    capabilities: string[];
    artist: { name: string };
  }[];
};
export function ArtistLibrary({
  owner,
  view = "library"
}: {
  owner: string | null;
  view?: "library" | "studio" | "following";
}) {
  const search = useSearchParams(),
    router = useRouter(),
    q = new URLSearchParams(search.toString());
  q.set("view", view);
  const { data, error, reload } = useMediaRead<Library>(
      `/api/platform/artists?${q}`,
      owner
    ),
    write = useArtistWrite(owner, `library:${view}`, () => reload());
  return (
    <section className="space-y-5">
      <ArtistNavigation />
      <h1 className="text-3xl font-semibold">
        {view === "studio"
          ? "Artist studio"
          : view === "following"
            ? "Followed artists"
            : "Artists and music"}
      </h1>
      <p>
        Explore publisher-supplied profiles and releases. Artist profiles,
        credits and listening links are not identity or rights verification.
      </p>
      {view === "studio" && owner && (
        <p className="break-all text-sm">
          Your account reference for receiving an editor invitation: {owner}
        </p>
      )}
      {view === "studio" && owner && (
        <Link
          href="/platform/music/new"
          prefetch={false}
          className="gc-button inline-flex"
        >
          Create artist profile
        </Link>
      )}
      {!owner && view !== "library" ? (
        <Link
          href={`/platform/login?next=${encodeURIComponent(`/platform/music/${view}`)}`}
          className="underline"
        >
          Sign in to continue
        </Link>
      ) : (
        <>
          {view !== "studio" && (
            <form
              key={search.toString()}
              className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget),
                  next = new URLSearchParams();
                for (const [k, v] of f.entries())
                  if (typeof v === "string" && v.trim()) next.set(k, v.trim());
                router.push(
                  `/platform/music${view === "following" ? "/following" : ""}?${next}`
                );
              }}
            >
              <label>
                Artist or release name
                <input
                  name="q"
                  defaultValue={search.get("q") ?? ""}
                  maxLength={100}
                  className={artistFieldClass}
                />
              </label>
              <label>
                Genre
                <input
                  name="genre"
                  defaultValue={search.get("genre") ?? ""}
                  maxLength={40}
                  className={artistFieldClass}
                />
              </label>
              <label>
                Artist role
                <select
                  name="role"
                  defaultValue={search.get("role") ?? ""}
                  className={artistFieldClass}
                >
                  <option value="">All roles</option>
                  {artistRoles.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <ArtistLocationFilter
                key={`location:${search}`}
                country={search.get("country")}
                town={search.get("town")}
              />
              <label>
                Supplied church or ministry credit
                <input
                  name="church"
                  defaultValue={search.get("church") ?? ""}
                  maxLength={160}
                  className={artistFieldClass}
                />
              </label>
              <label>
                Release type
                <select
                  name="release"
                  defaultValue={search.get("release") ?? ""}
                  className={artistFieldClass}
                >
                  <option value="">Any releases or none</option>
                  <option value="SINGLE">Single</option>
                  <option value="EP">EP</option>
                  <option value="ALBUM">Album</option>
                </select>
              </label>
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  name="events"
                  value="yes"
                  defaultChecked={search.get("events") === "yes"}
                />
                Has an organizer-approved public event
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <button className="gc-button" type="submit">
                  Search music
                </button>
                <Link
                  prefetch={false}
                  href={`/platform/music${view === "following" ? "/following" : ""}`}
                  className="underline"
                >
                  Clear filters
                </Link>
              </div>
            </form>
          )}
          {write.controls}
          {!data ? (
            <ArtistReadNotice error={error} reload={reload} />
          ) : (
            <>
              {data.invitations?.map((inv) => (
                <section key={inv.id} className="rounded-xl border p-4">
                  <h2 className="text-lg font-semibold">
                    Editor invitation: {inv.artist.name}
                  </h2>
                  <p>
                    Accepting gives only these permissions:{" "}
                    {inv.capabilities
                      .map((x) => x.toLowerCase().replaceAll("_", " "))
                      .join(", ")}
                    . It does not verify this artist or give ownership.
                  </p>
                  <button
                    className="gc-button mt-3"
                    disabled={write.busy || !!write.uncertain}
                    onClick={() =>
                      write.act({
                        operation: "accept-invite",
                        artistId: inv.artistId,
                        invitationId: inv.id,
                        expectedVersion: inv.version
                      })
                    }
                  >
                    Accept these editor permissions
                  </button>
                </section>
              ))}
              {!data.items.length && (
                <p className="rounded-xl border p-5">
                  {view === "studio"
                    ? "You have no artist profiles to manage yet. Create a profile to start with a private draft."
                    : "No currently available artists match these choices."}
                </p>
              )}
              <ul className="grid gap-4 sm:grid-cols-2">
                {data.items.map((a) => (
                  <li key={a.id} className="min-w-0 rounded-xl border p-5">
                    <h2 className="break-words text-xl font-semibold">
                      <Link
                        prefetch={false}
                        href={`/platform/music/${a.id}${view === "studio" ? "/edit" : ""}`}
                        className="underline"
                      >
                        {a.name}
                      </Link>
                    </h2>
                    <p className="mt-2">
                      {a.roles.join(", ") || "Artist profile"}
                    </p>
                    <p>{a.genres.join(", ")}</p>
                    {a.state && <p>State: {a.state.toLowerCase()}</p>}
                    <p className="mt-2 whitespace-pre-wrap break-words">
                      {a.biography.slice(0, 240)}
                    </p>
                  </li>
                ))}
              </ul>
              {view === "following" && !!data.unavailable?.length && (
                <UnavailableArtistFollows
                  key={`${owner}:unavailable`}
                  owner={owner!}
                  items={data.unavailable}
                  reload={reload}
                />
              )}
              {!!data.pages && data.pages > 1 && (
                <nav
                  aria-label="Music pages"
                  className="flex flex-wrap items-center gap-3"
                >
                  {[
                    Math.max(1, data.page! - 1),
                    Math.min(data.pages, data.page! + 1)
                  ]
                    .filter((p, i, a) => p !== data.page && a.indexOf(p) === i)
                    .map((p) => {
                      const next = new URLSearchParams(search.toString());
                      next.set("page", String(p));
                      return (
                        <Link
                          key={p}
                          prefetch={false}
                          href={`?${next}`}
                          className="gc-button-secondary"
                        >
                          Page {p}
                        </Link>
                      );
                    })}
                  <span>
                    Page {data.page} of {data.pages}
                  </span>
                </nav>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

function ArtistLocationFilter({
  country: initialCountry,
  town
}: {
  country: string | null;
  town: string | null;
}) {
  const [country, setCountry] = useState(initialCountry);
  const [placeId, setPlaceId] = useState(town ? Number(town) : null);
  return (
    <div>
      <input type="hidden" name="country" value={country ?? ""} />
      <input type="hidden" name="town" value={placeId ?? ""} />
      <DiscoveryPlacePicker
        country={country}
        placeId={placeId}
        onCountry={(value) => {
          setCountry(value);
          setPlaceId(null);
        }}
        onPlace={setPlaceId}
      />
    </div>
  );
}

function UnavailableArtistFollows({
  owner,
  items,
  reload
}: {
  owner: string;
  items: { artistId: string; version: number }[];
  reload: () => void;
}) {
  const write = useArtistWrite(
    owner,
    "unavailable-artists",
    reload,
    "/api/platform/relationships"
  );
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Unavailable followed artists</h2>
      <p>
        These saved references no longer have a public page available to you.
        Remove a reference without reopening its source. Up to 100 are shown at
        a time.
      </p>
      {write.controls}
      {items.map((item, i) => (
        <div key={item.artistId} className="rounded-lg border p-3">
          <p>Unavailable artist {i + 1}</p>
          <button
            className="gc-button-secondary"
            disabled={write.busy || !!write.uncertain}
            onClick={() =>
              write.act({
                operation: "follow",
                kind: "artist",
                targetId: item.artistId,
                expectedVersion: item.version,
                desired: false
              })
            }
          >
            Remove unavailable follow {i + 1}
          </button>
        </div>
      ))}
    </section>
  );
}
