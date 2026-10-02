"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useArtistContinuation } from "./artist-editor-workspace";
import Link from "next/link";
import { useMediaRead } from "./media-catalog-library";
import {
  ArtistNavigation,
  ArtistReadNotice,
  artistFieldClass,
  useArtistWrite
} from "./artist-library";
import { ArtistReleaseEditor } from "./artist-release-editor";
import { ArtistDelegates } from "./artist-delegates";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
import { DiscoveryPlacePicker } from "./discovery-place-picker";
import {
  ARTIST_POLICY,
  artistRoles,
  type ArtistFields,
  type ArtistCredit,
  type ReleaseItem,
  type ArtistEditorView
} from "@/lib/platform/artist-types";
export const emptyArtist: ArtistFields = {
  name: "",
  biography: "",
  presentation: "PERSON",
  roles: [],
  genres: [],
  countryId: null,
  townId: null,
  churchCredit: "",
  credits: []
};
export function ArtistCredits({
  value,
  change
}: {
  value: ArtistCredit[];
  change: (v: ArtistCredit[]) => void;
}) {
  return (
    <section className="space-y-3">
      <h3 className="font-semibold">Supplied credits</h3>
      <p className="text-sm">
        Names describe the publisher&apos;s credits. They do not connect
        accounts, confirm a collaboration or grant access.
      </p>
      {value.map((c, i) => (
        <div
          key={i}
          className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2"
        >
          <label>
            Credit {i + 1} name
            <input
              value={c.name}
              maxLength={120}
              className={artistFieldClass}
              onChange={(e) =>
                change(
                  value.map((x, j) =>
                    i === j ? { ...x, name: e.target.value } : x
                  )
                )
              }
            />
          </label>
          <label>
            Credit {i + 1} role
            <input
              value={c.role}
              maxLength={80}
              className={artistFieldClass}
              onChange={(e) =>
                change(
                  value.map((x, j) =>
                    i === j ? { ...x, role: e.target.value } : x
                  )
                )
              }
            />
          </label>
          <button
            type="button"
            className="min-h-11 underline"
            onClick={() => change(value.filter((_, j) => j !== i))}
          >
            Remove credit {i + 1}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="gc-button-secondary"
        disabled={value.length >= 30}
        onClick={() => change([...value, { name: "", role: "" }])}
      >
        Add credit
      </button>
    </section>
  );
}
export function ArtistRights({
  confirmed,
  setConfirmed,
  basis,
  setBasis,
  expiry,
  setExpiry
}: {
  confirmed: boolean;
  setConfirmed: (v: boolean) => void;
  basis: string;
  setBasis: (v: string) => void;
  expiry: string;
  setExpiry: (v: string) => void;
}) {
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h3 className="font-semibold">Review publication permission</h3>
      <p>
        Your private assertion covers the supplied text, credits, tracks and
        links. It is not independent verification. Do not submit contracts,
        signatures or identity documents here.
      </p>
      <label className="block">
        Permission basis
        <select
          value={basis}
          className={artistFieldClass}
          onChange={(e) => {
            setBasis(e.target.value);
            setConfirmed(false);
          }}
        >
          <option value="OWN_WORK">My own work and representation</option>
          <option value="CURRENT_PERMISSION">
            Current permission from the relevant owners
          </option>
        </select>
      </label>
      <label className="block">
        Permission expires at (optional)
        <input
          type="datetime-local"
          value={expiry}
          className={artistFieldClass}
          onChange={(e) => {
            setExpiry(e.target.value);
            setConfirmed(false);
          }}
        />
      </label>
      <label className="flex min-h-11 items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span>
          I reviewed this exact version and have current authority and
          permission to publish all its supplied material and listening links
          publicly.
        </span>
      </label>
    </section>
  );
}
export const rightsInput = (basis: string, expiry: string) => ({
  policy: ARTIST_POLICY,
  confirmed: true,
  basis,
  expiresAt: expiry ? new Date(expiry).toISOString() : null
});
export function ArtistEditor({
  owner,
  id
}: {
  owner: string | null;
  id?: string;
}) {
  const { data, error, reload } = useMediaRead<ArtistEditorView>(
      `/api/platform/artists?view=${id ? `editor&id=${encodeURIComponent(id)}` : "studio"}`,
      owner
    ),
    [fields, setFields] = useState<ArtistFields>(emptyArtist),
    [placeQuery, setPlaceQuery] = useState(""),
    [version, setVersion] = useState<number | null>(null),
    [dirty, setDirty] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [basis, setBasis] = useState("OWN_WORK"),
    [expiry, setExpiry] = useState(""),
    [representation, setRepresentation] = useState(false),
    [releaseId, setReleaseId] = useState<string | null>(null),
    [releaseSnapshot, setReleaseSnapshot] = useState<ReleaseItem | undefined>(),
    [removed, setRemoved] = useState(false),
    [guardNotice, setGuardNotice] = useState("");
  const access = useArtistContinuation(!!data && version !== null && !removed);
  const delegateSnapshot = useRef<ArtistEditorView | null>(null);
  if (data) delegateSnapshot.current = data;
  const write = useArtistWrite(
    owner,
    `editor:${id ?? "new"}`,
    (receipt, body) => {
      flushSync(() => {
        if (
          body.operation === "unpublish" ||
          body.operation === "withdraw-rights"
        ) {
          // These commands change publication only. Keep unsent metadata and
          // adopt only this receipt's version, so later remote edits conflict.
          setVersion(receipt.version);
        } else {
          setDirty(false);
          setVersion(null);
        }
        setConfirmed(false);
      });
      if (body.operation === "create") {
        window.location.assign(`/platform/music/${receipt.id}/edit`);
        return;
      }
      if (body.operation === "remove") {
        setRemoved(true);
        return;
      }
      reload();
    },
    "/api/platform/artists",
    access
  );
  const artist = data?.artist,
    permissions = id
      ? data?.permissions
      : { steward: true, profile: true, drafts: false, publish: false },
    conflict = !!(artist && version !== null && artist.version !== version);
  const load = useCallback(() => {
    const retained = write.uncertain ? JSON.parse(write.uncertain) : null;
    setFields(
      retained?.fields ??
        (artist
          ? (Object.fromEntries(
              Object.keys(emptyArtist).map((k) => [
                k,
                artist[k as keyof ArtistFields]
              ])
            ) as ArtistFields)
          : emptyArtist)
    );
    setPlaceQuery("");
    setVersion(artist?.version ?? 0);
    setDirty(!!retained);
    setConfirmed(false);
  }, [artist, write.uncertain]);
  useEffect(() => {
    if (data && version === null && !dirty) load();
  }, [data, version, dirty, load]);
  useUnsavedSocialWork(
    {
      dirty: dirty && !write.confirmed,
      saving: !write.confirmed && (write.busy || !!write.uncertain),
      conflict: conflict && !write.confirmed
    },
    () =>
      setGuardNotice(
        "Save or explicitly discard your profile edits before leaving."
      ),
    true
  );
  function change(patch: Partial<ArtistFields>) {
    setFields((f) => ({ ...f, ...patch }));
    setDirty(true);
    setConfirmed(false);
  }
  function save(operation: string) {
    if (!data) return;
    write.act({
      operation,
      ...(id
        ? { artistId: id, expectedVersion: version }
        : { representation, policy: ARTIST_POLICY }),
      ...(["create", "save", "publish"].includes(operation)
        ? {
            fields: {
              ...fields,
              genres: fields.genres.map((x) => x.trim()).filter(Boolean)
            },
            ...(confirmed ? { rights: rightsInput(basis, expiry) } : {})
          }
        : {})
    });
  }
  const hidden = !data || version === null || removed || !access.visible;
  return (
    <section className="space-y-5">
      <ArtistNavigation />
      <h1 className="text-3xl font-semibold">
        {id ? "Manage artist" : "Create artist profile"}
      </h1>
      {write.controls}
      {guardNotice && dirty && <p role="status">{guardNotice}</p>}
      {hidden && dirty && (
        <button
          className="gc-button-secondary"
          disabled={write.busy || !!write.uncertain}
          onClick={() => {
            if (
              window.confirm(
                "Discard unsent local profile edits? This does not change saved work."
              )
            ) {
              setDirty(false);
              setFields(emptyArtist);
              setVersion(null);
              setConfirmed(false);
            }
          }}
        >
          Discard concealed profile edits
        </button>
      )}
      {!owner ? (
        <Link
          href="/platform/login?next=%2Fplatform%2Fmusic%2Fstudio"
          className="underline"
        >
          Sign in to manage artists
        </Link>
      ) : removed ? (
        <p>
          This artist was removed. Its public page and releases are unavailable.
        </p>
      ) : hidden ? (
        <ArtistReadNotice
          error={error}
          reload={() => {
            access.resume();
            reload();
          }}
        />
      ) : (
        <>
          {id && (
            <p>
              State: {artist?.state?.toLowerCase()}.{" "}
              <Link
                href={`/platform/music/${id}`}
                prefetch={false}
                className="underline"
              >
                Check the public artist page
              </Link>
            </p>
          )}
          {conflict && (
            <div
              role="alert"
              className="rounded-lg border border-amber-500 p-4"
            >
              <p>
                This profile changed. Your local edits are still here. Review
                the current saved version before another save.
              </p>
              <button
                className="gc-button-secondary mt-2"
                disabled={write.busy || !!write.uncertain}
                onClick={() => {
                  if (
                    window.confirm(
                      "Discard unsent profile edits and load the current saved version?"
                    )
                  ) {
                    setDirty(false);
                    load();
                  }
                }}
              >
                Discard edits and load current version
              </button>
            </div>
          )}
          {permissions?.profile && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                save(id ? "save" : "create");
              }}
            >
              <fieldset
                disabled={write.busy || !!write.uncertain || conflict}
                className="space-y-4"
              >
                <label className="block">
                  Artist name
                  <input
                    className={artistFieldClass}
                    maxLength={160}
                    required
                    value={fields.name}
                    onChange={(e) => change({ name: e.target.value })}
                  />
                </label>
                <label className="block">
                  Presentation
                  <select
                    className={artistFieldClass}
                    value={fields.presentation}
                    onChange={(e) =>
                      change({
                        presentation: e.target.value as "PERSON" | "TEAM"
                      })
                    }
                  >
                    <option value="PERSON">Person</option>
                    <option value="TEAM">Band or team</option>
                  </select>
                </label>
                <label className="block">
                  Biography
                  <textarea
                    className={artistFieldClass}
                    rows={5}
                    maxLength={5000}
                    value={fields.biography}
                    onChange={(e) => change({ biography: e.target.value })}
                  />
                </label>
                <fieldset className="grid gap-2 sm:grid-cols-2">
                  <legend>Artist roles</legend>
                  {artistRoles.map((role) => (
                    <label
                      key={role}
                      className="flex min-h-11 items-center gap-2"
                    >
                      <input
                        type="checkbox"
                        checked={fields.roles.includes(role)}
                        onChange={(e) =>
                          change({
                            roles: e.target.checked
                              ? [...fields.roles, role]
                              : fields.roles.filter((r) => r !== role)
                          })
                        }
                      />
                      {role}
                    </label>
                  ))}
                </fieldset>
                <label className="block">
                  Genres (one per line, up to 10)
                  <textarea
                    className={artistFieldClass}
                    rows={3}
                    value={fields.genres.join("\n")}
                    onChange={(e) =>
                      change({ genres: e.target.value.split("\n") })
                    }
                  />
                </label>
                <DiscoveryPlacePicker
                  queryValue={placeQuery}
                  onQueryChange={(value) => {
                    setPlaceQuery(value);
                    setDirty(true);
                  }}
                  country={fields.countryId}
                  placeId={fields.townId ? Number(fields.townId) : null}
                  onCountry={(countryId) => change({ countryId, townId: null })}
                  onPlace={(placeId) =>
                    change({ townId: placeId ? String(placeId) : null })
                  }
                />
                <label className="block">
                  Supplied church or ministry credit (optional)
                  <input
                    className={artistFieldClass}
                    maxLength={160}
                    value={fields.churchCredit}
                    onChange={(e) => change({ churchCredit: e.target.value })}
                  />
                </label>
                <p className="text-sm">
                  This supplied credit does not establish church endorsement or
                  authority. Artwork uses a text fallback in this version.
                </p>
                <ArtistCredits
                  value={fields.credits}
                  change={(credits) => change({ credits })}
                />
                {!id && (
                  <label className="flex min-h-11 items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={representation}
                      onChange={(e) => {
                        setRepresentation(e.target.checked);
                        setDirty(true);
                      }}
                    />
                    <span>
                      I am this artist or currently authorized to maintain this
                      person&apos;s or team&apos;s profile.
                    </span>
                  </label>
                )}
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
                    disabled={
                      (!id && (!representation || !confirmed)) ||
                      (artist?.state === "PUBLISHED" && !confirmed)
                    }
                  >
                    {id ? "Save reviewed profile" : "Create private draft"}
                  </button>
                  {id &&
                    permissions.steward &&
                    artist?.state !== "PUBLISHED" && (
                      <button
                        type="button"
                        className="gc-button"
                        disabled={!confirmed}
                        onClick={() => save("publish")}
                      >
                        Publish profile publicly
                      </button>
                    )}
                  {id &&
                    permissions.steward &&
                    artist?.state === "PUBLISHED" && (
                      <button
                        type="button"
                        className="gc-button-secondary"
                        onClick={() => save("unpublish")}
                      >
                        Unpublish artist
                      </button>
                    )}
                  {id && permissions.steward && (
                    <button
                      type="button"
                      className="gc-button-secondary"
                      onClick={() => save("withdraw-rights")}
                    >
                      Withdraw profile permission
                    </button>
                  )}
                  {id && permissions.steward && (
                    <button
                      type="button"
                      className="gc-button-secondary"
                      onClick={() => {
                        if (
                          window.confirm(
                            "Remove this artist and make its public releases unavailable?"
                          )
                        )
                          save("remove");
                      }}
                    >
                      Remove artist
                    </button>
                  )}
                  {dirty && (
                    <button
                      type="button"
                      className="min-h-11 underline"
                      onClick={() => {
                        if (window.confirm("Discard unsent profile edits?")) {
                          setDirty(false);
                          load();
                        }
                      }}
                    >
                      Discard unsent edits
                    </button>
                  )}
                </div>
              </fieldset>
            </form>
          )}
          {id && permissions?.drafts && (
            <section className="space-y-3 border-t pt-5">
              <h2 className="text-2xl font-semibold">Music releases</h2>
              {!data.releases.length && (
                <p>
                  No releases yet. This profile can stand on its own while you
                  prepare a release.
                </p>
              )}
              <button
                className="gc-button"
                disabled={
                  dirty || write.busy || !!write.uncertain || !!releaseId
                }
                onClick={() => {
                  setReleaseSnapshot(undefined);
                  setReleaseId("new");
                }}
              >
                Add release
              </button>
              <ul className="space-y-2">
                {data.releases.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <span>
                      {r.title || "Untitled draft"} ({r.state?.toLowerCase()})
                    </span>
                    <button
                      className="min-h-11 underline"
                      disabled={
                        dirty || write.busy || !!write.uncertain || !!releaseId
                      }
                      onClick={() => {
                        setReleaseSnapshot(r);
                        setReleaseId(r.id);
                      }}
                    >
                      Edit release
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      {owner && id && delegateSnapshot.current && (
        <ArtistDelegates
          owner={owner}
          id={id}
          data={data ?? delegateSnapshot.current}
          reload={reload}
          visible={!hidden}
          disabled={dirty || write.busy || !!write.uncertain || !!releaseId}
        />
      )}
      {owner && id && releaseId && (
        <ArtistReleaseEditor
          key={`${owner}:${releaseId}`}
          owner={owner}
          artistId={id}
          visible={
            !hidden &&
            !!permissions?.drafts &&
            (releaseId === "new" ||
              !!data?.releases.some((r) => r.id === releaseId))
          }
          item={
            data?.releases.find((r) => r.id === releaseId) ?? releaseSnapshot
          }
          canPublish={!!permissions?.publish}
          onSaved={reload}
          onClose={() => setReleaseId(null)}
        />
      )}
    </section>
  );
}
