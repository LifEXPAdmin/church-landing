import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { readSettingsContext } from "../lib/platform/settings-context";
import { AccountError } from "../lib/platform/accounts";
import { PortalError } from "../lib/platform/portal";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());

test("settings context projects only the current account and current approved church choices", async () => {
  const a = await createPortalActor(db, "settingsa"),
    b = await createPortalActor(db, "settingsb");
  const church = await db.church.create({
    data: {
      slug: randomUUID(),
      name: "Fictional private settings church",
      summary: ""
    }
  });
  const c = await db.churchConnection.create({
    data: { userId: a.id, churchId: church.id, state: "APPROVED" }
  });
  const v = await readSettingsContext(db, a.token, a.id);
  assert.equal(v.ownerId, a.id);
  assert.deepEqual(v.methods, { password: true, google: false });
  assert.deepEqual(v.churches, [{ id: church.id, name: church.name }]);
  assert.doesNotMatch(
    JSON.stringify(v),
    /passwordHash|credentialVersion|bio|contactEmail|phoneAudience|capabilities/
  );
  assert.match(v.emailLabel, /•••@/);
  assert.deepEqual((await readSettingsContext(db, b.token, b.id)).churches, []);
  await assert.rejects(
    readSettingsContext(db, a.token, b.id),
    (e) => e instanceof PortalError && e.status === 401
  );
  await db.churchConnection.update({
    where: { id: c.id },
    data: { state: "LEFT", version: { increment: 1 } }
  });
  assert.deepEqual((await readSettingsContext(db, a.token)).churches, []);
});

test("method metadata distinguishes password, linked provider and legacy passwordless accounts without exposing credentials", async () => {
  const a = await createPortalActor(db, "methodscope");
  await db.platformUser.update({
    where: { id: a.id },
    data: { passwordHash: null }
  });
  assert.deepEqual((await readSettingsContext(db, a.token)).methods, {
    password: false,
    google: false
  });
  const subject = randomUUID();
  await db.platformGoogleIdentity.create({
    data: { userId: a.id, issuer: "https://accounts.google.com", subject }
  });
  const provider = await readSettingsContext(db, a.token);
  assert.deepEqual(provider.methods, { password: false, google: true });
  assert.equal(provider.googleAvailable, false);
  assert.ok(!JSON.stringify(provider).includes(subject));
  assert.ok(!JSON.stringify(provider).includes(a.token));
  await db.platformGoogleIdentity.deleteMany({ where: { userId: a.id } });
  assert.deepEqual((await readSettingsContext(db, a.token)).methods, {
    password: false,
    google: false
  });
});
test("unverified accounts retain personal settings without exposing church selection", async () => {
  const a = await createPortalActor(db, "settingsunverified");
  const church = await db.church.create({
    data: {
      slug: randomUUID(),
      name: "Fictional eligibility church",
      summary: ""
    }
  });
  await db.churchConnection.create({
    data: { userId: a.id, churchId: church.id, state: "APPROVED" }
  });
  await db.platformUser.update({
    where: { id: a.id },
    data: { emailVerifiedAt: null }
  });
  const v = await readSettingsContext(db, a.token, a.id);
  assert.equal(v.emailVerified, false);
  assert.equal(v.ownerId, a.id);
  assert.deepEqual(v.churches, []);
});
test("revoked sessions cannot retrieve a stale settings snapshot", async () => {
  const a = await createPortalActor(db, "settingsrevoked");
  await db.platformSession.deleteMany({ where: { userId: a.id } });
  await assert.rejects(
    readSettingsContext(db, a.token, a.id),
    (e) => e instanceof AccountError && e.code === "session"
  );
});
