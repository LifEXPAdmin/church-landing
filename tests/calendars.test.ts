import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  seedPortal,
  assertPortalTestDatabase,
  type PortalActor,
  requestConnection,
  createPortalActor
} from "./seed-portal";
import {
  deactivateAccount,
  reactivateAccount
} from "../lib/platform/account-lifecycle";
import { portalCommand, PortalError } from "../lib/platform/portal";
import { calendarCommand } from "../lib/platform/calendar-commands";
import {
  getCalendars,
  getCalendarAgenda,
  getCalendarEvent,
  getCalendarCommitments,
  getPublicChurchAgenda,
  getPublicCalendarEvent
} from "../lib/platform/calendar-reads";
import {
  expandCalendarSchedule,
  calendarWindow
} from "../lib/platform/calendar-time";
import { loginAccount } from "../lib/platform/accounts";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const denied = (p: Promise<unknown>, status = 403) =>
  assert.rejects(
    p,
    (e: unknown) => e instanceof PortalError && e.status === status
  );
const range = {
  from: "2026-10-01",
  until: "2026-12-15",
  timeZone: "America/Chicago"
};
const time = {
  allDay: false,
  startLocal: "2026-10-25T09:00",
  endLocal: "2026-10-25T10:00",
  timeZone: "America/Chicago",
  weeklyUntil: null
};
async function fixture() {
  const f = await seedPortal(db),
    ada = f.memberA,
    lee = f.coordinator,
    val = f.contact,
    blake = f.memberB;
  for (const scope of ["EDIT_CHURCH_CALENDAR", "PUBLISH_CHURCH_EVENTS"])
    await portalCommand(db, f.operator.token, {
      operation: "grant",
      churchId: f.churchA.id,
      userId: ada.id,
      capability: scope,
      expectedVersion: 0
    });
  await portalCommand(db, f.operator.token, {
    operation: "grant",
    churchId: f.churchB.id,
    userId: blake.id,
    capability: "EDIT_CHURCH_CALENDAR",
    expectedVersion: 0
  });
  const cmd = (actor: PortalActor, input: Record<string, unknown>) =>
    calendarCommand(db, actor.token, input);
  const createCalendar = async (actor: PortalActor, churchId?: string) =>
    (
      await cmd(actor, {
        operation: "create-calendar",
        churchId,
        requestKey: randomUUID(),
        name: churchId ? "Church gatherings" : "Val private schedule",
        timeZone: "America/Chicago"
      })
    ).id;
  const personal = await createCalendar(val),
    church = await createCalendar(ada, f.churchA.id),
    otherChurch = await createCalendar(blake, f.churchB.id);
  const create = async (actor: PortalActor, calendarId: string, input = {}) => {
    const version = (
      await db.platformCalendar.findUniqueOrThrow({ where: { id: calendarId } })
    ).version;
    const saved = await cmd(actor, {
      operation: "create-event",
      calendarId,
      expectedVersion: version,
      requestKey: randomUUID(),
      title: "Fictional outreach",
      ...time,
      ...input
    });
    return db.calendarEvent.findUniqueOrThrow({
      where: { id: saved.id },
      include: { occurrences: { orderBy: { ordinal: "asc" } } }
    });
  };
  const shareCalendar = (level: string = "BUSY", expectedVersion = 0) =>
    cmd(val, {
      operation: "share-calendar",
      calendarId: personal,
      churchId: f.churchA.id,
      expectedVersion,
      level,
      confirmed: true
    });
  return {
    ...f,
    ada,
    lee,
    val,
    blake,
    cmd,
    personal,
    church,
    otherChurch,
    createCalendar,
    create,
    shareCalendar
  };
}

test("weekly wall times, exclusive all-day dates and invalid/ambiguous times are explicit", () => {
  const result = expandCalendarSchedule({ ...time, weeklyUntil: "2026-11-08" });
  assert.deepEqual(
    result.occurrences.map((x) => x.startLocal),
    ["2026-10-25T09:00", "2026-11-01T09:00", "2026-11-08T09:00"]
  );
  assert.deepEqual(
    result.occurrences.map((x) => x.startAt.toISOString()),
    [
      "2026-10-25T14:00:00.000Z",
      "2026-11-01T15:00:00.000Z",
      "2026-11-08T15:00:00.000Z"
    ]
  );
  const spring = expandCalendarSchedule({
    ...time,
    startLocal: "2026-03-01T09:00",
    endLocal: "2026-03-01T10:00",
    weeklyUntil: "2026-03-15"
  });
  assert.deepEqual(
    spring.occurrences.map((x) => x.startAt.getUTCHours()),
    [15, 14, 14]
  );
  const allDay = expandCalendarSchedule({
    ...time,
    allDay: true,
    startLocal: "2026-11-01",
    endLocal: "2026-11-02"
  }).occurrences[0];
  assert.equal(allDay.startLocal, "2026-11-01");
  assert.equal(allDay.endAt.getTime() - allDay.startAt.getTime(), 25 * 3600000);
  for (const bad of [
    { startLocal: "2026-11-01T01:30", endLocal: "2026-11-01T02:30" },
    { startLocal: "2026-03-08T02:30", endLocal: "2026-03-08T03:30" },
    { endLocal: "2026-10-25T08:00" },
    { startLocal: "2026-02-30T09:00" },
    { timeZone: "Not/A_Zone" },
    { weeklyUntil: "2028-01-01" },
    { startLocal: "2026-10-25T09:00Z" }
  ])
    assert.throws(
      () => expandCalendarSchedule({ ...time, ...bad }),
      PortalError
    );
  assert.throws(
    () => calendarWindow("2026-01-01", "2027-01-01", "UTC"),
    PortalError
  );
});

test("busy-only shares omit private titles/notes/locations and a separate full event share stays isolated", async () => {
  const f = await fixture();
  const privateEvent = await f.create(f.val, f.personal, {
    title: "PRIVATE appointment unique marker",
    description: "PRIVATE notes",
    location: "PRIVATE clinic",
    onlineUrl: "https://example.test/private",
    organizer: "PRIVATE organizer"
  });
  const planning = await f.create(f.val, f.personal, {
    title: "Outreach planning",
    startLocal: "2026-10-26T09:00",
    endLocal: "2026-10-26T10:00"
  });
  await denied(
    getCalendarEvent(db, f.lee.token, privateEvent.occurrences[0].id),
    404
  );
  await f.shareCalendar();
  const agenda = await getCalendarAgenda(db, f.lee.token, {
    calendarIds: [f.personal],
    ...range
  });
  assert.equal(agenda.events.length, 2);
  for (const e of agenda.events) assert.equal(e.title, "Busy");
  const payload = JSON.stringify([
    agenda,
    await getCalendars(db, f.lee.token),
    await getCalendarEvent(db, f.lee.token, privateEvent.occurrences[0].id)
  ]);
  for (const marker of [
    "PRIVATE",
    "Val private schedule",
    f.val.email,
    f.val.username,
    "example.test/private"
  ])
    assert.ok(!payload.includes(marker), marker);
  await f.cmd(f.val, {
    operation: "share-event",
    eventId: planning.id,
    churchId: f.churchA.id,
    expectedVersion: 0,
    level: "DETAILS",
    confirmed: true
  });
  assert.equal(
    (await getCalendarEvent(db, f.lee.token, planning.occurrences[0].id)).event
      .title,
    "Outreach planning"
  );
  assert.equal(
    (await getCalendarEvent(db, f.lee.token, privateEvent.occurrences[0].id))
      .event.title,
    "Busy"
  );
  await denied(
    getCalendarAgenda(db, f.blake.token, {
      calendarIds: [f.personal],
      ...range
    })
  );
  await denied(
    getCalendarEvent(db, f.pending.token, privateEvent.occurrences[0].id),
    404
  );
  await denied(
    getCalendarAgenda(db, "", { calendarIds: [f.personal], ...range }),
    401
  );
  await denied(getPublicCalendarEvent(db, privateEvent.occurrences[0].id), 404);
  assert.equal(
    (await getPublicChurchAgenda(db, { churchId: f.churchA.id, ...range }))
      .events.length,
    0
  );
  await f.cmd(f.val, {
    operation: "revoke-calendar-share",
    calendarId: f.personal,
    churchId: f.churchA.id,
    expectedVersion: 1
  });
  await denied(
    getCalendarEvent(db, f.lee.token, privateEvent.occurrences[0].id),
    404
  );
  assert.equal(
    (await getCalendarEvent(db, f.lee.token, planning.occurrences[0].id)).event
      .title,
    "Outreach planning"
  );
  await f.cmd(f.val, {
    operation: "revoke-event-share",
    eventId: planning.id,
    churchId: f.churchA.id,
    expectedVersion: 1
  });
  await denied(
    getCalendarEvent(db, f.lee.token, planning.occurrences[0].id),
    404
  );
});

test("church edit authority, public publishing, membership and private ownership are distinct", async () => {
  const f = await fixture();
  const privateChurch = await f.create(f.ada, f.church, {
    title: "Unpublished planning"
  });
  const churchEvent = await f.create(f.ada, f.church, { visibility: "CHURCH" });
  await denied(
    getCalendarEvent(db, f.lee.token, privateChurch.occurrences[0].id),
    404
  );
  assert.equal(
    (await getCalendarEvent(db, f.lee.token, churchEvent.occurrences[0].id))
      .event.title,
    "Fictional outreach"
  );
  await denied(f.create(f.lee, f.church));
  await denied(f.create(f.ada, f.otherChurch));
  await denied(
    f.cmd(f.ada, {
      operation: "share-calendar",
      calendarId: f.personal,
      churchId: f.churchA.id,
      expectedVersion: 0,
      level: "DETAILS",
      confirmed: true
    })
  );
  await portalCommand(db, f.operator.token, {
    operation: "grant",
    churchId: f.churchA.id,
    userId: f.lee.id,
    capability: "EDIT_CHURCH_CALENDAR",
    expectedVersion: 0
  });
  const leeDraft = await f.create(f.lee, f.church);
  await denied(f.create(f.lee, f.church, { visibility: "CHURCH" }));
  await denied(f.create(f.lee, f.church, { visibility: "PUBLIC" }));
  await f.cmd(f.ada, {
    operation: "set-visibility",
    eventId: churchEvent.id,
    expectedVersion: churchEvent.version,
    visibility: "PUBLIC",
    confirmed: true
  });
  const event = await db.calendarEvent.findUniqueOrThrow({
    where: { id: churchEvent.id }
  });
  await denied(
    f.cmd(f.lee, {
      operation: "edit-event",
      eventId: event.id,
      expectedVersion: event.version,
      scope: "SERIES",
      confirmed: true,
      title: "Forged published change",
      ...time
    })
  );
  assert.equal(
    (await getPublicCalendarEvent(db, churchEvent.occurrences[0].id)).event
      ?.title,
    "Fictional outreach"
  );
  const publicAgenda = JSON.stringify(
    await getPublicChurchAgenda(db, { churchId: f.churchA.id, ...range })
  );
  assert.ok(!publicAgenda.includes("Unpublished planning"));
  assert.ok(!publicAgenda.includes(f.ada.email));
  const grant = await db.churchCapabilityGrant.findUniqueOrThrow({
    where: {
      userId_churchId_capability: {
        userId: f.lee.id,
        churchId: f.churchA.id,
        capability: "EDIT_CHURCH_CALENDAR"
      }
    }
  });
  await portalCommand(db, f.operator.token, {
    operation: "revoke-grant",
    churchId: f.churchA.id,
    id: grant.id,
    expectedVersion: grant.version
  });
  await denied(f.create(f.lee, f.church));
  await denied(
    f.cmd(f.lee, {
      operation: "edit-event",
      eventId: leeDraft.id,
      expectedVersion: leeDraft.version,
      scope: "SERIES",
      confirmed: true,
      title: "Revoked edit",
      ...time
    })
  );
  await denied(
    f.cmd(f.val, {
      operation: "create-event",
      calendarId: f.personal,
      expectedVersion: 1,
      requestKey: randomUUID(),
      title: "Public private data",
      visibility: "PUBLIC",
      ...time
    }),
    400
  );
});

test("RSVPs survive another login and time edits preserve occurrence identities; canceled instances stay canceled", async () => {
  const f = await fixture();
  const event = await f.create(f.ada, f.church, {
    visibility: "CHURCH",
    weeklyUntil: "2026-11-08"
  });
  const original = event.occurrences.map((r) => r.id),
    occurrence = event.occurrences[1];
  await f.cmd(f.lee, {
    operation: "rsvp",
    eventId: event.id,
    occurrenceId: occurrence.id,
    occurrenceVersion: occurrence.version,
    expectedVersion: 0,
    state: "GOING"
  });
  const again = await loginAccount(
    db,
    f.lee.email,
    f.lee.password,
    "second-calendar-session"
  );
  assert.equal(
    (await getCalendarCommitments(db, again, range)).commitments[0].response
      .state,
    "GOING"
  );
  await f.cmd(f.ada, {
    operation: "edit-event",
    eventId: event.id,
    expectedVersion: event.version,
    occurrenceId: occurrence.id,
    occurrenceVersion: occurrence.version,
    scope: "OCCURRENCE",
    title: "Only the second meeting",
    ...time,
    startLocal: "2026-11-01T11:00",
    endLocal: "2026-11-01T12:00"
  });
  let rows = await db.calendarOccurrence.findMany({
    where: { eventId: event.id },
    orderBy: { ordinal: "asc" }
  });
  assert.deepEqual(
    rows.map((r) => r.id),
    original
  );
  assert.equal(rows[0].startLocal, "2026-10-25T09:00");
  assert.equal(rows[1].startLocal, "2026-11-01T11:00");
  assert.equal(
    (await getCalendarCommitments(db, f.lee.token, range)).commitments[0].title,
    "Only the second meeting"
  );
  await f.cmd(f.ada, {
    operation: "cancel-event",
    eventId: event.id,
    expectedVersion: event.version + 1,
    occurrenceId: occurrence.id,
    occurrenceVersion: rows[1].version,
    scope: "OCCURRENCE",
    confirmed: true
  });
  assert.equal(
    (await getCalendarCommitments(db, f.lee.token, range)).commitments[0]
      .canceled,
    true
  );
  await denied(
    f.cmd(f.val, {
      operation: "rsvp",
      eventId: event.id,
      occurrenceId: occurrence.id,
      occurrenceVersion: rows[1].version + 1,
      expectedVersion: 0,
      state: "GOING"
    }),
    409
  );
  await f.cmd(f.ada, {
    operation: "edit-event",
    eventId: event.id,
    expectedVersion: event.version + 2,
    scope: "SERIES",
    confirmed: true,
    title: "Updated remaining meetings",
    ...time,
    startLocal: "2026-10-25T10:00",
    endLocal: "2026-10-25T11:00",
    weeklyUntil: "2026-11-08"
  });
  rows = await db.calendarOccurrence.findMany({
    where: { eventId: event.id },
    orderBy: { ordinal: "asc" }
  });
  assert.deepEqual(
    rows.map((r) => r.id),
    original
  );
  assert.ok(rows[1].canceledAt);
  assert.equal(rows[1].title, "Only the second meeting");
  assert.equal(rows[0].startLocal, "2026-10-25T10:00");
  assert.equal(
    await db.calendarResponse.count({
      where: { occurrenceId: occurrence.id, userId: f.lee.id }
    }),
    1
  );
});

test("creation retries, competing saves, invalid times and forged IDs never create partial events", async () => {
  const f = await fixture(),
    requestKey = randomUUID();
  const input = {
    operation: "create-event",
    calendarId: f.church,
    expectedVersion: 1,
    requestKey,
    title: "Single create",
    visibility: "CHURCH",
    ...time
  };
  const [a, b] = await Promise.all([f.cmd(f.ada, input), f.cmd(f.ada, input)]);
  assert.equal(a.id, b.id);
  assert.equal(
    await db.calendarEvent.count({ where: { calendarId: f.church } }),
    1
  );
  const edit = {
    operation: "edit-event",
    eventId: a.id,
    expectedVersion: 1,
    scope: "SERIES",
    confirmed: true,
    title: "Concurrent save",
    ...time
  };
  const results = await Promise.allSettled([
    f.cmd(f.ada, edit),
    f.cmd(f.ada, { ...edit, title: "Other save" })
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const failed = results.find((r) => r.status === "rejected");
  assert.ok(failed?.status === "rejected" && failed.reason.status === 409);
  const before = await db.calendarAudit.count({
    where: { calendarId: f.church }
  });
  await denied(
    f.create(f.ada, f.church, { endLocal: "2026-10-25T07:00" }),
    400
  );
  assert.equal(
    await db.calendarEvent.count({ where: { calendarId: f.church } }),
    1
  );
  assert.equal(
    await db.calendarAudit.count({ where: { calendarId: f.church } }),
    before
  );
  const foreign = await f.create(f.blake, f.otherChurch);
  await denied(f.cmd(f.ada, { ...edit, eventId: foreign.id }));
  const own = await db.calendarOccurrence.findFirstOrThrow({
    where: { eventId: a.id }
  });
  await denied(
    f.cmd(f.ada, {
      ...edit,
      expectedVersion: 2,
      scope: "OCCURRENCE",
      occurrenceId: foreign.occurrences[0].id,
      occurrenceVersion: own.version
    }),
    404
  );
  await assert.rejects(
    db.platformCalendar.create({
      data: {
        ownerId: f.val.id,
        churchId: f.churchA.id,
        creatorId: f.val.id,
        requestKey: randomUUID(),
        name: "Invalid owners",
        timeZone: "UTC"
      }
    })
  );
  await assert.rejects(
    db.calendarOccurrence.update({
      where: { id: own.id },
      data: { endAt: own.startAt }
    })
  );
});

test("leaving and rejoining never restore calendar sharing or church commitments", async () => {
  const f = await fixture(),
    privateEvent = await f.create(f.val, f.personal);
  const churchEvent = await f.create(f.ada, f.church, { visibility: "CHURCH" });
  await f.shareCalendar("DETAILS");
  await f.cmd(f.val, {
    operation: "rsvp",
    eventId: churchEvent.id,
    occurrenceId: churchEvent.occurrences[0].id,
    occurrenceVersion: 1,
    expectedVersion: 0,
    state: "GOING"
  });
  const connection = await db.churchConnection.findUniqueOrThrow({
    where: { userId_churchId: { userId: f.val.id, churchId: f.churchA.id } }
  });
  await portalCommand(db, f.reviewerA.token, {
    operation: "transition",
    action: "REMOVE",
    churchId: f.churchA.id,
    connectionId: connection.id,
    expectedVersion: connection.version
  });
  await denied(
    getCalendarEvent(db, f.lee.token, privateEvent.occurrences[0].id),
    404
  );
  assert.equal(
    (await getCalendarCommitments(db, f.val.token, range)).commitments.length,
    0
  );
  assert.ok(
    (await getCalendarEvent(db, f.val.token, privateEvent.occurrences[0].id))
      .event
  );
  const rejoin = await requestConnection(db, f.val, f.churchA.id);
  await portalCommand(db, f.reviewerA.token, {
    operation: "transition",
    action: "APPROVE",
    churchId: f.churchA.id,
    connectionId: rejoin.id,
    expectedVersion: rejoin.version
  });
  await denied(
    getCalendarEvent(db, f.lee.token, privateEvent.occurrences[0].id),
    404
  );
  assert.equal(
    (await getCalendarCommitments(db, f.val.token, range)).commitments.length,
    0
  );
  assert.ok(
    (
      await db.calendarShare.findUniqueOrThrow({
        where: {
          calendarId_churchId: {
            calendarId: f.personal,
            churchId: f.churchA.id
          }
        }
      })
    ).revokedAt
  );
});

test("owner-only conflict hints, all-day viewer dates, cancellation and export keep private content separated", async () => {
  const f = await fixture();
  await f.create(f.val, f.personal, {
    title: "PRIVATE conflicting appointment",
    description: "PRIVATE extra notes",
    startLocal: "2026-10-25T09:30",
    endLocal: "2026-10-25T11:00"
  });
  const event = await f.create(f.ada, f.church, { visibility: "CHURCH" });
  await f.cmd(f.val, {
    operation: "rsvp",
    eventId: event.id,
    occurrenceId: event.occurrences[0].id,
    occurrenceVersion: 1,
    expectedVersion: 0,
    state: "GOING"
  });
  const valCommitments = await getCalendarCommitments(db, f.val.token, range);
  assert.ok(valCommitments.commitments[0].conflict);
  assert.ok(!JSON.stringify(valCommitments).includes("PRIVATE"));
  await f.cmd(f.lee, {
    operation: "rsvp",
    eventId: event.id,
    occurrenceId: event.occurrences[0].id,
    occurrenceVersion: 1,
    expectedVersion: 0,
    state: "GOING"
  });
  assert.equal(
    (await getCalendarCommitments(db, f.lee.token, range)).commitments[0]
      .conflict,
    null
  );
  const allDay = await f.create(f.ada, f.church, {
    visibility: "PUBLIC",
    allDay: true,
    startLocal: "2026-11-01",
    endLocal: "2026-11-02"
  });
  const publicDay = await getPublicChurchAgenda(db, {
    churchId: f.churchA.id,
    from: "2026-11-01",
    until: "2026-11-02",
    timeZone: "Pacific/Auckland"
  });
  assert.equal(publicDay.events[0].id, allDay.occurrences[0].id);
  assert.equal(publicDay.events[0].startLocal, "2026-11-01");
  const secret = "fictional-calendar-export-secret";
  const proof = await prepareAccountExport(
    db,
    f.val.token,
    f.val.password,
    secret
  );
  const data = JSON.parse(
    await downloadAccountExport(db, f.val.token, proof.authorization, secret)
  );
  assert.equal(data.personalCalendars.length, 1);
  assert.equal(data.personalEvents[0].title, "PRIVATE conflicting appointment");
  assert.equal(data.eventResponses.length, 1);
  assert.ok(
    !JSON.stringify(data.personalEvents).includes("Fictional outreach")
  );
  assert.ok(!JSON.stringify(data).includes(f.ada.email));
  await f.cmd(f.ada, {
    operation: "cancel-event",
    eventId: event.id,
    expectedVersion: 1,
    scope: "SERIES",
    confirmed: true
  });
  assert.equal(
    (await getCalendarCommitments(db, f.val.token, range)).commitments[0]
      .conflict,
    null
  );
});

test("publishing-only authority and busy-only commitments preserve independent permissions and privacy", async () => {
  const f = await fixture();
  const draft = await f.create(f.ada, f.church, {
    title: "Draft waiting for publisher"
  });
  await portalCommand(db, f.operator.token, {
    operation: "grant",
    churchId: f.churchA.id,
    userId: f.val.id,
    capability: "PUBLISH_CHURCH_EVENTS",
    expectedVersion: 0
  });
  const publisherView = (
    await getCalendarEvent(db, f.val.token, draft.occurrences[0].id)
  ).event;
  assert.equal(publisherView.access, "DETAILS");
  assert.ok("canPublish" in publisherView && publisherView.canPublish);
  assert.ok("canEdit" in publisherView && !publisherView.canEdit);
  await denied(
    f.cmd(f.val, {
      operation: "edit-event",
      eventId: draft.id,
      expectedVersion: 1,
      scope: "SERIES",
      confirmed: true,
      title: "Publisher cannot change draft",
      ...time
    })
  );
  await f.cmd(f.val, {
    operation: "set-visibility",
    eventId: draft.id,
    expectedVersion: 1,
    visibility: "CHURCH",
    confirmed: true
  });
  assert.equal(
    (await getCalendarEvent(db, f.lee.token, draft.occurrences[0].id)).event
      .title,
    "Draft waiting for publisher"
  );
  const shared = await f.create(f.val, f.personal, {
    title: "PRIVATE shared meeting",
    description: "PRIVATE meeting notes"
  });
  await f.shareCalendar("DETAILS");
  await f.cmd(f.lee, {
    operation: "rsvp",
    eventId: shared.id,
    occurrenceId: shared.occurrences[0].id,
    occurrenceVersion: 1,
    expectedVersion: 0,
    state: "GOING"
  });
  await f.cmd(f.lee, {
    operation: "rsvp",
    eventId: draft.id,
    occurrenceId: draft.occurrences[0].id,
    occurrenceVersion: 1,
    expectedVersion: 0,
    state: "GOING"
  });
  await f.shareCalendar("BUSY", 1);
  const commitments = await getCalendarCommitments(db, f.lee.token, range);
  assert.equal(commitments.commitments.length, 2);
  assert.ok(commitments.commitments.every((c) => c.conflict));
  assert.ok(!JSON.stringify(commitments).includes("PRIVATE"));
  assert.ok(commitments.commitments.some((c) => c.title === "Busy"));
  await denied(
    f.cmd(f.lee, {
      operation: "rsvp",
      eventId: shared.id,
      occurrenceId: shared.occurrences[0].id,
      occurrenceVersion: 1,
      expectedVersion: 1,
      state: "MAYBE"
    })
  );
  await f.cmd(f.lee, {
    operation: "withdraw-response",
    occurrenceId: shared.occurrences[0].id,
    expectedVersion: 1
  });
  assert.equal(
    (await getCalendarCommitments(db, f.lee.token, range)).commitments.length,
    1
  );
  await denied(
    f.cmd(f.blake, {
      operation: "withdraw-response",
      occurrenceId: shared.occurrences[0].id,
      expectedVersion: 1
    }),
    404
  );
});

test("deactivation preserves owned appointments but reactivation does not revive sharing or responses", async () => {
  const f = await fixture();
  const member = await createPortalActor(db, "calowner");
  const connection = await requestConnection(db, member, f.churchA.id);
  await portalCommand(db, f.reviewerA.token, {
    operation: "transition",
    action: "APPROVE",
    churchId: f.churchA.id,
    connectionId: connection.id,
    expectedVersion: connection.version
  });
  const updated = await db.churchConnection.findUniqueOrThrow({
    where: { id: connection.id }
  });
  await portalCommand(db, member.token, {
    operation: "share",
    connectionId: updated.id,
    expectedVersion: updated.version,
    listed: true,
    displayName: "Chosen calendar source",
    contactEmail: "chosen-only@example.test",
    phone: "+1 202 555 0154",
    emailAudience: "ONLY_ME",
    phoneAudience: "ONLY_ME"
  });
  const calendarId = await f.createCalendar(member);
  const ownEvent = await f.create(member, calendarId, {
    title: "Retained private appointment"
  });
  const churchEvent = await f.create(f.ada, f.church, { visibility: "CHURCH" });
  await f.cmd(member, {
    operation: "share-calendar",
    calendarId,
    churchId: f.churchA.id,
    expectedVersion: 0,
    level: "BUSY",
    confirmed: true
  });
  await f.cmd(member, {
    operation: "rsvp",
    eventId: churchEvent.id,
    occurrenceId: churchEvent.occurrences[0].id,
    occurrenceVersion: 1,
    expectedVersion: 0,
    state: "GOING"
  });
  const shared = await getCalendarEvent(
    db,
    f.lee.token,
    ownEvent.occurrences[0].id
  );
  assert.equal(shared.event.source.label, "Chosen calendar source · busy only");
  assert.ok(!JSON.stringify(shared).includes("chosen-only@example.test"));
  assert.ok(!JSON.stringify(shared).includes(member.email));
  await deactivateAccount(db, member.token, member.password, true);
  await denied(
    getCalendarEvent(db, f.lee.token, ownEvent.occurrences[0].id),
    404
  );
  await reactivateAccount(db, member.email, member.password, true);
  const token = await loginAccount(
    db,
    member.email,
    member.password,
    "reactivated-calendar-session"
  );
  assert.equal(
    (await getCalendarEvent(db, token, ownEvent.occurrences[0].id)).event.title,
    "Retained private appointment"
  );
  assert.equal(
    (await getCalendarCommitments(db, token, range)).commitments.length,
    0
  );
  await denied(
    getCalendarEvent(db, f.lee.token, ownEvent.occurrences[0].id),
    404
  );
});
