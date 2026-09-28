"use client";
import { useEffect, useState } from "react";
import { useArtistContinuation } from "./artist-editor-workspace";
import { ArtistCredits, ArtistRights, rightsInput } from "./artist-editor";
import { artistFieldClass, useArtistWrite } from "./artist-library";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
import type { ReleaseFields, ReleaseItem } from "@/lib/platform/artist-types";
type Draft = Omit<ReleaseFields, "links" | "tracks"> & {
  links: string[];
  tracks: {
    id: string;
    title: string;
    durationSeconds: number | null;
    links: string[];
  }[];
};
const initial = (r?: ReleaseItem): Draft =>
  r
    ? {
        kind: r.kind,
        title: r.title,
        description: r.description,
        releaseDate: r.releaseDate,
        credits: r.credits,
        links: r.links.map((l) => l.url),
        tracks: r.tracks.map((t) => ({
          ...t,
          links: t.links.map((l) => l.url)
        }))
      }
    : {
        kind: "SINGLE",
        title: "",
        description: "",
        releaseDate: null,
        credits: [],
        links: [],
        tracks: []
      };
export function ArtistReleaseEditor({
  owner,
  artistId,
  item,
  visible,
  canPublish,
  onSaved,
  onClose
}: {
  owner: string;
  artistId: string;
  item?: ReleaseItem;
  visible: boolean;
  canPublish: boolean;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [f, setF] = useState<Draft>(initial(item)),
    [version, setVersion] = useState(item?.version ?? 0),
    [dirty, setDirty] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [basis, setBasis] = useState("OWN_WORK"),
    [expiry, setExpiry] = useState(""),
    [guardNotice, setGuardNotice] = useState("");
  const access = useArtistContinuation(visible);
  const write = useArtistWrite(
    owner,
    `release:${artistId}:${item?.id ?? "new"}`,
    (_r, body) => {
      setDirty(false);
      setConfirmed(false);
      onSaved();
      if (
        body.operation === "create-release" ||
        body.operation === "remove-release" ||
        body.operation === "abandon"
      )
        onClose();
    },
    "/api/platform/artists",
    access
  );
  const conflict = !!item && item.version !== version;
  useEffect(() => {
    if (
      !dirty &&
      !write.uncertain &&
      !write.busy &&
      !write.confirmed &&
      item &&
      item.version !== version
    ) {
      setF(initial(item));
      setVersion(item.version);
      setConfirmed(false);
    }
  }, [item, dirty, write.uncertain, write.busy, write.confirmed, version]);
  useUnsavedSocialWork(
    {
      dirty: dirty && !write.confirmed,
      saving: !write.confirmed && (write.busy || !!write.uncertain),
      conflict: conflict && !write.confirmed
    },
    () =>
      setGuardNotice(
        "Save this release or close its editor and confirm discarding unsent edits before leaving."
      ),
    true
  );
  const change = (patch: Partial<Draft>) => {
    setF((v) => ({ ...v, ...patch }));
    setDirty(true);
    setConfirmed(false);
  };
  function act(operation: string) {
    const fields = {
      ...f,
      links: f.links.map((x) => x.trim()).filter(Boolean),
      tracks: f.tracks.map((t) => ({
        ...t,
        links: t.links.map((x) => x.trim()).filter(Boolean)
      }))
    };
    write.act({
      operation,
      artistId,
      ...(item ? { releaseId: item.id, expectedVersion: version } : {}),
      ...(["create-release", "save-release", "publish-release"].includes(
        operation
      )
        ? {
            fields,
            ...(confirmed ? { rights: rightsInput(basis, expiry) } : {})
          }
        : {})
    });
  }
  const track = (i: number, patch: Partial<Draft["tracks"][number]>) =>
    change({
      tracks: f.tracks.map((t, j) => (i === j ? { ...t, ...patch } : t))
    });
  // Keep local unsent fields in memory while the current-access read conceals the DOM.
  if (!access.visible)
    return (
      <section
        aria-label="Pending release change"
        className="space-y-3 rounded-lg border p-4"
      >
        <p>
          Release details are concealed until current access is confirmed. Your
          local work has not been discarded.
        </p>
        {write.controls}
        <button
          className="gc-button-secondary"
          disabled={write.busy || !!write.uncertain}
          onClick={() => {
            if (
              !dirty ||
              window.confirm(
                "Discard unsent local release edits and close this editor?"
              )
            )
              onClose();
          }}
        >
          Close concealed release editor
        </button>
      </section>
    );
  return (
    <section
      aria-label="Release editor"
      className="space-y-4 rounded-xl border-2 p-4"
    >
      <h3 className="text-xl font-semibold">
        {item ? "Edit release" : "New release"}
      </h3>
      <p>
        External sites control playback, availability, subscriptions and
        privacy. These publisher-supplied links are not a rights guarantee. No
        provider is contacted while preparing this form.
      </p>
      {write.controls}
      {guardNotice && dirty && <p role="status">{guardNotice}</p>}
      {conflict && (
        <div role="alert">
          <p>This release changed. Your unsent edits are retained.</p>
          <button
            className="gc-button-secondary"
            disabled={write.busy || !!write.uncertain}
            onClick={() => {
              if (
                window.confirm(
                  "Discard unsent release edits and load the current saved version?"
                )
              ) {
                setDirty(false);
                setF(initial(item));
                setVersion(item?.version ?? 0);
                setConfirmed(false);
              }
            }}
          >
            Review current saved release
          </button>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          act(item ? "save-release" : "create-release");
        }}
      >
        <fieldset
          className="space-y-4"
          disabled={write.busy || !!write.uncertain || conflict}
        >
          <label className="block">
            Release title
            <input
              value={f.title}
              maxLength={160}
              className={artistFieldClass}
              onChange={(e) => change({ title: e.target.value })}
            />
          </label>
          <label className="block">
            Release type
            <select
              value={f.kind}
              className={artistFieldClass}
              onChange={(e) =>
                change({ kind: e.target.value as Draft["kind"] })
              }
            >
              <option value="SINGLE">Single</option>
              <option value="EP">EP</option>
              <option value="ALBUM">Album</option>
            </select>
          </label>
          <label className="block">
            Release description
            <textarea
              value={f.description}
              maxLength={5000}
              rows={4}
              className={artistFieldClass}
              onChange={(e) => change({ description: e.target.value })}
            />
          </label>
          <label className="block">
            Supplied release date (optional)
            <input
              type="date"
              value={f.releaseDate ?? ""}
              className={artistFieldClass}
              onChange={(e) => change({ releaseDate: e.target.value || null })}
            />
          </label>
          <p className="text-sm">
            This date is descriptive. It does not schedule publication or an
            announcement.
          </p>
          <label className="block">
            Release listening links (one per line, up to 5)
            <textarea
              value={f.links.join("\n")}
              rows={3}
              className={artistFieldClass}
              onChange={(e) => change({ links: e.target.value.split("\n") })}
            />
          </label>
          <p className="text-sm">
            Use canonical Spotify, Apple Music or Bandcamp links. EPs and albums
            use album links; individual tracks use track links. Tracking,
            private streaming and redemption parameters are not accepted.
          </p>
          <h4 className="font-semibold">Ordered tracks</h4>
          {f.tracks.map((t, i) => (
            <section key={t.id} className="space-y-3 rounded-lg border p-3">
              <label className="block">
                Track {i + 1} title
                <input
                  value={t.title}
                  maxLength={160}
                  className={artistFieldClass}
                  onChange={(e) => track(i, { title: e.target.value })}
                />
              </label>
              <label className="block">
                Track {i + 1} duration in seconds (optional)
                <input
                  type="number"
                  min={1}
                  max={604800}
                  value={t.durationSeconds ?? ""}
                  className={artistFieldClass}
                  onChange={(e) =>
                    track(i, {
                      durationSeconds: e.target.value
                        ? Number(e.target.value)
                        : null
                    })
                  }
                />
              </label>
              <label className="block">
                Track {i + 1} listening links (one per line, up to 3)
                <textarea
                  rows={2}
                  value={t.links.join("\n")}
                  className={artistFieldClass}
                  onChange={(e) =>
                    track(i, { links: e.target.value.split("\n") })
                  }
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="min-h-11 underline"
                  disabled={i === 0}
                  onClick={() => {
                    const next = [...f.tracks];
                    [next[i - 1], next[i]] = [next[i], next[i - 1]];
                    change({ tracks: next });
                  }}
                >
                  Move track {i + 1} up
                </button>
                <button
                  type="button"
                  className="min-h-11 underline"
                  disabled={i === f.tracks.length - 1}
                  onClick={() => {
                    const next = [...f.tracks];
                    [next[i + 1], next[i]] = [next[i], next[i + 1]];
                    change({ tracks: next });
                  }}
                >
                  Move track {i + 1} down
                </button>
                <button
                  type="button"
                  className="min-h-11 underline"
                  onClick={() =>
                    change({ tracks: f.tracks.filter((x) => x.id !== t.id) })
                  }
                >
                  Remove track {i + 1}
                </button>
              </div>
            </section>
          ))}
          <button
            type="button"
            className="gc-button-secondary"
            disabled={f.tracks.length >= 50}
            onClick={() =>
              change({
                tracks: [
                  ...f.tracks,
                  {
                    id: crypto.randomUUID(),
                    title: "",
                    durationSeconds: null,
                    links: []
                  }
                ]
              })
            }
          >
            Add track
          </button>
          <ArtistCredits
            value={f.credits}
            change={(credits) => change({ credits })}
          />
          <ArtistRights
            confirmed={confirmed}
            setConfirmed={(value) => {
              setConfirmed(value);
              setDirty(true);
            }}
            basis={basis}
            setBasis={(value) => {
              setBasis(value);
              setDirty(true);
            }}
            expiry={expiry}
            setExpiry={(value) => {
              setExpiry(value);
              setDirty(true);
            }}
          />
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className="gc-button"
              disabled={item?.state === "PUBLISHED" && !confirmed}
            >
              {item ? "Save reviewed release" : "Save private release draft"}
            </button>
            {item && canPublish && item.state !== "PUBLISHED" && (
              <button
                type="button"
                className="gc-button"
                disabled={!confirmed}
                onClick={() => act("publish-release")}
              >
                Publish release publicly
              </button>
            )}
            {item && canPublish && item.state === "PUBLISHED" && (
              <button
                type="button"
                className="gc-button-secondary"
                onClick={() => act("unpublish-release")}
              >
                Unpublish release
              </button>
            )}
            {item && canPublish && (
              <>
                <button
                  type="button"
                  className="gc-button-secondary"
                  onClick={() => act("withdraw-release-rights")}
                >
                  Withdraw release permission
                </button>
                <button
                  type="button"
                  className="gc-button-secondary"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Remove this release from the artist page?"
                      )
                    )
                      act("remove-release");
                  }}
                >
                  Remove release
                </button>
              </>
            )}
            <button
              type="button"
              className="min-h-11 underline"
              onClick={() => {
                if (!dirty || window.confirm("Discard unsent release edits?"))
                  onClose();
              }}
            >
              Close release editor
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
