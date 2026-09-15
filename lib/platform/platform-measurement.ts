import { metricUtc } from "./metric-sql";
import { Prisma, type PrismaClient } from "@prisma/client";
import { withOwnedSession } from "./account-sessions";
import { expected, isEligible, PortalError } from "./portal-policy";
import { socialCommand, socialInput } from "./social-operations";
import { calendarZone } from "./calendar-time";
import { metricDay } from "./metric-time";
import {
  METRIC_POLICY,
  METRIC_RAW_DAYS,
  METRIC_SESSION_GAP_MS,
  METRIC_SIGNAL_INTERVAL_MS,
  METRIC_ZONE,
  metricBrowsers,
  metricDevices,
  metricReferrals
} from "./metric-policy";

type Tx = Prisma.TransactionClient;
export async function metricConfiguration(tx: Tx) {
  const configuration = await tx.platformMetricConfiguration.findFirst({
    orderBy: { version: "desc" }
  });
  if (!configuration)
    throw new PortalError(503, "The reporting baseline is unavailable.");
  const zone = calendarZone(process.env.PLATFORM_METRICS_ZONE ?? METRIC_ZONE);
  if (zone !== configuration.zone)
    throw new PortalError(
      503,
      "The reporting zone changed. Review and version the existing daily buckets before collecting or reporting."
    );
  return configuration;
}
export async function metricActor(tx: Tx, userId: string) {
  const user = await tx.platformUser.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      createdAt: true,
      emailVerifiedAt: true,
      adultAcknowledgedAt: true,
      adultPolicyVersion: true,
      suspendedAt: true,
      deactivatedAt: true,
      erasedAt: true,
      metricExcluded: true,
      operatorGrants: {
        where: { revokedAt: null },
        select: { id: true },
        take: 1
      },
      supportGrants: {
        where: { revokedAt: null },
        select: { id: true },
        take: 1
      }
    }
  });
  return {
    user,
    eligible:
      isEligible(user) &&
      !user.erasedAt &&
      !user.metricExcluded &&
      !user.operatorGrants.length &&
      !user.supportGrants.length
  };
}
export function recentMetricSessions(starts: Date[], now: Date) {
  const cutoff = now.getTime() - METRIC_RAW_DAYS * 86400000;
  return starts
    .filter((at) => at.getTime() >= cutoff && at <= now)
    .sort((a, b) => a.getTime() - b.getTime())
    .slice(-3);
}
export async function measurementStateIn(tx: Tx, userId: string) {
  const row = await tx.platformMeasurementChoice.findUnique({
    where: { userId }
  });
  const actor = await metricActor(tx, userId);
  let configured = false,
    zone = METRIC_ZONE,
    configurationMessage = "Optional measurement is awaiting configuration.";
  try {
    const configuration = await metricConfiguration(tx);
    zone = configuration.zone;
    configured = process.env.PLATFORM_MEASUREMENT_ENABLED === "true";
    if (configured)
      configurationMessage = "Optional platform measurement is available.";
  } catch {
    configurationMessage =
      "Optional measurement is paused while reporting configuration is reviewed. You can still turn it off.";
  }
  const available = configured && actor.eligible;
  const expiredCursor =
    !!row?.lastForegroundAt &&
    row.lastForegroundAt.getTime() < Date.now() - METRIC_RAW_DAYS * 86400000;
  return {
    ownerId: userId,
    policy: METRIC_POLICY,
    version: row?.version ?? 0,
    enabled: !!row?.enabledAt,
    shareDevice: row?.shareDevice ?? false,
    referral: row?.referral ?? "UNKNOWN",
    foregroundCursor: expiredCursor
      ? null
      : (row?.lastForegroundAt?.toISOString() ?? null),
    available,
    collecting: available && !!row?.enabledAt && !expiredCursor,
    zone,
    rawDays: METRIC_RAW_DAYS,
    message: !actor.eligible
      ? "Optional use measurement is off for unverified, ineligible or operational accounts."
      : expiredCursor
        ? "Optional collection is paused until expired use facts are cleared. You can still turn measurement off."
        : configurationMessage
  };
}
export function readMeasurementChoice(db: PrismaClient, token: unknown) {
  return withOwnedSession(
    db,
    token,
    (tx, current) => measurementStateIn(tx, current.userId),
    "shared"
  );
}
export type MeasurementState = Awaited<
  ReturnType<typeof readMeasurementChoice>
>;

export function saveMeasurementChoice(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, [
    "operation",
    "mutationId",
    "expectedVersion",
    "enabled",
    "shareDevice",
    "referral"
  ]);
  if (
    input.operation !== "choice" ||
    typeof input.enabled !== "boolean" ||
    typeof input.shareDevice !== "boolean" ||
    typeof input.referral !== "string" ||
    !Object.hasOwn(metricReferrals, input.referral) ||
    (!input.enabled && (input.shareDevice || input.referral !== "UNKNOWN"))
  )
    throw new PortalError(
      400,
      "Review the optional measurement choices. Turning measurement off also removes optional source and device choices."
    );
  const enabled = input.enabled,
    shareDevice = input.shareDevice,
    referral = input.referral;
  return socialCommand(
    db,
    token,
    "platform-measurement-choice",
    input,
    async (tx, userId) => {
      const previous = await tx.platformMeasurementChoice.findUnique({
        where: { userId }
      });
      expected(input.expectedVersion, previous?.version ?? 0);
      const now = new Date();
      let cohortEligible = previous?.cohortEligible ?? false;
      if (enabled) {
        const state = await measurementStateIn(tx, userId);
        if (!state.available) throw new PortalError(400, state.message);
        if (!previous) {
          const configuration = await metricConfiguration(tx),
            { user } = await metricActor(tx, userId);
          cohortEligible =
            user.createdAt >= configuration.startedAt &&
            metricDay(user.createdAt, configuration.zone) ===
              metricDay(now, configuration.zone);
        }
      }
      const data = {
        policy: METRIC_POLICY,
        enabledAt: enabled ? (previous?.enabledAt ?? now) : null,
        shareDevice,
        referral,
        cohortEligible: enabled && cohortEligible,
        ...(!enabled
          ? {
              lastForegroundAt: null,
              eligibleSessions: 0,
              sessionStarts: [],
              onboardingStartedAt: null,
              onboardingCompletedAt: null,
              onboardingSkippedAt: null
            }
          : {})
      };
      const saved = await tx.platformMeasurementChoice.upsert({
        where: { userId },
        create: { userId, ...data },
        update: { ...data, version: { increment: 1 } }
      });
      if (!shareDevice)
        await tx.platformMetricActivityDay.updateMany({
          where: { userId },
          data: { device: "UNKNOWN", browser: "UNKNOWN" }
        });
      return {
        id: userId,
        version: saved.version,
        message:
          "Your measurement choice was saved. Current settings show whether collection is available."
      };
    }
  );
}

/** A caller can report a foreground signal, never an actor, client clock, path or action outcome. */
export function recordMetricForeground(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, [
    "operation",
    "choiceVersion",
    "afterForegroundAt",
    "device",
    "browser"
  ]);
  if (
    input.operation !== "foreground" ||
    !Number.isSafeInteger(input.choiceVersion) ||
    !(
      input.afterForegroundAt === null ||
      (typeof input.afterForegroundAt === "string" &&
        /^20\d{2}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(
          input.afterForegroundAt
        ))
    ) ||
    typeof input.device !== "string" ||
    !Object.hasOwn(metricDevices, input.device) ||
    typeof input.browser !== "string" ||
    !Object.hasOwn(metricBrowsers, input.browser)
  )
    throw new PortalError(400, "Use the supported foreground signal.");
  const device = input.device,
    browser = input.browser;
  return withOwnedSession(
    db,
    token,
    async (tx, current) => {
      const choice = await tx.platformMeasurementChoice.findUnique({
        where: { userId: current.userId }
      });
      if (
        process.env.PLATFORM_MEASUREMENT_ENABLED !== "true" ||
        !choice?.enabledAt ||
        choice.policy !== METRIC_POLICY ||
        choice.version !== input.choiceVersion ||
        !(await metricActor(tx, current.userId)).eligible
      )
        return { accepted: false };
      const configuration = await metricConfiguration(tx),
        now = new Date();
      if (
        choice.lastForegroundAt &&
        choice.lastForegroundAt.getTime() <
          now.getTime() - METRIC_RAW_DAYS * 86400000
      )
        return { accepted: false };
      // The cursor is a previously read server value, not a client event clock.
      // Concurrent tabs and exact retries cannot advance the same observation twice.
      if (
        input.afterForegroundAt !==
        (choice.lastForegroundAt?.toISOString() ?? null)
      )
        return {
          accepted: true,
          cursor: choice.lastForegroundAt?.toISOString() ?? null
        };
      if (
        choice.lastForegroundAt &&
        now.getTime() - choice.lastForegroundAt.getTime() <
          METRIC_SIGNAL_INTERVAL_MS
      )
        return {
          accepted: true,
          cursor: choice.lastForegroundAt.toISOString()
        };
      const starts = recentMetricSessions(choice.sessionStarts, now);
      if (
        !choice.lastForegroundAt ||
        now.getTime() - choice.lastForegroundAt.getTime() >=
          METRIC_SESSION_GAP_MS
      )
        starts.push(now);
      const boundedStarts = starts.slice(-3);
      await tx.platformMeasurementChoice.update({
        where: { userId: current.userId },
        data: {
          lastForegroundAt: now,
          sessionStarts: boundedStarts,
          eligibleSessions: boundedStarts.length
        }
      });
      const day = new Date(metricDay(now, configuration.zone) + "T00:00:00Z");
      const dimensions = {
        device: choice.shareDevice ? device : "UNKNOWN",
        browser: choice.shareDevice ? browser : "UNKNOWN"
      };
      await tx.platformMetricActivityDay.upsert({
        where: {
          userId_version_day: {
            userId: current.userId,
            version: configuration.version,
            day
          }
        },
        create: {
          userId: current.userId,
          version: configuration.version,
          day,
          firstAt: now,
          lastAt: now,
          ...dimensions
        },
        update: { lastAt: now, ...dimensions }
      });
      return { accepted: true, cursor: now.toISOString() };
    },
    "shared"
  );
}

/** Shared optional onboarding facts; callers must confirm actual presentation or native completion. */
export async function recordMetricOnboarding(
  tx: Tx,
  userId: string,
  kind: "STARTED" | "COMPLETED" | "SKIPPED"
) {
  if (
    process.env.PLATFORM_MEASUREMENT_ENABLED !== "true" ||
    !(await metricActor(tx, userId)).eligible
  )
    return false;
  const choice = await tx.platformMeasurementChoice.findUnique({
    where: { userId }
  });
  if (!choice?.enabledAt || choice.policy !== METRIC_POLICY) return false;
  await metricConfiguration(tx);
  const now = new Date();
  if (kind !== "STARTED" && !choice.onboardingStartedAt) return false; // Historical start is unknown.
  const data =
    kind === "STARTED"
      ? !choice.onboardingStartedAt
        ? { onboardingStartedAt: now }
        : {}
      : kind === "SKIPPED"
        ? !choice.onboardingSkippedAt
          ? { onboardingSkippedAt: now }
          : {}
        : !choice.onboardingCompletedAt
          ? { onboardingCompletedAt: now }
          : {};
  if (Object.keys(data).length)
    await tx.platformMeasurementChoice.update({ where: { userId }, data });
  return true;
}

/** Called inside the native command, before its idempotent receipt. A telemetry failure rolls back only its savepoint. */
export async function optionalOnboardingOutcome(
  tx: Tx,
  userId: string,
  kind: "COMPLETED" | "SKIPPED"
) {
  if (process.env.PLATFORM_MEASUREMENT_ENABLED !== "true") return;
  await tx.$executeRawUnsafe("SAVEPOINT optional_onboarding_metric");
  try {
    await recordMetricOnboarding(tx, userId, kind);
  } catch {
    await tx.$executeRawUnsafe(
      "ROLLBACK TO SAVEPOINT optional_onboarding_metric"
    );
  } finally {
    await tx.$executeRawUnsafe("RELEASE SAVEPOINT optional_onboarding_metric");
  }
}
export function recordOnboardingPresentation(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, ["operation", "choiceVersion"]);
  if (
    input.operation !== "onboarding-start" ||
    !Number.isSafeInteger(input.choiceVersion)
  )
    throw new PortalError(400, "Use the current optional onboarding choice.");
  return withOwnedSession(
    db,
    token,
    async (tx, current) => {
      const choice = await tx.platformMeasurementChoice.findUnique({
        where: { userId: current.userId }
      });
      if (choice?.version !== input.choiceVersion) return { accepted: false };
      return {
        accepted: await recordMetricOnboarding(tx, current.userId, "STARTED")
      };
    },
    "shared"
  );
}

/** A restore cannot resurrect older optional choices, foreground facts or use-session eligibility. */
export async function clearRestoredMeasurements(tx: Tx) {
  const days = await tx.platformMetricActivityDay.deleteMany({});
  const choices = await tx.platformMeasurementChoice.updateMany({
    where: { enabledAt: { not: null } },
    data: {
      enabledAt: null,
      shareDevice: false,
      referral: "UNKNOWN",
      lastForegroundAt: null,
      eligibleSessions: 0,
      sessionStarts: [],
      cohortEligible: false,
      onboardingStartedAt: null,
      onboardingCompletedAt: null,
      onboardingSkippedAt: null,
      version: { increment: 1 }
    }
  });
  return { days: days.count, choices: choices.count };
}

/** Existing maintenance calls this bounded cleanup; reports independently ignore expired facts. */
export async function purgeExpiredMeasurements(tx: Tx, now = new Date()) {
  const cutoff = new Date(now.getTime() - METRIC_RAW_DAYS * 86400000);
  const days = await tx.$executeRaw`WITH expired AS (
    SELECT "userId",version,day FROM "PlatformMetricActivityDay" WHERE "lastAt" < ${metricUtc(cutoff)} ORDER BY "lastAt" LIMIT 1000
  ) DELETE FROM "PlatformMetricActivityDay" d USING expired e WHERE d."userId"=e."userId" AND d.version=e.version AND d.day=e.day`;
  const trimmedDays = await tx.$executeRaw`WITH expired AS (
    SELECT "userId",version,day FROM "PlatformMetricActivityDay" WHERE "firstAt"<${metricUtc(cutoff)} AND "lastAt">=${metricUtc(cutoff)} ORDER BY "firstAt" LIMIT 1000
  ) UPDATE "PlatformMetricActivityDay" d SET "firstAt"=d."lastAt" FROM expired e WHERE d."userId"=e."userId" AND d.version=e.version AND d.day=e.day`;
  const choices = await tx.$executeRaw`WITH expired AS (
    SELECT "userId" FROM "PlatformMeasurementChoice" WHERE "lastForegroundAt" < ${metricUtc(cutoff)}
      OR "onboardingStartedAt" < ${metricUtc(cutoff)} OR "onboardingCompletedAt" < ${metricUtc(cutoff)} OR "onboardingSkippedAt" < ${metricUtc(cutoff)}
      OR EXISTS(SELECT 1 FROM unnest("sessionStarts") s WHERE s < ${metricUtc(cutoff)}) LIMIT 1000
  ), pruned AS (
    SELECT p."userId", ARRAY(SELECT s FROM unnest(p."sessionStarts") s WHERE s >= ${metricUtc(cutoff)} AND s <= ${metricUtc(now)} ORDER BY s) AS starts
    FROM "PlatformMeasurementChoice" p JOIN expired e ON e."userId"=p."userId"
  ) UPDATE "PlatformMeasurementChoice" p SET "sessionStarts"=pruned.starts,"eligibleSessions"=cardinality(pruned.starts),
    version=p.version+CASE WHEN p."lastForegroundAt" < ${metricUtc(cutoff)} THEN 1 ELSE 0 END,
    "lastForegroundAt"=CASE WHEN p."lastForegroundAt" < ${metricUtc(cutoff)} THEN NULL ELSE p."lastForegroundAt" END,
    "onboardingStartedAt"=CASE WHEN p."onboardingStartedAt" < ${metricUtc(cutoff)} THEN NULL ELSE p."onboardingStartedAt" END,
    "onboardingCompletedAt"=CASE WHEN p."onboardingCompletedAt" < ${metricUtc(cutoff)} THEN NULL ELSE p."onboardingCompletedAt" END,
    "onboardingSkippedAt"=CASE WHEN p."onboardingSkippedAt" < ${metricUtc(cutoff)} THEN NULL ELSE p."onboardingSkippedAt" END
    FROM pruned WHERE p."userId"=pruned."userId"`;
  return { days, choices, trimmedDays };
}
