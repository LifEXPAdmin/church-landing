import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import {
  profileEventsFixture,
  profileEventTime,
  saveProfileEvent
} from "./profile-events-fixture";
import {
  getProfileEditor,
  getMemberProfile,
  getVisitorProfilePreview
} from "../lib/platform/profiles";
import { getProfileEventChoice } from "../lib/platform/profile-events";
import { getPublicChurchAgenda } from "../lib/platform/calendar-reads";
import { readGroupEvents } from "../lib/platform/group-events";
import { calendarCommand } from "../lib/platform/calendar-commands";
import { updateAccountProfile } from "../lib/platform/accounts";
import { profileSnapshot } from "../lib/platform/profile-snapshot";
import { relationshipCommand } from "../lib/platform/relationships";
import {
  emptyProfileModules,
  validateProfileModules
} from "../lib/platform/profile-modules";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());

test("one original event updates church, group and profile projections without duplicating its RSVP", async () => {
  const f = await profileEventsFixture(db),
    { event, occurrence } = f.source;
  await saveProfileEvent(db, f.owner, occurrence.id);
  await calendarCommand(db, f.viewer.token, {
    operation: "rsvp",
    eventId: event.id,
    occurrenceId: occurrence.id,
    occurrenceVersion: occurrence.version,
    expectedVersion: 0,
    state: "GOING"
  });
  const response = await db.calendarResponse.findUniqueOrThrow({
    where: {
      occurrenceId_userId: { occurrenceId: occurrence.id, userId: f.viewer.id }
    }
  });
  const before = await getMemberProfile(db, f.viewer.token, f.owner.username);
  assert.equal(before.selectedEvent?.id, occurrence.id);
  assert.equal("calendarOccurrenceId" in before.presentation.modules, false);
  const title = "Updated shared event " + randomUUID();
  await f.command({
    operation: "edit-event",
    eventId: event.id,
    expectedVersion: event.version,
    occurrenceId: occurrence.id,
    occurrenceVersion: occurrence.version,
    scope: "OCCURRENCE",
    confirmed: true,
    title,
    location: "Changed fictional room",
    ...profileEventTime,
    startLocal: "2030-10-25T11:00",
    endLocal: "2030-10-25T12:00"
  });
  const profile = await getMemberProfile(db, f.viewer.token, f.owner.username);
  const church = await getPublicChurchAgenda(db, {
    churchId: f.churchA.id,
    from: "2030-10-01",
    until: "2030-11-01",
    timeZone: "America/Chicago"
  });
  const group = await readGroupEvents(db, f.viewer.token, f.group.id);
  const views = [
    profile.selectedEvent,
    church.events.find((e) => e.id === occurrence.id),
    group.events[0].event
  ];
  for (const view of views) {
    assert.equal(view?.id, occurrence.id);
    assert.equal(view?.title, title);
    assert.equal(view?.location, "Changed fictional room");
    assert.equal(view?.startLocal, "2030-10-25T11:00");
  }
  assert.notEqual(
    profileSnapshot(before).snapshot,
    profileSnapshot(profile).snapshot
  );
  assert.deepEqual(
    await db.calendarResponse.findUniqueOrThrow({ where: { id: response.id } }),
    response
  );
  assert.equal(
    await db.calendarResponse.count({ where: { occurrenceId: occurrence.id } }),
    1
  );
  const current = await db.calendarEvent.findUniqueOrThrow({
    where: { id: event.id }
  });
  const currentOccurrence = await db.calendarOccurrence.findUniqueOrThrow({
    where: { id: occurrence.id }
  });
  await f.command({
    operation: "cancel-event",
    eventId: event.id,
    expectedVersion: current.version,
    occurrenceId: occurrence.id,
    occurrenceVersion: currentOccurrence.version,
    scope: "OCCURRENCE",
    confirmed: true
  });
  assert.equal(
    (await getMemberProfile(db, f.viewer.token, f.owner.username)).selectedEvent
      ?.canceled,
    true
  );
  assert.equal(
    (await readGroupEvents(db, f.viewer.token, f.group.id)).events[0].event
      ?.canceled,
    true
  );
  await assert.rejects(
    getProfileEventChoice(db, f.owner.token, occurrence.id, f.owner.id),
    /unavailable/
  );
  assert.equal(
    await db.calendarResponse.count({ where: { occurrenceId: occurrence.id } }),
    1
  );
});

test("current source visibility, church access, busy-only shares, blocks and generic previews protect profile selections", async () => {
  const f = await profileEventsFixture(db),
    { event, occurrence } = f.source;
  await saveProfileEvent(db, f.owner, occurrence.id);
  const publicSnapshot = profileSnapshot(
    await getMemberProfile(db, f.memberB.token, f.owner.username)
  );
  await f.command({
    operation: "set-visibility",
    eventId: event.id,
    expectedVersion: event.version,
    visibility: "CHURCH",
    confirmed: true
  });
  const outsider = await getMemberProfile(
    db,
    f.memberB.token,
    f.owner.username
  );
  assert.equal(outsider.selectedEvent, null);
  assert.equal(JSON.stringify(outsider).includes(occurrence.id), false);
  assert.equal(JSON.stringify(outsider).includes(event.title), false);
  assert.notEqual(profileSnapshot(outsider).snapshot, publicSnapshot.snapshot);
  assert.equal(
    (await getMemberProfile(db, f.viewer.token, f.owner.username)).selectedEvent
      ?.id,
    occurrence.id
  );
  assert.equal(
    (
      await getMemberProfile(db, f.owner.token, f.owner.username, {
        preview: "member"
      })
    ).selectedEvent,
    null
  );
  assert.deepEqual(
    await getVisitorProfilePreview(db, f.owner.token, f.owner.username),
    { name: f.owner.name, username: f.owner.username }
  );
  await assert.rejects(
    getProfileEventChoice(db, f.memberB.token, occurrence.id, f.memberB.id),
    /unavailable/
  );
  await assert.rejects(
    getProfileEventChoice(db, f.owner.token, occurrence.id, f.viewer.id),
    /sign-in changed/
  );
  await assert.rejects(
    getProfileEventChoice(db, null, occurrence.id, f.owner.id),
    /sign-in changed/
  );
  await assert.rejects(
    saveProfileEvent(db, f.memberB, occurrence.id),
    /profile-event/
  );
  const personal = await f.create(true);
  await saveProfileEvent(db, f.owner, personal.occurrence.id);
  await f.command({
    operation: "share-calendar",
    calendarId: personal.calendar.id,
    churchId: f.churchA.id,
    expectedVersion: 0,
    level: "BUSY",
    confirmed: true
  });
  assert.equal(
    (await getMemberProfile(db, f.viewer.token, f.owner.username))
      .selectedEvent,
    null
  );
  await f.command({
    operation: "share-calendar",
    calendarId: personal.calendar.id,
    churchId: f.churchA.id,
    expectedVersion: 1,
    level: "DETAILS",
    confirmed: true
  });
  assert.equal(
    (await getMemberProfile(db, f.viewer.token, f.owner.username)).selectedEvent
      ?.id,
    personal.occurrence.id
  );
  await relationshipCommand(db, f.viewer.token, {
    operation: "block",
    kind: "person",
    targetId: f.owner.id,
    expectedVersion: 0,
    desired: true,
    mutationId: randomUUID()
  });
  await assert.rejects(
    getProfileEventChoice(
      db,
      f.viewer.token,
      personal.occurrence.id,
      f.viewer.id
    ),
    /unavailable/
  );
  await assert.rejects(getMemberProfile(db, f.viewer.token, f.owner.username));
});

test("older editors preserve the chosen reference and stale writers cannot undo explicit removal", async () => {
  const f = await profileEventsFixture(db);
  await saveProfileEvent(db, f.owner, f.source.occurrence.id);
  let p = await getProfileEditor(db, f.owner.token);
  await updateAccountProfile(
    db,
    f.owner.token,
    {
      name: f.owner.name,
      expectedVersion: p.presentation.version,
      profileModules: { ...emptyProfileModules(), skills: ["Listening"] }
    },
    f.owner.id
  );
  p = await getProfileEditor(db, f.owner.token);
  assert.equal(
    p.presentation.modules.calendarOccurrenceId,
    f.source.occurrence.id
  );
  await saveProfileEvent(db, f.owner, null);
  const removed = await getProfileEditor(db, f.owner.token);
  assert.equal(removed.presentation.modules.calendarOccurrenceId, null);
  await assert.rejects(
    saveProfileEvent(db, f.owner, f.source.occurrence.id, {
      expectedVersion: p.presentation.version
    }),
    /profile-conflict/
  );
  assert.deepEqual(await getProfileEditor(db, f.owner.token), removed);
  assert.equal(
    await db.calendarEvent.count({ where: { id: f.source.event.id } }),
    1
  );
  for (const value of [
    "",
    "x".repeat(101),
    "https://example.test/event",
    1,
    {},
    []
  ])
    assert.throws(() =>
      validateProfileModules({
        ...emptyProfileModules(),
        calendarOccurrenceId: value
      })
    );
});

test("own export includes the reference and opaque recovery controls prevent restoring a removed selection", async () => {
  const f = await profileEventsFixture(db);
  await saveProfileEvent(db, f.owner, f.source.occurrence.id);
  const old = await db.profilePresentation.findUniqueOrThrow({
    where: { userId: f.owner.id }
  });
  const proof = await prepareAccountExport(
    db,
    f.owner.token,
    f.owner.password,
    process.env.AUTH_RATE_LIMIT_SECRET!
  );
  const exported = await downloadAccountExport(
    db,
    f.owner.token,
    proof.authorization,
    process.env.AUTH_RATE_LIMIT_SECRET!
  );
  assert.equal(
    JSON.parse(exported).account.presentation.modules.calendarOccurrenceId,
    f.source.occurrence.id
  );
  await saveProfileEvent(db, f.owner, null);
  const entries = (
    await db.retentionControl.findMany({
      where: { kind: "PROFILE_MODULES", sourceId: f.owner.id },
      orderBy: { version: "asc" }
    })
  ).map((row) => row.payload as unknown as RetentionControlEntry);
  assert.equal(JSON.stringify(entries).includes(f.source.occurrence.id), false);
  await db.profilePresentation.update({
    where: { userId: f.owner.id },
    data: {
      version: old.version,
      modulesVersion: old.modulesVersion,
      modules: old.modules!
    }
  });
  await replayRetentionControls(db, entries);
  const restored = await getProfileEditor(db, f.owner.token);
  assert.equal(restored.presentation.modules.calendarOccurrenceId, undefined);
  assert.equal(
    (await getMemberProfile(db, f.viewer.token, f.owner.username))
      .selectedEvent,
    null
  );
  await replayRetentionControls(db, entries);
  assert.deepEqual(await getProfileEditor(db, f.owner.token), restored);
  await assert.rejects(
    saveProfileEvent(db, f.owner, f.source.occurrence.id, {
      expectedVersion: old.version
    }),
    /profile-conflict/
  );
  await saveProfileEvent(db, f.owner, f.source.occurrence.id);
  await replayRetentionControls(db, entries);
  assert.equal(
    (await getProfileEditor(db, f.owner.token)).presentation.modules
      .calendarOccurrenceId,
    f.source.occurrence.id
  );
});
