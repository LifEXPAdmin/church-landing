export { postField, postId } from "./post-input";
import {
  socialPolicy,
  socialUserWhere,
  type SocialPolicy
} from "./social-policy";
import { effectiveChurchGrants } from "./church-permissions";
import type { Prisma, PrismaClient, PlatformPost } from "@prisma/client";
import { communityAuthorSelect } from "./public-profile";
import { isEligible, PortalError } from "./portal-policy";
import { withAccountRead } from "./account-read";

export type PostTx = Prisma.TransactionClient;
export type PostContext = SocialPolicy & {
  actorId: string | null;
  churches: string[];
  publishers: Set<string>;
  moderators: Set<string>;
  volunteers: Set<string>;
};
export async function postContext(
  tx: PostTx,
  userId?: string | null
): Promise<PostContext> {
  const empty: PostContext = {
    actorId: null,
    churches: [],
    publishers: new Set(),
    moderators: new Set(),
    volunteers: new Set()
  };
  if (!userId) return empty;
  const actor = await tx.platformUser.findUnique({
    where: { id: userId },
    select: {
      id: true,
      suspendedAt: true,
      deactivatedAt: true,
      emailVerifiedAt: true,
      adultAcknowledgedAt: true,
      adultPolicyVersion: true
    }
  });
  if (!actor || actor.suspendedAt || actor.deactivatedAt) return empty;
  const context = {
    ...empty,
    ...(await socialPolicy(tx, actor.id)),
    actorId: actor.id
  };
  if (!isEligible(actor)) return context;
  const connections = await tx.churchConnection.findMany({
    where: { userId, state: "APPROVED" },
    select: { churchId: true },
    take: 201
  });
  if (connections.length > 200)
    throw new PortalError(
      503,
      "Your church connections need an administrator to review their size."
    );
  context.churches = connections.map((c) => c.churchId);
  const grants = await effectiveChurchGrants(tx, userId, context.churches, [
    "PUBLISH_CHURCH_POSTS",
    "MODERATE_CHURCH_POSTS",
    "MANAGE_CHURCH_VOLUNTEERS"
  ]);
  for (const grant of grants) {
    if (
      grant.dependency &&
      (grant.dependency.state !== "APPROVED" ||
        grant.dependency.userId !== userId ||
        grant.dependency.churchId !== grant.churchId)
    )
      continue;
    (grant.capability === "PUBLISH_CHURCH_POSTS"
      ? context.publishers
      : grant.capability === "MODERATE_CHURCH_POSTS"
        ? context.moderators
        : context.volunteers
    ).add(grant.churchId);
  }
  return context;
}

// Filter before fetching/counting rows. Linked discussions can never widen a
// church event's published audience, including after it is made private again.
export function postReadableWhere(
  context: PostContext,
  now = new Date()
): Prisma.PlatformPostWhereInput {
  return {
    AND: [
      { status: "PUBLISHED", withdrawnAt: null, publishedAt: { lte: now } },
      {
        OR: [
          { authorChurchId: { not: null } },
          { authorChurchId: null, author: socialUserWhere(context) }
        ]
      },
      {
        OR: [
          { audience: "PUBLIC" },
          { audience: "CHURCH", audienceChurchId: { in: context.churches } }
        ]
      },
      {
        OR: [
          { eventOccurrenceId: null },
          {
            eventOccurrence: {
              event: {
                calendar: { archivedAt: null, churchId: { not: null } },
                OR: [
                  { visibility: "PUBLIC" },
                  {
                    visibility: "CHURCH",
                    calendar: { churchId: { in: context.churches } }
                  }
                ]
              }
            }
          }
        ]
      }
    ]
  };
}
export function postCanEdit(context: PostContext, post: PlatformPost) {
  return (
    post.repostKind !== "PLAIN" &&
    (post.repostKind !== "QUOTE" ||
      !post.audienceChurchId ||
      context.publishers.has(post.audienceChurchId)) &&
    post.status !== "WITHDRAWN" &&
    (post.authorChurchId
      ? context.publishers.has(post.authorChurchId)
      : context.actorId === post.authorId)
  );
}
export function postCanModerate(context: PostContext, post: PlatformPost) {
  const churchId =
    post.authorChurchId ??
    (post.audience === "CHURCH" ? post.audienceChurchId : null);
  return !!churchId && context.moderators.has(churchId);
}
export function postCanWithdraw(context: PostContext, post: PlatformPost) {
  return (
    postCanEdit(context, post) ||
    postCanModerate(context, post) ||
    (post.repostKind === "QUOTE" &&
      !post.authorChurchId &&
      context.actorId === post.authorId)
  );
}
export function postCanReply(context: PostContext, post: PlatformPost) {
  return (
    !!context.actorId &&
    post.repostKind !== "PLAIN" &&
    !post.discussionClosed &&
    (post.replyAudience === "VIEWERS" ||
      (!!post.audienceChurchId &&
        context.churches.includes(post.audienceChurchId)))
  );
}
export const postInclude = {
  poll: { select: { id: true } },
  volunteerSlots: { select: { id: true }, take: 1 },
  author: { select: communityAuthorSelect },
  authorChurch: { select: { id: true, name: true } },
  eventOccurrence: { select: { event: { select: { visibility: true } } } }
} as const;
export async function withPostRead<T>(
  db: PrismaClient,
  token: unknown,
  work: (tx: PostTx, context: PostContext) => Promise<T>
) {
  return withAccountRead(db, token, async (tx, ownerId) =>
    work(tx, await postContext(tx, ownerId))
  );
}
