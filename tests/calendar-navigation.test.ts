import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { handleCalendarRequest } from "../lib/platform/calendar-boundary";
import { accountConfig } from "../lib/platform/account-config";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());

test("calendar writes reject a switched account before mutation and accept the current account", async () => {
  const original = await createPortalActor(db, "calendaroriginal"),
    current = await createPortalActor(db, "calendarcurrent");
  const body = JSON.stringify({
    operation: "create-calendar",
    requestKey: randomUUID(),
    name: "Fictional owner boundary calendar",
    timeZone: "UTC"
  });
  const request = (expected: string) =>
    new Request(accountConfig().origin + "/api/platform/calendars", {
      method: "POST",
      headers: {
        Origin: accountConfig().origin,
        Cookie: `church_platform_session=${current.token}`,
        "Content-Type": "application/json",
        "X-Expected-Account": expected
      },
      body
    });
  const rejected = await handleCalendarRequest(db, request(original.id));
  assert.equal(rejected.status, 401);
  assert.equal(
    await db.platformCalendar.count({
      where: { ownerId: { in: [original.id, current.id] } }
    }),
    0
  );
  const accepted = await handleCalendarRequest(db, request(current.id));
  assert.equal(accepted.status, 200, await accepted.clone().text());
  const receipt = await accepted.json();
  assert.equal(
    (await db.platformCalendar.findUniqueOrThrow({ where: { id: receipt.id } }))
      .ownerId,
    current.id
  );
  assert.equal(
    (await handleCalendarRequest(db, request(current.id))).status,
    200
  );
  assert.equal(
    await db.platformCalendar.count({ where: { ownerId: current.id } }),
    1
  );
});

test("calendar commitments GET keeps the focused signup boundary instead of returning an unrelated agenda", async () => {
  const actor = await createPortalActor(db, "calendarsignup");
  const url = new URL(accountConfig().origin + "/api/platform/calendars");
  url.search = new URLSearchParams({
    view: "commitments",
    from: "2026-11-01",
    until: "2026-11-30",
    timeZone: "UTC"
  }).toString();
  const read = () =>
    handleCalendarRequest(
      db,
      new Request(url, {
        headers: { Cookie: `church_platform_session=${actor.token}` }
      })
    );
  assert.equal((await read()).status, 200);
  url.searchParams.set("signup", "c" + randomUUID().replaceAll("-", ""));
  const focused = await read();
  assert.equal(focused.status, 404);
  assert.deepEqual(await focused.json(), {
    message: "This volunteer signup is unavailable."
  });
});
