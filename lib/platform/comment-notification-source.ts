import type { Prisma, SocialEvent } from "@prisma/client";
import { postContext, postReadableWhere } from "./post-access";
import { commentVisibleWhere } from "./comment-policy";
import { mentionAllowed } from "./social-policy";
import type { NotificationSource } from "./notification-source";

export async function commentNotificationSource(
  tx: Prisma.TransactionClient,
  event: Pick<SocialEvent, "recipientId" | "postId" | "commentId" | "actorId">,
  delivery: boolean
): Promise<NotificationSource | null> {
  if (
    !event.recipientId ||
    !event.postId ||
    !event.commentId ||
    event.actorId === event.recipientId
  )
    return null;
  const context = await postContext(tx, event.recipientId);
  const post = await tx.platformPost.findFirst({
    where: { AND: [{ id: event.postId }, postReadableWhere(context)] },
    select: { id: true, authorId: true, authorChurchId: true }
  });
  if (!post || !context.actorId) return null;
  const comment = await tx.platformPostComment.findFirst({
    where: {
      AND: [
        { id: event.commentId, postId: post.id, authorId: event.actorId },
        commentVisibleWhere(context)
      ]
    },
    select: {
      id: true,
      authorId: true,
      authorChurchId: true,
      parent: {
        select: { authorId: true, authorChurchId: true, deletedAt: true }
      },
      mentions: {
        where: { recipientId: event.recipientId, active: true },
        select: { id: true },
        take: 1
      }
    }
  });
  if (!comment) return null;
  if (delivery) {
    const preference = await tx.conversationPreference.findUnique({
      where: {
        ownerId_postId: { ownerId: event.recipientId, postId: post.id }
      },
      select: { mode: true }
    });
    if (
      preference?.mode === "MUTE" ||
      (comment.authorChurchId
        ? context.mutedChurchIds?.includes(comment.authorChurchId)
        : context.mutedIds?.includes(comment.authorId)) ||
      (post.authorChurchId
        ? context.mutedChurchIds?.includes(post.authorChurchId)
        : context.mutedIds?.includes(post.authorId))
    )
      return null;
  }
  const mentioned =
    comment.mentions.length > 0 &&
    (await mentionAllowed(tx, event.actorId, event.recipientId));
  // A church's internal publisher is not the church's notification recipient.
  const replied =
    (!post.authorChurchId && post.authorId === event.recipientId) ||
    (comment.parent &&
      !comment.parent.deletedAt &&
      !comment.parent.authorChurchId &&
      comment.parent.authorId === event.recipientId);
  return mentioned || replied
    ? {
        category: mentioned ? "mentions" : "replies",
        href: `/platform/posts/${post.id}?comment=${comment.id}`,
        group: post.id
      }
    : null;
}
