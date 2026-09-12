import type { CommunityReport, PrismaClient } from "@prisma/client";
import { accountConfig } from "./account-config";
import { activityBudget } from "./account-limits";
import { activeRoleGrantWhere } from "./church-permissions";
import { commentVisibleWhere } from "./comment-policy";
import {
  communityReportReasons,
  communityReportTargets,
  type CommunityReportTarget
} from "./community-report-types";
import {
  postContext,
  postReadableWhere,
  withPostRead,
  type PostContext,
  type PostTx
} from "./post-access";
import { postField, postId } from "./post-input";
import { eligibleWhere, expected, PortalError } from "./portal-policy";
import { socialCommand, socialInput } from "./social-operations";
import { socialUserWhere } from "./social-policy";

type Target = {
  type: CommunityReportTarget;
  id: string;
  version: number;
  contextVersion: number;
  scopeChurchId: string | null;
};

function targetType(value: unknown): CommunityReportTarget {
  if (!communityReportTargets.includes(value as CommunityReportTarget))
    throw new PortalError(400, "Choose a supported report target.");
  return value as CommunityReportTarget;
}

async function eligibleActor(tx: PostTx, ownerId: string) {
  if (
    !(await tx.platformUser.findFirst({
      where: { id: ownerId, ...eligibleWhere },
      select: { id: true }
    }))
  )
    throw new PortalError(
      403,
      "Verify your email and confirm adult eligibility before submitting or reviewing a report."
    );
}

const churchScope = (post: {
  authorChurchId: string | null;
  audience: string;
  audienceChurchId: string | null;
}) =>
  post.authorChurchId ??
  (post.audience === "CHURCH" ? post.audienceChurchId : null);

// Review reads only this source metadata. Report evidence is the deliberately
// submitted context, never an automatic copy of a post, prayer, profile or file.
async function targetIn(
  tx: PostTx,
  context: PostContext,
  kind: unknown,
  value: unknown,
  review = false
): Promise<Target | null> {
  const type = targetType(kind),
    id = postId(value);
  if (type === "POST") {
    const row = await tx.platformPost.findFirst({
      where: { AND: [{ id }, ...(review ? [] : [postReadableWhere(context)])] },
      select: {
        id: true,
        version: true,
        authorChurchId: true,
        audience: true,
        audienceChurchId: true
      }
    });
    return (
      row && {
        type,
        id,
        version: row.version,
        contextVersion: 0,
        scopeChurchId: churchScope(row)
      }
    );
  }
  if (type === "COMMENT") {
    const row = await tx.platformPostComment.findFirst({
      where: {
        AND: [
          { id },
          ...(review
            ? []
            : [
                commentVisibleWhere(context),
                { post: postReadableWhere(context) }
              ])
        ]
      },
      select: {
        id: true,
        version: true,
        post: {
          select: {
            version: true,
            authorChurchId: true,
            audience: true,
            audienceChurchId: true
          }
        }
      }
    });
    return (
      row && {
        type,
        id,
        version: row.version,
        contextVersion: row.post.version,
        scopeChurchId: churchScope(row.post)
      }
    );
  }
  if (type === "PROFILE") {
    const row = await tx.platformUser.findFirst({
      where: { AND: [{ id }, ...(review ? [] : [socialUserWhere(context)])] },
      select: { presentation: { select: { version: true } } }
    });
    return (
      row && {
        type,
        id,
        version: row.presentation?.version ?? 0,
        contextVersion: 0,
        scopeChurchId: null
      }
    );
  }
  if (type === "CHURCH") {
    const row = await tx.church.findUnique({
      where: { id },
      select: { version: true, managementVersion: true }
    });
    return (
      row && {
        type,
        id,
        version: row.version,
        contextVersion: row.managementVersion,
        scopeChurchId: null
      }
    );
  }
  throw new PortalError(400, "Choose a supported report target.");
}

async function requireTarget(
  tx: PostTx,
  context: PostContext,
  kind: unknown,
  id: unknown
) {
  const target = await targetIn(tx, context, kind, id);
  if (!target)
    throw new PortalError(
      404,
      "This item is unavailable. No report was submitted."
    );
  return target;
}

function reportLimit() {
  const value = Number(process.env.COMMUNITY_REPORTS_PER_10_MINUTES ?? 5);
  return Number.isSafeInteger(value) && value >= 1 && value <= 50
    ? value
    : null;
}

async function intakeAvailable(tx: PostTx, target: Target) {
  if (
    process.env.COMMUNITY_REPORTS_ENABLED !== "true" ||
    reportLimit() === null
  )
    return false;
  if (!target.scopeChurchId)
    return !!(await tx.platformOperatorGrant.findFirst({
      where: {
        capability: "REVIEW_COMMUNITY_REPORTS",
        revokedAt: null,
        user: eligibleWhere
      },
      select: { id: true }
    }));
  const churchId = target.scopeChurchId;
  const direct = await tx.churchCapabilityGrant.findMany({
    where: {
      churchId,
      capability: "MODERATE_CHURCH_POSTS",
      revokedAt: null,
      user: {
        ...eligibleWhere,
        connections: { some: { churchId, state: "APPROVED" } }
      },
      OR: [
        { dependencyConnectionId: null },
        { dependency: { churchId, state: "APPROVED" } }
      ]
    },
    take: 101,
    select: { id: true, userId: true, dependency: { select: { userId: true } } }
  });
  if (
    direct.some(
      (grant) => !grant.dependency || grant.dependency.userId === grant.userId
    )
  )
    return true;
  return !!(await tx.churchRoleGrant.findFirst({
    where: {
      ...activeRoleGrantWhere(),
      churchId,
      capability: "MODERATE_CHURCH_POSTS"
    },
    select: { id: true }
  }));
}

async function requireReview(tx: PostTx, ownerId: string, id: unknown) {
  await eligibleActor(tx, ownerId);
  const report = await tx.communityReport.findUnique({
    where: { id: postId(id) }
  });
  if (!report) throw new PortalError(404, "This report is unavailable.");
  const context = await postContext(tx, ownerId);
  const source = await targetIn(
    tx,
    context,
    report.targetType,
    report.targetId,
    true
  );
  const scopes = new Set(
    [report.scopeChurchId, source?.scopeChurchId].filter(
      (scope): scope is string => !!scope
    )
  );
  if ([...scopes].some((scope) => !context.moderators.has(scope)))
    throw new PortalError(404, "This report is unavailable.");
  if (
    !report.scopeChurchId &&
    !(await tx.platformOperatorGrant.findFirst({
      where: {
        userId: ownerId,
        capability: "REVIEW_COMMUNITY_REPORTS",
        revokedAt: null
      },
      select: { id: true }
    }))
  )
    throw new PortalError(404, "This report is unavailable.");
  return report;
}

function receipt(report: CommunityReport) {
  return {
    id: report.id,
    target: { type: report.targetType, id: report.targetId },
    reason: report.reason,
    details: report.details,
    status: report.status,
    version: report.version,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
    ...(report.targetType === "CHURCH" && report.reason === "IMPERSONATION"
      ? {
          relatedReview: `/platform/church-claims/new?churchId=${encodeURIComponent(report.targetId)}`
        }
      : {})
  };
}

export function readCommunityReports(
  db: PrismaClient,
  token: unknown,
  query: Record<string, unknown>
) {
  socialInput(query, ["view", "id", "targetType", "targetId", "after"]);
  return withPostRead(db, token, async (tx, context) => {
    const ownerId = context.actorId;
    if (!ownerId)
      throw new PortalError(401, "Sign in to open your private reports.");
    if (query.view === "target") {
      await eligibleActor(tx, ownerId);
      const target = await requireTarget(
        tx,
        context,
        query.targetType,
        query.targetId
      );
      return { ownerId, target, available: await intakeAvailable(tx, target) };
    }
    if (query.view === "review") {
      const report = await requireReview(tx, ownerId, query.id);
      const decisions = await tx.communityReportDecision.findMany({
        where: { reportId: report.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 30,
        select: {
          fromStatus: true,
          toStatus: true,
          reason: true,
          version: true,
          createdAt: true
        }
      });
      return { ownerId, report: receipt(report), decisions };
    }
    if (query.view === "receipt") {
      const report = await tx.communityReport.findFirst({
        where: { id: postId(query.id), reporterId: ownerId }
      });
      if (!report)
        throw new PortalError(404, "This private receipt is unavailable.");
      return { ownerId, report: receipt(report) };
    }
    if (query.view !== undefined && query.view !== "mine")
      throw new PortalError(400, "Choose a supported report view.");
    const after = query.after ? postId(query.after) : null;
    if (
      after &&
      !(await tx.communityReport.findFirst({
        where: { id: after, reporterId: ownerId },
        select: { id: true }
      }))
    )
      throw new PortalError(409, "Refresh your private report list.");
    const rows = await tx.communityReport.findMany({
      where: { reporterId: ownerId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 31,
      ...(after ? { cursor: { id: after }, skip: 1 } : {})
    });
    return {
      ownerId,
      reports: rows.slice(0, 30).map(receipt),
      after: rows.length > 30 ? rows[29].id : null
    };
  });
}

export function communityReportCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  const resolving = input.operation === "resolve";
  if (!resolving && input.operation !== "create")
    throw new PortalError(400, "Choose a supported report action.");
  socialInput(
    input,
    resolving
      ? [
          "operation",
          "mutationId",
          "id",
          "expectedVersion",
          "resolution",
          "decisionReason"
        ]
      : [
          "operation",
          "mutationId",
          "targetType",
          "targetId",
          "expectedTargetVersion",
          "expectedContextVersion",
          "reason",
          "details"
        ]
  );
  let reviewed: CommunityReport | null = null;
  return socialCommand(
    db,
    token,
    "community-report",
    input,
    async (tx, ownerId) => {
      if (resolving) {
        const report = reviewed!;
        expected(input.expectedVersion, report.version);
        if (
          input.resolution !== "CLOSED" &&
          input.resolution !== "FOLLOW_UP_REQUIRED"
        )
          throw new PortalError(
            400,
            "Choose whether this review is closed or requires follow-up."
          );
        const reason = postField(input.decisionReason, 1000, 5);
        const updated = await tx.communityReport.update({
          where: { id: report.id },
          data: { status: input.resolution, version: { increment: 1 } }
        });
        await tx.communityReportDecision.create({
          data: {
            reportId: report.id,
            actorId: ownerId,
            fromStatus: report.status,
            toStatus: updated.status,
            reason,
            version: updated.version
          }
        });
        return {
          id: report.id,
          version: updated.version,
          message:
            "Report review recorded. No content or account permissions were changed."
        };
      }
      await eligibleActor(tx, ownerId);
      const target = await requireTarget(
        tx,
        await postContext(tx, ownerId),
        input.targetType,
        input.targetId
      );
      expected(input.expectedTargetVersion, target.version);
      expected(input.expectedContextVersion, target.contextVersion);
      if (
        typeof input.reason !== "string" ||
        !Object.hasOwn(communityReportReasons, input.reason)
      )
        throw new PortalError(400, "Choose a report reason.");
      const reason = input.reason as keyof typeof communityReportReasons;
      const details = postField(input.details ?? "", 2000);
      const duplicate = await tx.communityReport.findFirst({
        where: {
          reporterId: ownerId,
          targetType: target.type,
          targetId: target.id,
          targetVersion: target.version,
          contextVersion: target.contextVersion
        }
      });
      if (duplicate)
        return {
          id: duplicate.id,
          version: duplicate.version,
          message:
            "You already reported this version. Your original private receipt is available."
        };
      if (!(await intakeAvailable(tx, target)))
        throw new PortalError(
          503,
          "Reporting is unavailable for this item right now. Your report has not been submitted."
        );
      const maximum = reportLimit();
      if (maximum === null)
        throw new PortalError(
          503,
          "Reporting is temporarily unavailable. Your report has not been submitted."
        );
      const retryAfter = await activityBudget(
        tx,
        accountConfig().rateSecret,
        ownerId,
        "community-report",
        maximum,
        600
      );
      if (retryAfter)
        throw new PortalError(
          429,
          "You have reached the report limit. Keep your details and try again after the waiting period.",
          retryAfter
        );
      const report = await tx.communityReport.create({
        data: {
          reporterId: ownerId,
          targetType: target.type,
          targetId: target.id,
          targetVersion: target.version,
          contextVersion: target.contextVersion,
          scopeChurchId: target.scopeChurchId,
          reason,
          details
        }
      });
      return {
        id: report.id,
        version: report.version,
        message:
          "Report received. Your receipt is private; no automatic restriction was applied."
      };
    },
    resolving
      ? async (tx, ownerId) => {
          reviewed = await requireReview(tx, ownerId, input.id);
        }
      : undefined
  );
}
