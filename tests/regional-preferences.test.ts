import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor, seedPortal } from "./seed-portal";
import {
  readRegionalPreferences,
  saveRegionalPreferences
} from "../lib/platform/regional-preferences";
import { handleRegionalRequest } from "../lib/platform/regional-boundary";
import { loginAccount, readAccountSession } from "../lib/platform/accounts";
import { readSettingsContext } from "../lib/platform/settings-context";
import { accountConfig } from "../lib/platform/account-config";
import { getPortalSnapshot } from "../lib/platform/portal";
import { getChurchListings } from "../lib/platform/church-listings";
import { getChurchClaims } from "../lib/platform/church-claims";
import { getChurchStructure } from "../lib/platform/church-structure";
import { readSupport } from "../lib/platform/support";
import { readAdminNavigation } from "../lib/platform/admin-authority";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const input = (expectedVersion = 0) => ({
  mutationId: randomUUID(),
  expectedVersion,
  dateFormat: "DMY",
  timeFormat: "H24"
});

test("church, support and admin viewer projections retain the acting account's saved formats", async () => {
  const f = await seedPortal(db), a = f.memberA;
  await saveRegionalPreferences(db, a.token, input());
  await db.supportCapabilityGrant.create({ data: { userId: a.id, capability: "RESPOND" } });
  const views = [
    await getPortalSnapshot(db, a.token, "my-church"),
    await getChurchListings(db, a.token),
    await getChurchClaims(db, a.token),
    await getChurchStructure(db, a.token, { churchId: f.churchA.id }),
    await readSupport(db, a.token, "requests"),
    await readAdminNavigation(db, a.token)
  ];
  for (const { viewer } of views) {
    assert.equal(viewer.id, a.id);
    assert.equal(viewer.dateFormat, "DMY");
    assert.equal(viewer.timeFormat, "H24");
    assert.doesNotMatch(JSON.stringify(viewer), /email|password|token|location|bio/);
  }
  const other = await getPortalSnapshot(db, f.memberB.token, "my-church");
  assert.equal(other.viewer.dateFormat, "DEFAULT");
  assert.equal(other.viewer.timeFormat, "DEFAULT");
});

test("formats belong to the account across sessions, match settings, and do not need verified adult authority", async () => {
  const a = await createPortalActor(db, "regional", {
      verified: false,
      adult: false
    }),
    b = await createPortalActor(db, "otherformat");
  const original = await readRegionalPreferences(db, a.token);
  assert.deepEqual(original, {
    ownerId: a.id,
    version: 0,
    dateFormat: "DEFAULT",
    timeFormat: "DEFAULT"
  });
  const command = input();
  const receipt = await saveRegionalPreferences(db, a.token, command);
  assert.deepEqual(
    await saveRegionalPreferences(db, a.token, command),
    receipt
  );
  const fresh = await loginAccount(
    db,
    a.email,
    a.password,
    "Second fictional format session"
  );
  const saved = await readRegionalPreferences(db, fresh);
  assert.deepEqual(saved, {
    ownerId: a.id,
    version: 1,
    dateFormat: "DMY",
    timeFormat: "H24"
  });
  assert.equal((await readAccountSession(db, fresh))?.timeFormat, "H24");
  assert.deepEqual(
    (await readSettingsContext(db, fresh, a.id)).regional,
    saved
  );
  assert.equal(
    (await readRegionalPreferences(db, b.token)).dateFormat,
    "DEFAULT"
  );
  await assert.rejects(
    saveRegionalPreferences(db, a.token, { ...command, timeFormat: "H12" })
  );
  await assert.rejects(saveRegionalPreferences(db, a.token, input(0)));
  const competing = await Promise.allSettled([
    saveRegionalPreferences(db, a.token, input(1)),
    saveRegionalPreferences(db, fresh, { ...input(1), dateFormat: "YMD" })
  ]);
  assert.equal(competing.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await readRegionalPreferences(db, fresh)).version, 2);
});

test("regional endpoint pins the account, rejects cross-origin and invalid fields, and conceals revoked accounts even on retry", async () => {
  const a = await createPortalActor(db, "regionalapi"),
    b = await createPortalActor(db, "wrongformat");
  const origin = accountConfig().origin;
  const request = (
    body?: unknown,
    extras: Record<string, string> = {},
    token = a.token
  ) =>
    new Request(origin + "/api/platform/regional", {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Cookie: `church_platform_session=${token}`,
        Origin: origin,
        "Content-Type": "application/json",
        "X-Expected-Account": a.id,
        ...extras
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
  for (const body of [
    { ...input(), dateFormat: "fr" },
    { ...input(), timeFormat: "H25" },
    { ...input(), ownerId: b.id }
  ])
    assert.equal((await handleRegionalRequest(db, request(body))).status, 400);
  assert.equal(
    (
      await handleRegionalRequest(
        db,
        request(input(), { Origin: "https://example.test" })
      )
    ).status,
    403
  );
  assert.equal(
    (await handleRegionalRequest(db, request(input(), {}, b.token))).status,
    401
  );
  assert.equal(
    (
      await handleRegionalRequest(
        db,
        request(undefined, { "X-Expected-Account": "" })
      )
    ).status,
    400
  );
  const command = input();
  const saved = await handleRegionalRequest(db, request(command));
  assert.equal(saved.status, 200);
  assert.match(saved.headers.get("cache-control")!, /no-store/);
  await db.platformUser.update({
    where: { id: a.id },
    data: { suspendedAt: new Date() }
  });
  for (const body of [undefined, command]) {
    const denied = await handleRegionalRequest(db, request(body));
    assert.equal(denied.status, 401);
    assert.doesNotMatch(await denied.text(), /"dateFormat"|"timeFormat"/);
  }
  await assert.rejects(
    db.platformUser.update({
      where: { id: b.id },
      data: { dateFormat: "UNKNOWN" }
    })
  );
});
