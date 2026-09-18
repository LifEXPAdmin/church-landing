import type {
  CommunityReport,
  CommunityReportDecision,
  Prisma
} from "@prisma/client";
import type { ChurchCapability } from "@prisma/client";
import { authorDecisionWhere } from "./content-moderation";
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
  capability: ChurchCapability
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
      report.targetType === "EXCHANGE_LISTING"
        ? "MODERATE_EXCHANGE_LISTINGS"
        : "MODERATE_CHURCH_POSTS"
    );
  if (report.scopeTopicId && report.targetType !== "TOPIC") {
    const topic = await tx.topicCommunity.findUnique({
      where: { id: report.scopeTopicId },
      select: { ownerId: true }
    });
    const managers = await tx.topicMembership.findMany({
      where: {
        communityId: report.scopeTopicId,
        joined: true,
        restrictedAt: null,
        user: eligibleWhere,
        OR: [{ moderator: true }, { userId: topic?.ownerId ?? "" }]
      },
      select: { userId: true },
      take: 21
    });
    recipients.push(...managers.map((row) => row.userId));
  }
  if (report.scopeGroupId && report.targetType !== "GROUP") {
    const leaders = await tx.gatherGroupMembership.findMany({
      where: { groupId: report.scopeGroupId, state: "ACTIVE", leader: true },
      select: { userId: true },
      take: 21
    });
    recipients.push(...leaders.map((row) => row.userId));
  }
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
  const report = await tx.communityReport.findUniqueOrThrow({
    where: { id: decision.reportId },
    select: { targetType: true }
  });
  const recipients = decision.authorChurchId
    ? await churchRecipients(
        tx,
        decision.authorChurchId,
        report.targetType === "EXCHANGE_LISTING"
          ? "MANAGE_EXCHANGE_LISTINGS"
          : "PUBLISH_CHURCH_POSTS"
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
      !(await tx.communityReportDecision.count({
        where: {
          AND: [
            { id: decision.id },
            await authorDecisionWhere(tx, await postContext(tx, recipientId))
          ]
        }
      }))
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
