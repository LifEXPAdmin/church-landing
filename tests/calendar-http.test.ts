import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { registerAccount, loginAccount } from "../lib/platform/accounts";
import { ADULT_POLICY } from "../lib/platform/portal-types";
import { safeAccountReturn } from "../lib/platform/account-entry";
const db = new PrismaClient();
const origin = process.env.ACCOUNT_ORIGIN!;
const production = process.env.CALENDAR_RENDER_PHASE === "production";
assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
assert.equal(new URL(process.env.DATABASE_URL!).hostname, "127.0.0.1");
assert.equal(
  new URL(process.env.DATABASE_URL!).pathname,
  "/godschurches_security_test"
);
assert.match(origin, /^https?:\/\/127\.0\.0\.1:\d+$/);
const password = "Fictional-calendar-http-password-1";
async function actor(label: string) {
  await db.platformAuthLimit.deleteMany();
  const username = label + "_" + randomUUID().slice(0, 8);
  await registerAccount(db, {
    username,
    name: username + " Login Identity",
    email: username + "@example.test",
    password,
    confirmPassword: password,
    role: "BELIEVER"
  });
  // Isolated renderer fixtures. Service/browser fixtures also exercise the real
  // registration and local delivery sink; this is not a production activation.
  const user = await db.platformUser.update({
    where: { username },
    data: {
      emailVerifiedAt: new Date(),
      adultAcknowledgedAt: new Date(),
      adultPolicyVersion: ADULT_POLICY
    }
  });
  return { user, token: await loginAccount(db, user.email, password, null) };
}
let ada: Awaited<ReturnType<typeof actor>>,
  lee: typeof ada,
  val: typeof ada,
  blake: typeof ada;
let churchId: string, otherChurchId: string;
before(async () => {
  ada = await actor("ada");
  lee = await actor("lee");
  val = await actor("val");
  blake = await actor("blake");
  churchId = (
    await db.church.create({
      data: {
        name: "Fictional Calendar HTTP Church " + randomUUID(),
        slug: "calendar-" + randomUUID(),
        summary: "Public fixture"
      }
    })
  ).id;
  otherChurchId = (
    await db.church.create({
      data: {
        name: "Other Calendar HTTP Church",
        slug: "calendar-other-" + randomUUID(),
        summary: "Other public fixture"
      }
    })
  ).id;
  for (const a of [ada, lee, val, blake]) {
    const church = a === blake ? otherChurchId : churchId;
    const connection = await db.churchConnection.create({
      data: { userId: a.user.id, churchId: church, state: "APPROVED" }
    });
    if (a === ada)
      await db.churchCapabilityGrant.createMany({
        data: (["EDIT_CHURCH_CALENDAR", "PUBLISH_CHURCH_EVENTS"] as const).map(
          (capability) => ({
            userId: a.user.id,
            churchId: church,
            capability,
            dependencyConnectionId: connection.id
          })
        )
      });
  }
});
after(() => db.$disconnect());
const get = (path: string, token = "", rsc = false) =>
  fetch(origin + path, {
    headers: {
      ...(token ? { Cookie: "church_platform_session=" + token } : {}),
      ...(rsc ? { RSC: "1" } : {})
    }
  });
const post = (input: unknown, token = ada.token, extra = {}) =>
  fetch(origin + "/api/platform/calendars", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: "church_platform_session=" + token,
      ...extra
    },
    body: JSON.stringify(input)
  });
async function cmd(
  input: Record<string, unknown>,
  token = ada.token,
  status = 200
) {
  const response = await post(input, token);
  assert.equal(response.status, status, await response.clone().text());
  assert.match(response.headers.get("Cache-Control")!, /private, no-store/);
  return response.json();
}
async function api(params: Record<string, string>, token = "", status = 200) {
  const response = await get(
    "/api/platform/calendars?" + new URLSearchParams(params),
    token
  );
  assert.equal(response.status, status, await response.clone().text());
  assert.match(response.headers.get("Cache-Control")!, /private, no-store/);
  return response.json();
}
const range = {
  from: "2026-11-01",
  until: "2026-12-01",
  timeZone: "America/Chicago"
};
const times = {
  allDay: false,
  startLocal: "2026-11-01T09:00",
  endLocal: "2026-11-01T10:00",
  timeZone: "America/Chicago",
  weeklyUntil: null
};
const createCalendar = (name: string, token: string, churchId?: string) =>
  cmd(
    {
      operation: "create-calendar",
      requestKey: randomUUID(),
      name,
      timeZone: "America/Chicago",
      churchId
    },
    token
  );
async function createEvent(
  calendarId: string,
  title: string,
  token: string,
  extra = {}
) {
  const { calendar } = await api({ view: "calendar", calendarId }, token);
  return cmd(
    {
      operation: "create-event",
      calendarId,
      requestKey: randomUUID(),
      expectedVersion: calendar.version,
      title,
      ...times,
      ...extra
    },
    token
  );
}
test("actual calendar HTML, RSC and JSON preserve public, church, busy and private audiences", async () => {
  const privateCalendar = await createCalendar(
    "PRIVATE-CALENDAR-NAME-CANARY",
    val.token
  );
  const privateEvent = await createEvent(
    privateCalendar.id,
    "PRIVATE-APPOINTMENT-TITLE-CANARY",
    val.token,
    {
      description: "PRIVATE-APPOINTMENT-NOTES-CANARY",
      location: "PRIVATE-APPOINTMENT-LOCATION-CANARY",
      organizer: "PRIVATE-ORGANIZER-CANARY",
      onlineUrl: "https://private-calendar-canary.example.test"
    }
  );
  const churchCalendar = await createCalendar(
    "Church gatherings",
    ada.token,
    churchId
  );
  const publicEvent = await createEvent(
    churchCalendar.id,
    "Public weekly gathering",
    ada.token,
    { visibility: "PUBLIC", weeklyUntil: "2026-11-15" }
  );
  const memberEvent = await createEvent(
    churchCalendar.id,
    "MEMBER-EVENT-TITLE-CANARY",
    ada.token,
    { visibility: "CHURCH" }
  );
  const draft = await createEvent(
    churchCalendar.id,
    "CHURCH-DRAFT-TITLE-CANARY",
    ada.token
  );
  await cmd(
    {
      operation: "share-calendar",
      calendarId: privateCalendar.id,
      churchId,
      level: "BUSY",
      confirmed: true,
      expectedVersion: 0
    },
    val.token
  );
  const busy = await api(
    { view: "event", occurrenceId: privateEvent.occurrenceId },
    lee.token
  );
  assert.equal(busy.event.title, "Busy");
  assert.equal(busy.event.description, undefined);
  assert.equal(busy.event.canEdit, undefined);
  assert.equal(busy.series, undefined);
  assert.equal(busy.shares, undefined);
  await api(
    { view: "event", occurrenceId: privateEvent.occurrenceId },
    blake.token,
    404
  );
  await api(
    { view: "calendar", calendarId: privateCalendar.id },
    blake.token,
    404
  );
  await api(
    { view: "public-event", occurrenceId: privateEvent.occurrenceId },
    "",
    404
  );
  for (const token of ["", blake.token]) {
    const publicRows = await api(
      { view: "public-agenda", churchId, ...range },
      token
    );
    assert.equal(publicRows.events.length, 3);
    assert.ok(
      publicRows.events.every(
        (e: { title: string }) => e.title === "Public weekly gathering"
      )
    );
  }
  const needles = [
    "PRIVATE-APPOINTMENT",
    "PRIVATE-CALENDAR-NAME-CANARY",
    "PRIVATE-ORGANIZER",
    "private-calendar-canary.example.test",
    val.user.email,
    val.user.passwordHash!,
    val.token
  ];
  for (const rsc of [false, true]) {
    for (const [path, token, visible, absent] of [
      [
        `/platform/events/${privateEvent.occurrenceId}`,
        lee.token,
        "Busy",
        needles
      ],
      [
        `/platform/calendars/${privateCalendar.id}?month=2026-11&timeZone=America%2FChicago`,
        lee.token,
        "Busy",
        needles
      ],
      [
        `/platform/churches/${churchId}/calendar?month=2026-11&timeZone=America%2FChicago`,
        "",
        "Public weekly gathering",
        [...needles, "MEMBER-EVENT-TITLE-CANARY", "CHURCH-DRAFT-TITLE-CANARY"]
      ],
      [
        `/platform/events/${memberEvent.occurrenceId}`,
        "",
        "unavailable",
        ["MEMBER-EVENT-TITLE-CANARY"]
      ],
      [
        `/platform/events/${draft.occurrenceId}`,
        lee.token,
        "unavailable",
        ["CHURCH-DRAFT-TITLE-CANARY"]
      ],
      [
        `/platform/events/${publicEvent.occurrenceId}`,
        "",
        "Join to respond",
        [...needles, "CHURCH-DRAFT-TITLE-CANARY"]
      ]
    ] as const) {
      const response = await get(path, token, rsc);
      assert.equal(response.status, 200, path);
      const body = await response.text();
      assert.ok(
        body.includes(
          production ? visible : "Open the calendar production preview"
        ),
        path
      );
      for (const needle of [...absent, token].filter(Boolean))
        assert.ok(
          !body.includes(needle),
          `${path} leaked ${needle.slice(0, 22)}`
        );
    }
  }
  const oldRead = await api(
    { view: "event", occurrenceId: privateEvent.occurrenceId },
    lee.token
  );
  await cmd(
    {
      operation: "revoke-calendar-share",
      calendarId: privateCalendar.id,
      churchId,
      expectedVersion: 1
    },
    val.token
  );
  assert.equal(oldRead.event.title, "Busy");
  await api(
    { view: "event", occurrenceId: privateEvent.occurrenceId },
    lee.token,
    404
  );
  await api(
    { view: "agenda", calendarId: privateCalendar.id, ...range },
    lee.token,
    403
  );
});

test("actual calendar commands enforce origin, body bounds, session, idempotency and stale versions", async () => {
  await db.platformAuthLimit.deleteMany();
  const input = {
    operation: "create-calendar",
    requestKey: randomUUID(),
    name: "Retry calendar",
    timeZone: "America/Chicago"
  };
  assert.equal(
    (await post(input, ada.token, { Origin: "https://attacker.example.test" }))
      .status,
    403
  );
  assert.equal(
    (await post(input, ada.token, { "Sec-Fetch-Site": "cross-site" })).status,
    403
  );
  assert.equal((await post(input, "")).status, 401);
  assert.equal((await post({ ...input, name: "x".repeat(70000) })).status, 400);
  const first = await cmd(input),
    retry = await cmd(input);
  assert.equal(first.id, retry.id);
  assert.equal(
    await db.platformCalendar.count({
      where: { creatorId: ada.user.id, requestKey: input.requestKey }
    }),
    1
  );
  const eventInput = {
    operation: "create-event",
    calendarId: first.id,
    requestKey: randomUUID(),
    expectedVersion: 1,
    title: "Retried event",
    ...times
  };
  const e1 = await cmd(eventInput),
    e2 = await cmd(eventInput);
  assert.equal(e1.id, e2.id);
  assert.equal(e1.occurrenceId, e2.occurrenceId);
  assert.ok(e1.occurrenceId);
  await cmd(
    {
      ...eventInput,
      requestKey: randomUUID(),
      expectedVersion: 2,
      endLocal: times.startLocal
    },
    ada.token,
    400
  );
  assert.equal(
    await db.calendarEvent.count({ where: { calendarId: first.id } }),
    1
  );
  const edit = {
    operation: "rename-calendar",
    calendarId: first.id,
    expectedVersion: 2,
    name: "Renamed calendar",
    timeZone: "America/Chicago"
  };
  await cmd(edit);
  await cmd({ ...edit, name: "Stale overwrite" }, ada.token, 409);
  await cmd({ ...edit, expectedVersion: 3 }, blake.token, 403);
  for (let n = 0; n < 9; n++)
    await post({ ...input, requestKey: randomUUID() });
  assert.equal(
    (await post({ ...input, requestKey: randomUUID() })).status,
    429
  );
  for (const route of [
    "/platform/calendars",
    "/platform/calendars/fixture",
    "/platform/commitments",
    "/platform/events/fixture",
    "/platform/churches/fixture/calendar"
  ])
    assert.equal(
      safeAccountReturn(
        route + "?month=2026-11&timeZone=America%2FChicago&token=secret"
      ),
      route + "?month=2026-11&timeZone=America%2FChicago"
    );
});

test("actual RSVP and occurrence edits preserve identity, current permissions and private commitments", async () => {
  await db.platformAuthLimit.deleteMany();
  const calendar = await createCalendar(
    "Response calendar",
    ada.token,
    churchId
  );
  const event = await createEvent(
    calendar.id,
    "Weekly response gathering",
    ada.token,
    { visibility: "CHURCH", weeklyUntil: "2026-11-15" }
  );
  const initial = await api(
    { view: "event", occurrenceId: event.occurrenceId },
    lee.token
  );
  assert.equal(initial.occurrences.length, 3);
  const responseInput = {
    operation: "rsvp",
    eventId: event.id,
    occurrenceId: event.occurrenceId,
    occurrenceVersion: initial.event.version,
    expectedVersion: 0,
    state: "GOING"
  };
  await cmd(responseInput, lee.token);
  const secondToken = await loginAccount(
    db,
    lee.user.email,
    password,
    "second-fictional-session"
  );
  assert.equal(
    (
      await api(
        { view: "event", occurrenceId: event.occurrenceId },
        secondToken
      )
    ).event.response.state,
    "GOING"
  );
  await cmd(
    {
      operation: "edit-event",
      eventId: event.id,
      occurrenceId: event.occurrenceId,
      expectedVersion: initial.event.eventVersion,
      occurrenceVersion: initial.event.version,
      scope: "OCCURRENCE",
      ...times,
      startLocal: "2026-11-01T11:00",
      endLocal: "2026-11-01T12:00",
      title: "Updated first gathering"
    },
    ada.token
  );
  const updated = await api(
    { view: "event", occurrenceId: event.occurrenceId },
    secondToken
  );
  assert.equal(updated.event.id, event.occurrenceId);
  assert.equal(updated.event.response.state, "GOING");
  assert.equal(updated.event.startAt, "2026-11-01T17:00:00.000Z");
  await cmd({ ...responseInput, expectedVersion: 1 }, lee.token, 409);
  await cmd(
    {
      operation: "cancel-event",
      eventId: event.id,
      occurrenceId: event.occurrenceId,
      expectedVersion: updated.event.eventVersion,
      occurrenceVersion: updated.event.version,
      scope: "OCCURRENCE",
      confirmed: true
    },
    ada.token
  );
  const commitments = await api({ view: "commitments", ...range }, secondToken);
  assert.ok(
    commitments.commitments.some(
      (e: { id: string; canceled: boolean; conflict: string | null }) =>
        e.id === event.occurrenceId && e.canceled && !e.conflict
    )
  );
  assert.equal(
    (
      await api(
        { view: "event", occurrenceId: initial.occurrences[1].id },
        lee.token
      )
    ).event.canceled,
    false
  );
  await cmd(
    {
      ...responseInput,
      occurrenceVersion: updated.event.version + 1,
      expectedVersion: 1
    },
    lee.token,
    409
  );
  await cmd(
    {
      operation: "withdraw-response",
      occurrenceId: event.occurrenceId,
      expectedVersion: 1
    },
    secondToken
  );
  assert.equal(
    (await api({ view: "commitments", ...range }, secondToken)).commitments
      .length,
    0
  );
  await db.churchCapabilityGrant.updateMany({
    where: {
      userId: ada.user.id,
      churchId,
      capability: "EDIT_CHURCH_CALENDAR",
      revokedAt: null
    },
    data: { revokedAt: new Date() }
  });
  const { event: remaining } = await api(
    { view: "event", occurrenceId: initial.occurrences[1].id },
    ada.token
  );
  assert.equal(remaining.canEdit, false);
  assert.equal(remaining.canPublish, true);
  await cmd(
    {
      operation: "edit-event",
      eventId: event.id,
      occurrenceId: remaining.id,
      expectedVersion: remaining.eventVersion,
      occurrenceVersion: remaining.version,
      scope: "OCCURRENCE",
      title: "Revoked editor attempt",
      ...times
    },
    ada.token,
    403
  );
});

test("calendar HTTP accepts bounded Unicode notes without widening other account bodies", async () => {
  await db.platformAuthLimit.deleteMany();
  const calendar = await createCalendar("Unicode calendar", val.token);
  const description = "文".repeat(5000);
  const created = await createEvent(
    calendar.id,
    "A full-length note",
    val.token,
    { description }
  );
  assert.equal(
    (
      await api(
        { view: "event", occurrenceId: created.occurrenceId },
        val.token
      )
    ).event.description,
    description
  );
  await cmd(
    {
      operation: "create-event",
      calendarId: calendar.id,
      requestKey: randomUUID(),
      expectedVersion: 2,
      title: "Overlong note",
      ...times,
      description: description + "文"
    },
    val.token,
    400
  );
  assert.equal(
    await db.calendarEvent.count({ where: { calendarId: calendar.id } }),
    1
  );
});
