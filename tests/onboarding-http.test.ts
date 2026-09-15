import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedOnboarding } from "./seed-onboarding";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
let f: Awaited<ReturnType<typeof seedOnboarding>>;
before(async () => {
  f = await seedOnboarding(db);
});
const read = (path: string, token = "", extra: Record<string, string> = {}) =>
  fetch(new URL(path, origin), {
    headers: { cookie: "church_platform_session=" + token, ...extra }
  });
const write = (
  input: Record<string, unknown>,
  token = f.newcomer.token,
  owner = f.newcomer.id,
  extra: Record<string, string> = {}
) =>
  fetch(new URL("/api/platform/church-tools", origin), {
    method: "POST",
    headers: {
      cookie: "church_platform_session=" + token,
      "content-type": "application/json",
      origin,
      ...(owner ? { "x-expected-account": owner } : {}),
      ...extra
    },
    body: JSON.stringify(input)
  });
async function json(response: Response, status = 200) {
  assert.equal(response.status, status);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.match(response.headers.get("vary")!, /Cookie/i);
  return response.json();
}

test("actual HTTPS next-step endpoints require the current owner, reject cross-site writes and replay exact saves", async () => {
  await json(await read("/api/platform/church-tools?view=home"), 401);
  const before = await json(
    await read("/api/platform/church-tools?view=home", f.newcomer.token)
  );
  assert.equal(before.ownerId, f.newcomer.id);
  assert.equal(before.week, null);
  await json(
    await read("/api/platform/church-tools?view=home", f.newcomer.token, {
      "x-expected-account": f.lee.id
    }),
    401
  );
  const input = {
    operation: "onboarding",
    step: "profile",
    dismissed: true,
    expectedVersion: 0,
    mutationId: randomUUID()
  };
  await json(await write(input, f.newcomer.token, ""), 401);
  await json(
    await write(input, f.newcomer.token, f.newcomer.id, {
      origin: "https://elsewhere.test"
    }),
    403
  );
  await json(
    await write(input, f.newcomer.token, f.newcomer.id, {
      "sec-fetch-site": "cross-site"
    }),
    403
  );
  await json(await write({ ...input, ownerId: f.lee.id }), 400);
  const first = await json(await write(input));
  assert.deepEqual(await json(await write(input)), first);
  const saved = await json(
    await read("/api/platform/church-tools?view=home", f.newcomer.token)
  );
  assert.equal(
    saved.steps.find((s: { id: string }) => s.id === "profile").dismissed,
    true
  );
  await json(await write({ ...input, mutationId: randomUUID() }), 409);
});

test("actual production HTML and RSC contain no private onboarding or host projections; the authorized API scopes and then revokes data", async () => {
  const hostPath =
    "/api/platform/church-tools?view=welcome&churchId=" + f.churchA.id;
  await json(await read(hostPath, f.blake.token), 403);
  await json(await read(hostPath, f.newcomer.token), 403);
  const permitted = await json(await read(hostPath, f.lee.token));
  assert.ok(
    permitted.threads.some((p: { id: string }) => p.id === f.introduction.id)
  );
  assert.ok(!JSON.stringify(permitted).includes(f.val.email));
  for (const path of [
    "/platform/getting-started",
    "/platform/churches/" + f.churchA.id + "/welcome"
  ]) {
    for (const headers of [{}, { RSC: "1" }] as Array<Record<string, string>>) {
      const response = await read(path, f.lee.token, headers);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control")!, /no-store/);
      const body = await response.text();
      assert.ok(
        !body.includes(
          "Fictional newcomer introduction for the ordinary welcome journey."
        )
      );
      assert.ok(!body.includes(f.val.email));
      assert.ok(!body.includes(f.lee.token));
    }
  }
  const input = {
    operation: "handled",
    churchId: f.churchA.id,
    postId: f.introduction.id,
    handled: true,
    expectedVersion: 1,
    mutationId: randomUUID()
  };
  await json(await write(input, f.val.token, f.val.id), 403);
  await json(await write(input, f.lee.token, f.lee.id));
  await db.churchCapabilityGrant.updateMany({
    where: {
      userId: f.lee.id,
      churchId: f.churchA.id,
      capability: "HOST_CHURCH_WELCOME"
    },
    data: { revokedAt: new Date() }
  });
  await json(await read(hostPath, f.lee.token), 403);
  await json(await write(input, f.lee.token, f.lee.id), 403);
  await db.churchConnection.update({
    where: { userId_churchId: { userId: f.lee.id, churchId: f.churchA.id } },
    data: { state: "REMOVED" }
  });
  const revoked = await json(
    await read("/api/platform/church-tools?view=home", f.lee.token)
  );
  assert.equal(revoked.week, null);
  assert.equal(revoked.churches.length, 0);
  assert.ok(!JSON.stringify(revoked).includes(f.introduction.id));
});
