import type { Prisma } from "@prisma/client";
import { activePublicAccount } from "./public-profile";
import { PortalError } from "./portal-policy";
export type SocialPolicy = {
  blockedIds?: string[];
  mutedIds?: string[];
  mutedChurchIds?: string[];
};
export async function socialPolicy(
  tx: Prisma.TransactionClient,
  ownerId: string,
  now = new Date()
): Promise<SocialPolicy> {
  const blocks = await tx.socialRelationship.findMany({
    where: { blocked: true, OR: [{ ownerId }, { targetUserId: ownerId }] },
    select: { ownerId: true, targetUserId: true },
    take: 2001
  });
  const muted = await tx.socialRelationship.findMany({
    where: { ownerId, OR: [{ muted: true }, { snoozedUntil: { gt: now } }] },
    select: { targetUserId: true, churchId: true },
    take: 2001
  });
  if (blocks.length > 2000 || muted.length > 2000)
    throw new PortalError(503, "These social settings need a size review.");
  return {
    blockedIds: [
      ...new Set(
        blocks.flatMap((r) =>
          r.targetUserId
            ? [r.ownerId === ownerId ? r.targetUserId : r.ownerId]
            : []
        )
      )
    ],
    mutedIds: muted.flatMap((r) => (r.targetUserId ? [r.targetUserId] : [])),
    mutedChurchIds: muted.flatMap((r) => (r.churchId ? [r.churchId] : []))
  };
}
export function socialUserWhere(
  context: SocialPolicy
): Prisma.PlatformUserWhereInput {
  return { ...activePublicAccount, id: { notIn: context.blockedIds ?? [] } };
}
// A church speaks as its own public identity, never as its undisclosed administrator.
export function socialDiscoveryWhere(
  context: SocialPolicy
): Prisma.PlatformPostWhereInput {
  return {
    OR: [
      { authorChurchId: null, authorId: { notIn: context.mutedIds ?? [] } },
      { authorChurchId: { not: null, notIn: context.mutedChurchIds ?? [] } }
    ]
  };
}
export async function mentionAllowed(
  tx: Prisma.TransactionClient,
  senderId: string,
  recipientId: string
) {
  if (senderId === recipientId) return false;
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
    return false;
  const recipient = await tx.platformUser.findFirst({
    where: { id: recipientId, ...activePublicAccount },
    select: { socialPreferences: true }
  });
  if (!recipient) return false;
  const choice = recipient.socialPreferences?.mentions ?? "EVERYONE";
  return (
    choice === "EVERYONE" ||
    (choice === "FOLLOWED" &&
      !!(await tx.platformFollow.findUnique({
        where: {
          followerId_followingId: {
            followerId: recipientId,
            followingId: senderId
          }
        },
        select: { id: true }
      })))
  );
}
