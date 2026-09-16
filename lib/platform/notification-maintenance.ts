import {
  dispatchNotificationFanout,
  cleanNotificationFanout,
  NOTIFICATION_FANOUT_TOPIC
} from "./notification-fanout";
import {
  dispatchScheduledPosts,
  SCHEDULED_PUBLICATION_TOPIC
} from "./scheduled-publication";
import { dispatchFounderAnnouncements } from "./founder-announcement-queue";
import { cleanFounderAnnouncements } from "./founder-announcements";
import {
  cleanCommentFollowerJobs,
  dispatchCommentFollowers,
  COMMENT_FOLLOWER_TOPIC
} from "./comment-followers";
import { dispatchPendingFounderWelcomes } from "./founder-welcome-queue";
import { dispatchPrivilegedNotices } from "./privileged-auth-notices";
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
import {
  notificationFanoutMessage,
  scheduledPublicationMessage
} from "./notification-work-message";
export async function handleNotificationMaintenance(
  db: PrismaClient,
  request: Request,
  publish?: QueuePublish,
  signal = AbortSignal.timeout(40000)
) {
  const rejected = maintenanceRequestError(request);
  if (rejected) return rejected;
  const mode = new URL(request.url).searchParams.get("mode");
  if (
    mode &&
    ![
      "inspect",
      "probe",
      "probe-followers",
      "probe-activity",
      "probe-scheduled"
    ].includes(mode)
  )
    return Response.json(
      { error: "Choose inspection, a queue probe or the maintenance run." },
      { status: 400, headers }
    );
  try {
    if (
      mode === "probe" ||
      mode === "probe-followers" ||
      mode === "probe-activity" ||
      mode === "probe-scheduled"
    ) {
      // A single reserved, nonexistent delivery verifies the deployed private
      // consumer. It cannot create an app message, subscription or phone alert.
      if (!publish && process.env.VERCEL !== "1")
        throw Error("Deployed queue required");
      const id = `probe-${randomUUID()}`;
      if (await db.notificationDelivery.findUnique({ where: { id } }))
        throw Error("Probe collision");
      if (await db.commentFollowerJob.findUnique({ where: { commentId: id } }))
        throw Error("Probe collision");
      if (await db.notificationFanoutJob.findUnique({ where: { id } }))
        throw Error("Probe collision");
      if (await db.platformPost.findUnique({ where: { id } }))
        throw Error("Probe collision");
      const key = `${mode}-queue-probe:${Math.floor(Date.now() / 3600000)}`;
      const result = publish
        ? await publish(id, 0, key)
        : await (
            await import("@vercel/queue")
          ).send(
            mode === "probe-scheduled"
              ? SCHEDULED_PUBLICATION_TOPIC
              : mode === "probe-activity"
                ? NOTIFICATION_FANOUT_TOPIC
                : mode === "probe-followers"
                  ? COMMENT_FOLLOWER_TOPIC
                  : PUSH_TOPIC,
            mode === "probe-scheduled"
              ? scheduledPublicationMessage({ id, version: 1 })
              : mode === "probe-activity"
                ? notificationFanoutMessage(id)
                : { id },
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
      const [
        devices,
        pending,
        conversationFollowers,
        activityFanout,
        scheduledPosts
      ] = await Promise.all([
        db.pushSubscription.count({
          where: { revokedAt: null, expiresAt: { gt: new Date() } }
        }),
        db.notificationDelivery.count({
          where: { state: { not: "FINISHED" } }
        }),
        db.commentFollowerJob.count({ where: { completedAt: null } }),
        db.notificationFanoutJob.count({ where: { completedAt: null } }),
        db.platformPost.count({ where: { status: "SCHEDULED" } })
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
          pending,
          conversationFollowers,
          activityFanout,
          scheduledPosts
        },
        { headers }
      );
    }
    const cleanup = await notificationWrite(db, async (tx) => ({
      ...(await cleanNotificationRecords(tx)),
      announcementDiagnosticsRemoved: await cleanFounderAnnouncements(tx),
      activityJobsRemoved: await cleanNotificationFanout(tx),
      conversationJobsRemoved: await cleanCommentFollowerJobs(tx)
    }));
    let queued = 0,
      failed = 0;
    let scheduledQueued = 0;
    for (let batch = 0; batch < 5 && !signal.aborted; batch++) {
      const schedules = await dispatchScheduledPosts(db);
      scheduledQueued += schedules.queued;
      failed += schedules.failed;
      if (schedules.failed || schedules.queued < 100) break;
    }
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
    const followers = signal.aborted
      ? { queued: 0, failed: 1 }
      : await dispatchCommentFollowers(db);
    const activity = signal.aborted
      ? { queued: 0, failed: 1 }
      : await dispatchNotificationFanout(db);
    failed +=
      welcomes.failed +
      announcements.failed +
      followers.failed +
      activity.failed;
    const security = signal.aborted ? { delivered: 0, pending: 1 } : await dispatchPrivilegedNotices(db);
    failed += security.pending;
    const result = {
      ok: failed === 0,
      ...cleanup,
      queued,
      scheduledQueued,
      failed,
      welcomeQueued: welcomes.queued,
      announcementQueued: announcements.queued,
      conversationQueued: followers.queued,
      activityQueued: activity.queued,
      securityNoticesDelivered: security.delivered
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
