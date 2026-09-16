import { Prisma, type PrismaClient } from "@prisma/client";
import { Temporal } from "@js-temporal/polyfill";
import {
  withAdmin,
  requireAdminCapability,
  type AdminTx,
  type AdminAuthority
} from "./admin-authority";
import { adminFields } from "./admin-input";
import { adminPriorOperation, recordAdminOperation } from "./admin-cases";
import { metricConfiguration } from "./platform-measurement";
import { aggregateMetrics } from "./metric-report";
import { metricWindow, metricDay, metricAddDays } from "./metric-time";
import { metricUtc } from "./metric-sql";
import {
  supportVisibilityJoins,
  supportVisibilityScope
} from "./moderation-support";
import { expected, PortalError } from "./portal-policy";
import { postField } from "./post-input";
import { releases } from "./release-content";
import { recordFeedbackPrivacyControl } from "./retention-controls";

export function feedbackReviewWindow(week: unknown, zone: string, now: Date) {
  const today = metricDay(now, zone);
  const monday = metricAddDays(
    today,
    1 - Temporal.PlainDate.from(today).dayOfWeek
  );
  const from = week === undefined ? metricAddDays(monday, -7) : String(week);
  const window = metricWindow(
    { from, through: metricAddDays(from, 6) },
    now,
    zone
  );
  if (
    Temporal.PlainDate.from(from).dayOfWeek !== 1 ||
    from >= monday ||
    from < metricAddDays(monday, -84)
  )
    throw new PortalError(
      400,
      "Choose a completed Monday-to-Sunday week from the last twelve weeks."
    );
  return window;
}

export function feedbackBuildUrl(input: unknown) {
  const raw = postField(input ?? "", 500);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const allowed =
      (url.hostname === "github.com" &&
        /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(issues|pull)\/\d+$/.test(
          url.pathname
        )) ||
      (["app.notion.com", "www.notion.so", "notion.so"].includes(
        url.hostname
      ) &&
        /^\/(?:p\/)?(?:[A-Za-z0-9_-]+-)?[a-f0-9]{32}$/.test(url.pathname)) ||
      (url.hostname === "app.todoist.com" &&
        /^\/app\/task\/[A-Za-z0-9]+$/.test(url.pathname));
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !allowed
    )
      throw Error();
    return url.href;
  } catch {
    throw new PortalError(
      400,
      "Use one direct HTTPS Notion specification, Todoist task or GitHub issue/pull-request link, without query strings or private tokens."
    );
  }
}

type CaseLink = {
  id: string;
  title: string;
  state: string;
  priority: string;
  buildUrl: string;
};
type Theme = {
  key: string;
  kind: string;
  title: string;
  cases: number;
  messages: number;
  requesters: number;
  open: number;
  sources: CaseLink[];
};
type WeeklyCases = {
  cases: number;
  messages: number;
  requesters: number;
  untagged: number;
  themes: Theme[];
  themeCount: number;
  problems: Theme[];
  repeatedSuggestions: Theme[];
  highImpact: CaseLink[];
  highImpactCount: number;
  reopened: CaseLink[];
  reopenedCount: number;
};

async function weeklyCases(
  tx: AdminTx,
  a: AdminAuthority,
  window: ReturnType<typeof metricWindow>,
  now: Date
) {
  const scope = await supportVisibilityScope(
    tx,
    { id: a.actor.id, adult: true, eligible: true },
    a.respond,
    true,
    a.reports
  );
  const [row] = await tx.$queryRaw<{ data: WeeklyCases }[]>(Prisma.sql`
    WITH authorized AS MATERIALIZED (
      SELECT s.id,s.subject,s.status,s.priority,s."requesterId",s."createdAt",s."engineeringUrl",s."triageTags",s."adminGroupId",f.kind,
        1+(SELECT count(*) FROM "SupportMessage" m WHERE m."caseId"=s.id AND m."redactedAt" IS NULL AND m."createdAt"<=${metricUtc(now)})::int AS messages,
        EXISTS(SELECT 1 FROM "SupportAuditEvent" e WHERE e."caseId"=s.id AND e.action='REOPEN'
          AND e."createdAt">=${metricUtc(window.start)} AND e."createdAt"<${metricUtc(window.end)}
          AND EXISTS(SELECT 1 FROM "SupportAuditEvent" old WHERE old."caseId"=s.id AND old.version<e.version AND old."toState" IN ('RESOLVED','CLOSED'))) AS reopened
      FROM "SupportCase" s JOIN "FeedbackSubmission" f ON f."caseId"=s.id
      JOIN "PlatformUser" u ON u.id=s."requesterId" ${supportVisibilityJoins}
      WHERE ${scope} AND f."redactedAt" IS NULL AND u."erasedAt" IS NULL AND NOT u."metricExcluded" AND s."createdAt"<=${metricUtc(now)}
    ), received AS MATERIALIZED (SELECT * FROM authorized WHERE "createdAt">=${metricUtc(window.start)} AND "createdAt"<${metricUtc(window.end)}),
    tagged AS (
      SELECT r.*, 'TAG:'||tag AS theme_key,'TAG'::text AS theme_kind,tag AS title FROM received r CROSS JOIN unnest(r."triageTags") tag
      UNION ALL SELECT r.*,'GROUP:'||r."adminGroupId",'GROUP','Duplicate group (authorized cases only)' FROM received r WHERE r."adminGroupId" IS NOT NULL
    ), themes AS (
      SELECT theme_key AS key,theme_kind AS kind,title,count(*)::int AS cases,sum(messages)::int AS messages,
        count(DISTINCT "requesterId")::int AS requesters,count(*) FILTER(WHERE status NOT IN ('RESOLVED','CLOSED'))::int AS open,
        count(*) FILTER(WHERE kind='BUG')::int AS bugs,count(*) FILTER(WHERE kind='SUGGESTION')::int AS suggestions
      FROM tagged GROUP BY theme_key,theme_kind,title
    ), case_links AS (SELECT id,jsonb_build_object('id',id,'title',subject,'state',status,'priority',priority,'buildUrl',"engineeringUrl") AS data FROM authorized),
    theme_links AS (SELECT t.*,coalesce((SELECT jsonb_agg(source.data ORDER BY source.id) FROM
      (SELECT l.id,l.data FROM tagged x JOIN case_links l ON l.id=x.id WHERE x.theme_key=t.key ORDER BY l.id LIMIT 5) source),'[]') AS sources FROM themes t)
    SELECT jsonb_build_object(
      'cases',(SELECT count(*) FROM received),'messages',(SELECT coalesce(sum(messages),0) FROM received),
      'requesters',(SELECT count(DISTINCT "requesterId") FROM received),
      'untagged',(SELECT count(*) FROM received WHERE cardinality("triageTags")=0 AND "adminGroupId" IS NULL),
      'themeCount',(SELECT count(*) FROM themes),
      'themes',(SELECT coalesce(jsonb_agg(q ORDER BY q.requesters DESC,q.cases DESC,q.key),'[]') FROM (SELECT key,kind,title,cases,messages,requesters,open,sources FROM theme_links ORDER BY requesters DESC,cases DESC,key LIMIT 20) q),
      'problems',(SELECT coalesce(jsonb_agg(q ORDER BY q.requesters DESC,q.cases DESC,q.key),'[]') FROM (SELECT key,kind,title,cases,messages,requesters,open,sources FROM theme_links WHERE bugs>0 ORDER BY requesters DESC,cases DESC,key LIMIT 20) q),
      'repeatedSuggestions',(SELECT coalesce(jsonb_agg(q ORDER BY q.requesters DESC,q.cases DESC,q.key),'[]') FROM (SELECT key,kind,title,cases,messages,requesters,open,sources FROM theme_links WHERE suggestions>1 ORDER BY requesters DESC,cases DESC,key LIMIT 20) q),
      'highImpactCount',(SELECT count(*) FROM authorized WHERE kind='BUG' AND status NOT IN ('RESOLVED','CLOSED') AND priority IN ('HIGH','URGENT')),
      'highImpact',(SELECT coalesce(jsonb_agg(q.data ORDER BY q.priority DESC,q."createdAt",q.id),'[]') FROM
        (SELECT l.data,a.priority,a."createdAt",a.id FROM authorized a JOIN case_links l ON l.id=a.id WHERE a.kind='BUG' AND a.status NOT IN ('RESOLVED','CLOSED') AND a.priority IN ('HIGH','URGENT') ORDER BY a.priority DESC,a."createdAt",a.id LIMIT 20) q),
      'reopenedCount',(SELECT count(*) FROM authorized WHERE reopened),
      'reopened',(SELECT coalesce(jsonb_agg(q.data ORDER BY q.id),'[]') FROM (SELECT l.id,l.data FROM authorized a JOIN case_links l ON l.id=a.id WHERE a.reopened ORDER BY l.id LIMIT 20) q)
    ) AS data`);
  return row.data;
}

export function readFeedbackWeekly(
  db: PrismaClient,
  token: unknown,
  week?: unknown,
  now = new Date()
) {
  return withAdmin(db, token, async (tx, a) => {
    requireAdminCapability(a, "MANAGE_PRODUCT_FEEDBACK");
    const config = await metricConfiguration(tx);
    const window = feedbackReviewWindow(week, config.zone, now);
    const report = a.capabilities.has("VIEW_PLATFORM_METRICS")
      ? await aggregateMetrics(
          tx,
          { from: window.from, through: window.through },
          now
        )
      : null;
    const notes = await tx.feedbackWeeklyReview.findUnique({
      where: {
        userId_week_zone: {
          userId: a.actor.id,
          week: window.from,
          zone: config.zone
        }
      }
    });
    return {
      navigation: a.navigation,
      weekly: {
        window,
        checkedAt: now.toISOString(),
        cases: await weeklyCases(tx, a, window, now),
        growth: report
          ? {
              registrations: report.current.registrations,
              active: report.current.active,
              returning: report.current.returning,
              measuredAccounts: report.coverage.measuredAccounts,
              coveragePartial: report.coverage.partial,
              d7: report.returns.d7,
              d30: report.returns.d30
            }
          : null,
        feedback: report?.feedback ?? null,
        releases: releases
          .filter((r) => r.date >= window.from && r.date <= window.through)
          .map(({ id, version, date, summary }) => ({
            id,
            version,
            date,
            summary
          })),
        notes: {
          version: notes?.version ?? 0,
          learned: notes?.learned ?? "",
          tryNext: notes?.tryNext ?? "",
          checkNext: notes?.checkNext ?? "",
          buildUrl: notes?.buildUrl ?? ""
        }
      }
    };
  });
}

export function saveFeedbackWeekly(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  adminFields(input, [
    "operation",
    "requestKey",
    "week",
    "expectedVersion",
    "learned",
    "tryNext",
    "checkNext",
    "buildUrl"
  ]);
  return withAdmin(
    db,
    token,
    async (tx, a) => {
      requireAdminCapability(a, "MANAGE_PRODUCT_FEEDBACK");
      const config = await metricConfiguration(tx);
      const window = feedbackReviewWindow(input.week, config.zone, new Date());
      const prior = await adminPriorOperation(tx, a.actor.id, input);
      if (prior.prior)
        return prior.prior as { id: string; version: number; message: string };
      const key = { userId: a.actor.id, week: window.from, zone: config.zone };
      const old = await tx.feedbackWeeklyReview.findUnique({
        where: { userId_week_zone: key }
      });
      expected(input.expectedVersion, old?.version ?? 0);
      const data = {
        learned: postField(input.learned ?? "", 2000),
        tryNext: postField(input.tryNext ?? "", 2000),
        checkNext: postField(input.checkNext ?? "", 2000),
        buildUrl: feedbackBuildUrl(input.buildUrl)
      };
      const saved = await tx.feedbackWeeklyReview.upsert({
        where: { userId_week_zone: key },
        create: { ...key, ...data },
        update: { ...data, version: { increment: 1 } }
      });
      await recordFeedbackPrivacyControl(
        tx,
        "FEEDBACK_REVIEW",
        saved.id,
        a.actor.id,
        saved.version
      );
      const result = {
        id: saved.id,
        version: saved.version,
        message:
          "Your private weekly review was saved. The task link is a reference; no task or message was created."
      };
      await recordAdminOperation(
        tx,
        a.actor.id,
        input,
        { sourceType: "FEEDBACK_REVIEW", sourceId: saved.id },
        result
      );
      return result;
    },
    true
  );
}
export type FeedbackWeeklySnapshot = Awaited<
  ReturnType<typeof readFeedbackWeekly>
>;
