import { randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { accountConfig } from "./account-config";
import { withOwnedSession } from "./account-sessions";
import { eligibleWhere, expected, isEligible, PortalError } from "./portal";
import { ADULT_POLICY } from "./portal-types";
import { socialCommand, socialInput } from "./social-operations";
type Tx = Prisma.TransactionClient;
export const FRIEND_INVITATION_DAYS = 30;
export const validFriendCode = (code: unknown): code is string =>
  typeof code === "string" && /^[A-Za-z0-9_-]{43}$/.test(code);
const pair = (a: string, b: string) => ({
  OR: [
    { inviterId: a, recipientId: b },
    { inviterId: b, recipientId: a }
  ]
});
const eligibilitySelect = {
  suspendedAt: true,
  deactivatedAt: true,
  emailVerifiedAt: true,
  adultAcknowledgedAt: true,
  adultPolicyVersion: true
} as const;
const edges = (a: string, b: string) => ({
  OR: [
    { followerId: a, followingId: b },
    { followerId: b, followingId: a }
  ]
});
const blocked = async (tx: Tx, a: string, b: string) =>
  !!(await tx.socialRelationship.findFirst({
    where: {
      blocked: true,
      OR: [
        { ownerId: a, targetUserId: b },
        { ownerId: b, targetUserId: a }
      ]
    },
    select: { id: true }
  }));
export async function publicFriendInvitation(tx: Tx, code: unknown) {
  if (!validFriendCode(code)) return null;
  return tx.friendInvitation.findFirst({
    where: {
      token: code,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      owner: eligibleWhere
    },
    select: {
      ownerId: true,
      version: true,
      expiresAt: true,
      owner: { select: { name: true, username: true } }
    }
  });
}
// Called only in the transaction inserting a genuinely new account. No duplicate
// registration or later browser tab may replace this account-bound choice.
export async function bindSignupFriendInvitation(
  tx: Tx,
  recipientId: string,
  code: unknown,
  consent: unknown
) {
  if (consent !== true) return;
  const invitation = await publicFriendInvitation(tx, code);
  if (!invitation || invitation.ownerId === recipientId) return;
  if (
    (await tx.friendAcceptance.count({
      where: { inviterId: invitation.ownerId }
    })) >= 2000
  )
    return;
  await tx.friendAcceptance.create({
    data: {
      inviterId: invitation.ownerId,
      recipientId,
      signupRecipientId: recipientId,
      invitationVersion: invitation.version
    }
  });
}
export async function removeFriendConnection(tx: Tx, a: string, b: string) {
  const records = await tx.friendAcceptance.updateMany({
    where: pair(a, b),
    data: { state: "REMOVED" }
  });
  if (!records.count) return;
  await tx.platformFollow.deleteMany({ where: edges(a, b) });
  await tx.socialRelationship.updateMany({
    where: {
      OR: [
        { ownerId: a, targetUserId: b },
        { ownerId: b, targetUserId: a }
      ]
    },
    data: { favorite: false, version: { increment: 1 } }
  });
}
export async function revokeAccountFriendInvitations(tx: Tx, userId: string) {
  await tx.friendInvitation.updateMany({
    where: { ownerId: userId },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  const accepted = await tx.friendAcceptance.findMany({
    where: { OR: [{ inviterId: userId }, { recipientId: userId }] },
    select: { inviterId: true, recipientId: true }
  });
  const others = [
    ...new Set(
      accepted.map((row) =>
        row.inviterId === userId ? row.recipientId : row.inviterId
      )
    )
  ];
  await tx.friendAcceptance.updateMany({
    where: { OR: [{ inviterId: userId }, { recipientId: userId }] },
    data: { state: "REMOVED" }
  });
  if (others.length) {
    await tx.platformFollow.deleteMany({
      where: {
        OR: [
          { followerId: userId, followingId: { in: others } },
          { followingId: userId, followerId: { in: others } }
        ]
      }
    });
    await tx.socialRelationship.updateMany({
      where: {
        OR: [
          { ownerId: userId, targetUserId: { in: others } },
          { targetUserId: userId, ownerId: { in: others } }
        ]
      },
      data: { favorite: false, version: { increment: 1 } }
    });
  }
}
export async function hasFriendConnection(tx: Tx, a: string, b: string) {
  if (
    !(await tx.friendAcceptance.findFirst({
      where: { ...pair(a, b), state: "CONNECTED" },
      select: { id: true }
    }))
  )
    return false;
  return (
    (await tx.platformUser.count({
      where: { id: { in: [a, b] }, suspendedAt: null, deactivatedAt: null }
    })) === 2 &&
    (await tx.platformFollow.count({ where: edges(a, b) })) === 2 &&
    !(await blocked(tx, a, b))
  );
}
async function finishAcceptance(tx: Tx, id: string) {
  const row = await tx.friendAcceptance.findUniqueOrThrow({ where: { id } });
  if (row.state !== "PENDING") return row.state;
  const [inviter, recipient, invite] = await Promise.all([
    tx.platformUser.findUnique({
      where: { id: row.inviterId },
      select: eligibilitySelect
    }),
    tx.platformUser.findUnique({
      where: { id: row.recipientId },
      select: eligibilitySelect
    }),
    tx.friendInvitation.findUnique({ where: { ownerId: row.inviterId } })
  ]);
  const removed = await tx.friendAcceptance.findFirst({
    where: { ...pair(row.inviterId, row.recipientId), state: "REMOVED" },
    select: { id: true }
  });
  if (
    removed ||
    !inviter ||
    !recipient ||
    inviter.suspendedAt ||
    inviter.deactivatedAt ||
    recipient.suspendedAt ||
    recipient.deactivatedAt ||
    (await blocked(tx, row.inviterId, row.recipientId))
  ) {
    await tx.friendAcceptance.update({
      where: { id },
      data: { state: "REMOVED" }
    });
    return "REMOVED";
  }
  if (
    !invite ||
    invite.version !== row.invitationVersion ||
    invite.revokedAt ||
    invite.expiresAt <= new Date() ||
    !isEligible(inviter)
  ) {
    await tx.friendAcceptance.update({
      where: { id },
      data: { state: "UNAVAILABLE" }
    });
    return "UNAVAILABLE";
  }
  if (!isEligible(recipient)) return "PENDING";
  // Canonical follow edges, consent and both private-control versions commit together.
  for (const [ownerId, targetUserId] of [
    [row.inviterId, row.recipientId],
    [row.recipientId, row.inviterId]
  ]) {
    const current = await tx.socialRelationship.findFirst({
      where: { ownerId, targetUserId },
      select: { id: true }
    });
    if (
      !current &&
      (await tx.socialRelationship.count({ where: { ownerId } })) >= 2000
    )
      throw new PortalError(
        409,
        "Connection settings are full. Your account is created; retry after making room."
      );
    await tx.platformFollow.upsert({
      where: {
        followerId_followingId: {
          followerId: ownerId,
          followingId: targetUserId
        }
      },
      create: { followerId: ownerId, followingId: targetUserId },
      update: {}
    });
    if (current)
      await tx.socialRelationship.update({
        where: { id: current.id },
        data: { version: { increment: 1 } }
      });
    else
      await tx.socialRelationship.create({ data: { ownerId, targetUserId } });
  }
  await tx.friendAcceptance.update({
    where: { id },
    data: { state: "CONNECTED" }
  });
  return "CONNECTED";
}
// The caller holds the shared lifecycle gate before any user lock.
export async function finishSignupFriendInvitation(
  tx: Tx,
  recipientId: string
) {
  const row = await tx.friendAcceptance.findUnique({
    where: { signupRecipientId: recipientId },
    select: { id: true }
  });
  if (row) return finishAcceptance(tx, row.id);
  return null;
}
export async function finishVerifiedFriendInvitation(
  db: PrismaClient,
  recipientId: string
) {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
      return finishSignupFriendInvitation(tx, recipientId);
    },
    { maxWait: 5000, timeout: 15000 }
  );
}
export async function friendInvitationCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, [
    "operation",
    "mutationId",
    "accountId",
    "expectedVersion",
    "consent",
    "code"
  ]);
  return socialCommand(
    db,
    token,
    "friend-invitations",
    input,
    async (tx, ownerId) => {
      if (input.accountId !== ownerId)
        throw new PortalError(
          409,
          "Your sign-in changed. Reload before connecting."
        );
      if (input.operation === "retry-signup") {
        const state = await finishSignupFriendInvitation(tx, ownerId);
        return {
          id: ownerId,
          version: 1,
          message:
            state === "CONNECTED"
              ? "Connection confirmed. Refresh to see its current status."
              : state === "PENDING"
                ? "Finish email verification and adult eligibility first."
                : "This signup invitation is no longer available."
        };
      }
      const actor = await tx.platformUser.findUniqueOrThrow({
        where: { id: ownerId },
        select: eligibilitySelect
      });
      if (!isEligible(actor))
        throw new PortalError(
          403,
          "Verify your email and confirm adult eligibility before connecting."
        );
      if (
        input.operation === "enable" ||
        input.operation === "rotate" ||
        input.operation === "revoke"
      ) {
        const current = await tx.friendInvitation.findUnique({
          where: { ownerId }
        });
        expected(input.expectedVersion, current?.version ?? 0);
        if (input.operation !== "revoke" && input.consent !== true)
          throw new PortalError(
            400,
            "Confirm automatic connections before enabling your invitation."
          );
        const version = (current?.version ?? 0) + 1;
        const data = {
          token: randomBytes(32).toString("base64url"),
          version,
          expiresAt: new Date(Date.now() + FRIEND_INVITATION_DAYS * 86400000),
          revokedAt: input.operation === "revoke" ? new Date() : null
        };
        await tx.friendInvitation.upsert({
          where: { ownerId },
          create: { ownerId, ...data },
          update: data
        });
        await tx.friendAcceptance.updateMany({
          where: { inviterId: ownerId, state: "PENDING" },
          data: { state: "UNAVAILABLE" }
        });
        return {
          id: ownerId,
          version,
          message:
            input.operation === "revoke"
              ? "Invitation revoked. Existing friends stay connected."
              : "Invitation enabled for 30 days."
        };
      }
      if (input.operation !== "accept" || input.consent !== true)
        throw new PortalError(400, "Choose Connect to accept this invitation.");
      const invitation = await publicFriendInvitation(tx, input.code);
      if (!invitation)
        throw new PortalError(
          404,
          "This invitation is unavailable. You can still use your account normally."
        );
      if (invitation.ownerId === ownerId)
        throw new PortalError(400, "This is your own invitation.");
      if (await blocked(tx, ownerId, invitation.ownerId))
        throw new PortalError(404, "This connection is unavailable.");
      if (
        await tx.friendAcceptance.findFirst({
          where: { ...pair(ownerId, invitation.ownerId), state: "REMOVED" },
          select: { id: true }
        })
      )
        throw new PortalError(
          409,
          "This connection was removed. An old invitation cannot restore it."
        );
      const previous = await tx.friendAcceptance.findFirst({
        where: pair(ownerId, invitation.ownerId),
        orderBy: { createdAt: "asc" }
      });
      if (await hasFriendConnection(tx, ownerId, invitation.ownerId))
        return {
          id: previous!.id,
          version: 1,
          message:
            "You are already connected. Refresh to see its current status."
        };
      const chosen = await tx.friendAcceptance.findUnique({
        where: {
          inviterId_recipientId: {
            inviterId: invitation.ownerId,
            recipientId: ownerId
          }
        }
      });
      if (chosen) {
        if (chosen.state !== "PENDING")
          throw new PortalError(
            409,
            "This invitation was already resolved. An old link cannot reconnect it."
          );
        const state = await finishAcceptance(tx, chosen.id);
        return {
          id: chosen.id,
          version: 1,
          message:
            state === "CONNECTED"
              ? "Connection confirmed."
              : "This invitation is no longer available."
        };
      }
      if (
        (await tx.friendAcceptance.count({
          where: { OR: [{ inviterId: ownerId }, { recipientId: ownerId }] }
        })) >= 2000
      )
        throw new PortalError(409, "Your invitation history is full.");
      if (
        (await tx.friendAcceptance.count({
          where: { inviterId: invitation.ownerId }
        })) >= 2000
      )
        throw new PortalError(
          409,
          "This invitation cannot accept more connections."
        );
      const row = await tx.friendAcceptance.create({
        data: {
          inviterId: invitation.ownerId,
          recipientId: ownerId,
          invitationVersion: invitation.version
        }
      });
      const state = await finishAcceptance(tx, row.id);
      return {
        id: row.id,
        version: 1,
        message:
          state === "CONNECTED"
            ? "Connection confirmed."
            : "Finish account eligibility before connecting."
      };
    }
  );
}
export async function readFriendInvitations(db: PrismaClient, token: unknown) {
  return withOwnedSession(
    db,
    token,
    async (tx, session) => {
      const ownerId = session.userId;
      const [actor, invite, signup] = await Promise.all([
        tx.platformUser.findUniqueOrThrow({
          where: { id: ownerId },
          select: {
            id: true,
            name: true,
            username: true,
            emailVerifiedAt: true,
            adultAcknowledgedAt: true,
            adultPolicyVersion: true,
            suspendedAt: true,
            deactivatedAt: true,
            portalVersion: true
          }
        }),
        tx.friendInvitation.findUnique({ where: { ownerId } }),
        tx.friendAcceptance.findUnique({
          where: { signupRecipientId: ownerId },
          select: {
            id: true,
            state: true,
            inviterId: true,
            inviter: {
              select: {
                name: true,
                username: true,
                suspendedAt: true,
                deactivatedAt: true
              }
            }
          }
        })
      ]);
      const available =
        invite &&
        !invite.revokedAt &&
        invite.expiresAt > new Date() &&
        isEligible(actor);
      const connection =
        signup &&
        !signup.inviter.suspendedAt &&
        !signup.inviter.deactivatedAt &&
        !(await blocked(tx, ownerId, signup.inviterId))
          ? {
              id: signup.id,
              name: signup.inviter.name,
              username: signup.inviter.username,
              state:
                signup.state === "CONNECTED" &&
                !(await hasFriendConnection(tx, ownerId, signup.inviterId))
                  ? "REMOVED"
                  : signup.state
            }
          : null;
      return {
        accountId: ownerId,
        name: actor.name,
        eligible: isEligible(actor),
        emailVerified: !!actor.emailVerifiedAt,
        adultAcknowledged:
          !!actor.adultAcknowledgedAt &&
          actor.adultPolicyVersion === ADULT_POLICY,
        portalVersion: actor.portalVersion,
        version: invite?.version ?? 0,
        url: available
          ? new URL(`/platform/invite/${invite.token}`, accountConfig().origin)
              .href
          : null,
        expiresAt: available ? invite.expiresAt.toISOString() : null,
        signup: connection
      };
    },
    true
  );
}
