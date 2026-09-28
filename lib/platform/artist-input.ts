import { createHash } from "node:crypto";
import { mediaText as sourceText } from "./media-catalog-input";
import { socialInput } from "./social-operations";
import { PortalError } from "./portal-policy";
import { discoveryCountries } from "./discovery-options";
import { artistLink } from "./artist-links";
import {
  ARTIST_POLICY,
  artistRoles,
  type ArtistFields,
  type ReleaseFields
} from "./artist-types";
function mediaText(
  value: unknown,
  max: number,
  label: string,
  required = false
) {
  if (typeof value === "string" && /[\u0080-\u009f]/.test(value))
    throw new PortalError(400, `Use plain valid text for ${label}.`);
  return sourceText(value, max, label, required);
}
export function artistObject(v: unknown, keys: string[]) {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new PortalError(400, "Review these entries.");
  socialInput(v as Record<string, unknown>, keys);
  return v as Record<string, unknown>;
}
function list(v: unknown, max: number, label: string): unknown[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > max)
    throw new PortalError(400, `Use up to ${max} ${label}.`);
  return v;
}
function credits(v: unknown) {
  return list(v, 30, "credits").map((x) => {
    const c = artistObject(x, ["name", "role"]);
    return {
      name: mediaText(c.name, 120, "credit name", true),
      role: mediaText(c.role, 80, "credit role", true)
    };
  });
}
function strings(v: unknown, max: number, length: number, label: string) {
  const out = list(v, max, label).map((x) => mediaText(x, length, label, true));
  if (new Set(out.map((x) => x.toLocaleLowerCase("en"))).size !== out.length)
    throw new PortalError(400, `Remove duplicate ${label}.`);
  return out;
}
export function artistFields(value: unknown): ArtistFields {
  const v = artistObject(value, [
    "name",
    "biography",
    "presentation",
    "roles",
    "genres",
    "countryId",
    "townId",
    "churchCredit",
    "credits"
  ]);
  if (
    typeof v.presentation !== "string" ||
    !["PERSON", "TEAM"].includes(v.presentation)
  )
    throw new PortalError(400, "Choose a person or team presentation.");
  const roles = strings(v.roles, 8, 40, "artist roles");
  if (
    roles.some((x) => !artistRoles.includes(x as (typeof artistRoles)[number]))
  )
    throw new PortalError(400, "Choose a supported artist role.");
  const countryId = mediaText(v.countryId, 2, "country") || null;
  if (countryId && !discoveryCountries.some((x) => x.id === countryId))
    throw new PortalError(400, "Choose a supported country.");
  const townId = mediaText(v.townId, 12, "town reference") || null;
  if (
    townId &&
    (!countryId ||
      !/^([1-9][0-9]{0,10})$/.test(townId) ||
      !Number.isSafeInteger(Number(townId)))
  )
    throw new PortalError(400, "Choose a named town in the selected country.");
  return {
    name: mediaText(v.name, 160, "artist name", true),
    biography: mediaText(v.biography, 5000, "biography"),
    presentation: v.presentation as "PERSON" | "TEAM",
    roles,
    genres: strings(v.genres, 10, 40, "genres"),
    countryId,
    townId,
    churchCredit: mediaText(v.churchCredit, 160, "supplied church credit"),
    credits: credits(v.credits)
  };
}
function links(v: unknown, max: number) {
  const out = list(v, max, "listening links").map((x) =>
    artistLink(typeof x === "string" ? x : artistObject(x, ["url"]).url)
  );
  if (new Set(out.map((x) => x.url)).size !== out.length)
    throw new PortalError(400, "Remove duplicate listening links.");
  return out;
}
export function releaseFields(value: unknown): ReleaseFields {
  const v = artistObject(value, [
    "kind",
    "title",
    "description",
    "releaseDate",
    "tracks",
    "credits",
    "links"
  ]);
  if (typeof v.kind !== "string" || !["SINGLE", "EP", "ALBUM"].includes(v.kind))
    throw new PortalError(400, "Choose a single, EP or album.");
  const date = mediaText(v.releaseDate, 10, "release date") || null;
  if (
    date &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date)
  )
    throw new PortalError(400, "Use a valid date for the release.");
  const tracks = list(v.tracks, 50, "tracks").map((x) => {
    const t = artistObject(x, ["id", "title", "durationSeconds", "links"]);
    const id = mediaText(t.id, 80, "track reference", true);
    if (!/^[A-Za-z0-9_-]+$/.test(id))
      throw new PortalError(400, "Use a stable track reference.");
    const duration = t.durationSeconds ?? null;
    if (
      duration !== null &&
      (!Number.isSafeInteger(duration) ||
        Number(duration) < 1 ||
        Number(duration) > 604800)
    )
      throw new PortalError(
        400,
        "Track duration must be from 1 to 604800 seconds."
      );
    const urls = links(t.links, 3);
    if (urls.some((l) => l.kind !== "track"))
      throw new PortalError(400, "Use track links for an individual track.");
    return {
      id,
      title: mediaText(t.title, 160, "track title"),
      durationSeconds: duration as number | null,
      links: urls
    };
  });
  if (new Set(tracks.map((t) => t.id)).size !== tracks.length)
    throw new PortalError(400, "Each track needs its own stable reference.");
  const urls = links(v.links, 5);
  if (v.kind !== "SINGLE" && urls.some((l) => l.kind === "track"))
    throw new PortalError(
      400,
      "Use album links for an EP or album, and place track links on the named track."
    );
  return {
    kind: v.kind as ReleaseFields["kind"],
    title: mediaText(v.title, 160, "release title"),
    description: mediaText(v.description, 5000, "release description"),
    releaseDate: date,
    tracks,
    credits: credits(v.credits),
    links: urls
  };
}
export function artistFingerprint(fields: ArtistFields | ReleaseFields) {
  return createHash("sha256").update(JSON.stringify(fields)).digest("hex");
}
export function artistRights(
  value: unknown,
  fields: ArtistFields | ReleaseFields,
  actorId: string
) {
  const v = artistObject(value, ["policy", "confirmed", "basis", "expiresAt"]);
  if (
    v.policy !== ARTIST_POLICY ||
    v.confirmed !== true ||
    typeof v.basis !== "string" ||
    !["OWN_WORK", "CURRENT_PERMISSION"].includes(v.basis)
  )
    throw new PortalError(
      400,
      "Confirm current authority and publication permission for all supplied material and links."
    );
  let expiresAt: Date | null = null;
  if (v.expiresAt !== undefined && v.expiresAt !== null && v.expiresAt !== "") {
    if (
      typeof v.expiresAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v.expiresAt)
    )
      throw new PortalError(400, "Use an exact expiry date and time.");
    expiresAt = new Date(v.expiresAt);
    if (
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt.toISOString() !== v.expiresAt ||
      expiresAt.getTime() <= Date.now()
    )
      throw new PortalError(400, "Rights expiry must be in the future.");
  }
  return {
    rightsFingerprint: artistFingerprint(fields),
    rightsPolicy: ARTIST_POLICY,
    rightsBasis: String(v.basis),
    rightsActorId: actorId,
    rightsAssertedAt: new Date(),
    rightsExpiresAt: expiresAt
  };
}
export function requireReleasePublication(f: ReleaseFields) {
  if (
    !f.title ||
    !f.tracks.length ||
    f.tracks.some((t) => !t.title) ||
    (f.kind === "SINGLE" && f.tracks.length !== 1) ||
    (!f.links.length && !f.tracks.some((t) => t.links.length))
  )
    throw new PortalError(
      400,
      "Publication needs a title, named tracks and a supported listening link. A single has exactly one track."
    );
}
