import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import webpush from "web-push";
import {
  assertPortalTestDatabase,
  createPortalActor,
  type PortalActor
} from "./seed-portal";
import { seedParticipation } from "./seed-post-participation";
import { seedNotificationDevice } from "./seed-notifications";
import {
  notificationPreferenceCommand,
  readNotificationPreferences
} from "../lib/platform/notification-preferences";
import {
  advanceCalendarReminders,
  dispatchCalendarReminders,
  recoverCalendarReminders
} from "../lib/platform/calendar-reminders";
import { volunteerReminderSources } from "../lib/platform/volunteer-reminder-policy";
import { calendarCommand } from "../lib/platform/calendar-commands";
import { recordFanout } from "../lib/platform/domain-activity";
import { advanceNotificationFanout } from "../lib/platform/notification-fanout";
import {
  deliverNotification,
  notificationWrite
} from "../lib/platform/notification-outbox";
import { readActivity } from "../lib/platform/activity";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";

const db = new PrismaClient(),
  owners: string[] = [];
const original = Object.fromEntries(
  [
    "PUSH_ENABLED",
    "PUSH_VAPID_PUBLIC_KEY",
    "PUSH_VAPID_PRIVATE_KEY",
    "PUSH_VAPID_SUBJECT"
  ].map((k) => [k, process.env[k]])
);
before(async () => {
  await assertPortalTestDatabase(db);
  const keys = webpush.generateVAPIDKeys();
  Object.assign(process.env, {
    PUSH_ENABLED: "true",
    PUSH_VAPID_PUBLIC_KEY: keys.publicKey,
    PUSH_VAPID_PRIVATE_KEY: keys.privateKey,
    PUSH_VAPID_SUBJECT: "https://example.test/contact"
  });
});
after(async () => {
  for (const [k, v] of Object.entries(original))
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  await db.socialPreferences.updateMany({
    where: { ownerId: { in: owners } },
    data: {
      calendarReminderMinutes: 0,
      calendarReminderSince: null,
      volunteerReminderMinutes: 0,
      volunteerReminderSince: null
    }
  });
  await db.calendarReminderJob.deleteMany({
    where: { ownerId: { in: owners } }
  });
  await db.$disconnect();
});
const noHandoff = async () => ({ failed: 0 });
async function preferences(
  a: PortalActor,
  volunteer: number,
  extra: Record<string, unknown> = {}
) {
  const view = await readNotificationPreferences(db, a.token);
  const input = {
    operation: "preferences",
    mutationId: randomUUID(),
    ownerId: a.id,
    expectedVersion: view.preferences.version,
    inApp: view.preferences.inApp,
    pushCategories: view.preferences.pushCategories,
    quietHours: view.preferences.quietHours,
    volunteerReminderMinutes: volunteer,
    ...extra
  };
  const saved = await notificationPreferenceCommand(db, a.token, input);
  assert.deepEqual(
    await notificationPreferenceCommand(db, a.token, input),
    saved
  );
  return input;
}
async function fixture(count = 1, push = false, mixed = false) {
  const f = await seedParticipation(db),
    a = f.lee;
  owners.push(a.id);
  if (push) await seedNotificationDevice(db, a);
  await preferences(a, mixed ? 60 : 15, {
    calendarReminderMinutes: mixed ? 15 : 0,
    pushCategories: push ? ["commitments"] : []
  });
  const now = new Date(),
    old = new Date(now.getTime() - 120000),
    due = new Date(now.getTime() - 5000);
  const start = new Date(due.getTime() + (mixed ? 60 : 15) * 60000);
  const parentStart = new Date(due.getTime() + (mixed ? 15 : 5) * 60000);
  const slots: string[] = [],
    signups: string[] = [];
  for (let i = 0; i < count; i++) {
    const slot = await f.slot({
      role: `Fictional reminder role ${i}`,
      capacity: 2
    });
    const signup = await f.command(a, {
      operation: "volunteer",
      slotId: slot.id,
      slotVersion: 1,
      expectedVersion: 0
    });
    slots.push(slot.id);
    signups.push(signup.id);
  }
  if (mixed)
    await calendarCommand(db, a.token, {
      operation: "rsvp",
      eventId: f.event.id,
      occurrenceId: f.occurrence.id,
      occurrenceVersion: 1,
      expectedVersion: 0,
      state: "GOING"
    });
  await db.calendarOccurrence.update({
    where: { id: f.occurrence.id },
    data: {
      startAt: parentStart,
      endAt: new Date(start.getTime() + 3600000),
      updatedAt: old
    }
  });
  await db.postVolunteerSlot.updateMany({
    where: { id: { in: slots } },
    data: {
      shiftStartAt: start,
      shiftEndAt: new Date(start.getTime() + 1800000),
      updatedAt: old
    }
  });
  await db.postVolunteerSignup.updateMany({
    where: { id: { in: signups } },
    data: { updatedAt: old }
  });
  if (mixed)
    await db.calendarResponse.updateMany({
      where: { userId: a.id, occurrenceId: f.occurrence.id },
      data: { updatedAt: old }
    });
  await db.socialPreferences.update({
    where: { ownerId: a.id },
    data: {
      volunteerReminderSince: old,
      ...(mixed ? { calendarReminderSince: old } : {}),
      notificationPushSince: push ? { commitments: old.toISOString() } : {}
    }
  });
  if (push)
    await db.pushSubscription.updateMany({
      where: { ownerId: a.id },
      data: { createdAt: old }
    });
  await db.calendarReminderJob.update({
    where: { ownerId: a.id },
    data: { throughAt: old, throughId: "", wakeAt: due }
  });
  const job = () =>
    db.calendarReminderJob.findUniqueOrThrow({ where: { ownerId: a.id } });
  const advance = async (at = new Date()) =>
    advanceCalendarReminders(db, a.id, (await job()).version, at, noHandoff);
  const notices = () =>
    db.socialEvent.findMany({
      where: { recipientId: a.id, kind: "VOLUNTEER_REMINDER" }
    });
  return { ...f, a, old, due, start, slots, signups, job, advance, notices };
}

test("volunteer reminders default Off, preserve RSVP consent and legacy saves, validate input and protect recovery", async () => {
  const a = await createPortalActor(db, "volunteerreminderprefs");
  owners.push(a.id);
  const initial = await readNotificationPreferences(db, a.token);
  assert.equal(initial.preferences.volunteerReminderMinutes, 0);
  await preferences(a, 0, { calendarReminderMinutes: 15 });
  assert.equal(
    (await readNotificationPreferences(db, a.token)).preferences
      .volunteerReminderMinutes,
    0
  );
  const input = await preferences(a, 60),
    prior = await db.socialPreferences.findUniqueOrThrow({
      where: { ownerId: a.id }
    });
  const { volunteerReminderMinutes: ignored, ...legacy } = input;
  void ignored;
  await notificationPreferenceCommand(db, a.token, {
    ...legacy,
    mutationId: randomUUID(),
    expectedVersion: prior.version
  });
  assert.equal(
    (await readNotificationPreferences(db, a.token)).preferences
      .volunteerReminderMinutes,
    60
  );
  for (const value of [1, 30, "15", null])
    await assert.rejects(preferences(a, value as number));
  await preferences(a, 0);
  assert.ok(
    await db.calendarReminderJob.findUnique({ where: { ownerId: a.id } }),
    "RSVP reminders retain the shared job"
  );
  await preferences(a, 15, { calendarReminderMinutes: 0 });
  assert.ok(
    await db.calendarReminderJob.findUnique({ where: { ownerId: a.id } }),
    "volunteer reminders retain the job when RSVP turns Off"
  );
  const control = await db.retentionControl.findFirstOrThrow({
    where: { sourceId: a.id, kind: "NOTIFICATION_PREFERENCES" },
    orderBy: { version: "desc" }
  });
  assert.doesNotMatch(JSON.stringify(control.payload), /volunteerReminder/);
  await db.socialPreferences.update({
    where: { ownerId: a.id },
    data: { notificationVersion: control.version - 1 }
  });
  await replayRetentionControls(db, [
    control.payload as unknown as RetentionControlEntry
  ]);
  const recovered = await readNotificationPreferences(db, a.token);
  assert.equal(recovered.preferences.volunteerReminderMinutes, 0);
  assert.equal(recovered.preferences.recoveryRequired, true);
  await preferences(a, 15);
  // An older recovery/runtime does not know the additive volunteer columns.
  await db.$executeRaw`UPDATE "SocialPreferences" SET "notificationRecoveryRequired"=true WHERE "ownerId"=${a.id}`;
  const quarantined = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: a.id }
  });
  assert.equal(quarantined.volunteerReminderMinutes, 0);
  assert.equal(quarantined.volunteerReminderSince, null);
  await db.$executeRaw`UPDATE "SocialPreferences" SET "notificationRecoveryRequired"=false, version=version+1 WHERE "ownerId"=${a.id}`;
  assert.equal(
    (await readNotificationPreferences(db, a.token)).preferences
      .volunteerReminderMinutes,
    0,
    "an older preferences save cannot revive the newer consent after recovery"
  );
});

test("effective independent shift reaches Activity and opaque phone delivery exactly once without RSVP", async () => {
  const f = await fixture(1, true),
    version = (await f.job()).version;
  assert.equal(
    await db.calendarResponse.count({
      where: { userId: f.a.id, occurrenceId: f.occurrence.id }
    }),
    0
  );
  assert.equal((await f.advance()).recorded, 1);
  const notice = (await f.notices())[0];
  assert.equal(notice.createdAt.getTime(), f.due.getTime());
  const activity = await readActivity(db, f.a.token, {
    category: "commitments"
  });
  assert.match(
    JSON.stringify(activity),
    /A reminder for your confirmed volunteer shift/
  );
  assert.doesNotMatch(JSON.stringify(activity), /Fictional reminder role/);
  const delivery = await db.notificationDelivery.findFirstOrThrow({
    where: { eventId: notice.id }
  });
  assert.equal(delivery.expiresAt.getTime(), f.start.getTime());
  let sends = 0;
  await deliverNotification(db, delivery.id, async (_, payload, ttl) => {
    sends++;
    assert.deepEqual(Object.keys(payload).sort(), ["deliveryId", "tag"]);
    assert.ok(ttl > 0 && ttl <= 900);
    return 201;
  });
  await advanceCalendarReminders(db, f.a.id, version, new Date(), noHandoff);
  await f.advance();
  await deliverNotification(db, delivery.id, async () => {
    sends++;
    return 201;
  });
  assert.equal(sends, 1);
  assert.equal((await f.notices()).length, 1);
});

test("mixed RSVP and volunteer leads share a bounded equal-due cursor without loss or duplicates", async () => {
  const f = await fixture(12, false, true),
    oldVersion = (await f.job()).version;
  assert.equal((await f.advance()).checked, 10);
  await advanceCalendarReminders(db, f.a.id, oldVersion, new Date(), noHandoff);
  assert.equal((await f.advance()).checked, 3);
  assert.equal((await f.notices()).length, 12);
  assert.equal(
    await db.socialEvent.count({
      where: { recipientId: f.a.id, kind: "CALENDAR_REMINDER" }
    }),
    1
  );
  assert.equal((await f.job()).wakeAt, null);
});

test("changing one reminder choice preserves an overdue eligible reminder in the other scope", async () => {
  const f = await fixture(1, false, true);
  const through = (await f.job()).throughAt;
  await preferences(f.a, 0);
  assert.equal((await f.job()).throughAt.getTime(), through.getTime());
  assert.equal((await f.advance()).recorded, 1);
  assert.equal(
    await db.socialEvent.count({
      where: { recipientId: f.a.id, kind: "CALENDAR_REMINDER" }
    }),
    1
  );
  assert.equal((await f.notices()).length, 0);
  const other = await fixture(1, false, true);
  const before = (await other.job()).throughAt;
  await preferences(other.a, 60, { calendarReminderMinutes: 0 });
  assert.equal((await other.job()).throughAt.getTime(), before.getTime());
  assert.equal((await other.advance()).recorded, 1);
  assert.equal((await other.notices()).length, 1);
});

test("signup cancellation, version change and lost access cancel queued phone reminders", async () => {
  for (const cause of [
    "cancel",
    "slot",
    "parent",
    "membership",
    "recovery",
    "off"
  ]) {
    const f = await fixture(1, true);
    await f.advance();
    const notices = await f.notices();
    const delivery = await db.notificationDelivery.findFirstOrThrow({
      where: { eventId: notices[0].id }
    });
    if (cause === "cancel")
      await f.command(f.a, {
        operation: "cancel-volunteer",
        signupId: f.signups[0],
        expectedVersion: 1
      });
    if (cause === "slot")
      await db.postVolunteerSlot.update({
        where: { id: f.slots[0] },
        data: { version: { increment: 1 } }
      });
    if (cause === "parent")
      await db.calendarOccurrence.update({
        where: { id: f.occurrence.id },
        data: { canceledAt: new Date(), version: { increment: 1 } }
      });
    if (cause === "membership")
      await db.churchConnection.update({
        where: { userId_churchId: { userId: f.a.id, churchId: f.churchA.id } },
        data: { state: "REMOVED" }
      });
    if (cause === "recovery")
      await db.socialPreferences.update({
        where: { ownerId: f.a.id },
        data: { notificationRecoveryRequired: true }
      });
    if (cause === "off") await preferences(f.a, 0);
    assert.equal(
      (
        await db.$transaction((tx) =>
          volunteerReminderSources(tx, notices, true, new Date())
        )
      ).size,
      0,
      cause
    );
    let sends = 0;
    await deliverNotification(db, delivery.id, async () => {
      sends++;
      return 201;
    });
    assert.equal(sends, 0, cause);
  }
});

test("late signup, consent and edited shift never backfill; all-day untimed and conflicted shifts are suppressed", async () => {
  for (const cause of [
    "signup",
    "consent",
    "edit",
    "allDay",
    "conflict",
    "completed"
  ]) {
    const f = await fixture();
    if (cause === "signup")
      await db.postVolunteerSignup.update({
        where: { id: f.signups[0] },
        data: { updatedAt: f.due }
      });
    if (cause === "consent")
      await db.socialPreferences.update({
        where: { ownerId: f.a.id },
        data: { volunteerReminderSince: f.due }
      });
    if (cause === "edit") {
      await db.$executeRaw`UPDATE "PostVolunteerSlot" SET capacity=3 WHERE id=${f.slots[0]}`;
      await db.postAudit.deleteMany({ where: { postId: f.post.id } });
      assert.ok(
        (
          await db.postVolunteerSlot.findUniqueOrThrow({
            where: { id: f.slots[0] }
          })
        ).updatedAt >= f.due
      );
    }
    if (cause === "allDay") {
      await db.calendarOccurrence.update({
        where: { id: f.occurrence.id },
        data: { allDay: true, updatedAt: f.old }
      });
      await db.postVolunteerSlot.update({
        where: { id: f.slots[0] },
        data: { shiftStartAt: null, shiftEndAt: null, updatedAt: f.old }
      });
    }
    if (cause === "conflict")
      await db.calendarOccurrence.update({
        where: { id: f.occurrence.id },
        data: { endAt: new Date(f.start.getTime() - 1000), updatedAt: f.old }
      });
    if (cause === "completed")
      await db.postVolunteerSignup.update({
        where: { id: f.signups[0] },
        data: { completedAt: new Date(), updatedAt: f.old }
      });
    assert.equal((await f.advance()).recorded, 0, cause);
  }
});

test("future plans use the existing queue and recover failed handoff after slot fanout", async () => {
  const f = await fixture();
  await f.advance();
  const future = new Date(Date.now() + 2 * 3600000);
  await db.calendarOccurrence.update({
    where: { id: f.occurrence.id },
    data: { endAt: new Date(future.getTime() + 3600000) }
  });
  const slot = await db.postVolunteerSlot.update({
    where: { id: f.slots[0] },
    data: {
      shiftStartAt: future,
      shiftEndAt: new Date(future.getTime() + 1800000),
      version: { increment: 1 }
    }
  });
  const fanout = await notificationWrite(db, (tx) =>
    recordFanout(tx, "VOLUNTEER_CHANGED", slot.id, slot.version, f.ada.id)
  );
  const failed = await advanceNotificationFanout(
    db,
    fanout.id,
    async () => {},
    async () => {
      throw Error("fictional offline");
    }
  );
  assert.equal(failed.failed, 1);
  const plans: unknown[] = [];
  await advanceNotificationFanout(
    db,
    fanout.id,
    async () => {},
    async (plan) => {
      plans.push(plan);
    }
  );
  assert.equal(plans.length, 1);
  await f.advance();
  assert.equal(
    (await f.job()).wakeAt?.getTime(),
    future.getTime() - 15 * 60000
  );
  let delay = 0;
  await dispatchCalendarReminders(db, f.a.id, async (_plan, seconds) => {
    delay = seconds;
  });
  assert.ok(delay > 0 && delay <= 6 * 86400);
  await db.calendarReminderJob.delete({ where: { ownerId: f.a.id } });
  for (
    let i = 0;
    i < 20 &&
    !(await db.calendarReminderJob.findUnique({ where: { ownerId: f.a.id } }));
    i++
  )
    await recoverCalendarReminders(db);
  assert.ok(
    await db.calendarReminderJob.findUnique({ where: { ownerId: f.a.id } })
  );
});

test("quiet hours and shift start are hard delivery limits, and private choice exports", async () => {
  const f = await fixture(1, true),
    now = new Date(),
    minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  await db.socialPreferences.update({
    where: { ownerId: f.a.id },
    data: {
      quietStart: (minute + 1439) % 1440,
      quietEnd: (minute + 60) % 1440,
      quietTimeZone: "UTC"
    }
  });
  await f.advance();
  const notice = (await f.notices())[0];
  const delivery = await db.notificationDelivery.findFirstOrThrow({
    where: { eventId: notice.id }
  });
  assert.equal(delivery.outcome, "CANCELLED");
  assert.equal(
    (
      await db.$transaction((tx) =>
        volunteerReminderSources(tx, [notice], true, f.start)
      )
    ).size,
    0
  );
  let sends = 0;
  await deliverNotification(
    db,
    delivery.id,
    async () => {
      sends++;
      return 201;
    },
    new Date(f.start.getTime() + 1)
  );
  assert.equal(sends, 0);
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!,
    proof = await prepareAccountExport(db, f.a.token, f.a.password, secret);
  const exported = await downloadAccountExport(
    db,
    f.a.token,
    proof.authorization,
    secret
  );
  assert.match(exported, /"volunteerReminderMinutes"\s*:\s*15/);
  assert.match(exported, /"volunteerReminderSince"/);
  const { activitySequence: ignored, ...data } = notice;
  void ignored;
  for (const invalid of [
    { sourceVersion: null },
    { recipientId: null },
    { notificationCategory: null }
  ])
    await assert.rejects(
      db.socialEvent.create({
        data: { ...data, id: randomUUID(), key: randomUUID(), ...invalid }
      })
    );
});
