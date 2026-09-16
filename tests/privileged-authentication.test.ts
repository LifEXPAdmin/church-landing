import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, ChurchCapability, OperatorCapability } from "@prisma/client";
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
import { portal, churchCapability, getPortalSnapshot } from "../lib/platform/portal";
import { postContext, withPostRead } from "../lib/platform/post-access";
import { calendarContext } from "../lib/platform/calendar-access";
import { calendarCommand } from "../lib/platform/calendar-commands";
import { topicCommand, readTopic, readTopicMembers } from "../lib/platform/topic-communities";
import { seedSupport, requestInput } from "./seed-support";
import { readSupport, supportCommand } from "../lib/platform/support";
import { beginGoogleAttempt, finishGoogleAttempt } from "../lib/platform/google-accounts";
import { GOOGLE_ISSUER } from "../lib/platform/google-provider";
import { createSessionToken } from "../lib/platform/auth";
import { requestAccountGrant, consumeAccountGrant } from "../lib/platform/accounts";
const db = new PrismaClient();
const initialIntake = process.env.SUPPORT_INTAKE_ENABLED;
after(async () => { delete process.env.PRIVILEGED_MFA_MODE; if (initialIntake === undefined) delete process.env.SUPPORT_INTAKE_ENABLED; else process.env.SUPPORT_INTAKE_ENABLED = initialIntake; await db.$disconnect(); });

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
  await assert.rejects(command(db, actor.token, challenge, undefined), /expired or changed/);
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
  assert.equal((await handlePrivilegedAuthentication(db, new Request(origin + "/api/platform/authenticator", {
    headers: { cookie: headers.cookie, "x-expected-account": "another-account" }
  }))).status, 401);
  process.env.PRIVILEGED_MFA_MODE = "off";
  assert.equal((await handlePrivilegedAuthentication(db, request())).status, 503);
  assert.equal(await db.adminAuthenticator.count({ where: { userId: actor.id } }), 0);
});

test("failed essential security notices remain pending after the automatic retry limit", async () => {
  process.env.PRIVILEGED_MFA_MODE = "enroll";
  const actor = await createPortalActor(db, "mfanotice");
  await enrolled(actor);
  const notice = await db.privilegedSecurityNotice.findFirstOrThrow({ where: { userId: actor.id } });
  await db.privilegedSecurityNotice.update({ where: { id: notice.id }, data: { attempts: 4 } });
  let attempts = 0;
  const fail = async () => { attempts++; throw Error("Fictional delivery unavailable"); };
  assert.deepEqual(await dispatchPrivilegedNotices(db, actor.id, fail), { delivered: 0, pending: 1 });
  assert.deepEqual(await dispatchPrivilegedNotices(db, actor.id, fail), { delivered: 0, pending: 1 });
  assert.equal(attempts, 1);
  assert.equal((await readPrivilegedAuthentication(db, actor.token)).notices[0].deliveredAt, null);
});

test("all church capabilities and topic management require assurance while ordinary membership and reading remain available", async () => {
  process.env.PRIVILEGED_MFA_MODE = "off";
  const actor = await createPortalActor(db, "mfachurch");
  const church = await db.church.create({ data: { slug: randomUUID(), name: "Fictional MFA church", summary: "Fictional isolated verification." } });
  await db.churchConnection.create({ data: { userId: actor.id, churchId: church.id, state: "APPROVED" } });
  await db.churchCapabilityGrant.createMany({ data: Object.values(ChurchCapability).map(capability => ({ userId: actor.id, churchId: church.id, capability })) });
  await seedOperatorGrants(db, actor, Object.values(OperatorCapability));
  const slug = "mfa-" + randomUUID();
  const topic = await topicCommand(db, actor.token, { operation: "create", mutationId: randomUUID(), name: "Fictional MFA topic " + slug, slug,
    description: "Fictional isolated topic", rules: "Protect personal information and be respectful.", acceptedRules: true });
  process.env.PRIVILEGED_MFA_MODE = "enforce";
  for (const capability of Object.values(ChurchCapability))
    await assert.rejects(portal(db, actor.token, (tx, a) => churchCapability(tx, a, church.id, capability)), /permission|authenticator/);
  await assert.rejects(readAdminNavigation(db, actor.token), /authenticator/);
  await assert.rejects(readTopic(db, actor.token, slug, true), /authenticator/);
  await assert.rejects(readTopicMembers(db, actor.token, topic.id));
  assert.equal((await readTopic(db, actor.token, slug)).community.id, topic.id);
  assert.equal((await getPortalSnapshot(db, actor.token, "my-church")).viewer.id, actor.id);
  const before = await withPostRead(db, actor.token, async (_tx, context) => context);
  assert.ok(before.churches.includes(church.id));
  assert.equal(before.publishers.size, 0);
  assert.equal(before.moderators.size, 0);
  assert.equal(before.volunteers.size, 0);
  assert.equal(before.topicModerators?.size, 0);
  const unconfirmedCalendar = await portal(db, actor.token, (tx, a) => calendarContext(tx, a));
  assert.equal(unconfirmedCalendar.scopes.size, 0);
  await assert.rejects(calendarCommand(db, actor.token, { operation: "create-calendar", churchId: church.id, requestKey: randomUUID(), name: "Fictional calendar" }), /authenticator/);
  const factor = await enrolled(actor);
  await command(db, actor.token, { operation: "mfa-challenge", requestKey: randomUUID(), expectedVersion: factor.version,
    purpose: "privileged-work", code: authenticatorTotp(factor.secret, factor.counter) }, undefined);
  for (const capability of Object.values(ChurchCapability))
    await portal(db, actor.token, (tx, a) => churchCapability(tx, a, church.id, capability));
  const confirmed = await withPostRead(db, actor.token, async (tx, context) => ({ context, fresh: await postContext(tx, actor.id) }));
  assert.ok(confirmed.context.publishers.has(church.id));
  assert.ok(confirmed.fresh.topicModerators?.has(topic.id));
  assert.ok((await readAdminNavigation(db, actor.token)).sections.some(s => s.key === "access"));
  assert.equal((await readTopic(db, actor.token, slug, true)).community.id, topic.id);
  assert.ok((await readTopicMembers(db, actor.token, topic.id)).members.some(m => m.userId === actor.id));
  assert.equal((await portal(db, actor.token, (tx, a) => calendarContext(tx, a))).scopes.size, 2);
});

test("private Support and coordinator shares stay closed before a challenge; the requester retains their own case", async () => {
  process.env.PRIVILEGED_MFA_MODE = "off";
  process.env.SUPPORT_INTAKE_ENABLED = "true";
  const f = await seedSupport(db);
  const created = await supportCommand(db, f.memberA.token, await requestInput(db, f.memberA.token, { churchId: f.churchA.id }));
  const current = await readSupport(db, f.memberA.token, "detail", { caseId: created.caseId });
  const option = current.detail!.shareOptions[0];
  assert.ok(option);
  await supportCommand(db, f.memberA.token, { operation: "share", requestKey: randomUUID(), caseId: created.caseId,
    expectedVersion: current.detail!.version, appointmentId: option.id, appointmentVersion: option.version, agreeHistory: true });
  process.env.PRIVILEGED_MFA_MODE = "enforce";
  await assert.rejects(readSupport(db, f.owner.token, "detail", { caseId: created.caseId }));
  await assert.rejects(readSupport(db, f.contact.token, "detail", { caseId: created.caseId }));
  assert.equal((await readSupport(db, f.memberA.token, "detail", { caseId: created.caseId })).detail?.id, created.caseId);
  for (const actor of [f.owner, f.contact]) {
    const factor = await enrolled(actor);
    await command(db, actor.token, { operation: "mfa-challenge", requestKey: randomUUID(), expectedVersion: factor.version,
      purpose: "privileged-work", code: authenticatorTotp(factor.secret, factor.counter) }, undefined);
    assert.equal((await readSupport(db, actor.token, "detail", { caseId: created.caseId })).detail?.id, created.caseId);
  }
});

test("a topic-only manager receives a usable authenticator challenge before privileged navigation", async () => {
  process.env.PRIVILEGED_MFA_MODE = "off";
  const actor = await createPortalActor(db, "mfatopic");
  const slug = "mfa-topic-" + randomUUID();
  await topicCommand(db, actor.token, { operation: "create", mutationId: randomUUID(),
    name: "Fictional MFA topic-only manager " + slug.slice(-8), slug,
    description: "Fictional isolated topic", rules: "Respect others and keep private data private.", acceptedRules: true });
  process.env.PRIVILEGED_MFA_MODE = "enforce";
  await assert.rejects(readAdminNavigation(db, actor.token), /authenticator/);
  const factor = await enrolled(actor);
  await command(db, actor.token, { operation: "mfa-challenge", requestKey: randomUUID(), expectedVersion: factor.version,
    purpose: "privileged-work", code: authenticatorTotp(factor.secret, factor.counter) }, undefined);
  const navigation = await readAdminNavigation(db, actor.token);
  assert.equal(navigation.topics.length, 1);
  assert.equal(navigation.capabilities.length, 0);
});

test("Google sign-in and password recovery issue ordinary sessions without replacing or satisfying the enrolled factor", async () => {
  process.env.PRIVILEGED_MFA_MODE = "enforce";
  const actor = await createPortalActor(db, "mfamethod");
  await seedOperatorGrants(db, actor, ["VIEW_OPERATIONAL_HEALTH"]);
  const factor = await enrolled(actor);
  const subject = "fictional-mfa-" + randomUUID();
  await db.platformGoogleIdentity.create({ data: { issuer: GOOGLE_ISSUER, subject, userId: actor.id } });
  const browserToken = createSessionToken();
  const pending = await beginGoogleAttempt(db, browserToken, "/platform");
  const outcome = await finishGoogleAttempt(db,
    { clientId: "fictional.apps.googleusercontent.com", clientSecret: "fictional-only-secret", callback: accountConfig().origin + "/api/platform/google/callback" },
    { state: pending.state, browserToken, code: "fictional-code" },
    async () => ({ issuer: GOOGLE_ISSUER, subject, email: actor.email, emailAuthoritative: true }));
  assert.equal(outcome.kind, "signed-in");
  if (outcome.kind !== "signed-in") throw Error("Expected fixture Google sign-in");
  assert.equal((await readAccountSession(db, outcome.token))?.id, actor.id);
  await assert.rejects(readAdminNavigation(db, outcome.token), /authenticator/);
  let reset = "";
  await requestAccountGrant(db, actor.email, "RESET_PASSWORD", async (_email, _purpose, token) => { reset = token; });
  assert.ok(reset);
  const password = "Fictional-recovered-password-" + randomUUID();
  await consumeAccountGrant(db, reset, "RESET_PASSWORD", password, password);
  assert.equal(await readAccountSession(db, actor.token), null);
  assert.equal(await readAccountSession(db, outcome.token), null);
  const recovered = await loginAccount(db, actor.email, password, "fictional recovered primary account");
  const saved = await db.adminAuthenticator.findUniqueOrThrow({ where: { userId: actor.id } });
  assert.equal(saved.version, factor.version);
  assert.equal(saved.recoveryHashes.length, 8);
  await assert.rejects(readAdminNavigation(db, recovered), /authenticator/);
  await command(db, recovered, { operation: "mfa-challenge", requestKey: randomUUID(), expectedVersion: factor.version,
    purpose: "privileged-work", code: authenticatorTotp(factor.secret, factor.counter) }, undefined);
  assert.ok((await readAdminNavigation(db, recovered)).sections.some(s => s.key === "health"));
});
