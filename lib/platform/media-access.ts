import { MediaPurpose, type MediaAsset } from "@prisma/client";
import {
  postCanEdit,
  postReadableWhere,
  type PostContext,
  type PostTx
} from "./post-access";
import { postId } from "./post-input";
import { hasChurchCapability } from "./portal";
import { PortalError } from "./portal-policy";
import { socialUserWhere } from "./social-policy";

export type ImageTarget = Pick<
  MediaAsset,
  "purpose" | "profileUserId" | "churchId" | "postId"
>;
export function imageTarget(purpose: unknown, targetId: unknown): ImageTarget {
  if (!Object.values(MediaPurpose).includes(purpose as MediaPurpose))
    throw new PortalError(400, "Choose a supported image destination.");
  const id = postId(targetId),
    p = purpose as MediaPurpose;
  return {
    purpose: p,
    profileUserId: p.startsWith("PROFILE_") ? id : null,
    churchId: p.startsWith("CHURCH_") ? id : null,
    postId: p === "POST_PHOTO" ? id : null
  };
}
export async function readableImageTarget(
  tx: PostTx,
  context: PostContext,
  target: ImageTarget
) {
  let allowed = false;
  if (target.profileUserId)
    allowed =
      !!context.actorId &&
      !!(await tx.platformUser.findFirst({
        where: {
          AND: [{ id: target.profileUserId }, socialUserWhere(context)]
        },
        select: { id: true }
      }));
  else if (target.churchId)
    allowed = !!(await tx.church.findFirst({
      where: {
        id: target.churchId,
        OR: [{ communityListed: true }, { id: { in: context.churches } }]
      },
      select: { id: true }
    }));
  else if (target.postId)
    allowed = !!(await tx.platformPost.findFirst({
      where: { AND: [{ id: target.postId }, postReadableWhere(context)] },
      select: { id: true }
    }));
  if (!allowed) throw new PortalError(404, "Image unavailable.");
}
export async function writableImageTarget(
  tx: PostTx,
  context: PostContext,
  target: ImageTarget
) {
  if (!context.actorId) throw new PortalError(401, "Sign in to manage images.");
  await readableImageTarget(tx, context, target);
  if (target.profileUserId === context.actorId) return;
  if (target.churchId && context.churches.includes(target.churchId)) {
    const actor = await tx.platformUser.findUniqueOrThrow({
      where: { id: context.actorId }
    });
    if (
      await hasChurchCapability(
        tx,
        actor,
        target.churchId,
        "MANAGE_CHURCH_PROFILE"
      )
    )
      return;
  }
  if (target.postId) {
    const post = await tx.platformPost.findUniqueOrThrow({
      where: { id: target.postId }
    });
    if (postCanEdit(context, post)) return;
  }
  throw new PortalError(
    403,
    "You cannot change images here. Refresh to check your current access."
  );
}
