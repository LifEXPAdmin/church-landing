"use client";
/* eslint-disable @next/next/no-img-element -- Authorized media must bypass the shared image optimizer. */
import { useState } from "react";
import type { ImageView } from "@/lib/platform/media";
import { profileInitials } from "@/lib/platform/profile-style";
export function ProfileImage({
  image,
  name,
  kind
}: {
  image: ImageView | null;
  name: string;
  kind: "avatar" | "cover";
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const className =
    kind === "avatar" ? "gc-profile-avatar" : "gc-profile-cover-image";
  if (!image || failed === image.id)
    return (
      <div className={className + " gc-profile-image-fallback"}>
        {kind === "avatar" && (
          <span aria-hidden="true">{profileInitials(name)}</span>
        )}
        {image && (
          <button
            type="button"
            onClick={() => setFailed(null)}
            className="gc-profile-photo-retry"
          >
            Retry {kind === "avatar" ? "avatar" : "cover"}
          </button>
        )}
      </div>
    );
  const small = image.variants[kind === "avatar" ? "thumb" : "medium"],
    large = image.variants[kind === "avatar" ? "medium" : "large"];
  return (
    <img
      className={className}
      src={small.url}
      srcSet={
        small.width === large.width
          ? undefined
          : `${small.url} ${small.width}w, ${large.url} ${large.width}w`
      }
      sizes={kind === "avatar" ? "128px" : "(min-width: 1280px) 1152px, 100vw"}
      width={small.width}
      height={small.height}
      alt={
        image.alt ||
        (kind === "avatar" ? `${name}'s avatar` : `${name}'s cover photo`)
      }
      loading={kind === "avatar" ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(image.id)}
    />
  );
}
