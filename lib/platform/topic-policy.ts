import type { Prisma } from "@prisma/client";
import type { PostContext, PostTx } from "./post-access";
import { activePublicAccount } from "./public-profile";
import { PortalError } from "./portal-policy";

export const topicPublicWhere = {
  lifecycle: "ACTIVE",
  moderationState: "VISIBLE",
  recoveryRequired: false,
  owner: activePublicAccount
} satisfies Prisma.TopicCommunityWhereInput;

export async function topicContext(tx: PostTx, context: PostContext) {
  const rows = await tx.topicMembership.findMany({
    where: { userId: context.actorId! },
    select: {
      communityId: true,
      joined: true,
      following: true,
      moderator: true,
      restrictedAt: true,
      rulesVersion: true,
      community: {
        select: {
          ownerId: true,
          lifecycle: true,
          moderationState: true,
          rulesVersion: true,
          recoveryRequired: true,
          owner: { select: { suspendedAt: true, deactivatedAt: true } }
        }
      }
    },
    take: 201
  });
  if (rows.length > 200)
    throw new PortalError(503, "Your topic choices need a size review.");
  const active = rows.filter(
    (r) =>
      r.community.lifecycle === "ACTIVE" &&
      !r.community.recoveryRequired &&
      r.community.moderationState === "VISIBLE" &&
      r.community.owner &&
      !r.community.owner.suspendedAt &&
      !r.community.owner.deactivatedAt
  );
  return {
    topicParticipants: new Set(
      active
        .filter(
          (r) =>
            r.joined &&
            !r.restrictedAt &&
            r.rulesVersion === r.community.rulesVersion
        )
        .map((r) => r.communityId)
    ),
    topicModerators: new Set(
      active
        .filter(
          (r) =>
            r.joined &&
            !r.restrictedAt &&
            (r.moderator || r.community.ownerId === context.actorId)
        )
        .map((r) => r.communityId)
    ),
    topicFollowing: new Set(
      active
        .filter((r) => r.following && !r.restrictedAt)
        .map((r) => r.communityId)
    ),
    topicRestricted: new Set(
      rows.filter((r) => r.restrictedAt).map((r) => r.communityId)
    )
  };
}

export function requireTopicParticipation(
  context: PostContext,
  id: string | null | undefined
) {
  if (id && !context.topicParticipants?.has(id))
    throw new PortalError(
      403,
      "Join this topic and accept its current rules before posting or replying. Your access may have changed."
    );
}
export function requireTopicUnrestricted(
  context: PostContext,
  id: string | null | undefined
) {
  if (id && context.topicRestricted?.has(id))
    throw new PortalError(
      403,
      "Participation in this topic is currently restricted."
    );
}
export async function requireUnrestrictedTopicPost(
  tx: PostTx,
  context: PostContext,
  postId: string
) {
  const post = await tx.platformPost.findUnique({
    where: { id: postId },
    select: { topicCommunityId: true }
  });
  requireTopicUnrestricted(context, post?.topicCommunityId);
}
export async function topicPostReference(tx: PostTx, postId: string) {
  const post = await tx.platformPost.findUnique({
    where: { id: postId },
    select: {
      id: true,
      topicCommunityId: true,
      repostKind: true,
      repostSource: { select: { id: true, topicCommunityId: true } }
    }
  });
  return post?.topicCommunityId
    ? post.id
    : post?.repostKind === "PLAIN" && post.repostSource?.topicCommunityId
      ? post.repostSource.id
      : null;
}
