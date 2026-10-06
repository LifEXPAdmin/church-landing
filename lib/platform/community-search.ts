import { socialUserWhere, socialDiscoveryWhere } from "./social-policy";
import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { withPostRead, postReadableWhere } from "./post-access";
import { postId } from "./post-input";
import { communityAuthorSelect } from "./public-profile";
import { POST_TOPICS, postPreviewText } from "./post-options";
import { PortalError } from "./portal-policy";
import {
  searchCategories,
  searchChurchFilter,
  searchQueryLimit,
  type SearchCategory,
  type SearchNavigation
} from "./search-navigation";
import { parseExchangeListQuery } from "./exchange-input";
import { searchResourceModule } from "./universal-search";

export const SEARCH_KINDS = searchCategories;
export type SearchKind = (typeof SEARCH_KINDS)[number];
export const SEARCH_PAGE_SIZE = 20;
export type CommunitySearchInput = {
  q?: unknown;
  kind?: unknown;
  after?: unknown;
  topic?: unknown;
  churchId?: unknown;
  country?: unknown;
  placeId?: unknown;
  radiusKm?: unknown;
};
export function searchUrlInput(
  parameters: URLSearchParams
): CommunitySearchInput {
  const allowed = [
    "q",
    "kind",
    "after",
    "topic",
    "churchId",
    "country",
    "placeId",
    "radiusKm"
  ];
  if (
    [...parameters.keys()].some(
      (key) => !allowed.includes(key) || parameters.getAll(key).length !== 1
    )
  )
    throw new PortalError(400, "Use each supported search filter once.");
  return Object.fromEntries(parameters);
}
export function parseCommunitySearchInput(
  input: CommunitySearchInput
): SearchNavigation {
  const kind = input.kind ?? "posts";
  if (!SEARCH_KINDS.includes(kind as SearchKind))
    throw new PortalError(400, "Choose a supported search category.");
  if (input.q != null && typeof input.q !== "string")
    throw new PortalError(400, "Use text to search.");
  const q = ((input.q ?? "") as string).trim();
  if (q.length > 200)
    throw new PortalError(400, "Search with at most 200 characters.");
  if (q.length > searchQueryLimit(kind as SearchCategory))
    throw new PortalError(
      400,
      `Search this category with at most ${searchQueryLimit(kind as SearchCategory)} characters.`
    );
  const topic = input.topic || undefined,
    churchId = input.churchId ? postId(input.churchId) : undefined;
  if (topic && !POST_TOPICS.includes(topic as (typeof POST_TOPICS)[number]))
    throw new PortalError(400, "Choose a supported topic.");
  if (
    (topic && kind !== "posts") ||
    (churchId && !searchChurchFilter(kind as SearchCategory))
  )
    throw new PortalError(400, "This filter does not apply to that category.");
  const location: { country?: string; placeId?: string; radiusKm?: string } =
    {};
  for (const key of ["country", "placeId", "radiusKm"] as const) {
    if (input[key] == null || input[key] === "") continue;
    if (kind !== "listings" || typeof input[key] !== "string")
      throw new PortalError(400, "Use local filters with listing searches.");
    location[key] = input[key];
  }
  if (
    input.after != null &&
    (typeof input.after !== "string" || input.after.length > 4000)
  )
    throw new PortalError(400, "Use the current search page.");
  if (kind === "listings") parseExchangeListQuery({ q, ...location });
  return {
    kind: kind as SearchKind,
    q,
    ...(topic ? { topic: topic as string } : {}),
    ...(churchId ? { churchId } : {}),
    ...location,
    ...(input.after ? { after: input.after as string } : {})
  };
}
export function communitySearch(
  db: PrismaClient,
  token: unknown,
  input: CommunitySearchInput,
  expectedAccount?: string
) {
  const query = parseCommunitySearchInput(input),
    { kind, q, topic, churchId } = query;
  if (["listings", "media", "opportunities", "groups"].includes(String(kind))) {
    return searchResourceModule(db, token, query, expectedAccount);
  }
  const signature = createHash("sha256")
    .update(JSON.stringify([kind, q, topic, churchId]))
    .digest("hex")
    .slice(0, 24);
  let after: string | undefined;
  if (input.after) {
    try {
      if (typeof input.after !== "string" || input.after.length > 256)
        throw Error();
      const cursor = JSON.parse(
        Buffer.from(input.after, "base64url").toString()
      );
      if (cursor.signature !== signature) throw Error();
      after = postId(cursor.id);
    } catch {
      throw new PortalError(
        400,
        "Restart this search; the page reference belongs to different filters."
      );
    }
  }
  // Prisma contains uses LIKE: escape wildcard characters so user text stays literal.
  const contains = {
    contains: q.replace(/[\\%_]/g, "\\$&"),
    mode: "insensitive" as const
  };
  const paging = {
    orderBy: { id: "asc" as const },
    take: SEARCH_PAGE_SIZE + 1
  };
  const cursorWhere = after ? { id: { gt: after } } : {};
  return withPostRead(db, token, async (tx, context) => {
    if (expectedAccount !== undefined && expectedAccount !== context.actorId)
      throw new PortalError(
        401,
        "Your sign-in changed. Reload before continuing."
      );
    const page = <T extends { id: string }>(rows: T[]) => ({
      ownerId: context.actorId,
      kind,
      query: q,
      items: rows.slice(0, SEARCH_PAGE_SIZE),
      nextCursor:
        rows.length > SEARCH_PAGE_SIZE
          ? Buffer.from(
              JSON.stringify({ signature, id: rows[SEARCH_PAGE_SIZE - 1].id })
            ).toString("base64url")
          : null
    });
    if (!q && !topic) return page([]);
    if (kind === "posts") {
      const rows = await tx.platformPost.findMany({
        where: {
          AND: [
            postReadableWhere(context),
            socialDiscoveryWhere(context),
            cursorWhere,
            ...(q
              ? [{ OR: [{ content: contains }, { scripture: contains }] }]
              : []),
            ...(topic ? [{ topics: { has: topic as string } }] : []),
            ...(churchId ? [{ authorChurchId: churchId }] : [])
          ]
        },
        select: {
          id: true,
          content: true,
          contentNote: true,
          safeExcerpt: true,
          type: true,
          publishedAt: true,
          topics: true
        },
        ...paging
      });
      return page(
        rows.map((p) => ({
          id: p.id,
          label: postPreviewText(p).slice(0, 300),
          contentNote: p.contentNote,
          type: p.type,
          topics: p.topics,
          publishedAt: p.publishedAt,
          href: `/platform/posts/${p.id}`
        }))
      );
    }
    if (kind === "people") {
      const rows = await tx.platformUser.findMany({
        where: {
          AND: [
            socialUserWhere(context),
            cursorWhere,
            { id: { notIn: context.mutedIds ?? [] } }
          ],
          OR: [{ name: contains }, { username: contains }]
        },
        select: communityAuthorSelect,
        ...paging
      });
      return page(
        rows.map((p) => ({
          id: p.id,
          label: p.name,
          username: p.username,
          href: `/platform/profile/${encodeURIComponent(p.username)}`,
          requiresSignIn: !context.actorId
        }))
      );
    }
    if (kind === "churches") {
      const rows = await tx.church.findMany({
        where: {
          ...cursorWhere,
          OR: [
            "name",
            "summary",
            "city",
            "region",
            "country",
            "serviceArea"
          ].map((field) => ({ [field]: contains }))
        },
        select: { id: true, name: true, city: true, region: true },
        ...paging
      });
      return page(
        rows.map((p) => ({
          id: p.id,
          label: p.name,
          city: p.city,
          region: p.region,
          href: `/platform/churches/${p.id}`
        }))
      );
    }
    if (kind === "events") {
      const where: Prisma.CalendarOccurrenceWhereInput = {
        ...cursorWhere,
        canceledAt: null,
        OR: [
          { title: contains },
          { description: contains },
          { location: contains }
        ],
        event: {
          canceledAt: null,
          calendar: { archivedAt: null, churchId: churchId ?? { not: null } },
          OR: [
            { visibility: "PUBLIC" },
            {
              visibility: "CHURCH",
              calendar: { churchId: { in: context.churches } }
            }
          ]
        }
      };
      const rows = await tx.calendarOccurrence.findMany({
        where,
        select: {
          id: true,
          title: true,
          startAt: true,
          endAt: true,
          timeZone: true
        },
        ...paging
      });
      return page(
        rows.map((p) => ({
          id: p.id,
          label: p.title,
          startAt: p.startAt,
          endAt: p.endAt,
          timeZone: p.timeZone,
          href: `/platform/events/${p.id}`
        }))
      );
    }
    // Topics are an explicit public vocabulary, not counts inferred from hidden posts.
    return page(
      POST_TOPICS.filter(
        (t) => t.includes(q.toLowerCase()) && (!after || t > after)
      )
        .sort()
        .map((t) => ({ id: t, label: t, filter: { kind: "posts", topic: t } }))
    );
  });
}
