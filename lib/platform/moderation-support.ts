import { Prisma } from "@prisma/client";
import { postContext, type PostTx } from "./post-access";
import { eligibleWhere, PortalError, expected } from "./portal-policy";
import { authorDecisionWhere } from "./content-moderation";
import {
  reportReviewAuthority,
  reviewReportJoins,
  reviewReportRows,
  reviewReportScope
} from "./community-report-review";
import { postField, postId } from "./post-input";
import { retentionDate } from "./messaging-retention";
import { recordReportControl } from "./retention-controls";
import { recordReportActivity } from "./report-activity";

export const CONTENT_RECONSIDERATION_NOTICE = "content-reconsideration-v1";
export type SupportActor = { id: string; eligible: boolean; adult: boolean };

export const supportVisibilityJoins = Prisma.sql`
    LEFT JOIN "CommunityReportDecision" d ON d.id=s."moderationDecisionId"
    LEFT JOIN "CommunityReport" r ON r.id=d."reportId"
    ${reviewReportJoins}`;

// Filter BOTH ordinary requests and report-linked appeals before pagination or
// selecting subjects/messages. A report grant never opens unrelated support.
export async function supportVisibilityScope(
  tx: PostTx,
  actor: SupportActor,
  grant: { id: string; version: number } | null,
  assigned = false,
  checkedReviewAuthority?: Parameters<typeof reviewReportScope>[0]
) {
  if (!actor.adult) return Prisma.sql`FALSE`;
  // The admin assigned-only projection already established this exact review
  // authority under its shared gate. Reuse it without loading author context;
  // requester/coordinator paths still load their own current context below.
  const context =
    assigned && checkedReviewAuthority
      ? null
      : await postContext(tx, actor.eligible ? actor.id : null);
  const authority =
    assigned && checkedReviewAuthority
      ? checkedReviewAuthority
      : await reportReviewAuthority(tx, context!);
  const ordinaryOwner = grant
    ? Prisma.sql`s."ownerGrantId" = ${grant.id} AND s."ownerGrantVersion" = ${grant.version}`
    : Prisma.sql`FALSE`;
  const ordinary = assigned
    ? ordinaryOwner
    : Prisma.sql`s."requesterId" = ${actor.id} OR (${ordinaryOwner}) OR (${actor.eligible} AND EXISTS (SELECT 1 FROM "SupportCoordinatorShare" share JOIN "ChurchContactAssignment" a ON a.id=share."appointmentId" WHERE share."caseId"=s.id AND share."revokedAt" IS NULL AND a."userId"=${actor.id}))`;
  const author = Prisma.sql`d."authorId" = ${actor.id} AND d."authorChurchId" IS NULL OR ${context?.publishers.size ? Prisma.sql`d."authorChurchId" IN (${Prisma.join([...context.publishers])})` : Prisma.sql`FALSE`}`;
  const reviewer = Prisma.sql`${actor.eligible} AND d."actorId"=${actor.id} AND (${reviewReportScope(authority)})`;
  const appeal = assigned
    ? reviewer
    : Prisma.sql`(${reviewer}) OR (${actor.eligible} AND s."requesterId"=${actor.id} AND (${author}))`;
  return Prisma.sql`((s."moderationDecisionId" IS NULL AND (${ordinary})) OR
      (s."moderationDecisionId" IS NOT NULL AND d.action IS NOT NULL AND (${appeal})
       AND NOT EXISTS (SELECT 1 FROM "RetentionPurge" purge WHERE purge.target='REPORT' AND purge."targetId"=r.id)))`;
}

export async function visibleSupportIds(
  tx: PostTx,
  actor: SupportActor,
  grant: { id: string; version: number } | null,
  options: { id?: string; page?: number; assigned?: boolean; feedbackOnly?: boolean } = {}
) {
  const scope = await supportVisibilityScope(
    tx,
    actor,
    grant,
    options.assigned
  );
  return tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT s.id FROM "SupportCase" s
    ${supportVisibilityJoins}
    WHERE ${scope}
      ${options.feedbackOnly ? Prisma.sql`AND s."requesterId"=${actor.id} AND EXISTS(SELECT 1 FROM "FeedbackSubmission" f WHERE f."caseId"=s.id)` : Prisma.empty}
      ${options.id ? Prisma.sql`AND s.id=${options.id}` : Prisma.empty}
    ORDER BY s."updatedAt" DESC, s.id DESC
    OFFSET ${(options.page ?? 0) * 20} LIMIT ${options.id ? 1 : 21}`);
}

const decisionFields = {
  id: true,
  actorId: true,
  reportId: true,
  version: true,
  report: { select: { version: true } },
  reconsideration: { select: { id: true, requesterId: true } }
} as const;
export async function activeContentReviewer(
  tx: PostTx,
  decision: { actorId: string; reportId: string }
) {
  const person = await tx.platformUser.findFirst({
    where: { id: decision.actorId, ...eligibleWhere },
    select: { id: true, name: true }
  });
  if (!person) return null;
  const scope = await reportReviewAuthority(
    tx,
    await postContext(tx, person.id)
  );
  return (
    await reviewReportRows(tx, scope, { id: decision.reportId, limit: 1 })
  ).length
    ? person
    : null;
}
export async function contentAppealOffer(
  tx: PostTx,
  actorId: string,
  decisionId: string
) {
  const context = await postContext(tx, actorId);
  const decision = await tx.communityReportDecision.findFirst({
    where: { AND: [{ id: postId(decisionId) }, authorDecisionWhere(context)] },
    select: decisionFields
  });
  if (
    !decision ||
    (await tx.retentionPurge.count({
      where: { target: "REPORT", targetId: decision.reportId }
    }))
  )
    throw new PortalError(404, "This content decision is unavailable.");
  const reviewer = await activeContentReviewer(tx, decision);
  return {
    decision,
    reviewer,
    offer: {
      available: !!reviewer && !decision.reconsideration,
      reviewerName: reviewer?.name ?? null,
      decisionVersion: decision.version,
      reportVersion: decision.report.version,
      notice: CONTENT_RECONSIDERATION_NOTICE,
      caseId:
        decision.reconsideration?.requesterId === actorId
          ? decision.reconsideration.id
          : null,
      alreadyRequested: !!decision.reconsideration,
      message: reviewer
        ? "This asks the assigned report reviewer to reconsider the decision and may be reviewed by the original decision maker. It is not independent review. Only your explanation and replies are shared in this help case. Reporter identity and private report notes are excluded."
        : "The assigned reviewer is not currently authorized for this decision. Reconsideration cannot be delivered to an active reviewer yet."
    }
  };
}
export async function prepareContentAppeal(
  tx: PostTx,
  actorId: string,
  input: Record<string, unknown>
) {
  if (
    !(await tx.platformUser.count({ where: { id: actorId, ...eligibleWhere } }))
  )
    throw new PortalError(
      403,
      "Verify your email and adult eligibility before requesting reconsideration."
    );
  const { decision, reviewer, offer } = await contentAppealOffer(
    tx,
    actorId,
    postId(input.decisionId)
  );
  if (decision.reconsideration)
    throw new PortalError(
      409,
      "Reconsideration was already requested. Open the existing help case from your decision notice."
    );
  if (!reviewer) throw new PortalError(503, offer.message);
  expected(input.decisionVersion, decision.version);
  expected(input.reportVersion, decision.report.version);
  if (input.notice !== CONTENT_RECONSIDERATION_NOTICE || input.consent !== true)
    throw new PortalError(
      400,
      "Confirm who will receive your explanation before requesting reconsideration."
    );
  return {
    requesterId: actorId,
    category: "ACCOUNT_WEBSITE" as const,
    subject: "Content decision reconsideration",
    description: postField(input.description, 3000, 10),
    moderationDecisionId: decision.id
  };
}
export async function contentSupportAccess(
  tx: PostTx,
  actorId: string,
  row: { requesterId: string; moderationDecisionId: string }
) {
  const context = await postContext(tx, actorId);
  const decision = await tx.communityReportDecision.findUniqueOrThrow({
    where: { id: row.moderationDecisionId },
    select: { id: true, actorId: true, reportId: true }
  });
  if (
    await tx.retentionPurge.count({
      where: { target: "REPORT", targetId: decision.reportId }
    })
  )
    throw new PortalError(404, "This content decision has expired.");
  const requester =
    row.requesterId === actorId &&
    !!(await tx.communityReportDecision.findFirst({
      where: { AND: [{ id: decision.id }, authorDecisionWhere(context)] },
      select: { id: true }
    }));
  const reviewer = await activeContentReviewer(tx, decision);
  return {
    requester,
    owner: reviewer?.id === actorId,
    coordinator: false,
    redact: false
  };
}
export async function updateAppealReport(
  tx: PostTx,
  decisionId: string,
  actorId: string,
  reopen: boolean,
  reason?: string
) {
  const decision = await tx.communityReportDecision.findUniqueOrThrow({
    where: { id: decisionId },
    select: { report: true }
  });
  const report = decision.report;
  if (
    await tx.retentionPurge.count({
      where: { target: "REPORT", targetId: report.id }
    })
  )
    throw new PortalError(404, "This content decision has expired.");
  const otherOpen =
    !reopen &&
    (await tx.supportCase.count({
      where: {
        moderationDecision: { reportId: report.id },
        status: { notIn: ["RESOLVED", "CLOSED"] }
      }
    }));
  const status = reopen || otherOpen ? "FOLLOW_UP_REQUIRED" : "CLOSED";
  const updated = await tx.communityReport.update({
    where: { id: report.id },
    data: {
      status,
      version: { increment: 1 },
      closedAt:
        status === "FOLLOW_UP_REQUIRED"
          ? null
          : (report.closedAt ?? new Date()),
      reviewDueAt: retentionDate(new Date(), 30)
    }
  });
  await recordReportControl(tx, updated, actorId);
  if (reopen) {
    const owner = await tx.communityReportDecision.findUniqueOrThrow({
      where: { id: decisionId },
      select: { actorId: true }
    });
    await recordReportActivity(tx, updated, true, owner.actorId);
  } else
    await tx.communityReportDecision.create({
      data: {
        reportId: report.id,
        actorId,
        fromStatus: report.status,
        toStatus: status,
        reason: reason!,
        version: updated.version
      }
    });
}
