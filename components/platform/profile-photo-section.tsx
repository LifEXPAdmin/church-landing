"use client";
/* eslint-disable @next/next/no-img-element -- Permissioned media uses no shared optimizer. */
import { useEffect, useRef, useState } from "react";
import type { ImageView } from "@/lib/platform/media";
import { PhotoViewer } from "./photo-viewer";
import { ReadVisibility, useReadVisibility } from "./read-visibility";
import { useReadingPreferences } from "./reading-preferences";

export type ProfilePhotoResult = {
  viewerId: string;
  profileId?: string;
  version?: number;
  images: ImageView[];
  nextCursor?: string | null;
};

export async function readProfilePhotos(
  url: string,
  owner: string,
  signal: AbortSignal
): Promise<ProfilePhotoResult> {
  let abort = () => {};
  const stopped = new Promise<never>((_, reject) => {
    abort = () =>
      reject(
        Object.assign(Error("Photo read canceled."), { name: "AbortError" })
      );
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    if (signal.aborted) {
      abort();
      return await stopped;
    }
    return await Promise.race([
      stopped,
      (async () => {
        const response = await fetch(url, {
          signal,
          cache: "no-store",
          credentials: "same-origin",
          headers: { "X-Expected-Account": owner }
        });
        const result = await response.json();
        if (!response.ok)
          throw Error(result.message ?? "Photos could not be checked.");
        const identity = await fetch("/api/platform/profile?view=identity", {
          signal,
          cache: "no-store",
          credentials: "same-origin"
        });
        if (
          !identity.ok ||
          (await identity.json()).id !== owner ||
          result.viewerId !== owner
        )
          throw Error("Your sign-in changed. Reload before continuing.");
        return result;
      })()
    ]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

/** Only IDs survive concealment in the parent draft; source metadata is transient. */
export function useProfilePhotoRead(
  url: string,
  owner: string,
  enabled: boolean,
  version?: number,
  profileId?: string
) {
  const root = useRef<HTMLDivElement>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    url: string;
    owner: string;
    version?: number;
    profileId?: string;
    revision: number;
    result: ProfilePhotoResult;
  } | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true,
      intersecting = false,
      sequence = 0,
      checking = false,
      queued = false;
    let controller: AbortController | undefined;
    const active = () =>
      live &&
      enabled &&
      intersecting &&
      document.hasFocus() &&
      navigator.onLine &&
      document.visibilityState !== "hidden";
    const hide = () => {
      sequence++;
      controller?.abort();
      setSnapshot(null);
      setNotice("");
    };
    const refresh = async () => {
      if (!active()) return;
      if (checking) {
        queued = true;
        return;
      }
      checking = true;
      const seq = ++sequence;
      const request = new AbortController();
      controller = request;
      const timeout = setTimeout(() => request.abort(), 10000);
      try {
        const result = await readProfilePhotos(url, owner, request.signal);
        if (seq !== sequence || !active()) return;
        if (
          (version !== undefined && result.version !== version) ||
          (profileId !== undefined && result.profileId !== profileId)
        ) {
          setSnapshot(null);
          setNotice("This profile changed. Reload to see its current photos.");
        } else {
          setSnapshot({
            url,
            owner,
            version,
            profileId,
            revision: seq,
            result
          });
          setNotice("");
        }
      } catch {
        if (seq === sequence && active()) {
          setSnapshot(null);
          setNotice(
            "Photos are unavailable right now. Recheck current access."
          );
        }
      } finally {
        clearTimeout(timeout);
        checking = false;
        if (queued) {
          queued = false;
          void refresh();
        }
      }
    };
    const resume = () => {
      hide();
      void refresh();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : resume();
    const observer = new IntersectionObserver((entries) => {
      intersecting = entries.some((entry) => entry.isIntersecting);
      if (intersecting) void refresh();
      else hide();
    });
    if (root.current) observer.observe(root.current);
    const timer = setInterval(() => void refresh(), 30000);
    for (const event of ["blur", "pagehide", "offline"])
      window.addEventListener(event, hide);
    for (const event of [
      "focus",
      "pageshow",
      "online",
      "popstate",
      "social-relationships-changed"
    ])
      window.addEventListener(event, resume);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      live = false;
      hide();
      observer.disconnect();
      clearInterval(timer);
      for (const event of ["blur", "pagehide", "offline"])
        window.removeEventListener(event, hide);
      for (const event of [
        "focus",
        "pageshow",
        "online",
        "popstate",
        "social-relationships-changed"
      ])
        window.removeEventListener(event, resume);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [url, owner, enabled, version, profileId, refreshKey]);
  const current =
    enabled &&
    snapshot?.url === url &&
    snapshot.owner === owner &&
    snapshot.version === version &&
    snapshot.profileId === profileId;
  return {
    root,
    result: current ? snapshot.result : null,
    revision: current ? snapshot.revision : 0,
    notice: enabled ? notice : "",
    recheck: () => {
      setSnapshot(null);
      setNotice("");
      setRefreshKey((value) => value + 1);
    }
  };
}

export function ProfilePhotoSection({
  username,
  profileId,
  owner,
  version,
  preview,
  standalone = false
}: {
  username: string;
  profileId: string;
  owner: string;
  version: number;
  preview: boolean;
  standalone?: boolean;
}) {
  const visible = useReadVisibility();
  const { preferences } = useReadingPreferences();
  const [selected, setSelected] = useState<string | null>(null);
  const source = `/api/platform/profile?${new URLSearchParams({
    view: "photo-section",
    username,
    ...(preview ? { preview: "member" } : {})
  })}`;
  const { root, result, revision, notice, recheck } = useProfilePhotoRead(
    source,
    owner,
    visible,
    version,
    profileId
  );
  const images = result?.images ?? [];
  const gallery =
    images.length > 0 ? (
      <section
        aria-labelledby="profile-selected-photos-heading"
        className="space-y-3"
      >
        <h3 id="profile-selected-photos-heading" className="text-xl">
          Photos
        </h3>
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((image, index) => (
            <figure key={image.id} className="min-w-0 space-y-2">
              <button
                type="button"
                className="block w-full overflow-hidden rounded-lg"
                aria-haspopup="dialog"
                aria-label={`Open selected photo ${index + 1} of ${images.length}`}
                onClick={() => setSelected(image.id)}
              >
                <img
                  src={image.variants.thumb.url}
                  srcSet={
                    preferences.reduceData ||
                    image.variants.thumb.width === image.variants.medium.width
                      ? undefined
                      : `${image.variants.thumb.url} ${image.variants.thumb.width}w, ${image.variants.medium.url} ${image.variants.medium.width}w`
                  }
                  sizes="(min-width: 640px) 30vw, 44vw"
                  width={image.variants.thumb.width}
                  height={image.variants.thumb.height}
                  alt={image.alt || `Selected photo ${index + 1}`}
                  className="aspect-square h-auto w-full object-cover"
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.style.visibility = "hidden";
                  }}
                />
              </button>
              {image.caption && (
                <figcaption className="break-words text-sm">
                  {image.caption}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
        {preferences.reduceData && (
          <p className="text-sm text-gc-muted">
            Data saver uses small previews. Open a photo to choose a larger
            image.
          </p>
        )}
      </section>
    ) : null;
  return (
    <div ref={root} className="min-h-px" data-profile-photo-section="reader">
      {visible &&
        gallery &&
        (standalone ? (
          <section
            className="gc-profile-section"
            aria-labelledby="profile-about-heading"
          >
            <h2 id="profile-about-heading">About</h2>
            {gallery}
          </section>
        ) : (
          gallery
        ))}
      {visible && notice && (
        <div className="space-y-2">
          <p role="status">{notice}</p>
          <button
            type="button"
            className="gc-profile-text-button"
            onClick={recheck}
          >
            Recheck profile photos
          </button>
        </div>
      )}
      {selected !== null && (
        <ReadVisibility.Provider value={visible && result !== null}>
          <PhotoViewer
            key={`${owner}:${profileId}:${version}:${source}`}
            source={source}
            accountId={owner}
            initialId={selected}
            refreshKey={revision}
            onClose={() => setSelected(null)}
            removeWhenHidden
          />
        </ReadVisibility.Provider>
      )}
    </div>
  );
}
