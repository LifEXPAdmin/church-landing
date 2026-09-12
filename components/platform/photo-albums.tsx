"use client";
/* eslint-disable @next/next/no-img-element -- Current-access media bypasses the shared optimizer. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { PhotoAlbumsView } from "@/lib/platform/photo-albums";
import type { readPersonalPhotos } from "@/lib/platform/personal-photos";
import type { PostComposerOptions } from "@/lib/platform/post-editor";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import {
  portalButtonClass as button,
  portalInputClass as input
} from "./portal-action-form";
import { PhotoViewer } from "./photo-viewer";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
type Album = NonNullable<PhotoAlbumsView["album"]>;
type Entry = NonNullable<PhotoAlbumsView["editing"]>[number];
type Library = Awaited<ReturnType<typeof readPersonalPhotos>>;
type Draft = {
  name: string;
  audience: string;
  audienceChurchId: string;
  coverAssetId: string;
  photos: Entry[];
  version: number;
};
const snapshot = (album: Album | null, photos: Entry[]): Draft => ({
  name: album?.name ?? "",
  audience: album?.audience ?? "ONLY_ME",
  audienceChurchId: album?.audienceChurchId ?? "",
  coverAssetId: album?.coverAssetId ?? "",
  photos,
  version: album?.version ?? 0
});
const labels: Record<string, string> = {
  ONLY_ME: "Only me",
  MEMBERS: "Signed-in members",
  CHURCH: "Approved church members"
};
const serial = (draft: Draft) =>
  JSON.stringify({
    ...draft,
    photos: draft.photos.map(({ id, photoVersion, imageVersion }) => ({
      id,
      photoVersion,
      imageVersion
    }))
  });
function AlbumEditor({
  album,
  initialPhotos,
  ownerId,
  churches,
  done,
  onWork
}: {
  album: Album | null;
  initialPhotos: Entry[];
  ownerId: string;
  churches: PostComposerOptions["churches"];
  done: (id?: string) => void;
  onWork: (pending: boolean) => void;
}) {
  const [baseline, setBaseline] = useState(() =>
      snapshot(album, initialPhotos)
    ),
    [draft, setDraft] = useState(() => snapshot(album, initialPhotos));
  const [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(false),
    [message, setMessage] = useState(""),
    [deleting, setDeleting] = useState(false),
    [latest, setLatest] = useState<PhotoAlbumsView | null>(null);
  const [picker, setPicker] = useState<Library | null>(null),
    [picking, setPicking] = useState(false),
    [pickerPages, setPickerPages] = useState<(string | null)[]>([null]),
    [pickerBusy, setPickerBusy] = useState(false);
  const [previews, setPreviews] = useState<
    Map<string, NonNullable<Entry["image"]>>
  >(new Map());
  const photoIds = draft.photos
    .map((photo) => photo.id)
    .sort()
    .join(",");
  useEffect(() => {
    let sequence = 0;
    const conceal = () => {
      sequence++;
      setPreviews(new Map());
      setPicker(null);
      setPicking(false);
    };
    const restore = async () => {
      if (document.visibilityState === "hidden") return;
      const turn = ++sequence;
      setPreviews(new Map());
      const ids = photoIds ? photoIds.split(",") : [];
      try {
        const pages: Library[] = [];
        for (let index = 0; index < ids.length; index += 10) {
          const result = await socialRequest<Library>(
            `/api/platform/photos?profileId=${encodeURIComponent(ownerId)}&ids=${encodeURIComponent(ids.slice(index, index + 10).join(","))}`,
            undefined,
            ownerId
          );
          if (turn !== sequence) return;
          pages.push(result.data);
        }
        if (turn === sequence)
          setPreviews(
            new Map(
              pages.flatMap((page) =>
                page.images.map((image) => [image.id, image] as const)
              )
            )
          );
      } catch {
        if (turn === sequence) setPreviews(new Map());
      }
    };
    const refresh = () => {
      void restore();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? conceal() : refresh();
    refresh();
    window.addEventListener("blur", conceal);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("social-relationships-changed", refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      sequence++;
      window.removeEventListener("blur", conceal);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("social-relationships-changed", refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [photoIds, ownerId]);
  const pending = useRef<string | null>(null),
    lock = useRef(false);
  const dirty = serial(draft) !== serial(baseline),
    working = dirty || busy || retry;
  useEffect(() => {
    onWork(working);
    return () => onWork(false);
  }, [working, onWork]);
  useUnsavedSocialWork(
    { dirty, saving: busy, conflict: retry },
    () => setMessage("Save or discard your album changes before leaving."),
    true
  );
  function change(fields: Partial<Draft>) {
    setDraft((value) => ({ ...value, ...fields }));
  }
  async function loadPicker(after: string | null = null) {
    setPickerBusy(true);
    try {
      const result = await socialRequest<Library>(
        `/api/platform/photos?profileId=${encodeURIComponent(ownerId)}${after ? `&after=${encodeURIComponent(after)}` : ""}`,
        undefined,
        ownerId
      );
      setPicker(result.data);
      setPicking(true);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Your saved photos could not be checked."
      );
    } finally {
      setPickerBusy(false);
    }
  }
  async function command(operation: "save" | "delete" | "create") {
    if (lock.current) return;
    if (!pending.current)
      pending.current = JSON.stringify({
        operation,
        mutationId: crypto.randomUUID(),
        ...(album ? { id: album.id } : {}),
        expectedVersion: draft.version,
        ...(operation === "delete"
          ? { confirmed: true }
          : {
              name: draft.name,
              audience: draft.audience,
              audienceChurchId:
                draft.audience === "CHURCH" ? draft.audienceChurchId : null,
              ...(operation === "save"
                ? {
                    coverAssetId: draft.coverAssetId || null,
                    photos: draft.photos.map(
                      ({ id, photoVersion, imageVersion }) => ({
                        id,
                        photoVersion,
                        imageVersion
                      })
                    )
                  }
                : {})
            })
      });
    lock.current = true;
    setBusy(true);
    setMessage("Saving album…");
    try {
      const result = await socialRequest<{ id: string; message: string }>(
        "/api/platform/photo-albums",
        pending.current,
        ownerId
      );
      pending.current = null;
      setRetry(false);
      setMessage(result.data.message);
      done(operation === "delete" ? undefined : result.data.id);
    } catch (error) {
      setRetry(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "The save was not confirmed. Retry the unchanged album request."
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function reviewLatest() {
    if (!album || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const result = await socialRequest<PhotoAlbumsView>(
        `/api/platform/photo-albums?profileId=${encodeURIComponent(ownerId)}&id=${encodeURIComponent(album.id)}&edit=true`,
        undefined,
        ownerId
      );
      setLatest(result.data);
      setMessage(
        "Review the latest saved album before keeping your edits or discarding them."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The current album could not be checked."
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function keepEdits() {
    if (!latest?.album || !latest.editing) return;
    const now = snapshot(latest.album, latest.editing);
    setBaseline(now);
    setDraft((value) => ({
      ...value,
      version: now.version,
      photos: value.photos.map(
        (photo) =>
          now.photos.find((current) => current.id === photo.id) ?? photo
      )
    }));
    pending.current = null;
    setRetry(false);
    setLatest(null);
    setMessage(
      "Your edits are kept with the latest saved album. Review the photos and save when ready."
    );
  }
  return (
    <section
      aria-label="Edit photo album"
      className="space-y-4 rounded-xl border-2 border-gc-accent p-4"
      aria-busy={busy}
    >
      <h3 className="text-2xl">{album ? "Edit album" : "Create album"}</h3>
      <p>
        Albums reuse your saved photos. Their audience can only narrow each
        photo&apos;s source access.
      </p>
      <p role="status">{message}</p>
      <fieldset disabled={busy || retry} className="space-y-4">
        <label className="block">
          Album name
          <input
            className={input}
            value={draft.name}
            maxLength={100}
            onChange={(event) => change({ name: event.target.value })}
          />
        </label>
        <label className="block">
          Album audience
          <select
            className={input}
            aria-label="Album audience"
            value={draft.audience}
            onChange={(event) =>
              change({ audience: event.target.value, audienceChurchId: "" })
            }
          >
            <option value="ONLY_ME">Only me</option>
            <option value="MEMBERS">Signed-in members</option>
            <option value="CHURCH" disabled={!churches.length}>
              Approved church members
            </option>
          </select>
        </label>
        {draft.audience === "CHURCH" && (
          <label className="block">
            Album church
            <select
              className={input}
              aria-label="Album church"
              value={draft.audienceChurchId}
              onChange={(event) =>
                change({ audienceChurchId: event.target.value })
              }
            >
              <option value="">Choose a church</option>
              {churches.map((church) => (
                <option key={church.id} value={church.id}>
                  {church.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {album && (
          <>
            <p>
              {draft.photos.length} of 100 album photos. Save new files with Add
              photos in your library first.
            </p>
            <button
              type="button"
              className={button}
              disabled={pickerBusy}
              onClick={() => {
                setPickerPages([null]);
                void loadPicker();
              }}
            >
              Choose saved photos
            </button>
            {picking && (
              <section aria-label="Choose album photos" className="space-y-3">
                <h4 className="text-xl">Choose saved photos</h4>
                <p>
                  {picker?.total ?? 0} photos available · page{" "}
                  {pickerPages.length}
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {picker?.images.map((photo) => {
                    const selected = draft.photos.some(
                      (entry) => entry.id === photo.id
                    );
                    return (
                      <button
                        key={photo.id}
                        type="button"
                        className="min-w-0 rounded-lg border border-gc-divider p-2"
                        disabled={
                          selected || draft.photos.length >= 100 || pickerBusy
                        }
                        onClick={() =>
                          change({
                            photos: [
                              ...draft.photos,
                              {
                                id: photo.id,
                                photoVersion: photo.photoVersion,
                                imageVersion: photo.version,
                                image: photo
                              }
                            ]
                          })
                        }
                      >
                        <img
                          src={photo.variants.thumb.url}
                          alt={photo.alt || "Saved photo"}
                          width={photo.variants.thumb.width}
                          height={photo.variants.thumb.height}
                          loading="lazy"
                          className="aspect-square w-full object-cover"
                        />
                        <span>
                          {selected ? "Added to album" : "Add to album"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {!picker?.images.length && !pickerBusy && (
                  <p>No saved photos are available on this page.</p>
                )}
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className={button}
                    disabled={pickerBusy || pickerPages.length <= 1}
                    onClick={() => {
                      const pages = pickerPages.slice(0, -1);
                      setPickerPages(pages);
                      void loadPicker(pages.at(-1) ?? null);
                    }}
                  >
                    Previous saved photos
                  </button>
                  <button
                    type="button"
                    className={button}
                    disabled={pickerBusy || !picker?.nextCursor}
                    onClick={() => {
                      const after = picker!.nextCursor!;
                      setPickerPages([...pickerPages, after]);
                      void loadPicker(after);
                    }}
                  >
                    More saved photos
                  </button>
                  <button
                    type="button"
                    className={button}
                    onClick={() => setPicking(false)}
                  >
                    Close photo picker
                  </button>
                </div>
              </section>
            )}
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="album-cover"
                checked={!draft.coverAssetId}
                onChange={() => change({ coverAssetId: "" })}
              />
              Use the first readable photo as cover
            </label>
            <ol className="space-y-3">
              {draft.photos.map((row, index) => {
                const photo = { ...row, image: previews.get(row.id) ?? null };
                return (
                  <li
                    key={photo.id}
                    className="space-y-2 rounded-lg border border-gc-divider p-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {photo.image ? (
                        <img
                          src={photo.image.variants.thumb.url}
                          width={72}
                          height={72}
                          alt={photo.image.alt || `Album photo ${index + 1}`}
                          className="h-18 w-18 max-w-[72px] object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="text-gc-muted">Photo unavailable</span>
                      )}
                      <span>Photo {index + 1}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={button}
                        disabled={index === 0}
                        aria-label={`Move photo ${index + 1} earlier`}
                        onClick={() => {
                          const photos = [...draft.photos];
                          [photos[index - 1], photos[index]] = [
                            photos[index],
                            photos[index - 1]
                          ];
                          change({ photos });
                        }}
                      >
                        Earlier
                      </button>
                      <button
                        type="button"
                        className={button}
                        disabled={index === draft.photos.length - 1}
                        aria-label={`Move photo ${index + 1} later`}
                        onClick={() => {
                          const photos = [...draft.photos];
                          [photos[index + 1], photos[index]] = [
                            photos[index],
                            photos[index + 1]
                          ];
                          change({ photos });
                        }}
                      >
                        Later
                      </button>
                      <button
                        type="button"
                        className={button}
                        aria-label={`Remove photo ${index + 1} from album`}
                        onClick={() =>
                          change({
                            photos: draft.photos.filter(
                              (entry) => entry.id !== photo.id
                            ),
                            ...(draft.coverAssetId === photo.id
                              ? { coverAssetId: "" }
                              : {})
                          })
                        }
                      >
                        Remove from album
                      </button>
                    </div>
                    <label className="flex min-h-11 items-center gap-2">
                      <input
                        type="radio"
                        name="album-cover"
                        disabled={!photo.image}
                        checked={draft.coverAssetId === photo.id}
                        onChange={() => change({ coverAssetId: photo.id })}
                      />
                      Use photo {index + 1} as cover
                    </label>
                  </li>
                );
              })}
            </ol>
            {!draft.photos.length && (
              <p>This album is empty. Choose saved photos to start it.</p>
            )}
          </>
        )}
        <button
          type="button"
          className={button}
          disabled={
            !draft.name.trim() ||
            (draft.audience === "CHURCH" && !draft.audienceChurchId)
          }
          onClick={() => void command(album ? "save" : "create")}
        >
          {album ? "Save album" : "Create album"}
        </button>
        {album && (
          <button
            type="button"
            className={button}
            onClick={() => setDeleting(true)}
          >
            Delete album
          </button>
        )}
        {deleting && (
          <div className="space-y-2">
            <p>
              Delete this album? Its photos stay in your library and source
              posts.
            </p>
            <button
              type="button"
              className={button}
              onClick={() => void command("delete")}
            >
              Confirm delete album
            </button>
            <button
              type="button"
              className={button}
              onClick={() => setDeleting(false)}
            >
              Keep album
            </button>
          </div>
        )}
      </fieldset>
      {retry && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={() => void command(album ? "save" : "create")}
          >
            Retry unchanged album save
          </button>
          {album && (
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() => void reviewLatest()}
            >
              Review latest saved album
            </button>
          )}
        </div>
      )}
      {latest?.album && (
        <aside className="space-y-3 rounded-lg border border-gc-divider p-3">
          <p>
            Latest saved: {latest.album.name} · {labels[latest.album.audience]}{" "}
            · {latest.editing?.length ?? 0} photos.
          </p>
          <p>
            Keeping your edits replaces this album&apos;s saved name, audience,
            cover and order with the choices shown above.
          </p>
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={keepEdits}
          >
            Keep my album edits
          </button>
        </aside>
      )}
      <button
        type="button"
        className={button}
        disabled={busy}
        onClick={() => done(album?.id)}
      >
        {working ? "Discard local album changes" : "Close album editor"}
      </button>
    </section>
  );
}
export function PhotoAlbums({
  profileId,
  ownerId,
  preview,
  churches,
  available
}: {
  profileId: string;
  ownerId: string;
  preview: boolean;
  churches: PostComposerOptions["churches"];
  available: boolean;
}) {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [editing, setEditing] = useState(false),
    [creating, setCreating] = useState(false),
    [pages, setPages] = useState<(string | null)[]>([null]);
  const [data, setData] = useState<PhotoAlbumsView | null>(null),
    [visible, setVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [refresh, setRefresh] = useState(0),
    [working, setWorking] = useState(false),
    [photo, setPhoto] = useState<string | null>(null);
  const generation = useRef(0);
  const source = `/api/platform/photo-albums?${new URLSearchParams({ profileId, ...(selected ? { id: selected } : {}), ...(pages.at(-1) ? { after: pages.at(-1)! } : {}), ...(preview ? { preview: "member" } : {}) })}`;
  const load = useCallback(async () => {
    if (!open) return;
    const turn = ++generation.current;
    setVisible(false);
    setBusy(true);
    try {
      const result = await socialRequest<PhotoAlbumsView>(
        source + (editing ? "&edit=true" : ""),
        undefined,
        ownerId
      );
      if (turn !== generation.current) return;
      setData(result.data);
      setVisible(true);
      setMessage("");
      if (!result.data.canManage) {
        setEditing(false);
        setCreating(false);
        setWorking(false);
      }
    } catch (error) {
      if (turn !== generation.current) return;
      setVisible(false);
      setMessage(
        error instanceof Error
          ? error.message
          : "Albums could not be checked. Reconnect and try again."
      );
      if (error instanceof SocialClientError && error.status === 401) {
        setData(null);
        setEditing(false);
        setCreating(false);
        setWorking(false);
        setPhoto(null);
      }
    } finally {
      if (turn === generation.current) setBusy(false);
    }
  }, [open, source, editing, ownerId]);
  useEffect(() => {
    const conceal = () => {
      generation.current++;
      setVisible(false);
    };
    const restore = () => {
      if (document.visibilityState !== "hidden") void load();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? conceal() : restore();
    restore();
    window.addEventListener("blur", conceal);
    window.addEventListener("focus", restore);
    window.addEventListener("online", restore);
    window.addEventListener("social-relationships-changed", restore);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      conceal();
      window.removeEventListener("blur", conceal);
      window.removeEventListener("focus", restore);
      window.removeEventListener("online", restore);
      window.removeEventListener("social-relationships-changed", restore);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load, refresh]);
  const done = useCallback((id?: string) => {
    setEditing(false);
    setCreating(false);
    setWorking(false);
    setSelected(id ?? null);
    setPages([null]);
    setRefresh((value) => value + 1);
  }, []);
  if (!available && !open) return null;
  return (
    <section
      aria-label="Named photo albums"
      className="space-y-4 border-t border-gc-divider pt-5"
    >
      <h3 className="text-2xl">Named albums</h3>
      <button
        type="button"
        className={button}
        disabled={working || busy}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Close named albums" : "Open named albums"}
      </button>
      {open && (
        <>
          <p role="status">{busy ? "Checking albums…" : message}</p>
          <div hidden={!visible} className="space-y-4">
            {data && (
              <>
                {!selected && !creating && (
                  <>
                    <p>
                      {data.albums.length}{" "}
                      {data.albums.length === 1 ? "album" : "albums"} available
                      {data.canManage
                        ? " · up to 50 albums, 100 photos each"
                        : ""}
                      .
                    </p>
                    {data.canManage && (
                      <button
                        type="button"
                        className={button}
                        disabled={busy || data.albums.length >= data.limit}
                        onClick={() => setCreating(true)}
                      >
                        New album
                      </button>
                    )}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {data.albums.map((album) => (
                        <button
                          key={album.id}
                          type="button"
                          className="min-w-0 space-y-2 rounded-lg border border-gc-divider p-3 text-left"
                          onClick={() => {
                            setSelected(album.id);
                            setPages([null]);
                          }}
                        >
                          {album.cover ? (
                            <img
                              src={album.cover.variants.thumb.url}
                              alt={album.cover.alt || "Album cover"}
                              width={album.cover.variants.thumb.width}
                              height={album.cover.variants.thumb.height}
                              loading="lazy"
                              className="aspect-square w-full object-cover"
                            />
                          ) : (
                            <span className="bg-gc-bg flex aspect-square items-center justify-center rounded text-gc-muted">
                              No shared cover
                            </span>
                          )}
                          <span className="block break-words font-semibold">
                            {album.name}
                          </span>
                          <span className="block">
                            {album.total}{" "}
                            {album.total === 1 ? "photo" : "photos"}
                          </span>
                          <span className="block text-sm text-gc-muted">
                            {labels[album.audience]}
                          </span>
                        </button>
                      ))}
                    </div>
                    {!data.albums.length && (
                      <p>
                        {data.canManage
                          ? "Create an album to organize your saved photos. Removing an album leaves its photos in place."
                          : "No albums are currently shared with you."}
                      </p>
                    )}
                  </>
                )}
                {selected && data.album && (
                  <>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        className={button}
                        disabled={working || busy}
                        onClick={() => {
                          setSelected(null);
                          setEditing(false);
                          setPages([null]);
                        }}
                      >
                        All named albums
                      </button>
                      {data.canManage && !editing && (
                        <button
                          type="button"
                          className={button}
                          disabled={busy}
                          onClick={() => setEditing(true)}
                        >
                          Edit album
                        </button>
                      )}
                    </div>
                    <h4 className="break-words text-2xl">{data.album.name}</h4>
                    <p>
                      {data.album.total}{" "}
                      {data.album.total === 1 ? "photo" : "photos"} shared with
                      you · {labels[data.album.audience]} · page {pages.length}
                    </p>
                    {!editing && (
                      <>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          {data.images.map((image, index) => (
                            <button
                              type="button"
                              key={image.id}
                              className="min-w-0 rounded-lg border border-gc-divider p-1"
                              aria-label={`Open album photo ${index + 1} on this page`}
                              onClick={() => setPhoto(image.id)}
                            >
                              <img
                                src={image.variants.thumb.url}
                                width={image.variants.thumb.width}
                                height={image.variants.thumb.height}
                                alt={image.alt || "Album photo"}
                                loading="lazy"
                                className="aspect-square w-full object-cover"
                              />
                              {image.caption && (
                                <span className="block break-words p-2 text-sm">
                                  {image.caption}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                        {!data.images.length && (
                          <p>
                            No photos in this album are currently available to
                            you.
                          </p>
                        )}
                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            className={button}
                            disabled={busy || pages.length <= 1}
                            onClick={() =>
                              setPages((value) => value.slice(0, -1))
                            }
                          >
                            Previous album photos
                          </button>
                          <button
                            type="button"
                            className={button}
                            disabled={busy || !data.nextCursor}
                            onClick={() =>
                              setPages((value) => [...value, data.nextCursor!])
                            }
                          >
                            More album photos
                          </button>
                        </div>
                      </>
                    )}
                  </>
                )}
                {data.canManage &&
                  (creating || (editing && data.album && data.editing)) && (
                    <AlbumEditor
                      key={creating ? "new" : data.album!.id}
                      album={creating ? null : data.album}
                      initialPhotos={creating ? [] : data.editing!}
                      ownerId={ownerId}
                      churches={churches}
                      done={done}
                      onWork={setWorking}
                    />
                  )}
              </>
            )}
          </div>
          {!visible && (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className={button}
                disabled={busy}
                onClick={() => void load()}
              >
                Check albums again
              </button>
              {working && (
                <button
                  type="button"
                  className={button}
                  disabled={busy}
                  onClick={() => done(selected ?? undefined)}
                >
                  Discard local album changes
                </button>
              )}
            </div>
          )}
        </>
      )}
      {photo && (
        <PhotoViewer
          source={source}
          accountId={ownerId}
          initialId={photo}
          pageLimit={24}
          onClose={() => setPhoto(null)}
        />
      )}
    </section>
  );
}
