"use client";
/* eslint-disable @next/next/no-img-element -- Photos use current-access derivatives. */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { readPersonalPhotos } from "@/lib/platform/personal-photos";
import { socialRequest } from "@/lib/platform/social-client";
import { useDraftWorkspace } from "./draft-workspace-provider";
import { portalButtonClass } from "./portal-action-form";
import { PhotoViewer } from "./photo-viewer";
type Library = Awaited<ReturnType<typeof readPersonalPhotos>>;
export function ComposerPhotos({ enabled }: { enabled: boolean }) {
  const { controller, state } = useDraftWorkspace();
  const references = state.fields.photos ?? [],
    ownerId = state.ownerId;
  const [images, setImages] = useState<Library["images"]>([]),
    [choices, setChoices] = useState<Library | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<string | null>(null);
  const generation = useRef(0),
    signature = references.map((row) => row.id).join(",");
  const selectedSource = `/api/platform/photos?${new URLSearchParams({ profileId: ownerId ?? "", ids: signature })}`;
  const refresh = useCallback(async () => {
    const seq = ++generation.current;
    setImages([]);
    if (!ownerId || !signature || state.hidden) return;
    try {
      const result = await socialRequest<Library>(
        selectedSource,
        undefined,
        ownerId
      );
      if (seq === generation.current) {
        setImages(result.data.images);
        setMessage("");
      }
    } catch {
      if (seq === generation.current)
        setMessage(
          "Saved photo access could not be checked. Your draft references remain unchanged."
        );
    }
  }, [ownerId, signature, selectedSource, state.hidden]);
  useEffect(() => {
    void refresh();
    const invalidate = () => {
      generation.current++;
    };
    return () => {
      invalidate();
    };
  }, [refresh]);
  async function choose(after?: string) {
    if (!ownerId || busy) return;
    setBusy(true);
    try {
      const result = await socialRequest<Library>(
        `/api/platform/photos?${new URLSearchParams({ profileId: ownerId, ...(after ? { after } : {}) })}`,
        undefined,
        ownerId
      );
      setChoices(result.data);
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Saved photos could not be loaded."
      );
    } finally {
      setBusy(false);
    }
  }
  if (!enabled && !references.length) return null;
  const disabled =
    state.hidden ||
    state.publishing ||
    state.saving ||
    state.retry ||
    state.conflict ||
    !!state.postId;
  return (
    <section
      className="space-y-3 rounded-xl border border-gc-divider p-3"
      aria-label="Draft photos"
    >
      <h3 className="text-xl">Photos ({references.length} / 10)</h3>
      <p className="text-sm text-gc-muted">
        Saved personal photos use their existing files. Their audience must
        include this post&apos;s audience; Only me photos must be shared
        deliberately in Photos first.
      </p>
      {state.fields.authorChurchId && (
        <p className="text-sm">
          Personal-library photos cannot be attached while speaking as a church.
          Manage church post photos on the published post.
        </p>
      )}
      <p role="status">{message}</p>
      <ol className="space-y-3">
        {references.map((reference, index) => {
          const image = images.find((row) => row.id === reference.id);
          return (
            <li
              key={reference.id}
              className="space-y-2 rounded border border-gc-divider p-2"
            >
              {image ? (
                <button
                  type="button"
                  className="block"
                  aria-haspopup="dialog"
                  aria-label={`Open draft photo ${index + 1}`}
                  onClick={() => setSelected(image.id)}
                >
                  <img
                    src={image.variants.thumb.url}
                    width={image.variants.thumb.width}
                    height={image.variants.thumb.height}
                    alt={image.alt || `Draft photo ${index + 1}`}
                    className="h-28 w-28 object-cover"
                  />
                </button>
              ) : (
                <p>Photo {index + 1} · current access needs review.</p>
              )}
              {image?.caption && (
                <p className="break-words text-sm">{image.caption}</p>
              )}
              {image && image.version !== reference.version && (
                <div>
                  <p>
                    This saved photo changed since you selected it. Review its
                    current picture and audience before using the latest
                    version.
                  </p>
                  <button
                    type="button"
                    className={portalButtonClass}
                    disabled={disabled}
                    onClick={() =>
                      controller.change({
                        ...controller.getSnapshot().fields,
                        photos: references.map((row) =>
                          row.id === image.id
                            ? { id: image.id, version: image.version }
                            : row
                        )
                      })
                    }
                  >
                    Use latest saved photo
                  </button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={portalButtonClass}
                  disabled={disabled || index === 0}
                  onClick={() => {
                    const photos = [...references];
                    [photos[index], photos[index - 1]] = [
                      photos[index - 1],
                      photos[index]
                    ];
                    controller.change({
                      ...controller.getSnapshot().fields,
                      photos
                    });
                  }}
                >
                  Move photo earlier
                </button>
                <button
                  type="button"
                  className={portalButtonClass}
                  disabled={disabled}
                  onClick={() =>
                    controller.change({
                      ...controller.getSnapshot().fields,
                      photos: references.filter(
                        (row) => row.id !== reference.id
                      )
                    })
                  }
                >
                  Remove from this draft
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={portalButtonClass}
          disabled={
            disabled ||
            busy ||
            !!state.fields.authorChurchId ||
            references.length >= 10 ||
            !enabled
          }
          onClick={() => void choose()}
        >
          Choose saved photos
        </button>
        {references.length > 0 && (
          <button
            type="button"
            className={portalButtonClass}
            disabled={busy}
            onClick={() => void refresh()}
          >
            Check selected photos
          </button>
        )}
        <Link className={portalButtonClass} href="/platform/profile/me">
          Open profile photo controls
        </Link>
      </div>
      {choices && (
        <div className="space-y-3">
          <p>
            Select a standalone photo from this page of your library.
            Source-post and profile-history images keep their original purpose.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {choices.images
              .filter((image) => image.purpose === "PROFILE_PHOTO")
              .map((image) => (
                <button
                  type="button"
                  key={image.id}
                  className="space-y-2 rounded border border-gc-divider p-2 text-left"
                  disabled={
                    disabled ||
                    references.length >= 10 ||
                    references.some((row) => row.id === image.id)
                  }
                  onClick={() => {
                    controller.change({
                      ...controller.getSnapshot().fields,
                      photos: [
                        ...references,
                        { id: image.id, version: image.version }
                      ]
                    });
                    setImages((rows) => [
                      ...rows.filter((row) => row.id !== image.id),
                      image
                    ]);
                  }}
                >
                  <img
                    src={image.variants.thumb.url}
                    width={image.variants.thumb.width}
                    height={image.variants.thumb.height}
                    alt={image.alt || "Saved photo"}
                    className="h-24 w-24 object-cover"
                    loading="lazy"
                  />
                  <span className="block break-words text-sm">
                    {image.caption || "Saved photo"} ·{" "}
                    {image.audience === "ONLY_ME"
                      ? "Only me — choose a sharing audience first"
                      : image.audience.toLowerCase().replaceAll("_", " ")}
                  </span>
                </button>
              ))}
          </div>
          {choices.nextCursor && (
            <button
              type="button"
              className={portalButtonClass}
              disabled={busy}
              onClick={() => void choose(choices.nextCursor!)}
            >
              More saved photo choices
            </button>
          )}
          <button
            type="button"
            className={portalButtonClass}
            onClick={() => setChoices(null)}
          >
            Close photo choices
          </button>
        </div>
      )}
      {selected && (
        <PhotoViewer
          source={selectedSource}
          accountId={ownerId}
          initialId={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
