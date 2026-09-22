import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  seedPortal,
  assertPortalTestDatabase,
  createPortalActor,
  type PortalActor
} from "./seed-portal";
import { calendarCommand } from "../lib/platform/calendar-commands";
import {
  getCalendars,
  getCalendarDetails,
  getCalendarAgenda
} from "../lib/platform/calendar-reads";
import { PortalError } from "../lib/platform/portal-policy";
import { loginAccount } from "../lib/platform/accounts";
import { handleCalendarRequest } from "../lib/platform/calendar-boundary";
import {
  journalRetentionControls,
  protectedRetentionControls,
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
import { requestPermanentAccountDeletion } from "../lib/platform/account-deletion";
import { eraseRequestedAccountData } from "../lib/platform/account-erasure";
import { createSessionToken } from "../lib/platform/auth";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const denied = (promise: Promise<unknown>, status: number) =>
  assert.rejects(
    promise,
    (e: unknown) => e instanceof PortalError && e.status === status
  );
const range = { from: "2026-10-01", until: "2026-11-01", timeZone: "UTC" };
const cmd = (a: PortalActor, input: Record<string, unknown>) =>
  calendarCommand(db, a.token, input);
async function personal(a: PortalActor) {
  return (
    await cmd(a, {
      operation: "create-calendar",
      name: "Private layer fixture",
      timeZone: "UTC",
      requestKey: randomUUID()
    })
  ).id;
}
function save(
  calendarId: string,
  expectedVersion = 0,
  choices: Record<string, unknown> = {}
) {
  return {
    operation: "save-layer",
    calendarId,
    expectedVersion,
    requestKey: randomUUID(),
    followed: true,
    visible: true,
    color: "BLUE",
    ...choices
  };
}
async function choices(a: PortalActor, id: string) {
  return (await getCalendarDetails(db, a.token, id)).calendar.layer;
}
async function event(a: PortalActor, id: string) {
  return cmd(a, {
    operation: "create-event",
    calendarId: id,
    expectedVersion: 1,
    requestKey: randomUUID(),
    title: "Private appointment marker",
    description: "Private layer notes",
    location: "Private address",
    onlineUrl: "https://example.test/private-join",
    organizer: "Private organizer",
    allDay: false,
    timeZone: "UTC",
    startLocal: "2026-10-10T09:00",
    endLocal: "2026-10-10T10:00",
    weeklyUntil: null
  });
}
test("defaults survive and private follow, visibility and colors persist across sessions without touching sources", async () => {
  const a = await createPortalActor(db, "layerowner"),
    id = await personal(a);
  const e = await event(a, id),
    original = await db.calendarEvent.findUniqueOrThrow({
      where: { id: e.id }
    });
  assert.deepEqual(await choices(a, id), {
    followed: true,
    visible: true,
    color: "DEFAULT",
    version: 0,
    recoveryRequired: false
  });
  await cmd(a, save(id, 0, { followed: false }));
  assert.equal((await choices(a, id)).followed, false);
  assert.equal(
    (await getCalendars(db, a.token)).calendars.some((c) => c.id === id),
    true
  );
  const token = await loginAccount(
    db,
    a.email,
    a.password,
    "second-layer-session"
  );
  assert.equal(
    (await getCalendarDetails(db, token, id)).calendar.layer.followed,
    false
  );
  await cmd(a, save(id, 1, { visible: false, color: "PURPLE" }));
  assert.deepEqual(await choices(a, id), {
    followed: true,
    visible: false,
    color: "PURPLE",
    version: 2,
    recoveryRequired: false
  });
  await cmd(a, save(id, 2, { color: "GREEN" }));
  assert.equal((await choices(a, id)).visible, true);
  assert.deepEqual(
    await db.calendarEvent.findUniqueOrThrow({ where: { id: e.id } }),
    original
  );
  assert.equal(
    await db.calendarResponse.count({
      where: { occurrence: { eventId: e.id } }
    }),
    0
  );
  assert.equal(await db.calendarShare.count({ where: { calendarId: id } }), 0);
});
test("exact retries are idempotent, competing saves conflict, and unsupported fields or account changes cannot write", async () => {
  const a = await createPortalActor(db, "layerretry"),
    b = await createPortalActor(db, "layerother"),
    id = await personal(a);
  const input = save(id),
    first = await cmd(a, input);
  assert.deepEqual(await cmd(a, input), first);
  assert.equal(
    await db.retentionControl.count({
      where: { targetId: a.id, sourceId: id, kind: "CALENDAR_LAYER" }
    }),
    1
  );
  await denied(cmd(a, { ...input, color: "GREEN" }), 409);
  const competing = await Promise.allSettled([
    cmd(a, save(id, 1, { color: "PURPLE" })),
    cmd(a, save(id, 1, { color: "ROSE" }))
  ]);
  assert.equal(competing.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (competing.find((r) => r.status === "rejected") as PromiseRejectedResult)
      .reason.status,
    409
  );
  await denied(cmd(a, input), 409);
  await denied(
    cmd(a, save(id, 2, { color: "url(https://example.test)" })),
    400
  );
  await denied(cmd(a, save(id, 2, { visible: "false" })), 400);
  await denied(cmd(a, save(id, 2, { ownerId: b.id })), 400);
  await denied(cmd(b, save(id)), 404);
  const origin = process.env.ACCOUNT_ORIGIN!;
  const response = await handleCalendarRequest(
    db,
    new Request(origin + "/api/platform/calendars", {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        cookie: "church_platform_session=" + a.token,
        "x-expected-account": b.id
      },
      body: JSON.stringify(save(id, 2))
    })
  );
  assert.equal(response.status, 401);
  assert.equal((await choices(a, id)).version, 2);
});
test("following shared Busy and full-detail sources never expands access, and revoked sources disappear", async () => {
  const f = await seedPortal(db),
    a = f.contact,
    b = f.coordinator,
    id = await personal(a);
  await event(a, id);
  const share = (level: string, version: number) =>
    cmd(a, {
      operation: "share-calendar",
      calendarId: id,
      churchId: f.churchA.id,
      expectedVersion: version,
      level,
      confirmed: true
    });
  await share("BUSY", 0);
  const input = save(id);
  await cmd(b, input);
  const busy = (
    await getCalendarAgenda(db, b.token, { ...range, calendarIds: [id] })
  ).events;
  assert.equal(busy.length, 1);
  assert.equal(busy[0].title, "Busy");
  for (const marker of [
    "Private appointment marker",
    "Private layer notes",
    "Private address",
    "private-join",
    "Private organizer"
  ])
    assert.ok(!JSON.stringify(busy).includes(marker));
  assert.equal((await choices(a, id)).version, 0);
  await denied(cmd(f.memberB, save(id)), 404);
  await share("DETAILS", 1);
  assert.equal(
    (await getCalendarAgenda(db, b.token, { ...range, calendarIds: [id] }))
      .events[0].title,
    "Private appointment marker"
  );
  await cmd(a, {
    operation: "revoke-calendar-share",
    calendarId: id,
    churchId: f.churchA.id,
    expectedVersion: 2
  });
  assert.ok(
    !(await getCalendars(db, b.token)).calendars.some((c) => c.id === id)
  );
  await denied(getCalendarDetails(db, b.token, id), 404);
  await denied(
    getCalendarAgenda(db, b.token, { ...range, calendarIds: [id] }),
    403
  );
  await denied(cmd(b, input), 404);
  assert.equal(
    await db.calendarLayerPreference.count({
      where: { ownerId: b.id, calendarId: id }
    }),
    1
  );
});
test("protected recovery turns missing and stale choices off, remains idempotent and allows explicit owner review", async () => {
  const a = await createPortalActor(db, "layerrestore"),
    id = await personal(a);
  await cmd(a, save(id));
  await cmd(a, save(id, 1, { followed: false, visible: false }));
  const rows = await db.retentionControl.findMany({
    where: { targetId: a.id, sourceId: id, kind: "CALENDAR_LAYER" },
    orderBy: { version: "asc" }
  });
  const values = new Map<string, RetentionControlEntry>();
  const journal = protectedRetentionControls({
    async read(key) {
      return values.get(key) ?? null;
    },
    async write(key, value) {
      assert.ok(!values.has(key));
      values.set(key, structuredClone(value));
    },
    async remove(key) {
      values.delete(key);
    },
    async page() {
      return { paths: [...values.keys()] };
    }
  });
  assert.equal((await journalRetentionControls(db, journal, a.id)).pending, 0);
  const entries = (await journal.page()).entries;
  assert.equal(entries.length, 2);
  assert.ok(!JSON.stringify(entries).includes("BLUE"));
  assert.ok(!JSON.stringify(entries).includes("Private layer fixture"));
  await db.calendarLayerPreference.updateMany({
    where: { ownerId: a.id },
    data: { followed: true, visible: true, version: 1 }
  });
  await replayRetentionControls(db, [entries.find((e) => e.version === 2)!]);
  assert.deepEqual(await choices(a, id), {
    followed: false,
    visible: false,
    color: "DEFAULT",
    version: 2,
    recoveryRequired: true
  });
  await replayRetentionControls(db, entries);
  assert.equal((await choices(a, id)).version, 2);
  await db.calendarLayerPreference.deleteMany({ where: { ownerId: a.id } });
  await replayRetentionControls(db, entries.slice().reverse());
  assert.equal((await choices(a, id)).recoveryRequired, true);
  await cmd(a, save(id, 2, { color: "ORANGE" }));
  await replayRetentionControls(
    db,
    rows.map((r) => r.payload as unknown as RetentionControlEntry)
  );
  assert.deepEqual(await choices(a, id), {
    followed: true,
    visible: true,
    color: "ORANGE",
    version: 3,
    recoveryRequired: false
  });
});
test("export and erasure affect only the owner's preference metadata and recovery never recreates erased owners", async () => {
  const f = await seedPortal(db),
    owner = await createPortalActor(db, "layererase"),
    id = await personal(f.contact);
  // An approved shared source is unnecessary for erasure scope: a personal
  // calendar stays owned by the surviving account while only the fixture's
  // own preference is removed by the ordinary account erasure path.
  await db.calendarLayerPreference.create({
    data: {
      ownerId: owner.id,
      calendarId: id,
      color: "ROSE",
      followed: false,
      visible: false
    }
  });
  await cmd(f.contact, save(id));
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!;
  const proof = await prepareAccountExport(
    db,
    owner.token,
    owner.password,
    secret
  );
  const exported = JSON.parse(
    await downloadAccountExport(db, owner.token, proof.authorization, secret)
  );
  const text = JSON.stringify(exported);
  assert.ok(text.includes('"color":"ROSE"'));
  assert.ok(!text.includes("Private layer fixture"));
  assert.ok(!text.includes('"color":"BLUE"'));
  const journal = { async recordAccount() {}, async completeAccount() {} };
  await requestPermanentAccountDeletion(
    db,
    owner.token,
    owner.password,
    true,
    createSessionToken(),
    journal
  );
  const request = await db.accountDeletion.findUniqueOrThrow({
    where: { userId: owner.id }
  });
  await eraseRequestedAccountData(db, request.id, journal);
  assert.equal(
    await db.calendarLayerPreference.count({ where: { ownerId: owner.id } }),
    0
  );
  assert.equal(
    await db.calendarLayerPreference.count({
      where: { ownerId: f.contact.id, calendarId: id }
    }),
    1
  );
  assert.ok(await db.platformCalendar.findUnique({ where: { id } }));
  const receipt = await db.retentionControl.findFirstOrThrow({
    where: { targetId: f.contact.id, sourceId: id, kind: "CALENDAR_LAYER" }
  });
  const payload = {
    ...(receipt.payload as unknown as RetentionControlEntry),
    id: randomUUID(),
    targetId: owner.id,
    operatorId: owner.id
  };
  await replayRetentionControls(db, [payload]);
  assert.equal(
    await db.calendarLayerPreference.count({ where: { ownerId: owner.id } }),
    0
  );
});
