import type { AdultConversation, Prisma, PrismaClient } from "@prisma/client";
import { founderAccountId } from "./founder-config";
import { FOUNDER_WELCOME_BODY } from "./founder-welcome-content";
import { eligibleWhere, PortalError } from "./portal-policy";
import { communityReportIntakeAvailable } from "./community-reports";
import { conversationPair } from "./adult-contact-policy";
import { notificationWrite } from "./notification-outbox";
import { recordMessageActivity } from "./message-activity";
type Tx = Prisma.TransactionClient;

export async function founderAuthorized(tx: Tx, ownerId: string) {
  return (
    founderAccountId() === ownerId &&
    !!(await tx.platformOperatorGrant.findFirst({
      where: {
        userId: ownerId,
        capability: "REVIEW_COMMUNITY_REPORTS",
        revokedAt: null,
        user: eligibleWhere
      },
      select: { id: true }
    }))
  );
}
export async function founderAvailable(tx: Tx) {
  const id = founderAccountId();
  return process.env.FOUNDER_WELCOME_ENABLED === "true" &&
    id &&
    (await founderAuthorized(tx, id)) &&
    (await communityReportIntakeAvailable(tx, null))
    ? id
    : null;
}
export const founderBlockedWhere = (
  founderId: string,
  recipientId: string
) => ({
  blocked: true,
  OR: [
    { ownerId: founderId, targetUserId: recipientId },
    { ownerId: recipientId, targetUserId: founderId }
  ]
});

// Background-only delivery. Registration stores just a durable new-account intent;
// no provider or founder configuration can roll back account creation.
export function deliverFounderWelcome(db: PrismaClient, recipientId: string) {
  return notificationWrite(db, async (tx) => {
    const prior = await tx.founderWelcome.findUnique({
      where: { recipientId }
    });
    if (prior)
      return { status: "already-sent" as const, messageId: prior.messageId };
    const recipient = await tx.platformUser.findFirst({
      where: {
        id: recipientId,
        pendingFounderWelcomeAt: { not: null },
        ...eligibleWhere
      },
      select: { id: true }
    });
    if (!recipient) return { status: "ineligible" as const };
    const founderId = await founderAvailable(tx);
    if (!founderId) return { status: "unavailable" as const };
    if (
      founderId === recipientId ||
      (await tx.socialRelationship.findFirst({
        where: founderBlockedWhere(founderId, recipientId),
        select: { id: true }
      }))
    ) {
      await tx.platformUser.update({
        where: { id: recipientId },
        data: { pendingFounderWelcomeAt: null }
      });
      return { status: "skipped" as const };
    }
    const pair = conversationPair(founderId, recipientId);
    const conversation = await tx.adultConversation.upsert({
      where: { participantAId_participantBId: pair },
      create: pair,
      update: {}
    });
    // A pre-existing cleared/muted or revoked pair is not reopened by automation.
    const states = await tx.adultConversationState.findMany({
      where: { conversationId: conversation.id }
    });
    if (
      states.some((s) => s.hiddenThrough > 0 || s.muted) ||
      (!conversation.sendingAllowed && conversation.lastSequence > 0)
    ) {
      await tx.platformUser.update({
        where: { id: recipientId },
        data: { pendingFounderWelcomeAt: null }
      });
      return { status: "skipped" as const };
    }
    if (conversation.lastSequence >= 2147483647)
      return { status: "unavailable" as const };
    const current = await tx.adultConversation.update({
      where: { id: conversation.id },
      data: { lastSequence: { increment: 1 } }
    });
    const message = await tx.adultMessage.create({
      data: {
        conversationId: conversation.id,
        senderId: founderId,
        sequence: current.lastSequence,
        kind: "FOUNDER_WELCOME",
        content: FOUNDER_WELCOME_BODY
      }
    });
    await tx.founderWelcome.create({
      data: {
        founderId,
        recipientId,
        conversationId: conversation.id,
        messageId: message.id
      }
    });
    await tx.platformUser.update({
      where: { id: recipientId },
      data: { pendingFounderWelcomeAt: null }
    });
    await recordMessageActivity(tx, {
      key: `adult-message:${message.id}`,
      kind: "ADULT_MESSAGE_CREATED",
      actorId: founderId,
      recipientId,
      conversationId: conversation.id,
      messageId: message.id,
      createdAt: message.createdAt
    });
    return { status: "delivered" as const, messageId: message.id };
  });
}

// One deliberate member reply enables only this canonical pair. A block or account
// restriction permanently retires this welcome exception, even after unblocking.
export async function consentToFounderReply(
  tx: Tx,
  row: AdultConversation,
  ownerId: string
) {
  const welcome = await tx.founderWelcome.findFirst({
    where: {
      conversationId: row.id,
      recipientId: ownerId,
      replyConsentAt: null,
      revokedAt: null
    }
  });
  const state = await tx.adultConversationState.findUnique({
    where: { conversationId_ownerId: { conversationId: row.id, ownerId } }
  });
  const visible =
    welcome &&
    (await tx.adultMessage.findFirst({
      where: {
        conversationId: row.id,
        senderId: welcome.founderId,
        kind: { in: ["FOUNDER_WELCOME", "FOUNDER_ANNOUNCEMENT"] },
        sequence: { gt: state?.hiddenThrough ?? 0 }
      },
      select: { id: true }
    }));
  if (
    !welcome ||
    !visible ||
    (await founderAvailable(tx)) !== welcome.founderId ||
    (await tx.socialRelationship.findFirst({
      where: founderBlockedWhere(welcome.founderId, ownerId),
      select: { id: true }
    }))
  )
    throw new PortalError(
      403,
      "This welcome can no longer open replies. Your unsent text is kept."
    );
  await tx.founderWelcome.update({
    where: { id: welcome.id },
    data: { replyConsentAt: new Date() }
  });
  return tx.adultConversation.update({
    where: { id: row.id },
    data: { sendingAllowed: true, version: { increment: 1 } }
  });
}
