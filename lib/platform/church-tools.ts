import type { PrismaClient } from "@prisma/client";
import { withPostRead } from "./post-access";
import { postId } from "./post-input";
import { imageTarget, readableImageTarget } from "./media-access";
import { effectiveChurchGrants } from "./church-permissions";
import { claimReviewEnabled } from "./church-claims";
import { isEligible } from "./portal-policy";
import { listImagesIn } from "./media";
import { imagesAvailable } from "./media-storage";
import { currentChurchWelcome } from "./church-welcome-policy";

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
    const profile = ownerId
      ? await tx.platformUser.findUnique({
          where: { id: ownerId },
          select: {
            bio: true,
            emailVerifiedAt: true,
            adultAcknowledgedAt: true,
            adultPolicyVersion: true,
            suspendedAt: true,
            deactivatedAt: true
          }
        })
      : null;
    const connection = ownerId
      ? await tx.churchConnection.findUnique({
          where: { userId_churchId: { userId: ownerId, churchId } },
          select: { state: true }
        })
      : null;
    const elsewhere = ownerId
      ? await tx.churchConnection.findFirst({
          where: {
            userId: ownerId,
            churchId: { not: churchId },
            state: { in: ["APPROVED", "PENDING"] }
          },
          select: { id: true }
        })
      : null;
    const following = ownerId
      ? await tx.socialRelationship.findUnique({
          where: { ownerId_churchId: { ownerId, churchId } },
          select: { followingChurch: true }
        })
      : null;
    const church = member
      ? await tx.church.findUnique({
          where: { id: churchId },
          select: { summary: true, welcomePostId: true }
        })
      : null;
    const approvedWelcome = church
      ? await currentChurchWelcome(tx, context, churchId, church.welcomePostId)
      : null;
    const setup: Array<{ label: string; href: string; done: boolean }> = [];
    const root = "/platform/churches/" + churchId;
    if (profileClaim)
      setup.push({
        label: "Review church profile",
        href: "/platform/church-claims/" + profileClaim.id + "#church-profile",
        done: !!church?.summary.trim()
      });
    if (capabilities.includes("MANAGE_STRUCTURE"))
      setup.push({
        label: "Prepare ministries and roles",
        href: root + "/structure",
        done: !!(await tx.churchPosition.findFirst({
          where: { churchId, archivedAt: null },
          select: { id: true }
        }))
      });
    if (
      capabilities.includes("EDIT_CHURCH_CALENDAR") ||
      capabilities.includes("PUBLISH_CHURCH_EVENTS")
    )
      setup.push({
        label: "Prepare church calendar",
        href: root + "/calendar",
        done: !!(await tx.platformCalendar.findFirst({
          where: { churchId, archivedAt: null },
          select: { id: true }
        }))
      });
    if (capabilities.includes("PUBLISH_CHURCH_POSTS"))
      setup.push({
        label: "Choose a Start here welcome",
        href: root + "/welcome",
        done: !!approvedWelcome
      });
    return {
      approvedWelcome,
      setup,
      churchId,
      ownerId,
      member,
      capabilities,
      contributor: !!contribution,
      claim: claim
        ? { id: claim.id, status: claim.status, activated: !!claim.activatedAt }
        : null,
      profileClaimId: profileClaim?.id ?? null,
      reviewEnabled: claimReviewEnabled(),
      welcome:
        ownerId && profile
          ? {
              eligible: isEligible(profile),
              needsIntroduction: !profile.bio?.trim(),
              needsPhoto:
                imagesAvailable() &&
                !(await listImagesIn(tx, context, "PROFILE_AVATAR", ownerId))
                  .length,
              following: !!following?.followingChurch,
              connectionState: connection?.state ?? null,
              connectedElsewhere: !!elsewhere
            }
          : null
    };
  });
}
export type ChurchToolsView = Awaited<ReturnType<typeof readChurchTools>>;
