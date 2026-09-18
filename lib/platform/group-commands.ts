import type {
  GatherGroup,
  PrismaClient
} from "@prisma/client";
import { accountConfig } from "./account-config";
import { activityBudget } from "./account-limits";
import { contactPolicy } from "./adult-contact-policy";
import {
  groupBoolean,
  groupChoice,
  groupIdentity,
  groupMemberKey,
  groupSlug
} from "./group-input";
import {
  clearGroupInvitation,
  clearGroupOffer,
  endGroupMembership,
  recordGroupChange,
  retireGroupInvitations,
  retireGroupOffers
} from "./group-lifecycle";
import {
  currentGroupInvitation,
  groupAdultWhere,
  groupChurchAuthority,
  groupLeaderCurrent,
  groupSourceAvailable,
  requireGroupChurchAuthority,
  unavailableGroup
} from "./group-policy";
import { postContext, type PostTx } from "./post-access";
import { postField, postId } from "./post-input";
import { expected, PortalError } from "./portal-policy";
import { requirePrivilegedAuthentication } from "./privileged-auth-policy";
import { socialCommand, socialInput } from "./social-operations";

const specifics: Record<string, string[]> = {
  create: ["schema", "fields", "slug", "acceptedRules", "leaderDisclosure"],
  edit: ["schema", "fields", "acceptedRules", "leaderDisclosure"],
  "renew-authority": ["acceptedRules", "rulesVersion", "leaderDisclosure"],
  join: ["rulesVersion", "acceptedRules", "rosterVisible"],
  "accept-rules": ["rulesVersion", "acceptedRules"],
  leave: ["confirmed"],
  roster: ["rosterVisible"],
  invite: ["targetId", "contactVersion"],
  "cancel-invite": ["targetId"],
  decline: [],
  decide: ["targetId", "state", "reason"],
  "offer-role": ["targetId", "role", "reason"],
  "accept-role": ["role", "rulesVersion", "acceptedRules", "leaderDisclosure"],
  "decline-role": [],
  "cancel-role": ["targetId"],
  "revoke-role": ["targetId", "reason"],
  archive: ["desired", "confirmed", "reason"]
};
const ownerOps = [
  "edit",
  "renew-authority",
  "offer-role",
  "cancel-role",
  "revoke-role",
  "archive"
];
const leaderOps = ["invite", "cancel-invite", "decide"];
async function adult(tx: PostTx, actorId: string) {
  if (
    !(await tx.platformUser.findFirst({
      where: { id: actorId, ...groupAdultWhere },
      select: { id: true }
    }))
  )
    throw new PortalError(
      403,
      "Verify your email and confirm adult eligibility before participating in groups."
    );
}
function acceptsRules(input: Record<string, unknown>, group: GatherGroup) {
  if (input.acceptedRules !== true)
    throw new PortalError(
      400,
      "Read and explicitly accept the group's current rules."
    );
  expected(input.rulesVersion, group.rulesVersion);
}
function leadershipDisclosure(input: Record<string, unknown>) {
  if (input.leaderDisclosure !== true)
    throw new PortalError(
      400,
      "Confirm that your name and profile will identify you as a group leader to the group's permitted audience."
    );
}
async function ownerCapacity(tx: PostTx, actorId: string) {
  if (
    (await tx.gatherGroup.count({
      where: { ownerId: actorId, lifecycle: "ACTIVE" }
    })) >= 20
  )
    throw new PortalError(
      429,
      "You can own up to twenty active groups. Archive an unused group before adding another."
    );
}
async function choiceCapacity(tx: PostTx, actorId: string, activeOnly = false) {
  if (
    (await tx.gatherGroupMembership.count({
      where: {
        userId: actorId,
        ...(activeOnly
          ? { state: { in: ["ACTIVE", "PENDING", "INVITED"] } }
          : {})
      }
    })) >= (activeOnly ? 200 : 1000)
  )
    throw new PortalError(
      429,
      "Your group choices need a storage review. Existing choices are unchanged."
    );
}
async function memberCapacity(tx: PostTx, groupId: string) {
  if (
    (await tx.gatherGroupMembership.count({
      where: { groupId, state: "ACTIVE" }
    })) >= 500
  )
    throw new PortalError(
      409,
      "This group has reached its current member limit."
    );
}
async function current(
  tx: PostTx,
  actorId: string,
  op: string,
  input: Record<string, unknown>
) {
  if (!["leave", "decline", "decline-role"].includes(op))
    await adult(tx, actorId);
  if (op === "create") {
    await requirePrivilegedAuthentication(tx, actorId);
    return { group: null, member: null };
  }
  const group = await tx.gatherGroup.findUnique({
    where: { id: postId(input.groupId) }
  });
  if (!group) throw unavailableGroup();
  const member = await tx.gatherGroupMembership.findUnique({
    where: groupMemberKey(group.id, actorId)
  });
  // Negative personal choices remain available through archive or quarantine.
  if (["leave", "decline", "decline-role"].includes(op)) {
    if (!member) throw unavailableGroup();
    return { group, member };
  }
  if (group.recoveryRequired)
    throw new PortalError(
      503,
      "This group is awaiting protected recovery verification. Its older permissions cannot be reused."
    );
  if (ownerOps.includes(op)) {
    if (group.ownerId !== actorId || member?.state !== "ACTIVE")
      throw unavailableGroup();
    await requirePrivilegedAuthentication(tx, actorId);
    if (group.churchId) {
      const key = await requireGroupChurchAuthority(
        tx,
        group.churchId,
        actorId
      );
      if (op !== "renew-authority" && key !== group.ownerAuthorityKey)
        throw new PortalError(
          409,
          "Your church duties changed. Review and accept group leadership again before managing it."
        );
    }
    if (group.moderationState !== "VISIBLE") throw unavailableGroup();
    return { group, member };
  }
  const context = await postContext(tx, actorId);
  if (!(await groupSourceAvailable(tx, group, context)))
    throw unavailableGroup();
  if (leaderOps.includes(op)) {
    await requirePrivilegedAuthentication(tx, actorId);
    if (!(await groupLeaderCurrent(tx, group, member, actorId)))
      throw unavailableGroup();
    const targetId = postId(input.targetId);
    if (context.blockedIds?.includes(targetId)) throw unavailableGroup();
    if (op === "invite") {
      const contact = await contactPolicy(tx, actorId, targetId);
      if (!contact?.allowed)
        throw new PortalError(
          403,
          "This person is not currently accepting an invitation from you."
        );
      expected(input.contactVersion, contact.version);
    }
  } else if (op === "join") {
    if (
      group.lifecycle !== "ACTIVE" ||
      member?.state === "BANNED" ||
      member?.state === "REMOVED"
    )
      throw unavailableGroup();
    if (
      member?.state !== "ACTIVE" &&
      !(await currentGroupInvitation(tx, group, member)) &&
      (group.discovery !== "LISTED" || group.joinPolicy === "INVITE_ONLY")
    )
      throw unavailableGroup();
  } else if (["roster", "accept-rules", "accept-role"].includes(op)) {
    if (member?.state !== "ACTIVE" || !context.groupReaders?.has(group.id))
      throw unavailableGroup();
    if (op === "accept-role") {
      if (group.lifecycle !== "ACTIVE") throw unavailableGroup();
      await requirePrivilegedAuthentication(tx, actorId);
      if (member.pendingRole) {
        if (
          member.offeredById !== group.ownerId ||
          !member.offerExpiresAt ||
          member.offerExpiresAt <= new Date() ||
          member.offerGroupVersion !== group.version ||
          context.blockedIds?.includes(member.offeredById!)
        )
          throw new PortalError(
            409,
            "This leadership offer has ended or changed. Ask the current owner to make a new offer."
          );
      } else if (
        !(input.role === "OWNER" ? group.ownerId === actorId : member.leader)
      )
        throw unavailableGroup();
      if (group.churchId)
        await requireGroupChurchAuthority(tx, group.churchId, actorId);
    }
  }
  return { group, member };
}

export async function groupCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  const op = typeof input.operation === "string" ? input.operation : "";
  if (!Object.hasOwn(specifics, op))
    throw new PortalError(400, "Choose a supported group action.");
  socialInput(input, [
    "operation",
    "mutationId",
    "groupId",
    "expectedVersion",
    ...specifics[op]
  ]);
  return socialCommand(
    db,
    token,
    "group",
    input,
    async (tx, actorId) => {
      const { group, member } = await current(tx, actorId, op, input);
      if (
        [
          "create",
          "offer-role",
          "accept-role",
          "cancel-role",
          "revoke-role",
          "renew-authority"
        ].includes(op)
      )
        await requirePrivilegedAuthentication(tx, actorId, "change-access");
      if (op === "create") {
        const data = groupIdentity(input.schema, input.fields),
          slug = groupSlug(input.slug);
        if (input.acceptedRules !== true)
          throw new PortalError(
            400,
            "Accept the group rules before creating it."
          );
        leadershipDisclosure(input);
        await choiceCapacity(tx, actorId);
        await choiceCapacity(tx, actorId, true);
        await ownerCapacity(tx, actorId);
        const ownerAuthorityKey = data.churchId
          ? await requireGroupChurchAuthority(tx, data.churchId, actorId)
          : null;
        if (
          await tx.gatherGroup.findFirst({
            where: { OR: [{ slug }, { nameKey: data.nameKey }] },
            select: { id: true }
          })
        )
          throw new PortalError(
            409,
            "That group name or address is already reserved. Choose another."
          );
        const retry = await activityBudget(
          tx,
          accountConfig().rateSecret,
          actorId,
          "group-create",
          3,
          86400
        );
        if (retry)
          throw new PortalError(
            429,
            "You can create up to three groups in one day. Keep your entries and try later.",
            retry
          );
        const saved = await tx.gatherGroup.create({
          data: {
            ...data,
            slug,
            creatorId: actorId,
            ownerId: actorId,
            ownerAuthorityKey
          }
        });
        await tx.gatherGroupMembership.create({
          data: {
            groupId: saved.id,
            userId: actorId,
            state: "ACTIVE",
            rulesVersion: 1,
            joinedAt: new Date(),
            leader: true,
            leaderAuthorityKey: ownerAuthorityKey
          }
        });
        await recordGroupChange(tx, saved.id, actorId, "CREATE", saved.version);
        return {
          id: saved.id,
          version: saved.version,
          message:
            "Group created. Its discussions are available only to accepted members."
        };
      }
      if (!group) throw unavailableGroup();
      const personal = [
        "join",
        "leave",
        "decline",
        "roster",
        "accept-rules",
        "accept-role",
        "decline-role"
      ].includes(op);
      const targetId =
        input.targetId === undefined ? actorId : postId(input.targetId);
      const target = personal
        ? member
        : leaderOps.includes(op) ||
            ["offer-role", "cancel-role", "revoke-role"].includes(op)
          ? await tx.gatherGroupMembership.findUnique({
              where: groupMemberKey(group.id, targetId)
            })
          : null;
      expected(
        input.expectedVersion,
        personal || targetId !== actorId
          ? (target?.version ?? 0)
          : group.version
      );
      if (op === "edit") {
        if (group.lifecycle !== "ACTIVE")
          throw new PortalError(
            409,
            "Reopen this group before changing its details."
          );
        const data = groupIdentity(input.schema, input.fields);
        if (data.kind !== group.kind || data.churchId !== group.churchId)
          throw new PortalError(
            400,
            "A group's type and church destination cannot change. Create a separate group for a different purpose."
          );
        if (input.acceptedRules !== true)
          throw new PortalError(400, "Confirm the edited rules.");
        leadershipDisclosure(input);
        if (
          await tx.gatherGroup.findFirst({
            where: { id: { not: group.id }, nameKey: data.nameKey },
            select: { id: true }
          })
        )
          throw new PortalError(409, "That group name is already reserved.");
        const rulesVersion =
          group.rulesVersion + Number(data.rules !== group.rules);
        const saved = await tx.gatherGroup.update({
          where: { id: group.id },
          data: { ...data, rulesVersion, version: { increment: 1 } }
        });
        await tx.gatherGroupMembership.update({
          where: groupMemberKey(group.id, actorId),
          data: { rulesVersion, version: { increment: 1 } }
        });
        await retireGroupOffers(tx, group.id);
        await retireGroupInvitations(tx, group.id);
        await recordGroupChange(tx, group.id, actorId, "EDIT", saved.version);
        return {
          id: group.id,
          version: saved.version,
          message:
            "Group details saved. Members must accept changed rules before posting again."
        };
      }
      if (op === "renew-authority") {
        acceptsRules(input, group);
        leadershipDisclosure(input);
        if (!group.churchId)
          throw new PortalError(
            400,
            "This group does not use church authority."
          );
        const key = await requireGroupChurchAuthority(
          tx,
          group.churchId,
          actorId
        );
        const saved = await tx.gatherGroup.update({
          where: { id: group.id },
          data: { ownerAuthorityKey: key, version: { increment: 1 } }
        });
        await tx.gatherGroupMembership.update({
          where: groupMemberKey(group.id, actorId),
          data: {
            leaderAuthorityKey: key,
            rulesVersion: group.rulesVersion,
            version: { increment: 1 }
          }
        });
        await retireGroupOffers(tx, group.id);
        await retireGroupInvitations(tx, group.id);
        await recordGroupChange(
          tx,
          group.id,
          actorId,
          "RENEW_CHURCH_AUTHORITY",
          saved.version
        );
        return {
          id: group.id,
          version: saved.version,
          message:
            "Current church authority reviewed and accepted for this group."
        };
      }
      if (op === "archive") {
        const desired = groupBoolean(input.desired);
        if (input.confirmed !== true)
          throw new PortalError(400, "Confirm the group archive choice.");
        const reason = postField(input.reason, 300, 3);
        if (!desired && group.lifecycle === "ARCHIVED")
          await ownerCapacity(tx, actorId);
        const saved = await tx.gatherGroup.update({
          where: { id: group.id },
          data: {
            lifecycle: desired ? "ARCHIVED" : "ACTIVE",
            version: { increment: 1 }
          }
        });
        await retireGroupOffers(tx, group.id);
        await retireGroupInvitations(tx, group.id);
        await recordGroupChange(
          tx,
          group.id,
          actorId,
          desired ? "ARCHIVE" : "REOPEN",
          saved.version,
          { reason }
        );
        return {
          id: group.id,
          version: saved.version,
          message: desired
            ? "Group archived. Current members retain permitted history."
            : "Group reopened. Former invitations and offers remain ended."
        };
      }
      if (op === "join") {
        acceptsRules(input, group);
        const rosterVisible = groupBoolean(input.rosterVisible);
        if (member?.state === "ACTIVE")
          throw new PortalError(
            409,
            "You are already a member. Use your membership settings."
          );
        const invited = await currentGroupInvitation(tx, group, member);
        if (member?.state === "INVITED" && !invited)
          throw new PortalError(
            409,
            "This invitation ended. Ask for a new invitation."
          );
        if (!member) await choiceCapacity(tx, actorId);
        if (!member || !["PENDING", "INVITED"].includes(member.state))
          await choiceCapacity(tx, actorId, true);
        const state =
          invited || group.joinPolicy === "OPEN" ? "ACTIVE" : "PENDING";
        if (state === "ACTIVE") await memberCapacity(tx, group.id);
        if (
          state === "PENDING" &&
          (await tx.gatherGroupMembership.count({
            where: { groupId: group.id, state: "PENDING" }
          })) >= 200
        )
          throw new PortalError(
            429,
            "The group has reached its current request limit. Try again after leaders review requests."
          );
        const data = {
          state,
          rosterVisible,
          rulesVersion: group.rulesVersion,
          joinedAt: state === "ACTIVE" ? new Date() : null,
          ...clearGroupInvitation,
          ...clearGroupOffer
        };
        const saved = member
          ? await tx.gatherGroupMembership.update({
              where: { id: member.id },
              data: { ...data, version: { increment: 1 } }
            })
          : await tx.gatherGroupMembership.create({
              data: { ...data, userId: actorId, groupId: group.id }
            });
        await recordGroupChange(
          tx,
          group.id,
          actorId,
          state === "ACTIVE" ? "JOIN" : "APPLY",
          saved.version,
          { targetId: actorId }
        );
        return {
          id: group.id,
          version: saved.version,
          message:
            state === "ACTIVE"
              ? "You joined the group. Following a discussion remains your separate choice."
              : "Join request saved. Private member content becomes available only after approval."
        };
      }
      if (["leave", "decline", "decline-role"].includes(op)) {
        if (!member) throw unavailableGroup();
        if (op === "decline-role") {
          const saved = await tx.gatherGroupMembership.update({
            where: { id: member.id },
            data: { ...clearGroupOffer, version: { increment: 1 } }
          });
          await recordGroupChange(
            tx,
            group.id,
            actorId,
            "DECLINE_ROLE",
            saved.version,
            { targetId: actorId }
          );
          return {
            id: group.id,
            version: saved.version,
            message: "Leadership offer declined."
          };
        }
        if (group.ownerId === actorId && group.lifecycle === "ACTIVE")
          throw new PortalError(
            409,
            "Transfer ownership to a member who accepts, or archive the group before leaving."
          );
        if (op === "leave" && input.confirmed !== true)
          throw new PortalError(
            400,
            "Confirm that you want to leave this group."
          );
        if (op === "decline" && member.state !== "INVITED")
          throw new PortalError(409, "This invitation is no longer pending.");
        // A member cannot clear a ban by leaving and joining again.
        const state =
          member.state === "BANNED" || member.state === "REMOVED"
            ? member.state
            : op === "decline"
              ? "DECLINED"
              : "LEFT";
        const saved = await tx.gatherGroupMembership.update({
          where: { id: member.id },
          data: { state, ...endGroupMembership, version: { increment: 1 } }
        });
        await retireGroupOffers(tx, group.id, actorId);
        await retireGroupInvitations(tx, group.id, actorId);
        await recordGroupChange(
          tx,
          group.id,
          actorId,
          op.toUpperCase(),
          saved.version,
          { targetId: actorId }
        );
        return {
          id: group.id,
          version: saved.version,
          message:
            op === "decline"
              ? "Invitation declined."
              : "Membership ended. Previous invitations and leadership offers stay ended."
        };
      }
      if (op === "roster" || op === "accept-rules") {
        if (!member) throw unavailableGroup();
        if (op === "accept-rules") acceptsRules(input, group);
        const saved = await tx.gatherGroupMembership.update({
          where: { id: member.id },
          data: {
            ...(op === "roster"
              ? { rosterVisible: groupBoolean(input.rosterVisible) }
              : { rulesVersion: group.rulesVersion }),
            version: { increment: 1 }
          }
        });
        await recordGroupChange(
          tx,
          group.id,
          actorId,
          op === "roster" ? "ROSTER_CONSENT" : "ACCEPT_RULES",
          saved.version,
          { targetId: actorId }
        );
        return {
          id: group.id,
          version: saved.version,
          message: "Your membership choice was saved."
        };
      }
      if (op === "invite") {
        if (
          target &&
          ["ACTIVE", "PENDING", "BANNED", "REMOVED"].includes(target.state)
        )
          throw new PortalError(
            409,
            "This person's current membership needs its own review action."
          );
        if (!target) await choiceCapacity(tx, targetId);
        if (target?.state !== "INVITED")
          await choiceCapacity(tx, targetId, true);
        if (
          (await tx.gatherGroupMembership.count({
            where: { groupId: group.id, state: "INVITED" }
          })) >= 200
        )
          throw new PortalError(
            429,
            "Review existing invitations before inviting more people."
          );
        const retry = await activityBudget(
          tx,
          accountConfig().rateSecret,
          actorId,
          "group-invite",
          30,
          3600
        );
        if (retry)
          throw new PortalError(
            429,
            "The invitation limit was reached. Try again later.",
            retry
          );
        const policy = await contactPolicy(tx, actorId, targetId);
        if (!policy?.allowed || !member) throw unavailableGroup();
        const data = {
          state: "INVITED",
          ...endGroupMembership,
          invitedById: actorId,
          invitationExpiresAt: new Date(Date.now() + 14 * 86400000),
          invitationContactVersion: policy.version,
          invitationAuthorityVersion: member.version
        };
        const saved = target
          ? await tx.gatherGroupMembership.update({
              where: { id: target.id },
              data: { ...data, version: { increment: 1 } }
            })
          : await tx.gatherGroupMembership.create({
              data: { ...data, groupId: group.id, userId: targetId }
            });
        await recordGroupChange(
          tx,
          group.id,
          actorId,
          "INVITE",
          saved.version,
          { targetId }
        );
        return {
          id: group.id,
          version: saved.version,
          message:
            "Named invitation saved. This person must explicitly accept before becoming a member."
        };
      }
      if (op === "cancel-invite") {
        if (!target || target.state !== "INVITED")
          throw new PortalError(409, "This invitation is no longer pending.");
        const saved = await tx.gatherGroupMembership.update({
          where: { id: target.id },
          data: {
            state: "DECLINED",
            ...endGroupMembership,
            version: { increment: 1 }
          }
        });
        await recordGroupChange(
          tx,
          group.id,
          actorId,
          "CANCEL_INVITE",
          saved.version,
          { targetId }
        );
        return {
          id: group.id,
          version: saved.version,
          message: "Invitation canceled."
        };
      }
      if (op === "decide") {
        if (
          !target ||
          target.userId === actorId ||
          target.userId === group.ownerId ||
          (target.leader && actorId !== group.ownerId)
        )
          throw unavailableGroup();
        const state = groupChoice(input.state, {
            ACTIVE: true,
            REJECTED: true,
            REMOVED: true,
            BANNED: true,
            LEFT: true
          }),
          reason = postField(input.reason, 300, 3);
        const allowed =
          state === "ACTIVE"
            ? target.state === "PENDING"
            : state === "REJECTED"
              ? target.state === "PENDING"
              : state === "REMOVED"
                ? target.state === "ACTIVE"
                : state === "LEFT"
                  ? ["REMOVED", "BANNED"].includes(target.state)
                  : !["BANNED", "INVITED"].includes(target.state);
        if (!allowed)
          throw new PortalError(
            409,
            "The current membership state does not permit this decision."
          );
        if (state === "ACTIVE") {
          if (
            group.joinPolicy === "INVITE_ONLY" ||
            target.rulesVersion !== group.rulesVersion
          )
            throw new PortalError(
              409,
              "The join policy or rules changed. Ask this person to review a current invitation or request."
            );
          await adult(tx, targetId);
          await memberCapacity(tx, group.id);
        }
        const saved = await tx.gatherGroupMembership.update({
          where: { id: target.id },
          data: {
            state,
            ...(state === "ACTIVE"
              ? { joinedAt: new Date() }
              : endGroupMembership),
            version: { increment: 1 }
          }
        });
        if (state !== "ACTIVE") {
          await retireGroupOffers(tx, group.id, targetId);
          await retireGroupInvitations(tx, group.id, targetId);
        }
        await recordGroupChange(
          tx,
          group.id,
          actorId,
          "MEMBERSHIP_DECISION",
          saved.version,
          { targetId, reason, fromState: target.state, toState: state }
        );
        return {
          id: group.id,
          version: saved.version,
          message:
            state === "ACTIVE"
              ? "Join request approved."
              : state === "LEFT"
                ? "Restriction lifted. This person must deliberately request or accept membership again."
                : "Membership decision saved."
        };
      }
      if (op === "offer-role") {
        if (
          !target ||
          target.state !== "ACTIVE" ||
          target.userId === actorId ||
          target.rulesVersion !== group.rulesVersion ||
          group.lifecycle !== "ACTIVE"
        )
          throw unavailableGroup();
        const role = groupChoice(input.role, { OWNER: true, LEADER: true }),
          reason = postField(input.reason, 300, 3);
        const context = await postContext(tx, actorId);
        if (context.blockedIds?.includes(targetId)) throw unavailableGroup();
        await adult(tx, targetId);
        if (
          group.churchId &&
          !(await groupChurchAuthority(tx, group.churchId, targetId))
        )
          throw new PortalError(
            403,
            "This member needs current church group duties before receiving church leadership."
          );
        if (
          role === "LEADER" &&
          !target.leader &&
          (await tx.gatherGroupMembership.count({
            where: { groupId: group.id, state: "ACTIVE", leader: true }
          })) >= 20
        )
          throw new PortalError(
            409,
            "This group can have up to twenty named leaders."
          );
        const saved = await tx.gatherGroupMembership.update({
          where: { id: target.id },
          data: {
            pendingRole: role,
            offeredById: actorId,
            offerExpiresAt: new Date(Date.now() + 7 * 86400000),
            offerGroupVersion: group.version,
            version: { increment: 1 }
          }
        });
        await recordGroupChange(
          tx,
          group.id,
          actorId,
          "OFFER_ROLE",
          saved.version,
          { targetId, reason, toState: role }
        );
        return {
          id: group.id,
          version: saved.version,
          message:
            "Leadership offered. No new authority is granted until this member accepts."
        };
      }
      if (op === "accept-role") {
        if (!member?.pendingRole || member.pendingRole !== input.role)
          throw new PortalError(
            409,
            "This leadership offer is no longer pending."
          );
        acceptsRules(input, group);
        leadershipDisclosure(input);
        const key = group.churchId
          ? await requireGroupChurchAuthority(tx, group.churchId, actorId)
          : null;
        if (member.pendingRole === "OWNER") {
          await ownerCapacity(tx, actorId);
          await tx.gatherGroup.update({
            where: { id: group.id },
            data: {
              ownerId: actorId,
              ownerAuthorityKey: key,
              version: { increment: 1 }
            }
          });
          if (group.ownerId)
            await tx.gatherGroupMembership.update({
              where: groupMemberKey(group.id, group.ownerId),
              data: {
                leader: false,
                leaderAuthorityKey: null,
                version: { increment: 1 }
              }
            });
          await retireGroupOffers(tx, group.id);
          await retireGroupInvitations(tx, group.id);
        }
        if (
          member.pendingRole === "LEADER" &&
          !member.leader &&
          (await tx.gatherGroupMembership.count({
            where: { groupId: group.id, state: "ACTIVE", leader: true }
          })) >= 20
        )
          throw new PortalError(
            409,
            "This group can have up to twenty named leaders."
          );
        const saved = await tx.gatherGroupMembership.update({
          where: { id: member.id },
          data: {
            leader: true,
            leaderAuthorityKey: key,
            ...clearGroupOffer,
            version: { increment: 1 }
          }
        });
        await recordGroupChange(
          tx,
          group.id,
          actorId,
          "ACCEPT_ROLE",
          saved.version,
          { targetId: actorId, toState: String(input.role) }
        );
        return {
          id: group.id,
          version: saved.version,
          message:
            input.role === "OWNER"
              ? "Ownership transferred after your explicit acceptance."
              : "Group leadership accepted."
        };
      }
      if (op === "cancel-role" || op === "revoke-role") {
        if (
          !target ||
          target.userId === group.ownerId ||
          target.userId === actorId
        )
          throw unavailableGroup();
        const reason =
          op === "revoke-role" ? postField(input.reason, 300, 3) : undefined;
        const saved = await tx.gatherGroupMembership.update({
          where: { id: target.id },
          data: {
            ...clearGroupOffer,
            ...(op === "revoke-role"
              ? { leader: false, leaderAuthorityKey: null }
              : {}),
            version: { increment: 1 }
          }
        });
        await retireGroupInvitations(tx, group.id, targetId);
        await recordGroupChange(
          tx,
          group.id,
          actorId,
          op === "revoke-role" ? "REVOKE_ROLE" : "CANCEL_ROLE",
          saved.version,
          { targetId, reason }
        );
        return {
          id: group.id,
          version: saved.version,
          message:
            op === "revoke-role"
              ? "Leadership revoked. Ordinary membership remains."
              : "Leadership offer canceled."
        };
      }
      throw new PortalError(400, "Choose a supported group action.");
    },
    async (tx, actorId) => {
      await current(tx, actorId, op, input);
    }
  );
}
