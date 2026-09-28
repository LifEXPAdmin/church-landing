"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMediaRead } from "./media-catalog-library";
import {
  ArtistNavigation,
  ArtistReadNotice,
  useArtistWrite
} from "./artist-library";
import { socialRequest } from "@/lib/platform/social-client";
import { reportEntryHref } from "@/lib/platform/community-report-types";
import type {
  ArtistItem,
  ArtistLink,
  ReleaseItem
} from "@/lib/platform/artist-types";
type View = {
  artist: ArtistItem;
  releases: ReleaseItem[];
  events: {
    id: string;
    title: string;
    startLocal: string;
    timeZone: string;
    canceled: boolean;
    location: string;
  }[];
};
function ArtistFollow({ owner, id }: { owner: string; id: string }) {
  const { data, error, reload } = useMediaRead<{
      version: number;
      following: boolean;
    }>(
      `/api/platform/relationships?view=status&kind=artist&targetId=${encodeURIComponent(id)}`,
      owner
    ),
    write = useArtistWrite(
      owner,
      `follow:${id}`,
      () => {
        reload();
        window.dispatchEvent(new Event("social-relationships-changed"));
      },
      "/api/platform/relationships"
    );
  return (
    <div className="space-y-2">
      {write.controls}
      {data ? (
        <button
          className="gc-button-secondary"
          disabled={write.busy || !!write.uncertain}
          onClick={() =>
            write.act({
              operation: "follow",
              kind: "artist",
              targetId: id,
              expectedVersion: data.version,
              desired: !data.following
            })
          }
        >
          {data.following ? "Unfollow artist" : "Follow artist"}
        </button>
      ) : error ? (
        <p>{error}</p>
      ) : null}
      <p className="text-sm">
        Following adds this artist to your private followed artists list. It
        does not enable alerts, personal contact or editing.
      </p>
    </div>
  );
}
export function ArtistReader({
  owner,
  id
}: {
  owner: string | null;
  id: string;
}) {
  const url = `/api/platform/artists?view=detail&id=${encodeURIComponent(id)}`,
    { data, error, reload } = useMediaRead<View>(url, owner),
    [tab, setTab] = useState("music"),
    [opening, setOpening] = useState(false),
    [notice, setNotice] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    const cancel = () => {
      generation.current++;
    };
    window.addEventListener("blur", cancel);
    window.addEventListener("pagehide", cancel);
    window.addEventListener("offline", cancel);
    return () => {
      cancel();
      window.removeEventListener("blur", cancel);
      window.removeEventListener("pagehide", cancel);
      window.removeEventListener("offline", cancel);
    };
  }, []);
  useEffect(() => {
    generation.current++;
  }, [data]);
  async function open(releaseId: string, link: ArtistLink, trackId?: string) {
    if (opening) return;
    setOpening(true);
    setNotice("");
    const seq = ++generation.current;
    try {
      const current = await socialRequest<View>(url, undefined, owner);
      if (
        seq !== generation.current ||
        !document.hasFocus() ||
        !navigator.onLine ||
        document.visibilityState === "hidden"
      )
        return;
      const release = current.data.releases.find((r) => r.id === releaseId),
        links = trackId
          ? release?.tracks.find((t) => t.id === trackId)?.links
          : release?.links;
      if (!links?.some((l) => l.url === link.url)) {
        setNotice("This listening link changed or is no longer available.");
        reload();
        return;
      }
      window.location.assign(link.url);
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "This release is unavailable."
      );
      reload();
    } finally {
      setOpening(false);
    }
  }
  const button = (r: ReleaseItem, l: ArtistLink, trackId?: string) => (
    <button
      key={l.url}
      className="gc-button-secondary whitespace-normal"
      disabled={opening}
      onClick={() => void open(r.id, l, trackId)}
    >
      Open on {l.provider}
    </button>
  );
  return (
    <article className="space-y-5">
      <ArtistNavigation />
      {!data ? (
        <ArtistReadNotice error={error} reload={reload} />
      ) : (
        <>
          <header className="rounded-xl border bg-slate-50 p-5">
            <p className="text-sm">
              Publisher-supplied{" "}
              {data.artist.presentation === "TEAM" ? "band or team" : "artist"}{" "}
              profile
            </p>
            <h1 className="mt-2 break-words text-3xl font-semibold">
              {data.artist.name}
            </h1>
            <p className="mt-2">{data.artist.roles.join(", ")}</p>
            <p>{data.artist.genres.join(", ")}</p>
            <p className="mt-3 text-sm">
              Profile creation, credits and listening links do not verify
              identity, church endorsement or music rights.
            </p>
          </header>
          {owner ? (
            <ArtistFollow owner={owner} id={id} />
          ) : (
            <Link
              href={`/platform/login?next=${encodeURIComponent(`/platform/music/${id}`)}`}
              className="underline"
            >
              Sign in to follow this artist
            </Link>
          )}
          <nav aria-label="Artist sections" className="flex flex-wrap gap-3">
            {["music", "events", "about", "support"].map((v) => (
              <button
                key={v}
                className="min-h-11 rounded-lg border px-4 py-2 capitalize"
                aria-pressed={tab === v}
                onClick={() => setTab(v)}
              >
                {v}
              </button>
            ))}
          </nav>
          {tab === "music" && (
            <section className="space-y-5">
              <h2 className="text-2xl font-semibold">Music</h2>
              <p>
                Playback happens on an external site with its own privacy,
                availability and account requirements. Links are supplied by the
                publisher. No provider is contacted until you choose to open it.
              </p>
              {!data.releases.length && (
                <p>
                  No currently available releases. You can still learn about
                  this artist or follow their profile.
                </p>
              )}
              {data.releases.map((r) => (
                <section
                  key={r.id}
                  id={`release-${r.id}`}
                  className="space-y-3 rounded-xl border p-5"
                >
                  <h3 className="break-words text-xl font-semibold">
                    {r.title}
                  </h3>
                  <p>
                    {r.kind.toLowerCase()}
                    {r.releaseDate ? ` · Supplied date ${r.releaseDate}` : ""}
                  </p>
                  <p className="whitespace-pre-wrap break-words">
                    {r.description}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {r.links.map((l) => button(r, l))}
                  </div>
                  <ol className="list-decimal space-y-3 pl-5">
                    {r.tracks.map((t) => (
                      <li key={t.id}>
                        <p className="break-words">
                          {t.title}
                          {t.durationSeconds
                            ? ` (${t.durationSeconds} seconds)`
                            : ""}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-3">
                          {t.links.map((l) => button(r, l, t.id))}
                        </div>
                      </li>
                    ))}
                  </ol>
                  {r.credits.length > 0 && (
                    <div>
                      <h4 className="font-semibold">
                        Publisher-supplied credits
                      </h4>
                      {r.credits.map((c, i) => (
                        <p key={i}>
                          {c.name}: {c.role}
                        </p>
                      ))}
                    </div>
                  )}
                  <Link
                    href={reportEntryHref("ARTIST_RELEASE", r.id)}
                    prefetch={false}
                    className="inline-flex min-h-11 items-center underline"
                  >
                    Report this release or a rights concern
                  </Link>
                </section>
              ))}
            </section>
          )}
          {tab === "events" && (
            <section className="space-y-3">
              <h2 className="text-2xl font-semibold">Events</h2>
              {!data.events.length && (
                <p>No currently available organizer-approved events.</p>
              )}
              {data.events.map((e) => (
                <div key={e.id} className="rounded-xl border p-4">
                  <Link
                    prefetch={false}
                    href={`/platform/events/${encodeURIComponent(e.id)}`}
                    className="underline"
                  >
                    {e.title}
                  </Link>
                  <p>
                    {e.startLocal} ({e.timeZone})
                  </p>
                  {e.canceled && <p>Canceled</p>}
                  <p>{e.location}</p>
                </div>
              ))}
            </section>
          )}
          {tab === "about" && (
            <section className="space-y-3">
              <h2 className="text-2xl font-semibold">About</h2>
              <p className="whitespace-pre-wrap break-words">
                {data.artist.biography ||
                  "This artist has not supplied a biography."}
              </p>
              {data.artist.locationLabel && (
                <p>Supplied location: {data.artist.locationLabel}</p>
              )}
              {data.artist.churchCredit && (
                <p>
                  Supplied church or ministry credit: {data.artist.churchCredit}
                </p>
              )}
              {data.artist.credits.length > 0 && (
                <div>
                  <h3 className="font-semibold">Publisher-supplied credits</h3>
                  {data.artist.credits.map((c, i) => (
                    <p key={i}>
                      {c.name}: {c.role}
                    </p>
                  ))}
                </div>
              )}
            </section>
          )}
          {tab === "support" && (
            <section className="space-y-3">
              <h2 className="text-2xl font-semibold">Support</h2>
              <p>
                No support or purchase destination is connected to this artist
                profile. God’s Churches does not collect payments, distribute
                music or handle royalties here.
              </p>
            </section>
          )}
          <p role="status">{notice}</p>
          <Link
            href={reportEntryHref("ARTIST", id)}
            prefetch={false}
            className="inline-flex min-h-11 items-center underline"
          >
            Report impersonation or an artist concern
          </Link>
        </>
      )}
    </article>
  );
}
