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
  now = new Date()
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
      mode === "friends"
        ? context.actorId
          ? { authorChurchId: null, author: mutualFriendWhere(context) }
          : { id: { in: [] } }
        : {
            audience: "PUBLIC",
            OR: [
              { eventOccurrenceId: null },
              { eventOccurrence: { event: { visibility: "PUBLIC" } } }
            ]
          }
    ]
  };
}
