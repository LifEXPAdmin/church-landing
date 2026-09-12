"use client";
/* eslint-disable @next/next/no-img-element -- Account-gated media bypasses shared image optimization. */
import { useEffect, useRef, useState } from "react";
import { socialRequest } from "@/lib/platform/social-client";
import type { ImageView } from "@/lib/platform/media";
// Share only simultaneous reads, scoped to the expected account. No result is
// retained, and focus/permission changes always begin a fresh read generation.
const flights = new Map<
  string,
  Promise<{ owner: string | null; data: { images: ImageView[] } }>
>();
let readers = 0;
const invalidate = () => flights.clear();
function observeRequests() {
  if (++readers === 1) {
    window.addEventListener("focus", invalidate);
    window.addEventListener("blur", invalidate);
    window.addEventListener("social-relationships-changed", invalidate);
    document.addEventListener("visibilitychange", invalidate);
  }
  return () => {
    if (--readers) return;
    invalidate();
    window.removeEventListener("focus", invalidate);
    window.removeEventListener("blur", invalidate);
    window.removeEventListener("social-relationships-changed", invalidate);
    document.removeEventListener("visibilitychange", invalidate);
  };
}
function avatarRequest(id: string, owner: string) {
  const key = JSON.stringify([owner, id]);
  let flight = flights.get(key);
  if (!flight) {
    flight = socialRequest<{ images: ImageView[] }>(
      `/api/platform/images?${new URLSearchParams({ purpose: "PROFILE_AVATAR", targetId: id })}`,
      undefined,
      owner
    ).finally(() => {
      if (flights.get(key) === flight) flights.delete(key);
    });
    flights.set(key, flight);
  }
  return flight;
}
export function AuthorAvatar({
  id,
  name,
  owner
}: {
  id: string;
  name: string;
  owner?: string | null;
}) {
  const [image, setImage] = useState<ImageView | null>(null);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!owner || !root.current) return;
    const unobserveRequests = observeRequests();
    let visible = false;
    let generation = 0;
    const hide = () => {
      generation++;
      setImage(null);
    };
    const load = async () => {
      if (!visible || document.visibilityState === "hidden") return;
      const seq = ++generation;
      setImage(null);
      try {
        const result = await avatarRequest(id, owner);
        if (generation === seq) setImage(result.data.images[0] ?? null);
      } catch {
        /* Initials remain when access or delivery is unavailable. */
      }
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : void load();
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) void load();
      else hide();
    });
    observer.observe(root.current);
    window.addEventListener("blur", hide);
    window.addEventListener("focus", load);
    window.addEventListener("social-relationships-changed", load);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      observer.disconnect();
      unobserveRequests();
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", load);
      window.removeEventListener("social-relationships-changed", load);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [id, owner]);
  return (
    <span ref={root} aria-hidden="true" className="gc-avatar overflow-hidden">
      {image ? (
        <img
          src={image.variants.thumb.url}
          width={40}
          height={40}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setImage(null)}
        />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </span>
  );
}
