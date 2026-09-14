import { readerDate, readerId } from "./reader-navigation";
import { gzipSync, gunzipSync } from "node:zlib";
import { expireFeedSnapshots } from "./feed-snapshot-retention";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { accountConfig } from "./account-config";
import { readAccountSession } from "./accounts";
import { postContext, type PostTx, type PostContext } from "./post-access";
import { hydratePostPage } from "./post-reads";
import { feedMode, type FeedMode } from "./feed-options";
import { feedReadableWhere } from "./feed-policy";
import { PortalError } from "./portal-policy";

const PAGE = 30,
  HOUR = 3600000;
// Fail explicitly at the operating bound instead of silently ranking a truncated
// candidate pool. Only ID/date metadata enters this bounded query or snapshot.
export const MAX_RANKED_CANDIDATES = 10000;
const TTL = HOUR;
type Cursor = {
  upperId?: string;
  page?: string[];
  at: string;
  snapshot?: string;
  offset?: number;
  before?: string;
  id?: string;
};
function codec(ownerId: string | null, mode: FeedMode) {
  const sign = (body: string) =>
    createHmac("sha256", accountConfig().rateSecret)
      .update(`feed:v1:${ownerId ?? "public"}:${mode}:${body}`)
      .digest("hex");
  return {
    encode: (value: Cursor) => {
      const body = gzipSync(Buffer.from(JSON.stringify(value))).toString(
        "base64url"
      );
      return body + "." + sign(body);
    },
    decode: (value: unknown, now: Date): Cursor | null => {
      if (!value) return null;
      try {
        if (typeof value !== "string" || value.length > 2000) throw Error();
        const [body, signature, extra] = value.split(".");
        if (
          extra ||
          !/^[a-f0-9]{64}$/.test(signature) ||
          !timingSafeEqual(Buffer.from(sign(body)), Buffer.from(signature))
        )
          throw Error();
        const row = JSON.parse(
          gunzipSync(Buffer.from(body, "base64url"), {
            maxOutputLength: 4096
          }).toString()
        );
        const at = Date.parse(row.at);
        if (
          !Number.isFinite(at) ||
          new Date(at).toISOString() !== row.at ||
          at > now.getTime()
        )
          throw Error();
        if (
          row.page !== undefined &&
          (!Array.isArray(row.page) ||
            row.page.length > PAGE ||
            row.page.some(
              (id: unknown) =>
                typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)
            ))
        )
          throw Error();
        if (
          row.upperId !== undefined &&
          !/^[a-zA-Z0-9_-]{1,100}$/.test(row.upperId)
        )
          throw Error();
        if (row.snapshot) {
          if (
            !/^[a-f0-9-]{36}$/.test(row.snapshot) ||
            !Number.isInteger(row.offset) ||
            row.offset < 0 ||
            row.offset > MAX_RANKED_CANDIDATES
          )
            throw Error();
        } else if (
          (row.before || row.id) &&
          (!/^[a-zA-Z0-9_-]{1,100}$/.test(row.id) ||
            new Date(row.before).toISOString() !== row.before)
        )
          throw Error();
        if ((mode === "weekly" || mode === "trending") !== !!row.snapshot)
          throw Error();
        return row;
      } catch {
        throw new PortalError(
          409,
          "This reading set expired or belongs to a different feed or account. Refresh posts to start a new set."
        );
      }
    }
  };
}
async function rankedIds(
  tx: PostTx,
  context: PostContext,
  mode: "weekly" | "trending",
  at: Date
) {
  const from = new Date(at.getTime() - (mode === "weekly" ? 168 : 72) * HOUR);
  const candidates = await tx.platformPost.findMany({
    where: {
      AND: [
        feedReadableWhere(context, mode, at),
        // Plain reposts share the original's votes; rank that original once.
        { OR: [{ repostKind: null }, { repostKind: "QUOTE" }] },
        {
          likes: {
            some: {
              active: true,
              firstLikedAt: { gte: from, lt: at },
              user: {
                suspendedAt: null,
                deactivatedAt: null,
                id: {
                  notIn: [
                    ...(context.blockedIds ?? []),
                    ...(context.mutedIds ?? [])
                  ]
                }
              }
            }
          }
        }
      ]
    },
    select: { id: true },
    take: MAX_RANKED_CANDIDATES + 1
  });
  if (candidates.length > MAX_RANKED_CANDIDATES)
    throw new PortalError(
      503,
      "This ranked feed needs a capacity review. Latest and Friends are still available."
    );
  if (!candidates.length) return [];
  const excluded = [...(context.blockedIds ?? []), ...(context.mutedIds ?? [])];
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT p.id FROM "PlatformPost" p
    JOIN "PlatformPostLike" l ON l."postId" = p.id
    JOIN "PlatformUser" u ON u.id = l."userId"
    WHERE p.id IN (${Prisma.join(candidates.map((row) => row.id))})
      AND l.active = true AND l."userId" <> p."authorId"
      AND l."firstLikedAt" >= ${from.toISOString()}::timestamp AND l."firstLikedAt" < ${at.toISOString()}::timestamp
      AND u."suspendedAt" IS NULL AND u."deactivatedAt" IS NULL
      ${excluded.length ? Prisma.sql`AND u.id NOT IN (${Prisma.join(excluded)})` : Prisma.empty}
    GROUP BY p.id, p."publishedAt"
    ORDER BY ${mode === "weekly" ? Prisma.sql`COUNT(*)` : Prisma.sql`SUM(POWER(2.0, -EXTRACT(EPOCH FROM (${at.toISOString()}::timestamp - l."firstLikedAt"))/86400.0))`} DESC,
      p."publishedAt" DESC, p.id DESC
  `);
  return rows.map((row) => row.id);
}
export function readFeed(
  db: PrismaClient,
  token: unknown,
  input: {
    mode?: unknown;
    cursor?: unknown;
    guestMode?: unknown;
    scope?: unknown;
    refresh?: unknown;
    legacyThrough?: unknown;
    legacyAnchor?: unknown;
    legacyBefore?: unknown;
    legacyCursor?: unknown;
  } = {},
  now = new Date()
) {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock_shared(730221, 2)`;
      const actor = await readAccountSession(tx as PrismaClient, token);
      const context = await postContext(tx, actor?.id);
      const preference = context.actorId
        ? await tx.socialPreferences.findUnique({
            where: { ownerId: context.actorId },
            select: { feedMode: true, feedVersion: true }
          })
        : null;
      const scope = createHmac("sha256", accountConfig().rateSecret)
        .update("feed-owner:" + (context.actorId ?? "public"))
        .digest("hex")
        .slice(0, 24);
      const sameOwner = !input.scope || input.scope === scope;
      const mode =
        feedMode(sameOwner ? input.mode : undefined) ??
        feedMode(context.actorId ? preference?.feedMode : input.guestMode) ??
        "latest";
      const cursors = codec(context.actorId, mode);
      let cursor = cursors.decode(sameOwner ? input.cursor : undefined, now);
      if (!cursor && ["latest", "friends"].includes(mode)) {
        const through = readerDate(input.legacyThrough),
          anchor = readerId(input.legacyAnchor);
        const before = readerDate(input.legacyBefore),
          id = readerId(input.legacyCursor);
        if ((through && anchor && through <= now) || (before && id))
          cursor = {
            at:
              through && anchor && through <= now
                ? through.toISOString()
                : now.toISOString(),
            ...(through && anchor && through <= now ? { upperId: anchor } : {}),
            ...(before && id ? { before: before.toISOString(), id } : {})
          };
      }
      let at = cursor ? new Date(cursor.at) : now;
      let ids: string[],
        next: Cursor | null = null,
        notice: string | null = null;
      if (mode === "weekly" || mode === "trending") {
        let snapshot = cursor
          ? await tx.feedSnapshot.findFirst({
              where: {
                id: cursor.snapshot,
                ownerId: context.actorId,
                mode,
                createdAt: at,
                expiresAt: { gt: now }
              }
            })
          : null;
        if (cursor && !snapshot && !cursor.page)
          throw new PortalError(
            409,
            "This reading set expired. Refresh posts to start a new set."
          );
        if (cursor && !snapshot && cursor.page) {
          // A signed current-page reference keeps mounted drafts recoverable
          // after the expiring ranking store is swept. It contains only up to
          // thirty IDs; every body and identity is freshly authorized below.
          const rows = await tx.platformPost.findMany({
            where: {
              AND: [
                feedReadableWhere(context, mode, now),
                { id: { in: cursor.page } }
              ]
            },
            select: { id: true }
          });
          const allowed = new Set(rows.map((row) => row.id));
          ids = cursor.page.filter((id) => allowed.has(id));
          notice =
            "This ranking set has expired. Your current page is still here. Finish or save your entries, then refresh posts for a new set.";
        } else {
          if (!snapshot) {
            // Public readers may share the same recent ordering. This stores no
            // per-visitor identifier or reading history. Explicit Refresh bypasses
            // reuse; every projected page still applies current authorization.
            if (!context.actorId && input.refresh !== "1")
              snapshot = await tx.feedSnapshot.findFirst({
                where: {
                  ownerId: null,
                  mode,
                  createdAt: { gte: new Date(+now - 30000), lte: now },
                  expiresAt: { gt: now }
                },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }]
              });
            if (!snapshot) {
              const postIds = await rankedIds(tx, context, mode, at);
              // Only snapshot allocation is serialized; ranking and ordinary
              // reads keep the shared permission gate and current Like concurrency.
              await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 31)`;
              await expireFeedSnapshots(tx, now);
              if (!context.actorId && input.refresh !== "1")
                snapshot = await tx.feedSnapshot.findFirst({
                  where: {
                    ownerId: null,
                    mode,
                    createdAt: { gte: new Date(+now - 30000), lte: now },
                    expiresAt: { gt: now }
                  },
                  orderBy: [{ createdAt: "desc" }, { id: "desc" }]
                });
              if (!snapshot) {
                const [size] = await tx.$queryRaw<
                  Array<{ rows: number; references: number }>
                >`SELECT COUNT(*)::int AS rows, COALESCE(SUM(cardinality("postIds")), 0)::int AS references FROM "FeedSnapshot"`;
                const own = context.actorId
                  ? await tx.feedSnapshot.count({
                      where: {
                        ownerId: context.actorId,
                        expiresAt: { gt: now }
                      }
                    })
                  : 0;
                if (
                  own >= 20 ||
                  size.rows >= 10000 ||
                  size.references + postIds.length > 1000000
                )
                  throw new PortalError(
                    429,
                    "Keep reading this set, or try refreshing later. Latest and Friends are still available.",
                    60
                  );
                snapshot = await tx.feedSnapshot.create({
                  data: {
                    id: randomUUID(),
                    ownerId: context.actorId,
                    mode,
                    createdAt: at,
                    expiresAt: new Date(+at + TTL),
                    postIds
                  }
                });
              }
            }
            at = snapshot.createdAt;
            cursor = { at: at.toISOString(), snapshot: snapshot.id, offset: 0 };
          }
          const offset = cursor!.offset ?? 0;
          // Recheck every remaining reference before slicing so revocations do not
          // leave artificial holes or reveal removed IDs in a page result.
          const eligible = await tx.platformPost.findMany({
            where: {
              AND: [
                feedReadableWhere(context, mode, now),
                { id: { in: snapshot.postIds.slice(offset) } }
              ]
            },
            select: { id: true }
          });
          const allowed = new Set(eligible.map((row) => row.id));
          const remaining = snapshot.postIds
            .slice(offset)
            .filter((id) => allowed.has(id));
          ids = remaining.slice(0, PAGE);
          if (remaining.length > PAGE)
            next = {
              at: cursor!.at,
              snapshot: cursor!.snapshot,
              offset: snapshot.postIds.indexOf(ids.at(-1)!) + 1
            };
        }
      } else {
        cursor ??= { at: at.toISOString() };
        const rows = await tx.platformPost.findMany({
          where: {
            AND: [
              feedReadableWhere(context, mode, now),
              cursor.upperId
                ? {
                    OR: [
                      { publishedAt: { lt: at } },
                      { publishedAt: at, id: { lte: cursor.upperId } }
                    ]
                  }
                : { publishedAt: { lte: at } },
              ...(cursor.before && cursor.id
                ? [
                    {
                      OR: [
                        { publishedAt: { lt: new Date(cursor.before) } },
                        {
                          publishedAt: new Date(cursor.before),
                          id: { lt: cursor.id }
                        }
                      ]
                    }
                  ]
                : [])
            ]
          },
          select: { id: true, publishedAt: true },
          orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
          take: PAGE + 1
        });
        ids = rows.slice(0, PAGE).map((row) => row.id);
        const last = rows[PAGE - 1];
        if (rows.length > PAGE && last)
          next = {
            at: cursor.at,
            ...(cursor.upperId ? { upperId: cursor.upperId } : {}),
            before: last.publishedAt!.toISOString(),
            id: last.id
          };
      }
      return {
        mode,
        scope,
        ownerId: context.actorId,
        preferenceVersion: preference?.feedVersion ?? 0,
        posts: await hydratePostPage(tx, context, ids, now),
        notice,
        pageCursor: cursors.encode(
          mode === "weekly" || mode === "trending"
            ? { ...cursor!, page: ids }
            : cursor!
        ),
        nextCursor: next ? cursors.encode(next) : null
      };
    },
    { maxWait: 10000, timeout: 15000 }
  );
}
