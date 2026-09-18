import {
  revokeNeedContributions,
  disableNeedCoordinator
} from "./exchange-need-lifecycle";
import { recordDiscoveryControl } from "./retention-controls";
import { revokeExchangeInquiries } from "./exchange-handoff-lifecycle";
import type { Prisma } from "@prisma/client";
import type { ContactAudience } from "./adult-contact-types";
import { eligibleWhere, PortalError } from "./portal-policy";
type Tx = Prisma.TransactionClient;

export function contactAudience(value: unknown): ContactAudience {
  if (value === undefined || value === null) return "NOBODY";
  if (value === "NOBODY" || value === "FOLLOWED" || value === "EVERYONE")
    return value;
  throw new PortalError(503, "Your contact choices could not be checked.");
}
export const contactPair = (a: string, b: string) => ({
  OR: [
    { senderId: a, recipientId: b },
    { senderId: b, recipientId: a }
  ]
});
export const conversationPair = (a: string, b: string) => ({
  participantAId: a < b ? a : b,
  participantBId: a < b ? b : a
});
export async function requireContactActor(tx: Tx, ownerId: string) {
  if (
    !(await tx.platformUser.findFirst({
      where: { id: ownerId, ...eligibleWhere },
      select: { id: true }
    }))
  )
    throw new PortalError(
      403,
      "Verify your email and confirm adult eligibility to use contact requests."
    );
}
export async function contactPolicy(
  tx: Tx,
  senderId: string,
  recipientId: string
) {
  const recipient = await tx.platformUser.findFirst({
    where: { id: recipientId, ...eligibleWhere },
    select: {
      id: true,
      name: true,
      username: true,
      socialPreferences: { select: { version: true, contactRequests: true } }
    }
  });
  if (!recipient || senderId === recipientId) return null;
  if (
    !(await tx.platformUser.findFirst({
      where: { id: senderId, ...eligibleWhere },
      select: { id: true }
    }))
  )
    return null;
  if (
    await tx.socialRelationship.findFirst({
      where: {
        blocked: true,
        OR: [
          { ownerId: senderId, targetUserId: recipientId },
          { ownerId: recipientId, targetUserId: senderId }
        ]
      },
      select: { id: true }
    })
  )
    return null;
  const audience = contactAudience(
    recipient.socialPreferences?.contactRequests
  );
  const allowed =
    audience === "EVERYONE" ||
    (audience === "FOLLOWED" &&
      !!(await tx.platformFollow.findUnique({
        where: {
          followerId_followingId: {
            followerId: recipientId,
            followingId: senderId
          }
        },
        select: { id: true }
      })));
  return {
    recipient: {
      id: recipient.id,
      name: recipient.name,
      username: recipient.username
    },
    version: recipient.socialPreferences?.version ?? 0,
    allowed
  };
}

// Called by the canonical relationship writer inside its permission transaction.
// Unblocking or following again never revives revoked acceptance.
export async function revokeBlockedContact(tx: Tx, a: string, b: string) {
  await revokeNeedContributions(
    tx,
    {
      OR: [
        { contributorId: a, coordinatorId: b },
        { contributorId: b, coordinatorId: a }
      ]
    },
    a
  );
  await revokeExchangeInquiries(
    tx,
    {
      OR: [
        { requesterId: a, receiverId: b },
        { requesterId: b, receiverId: a }
      ]
    },
    a
  );
  await tx.founderWelcome.updateMany({
    where: {
      revokedAt: null,
      OR: [
        { founderId: a, recipientId: b },
        { founderId: b, recipientId: a }
      ]
    },
    data: { revokedAt: new Date() }
  });
  await tx.adultContactRequest.updateMany({
    where: { ...contactPair(a, b), status: "PENDING" },
    data: { status: "REVOKED", version: { increment: 1 } }
  });
  await tx.adultConversation.updateMany({
    where: { ...conversationPair(a, b), sendingAllowed: true },
    data: { sendingAllowed: false, version: { increment: 1 } }
  });
}
export async function revokeUnfollowedRequests(
  tx: Tx,
  recipientId: string,
  senderId: string
) {
  if (
    await tx.socialPreferences.findFirst({
      where: { ownerId: recipientId, contactRequests: "FOLLOWED" },
      select: { ownerId: true }
    })
  ) {
    await revokeNeedContributions(
      tx,
      {
        contributorId: senderId,
        coordinatorId: recipientId,
        state: { in: ["QUOTED", "WAITLISTED"] }
      },
      recipientId
    );
    await revokeExchangeInquiries(
      tx,
      { requesterId: senderId, receiverId: recipientId, state: "INQUIRED" },
      recipientId
    );
  }
  await tx.adultContactRequest.updateMany({
    where: {
      senderId,
      recipientId,
      status: "PENDING",
      recipient: {
        socialPreferences: { is: { contactRequests: "FOLLOWED" } },
        following: { none: { followingId: senderId } }
      }
    },
    data: { status: "REVOKED", version: { increment: 1 } }
  });
}
export async function revokeAccountContact(tx: Tx, userId: string) {
  await revokeNeedContributions(
    tx,
    { OR: [{ contributorId: userId }, { coordinatorId: userId }] },
    userId
  );
  const needs = await tx.exchangeNeed.findMany({
    where: { coordinatorId: userId, coordinatorKey: { not: null } },
    select: { id: true }
  });
  for (const need of needs) await disableNeedCoordinator(tx, need.id, userId);
  await revokeExchangeInquiries(
    tx,
    { OR: [{ requesterId: userId }, { receiverId: userId }] },
    userId
  );
  // Disabling listings prevents restoration or a new account session from
  // reviving the earlier named receiver's consent.
  const listings = await tx.exchangeListing.findMany({
    where: { inquiryReceiverId: userId, inquiriesEnabled: true },
    select: { id: true }
  });
  for (const listing of listings) {
    const saved = await tx.exchangeListing.update({
      where: { id: listing.id },
      data: {
        inquiriesEnabled: false,
        inquiryContactVersion: { increment: 1 },
        version: { increment: 1 }
      }
    });
    await recordDiscoveryControl(
      tx,
      "EXCHANGE_CONTACT",
      userId,
      saved.id,
      saved.inquiryContactVersion
    );
  }
  await tx.adultContactRequest.updateMany({
    where: {
      status: "PENDING",
      OR: [{ senderId: userId }, { recipientId: userId }]
    },
    data: { status: "REVOKED", version: { increment: 1 } }
  });
  await tx.adultConversation.updateMany({
    where: {
      sendingAllowed: true,
      OR: [{ participantAId: userId }, { participantBId: userId }]
    },
    data: { sendingAllowed: false, version: { increment: 1 } }
  });
}
