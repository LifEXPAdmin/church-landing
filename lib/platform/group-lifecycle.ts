import type { Prisma } from "@prisma/client";
import type { PostTx } from "./post-access";
import { recordGroupAccessControl } from "./retention-controls";
import { PortalError } from "./portal-policy";
import { recordGroupActivity } from "./group-activity";

export const clearGroupOffer = {
  pendingRole: null,
  offeredById: null,
  offerExpiresAt: null,
  offerGroupVersion: null
} as const;
export const clearGroupInvitation = {
  invitedById: null,
  invitationExpiresAt: null,
  invitationContactVersion: null,
  invitationAuthorityVersion: null
} as const;
export const endGroupMembership = {
  leader: false,
  leaderAuthorityKey: null,
  rosterVisible: false,
  ...clearGroupOffer,
  ...clearGroupInvitation
} as const;
export async function recordGroupChange(
  tx: PostTx,
  groupId: string,
  actorId: string,
  action: string,
  version: number,
  extra: {
    targetId?: string;
    reason?: string;
    fromState?: string;
    toState?: string;
  } = {}
) {
  if ((await tx.gatherGroupAudit.count({ where: { groupId } })) >= 20000)
    throw new PortalError(
      429,
      "This group's history needs a storage review. Keep your unsent entries."
    );
  await tx.gatherGroupAudit.create({
    data: { groupId, actorId, action, version, ...extra }
  });
  await recordGroupAccessControl(tx, groupId, actorId);
  await recordGroupActivity(tx, groupId, actorId, action, extra.targetId);
}
export async function retireGroupOffers(
  tx: PostTx,
  groupId: string,
  offeredById?: string
) {
  await tx.gatherGroupMembership.updateMany({
    where: {
      groupId,
      pendingRole: { not: null },
      ...(offeredById ? { offeredById } : {})
    },
    data: { ...clearGroupOffer, version: { increment: 1 } }
  });
}
export async function retireGroupInvitations(
  tx: PostTx,
  groupId: string,
  invitedById?: string
) {
  await tx.gatherGroupMembership.updateMany({
    where: {
      groupId,
      state: "INVITED",
      ...(invitedById ? { invitedById } : {})
    },
    data: {
      state: "DECLINED",
      ...endGroupMembership,
      version: { increment: 1 }
    }
  });
}
export async function revokeGroupContact(
  tx: PostTx,
  where: Prisma.GatherGroupMembershipWhereInput,
  actorId: string
) {
  const affected = await tx.gatherGroupMembership.findMany({
    where: {
      AND: [
        where,
        { OR: [{ state: "INVITED" }, { pendingRole: { not: null } }] }
      ]
    },
    select: { id: true, groupId: true, state: true },
    take: 2001
  });
  if (affected.length > 2000)
    throw new PortalError(503, "These group invitations need a size review.");
  for (const row of affected)
    await tx.gatherGroupMembership.update({
      where: { id: row.id },
      data: {
        ...clearGroupOffer,
        ...(row.state === "INVITED"
          ? { state: "DECLINED", ...clearGroupInvitation }
          : {}),
        version: { increment: 1 }
      }
    });
  for (const groupId of new Set(affected.map((r) => r.groupId)))
    await recordGroupAccessControl(tx, groupId, actorId);
}

export async function closeGroupAccountAccess(
  tx: PostTx,
  userId: string,
  permanent: boolean
) {
  const rows = await tx.gatherGroupMembership.findMany({
    where: { userId },
    select: { id: true, groupId: true, state: true },
    take: 1001
  });
  if (rows.length > 1000)
    throw new PortalError(503, "These group choices need a size review.");
  for (const row of rows) {
    await tx.gatherGroupMembership.update({
      where: { id: row.id },
      data: {
        ...endGroupMembership,
        ...(permanent && !["REMOVED", "BANNED"].includes(row.state)
          ? { state: "LEFT", rulesVersion: 0 }
          : {}),
        version: { increment: 1 }
      }
    });
    await recordGroupAccessControl(tx, row.groupId, userId);
  }
}
