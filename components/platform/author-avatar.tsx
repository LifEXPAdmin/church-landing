"use client";
/* eslint-disable @next/next/no-img-element -- Account-gated media bypasses shared image optimization. */
import { useEffect, useRef, useState } from "react";
import { currentSocialOwner } from "@/lib/platform/social-client";

// Share only simultaneous reads, scoped to the expected account. No settled
// bytes or URLs are retained outside the currently visible component.
const flights = new Map<string, Promise<Blob>>();
let readers = 0;
const invalidate = () => flights.clear();
function observeRequests() {
  if (++readers === 1) {
    window.addEventListener("blur", invalidate);
    window.addEventListener("social-relationships-changed", invalidate);
    document.addEventListener("visibilitychange", invalidateHidden);
  }
  return () => {
    if (--readers) return;
    invalidate();
    window.removeEventListener("blur", invalidate);
    window.removeEventListener("social-relationships-changed", invalidate);
    document.removeEventListener("visibilitychange", invalidateHidden);
  };
}
function invalidateHidden() {
  if (document.visibilityState === "hidden") invalidate();
}
function avatarRequest(id: string, owner: string) {
  const key = JSON.stringify([owner, id]);
  let flight = flights.get(key);
  if (!flight) {
    flight = (async () => {
      // The server validates the expected account and current avatar on both
      // sides of storage delivery, replacing the preliminary identity/metadata
      // waterfall. Keep the final browser identity check before showing bytes.
      const response = await fetch(
        `/api/platform/avatars/${encodeURIComponent(id)}`,
        {
          cache: "no-store",
          credentials: "same-origin",
          headers: { "X-Expected-Account": owner }
        }
      );
      if (!response.ok || response.headers.get("content-type") !== "image/webp")
        throw new Error("Avatar unavailable");
      const bytes = await response.blob();
      if ((await currentSocialOwner()) !== owner)
        throw new Error("Your sign-in changed");
      return bytes;
    })().finally(() => {
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
  const [image, setImage] = useState<{
    id: string;
    owner: string;
    url: string;
  } | null>(null);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!owner || !root.current) return;
    const unobserveRequests = observeRequests();
    let visible = false;
    let active = false;
    let generation = 0;
    let objectUrl: string | null = null;
    const hide = () => {
      generation++;
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = null;
      setImage(null);
    };
    const load = async () => {
      if (!visible || active || document.visibilityState === "hidden") return;
      // Focus and visible events often describe the same foreground transition.
      // Only a concealment, permission change or new target starts another read.
      active = true;
      const seq = generation;
      try {
        const bytes = await avatarRequest(id, owner);
        if (generation !== seq) return;
        objectUrl = URL.createObjectURL(bytes);
        setImage({ id, owner, url: objectUrl });
      } catch {
        /* Initials remain until a new visibility/access generation can retry. */
      }
    };
    const changed = () => {
      hide();
      void load();
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
    window.addEventListener("social-relationships-changed", changed);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      observer.disconnect();
      unobserveRequests();
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", load);
      window.removeEventListener("social-relationships-changed", changed);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [id, owner]);
  return (
    <span ref={root} aria-hidden="true" className="gc-avatar overflow-hidden">
      {image && image.id === id && image.owner === owner ? (
        <img
          src={image.url}
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
