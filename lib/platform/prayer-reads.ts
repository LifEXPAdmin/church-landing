import { Prisma, type PrismaClient } from "@prisma/client";
import { withAccountRead } from "./account-read";
import {
  postContext,
  postReadableWhere,
  type PostTx,
  type PostContext
} from "./post-access";
import { commentVisibleWhere } from "./comment-policy";
import { PortalError } from "./portal-policy";
import { postId } from "./post-input";
import { communityAuthorSelect } from "./public-profile";
import {
  prayerChoice,
  prayerParticipantWhere,
  prayerTargetIn,
  requirePrayerOwner
} from "./prayer-policy";
import {
  PRAYER_GUIDE_VERSION,
  type PrayerSavedPage,
  type PrayerTargetState,
  type PrayerUpdatePage,
  type PrayerUpdateKind
} from "./prayer-types";

const PAGE = 20;
function encode(owner: string, scope: string, at: Date, id: string) {
  return Buffer.from(
    JSON.stringify([owner, scope, at.toISOString(), id])
  ).toString("base64url");
}
function position(
  value: unknown,
  owner: string,
  scope: string
): { at: Date; id: string } | null {
  if (value == null) return null;
  try {
    if (typeof value !== "string" || value.length > 512) throw Error();
    const data = JSON.parse(Buffer.from(value, "base64url").toString());
    if (
      !Array.isArray(data) ||
      data.length !== 4 ||
      data[0] !== owner ||
      data[1] !== scope ||
      typeof data[2] !== "string"
    )
      throw Error();
    const at = new Date(data[2]);
    if (!Number.isFinite(at.getTime()) || at.toISOString() !== data[2])
      throw Error();
    return { at, id: postId(data[3]) };
  } catch {
    throw new PortalError(
      400,
      "Refresh this private prayer list before loading more."
    );
  }
}
export function readPrayerTarget(
  db: PrismaClient,
  token: unknown,
  input: { postId?: unknown; commentId?: unknown }
): Promise<PrayerTargetState> {
  return withAccountRead(db, token, async (tx, actorId) => {
    const ownerId = await requirePrayerOwner(tx, actorId);
    const context = await postContext(tx, ownerId);
    const target = await prayerTargetIn(tx, context, input);
    const visible = prayerParticipantWhere(context, target);
    const [guide, own, count, named] = await Promise.all([
      tx.prayerGuideReceipt.findUnique({ where: { ownerId } }),
      tx.prayerRecord.findUnique({
        where: { ownerId_targetKey: { ownerId, targetKey: target.targetKey } }
      }),
      tx.prayerRecord.count({ where: visible }),
      tx.prayerRecord.findMany({
        where: { AND: [visible, { shareName: true }] },
        select: { owner: { select: { name: true, username: true } } },
        orderBy: { id: "asc" },
        take: 31
      })
    ]);
    return {
      ownerId,
      postId: target.postId,
      commentId: target.commentId,
      href: target.href,
      canAcknowledge: target.canAcknowledge,
      canUpdate: target.canUpdate,
      guide: {
        accepted: guide?.guideVersion === PRAYER_GUIDE_VERSION,
        version: guide?.version ?? 0,
        required: PRAYER_GUIDE_VERSION
      },
      choice: prayerChoice(own),
      count,
      names: named.slice(0, 30).map((row) => row.owner),
      moreNames: named.length > 30
    };
  });
}

async function latestUpdates(
  tx: PostTx,
  context: PostContext,
  targetKeys: string[]
) {
  if (!targetKeys.length)
    return new Map<string, { kind: PrayerUpdateKind; createdAt: Date }>();
  // A per-target SQL limit avoids fetching full histories for a small saved page.
  const blocked = context.blockedIds ?? [];
  const rows = await tx.$queryRaw<
    Array<{ targetKey: string; kind: PrayerUpdateKind; createdAt: Date }>
  >(Prisma.sql`
    SELECT recent.* FROM unnest(ARRAY[${Prisma.join(targetKeys)}]::text[]) AS page(key)
    CROSS JOIN LATERAL (
      SELECT u."targetKey", u.kind, u."createdAt" FROM "PrayerUpdate" u
      JOIN "PlatformPostComment" c ON c.id=u."commentId" AND c."postId"=u."postId"
      WHERE u."targetKey"=page.key AND c."deletedAt" IS NULL AND c."moderationState"='VISIBLE'
        AND (c."authorChurchId" IS NOT NULL OR EXISTS (
          SELECT 1 FROM "PlatformUser" a WHERE a.id=c."authorId"
            AND a."suspendedAt" IS NULL AND a."deactivatedAt" IS NULL
            ${blocked.length ? Prisma.sql`AND a.id NOT IN (${Prisma.join(blocked)})` : Prisma.empty}
        ))
      ORDER BY u."createdAt" DESC, u."commentId" DESC LIMIT 1
    ) recent
  `);
  return new Map(rows.map((row) => [row.targetKey, row]));
}

export function readSavedPrayers(
  db: PrismaClient,
  token: unknown,
  after?: unknown
): Promise<PrayerSavedPage> {
  return withAccountRead(db, token, async (tx, actorId) => {
    const ownerId = await requirePrayerOwner(tx, actorId);
    const cursor = position(after, ownerId, "saved");
    const rows = await tx.prayerRecord.findMany({
      where: {
        ownerId,
        savedAt: { not: null },
        ...(cursor
          ? {
              OR: [
                { savedAt: { lt: cursor.at } },
                { savedAt: cursor.at, id: { lt: cursor.id } }
              ]
            }
          : {})
      },
      orderBy: [{ savedAt: "desc" }, { id: "desc" }],
      take: PAGE + 1
    });
    const page = rows.slice(0, PAGE);
    const context = await postContext(tx, ownerId);
    const posts = new Map(
      (
        await tx.platformPost.findMany({
          where: {
            AND: [
              {
                id: { in: page.map((row) => row.postId) },
                OR: [{ repostKind: null }, { repostKind: "QUOTE" }]
              },
              postReadableWhere(context)
            ]
          },
          select: {
            id: true,
            author: { select: communityAuthorSelect },
            authorChurch: { select: { name: true } }
          },
          take: PAGE
        })
      ).map((row) => [row.id, row])
    );
    const comments = new Map(
      (
        await tx.platformPostComment.findMany({
          where: {
            AND: [
              {
                id: {
                  in: page.flatMap((row) =>
                    row.commentId ? [row.commentId] : []
                  )
                },
                postId: { in: [...posts.keys()] }
              },
              commentVisibleWhere(context)
            ]
          },
          select: {
            id: true,
            postId: true,
            author: { select: communityAuthorSelect },
            authorChurch: { select: { name: true } }
          },
          take: PAGE
        })
      ).map((row) => [row.id, row])
    );
    const available = (row: (typeof page)[number]) =>
      posts.has(row.postId) &&
      (!row.commentId || comments.get(row.commentId)?.postId === row.postId);
    const updates = await latestUpdates(
      tx,
      context,
      page.filter(available).map((row) => row.targetKey)
    );
    const last = page.at(-1);
    return {
      ownerId,
      nextCursor:
        rows.length > PAGE && last
          ? encode(ownerId, "saved", last.savedAt!, last.id)
          : null,
      items: page.map((row) => {
        const visible = available(row);
        const source = row.commentId
          ? comments.get(row.commentId)
          : posts.get(row.postId);
        const update = visible ? updates.get(row.targetKey) : null;
        return {
          id: row.id,
          postId: row.postId,
          commentId: row.commentId,
          savedAt: row.savedAt!.toISOString(),
          available: visible,
          label:
            visible && source
              ? `${row.commentId ? "Comment" : "Post"} by ${source.authorChurch?.name ?? source.author.name}`
              : null,
          href: visible
            ? `/platform/posts/${row.postId}${row.commentId ? `?comment=${row.commentId}` : ""}`
            : null,
          choice: prayerChoice(row),
          latestUpdate: update
            ? { kind: update.kind, createdAt: update.createdAt.toISOString() }
            : null
        };
      })
    };
  });
}

export function readPrayerUpdates(
  db: PrismaClient,
  token: unknown,
  input: { postId?: unknown; commentId?: unknown; after?: unknown }
): Promise<PrayerUpdatePage> {
  return withAccountRead(db, token, async (tx, actorId) => {
    const ownerId = await requirePrayerOwner(tx, actorId);
    const context = await postContext(tx, ownerId);
    const target = await prayerTargetIn(tx, context, input);
    const cursor = position(input.after, ownerId, target.targetKey);
    const rows = await tx.prayerUpdate.findMany({
      where: {
        targetKey: target.targetKey,
        comment: commentVisibleWhere(context),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.at } },
                { createdAt: cursor.at, commentId: { lt: cursor.id } }
              ]
            }
          : {})
      },
      select: {
        commentId: true,
        createdAt: true,
        kind: true,
        comment: { select: { content: true, editedAt: true } }
      },
      orderBy: [{ createdAt: "desc" }, { commentId: "desc" }],
      take: PAGE + 1
    });
    const page = rows.slice(0, PAGE),
      last = page.at(-1);
    return {
      ownerId,
      nextCursor:
        rows.length > PAGE && last
          ? encode(ownerId, target.targetKey, last.createdAt, last.commentId)
          : null,
      items: page.map((row) => ({
        id: row.commentId,
        href: `/platform/posts/${target.postId}?comment=${row.commentId}`,
        kind: row.kind as PrayerUpdateKind,
        createdAt: row.createdAt.toISOString(),
        edited: !!row.comment.editedAt,
        content: row.comment.content
      }))
    };
  });
}
