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
> & { notificationCategory?: string | null };

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
            OR: [{ authorId: e.actorId }, { authorChurchId: { not: null } }]
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
      prayerUpdate: { select: { targetKey: true } },
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
  // A later church publisher may introduce a mention without becoming the
  // comment's original author. The immutable canonical mention intent proves
  // that exact editor/recipient pair; it grants no reply or follower authority.
  const churchMentions = valid.filter((event) =>
    comments.some(
      (comment) =>
        comment.id === event.commentId &&
        comment.authorChurchId &&
        comment.authorId !== event.actorId &&
        comment.mentions.length > 0
    )
  );
  const mentionIntents = churchMentions.length
    ? await tx.socialEvent.findMany({
        where: {
          kind: "COMMENT_MENTIONED",
          recipientId: ownerId,
          key: {
            in: churchMentions.map(
              (event) => `mention:${event.commentId}:${ownerId}`
            )
          }
        },
        select: { key: true, actorId: true, postId: true, commentId: true },
        take: 50
      })
    : [];
  const preference = await tx.socialPreferences.findUnique({
    where: { ownerId },
    select: {
      mentions: true,
      conversationPushSince: true,
      prayerPushSince: true
    }
  });
  const choice = preference?.mentions ?? "EVERYONE";
  const followed = new Set(
    choice === "FOLLOWED"
      ? (
          await tx.platformFollow.findMany({
            where: {
              followerId: ownerId,
              followingId: { in: valid.map((event) => event.actorId) }
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
  const prayerKeys = comments.flatMap((comment) =>
    comment.prayerUpdate ? [comment.prayerUpdate.targetKey] : []
  );
  const prayerSubscriptions = new Map(
    (prayerKeys.length
      ? await tx.prayerRecord.findMany({
          where: {
            ownerId,
            targetKey: { in: prayerKeys },
            savedAt: { not: null },
            updatesSince: { not: null },
            OR: [
              { commentId: null },
              { comment: { is: commentVisibleWhere(context) } }
            ]
          },
          select: { targetKey: true, updatesSince: true },
          take: 50
        })
      : []
    ).map((row) => [row.targetKey, row])
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
    const subscription = comment.prayerUpdate
      ? prayerSubscriptions.get(comment.prayerUpdate.targetKey)
      : null;
    const prayer =
      subscription?.updatesSince &&
      subscription.updatesSince < comment.createdAt &&
      (!delivery ||
        (preference?.prayerPushSince &&
          preference.prayerPushSince < comment.createdAt));
    for (const event of valid) {
      if (event.commentId !== comment.id || event.postId !== post.id) continue;
      const originalActor = event.actorId === comment.authorId;
      const churchMention =
        !!comment.authorChurchId &&
        (event.notificationCategory === undefined ||
          event.notificationCategory === "mentions") &&
        mentionIntents.some(
          (intent) =>
            intent.key === `mention:${comment.id}:${ownerId}` &&
            intent.postId === post.id &&
            intent.commentId === comment.id &&
            intent.actorId === event.actorId
        );
      if (!originalActor && !churchMention) continue;
      const mentioned =
        comment.mentions.length > 0 &&
        !context.blockedIds?.includes(event.actorId) &&
        (choice === "EVERYONE" ||
          (choice === "FOLLOWED" && followed.has(event.actorId)));
      const eligible = {
        mentions: mentioned,
        replies: originalActor && replied,
        prayer: originalActor && !!prayer,
        conversations: originalActor && !!following
      };
      if (!Object.values(eligible).some(Boolean)) continue;
      const category = event.notificationCategory;
      if (
        category &&
        (!(category in eligible) ||
          !eligible[category as keyof typeof eligible])
      )
        continue;
      result.set(event, {
        category:
          (category as keyof typeof eligible) ??
          (mentioned
            ? "mentions"
            : eligible.replies
              ? "replies"
              : eligible.prayer
                ? "prayer"
                : "conversations"),
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
