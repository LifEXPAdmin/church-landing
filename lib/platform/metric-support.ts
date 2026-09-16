import { metricUtc } from "./metric-sql";
import { Prisma } from "@prisma/client";
import type { AdminTx } from "./admin-authority";
import type { MetricWindow } from "./metric-time";
export type SupportMetric = {
  type: string;
  cases: number;
  requesters: number;
  open: number;
  unassigned: number;
  aged: number;
  responded: number;
  meanFirstResponseHours: number | null;
  resolved: number;
  meanResolutionHours: number | null;
  reopened: number;
  reopenedPercent: number | null;
};
/** Service writes already authorize the actor. Read event metadata, never reply text. */
export async function metricSupport(tx: AdminTx, w: MetricWindow, now: Date) {
  return tx.$queryRaw<SupportMetric[]>(Prisma.sql`WITH sources AS (
    SELECT c.id,c."requesterId" AS requester,
      CASE WHEN c."moderationDecisionId" IS NOT NULL THEN 'APPEAL' WHEN c.category='FEATURE_SUGGESTION' THEN 'SUGGESTION'
        WHEN c."bugSteps"<>'' OR c."bugExpected"<>'' OR c."bugActual"<>'' THEN 'BUG' ELSE 'SUPPORT' END AS type,
      c."createdAt" AS received,c.status NOT IN ('RESOLVED','CLOSED') AS open,c."ownerGrantId" IS NULL AND c."moderationDecisionId" IS NULL AS unassigned,
      (SELECT min(m."createdAt") FROM "SupportMessage" m WHERE m."caseId"=c.id AND m."authorId"<>c."requesterId"
        AND m.kind IN ('REPLY','RESOLUTION') AND m."redactedAt" IS NULL
        AND EXISTS(SELECT 1 FROM "SupportAuditEvent" a WHERE a."caseId"=c.id AND a."actorId"=m."authorId" AND a.version=m.version AND a.action IN ('REPLY','TRANSITION','RESOLUTION'))) AS responded,
      CASE WHEN c.status IN ('RESOLVED','CLOSED') THEN (SELECT max(a."createdAt") FROM "SupportAuditEvent" a WHERE a."caseId"=c.id AND a."toState" IN ('RESOLVED','CLOSED')) ELSE NULL END AS resolved,
      EXISTS(SELECT 1 FROM "SupportAuditEvent" a WHERE a."caseId"=c.id AND a.action='REOPEN') AS reopened
    FROM "SupportCase" c
    UNION ALL SELECT c.id,c."reporterId",'REPORT',c."createdAt",c.status<>'CLOSED',c."assignedReviewerId" IS NULL,
      (SELECT min(d."createdAt") FROM "CommunityReportDecision" d WHERE d."reportId"=c.id),c."closedAt",
      EXISTS(SELECT 1 FROM "CommunityReportDecision" d WHERE d."reportId"=c.id AND d."fromStatus"='CLOSED' AND d."toStatus"<>'CLOSED') FROM "CommunityReport" c
    UNION ALL SELECT c.id,c."ownerId",'CLAIM',c."submittedAt",c.status IN ('SUBMITTED','NEEDS_INFORMATION'),c."assignedReviewerId" IS NULL,
      (SELECT min(d."createdAt") FROM "ChurchClaimDecision" d WHERE d."claimId"=c.id AND d."actorId"<>c."ownerId"),
      CASE WHEN c.status IN ('APPROVED','REJECTED','WITHDRAWN','REVOKED') THEN (SELECT max(d."createdAt") FROM "ChurchClaimDecision" d WHERE d."claimId"=c.id) ELSE NULL END,
      false FROM "ChurchClaim" c WHERE c."submittedAt" IS NOT NULL AND c.status<>'DRAFT'
  ), retained AS (
    SELECT s.* FROM sources s JOIN "PlatformUser" u ON u.id=s.requester WHERE u."erasedAt" IS NULL AND NOT u."metricExcluded"
      AND s.received>=${metricUtc(w.start)} AND s.received<${metricUtc(w.end)}
  ) SELECT type,count(*)::int AS cases,count(DISTINCT requester)::int AS requesters,
    count(*) FILTER(WHERE open)::int AS open,count(*) FILTER(WHERE open AND unassigned)::int AS unassigned,
    count(*) FILTER(WHERE open AND received<${metricUtc(new Date(now.getTime() - 7 * 86400000))})::int AS aged,
    count(*) FILTER(WHERE responded>=received AND responded<=${metricUtc(now)})::int AS responded,
    (avg(extract(epoch FROM responded-received)/3600) FILTER(WHERE responded>=received AND responded<=${metricUtc(now)}))::double precision AS "meanFirstResponseHours",
    count(*) FILTER(WHERE resolved>=received AND resolved<=${metricUtc(now)})::int AS resolved,
    (avg(extract(epoch FROM resolved-received)/3600) FILTER(WHERE resolved>=received AND resolved<=${metricUtc(now)}))::double precision AS "meanResolutionHours",
    count(*) FILTER(WHERE reopened)::int AS reopened,
    (100.0*count(*) FILTER(WHERE reopened)/nullif(count(*),0))::double precision AS "reopenedPercent"
    FROM retained GROUP BY type ORDER BY type`);
}
