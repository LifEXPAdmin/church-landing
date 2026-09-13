import type { CommunityReport, Prisma } from "@prisma/client";
import { eligibleWhere } from "./portal-policy";
import { activeRoleGrantWhere } from "./church-permissions";
import {
  reportReviewAuthority,
  reviewReportRows
} from "./community-report-review";
import { postContext } from "./post-access";
import { enqueueNotification } from "./notification-outbox";
export async function recordReportActivity(
  tx: Prisma.TransactionClient,
  report: CommunityReport
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
  else {
    const direct = await tx.churchCapabilityGrant.findMany({
      where: {
        churchId: report.scopeChurchId,
        capability: "MODERATE_CHURCH_POSTS",
        revokedAt: null,
        user: eligibleWhere
      },
      select: { userId: true },
      take: 100
    });
    const roles = await tx.churchRoleGrant.findMany({
      where: {
        ...activeRoleGrantWhere(),
        churchId: report.scopeChurchId,
        capability: "MODERATE_CHURCH_POSTS"
      },
      select: {
        assignment: { select: { connection: { select: { userId: true } } } }
      },
      take: 100
    });
    recipients = [
      ...direct.map((row) => row.userId),
      ...roles.map((row) => row.assignment.connection.userId)
    ];
  }
  for (const recipientId of new Set(recipients)) {
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
        key: `report:${report.id}:${recipientId}`,
        kind: "REPORT_RECEIVED",
        actorId: report.reporterId,
        recipientId,
        reportId: report.id,
        createdAt: report.createdAt
      }
    });
    await enqueueNotification(tx, event);
  }
}
