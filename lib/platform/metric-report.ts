import { metricUtc } from "./metric-sql";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  withAdmin,
  requireAdminCapability,
  type AdminTx
} from "./admin-authority";
import { metricConfiguration } from "./platform-measurement";
import { metricSources } from "./metric-sources";
import { metricSupport } from "./metric-support";
import { releases } from "./release-content";
import {
  metricWindow,
  metricDay,
  metricAddDays,
  metricDayStart
} from "./metric-time";
import {
  metricBreakdown,
  metricLifecycleBalance,
  metricRatio
} from "./metric-math";
import {
  METRIC_RAW_DAYS,
  METRIC_POLICY,
  metricDefinitions,
  metricReferrals,
  metricDevices,
  metricBrowsers,
  metricActions,
  type MetricAccountState,
  type MetricStateCounts
} from "./metric-policy";

type Period = {
  registrations: number;
  methods: { key: string; count: number }[];
  active: number;
  firstValues: number;
  adoption: { key: string; actors: number; actions: number }[];
};
type Cohort = {
  day: string;
  accounts: number;
  foreground: number;
  firstValue: number;
  d7: number;
  d30: number;
};
type Core = {
  population: {
    existing: number;
    enabled: number;
    deactivated: number;
    suspended: number;
  };
  current: Period;
  previous: Period;
  measured: number;
  active: { day: number; week: number; month: number };
  series: { day: string; registrations: number; active: number }[];
  cohorts: Cohort[];
  onboarding: {
    started: number;
    completed: number;
    skipped: number;
    finished: number;
  };
  churchFunnel: { requested: number; approved: number; acted: number };
  organizations: {
    listings: number;
    newListings: number;
    pendingClaims: number;
    managedChurches: number;
    newManagedChurches: number;
    topicSpaces: number;
    newTopicSpaces: number;
    activeChurches: number;
    activeTopics: number;
  };
  dimensions: {
    referral: { key: string; count: number }[];
    device: { key: string; count: number }[];
    browser: { key: string; count: number }[];
  };
};
export async function aggregateMetrics(
  tx: AdminTx,
  input: Record<string, unknown>,
  now = new Date()
) {
  const configuration = await metricConfiguration(tx),
    zone = configuration.zone;
  const window = metricWindow(input, now, zone),
    cutoff = new Date(now.getTime() - METRIC_RAW_DAYS * 86400000);
  const today = metricDay(now, zone),
    week = metricAddDays(today, -6),
    month = metricAddDays(today, -29);
  const [row] = await tx.$queryRaw<{ data: Core }[]>(Prisma.sql`WITH RECURSIVE
    ${metricSources(configuration.version, now, cutoff)},
    periods AS (SELECT 'current'::text AS key,${metricUtc(window.start)}::timestamp AS start,${metricUtc(window.end)}::timestamp AS finish
      UNION ALL SELECT 'previous',${metricUtc(window.comparison.start)}::timestamp,${metricUtc(window.comparison.end)}::timestamp),
    summaries AS (SELECT w.key,jsonb_build_object(
      'registrations',(SELECT count(*) FROM population u WHERE u."createdAt">=w.start AND u."createdAt"<w.finish),
      'methods',(SELECT coalesce(jsonb_agg(jsonb_build_object('key',method,'count',n)),'[]') FROM
        (SELECT u."metricCreationMethod" AS method,count(*) AS n FROM population u WHERE u."createdAt">=w.start AND u."createdAt"<w.finish GROUP BY 1) q),
      'active',(SELECT count(DISTINCT d."userId") FROM activity d WHERE d.day>=(w.start AT TIME ZONE 'UTC' AT TIME ZONE ${zone})::date
        AND d.day<(w.finish AT TIME ZONE 'UTC' AT TIME ZONE ${zone})::date+CASE WHEN w.key='current' AND ${window.partial} THEN 1 ELSE 0 END),
      'firstValues',(SELECT count(*) FROM (SELECT actor,min(at) first_at FROM actions WHERE kind<>'EVENT' GROUP BY actor) f WHERE f.first_at>=w.start AND f.first_at<w.finish),
      'adoption',(SELECT coalesce(jsonb_agg(jsonb_build_object('key',kind,'actors',actors,'actions',n)),'[]') FROM
        (SELECT kind,count(DISTINCT actor) AS actors,count(*) AS n FROM actions WHERE at>=w.start AND at<w.finish GROUP BY kind) a)
    ) AS value FROM periods w),
    cohort_accounts AS (
      SELECT m.*, (m."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${zone})::date AS signup_day,
        ((m."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${zone})::date+7)::timestamp AT TIME ZONE ${zone} AT TIME ZONE 'UTC' AS value_end
      FROM measured m WHERE m."cohortEligible" AND m."createdAt">=greatest(${metricUtc(window.start)},${metricUtc(configuration.startedAt)},${metricUtc(cutoff)}) AND m."createdAt"<${metricUtc(window.end)}
    ), cohort_days AS (
      SELECT signup_day,count(*) AS accounts,
        count(*) FILTER(WHERE EXISTS(SELECT 1 FROM activity d WHERE d."userId"=c.id AND d."firstAt">=c."createdAt" AND d."firstAt"<c.value_end)) AS foreground,
        count(*) FILTER(WHERE EXISTS(SELECT 1 FROM actions a WHERE a.actor=c.id AND a.kind<>'EVENT' AND a.at<c.value_end)) AS first_value,
        count(*) FILTER(WHERE EXISTS(SELECT 1 FROM activity d WHERE d."userId"=c.id AND d.day=c.signup_day+7)) AS d7,
        count(*) FILTER(WHERE EXISTS(SELECT 1 FROM activity d WHERE d."userId"=c.id AND d.day=c.signup_day+30)) AS d30
      FROM cohort_accounts c GROUP BY signup_day
    ), connection_funnel AS (
      SELECT c.* FROM "ChurchConnection" c JOIN measured m ON m.id=c."userId"
      WHERE c."requestedAt">=greatest(m."enabledAt",${metricUtc(window.start)},${metricUtc(cutoff)}) AND c."requestedAt"<${metricUtc(window.end)}
    )
    SELECT jsonb_build_object(
      'population',(SELECT jsonb_build_object('existing',count(*),'enabled',count(*) FILTER(WHERE "suspendedAt" IS NULL AND "deactivatedAt" IS NULL),
        'deactivated',count(*) FILTER(WHERE "suspendedAt" IS NULL AND "deactivatedAt" IS NOT NULL),'suspended',count(*) FILTER(WHERE "suspendedAt" IS NOT NULL)) FROM population),
      'current',(SELECT value FROM summaries WHERE key='current'),'previous',(SELECT value FROM summaries WHERE key='previous'),
      'measured',(SELECT count(*) FROM measured),
      'active',(SELECT jsonb_build_object('day',count(DISTINCT "userId") FILTER(WHERE day=${today}::date),
        'week',count(DISTINCT "userId") FILTER(WHERE day>=${week}::date),'month',count(DISTINCT "userId") FILTER(WHERE day>=${month}::date)) FROM activity WHERE day<=${today}::date),
      'series',(SELECT jsonb_agg(jsonb_build_object('day',to_char(day,'YYYY-MM-DD'),
        'registrations',(SELECT count(*) FROM population u WHERE (u."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${zone})::date=day),
        'active',(SELECT count(DISTINCT "userId") FROM activity a WHERE a.day=g.day::date)) ORDER BY g.day)
        FROM generate_series(${window.from}::date,${window.through}::date,'1 day') g(day)),
      'cohorts',(SELECT coalesce(jsonb_agg(jsonb_build_object('day',to_char(signup_day,'YYYY-MM-DD'),'accounts',accounts,'foreground',foreground,
        'firstValue',first_value,'d7',d7,'d30',d30) ORDER BY signup_day),'[]') FROM cohort_days),
      'onboarding',(SELECT jsonb_build_object('started',count(*),
        'completed',count(*) FILTER(WHERE "onboardingCompletedAt">="onboardingStartedAt" AND "onboardingCompletedAt"<${metricUtc(window.end)}),
        'skipped',count(*) FILTER(WHERE "onboardingSkippedAt">="onboardingStartedAt" AND "onboardingSkippedAt"<${metricUtc(window.end)}),
        'finished',count(*) FILTER(WHERE ("onboardingCompletedAt">="onboardingStartedAt" AND "onboardingCompletedAt"<${metricUtc(window.end)})
          OR ("onboardingSkippedAt">="onboardingStartedAt" AND "onboardingSkippedAt"<${metricUtc(window.end)})))
        FROM measured WHERE "onboardingStartedAt">=greatest(${metricUtc(window.start)},${metricUtc(cutoff)}) AND "onboardingStartedAt"<${metricUtc(window.end)}),
      'churchFunnel',(SELECT jsonb_build_object('requested',count(*),'approved',count(*) FILTER(WHERE state='APPROVED'),
        'acted',count(*) FILTER(WHERE state='APPROVED' AND EXISTS(SELECT 1 FROM actions a WHERE a.actor=c."userId" AND a.church=c."churchId"
          AND a.at>=c."approvedSince" AND a.at<${metricUtc(window.end)}))) FROM connection_funnel c),
      'organizations',jsonb_build_object(
        'listings',(SELECT count(*) FROM "Church" WHERE "communityListed"),
        'newListings',(SELECT count(*) FROM "Church" WHERE "communityListed" AND "createdAt">=${metricUtc(window.start)} AND "createdAt"<${metricUtc(window.end)}),
        'pendingClaims',(SELECT count(*) FROM "ChurchClaim" c JOIN population u ON u.id=c."ownerId" WHERE c.status IN ('SUBMITTED','NEEDS_INFORMATION')),
        'managedChurches',(SELECT count(DISTINCT "churchId") FROM "ChurchClaim" WHERE status='APPROVED' AND "activatedAt" IS NOT NULL),
        'newManagedChurches',(SELECT count(*) FROM (SELECT "churchId",min("activatedAt") at FROM "ChurchClaim" WHERE status='APPROVED' AND "activatedAt" IS NOT NULL GROUP BY "churchId") c WHERE at>=${metricUtc(window.start)} AND at<${metricUtc(window.end)}),
        'topicSpaces',(SELECT count(*) FROM "TopicCommunity" WHERE lifecycle='ACTIVE' AND "moderationState"='VISIBLE' AND NOT "recoveryRequired"),
        'newTopicSpaces',(SELECT count(*) FROM "TopicCommunity" WHERE lifecycle='ACTIVE' AND "moderationState"='VISIBLE' AND NOT "recoveryRequired" AND "createdAt">=${metricUtc(window.start)} AND "createdAt"<${metricUtc(window.end)}),
        'activeChurches',(SELECT count(DISTINCT church) FROM source_actions WHERE kind IN ('POST','EVENT','VOLUNTEER') AND church IS NOT NULL AND at>=${metricUtc(metricDayStart(month, zone))} AND at<=${metricUtc(now)}),
        'activeTopics',(SELECT count(DISTINCT "topicCommunityId") FROM ordinary_posts WHERE "publishedAt">=${metricUtc(metricDayStart(month, zone))})
      ),
      'dimensions',jsonb_build_object(
        'referral',(SELECT coalesce(jsonb_agg(jsonb_build_object('key',referral,'count',n)),'[]') FROM (SELECT referral,count(*) n FROM measured m WHERE EXISTS(SELECT 1 FROM activity d WHERE d."userId"=m.id AND d.day BETWEEN ${window.from}::date AND ${window.through}::date) GROUP BY referral) q),
        'device',(SELECT coalesce(jsonb_agg(jsonb_build_object('key',device,'count',n)),'[]') FROM (SELECT device,count(*) n FROM (SELECT DISTINCT ON ("userId") "userId",device FROM activity WHERE day BETWEEN ${window.from}::date AND ${window.through}::date ORDER BY "userId",day DESC) last_device GROUP BY device) q),
        'browser',(SELECT coalesce(jsonb_agg(jsonb_build_object('key',browser,'count',n)),'[]') FROM (SELECT browser,count(*) n FROM (SELECT DISTINCT ON ("userId") "userId",browser FROM activity WHERE day BETWEEN ${window.from}::date AND ${window.through}::date ORDER BY "userId",day DESC) last_browser GROUP BY browser) q)
      )
    ) AS data`);
  const core = row.data;
  const bins = (rows: { key: string; count: number }[], keys: string[]) =>
    metricBreakdown(
      keys.map((key) => ({
        key,
        count: rows.find((r) => r.key === key)?.count ?? 0
      }))
    );
  const adoption = (period: Period) => {
    const suppressed = period.adoption.some(
      (a) => a.actors > 0 && a.actors < 5
    );
    return Object.keys({
      ...metricActions,
      EVENT: "Creating calendar events"
    }).map((key) => {
      const row = period.adoption.find((a) => a.key === key);
      return {
        key,
        suppressed,
        actors: suppressed ? null : (row?.actors ?? 0),
        actions: suppressed ? null : (row?.actions ?? 0)
      };
    });
  };
  const edges = await tx.$queryRaw<
    {
      period: string;
      day: Date | null;
      fromState: string;
      toState: string;
      reason: string;
      count: number;
    }[]
  >(Prisma.sql`
    SELECT CASE WHEN day<${window.from}::date THEN 'before' WHEN day<=${window.through}::date THEN 'within' ELSE 'after' END AS period,
      CASE WHEN day BETWEEN ${window.from}::date AND ${window.through}::date THEN day ELSE NULL END AS day,
      "fromState","toState",reason,sum(count)::int AS count FROM "PlatformMetricLifecycleDay"
      WHERE version=${configuration.version} AND day<=${today}::date GROUP BY 1,2,3,4,5 ORDER BY 2,3,4,5`);
  const before = edges.filter((e) => e.period === "before");
  const inWindow = edges.filter((e) => e.period === "within");
  const convert = (e: (typeof edges)[number]) => ({
    from: e.fromState as MetricAccountState,
    to: e.toState as MetricAccountState,
    count: e.count
  });
  const baseline = configuration.openingStates as MetricStateCounts;
  const opening = metricLifecycleBalance(baseline, before.map(convert));
  const closing = metricLifecycleBalance(opening.states, inWindow.map(convert));
  const sum = (cohorts: Cohort[], key: keyof Omit<Cohort, "day">) =>
    cohorts.reduce((n, c) => n + c[key], 0);
  const mature = (days: number) =>
    core.cohorts.filter(
      (c) => metricDayStart(metricAddDays(c.day, days), zone) <= now
    );
  const funnel = mature(7),
    d7 = mature(8),
    d30 = mature(31);
  const smallCohort = core.cohorts.some((c) => c.accounts < 5);
  const cohorts = core.cohorts.map((c) => ({
    day: c.day,
    suppressed: smallCohort,
    accounts: smallCohort ? null : c.accounts,
    foreground: smallCohort ? null : c.foreground,
    firstValue: smallCohort ? null : c.firstValue,
    d7:
      smallCohort || metricDayStart(metricAddDays(c.day, 8), zone) > now
        ? null
        : metricRatio(c.d7, c.accounts),
    d30:
      smallCohort || metricDayStart(metricAddDays(c.day, 31), zone) > now
        ? null
        : metricRatio(c.d30, c.accounts),
    d7Mature: metricDayStart(metricAddDays(c.day, 8), zone) <= now,
    d30Mature: metricDayStart(metricAddDays(c.day, 31), zone) <= now
  }));
  return {
    checkedAt: now.toISOString(),
    releaseContext: releases
      .filter((r) => r.date >= window.from && r.date <= window.through)
      .map(({ id, version, date, summary }) => ({
        id,
        version,
        date,
        summary
      })),
    window,
    configuration: {
      version: configuration.version,
      zone,
      startedAt: configuration.startedAt.toISOString(),
      policy: METRIC_POLICY,
      rawDays: METRIC_RAW_DAYS,
      collecting: process.env.PLATFORM_MEASUREMENT_ENABLED === "true"
    },
    coverage: {
      partial:
        new Date(window.start) < configuration.startedAt ||
        new Date(window.start) < cutoff,
      comparisonPartial:
        new Date(window.comparison.start) < configuration.startedAt ||
        new Date(window.comparison.start) < cutoff,
      retainedFrom: cutoff.toISOString(),
      measuredAccounts: core.measured
    },
    definitions: metricDefinitions,
    population: core.population,
    current: {
      ...core.current,
      methods: bins(core.current.methods, ["EMAIL", "GOOGLE", "UNKNOWN"]),
      adoption: adoption(core.current)
    },
    previous: {
      ...core.previous,
      methods: bins(core.previous.methods, ["EMAIL", "GOOGLE", "UNKNOWN"]),
      adoption: adoption(core.previous)
    },
    active: core.active,
    series: core.series.map((s) => ({
      ...s,
      activityAvailable:
        metricDayStart(metricAddDays(s.day, 1), zone) >
          configuration.startedAt &&
        metricDayStart(metricAddDays(s.day, 1), zone) > cutoff
    })),
    lifecycle: {
      opening,
      closing,
      coveragePartial: new Date(window.start) < configuration.startedAt,
      transitions: inWindow.map((e) => ({
        day: e.day!.toISOString().slice(0, 10),
        from: e.fromState,
        to: e.toState,
        reason: e.reason,
        count: e.count
      })),
      recordedCreations: edges
        .filter((e) => e.reason === "CREATED")
        .reduce((n, e) => n + e.count, 0),
      recordedDeletions: edges
        .filter((e) => e.toState === "DELETED")
        .reduce((n, e) => n + e.count, 0)
    },
    funnel: {
      cohortAccounts: sum(core.cohorts, "accounts"),
      matureAccounts: sum(funnel, "accounts"),
      immatureAccounts: sum(core.cohorts, "accounts") - sum(funnel, "accounts"),
      foreground: metricRatio(
        sum(funnel, "foreground"),
        sum(funnel, "accounts")
      ),
      firstValue: metricRatio(
        sum(funnel, "firstValue"),
        sum(funnel, "accounts")
      )
    },
    returns: {
      d7: metricRatio(sum(d7, "d7"), sum(d7, "accounts")),
      d30: metricRatio(sum(d30, "d30"), sum(d30, "accounts")),
      d7Immature: sum(core.cohorts, "accounts") - sum(d7, "accounts"),
      d30Immature: sum(core.cohorts, "accounts") - sum(d30, "accounts")
    },
    cohorts,
    onboarding: core.onboarding,
    churchFunnel: core.churchFunnel,
    organizations: core.organizations,
    support: await metricSupport(tx, window, now),
    dimensions: {
      referral: bins(core.dimensions.referral, Object.keys(metricReferrals)),
      device: bins(core.dimensions.device, Object.keys(metricDevices)),
      browser: bins(core.dimensions.browser, Object.keys(metricBrowsers))
    },
    feedback: {
      available: false as const,
      message:
        "Feedback ratings and displayed prompt exposures are not yet collected. No response rate or historical rating is inferred."
    }
  };
}
export function readPlatformMetrics(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>,
  now = new Date()
) {
  return withAdmin(db, token, async (tx, a) => {
    requireAdminCapability(a, "VIEW_PLATFORM_METRICS");
    return {
      navigation: a.navigation,
      report: await aggregateMetrics(tx, input, now)
    };
  });
}
export type MetricReport = Awaited<ReturnType<typeof aggregateMetrics>>;
export type MetricSnapshot = Awaited<ReturnType<typeof readPlatformMetrics>>;
