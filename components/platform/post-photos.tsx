"use client";
/* eslint-disable @next/next/no-img-element -- Current-access media must bypass shared image optimization. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageView } from "@/lib/platform/media";
import { socialRequest } from "@/lib/platform/social-client";
import { useReadingPreferences } from "./reading-preferences";
import { PhotoViewer } from "./photo-viewer";

export function PostPhotos({
  postId,
  accountId
}: {
  postId: string;
  accountId?: string | null;
}) {
  const { preferences } = useReadingPreferences();
  const [active, setActive] = useState(0);
  const [images, setImages] = useState<ImageView[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [message, setMessage] = useState(""),
    [visible, setVisible] = useState(false);
  const frame = useRef<HTMLDivElement>(null),
    generation = useRef(0);
  const source = `/api/platform/gallery?postId=${encodeURIComponent(postId)}`;
  const load = useCallback(async () => {
    const seq = ++generation.current;
    setImages([]);
    setMessage("Checking photos…");
    try {
      const result = await socialRequest<{ images: ImageView[] }>(
        source,
        undefined,
        accountId
      );
      if (seq === generation.current) {
        setImages(result.data.images.slice(0, 10));
        setMessage(result.data.images.length ? "" : "No photos are available.");
      }
    } catch {
      if (seq === generation.current)
        setMessage("Photos are unavailable. Reconnect and try again.");
    }
  }, [source, accountId]);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100px" }
    );
    observer.observe(frame.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    const hide = () => {
      generation.current++;
      setImages([]);
    };
    const refresh = () => {
      if (document.visibilityState !== "hidden") void load();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : refresh();
    refresh();
    window.addEventListener("blur", hide);
    window.addEventListener("focus", refresh);
    window.addEventListener("social-relationships-changed", refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("social-relationships-changed", refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [visible, load]);
  return (
    <div ref={frame} className="my-4 min-h-12" aria-label="Post photos">
      <p role="status">{message}</p>
      {!!images.length && preferences.reduceData && (
        <div
          className="mb-2 flex flex-wrap items-center gap-3"
          aria-label="Choose a photo preview"
        >
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={active === 0}
            onClick={() => setActive((index) => index - 1)}
          >
            Previous photo
          </button>
          <span>
            {Math.min(active + 1, images.length)} / {images.length} · Reduced
            data
          </span>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={active >= images.length - 1}
            onClick={() => setActive((index) => index + 1)}
          >
            Next photo
          </button>
        </div>
      )}
      {!!images.length && (
        <div
          className="flex gap-3 overflow-x-auto overscroll-x-contain pb-2"
          aria-label={`${images.length} photos`}
        >
          {images.map(
            (image, index) =>
              (!preferences.reduceData ||
                index === Math.min(active, images.length - 1)) && (
                <button
                  key={image.id}
                  type="button"
                  className="relative shrink-0 overflow-hidden rounded-lg border border-gc-divider"
                  aria-haspopup="dialog"
                  aria-label={`Open photo ${index + 1} of ${images.length}`}
                  onClick={() => setSelected(image.id)}
                >
                  <img
                    src={image.variants.thumb.url}
                    srcSet={
                      preferences.reduceData ||
                      image.variants.medium.width === image.variants.thumb.width
                        ? undefined
                        : `${image.variants.thumb.url} ${image.variants.thumb.width}w, ${image.variants.medium.url} ${image.variants.medium.width}w`
                    }
                    sizes="160px"
                    width={image.variants.thumb.width}
                    height={image.variants.thumb.height}
                    alt={image.alt || `Photo ${index + 1}`}
                    className="h-40 w-40 object-cover"
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      e.currentTarget.style.visibility = "hidden";
                    }}
                  />
                  <span className="absolute bottom-1 right-1 rounded bg-black/75 px-2 text-sm text-white">
                    {index + 1}/{images.length}
                  </span>
                </button>
              )
          )}
        </div>
      )}
      {visible && !images.length && (
        <button
          type="button"
          className="gc-button gc-button-quiet"
          onClick={() => void load()}
        >
          Check photos
        </button>
      )}
      {selected && (
        <PhotoViewer
          source={source}
          accountId={accountId}
          initialId={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
