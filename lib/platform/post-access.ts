import type { Prisma, PrismaClient, PlatformPost } from "@prisma/client";
import { activePublicAccount, communityAuthorSelect } from "./public-profile";
import { isEligible, PortalError } from "./portal";
import { readAccountSession } from "./accounts";

export type PostTx = Prisma.TransactionClient;
export type PostContext = {
  actorId: string | null;
  churches: string[];
  publishers: Set<string>;
  moderators: Set<string>;
};
export async function postContext(
  tx: PostTx,
  userId?: string | null
): Promise<PostContext> {
  const empty: PostContext = {
    actorId: null,
    churches: [],
    publishers: new Set(),
    moderators: new Set()
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
  const context = { ...empty, actorId: actor.id };
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
  const grants = await tx.churchCapabilityGrant.findMany({
    where: {
      userId,
      churchId: { in: context.churches },
      revokedAt: null,
      capability: { in: ["PUBLISH_CHURCH_POSTS", "MODERATE_CHURCH_POSTS"] }
    },
    include: { dependency: true }
  });
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
      : context.moderators
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
          { authorChurchId: null, author: activePublicAccount }
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
export function postCanReply(context: PostContext, post: PlatformPost) {
  return (
    !!context.actorId &&
    !post.discussionClosed &&
    (post.replyAudience === "VIEWERS" ||
      (!!post.audienceChurchId &&
        context.churches.includes(post.audienceChurchId)))
  );
}
export const postInclude = {
  author: { select: communityAuthorSelect },
  authorChurch: { select: { id: true, name: true } },
  eventOccurrence: { select: { event: { select: { visibility: true } } } }
} as const;
export async function withPostRead<T>(
  db: PrismaClient,
  token: unknown,
  work: (tx: PostTx, context: PostContext) => Promise<T>
) {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
      const user = await readAccountSession(tx as PrismaClient, token);
      return work(tx, await postContext(tx, user?.id));
    },
    { maxWait: 10000, timeout: 15000 }
  );
}

export function postField(value: unknown, maximum: number, minimum = 0) {
  // Native multipart forms encode textarea newlines as CRLF. Count and store
  // the same logical newlines the textarea's length limit presents to people.
  const text = typeof value === "string" ? value.replace(/\r\n?/g, "\n") : null;
  if (text === null || text.length > maximum || text.trim().length < minimum)
    throw new PortalError(
      400,
      `Use ${minimum}–${maximum} characters for this field. Your text has not been shortened.`
    );
  return text.trim();
}
export function postId(value: unknown) {
  const id = postField(value, 100, 1);
  if (!/^[A-Za-z0-9_-]+$/.test(id))
    throw new PortalError(400, "Use a valid post or church reference.");
  return id;
}
