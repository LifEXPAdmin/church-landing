import type { PrismaClient } from "@prisma/client";
import {
  maintenanceHeaders,
  maintenanceRequestError
} from "./maintenance-request";
import { pushAvailable } from "./push-config";
import { imagesAvailable } from "./media-storage";
import { eligibleWhere } from "./portal-policy";

type Backlog = {
  pending: number;
  due: number;
  oldestPendingAt: string | null;
  oldestDueAt: string | null;
};
type WorkerSnapshot = {
  media: Backlog;
  uploads: { active: number; expired: number };
  notifications: Backlog;
  failedDeliveries24h: number;
  retention: {
    pendingControls: number;
    oldestControlAt: string | null;
    pendingPurges: number;
    pendingAccounts: number;
    overdueAccounts: number;
    overdueReviews: number;
    overdueHolds: number;
  };
  welcome: { pending: number; oldestPendingAt: string | null };
  announcements: { pending: number; oldestPendingAt: string | null };
  scheduledPosts: { pending: number; due: number; oldestDueAt: string | null };
};
const secondsSince = (time: string | null, now: Date) =>
  time
    ? Math.max(0, Math.floor((now.getTime() - Date.parse(time)) / 1000))
    : null;

/** Aggregate operational evidence only. No content, identities or provider keys. */
export async function readOperationalHealth(
  db: PrismaClient,
  now = new Date()
) {
  const started = performance.now();
  const snapshot = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      await tx.$executeRaw`SET LOCAL statement_timeout = '3000ms'`;
      const [row] = await tx.$queryRaw<Array<{ snapshot: WorkerSnapshot }>>`
      SELECT json_build_object(
        'media', (SELECT json_build_object('pending',count(*),'due',count(*) FILTER (WHERE "dueAt" <= ${now.toISOString()}::timestamp),
          'oldestPendingAt',min("dueAt") AT TIME ZONE 'UTC','oldestDueAt',(min("dueAt") FILTER (WHERE "dueAt" <= ${now.toISOString()}::timestamp)) AT TIME ZONE 'UTC') FROM "MediaGarbage"),
        'uploads', (SELECT json_build_object('active',count(*) FILTER (WHERE "leaseUntil" > ${now.toISOString()}::timestamp),
          'expired',count(*) FILTER (WHERE "leaseUntil" <= ${now.toISOString()}::timestamp)) FROM "MediaAsset" WHERE status='UPLOADING'),
        'notifications', (SELECT json_build_object('pending',count(*),'due',count(*) FILTER (WHERE due <= ${now.toISOString()}::timestamp),
          'oldestPendingAt',min("createdAt") AT TIME ZONE 'UTC','oldestDueAt',(min(due) FILTER (WHERE due <= ${now.toISOString()}::timestamp)) AT TIME ZONE 'UTC')
          FROM (SELECT "createdAt", CASE WHEN state='IN_FLIGHT' THEN "leaseUntil" ELSE "availableAt" END due
            FROM "NotificationDelivery" WHERE state IN ('QUEUED','IN_FLIGHT')) n),
        'failedDeliveries24h', (SELECT count(*) FROM "NotificationDelivery" WHERE state='FINISHED'
          AND outcome='FAILED' AND "finishedAt">=${new Date(now.getTime() - 86_400_000).toISOString()}::timestamp),
        'retention', json_build_object(
          'pendingControls',(SELECT count(*) FROM "RetentionControl" WHERE "journaledAt" IS NULL),
          'oldestControlAt',(SELECT min("createdAt") AT TIME ZONE 'UTC' FROM "RetentionControl" WHERE "journaledAt" IS NULL),
          'pendingPurges',(SELECT count(*) FROM "RetentionPurge" WHERE "completedAt" IS NULL OR "journaledAt" IS NULL),
          'pendingAccounts',(SELECT count(*) FROM "AccountDeletion" WHERE "completedAt" IS NULL OR "completionJournaledAt" IS NULL),
          'overdueAccounts',(SELECT count(*) FROM "AccountDeletion" WHERE ("completedAt" IS NULL OR "completionJournaledAt" IS NULL) AND "dueAt"<=${now.toISOString()}::timestamp),
          'overdueReviews',(SELECT count(*) FROM "CommunityReport" WHERE status<>'CLOSED' AND "reviewDueAt"<=${now.toISOString()}::timestamp),
          'overdueHolds',(SELECT count(*) FROM "RetentionHold" WHERE "releasedAt" IS NULL AND "reviewDueAt"<=${now.toISOString()}::timestamp)),
        'announcements',(SELECT json_build_object('pending',count(*),'oldestPendingAt',min("queuedAt") AT TIME ZONE 'UTC')
          FROM "FounderAnnouncement" WHERE status='SENDING'),
        'scheduledPosts',(SELECT json_build_object('pending',count(*),'due',count(*) FILTER (WHERE "scheduleAt"<=${now.toISOString()}::timestamp),
          'oldestDueAt',(min("scheduleAt") FILTER (WHERE "scheduleAt"<=${now.toISOString()}::timestamp)) AT TIME ZONE 'UTC') FROM "PlatformPost" WHERE status='SCHEDULED')
      ) AS snapshot`;
      if (!row) throw Error("Health snapshot unavailable");
      const welcome = await tx.platformUser.aggregate({
        where: { ...eligibleWhere, pendingFounderWelcomeAt: { not: null } },
        _count: { _all: true },
        _min: { pendingFounderWelcomeAt: true }
      });
      // Accounts still awaiting verification are not dispatchable worker backlog.
      row.snapshot.welcome = {
        pending: welcome._count._all,
        oldestPendingAt:
          welcome._min.pendingFounderWelcomeAt?.toISOString() ?? null
      };
      return row.snapshot;
    },
    { maxWait: 3000, timeout: 6000 }
  );
  const ages = {
    mediaDueSeconds: secondsSince(snapshot.media.oldestDueAt, now),
    notificationDueSeconds: secondsSince(
      snapshot.notifications.oldestDueAt,
      now
    ),
    protectedControlSeconds: secondsSince(
      snapshot.retention.oldestControlAt,
      now
    ),
    welcomePendingSeconds: secondsSince(snapshot.welcome.oldestPendingAt, now),
    announcementPendingSeconds: secondsSince(
      snapshot.announcements.oldestPendingAt,
      now
    )
  };
  const alerts: string[] = [];
  if ((ages.mediaDueSeconds ?? 0) > 90_000 || snapshot.media.due > 100)
    alerts.push("media_backlog");
  if ((ages.notificationDueSeconds ?? 0) > 300)
    alerts.push("notification_backlog");
  if (snapshot.failedDeliveries24h) alerts.push("notification_failures");
  if ((ages.protectedControlSeconds ?? 0) > 300)
    alerts.push("unprotected_retention_controls");
  if (
    snapshot.retention.overdueAccounts ||
    snapshot.retention.overdueReviews ||
    snapshot.retention.overdueHolds
  )
    alerts.push("retention_deadline");
  if (
    (ages.welcomePendingSeconds ?? 0) > 300 ||
    (ages.announcementPendingSeconds ?? 0) > 300
  )
    alerts.push("founder_delivery_backlog");
  if (snapshot.scheduledPosts.due)
    alerts.push("scheduled_publishing_not_configured");
  return {
    schema: 1,
    checkedAt: now.toISOString(),
    database: {
      available: true,
      inspectionMs: Math.round(performance.now() - started)
    },
    configuration: {
      uploadsEnabled: imagesAvailable(),
      privateStorageConfigured: !!(
        process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID
      ),
      pushConfigured: pushAvailable(),
      retentionEnabled: process.env.RETENTION_CLEANUP_ENABLED === "true",
      welcomeEnabled: process.env.FOUNDER_WELCOME_ENABLED === "true",
      scheduledPublishingConfigured: false
    },
    queues: snapshot,
    ages,
    limits: {
      imagePrefixesPerRun: 100,
      imageRunSeconds: 40,
      imageIntervalMs: 350,
      mediaDueWarningSeconds: 90_000,
      deliveryWarningSeconds: 300
    },
    workerLastSuccess: "unavailable; inspect scoped completion logs",
    needsAttention: alerts.length > 0,
    alerts
  };
}

export async function handleOperationalHealth(
  db: PrismaClient,
  request: Request
) {
  const rejected = maintenanceRequestError(request);
  if (rejected) return rejected;
  const headers = {
    ...maintenanceHeaders,
    "X-Robots-Tag": "noindex, nofollow"
  };
  try {
    const snapshot = await readOperationalHealth(db);
    return Response.json(snapshot, {
      status: snapshot.needsAttention ? 503 : 200,
      headers
    });
  } catch {
    return Response.json(
      {
        schema: 1,
        checkedAt: new Date().toISOString(),
        database: { available: false },
        needsAttention: true,
        alerts: ["health_unavailable"]
      },
      { status: 503, headers }
    );
  }
}
