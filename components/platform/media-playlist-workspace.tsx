"use client";
import Link from "next/link";
import { accountEntryHref } from "@/lib/platform/account-entry";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { SocialClientError, socialRequest } from "@/lib/platform/social-client";
import { mediaFormatNames } from "@/lib/platform/media-catalog-options";
import { useMediaRead, MediaReadNotice } from "./media-catalog-library";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
import { settlePhotoNavigation } from "./use-photo-back-guard";

type Media = { id: string; title: string; format: string; description: string };
type Item = {
  id?: string;
  title?: string;
  state?: string;
  audience?: string;
  version?: number;
  entryId?: string;
  position?: number;
  media?: Media | null;
};
type Playlist = {
  id: string;
  version: number;
  title: string;
  description: string;
  audience: string;
  owner: string;
  state?: string;
  churchOwned?: boolean;
  canPublish?: boolean;
  canManage?: boolean;
  recoveryRequired?: boolean;
  entryIds?: string[];
};
type Snapshot = {
  actorId: string | null;
  view: string;
  items: Item[];
  playlist?: Playlist;
  total?: number;
  nextCursor: string | null;
  churches?: { id: string; name: string }[];
};
const fieldClass =
  "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900";
const endpoint = "/api/platform/media-playlists";

function PlaylistNavigation() {
  return (
    <nav
      aria-label="Media collection navigation"
      className="flex flex-wrap gap-4"
    >
      <Link
        prefetch={false}
        href="/platform/media"
        className="min-h-11 py-2 underline"
      >
        Browse media
      </Link>
      <Link
        prefetch={false}
        href="/platform/media/saved"
        className="min-h-11 py-2 underline"
      >
        Saved media
      </Link>
      <Link
        prefetch={false}
        href="/platform/media/playlists"
        className="min-h-11 py-2 underline"
      >
        Playlists
      </Link>
    </nav>
  );
}

type WorkspaceProps = {
  owner: string | null;
  mode: "saved" | "playlists" | "detail";
  id?: string;
  editing?: boolean;
};
// In-memory, account-and-route-bound receipts survive a scope replacement without
// exposing another account's private draft or persisting it in browser storage.
const pendingWrites = new Map<
  string,
  {
    body: string;
    title: string;
    description: string;
    audience: string;
    church: string;
  }
>();
export function MediaPlaylistWorkspace(props: WorkspaceProps) {
  const scope = JSON.stringify([
    props.owner,
    props.mode,
    props.id,
    !!props.editing
  ]);
  return <PlaylistWorkspace key={scope} {...props} scope={scope} />;
}
function PlaylistWorkspace({
  owner,
  mode,
  id,
  editing = false,
  scope
}: WorkspaceProps & { scope: string }) {
  const retained = pendingWrites.get(scope);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const [tab, setTab] = useState(owner ? "mine" : "public"),
    [cursor, setCursor] = useState<string | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState<string | null>(retained?.body ?? null),
    [removed, setRemoved] = useState(false);
  const [title, setTitle] = useState(retained?.title ?? ""),
    [description, setDescription] = useState(retained?.description ?? ""),
    [audience, setAudience] = useState(retained?.audience ?? "PRIVATE"),
    [church, setChurch] = useState(retained?.church ?? ""),
    [conflict, setConflict] = useState(false),
    [search, setSearch] = useState(""),
    [pickerOpen, setPickerOpen] = useState(false);
  const [anchor, setAnchor] = useState<string | null>(null);
  const dirty = useRef(!!retained),
    baseVersion = useRef<number | null>(null),
    focusedEntry = useRef<string | null>(null),
    itemsRegion = useRef<HTMLDivElement>(null);
  const view =
    mode === "saved"
      ? "saved"
      : mode === "detail"
        ? editing
          ? "editor"
          : "detail"
        : tab;
  const query = new URLSearchParams({
    view,
    ...(id ? { id } : {}),
    ...(cursor ? { cursor } : {}),
    ...(anchor ? { anchor } : {})
  });
  const { data, error, reload } = useMediaRead<Snapshot>(
    endpoint + "?" + query.toString(),
    owner
  );
  const p = data?.playlist;
  useUnsavedSocialWork(
    { dirty: dirty.current && !removed, saving: busy || !!uncertain, conflict },
    () =>
      setMessage(
        "Save or discard your unsent playlist changes before leaving."
      ),
    true
  );
  useEffect(() => {
    if (!p || !editing) return;
    if (dirty.current) {
      if (baseVersion.current !== p.version) setConflict(true);
      return;
    }
    setTitle(p.title);
    setDescription(p.description);
    setAudience(p.audience);
    baseVersion.current = p.version;
    setConflict(false);
  }, [p, editing]);
  useEffect(() => {
    if (data && !busy && focusedEntry.current) {
      const button = Array.from(
        itemsRegion.current?.querySelectorAll<HTMLButtonElement>(
          "button[data-entry]"
        ) ?? []
      ).find((b) => b.dataset.entry === focusedEntry.current && !b.disabled);
      button?.focus();
      focusedEntry.current = null;
    }
  }, [data, busy]);
  const resetFields = () => {
    if (!p) {
      dirty.current = false;
      setTitle("");
      setDescription("");
      setAudience(church ? "CHURCH" : "PRIVATE");
      setConflict(false);
      return;
    }
    dirty.current = false;
    baseVersion.current = p.version;
    setTitle(p.title);
    setDescription(p.description);
    setAudience(p.audience);
    setConflict(false);
  };
  const submit = async (body: string) => {
    if (!owner || busy) return;
    setBusy(true);
    setMessage("");
    pendingWrites.set(scope, { body, title, description, audience, church });
    try {
      const result = await socialRequest<{
        id: string;
        version: number;
        message: string;
      }>(endpoint, body, owner);
      if (!live.current) return;
      pendingWrites.delete(scope);
      const op = JSON.parse(body).operation;
      setUncertain(null);
      setMessage(result.data.message);
      dirty.current = false;
      baseVersion.current = null;
      setConflict(false);
      if (op === "create") {
        flushSync(() => {
          setBusy(false);
          setUncertain(null);
          setConflict(false);
        });
        await settlePhotoNavigation();
        if (!live.current) return;
        window.location.assign(
          `/platform/media/playlists/${encodeURIComponent(result.data.id)}?edit=1`
        );
        return;
      }
      if (op === "remove") {
        setRemoved(true);
        return;
      }
      if (editing) {
        const requested = JSON.parse(body);
        const nextAnchor =
          focusedEntry.current ??
          (requested.operation === "remove-entry"
            ? p?.entryIds?.find((entry) => entry !== requested.entryId)
            : data?.items[0]?.entryId) ??
          null;
        setCursor(null);
        setAnchor(nextAnchor);
      }
      reload();
    } catch (e) {
      if (!live.current) return;
      if (
        e instanceof SocialClientError &&
        e.status < 500 &&
        e.status !== 401 &&
        !uncertain
      ) {
        pendingWrites.delete(scope);
        setUncertain(null);
        setMessage(e.message);
        if (e.status === 409) {
          if (editing) setConflict(true);
          reload();
        }
      } else {
        // A denial before receipt lookup cannot disprove an earlier commit.
        // Preserve the original body until the original owner reconciles it.
        setUncertain(body);
        setMessage(
          "This change could not be confirmed. Return to this account and retry the same change to check its result."
        );
        reload();
      }
    } finally {
      if (live.current) setBusy(false);
    }
  };
  const act = (operation: string, extra: Record<string, unknown> = {}) => {
    if (uncertain || busy) return;
    void submit(
      JSON.stringify({
        operation,
        mutationId: crypto.randomUUID(),
        ...(p ? { playlistId: p.id, expectedVersion: p.version } : {}),
        ...extra
      })
    );
  };
  const stopRetrying = () => {
    if (busy || !uncertain) return;
    if (
      !window.confirm(
        "The earlier change may already have completed. Stop retrying and discard the local pending changes? This does not undo saved changes. Review the current state before making another change."
      )
    )
      return;
    // An explicit local abandonment is not a claim that the server write failed.
    // Clear only this account/route's pending request; never issue a replacement.
    pendingWrites.delete(scope);
    setUncertain(null);
    dirty.current = false;
    baseVersion.current = null;
    focusedEntry.current = null;
    setTitle("");
    setDescription("");
    setAudience("PRIVATE");
    setChurch("");
    setConflict(false);
    setPickerOpen(false);
    setSearch("");
    setCursor(null);
    setAnchor(null);
    setMessage(
      "Stopped retrying. The earlier change may have completed. Review the current saved state before making another change."
    );
    reload();
  };
  const editField = () => {
    dirty.current = true;
  };
  const dirtyControls = busy || !!uncertain || conflict;
  const order = (entryId: string, direction: number) => {
    if (!p?.entryIds) return;
    const ids = [...p.entryIds],
      at = ids.indexOf(entryId),
      next = at + direction;
    if (at < 0 || next < 0 || next >= ids.length) return;
    [ids[at], ids[next]] = [ids[next], ids[at]];
    focusedEntry.current = entryId;
    act("reorder", { entryIds: ids });
  };
  const controls = (
    <div className="flex flex-wrap gap-3">
      <label className="min-w-40 flex-1">
        Playlist title
        <input
          className={fieldClass}
          disabled={busy || !!uncertain}
          value={title}
          maxLength={160}
          required
          onChange={(e) => {
            editField();
            setTitle(e.target.value);
          }}
        />
      </label>
      <label className="w-full">
        Description
        <textarea
          aria-label="Description"
          className={fieldClass}
          disabled={busy || !!uncertain}
          value={description}
          maxLength={2000}
          rows={3}
          onChange={(e) => {
            editField();
            setDescription(e.target.value);
          }}
        />
      </label>
      <label className="min-w-44 flex-1">
        Playlist audience
        <select
          className={fieldClass}
          disabled={busy || !!uncertain}
          value={audience}
          onChange={(e) => {
            editField();
            setAudience(e.target.value);
          }}
        >
          {p?.churchOwned || church ? (
            <option value="CHURCH">This church</option>
          ) : (
            <option value="PRIVATE">Only me</option>
          )}
          <option value="MEMBERS">Eligible signed-in members</option>
          <option value="PUBLIC">Public</option>
        </select>
      </label>
      <p className="w-full text-sm">
        Each recording keeps its own audience. Publishing this playlist never
        makes private media public.
      </p>
    </div>
  );
  return (
    <section className="space-y-5">
      <PlaylistNavigation />
      <header>
        <h1 className="text-3xl font-semibold">
          {mode === "saved"
            ? "Saved media"
            : mode === "detail"
              ? editing
                ? "Edit playlist"
                : "Playlist"
              : "Playlists"}
        </h1>
        <p className="mt-2">
          {mode === "saved"
            ? "Keep recordings privately and organize them in finite playlists. Unsaving leaves your playlists unchanged."
            : "Choose an item deliberately. There is no automatic playback or unrelated queue."}
        </p>
        <p className="mt-2 text-sm">
          Playback progress is unavailable for these external sources. Open a
          recording to visit its provider.
        </p>
      </header>
      {message && (
        <p role="status" className="rounded-lg border p-3">
          {message}
        </p>
      )}
      {uncertain && (
        <div className="rounded-lg border p-3">
          <button
            className="gc-button"
            disabled={busy}
            onClick={() => void submit(uncertain)}
          >
            Retry same change
          </button>
          <button
            className="gc-button gc-button-quiet ml-3"
            disabled={busy}
            onClick={stopRetrying}
          >
            Stop retrying and reload
          </button>
          <p className="mt-2 text-sm">
            Other changes stay paused until this result is confirmed or you
            deliberately stop retrying. Your entered values are retained until
            then. Stopping does not undo a change that already completed.
          </p>
        </div>
      )}
      {removed ? (
        <p>
          Playlist removed.{" "}
          <Link
            prefetch={false}
            href="/platform/media/playlists"
            className="underline"
          >
            Return to playlists
          </Link>
        </p>
      ) : !owner && (mode === "saved" || editing) ? (
        <p>
          <Link
            className="underline"
            href={accountEntryHref(
              "login",
              mode === "saved"
                ? "/platform/media/saved"
                : id
                  ? `/platform/media/playlists/${encodeURIComponent(id)}?edit=1`
                  : "/platform/media/playlists",
              "account"
            )}
          >
            Sign in
          </Link>{" "}
          to manage your private media collections.
        </p>
      ) : !data ? (
        <>
          <MediaReadNotice error={error} reload={reload} />
          {(cursor || anchor) && (
            <button
              className="gc-button gc-button-quiet"
              disabled={busy || !!uncertain}
              onClick={() => {
                setCursor(null);
                setAnchor(null);
              }}
            >
              Return to first page
            </button>
          )}
        </>
      ) : (
        <>
          {dirty.current && (
            <button
              className="gc-button gc-button-quiet"
              disabled={busy || !!uncertain}
              onClick={resetFields}
            >
              Discard unsent changes
            </button>
          )}
          {mode === "playlists" && (
            <div
              role="group"
              aria-label="Playlist views"
              className="flex flex-wrap gap-3"
            >
              {owner && (
                <button
                  className="gc-button gc-button-quiet"
                  aria-pressed={tab === "mine"}
                  onClick={() => {
                    setTab("mine");
                    setCursor(null);
                  }}
                >
                  Your playlists
                </button>
              )}
              <button
                className="gc-button gc-button-quiet"
                aria-pressed={tab === "public"}
                onClick={() => {
                  setTab("public");
                  setCursor(null);
                }}
              >
                Browse playlists
              </button>
            </div>
          )}
          {mode === "playlists" && tab === "mine" && (
            <form
              className="space-y-3 rounded-xl border p-4"
              aria-label="Create playlist"
              onSubmit={(e) => {
                e.preventDefault();
                act("create", {
                  ownerChurchId: church || null,
                  fields: { title, description, audience }
                });
              }}
            >
              <h2 className="text-xl font-semibold">Create a private draft</h2>
              <label>
                Playlist owner
                <select
                  className={fieldClass}
                  disabled={busy || !!uncertain}
                  value={church}
                  onChange={(e) => {
                    setChurch(e.target.value);
                    setAudience(e.target.value ? "CHURCH" : "PRIVATE");
                  }}
                >
                  <option value="">My account</option>
                  {data.churches?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {controls}
              <button className="gc-button" disabled={dirtyControls}>
                Create playlist
              </button>
            </form>
          )}
          {p && (
            <header className="rounded-xl border p-4">
              <h2 className="text-2xl font-semibold">
                {p.title || "Recovered playlist"}
              </h2>
              <p className="mt-2">
                By {p.owner} · {p.audience.toLowerCase()}
                {p.state ? ` · ${p.state.toLowerCase()}` : ""}
              </p>
              {!editing && (
                <p className="mt-2 whitespace-pre-wrap">{p.description}</p>
              )}
              {!editing && p.canManage && (
                <Link
                  className="mt-3 inline-block min-h-11 py-2 underline"
                  prefetch={false}
                  href={`/platform/media/playlists/${encodeURIComponent(p.id)}?edit=1`}
                >
                  Manage this playlist
                </Link>
              )}
              {editing && (
                <Link
                  className="mt-3 inline-block min-h-11 py-2 underline"
                  prefetch={false}
                  href={`/platform/media/playlists/${encodeURIComponent(p.id)}`}
                >
                  View published playlist
                </Link>
              )}
            </header>
          )}
          {editing && p && (
            <form
              className="space-y-4 rounded-xl border p-4"
              aria-label="Playlist details"
              onSubmit={(e) => {
                e.preventDefault();
                act("update", {
                  expectedVersion: baseVersion.current,
                  fields: { title, description, audience }
                });
              }}
            >
              {p.recoveryRequired && (
                <p role="status">
                  This recovered playlist needs review. Its former items and
                  public visibility have not been restored.
                </p>
              )}
              {controls}
              {conflict && (
                <div role="alert">
                  <p>
                    The playlist changed. Your entered values are still here.
                    Review the current version before making another change.
                  </p>
                  <button
                    className="gc-button gc-button-quiet mt-2"
                    type="button"
                    onClick={resetFields}
                  >
                    Use current saved details
                  </button>
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                <button className="gc-button" disabled={dirtyControls}>
                  Save details
                </button>
                {p.canPublish && (
                  <>
                    <button
                      className="gc-button"
                      type="button"
                      disabled={dirtyControls}
                      onClick={() =>
                        act("publish", {
                          expectedVersion: baseVersion.current,
                          fields: { title, description, audience }
                        })
                      }
                    >
                      Publish playlist
                    </button>
                    <button
                      className="gc-button gc-button-quiet"
                      type="button"
                      disabled={busy || !!uncertain || dirty.current}
                      onClick={() => act("unpublish")}
                    >
                      Unpublish
                    </button>
                    <button
                      className="gc-button gc-button-quiet"
                      type="button"
                      disabled={busy || !!uncertain || dirty.current}
                      onClick={() => {
                        if (
                          confirm(
                            "Remove this playlist? Its source recordings and saved media remain."
                          )
                        )
                          act("remove");
                      }}
                    >
                      Remove playlist
                    </button>
                  </>
                )}
              </div>
            </form>
          )}
          {(mode === "saved" || editing) && owner && (
            <div className="space-y-3">
              <button
                className="gc-button gc-button-quiet"
                disabled={
                  busy ||
                  !!uncertain ||
                  (editing && (dirty.current || !!p?.recoveryRequired))
                }
                onClick={() => setPickerOpen((v) => !v)}
              >
                {pickerOpen ? "Close media picker" : "Find media to add"}
              </button>
              {pickerOpen && (
                <MediaPicker
                  owner={owner}
                  search={search}
                  setSearch={setSearch}
                  blocked={
                    busy ||
                    !!uncertain ||
                    conflict ||
                    (editing && dirty.current)
                  }
                  onChoose={(mediaId) =>
                    act(editing ? "add" : "save-media", { mediaId })
                  }
                />
              )}
            </div>
          )}
          {typeof data.total === "number" && (
            <p role="status">
              {data.total} {data.total === 1 ? "item" : "items"}
              {editing ? " in this playlist" : " available"}
            </p>
          )}
          {!data.items.length ? (
            <p className="rounded-xl border p-5">
              {mode === "saved"
                ? "No saved media yet. Find a recording to save privately."
                : p
                  ? "No available items on this page. You can return to the first page or add currently available media when editing."
                  : "No playlists in this view yet."}
            </p>
          ) : (
            <div ref={itemsRegion} className="space-y-3">
              {data.items.map((item, index) => {
                const media = item.media;
                const key =
                  item.entryId ?? item.id ?? media?.id ?? String(index);
                return (
                  <article key={key} className="rounded-xl border bg-white p-4">
                    {mode === "playlists" ? (
                      <>
                        <h2 className="text-xl font-semibold">
                          <Link
                            className="underline"
                            prefetch={false}
                            href={`/platform/media/playlists/${encodeURIComponent(item.id!)}${tab === "mine" ? "?edit=1" : ""}`}
                          >
                            {item.title || "Recovered playlist"}
                          </Link>
                        </h2>
                        <p className="mt-2 text-sm">
                          {item.audience?.toLowerCase()}
                          {item.state ? ` · ${item.state.toLowerCase()}` : ""}
                        </p>
                      </>
                    ) : (
                      <>
                        <h3 className="text-lg font-semibold">
                          {item.position ? `${item.position}. ` : ""}
                          {media ? (
                            <Link
                              className="underline"
                              prefetch={false}
                              href={`/platform/media/${encodeURIComponent(media.id)}`}
                            >
                              {media.title}
                            </Link>
                          ) : (
                            "Item unavailable"
                          )}
                        </h3>
                        <p className="mt-2 text-sm">
                          {media
                            ? mediaFormatNames[
                                media.format as keyof typeof mediaFormatNames
                              ]
                            : "This reference no longer provides media details. You may remove it or choose a later item."}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-3">
                          {mode === "saved" && (
                            <button
                              className="gc-button gc-button-quiet"
                              disabled={busy || !!uncertain}
                              onClick={() =>
                                act("unsave-media", {
                                  savedId: item.id,
                                  expectedVersion: item.version
                                })
                              }
                            >
                              Unsave
                            </button>
                          )}
                          {editing && p && item.entryId && (
                            <>
                              <button
                                className="gc-button gc-button-quiet"
                                data-entry={item.entryId}
                                disabled={
                                  busy ||
                                  !!uncertain ||
                                  dirty.current ||
                                  conflict ||
                                  p.entryIds?.[0] === item.entryId
                                }
                                aria-label={`Move item ${item.position} up`}
                                onClick={() => order(item.entryId!, -1)}
                              >
                                Move up
                              </button>
                              <button
                                className="gc-button gc-button-quiet"
                                data-entry={item.entryId}
                                disabled={
                                  busy ||
                                  !!uncertain ||
                                  dirty.current ||
                                  conflict ||
                                  p.entryIds?.at(-1) === item.entryId
                                }
                                aria-label={`Move item ${item.position} down`}
                                onClick={() => order(item.entryId!, 1)}
                              >
                                Move down
                              </button>
                              <button
                                className="gc-button gc-button-quiet"
                                data-entry={item.entryId}
                                disabled={
                                  busy ||
                                  !!uncertain ||
                                  dirty.current ||
                                  conflict
                                }
                                onClick={() => {
                                  const at =
                                    p.entryIds?.indexOf(item.entryId!) ?? -1;
                                  focusedEntry.current =
                                    p.entryIds?.[at + 1] ??
                                    p.entryIds?.[at - 1] ??
                                    null;
                                  act("remove-entry", {
                                    entryId: item.entryId
                                  });
                                }}
                              >
                                Remove from playlist
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            {(cursor || anchor) && (
              <button
                className="gc-button gc-button-quiet"
                disabled={busy || !!uncertain}
                onClick={() => {
                  setCursor(null);
                  setAnchor(null);
                }}
              >
                First page
              </button>
            )}
            {data.nextCursor && (
              <button
                className="gc-button gc-button-quiet"
                disabled={busy || !!uncertain}
                onClick={() => {
                  setAnchor(null);
                  setCursor(data.nextCursor);
                }}
              >
                Next page
              </button>
            )}
            <button
              className="gc-button gc-button-quiet"
              disabled={busy}
              onClick={reload}
            >
              Refresh current access
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function MediaPicker({
  owner,
  search,
  setSearch,
  blocked,
  onChoose
}: {
  owner: string;
  search: string;
  setSearch: (value: string) => void;
  blocked: boolean;
  onChoose: (id: string) => void;
}) {
  const [cursor, setCursor] = useState<string | null>(null);
  const { data, error, reload } = useMediaRead<{
    items: Media[];
    nextCursor: string | null;
  }>(
    endpoint +
      "?" +
      new URLSearchParams({
        view: "pick",
        q: search,
        ...(cursor ? { cursor } : {})
      }),
    owner
  );
  return (
    <section
      className="space-y-3 rounded-xl border p-4"
      aria-label="Choose media"
    >
      <h2 className="text-xl font-semibold">
        Choose currently available media
      </h2>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(String(new FormData(e.currentTarget).get("q") ?? ""));
          setCursor(null);
        }}
      >
        <label className="flex-1">
          Media title
          <input
            name="q"
            className={fieldClass}
            maxLength={160}
            defaultValue={search}
          />
        </label>
        <button className="gc-button gc-button-quiet">Search media</button>
      </form>
      {!data ? (
        <MediaReadNotice error={error} reload={reload} />
      ) : (
        <>
          {!data.items.length && (
            <p>No matching media is currently available.</p>
          )}
          {data.items.map((item) => (
            <article
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="text-sm">
                  {
                    mediaFormatNames[
                      item.format as keyof typeof mediaFormatNames
                    ]
                  }
                </p>
              </div>
              <button
                className="gc-button gc-button-quiet"
                disabled={blocked}
                onClick={() => onChoose(item.id)}
              >
                Add this recording
              </button>
            </article>
          ))}
          <div className="flex gap-3">
            {cursor && (
              <button
                className="gc-button gc-button-quiet"
                onClick={() => setCursor(null)}
              >
                First media page
              </button>
            )}
            {data.nextCursor && (
              <button
                className="gc-button gc-button-quiet"
                onClick={() => setCursor(data.nextCursor)}
              >
                More media
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
