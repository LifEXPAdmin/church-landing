import { PortalError } from "./portal-policy";
import { metricBrowsers, metricDevices } from "./metric-policy";

import {
  FEEDBACK_NOTICE,
  feedbackKinds,
  feedbackChannels,
  type FeedbackKind
} from "./feedback-types";
export {
  FEEDBACK_NOTICE,
  feedbackKinds,
  feedbackChannels,
  type FeedbackKind
} from "./feedback-types";
export const feedbackChoiceFields = [
  "contactAllowed",
  "channels",
  "allowIdea",
  "publicAttribution"
];
export const feedbackCreateFields = [
  "kind",
  "rating",
  "subject",
  "description",
  "actual",
  "expected",
  "steps",
  "outcome",
  "helps",
  "technicalContext",
  "attachments",
  "recipientId",
  "recipientVersion",
  "notice",
  "consent",
  ...feedbackChoiceFields
];
const invalid = (message: string) => new PortalError(400, message);
function text(value: unknown, max: number, min = 0) {
  if (value == null && !min) return "";
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  )
    throw invalid(
      "Check the feedback fields and their length. Use ordinary text."
    );
  return value.trim();
}
export function parseFeedbackChoices(
  input: Record<string, unknown>,
  kind: string
) {
  for (const field of ["contactAllowed", "allowIdea", "publicAttribution"])
    if (typeof input[field] !== "boolean")
      throw invalid("Review each feedback sharing and contact choice.");
  const channels = input.channels;
  if (
    !Array.isArray(channels) ||
    channels.length > 3 ||
    new Set(channels).size !== channels.length ||
    channels.some((c) => !feedbackChannels.includes(c)) ||
    (!input.contactAllowed && channels.length > 0) ||
    (input.contactAllowed && !channels.length)
  )
    throw invalid(
      "Choose how staff may follow up, or leave contact permission off."
    );
  if (
    (input.publicAttribution && !input.allowIdea) ||
    (input.allowIdea && kind !== "SUGGESTION")
  )
    throw invalid(
      "Public attribution requires your separate permission to share a reviewed suggestion."
    );
  return {
    contactAllowed: input.contactAllowed as boolean,
    contactInApp: channels.includes("IN_APP"),
    contactEmail: channels.includes("EMAIL"),
    contactPush: channels.includes("PUSH"),
    allowIdea: input.allowIdea as boolean,
    publicAttribution: input.publicAttribution as boolean
  };
}
function technicalContext(value: unknown) {
  const empty = {
    contextRelease: null as string | null,
    contextDevice: null as string | null,
    contextBrowser: null as string | null,
    contextErrorRef: null as string | null
  };
  if (value == null) return empty;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid("Review the optional technical context.");
  const context = value as Record<string, unknown>;
  if (
    Object.keys(context).some(
      (k) => !["release", "device", "browser", "errorReference"].includes(k)
    )
  )
    throw invalid(
      "Technical context cannot contain addresses or extra account information."
    );
  if (
    typeof context.release !== "string" ||
    !/^20\d{2}\.\d{2}\.\d{2}\.\d{1,4}$/.test(context.release)
  )
    throw invalid("Review the app version in the optional technical context.");
  if (
    typeof context.device !== "string" ||
    !Object.hasOwn(metricDevices, context.device) ||
    typeof context.browser !== "string" ||
    !Object.hasOwn(metricBrowsers, context.browser)
  )
    throw invalid("Choose a supported coarse browser and device category.");
  const errorReference = text(context.errorReference, 48);
  if (errorReference && !/^[A-Z0-9][A-Z0-9_-]{2,47}$/.test(errorReference))
    throw invalid("Use only the safe error reference shown by the app.");
  return {
    contextRelease: context.release,
    contextDevice: context.device,
    contextBrowser: context.browser,
    contextErrorRef: errorReference || null
  };
}
export function parseFeedback(input: Record<string, unknown>) {
  if (
    typeof input.kind !== "string" ||
    !Object.hasOwn(feedbackKinds, input.kind)
  )
    throw invalid("Choose feedback, a problem or a suggestion.");
  const kind = input.kind as FeedbackKind;
  const rating = input.rating == null ? null : input.rating;
  if (
    rating !== null &&
    (!Number.isInteger(rating) || Number(rating) < 1 || Number(rating) > 5)
  )
    throw invalid("Choose a rating from one to five, or leave it empty.");
  const explanation = text(input.description, 3000);
  const actual = text(input.actual, 1200, kind === "BUG" ? 3 : 0);
  const expected = text(input.expected, 800, kind === "BUG" ? 3 : 0);
  const steps = text(input.steps, 800);
  const outcome = text(input.outcome, 1600, kind === "SUGGESTION" ? 3 : 0);
  const helps = text(input.helps, 400, kind === "SUGGESTION" ? 3 : 0);
  if (kind !== "BUG" && (actual || expected || steps))
    throw invalid("Problem details belong to Report a problem.");
  if (kind !== "SUGGESTION" && (outcome || helps))
    throw invalid("Suggestion details belong to Suggest an improvement.");
  if (kind === "GENERAL" && rating === null && explanation.length < 3)
    throw invalid("Add a rating or a few words about your experience.");
  const body =
    kind === "BUG"
      ? `What happened:\n${actual}\n\nExpected:\n${expected}${steps ? `\n\nSteps:\n${steps}` : ""}${explanation ? `\n\nAdditional context:\n${explanation}` : ""}`
      : kind === "SUGGESTION"
        ? `Desired outcome:\n${outcome}\n\nWho it would help:\n${helps}${explanation ? `\n\nAdditional context:\n${explanation}` : ""}`
        : explanation ||
          `Submitted website experience rating: ${rating} out of 5.`;
  if (body.length > 3000)
    throw invalid(
      "Keep the combined feedback details within 3,000 characters."
    );
  return {
    subject: text(input.subject, 120) || feedbackKinds[kind],
    description: body,
    bugActual: actual,
    bugExpected: expected,
    bugSteps: steps,
    metadata: {
      notice: FEEDBACK_NOTICE,
      kind,
      rating: rating as number | null,
      entryPoint: "VOLUNTARY",
      ...parseFeedbackChoices(input, kind),
      ...technicalContext(input.technicalContext)
    }
  };
}

export const emptyFeedback = {
  rating: null,
  contactAllowed: false,
  contactInApp: false,
  contactEmail: false,
  contactPush: false,
  allowIdea: false,
  publicAttribution: false,
  contextRelease: null,
  contextDevice: null,
  contextBrowser: null,
  contextErrorRef: null
};
