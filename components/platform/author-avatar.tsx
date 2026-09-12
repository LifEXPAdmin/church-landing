"use client";
/* eslint-disable @next/next/no-img-element -- Account-gated media bypasses shared image optimization. */
import { useEffect, useState } from "react";
import { socialRequest } from "@/lib/platform/social-client";
import type { ImageView } from "@/lib/platform/media";
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
  useEffect(() => {
    if (!owner) return;
    let generation = 0;
    const hide = () => {
      generation++;
      setImage(null);
    };
    const load = async () => {
      if (document.visibilityState === "hidden") return;
      const seq = ++generation;
      setImage(null);
      try {
        const result = await socialRequest<{ images: ImageView[] }>(
          `/api/platform/images?${new URLSearchParams({ purpose: "PROFILE_AVATAR", targetId: id })}`,
          undefined,
          owner
        );
        if (generation === seq) setImage(result.data.images[0] ?? null);
      } catch {
        /* Initials remain when access or delivery is unavailable. */
      }
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : void load();
    void load();
    window.addEventListener("blur", hide);
    window.addEventListener("focus", load);
    window.addEventListener("social-relationships-changed", load);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", load);
      window.removeEventListener("social-relationships-changed", load);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [id, owner]);
  return (
    <span aria-hidden="true" className="gc-avatar overflow-hidden">
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
