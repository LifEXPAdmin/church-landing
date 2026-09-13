import type {
  CommunityReport,
  CommunityReportDecision,
  Prisma
} from "@prisma/client";
import { eligibleWhere } from "./portal-policy";
import { activeRoleGrantWhere } from "./church-permissions";
import {
  reportReviewAuthority,
  reviewReportRows
} from "./community-report-review";
import { postContext } from "./post-access";
import { enqueueNotification } from "./notification-outbox";
async function churchRecipients(
  tx: Prisma.TransactionClient,
  churchId: string,
  capability: "MODERATE_CHURCH_POSTS" | "PUBLISH_CHURCH_POSTS"
) {
  const direct = await tx.churchCapabilityGrant.findMany({
    where: {
      churchId: churchId,
      capability: capability,
      revokedAt: null,
      user: eligibleWhere
    },
    select: { userId: true },
    take: 100
  });
  const roles = await tx.churchRoleGrant.findMany({
    where: {
      ...activeRoleGrantWhere(),
      churchId: churchId,
      capability: capability
    },
    select: {
      assignment: { select: { connection: { select: { userId: true } } } }
    },
    take: 100
  });
  return [
    ...direct.map((row) => row.userId),
    ...roles.map((row) => row.assignment.connection.userId)
  ];
}

export async function recordReportActivity(
  tx: Prisma.TransactionClient,
  report: CommunityReport,
  reconsideration = false,
  assignedReviewerId?: string
) {
  let recipients: string[];
  if (!report.scopeChurchId)
    recipients = (
      await tx.platformOperatorGrant.findMany({
        where: {
          capability: "REVIEW_COMMUNITY_REPORTS",
          revokedAt: null,
          user: eligibleWhere
        },
        select: { userId: true },
        take: 100
      })
    ).map((row) => row.userId);
  else
    recipients = await churchRecipients(
      tx,
      report.scopeChurchId,
      "MODERATE_CHURCH_POSTS"
    );
  for (const recipientId of new Set(recipients)) {
    if (assignedReviewerId && assignedReviewerId !== recipientId) continue;
    const authority = await reportReviewAuthority(
      tx,
      await postContext(tx, recipientId)
    );
    if (
      !(
        await reviewReportRows(tx, authority, {
          id: report.id,
          status: "OPEN",
          limit: 1
        })
      ).length
    )
      continue;
    const event = await tx.socialEvent.create({
      data: {
        key: reconsideration
          ? `report:${report.id}:reconsideration:${report.version}:${recipientId}`
          : `report:${report.id}:${recipientId}`,
        kind: reconsideration ? "REPORT_RECONSIDERATION" : "REPORT_RECEIVED",
        actorId: report.reporterId,
        recipientId,
        reportId: report.id,
        createdAt: reconsideration ? report.updatedAt : report.createdAt
      }
    });
    await enqueueNotification(tx, event);
  }
}

export async function recordContentDecisionActivity(
  tx: Prisma.TransactionClient,
  decision: CommunityReportDecision
) {
  const recipients = decision.authorChurchId
    ? await churchRecipients(
        tx,
        decision.authorChurchId,
        "PUBLISH_CHURCH_POSTS"
      )
    : decision.authorId
      ? [decision.authorId]
      : [];
  for (const recipientId of new Set(recipients)) {
    if (
      !(await tx.platformUser.count({
        where: { id: recipientId, ...eligibleWhere }
      }))
    )
      continue;
    if (
      decision.authorChurchId &&
      !(await postContext(tx, recipientId)).publishers.has(
        decision.authorChurchId
      )
    )
      continue;
    const event = await tx.socialEvent.create({
      data: {
        key: `content-decision:${decision.id}:${recipientId}`,
        kind: "CONTENT_DECISION",
        actorId: decision.actorId,
        recipientId,
        reportId: decision.reportId,
        decisionId: decision.id,
        createdAt: decision.createdAt
      }
    });
    await enqueueNotification(tx, event);
  }
}
