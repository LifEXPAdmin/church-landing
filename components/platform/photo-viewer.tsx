"use client";
/* eslint-disable @next/next/no-img-element -- Permissioned media bypasses shared image optimization. */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ImageView } from "@/lib/platform/media";
import { socialRequest } from "@/lib/platform/social-client";

export function PhotoViewer({
  source,
  accountId,
  initialId,
  onClose
}: {
  source: string;
  accountId?: string | null;
  initialId: string;
  onClose: () => void;
}) {
  const titleId = useId(),
    dialog = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose),
    generation = useRef(0),
    historyKey = useRef("");
  closeRef.current = onClose;
  const [images, setImages] = useState<ImageView[]>([]),
    [selected, setSelected] = useState(initialId),
    [status, setStatus] = useState("Checking photo access…"),
    [zoom, setZoom] = useState(1),
    [failed, setFailed] = useState<string | null>(null);
  const load = useCallback(async () => {
    const seq = ++generation.current;
    setImages([]);
    setStatus("Checking photo access…");
    setFailed(null);
    try {
      const result = await socialRequest<{ images: ImageView[] }>(
        source,
        undefined,
        accountId
      );
      if (seq !== generation.current) return;
      setImages(result.data.images.slice(0, 10));
      setStatus("");
    } catch {
      if (seq === generation.current)
        setStatus("This photo is unavailable. Reconnect to check again.");
    }
  }, [source, accountId]);
  useEffect(() => {
    const node = dialog.current!,
      opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node.showModal();
    const key = crypto.randomUUID();
    historyKey.current = key;
    window.history.pushState(
      { ...window.history.state, gcPhotoViewer: key },
      ""
    );
    const back = () => {
      if (window.history.state?.gcPhotoViewer !== key) closeRef.current();
    };
    window.addEventListener("popstate", back);
    return () => {
      window.removeEventListener("popstate", back);
      node.close();
      document.body.style.overflow = overflow;
      opener?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const conceal = () => {
      generation.current++;
      setImages([]);
      setStatus("Return to check current photo access.");
    };
    const refresh = () => {
      if (document.visibilityState !== "hidden") void load();
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
      conceal();
      window.removeEventListener("blur", conceal);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("social-relationships-changed", refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load]);
  function close() {
    if (window.history.state?.gcPhotoViewer === historyKey.current)
      window.history.back();
    else onClose();
  }
  const index = images.findIndex((image) => image.id === selected),
    image = images[index];
  function move(delta: number) {
    const next = images[index + delta];
    if (next) {
      setSelected(next.id);
      setZoom(1);
      setFailed(null);
    }
  }
  const touch = useRef<{ x: number; y: number } | null>(null);
  const variant = image?.variants.large;
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      className="gc-photo-viewer"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (zoom === 1 && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
          e.preventDefault();
          move(e.key === "ArrowLeft" ? -1 : 1);
        }
      }}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={titleId} className="text-xl">
          Photo viewer
        </h2>
        <button
          type="button"
          className="gc-button gc-button-quiet"
          onClick={close}
        >
          Close photo
        </button>
      </header>
      <p role="status">
        {status ||
          (!image
            ? "This photo is no longer available."
            : `Photo ${index + 1} of ${images.length}`)}
      </p>
      {image && variant && failed !== image.id ? (
        <figure className="min-w-0 space-y-3">
          <div
            className="gc-photo-viewport"
            tabIndex={0}
            aria-label={
              zoom > 1
                ? "Enlarged photo. Scroll to explore."
                : "Photo. Swipe left or right to change photos."
            }
            onTouchStart={(e) => {
              e.stopPropagation();
              touch.current =
                e.touches.length === 1 && zoom === 1
                  ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
                  : null;
            }}
            onTouchMove={(e) => {
              e.stopPropagation();
              if (e.touches.length !== 1) touch.current = null;
            }}
            onTouchCancel={() => {
              touch.current = null;
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              const start = touch.current,
                end = e.changedTouches[0];
              touch.current = null;
              if (
                start &&
                end &&
                !e.touches.length &&
                Math.abs(end.clientX - start.x) > 60 &&
                Math.abs(end.clientY - start.y) < 35
              )
                move(end.clientX < start.x ? 1 : -1);
            }}
          >
            <img
              key={image.id}
              src={variant.url}
              width={variant.width}
              height={variant.height}
              alt={image.alt || "Photo"}
              className={zoom === 1 ? "gc-photo-fit" : "gc-photo-zoom"}
              style={zoom > 1 ? { width: `${zoom * 100}%` } : undefined}
              decoding="async"
              onError={() => setFailed(image.id)}
            />
          </div>
          {image.caption && (
            <figcaption className="whitespace-pre-wrap break-words">
              {image.caption}
            </figcaption>
          )}
        </figure>
      ) : (
        <button type="button" className="gc-button" onClick={() => void load()}>
          Retry photo access
        </button>
      )}
      {failed === image?.id && (
        <p role="status">
          This photo could not be loaded. It may no longer be available.
        </p>
      )}
      {image && (
        <nav aria-label="Photo controls" className="flex flex-wrap gap-2">
          {images.length > 1 && (
            <>
              <button
                type="button"
                className="gc-button"
                disabled={index <= 0}
                onClick={() => move(-1)}
              >
                Previous photo
              </button>
              <button
                type="button"
                className="gc-button"
                disabled={index >= images.length - 1}
                onClick={() => move(1)}
              >
                Next photo
              </button>
            </>
          )}
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={zoom >= 3}
            onClick={() => setZoom((value) => Math.min(3, value + 1))}
          >
            Zoom in
          </button>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={zoom === 1}
            onClick={() => setZoom(1)}
          >
            Fit photo
          </button>
        </nav>
      )}
    </dialog>
  );
}
