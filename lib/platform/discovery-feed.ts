import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { accountConfig } from "./account-config";
import type { PostContext, PostTx } from "./post-access";
import { expireFeedSnapshots } from "./feed-snapshot-retention";
import { hydratePostPage } from "./post-reads";
import { PortalError } from "./portal-policy";
import {
  guestDiscoveryPreferences,
  effectiveDiscoverySort,
  type DiscoveryMode,
  type DiscoveryPreferences
} from "./discovery-options";
import { storedDiscoveryPreferences } from "./discovery-preferences";
import { getDiscoveryPlace, discoveryPlaceLabel } from "./discovery-places";
import {
  DISCOVERY_CANDIDATE_LIMIT,
  DISCOVERY_RANKING_VERSION,
  discoveryScore,
  discoverySignals,
  rankDiscoveryIds,
  readDiscoveryCandidates,
  type DiscoveryExplanation,
  type DiscoveryReason,
  type DiscoverySignals
} from "./discovery-ranking";

const PAGE = 30,
  TTL = 3600000;
type Cursor = {
  at: string;
  snapshot: string;
  offset: number;
  selectionKey: string;
  filterKey: string;
  page?: string[];
};
export type DiscoveryFeedPreference = {
  discovery: unknown;
  discoveryVersion: number;
  discoveryRecoveryRequired: boolean;
} | null;
export function discoverySelectionKeys(
  ownerId: string | null,
  mode: DiscoveryMode,
  prefs: DiscoveryPreferences,
  signals?: DiscoverySignals
) {
  const hash = (value: unknown) =>
    createHmac("sha256", accountConfig().rateSecret)
      .update(
        JSON.stringify([
          "discovery",
          DISCOVERY_RANKING_VERSION,
          ownerId,
          mode,
          value
        ])
      )
      .digest("hex");
  const filterKey = hash({
    filters: prefs.filters,
    hiddenWords: prefs.hiddenWords,
    hiddenTopics: prefs.hiddenTopics
  });
  return {
    filterKey,
    selectionKey: hash({
      filterKey,
      interests: prefs.interests,
      feedback: prefs.feedback,
      signals: signals
        ? {
            people: [...signals.followedPeople].sort(),
            churches: [...signals.followedChurches].sort(),
            selectedChurch: signals.selectedChurch
          }
        : null
    })
  };
}
function codec(ownerId: string | null, mode: DiscoveryMode) {
  const sign = (body: string) =>
    createHmac("sha256", accountConfig().rateSecret)
      .update(
        `discovery:${DISCOVERY_RANKING_VERSION}:${ownerId ?? "public"}:${mode}:${body}`
      )
      .digest("hex");
  return {
    encode(value: Cursor) {
      const body = gzipSync(Buffer.from(JSON.stringify(value))).toString(
        "base64url"
      );
      return body + "." + sign(body);
    },
    decode(value: unknown, now: Date, filterKey: string): Cursor | null {
      if (!value) return null;
      try {
        if (typeof value !== "string" || value.length > 2500) throw Error();
        const [body, signature, extra] = value.split(".");
        if (
          extra ||
          !/^[a-f0-9]{64}$/.test(signature) ||
          !timingSafeEqual(Buffer.from(sign(body)), Buffer.from(signature))
        )
          throw Error();
        const c = JSON.parse(
          gunzipSync(Buffer.from(body, "base64url"), {
            maxOutputLength: 5000
          }).toString()
        );
        if (
          !c ||
          typeof c !== "object" ||
          Object.keys(c).some(
            (key) =>
              ![
                "at",
                "snapshot",
                "offset",
                "selectionKey",
                "filterKey",
                "page"
              ].includes(key)
          ) ||
          new Date(c.at).toISOString() !== c.at ||
          Date.parse(c.at) > +now ||
          !/^[a-f0-9-]{36}$/.test(c.snapshot) ||
          !Number.isInteger(c.offset) ||
          c.offset < 0 ||
          c.offset > DISCOVERY_CANDIDATE_LIMIT ||
          c.filterKey !== filterKey ||
          !/^[a-f0-9]{64}$/.test(c.selectionKey) ||
          (c.page !== undefined &&
            (!Array.isArray(c.page) ||
              c.page.length > PAGE ||
              new Set(c.page).size !== c.page.length ||
              c.page.some(
                (id: unknown) =>
                  typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)
              )))
        )
          throw Error();
        return c;
      } catch {
        throw new PortalError(
          409,
          "Your discovery filters or account changed, or this reading set expired. Finish or save your entries, then refresh posts for a new set."
        );
      }
    }
  };
}
export async function readDiscoveryFeedIn(
  tx: PostTx,
  context: PostContext,
  mode: DiscoveryMode,
  preference: DiscoveryFeedPreference,
  input: { cursor?: unknown; guestDiscovery?: unknown; refresh?: unknown },
  now: Date
) {
  if (preference?.discoveryRecoveryRequired)
    throw new PortalError(
      409,
      "Your newer discovery choices were unavailable during recovery. Review and save Feed Settings before opening a discovery feed."
    );
  const prefs = context.actorId
    ? storedDiscoveryPreferences(preference?.discovery)
    : guestDiscoveryPreferences(input.guestDiscovery);
  const place = await getDiscoveryPlace(
    prefs.filters.country,
    prefs.filters.placeId
  );
  const signals =
    effectiveDiscoverySort(mode, prefs.filters) === "relevant"
      ? await discoverySignals(tx, context, prefs)
      : undefined;
  const keys = discoverySelectionKeys(context.actorId, mode, prefs, signals),
    cursors = codec(context.actorId, mode);
  let cursor = cursors.decode(input.cursor, now, keys.filterKey),
    at = cursor ? new Date(cursor.at) : now;
  let snapshot = cursor
    ? await tx.feedSnapshot.findFirst({
        where: {
          id: cursor.snapshot,
          ownerId: context.actorId,
          mode,
          selectionKey: cursor.selectionKey,
          createdAt: at,
          expiresAt: { gt: now }
        }
      })
    : null;
  let notice: string | null = null;
  if (mode === "local" && !place)
    notice =
      "Choose a named town or area in Feed Settings to open Local. Your private profile location is never used automatically.";
  if (
    mode === "your-church" &&
    (!prefs.filters.homeChurchId ||
      !context.churches.includes(prefs.filters.homeChurchId))
  )
    notice =
      "Choose a current approved church connection in Feed Settings. Following a church does not grant membership.";
  if (
    !context.actorId &&
    ["following", "your-church", "churches", "favorites"].includes(mode)
  )
    notice =
      "Sign in to use your follows, favorites and approved church connections. Guest choices stay on this browser.";
  if (cursor && !snapshot && !cursor.page)
    throw new PortalError(
      409,
      "This reading set expired. Refresh posts to start a new set."
    );
  if (!cursor) {
    const sharedWhere = {
      ownerId: null,
      mode,
      selectionKey: keys.selectionKey,
      createdAt: { gte: new Date(+now - 30000), lte: now },
      expiresAt: { gt: now }
    };
    if (!context.actorId && input.refresh !== "1")
      snapshot = await tx.feedSnapshot.findFirst({
        where: sharedWhere,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      });
    if (!snapshot) {
      const postIds = await rankDiscoveryIds(
        tx,
        context,
        mode,
        prefs,
        place,
        at,
        signals
      );
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 31)`;
      await expireFeedSnapshots(tx, now);
      if (!context.actorId && input.refresh !== "1")
        snapshot = await tx.feedSnapshot.findFirst({
          where: sharedWhere,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }]
        });
      if (!snapshot) {
        const [size] = await tx.$queryRaw<
          Array<{ rows: number; references: number }>
        >`SELECT COUNT(*)::int AS rows, COALESCE(SUM(cardinality("postIds")),0)::int AS references FROM "FeedSnapshot"`;
        const own = context.actorId
          ? await tx.feedSnapshot.count({
              where: { ownerId: context.actorId, expiresAt: { gt: now } }
            })
          : 0;
        if (
          own >= 20 ||
          size.rows >= 10000 ||
          size.references + postIds.length > 1000000
        )
          throw new PortalError(
            429,
            "Keep reading this set or refresh later. Latest is also available.",
            60
          );
        snapshot = await tx.feedSnapshot.create({
          data: {
            id: randomUUID(),
            ownerId: context.actorId,
            mode,
            selectionKey: keys.selectionKey,
            createdAt: at,
            expiresAt: new Date(+at + TTL),
            postIds
          }
        });
      }
    }
    at = snapshot.createdAt;
    cursor = {
      at: at.toISOString(),
      snapshot: snapshot.id,
      offset: 0,
      ...keys
    };
  }
  const references = snapshot
    ? snapshot.postIds.slice(cursor.offset)
    : cursor.page!;
  const rows = await readDiscoveryCandidates(
    tx,
    context,
    mode,
    prefs,
    place,
    at,
    references
  );
  const available = new Map(rows.map((row) => [row.post.id, row]));
  const remaining = references.filter((id) => available.has(id)),
    ids = remaining.slice(0, PAGE);
  const next =
    snapshot && remaining.length > PAGE
      ? cursors.encode({
          ...cursor,
          page: undefined,
          offset: snapshot.postIds.indexOf(ids.at(-1)!) + 1
        })
      : null;
  if (!snapshot)
    notice =
      "This discovery set expired. Your current page is still here with current permission checks. Finish or save your entries, then refresh posts.";
  const rankingChanged = cursor.selectionKey !== keys.selectionKey;
  if (rankingChanged)
    notice =
      "Recommendation choices changed. This reading set keeps its order; refresh posts when you are ready to apply the new choices.";
  const explanations: Record<string, DiscoveryExplanation> = {};
  for (const id of ids) {
    const row = available.get(id)!;
    const reasons: DiscoveryReason[] = rankingChanged
      ? [
          {
            code: "SAVED_SET",
            label:
              "Still eligible for this saved reading set; refresh to apply newer recommendation choices"
          }
        ]
      : signals
        ? discoveryScore(row.classified, prefs, signals, at).reasons
        : [];
    if (mode === "following")
      reasons.unshift({
        code: "FOLLOWING",
        label: "You currently follow the author of this entry"
      });
    if (mode === "favorites")
      reasons.unshift({
        code: "FAVORITE",
        label: "You currently follow and privately favorite this author"
      });
    if (mode === "your-church")
      reasons.unshift({
        code: "YOUR_CHURCH",
        label: "From or explicitly shared with your selected approved church"
      });
    if (mode === "churches")
      reasons.unshift({
        code: "FOLLOWED_CHURCH",
        label: "Public post from a church you currently follow"
      });
    if (!reasons.length)
      reasons.push({
        code: "PUBLIC_FILTERS",
        label: "Public post matching your explicit discovery choices"
      });
    if (effectiveDiscoverySort(mode, prefs.filters) === "popular")
      reasons.push({
        code: "POPULAR_7D",
        label:
          "Published in the last 7 days; this set was ordered by eligible recent Likes"
      });
    explanations[id] = {
      reasons,
      stage: row.stage,
      topics: row.classified.topics,
      classification: {
        language: row.classified.discoveryLanguage,
        denomination: row.classified.discoveryDenomination,
        locality: row.classified.discoveryCountry
      }
    };
  }
  const churches = context.actorId
    ? await tx.church.findMany({
        where: { id: { in: context.churches } },
        select: { id: true, name: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: 200
      })
    : [];
  return {
    feedKey: keys.filterKey,
    posts: await hydratePostPage(tx, context, ids, now),
    notice,
    pageCursor: cursors.encode({ ...cursor, page: ids }),
    nextCursor: next,
    discovery: {
      preferences: prefs,
      version: preference?.discoveryVersion ?? 0,
      recoveryRequired: false,
      filterKey: keys.filterKey,
      rankingChanged,
      explanations,
      churches,
      place: place
        ? {
            id: place.id,
            country: place.country,
            label: discoveryPlaceLabel(place)
          }
        : null
    }
  };
}
export async function currentDiscoveryIds(
  tx: PostTx,
  context: PostContext,
  mode: DiscoveryMode,
  ids: string[],
  input: { filterKey?: unknown; guestDiscovery?: unknown } = {},
  now = new Date()
) {
  const row = context.actorId
    ? await tx.socialPreferences.findUnique({
        where: { ownerId: context.actorId },
        select: { discovery: true, discoveryRecoveryRequired: true }
      })
    : null;
  if (row?.discoveryRecoveryRequired) return [];
  const prefs = context.actorId
    ? storedDiscoveryPreferences(row?.discovery)
    : guestDiscoveryPreferences(input.guestDiscovery);
  if (
    input.filterKey &&
    input.filterKey !==
      discoverySelectionKeys(context.actorId, mode, prefs).filterKey
  )
    return [];
  const place = await getDiscoveryPlace(
    prefs.filters.country,
    prefs.filters.placeId
  );
  return (
    await readDiscoveryCandidates(tx, context, mode, prefs, place, now, ids)
  ).map((row) => row.post.id);
}
