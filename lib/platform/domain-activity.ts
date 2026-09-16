import { randomUUID } from "node:crypto";
import type { Prisma, SocialEvent, PlatformPost } from "@prisma/client";
import { domainNotificationSources } from "./domain-notification-source";
import { enqueueNotification } from "./notification-outbox";
import type { NotificationCategory } from "./notification-preferences";

type Tx = Prisma.TransactionClient;
export type DomainIntent = {
  kind: string;
  sourceId: string;
  sourceVersion: number;
  actorId: string;
  recipientId: string;
  category: NotificationCategory;
  postId?: string | null;
  commentId?: string | null;
  createdAt?: Date;
  once?: boolean;
};
export async function recordDomainActivity(tx: Tx, intent: DomainIntent) {
  const key = `domain:${intent.kind}:${intent.sourceId}:${intent.once ? "first" : intent.sourceVersion}:${intent.recipientId}`;
  if (await tx.socialEvent.findUnique({ where: { key }, select: { id: true } }))
    return;
  const event: SocialEvent = {
    id: randomUUID(),
    key,
    kind: intent.kind,
    notificationCategory: intent.category,
    sourceId: intent.sourceId,
    sourceVersion: intent.sourceVersion,
    actorId: intent.actorId,
    recipientId: intent.recipientId,
    postId: intent.postId ?? null,
    commentId: intent.commentId ?? null,
    createdAt: intent.createdAt ?? new Date(),
    activityReadAt: null,
    activityMarkedUnreadAt: null,
    activitySequence: BigInt(0),
    requestId: null,
    conversationId: null,
    messageId: null,
    reportId: null,
    decisionId: null
  };
  if (
    !(
      await domainNotificationSources(
        tx,
        [event],
        false,
        new Date(),
        undefined,
        "ANY"
      )
    ).has(event.id)
  )
    return;
  const { activitySequence: ignored, ...data } = event;
  void ignored;
  const saved = await tx.socialEvent.create({ data });
  await enqueueNotification(tx, saved, undefined, event.createdAt);
}

export async function recordFanout(
  tx: Tx,
  kind:
    | "AUTHOR_POST"
    | "EXCHANGE_LISTING"
    | "CHURCH_REVIEW"
    | "EVENT_CHANGED"
    | "VOLUNTEER_CHANGED"
    | "VOLUNTEER_REQUEST"
    | "FEEDBACK_IDEA",
  sourceId: string,
  sourceVersion: number,
  actorId: string,
  createdAt = new Date()
) {
  const key = `${kind}:${sourceId}:${sourceVersion}`;
  return tx.notificationFanoutJob.upsert({
    where: { key },
    create: { key, kind, sourceId, sourceVersion, actorId, createdAt },
    update: {}
  });
}
export async function recordChurchRoleChanges(
  tx: Tx,
  actorId: string,
  ids: string[]
) {
  if (ids.length > 10)
    throw Error("Church position assignment bound exceeded.");
  const assignments = await tx.churchPositionAssignment.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      version: true,
      connection: { select: { userId: true } }
    },
    take: 10
  });
  for (const assignment of assignments)
    await recordDomainActivity(tx, {
      kind: "CHURCH_ROLE",
      category: "church",
      sourceId: assignment.id,
      sourceVersion: assignment.version,
      actorId,
      recipientId: assignment.connection.userId
    });
}
export async function recordPostMentions(tx: Tx, post: PlatformPost) {
  if (
    post.status !== "PUBLISHED" ||
    !post.publishedAt ||
    post.repostKind === "PLAIN"
  )
    return;
  const mentions = await tx.postMention.findMany({
    where: { postId: post.id, active: true },
    take: 6
  });
  if (mentions.length > 5) throw Error("Post mention bound exceeded.");
  for (const mention of mentions)
    await recordDomainActivity(tx, {
      kind: "POST_MENTION",
      category: "mentions",
      sourceId: mention.id,
      sourceVersion: 1,
      actorId: post.authorId,
      recipientId: mention.recipientId,
      postId: post.id,
      once: true
    });
}
export async function recordPostPublication(tx: Tx, post: PlatformPost) {
  await recordPostMentions(tx, post);
  if (
    post.status !== "PUBLISHED" ||
    !post.publishedAt ||
    post.repostKind === "PLAIN"
  )
    return;
  if (
    !(await tx.socialRelationship.findFirst({
      where: {
        ...(post.authorChurchId
          ? { churchId: post.authorChurchId }
          : { targetUserId: post.authorId }),
        authorBellSince: { lt: post.publishedAt },
        blocked: false
      },
      select: { id: true }
    }))
  )
    return;
  await recordFanout(
    tx,
    "AUTHOR_POST",
    post.id,
    post.version,
    post.authorId,
    post.publishedAt
  );
}
