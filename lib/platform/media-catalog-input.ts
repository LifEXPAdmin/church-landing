import { createHash } from "node:crypto";
import { discoveryLanguage } from "./discovery-options";
import { PortalError } from "./portal-policy";
import { socialInput } from "./social-operations";
import { catalogSource } from "./media-catalog-sources";
import { normalizeScripture } from "./media-scripture";
import {
  MEDIA_POLICY,
  mediaFormats,
  mediaAudiences
} from "./media-catalog-options";
export function mediaText(
  v: unknown,
  max: number,
  label: string,
  required = false
): string {
  if (v === undefined || v === null) v = "";
  if (
    typeof v !== "string" ||
    !v.isWellFormed() ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)
  )
    throw new PortalError(400, `Use plain valid text for ${label}.`);
  const s = v.replace(/\r\n?/g, "\n").trim();
  if (s.length > max || (required && !s))
    throw new PortalError(
      400,
      `Check ${label}; ${required ? "a value is required, with " : "use "}at most ${max} characters.`
    );
  return s;
}
function object(v: unknown, fields: string[], label: string) {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new PortalError(400, `Check ${label}.`);
  socialInput(v as Record<string, unknown>, fields);
  return v as Record<string, unknown>;
}
function choice<const T extends readonly string[]>(
  v: unknown,
  values: T,
  label: string
): T[number] | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" || !values.includes(v))
    throw new PortalError(400, `Choose a supported ${label}.`);
  return v as T[number];
}
function number(v: unknown, max: number, label: string) {
  if (v === null || v === undefined || v === "") return null;
  if (!Number.isSafeInteger(v) || Number(v) < 1 || Number(v) > max)
    throw new PortalError(
      400,
      `Use a whole ${label} from 1 to ${max}, or leave it unknown.`
    );
  return Number(v);
}
function date(v: unknown, label: string) {
  if (v === null || v === undefined || v === "") return null;
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString().slice(0, 10) !== v
  )
    throw new PortalError(400, `Use a valid calendar date for ${label}.`);
  return v;
}
function list(v: unknown, count: number, max: number, label: string) {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > count)
    throw new PortalError(400, `Choose up to ${count} ${label}.`);
  const values = v.map((x) => mediaText(x, max, label, true));
  if (new Set(values.map((x) => x.toLowerCase())).size !== values.length)
    throw new PortalError(400, `Remove duplicate ${label}.`);
  return values;
}
export function mediaFields(value: unknown) {
  const v = object(
    value,
    [
      "title",
      "description",
      "format",
      "presentation",
      "audience",
      "durationSeconds",
      "languageIds",
      "speakers",
      "churchCredit",
      "series",
      "sequence",
      "topics",
      "scriptureRanges",
      "recordedOn",
      "details",
      "sourceUrl",
      "attribution"
    ],
    "media details"
  );
  const format = choice(v.format, mediaFormats, "format"),
    presentation = choice(
      v.presentation,
      ["AUDIO", "VIDEO"] as const,
      "presentation"
    ),
    audience = choice(v.audience, mediaAudiences, "audience");
  const source = catalogSource(v.sourceUrl);
  if (
    source &&
    presentation &&
    (source.provider === "SOUNDCLOUD"
      ? presentation !== "AUDIO"
      : presentation !== "VIDEO")
  )
    throw new PortalError(
      400,
      "Choose audio for SoundCloud or video for YouTube and Vimeo."
    );
  let details: Record<string, string | number | null> | null = null;
  if (v.details !== undefined && v.details !== null) {
    if (!format)
      throw new PortalError(
        400,
        "Choose a format before entering its details."
      );
    const allowed = {
      SERMON: ["preachedOn"],
      PODCAST: ["season", "episode", "episodeKind"],
      TESTIMONY: ["subject"],
      SERVICE: [],
      TEACHING: ["lessonNumber"]
    }[format];
    const d = object(v.details, allowed, "format details");
    details =
      format === "SERMON"
        ? { preachedOn: date(d.preachedOn, "preached date") }
        : format === "PODCAST"
          ? {
              season: number(d.season, 100000, "season"),
              episode: number(d.episode, 100000, "episode"),
              episodeKind: choice(
                d.episodeKind,
                ["FULL", "TRAILER", "BONUS"] as const,
                "episode kind"
              )
            }
          : format === "TESTIMONY"
            ? {
                subject: choice(
                  d.subject,
                  ["SELF", "CONSENTED_OTHER"] as const,
                  "testimony subject"
                )
              }
            : format === "TEACHING"
              ? {
                  lessonNumber: number(d.lessonNumber, 100000, "lesson number")
                }
              : {};
  }
  const languageIds = list(v.languageIds, 5, 30, "languages");
  for (const id of languageIds)
    if (discoveryLanguage(id) !== id)
      throw new PortalError(
        400,
        "Choose a listed language, or leave it unclassified."
      );
  return {
    title: mediaText(v.title, 160, "title"),
    description: mediaText(v.description, 5000, "description"),
    format,
    presentation,
    audience,
    durationSeconds: number(v.durationSeconds, 604800, "duration in seconds"),
    languageIds,
    speakers: list(v.speakers, 10, 120, "speaker names"),
    churchCredit: mediaText(v.churchCredit, 160, "church attribution"),
    series: mediaText(v.series, 160, "series"),
    sequence: number(v.sequence, 100000, "series sequence"),
    topics: list(v.topics, 12, 40, "topics"),
    scriptureRanges: normalizeScripture(v.scriptureRanges),
    recordedOn: date(v.recordedOn, "recorded date"),
    details,
    sourceUrl: source?.url ?? null,
    attribution: mediaText(v.attribution, 500, "public rights attribution")
  };
}
export type MediaFields = ReturnType<typeof mediaFields>;
export const mediaFingerprint = (fields: MediaFields) =>
  createHash("sha256")
    .update(JSON.stringify([MEDIA_POLICY, fields]))
    .digest("hex");
export function mediaAcknowledgment(value: unknown, fields: MediaFields) {
  if (!fields.sourceUrl) return null;
  const v = object(
    value,
    ["policy", "sourceUrl", "audience", "accepted"],
    "external-source acknowledgment"
  );
  if (
    v.policy !== MEDIA_POLICY ||
    v.sourceUrl !== fields.sourceUrl ||
    v.audience !== fields.audience ||
    v.accepted !== true
  )
    throw new PortalError(
      400,
      "Review and acknowledge this source and audience before saving."
    );
  return mediaFingerprint(fields);
}
export function mediaRights(
  value: unknown,
  fields: MediaFields,
  now = new Date()
) {
  const v = object(
    value,
    [
      "basis",
      "evidenceReference",
      "license",
      "consentReference",
      "expiresAt",
      "reviewed",
      "publicRecording",
      "textRights"
    ],
    "rights review"
  );
  const basis = choice(
    v.basis,
    ["OWN", "PERMISSION", "LICENSE"] as const,
    "rights basis"
  );
  const evidenceReference = mediaText(
      v.evidenceReference,
      160,
      "private permission reference"
    ),
    license = mediaText(v.license, 500, "license identification"),
    consentReference = mediaText(
      v.consentReference,
      160,
      "private testimony consent reference"
    );
  const expiry = mediaText(v.expiresAt, 30, "rights expiry");
  const expiresAt = expiry ? new Date(expiry) : null;
  if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now))
    throw new PortalError(
      400,
      "Use a future rights expiry, or leave it without an expiry."
    );
  if (
    !basis ||
    v.reviewed !== true ||
    v.publicRecording !== true ||
    v.textRights !== true ||
    (basis === "PERMISSION" && !evidenceReference) ||
    (basis === "LICENSE" && !license) ||
    (fields.format === "TESTIMONY" &&
      fields.details?.subject === "CONSENTED_OTHER" &&
      !consentReference)
  )
    throw new PortalError(
      400,
      "Review current source and text rights, public recorded-source access, and any required permission or testimony consent before publication."
    );
  return {
    basis,
    evidenceReference,
    license,
    consentReference,
    expiresAt,
    fingerprint: mediaFingerprint(fields),
    policy: MEDIA_POLICY,
    assertedAt: now
  };
}
export function requireMediaPublication(f: MediaFields) {
  if (
    !f.title ||
    !f.format ||
    !f.presentation ||
    !f.audience ||
    !f.sourceUrl ||
    !f.details ||
    (f.format === "PODCAST" && !f.details.episodeKind) ||
    (f.format === "TESTIMONY" && !f.details.subject)
  )
    throw new PortalError(
      400,
      "Add a title, format and its required details, audio/video choice, audience and supported source before publishing. Your draft is preserved."
    );
}
