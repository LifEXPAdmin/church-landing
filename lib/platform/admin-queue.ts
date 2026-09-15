import { Prisma, type PrismaClient } from "@prisma/client";
import {
  supportVisibilityJoins,
  supportVisibilityScope
} from "./moderation-support";
import {
  reviewReportJoins,
  reviewReportScope
} from "./community-report-review";
import { claimScopes } from "./church-claim-data";
import { ADULT_POLICY } from "./portal-types";
import {
  withAdmin,
  adminAuthority,
  adminDenied,
  type AdminAuthority,
  type AdminTx
} from "./admin-authority";
import {
  adminCursor,
  adminFilters,
  encodeAdminCursor,
  type AdminCursor
} from "./admin-input";
import type {
  AdminQueueFilters,
  AdminQueueRow,
  AdminQueueSnapshot,
  AdminSource
} from "./admin-types";
import { PortalError } from "./portal-policy";

type RawRow = Omit<AdminQueueRow, "createdAt" | "updatedAt" | "reminderAt"> & {
  createdAt: Date;
  updatedAt: Date;
  reminderAt: Date | null;
};
const rowOut = (r: RawRow): AdminQueueRow => ({
  ...r,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
  reminderAt: r.reminderAt?.toISOString() ?? null
});

// A routing-only operator sees only the existing unassigned ordinary-case
// metadata. An expired grant is effectively unassigned without a read mutation.
const activeOwnerJoin = Prisma.sql`LEFT JOIN "SupportCapabilityGrant" g ON g.id=s."ownerGrantId" AND g.version=s."ownerGrantVersion" AND g.capability='RESPOND' AND g."revokedAt" IS NULL
  LEFT JOIN "PlatformUser" owner ON owner.id=g."userId" AND owner."suspendedAt" IS NULL AND owner."deactivatedAt" IS NULL
    AND owner."emailVerifiedAt" IS NOT NULL AND owner."adultAcknowledgedAt" IS NOT NULL AND owner."adultPolicyVersion"=${ADULT_POLICY}`;
function claimScope(a: AdminAuthority) {
  const churchIds = [
    ...new Set(
      a.churches
        .filter((g) => g.capability === "MANAGE_CHURCH_ACCESS")
        .map((g) => g.churchId)
    )
  ];
  const scopes = churchIds.map((id) => {
    const missing = Object.keys(claimScopes).filter(
      (scope) =>
        !a.churches.some((g) => g.churchId === id && g.capability === scope)
    );
    return Prisma.sql`(c."churchId"=${id} AND c.kind='ACCESS' ${missing.length ? Prisma.sql`AND NOT (c.scopes::text[] && ARRAY[${Prisma.join(missing)}]::text[])` : Prisma.empty})`;
  });
  return Prisma.sql`c."submittedAt" IS NOT NULL AND c.status NOT IN ('DRAFT','WITHDRAWN') AND c."ownerId"<>${a.actor.id}
    AND (${a.capabilities.has("REVIEW_CHURCH_CLAIMS")} OR ${scopes.length ? Prisma.join(scopes, " OR ") : Prisma.sql`FALSE`})`;
}

function queueFilters(f: AdminQueueFilters, actorId: string, asOf: Date) {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`q."createdAt"<=${asOf.toISOString()}::timestamp`
  ];
  if (f.type === "FEEDBACK")
    clauses.push(
      Prisma.sql`q."sourceType"='SUPPORT' AND EXISTS (SELECT 1 FROM "FeedbackSubmission" f WHERE f."caseId"=q."sourceId")`
    );
  else if (f.type === "BUG")
    clauses.push(
      Prisma.sql`q."sourceType"='SUPPORT' AND q.category='ACCOUNT_WEBSITE'`
    );
  else if (f.type === "SUGGESTION")
    clauses.push(
      Prisma.sql`q."sourceType"='SUPPORT' AND q.category='FEATURE_SUGGESTION'`
    );
  else if (f.type !== "ALL") clauses.push(Prisma.sql`q."sourceType"=${f.type}`);
  if (f.state === "OPEN")
    clauses.push(Prisma.sql`q.state NOT IN ('RESOLVED','CLOSED')`);
  else if (f.state !== "ALL") clauses.push(Prisma.sql`q.state=${f.state}`);
  if (f.priority !== "ALL") clauses.push(Prisma.sql`q.priority=${f.priority}`);
  if (f.owner === "ME") clauses.push(Prisma.sql`q."ownerId"=${actorId}`);
  if (f.owner === "UNASSIGNED") clauses.push(Prisma.sql`q."ownerId" IS NULL`);
  if (f.churchId) clauses.push(Prisma.sql`q."churchId"=${f.churchId}`);
  if (f.topicId) clauses.push(Prisma.sql`q."topicId"=${f.topicId}`);
  if (f.q) {
    const query = "%" + f.q.replace(/[\\%_]/g, "\\$&") + "%";
    clauses.push(
      Prisma.sql`(q.title ILIKE ${query} OR q."sourceId" ILIKE ${query})`
    );
  }
  if (f.tag) clauses.push(Prisma.sql`${f.tag}=ANY(q.tags)`);
  if (f.age !== "ALL")
    clauses.push(
      Prisma.sql`q."createdAt"<=${new Date(asOf.getTime() - Number(f.age) * 86400000).toISOString()}::timestamp`
    );
  if (f.due)
    clauses.push(
      Prisma.sql`q."reminderAt" IS NOT NULL AND q."reminderAt"<=${asOf.toISOString()}::timestamp`
    );
  return Prisma.join(
    clauses.map((c) => Prisma.sql`(${c})`),
    " AND "
  );
}

async function adminQueueData(
  tx: AdminTx,
  a: AdminAuthority,
  filters: AdminQueueFilters,
  options: {
    after?: AdminCursor | null;
    asOf?: Date;
    source?: AdminSource;
    limit?: number;
    groupId?: string;
    summary?: boolean;
  } = {}
) {
  if (!a.canQueue) throw adminDenied();
  const scope = await supportVisibilityScope(
    tx,
    { id: a.actor.id, adult: true, eligible: true },
    a.respond,
    true,
    a.reports
  );
  const routing = Prisma.sql`${!!a.assign} AND s."moderationDecisionId" IS NULL AND owner.id IS NULL AND s.status NOT IN ('RESOLVED','CLOSED')`;
  const asOf = options.asOf ?? new Date();
  const supportOnly =
    options.source?.sourceType === "SUPPORT" ||
    ["SUPPORT", "BUG", "SUGGESTION", "FEEDBACK"].includes(filters.type);
  const assigned = supportOnly
    ? []
    : await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT DISTINCT id FROM (
    SELECT r."assignedReviewerId" AS id FROM "CommunityReport" r ${reviewReportJoins}
      WHERE r."assignedReviewerId" IS NOT NULL AND ${reviewReportScope(a.reports)} ${options.source ? Prisma.sql`AND ${options.source.sourceType === "REPORT"} AND r.id=${options.source.sourceId}` : Prisma.empty}
    UNION SELECT c."assignedReviewerId" AS id FROM "ChurchClaim" c
      WHERE c."assignedReviewerId" IS NOT NULL AND ${claimScope(a)} ${options.source ? Prisma.sql`AND ${options.source.sourceType === "CLAIM"} AND c.id=${options.source.sourceId}` : Prisma.empty}
    ) assigned LIMIT 101`);
  if (assigned.length > 100)
    throw new PortalError(
      503,
      "These reviewer assignments need a scope-size review before loading."
    );
  const currentReviewers: AdminAuthority[] = [];
  for (const assignedUser of assigned) {
    if (assignedUser.id === a.actor.id) currentReviewers.push(a);
    else
      try {
        currentReviewers.push(await adminAuthority(tx, assignedUser.id));
      } catch (error) {
        if (!(error instanceof PortalError) || error.status !== 404)
          throw error;
      }
  }
  const reportOwners = currentReviewers.map(
    (owner) =>
      Prisma.sql`(r."assignedReviewerId"=${owner.actor.id} AND r."assignedReviewerProof"=${owner.assignmentProof} AND ${reviewReportScope(owner.reports)})`
  );
  const claimOwners = currentReviewers.map(
    (owner) =>
      Prisma.sql`(c."assignedReviewerId"=${owner.actor.id} AND c."assignedReviewerProof"=${owner.assignmentProof} AND ${claimScope(owner)})`
  );
  const sourceQuery = Prisma.sql`
    WITH q AS (
      SELECT 'SUPPORT'::text AS "sourceType",s.id AS "sourceId",
        CASE WHEN ${scope} THEN s.subject ELSE 'Unassigned ordinary help request' END AS title,
        s.category::text AS category,s.status::text AS "nativeStatus",s.version,
        CASE WHEN s.status='WAITING_FOR_REQUESTER' THEN 'WAITING_REQUESTER' WHEN s.status='RESOLVED' THEN 'RESOLVED'
          WHEN s.status='CLOSED' THEN 'CLOSED' WHEN s.status='IN_PROGRESS' THEN 'WAITING_TEAM'
          WHEN owner.id IS NOT NULL OR s."moderationDecisionId" IS NOT NULL THEN 'ASSIGNED' ELSE 'NEW' END AS state,
        s.priority::text AS priority,CASE WHEN ${scope} THEN s."nextAction" ELSE '' END AS "nextAction",
        CASE WHEN ${scope} THEN s."triageTags" ELSE ARRAY[]::text[] END AS tags,
        CASE WHEN s."moderationDecisionId" IS NOT NULL THEN d."actorId" ELSE owner.id END AS "ownerId",
        CASE WHEN s."moderationDecisionId" IS NOT NULL THEN reviewer.name ELSE owner.name END AS "ownerName",
        s."churchId",NULL::text AS "topicId",s."createdAt",s."updatedAt",s."reminderAt",s."adminGroupId",
        (${scope}) AS "canRead",(${scope}) AS "canTriage"
      FROM "SupportCase" s ${supportVisibilityJoins} ${activeOwnerJoin}
      LEFT JOIN "PlatformUser" reviewer ON reviewer.id=d."actorId"
      WHERE (${scope}) OR (${routing})
      UNION ALL
      SELECT 'REPORT',r.id,r."targetType"::text || ' report',r."targetType"::text,r.status::text,r.version,
        CASE WHEN r.status='CLOSED' THEN 'CLOSED' WHEN r.status='FOLLOW_UP_REQUIRED' THEN 'WAITING_TEAM'
          WHEN reviewer.id IS NOT NULL THEN 'ASSIGNED' ELSE 'NEW' END,
        r.priority::text,r."nextAction",r."triageTags",reviewer.id,reviewer.name,
        r."scopeChurchId",r."scopeTopicId",r."createdAt",r."updatedAt",r."reminderAt",r."adminGroupId",TRUE,TRUE
      FROM "CommunityReport" r ${reviewReportJoins}
      LEFT JOIN "PlatformUser" reviewer ON reviewer.id=r."assignedReviewerId" AND (${reportOwners.length ? Prisma.join(reportOwners, " OR ") : Prisma.sql`FALSE`})
      WHERE ${reviewReportScope(a.reports)}
      UNION ALL
      SELECT 'CLAIM',c.id,'Church ' || lower(c.kind) || ' request',c.kind,c.status::text,c.version,
        CASE WHEN c.status IN ('APPROVED','REJECTED','REVOKED') THEN 'CLOSED' WHEN c.status='NEEDS_INFORMATION' THEN 'WAITING_REQUESTER'
          WHEN reviewer.id IS NOT NULL THEN 'ASSIGNED' ELSE 'NEW' END,
        c.priority::text,c."nextAction",c."triageTags",reviewer.id,reviewer.name,
        c."churchId",NULL,c."createdAt",c."updatedAt",c."reminderAt",c."adminGroupId",TRUE,TRUE
      FROM "ChurchClaim" c LEFT JOIN "PlatformUser" reviewer ON reviewer.id=c."assignedReviewerId" AND (${claimOwners.length ? Prisma.join(claimOwners, " OR ") : Prisma.sql`FALSE`})
      WHERE ${claimScope(a)}
    )`;
  const scoped = Prisma.sql`    FROM q WHERE ${queueFilters(filters, a.actor.id, asOf)}
      ${options.source ? Prisma.sql`AND q."sourceType"=${options.source.sourceType} AND q."sourceId"=${options.source.sourceId}` : Prisma.empty}
      ${options.groupId ? Prisma.sql`AND q."adminGroupId"=${options.groupId}` : Prisma.empty}
      ${options.after ? Prisma.sql`AND (q."createdAt",q."sourceId",q."sourceType") < (${options.after.at}::timestamp,${options.after.id},${options.after.type})` : Prisma.empty}`;
  if (options.summary) {
    const [counts] = await tx.$queryRaw<
      AdminQueueCounts[]
    >(Prisma.sql`${sourceQuery}
      SELECT count(*)::int AS open,
        count(*) FILTER (WHERE q."ownerId" IS NULL)::int AS unassigned,
        count(*) FILTER (WHERE q.priority='URGENT')::int AS urgent,
        count(*) FILTER (WHERE q."reminderAt"<=${asOf.toISOString()}::timestamp)::int AS due,
        count(*) FILTER (WHERE q."createdAt"<=${new Date(asOf.getTime() - 7 * 86400000).toISOString()}::timestamp)::int AS aged,
        count(*) FILTER (WHERE q."sourceType"='CLAIM')::int AS claims ${scoped}`);
    if (!counts)
      throw new PortalError(503, "Current request counts are unavailable.");
    return { rows: [] as AdminQueueRow[], counts };
  }
  const rows = await tx.$queryRaw<RawRow[]>(Prisma.sql`${sourceQuery}
    SELECT q."sourceType",q."sourceId",q.title,q.category,q."nativeStatus",q.version,q.state,q.priority,q."nextAction",q.tags,
      q."ownerId",q."ownerName",q."churchId",q."topicId",q."createdAt",q."updatedAt",q."reminderAt",q."adminGroupId",q."canRead",q."canTriage"
    ${scoped} ORDER BY q."createdAt" DESC,q."sourceId" DESC,q."sourceType" DESC LIMIT ${options.limit ?? 26}`);
  return { rows: rows.map(rowOut), counts: null };
}

export type AdminQueueCounts = {
  open: number;
  unassigned: number;
  urgent: number;
  due: number;
  aged: number;
  claims: number;
};
export async function adminQueueRows(
  tx: AdminTx,
  a: AdminAuthority,
  filters: AdminQueueFilters,
  options: Omit<
    NonNullable<Parameters<typeof adminQueueData>[3]>,
    "summary"
  > = {}
) {
  return (await adminQueueData(tx, a, filters, options)).rows;
}
export async function adminQueueCounts(
  tx: AdminTx,
  a: AdminAuthority,
  filters: AdminQueueFilters,
  asOf: Date
) {
  return (await adminQueueData(tx, a, filters, { summary: true, asOf }))
    .counts!;
}

export async function readAdminQueue(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown> = {},
  after?: unknown
): Promise<AdminQueueSnapshot> {
  const filters = adminFilters(input),
    cursor = adminCursor(after);
  return withAdmin(db, token, async (tx, a) => {
    const asOf = cursor ? new Date(cursor.asOf) : new Date();
    const rows = await adminQueueRows(tx, a, filters, { after: cursor, asOf });
    const page = rows.slice(0, 25),
      last = page.at(-1);
    const views = await tx.adminSavedView.findMany({
      where: { userId: a.actor.id },
      select: { id: true, name: true, filters: true, version: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 20
    });
    return {
      navigation: a.navigation,
      filters,
      rows: page,
      asOf: asOf.toISOString(),
      next:
        rows.length > 25 && last
          ? encodeAdminCursor({
              at: last.createdAt,
              id: last.sourceId,
              type: last.sourceType,
              asOf: asOf.toISOString()
            })
          : null,
      savedViews: views.map((v) => ({
        ...v,
        filters: adminFilters(v.filters as Record<string, unknown>)
      }))
    };
  });
}
