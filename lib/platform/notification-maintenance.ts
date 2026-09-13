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
import {
  dispatchNotifications,
  PUSH_TOPIC,
  type QueuePublish
} from "./notification-queue";
import { createHash, randomUUID } from "node:crypto";
import { pushServerConfig } from "./push-config";
export async function handleNotificationMaintenance(
  db: PrismaClient,
  request: Request,
  publish?: QueuePublish,
  signal = AbortSignal.timeout(40000)
) {
  const rejected = maintenanceRequestError(request);
  if (rejected) return rejected;
  const mode = new URL(request.url).searchParams.get("mode");
  if (mode && !["inspect", "probe"].includes(mode))
    return Response.json(
      { error: "Choose inspection, a queue probe or the maintenance run." },
      { status: 400, headers }
    );
  try {
    if (mode === "probe") {
      // A single reserved, nonexistent delivery verifies the deployed private
      // consumer. It cannot create an app message, subscription or phone alert.
      if (!publish && process.env.VERCEL !== "1")
        throw Error("Deployed queue required");
      const id = `probe-${randomUUID()}`;
      if (await db.notificationDelivery.findUnique({ where: { id } }))
        throw Error("Probe collision");
      const key = `phone-queue-probe:${Math.floor(Date.now() / 3600000)}`;
      const result = publish
        ? await publish(id, 0, key)
        : await (
            await import("@vercel/queue")
          ).send(
            PUSH_TOPIC,
            { id },
            {
              retentionSeconds: 60,
              idempotencyKey: key
            }
          );
      return Response.json(
        {
          mode,
          queued: 1,
          applicationWrites: 0,
          providerMessageId:
            result && typeof result === "object" && "messageId" in result
              ? result.messageId
              : null
        },
        { headers }
      );
    }
    if (mode === "inspect") {
      const config = pushServerConfig();
      const [devices, pending] = await Promise.all([
        db.pushSubscription.count({
          where: { revokedAt: null, expiresAt: { gt: new Date() } }
        }),
        db.notificationDelivery.count({ where: { state: { not: "FINISHED" } } })
      ]);
      return Response.json(
        {
          mode,
          configured: !!config,
          publicKeyFingerprint: config
            ? createHash("sha256")
                .update(config.publicKey)
                .digest("hex")
                .slice(0, 16)
            : null,
          devices,
          pending
        },
        { headers }
      );
    }
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
