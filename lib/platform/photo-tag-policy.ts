import type { Prisma } from "@prisma/client";
import { eligibleWhere, isEligible, PortalError } from "./portal-policy";
import {
  postCanEdit,
  postContext,
  type PostContext,
  type PostTx
} from "./post-access";
import { readableAssetWhere } from "./personal-photo-policy";
import { requireImplementedResource } from "./resource-contracts";

export const PHOTO_TAG_LIMIT = 20;
export const photoTagPurposes = [
  "PROFILE_PHOTO",
  "PROFILE_AVATAR",
  "PROFILE_COVER",
  "POST_PHOTO"
] as const;
const person = {
  id: true,
  name: true,
  username: true,
  suspendedAt: true,
  deactivatedAt: true,
  emailVerifiedAt: true,
  adultAcknowledgedAt: true,
  adultPolicyVersion: true
} as const;
export const tagAssetInclude = {
  personalPhoto: true,
  profileUser: { select: { id: true, name: true, username: true } },
  post: {
    select: {
      id: true,
      topicCommunityId: true,
      repostKind: true,
      audience: true,
      audienceChurchId: true,
      status: true,
      authorChurchId: true,
      authorId: true,
      author: { select: { name: true, username: true } },
      authorChurch: { select: { id: true, name: true } },
      eventOccurrence: {
        select: {
          event: {
            select: {
              visibility: true,
              calendar: { select: { churchId: true } }
            }
          }
        }
      }
    }
  }
} as const;
export const photoTagInclude = {
  requester: { select: person },
  recipient: { select: person }
} as const;
export type TagAsset = Prisma.MediaAssetGetPayload<{
  include: typeof tagAssetInclude;
}>;
export type PhotoTagRow = Prisma.PhotoTagGetPayload<{
  include: typeof photoTagInclude;
}>;

export async function requireTagOwner(tx: PostTx, ownerId: string | null) {
  if (!ownerId) throw new PortalError(401, "Sign in to review photo tags.");
  const context = await postContext(tx, ownerId);
  if (!context.eligible)
    throw new PortalError(403, "Photo tags require a verified adult account.");
  return context;
}
export function tagAudienceChurch(asset: TagAsset) {
  if (asset.personalPhoto?.audience === "CHURCH")
    return asset.personalPhoto.audienceChurchId;
  if (asset.post?.audience === "CHURCH") return asset.post.audienceChurchId;
  const event = asset.post?.eventOccurrence?.event;
  return event?.visibility === "CHURCH" ? event.calendar.churchId : null;
}
export function canRequestPhotoTag(context: PostContext, asset: TagAsset) {
  return (
    !!context.eligible &&
    (asset.profileUserId === context.actorId ||
      !!(asset.post && postCanEdit(context, asset.post)))
  );
}
export async function readableTagAsset(
  tx: PostTx,
  context: PostContext,
  id: string
) {
  requireImplementedResource("imageAsset");
  if (!context.actorId || !context.eligible) return null;
  return tx.mediaAsset.findFirst({
    where: {
      AND: [
        { id, purpose: { in: [...photoTagPurposes] } },
        readableAssetWhere(context)
      ]
    },
    include: tagAssetInclude
  });
}

export async function photoTagRequestAllowed(
  tx: PostTx,
  sender: string,
  recipient: string
) {
  if (sender === recipient) return false;
  const [target, block] = await Promise.all([
    tx.platformUser.findFirst({
      where: { id: recipient, ...eligibleWhere },
      select: {
        socialPreferences: {
          select: { photoTagRequests: true, photoTagRecoveryRequired: true }
        }
      }
    }),
    tx.socialRelationship.findFirst({
      where: {
        blocked: true,
        OR: [
          { ownerId: sender, targetUserId: recipient },
          { ownerId: recipient, targetUserId: sender }
        ]
      },
      select: { id: true }
    })
  ]);
  if (!target || block || target.socialPreferences?.photoTagRecoveryRequired)
    return false;
  const choice = target.socialPreferences?.photoTagRequests ?? "EVERYONE";
  return (
    choice === "EVERYONE" ||
    (choice === "FOLLOWED" &&
      !!(await tx.platformFollow.findUnique({
        where: {
          followerId_followingId: { followerId: recipient, followingId: sender }
        },
        select: { id: true }
      })))
  );
}

/** Reuse contexts within a bounded page, especially an entire recipient profile. */
export function tagContextCache(tx: PostTx, context: PostContext) {
  const cache = new Map<string, Promise<PostContext>>();
  if (context.actorId) cache.set(context.actorId, Promise.resolve(context));
  const assets = new Map<string, Promise<TagAsset | null>>();
  const contextFor = (id: string) => {
    if (!cache.has(id)) cache.set(id, postContext(tx, id));
    return cache.get(id)!;
  };
  return Object.assign(contextFor, {
    asset: (viewer: PostContext, id: string) => {
      const key = `${viewer.actorId}:${id}`;
      if (!assets.has(key)) assets.set(key, readableTagAsset(tx, viewer, id));
      return assets.get(key)!;
    }
  });
}
export async function visiblePhotoTag(
  tx: PostTx,
  context: PostContext,
  tag: PhotoTagRow,
  contexts: ReturnType<typeof tagContextCache>
) {
  if (
    !["PENDING", "APPROVED"].includes(tag.state) ||
    !context.eligible ||
    !isEligible(tag.recipient) ||
    !isEligible(tag.requester) ||
    context.blockedIds?.includes(tag.recipientId) ||
    context.blockedIds?.includes(tag.requesterId) ||
    (tag.audienceChurchId && !context.churches.includes(tag.audienceChurchId))
  )
    return null;
  if (
    tag.state === "PENDING" &&
    ![tag.recipientId, tag.requesterId].includes(context.actorId!)
  )
    return null;
  const recipient = await contexts(tag.recipientId);
  if (
    !recipient.eligible ||
    recipient.blockedIds?.includes(tag.requesterId) ||
    (tag.audienceChurchId && !recipient.churches.includes(tag.audienceChurchId))
  )
    return null;
  const asset = await contexts.asset(context, tag.assetId);
  if (!asset || !(await contexts.asset(recipient, tag.assetId))) return null;
  return asset;
}

export function tagSourceDescription(asset: TagAsset) {
  return (
    asset.post?.authorChurch?.name ??
    asset.profileUser?.name ??
    asset.post?.author.name ??
    "A member"
  );
}
export function tagSourceHref(asset: TagAsset) {
  return asset.postId
    ? `/platform/posts/${asset.postId}`
    : asset.profileUser?.username
      ? `/platform/profile/${asset.profileUser.username}?tab=photos`
      : null;
}
