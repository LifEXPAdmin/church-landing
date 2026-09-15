import { Prisma } from "@prisma/client";
import type { CommunityReport } from "@prisma/client";
import type { PostContext, PostTx } from "./post-access";
import { eligibleWhere } from "./portal-policy";

export async function reportReviewAuthority(tx: PostTx, context: PostContext) {
  return {
    churches: [...context.moderators],
    topics: [...(context.topicModerators ?? [])],
    global: !!(
      context.actorId &&
      (await tx.platformOperatorGrant.findFirst({
        where: {
          userId: context.actorId,
          capability: "REVIEW_COMMUNITY_REPORTS",
          revokedAt: null,
          user: eligibleWhere
        },
        select: { id: true }
      }))
    )
  };
}
export type ReportReviewAuthority = Awaited<
  ReturnType<typeof reportReviewAuthority>
>;
export type ReviewRow = Pick<
  CommunityReport,
  | "id"
  | "targetType"
  | "reason"
  | "status"
  | "version"
  | "createdAt"
  | "updatedAt"
  | "scopeChurchId"
  | "scopeTopicId"
>;

// SQL aliases r (report), c (comment), p (post) are shared by the review
// queue and support appeal authorization. Neither path selects private bodies.
export const reviewReportJoins = Prisma.sql`
    LEFT JOIN "PlatformPostComment" c ON r."targetType" = 'COMMENT' AND c.id = r."targetId"
    LEFT JOIN "PlatformPost" p ON p.id = CASE
      WHEN r."targetType" = 'POST' THEN r."targetId"
      WHEN r."targetType" = 'COMMENT' THEN c."postId" END
`;
export function reviewReportScope(authority: ReportReviewAuthority) {
  const original = Prisma.sql`(
    (${authority.global} AND r."scopeChurchId" IS NULL) OR
    ${
      authority.churches.length
        ? Prisma.sql`r."scopeChurchId" IN (${Prisma.join(authority.churches)})`
        : Prisma.sql`FALSE`
    } OR ${
      authority.topics.length
        ? Prisma.sql`(r."scopeTopicId" IN (${Prisma.join(authority.topics)}) AND r."targetType" IN ('POST','COMMENT') AND r."scopeChurchId" IS NULL)`
        : Prisma.sql`FALSE`
    })`;
  const currentScope = Prisma.sql`coalesce(p."authorChurchId",
    CASE WHEN p.audience = 'CHURCH' THEN p."audienceChurchId" END)`;
  const currentTopic = Prisma.sql`CASE WHEN r."targetType" = 'TOPIC' THEN r."targetId" ELSE p."topicCommunityId" END`;
  return Prisma.sql`${original}
      AND (${authority.global} OR ${currentTopic} IS NULL OR ${
        authority.topics.length
          ? Prisma.sql`${currentTopic} IN (${Prisma.join(authority.topics)})`
          : Prisma.sql`FALSE`
      })
      AND NOT EXISTS (SELECT 1 FROM "RetentionPurge" purge WHERE purge.target = 'REPORT' AND purge."targetId" = r.id)
      AND (${currentScope} IS NULL OR ${
        authority.churches.length
          ? Prisma.sql`${currentScope} IN (${Prisma.join(authority.churches)})`
          : Prisma.sql`FALSE`
      })`;
}

// One permission predicate serves queue pages, cursor validation and individual
// decisions. Filter original AND current source scopes before pagination. No
// reporter details or source body is read by this query. Cursor time is explicitly
// UTC wall time, matching Prisma timestamp columns regardless of database zone.
export function reviewReportRows(
  tx: PostTx,
  authority: ReportReviewAuthority,
  options: {
    id?: string;
    ids?: string[];
    status?: "OPEN" | "CLOSED";
    after?: { id: string; createdAt: Date };
    limit: number;
  }
) {
  return tx.$queryRaw<ReviewRow[]>(Prisma.sql`
    SELECT r.id, r."targetType", r.reason, r.status, r.version,
      r."createdAt", r."updatedAt", r."scopeChurchId", r."scopeTopicId"
    FROM "CommunityReport" r
    ${reviewReportJoins}
    WHERE ${reviewReportScope(authority)}
      ${options.id ? Prisma.sql`AND r.id = ${options.id}` : Prisma.empty}
      ${options.ids ? (options.ids.length ? Prisma.sql`AND r.id IN (${Prisma.join(options.ids)})` : Prisma.sql`AND FALSE`) : Prisma.empty}
      ${
        options.status === "CLOSED"
          ? Prisma.sql`AND r.status = 'CLOSED'`
          : options.status === "OPEN"
            ? Prisma.sql`AND r.status IN ('RECEIVED', 'FOLLOW_UP_REQUIRED')`
            : Prisma.empty
      }
      ${options.after ? Prisma.sql`AND (r."createdAt", r.id) < (${options.after.createdAt.toISOString()}::timestamp, ${options.after.id})` : Prisma.empty}
    ORDER BY r."createdAt" DESC, r.id DESC LIMIT ${options.limit}
  `);
}
