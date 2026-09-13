import type { Prisma, SocialEvent } from "@prisma/client";
import { eligibleWhere } from "./portal-policy";
import { adultMemberWhere, adultOtherId } from "./adult-message-policy";
import { postContext } from "./post-access";
import {
  reportReviewAuthority,
  reviewReportRows
} from "./community-report-review";
import { reportReviewHref } from "./community-report-types";
import type { NotificationCategory } from "./notification-preferences";
import { commentNotificationSource } from "./comment-notification-source";
type Tx = Prisma.TransactionClient;
export type NotificationSource = {
  category: NotificationCategory | "test";
  href: string;
  group: string;
};
// Every channel resolves the canonical source again. This reads metadata only;
// the outbox and lock-screen payload never contain a message or report body.
export async function notificationSource(
  tx: Tx,
  event: SocialEvent,
  delivery: boolean,
  now = new Date()
): Promise<NotificationSource | null> {
  const ownerId = event.recipientId;
  if (
    !ownerId ||
    !(await tx.platformUser.findFirst({
      where: { id: ownerId, ...eligibleWhere },
      select: { id: true }
    }))
  )
    return null;
  if (event.kind === "PUSH_TEST")
    return event.actorId === ownerId &&
      event.createdAt.getTime() + 600000 > now.getTime()
      ? {
          category: "test",
          href: "/platform/settings/notifications",
          group: event.id
        }
      : null;
  if (event.kind === "COMMENT_ACTIVITY")
    return commentNotificationSource(tx, event, delivery);
  if (event.kind === "REPORT_RECEIVED" && event.reportId) {
    const authority = await reportReviewAuthority(
      tx,
      await postContext(tx, ownerId)
    );
    const report = (
      await reviewReportRows(tx, authority, {
        id: event.reportId,
        status: delivery ? "OPEN" : undefined,
        limit: 1
      })
    )[0];
    return report
      ? {
          category: "reports",
          href: reportReviewHref(report.id),
          group: report.id
        }
      : null;
  }
  if (
    event.actorId === ownerId ||
    !(await tx.platformUser.findFirst({
      where: { id: event.actorId, ...eligibleWhere },
      select: { id: true }
    })) ||
    (await tx.socialRelationship.findFirst({
      where: {
        blocked: true,
        OR: [
          { ownerId, targetUserId: event.actorId },
          { ownerId: event.actorId, targetUserId: ownerId }
        ]
      },
      select: { id: true }
    }))
  )
    return null;
  if (event.kind === "ADULT_REQUEST_CREATED" && event.requestId) {
    const request = await tx.adultContactRequest.findFirst({
      where: {
        id: event.requestId,
        senderId: event.actorId,
        recipientId: ownerId,
        status: "PENDING",
        expiresAt: { gt: now }
      },
      select: { id: true }
    });
    if (!request) return null;
    const choices = await tx.socialPreferences.findUnique({
      where: { ownerId },
      select: { contactRequests: true }
    });
    if (
      !choices ||
      choices.contactRequests === "NOBODY" ||
      (choices.contactRequests === "FOLLOWED" &&
        !(await tx.platformFollow.findUnique({
          where: {
            followerId_followingId: {
              followerId: ownerId,
              followingId: event.actorId
            }
          },
          select: { id: true }
        })))
    )
      return null;
    return {
      category: "requests",
      href: "/platform/messages/requests",
      group: request.id
    };
  }
  if (!event.conversationId) return null;
  const conversation = await tx.adultConversation.findFirst({
    where: { id: event.conversationId, ...adultMemberWhere(ownerId) },
    include: {
      states: { where: { ownerId }, take: 1 },
      founderWelcome: {
        select: { recipientId: true, founderId: true, revokedAt: true }
      }
    }
  });
  if (!conversation || adultOtherId(conversation, ownerId) !== event.actorId)
    return null;
  const state = conversation.states[0];
  if (delivery && state?.muted) return null;
  const href = `/platform/messages/${conversation.id}`;
  if (event.kind === "ADULT_REQUEST_ACCEPTED" && event.requestId) {
    const request = await tx.adultContactRequest.findFirst({
      where: {
        id: event.requestId,
        recipientId: event.actorId,
        senderId: ownerId,
        conversationId: conversation.id,
        status: "ACCEPTED"
      },
      select: { id: true }
    });
    return conversation.sendingAllowed &&
      request &&
      (!delivery || !state?.readThrough)
      ? { category: "requests", href, group: conversation.id }
      : null;
  }
  if (event.kind !== "ADULT_MESSAGE_CREATED" || !event.messageId) return null;
  const message = await tx.adultMessage.findFirst({
    where: {
      id: event.messageId,
      senderId: event.actorId,
      conversationId: conversation.id,
      sequence: {
        gt: Math.max(
          state?.hiddenThrough ?? 0,
          delivery ? (state?.readThrough ?? 0) : 0
        )
      }
    },
    select: { id: true, kind: true }
  });
  const founder = conversation.founderWelcome;
  if (
    !conversation.sendingAllowed &&
    !(
      message &&
      ["FOUNDER_WELCOME", "FOUNDER_ANNOUNCEMENT"].includes(message.kind) &&
      founder?.recipientId === ownerId &&
      founder.founderId === event.actorId &&
      !founder.revokedAt
    )
  )
    return null;
  return message
    ? {
        category:
          message.kind === "FOUNDER_ANNOUNCEMENT" ? "founder" : "messages",
        href: `${href}?message=${message.id}`,
        group: conversation.id
      }
    : null;
}
