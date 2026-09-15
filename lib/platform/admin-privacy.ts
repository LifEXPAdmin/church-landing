import { Prisma, type PrismaClient } from "@prisma/client";
import {
  journalRetentionControls,
  protectedRetentionControls,
  type RetentionControlJournal
} from "./retention-controls";
import { PortalError } from "./portal-policy";
import { emptyFeedback } from "./feedback-policy";
import { retireFeedbackImages } from "./feedback-image-lifecycle";

export const emptyAdminText = {
  nextAction: "",
  triageTags: [],
  reminderAt: null,
  adminGroupId: null
};
export const emptyAdminBug = {
  bugSteps: "",
  bugExpected: "",
  bugActual: "",
  bugEnvironment: "",
  reproducibility: "UNREVIEWED",
  engineeringUrl: ""
};
export async function redactAdminCaseNotes(
  tx: Prisma.TransactionClient,
  where: Prisma.AdminCaseNoteWhereInput,
  now = new Date()
) {
  await tx.adminCaseNote.updateMany({
    where: { ...where, redactedAt: null },
    data: { body: "[Removed for privacy.]", redactedAt: now }
  });
}
export async function eraseAdminPersonalData(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date
) {
  await tx.feedbackPromptClaim.deleteMany({ where: { userId } });
  await tx.feedbackPromptPreference.deleteMany({ where: { userId } });
  await tx.feedbackIdeaVote.deleteMany({ where: { userId } });
  await tx.feedbackIdeaSubscription.deleteMany({ where: { userId } });
  await retireFeedbackImages(tx, { feedbackOwnerId: userId });
  await tx.supportMessage.updateMany({
    where: { case: { requesterId: userId, feedback: { isNot: null } } },
    data: { body: "Removed after account deletion.", redactedAt: now }
  });
  await tx.feedbackSubmission.updateMany({
    where: { case: { requesterId: userId }, redactedAt: null },
    data: {
      ...emptyFeedback,
      redactedAt: now,
      version: { increment: 1 },
      sharingVersion: { increment: 1 }
    }
  });
  await tx.adminSavedView.deleteMany({ where: { userId } });
  await tx.adminAuthenticator.deleteMany({ where: { userId } });
  const sources = await tx.supportCase.findMany({
    where: { requesterId: userId, moderationDecisionId: null },
    select: { id: true, adminGroupId: true }
  });
  const claims = await tx.churchClaim.findMany({
    where: { ownerId: userId },
    select: { id: true, adminGroupId: true }
  });
  const groupIds = [...sources, ...claims].flatMap((s) =>
    s.adminGroupId ? [s.adminGroupId] : []
  );
  if (groupIds.length)
    await tx.adminCaseGroup.updateMany({
      where: { id: { in: groupIds } },
      data: { title: "[Removed for privacy.]", engineeringUrl: "" }
    });
  await redactAdminCaseNotes(
    tx,
    {
      OR: [
        { supportCaseId: { in: sources.map((s) => s.id) } },
        { claimId: { in: claims.map((s) => s.id) } }
      ]
    },
    now
  );
  await tx.supportCase.updateMany({
    where: { requesterId: userId, moderationDecisionId: null },
    data: {
      ...emptyAdminText,
      ...emptyAdminBug,
      adminVersion: { increment: 1 }
    }
  });
  await tx.churchClaim.updateMany({
    where: { ownerId: userId },
    data: { ...emptyAdminText, adminVersion: { increment: 1 } }
  });
  await tx.communityReport.updateMany({
    where: { assignedReviewerId: userId },
    data: {
      assignedReviewerId: null,
      assignedReviewerProof: null,
      version: { increment: 1 }
    }
  });
  await tx.churchClaim.updateMany({
    where: { assignedReviewerId: userId },
    data: {
      assignedReviewerId: null,
      assignedReviewerProof: null,
      version: { increment: 1 }
    }
  });
  // Authored staff operations on another person's retained case are preserved
  // under that source's policy. The actor becomes the existing deleted account.
}
export async function protectAdminCaseChanges(
  db: PrismaClient,
  sourceIds: string[],
  journal?: RetentionControlJournal
) {
  try {
    const targets = await db.retentionControl.findMany({
      where: {
        sourceId: { in: sourceIds },
        kind: {
          in: [
            "ADMIN_SUPPORT",
            "ADMIN_REPORT",
            "ADMIN_CLAIM",
            "SUPPORT_MESSAGE",
            "SUPPORT_ATTACHMENT",
            "FEEDBACK_CHOICES",
            "FEEDBACK_IDEA",
            "FEEDBACK_SUBSCRIPTION"
          ]
        },
        journaledAt: null
      },
      select: { targetId: true },
      distinct: ["targetId"],
      take: 100
    });
    if (targets.length) {
      const result = await journalRetentionControls(
        db,
        journal ?? protectedRetentionControls(),
        targets.map((t) => t.targetId)
      );
      if (result.failed || result.pending) throw Error("Recovery pending");
    }
  } catch {
    throw new PortalError(
      503,
      "The change was recorded, but recovery protection is pending. Retry the same action to finish protecting it."
    );
  }
}
