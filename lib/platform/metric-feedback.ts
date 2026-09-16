import { Prisma } from "@prisma/client";
import type { AdminTx } from "./admin-authority";
import type { MetricWindow } from "./metric-time";
import { metricUtc } from "./metric-sql";
import { metricRatio } from "./metric-math";
import {
  METRIC_MINIMUM_GROUP,
  METRIC_POLICY,
  METRIC_RAW_DAYS
} from "./metric-policy";
import { ADULT_POLICY } from "./portal-types";
import { FEEDBACK_PROMPT_POLICY } from "./feedback-prompt-policy";

type FeedbackPeriod = {
  feedbackCount: number;
  requesters: number;
  ratingCount: number;
  mean: number | null;
  distribution: { rating: number; count: number; people: number }[];
  entries: { key: string; cases: number; people: number }[];
  exposures: number;
  responses: number;
};

/** Operational receipts do not require activity consent. Prompt attribution does.
 * Only aggregate metadata crosses this boundary; no case IDs or private text. */
export async function metricFeedback(
  tx: AdminTx,
  window: MetricWindow,
  configurationVersion: number,
  now: Date
) {
  const cutoff = new Date(now.getTime() - METRIC_RAW_DAYS * 86400000);
  const [result] = await tx.$queryRaw<
    { current: FeedbackPeriod; previous: FeedbackPeriod }[]
  >(Prisma.sql`
    WITH receipts AS MATERIALIZED (
      SELECT f."caseId",c."requesterId",f.rating,f."entryPoint",f."promptClaimId",f."createdAt"
      FROM "FeedbackSubmission" f JOIN "SupportCase" c ON c.id=f."caseId"
      JOIN "PlatformUser" u ON u.id=c."requesterId"
      WHERE f."redactedAt" IS NULL AND u."erasedAt" IS NULL AND NOT u."metricExcluded"
        AND f."createdAt">=${metricUtc(window.comparison.start)} AND f."createdAt"<=${metricUtc(now)}
    ), exposures AS MATERIALIZED (
      SELECT e.id,e."userId",e."shownAt" FROM "FeedbackPromptClaim" e
      JOIN "PlatformUser" u ON u.id=e."userId"
      JOIN "PlatformMeasurementChoice" p ON p."userId"=u.id
      WHERE e."shownAt" IS NOT NULL AND e."shownAt">=e."createdAt" AND e."shownAt"<=${metricUtc(now)}
        AND e."createdAt">=${metricUtc(cutoff)} AND e."createdAt">=p."enabledAt"
        AND e.campaign=${FEEDBACK_PROMPT_POLICY} AND e."configurationVersion"=${configurationVersion}
        AND e."measurementVersion"<=p.version AND p.policy=${METRIC_POLICY}
        AND u."erasedAt" IS NULL AND NOT u."metricExcluded" AND u."suspendedAt" IS NULL AND u."deactivatedAt" IS NULL
        AND u."emailVerifiedAt" IS NOT NULL AND u."adultAcknowledgedAt" IS NOT NULL AND u."adultPolicyVersion"=${ADULT_POLICY}
        AND NOT EXISTS(SELECT 1 FROM "PlatformOperatorGrant" g WHERE g."userId"=u.id AND g."revokedAt" IS NULL)
        AND NOT EXISTS(SELECT 1 FROM "SupportCapabilityGrant" g WHERE g."userId"=u.id AND g."revokedAt" IS NULL)
    ), classified AS (
      SELECT f.*,CASE WHEN f."entryPoint"='VOLUNTARY' THEN 'VOLUNTARY'
        WHEN f."entryPoint"='PROMPT' AND EXISTS(SELECT 1 FROM exposures e WHERE e.id=f."promptClaimId"
          AND e."userId"=f."requesterId" AND e."shownAt"<=f."createdAt") THEN 'PROMPT' ELSE 'UNATTRIBUTED' END AS entry
      FROM receipts f
    ), periods AS (
      SELECT 'current'::text AS key,${metricUtc(window.start)}::timestamp AS start,${metricUtc(window.end)}::timestamp AS finish
      UNION ALL SELECT 'previous',${metricUtc(window.comparison.start)}::timestamp,${metricUtc(window.comparison.end)}::timestamp
    ), summaries AS (
      SELECT w.key,jsonb_build_object(
        'feedbackCount',(SELECT count(*) FROM classified f WHERE f."createdAt">=w.start AND f."createdAt"<w.finish),
        'requesters',(SELECT count(DISTINCT f."requesterId") FROM classified f WHERE f."createdAt">=w.start AND f."createdAt"<w.finish),
        'ratingCount',(SELECT count(rating) FROM classified f WHERE f."createdAt">=w.start AND f."createdAt"<w.finish),
        'mean',(SELECT avg(rating) FROM classified f WHERE f."createdAt">=w.start AND f."createdAt"<w.finish),
        'distribution',(SELECT jsonb_agg(jsonb_build_object('rating',r.rating,'count',r.n,'people',r.people) ORDER BY r.rating)
          FROM (SELECT v.rating,count(f.rating) n,count(DISTINCT f."requesterId") people FROM generate_series(1,5) v(rating)
            LEFT JOIN classified f ON f.rating=v.rating AND f."createdAt">=w.start AND f."createdAt"<w.finish GROUP BY v.rating) r),
        'entries',(SELECT jsonb_agg(jsonb_build_object('key',r.entry,'cases',r.n,'people',r.people) ORDER BY r.entry)
          FROM (SELECT v.entry,count(f."caseId") n,count(DISTINCT f."requesterId") people FROM
            (VALUES ('VOLUNTARY'),('PROMPT'),('UNATTRIBUTED')) v(entry)
            LEFT JOIN classified f ON f.entry=v.entry AND f."createdAt">=w.start AND f."createdAt"<w.finish GROUP BY v.entry) r),
        'exposures',(SELECT count(*) FROM exposures e WHERE e."shownAt">=w.start AND e."shownAt"<w.finish),
        'responses',(SELECT count(*) FROM exposures e WHERE e."shownAt">=w.start AND e."shownAt"<w.finish
          AND EXISTS(SELECT 1 FROM classified f WHERE f."promptClaimId"=e.id AND f.entry='PROMPT'))
      ) AS data FROM periods w
    ) SELECT (SELECT data FROM summaries WHERE key='current') AS current,
      (SELECT data FROM summaries WHERE key='previous') AS previous`);
  function period(raw: FeedbackPeriod) {
    // Suppress complementary cells as well, using distinct people rather than messages.
    const distributionSuppressed = raw.distribution.some(
      (r) => r.people > 0 && r.people < METRIC_MINIMUM_GROUP
    );
    const entriesSuppressed = raw.entries.some(
      (r) => r.people > 0 && r.people < METRIC_MINIMUM_GROUP
    );
    return {
      feedbackCount: raw.feedbackCount,
      requesters: raw.requesters,
      ratingCount: raw.ratingCount,
      mean: raw.mean,
      distributionSuppressed,
      distribution: raw.distribution.map((r) => ({
        rating: r.rating,
        count: distributionSuppressed ? null : r.count
      })),
      entriesSuppressed,
      entries: raw.entries.map((r) => ({
        key: r.key,
        cases: entriesSuppressed ? null : r.cases,
        requesters: entriesSuppressed ? null : r.people
      })),
      prompt: metricRatio(raw.responses, raw.exposures),
      limitedResponses: raw.requesters < METRIC_MINIMUM_GROUP,
      message:
        raw.feedbackCount === 0
          ? "No retained feedback was submitted in this interval."
          : raw.requesters < METRIC_MINIMUM_GROUP
            ? "Fewer than five people responded. This is insufficient evidence of wider user experience."
            : "These are voluntary responses, not a representative survey of all users."
    };
  }
  return {
    available: true as const,
    current: period(result.current),
    previous: period(result.previous),
    retainedFrom: cutoff.toISOString(),
    exposureCoveragePartial: new Date(window.start) < cutoff,
    comparisonCoveragePartial: new Date(window.comparison.start) < cutoff,
    minimumGroup: METRIC_MINIMUM_GROUP,
    message:
      "Submission totals use their submitted date. Response coverage follows prompts visibly displayed in each interval, with retained responses through this report's refresh time; later responses can restate earlier coverage. Unseen reservations are excluded. Expired or withdrawn prompt evidence becomes Unattributed, never voluntary. Current consent, account restrictions, redaction and the ninety-day exposure limit can restate results. Small complementary breakdowns are suppressed."
  };
}
