import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants,
  type PortalActor
} from "./seed-portal";
import { ARTIST_POLICY } from "../lib/platform/artist-types";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
let actor: PortalActor, other: PortalActor;
before(async () => {
  await assertPortalTestDatabase(db);
  actor = await createPortalActor(db, "artisthttp");
  other = await createPortalActor(db, "artisthttpother");
  await seedOperatorGrants(db, other, ["REVIEW_COMMUNITY_REPORTS"]);
});
after(() => db.$disconnect());
const get = (path: string, user?: PortalActor, expected?: string) =>
  fetch(origin + path, {
    headers: {
      ...(user
        ? { cookie: `${sessionCookieFixtureName(origin)}=${user.token}` }
        : {}),
      ...(expected ? { "x-expected-account": expected } : {})
    }
  });
const send = (
  body: unknown,
  user = actor,
  source = origin,
  expected = user.id
) =>
  fetch(origin + "/api/platform/artists", {
    method: "POST",
    headers: {
      origin: source,
      cookie: `${sessionCookieFixtureName(origin)}=${user.token}`,
      "x-expected-account": expected,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
const fields = {
  name: "HTTPS artist " + randomUUID(),
  presentation: "PERSON",
  roles: ["Solo musician"],
  biography: "Private rehearsal metadata"
};
const rights = { policy: ARTIST_POLICY, confirmed: true, basis: "OWN_WORK" };
let id: string;
test("HTTPS commands reject foreign origins, changed accounts, mass assignment and oversized bodies; replay creates one draft", async () => {
  const body = {
    operation: "create",
    mutationId: randomUUID(),
    fields,
    rights,
    representation: true,
    policy: ARTIST_POLICY
  };
  assert.equal(
    (await send(body, actor, "https://unrelated.example")).status,
    403
  );
  assert.equal((await send(body, actor, origin, other.id)).status, 401);
  assert.equal((await send(body, actor, origin, "")).status, 401);
  assert.equal((await send({ ...body, stewardId: other.id })).status, 400);
  assert.equal(
    (
      await send({
        ...body,
        fields: { ...fields, biography: "x".repeat(33000) }
      })
    ).status,
    400
  );
  const first = await send(body);
  assert.equal(first.status, 200);
  const data = await first.json();
  id = data.id;
  const retry = await send(body);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).id, id);
  assert.equal(
    await db.artistProfile.count({ where: { id, stewardId: actor.id } }),
    1
  );
});
test("private artist metadata stays out of anonymous and unauthorized detail, search, editor and page responses", async () => {
  for (const path of [
    `/api/platform/artists?view=detail&id=${id}`,
    `/api/platform/artists?view=editor&id=${id}`
  ]) {
    const response = await get(path, other, other.id);
    assert.equal(response.status, 404);
    assert.ok(!(await response.text()).includes(fields.name));
  }
  const search = await get(
    "/api/platform/artists?q=" + encodeURIComponent(fields.name)
  );
  assert.equal(search.status, 200);
  assert.equal((await search.json()).total, 0);
  const editor = await get(
    `/api/platform/artists?view=editor&id=${id}`,
    actor,
    actor.id
  );
  assert.equal(editor.status, 200);
  assert.match(editor.headers.get("cache-control") ?? "", /no-store/);
  assert.match(editor.headers.get("x-robots-tag") ?? "", /noindex/);
  const wrong = await get(
    `/api/platform/artists?view=editor&id=${id}`,
    actor,
    other.id
  );
  assert.equal(wrong.status, 401);
  const page = await get(`/platform/music/${id}/edit`, other);
  assert.ok(!(await page.text()).includes(fields.biography));
});
test("public HTTP projection strips steward, grants and rights assertions and parent withdrawal hides releases", async () => {
  const publish = {
    operation: "publish",
    mutationId: randomUUID(),
    artistId: id,
    expectedVersion: 1,
    fields,
    rights
  };
  assert.equal((await send(publish)).status, 200);
  const response = await get(`/api/platform/artists?view=detail&id=${id}`);
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.ok(text.includes(fields.name));
  for (const marker of [
    actor.id,
    "rightsBasis",
    "rightsActorId",
    "delegates",
    "rightsFingerprint"
  ])
    assert.ok(!text.includes(marker), marker);
  assert.equal(
    (
      await send({
        operation: "unpublish",
        mutationId: randomUUID(),
        artistId: id,
        expectedVersion: 2
      })
    ).status,
    200
  );
  assert.equal(
    (await get(`/api/platform/artists?view=detail&id=${id}`)).status,
    404
  );
  assert.equal((await send(publish)).status, 409);
});
test("artist filters reject duplicates, unsupported fields, roles, pages and incompatible named towns", async () => {
  for (const q of [
    "q=a&q=b",
    "role=unknown",
    "page=-1",
    "events=true",
    "churchId=secret",
    "town=123",
    "country=US&town=1"
  ]) {
    assert.equal((await get("/api/platform/artists?" + q)).status, 400, q);
  }
});

test(
  "organizer consent and exact receipts require the current church grant and session-bound authenticator proof",
  { skip: process.env.ARTIST_HTTP_MFA_ENFORCED !== "1" },
  async () => {
    const { artistCommand } = await import("../lib/platform/artist-commands");
    const { calendarCommand } =
      await import("../lib/platform/calendar-commands");
    const { privilegedAuthenticatorCommand } =
      await import("../lib/platform/privileged-auth");
    const { openAuthenticator, authenticatorTotp } =
      await import("../lib/platform/admin-authenticator-crypto");
    const { loginAccount } = await import("../lib/platform/accounts");
    const prior = process.env.PRIVILEGED_MFA_MODE;
    process.env.PRIVILEGED_MFA_MODE = "off";
    try {
      const church = await db.church.create({
        data: {
          slug: randomUUID(),
          name: "Fictional artist MFA church",
          summary: "Isolated consent test",
          communityListed: true
        }
      });
      await db.churchConnection.create({
        data: { userId: other.id, churchId: church.id, state: "APPROVED" }
      });
      await db.churchCapabilityGrant.createMany({
        data: (["EDIT_CHURCH_CALENDAR", "PUBLISH_CHURCH_EVENTS"] as const).map(
          (capability) => ({
            userId: other.id,
            churchId: church.id,
            capability
          })
        )
      });
      const calendar = await calendarCommand(db, other.token, {
        operation: "create-calendar",
        requestKey: randomUUID(),
        churchId: church.id,
        name: "Fictional music",
        timeZone: "America/Chicago"
      });
      const event = await calendarCommand(db, other.token, {
        operation: "create-event",
        requestKey: randomUUID(),
        calendarId: calendar.id,
        expectedVersion: 1,
        title: "Fictional concert",
        allDay: false,
        startLocal: "2026-11-15T10:00",
        endLocal: "2026-11-15T11:00",
        timeZone: "America/Chicago",
        weeklyUntil: null,
        visibility: "PUBLIC"
      });
      const occurrence = await db.calendarOccurrence.findFirstOrThrow({
        where: { eventId: event.id }
      });
      const draft = await artistCommand(db, actor.token, {
        operation: "create",
        mutationId: randomUUID(),
        fields,
        rights,
        representation: true,
        policy: ARTIST_POLICY
      });
      await artistCommand(db, actor.token, {
        operation: "publish",
        mutationId: randomUUID(),
        artistId: draft.id,
        expectedVersion: 1,
        fields,
        rights
      });
      const association = await artistCommand(db, actor.token, {
        operation: "propose-event",
        mutationId: randomUUID(),
        artistId: draft.id,
        occurrenceId: occurrence.id,
        expectedVersion: 0
      });
      process.env.PRIVILEGED_MFA_MODE = "enforce";
      const path = `/api/platform/artists?view=association&id=${association.id}`;
      const accept = {
        operation: "accept-event",
        mutationId: randomUUID(),
        artistId: draft.id,
        associationId: association.id,
        expectedVersion: 1
      };
      assert.equal((await get(path, other, other.id)).status, 403);
      assert.equal((await send(accept, other)).status, 403);
      await privilegedAuthenticatorCommand(
        db,
        other.token,
        {
          operation: "mfa-start",
          requestKey: randomUUID(),
          expectedVersion: 0
        },
        other.password
      );
      const factor = await db.adminAuthenticator.findUniqueOrThrow({
          where: { userId: other.id }
        }),
        secret = openAuthenticator(other.id, factor.secretCiphertext),
        counter = BigInt(Math.floor(Date.now() / 30000));
      const enrolled = await privilegedAuthenticatorCommand(
        db,
        other.token,
        {
          operation: "mfa-confirm",
          requestKey: randomUUID(),
          expectedVersion: factor.version,
          code: authenticatorTotp(secret, counter - BigInt(1))
        },
        undefined
      );
      await privilegedAuthenticatorCommand(
        db,
        other.token,
        {
          operation: "mfa-challenge",
          requestKey: randomUUID(),
          expectedVersion: Number(enrolled.version),
          purpose: "privileged-work",
          code: authenticatorTotp(secret, counter)
        },
        undefined
      );
      assert.equal((await get(path, other, other.id)).status, 200);
      assert.equal((await send(accept, other)).status, 200);
      const secondToken = await loginAccount(
        db,
        other.email,
        other.password,
        "Fictional second artist organizer browser"
      );
      assert.equal(
        (await send(accept, { ...other, token: secondToken })).status,
        403
      );
      await db.churchConnection.update({
        where: { userId_churchId: { userId: other.id, churchId: church.id } },
        data: { state: "LEFT" }
      });
      assert.equal((await send(accept, other)).status, 403);
      assert.equal(
        (
          await (
            await get(`/api/platform/artists?view=detail&id=${draft.id}`)
          ).json()
        ).events.length,
        0
      );
      await db.churchConnection.update({
        where: { userId_churchId: { userId: other.id, churchId: church.id } },
        data: { state: "APPROVED" }
      });
      await db.churchCapabilityGrant.updateMany({
        where: {
          userId: other.id,
          churchId: church.id,
          capability: "PUBLISH_CHURCH_EVENTS"
        },
        data: { revokedAt: new Date() }
      });
      assert.equal((await send(accept, other)).status, 403);
      const detail = await get(
        `/api/platform/artists?view=detail&id=${draft.id}`
      );
      assert.equal((await detail.json()).events.length, 0);
    } finally {
      if (prior === undefined) delete process.env.PRIVILEGED_MFA_MODE;
      else process.env.PRIVILEGED_MFA_MODE = prior;
    }
  }
);
