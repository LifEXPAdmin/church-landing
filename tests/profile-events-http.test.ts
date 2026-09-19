import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import {
  profileEventsFixture,
  saveProfileEvent
} from "./profile-events-fixture";
import { getProfileEditor } from "../lib/platform/profiles";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const get = (path: string, token = "", headers = {}) =>
  fetch(origin + path, {
    headers: { Cookie: "church_platform_session=" + token, ...headers },
    redirect: "manual"
  });

test("actual profile event HTML/RSC and choice API recheck source audience and pinned identity without leaking stored references", async () => {
  const f = await profileEventsFixture(db),
    { event, occurrence } = f.source;
  await saveProfileEvent(db, f.owner, occurrence.id);
  const path =
    "/api/platform/profile?view=event-choice&occurrenceId=" + occurrence.id;
  const before = await getProfileEditor(db, f.owner.token);
  for (const [token, account] of [
    ["", f.owner.id],
    [f.owner.token, ""],
    [f.owner.token, f.viewer.id]
  ]) {
    const denied = await get(path, token, { "x-expected-account": account });
    assert.equal(denied.status, 401, await denied.clone().text());
    assert.match(denied.headers.get("cache-control")!, /no-store/);
    assert.ok(!(await denied.text()).includes(event.title));
  }
  const choice = await get(path, f.owner.token, {
    "x-expected-account": f.owner.id
  });
  assert.equal(choice.status, 200);
  assert.match(choice.headers.get("cache-control")!, /private.*no-store/);
  assert.equal((await choice.json()).event.id, occurrence.id);
  assert.deepEqual(
    await getProfileEditor(db, f.owner.token),
    before,
    "Checking an event does not save a selection"
  );
  for (const headers of [{}, { RSC: "1" }]) {
    const guest = await get(
      "/platform/profile/" + f.owner.username,
      "",
      headers
    );
    const guestBody = await guest.text();
    for (const marker of [event.title, occurrence.id])
      assert.ok(!guestBody.includes(marker));
    const member = await get(
      "/platform/profile/" + f.owner.username,
      f.memberB.token,
      headers
    );
    const body = await member.text();
    assert.ok(body.includes(event.title));
    // HTML includes the rendered link; RSC supplies the client component props.
    assert.ok(body.includes(occurrence.id));
    if (!("RSC" in headers))
      assert.ok(body.includes("/platform/events/" + occurrence.id));
    assert.ok(
      !body.includes("calendarOccurrenceId"),
      "Owner selection metadata is absent from reader payloads"
    );
  }
  await f.command({
    operation: "set-visibility",
    eventId: event.id,
    expectedVersion: event.version,
    visibility: "CHURCH",
    confirmed: true
  });
  const denied = await get(path, f.memberB.token, {
    "x-expected-account": f.memberB.id
  });
  assert.equal(denied.status, 404);
  for (const [token, suffix] of [
    [f.memberB.token, ""],
    [f.owner.token, "?preview=member"],
    [f.owner.token, "?preview=visitor"]
  ])
    for (const headers of [{}, { RSC: "1" }]) {
      const response = await get(
        "/platform/profile/" + f.owner.username + suffix,
        token,
        headers
      );
      const body = await response.text();
      for (const marker of [event.title, occurrence.id])
        assert.ok(
          !body.includes(marker),
          "Source-private event leaked to a profile audience"
        );
    }
  const snapshot = await get(
    "/api/platform/profile?view=member-snapshot&username=" + f.owner.username,
    f.memberB.token,
    { "x-expected-account": f.memberB.id }
  );
  assert.deepEqual(Object.keys(await snapshot.json()), ["snapshot"]);
});

test("actual profile writes require current source access, same-origin intent and the current profile version", async () => {
  const f = await profileEventsFixture(db);
  const source = await f.create(false, "CHURCH");
  const write = (
    token: string,
    expectedOwner: string,
    body: Record<string, unknown>,
    requestOrigin = origin
  ) =>
    fetch(origin + "/api/platform/account", {
      method: "POST",
      headers: {
        Cookie: "church_platform_session=" + token,
        Origin: requestOrigin,
        "Content-Type": "application/json",
        "x-expected-account": expectedOwner
      },
      body: JSON.stringify({ operation: "update-profile", ...body })
    });
  const fields = {
    name: f.memberB.name,
    expectedVersion: 0,
    profileModules: {
      testimony: "Kept local text",
      skills: [],
      links: [],
      calendarOccurrenceId: source.occurrence.id
    }
  };
  const inaccessible = await write(f.memberB.token, f.memberB.id, fields);
  assert.equal(inaccessible.status, 400, await inaccessible.clone().text());
  assert.equal(
    (await getProfileEditor(db, f.memberB.token)).presentation.version,
    0
  );
  const allowed = { ...fields, name: f.owner.name };
  assert.equal(
    (
      await write(
        f.owner.token,
        f.owner.id,
        allowed,
        "https://forged.example.test"
      )
    ).status,
    403
  );
  const switched = await write(f.owner.token, f.viewer.id, allowed);
  assert.equal(switched.status, 400);
  assert.match((await switched.json()).message, /sign in again/);
  assert.equal(
    (await getProfileEditor(db, f.owner.token)).presentation.version,
    0
  );
  const saved = await write(f.owner.token, f.owner.id, allowed);
  assert.equal(saved.status, 200, await saved.clone().text());
  const removed = await write(f.owner.token, f.owner.id, {
    ...allowed,
    expectedVersion: 1,
    profileModules: { ...allowed.profileModules, calendarOccurrenceId: null }
  });
  assert.equal(removed.status, 200, await removed.clone().text());
  assert.equal(
    (await write(f.owner.token, f.owner.id, { ...allowed, expectedVersion: 1 }))
      .status,
    409
  );
  assert.equal(
    (await getProfileEditor(db, f.owner.token)).presentation.modules
      .calendarOccurrenceId,
    null
  );
});
