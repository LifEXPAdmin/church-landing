"use client";
/* eslint-disable @next/next/no-img-element -- Permissioned photos use current-access image responses. */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { readExchangeGallery } from "@/lib/platform/exchange-listings";
import {
  currentSocialOwner,
  socialRequest,
  SocialClientError
} from "@/lib/platform/social-client";
import { PhotoUploadManager } from "./photo-upload-manager";
import { PhotoViewer } from "./photo-viewer";
import { useReadVisibility } from "./read-visibility";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
import { useReadingPreferences } from "./reading-preferences";
import { portalInputClass } from "./portal-action-form";

type Gallery = Awaited<ReturnType<typeof readExchangeGallery>>;
export function ExchangePhotos({
  listingId,
  accountId,
  version,
  management = false,
  disabled = false,
  onPending,
  onSaved,
  onCommand,
  onRemove
}: {
  listingId: string;
  accountId: string | null;
  version: number;
  management?: boolean;
  disabled?: boolean;
  onPending?: (value: boolean) => void;
  onSaved?: () => Promise<void>;
  onCommand?: (input: Record<string, unknown>) => Promise<boolean>;
  onRemove?: (id: string, version: number) => Promise<boolean>;
}) {
  const sourceVisible = useReadVisibility(),
    { preferences } = useReadingPreferences();
  const [gallery, setGallery] = useState<Gallery | null>(null),
    [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("Checking listing photos…"),
    [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    id: string;
    version: number;
    caption: string;
    alt: string;
  } | null>(null);
  const [uploads, setUploads] = useState(false),
    [acting, setActing] = useState(false),
    [active, setActive] = useState(0);
  const uid = useId();
  const generation = useRef(0),
    busy = useRef(false);
  const source = `/api/platform/exchange?view=gallery&id=${encodeURIComponent(listingId)}`;
  useUnsavedSocialWork(
    { dirty: !!editing, saving: acting, conflict: false },
    () => setMessage("Save or cancel the photo description before leaving."),
    true
  );
  useEffect(() => {
    onPending?.(uploads || !!editing || acting);
  }, [onPending, uploads, editing, acting]);
  const load = useCallback(async () => {
    if (!sourceVisible || document.visibilityState === "hidden") return;
    const seq = ++generation.current;
    try {
      const result = await socialRequest<Gallery>(source, undefined, accountId);
      if (seq !== generation.current) return;
      setGallery(result.data);
      setVisible(true);
      setMessage("");
    } catch (error) {
      if (seq !== generation.current) return;
      setVisible(false);
      setGallery(null);
      setMessage(
        error instanceof Error
          ? error.message
          : "Photos could not be checked. Reconnect and try again."
      );
      if (error instanceof SocialClientError && error.status === 401) {
        const actual = await currentSocialOwner().catch(() => undefined);
        if (
          seq === generation.current &&
          actual !== undefined &&
          actual !== accountId
        ) {
          setEditing(null);
          setSelected(null);
        }
      }
    }
  }, [source, accountId, sourceVisible]);
  useEffect(() => {
    setEditing(null);
  }, [version]);
  useEffect(() => {
    void load();
  }, [version, load]);
  useEffect(() => {
    const hide = () => {
      generation.current++;
      setVisible(false);
    };
    const resume = () => {
      void load();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : resume();
    if (!sourceVisible) hide();
    const timer = setInterval(resume, 30000);
    window.addEventListener("blur", hide);
    window.addEventListener("offline", hide);
    for (const event of ["focus", "online", "social-relationships-changed"])
      window.addEventListener(event, resume);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      clearInterval(timer);
      window.removeEventListener("blur", hide);
      window.removeEventListener("offline", hide);
      for (const event of ["focus", "online", "social-relationships-changed"])
        window.removeEventListener(event, resume);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load, sourceVisible]);
  const canEdit = management && gallery?.canManage && !!accountId;
  const locked = disabled || acting || uploads || !visible;
  async function act(work: () => Promise<boolean>) {
    if (busy.current || locked) return;
    busy.current = true;
    setActing(true);
    try {
      if (await work()) {
        setEditing(null);
        await load();
      }
    } finally {
      busy.current = false;
      setActing(false);
    }
  }
  return (
    <section className="space-y-4" aria-label="Listing photos">
      <h2 className="text-2xl">
        Listing photos
        {gallery && visible
          ? ` (${gallery.images.length} / ${gallery.limit})`
          : ""}
      </h2>
      <p role="status">{message}</p>
      {!visible && (
        <button
          className="gc-button gc-button-quiet"
          type="button"
          onClick={() => void load()}
        >
          Check listing photos
        </button>
      )}
      <div
        hidden={!visible || !sourceVisible}
        inert={!visible || !sourceVisible}
        className="space-y-4"
      >
        {!gallery?.images.length && <p>No listing photos yet.</p>}
        {!!gallery?.images.length && preferences.reduceData && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="gc-button gc-button-quiet"
              disabled={active === 0}
              onClick={() => setActive((i) => i - 1)}
            >
              Previous preview
            </button>
            <span>
              {Math.min(active + 1, gallery.images.length)} /{" "}
              {gallery.images.length} · Reduced data
            </span>
            <button
              className="gc-button gc-button-quiet"
              disabled={active >= gallery.images.length - 1}
              onClick={() => setActive((i) => i + 1)}
            >
              Next preview
            </button>
          </div>
        )}
        <ol className="grid min-w-0 gap-4 sm:grid-cols-2">
          {gallery?.images.map(
            (image, index) =>
              (!preferences.reduceData ||
                index === Math.min(active, gallery.images.length - 1)) && (
                <li
                  key={image.id}
                  className="min-w-0 space-y-3 rounded-xl border border-gc-divider p-3"
                >
                  <button
                    type="button"
                    aria-label={`Open listing photo ${index + 1} of ${gallery.images.length}`}
                    aria-haspopup="dialog"
                    className="block w-full"
                    onClick={() => setSelected(image.id)}
                  >
                    <img
                      src={image.variants.thumb.url}
                      width={image.variants.thumb.width}
                      height={image.variants.thumb.height}
                      alt={image.alt || `Listing photo ${index + 1}`}
                      className="max-h-60 w-full rounded-lg object-contain"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        e.currentTarget.style.visibility = "hidden";
                      }}
                    />
                  </button>
                  <p className="whitespace-pre-wrap break-words">
                    {image.caption}
                  </p>
                  {canEdit && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="gc-button gc-button-quiet"
                        type="button"
                        disabled={locked || !!editing}
                        onClick={() =>
                          setEditing({
                            id: image.id,
                            version: image.version,
                            caption: image.caption ?? "",
                            alt: image.alt ?? ""
                          })
                        }
                      >
                        Edit photo {index + 1} description
                      </button>
                      {[-1, 1].map((delta) => (
                        <button
                          key={delta}
                          type="button"
                          className="gc-button gc-button-quiet"
                          disabled={
                            locked ||
                            !!editing ||
                            index + delta < 0 ||
                            index + delta >= gallery.images.length ||
                            !!gallery.pendingUploads
                          }
                          onClick={() => {
                            const images = gallery.images.map((i) => ({
                              id: i.id,
                              version: i.version
                            }));
                            [images[index], images[index + delta]] = [
                              images[index + delta],
                              images[index]
                            ];
                            void act(() =>
                              onCommand!({ operation: "photo-order", images })
                            );
                          }}
                          aria-label={`Move photo ${index + 1} ${delta < 0 ? "earlier" : "later"}`}
                        >
                          {delta < 0 ? "Move earlier" : "Move later"}
                        </button>
                      ))}
                      <button
                        className="gc-button gc-button-quiet"
                        type="button"
                        disabled={locked || !!editing}
                        onClick={() => {
                          if (
                            confirm(
                              "Remove this listing photo? It will no longer be available through this listing."
                            )
                          )
                            void act(() => onRemove!(image.id, image.version));
                        }}
                      >
                        Remove photo {index + 1}
                      </button>
                    </div>
                  )}
                  {editing?.id === image.id && (
                    <form
                      className="space-y-3"
                      aria-label={`Edit photo ${index + 1} description`}
                      onSubmit={(e) => {
                        e.preventDefault();
                        void act(() =>
                          onCommand!({
                            operation: "photo-metadata",
                            imageId: editing.id,
                            imageVersion: editing.version,
                            caption: editing.caption,
                            alt: editing.alt
                          })
                        );
                      }}
                    >
                      <label className="block space-y-2">
                        <span id={`${uid}-caption-label`}>Photo caption</span>
                        <textarea
                          aria-labelledby={`${uid}-caption-label`}
                          className={portalInputClass}
                          maxLength={500}
                          value={editing.caption}
                          disabled={locked}
                          onChange={(e) =>
                            setEditing({ ...editing, caption: e.target.value })
                          }
                        />
                      </label>
                      <label className="block space-y-2">
                        <span id={`${uid}-alt-label`}>Alternative text</span>
                        <input
                          aria-labelledby={`${uid}-alt-label`}
                          className={portalInputClass}
                          maxLength={300}
                          value={editing.alt}
                          disabled={locked}
                          onChange={(e) =>
                            setEditing({ ...editing, alt: e.target.value })
                          }
                        />
                      </label>
                      <p className="text-sm">
                        Describe what the photo shows without phone numbers,
                        email, exact addresses or private details.
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="submit"
                          className="gc-button"
                          disabled={locked}
                        >
                          Save photo description
                        </button>
                        <button
                          type="button"
                          className="gc-button gc-button-quiet"
                          disabled={acting || uploads}
                          onClick={() => setEditing(null)}
                        >
                          Cancel photo description
                        </button>
                      </div>
                    </form>
                  )}
                </li>
              )
          )}
        </ol>
        {canEdit && (
          <fieldset
            disabled={disabled || acting || !!editing}
            className="min-w-0 space-y-3"
          >
            {disabled && (
              <p>Save or resolve the listing entries before changing photos.</p>
            )}
            <PhotoUploadManager
              ownerId={accountId!}
              targetId={listingId}
              purpose="EXCHANGE_PHOTO"
              available={gallery!.imagesAvailable}
              remaining={Math.max(
                0,
                gallery!.limit -
                  gallery!.images.length -
                  gallery!.pendingUploads
              )}
              onPending={setUploads}
              onSaved={async () => {
                await onSaved?.();
                await load();
              }}
            />
            {!!gallery!.pendingUploads && (
              <p>
                A server upload is still pending. Retry its original file from
                the tab where you selected it, or wait for the interrupted
                upload to expire before adding another.
              </p>
            )}
          </fieldset>
        )}
        {management && !canEdit && gallery && (
          <p>
            This gallery is read-only. Reopen an archived listing as a private
            draft before changing its photos.
          </p>
        )}
      </div>
      {selected && visible && sourceVisible && (
        <PhotoViewer
          source={source}
          accountId={accountId}
          initialId={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
