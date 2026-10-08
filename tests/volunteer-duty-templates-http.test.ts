import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import { assertPortalTestDatabase, type PortalActor } from "./seed-portal";
import { seedVolunteerApplications } from "./seed-volunteer-applications";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!,
  endpoint = "/api/platform/volunteer-duty-templates";
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
let f: Awaited<ReturnType<typeof seedVolunteerApplications>>;
before(async () => {
  await assertPortalTestDatabase(db);
  f = await seedVolunteerApplications(db, true, 2);
});
beforeEach(() => db.platformAuthLimit.deleteMany());
after(() => db.$disconnect());
const input = (patch: Record<string, unknown> = {}) => ({
  operation: "save",
  id: randomUUID(),
  churchId: f.churchA.id,
  expectedVersion: 0,
  mutationId: randomUUID(),
  title: "Fictional HTTP duty",
  duties: "Fictional private reusable instructions.",
  requirements: "Bring no private documents.",
  commitment: "One hour.",
  ...patch
});
const headers = (actor: PortalActor, expected: string) => ({
  cookie: `${sessionCookieFixtureName(origin)}=${actor.token}`,
  "x-expected-account": expected
});
const send = (
  body: unknown,
  options: {
    actor?: PortalActor;
    expected?: string;
    source?: string;
    raw?: boolean;
  } = {}
) => {
  const actor = options.actor ?? f.ada;
  return fetch(origin + endpoint, {
    method: "POST",
    headers: {
      ...headers(actor, options.expected ?? actor.id),
      origin: options.source ?? origin,
      "content-type": "application/json"
    },
    body: options.raw ? String(body) : JSON.stringify(body)
  });
};
const get = (query: string, actor = f.ada, expected = actor.id) =>
  fetch(origin + endpoint + query, { headers: headers(actor, expected) });
const assertPrivate = (response: Response) => {
  for (const name of [
    "cache-control",
    "cdn-cache-control",
    "vercel-cdn-cache-control"
  ])
    assert.match(response.headers.get(name) ?? "", /no-store/);
};

test("trusted HTTPS saves one exact receipt and exposes private bounded list/detail/apply contracts", async () => {
  const request = input(),
    response = await send(request);
  assert.equal(response.status, 200, await response.clone().text());
  assertPrivate(response);
  const saved = await response.json();
  assert.deepEqual(await (await send(request)).json(), saved);
  assert.equal(
    await db.volunteerDutyTemplate.count({ where: { id: request.id } }),
    1
  );
  assert.equal(
    (await send({ ...request, duties: "Changed original request." })).status,
    409
  );
  for (const query of [
    "?view=workspace",
    `?view=list&churchId=${f.churchA.id}&page=0`,
    `?view=detail&churchId=${f.churchA.id}&id=${saved.id}`,
    `?view=apply&id=${saved.id}&postId=${f.post.id}&expectedVersion=1&postVersion=${f.post.version}`
  ]) {
    const read = await get(query);
    assert.equal(read.status, 200, await read.clone().text());
    assertPrivate(read);
    assert.equal((await read.json()).ownerId, f.ada.id);
  }
});

test("every read pins current account and writes require matching origin and current owner", async () => {
  const request = input();
  assert.equal(
    (await send(request, { source: "https://unrelated.example" })).status,
    403
  );
  assert.equal((await send(request, { expected: f.blake.id })).status, 401);
  assert.equal((await send(request, { expected: "" })).status, 401);
  assert.equal((await get("?view=workspace", f.ada, "")).status, 401);
  assert.equal((await get("?view=workspace", f.ada, f.blake.id)).status, 401);
  assert.equal(
    await db.volunteerDutyTemplate.count({ where: { id: request.id } }),
    0
  );
  const response = await send(request);
  assert.equal(response.status, 200);
  const saved = await response.json();
  for (const actor of [f.lee, f.blake])
    for (const query of [
      `?view=detail&churchId=${f.churchA.id}&id=${saved.id}`,
      `?view=list&churchId=${f.churchA.id}&page=0`,
      `?view=apply&id=${saved.id}&postId=${f.post.id}&expectedVersion=1&postVersion=${f.post.version}`
    ]) {
      const denied = await get(query, actor);
      assert.equal(denied.status, 404);
      assertPrivate(denied);
      assert.ok(!(await denied.text()).includes(request.duties));
    }
});

test("query/body allowlists, duplicate keys, invalid versions and the existing transport bound reject without mutation", async () => {
  for (const query of [
    "?view=workspace&view=workspace",
    "?view=workspace&churchId=unused",
    "?view=list&churchId=" + f.churchA.id + "&page=0&page=0",
    "?view=unknown",
    "?view=list&churchId=" + f.churchA.id + "&page=-1"
  ])
    assert.equal((await get(query)).status, 400, query);
  const request = input(),
    before = await db.volunteerDutyTemplate.count({
      where: { churchId: f.churchA.id }
    });
  assert.equal(
    (await send({ ...request, contact: "must not enter a reusable duty" }))
      .status,
    400
  );
  assert.equal((await send({ ...request, expectedVersion: "0" })).status, 400);
  const oversized = await send(JSON.stringify(request) + " ".repeat(32768), {
    raw: true
  });
  assert.ok([400, 413].includes(oversized.status));
  assert.equal(
    await db.volunteerDutyTemplate.count({ where: { churchId: f.churchA.id } }),
    before
  );
  const valid = await send(request);
  assert.equal(valid.status, 200, await valid.clone().text());
});

test("revocation blocks an otherwise exact accepted request over the actual HTTP boundary", async () => {
  const request = input(),
    response = await send(request);
  assert.equal(response.status, 200);
  const saved = await response.json();
  const before = await db.volunteerDutyTemplate.findUniqueOrThrow({
    where: { id: saved.id }
  });
  await db.churchCapabilityGrant.deleteMany({
    where: {
      churchId: f.churchA.id,
      userId: f.ada.id,
      capability: "MANAGE_CHURCH_VOLUNTEERS"
    }
  });
  try {
    assert.equal((await send(request)).status, 404);
    assert.equal(
      (await get(`?view=detail&churchId=${f.churchA.id}&id=${saved.id}`))
        .status,
      404
    );
    assert.deepEqual(
      await db.volunteerDutyTemplate.findUniqueOrThrow({
        where: { id: saved.id }
      }),
      before
    );
  } finally {
    await db.churchCapabilityGrant.create({
      data: {
        churchId: f.churchA.id,
        userId: f.ada.id,
        capability: "MANAGE_CHURCH_VOLUNTEERS"
      }
    });
  }
});
