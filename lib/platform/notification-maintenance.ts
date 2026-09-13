import { dispatchFounderAnnouncements } from "./founder-announcement-queue";
import { cleanFounderAnnouncements } from "./founder-announcements";
import { dispatchPendingFounderWelcomes } from "./founder-welcome-queue";
import type { PrismaClient } from "@prisma/client";
import {
  maintenanceHeaders as headers,
  maintenanceRequestError
} from "./maintenance-request";
import {
  cleanNotificationRecords,
  notificationWrite
} from "./notification-outbox";
import { dispatchNotifications, type QueuePublish } from "./notification-queue";
export async function handleNotificationMaintenance(
  db: PrismaClient,
  request: Request,
  publish?: QueuePublish,
  signal = AbortSignal.timeout(40000)
) {
  const rejected = maintenanceRequestError(request);
  if (rejected) return rejected;
  try {
    const cleanup = await notificationWrite(db, async (tx) => ({
      ...(await cleanNotificationRecords(tx)),
      announcementDiagnosticsRemoved: await cleanFounderAnnouncements(tx)
    }));
    let queued = 0,
      failed = 0;
    for (let batch = 0; batch < 5 && !signal.aborted; batch++) {
      const result = await dispatchNotifications(db, undefined, publish);
      queued += result.queued;
      failed += result.failed;
      if (result.failed || result.queued < 100) break;
    }
    const welcomes = signal.aborted
      ? { queued: 0, failed: 1 }
      : await dispatchPendingFounderWelcomes(db);
    const announcements = signal.aborted
      ? { queued: 0, failed: 1 }
      : await dispatchFounderAnnouncements(db);
    failed += welcomes.failed + announcements.failed;
    const result = {
      ok: failed === 0,
      ...cleanup,
      queued,
      failed,
      welcomeQueued: welcomes.queued,
      announcementQueued: announcements.queued
    };
    console.info("notification_maintenance_completed", result);
    return Response.json(result, { status: failed ? 503 : 200, headers });
  } catch {
    console.error("notification_maintenance_incomplete");
    return Response.json(
      {
        error:
          "Notification recovery did not complete. Pending work is retained."
      },
      { status: 503, headers }
    );
  }
}
