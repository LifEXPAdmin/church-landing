import type { Prisma } from "@prisma/client";
import { postContext, postReadableWhere } from "./post-access";

type ExportServiceRow = {
  id: string;
  serviceVersion: number;
  serviceRecoveryRequired: boolean;
};
async function quarantinedServices(
  tx: Prisma.TransactionClient,
  userId: string,
  kind: "VOLUNTEER_SERVICE_SIGNUP" | "VOLUNTEER_SERVICE_APPLICATION",
  rows: ExportServiceRow[]
) {
  if (!rows.length) return new Set<string>();
  // A restored older row may not carry its quarantine flag yet. Group only
  // this bounded export's sources and this owner's controls, never journal
  // contents or another owner's decisions.
  const controls = await tx.retentionControl.groupBy({
    by: ["sourceId"],
    where: {
      kind,
      targetId: userId,
      sourceId: { in: rows.map((row) => row.id) }
    },
    _max: { version: true }
  });
  const latest = new Map(
    controls.map((row) => [row.sourceId, row._max.version ?? -1])
  );
  return new Set(
    rows
      .filter(
        (row) =>
          row.serviceRecoveryRequired ||
          (latest.get(row.id) ?? -1) > row.serviceVersion
      )
      .map((row) => row.id)
  );
}

export async function exportVolunteerSignups(
  tx: Prisma.TransactionClient,
  userId: string,
  limit: number
) {
  const rows = await tx.postVolunteerSignup.findMany({
    where: { userId },
    orderBy: { id: "asc" },
    take: limit + 1,
    select: {
      id: true,
      slotId: true,
      state: true,
      completedAt: true,
      version: true,
      eventVersion: true,
      occurrenceVersion: true,
      completionVersion: true,
      serviceVersion: true,
      serviceSharedAt: true,
      serviceSharedCompletionVersion: true,
      serviceRecoveryRequired: true,
      updatedAt: true
    }
  });
  const quarantined = await quarantinedServices(
    tx,
    userId,
    "VOLUNTEER_SERVICE_SIGNUP",
    rows
  );
  return rows.map((row) => ({
    ...row,
    serviceSharedAt: quarantined.has(row.id) ? null : row.serviceSharedAt,
    serviceSharedCompletionVersion: quarantined.has(row.id)
      ? null
      : row.serviceSharedCompletionVersion,
    serviceRecoveryRequired: quarantined.has(row.id)
  }));
}

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
      signup: {
        select: {
          id: true,
          state: true,
          completedAt: true,
          serviceVersion: true,
          serviceRecoveryRequired: true
        }
      },
      events: {
        orderBy: { version: "desc" },
        take: 20,
        select: { action: true, version: true, createdAt: true, note: true }
      }
    }
  });
  const protectedApplications = await quarantinedServices(
    tx,
    userId,
    "VOLUNTEER_SERVICE_APPLICATION",
    rows
  );
  const protectedSignups = await quarantinedServices(
    tx,
    userId,
    "VOLUNTEER_SERVICE_SIGNUP",
    rows.flatMap((row) => (row.signup ? [row.signup] : []))
  );
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
    const serviceRecoveryRequired =
      protectedApplications.has(row.id) ||
      !!(row.signup && protectedSignups.has(row.signup.id));
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
        current && !serviceRecoveryRequired ? row.completionNote : "",
      serviceVersion: row.serviceVersion,
      serviceSharedAt: serviceRecoveryRequired ? null : row.serviceSharedAt,
      serviceSharedCompletionVersion: serviceRecoveryRequired
        ? null
        : row.serviceSharedCompletionVersion,
      serviceRecoveryRequired,
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
                !serviceRecoveryRequired ||
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
