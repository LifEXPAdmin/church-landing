import { requirePrivilegedAuthentication } from "./privileged-auth-policy";
import type {
  PrismaClient,
  TopicCommunity,
  TopicMembership
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { activityBudget } from "./account-limits";
import { accountConfig } from "./account-config";
import { eligibleWhere, expected, PortalError } from "./portal-policy";
import {
  postContext,
  withPostRead,
  type PostTx,
  type PostContext
} from "./post-access";
import { postField, postId } from "./post-input";
import { socialCommand, socialInput } from "./social-operations";
import { requireSocialActivity } from "./social-activity-limits";
import { socialUserWhere } from "./social-policy";
import { topicPublicWhere } from "./topic-policy";
import { topicRestrictionReasons } from "./topic-types";
import { recordTopicAccessControl } from "./retention-controls";

const memberKey = (communityId: string, userId: string) => ({
  communityId_userId: { communityId, userId }
});
const publicSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  rules: true,
  version: true,
  rulesVersion: true,
  lifecycle: true,
  moderationState: true,
  recoveryRequired: true
} as const;
function slug(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length < 3 ||
    value.length > 60 ||
    ["following", "new", "manage"].includes(value) ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  )
    throw new PortalError(
      400,
      "Use a topic address of 3 to 60 lowercase letters, numbers and single hyphens."
    );
  return value;
}
function identity(input: Record<string, unknown>) {
  const name = postField(input.name, 80, 3)
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
  if (name.length < 3 || name.length > 80)
    throw new PortalError(400, "Use a topic name of 3 to 80 characters.");
  return {
    name,
    nameKey: name.toLowerCase(),
    description: postField(input.description, 1000, 3),
    rules: postField(input.rules, 4000, 3)
  };
}
async function eligible(tx: PostTx, userId: string) {
  if (
    !(await tx.platformUser.findFirst({
      where: { id: userId, ...eligibleWhere },
      select: { id: true }
    }))
  )
    throw new PortalError(
      403,
      "Verify your email and adult participation before managing topic choices."
    );
}
async function capacity(tx: PostTx, userId: string) {
  if ((await tx.topicMembership.count({ where: { userId } })) >= 200)
    throw new PortalError(
      429,
      "Your topic choices need a storage review. Your existing choices are unchanged."
    );
}
async function ownerCapacity(tx: PostTx, ownerId: string) {
  if (
    (await tx.topicCommunity.count({
      where: { ownerId, lifecycle: "ACTIVE" }
    })) >= 20
  )
    throw new PortalError(
      429,
      "You can own up to twenty active topics. Archive an unused topic before adding another."
    );
}
export async function topicAudit(
  tx: PostTx,
  communityId: string,
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
  await tx.topicAudit.create({
    data: { communityId, actorId, action, version, ...extra }
  });
}
function requireOwner(row: TopicCommunity, actorId: string) {
  if (row.ownerId !== actorId)
    throw new PortalError(
      403,
      "Only the current topic owner can make this change."
    );
}
async function current(
  tx: PostTx,
  actorId: string,
  input: Record<string, unknown>
) {
  if (
    !(
      ["join", "follow"].includes(String(input.operation)) &&
      input.desired === false
    )
  )
    await eligible(tx, actorId);
  const context = await postContext(tx, actorId);
  if (input.operation === "create") {
    await requirePrivilegedAuthentication(tx, actorId);
    return { context, row: null };
  }
  const row = await tx.topicCommunity.findUnique({
    where: { id: postId(input.communityId) }
  });
  if (!row) throw new PortalError(404, "This topic is unavailable.");
  const op = input.operation;
  if (["edit", "archive", "offer-role", "cancel-role", "revoke-role", "restrict", "accept-role"].includes(String(op)))
    await requirePrivilegedAuthentication(tx, actorId);
  if (
    row.recoveryRequired &&
    !(["join", "follow"].includes(String(op)) && input.desired === false)
  )
    throw new PortalError(
      503,
      "This topic is awaiting protected recovery verification. Its older permissions cannot be reused."
    );
  if (
    ["edit", "archive", "offer-role", "cancel-role", "revoke-role"].includes(
      String(op)
    )
  )
    requireOwner(row, actorId);
  else if (op === "restrict" && !context.topicModerators?.has(row.id))
    throw new PortalError(403, "Current topic management access is required.");
  else if (
    ["join", "follow", "accept-role"].includes(String(op)) &&
    input.desired !== false
  ) {
    if (
      !(await tx.topicCommunity.findFirst({
        where: { id: row.id, ...topicPublicWhere },
        select: { id: true }
      }))
    )
      throw new PortalError(404, "This topic is unavailable.");
    if (context.topicRestricted?.has(row.id))
      throw new PortalError(
        403,
        "Participation in this topic is currently restricted."
      );
    if (row.ownerId && context.blockedIds?.includes(row.ownerId))
      throw new PortalError(403, "This topic relationship is unavailable.");
    if (op === "accept-role") {
      const own = await tx.topicMembership.findUnique({
        where: memberKey(row.id, actorId)
      });
      const accepted =
        input.role === "OWNER"
          ? row.ownerId === actorId
          : input.role === "MODERATOR" && own?.moderator;
      if (
        !accepted &&
        (!own?.joined ||
          own.restrictedAt ||
          own.pendingRole !== input.role ||
          own.invitedById !== row.ownerId)
      )
        throw new PortalError(403, "This role offer is no longer available.");
    }
  }
  return { context, row };
}

export async function topicCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, [
    "operation",
    "mutationId",
    "communityId",
    "expectedVersion",
    "name",
    "slug",
    "description",
    "rules",
    "rulesVersion",
    "acceptedRules",
    "desired",
    "confirmed",
    "targetId",
    "role",
    "reason"
  ]);
  return socialCommand(
    db,
    token,
    "topic",
    input,
    async (tx, actorId) => {
      const { context, row } = await current(tx, actorId, input);
      const op = input.operation;
      if (["create", "offer-role", "cancel-role", "revoke-role", "accept-role"].includes(String(op)))
        await requirePrivilegedAuthentication(tx, actorId, "change-access");
      if (op === "create") {
        const data = identity(input),
          address = slug(input.slug);
        if (input.acceptedRules !== true)
          throw new PortalError(
            400,
            "Confirm the public topic and its rules before creating it."
          );
        await capacity(tx, actorId);
        await ownerCapacity(tx, actorId);
        if (
          await tx.topicCommunity.findFirst({
            where: { OR: [{ slug: address }, { nameKey: data.nameKey }] },
            select: { id: true }
          })
        )
          throw new PortalError(
            409,
            "That topic name or address is already reserved. Choose a different one."
          );
        const retry = await activityBudget(
          tx,
          accountConfig().rateSecret,
          actorId,
          "topic-create",
          3,
          86400
        );
        if (retry)
          throw new PortalError(
            429,
            "You can create three topics per day. Keep your entries and try again later.",
            retry
          );
        const created = await tx.topicCommunity.create({
          data: {
            ...data,
            slug: address,
            ownerId: actorId,
            creatorId: actorId,
            members: {
              create: { userId: actorId, joined: true, rulesVersion: 1 }
            }
          }
        });
        await topicAudit(tx, created.id, actorId, "CREATED", created.version);
        return {
          id: created.id,
          version: created.version,
          message:
            "Your public topic is created. You can now start its first discussion."
        };
      }
      if (!row) throw new PortalError(404, "This topic is unavailable.");
      if (op === "join" || op === "follow") {
        if (typeof input.desired !== "boolean")
          throw new PortalError(400, "Choose the intended topic state.");
        const own = await tx.topicMembership.findUnique({
          where: memberKey(row.id, actorId)
        });
        expected(input.expectedVersion, own?.version ?? 0);
        if (op === "join" && !input.desired && row.ownerId === actorId)
          throw new PortalError(
            409,
            "Hand off ownership before leaving this topic. You may archive it instead."
          );
        if (
          op === "join" &&
          input.desired &&
          (input.acceptedRules !== true ||
            input.rulesVersion !== row.rulesVersion)
        )
          throw new PortalError(
            409,
            "Read and accept the current topic rules before joining."
          );
        if (!own) await capacity(tx, actorId);
        if (op === "follow" && input.desired && !own?.following)
          await requireSocialActivity(tx, actorId, "follow");
        const data =
          op === "follow"
            ? { following: input.desired }
            : {
                joined: input.desired,
                ...(input.desired
                  ? { rulesVersion: row.rulesVersion }
                  : { moderator: false, pendingRole: null, invitedById: null })
              };
        const saved = await tx.topicMembership.upsert({
          where: memberKey(row.id, actorId),
          create: { communityId: row.id, userId: actorId, ...data },
          update: { ...data, version: { increment: 1 } }
        });
        if (
          op === "join" &&
          !input.desired &&
          (own?.moderator || own?.pendingRole)
        )
          await recordTopicAccessControl(tx, row.id, actorId);
        return {
          id: row.id,
          version: saved.version,
          message:
            op === "follow"
              ? input.desired
                ? "Topic added to Topics I follow. Phone alerts are unchanged."
                : "Topic follow removed."
              : input.desired
                ? "You have joined and accepted the current rules."
                : "You have left this topic. Your authored content is unchanged."
        };
      }
      if (op === "edit" || op === "archive") {
        expected(input.expectedVersion, row.version);
        if (
          op === "archive" &&
          (typeof input.desired !== "boolean" || input.confirmed !== true)
        )
          throw new PortalError(
            400,
            "Confirm whether to archive or reopen this public topic."
          );
        const data = op === "edit" ? identity(input) : null;
        if (
          data &&
          (await tx.topicCommunity.findFirst({
            where: { id: { not: row.id }, nameKey: data.nameKey },
            select: { id: true }
          }))
        )
          throw new PortalError(409, "That topic name is already reserved.");
        if (
          op === "archive" &&
          input.desired === false &&
          row.lifecycle === "ARCHIVED"
        )
          await ownerCapacity(tx, actorId);
        const saved = await tx.topicCommunity.update({
          where: { id: row.id },
          data: data
            ? {
                ...data,
                rulesVersion: { increment: Number(data.rules !== row.rules) },
                version: { increment: 1 }
              }
            : {
                lifecycle: input.desired ? "ARCHIVED" : "ACTIVE",
                version: { increment: 1 }
              }
        });
        await topicAudit(
          tx,
          row.id,
          actorId,
          op === "edit" ? "EDITED" : "LIFECYCLE",
          saved.version,
          { fromState: row.lifecycle, toState: saved.lifecycle }
        );
        if (op === "archive" || data?.rules !== row.rules)
          await recordTopicAccessControl(tx, row.id, actorId);
        return {
          id: row.id,
          version: saved.version,
          message:
            op === "edit"
              ? "Topic details saved. Members must accept changed rules before posting again."
              : input.desired
                ? "Topic archived. Its posts are unavailable to readers."
                : "Topic reopened. Any separate moderation restriction still applies."
        };
      }
      if (op === "accept-role") {
        const own = await tx.topicMembership.findUnique({
          where: memberKey(row.id, actorId)
        });
        if (
          !own ||
          !own.joined ||
          own.restrictedAt ||
          own.pendingRole !== input.role ||
          own.invitedById !== row.ownerId
        )
          throw new PortalError(
            409,
            "This role offer changed. Refresh it before accepting."
          );
        expected(input.expectedVersion, own.version);
        if (
          own.pendingRole === "MODERATOR" &&
          !own.moderator &&
          (await tx.topicMembership.count({
            where: { communityId: row.id, moderator: true }
          })) >= 20
        )
          throw new PortalError(
            409,
            "A topic can have up to twenty moderators. The owner must review existing roles first."
          );
        if (own.pendingRole === "OWNER") {
          await ownerCapacity(tx, actorId);
          await tx.topicMembership.updateMany({
            where: { communityId: row.id, userId: row.ownerId! },
            data: {
              moderator: false,
              pendingRole: null,
              invitedById: null,
              version: { increment: 1 }
            }
          });
          await tx.topicMembership.updateMany({
            where: {
              communityId: row.id,
              pendingRole: { not: null },
              userId: { not: actorId }
            },
            data: {
              pendingRole: null,
              invitedById: null,
              version: { increment: 1 }
            }
          });
          await tx.topicCommunity.update({
            where: { id: row.id },
            data: { ownerId: actorId, version: { increment: 1 } }
          });
        }
        const saved = await tx.topicMembership.update({
          where: { id: own.id },
          data: {
            moderator: own.pendingRole === "MODERATOR",
            pendingRole: null,
            invitedById: null,
            version: { increment: 1 }
          }
        });
        await topicAudit(tx, row.id, actorId, "ROLE_ACCEPTED", saved.version, {
          targetId: actorId,
          toState: String(input.role)
        });
        await recordTopicAccessControl(tx, row.id, actorId);
        return {
          id: row.id,
          version: saved.version,
          message: "Your topic role is accepted."
        };
      }
      if (
        !["offer-role", "cancel-role", "revoke-role", "restrict"].includes(
          String(op)
        )
      )
        throw new PortalError(400, "Choose a supported topic action.");
      const targetId = postId(input.targetId);
      if (targetId === actorId || targetId === row.ownerId)
        throw new PortalError(
          403,
          "Use an ownership handoff or your own membership controls for this account."
        );
      const target = await tx.topicMembership.findFirst({
        where: {
          communityId: row.id,
          userId: targetId,
          user: { AND: [eligibleWhere, socialUserWhere(context)] }
        }
      });
      if (!target)
        throw new PortalError(404, "This topic member is unavailable.");
      expected(input.expectedVersion, target.version);
      let data: Prisma.TopicMembershipUpdateInput;
      if (op === "restrict") {
        if (target.moderator)
          throw new PortalError(
            403,
            "The owner must revoke this moderator role before restricting participation."
          );
        if (
          typeof input.desired !== "boolean" ||
          typeof input.reason !== "string" ||
          !Object.hasOwn(topicRestrictionReasons, input.reason)
        )
          throw new PortalError(400, "Choose a restriction state and reason.");
        data = {
          restrictedAt: input.desired ? new Date() : null,
          restrictionReason: input.desired ? input.reason : null,
          pendingRole: null,
          invitedById: null
        };
      } else if (op === "offer-role") {
        if (
          !target.joined ||
          target.restrictedAt ||
          !["MODERATOR", "OWNER"].includes(String(input.role))
        )
          throw new PortalError(
            400,
            "Choose an unrestricted joined member and a supported role."
          );
        data = {
          pendingRole: input.role as "MODERATOR" | "OWNER",
          invitedById: actorId
        };
      } else
        data = {
          pendingRole: null,
          invitedById: null,
          ...(op === "revoke-role" ? { moderator: false } : {})
        };
      const saved = await tx.topicMembership.update({
        where: { id: target.id },
        data: { ...data, version: { increment: 1 } }
      });
      await recordTopicAccessControl(tx, row.id, actorId);
      await topicAudit(
        tx,
        row.id,
        actorId,
        String(op).toUpperCase(),
        saved.version,
        {
          targetId,
          reason: typeof input.reason === "string" ? input.reason : undefined,
          fromState: target.restrictedAt
            ? "RESTRICTED"
            : target.moderator
              ? "MODERATOR"
              : "MEMBER",
          toState: saved.restrictedAt
            ? "RESTRICTED"
            : op === "offer-role"
              ? String(input.role)
              : saved.moderator
                ? "MODERATOR"
                : "MEMBER"
        }
      );
      return {
        id: row.id,
        version: saved.version,
        message:
          op === "offer-role"
            ? "Role offered. The member must accept before gaining authority."
            : "Topic membership permissions updated."
      };
    },
    async (tx, actorId) => {
      await current(tx, actorId, input);
    }
  );
}

export function listTopics(
  db: PrismaClient,
  token: unknown,
  query: { q?: string; after?: string; mine?: boolean; owned?: boolean } = {}
) {
  return withPostRead(db, token, async (tx, context) => {
    const q = (query.q ?? "").trim();
    if (q.length > 80)
      throw new PortalError(400, "Use up to eighty search characters.");
    if ((query.mine || query.owned) && !context.actorId)
      throw new PortalError(401, "Sign in to see your topic choices.");
    const where: Prisma.TopicCommunityWhereInput = {
      AND: [
        query.owned ? { ownerId: context.actorId! } : topicPublicWhere,
        ...(q
          ? [
              {
                OR: [
                  { name: { contains: q, mode: "insensitive" as const } },
                  { description: { contains: q, mode: "insensitive" as const } }
                ]
              }
            ]
          : []),
        ...(query.mine
          ? [
              {
                members: {
                  some: {
                    userId: context.actorId!,
                    OR: [{ joined: true }, { following: true }]
                  }
                }
              }
            ]
          : [])
      ]
    };
    const after = query.after
      ? await tx.topicCommunity.findFirst({
          where: { AND: [where, { id: postId(query.after) }] },
          select: { id: true }
        })
      : null;
    if (query.after && !after)
      throw new PortalError(
        409,
        "This topic page changed. Start again from the first page."
      );
    const rows = await tx.topicCommunity.findMany({
      where,
      select: { id: true, name: true, slug: true, description: true },
      orderBy: [{ nameKey: "asc" }, { id: "asc" }],
      take: 21,
      ...(after ? { cursor: { id: after.id }, skip: 1 } : {})
    });
    return {
      topics: rows.slice(0, 20),
      after: rows.length > 20 ? rows[19].id : null
    };
  });
}
function ownChoice(own: TopicMembership | null) {
  return {
    version: own?.version ?? 0,
    joined: own?.joined ?? false,
    following: own?.following ?? false,
    rulesVersion: own?.rulesVersion ?? 0,
    restricted: !!own?.restrictedAt,
    restrictionReason: own?.restrictionReason ?? null,
    pendingRole: own?.pendingRole ?? null
  };
}
export function readTopic(
  db: PrismaClient,
  token: unknown,
  address: string,
  manage = false
) {
  return withPostRead(db, token, (tx, context) =>
    topicIn(tx, context, address, manage)
  );
}

async function topicIn(
  tx: PostTx,
  context: PostContext,
  address: string,
  manage = false
) {
  if (manage && !context.eligible)
    throw new PortalError(403, "Verify your account before managing a topic.");
  if (manage && context.actorId) await requirePrivilegedAuthentication(tx, context.actorId);
  const row = await tx.topicCommunity.findFirst({
    where: {
      slug: slug(address),
      ...(manage
        ? {
            OR: [
              { ownerId: context.actorId ?? "" },
              { id: { in: [...(context.topicModerators ?? [])] } }
            ]
          }
        : topicPublicWhere)
    },
    select: { ...publicSelect, ownerId: true }
  });
  if (!row) throw new PortalError(404, "This topic is unavailable.");
  const own = context.actorId
    ? await tx.topicMembership.findUnique({
        where: memberKey(row.id, context.actorId)
      })
    : null;
  const { ownerId, ...community } = row;
  const isOwner = !!context.eligible && ownerId === context.actorId;
  return {
    community,
    viewer: {
      accountId: context.actorId,
      eligible: !!context.eligible,
      ...ownChoice(own),
      isOwner,
      canManage: isOwner || !!context.topicModerators?.has(row.id),
      canParticipate: !!context.topicParticipants?.has(row.id)
    }
  };
}

export type TopicView = Awaited<ReturnType<typeof readTopic>>;

export function topicEligibility(db: PrismaClient, token: unknown) {
  return withPostRead(db, token, async (_tx, context) => ({
    accountId: context.actorId,
    eligible: !!context.eligible
  }));
}
export function topicFollowingAccess(db: PrismaClient, token: unknown) {
  return withPostRead(db, token, async (_tx, context) => {
    if (!context.actorId)
      throw new PortalError(401, "Sign in to read topics you follow.");
    return {
      accountId: context.actorId,
      following: [...(context.topicFollowing ?? [])].sort()
    };
  });
}

export function readTopicMembers(
  db: PrismaClient,
  token: unknown,
  communityId: unknown,
  after?: string
) {
  return withPostRead(db, token, (tx, context) =>
    topicMembersIn(tx, context, communityId, after)
  );
}

async function topicMembersIn(
  tx: PostTx,
  context: PostContext,
  communityId: unknown,
  after?: string
) {
  const id = postId(communityId);
  if (!context.actorId || !context.topicModerators?.has(id))
    throw new PortalError(403, "Current topic management access is required.");
  const where: Prisma.TopicMembershipWhereInput = {
    communityId: id,
    user: { AND: [eligibleWhere, socialUserWhere(context)] },
    OR: [
      { joined: true },
      { restrictedAt: { not: null } },
      { pendingRole: { not: null } }
    ]
  };
  if (
    after &&
    !(await tx.topicMembership.findFirst({
      where: { AND: [where, { id: postId(after) }] },
      select: { id: true }
    }))
  )
    throw new PortalError(
      409,
      "This membership page changed. Reload its first page."
    );
  const rows = await tx.topicMembership.findMany({
    where,
    select: {
      id: true,
      userId: true,
      version: true,
      joined: true,
      moderator: true,
      restrictedAt: true,
      restrictionReason: true,
      pendingRole: true,
      user: { select: { name: true, username: true } }
    },
    take: 21,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    ...(after ? { cursor: { id: after }, skip: 1 } : {})
  });
  return {
    ownerId: context.actorId,
    communityOwnerId: (
      await tx.topicCommunity.findUniqueOrThrow({
        where: { id },
        select: { ownerId: true }
      })
    ).ownerId,
    members: rows.slice(0, 20),
    after: rows.length > 20 ? rows[19].id : null
  };
}

export async function readTopicManagement(
  db: PrismaClient,
  token: unknown,
  address: string,
  after?: string,
  auditAfter?: string
) {
  return withPostRead(db, token, async (tx, context) => {
    const view = await topicIn(tx, context, address, true);
    if (context.actorId) await requirePrivilegedAuthentication(tx, context.actorId);
    const active =
      view.community.lifecycle === "ACTIVE" &&
      view.community.moderationState === "VISIBLE" &&
      !view.community.recoveryRequired;
    const members = active
      ? await topicMembersIn(tx, context, view.community.id, after)
      : null;
    const history = view.community.recoveryRequired
      ? null
      : await topicHistoryIn(tx, context, view.community.id, auditAfter);
    return { view, members, history };
  });
}

export function readTopicHistory(
  db: PrismaClient,
  token: unknown,
  communityId: string,
  after?: string
) {
  return withPostRead(db, token, (tx, context) =>
    topicHistoryIn(tx, context, communityId, after)
  );
}

async function topicHistoryIn(
  tx: PostTx,
  context: PostContext,
  communityId: string,
  after?: string
) {
  const id = postId(communityId);
  if (
    !context.eligible ||
    !context.actorId ||
    !(await tx.topicCommunity.findFirst({
      where: {
        id,
        recoveryRequired: false,
        OR: [
          { ownerId: context.actorId },
          { id: { in: [...(context.topicModerators ?? [])] } }
        ]
      },
      select: { id: true }
    }))
  )
    throw new PortalError(403, "Current topic management access is required.");
  await requirePrivilegedAuthentication(tx, context.actorId);
  if (
    after &&
    !(await tx.topicAudit.findFirst({
      where: { id: postId(after), communityId: id },
      select: { id: true }
    }))
  )
    throw new PortalError(
      409,
      "This history page changed. Reload the first page."
    );
  const rows = await tx.topicAudit.findMany({
    where: { communityId: id },
    select: {
      id: true,
      action: true,
      reason: true,
      fromState: true,
      toState: true,
      createdAt: true,
      version: true
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 21,
    ...(after ? { cursor: { id: after }, skip: 1 } : {})
  });
  return {
    entries: rows.slice(0, 20),
    after: rows.length > 20 ? rows[19].id : null
  };
}
