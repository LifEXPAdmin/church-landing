import type { PlatformPost } from "@prisma/client";
import {
  denominationKey,
  discoveryCountry,
  discoveryLanguage,
  discoveryPlaceId
} from "./discovery-options";
import { getDiscoveryPlace } from "./discovery-places";
import { PortalError } from "./portal-policy";

export type PostDiscoveryInput = {
  language: string | null;
  denomination: string | null;
  country: string | null;
  placeId: number | null;
  shareLocality: boolean;
};
export function parsePostDiscovery(
  value: unknown,
  requireConsent = true
): PostDiscoveryInput {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          "language",
          "denomination",
          "country",
          "placeId",
          "shareLocality"
        ].includes(key)
    )
  )
    throw new PortalError(400, "Use the supported optional discovery fields.");
  const p = value as Record<string, unknown>;
  if (p.shareLocality !== undefined && typeof p.shareLocality !== "boolean")
    throw new PortalError(
      400,
      "Choose whether to publish this broad locality."
    );
  const result = {
    language: discoveryLanguage(p.language),
    denomination:
      p.denomination == null || p.denomination === ""
        ? null
        : denominationKey(p.denomination) || null,
    country: discoveryCountry(p.country),
    placeId: discoveryPlaceId(p.placeId),
    shareLocality: p.shareLocality === true
  };
  if (
    requireConsent &&
    (result.country || result.placeId) &&
    !result.shareLocality
  )
    throw new PortalError(
      400,
      "Confirm sharing this broad locality with the post, or clear the location fields."
    );
  if (result.placeId && !result.country)
    throw new PortalError(400, "Choose the country for this town or area.");
  return result;
}
export async function postDiscoveryData(value: unknown) {
  const p = parsePostDiscovery(value),
    place = await getDiscoveryPlace(p.country, p.placeId);
  return {
    discoveryLanguage: p.language,
    discoveryDenomination: p.denomination,
    discoveryCountry: p.country,
    discoveryPlaceId: place?.id ?? null,
    discoveryRegion: place?.region ?? null,
    discoveryLatitude: place?.latitude ?? null,
    discoveryLongitude: place?.longitude ?? null
  };
}
export function postDiscoveryInput(
  post: Pick<
    PlatformPost,
    | "discoveryLanguage"
    | "discoveryDenomination"
    | "discoveryCountry"
    | "discoveryPlaceId"
  >
): PostDiscoveryInput {
  return {
    language: post.discoveryLanguage,
    denomination: post.discoveryDenomination,
    country: post.discoveryCountry,
    placeId: post.discoveryPlaceId,
    shareLocality: post.discoveryCountry !== null
  };
}
