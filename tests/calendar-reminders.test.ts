import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
import { requestPermanentAccountDeletion } from "../lib/platform/account-deletion";
import { eraseRequestedAccountData } from "../lib/platform/account-erasure";
import { createSessionToken } from "../lib/platform/auth";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import webpush from "web-push";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedPortal,
  type PortalActor
} from "./seed-portal";
import { seedNotificationDevice } from "./seed-notifications";
import { calendarCommand } from "../lib/platform/calendar-commands";
import {
  notificationPreferenceCommand,
  readNotificationPreferences
} from "../lib/platform/notification-preferences";
import {
  advanceCalendarReminders,
  dispatchCalendarReminders,
  recoverCalendarReminders,
  calendarReminderMessage
} from "../lib/platform/calendar-reminders";
import { advanceNotificationFanout } from "../lib/platform/notification-fanout";
import { recordFanout } from "../lib/platform/domain-activity";
import {
  notificationWrite,
  deliverNotification
} from "../lib/platform/notification-outbox";
import { calendarReminderSources } from "../lib/platform/calendar-reminder-policy";
import { readActivity } from "../lib/platform/activity";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
const db = new PrismaClient();
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
  const vapid = webpush.generateVAPIDKeys();
  Object.assign(process.env, {
    PUSH_ENABLED: "true",
    PUSH_VAPID_PUBLIC_KEY: vapid.publicKey,
    PUSH_VAPID_PRIVATE_KEY: vapid.privateKey,
    PUSH_VAPID_SUBJECT: "https://example.test/contact"
  });
});
after(async () => {
  for (const [k, v] of Object.entries(original))
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  await db.socialPreferences.updateMany({
    where: { ownerId: { in: owners } },
    data: { calendarReminderMinutes: 0, calendarReminderSince: null }
  });
  await db.calendarReminderJob.deleteMany({
    where: { ownerId: { in: owners } }
  });
  await db.$disconnect();
});
const noHandoff = async () => ({ failed: 0 });
const owners: string[] = [];

async function setPreferences(
  a: PortalActor,
  minutes: number,
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
    calendarReminderMinutes: minutes,
    ...extra
  };
  const result = await notificationPreferenceCommand(db, a.token, input);
  assert.deepEqual(
    await notificationPreferenceCommand(db, a.token, input),
    result
  );
  return input;
}
async function fixture(count = 1, push = false, actor?: PortalActor) {
  const a = actor ?? (await createPortalActor(db, "calreminder"));
  owners.push(a.id);
  const calendarId = (
    await calendarCommand(db, a.token, {
      operation: "create-calendar",
      name: "Private reminder source",
      timeZone: "UTC",
      requestKey: randomUUID()
    })
  ).id;
  if (push) await seedNotificationDevice(db, a);
  await setPreferences(a, 15, { pushCategories: push ? ["commitments"] : [] });
  const now = new Date(),
    old = new Date(now.getTime() - 120000),
    due = new Date(now.getTime() - 5000),
    start = new Date(due.getTime() + 15 * 60000);
  const events = [];
  for (let i = 0; i < count; i++) {
    const saved = await calendarCommand(db, a.token, {
      operation: "create-event",
      calendarId,
      expectedVersion: (
        await db.platformCalendar.findUniqueOrThrow({
          where: { id: calendarId }
        })
      ).version,
      requestKey: randomUUID(),
      title: `Private event ${i}`,
      allDay: false,
      timeZone: "UTC",
      startLocal: new Date(now.getTime() + 3600000).toISOString().slice(0, 16),
      endLocal: new Date(now.getTime() + 7200000).toISOString().slice(0, 16),
      weeklyUntil: null
    });
    const occurrence = await db.calendarOccurrence.findFirstOrThrow({
      where: { eventId: saved.id }
    });
    await calendarCommand(db, a.token, {
      operation: "rsvp",
      eventId: saved.id,
      occurrenceId: occurrence.id,
      occurrenceVersion: 1,
      expectedVersion: 0,
      state: "GOING"
    });
    await db.calendarEvent.update({
      where: { id: saved.id },
      data: { updatedAt: old }
    });
    await db.calendarOccurrence.update({
      where: { id: occurrence.id },
      data: {
        startAt: start,
        endAt: new Date(start.getTime() + 3600000),
        updatedAt: old
      }
    });
    const response = await db.calendarResponse.findUniqueOrThrow({
      where: {
        occurrenceId_userId: { occurrenceId: occurrence.id, userId: a.id }
      }
    });
    await db.calendarResponse.update({
      where: { id: response.id },
      data: { updatedAt: old }
    });
    events.push({
      eventId: saved.id,
      occurrenceId: occurrence.id,
      responseId: response.id
    });
  }
  await db.socialPreferences.update({
    where: { ownerId: a.id },
    data: {
      calendarReminderSince: old,
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
  const advance = async (at = new Date(), handoff = noHandoff) =>
    advanceCalendarReminders(db, a.id, (await job()).version, at, handoff);
  const notices = () =>
    db.socialEvent.findMany({
      where: { recipientId: a.id, kind: "CALENDAR_REMINDER" },
      orderBy: { id: "asc" }
    });
  return { a, calendarId, now, old, due, start, events, job, advance, notices };
}

test("reminder consent defaults off, validates exact writes, keeps legacy saves and records protected recovery", async () => {
  const a = await createPortalActor(db, "reminderpref");
  owners.push(a.id);
  assert.equal(
    (await readNotificationPreferences(db, a.token)).preferences
      .calendarReminderMinutes,
    0
  );
  assert.equal(
    await db.calendarReminderJob.count({ where: { ownerId: a.id } }),
    0
  );
  const command = await setPreferences(a, 60);
  const since = (
    await db.socialPreferences.findUniqueOrThrow({ where: { ownerId: a.id } })
  ).calendarReminderSince;
  assert.ok(since);
  await assert.rejects(
    notificationPreferenceCommand(db, a.token, {
      ...command,
      calendarReminderMinutes: 15
    })
  );
  for (const value of [-1, 1, 30, "15", null]) {
    const view = await readNotificationPreferences(db, a.token);
    await assert.rejects(
      notificationPreferenceCommand(db, a.token, {
        ...command,
        mutationId: randomUUID(),
        expectedVersion: view.preferences.version,
        calendarReminderMinutes: value
      })
    );
  }
  const view = await readNotificationPreferences(db, a.token);
  const { calendarReminderMinutes: ignored, ...legacy } = command;
  void ignored;
  await notificationPreferenceCommand(db, a.token, {
    ...legacy,
    mutationId: randomUUID(),
    expectedVersion: view.preferences.version
  });
  assert.equal(
    (await readNotificationPreferences(db, a.token)).preferences
      .calendarReminderMinutes,
    60
  );
  assert.deepEqual(
    (await db.socialPreferences.findUniqueOrThrow({ where: { ownerId: a.id } }))
      .calendarReminderSince,
    since
  );
  const control = await db.retentionControl.findFirstOrThrow({
    where: { sourceId: a.id, kind: "NOTIFICATION_PREFERENCES" },
    orderBy: { version: "desc" }
  });
  assert.doesNotMatch(
    JSON.stringify(control.payload),
    /calendarReminder|quietHours/
  );
  await db.socialPreferences.update({
    where: { ownerId: a.id },
    data: { notificationVersion: control.version - 1 }
  });
  await replayRetentionControls(db, [
    control.payload as unknown as RetentionControlEntry
  ]);
  assert.equal(
    (await readNotificationPreferences(db, a.token)).preferences
      .calendarReminderMinutes,
    0
  );
  const job = await db.calendarReminderJob.findUniqueOrThrow({
    where: { ownerId: a.id }
  });
  await advanceCalendarReminders(db, a.id, job.version, new Date(), noHandoff);
  assert.equal(
    await db.calendarReminderJob.count({ where: { ownerId: a.id } }),
    0
  );
  await setPreferences(a, 15);
  await setPreferences(a, 0);
  assert.equal(
    await db.calendarReminderJob.count({ where: { ownerId: a.id } }),
    0
  );
  await db.platformUser.update({
    where: { id: a.id },
    data: { emailVerifiedAt: null }
  });
  await assert.rejects(setPreferences(a, 15), { status: 403 });
});

test("one current reminder reaches Activity and opaque phone outbox; retries never duplicate it", async () => {
  const f = await fixture(1, true),
    version = (await f.job()).version;
  const result = await f.advance();
  assert.equal(result.recorded, 1);
  const notices = await f.notices();
  assert.equal(notices.length, 1);
  assert.equal(notices[0].createdAt.getTime(), f.due.getTime());
  const activity = await readActivity(db, f.a.token, {
    category: "commitments"
  });
  assert.match(
    JSON.stringify(activity),
    /A reminder for an event in your commitments/
  );
  assert.doesNotMatch(JSON.stringify(activity), /Private event/);
  const delivery = await db.notificationDelivery.findFirstOrThrow({
    where: { eventId: notices[0].id }
  });
  assert.equal(delivery.expiresAt.getTime(), f.start.getTime());
  let sends = 0;
  assert.deepEqual(
    await deliverNotification(db, delivery.id, async (_, payload, ttl) => {
      assert.ok(ttl > 0 && ttl <= 900);
      sends++;
      assert.deepEqual(Object.keys(payload).sort(), ["deliveryId", "tag"]);
      return 201;
    }),
    { done: true, outcome: "accepted" }
  );
  await advanceCalendarReminders(db, f.a.id, version, new Date(), noHandoff);
  await f.advance();
  assert.equal((await f.notices()).length, 1);
  await deliverNotification(db, delivery.id, async () => {
    sends++;
    return 201;
  });
  assert.equal(sends, 1);
});

test("dense equal-time events use a bounded compound cursor and survive duplicate and stale deliveries", async () => {
  const f = await fixture(23);
  const firstVersion = (await f.job()).version;
  const a = await f.advance();
  assert.equal(a.checked, 10);
  assert.equal(a.recorded, 10);
  assert.equal((await f.job()).throughAt.getTime(), f.due.getTime());
  await advanceCalendarReminders(
    db,
    f.a.id,
    firstVersion,
    new Date(),
    noHandoff
  );
  assert.equal((await f.notices()).length, 10);
  assert.equal((await f.advance()).recorded, 10);
  assert.equal((await f.advance()).recorded, 3);
  assert.equal((await f.notices()).length, 23);
  assert.equal((await f.job()).wakeAt, null);
});

test("future scheduling is bounded by queue horizon and survives failed or racing handoff", async () => {
  const f = await fixture(),
    messages: unknown[] = [];
  await db.calendarReminderJob.update({
    where: { ownerId: f.a.id },
    data: { wakeAt: new Date(Date.now() + 8 * 86400000) }
  });
  assert.deepEqual(
    await dispatchCalendarReminders(db, f.a.id, async () => {
      throw Error("should not send");
    }),
    { queued: 0, failed: 0 }
  );
  const early = await f.advance();
  assert.ok(early.retryAfterSeconds > 7 * 86400);
  await db.calendarReminderJob.update({
    where: { ownerId: f.a.id },
    data: { wakeAt: new Date(Date.now() + 86400000) }
  });
  assert.deepEqual(
    await dispatchCalendarReminders(db, f.a.id, async () => {
      throw Error("offline");
    }),
    { queued: 0, failed: 1 }
  );
  assert.ok((await f.job()).lastDispatchErrorAt);
  assert.equal((await f.job()).dispatchClaimedAt, null);
  const publish = async (
    plan: { id: string; version: number },
    delay: number,
    key: string
  ) => {
    messages.push({ message: calendarReminderMessage(plan), delay, key });
  };
  const raced = await Promise.all([
    dispatchCalendarReminders(db, f.a.id, publish),
    dispatchCalendarReminders(db, f.a.id, publish)
  ]);
  assert.equal(
    raced.reduce((n, r) => n + r.queued, 0),
    1
  );
  assert.equal(messages.length, 1);
  assert.doesNotMatch(
    JSON.stringify(messages),
    /Private event|startAt|title|token/
  );
  await db.calendarReminderJob.update({
    where: { ownerId: f.a.id },
    data: { wakeAt: f.due, dispatchedAt: new Date(Date.now() - 7200000) }
  });
  assert.equal(
    (await dispatchCalendarReminders(db, f.a.id, publish)).queued,
    1
  );
  await db.calendarReminderJob.delete({ where: { ownerId: f.a.id } });
  // A reused fictional database may have earlier owners before this owner in
  // the bounded recovery order. Drain at most the observed number of batches.
  const missing = await db.socialPreferences.count({
    where: {
      calendarReminderMinutes: { in: [15, 60] },
      owner: { calendarReminderJob: null }
    }
  });
  for (let batch = 0; batch <= Math.ceil(missing / 20); batch++) {
    if (await db.calendarReminderJob.findUnique({ where: { ownerId: f.a.id } }))
      break;
    assert.ok((await recoverCalendarReminders(db)).checked <= 20);
  }
  assert.ok(await f.job());
});

test("editing or canceling another occurrence preserves a due reminder in the same series", async () => {
  const f = await fixture();
  const first = await db.calendarOccurrence.findUniqueOrThrow({
    where: { id: f.events[0].occurrenceId }
  });
  const { id: ignored, ...copy } = first;
  void ignored;
  const sibling = await db.calendarOccurrence.create({
    data: { ...copy, ordinal: first.ordinal + 1 }
  });
  await calendarCommand(db, f.a.token, {
    operation: "edit-event",
    eventId: first.eventId,
    expectedVersion: 1,
    occurrenceId: sibling.id,
    occurrenceVersion: 1,
    scope: "OCCURRENCE",
    title: "Next week's private event",
    allDay: false,
    timeZone: "UTC",
    startLocal: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
    endLocal: new Date(Date.now() + 7 * 86400000 + 3600000)
      .toISOString()
      .slice(0, 16)
  });
  assert.equal((await f.advance()).recorded, 1);
  const notices = await f.notices();
  assert.equal(notices.length, 1);
  await calendarCommand(db, f.a.token, {
    operation: "cancel-event",
    eventId: first.eventId,
    expectedVersion: 2,
    occurrenceId: sibling.id,
    occurrenceVersion: 2,
    scope: "OCCURRENCE",
    confirmed: true
  });
  assert.equal(
    (
      await db.$transaction((tx) =>
        calendarReminderSources(tx, notices, true, new Date())
      )
    ).size,
    1
  );
});

test("occurrence and series edits cannot backfill an already passed reminder time after audit erasure", async () => {
  for (const scope of ["OCCURRENCE", "SERIES"]) {
    const f = await fixture();
    const before = new Date(Date.now() - 3600000);
    await db.calendarResponse.update({
      where: { id: f.events[0].responseId },
      data: { updatedAt: before }
    });
    await db.socialPreferences.update({
      where: { ownerId: f.a.id },
      data: { calendarReminderSince: before }
    });
    await db.calendarReminderJob.update({
      where: { ownerId: f.a.id },
      data: { throughAt: before }
    });
    await calendarCommand(db, f.a.token, {
      operation: "edit-event",
      eventId: f.events[0].eventId,
      expectedVersion: 1,
      occurrenceId: f.events[0].occurrenceId,
      occurrenceVersion: 1,
      scope,
      confirmed: true,
      title: "Rescheduled private event",
      allDay: false,
      timeZone: "UTC",
      startLocal: new Date(Date.now() + 10 * 60000).toISOString().slice(0, 16),
      endLocal: new Date(Date.now() + 70 * 60000).toISOString().slice(0, 16),
      weeklyUntil: null
    });
    // Account erasure removes the editor's audits even when church events stay.
    await db.calendarAudit.deleteMany({ where: { actorId: f.a.id } });
    assert.equal((await f.advance()).recorded, 0);
    assert.equal((await f.notices()).length, 0);
  }
});

test("current canonical consent, event version, access, response, eligibility and source time revoke old reminders", async () => {
  const mutations = [
    async (f: Awaited<ReturnType<typeof fixture>>) => {
      await calendarCommand(db, f.a.token, {
        operation: "withdraw-response",
        occurrenceId: f.events[0].occurrenceId,
        expectedVersion: 1
      });
    },
    async (f: Awaited<ReturnType<typeof fixture>>) => {
      await setPreferences(f.a, 0);
    },
    async (f: Awaited<ReturnType<typeof fixture>>) => {
      await db.calendarOccurrence.update({
        where: { id: f.events[0].occurrenceId },
        data: { version: { increment: 1 } }
      });
    },
    async (f: Awaited<ReturnType<typeof fixture>>) => {
      await db.calendarOccurrence.update({
        where: { id: f.events[0].occurrenceId },
        data: { canceledAt: new Date() }
      });
    },
    async (f: Awaited<ReturnType<typeof fixture>>) => {
      await db.platformCalendar.update({
        where: { id: f.calendarId },
        data: { archivedAt: new Date() }
      });
    },
    async (f: Awaited<ReturnType<typeof fixture>>) => {
      await db.platformUser.update({
        where: { id: f.a.id },
        data: { suspendedAt: new Date() }
      });
    },
    async (f: Awaited<ReturnType<typeof fixture>>) => {
      // A compatible older application omits the additive timestamp column.
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 AS waited FROM pg_sleep(0.02)`;
        const editedAfter = new Date();
        await tx.$executeRaw`UPDATE "CalendarOccurrence" SET title='Edited by older runtime' WHERE id=${f.events[0].occurrenceId}`;
        const changed = await tx.calendarOccurrence.findUniqueOrThrow({
          where: { id: f.events[0].occurrenceId }
        });
        assert.ok(
          changed.updatedAt >= editedAfter,
          "Use edit time, not the older transaction start"
        );
      });
      const source = await db.calendarOccurrence.findUniqueOrThrow({
        where: { id: f.events[0].occurrenceId }
      });
      assert.ok(source.updatedAt >= f.due);
    }
  ];
  for (const mutate of mutations) {
    const f = await fixture(1, true);
    await f.advance();
    const notices = await f.notices();
    assert.equal(notices.length, 1);
    const delivery = await db.notificationDelivery.findFirstOrThrow({
      where: { eventId: notices[0].id }
    });
    await mutate(f);
    assert.equal(
      (
        await db.$transaction((tx) =>
          calendarReminderSources(tx, notices, true, new Date())
        )
      ).size,
      0
    );
    let sends = 0;
    await deliverNotification(db, delivery.id, async () => {
      sends++;
      return 201;
    });
    assert.equal(sends, 0);
  }
});

test("all-day, declined, late opt-in and late responses cannot backfill reminders", async () => {
  const f = await fixture(5);
  await db.calendarOccurrence.update({
    where: { id: f.events[0].occurrenceId },
    data: { allDay: true }
  });
  await db.calendarResponse.update({
    where: { id: f.events[1].responseId },
    data: { state: "DECLINED", updatedAt: f.old }
  });
  await db.calendarResponse.update({
    where: { id: f.events[2].responseId },
    data: { updatedAt: f.due }
  });
  await db.calendarOccurrence.update({
    where: { id: f.events[3].occurrenceId },
    data: { startAt: new Date(Date.now() - 1000) }
  });
  assert.equal((await f.advance()).recorded, 1);
  const late = await fixture();
  await db.socialPreferences.update({
    where: { ownerId: late.a.id },
    data: { calendarReminderSince: late.due }
  });
  assert.equal((await late.advance()).recorded, 0);
});

test("quiet hours hold a reminder and canonical delivery cancels it after the event starts", async () => {
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
  assert.equal((await f.advance()).recorded, 1);
  const delivery = await db.notificationDelivery.findFirstOrThrow({
    where: { event: { recipientId: f.a.id, kind: "CALENDAR_REMINDER" } }
  });
  assert.ok(delivery.availableAt > f.start);
  assert.equal(delivery.state, "FINISHED");
  assert.equal(delivery.outcome, "CANCELLED");
  let sends = 0;
  const result = await deliverNotification(
    db,
    delivery.id,
    async () => {
      sends++;
      return 201;
    },
    new Date(delivery.availableAt.getTime() + 1000)
  );
  assert.deepEqual(result, { done: true, outcome: "finished" });
  assert.equal(sends, 0);
});

test("event edits wake attendee and organizer jobs and recover queue failure after committed fanout", async () => {
  const f = await fixture();
  await f.advance();
  assert.equal((await f.job()).wakeAt, null);
  await db.calendarOccurrence.update({
    where: { id: f.events[0].occurrenceId },
    data: {
      version: { increment: 1 },
      startAt: new Date(Date.now() + 7200000),
      endAt: new Date(Date.now() + 10800000)
    }
  });
  const fanout = await notificationWrite(db, (tx) =>
    recordFanout(tx, "EVENT_CHANGED", f.events[0].occurrenceId, 2, f.a.id)
  );
  const failed = await advanceNotificationFanout(
    db,
    fanout.id,
    async () => {},
    async () => {
      throw Error("offline");
    }
  );
  assert.equal(failed.failed, 1);
  assert.ok((await f.job()).wakeAt);
  const messages: unknown[] = [];
  await advanceNotificationFanout(
    db,
    fanout.id,
    async () => {},
    async (plan) => {
      messages.push(plan);
    }
  );
  assert.equal(messages.length, 1);
  const plan = await f.advance();
  assert.equal(plan.recorded, 0);
  assert.ok((await f.job()).wakeAt! > new Date());
});

test("details revoked to Busy cancels an attendee reminder without changing their RSVP or membership", async () => {
  const seed = await seedPortal(db),
    f = await fixture(1, false, seed.contact),
    a = seed.memberA;
  owners.push(a.id);
  await calendarCommand(db, f.a.token, {
    operation: "share-calendar",
    calendarId: f.calendarId,
    churchId: seed.churchA.id,
    expectedVersion: 0,
    level: "DETAILS",
    confirmed: true
  });
  await seedNotificationDevice(db, a);
  await setPreferences(a, 15, { pushCategories: ["commitments"] });
  await calendarCommand(db, a.token, {
    operation: "rsvp",
    eventId: f.events[0].eventId,
    occurrenceId: f.events[0].occurrenceId,
    occurrenceVersion: 1,
    expectedVersion: 0,
    state: "MAYBE"
  });
  await db.calendarResponse.updateMany({
    where: { userId: a.id },
    data: { updatedAt: f.old }
  });
  await db.socialPreferences.update({
    where: { ownerId: a.id },
    data: {
      calendarReminderSince: f.old,
      notificationPushSince: { commitments: f.old.toISOString() }
    }
  });
  await db.pushSubscription.updateMany({
    where: { ownerId: a.id },
    data: { createdAt: f.old }
  });
  const job = await db.calendarReminderJob.update({
    where: { ownerId: a.id },
    data: { throughAt: f.old, wakeAt: f.due }
  });
  assert.equal(
    (
      await advanceCalendarReminders(
        db,
        a.id,
        job.version,
        new Date(),
        noHandoff
      )
    ).recorded,
    1
  );
  const notices = await db.socialEvent.findMany({
    where: { recipientId: a.id, kind: "CALENDAR_REMINDER" }
  });
  const before = await db.calendarResponse.findMany({
    where: { userId: a.id }
  });
  await calendarCommand(db, f.a.token, {
    operation: "share-calendar",
    calendarId: f.calendarId,
    churchId: seed.churchA.id,
    expectedVersion: 1,
    level: "BUSY",
    confirmed: true
  });
  assert.equal(
    (
      await db.$transaction((tx) =>
        calendarReminderSources(tx, notices, false, new Date())
      )
    ).size,
    0
  );
  const delivery = await db.notificationDelivery.findFirstOrThrow({
    where: { eventId: notices[0].id }
  });
  let sends = 0;
  await deliverNotification(db, delivery.id, async () => {
    sends++;
    return 201;
  });
  assert.equal(sends, 0);
  assert.deepEqual(
    await db.calendarResponse.findMany({ where: { userId: a.id } }),
    before
  );
});

test("reminder scheduling uses source instants across a DST repeat and ignores viewer timezone", async () => {
  const f = await fixture(2);
  const starts = [
    new Date("2026-11-01T06:30:00Z"),
    new Date("2026-11-01T07:30:00Z")
  ];
  for (let i = 0; i < 2; i++)
    await db.calendarOccurrence.update({
      where: { id: f.events[i].occurrenceId },
      data: {
        startAt: starts[i],
        endAt: new Date(starts[i].getTime() + 1800000),
        timeZone: "America/Chicago",
        startLocal: "2026-11-01T01:30",
        endLocal: "2026-11-01T02:00"
      }
    });
  await db.platformUser.update({
    where: { id: f.a.id },
    data: {
      calendarDisplayTimeZone: "Asia/Tokyo",
      calendarTimeZoneMode: "FIXED"
    }
  });
  assert.equal((await f.advance()).recorded, 0);
  assert.equal(
    (await f.job()).wakeAt!.toISOString(),
    "2026-11-01T06:15:00.000Z"
  );
  assert.equal((await f.advance(new Date("2026-11-01T06:15:00Z"))).recorded, 1);
  assert.equal(
    (await f.job()).wakeAt!.toISOString(),
    "2026-11-01T07:15:00.000Z"
  );
  assert.equal((await f.advance(new Date("2026-11-01T07:15:00Z"))).recorded, 1);
  assert.equal((await f.notices()).length, 2);
});

test("private reminder choice exports and erases through the account owner and malformed source rows fail closed", async () => {
  const f = await fixture();
  await f.advance();
  const notice = (await f.notices())[0];
  for (const invalid of [
    { sourceVersion: null },
    { notificationCategory: null },
    { recipientId: null }
  ]) {
    const { activitySequence: ignored, ...data } = notice;
    void ignored;
    await assert.rejects(
      db.socialEvent.create({
        data: { ...data, id: randomUUID(), key: randomUUID(), ...invalid }
      })
    );
  }
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!;
  const proof = await prepareAccountExport(db, f.a.token, f.a.password, secret);
  const exported = await downloadAccountExport(
    db,
    f.a.token,
    proof.authorization,
    secret
  );
  assert.match(exported, /"calendarReminderMinutes"\s*:\s*15/);
  assert.match(exported, /"calendarReminderSince"/);
  const journal = { async recordAccount() {}, async completeAccount() {} };
  await requestPermanentAccountDeletion(
    db,
    f.a.token,
    f.a.password,
    true,
    createSessionToken(),
    journal
  );
  const deletion = await db.accountDeletion.findUniqueOrThrow({
    where: { userId: f.a.id }
  });
  await eraseRequestedAccountData(db, deletion.id, journal);
  assert.equal(
    await db.calendarReminderJob.count({ where: { ownerId: f.a.id } }),
    0
  );
  assert.equal(
    await db.socialPreferences.count({ where: { ownerId: f.a.id } }),
    0
  );
  await assert.rejects(readNotificationPreferences(db, f.a.token));
});
