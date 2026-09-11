import type { Prisma, PlatformPostComment, PlatformPost } from "@prisma/client";
import { PortalError } from "./portal";
import {
  postCanEdit,
  postCanModerate,
  postCanReply,
  postId,
  postReadableWhere,
  type PostContext,
  type PostTx
} from "./post-access";
import { socialUserWhere } from "./social-policy";

export function commentVisibleWhere(
  context: PostContext
): Prisma.PlatformPostCommentWhereInput {
  return {
    deletedAt: null,
    OR: [
      { authorChurchId: { not: null } },
      { authorChurchId: null, author: socialUserWhere(context) }
    ]
  };
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
  comment: PlatformPostComment
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
  return tx.platformPostComment.update({
    where: { id: comment.id },
    data: { content: "", deletedAt: new Date(), version: { increment: 1 } }
  });
}
