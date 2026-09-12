"use client";
/* eslint-disable @next/next/no-img-element -- Authorized media must bypass the shared image optimizer. */
import { useReadingPreferences } from "./reading-preferences";
import { useState } from "react";
import { Expand } from "lucide-react";
import { PhotoViewer } from "./photo-viewer";
import type { ImageView } from "@/lib/platform/media";
import { profileInitials } from "@/lib/platform/profile-style";
export function ProfileImage({
  image,
  name,
  kind,
  accountId,
  profileId,
  imageLabel
}: {
  image: ImageView | null;
  name: string;
  kind: "avatar" | "cover";
  accountId?: string | null;
  profileId: string;
  imageLabel?: string;
}) {
  const { preferences } = useReadingPreferences();
  const [failed, setFailed] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
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
            Retry {imageLabel ?? (kind === "avatar" ? "avatar" : "cover")}
          </button>
        )}
      </div>
    );
  const small =
      image.variants[
        kind === "avatar" || preferences.reduceData ? "thumb" : "medium"
      ],
    large = image.variants.medium;
  return (
    <>
      <button
        type="button"
        className={className + " gc-profile-photo-open"}
        aria-haspopup="dialog"
        aria-label={`Enlarge ${name}’s ${imageLabel ?? (kind === "avatar" ? "profile photo" : "cover photo")}`}
        onClick={() => setOpen(true)}
      >
        <img
          className="h-full w-full object-cover"
          src={small.url}
          srcSet={
            preferences.reduceData || small.width === large.width
              ? undefined
              : `${small.url} ${small.width}w, ${large.url} ${large.width}w`
          }
          sizes={
            kind === "avatar" ? "128px" : "(min-width: 1280px) 1152px, 100vw"
          }
          width={small.width}
          height={small.height}
          alt={
            image.alt ||
            (imageLabel
              ? `${name} ${imageLabel}`
              : kind === "avatar"
                ? `${name}'s avatar`
                : `${name}'s cover photo`)
          }
          loading={kind === "avatar" ? "eager" : "lazy"}
          decoding="async"
          onError={() => setFailed(image.id)}
        />
        <span className="gc-profile-photo-affordance">
          <Expand aria-hidden="true" size={18} />
        </span>
      </button>
      {open && (
        <PhotoViewer
          source={`/api/platform/images?${new URLSearchParams({ purpose: image.purpose, targetId: profileId })}`}
          accountId={accountId}
          initialId={image.id}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
