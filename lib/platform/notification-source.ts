import {
  domainNotificationKinds,
  domainNotificationSources
} from "./domain-notification-source";
import type { Prisma, SocialEvent } from "@prisma/client";
import { eligibleWhere } from "./portal-policy";
import { adultMemberWhere, adultOtherId } from "./adult-message-policy";
import { postContext, type PostContext } from "./post-access";
import {
  reportReviewAuthority,
  reviewReportRows
} from "./community-report-review";
import { reportReviewHref } from "./community-report-types";
import type { NotificationCategory } from "./notification-preferences";
import { commentNotificationSources } from "./comment-notification-source";
import { authorDecisionWhere } from "./content-moderation";
import { contentNoticeHref } from "./content-moderation-types";
type Tx = Prisma.TransactionClient;
export type NotificationSource = {
  category: NotificationCategory | "test";
  href: string;
  group: string;
  summary?: string;
  /** Source deadline bounds provider retention as well as worker submission. */
  expiresAt?: Date;
};

// All channels reuse current canonical authority. Bounded pages share metadata
// reads; neither source resolution nor an outbox contains message/report bodies.
export async function notificationSources(
  tx: Tx,
  events: SocialEvent[],
  delivery: boolean | "EMAIL",
  now = new Date(),
  suppliedContext?: PostContext
): Promise<Map<string, NotificationSource>> {
  const result = new Map<string, NotificationSource>();
  const ownerId = events[0]?.recipientId;
  if (
    !ownerId ||
    events.length > 50 ||
    events.some((e) => e.recipientId !== ownerId) ||
    !(await tx.platformUser.findFirst({
      where: { id: ownerId, ...eligibleWhere },
      select: { id: true }
    }))
  )
    return result;
  const deliveryPreferences =
    delivery && events.some((e) => e.kind !== "PUSH_TEST")
      ? await tx.socialPreferences.findUnique({
          where: { ownerId },
          select: { activityReadThrough: true, contactRequests: true }
        })
      : null;
  if (delivery)
    events = events.filter(
      (e) =>
        e.kind === "PUSH_TEST" ||
        (!e.activityReadAt &&
          e.activitySequence >
            (deliveryPreferences?.activityReadThrough ?? BigInt(0)))
    );
  for (const event of events)
    if (
      event.kind === "PUSH_TEST" &&
      event.actorId === ownerId &&
      event.createdAt.getTime() + 600000 > now.getTime()
    )
      result.set(event.id, {
        category: "test",
        href: "/platform/settings/notifications",
        group: event.id
      });
  const domain = events.filter(
    (e) =>
      domainNotificationKinds.includes(e.kind) && e.sourceId && e.sourceVersion
  );
  if (domain.length) {
    const sources = await domainNotificationSources(
      tx,
      domain,
      !!delivery,
      now,
      suppliedContext,
      delivery === "EMAIL" ? "EMAIL" : delivery ? "PUSH" : "IN_APP"
    );
    for (const [id, source] of sources) result.set(id, source);
  }
  const comments = events.filter((e) => e.kind === "COMMENT_ACTIVITY");
  const reports = events.filter(
    (e) =>
      ["REPORT_RECEIVED", "REPORT_RECONSIDERATION"].includes(e.kind) &&
      e.reportId
  );
  const decisions = events.filter(
    (e) => e.kind === "CONTENT_DECISION" && e.decisionId && e.reportId
  );
  if (comments.length || reports.length || decisions.length) {
    const context = suppliedContext ?? (await postContext(tx, ownerId));
    if (context.actorId !== ownerId) return result;
    if (comments.length) {
      const sources = await commentNotificationSources(
        tx,
        comments,
        !!delivery,
        context
      );
      for (const event of comments) {
        const source = sources.get(event);
        if (source) result.set(event.id, source);
      }
    }
    if (reports.length) {
      const authority = await reportReviewAuthority(tx, context);
      const visible = new Set(
        (
          await reviewReportRows(tx, authority, {
            ids: reports.map((e) => e.reportId!),
            status: delivery ? "OPEN" : undefined,
            limit: 50
          })
        ).map((r) => r.id)
      );
      for (const event of reports)
        if (visible.has(event.reportId!))
          result.set(event.id, {
            category: "reports",
            href: reportReviewHref(event.reportId!),
            group: event.reportId!
          });
    }
    if (decisions.length) {
      const rows = await tx.communityReportDecision.findMany({
        where: {
          AND: [
            { id: { in: decisions.map((e) => e.decisionId!) } },
            await authorDecisionWhere(tx, context)
          ]
        },
        select: { id: true, actorId: true, reportId: true },
        take: 50
      });
      const sealed = new Set(
        (
          await tx.retentionPurge.findMany({
            where: {
              target: "REPORT",
              targetId: { in: rows.map((r) => r.reportId) }
            },
            select: { targetId: true },
            take: 50
          })
        ).map((r) => r.targetId)
      );
      const visible = new Map(rows.map((r) => [r.id, r]));
      for (const event of decisions) {
        const row = visible.get(event.decisionId!);
        if (
          row &&
          row.reportId === event.reportId &&
          row.actorId === event.actorId &&
          !sealed.has(row.reportId)
        )
          result.set(event.id, {
            category: "reports",
            href: contentNoticeHref(row.id),
            group: row.id
          });
      }
    }
  }
  const adult = events.filter(
    (e) =>
      [
        "ADULT_REQUEST_CREATED",
        "ADULT_REQUEST_ACCEPTED",
        "ADULT_MESSAGE_CREATED"
      ].includes(e.kind) && e.actorId !== ownerId
  );
  if (!adult.length) return result;
  const actorIds = [...new Set(adult.map((e) => e.actorId))];
  const eligible = new Set(
    (
      await tx.platformUser.findMany({
        where: { id: { in: actorIds }, ...eligibleWhere },
        select: { id: true },
        take: 50
      })
    ).map((u) => u.id)
  );
  const blocks = await tx.socialRelationship.findMany({
    where: {
      blocked: true,
      OR: [
        { ownerId, targetUserId: { in: actorIds } },
        { ownerId: { in: actorIds }, targetUserId: ownerId }
      ]
    },
    select: { ownerId: true, targetUserId: true },
    take: 100
  });
  const blocked = new Set(
    blocks.map((b) => (b.ownerId === ownerId ? b.targetUserId : b.ownerId))
  );
  const valid = adult.filter(
    (e) => eligible.has(e.actorId) && !blocked.has(e.actorId)
  );
  if (!valid.length) return result;
  const requestIds = valid.flatMap((e) => (e.requestId ? [e.requestId] : []));
  const requests = new Map(
    (requestIds.length
      ? await tx.adultContactRequest.findMany({
          where: {
            id: { in: requestIds },
            OR: [{ senderId: ownerId }, { recipientId: ownerId }]
          },
          select: {
            id: true,
            senderId: true,
            recipientId: true,
            status: true,
            expiresAt: true,
            conversationId: true
          },
          take: 50
        })
      : []
    ).map((r) => [r.id, r])
  );
  const pending = valid.filter((e) => e.kind === "ADULT_REQUEST_CREATED");
  if (pending.length) {
    const choices = delivery
      ? deliveryPreferences
      : await tx.socialPreferences.findUnique({
          where: { ownerId },
          select: { contactRequests: true }
        });
    const followed = new Set(
      choices?.contactRequests === "FOLLOWED"
        ? (
            await tx.platformFollow.findMany({
              where: {
                followerId: ownerId,
                followingId: { in: pending.map((e) => e.actorId) }
              },
              select: { followingId: true },
              take: 50
            })
          ).map((f) => f.followingId)
        : []
    );
    for (const event of pending) {
      const request = requests.get(event.requestId ?? "");
      if (
        request &&
        request.senderId === event.actorId &&
        request.recipientId === ownerId &&
        request.status === "PENDING" &&
        request.expiresAt > now &&
        (choices?.contactRequests === "EVERYONE" ||
          (choices?.contactRequests === "FOLLOWED" &&
            followed.has(event.actorId)))
      )
        result.set(event.id, {
          category: "requests",
          href: `/platform/messages/requests?id=${request.id}`,
          group: request.id
        });
    }
  }
  const conversationIds = valid.flatMap((e) =>
    e.conversationId ? [e.conversationId] : []
  );
  if (!conversationIds.length) return result;
  const conversations = new Map(
    (
      await tx.adultConversation.findMany({
        where: { id: { in: conversationIds }, ...adultMemberWhere(ownerId) },
        select: {
          id: true,
          participantAId: true,
          participantBId: true,
          sendingAllowed: true,
          states: {
            where: { ownerId },
            select: { muted: true, readThrough: true, hiddenThrough: true },
            take: 1
          },
          founderWelcome: {
            select: { recipientId: true, founderId: true, revokedAt: true }
          }
        },
        take: 50
      })
    ).map((c) => [c.id, c])
  );
  const messageIds = valid.flatMap((e) =>
    e.kind === "ADULT_MESSAGE_CREATED" && e.messageId ? [e.messageId] : []
  );
  const messages = new Map(
    (messageIds.length
      ? await tx.adultMessage.findMany({
          where: {
            id: { in: messageIds },
            conversationId: { in: [...conversations.keys()] }
          },
          select: {
            id: true,
            senderId: true,
            conversationId: true,
            sequence: true,
            kind: true
          },
          take: 50
        })
      : []
    ).map((m) => [m.id, m])
  );
  for (const event of valid) {
    const conversation = conversations.get(event.conversationId ?? "");
    if (!conversation || adultOtherId(conversation, ownerId) !== event.actorId)
      continue;
    const state = conversation.states[0];
    if (delivery && state?.muted) continue;
    const href = `/platform/messages/${conversation.id}`;
    if (event.kind === "ADULT_REQUEST_ACCEPTED") {
      const request = requests.get(event.requestId ?? "");
      if (
        conversation.sendingAllowed &&
        request &&
        request.recipientId === event.actorId &&
        request.senderId === ownerId &&
        request.conversationId === conversation.id &&
        request.status === "ACCEPTED" &&
        (!delivery || !state?.readThrough)
      )
        result.set(event.id, {
          category: "requests",
          href,
          group: conversation.id
        });
      continue;
    }
    if (event.kind !== "ADULT_MESSAGE_CREATED") continue;
    const message = messages.get(event.messageId ?? "");
    if (
      !message ||
      message.senderId !== event.actorId ||
      message.conversationId !== conversation.id ||
      message.sequence <=
        Math.max(
          state?.hiddenThrough ?? 0,
          delivery ? (state?.readThrough ?? 0) : 0
        )
    )
      continue;
    const founder = conversation.founderWelcome;
    if (
      !conversation.sendingAllowed &&
      !(
        ["FOUNDER_WELCOME", "FOUNDER_ANNOUNCEMENT"].includes(message.kind) &&
        founder?.recipientId === ownerId &&
        founder.founderId === event.actorId &&
        !founder.revokedAt
      )
    )
      continue;
    result.set(event.id, {
      category:
        message.kind === "FOUNDER_ANNOUNCEMENT" ? "founder" : "messages",
      href: `${href}?message=${message.id}`,
      group: conversation.id
    });
  }
  return result;
}

export async function notificationSource(
  tx: Tx,
  event: SocialEvent,
  delivery: boolean | "EMAIL",
  now = new Date()
): Promise<NotificationSource | null> {
  return (
    (await notificationSources(tx, [event], delivery, now)).get(event.id) ??
    null
  );
}
