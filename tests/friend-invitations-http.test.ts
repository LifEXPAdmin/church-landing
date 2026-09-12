import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createPortalActor, assertPortalTestDatabase } from "./seed-portal";
const db = new PrismaClient();
const origin = process.env.ACCOUNT_ORIGIN!;
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const post = (body: Record<string, unknown>, token: string, source = origin) =>
  fetch(origin + "/api/platform/friend-invitations", {
    method: "POST",
    headers: {
      Origin: source,
      Cookie: "church_platform_session=" + token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
test("invitation HTTP reads are private and inert; writes enforce origin, schema, owner and exact retry", async () => {
  const a = await createPortalActor(db, "http_invite"),
    b = await createPortalActor(db, "http_other");
  const guest = await fetch(origin + "/api/platform/friend-invitations");
  assert.equal(guest.status, 401);
  assert.match(guest.headers.get("cache-control")!, /no-store/);
  const read = await fetch(origin + "/api/platform/friend-invitations", {
    headers: { Cookie: "church_platform_session=" + a.token }
  });
  assert.equal(read.status, 200);
  assert.equal((await read.json()).url, null);
  assert.equal(
    await db.friendInvitation.count({ where: { ownerId: a.id } }),
    0
  );
  const body = {
    operation: "enable",
    mutationId: randomUUID(),
    accountId: a.id,
    consent: true,
    expectedVersion: 0
  };
  assert.equal(
    (await post(body, a.token, "https://elsewhere.invalid")).status,
    403
  );
  assert.equal((await post({ ...body, inviterId: b.id }, a.token)).status, 400);
  assert.equal((await post(body, b.token)).status, 409);
  const first = await post(body, a.token);
  assert.equal(first.status, 200);
  assert.deepEqual(
    await (await post(body, a.token)).json(),
    await first.json()
  );
  assert.equal((await post({ ...body, consent: false }, a.token)).status, 409);
  const invite = await db.friendInvitation.findUniqueOrThrow({
    where: { ownerId: a.id }
  });
  const before = await db.friendAcceptance.count();
  const welcome = await fetch(origin + "/platform/invite/" + invite.token);
  assert.equal(welcome.status, 200);
  assert.match(welcome.headers.get("cache-control")!, /no-store/);
  assert.equal(welcome.headers.get("referrer-policy"), "no-referrer");
  assert.equal(await db.friendAcceptance.count(), before);
  await db.platformSession.deleteMany({ where: { userId: a.id } });
  assert.equal(
    (
      await post(
        {
          ...body,
          mutationId: randomUUID(),
          operation: "revoke",
          expectedVersion: 1
        },
        a.token
      )
    ).status,
    401
  );
});
