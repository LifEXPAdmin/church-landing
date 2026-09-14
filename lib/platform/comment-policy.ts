import {
  Prisma,
  type PlatformPostComment,
  type PlatformPost
} from "@prisma/client";
import { PortalError } from "./portal-policy";
import {
  postCanEdit,
  postCanModerate,
  postCanReply,
  postReadableWhere,
  type PostContext,
  type PostTx
} from "./post-access";
import { postId } from "./post-input";
import { socialUserWhere } from "./social-policy";
import {
  selectedSourceReport,
  recordReportedWithdrawal
} from "./retention-controls";

export function commentVisibleWhere(
  context: PostContext
): Prisma.PlatformPostCommentWhereInput {
  return {
    deletedAt: null,
    moderationState: "VISIBLE",
    OR: [
      { authorChurchId: { not: null } },
      { authorChurchId: null, author: socialUserWhere(context) }
    ]
  };
}

// Prisma's nested take on a multi-post read fetches all matching comments and
// trims each group in memory. Select only preview IDs with a per-post SQL limit;
// the caller still hydrates them through commentVisibleWhere in the same locked
// transaction. This predicate must match that policy, including church identity.
export async function commentPreviewIds(
  tx: PostTx,
  context: PostContext,
  postIds: string[],
  count: number
) {
  if (!postIds.length) return [];
  if (
    postIds.length > 31 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 31
  )
    throw new PortalError(400, "This comment preview is unavailable.");
  const blocked = context.blockedIds ?? [];
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT preview.id FROM unnest(ARRAY[${Prisma.join(postIds)}]::text[]) AS page(id)
    CROSS JOIN LATERAL (
      SELECT c.id FROM "PlatformPostComment" c
      WHERE c."postId"=page.id AND c."deletedAt" IS NULL
        AND c."moderationState"='VISIBLE'
        AND (c."authorChurchId" IS NOT NULL OR EXISTS (
          SELECT 1 FROM "PlatformUser" a WHERE a.id=c."authorId"
            AND a."suspendedAt" IS NULL AND a."deactivatedAt" IS NULL
            ${blocked.length ? Prisma.sql`AND a.id NOT IN (${Prisma.join(blocked)})` : Prisma.empty}
        ))
      ORDER BY c."createdAt" DESC, c.id DESC LIMIT ${count}
    ) AS preview
  `);
  return rows.map((row) => row.id);
}
export async function readableConversation(
  tx: PostTx,
  context: PostContext,
  id: unknown
) {
  const post = await tx.platformPost.findFirst({
    where: { AND: [{ id: postId(id) }, postReadableWhere(context)] }
  });
  if (!post) throw new PortalError(404, "This conversation is unavailable.");
  return post;
}
export async function readableComment(
  tx: PostTx,
  context: PostContext,
  postId: string,
  id: unknown
) {
  const comment = await tx.platformPostComment.findFirst({
    where: {
      AND: [{ id: postIdValue(id), postId }, commentVisibleWhere(context)]
    }
  });
  if (!comment) throw new PortalError(404, "This comment is unavailable.");
  return comment;
}
const postIdValue = postId;
export function requireReply(context: PostContext, post: PlatformPost) {
  if (!postCanReply(context, post))
    throw new PortalError(
      403,
      "Replies are closed or limited to approved church members."
    );
}
export function canPinComment(context: PostContext, post: PlatformPost) {
  return postCanEdit(context, post) || postCanModerate(context, post);
}
export function canDeleteComment(
  context: PostContext,
  comment: PlatformPostComment
) {
  return comment.authorChurchId
    ? context.publishers.has(comment.authorChurchId)
    : context.actorId === comment.authorId;
}

export async function deleteCommentIn(
  tx: PostTx,
  comment: PlatformPostComment,
  actorId: string
) {
  if (comment.deletedAt) return comment;
  await tx.commentMention.updateMany({
    where: { commentId: comment.id },
    data: { active: false }
  });
  await tx.commentLike.updateMany({
    where: { commentId: comment.id, active: true },
    data: { active: false, version: { increment: 1 } }
  });
  await tx.commentPin.updateMany({
    where: { commentId: comment.id },
    data: { commentId: null, version: { increment: 1 } }
  });
  const reported = await selectedSourceReport(tx, "COMMENT", comment.id),
    now = new Date();
  const updated = await tx.platformPostComment.update({
    where: { id: comment.id },
    data: {
      ...(!reported ? { content: "" } : {}),
      deletedAt: now,
      version: { increment: 1 }
    }
  });
  if (reported)
    await recordReportedWithdrawal(tx, reported, actorId, updated.version, now);
  return updated;
}
