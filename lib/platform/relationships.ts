import { recordDiscoveryControl } from "./retention-controls";
import { protectDiscoveryRecovery } from "./discovery-recovery";
import {
  removeFriendConnection,
  hasFriendConnection
} from "./friend-invitations";
import type { PrismaClient } from "@prisma/client";
import { requireSocialActivity } from "./social-activity-limits";
import { withOwnedSession } from "./account-sessions";
import { eligibleWhere, expected, PortalError } from "./portal-policy";
import { activePublicAccount, communityAuthorSelect } from "./public-profile";
import { withPostRead } from "./post-access";
import { postId } from "./post-input";
import { socialCommand, socialInput } from "./social-operations";
import { socialPolicy, socialUserWhere } from "./social-policy";
import { socialPrivacyIn } from "./social-privacy";
import {
  revokeBlockedContact,
  revokeUnfollowedRequests
} from "./adult-contact-policy";
const PAGE = 20;
function target(kind: unknown, id: unknown) {
  if (kind !== "person" && kind !== "church")
    throw new PortalError(400, "Choose a person or a church.");
  return {
    targetUserId: kind === "person" ? postId(id) : null,
    churchId: kind === "church" ? postId(id) : null
  };
}
function desired(value: unknown) {
  if (typeof value !== "boolean")
    throw new PortalError(400, "Choose the intended setting.");
  return value;
}
export async function relationshipCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, [
    "operation",
    "mutationId",
    "kind",
    "targetId",
    "expectedVersion",
    "desired",
    "days",
    "mentions",
    "showRelationships"
  ]);
  let actingOwner: string | null = null;
  const result = await socialCommand(
    db,
    token,
    "relationships",
    input,
    async (tx, ownerId) => {
      if (input.operation === "privacy") {
        const row = await tx.socialPreferences.findUnique({
          where: { ownerId }
        });
        expected(input.expectedVersion, row?.version ?? 0);
        if (
          !["EVERYONE", "FOLLOWED", "NOBODY"].includes(String(input.mentions))
        )
          throw new PortalError(400, "Choose a supported mention setting.");
        const data = {
          mentions: String(input.mentions),
          showRelationships: desired(input.showRelationships)
        };
        const saved = await tx.socialPreferences.upsert({
          where: { ownerId },
          create: { ownerId, ...data },
          update: { ...data, version: { increment: 1 } }
        });
        return {
          id: ownerId,
          version: saved.version,
          message: "Privacy choices saved."
        };
      }
      const keys = target(input.kind, input.targetId);
      if (keys.targetUserId === ownerId)
        throw new PortalError(400, "Choose another account.");
      const person =
        keys.targetUserId &&
        (await tx.platformUser.findFirst({
          where: { id: keys.targetUserId, ...activePublicAccount },
          select: { id: true }
        }));
      const church =
        keys.churchId &&
        (await tx.church.findUnique({
          where: { id: keys.churchId },
          select: { id: true }
        }));
      if (!person && !church)
        throw new PortalError(404, "This account or church is unavailable.");
      const row = await tx.socialRelationship.findFirst({
        where: { ownerId, ...keys }
      });
      expected(input.expectedVersion, row?.version ?? 0);
      if (
        !row &&
        (await tx.socialRelationship.count({ where: { ownerId } })) >= 2000
      )
        throw new PortalError(409, "These social settings need a size review.");
      const incomingBlock =
        keys.targetUserId &&
        (await tx.socialRelationship.findFirst({
          where: {
            ownerId: keys.targetUserId,
            targetUserId: ownerId,
            blocked: true
          },
          select: { id: true }
        }));
      const follow =
        keys.targetUserId &&
        (await tx.platformFollow.findUnique({
          where: {
            followerId_followingId: {
              followerId: ownerId,
              followingId: keys.targetUserId
            }
          }
        }));
      const op = input.operation;
      const data: {
        authorBellSince?: Date | null;
        authorBellVersion?: number;
        followingChurch?: boolean;
        favorite?: boolean;
        muted?: boolean;
        snoozedUntil?: Date | null;
        blocked?: boolean;
      } = {};
      if (op === "author-bell") {
        const on = desired(input.desired);
        if (on && (incomingBlock || row?.blocked))
          throw new PortalError(404, "This account is unavailable.");
        if (
          on &&
          !(await tx.platformUser.findFirst({
            where: { id: ownerId, ...eligibleWhere },
            select: { id: true }
          }))
        )
          throw new PortalError(
            403,
            "Verify your email and complete adult account setup before enabling a bell."
          );
        data.authorBellSince = on ? (row?.authorBellSince ?? new Date()) : null;
        data.authorBellVersion = (row?.authorBellVersion ?? 0) + 1;
      } else if (op === "follow") {
        const on = desired(input.desired);
        if (on && (incomingBlock || row?.blocked))
          throw new PortalError(404, "This account is unavailable.");
        if (on && !(keys.targetUserId ? follow : row?.followingChurch))
          await requireSocialActivity(tx, ownerId, "follow");
        if (keys.targetUserId) {
          if (on)
            await tx.platformFollow.upsert({
              where: {
                followerId_followingId: {
                  followerId: ownerId,
                  followingId: keys.targetUserId
                }
              },
              create: { followerId: ownerId, followingId: keys.targetUserId },
              update: {}
            });
          else
            await tx.platformFollow.deleteMany({
              where: { followerId: ownerId, followingId: keys.targetUserId }
            });
        } else data.followingChurch = on;
        if (!on) {
          data.favorite = false;
          if (keys.targetUserId) {
            await removeFriendConnection(tx, ownerId, keys.targetUserId);
            await revokeUnfollowedRequests(tx, ownerId, keys.targetUserId);
            await revokeUnfollowedRequests(tx, keys.targetUserId, ownerId);
          }
        }
      } else if (op === "favorite") {
        const on = desired(input.desired);
        if (
          on &&
          (incomingBlock || row?.blocked || !(follow || row?.followingChurch))
        )
          throw new PortalError(
            409,
            "Follow this available account or church before adding a favorite."
          );
        data.favorite = on;
      } else if (op === "mute") {
        data.muted = desired(input.desired);
        data.snoozedUntil = null;
      } else if (op === "snooze") {
        if (
          ![1, 7, 30].includes(Number(input.days)) ||
          typeof input.days !== "number"
        )
          throw new PortalError(400, "Choose 1, 7 or 30 days.");
        data.muted = false;
        data.snoozedUntil = new Date(
          Date.now() + Number(input.days) * 86400000
        );
      } else if (op === "block") {
        if (!keys.targetUserId)
          throw new PortalError(400, "Use church mute for church content.");
        data.blocked = desired(input.desired);
        if (data.blocked) {
          await revokeBlockedContact(tx, ownerId, keys.targetUserId);
          await removeFriendConnection(tx, ownerId, keys.targetUserId);
          await tx.platformFollow.deleteMany({
            where: {
              OR: [
                { followerId: ownerId, followingId: keys.targetUserId },
                { followerId: keys.targetUserId, followingId: ownerId }
              ]
            }
          });
          const reverse = await tx.socialRelationship.findFirst({
            where: { ownerId: keys.targetUserId, targetUserId: ownerId }
          });
          if (reverse) {
            const revised = await tx.socialRelationship.update({
              where: { id: reverse.id },
              data: {
                favorite: false,
                authorBellSince: null,
                authorBellVersion: { increment: 1 },
                version: { increment: 1 }
              }
            });
            await recordDiscoveryControl(
              tx,
              "AUTHOR_BELL",
              ownerId,
              revised.id,
              revised.authorBellVersion
            );
          }
          data.authorBellSince = null;
          data.authorBellVersion = (row?.authorBellVersion ?? 0) + 1;
          await tx.conversationPreference.updateMany({
            where: {
              mode: "FOLLOW",
              OR: [
                {
                  ownerId,
                  post: { authorId: keys.targetUserId, authorChurchId: null }
                },
                {
                  ownerId: keys.targetUserId,
                  post: { authorId: ownerId, authorChurchId: null }
                }
              ]
            },
            data: { mode: "DEFAULT", version: { increment: 1 } }
          });
          data.favorite = false;
        }
      } else throw new PortalError(400, "Choose a supported social action.");
      const saved = row
        ? await tx.socialRelationship.update({
            where: { id: row.id },
            data: { ...data, version: { increment: 1 } }
          })
        : await tx.socialRelationship.create({
            data: { ownerId, ...keys, ...data }
          });
      if (data.authorBellVersion !== undefined)
        await recordDiscoveryControl(
          tx,
          "AUTHOR_BELL",
          ownerId,
          saved.id,
          saved.authorBellVersion
        );
      return {
        id: saved.id,
        version: saved.version,
        message:
          op === "author-bell"
            ? saved.authorBellSince
              ? "New post bell enabled. Following is unchanged; phone alerts also require your notification choice."
              : "New post bell turned off."
            : "Social setting saved privately."
      };
    },
    async (_tx, ownerId) => {
      actingOwner = ownerId;
    }
  );
  if (
    ["author-bell", "block"].includes(String(input.operation)) &&
    actingOwner &&
    !(await protectDiscoveryRecovery(db, actingOwner))
  )
    throw new PortalError(
      503,
      "Your relationship choice is saved; its protected recovery receipt needs confirmation. Retry the same change."
    );
  return result;
}
export function readRelationships(
  db: PrismaClient,
  token: unknown,
  query: {
    view?: string;
    kind?: unknown;
    targetId?: unknown;
    after?: unknown;
    q?: unknown;
  }
) {
  return withOwnedSession(
    db,
    token,
    async (tx, session) => {
      const ownerId = session.userId,
        after = query.after ? postId(query.after) : undefined;
      if (
        query.q != null &&
        (typeof query.q !== "string" ||
          query.q.length > 100 ||
          /[\u0000-\u001f\u007f]/.test(query.q))
      )
        throw new PortalError(400, "Search using up to 100 characters.");
      const search = typeof query.q === "string" ? query.q.trim() : "";
      if (search && query.view !== "blocked" && query.view !== "muted")
        throw new PortalError(400, "Search your blocked or muted list.");
      const literal = search.replace(/[\\%_]/g, "\\$&");
      const page = <T extends { id: string }>(rows: T[]) => ({
        items: rows.slice(0, PAGE),
        nextCursor: rows.length > PAGE ? rows[PAGE - 1].id : null
      });
      if (query.view === "privacy") {
        return socialPrivacyIn(tx, ownerId);
      }
      if (query.view === "status") {
        const keys = target(query.kind, query.targetId);
        const row = await tx.socialRelationship.findFirst({
          where: { ownerId, ...keys },
          select: {
            id: true,
            version: true,
            favorite: true,
            muted: true,
            snoozedUntil: true,
            blocked: true,
            followingChurch: true,
            authorBellSince: true
          }
        });
        const following = keys.targetUserId
          ? !!(await tx.platformFollow.findUnique({
              where: {
                followerId_followingId: {
                  followerId: ownerId,
                  followingId: keys.targetUserId
                }
              },
              select: { id: true }
            }))
          : (row?.followingChurch ?? false);
        return {
          ...(row ?? {
            id: null,
            version: 0,
            favorite: false,
            muted: false,
            snoozedUntil: null,
            blocked: false
          }),
          following,
          authorBell: !!row?.authorBellSince,
          friends: keys.targetUserId
            ? await hasFriendConnection(tx, ownerId, keys.targetUserId)
            : false
        };
      }
      if (query.view === "following") {
        const rows = await tx.platformFollow.findMany({
          where: {
            followerId: ownerId,
            following: socialUserWhere(await socialPolicy(tx, ownerId)),
            ...(after ? { id: { gt: after } } : {})
          },
          select: { id: true, following: { select: communityAuthorSelect } },
          orderBy: { id: "asc" },
          take: PAGE + 1
        });
        const controls = await tx.socialRelationship.findMany({
          where: {
            ownerId,
            targetUserId: { in: rows.map((r) => r.following.id) }
          },
          select: {
            targetUserId: true,
            version: true,
            favorite: true,
            muted: true,
            snoozedUntil: true
          }
        });
        return page(
          rows.map((r) => ({
            ...r,
            settings: controls.find(
              (c) => c.targetUserId === r.following.id
            ) ?? {
              version: 0,
              favorite: false,
              muted: false,
              snoozedUntil: null
            }
          }))
        );
      }
      if (
        query.view &&
        !["controls", "favorites", "muted", "blocked", "churches"].includes(
          query.view
        )
      )
        throw new PortalError(400, "Choose a supported social view.");
      const rows = await tx.socialRelationship.findMany({
        where: {
          ownerId,
          ...(after ? { id: { gt: after } } : {}),
          ...(search
            ? {
                OR: [
                  {
                    targetUser: {
                      is: {
                        ...activePublicAccount,
                        OR: [
                          {
                            name: {
                              contains: literal,
                              mode: "insensitive" as const
                            }
                          },
                          {
                            username: {
                              contains: literal,
                              mode: "insensitive" as const
                            }
                          }
                        ]
                      }
                    }
                  },
                  {
                    church: {
                      is: {
                        name: {
                          contains: literal,
                          mode: "insensitive" as const
                        }
                      }
                    }
                  }
                ]
              }
            : {}),
          ...(query.view === "favorites"
            ? { favorite: true }
            : query.view === "blocked"
              ? { blocked: true }
              : query.view === "churches"
                ? { followingChurch: true }
                : query.view === "muted"
                  ? {
                      AND: [
                        {
                          OR: [
                            { muted: true },
                            { snoozedUntil: { gt: new Date() } }
                          ]
                        }
                      ]
                    }
                  : {})
        },
        select: {
          id: true,
          version: true,
          targetUserId: true,
          churchId: true,
          favorite: true,
          muted: true,
          snoozedUntil: true,
          blocked: true,
          followingChurch: true
        },
        orderBy: { id: "asc" },
        take: PAGE + 1
      });
      // These are the owner's settings, not another account's relationship list.
      const users = await tx.platformUser.findMany({
        where: {
          id: {
            in: rows.flatMap((r) => (r.targetUserId ? [r.targetUserId] : []))
          },
          ...activePublicAccount
        },
        select: communityAuthorSelect
      });
      const churches = await tx.church.findMany({
        where: {
          id: { in: rows.flatMap((r) => (r.churchId ? [r.churchId] : [])) }
        },
        select: { id: true, name: true }
      });
      return page(
        rows.map((row) => ({
          ...row,
          target: row.targetUserId
            ? (users.find((u) => u.id === row.targetUserId) ?? null)
            : (churches.find((c) => c.id === row.churchId) ?? null)
        }))
      );
    },
    true
  );
}
export function searchPeople(db: PrismaClient, token: unknown, query: string) {
  query = query.slice(0, 200).replace(/[\\%_]/g, "\\$&");
  return withPostRead(db, token, (tx, context) =>
    tx.platformUser.findMany({
      where: {
        AND: [
          socialUserWhere(context),
          { id: { notIn: context.mutedIds ?? [] } },
          {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { username: { contains: query, mode: "insensitive" } },
              ...(context.actorId
                ? [{ bio: { contains: query, mode: "insensitive" as const } }]
                : [])
            ]
          }
        ]
      },
      select: communityAuthorSelect,
      take: 20
    })
  );
}
