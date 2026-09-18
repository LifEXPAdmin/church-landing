import type { GatherGroup, Prisma, PrismaClient } from "@prisma/client";
import { contactPolicy } from "./adult-contact-policy";
import { effectiveChurchGrants } from "./church-permissions";
import {
  groupFormats,
  groupKinds,
  groupMemberKey,
  groupSlug
} from "./group-input";
import {
  currentGroupInvitation,
  groupAdultWhere,
  groupLeaderCurrent,
  groupChurchAuthority,
  type GroupReadAuthority,
  groupPublicWhere,
  groupSourceAvailable,
  unavailableGroup
} from "./group-policy";
import { withPostRead, type PostContext, type PostTx } from "./post-access";
import { postField, postId } from "./post-input";
import { PortalError } from "./portal-policy";
import {
  privilegedProjectionAvailable,
  requirePrivilegedAuthentication
} from "./privileged-auth-policy";
import { socialUserWhere } from "./social-policy";

const pageSize = 20;
async function visibleLeaders(
  tx: PostTx,
  group: GatherGroup,
  context: PostContext
) {
  const candidates = await tx.gatherGroupMembership.findMany({
    where: {
      groupId: group.id,
      state: "ACTIVE",
      leader: true,
      user: { ...groupAdultWhere, ...socialUserWhere(context) }
    },
    include: { user: { select: { id: true, name: true, username: true } } },
    take: 21
  });
  if (candidates.length > 20)
    throw new PortalError(503, "This group's leadership needs a size review.");
  const result = [];
  for (const row of candidates)
    if (await groupLeaderCurrent(tx, group, row, row.userId, false))
      result.push(row.user);
  return result;
}
async function publicGroup(
  tx: PostTx,
  group: GatherGroup,
  context: PostContext,
  details?: {
    owner: { id: string; name: string; username: string } | null;
    leaders: { id: string; name: string; username: string }[];
    church: { id: string; slug: string; name: string } | null;
  }
) {
  const owner = details
    ? details.owner
    : group.ownerId
      ? await tx.platformUser.findFirst({
          where: {
            AND: [
              { id: group.ownerId },
              groupAdultWhere,
              socialUserWhere(context)
            ]
          },
          select: { id: true, name: true, username: true }
        })
      : null;
  return {
    id: group.id,
    slug: group.slug,
    name: group.name,
    purpose: group.purpose,
    rules: group.rules,
    version: group.version,
    rulesVersion: group.rulesVersion,
    kind: group.kind,
    discovery: group.discovery,
    joinPolicy: group.joinPolicy,
    format: group.format,
    area: group.area,
    topic: group.topic,
    lifecycle: group.lifecycle,
    owner,
    leaders: details
      ? details.leaders
      : await visibleLeaders(tx, group, context),
    church: details
      ? details.church
      : group.churchId
        ? await tx.church.findUnique({
            where: { id: group.churchId },
            select: { id: true, slug: true, name: true }
          })
        : null
  };
}
async function currentSource(
  tx: PostTx,
  context: PostContext,
  slug: string,
  manage = false
) {
  const group = await tx.gatherGroup.findUnique({
    where: { slug: groupSlug(slug) }
  });
  if (!group) throw unavailableGroup();
  const member = context.actorId
    ? await tx.gatherGroupMembership.findUnique({
        where: groupMemberKey(group.id, context.actorId)
      })
    : null;
  const own = group.ownerId === context.actorId && member?.state === "ACTIVE";
  const current = await groupSourceAvailable(tx, group, context);
  // The owner can review the minimal management record after their church
  // grant changes; no private threads/roster are projected until renewed.
  const repair =
    manage &&
    own &&
    !group.recoveryRequired &&
    group.moderationState === "VISIBLE";
  const invited = current && (await currentGroupInvitation(tx, group, member));
  const readable = !!context.groupReaders?.has(group.id);
  const listed = group.discovery === "LISTED" && group.lifecycle === "ACTIVE";
  if ((!current || (!listed && !readable && !invited)) && !repair)
    throw unavailableGroup();
  if (manage) {
    if (!context.actorId) throw unavailableGroup();
    await requirePrivilegedAuthentication(tx, context.actorId);
    if (!repair && !context.groupModerators?.has(group.id))
      throw unavailableGroup();
  }
  return { group, member, invited, readable, repair, current };
}
export function listGroups(
  db: PrismaClient,
  token: unknown,
  query: {
    q?: string;
    kind?: string;
    format?: string;
    churchId?: string;
    mine?: boolean;
    invitations?: boolean;
    after?: string;
  } = {}
) {
  return withPostRead(db, token, async (tx, context) => {
    const q = query.q ? postField(query.q, 80) : "";
    if (query.kind && !Object.hasOwn(groupKinds, query.kind))
      throw new PortalError(400, "Choose a supported group type.");
    if (query.format && !Object.hasOwn(groupFormats, query.format))
      throw new PortalError(400, "Choose a supported group location.");
    if ((query.mine || query.invitations) && !context.actorId)
      throw new PortalError(401, "Sign in to see your own group choices.");
    const where: Prisma.GatherGroupWhereInput = {
      AND: [
        query.mine
          ? { id: { in: [...(context.groupReaders ?? [])] } }
          : query.invitations
            ? {
                members: {
                  some: { userId: context.actorId!, state: "INVITED" }
                }
              }
            : groupPublicWhere,
        ...(q
          ? [
              {
                OR: [
                  { name: { contains: q, mode: "insensitive" as const } },
                  { purpose: { contains: q, mode: "insensitive" as const } },
                  { area: { contains: q, mode: "insensitive" as const } },
                  { topic: { contains: q, mode: "insensitive" as const } }
                ]
              }
            ]
          : []),
        ...(query.kind ? [{ kind: query.kind }] : []),
        ...(query.format ? [{ format: query.format }] : []),
        ...(query.churchId ? [{ churchId: postId(query.churchId) }] : []),
        { ownerId: { notIn: context.blockedIds ?? [] } }
      ]
    };
    const groups = [];
    let cursor = query.after ? postId(query.after) : null,
      exhausted = false;
    // Filtering stale church authority or expired named invitations happens
    // before filling the visible page. No unfiltered counts are disclosed.
    for (
      let scanned = 0;
      scanned < 200 && groups.length < pageSize;
      scanned += 20
    ) {
      const rows = await tx.gatherGroup.findMany({
        where: { AND: [where, ...(cursor ? [{ id: { gt: cursor } }] : [])] },
        orderBy: { id: "asc" },
        take: 20,
        include: {
          owner: { select: { id: true, name: true, username: true } },
          church: { select: { id: true, slug: true, name: true } },
          members: {
            where: {
              state: "ACTIVE",
              leader: true,
              user: { ...groupAdultWhere, ...socialUserWhere(context) }
            },
            include: {
              user: { select: { id: true, name: true, username: true } }
            },
            take: 21
          }
        }
      });
      if (!rows.length) {
        exhausted = true;
        break;
      }
      const eligibleOwners = await tx.platformUser.findMany({
        where: {
          ...groupAdultWhere,
          id: { in: rows.flatMap((g) => (g.ownerId ? [g.ownerId] : [])) }
        },
        select: { id: true }
      });
      const eligibleIds = new Set([
        ...eligibleOwners.map((u) => u.id),
        ...rows.flatMap((g) => g.members.map((m) => m.userId))
      ]);
      const churchKeys = new Map<string, string | null>();
      const reads: GroupReadAuthority = {
        eligible: async (id) => eligibleIds.has(id),
        church: async (churchId, actorId) => {
          const key = churchId + ":" + actorId;
          if (!churchKeys.has(key))
            churchKeys.set(
              key,
              await groupChurchAuthority(tx, churchId, actorId)
            );
          return churchKeys.get(key)!;
        }
      };
      for (const group of rows) {
        cursor = group.id;
        if (!(await groupSourceAvailable(tx, group, context, reads))) continue;
        if (query.invitations) {
          const member = await tx.gatherGroupMembership.findUnique({
            where: groupMemberKey(group.id, context.actorId!)
          });
          if (!(await currentGroupInvitation(tx, group, member))) continue;
        }
        if (group.members.length > 20)
          throw new PortalError(
            503,
            "This group's leadership needs a size review."
          );
        const leaders = [];
        for (const member of group.members)
          if (
            await groupLeaderCurrent(
              tx,
              group,
              member,
              member.userId,
              false,
              reads
            )
          )
            leaders.push(member.user);
        groups.push(
          await publicGroup(tx, group, context, {
            owner: group.owner,
            leaders,
            church: group.church
          })
        );
        if (groups.length === pageSize) break;
      }
      if (rows.length < 20 && groups.length < pageSize) {
        exhausted = true;
        break;
      }
    }
    return {
      groups,
      nextCursor: exhausted ? null : cursor,
      viewerId: context.actorId
    };
  });
}
export function readGroup(
  db: PrismaClient,
  token: unknown,
  slug: string,
  manage = false
) {
  return withPostRead(db, token, async (tx, context) => {
    const { group, member, invited, readable, current } = await currentSource(
      tx,
      context,
      slug,
      manage
    );
    const leader =
      !!context.actorId &&
      current &&
      (await groupLeaderCurrent(tx, group, member, context.actorId, false)) &&
      (await privilegedProjectionAvailable(tx, context.actorId));
    return {
      group: await publicGroup(tx, group, context),
      viewer: {
        id: context.actorId,
        eligible: !!context.eligible,
        state: member?.state ?? null,
        version: member?.version ?? 0,
        rulesVersion: member?.rulesVersion ?? 0,
        rosterVisible: !!member?.rosterVisible,
        joinedAt: member?.joinedAt?.toISOString() ?? null,
        member: readable,
        leader,
        owner: group.ownerId === context.actorId,
        canPost: !!context.groupParticipants?.has(group.id),
        currentInvitation: invited,
        pendingRole:
          member?.pendingRole &&
          member.offerGroupVersion === group.version &&
          member.offeredById === group.ownerId &&
          member.offerExpiresAt &&
          member.offerExpiresAt > new Date()
            ? member.pendingRole
            : null,
        requiresAuthorityReview:
          manage &&
          group.ownerId === context.actorId &&
          !!group.churchId &&
          !current
      }
    };
  });
}
export function readGroupMembers(
  db: PrismaClient,
  token: unknown,
  slug: string,
  after?: string,
  management = false,
  state = "ACTIVE"
) {
  return withPostRead(db, token, async (tx, context) => {
    const { group, readable } = await currentSource(
      tx,
      context,
      slug,
      management
    );
    if (!readable || !context.actorId) throw unavailableGroup();
    if (management && !context.groupModerators?.has(group.id))
      throw unavailableGroup();
    if (
      ![
        "ACTIVE",
        "PENDING",
        "INVITED",
        "REMOVED",
        "BANNED",
        "REJECTED"
      ].includes(state)
    )
      throw new PortalError(400, "Choose a supported membership view.");
    const leaders = new Set(
      (await visibleLeaders(tx, group, context)).map((row) => row.id)
    );
    const rows = await tx.gatherGroupMembership.findMany({
      where: {
        groupId: group.id,
        state: management ? state : "ACTIVE",
        ...(management
          ? {}
          : {
              OR: [
                { rosterVisible: true },
                { userId: context.actorId },
                { userId: { in: [...leaders] } }
              ]
            }),
        user: { ...groupAdultWhere, ...socialUserWhere(context) },
        ...(after ? { id: { gt: postId(after) } } : {})
      },
      select: {
        id: true,
        version: true,
        state: true,
        rulesVersion: true,
        rosterVisible: true,
        leader: true,
        pendingRole: true,
        offerExpiresAt: true,
        invitationExpiresAt: true,
        user: { select: { id: true, name: true, username: true } }
      },
      orderBy: { id: "asc" },
      take: pageSize + 1
    });
    return {
      groupId: group.id,
      members: rows.slice(0, pageSize).map((row) =>
        management
          ? {
              ...row,
              offerExpiresAt: row.offerExpiresAt?.toISOString() ?? null,
              invitationExpiresAt:
                row.invitationExpiresAt?.toISOString() ?? null
            }
          : {
              id: row.id,
              user: row.user,
              leader: leaders.has(row.user.id),
              owner: row.user.id === group.ownerId
            }
      ),
      nextCursor: rows.length > pageSize ? rows[pageSize - 1].id : null,
      viewerId: context.actorId
    };
  });
}
export function readGroupHistory(
  db: PrismaClient,
  token: unknown,
  slug: string,
  after?: string
) {
  return withPostRead(db, token, async (tx, context) => {
    const { group } = await currentSource(tx, context, slug, true);
    if (!context.groupModerators?.has(group.id)) throw unavailableGroup();
    const rows = await tx.gatherGroupAudit.findMany({
      where: {
        groupId: group.id,
        ...(after ? { id: { lt: postId(after) } } : {})
      },
      orderBy: { id: "desc" },
      take: pageSize + 1
    });
    return {
      history: rows
        .slice(0, pageSize)
        .map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      nextCursor: rows.length > pageSize ? rows[pageSize - 1].id : null,
      viewerId: context.actorId
    };
  });
}
export function groupEligibility(db: PrismaClient, token: unknown) {
  return withPostRead(db, token, async (tx, context) => {
    if (!context.actorId)
      return { viewerId: null, eligible: false, churches: [] };
    const grants =
      context.eligible &&
      (await privilegedProjectionAvailable(tx, context.actorId))
        ? await effectiveChurchGrants(tx, context.actorId, context.churches, [
            "MANAGE_CHURCH_GROUPS"
          ])
        : [];
    return {
      viewerId: context.actorId,
      eligible: !!context.eligible,
      churches: [
        ...new Map(
          grants
            .filter((g) => g.church.communityListed)
            .map((g) => [
              g.churchId,
              { id: g.churchId, name: g.church.name, slug: g.church.slug }
            ])
        ).values()
      ]
    };
  });
}
export function readGroupChoices(
  db: PrismaClient,
  token: unknown,
  after?: string
) {
  return withPostRead(db, token, async (tx, context) => {
    if (!context.actorId)
      throw new PortalError(401, "Sign in to see your own group choices.");
    const rows = await tx.gatherGroupMembership.findMany({
      where: {
        userId: context.actorId,
        ...(after ? { id: { gt: postId(after) } } : {})
      },
      include: { group: true },
      orderBy: { id: "asc" },
      take: pageSize + 1
    });
    const choices = [];
    for (const row of rows.slice(0, pageSize)) {
      const current = await groupSourceAvailable(tx, row.group, context);
      const available =
        current &&
        (context.groupReaders?.has(row.groupId) ||
          (row.group.discovery === "LISTED" &&
            row.group.lifecycle === "ACTIVE") ||
          (await currentGroupInvitation(tx, row.group, row)));
      choices.push({
        id: row.id,
        state: row.state,
        version: row.version,
        rosterVisible: row.rosterVisible,
        leader: current && row.leader,
        updatedAt: row.updatedAt.toISOString(),
        group: available
          ? {
              name: row.group.name,
              slug: row.group.slug,
              lifecycle: row.group.lifecycle
            }
          : null
      });
    }
    return {
      choices,
      nextCursor: rows.length > pageSize ? rows[pageSize - 1].id : null,
      viewerId: context.actorId
    };
  });
}
export function readGroupInviteChoice(
  db: PrismaClient,
  token: unknown,
  slug: string,
  username: unknown
) {
  return withPostRead(db, token, async (tx, context) => {
    const { group } = await currentSource(tx, context, slug, true);
    if (!context.actorId || !context.groupModerators?.has(group.id))
      throw unavailableGroup();
    const person = await tx.platformUser.findFirst({
      where: {
        username: postField(username, 80, 1),
        ...groupAdultWhere,
        ...socialUserWhere(context)
      },
      select: { id: true, name: true, username: true }
    });
    if (!person) throw unavailableGroup();
    const policy = await contactPolicy(tx, context.actorId, person.id);
    if (!policy?.allowed) throw unavailableGroup();
    const member = await tx.gatherGroupMembership.findUnique({
      where: groupMemberKey(group.id, person.id),
      select: { state: true, version: true }
    });
    if (
      member &&
      ["ACTIVE", "PENDING", "BANNED", "REMOVED"].includes(member.state)
    )
      throw new PortalError(
        409,
        "Review this person's current membership instead."
      );
    return {
      person,
      version: member?.version ?? 0,
      contactVersion: policy.version,
      viewerId: context.actorId
    };
  });
}
