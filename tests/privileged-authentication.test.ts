import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createPortalActor, seedOperatorGrants, type PortalActor } from "./seed-portal";
import { privilegedAuthenticatorCommand as command, readPrivilegedAuthentication } from "../lib/platform/privileged-auth";
import { authenticatorTotp, openAuthenticator } from "../lib/platform/admin-authenticator-crypto";
import { readAdminNavigation } from "../lib/platform/admin-authority";
import { readAccountSession, loginAccount } from "../lib/platform/accounts";
import { withOwnedSession } from "../lib/platform/account-sessions";
import { privilegedSession } from "../lib/platform/privileged-session";
import { requirePrivilegedAuthentication } from "../lib/platform/privileged-auth-policy";
import { dispatchPrivilegedNotices } from "../lib/platform/privileged-auth-notices";
import { handlePrivilegedAuthentication } from "../lib/platform/privileged-auth-boundary";
import { accountConfig } from "../lib/platform/account-config";
import { sessionCookie } from "../lib/platform/account-boundary";
const db = new PrismaClient();
after(async () => { delete process.env.PRIVILEGED_MFA_MODE; await db.$disconnect(); });

async function enrolled(actor: PortalActor) {
  const input = { operation: "mfa-start", requestKey: randomUUID(), expectedVersion: 0 };
  const setup = await command(db, actor.token, input, actor.password);
  assert.equal(typeof setup.secret, "string");
  assert.deepEqual(await command(db, actor.token, input, actor.password), setup);
  const row = await db.adminAuthenticator.findUniqueOrThrow({ where: { userId: actor.id } });
  const secret = openAuthenticator(actor.id, row.secretCiphertext);
  const counter = BigInt(Math.floor(Date.now() / 30000));
  const confirm = { operation: "mfa-confirm", requestKey: randomUUID(), expectedVersion: row.version,
    code: authenticatorTotp(secret, counter - BigInt(1)) };
  const result = await command(db, actor.token, confirm, undefined);
  assert.equal((result.recoveryCodes as string[]).length, 8);
  assert.deepEqual(await command(db, actor.token, confirm, undefined), result);
  return { secret, counter, version: Number(result.version), recoveryCodes: result.recoveryCodes as string[] };
}
test("owner enrollment confirms a real library code, preserves personal access and never grants a duty", async () => {
  process.env.PRIVILEGED_MFA_MODE = "enroll";
  const actor = await createPortalActor(db, "mfaordinary");
  const factor = await enrolled(actor);
  const view = await readPrivilegedAuthentication(db, actor.token);
  assert.equal(view.factor?.confirmed, true);
  assert.equal(view.hasDuties, false);
  assert.equal(view.confirmedForWork, false);
  assert.equal(await db.platformOperatorGrant.count({ where: { userId: actor.id } }), 0);
  assert.equal((await readAccountSession(db, actor.token))?.id, actor.id);
  assert.equal(privilegedSession(db, actor.id), null, "Shared Prisma client must never carry request identity");
  assert.ok(!JSON.stringify(view).includes(factor.secret.toString("hex")));
  assert.ok(!JSON.stringify(view).includes(factor.recoveryCodes[0]));
  await assert.rejects(command(db, actor.token, { operation: "mfa-start", requestKey: randomUUID(), expectedVersion: factor.version }, actor.password));
  const delivered = await dispatchPrivilegedNotices(db, actor.id);
  assert.equal(delivered.delivered, 1);
  assert.equal((await dispatchPrivilegedNotices(db, actor.id)).delivered, 0);
});

test("privileged reads require the current session, factor, authority generation and fixed challenge expiry", async () => {
  process.env.PRIVILEGED_MFA_MODE = "enforce";
  const actor = await createPortalActor(db, "mfamanager");
  await seedOperatorGrants(db, actor, ["VIEW_OPERATIONAL_HEALTH"]);
  await assert.rejects(readAdminNavigation(db, actor.token), /authenticator/);
  const factor = await enrolled(actor);
  const other = await loginAccount(db, actor.email, actor.password, "fictional second browser");
  const challenge = { operation: "mfa-challenge", requestKey: randomUUID(), expectedVersion: factor.version,
    purpose: "privileged-work", code: authenticatorTotp(factor.secret, factor.counter) };
  await command(db, actor.token, challenge, undefined);
  assert.ok((await readAdminNavigation(db, actor.token)).sections.some(s => s.key === "health"));
  await assert.rejects(readAdminNavigation(db, other), /authenticator/);
  await assert.rejects(command(db, other, { ...challenge, requestKey: randomUUID() }, undefined), /already used/);
  const before = await db.privilegedSessionProof.findFirstOrThrow({ where: { session: { userId: actor.id } } });
  await command(db, actor.token, challenge, undefined);
  const after = await db.privilegedSessionProof.findFirstOrThrow({ where: { sessionId: before.sessionId } });
  assert.equal(after.expiresAt.getTime(), before.expiresAt.getTime(), "An exact retry must not slide expiry");
  await db.platformOperatorGrant.updateMany({ where: { userId: actor.id }, data: { version: { increment: 1 } } });
  await assert.rejects(readAdminNavigation(db, actor.token), /authenticator/);
  assert.equal((await readAccountSession(db, actor.token))?.id, actor.id);
  await command(db, actor.token, { ...challenge, requestKey: randomUUID(), code: authenticatorTotp(factor.secret, factor.counter + BigInt(1)) }, undefined);
  await db.privilegedSessionProof.updateMany({ where: { sessionId: before.sessionId }, data: { expiresAt: new Date(Date.now() - 1) } });
  await assert.rejects(readAdminNavigation(db, actor.token), /authenticator/);
});

test("purpose-bound step-up is consumed once while recovery retires other sessions, proofs and old codes", async () => {
  process.env.PRIVILEGED_MFA_MODE = "enforce";
  const actor = await createPortalActor(db, "mfarecover");
  await seedOperatorGrants(db, actor, ["VIEW_OPERATIONAL_HEALTH"]);
  const factor = await enrolled(actor);
  const other = await loginAccount(db, actor.email, actor.password, "fictional other session");
  await command(db, actor.token, { operation: "mfa-challenge", requestKey: randomUUID(), expectedVersion: factor.version,
    purpose: "change-access", code: authenticatorTotp(factor.secret, factor.counter) }, undefined);
  await assert.rejects(withOwnedSession(db, actor.token, (tx, s) => requirePrivilegedAuthentication(tx, s.userId, "export-metrics"), true));
  await withOwnedSession(db, actor.token, (tx, s) => requirePrivilegedAuthentication(tx, s.userId, "change-access"), true);
  await assert.rejects(withOwnedSession(db, actor.token, (tx, s) => requirePrivilegedAuthentication(tx, s.userId, "change-access"), true));
  const recovery = { operation: "mfa-recover", requestKey: randomUUID(), expectedVersion: factor.version, recoveryCode: factor.recoveryCodes[0] };
  const attempts = await Promise.allSettled([
    command(db, actor.token, recovery, actor.password),
    command(db, actor.token, { ...recovery, requestKey: randomUUID() }, actor.password)
  ]);
  assert.equal(attempts.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(await readAccountSession(db, other), null);
  assert.equal(await db.privilegedSessionProof.count({ where: { session: { userId: actor.id } } }), 0);
  await assert.rejects(readAdminNavigation(db, actor.token), /authenticator/);
  assert.equal((await readAccountSession(db, actor.token))?.id, actor.id);
  const current = await db.adminAuthenticator.findUniqueOrThrow({ where: { userId: actor.id } });
  const freshSession = await loginAccount(db, actor.email, actor.password, "new sign-in after recovery");
  await assert.rejects(command(db, freshSession, { operation: "mfa-start", requestKey: randomUUID(), expectedVersion: current.version }, actor.password), /original sign-in/);
  await db.adminAuthenticator.update({ where: { userId: actor.id }, data: { quarantinedAt: new Date(), secretCiphertext: "" } });
  await assert.rejects(command(db, actor.token, { operation: "mfa-start", requestKey: randomUUID(), expectedVersion: current.version }, actor.password), /Trusted identity review/);
});

test("HTTP enrollment rejects wrong account, cross-site writes, arbitrary fields and disabled capability", async () => {
  process.env.PRIVILEGED_MFA_MODE = "enroll";
  const actor = await createPortalActor(db, "mfaboundary");
  const origin = accountConfig().origin;
  const headers = { "content-type": "application/json", origin, cookie: sessionCookie(actor.token, true).split(";")[0], "x-expected-account": actor.id };
  const body = { operation: "mfa-start", requestKey: randomUUID(), expectedVersion: 0, currentPassword: actor.password };
  const request = (h = headers, b = body) => new Request(origin + "/api/platform/authenticator", { method: "POST", headers: h, body: JSON.stringify(b) });
  assert.equal((await handlePrivilegedAuthentication(db, request({ ...headers, "x-expected-account": "another-account" }))).status, 401);
  assert.equal((await handlePrivilegedAuthentication(db, request({ ...headers, origin: "https://other.example" }))).status, 403);
  assert.equal((await handlePrivilegedAuthentication(db, request(headers, { ...body, ...{ ownerId: actor.id } }))).status, 400);
  process.env.PRIVILEGED_MFA_MODE = "off";
  assert.equal((await handlePrivilegedAuthentication(db, request())).status, 503);
  assert.equal(await db.adminAuthenticator.count({ where: { userId: actor.id } }), 0);
});
