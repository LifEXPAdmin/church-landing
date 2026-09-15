"use client";
/* eslint-disable @next/next/no-img-element -- Private feedback images bypass shared optimization. */
import { useState } from "react";
import Link from "next/link";
import { reportEntryHref } from "@/lib/platform/community-report-types";
import type { ImageView } from "@/lib/platform/media";
import type { SupportDetail } from "@/lib/platform/support-types";
import { useReadVisibility } from "./read-visibility";
import { PhotoViewer } from "./photo-viewer";
import { SupportForm } from "./support-form";
import { useReadingPreferences } from "./reading-preferences";
export function FeedbackImagePreview({
  image,
  open
}: {
  image: ImageView;
  open?: () => void;
}) {
  const [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  const { preferences } = useReadingPreferences();
  const visible = useReadVisibility();
  if (!visible) return null;
  if (failed)
    return (
      <div className="space-y-2">
        <p role="status">This private image could not be loaded.</p>
        <button
          type="button"
          className="gc-button gc-button-quiet"
          onClick={() => {
            setFailed(false);
            setAttempt((a) => a + 1);
          }}
        >
          Retry image
        </button>
      </div>
    );
  const variant = image.variants[preferences.reduceData ? "thumb" : "medium"];
  const picture = (
    <img
      key={attempt}
      src={variant.url}
      width={variant.width}
      height={variant.height}
      loading="lazy"
      decoding="async"
      alt={image.alt || "Selected feedback attachment"}
      className="h-auto max-h-80 w-full max-w-full rounded-xl object-contain"
      onError={() => setFailed(true)}
    />
  );
  return (
    <figure className="space-y-2">
      {open ? (
        <button
          type="button"
          className="block w-full rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
          aria-label={`Enlarge attachment${image.caption ? `: ${image.caption}` : ""}`}
          aria-haspopup="dialog"
          onClick={open}
        >
          {picture}
          <span className="inline-flex min-h-11 items-center text-sm text-gc-accent underline">
            Enlarge image
          </span>
        </button>
      ) : (
        picture
      )}
      {image.caption && (
        <figcaption className="break-words text-sm text-gc-muted">
          {image.caption}
        </figcaption>
      )}
    </figure>
  );
}
export function FeedbackAttachmentImages({
  owner,
  detail: c,
  onRefresh
}: {
  owner: string;
  detail: SupportDetail;
  onRefresh?: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  if (!c.feedback?.attachments.length) return null;
  return (
    <section className="space-y-5" aria-label="Private feedback attachments">
      <h3 className="text-xl font-semibold">Private attachments</h3>
      <p className="text-sm text-gc-muted">
        These images are available only to this receipt’s current authorized
        participants.
      </p>
      <ul className="grid gap-5 sm:grid-cols-2">
        {c.feedback.attachments.map((image) => (
          <li
            key={image.id}
            className="min-w-0 space-y-3 rounded-xl border border-gc-divider p-4"
          >
            <FeedbackImagePreview
              image={image}
              open={() => setSelected(image.id)}
            />
            <Link
              href={reportEntryHref("FEEDBACK_ATTACHMENT", image.id)}
              prefetch={false}
              className="inline-flex min-h-11 items-center text-sm text-gc-accent underline"
            >
              Report this attachment
            </Link>
            {c.access.requester && (
              <SupportForm
                owner={owner}
                operation="feedback-remove-attachment"
                endpoint="/api/platform/feedback"
                fixed={{
                  caseId: c.id,
                  expectedVersion: c.version,
                  assetId: image.id,
                  assetVersion: image.version
                }}
                onRefresh={onRefresh}
                button="Remove this attachment"
                caution="Removes this image from the receipt. The written feedback stays saved."
              />
            )}
          </li>
        ))}
      </ul>
      {selected && (
        <PhotoViewer
          source={`/api/platform/feedback?view=attachments&caseId=${encodeURIComponent(c.id)}`}
          accountId={owner}
          initialId={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
