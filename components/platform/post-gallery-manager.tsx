"use client";
/* eslint-disable @next/next/no-img-element -- Current-access media bypasses the shared optimizer. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { readPostGallery } from "@/lib/platform/post-gallery";
import type { ImageView } from "@/lib/platform/media";
import {
  currentSocialOwner,
  socialRequest,
  SocialClientError
} from "@/lib/platform/social-client";
import { portalButtonClass, portalInputClass } from "./portal-action-form";
import { PhotoUploadManager } from "./photo-upload-manager";
import { PhotoViewer } from "./photo-viewer";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
type Gallery = Awaited<ReturnType<typeof readPostGallery>>;
export function PostGalleryManager({
  postId,
  ownerId
}: {
  postId: string;
  ownerId: string;
}) {
  const [data, setData] = useState<Gallery | null>(null),
    [draft, setDraft] = useState<ImageView[]>([]),
    [latest, setLatest] = useState<Gallery | null>(null);
  const [message, setMessage] = useState("Loading current photo permissions…"),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(false),
    [visible, setVisible] = useState(true),
    [uploadPending, setUploadPending] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [removeId, setRemoveId] = useState<string | null>(null);
  const source = `/api/platform/gallery?postId=${encodeURIComponent(postId)}`;
  const dataRef = useRef(data),
    draftRef = useRef(draft),
    generation = useRef(0),
    lock = useRef(false),
    pending = useRef<{
      body: string;
      method: "POST" | "DELETE";
      savedId?: string;
      order?: boolean;
    } | null>(null);
  dataRef.current = data;
  draftRef.current = draft;
  const dirty =
    !!data &&
    JSON.stringify(draft.map((row) => [row.id, row.caption, row.alt])) !==
      JSON.stringify(data.images.map((row) => [row.id, row.caption, row.alt]));
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useUnsavedSocialWork(
    { dirty, saving: busy, conflict: retry },
    () =>
      setMessage(
        "Save or explicitly discard your gallery edits before leaving."
      ),
    true
  );
  const fetchGallery = useCallback(
    async () => (await socialRequest<Gallery>(source, undefined, ownerId)).data,
    [source, ownerId]
  );
  const refresh = useCallback(async () => {
    const seq = ++generation.current;
    try {
      const result = await fetchGallery();
      if (seq !== generation.current) return;
      setVisible(true);
      if (dirtyRef.current || pending.current) {
        if (result.postVersion !== dataRef.current?.postVersion) {
          setLatest(result);
          setMessage(
            "The saved gallery changed. Your unsaved order and captions remain below; review the latest version before saving."
          );
        }
      } else {
        setData(result);
        setDraft(result.images);
        setMessage("");
      }
    } catch (error) {
      if (seq !== generation.current) return;
      setVisible(false);
      setMessage(
        error instanceof Error
          ? error.message
          : "Photos could not be loaded. Reconnect and retry."
      );
      if (error instanceof SocialClientError && error.status === 401) {
        setData(null);
        setDraft([]);
        pending.current = null;
        setRetry(false);
      }
    }
  }, [fetchGallery]);
  useEffect(() => {
    const hide = () => {
      generation.current++;
      setVisible(false);
    };
    const restore = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : restore();
    restore();
    window.addEventListener("blur", hide);
    window.addEventListener("focus", restore);
    window.addEventListener("online", restore);
    document.addEventListener("visibilitychange", visibility);
    const invalidate = () => {
      generation.current++;
    };
    return () => {
      invalidate();
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", restore);
      window.removeEventListener("online", restore);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [refresh]);
  function merge(next: Gallery, savedId?: string, orderSaved = false) {
    const old = dataRef.current,
      desired = draftRef.current;
    const rows = next.images.map((image) => {
      const local = desired.find((row) => row.id === image.id),
        base = old?.images.find((row) => row.id === image.id);
      return local && base && image.id !== savedId
        ? {
            ...image,
            caption:
              local.caption !== base.caption ? local.caption : image.caption,
            alt: local.alt !== base.alt ? local.alt : image.alt
          }
        : image;
    });
    const orderChanged =
      old &&
      desired.map((row) => row.id).join() !==
        old.images.map((row) => row.id).join();
    const nextDraft =
      !orderSaved && orderChanged
        ? [
            ...desired.flatMap(
              (row) => rows.find((image) => image.id === row.id) ?? []
            ),
            ...rows.filter(
              (row) => !desired.some((image) => image.id === row.id)
            )
          ]
        : rows;
    setData(next);
    setDraft(nextDraft);
    setLatest(null);
    setVisible(true);
  }
  async function send(operation?: string, image?: ImageView) {
    if (lock.current || !dataRef.current?.canManage) return;
    if (!pending.current) {
      if (!operation) return;
      if (
        operation === "remove" &&
        image &&
        !dataRef.current.savedPhotoIds.includes(image.id)
      )
        pending.current = {
          method: "DELETE",
          savedId: image.id,
          body: JSON.stringify({ id: image.id, expectedVersion: image.version })
        };
      else
        pending.current = {
          method: "POST",
          savedId:
            operation === "metadata" || operation === "remove"
              ? image?.id
              : undefined,
          order: operation === "reorder",
          body: JSON.stringify({
            operation: operation === "remove" ? "remove-reference" : operation,
            mutationId: crypto.randomUUID(),
            postId,
            expectedVersion: dataRef.current.postVersion,
            ...(operation === "reorder"
              ? {
                  images: draftRef.current.map((row) => ({
                    id: row.id,
                    version: row.version
                  }))
                }
              : {
                  imageId: image?.id,
                  imageVersion: image?.version,
                  ...(operation === "metadata"
                    ? { caption: image?.caption, alt: image?.alt }
                    : {})
                })
          })
        };
    }
    const attempt = pending.current;
    lock.current = true;
    setBusy(true);
    setMessage("Saving gallery…");
    try {
      if (attempt.method === "DELETE") {
        if ((await currentSocialOwner()) !== ownerId)
          throw new SocialClientError(
            401,
            "Your sign-in changed. Reload before continuing."
          );
        const response = await fetch("/api/platform/images", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "X-Expected-Account": ownerId
          },
          body: attempt.body
        });
        const result = await response.json();
        if ((await currentSocialOwner()) !== ownerId)
          throw new SocialClientError(
            401,
            "Your sign-in changed. Reload before continuing."
          );
        if (!response.ok)
          throw new SocialClientError(
            response.status,
            result.message ?? "Removal was not confirmed."
          );
      } else await socialRequest(source, attempt.body, ownerId);
      const next = await fetchGallery();
      merge(next, attempt.savedId, attempt.order);
      pending.current = null;
      setRetry(false);
      setRemoveId(null);
      setMessage("Gallery saved. Other unsaved caption edits remain here.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The save was not confirmed. Retry the same change."
      );
      setRetry(true);
      if (error instanceof SocialClientError && error.status === 401) {
        setVisible(false);
        setData(null);
        setDraft([]);
        pending.current = null;
        setRetry(false);
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function review() {
    if (lock.current) return;
    setBusy(true);
    try {
      setLatest(await fetchGallery());
      setMessage(
        "Latest saved gallery loaded. Choose whether to keep your edits or use the saved version."
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Latest gallery unavailable."
      );
    } finally {
      setBusy(false);
    }
  }
  const canEdit =
    !!data?.canManage && visible && !busy && !retry && !uploadPending;
  return (
    <section
      aria-label="Manage post photos"
      className="space-y-4 rounded-xl border border-gc-divider p-4"
    >
      <h2 className="text-2xl">Post photos</h2>
      <p role="status">{message}</p>
      {!visible && data && (
        <button
          type="button"
          className={portalButtonClass}
          onClick={() => {
            setData(null);
            setDraft([]);
            pending.current = null;
            setRetry(false);
            setUploadPending(false);
            setMessage(
              "Local photo work discarded. Any already-saved photos remain on the server."
            );
          }}
        >
          Discard local photo work
        </button>
      )}
      {!visible && (
        <button
          type="button"
          className={portalButtonClass}
          onClick={() => void refresh()}
        >
          Check current photo access
        </button>
      )}
      {retry && (
        <button
          type="button"
          className={portalButtonClass}
          disabled={busy}
          onClick={() => void send()}
        >
          Retry exact gallery change
        </button>
      )}
      {(retry || latest) && (
        <button
          type="button"
          className={portalButtonClass}
          disabled={busy}
          onClick={() => void review()}
        >
          Review latest gallery
        </button>
      )}
      {latest && (
        <div className="space-y-3 rounded-lg border border-gc-divider p-3">
          <p>
            The saved gallery has {latest.images.length} readable photos.
            Missing photos cannot be restored by these edits.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={portalButtonClass}
              onClick={() => {
                merge(latest);
                pending.current = null;
                setRetry(false);
                setMessage(
                  "Your surviving order and caption edits are kept against the latest versions. Review and save deliberately."
                );
              }}
            >
              Keep my edits against latest
            </button>
            <button
              type="button"
              className={portalButtonClass}
              onClick={() => {
                setData(latest);
                setDraft(latest.images);
                setLatest(null);
                pending.current = null;
                setRetry(false);
                setMessage(
                  "Unsaved gallery edits discarded; showing the saved gallery."
                );
              }}
            >
              Discard my edits and use saved gallery
            </button>
          </div>
        </div>
      )}
      <div hidden={!visible} className="space-y-4">
        {data && (
          <>
            <p>
              {data.images.length} / {data.limit} photos
            </p>
            {!data.canManage && (
              <p>
                You can view these photos. Your current account cannot change
                this gallery.
              </p>
            )}
            <ol className="space-y-4">
              {draft.map((image, index) => (
                <li
                  key={image.id}
                  className="space-y-3 rounded-lg border border-gc-divider p-3"
                  aria-label={`Photo ${index + 1}`}
                >
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    className="block"
                    onClick={() => setSelected(image.id)}
                  >
                    <img
                      src={image.variants.thumb.url}
                      width={image.variants.thumb.width}
                      height={image.variants.thumb.height}
                      alt={image.alt || `Photo ${index + 1}`}
                      className="h-32 w-32 rounded object-cover"
                      loading="lazy"
                    />
                  </button>
                  <div className="flex flex-wrap gap-3">
                    {[-1, 1].map((delta) => (
                      <button
                        key={delta}
                        type="button"
                        className={portalButtonClass}
                        disabled={
                          !canEdit ||
                          index + delta < 0 ||
                          index + delta >= draft.length ||
                          !!data.pendingUploads
                        }
                        onClick={() =>
                          setDraft((rows) => {
                            const copy = [...rows];
                            [copy[index], copy[index + delta]] = [
                              copy[index + delta],
                              copy[index]
                            ];
                            return copy;
                          })
                        }
                      >
                        {delta < 0 ? "Move earlier" : "Move later"}
                      </button>
                    ))}
                  </div>
                  <fieldset className="min-w-0 space-y-2" disabled={!canEdit}>
                    <label
                      htmlFor={`${image.id}-gallery-caption`}
                      className="block"
                    >
                      Caption
                    </label>
                    <textarea
                      id={`${image.id}-gallery-caption`}
                      className={portalInputClass}
                      rows={2}
                      maxLength={500}
                      value={image.caption}
                      onChange={(event) =>
                        setDraft((rows) =>
                          rows.map((row) =>
                            row.id === image.id
                              ? { ...row, caption: event.target.value }
                              : row
                          )
                        )
                      }
                    />
                    <label
                      htmlFor={`${image.id}-gallery-alt`}
                      className="block"
                    >
                      Image description for screen readers
                    </label>
                    <input
                      id={`${image.id}-gallery-alt`}
                      className={portalInputClass}
                      maxLength={300}
                      value={image.alt}
                      onChange={(event) =>
                        setDraft((rows) =>
                          rows.map((row) =>
                            row.id === image.id
                              ? { ...row, alt: event.target.value }
                              : row
                          )
                        )
                      }
                    />
                    <button
                      type="button"
                      className={portalButtonClass}
                      onClick={() => void send("metadata", image)}
                    >
                      Save caption and description
                    </button>
                  </fieldset>
                  {data.savedPhotoIds.includes(image.id) && (
                    <p className="text-sm">
                      This uses a saved personal photo. Caption changes also
                      appear with that photo; removal here keeps the saved photo
                      in your library.
                    </p>
                  )}
                  {removeId === image.id ? (
                    <div>
                      <p>
                        {data.savedPhotoIds.includes(image.id)
                          ? "Remove this reference from the post? Your saved photo will remain in Photos."
                          : "Remove this photo from the post and its automatic profile collection? Its files will be scheduled for cleanup."}
                      </p>
                      <button
                        type="button"
                        className={portalButtonClass}
                        disabled={!canEdit}
                        onClick={() => void send("remove", image)}
                      >
                        Confirm photo removal
                      </button>
                      <button
                        type="button"
                        className={portalButtonClass}
                        onClick={() => setRemoveId(null)}
                      >
                        Keep photo
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={portalButtonClass}
                      disabled={!canEdit}
                      onClick={() => setRemoveId(image.id)}
                    >
                      Remove photo
                    </button>
                  )}
                </li>
              ))}
            </ol>
            {!!data.unavailableReferences.length && (
              <div>
                <p>
                  Some saved photos are no longer readable. Remove their
                  references to free gallery space; this will not delete the
                  saved files.
                </p>
                {data.unavailableReferences.map((imageId, index) => (
                  <button
                    key={imageId}
                    type="button"
                    className={portalButtonClass}
                    disabled={!canEdit}
                    onClick={() =>
                      void send("remove-reference", {
                        id: imageId
                      } as ImageView)
                    }
                  >
                    Remove unavailable photo {index + 1}
                  </button>
                ))}
              </div>
            )}
            {!!draft.length && (
              <button
                type="button"
                className={portalButtonClass}
                disabled={
                  !canEdit ||
                  !!data.pendingUploads ||
                  !!data.unavailableReferences.length
                }
                onClick={() => void send("reorder")}
              >
                Save photo order
              </button>
            )}
            {!!data.pendingUploads && (
              <p>
                Wait for pending uploads to finish before reordering. Retry
                interrupted files to reconcile them.
              </p>
            )}
            {dirty && !retry && (
              <button
                type="button"
                className={portalButtonClass}
                disabled={busy}
                onClick={() => {
                  setDraft(data.images);
                  setMessage("Unsaved gallery edits discarded.");
                }}
              >
                Discard unsaved gallery edits
              </button>
            )}
            {data.canManage && (
              <PhotoUploadManager
                ownerId={ownerId}
                targetId={postId}
                purpose="POST_PHOTO"
                available={data.imagesAvailable && !dirty && !retry && !busy}
                remaining={
                  data.limit -
                  data.images.length -
                  data.unavailableReferences.length
                }
                onPending={setUploadPending}
                onSaved={async () => {
                  const next = await fetchGallery();
                  merge(next);
                }}
              />
            )}
          </>
        )}
      </div>
      {selected && (
        <PhotoViewer
          source={source}
          accountId={ownerId}
          initialId={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
