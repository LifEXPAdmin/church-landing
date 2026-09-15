import type { PostContext, PostTx } from "./post-access";
import type { DiscoveryMode, DiscoveryPreferences } from "./discovery-options";
import { effectiveDiscoverySort } from "./discovery-options";
import {
  discoveryReadableWhere,
  discoveryStage,
  DISCOVERY_STAGE_ORDER,
  type DiscoveryStage
} from "./discovery-policy";
import type { DiscoveryPlace } from "./discovery-places";
import { Prisma } from "@prisma/client";
import { PortalError } from "./portal-policy";
import { ADULT_POLICY } from "./portal-types";
import { discoverySources } from "./discovery-sources";

export const DISCOVERY_RANKING_VERSION = "explicit-v1";
export const DISCOVERY_CANDIDATE_LIMIT = 10000;
export const discoveryMetadataSelect = {
  id: true,
  authorId: true,
  authorChurchId: true,
  audienceChurchId: true,
  publishedAt: true,
  topics: true,
  discoveryCountry: true,
  discoveryLanguage: true,
  discoveryDenomination: true,
  discoveryRegion: true,
  discoveryLatitude: true,
  discoveryLongitude: true
} as const;
export type DiscoveryCandidate = Prisma.PlatformPostGetPayload<{
  select: typeof discoveryMetadataSelect;
}>;
export type DiscoveryReason = { code: string; label: string };
export type DiscoveryExplanation = {
  reasons: DiscoveryReason[];
  stage: DiscoveryStage;
  topics: string[];
  classification: {
    language: string | null;
    denomination: string | null;
    locality: string | null;
  };
};
export type DiscoverySignals = {
  followedPeople: Set<string>;
  followedChurches: Set<string>;
  selectedChurch: string | null;
};
export async function discoverySignals(
  tx: PostTx,
  context: PostContext,
  prefs: DiscoveryPreferences
): Promise<DiscoverySignals> {
  if (!context.actorId)
    return {
      followedPeople: new Set(),
      followedChurches: new Set(),
      selectedChurch: null
    };
  const people = await tx.platformFollow.findMany({
    where: { followerId: context.actorId },
    select: { followingId: true },
    take: 2001
  });
  const churches = await tx.socialRelationship.findMany({
    where: { ownerId: context.actorId, followingChurch: true },
    select: { churchId: true },
    take: 2001
  });
  if (people.length > 2000 || churches.length > 2000)
    throw new PortalError(
      503,
      "This follow list needs a size review before discovery can rank it."
    );
  return {
    followedPeople: new Set(people.map((row) => row.followingId)),
    followedChurches: new Set(
      churches.flatMap((row) => (row.churchId ? [row.churchId] : []))
    ),
    selectedChurch:
      prefs.filters.homeChurchId &&
      context.churches.includes(prefs.filters.homeChurchId)
        ? prefs.filters.homeChurchId
        : null
  };
}
export function discoveryScore(
  post: DiscoveryCandidate,
  prefs: DiscoveryPreferences,
  signals: DiscoverySignals,
  at: Date
) {
  let score = 0;
  const reasons: DiscoveryReason[] = [];
  if (
    post.authorChurchId
      ? signals.followedChurches.has(post.authorChurchId)
      : signals.followedPeople.has(post.authorId)
  ) {
    score += 4;
    reasons.push({
      code: "FOLLOWED_AUTHOR",
      label: post.authorChurchId
        ? "You follow this church"
        : "You follow this person"
    });
  }
  if (
    signals.selectedChurch &&
    [post.authorChurchId, post.audienceChurchId].includes(
      signals.selectedChurch
    )
  ) {
    score += 3;
    reasons.push({
      code: "SELECTED_CHURCH",
      label: "Shared with your selected approved church"
    });
  }
  const interests = post.topics.filter((topic) =>
    prefs.interests.includes(topic)
  );
  score += Math.min(4, interests.length * 2);
  if (interests.length)
    reasons.push({
      code: "CHOSEN_TOPIC",
      label: "Your chosen interests: " + interests.join(", ")
    });
  const age = +at - +(post.publishedAt ?? at);
  if (age >= 0 && age < 48 * 3600000) {
    score += 2;
    reasons.push({
      code: "RECENT_48H",
      label: "Published within this reading set’s last 48 hours"
    });
  } else if (age >= 0 && age < 7 * 86400000) {
    score += 1;
    reasons.push({
      code: "RECENT_7D",
      label: "Published within this reading set’s last 7 days"
    });
  }
  for (const topic of post.topics) {
    const feedback = prefs.feedback[topic as keyof typeof prefs.feedback];
    if (feedback) {
      score += feedback * 2;
      reasons.push({
        code: feedback > 0 ? "MORE_TOPIC" : "LESS_TOPIC",
        label: `You chose ${feedback > 0 ? "more" : "less"} ${topic}`
      });
    }
  }
  return { score, reasons };
}
export function chronological(a: DiscoveryCandidate, b: DiscoveryCandidate) {
  return (
    +(b.publishedAt ?? 0) - +(a.publishedAt ?? 0) ||
    (b.id === a.id ? 0 : b.id > a.id ? 1 : -1)
  );
}
export function applyDiscoveryVariety<T extends { post: DiscoveryCandidate }>(
  rows: T[]
): T[] {
  const pending = [...rows],
    ordered: T[] = [],
    recent: string[] = [];
  const author = (row: T) =>
    row.post.authorChurchId
      ? "church:" + row.post.authorChurchId
      : "person:" + row.post.authorId;
  while (pending.length) {
    const counts = new Map<string, number>();
    recent.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
    const alternative = pending.findIndex(
      (row) => (counts.get(author(row)) ?? 0) < 3
    );
    const [chosen] = pending.splice(alternative < 0 ? 0 : alternative, 1);
    ordered.push(chosen);
    recent.push(author(chosen));
    if (recent.length > 19) recent.shift();
  }
  return ordered;
}
export async function readDiscoveryCandidates(
  tx: PostTx,
  context: PostContext,
  mode: DiscoveryMode,
  prefs: DiscoveryPreferences,
  place: DiscoveryPlace | null,
  at: Date,
  ids?: string[]
) {
  const rows = await tx.platformPost.findMany({
    where: {
      AND: [
        discoveryReadableWhere(context, mode, prefs, at, place),
        ...(ids ? [{ id: { in: ids } }] : [])
      ]
    },
    select: {
      ...discoveryMetadataSelect,
      repostKind: true,
      repostSourceId: true
    },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: DISCOVERY_CANDIDATE_LIMIT + 1
  });
  if (rows.length > DISCOVERY_CANDIDATE_LIMIT)
    throw new PortalError(
      503,
      "This discovery selection needs a capacity review. Choose a narrower filter or return to Latest."
    );
  const sources = await discoverySources(tx, context, rows, at, prefs);
  return rows.flatMap((post) => {
    const source = sources.byEntry.get(post.id);
    if (
      sources.hiddenEntries.has(post.id) ||
      (post.repostKind === "PLAIN" && !source)
    )
      return [];
    const classified = post.repostKind === "PLAIN" && source ? source : post;
    const stage = discoveryStage(classified, mode, prefs, place);
    return stage ? [{ post, classified, stage }] : [];
  });
}
export async function rankDiscoveryIds(
  tx: PostTx,
  context: PostContext,
  mode: DiscoveryMode,
  prefs: DiscoveryPreferences,
  place: DiscoveryPlace | null,
  at: Date,
  providedSignals?: DiscoverySignals
) {
  const rows = await readDiscoveryCandidates(
      tx,
      context,
      mode,
      prefs,
      place,
      at
    ),
    sort = effectiveDiscoverySort(mode, prefs.filters);
  const signals =
    sort === "relevant"
      ? (providedSignals ?? (await discoverySignals(tx, context, prefs)))
      : null;
  const popularity = new Map<string, number>();
  if (sort === "popular" && rows.length) {
    const excluded = [
      ...(context.blockedIds ?? []),
      ...(context.mutedIds ?? [])
    ];
    const counts = await tx.$queryRaw<
      Array<{ id: string; count: number }>
    >(Prisma.sql`
      SELECT p.id, COUNT(DISTINCT l."userId")::int AS count FROM "PlatformPost" p
      JOIN "PlatformPostLike" l ON l."postId"=p.id JOIN "PlatformUser" u ON u.id=l."userId"
      WHERE p.id IN (${Prisma.join(rows.map((row) => row.post.id))}) AND p.audience='PUBLIC' AND p.type<>'PRAYER'
        AND l.active=true AND l."userId"<>p."authorId" AND u."suspendedAt" IS NULL AND u."deactivatedAt" IS NULL
        AND u."emailVerifiedAt" IS NOT NULL AND u."adultAcknowledgedAt" IS NOT NULL AND u."adultPolicyVersion"=${ADULT_POLICY}
        AND l."firstLikedAt">=${new Date(+at - 7 * 86400000).toISOString()}::timestamp AND l."firstLikedAt"<=${at.toISOString()}::timestamp
        ${excluded.length ? Prisma.sql`AND l."userId" NOT IN (${Prisma.join(excluded)})` : Prisma.empty}
      GROUP BY p.id`);
    counts.forEach((row) => popularity.set(row.id, row.count));
  }
  const scored = rows.map((row) => ({
    ...row,
    score:
      sort === "popular"
        ? (popularity.get(row.post.id) ?? 0)
        : signals
          ? discoveryScore(row.classified, prefs, signals, at).score
          : 0
  }));
  scored.sort(
    (a, b) =>
      (["following", "your-church", "favorites"].includes(mode)
        ? 0
        : DISCOVERY_STAGE_ORDER[a.stage] - DISCOVERY_STAGE_ORDER[b.stage]) ||
      b.score - a.score ||
      chronological(a.post, b.post)
  );
  // Geographic stages remain in order; diversity never promotes wider content
  // ahead of strict local matches and never drops the sole author's remaining work.
  return (
    sort === "relevant"
      ? Object.keys(DISCOVERY_STAGE_ORDER).flatMap((stage) =>
          applyDiscoveryVariety(scored.filter((row) => row.stage === stage))
        )
      : scored
  ).map((row) => row.post.id);
}
