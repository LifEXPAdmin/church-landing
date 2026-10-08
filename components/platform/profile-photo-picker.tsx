"use client";
/* eslint-disable @next/next/no-img-element -- Permissioned media uses no shared optimizer. */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  readProfilePhotos,
  useProfilePhotoRead
} from "./profile-photo-section";

const selectedUrl = (ids: string[]) =>
  `/api/platform/profile?${new URLSearchParams({ view: "photo-choices", ids: JSON.stringify(ids) })}`;

export function ProfilePhotoPicker({
  owner,
  username,
  selected,
  visible,
  disabled,
  onSelect,
  onBusy
}: {
  owner: string;
  username: string;
  selected: string[];
  visible: boolean;
  disabled: boolean;
  onSelect: (ids: string[]) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [browsing, setBrowsing] = useState(false);
  const [pages, setPages] = useState<(string | null)[]>([null]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const sequence = useRef(0);
  const busy = useRef(false);
  const request = useRef<AbortController | null>(null);
  const visibleNow = useRef(visible);
  visibleNow.current = visible;
  const selectedNow = useRef(selected);
  selectedNow.current = selected;
  const busyCallback = useRef(onBusy);
  busyCallback.current = onBusy;
  const status = useRef<HTMLParagraphElement>(null);
  const after = pages.at(-1);
  const choicesUrl = `/api/platform/profile?${new URLSearchParams({
    view: "photo-choices",
    ...(after ? { after } : {})
  })}`;
  const selection = useProfilePhotoRead(selectedUrl(selected), owner, visible);
  const choices = useProfilePhotoRead(choicesUrl, owner, visible && browsing);
  useEffect(() => {
    const conceal = () => {
      sequence.current++;
      request.current?.abort();
      setMessage("");
    };
    if (!visible) conceal();
    for (const event of [
      "blur",
      "pagehide",
      "offline",
      "popstate",
      "social-relationships-changed"
    ])
      window.addEventListener(event, conceal);
    const visibility = () => {
      if (document.visibilityState === "hidden") conceal();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      conceal();
      for (const event of [
        "blur",
        "pagehide",
        "offline",
        "popstate",
        "social-relationships-changed"
      ])
        window.removeEventListener(event, conceal);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [visible, owner]);
  const active = (seq: number) =>
    sequence.current === seq &&
    visibleNow.current &&
    document.hasFocus() &&
    navigator.onLine &&
    document.visibilityState !== "hidden";
  async function choose(id: string) {
    if (disabled || busy.current || !visibleNow.current || selected.length >= 6)
      return;
    const original = JSON.stringify(selectedNow.current);
    if (selectedNow.current.includes(id)) return;
    busy.current = true;
    setPending(true);
    busyCallback.current(true);
    setMessage("");
    const seq = ++sequence.current;
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const result = await readProfilePhotos(
        selectedUrl([id]),
        owner,
        controller.signal
      );
      if (!active(seq) || JSON.stringify(selectedNow.current) !== original)
        return;
      if (!result.images.some((image) => image.id === id)) {
        setMessage(
          "That photo is no longer available to select. Your draft is unchanged."
        );
        choices.recheck();
        return;
      }
      onSelect([...selectedNow.current, id]);
      setMessage(
        `Photo added at position ${selectedNow.current.length + 1}. Save your profile to apply the selection.`
      );
    } catch {
      if (active(seq)) {
        selection.recheck();
        choices.recheck();
        setMessage(
          "The photo could not be checked for this account. Your draft is unchanged. Recheck and try again."
        );
      }
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) request.current = null;
      busy.current = false;
      setPending(false);
      busyCallback.current(false);
      if (active(seq)) requestAnimationFrame(() => status.current?.focus());
    }
  }
  function move(index: number, offset: number, control: HTMLButtonElement) {
    if (disabled || busy.current || !visibleNow.current) return;
    const to = index + offset;
    if (to < 0 || to >= selected.length) return;
    const next = [...selected];
    [next[index], next[to]] = [next[to], next[index]];
    onSelect(next);
    setMessage(`Photo moved to position ${to + 1} of ${next.length}.`);
    requestAnimationFrame(() => {
      if (visibleNow.current) control.focus();
    });
  }
  return (
    <div className="min-h-px" data-profile-photo-picker="editor">
      <div ref={selection.root} className="min-h-px">
        {visible && (
          <fieldset
            className="min-w-0 space-y-4"
            disabled={disabled || pending}
          >
            <legend className="text-2xl">Selected profile photos</legend>
            <p className="text-sm text-gc-muted">
              Choose up to six photos you own from your photo library. Their
              existing audiences still apply. This only prepares your profile
              draft; it does not upload, delete or change who can see a photo.
              Remove every selection to leave this section empty.
            </p>
            <p className="text-sm text-gc-muted">
              Use Photos in Optional section order to position the section
              within About. Hidden, deleted or unavailable photos do not appear
              to readers.
            </p>
            <p>{selected.length} of 6 photos selected</p>
            {selected.length > 0 && (
              <ol aria-label="Selected photo order" className="space-y-3">
                {selected.map((id, index) => {
                  const image = selection.result?.images.find(
                    (item) => item.id === id
                  );
                  return (
                    <li
                      key={id}
                      className="min-w-0 space-y-2 rounded-lg border border-gc-divider p-3"
                    >
                      <p className="font-semibold">
                        Selected photo {index + 1}
                      </p>
                      {image ? (
                        <div className="min-w-0 space-y-2">
                          <img
                            src={image.variants.thumb.url}
                            width={image.variants.thumb.width}
                            height={image.variants.thumb.height}
                            alt={image.alt || `Selected photo ${index + 1}`}
                            className="h-24 w-24 rounded-md object-cover"
                            loading="lazy"
                          />
                          {image.caption && (
                            <p className="break-words text-sm">
                              {image.caption}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-gc-muted">
                          {selection.result
                            ? "This selection is unavailable. You can remove it or keep its place in your draft."
                            : "Checking this selection. Its place in your draft is retained."}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          className="gc-profile-text-button"
                          aria-disabled={index === 0}
                          aria-label={`Move selected photo ${index + 1} up`}
                          onClick={(event) =>
                            move(index, -1, event.currentTarget)
                          }
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          className="gc-profile-text-button"
                          aria-disabled={index === selected.length - 1}
                          aria-label={`Move selected photo ${index + 1} down`}
                          onClick={(event) =>
                            move(index, 1, event.currentTarget)
                          }
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          className="gc-profile-text-button"
                          aria-label={`Remove selected photo ${index + 1}`}
                          onClick={() => {
                            if (disabled || busy.current || !visibleNow.current)
                              return;
                            onSelect(selected.filter((item) => item !== id));
                            setMessage(
                              `Photo ${index + 1} removed from this draft. The library photo is unchanged.`
                            );
                            requestAnimationFrame(() => {
                              if (visibleNow.current) status.current?.focus();
                            });
                          }}
                        >
                          Remove from selection
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {selection.notice && <p role="status">{selection.notice}</p>}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="gc-profile-text-button"
                onClick={() => {
                  setBrowsing((value) => !value);
                  setMessage("");
                }}
              >
                {browsing
                  ? "Close photo choices"
                  : "Choose photos from your library"}
              </button>
              <button
                type="button"
                className="gc-profile-text-button"
                onClick={() => {
                  selection.recheck();
                  choices.recheck();
                }}
              >
                Recheck photo choices
              </button>
            </div>
            <p className="text-sm">
              <Link
                className="gc-profile-text-button"
                href={`/platform/profile/${encodeURIComponent(username)}?tab=photos`}
              >
                Open your photo library
              </Link>{" "}
              to upload photos or manage their audience. Save this profile draft
              before leaving to keep its changes.
            </p>
            <p ref={status} role="status" tabIndex={-1} className="text-sm">
              {pending ? "Checking the selected photo…" : message}
            </p>
          </fieldset>
        )}
      </div>
      <div ref={choices.root} className="min-h-px">
        {visible && browsing && (
          <fieldset
            className="mt-4 min-w-0 space-y-3"
            disabled={disabled || pending}
          >
            <legend className="text-xl">Available library photos</legend>
            {choices.notice ? (
              <p role="status">{choices.notice}</p>
            ) : !choices.result ? (
              <p role="status">Checking available photos…</p>
            ) : !choices.result.images.length ? (
              <p>
                No photos are available on this page. Add photos in your library
                to choose them here.
              </p>
            ) : (
              <ul className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3">
                {choices.result.images.map((image, index) => (
                  <li
                    key={image.id}
                    className="min-w-0 space-y-2 rounded-lg border border-gc-divider p-2"
                  >
                    <img
                      src={image.variants.thumb.url}
                      width={image.variants.thumb.width}
                      height={image.variants.thumb.height}
                      alt={image.alt || `Library photo ${index + 1}`}
                      className="aspect-square h-auto w-full rounded-md object-cover"
                      loading="lazy"
                    />
                    {image.caption && (
                      <p className="break-words text-sm">{image.caption}</p>
                    )}
                    <button
                      type="button"
                      className="gc-profile-text-button"
                      disabled={
                        selected.includes(image.id) || selected.length >= 6
                      }
                      aria-label={`Select library photo ${index + 1}`}
                      onClick={() => void choose(image.id)}
                    >
                      {selected.includes(image.id)
                        ? "Selected"
                        : "Select photo"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <nav
              aria-label="Photo choice pages"
              className="flex flex-wrap gap-3"
            >
              <button
                type="button"
                className="gc-profile-text-button"
                disabled={pages.length === 1}
                onClick={() => setPages((value) => value.slice(0, -1))}
              >
                Previous photo choices
              </button>
              <button
                type="button"
                className="gc-profile-text-button"
                disabled={!choices.result?.nextCursor}
                onClick={() => {
                  const next = choices.result?.nextCursor;
                  if (next) setPages((value) => [...value, next]);
                }}
              >
                Next photo choices
              </button>
            </nav>
          </fieldset>
        )}
      </div>
    </div>
  );
}
