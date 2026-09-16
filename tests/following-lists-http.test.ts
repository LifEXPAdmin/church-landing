import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { safeAccountReturn } from "../lib/platform/account-entry";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
function request(
  path: string,
  token = "",
  body?: Record<string, unknown>,
  headers: Record<string, string> = {}
) {
  return fetch(origin + path, {
    method: body ? "POST" : "GET",
    redirect: "manual",
    headers: {
      cookie: "church_platform_session=" + token,
      origin,
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}
test("private following list routes pin the account, reject foreign origin and unknown fields, and preserve exact retries", async () => {
  const a = await createPortalActor(db, "listhttp"),
    b = await createPortalActor(db, "listhttpb");
  const path = "/api/platform/following-lists",
    body = {
      operation: "create",
      expectedVersion: 0,
      mutationId: randomUUID(),
      name: "Private route " + randomUUID()
    };
  assert.equal((await request(path)).status, 401);
  assert.equal((await request(path, a.token, body)).status, 401);
  assert.equal(
    (await request(path, a.token, body, { "x-expected-account": b.id })).status,
    401
  );
  assert.equal(
    (
      await request(path, a.token, body, {
        "x-expected-account": a.id,
        origin: "https://foreign.invalid"
      })
    ).status,
    403
  );
  assert.equal(
    (
      await request(
        path,
        a.token,
        { ...body, ownerId: b.id },
        { "x-expected-account": a.id }
      )
    ).status,
    400
  );
  const saved = await request(path, a.token, body, {
    "x-expected-account": a.id
  });
  assert.equal(saved.status, 200);
  assert.match(saved.headers.get("cache-control")!, /no-store/);
  const receipt = await saved.json();
  assert.deepEqual(
    await (
      await request(path, a.token, body, { "x-expected-account": a.id })
    ).json(),
    receipt
  );
  assert.equal(
    (await request(path + "?listId=" + receipt.id, b.token)).status,
    404
  );
  assert.equal(
    (await request(path, a.token, undefined, { "x-expected-account": b.id }))
      .status,
    401
  );
  const other = await (await request(path, b.token)).text();
  assert.ok(!other.includes(body.name));
  const choiceBody = {
    mode: "following",
    followingListId: receipt.id,
    expectedVersion: 0,
    expectedListsVersion: 1,
    mutationId: randomUUID()
  };
  assert.equal(
    (await request("/api/platform/feed", a.token, choiceBody)).status,
    401
  );
  assert.equal(
    (
      await request("/api/platform/feed", a.token, choiceBody, {
        "x-expected-account": a.id
      })
    ).status,
    200
  );
  const choice = await request(path + "?view=feed", a.token, undefined, {
    "x-expected-account": a.id
  });
  assert.match(choice.headers.get("cache-control")!, /no-store/);
  assert.equal((await choice.json()).selectedId, receipt.id);
  assert.equal(
    (await request(path + "?view=feed&ownerId=" + b.id, a.token)).status,
    400
  );
  const guest = await request("/platform/relationships/lists");
  assert.equal(guest.status, 200);
  assert.ok(!(await guest.text()).includes(body.name));
  assert.equal(
    safeAccountReturn(
      "/platform/relationships/lists?list=" + receipt.id + "&action=delete"
    ),
    "/platform/relationships/lists"
  );
  const page = await request("/platform/relationships/lists", a.token);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Private following lists/);
});
