import { createHash } from "node:crypto";
import type {
  GatherGroup,
  GatherGroupMembership,
  Prisma
} from "@prisma/client";
import { effectiveChurchGrants } from "./church-permissions";
import { eligibleWhere, PortalError } from "./portal-policy";
import type { PostContext, PostTx } from "./post-access";
import {
  privilegedProjectionAvailable,
  requirePrivilegedAuthentication
} from "./privileged-auth-policy";
import { contactPolicy } from "./adult-contact-policy";
import { groupMemberKey } from "./group-input";

export const unavailableGroup = () =>
  new PortalError(
    404,
    "This group is unavailable to your current account or membership."
  );
export const groupAdultWhere = {
  ...eligibleWhere,
  erasedAt: null,
  deletionRequestedAt: null
} satisfies Prisma.PlatformUserWhereInput;
export const groupPublicWhere = {
  discovery: "LISTED",
  lifecycle: "ACTIVE",
  moderationState: "VISIBLE",
  recoveryRequired: false,
  owner: groupAdultWhere,
  OR: [{ churchId: null }, { church: { communityListed: true } }]
} satisfies Prisma.GatherGroupWhereInput;

export async function groupChurchAuthority(
  tx: PostTx,
  churchId: string,
  actorId: string
) {
  const connection = await tx.churchConnection.findUnique({
    where: { userId_churchId: { userId: actorId, churchId } },
    select: { id: true, version: true, state: true }
  });
  if (
    connection?.state !== "APPROVED" ||
    !(await tx.platformUser.findFirst({
      where: { id: actorId, ...groupAdultWhere },
      select: { id: true }
    }))
  )
    return null;
  const grants = await effectiveChurchGrants(
    tx,
    actorId,
    [churchId],
    ["MANAGE_CHURCH_GROUPS"]
  );
  if (!grants.length || !grants[0].church.communityListed) return null;
  return createHash("sha256")
    .update(
      JSON.stringify([
        "gather-church-authority-v1",
        churchId,
        actorId,
        connection.id,
        connection.version,
        grants
          .map((g) => [
            g.id,
            g.version,
            g.source,
            g.assignmentId,
            g.dependency?.id,
            g.dependency?.version
          ])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      ])
    )
    .digest("hex");
}
export async function requireGroupChurchAuthority(
  tx: PostTx,
  churchId: string,
  actorId: string
) {
  const key = await groupChurchAuthority(tx, churchId, actorId);
  if (!key)
    throw new PortalError(
      403,
      "An approved church connection and current permission to manage official church groups are required."
    );
  await requirePrivilegedAuthentication(tx, actorId);
  return key;
}
// Optional lookups are created inside one bounded read transaction only. Commands
// omit them so each authorization checks current rows again before a write/replay.
export type GroupReadAuthority = {
  eligible: (actorId: string) => Promise<boolean>;
  church: (churchId: string, actorId: string) => Promise<string | null>;
};
export async function groupSourceAvailable(
  tx: PostTx,
  group: GatherGroup,
  context: Pick<PostContext, "blockedIds">,
  reads?: GroupReadAuthority
) {
  if (
    group.recoveryRequired ||
    group.moderationState !== "VISIBLE" ||
    !group.ownerId ||
    context.blockedIds?.includes(group.ownerId)
  )
    return false;
  if (
    !(reads
      ? await reads.eligible(group.ownerId)
      : await tx.platformUser.findFirst({
          where: { id: group.ownerId, ...groupAdultWhere },
          select: { id: true }
        }))
  )
    return false;
  return (
    !group.churchId ||
    (!!group.ownerAuthorityKey &&
      (reads
        ? await reads.church(group.churchId, group.ownerId)
        : await groupChurchAuthority(tx, group.churchId, group.ownerId)) ===
        group.ownerAuthorityKey)
  );
}
export async function groupLeaderCurrent(
  tx: PostTx,
  group: GatherGroup,
  member: GatherGroupMembership | null,
  actorId: string,
  requireActive = true,
  reads?: GroupReadAuthority
) {
  if (
    !member ||
    member.userId !== actorId ||
    member.groupId !== group.id ||
    member.state !== "ACTIVE" ||
    member.rulesVersion !== group.rulesVersion ||
    (!member.leader && group.ownerId !== actorId) ||
    (requireActive && group.lifecycle !== "ACTIVE") ||
    group.recoveryRequired ||
    group.moderationState !== "VISIBLE"
  )
    return false;
  if (
    !(reads ? await reads.eligible(actorId) : await tx.platformUser.findFirst({
      where: { id: actorId, ...groupAdultWhere },
      select: { id: true }
    }))
  )
    return false;
  if (group.churchId) {
    const key =
      group.ownerId === actorId
        ? group.ownerAuthorityKey
        : member.leaderAuthorityKey;
    if (
      !key ||
      key !==
        (reads
          ? await reads.church(group.churchId, actorId)
          : await groupChurchAuthority(tx, group.churchId, actorId))
    )
      return false;
  }
  return true;
}
export async function currentGroupInvitation(
  tx: PostTx,
  group: GatherGroup,
  member: GatherGroupMembership | null,
  now = new Date()
) {
  if (
    !member ||
    member.state !== "INVITED" ||
    !member.invitedById ||
    !member.invitationExpiresAt ||
    member.invitationExpiresAt <= now ||
    group.lifecycle !== "ACTIVE"
  )
    return false;
  const inviter = await tx.gatherGroupMembership.findUnique({
    where: groupMemberKey(group.id, member.invitedById)
  });
  if (
    !inviter ||
    inviter.version !== member.invitationAuthorityVersion ||
    !(await groupLeaderCurrent(tx, group, inviter, member.invitedById))
  )
    return false;
  const policy = await contactPolicy(tx, member.invitedById, member.userId);
  return (
    !!policy?.allowed && policy.version === member.invitationContactVersion
  );
}

// Computed inside the existing permission read/command transaction. Never cache
// membership or church authority across requests. Reuse a church/owner lookup
// for multiple groups owned by the same person in this bounded read.
export async function groupContext(tx: PostTx, context: PostContext) {
  const result = {
    groupReaders: new Set<string>(),
    groupParticipants: new Set<string>(),
    groupModerators: new Set<string>(),
    groupReadEpochs: new Map<string, number>()
  };
  if (!context.actorId || !context.eligible) return result;
  const rows = await tx.gatherGroupMembership.findMany({
    where: {
      userId: context.actorId,
      state: "ACTIVE",
      group: {
        recoveryRequired: false,
        moderationState: "VISIBLE",
        owner: groupAdultWhere
      }
    },
    include: { group: true },
    take: 201
  });
  if (rows.length > 200)
    throw new PortalError(503, "Your group memberships need a size review.");
  const keys = new Map<string, string | null>();
  const keyFor = async (churchId: string, actorId: string) => {
    const id = `${churchId}:${actorId}`;
    if (!keys.has(id))
      keys.set(id, await groupChurchAuthority(tx, churchId, actorId));
    return keys.get(id);
  };
  const management =
    rows.some((r) => r.leader || r.group.ownerId === context.actorId) &&
    (await privilegedProjectionAvailable(tx, context.actorId));
  for (const member of rows) {
    const group = member.group;
    if (!group.ownerId || context.blockedIds?.includes(group.ownerId)) continue;
    if (
      group.churchId &&
      (!group.ownerAuthorityKey ||
        (await keyFor(group.churchId, group.ownerId)) !==
          group.ownerAuthorityKey)
    )
      continue;
    result.groupReaders.add(group.id);
    result.groupReadEpochs.set(group.id, group.securityVersion);
    if (
      group.lifecycle !== "ACTIVE" ||
      member.rulesVersion !== group.rulesVersion
    )
      continue;
    result.groupParticipants.add(group.id);
    if (!management || (!member.leader && group.ownerId !== context.actorId))
      continue;
    if (
      group.churchId &&
      group.ownerId !== context.actorId &&
      (!member.leaderAuthorityKey ||
        (await keyFor(group.churchId, context.actorId)) !==
          member.leaderAuthorityKey)
    )
      continue;
    result.groupModerators.add(group.id);
  }
  return result;
}
export function requireGroupParticipation(
  context: PostContext,
  id: string | null | undefined
) {
  if (id && !context.groupParticipants?.has(id))
    throw new PortalError(
      403,
      "Current group membership and acceptance of its latest rules are required. Keep your unsent entries."
    );
}
export function groupMemberReadableWhere(
  context: PostContext
): Prisma.GatherGroupWhereInput {
  return {
    id: { in: [...(context.groupReaders ?? [])] },
    recoveryRequired: false,
    moderationState: "VISIBLE"
  };
}
