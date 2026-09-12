import type { PrismaClient } from "@prisma/client";
import { withPostRead, postId } from "./post-access";
import { imageTarget, readableImageTarget } from "./media-access";
import { effectiveChurchGrants } from "./church-permissions";
import { claimReviewEnabled } from "./church-claims";

/** Navigation projects existing permissions; it never appoints a contributor. */
export function readChurchTools(db: PrismaClient, token: unknown, id: unknown) {
  return withPostRead(db, token, async (tx, context) => {
    const churchId = postId(id);
    await readableImageTarget(
      tx,
      context,
      imageTarget("CHURCH_LOGO", churchId)
    );
    const ownerId = context.actorId,
      member = context.churches.includes(churchId);
    const grants =
      ownerId && member
        ? await effectiveChurchGrants(tx, ownerId, [churchId])
        : [];
    const capabilities = [...new Set(grants.map((grant) => grant.capability))];
    const claim = ownerId
      ? await tx.churchClaim.findFirst({
          where: { ownerId, churchId },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          select: { id: true, status: true, activatedAt: true }
        })
      : null;
    const profileClaim =
      ownerId && capabilities.includes("MANAGE_CHURCH_PROFILE")
        ? await tx.churchClaim.findFirst({
            where: {
              ownerId,
              churchId,
              status: "APPROVED",
              activatedAt: { not: null }
            },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            select: { id: true }
          })
        : null;
    const contribution = ownerId
      ? await tx.churchListingSubmission.findFirst({
          where: { ownerId, churchId, status: "PUBLISHED" },
          select: { id: true }
        })
      : null;
    return {
      churchId,
      ownerId,
      member,
      capabilities,
      contributor: !!contribution,
      claim: claim
        ? { id: claim.id, status: claim.status, activated: !!claim.activatedAt }
        : null,
      profileClaimId: profileClaim?.id ?? null,
      reviewEnabled: claimReviewEnabled()
    };
  });
}
export type ChurchToolsView = Awaited<ReturnType<typeof readChurchTools>>;
