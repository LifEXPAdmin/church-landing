"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useArtistContinuation } from "./artist-editor-workspace";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
import { useMediaRead } from "./media-catalog-library";
import {
  ArtistNavigation,
  ArtistReadNotice,
  artistFieldClass,
  useArtistWrite
} from "./artist-library";
import {
  artistCapabilities,
  type ArtistEditorView,
  type ArtistItem
} from "@/lib/platform/artist-types";
const capabilityLabels = {
  EDIT_ARTIST_PROFILE: "Edit profile descriptions",
  EDIT_ARTIST_RELEASES: "Create and edit private release drafts",
  PUBLISH_ARTIST_RELEASES: "Publish, edit and remove releases"
};
export function ArtistDelegates({
  owner,
  id,
  data: currentData,
  reload,
  visible = true,
  disabled
}: {
  owner: string;
  id: string;
  data: ArtistEditorView;
  reload: () => void;
  visible?: boolean;
  disabled: boolean;
}) {
  const [data, setData] = useState(currentData),
    [guardNotice, setGuardNotice] = useState(""),
    [accountId, setAccountId] = useState(""),
    [capabilities, setCapabilities] = useState<string[]>([]),
    [eventUrl, setEventUrl] = useState(""),
    [eventError, setEventError] = useState("");
  const access = useArtistContinuation(visible);
  const write = useArtistWrite(
    owner,
    `delegates:${id}`,
    (_receipt, body) => {
      if (body.operation === "invite") {
        setAccountId("");
        setCapabilities([]);
      }
      if (body.operation === "propose-event") {
        setEventUrl("");
        setEventError("");
      }
      reload();
    },
    "/api/platform/artists",
    access
  );
  const dirty = !!accountId || capabilities.length > 0 || !!eventUrl,
    protectedWork = dirty || write.busy || !!write.uncertain,
    changed =
      JSON.stringify([
        data.permissions,
        data.ownDelegate,
        data.delegates,
        data.associations
      ]) !==
      JSON.stringify([
        currentData.permissions,
        currentData.ownDelegate,
        currentData.delegates,
        currentData.associations
      ]);
  useEffect(() => {
    if (!protectedWork) setData(currentData);
  }, [currentData, protectedWork]);
  useUnsavedSocialWork(
    {
      dirty,
      saving: !write.confirmed && (write.busy || !!write.uncertain),
      conflict: changed && protectedWork
    },
    () =>
      setGuardNotice(
        "Finish or explicitly discard your local permission and event entries before leaving."
      ),
    true
  );
  const locked = disabled || write.busy || !!write.uncertain;
  function discardEntries() {
    if (
      write.busy ||
      write.uncertain ||
      !window.confirm(
        "Discard unsent permission and event entries? This does not undo saved changes."
      )
    )
      return;
    setAccountId("");
    setCapabilities([]);
    setEventUrl("");
    setEventError("");
    setGuardNotice("");
  }
  if (!access.visible || (changed && protectedWork))
    return (
      <section
        aria-label="Retained artist permissions"
        className="space-y-3 rounded-xl border p-4"
      >
        <p>
          Permission and event details are concealed. Local entries and original
          requests are retained while current access and changes are reviewed.
        </p>
        {write.controls}
        {access.visible && changed && dirty && (
          <button
            className="gc-button-secondary"
            disabled={locked || access.current() === null}
            onClick={() => {
              if (locked || access.current() === null) return;
              setData(currentData);
              setGuardNotice("");
            }}
          >
            Review current permissions and keep entries
          </button>
        )}
        {dirty && (
          <button
            className="gc-button-secondary"
            disabled={write.busy || !!write.uncertain}
            onClick={discardEntries}
          >
            Discard concealed permission entries
          </button>
        )}
      </section>
    );
  return (
    <section className="space-y-4 border-t pt-5">
      <h2 className="text-2xl font-semibold">Editor permissions and events</h2>
      {guardNotice && dirty && <p role="status">{guardNotice}</p>}
      {write.controls}
      {dirty && !data.permissions.steward && (
        <div className="space-y-3">
          <p>
            Your current permissions do not allow editing these entries. Your
            local entries are retained until you explicitly discard them.
          </p>
          <button
            className="gc-button-secondary"
            disabled={write.busy || !!write.uncertain}
            onClick={discardEntries}
          >
            Discard concealed permission entries
          </button>
        </div>
      )}
      {!data.permissions.steward && data.ownDelegate?.state === "ACCEPTED" && (
        <button
          className="gc-button-secondary"
          disabled={locked}
          onClick={() => {
            if (
              window.confirm("Give up your editor permissions for this artist?")
            )
              write.act({
                operation: "step-down",
                artistId: id,
                invitationId: data.ownDelegate!.id,
                expectedVersion: data.ownDelegate!.version
              });
          }}
        >
          Step down from this artist
        </button>
      )}
      {data.permissions.steward && (
        <>
          <p>
            Invite a member by their account reference from their artist studio.
            They must sign in and accept these exact permissions. Invitations
            expire after seven days. No automatic message is sent.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const prior = data.delegates.find(
                (d) => d.accountId === accountId.trim()
              );
              write.act({
                operation: "invite",
                artistId: id,
                accountId: accountId.trim(),
                capabilities,
                expectedVersion: prior?.version ?? 0
              });
            }}
          >
            <fieldset disabled={locked} className="space-y-3">
              <label className="block">
                Member account reference
                <input
                  required
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className={artistFieldClass}
                  maxLength={100}
                />
              </label>
              {artistCapabilities.map((cap) => (
                <label key={cap} className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={capabilities.includes(cap)}
                    onChange={(e) =>
                      setCapabilities((v) =>
                        e.target.checked
                          ? [...v, cap]
                          : v.filter((x) => x !== cap)
                      )
                    }
                  />
                  {capabilityLabels[cap]}
                </label>
              ))}
              <button
                type="submit"
                className="gc-button"
                disabled={!capabilities.length}
              >
                Propose editor permissions
              </button>
            </fieldset>
          </form>
          <ul className="space-y-3">
            {data.delegates.map((d) => (
              <li key={d.id} className="rounded-lg border p-4">
                <p className="break-all">Member reference: {d.accountId}</p>
                <p>
                  {d.capabilities
                    .map(
                      (c) =>
                        capabilityLabels[c as keyof typeof capabilityLabels]
                    )
                    .join(", ")}
                </p>
                <p>
                  {d.state.toLowerCase()}
                  {d.state === "PENDING"
                    ? `; expires ${new Date(d.expiresAt).toLocaleString()}`
                    : ""}
                </p>
                {!d.revokedAt && (
                  <button
                    className="min-h-11 underline"
                    disabled={locked}
                    onClick={() =>
                      write.act({
                        operation: "revoke-invite",
                        artistId: id,
                        invitationId: d.id,
                        expectedVersion: d.version
                      })
                    }
                  >
                    Revoke this artist scope
                  </button>
                )}
              </li>
            ))}
          </ul>
          <h3 className="text-xl font-semibold">Related public events</h3>
          <p>
            Propose a current public church event. Its organizer must review and
            accept the artist association. A link does not create an RSVP or
            grant calendar editing.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              let occurrenceId = "";
              setEventError("");
              try {
                const u = new URL(eventUrl.trim(), window.location.origin);
                const match =
                  /^\/platform\/events\/([A-Za-z0-9_-]{1,100})$/.exec(
                    u.pathname
                  );
                if (
                  u.origin !== window.location.origin ||
                  !match ||
                  u.hash ||
                  u.username ||
                  u.password ||
                  [...u.searchParams.keys()].some((k) => k !== "timeZone") ||
                  u.searchParams.getAll("timeZone").length > 1
                )
                  throw new Error();
                occurrenceId = match[1];
              } catch {
                setEventError(
                  "Paste an event page link from this website without extra options or fragments."
                );
                return;
              }
              write.act({
                operation: "propose-event",
                artistId: id,
                occurrenceId,
                expectedVersion:
                  data.associations.find((a) => a.occurrenceId === occurrenceId)
                    ?.version ?? 0
              });
            }}
          >
            <fieldset disabled={locked} className="space-y-3">
              <label className="block">
                Event page link
                <input
                  required
                  value={eventUrl}
                  onChange={(e) => setEventUrl(e.target.value)}
                  className={artistFieldClass}
                />
              </label>
              <button type="submit" className="gc-button">
                Propose event association
              </button>
            </fieldset>
          </form>
          {eventError && <p role="alert">{eventError}</p>}
          <ul className="space-y-3">
            {data.associations
              .filter((a) => !a.revokedAt)
              .map((a) => (
                <li key={a.id} className="rounded-lg border p-4">
                  <p>
                    {a.acceptedAt
                      ? "Organizer accepted"
                      : "Awaiting organizer acceptance"}
                  </p>
                  <Link
                    prefetch={false}
                    href={`/platform/music/associations/${a.id}`}
                    className="break-all underline"
                  >
                    Organizer review link
                  </Link>
                  <p className="text-sm">
                    Share this link yourself with the event organizer. Access is
                    checked when they open it.
                  </p>
                  <button
                    className="min-h-11 underline"
                    disabled={locked}
                    onClick={() =>
                      write.act({
                        operation: "revoke-event",
                        artistId: id,
                        associationId: a.id,
                        expectedVersion: a.version
                      })
                    }
                  >
                    Revoke event association
                  </button>
                </li>
              ))}
          </ul>
        </>
      )}
    </section>
  );
}
export function ArtistAssociationReview({
  owner,
  id
}: {
  owner: string | null;
  id: string;
}) {
  const { data, error, reload } = useMediaRead<{
      artist: ArtistItem;
      event: { title: string; startLocal: string; location: string } | null;
      association: {
        id: string;
        artistId: string;
        version: number;
        accepted: boolean;
        revoked: boolean;
        expiresAt: string;
      };
    }>(
      `/api/platform/artists?view=association&id=${encodeURIComponent(id)}`,
      owner
    ),
    write = useArtistWrite(owner, `association:${id}`, () => reload());
  return (
    <section className="space-y-4">
      <ArtistNavigation />
      <h1 className="text-3xl font-semibold">
        Review artist event association
      </h1>
      {write.controls}
      {!data ? (
        <ArtistReadNotice error={error} reload={reload} />
      ) : (
        <>
          <h2 className="text-xl font-semibold">{data.artist.name}</h2>
          <p>Proposed for {data.event?.title ?? "Unavailable event"}.</p>
          <p>
            Confirm only the artist&apos;s association with this event. This
            grants no artist editing, account access, event ownership or rights
            verification.
          </p>
          <p>
            {data.association.revoked
              ? "Revoked"
              : data.association.accepted
                ? "Accepted"
                : "Pending acceptance"}
          </p>
          <div className="flex flex-wrap gap-3">
            {!data.association.accepted && !data.association.revoked && (
              <button
                className="gc-button"
                disabled={write.busy || !!write.uncertain}
                onClick={() =>
                  write.act({
                    operation: "accept-event",
                    artistId: data.association.artistId,
                    associationId: id,
                    expectedVersion: data.association.version
                  })
                }
              >
                Accept this event association
              </button>
            )}
            {!data.association.revoked && (
              <button
                className="gc-button-secondary"
                disabled={write.busy || !!write.uncertain}
                onClick={() =>
                  write.act({
                    operation: "revoke-event",
                    artistId: data.association.artistId,
                    associationId: id,
                    expectedVersion: data.association.version
                  })
                }
              >
                Revoke this event association
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
