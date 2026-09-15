import type { Prisma } from "@prisma/client";
import { feedReadableWhere } from "./feed-policy";
import { readableAssetWhere } from "./personal-photo-policy";
import type { PostContext } from "./post-access";
import type { DiscoveryMode, DiscoveryPreferences } from "./discovery-options";
import { effectiveDiscoverySort } from "./discovery-options";
import type { DiscoveryPlace } from "./discovery-places";
import { townDistanceKm } from "./discovery-places";
import { POST_TOPICS } from "./post-options";
import { eligibleWhere } from "./portal-policy";
import { repostSourceWhere } from "./repost-policy";

export function discoveryHiddenWhere(
  context: PostContext,
  prefs: Pick<DiscoveryPreferences, "hiddenWords" | "hiddenTopics">
): Prisma.PlatformPostWhereInput {
  return {
    AND: [
      ...(prefs.hiddenTopics.length
        ? [{ NOT: { topics: { hasSome: prefs.hiddenTopics } } }]
        : []),
      ...prefs.hiddenWords.map((word): Prisma.PlatformPostWhereInput => {
        const contains = {
          contains: word.replace(/[\\%_]/g, "\\$&"),
          mode: "insensitive" as const
        };
        return {
          NOT: {
            OR: [
              { content: contains },
              { scripture: { not: null, ...contains } },
              { contentNote: { not: null, ...contains } },
              { safeExcerpt: { not: null, ...contains } },
              { linkTitle: { not: null, ...contains } },
              { linkDescription: { not: null, ...contains } },
              {
                topics: {
                  hasSome: POST_TOPICS.filter((topic) => topic.includes(word))
                }
              },
              {
                images: {
                  some: {
                    AND: [
                      readableAssetWhere(context),
                      { purpose: "POST_PHOTO", caption: contains }
                    ]
                  }
                }
              },
              {
                photoReferences: {
                  some: {
                    asset: {
                      AND: [readableAssetWhere(context), { caption: contains }]
                    }
                  }
                }
              }
            ]
          }
        };
      })
    ]
  };
}
export function discoveryReadableWhere(
  context: PostContext,
  mode: DiscoveryMode,
  prefs: DiscoveryPreferences,
  at: Date,
  place: DiscoveryPlace | null = null
): Prisma.PlatformPostWhereInput {
  const f = prefs.filters;
  const hard: Prisma.PlatformPostWhereInput = {
    AND: [
      geographicCandidateWhere(mode, prefs, place),
      ...(mode === "local"
        ? [
            {
              OR: [{ authorChurchId: { not: null } }, { author: eligibleWhere }]
            }
          ]
        : []),
      ...(f.denominations.length
        ? [{ discoveryDenomination: { in: f.denominations } }]
        : []),
      ...(f.languages.length
        ? [
            {
              OR: [
                { discoveryLanguage: { in: f.languages } },
                ...(f.includeUnknownLanguage
                  ? [{ discoveryLanguage: null }]
                  : [])
              ]
            }
          ]
        : !f.includeUnknownLanguage
          ? [{ discoveryLanguage: { not: null } }]
          : []),
      ...(f.topics.length ? [{ topics: { hasSome: f.topics } }] : []),
      ...(f.types.length
        ? [
            {
              OR: [
                ...(f.types.includes("EVENT")
                  ? [{ eventOccurrenceId: { not: null } }]
                  : []),
                {
                  eventOccurrenceId: null,
                  type: { in: f.types.filter((type) => type !== "EVENT") }
                }
              ]
            }
          ]
        : [])
    ]
  };
  return {
    AND: [
      feedReadableWhere(context, mode, at, f.homeChurchId),
      ...(mode === "local"
        ? [
            {
              OR: [{ authorChurchId: { not: null } }, { author: eligibleWhere }]
            }
          ]
        : []),
      discoveryHiddenWhere(context, prefs),
      {
        OR: [
          { repostKind: null, AND: hard },
          { repostKind: "QUOTE", AND: hard },
          {
            repostKind: "PLAIN",
            repostSource: {
              is: { AND: [repostSourceWhere(context, at), hard] }
            }
          }
        ]
      },
      ...(effectiveDiscoverySort(mode, f) === "relevant"
        ? [
            {
              publishedAt: { gte: new Date(+at - 90 * 86400000) },
              OR: [{ repostKind: null }, { repostKind: "QUOTE" as const }]
            }
          ]
        : []),
      ...(effectiveDiscoverySort(mode, f) === "popular"
        ? [
            {
              type: { not: "PRAYER" as const },
              audience: "PUBLIC" as const,
              publishedAt: { gte: new Date(+at - 7 * 86400000) }
            },
            { OR: [{ repostKind: null }, { repostKind: "QUOTE" as const }] }
          ]
        : [])
    ]
  };
}
export function geographicCandidateWhere(
  mode: DiscoveryMode,
  prefs: DiscoveryPreferences,
  place: DiscoveryPlace | null
): Prisma.PlatformPostWhereInput {
  const f = prefs.filters,
    scope = mode === "local" ? "local" : f.geography;
  if (scope === "worldwide" || (f.expand && scope !== "local")) return {};
  if (scope === "country") return { discoveryCountry: f.country };
  if (!place) return { id: { in: [] } };
  if (f.expand) return {};
  // A conservative spherical bounding box reduces the SQL candidate pool.
  // Exact town-to-town distance is still checked after current source permission.
  const angle = f.radiusKm / 6371.0088,
    degrees = 180 / Math.PI;
  const low = Math.max(-90, place.latitude - angle * degrees);
  const high = Math.min(90, place.latitude + angle * degrees);
  const latitude = { discoveryLatitude: { gte: low, lte: high } };
  if (low <= -90 || high >= 90) return latitude;
  const delta =
    Math.asin(
      Math.min(1, Math.sin(angle) / Math.cos(place.latitude / degrees))
    ) * degrees;
  const west = place.longitude - delta,
    east = place.longitude + delta;
  const longitude =
    west < -180
      ? {
          OR: [
            { discoveryLongitude: { gte: west + 360 } },
            { discoveryLongitude: { lte: east } }
          ]
        }
      : east > 180
        ? {
            OR: [
              { discoveryLongitude: { gte: west } },
              { discoveryLongitude: { lte: east - 360 } }
            ]
          }
        : { discoveryLongitude: { gte: west, lte: east } };
  return { AND: [latitude, longitude] };
}
export type GeographicPost = {
  discoveryCountry: string | null;
  discoveryRegion: string | null;
  discoveryLatitude: number | null;
  discoveryLongitude: number | null;
};
export type DiscoveryStage =
  | "Local"
  | "Wider region"
  | "National"
  | "Worldwide";
export function discoveryStage(
  post: GeographicPost,
  mode: DiscoveryMode,
  prefs: DiscoveryPreferences,
  place: DiscoveryPlace | null
): DiscoveryStage | null {
  const f = prefs.filters,
    scope = mode === "local" ? "local" : f.geography;
  if (scope === "worldwide") return "Worldwide";
  if (scope === "country")
    return post.discoveryCountry === f.country
      ? "National"
      : f.expand
        ? "Worldwide"
        : null;
  if (!place) return null;
  if (
    post.discoveryLatitude !== null &&
    post.discoveryLongitude !== null &&
    townDistanceKm(place, {
      latitude: post.discoveryLatitude,
      longitude: post.discoveryLongitude
    }) <= f.radiusKm
  )
    return "Local";
  if (!f.expand) return null;
  if (
    post.discoveryCountry === place.country &&
    place.region &&
    place.region !== "00" &&
    place.regionName &&
    post.discoveryRegion === place.region
  )
    return "Wider region";
  if (post.discoveryCountry === place.country) return "National";
  return "Worldwide";
}
export const DISCOVERY_STAGE_ORDER: Record<DiscoveryStage, number> = {
  Local: 0,
  "Wider region": 1,
  National: 2,
  Worldwide: 3
};
