import type { Prisma } from "@prisma/client";
import { postContext, postReadableWhere } from "./post-access";

export async function exportVolunteerApplications(
  tx: Prisma.TransactionClient,
  userId: string,
  limit: number
) {
  const rows = await tx.volunteerApplication.findMany({
    where: { userId },
    orderBy: { id: "asc" },
    take: limit + 1,
    include: {
      signup: { select: { state: true, completedAt: true } },
      events: {
        orderBy: { version: "desc" },
        take: 20,
        select: { action: true, version: true, createdAt: true, note: true }
      }
    }
  });
  const context = await postContext(tx, userId);
  const sources = context.eligible
    ? await tx.volunteerOpportunity.findMany({
        where: {
          id: {
            in: rows.flatMap((row) =>
              row.opportunityId ? [row.opportunityId] : []
            )
          },
          recoveryRequired: false,
          post: {
            AND: [
              postReadableWhere(context),
              {
                OR: [
                  { audienceChurchId: null },
                  { audienceChurchId: { in: context.churches } }
                ]
              },
              {
                OR: [
                  { groupId: null },
                  { groupId: { in: [...(context.groupParticipants ?? [])] } }
                ]
              },
              {
                OR: [
                  { topicCommunityId: null },
                  {
                    topicCommunityId: {
                      in: [...(context.topicParticipants ?? [])]
                    }
                  }
                ]
              }
            ]
          }
        },
        select: { id: true }
      })
    : [];
  const visible = new Set(sources.map((row) => row.id));
  return rows.map((row) => {
    const current =
      !row.recoveryRequired &&
      !!row.opportunityId &&
      visible.has(row.opportunityId);
    return {
      id: row.id,
      state: row.state,
      version: row.version,
      // Timed completion remains on the canonical signup exported separately.
      // These are this applicant's own retained choices, never a profile grant.
      completedAt: row.completedAt,
      completionVersion: row.completionVersion,
      completionNote:
        current && !row.serviceRecoveryRequired ? row.completionNote : "",
      serviceVersion: row.serviceVersion,
      serviceSharedAt: row.serviceSharedAt,
      serviceSharedCompletionVersion: row.serviceSharedCompletionVersion,
      serviceRecoveryRequired: row.serviceRecoveryRequired,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      current,
      statement: current ? row.statement : "",
      availability:
        current &&
        ["SUBMITTED", "ACCEPTED"].includes(row.state) &&
        row.signup?.state !== "CANCELED" &&
        !row.completedAt &&
        !row.signup?.completedAt
          ? row.availability
          : "",
      decisionNote: current ? row.decisionNote : "",
      // Only this applicant's own receipt; no church roster, contact, source
      // logistics, other applicants, reviewer identity or authority grants.
      history: current
        ? row.events
            .filter(
              (event) =>
                !row.serviceRecoveryRequired ||
                !["COMPLETED", "COMPLETION_CORRECTED"].includes(event.action)
            )
            .toReversed()
        : []
    };
  });
}

// Account erasure is already covered by its protected account-deletion journal.
// Retain a minimal anonymous operational receipt for completed church help,
// including its occupied canonical place; never retain the application answers.
export async function eraseVolunteerApplications(
  tx: Prisma.TransactionClient,
  userId: string
) {
  await tx.volunteerApplicationEvent.updateMany({
    where: { OR: [{ application: { userId } }, { actorId: userId }] },
    data: { actorId: null, note: "" }
  });
  await tx.postVolunteerSignup.updateMany({
    where: {
      userId,
      application: { isNot: null },
      completedAt: null,
      state: "ACTIVE"
    },
    data: { state: "CANCELED", version: { increment: 1 } }
  });
  await tx.volunteerApplication.updateMany({
    where: {
      userId,
      OR: [
        { signupId: null, completedAt: null },
        { signup: { completedAt: null } }
      ]
    },
    data: { state: "WITHDRAWN" }
  });
  await tx.postVolunteerSignup.updateMany({
    where: {
      userId,
      OR: [
        { serviceRecoveryRequired: false },
        { completionNote: { not: "" } },
        { serviceSharedAt: { not: null } },
        { serviceSharedCompletionVersion: { not: null } }
      ]
    },
    data: {
      completionNote: "",
      serviceSharedAt: null,
      serviceSharedCompletionVersion: null,
      serviceRecoveryRequired: true,
      serviceVersion: { increment: 1 }
    }
  });
  await tx.volunteerApplication.updateMany({
    where: { userId },
    data: {
      userId: null,
      statement: "",
      availability: "",
      decisionNote: "",
      completionNote: "",
      serviceSharedAt: null,
      serviceSharedCompletionVersion: null,
      serviceRecoveryRequired: true,
      serviceVersion: { increment: 1 },
      recoveryRequired: true,
      version: { increment: 1 }
    }
  });
}
