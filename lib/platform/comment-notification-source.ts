import type { Prisma, SocialEvent } from "@prisma/client";
import {
  postContext,
  postReadableWhere,
  type PostContext
} from "./post-access";
import { commentVisibleWhere } from "./comment-policy";
import type { NotificationSource } from "./notification-source";

type CommentEvent = Pick<
  SocialEvent,
  "recipientId" | "postId" | "commentId" | "actorId"
>;

// Source predicates remain shared with the reader. A page loads only selected
// metadata and one current recipient context, never one context per activity row.
export async function commentNotificationSources(
  tx: Prisma.TransactionClient,
  events: CommentEvent[],
  delivery: boolean,
  suppliedContext?: PostContext
): Promise<Map<CommentEvent, NotificationSource>> {
  const result = new Map<CommentEvent, NotificationSource>();
  const ownerId = events[0]?.recipientId;
  if (
    !ownerId ||
    events.some((e) => e.recipientId !== ownerId) ||
    events.length > 50
  )
    return result;
  const valid = events.filter(
    (e) => e.commentId && e.postId && e.actorId !== ownerId
  );
  if (!valid.length) return result;
  const context = suppliedContext ?? (await postContext(tx, ownerId));
  if (context.actorId !== ownerId) return result;
  const comments = await tx.platformPostComment.findMany({
    where: {
      AND: [
        {
          OR: valid.map((e) => ({
            id: e.commentId!,
            postId: e.postId!,
            authorId: e.actorId
          }))
        },
        commentVisibleWhere(context),
        { post: postReadableWhere(context) }
      ]
    },
    select: {
      id: true,
      createdAt: true,
      authorId: true,
      authorChurchId: true,
      post: { select: { id: true, authorId: true, authorChurchId: true } },
      parent: {
        select: { authorId: true, authorChurchId: true, deletedAt: true }
      },
      mentions: {
        where: { recipientId: ownerId, active: true },
        select: { id: true },
        take: 1
      }
    },
    take: 50
  });
  if (!comments.length) return result;
  const preference = await tx.socialPreferences.findUnique({
    where: { ownerId },
    select: { mentions: true, conversationPushSince: true }
  });
  const choice = preference?.mentions ?? "EVERYONE";
  const followed = new Set(
    choice === "FOLLOWED"
      ? (
          await tx.platformFollow.findMany({
            where: {
              followerId: ownerId,
              followingId: { in: comments.map((c) => c.authorId) }
            },
            select: { followingId: true },
            take: 50
          })
        ).map((f) => f.followingId)
      : []
  );
  const conversations = new Map(
    (
      await tx.conversationPreference.findMany({
        where: {
          ownerId,
          postId: { in: comments.map((c) => c.post.id) }
        },
        select: { postId: true, mode: true, followedAt: true },
        take: 50
      })
    ).map((p) => [p.postId, p])
  );
  for (const comment of comments) {
    const post = comment.post;
    if (
      delivery &&
      (conversations.get(post.id)?.mode === "MUTE" ||
        (comment.authorChurchId
          ? context.mutedChurchIds?.includes(comment.authorChurchId)
          : context.mutedIds?.includes(comment.authorId)) ||
        (post.authorChurchId
          ? context.mutedChurchIds?.includes(post.authorChurchId)
          : context.mutedIds?.includes(post.authorId)))
    )
      continue;
    const mentioned =
      comment.mentions.length > 0 &&
      !context.blockedIds?.includes(comment.authorId) &&
      (choice === "EVERYONE" ||
        (choice === "FOLLOWED" && followed.has(comment.authorId)));
    // Church publishers are not personal recipients of church-owned activity.
    const replied =
      (!post.authorChurchId && post.authorId === ownerId) ||
      (comment.parent &&
        !comment.parent.deletedAt &&
        !comment.parent.authorChurchId &&
        comment.parent.authorId === ownerId);
    const conversation = conversations.get(post.id);
    const following =
      conversation?.mode === "FOLLOW" &&
      conversation.followedAt &&
      conversation.followedAt < comment.createdAt &&
      (!delivery ||
        (preference?.conversationPushSince &&
          preference.conversationPushSince < comment.createdAt));
    if (mentioned || replied || following)
      for (const event of valid) {
        if (
          event.commentId !== comment.id ||
          event.postId !== post.id ||
          event.actorId !== comment.authorId
        )
          continue;
        result.set(event, {
          category: mentioned
            ? "mentions"
            : replied
              ? "replies"
              : "conversations",
          href: `/platform/posts/${post.id}?comment=${comment.id}`,
          group: post.id
        });
      }
  }
  return result;
}

export async function commentNotificationSource(
  tx: Prisma.TransactionClient,
  event: CommentEvent,
  delivery: boolean
): Promise<NotificationSource | null> {
  return (
    (await commentNotificationSources(tx, [event], delivery)).get(event) ?? null
  );
}
