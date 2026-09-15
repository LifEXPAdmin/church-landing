import type { Prisma, MediaAsset } from "@prisma/client";
import { ADULT_POLICY } from "./portal-types";
import { PortalError } from "./portal-policy";
import { defaultSupportRecipient, supportRecipient } from "./support-recipient";
export const FEEDBACK_UPLOAD_LIFETIME = 24 * 3600_000;
export const FEEDBACK_ATTACHMENT_LIMIT = 3;
export async function feedbackImageActor(
  tx: Prisma.TransactionClient,
  actorId: string | null
) {
  if (!actorId)
    throw new PortalError(401, "Sign in to review private feedback images.");
  const actor = await tx.platformUser.findFirst({
    where: {
      id: actorId,
      suspendedAt: null,
      deactivatedAt: null,
      adultAcknowledgedAt: { not: null },
      adultPolicyVersion: ADULT_POLICY
    },
    select: { id: true }
  });
  if (!actor) throw new PortalError(404, "Image unavailable.");
  return actor;
}
export async function writableFeedbackImage(
  tx: Prisma.TransactionClient,
  actorId: string | null,
  ownerId?: string | null,
  caseId?: string | null
) {
  const actor = await feedbackImageActor(tx, actorId);
  if (actor.id !== ownerId || caseId)
    throw new PortalError(404, "Image unavailable.");
  const recipient =
    process.env.FEEDBACK_INTAKE_ENABLED === "true"
      ? await defaultSupportRecipient(tx)
      : null;
  if (!recipient || recipient.userId === actor.id)
    throw new PortalError(
      503,
      "Feedback intake is not ready. Keep your selected file and try again later."
    );
}
export async function readableFeedbackImage(
  tx: Prisma.TransactionClient,
  actorId: string | null,
  asset: MediaAsset
) {
  const actor = await feedbackImageActor(tx, actorId);
  if (asset.purpose !== "SUPPORT_ATTACHMENT" || asset.status !== "READY")
    throw new PortalError(404, "Image unavailable.");
  if (!asset.feedbackCaseId) {
    if (
      asset.feedbackOwnerId === actor.id &&
      asset.createdAt.getTime() + FEEDBACK_UPLOAD_LIFETIME > Date.now()
    )
      return;
  } else {
    const feedback = await tx.feedbackSubmission.findUnique({
      where: { caseId: asset.feedbackCaseId },
      select: {
        redactedAt: true,
        case: {
          select: {
            requesterId: true,
            ownerGrantId: true,
            ownerGrantVersion: true
          }
        }
      }
    });
    if (
      feedback &&
      !feedback.redactedAt &&
      feedback.case.requesterId === asset.feedbackOwnerId
    ) {
      if (feedback.case.requesterId === actor.id) return;
      const grant = await supportRecipient(tx, feedback.case.ownerGrantId);
      if (
        grant &&
        grant.userId === actor.id &&
        grant.version === feedback.case.ownerGrantVersion
      )
        return;
    }
  }
  throw new PortalError(404, "Image unavailable.");
}
