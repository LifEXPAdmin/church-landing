"use client";
import Link from "next/link";
import { useId, useState } from "react";
import type {
  SupportDetail,
  SupportSnapshot
} from "@/lib/platform/support-types";
import {
  FEEDBACK_NOTICE,
  feedbackKinds,
  feedbackChannelLabels,
  type FeedbackKind
} from "@/lib/platform/feedback-types";
import { metricBrowsers, metricDevices } from "@/lib/platform/metric-policy";
import { SupportForm } from "./support-form";
import type { ImageView } from "@/lib/platform/media";
import { socialRequest } from "@/lib/platform/social-client";
import { PhotoUploadManager } from "./photo-upload-manager";
import { FeedbackImagePreview } from "./feedback-attachment-images";

export const feedbackInputClass =
  "block min-h-11 w-full min-w-0 rounded-xl border border-gc-divider bg-gc-canvas px-3 py-3 text-base text-gc-text focus:border-gc-action focus:outline-none focus:ring-2 focus:ring-gc-focus";
type Choices = NonNullable<SupportDetail["feedback"]>;
function readChoices(data: FormData, kind: string) {
  const contactAllowed = data.get("contactAllowed") === "on";
  return {
    contactAllowed,
    channels: contactAllowed ? data.getAll("channels") : [],
    allowIdea: kind === "SUGGESTION" && data.get("allowIdea") === "on",
    publicAttribution:
      kind === "SUGGESTION" && data.get("publicAttribution") === "on"
  };
}
function FeedbackChoicesFields({
  kind,
  initial
}: {
  kind: string;
  initial?: Choices;
}) {
  return (
    <div className="space-y-5">
      <fieldset className="min-w-0 space-y-3 rounded-xl border border-gc-divider p-4">
        <legend className="px-1 font-semibold">May we follow up?</legend>
        <Check name="contactAllowed" checked={initial?.contactAllowed}>
          Allow staff to ask about this feedback.
        </Check>
        <p className="text-sm text-gc-muted">
          Optional. If you allow follow-up, choose at least one channel. Your
          private receipt stays available with permission off. Device and email
          delivery also depend on your{" "}
          <Link
            className="underline"
            href="/platform/settings/notifications/availability"
          >
            notification preferences
          </Link>{" "}
          and availability.
        </p>
        {Object.entries(feedbackChannelLabels).map(([value, label]) => (
          <Check
            key={value}
            name="channels"
            value={value}
            checked={
              value === "IN_APP"
                ? initial?.contactInApp
                : value === "EMAIL"
                  ? initial?.contactEmail
                  : initial?.contactPush
            }
          >
            {label}
          </Check>
        ))}
      </fieldset>
      <fieldset
        hidden={kind !== "SUGGESTION"}
        disabled={kind !== "SUGGESTION"}
        className="min-w-0 space-y-3 rounded-xl border border-gc-divider p-4"
      >
        <legend className="px-1 font-semibold">
          A separate choice about sharing the idea
        </legend>
        <Check name="allowIdea" checked={initial?.allowIdea}>
          Allow a reviewed summary of this suggestion to appear on the public
          ideas board.
        </Check>
        <Check name="publicAttribution" checked={initial?.publicAttribution}>
          Also allow my name to be shown with that reviewed summary.
        </Check>
        <p className="text-sm text-gc-muted">
          Both are optional. Your original feedback and attachments stay
          private. Attribution requires permission to share the idea. You can
          change these choices in My feedback; people may already have seen a
          previously published summary.
        </p>
      </fieldset>
    </div>
  );
}
function Check({
  name,
  value,
  checked,
  children
}: {
  name: string;
  value?: string;
  checked?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={checked ?? false}
        className="mt-1 h-5 w-5 shrink-0 accent-[#e6b56c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      />
      <span>{children}</span>
    </label>
  );
}

export function FeedbackForm({
  snapshot: s,
  release,
  onRefresh,
  promptClaimId
}: {
  snapshot: SupportSnapshot;
  release: string;
  onRefresh: () => void;
  promptClaimId?: string;
}) {
  const [kind, setKind] = useState<FeedbackKind>("GENERAL"),
    [context, setContext] = useState(false);
  const id = useId();
  const [attachments, setAttachments] = useState<ImageView[]>([]),
    [uploadPending, setUploadPending] = useState(false),
    [removing, setRemoving] = useState<string | null>(null),
    [attachmentNotice, setAttachmentNotice] = useState("");
  const recipient = s.intake.recipient;
  // Keep a mounted draft when the recipient or availability changes. The native
  // form requires a deliberate version review, and the server checks readiness.
  return (
    <SupportForm
      owner={s.viewer.id}
      operation="feedback-create"
      endpoint="/api/platform/feedback"
      createdBase="/platform/feedback/cases"
      onRefresh={onRefresh}
      fixed={{
        recipientId: recipient?.id ?? null,
        recipientVersion: recipient?.version ?? null,
        notice: FEEDBACK_NOTICE
      }}
      available={s.intake.available && !uploadPending && !removing}
      additionalWork={{
        dirty: attachments.length > 0,
        saving: uploadPending || !!removing
      }}
      onConfirmed={() => setAttachments([])}
      readFields={(data) => ({
        kind,
        ...(promptClaimId ? { promptClaimId } : {}),
        attachments: attachments.map((a) => a.id),
        rating: data.get("rating") ? Number(data.get("rating")) : null,
        subject: data.get("subject"),
        description: data.get("description"),
        ...(kind === "BUG"
          ? {
              actual: data.get("actual"),
              expected: data.get("expected"),
              steps: data.get("steps")
            }
          : {}),
        ...(kind === "SUGGESTION"
          ? { outcome: data.get("outcome"), helps: data.get("helps") }
          : {}),
        ...readChoices(data, kind),
        consent: data.get("consent") === "on",
        ...(context
          ? {
              technicalContext: {
                release,
                device: data.get("device"),
                browser: data.get("browser"),
                errorReference: data.get("errorReference")
              }
            }
          : {})
      })}
      onDiscard={() => {
        setKind("GENERAL");
        setContext(false);
      }}
      button="Send feedback"
      caution="Up to five new requests each day. Every rating receives the same access to help. This saves a private receipt; it does not promise a response time or send an email."
    >
      <label className="block font-semibold">
        What would you like to share?
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as FeedbackKind)}
          className={feedbackInputClass}
        >
          {Object.entries(feedbackKinds).map(([value, label]) => (
            <option
              key={value}
              value={value}
              disabled={value === "SUGGESTION" && !s.viewer.verified}
            >
              {label}
              {value === "SUGGESTION" && !s.viewer.verified
                ? " — verify email first"
                : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="block font-semibold">
        How has the website been for you? (optional)
        <select name="rating" className={feedbackInputClass} defaultValue="">
          <option value="">Skip rating</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n} of 5{n === 1 ? " — poor" : n === 5 ? " — excellent" : ""}
            </option>
          ))}
        </select>
      </label>
      <TextField name="subject" label="Short summary (optional)" max={120} />
      <fieldset
        hidden={kind !== "BUG"}
        disabled={kind !== "BUG"}
        className="min-w-0 space-y-4"
      >
        <legend className="sr-only">Problem details</legend>
        <TextField name="actual" label="What happened?" max={1200} required />
        <TextField
          name="expected"
          label="What did you expect?"
          max={800}
          required
        />
        <TextField
          name="steps"
          label="How can we reproduce it? (optional)"
          max={800}
        />
      </fieldset>
      <fieldset
        hidden={kind !== "SUGGESTION"}
        disabled={kind !== "SUGGESTION"}
        className="min-w-0 space-y-4"
      >
        <legend className="sr-only">Suggestion details</legend>
        <TextField
          name="outcome"
          label="What would you like to be able to do?"
          max={1600}
          required
        />
        <TextField
          name="helps"
          label="Who would this help?"
          max={400}
          required
        />
      </fieldset>
      <TextField
        name="description"
        label={
          kind === "GENERAL"
            ? "Your experience (optional with a rating)"
            : "Anything else? (optional)"
        }
        max={3000}
      />
      <p className="text-sm text-gc-muted">
        Use up to 3,000 characters across the feedback details. Leave out
        passwords, sign-in codes, private member lists and sensitive pastoral
        information.
      </p>
      <FeedbackChoicesFields kind={kind} />
      <PhotoUploadManager
        ownerId={s.viewer.id}
        targetId={s.viewer.id}
        purpose="SUPPORT_ATTACHMENT"
        available={s.intake.available && !removing}
        remaining={3 - attachments.length}
        onPending={setUploadPending}
        onSaved={(image) => {
          setAttachments((current) =>
            current.some((a) => a.id === image.id)
              ? current
              : [...current, image]
          );
        }}
      />
      {attachments.length > 0 && (
        <section
          className="min-w-0 space-y-4"
          aria-label="Uploaded feedback attachments"
        >
          <h3 className="text-xl font-semibold">
            Ready to include with your feedback
          </h3>
          <p className="text-sm text-gc-muted">
            Sending feedback includes every image below. Remove an image here to
            discard it. Discarding the written form does not remove these
            uploads.
          </p>
          <ul className="min-w-0 space-y-4">
            {attachments.map((image) => (
              <li
                key={image.id}
                className="min-w-0 space-y-3 rounded-xl border border-gc-divider p-4"
              >
                <FeedbackImagePreview image={image} />
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  disabled={!!removing}
                  onClick={async () => {
                    if (removing) return;
                    setRemoving(image.id);
                    setAttachmentNotice("");
                    try {
                      const { data } = await socialRequest<{
                        removed: boolean;
                      }>(
                        "/api/platform/feedback",
                        JSON.stringify({
                          operation: "feedback-remove-upload",
                          assetId: image.id,
                          assetVersion: image.version
                        }),
                        s.viewer.id
                      );
                      if (!data.removed)
                        throw Error(
                          "Removal is unconfirmed. Retry removing this image."
                        );
                      setAttachments((current) =>
                        current.filter((a) => a.id !== image.id)
                      );
                      setAttachmentNotice("Private upload removed.");
                    } catch (error) {
                      setAttachmentNotice(
                        error instanceof Error
                          ? error.message
                          : "Removal is unconfirmed. Retry removing this image."
                      );
                    } finally {
                      setRemoving(null);
                    }
                  }}
                >
                  {removing === image.id
                    ? "Removing…"
                    : "Remove uploaded attachment"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p role="status" className="text-sm text-gc-muted">
        {attachmentNotice ||
          (uploadPending
            ? "Finish or remove selected uploads before sending feedback. Your written entries are kept."
            : "")}
      </p>
      <div className="min-w-0 space-y-3 rounded-xl border border-gc-divider p-4">
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={context}
            onChange={(e) => setContext(e.target.checked)}
            aria-controls={`${id}-context`}
            className="h-5 w-5 accent-[#e6b56c]"
          />
          Include optional technical context I review below
        </label>
        <fieldset
          id={`${id}-context`}
          hidden={!context}
          disabled={!context}
          className="min-w-0 space-y-4"
        >
          <legend className="sr-only">Review optional technical context</legend>
          <p>App version: {release}</p>
          <label className="block">
            Device category
            <select name="device" className={feedbackInputClass}>
              {Object.entries(metricDevices).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Browser category
            <select name="browser" className={feedbackInputClass}>
              {Object.entries(metricBrowsers).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Error reference shown by the app (optional)
            <input
              name="errorReference"
              maxLength={48}
              pattern="[A-Z0-9][A-Z0-9_-]{2,47}"
              className={feedbackInputClass}
            />
          </label>
          <p className="text-sm text-gc-muted">
            Only these displayed fields are included. Page addresses, page
            content and screenshots are not collected automatically.
          </p>
        </fieldset>
      </div>
      <label className="flex min-h-11 items-start gap-3">
        <input
          required
          type="checkbox"
          name="consent"
          className="mt-1 h-5 w-5 shrink-0 accent-[#e6b56c]"
        />
        <span>
          I have read the privacy notice and agree to share this feedback with
          the named Godschurches support owner.
        </span>
      </label>
    </SupportForm>
  );
}
function TextField({
  name,
  label,
  max,
  required = false
}: {
  name: string;
  label: string;
  max: number;
  required?: boolean;
}) {
  return (
    <label className="block font-semibold">
      {label}
      <textarea
        name={name}
        maxLength={max}
        minLength={required ? 3 : undefined}
        required={required}
        rows={name === "subject" ? 2 : 4}
        className={feedbackInputClass}
      />
    </label>
  );
}
export function FeedbackChoices({
  owner,
  detail: c,
  onRefresh
}: {
  owner: string;
  detail: SupportDetail;
  onRefresh: () => void;
}) {
  if (!c.feedback || c.feedback.redactedAt || !c.access.requester) return null;
  return (
    <SupportForm
      owner={owner}
      operation="feedback-choices"
      endpoint="/api/platform/feedback"
      fixed={{
        caseId: c.id,
        expectedVersion: c.version,
        feedbackVersion: c.feedback.version
      }}
      onRefresh={onRefresh}
      readFields={(data) => readChoices(data, c.feedback!.kind)}
      button="Save contact and sharing choices"
    >
      <FeedbackChoicesFields kind={c.feedback.kind} initial={c.feedback} />
    </SupportForm>
  );
}
