import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { exchangeDefaultsCommand } from "../lib/platform/exchange-defaults";
import {
  EXCHANGE_DEFAULTS_SCHEMA,
  emptyExchangeDefaults
} from "../lib/platform/exchange-handoff-options";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(async () => {
  await assertPortalTestDatabase(db);
});
after(async () => {
  await db.$disconnect();
});
const req = (path: string, token = "", headers: Record<string, string> = {}) =>
  fetch(origin + path, {
    redirect: "manual",
    headers: {
      cookie: `${sessionCookieFixtureName()}=${token}`,
      origin,
      ...headers
    }
  });

test("personal defaults omit private values from HTML/RSC and require the current account for private no-store API reads", async () => {
  const owner = await createPortalActor(db, "defaultshttpowner"),
    other = await createPortalActor(db, "defaultshttpother");
  const marker = "Fictional private pickup " + randomUUID();
  await exchangeDefaultsCommand(db, owner.token, {
    operation: "defaults-save",
    mutationId: randomUUID(),
    expectedVersion: 0,
    schema: EXCHANGE_DEFAULTS_SCHEMA,
    fields: { ...emptyExchangeDefaults(), pickupDetails: marker }
  });
  for (const headers of [{}, { RSC: "1" }] as Record<string, string>[]) {
    for (const token of [owner.token, other.token, ""]) {
      const response = await req("/platform/exchange/defaults", token, headers);
      assert.match(response.headers.get("cache-control")!, /no-store/);
      assert.ok(!(await response.text()).includes(marker));
    }
  }
  const endpoint = "/api/platform/exchange?view=defaults";
  const current = await req(endpoint, owner.token, {
    "x-expected-account": owner.id
  });
  assert.equal(current.status, 200);
  for (const header of [
    "cache-control",
    "cdn-cache-control",
    "vercel-cdn-cache-control"
  ])
    assert.match(current.headers.get(header)!, /no-store/);
  const data = await current.json();
  assert.equal(data.ownerId, owner.id);
  assert.equal(data.fields.pickupDetails, marker);
  for (const [token, pin] of [
    [owner.token, other.id],
    [other.token, owner.id],
    ["", owner.id]
  ]) {
    const denied = await req(endpoint, token, { "x-expected-account": pin });
    assert.equal(denied.status, 401);
    assert.ok(!(await denied.text()).includes(marker));
  }
  const own = await req(endpoint, other.token, {
    "x-expected-account": other.id
  });
  assert.equal(own.status, 200);
  assert.ok(!(await own.text()).includes(marker));
  // Exercise the existing restrictive restore rather than constructing a row
  // forbidden by the database shape constraint (recovery clears pickup text).
  const control = await db.retentionControl.findFirstOrThrow({
    where: { kind: "EXCHANGE_DEFAULTS", sourceId: owner.id }
  });
  await db.exchangeDefaults.delete({ where: { ownerId: owner.id } });
  await replayRetentionControls(db, [
    control.payload as unknown as RetentionControlEntry
  ]);
  const recovered = await req(endpoint, owner.token, {
    "x-expected-account": owner.id
  });
  assert.equal(recovered.status, 200);
  const recovery = await recovered.json();
  assert.equal(recovery.recoveryRequired, true);
  assert.equal(recovery.fields.pickupDetails, "");
});
