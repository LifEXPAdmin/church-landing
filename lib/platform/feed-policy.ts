import type { Prisma } from "@prisma/client";
import { postReadableWhere, type PostContext } from "./post-access";
import { socialDiscoveryWhere, socialUserWhere } from "./social-policy";
import type { FeedMode } from "./feed-options";

/** Acceptance and both follows must still exist. A follow alone is never a friend. */
export function mutualFriendWhere(
  context: PostContext
): Prisma.PlatformUserWhereInput {
  const id = context.actorId ?? "";
  return {
    AND: [socialUserWhere(context), { id: { not: id } }],
    following: { some: { followingId: id } },
    followers: { some: { followerId: id } },
    OR: [
      {
        sentFriendAcceptances: { some: { recipientId: id, state: "CONNECTED" } }
      },
      {
        receivedFriendAcceptances: {
          some: { inviterId: id, state: "CONNECTED" }
        }
      }
    ]
  };
}
export function feedReadableWhere(
  context: PostContext,
  mode: FeedMode,
  now = new Date(),
  homeChurchId: string | null = null
): Prisma.PlatformPostWhereInput {
  return {
    AND: [
      postReadableWhere(context, now),
      socialDiscoveryWhere(context),
      {
        OR: [
          { repostKind: null },
          { repostSourceId: null },
          { repostSource: { is: socialDiscoveryWhere(context) } }
        ]
      },
      mode === "following" || mode === "favorites"
        ? followedPostWhere(context, mode === "favorites")
        : mode === "your-church"
          ? homeChurchId && context.churches.includes(homeChurchId)
            ? {
                OR: [
                  { authorChurchId: homeChurchId },
                  { audienceChurchId: homeChurchId }
                ]
              }
            : { id: { in: [] } }
          : mode === "friends"
            ? context.actorId
              ? { authorChurchId: null, author: mutualFriendWhere(context) }
              : { id: { in: [] } }
            : {
                audience: "PUBLIC",
                ...(mode === "churches"
                  ? {
                      authorChurch: {
                        socialRelations: {
                          some: {
                            ownerId: context.actorId ?? "",
                            followingChurch: true
                          }
                        }
                      }
                    }
                  : {}),
                OR: [
                  { eventOccurrenceId: null },
                  { eventOccurrence: { event: { visibility: "PUBLIC" } } }
                ]
              }
    ]
  };
}
export function followedPostWhere(
  context: PostContext,
  favorite = false
): Prisma.PlatformPostWhereInput {
  if (!context.actorId) return { id: { in: [] } };
  const ownerId = context.actorId;
  return {
    OR: [
      {
        authorChurchId: null,
        author: {
          followers: { some: { followerId: ownerId } },
          ...(favorite
            ? { socialTargets: { some: { ownerId, favorite: true } } }
            : {})
        }
      },
      {
        authorChurch: {
          socialRelations: {
            some: {
              ownerId,
              followingChurch: true,
              ...(favorite ? { favorite: true } : {})
            }
          }
        }
      }
    ]
  };
}
