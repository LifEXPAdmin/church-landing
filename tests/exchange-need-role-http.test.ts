import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedNeedRolePrivacy } from "./seed-need-role-privacy";
import { privilegedAuthenticatorCommand } from "../lib/platform/privileged-auth";
import {
  openAuthenticator,
  authenticatorTotp
} from "../lib/platform/admin-authenticator-crypto";
import { NEED_SCHEMA } from "../lib/platform/exchange-need-options";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(async () => {
  await assertPortalTestDatabase(db);
  assert.equal(process.env.PRIVILEGED_MFA_MODE, "enforce");
});
after(async () => {
  await db.$disconnect();
});
type Fixture = Awaited<ReturnType<typeof seedNeedRolePrivacy>>;
const request = (
  path: string,
  token: string,
  owner?: string,
  body?: string,
  extra: Record<string, string> = {}
) =>
  fetch(origin + path, {
    redirect: "manual",
    method: body === undefined ? "GET" : "POST",
    headers: {
      cookie: sessionCookieFixtureName() + "=" + token,
      origin,
      ...(owner ? { "x-expected-account": owner } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...extra
    },
    ...(body === undefined ? {} : { body })
  });
function privateResponse(r: Response) {
  for (const name of [
    "cache-control",
    "cdn-cache-control",
    "vercel-cdn-cache-control"
  ])
    assert.match(r.headers.get(name)!, /no-store/);
}
async function proveCoordinator(f: Fixture) {
  assert.equal(process.env.PRIVILEGED_MFA_MODE, "enforce");
  await privilegedAuthenticatorCommand(
    db,
    f.ada.token,
    { operation: "mfa-start", requestKey: randomUUID(), expectedVersion: 0 },
    f.ada.password
  );
  const factor = await db.adminAuthenticator.findUniqueOrThrow({
    where: { userId: f.ada.id }
  });
  const secret = openAuthenticator(f.ada.id, factor.secretCiphertext);
  const enrolledCounter = BigInt(Math.floor(Date.now() / 30000));
  const enrolled = await privilegedAuthenticatorCommand(
    db,
    f.ada.token,
    {
      operation: "mfa-confirm",
      requestKey: randomUUID(),
      expectedVersion: factor.version,
      code: authenticatorTotp(secret, enrolledCounter)
    },
    undefined
  );
  const currentCounter = BigInt(Math.floor(Date.now() / 30000));
  await privilegedAuthenticatorCommand(
    db,
    f.ada.token,
    {
      operation: "mfa-challenge",
      requestKey: randomUUID(),
      expectedVersion: Number(enrolled.version),
      purpose: "privileged-work",
      code: authenticatorTotp(
        secret,
        currentCounter > enrolledCounter
          ? currentCounter
          : enrolledCounter + BigInt(1)
      )
    },
    undefined
  );
}

async function reconfirmCoordinator(f: Fixture) {
  assert.equal(process.env.PRIVILEGED_MFA_MODE, "enforce");
  for (let attempt = 0; attempt < 3; attempt++) {
    const factor = await db.adminAuthenticator.findUniqueOrThrow({
      where: { userId: f.ada.id }
    });
    assert.ok(factor.confirmedAt, "Recheck the existing confirmed factor");
    const current = BigInt(Math.floor(Date.now() / 30000));
    const counter =
      factor.lastCounter < current ? current : factor.lastCounter + BigInt(1);
    if (counter <= current + BigInt(1)) {
      await privilegedAuthenticatorCommand(
        db,
        f.ada.token,
        {
          operation: "mfa-challenge",
          requestKey: randomUUID(),
          expectedVersion: factor.version,
          purpose: "privileged-work",
          code: authenticatorTotp(
            openAuthenticator(f.ada.id, factor.secretCiphertext),
            counter
          )
        },
        undefined
      );
      return;
    }
    assert.ok(attempt < 2, "A fresh authenticator counter must become available");
    await new Promise((done) =>
      setTimeout(done, 30000 - (Date.now() % 30000) + 50)
    );
  }
}

test("manager role choices stay out of initial HTML/RSC while current pinned API paginates21 roles", async () => {
  const f = await seedNeedRolePrivacy(db);
  await proveCoordinator(f);
  const firstResponse = await request(f.endpoint, f.ada.token, f.ada.id);
  assert.equal(firstResponse.status, 200);
  privateResponse(firstResponse);
  const first = await firstResponse.json();
  assert.equal(first.ownerId, f.ada.id);
  assert.equal(first.roles.length, 20);
  assert.ok(first.next);
  const secondResponse = await request(
    f.endpoint + "&after=" + encodeURIComponent(first.next),
    f.ada.token,
    f.ada.id
  );
  assert.equal(secondResponse.status, 200);
  privateResponse(secondResponse);
  const second = await secondResponse.json();
  assert.equal(second.roles.length, 1);
  assert.equal(second.next, null);
  assert.deepEqual(
    [...first.roles, ...second.roles].map((r: { id: string }) => r.id),
    f.sourceRoles.map((r) => r.id)
  );
  for (const rsc of [false, true]) {
    const response = await request(
      f.page + (rsc ? "?_rsc=role-http" : ""),
      f.ada.token,
      undefined,
      undefined,
      rsc ? { RSC: "1", "Next-Url": f.page } : {}
    );
    assert.equal(response.status, 200);
    const text = (await response.text()).replaceAll("\\", "");
    for (const marker of [
      ...f.sourceRoles.flatMap((r) => [r.id, r.role]),
      ...f.postIds,
      ...f.eventTitles,
      first.next
    ])
      assert.ok(
        !text.includes(marker),
        "Manager initial role marker must be absent"
      );
    assert.ok(text.includes("Manage need action slots"));
  }
  for (const [token, owner] of [
    [f.blake.token, f.ada.id],
    ["", f.ada.id]
  ]) {
    const denied = await request(f.endpoint, token, owner);
    assert.equal(denied.status, 401);
    privateResponse(denied);
    const body = await denied.text();
    for (const role of f.sourceRoles)
      assert.ok(!body.includes(role.id) && !body.includes(role.role));
  }
});
test("enforced role slot command binds owner/MFA, replays exactly once and rejects closed or unauthorized roles", async () => {
  const f = await seedNeedRolePrivacy(db);
  const role = f.sourceRoles[0];
  const body = JSON.stringify({
    operation: "need-slot",
    mutationId: randomUUID(),
    needId: f.need.id,
    slotId: randomUUID(),
    expectedVersion: 0,
    schema: NEED_SCHEMA,
    fields: {
      action: "VOLUNTEER",
      label: "Fictional canonical link",
      unit: "places",
      target: role.capacity,
      loan: false,
      returnLocal: null,
      returnTimeZone: null,
      returnResponsibility: "",
      volunteerSlotId: role.id
    }
  });
  const unproven = await request(
    "/api/platform/exchange",
    f.ada.token,
    f.ada.id,
    body
  );
  // Bound sessions without current assurance receive no manager projection.
  assert.equal(unproven.status, 404);
  privateResponse(unproven);
  assert.deepEqual(await unproven.json(), {
    message: "This need is unavailable to your current account or duties."
  });
  assert.equal(
    await db.exchangeNeedSlot.count({ where: { id: JSON.parse(body).slotId } }),
    0
  );
  assert.equal(
    await db.socialOperation.count({
      where: {
        ownerId: f.ada.id,
        key: "exchange-need:" + JSON.parse(body).mutationId
      }
    }),
    0
  );
  await proveCoordinator(f);
  const wrong = await request(
    "/api/platform/exchange",
    f.blake.token,
    f.ada.id,
    body
  );
  assert.equal(wrong.status, 401);
  privateResponse(wrong);
  const missing = await request(
    "/api/platform/exchange",
    f.ada.token,
    undefined,
    body
  );
  assert.equal(missing.status, 401);
  privateResponse(missing);
  const first = await request(
    "/api/platform/exchange",
    f.ada.token,
    f.ada.id,
    body
  );
  assert.equal(first.status, 200);
  privateResponse(first);
  const saved = await first.json();
  const replay = await request(
    "/api/platform/exchange",
    f.ada.token,
    f.ada.id,
    body
  );
  assert.equal(replay.status, 200);
  privateResponse(replay);
  const again = await replay.json();
  assert.equal(again.id, saved.id);
  assert.equal(again.version, saved.version);
  assert.equal(
    await db.exchangeNeedSlot.count({ where: { id: saved.id } }),
    1
  );
  const stale = f.sourceRoles[1];
  await db.postVolunteerSlot.update({
    where: { id: stale.id },
    data: { closedAt: new Date(), version: { increment: 1 } }
  });
  const newId = randomUUID();
  const staleBody = JSON.stringify({
    ...JSON.parse(body),
    mutationId: randomUUID(),
    slotId: newId,
    fields: { ...JSON.parse(body).fields, volunteerSlotId: stale.id }
  });
  const closed = await request(
    "/api/platform/exchange",
    f.ada.token,
    f.ada.id,
    staleBody
  );
  assert.equal(closed.status, 409);
  privateResponse(closed);
  assert.equal(await db.exchangeNeedSlot.count({ where: { id: newId } }), 0);
  await db.churchCapabilityGrant.update({
    where: {
      userId_churchId_capability: {
        userId: f.ada.id,
        churchId: f.churchA.id,
        capability: "MANAGE_CHURCH_VOLUNTEERS"
      }
    },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  const forbiddenId = randomUUID();
  const forbiddenBody = JSON.stringify({
    ...JSON.parse(body),
    mutationId: randomUUID(),
    slotId: forbiddenId,
    fields: {
      ...JSON.parse(body).fields,
      volunteerSlotId: f.sourceRoles[2].id
    }
  });
  // Removing a duty changes the proof's authority digest. Confirm remaining
  // Exchange authority so this denial tests the missing volunteer duty itself.
  await reconfirmCoordinator(f);
  const forbidden = await request(
    "/api/platform/exchange",
    f.ada.token,
    f.ada.id,
    forbiddenBody
  );
  assert.equal(forbidden.status, 403);
  privateResponse(forbidden);
  assert.deepEqual(await forbidden.json(), {
    message:
      "Link a current event role for this church using your separate volunteer organizer duty."
  });
  assert.equal(
    await db.socialOperation.count({
      where: {
        ownerId: f.ada.id,
        key: "exchange-need:" + JSON.parse(forbiddenBody).mutationId
      }
    }),
    0
  );
  assert.equal(
    await db.exchangeNeedSlot.count({ where: { id: forbiddenId } }),
    0
  );
});
