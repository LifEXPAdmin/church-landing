import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants
} from "./seed-portal";
import {
  handleNativeSessionRequest,
  nativeRequestCredential
} from "../lib/platform/native-session-boundary";
import { createSessionToken, hashSessionToken } from "../lib/platform/auth";
import { AccountError } from "../lib/platform/account-error";
import {
  readAccountSession,
  loginAccount,
  changeAccountPassword
} from "../lib/platform/accounts";
import { handleAccountRequest } from "../lib/platform/account-boundary";
import {
  revokeOtherAccountSessions,
  withOwnedSession
} from "../lib/platform/account-sessions";
import { handleAccountSessionRequest } from "../lib/platform/account-session-boundary";
import {
  authenticatorTotp,
  openAuthenticator
} from "../lib/platform/admin-authenticator-crypto";
import { requirePrivilegedAuthentication } from "../lib/platform/privileged-auth-policy";
import { deactivateAccount } from "../lib/platform/account-lifecycle";

import { requestPermanentAccountDeletion } from "../lib/platform/account-deletion";

const db = new PrismaClient();
const origin = process.env.ACCOUNT_ORIGIN!;
const originalMode = process.env.PRIVILEGED_MFA_MODE;
before(() => assertPortalTestDatabase(db));
beforeEach(() => db.platformAuthLimit.deleteMany());
after(async () => {
  if (originalMode === undefined) delete process.env.PRIVILEGED_MFA_MODE;
  else process.env.PRIVILEGED_MFA_MODE = originalMode;
  await db.$disconnect();
});

test("native recovery and replacement retire other sessions and proofs while retaining exact enrollment retry", async () => {
  process.env.PRIVILEGED_MFA_MODE = "enforce";
  const a = await createPortalActor(db, "nativerecover"),
    token = await signedIn(a);
  const command = async (input: unknown) => {
    const result = await call("authenticator", token, a.id, input);
    assert.equal(result.status, 200);
    return (await result.json()).data;
  };
  const start = await command({
    operation: "mfa-start",
    requestKey: randomUUID(),
    expectedVersion: 0,
    currentPassword: a.password
  });
  const factor = await db.adminAuthenticator.findUniqueOrThrow({
    where: { userId: a.id }
  });
  const counter = BigInt(Math.floor(Date.now() / 30000));
  const secret = openAuthenticator(a.id, factor.secretCiphertext);
  const confirmed = await command({
    operation: "mfa-confirm",
    requestKey: randomUUID(),
    expectedVersion: start.version,
    code: authenticatorTotp(secret, counter - BigInt(1))
  });
  await command({
    operation: "mfa-challenge",
    requestKey: randomUUID(),
    expectedVersion: confirmed.version,
    code: authenticatorTotp(secret, counter),
    purpose: "privileged-work"
  });
  const other = await loginAccount(
    db,
    a.email,
    a.password,
    "Fictional recovery peer"
  );
  const input = {
    operation: "mfa-recover",
    requestKey: randomUUID(),
    expectedVersion: confirmed.version,
    currentPassword: a.password,
    recoveryCode: confirmed.recoveryCodes[0]
  };
  const recovered = await command(input);
  assert.ok(recovered.enrollment.secret);
  assert.deepEqual(await command(input), recovered);
  assert.equal(await readAccountSession(db, a.token), null);
  assert.equal(await readAccountSession(db, other), null);
  assert.ok(await readAccountSession(db, token));
  assert.equal(
    await db.privilegedSessionProof.count({
      where: { sessionId: (await row(token)).id }
    }),
    0
  );
  const next = await db.adminAuthenticator.findUniqueOrThrow({
    where: { userId: a.id }
  });
  const nextSecret = openAuthenticator(a.id, next.secretCiphertext);
  const nextCounter = BigInt(Math.floor(Date.now() / 30000));
  const reconfirmed = await command({
    operation: "mfa-confirm",
    requestKey: randomUUID(),
    expectedVersion: next.version,
    code: authenticatorTotp(nextSecret, nextCounter - BigInt(1))
  });
  const peer = await loginAccount(
    db,
    a.email,
    a.password,
    "Fictional replacement peer"
  );
  const replacementInput = {
    operation: "mfa-replace",
    requestKey: randomUUID(),
    expectedVersion: reconfirmed.version,
    currentPassword: a.password,
    code: authenticatorTotp(nextSecret, nextCounter)
  };
  const replaced = await command(replacementInput);
  assert.ok(replaced.enrollment.secret);
  assert.notEqual(replaced.enrollment.secret, recovered.enrollment.secret);
  assert.deepEqual(await command(replacementInput), replaced);
  assert.equal(await readAccountSession(db, peer), null);
  assert.ok(await readAccountSession(db, token));
});
type Operation = Parameters<typeof handleNativeSessionRequest>[2];
function req(
  operation: Operation,
  token?: string,
  owner?: string,
  body?: unknown,
  extra: Record<string, string> = {}
) {
  const method = body === undefined ? "GET" : "POST";
  return new Request(origin + "/api/platform/v1/" + operation, {
    method,
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(owner ? { "X-Expected-Account": owner } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...extra
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}
const call = (
  operation: Operation,
  token?: string,
  owner?: string,
  body?: unknown,
  extra?: Record<string, string>
) =>
  handleNativeSessionRequest(
    db,
    req(operation, token, owner, body, extra),
    operation
  );
const row = (token: string) =>
  db.platformSession.findUniqueOrThrow({
    where: { tokenHash: hashSessionToken(token) }
  });
async function signedIn(actor: Awaited<ReturnType<typeof createPortalActor>>) {
  const response = await call("password", undefined, undefined, {
    email: actor.email,
    password: actor.password
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  const body = await response.json();
  assert.equal(body.viewerId, actor.id);
  assert.deepEqual(body.data.session.account, {
    id: actor.id,
    name: actor.name,
    username: actor.username
  });
  const text = JSON.stringify(body);
  assert.ok(!text.includes(actor.email) && !text.includes(actor.password));
  assert.deepEqual(Object.keys(body.data).sort(), [
    "activity",
    "session",
    "token",
    "tokenType"
  ]);
  const session = await row(body.data.token);
  assert.notEqual(session.tokenHash, body.data.token);
  return body.data.token as string;
}

test("native transport rejects mixed credentials, browser origins, query credentials and malformed bearer values", async () => {
  const token = "x".repeat(43);
  for (const headers of [
    { Authorization: "Bearer " + token + ", Bearer " + token },
    { Authorization: "Basic " + token },
    { Authorization: "Bearer short" },
    { Cookie: "church_platform_session=invalid" },
    { Cookie: "__Host-church_platform_session=" },
    { Origin: origin },
    { Origin: "https://foreign.example" },
    { "Sec-Fetch-Site": "same-origin" },
    { "Sec-Fetch-Mode": "cors" }
  ] as Array<Record<string, string>>) {
    const response = await call(
      "session",
      token,
      undefined,
      undefined,
      headers
    );
    assert.ok(response.status === 401 || response.status === 403);
    assert.equal(response.headers.get("set-cookie"), null);
  }
  assert.throws(() =>
    nativeRequestCredential(
      new Request(origin + "/api/platform/v1/session?token=" + token)
    )
  );
  assert.throws(() =>
    nativeRequestCredential(
      new Request("https://foreign.example/api/platform/v1/session")
    )
  );
  assert.throws(() =>
    nativeRequestCredential(
      new Request(origin + "/api/platform/v1/session", {
        headers: {
          Host: "foreign.example",
          "x-forwarded-host": new URL(origin).host
        }
      })
    )
  );
  assert.deepEqual(
    nativeRequestCredential(
      new Request(
        new URL(origin).protocol + "//127.0.0.1:1/api/platform/v1/session",
        {
          headers: { Host: new URL(origin).host }
        }
      )
    ),
    { token: undefined, owner: undefined },
    "proxy Host survives the framework's internal listen address"
  );
  assert.equal((await call("session")).status, 200);
  assert.equal(
    (await call("session", token)).status,
    401,
    "invalid credential cannot become a guest"
  );
  assert.equal(
    (await call("session", undefined, "untrusted-owner")).status,
    401
  );
});

test("password sign-in issues hashed, idle-bounded sessions without changing browser login", async () => {
  const a = await createPortalActor(db, "nativepass");
  const token = await signedIn(a);
  const current = await row(token);
  assert.ok(current.idleExpiresAt && current.idleExpiresAt < current.expiresAt);
  assert.equal(
    (await readAccountSession(db, a.token))?.id,
    a.id,
    "separate browser session remains valid"
  );
  const response = await call("session", token);
  assert.equal((await response.json()).viewerId, a.id);
  const wrong = await call("session", token, "different-account");
  assert.equal((await wrong.json()).error.code, "account_changed");
  assert.equal(
    (
      await call("password", undefined, undefined, {
        email: a.email,
        password: "Wrong-password"
      })
    ).status,
    401
  );
  const blocked = await handleAccountRequest(
    db,
    new Request(origin + "/api/platform/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "login",
        email: a.email,
        password: a.password
      })
    })
  );
  assert.equal(
    blocked.status,
    403,
    "native adapter must not relax browser Origin checks"
  );
});

test("web and native password attempts share the same subject rate budget", async () => {
  const a = await createPortalActor(db, "nativebudget");
  for (let i = 0; i < 10; i++) {
    const response =
      i % 2 === 0
        ? await call("password", undefined, undefined, {
            email: a.email.toUpperCase(),
            password: "Wrong-password"
          })
        : await handleAccountRequest(
            db,
            new Request(origin + "/api/platform/account", {
              method: "POST",
              headers: { Origin: origin, "Content-Type": "application/json" },
              body: JSON.stringify({
                operation: "login",
                email: a.email,
                password: "Wrong-password"
              })
            })
          );
    assert.equal(response.status, i % 2 === 0 ? 401 : 400);
  }
  const blocked = await call("password", undefined, undefined, {
    email: a.email,
    password: a.password
  });
  assert.equal(blocked.status, 429);
  assert.equal((await blocked.json()).error.code, "rate_limited");
});

test("session reads are pure and foreground activity requires the original account", async () => {
  const a = await createPortalActor(db, "nativeidle");
  const token = await signedIn(a),
    initial = await row(token);
  const discovery = await call("session", token);
  assert.equal(discovery.status, 200);
  assert.equal((await discovery.json()).viewerId, a.id);
  const passive = await call("activity", token, a.id);
  assert.equal(passive.status, 200);
  assert.equal((await passive.json()).data.owner, a.id);
  assert.equal(
    (await row(token)).idleExpiresAt!.getTime(),
    initial.idleExpiresAt!.getTime()
  );
  const shortly = new Date(Date.now() + 60000);
  await db.platformSession.update({
    where: { id: initial.id },
    data: { idleExpiresAt: shortly }
  });
  assert.equal(
    (await call("activity", token, "other", { activity: "foreground" })).status,
    401
  );
  assert.equal(
    (await call("activity", token, a.id, { activity: "background" })).status,
    400
  );
  assert.equal((await row(token)).idleExpiresAt!.getTime(), shortly.getTime());
  const responses = await Promise.all(
    Array.from({ length: 3 }, () =>
      call("activity", token, a.id, { activity: "foreground" })
    )
  );
  for (const response of responses) assert.equal(response.status, 200);
  const deadlines = await Promise.all(
    responses.map(async (r) => (await r.json()).data.deadline)
  );
  assert.equal(
    new Set(deadlines).size,
    1,
    "concurrent foreground writes coalesce"
  );
  assert.ok((await row(token)).idleExpiresAt! > shortly);
  const web = await handleAccountSessionRequest(
    db,
    new Request(origin + "/api/platform/session", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        Origin: origin,
        "X-Expected-Account": a.id,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ activity: "foreground" })
    })
  );
  assert.equal(web.status, 401, "browser boundary remains cookie-only");
});

test("activity never revives a session that expired while waiting for the account lock", async () => {
  const a = await createPortalActor(db, "nativerace"),
    token = await signedIn(a);
  const current = await row(token);
  let locked!: () => void;
  const acquired = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const blocker = db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "PlatformUser" WHERE "id"=${a.id} FOR UPDATE`;
    locked();
    await delay(350);
    await tx.platformSession.update({
      where: { id: current.id },
      data: { idleExpiresAt: new Date(Date.now() - 1) }
    });
  });
  await acquired;
  const response = call("activity", token, a.id, { activity: "foreground" });
  await blocker;
  assert.equal((await response).status, 401);
  assert.ok((await row(token)).idleExpiresAt! < new Date());
});

test("logout revokes only its owner-bound current session and delayed retries cannot revoke replacement login", async () => {
  const a = await createPortalActor(db, "nativelogout"),
    token = await signedIn(a);
  assert.equal((await call("logout", token, "other", {})).status, 401);
  assert.ok(await readAccountSession(db, token));
  const response = await call("logout", token, a.id, {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(await readAccountSession(db, token), null);
  assert.ok(await readAccountSession(db, a.token));
  const replacement = await signedIn(a);
  assert.equal((await call("logout", token, a.id, {})).status, 401);
  assert.ok(await readAccountSession(db, replacement));
});

test("canonical revoke-other, password rotation, account deactivation and deletion invalidate native tokens", async () => {
  const a = await createPortalActor(db, "nativerevoke"),
    token = await signedIn(a);
  await revokeOtherAccountSessions(db, a.token, a.password, a.id);
  assert.equal((await call("session", token)).status, 401);
  const next = await signedIn(a);
  const newPassword = "Fictional-replacement-" + randomUUID();
  await changeAccountPassword(
    db,
    a.token,
    a.password,
    newPassword,
    newPassword
  );
  assert.equal((await call("session", next)).status, 401);
  const b = await createPortalActor(db, "nativedeact"),
    btoken = await signedIn(b);
  await deactivateAccount(db, b.token, b.password, true);
  assert.equal((await call("session", btoken)).status, 401);
  const c = await createPortalActor(db, "nativedelete"),
    ctoken = await signedIn(c);
  const deletion = await requestPermanentAccountDeletion(
    db,
    c.token,
    c.password,
    true,
    createSessionToken(),
    { async recordAccount() {} }
  );
  assert.equal(deletion.accepted, true);
  assert.ok(await db.platformUser.findUnique({ where: { id: c.id } }));
  assert.equal(await db.accountDeletion.count({ where: { userId: c.id } }), 1);
  assert.equal((await call("session", ctoken)).status, 401);
});

test("native authenticator enrollment, retry and challenge stay bound to their actual session and current authority", async () => {
  process.env.PRIVILEGED_MFA_MODE = "enforce";
  const a = await createPortalActor(db, "nativemfa");
  await seedOperatorGrants(db, a, ["VIEW_OPERATIONAL_HEALTH"]);
  const token = await signedIn(a);
  const notices: string[] = [];
  const execute = (body: unknown, credential = token, owner = a.id) =>
    handleNativeSessionRequest(
      db,
      req("authenticator", credential, owner, body),
      "authenticator",
      (id) => notices.push(id)
    );
  const initial = {
    operation: "mfa-start",
    requestKey: randomUUID(),
    expectedVersion: 0,
    currentPassword: a.password
  };
  const mistaken = await execute({
    ...initial,
    currentPassword: "Wrong-password"
  });
  assert.equal(mistaken.status, 400);
  assert.equal((await mistaken.json()).error.code, "validation");
  assert.ok(await readAccountSession(db, token));
  assert.equal(
    await db.adminAuthenticator.count({ where: { userId: a.id } }),
    0
  );
  assert.equal(
    await db.adminOperation.count({
      where: { actorId: a.id, requestKey: initial.requestKey }
    }),
    0
  );
  assert.equal((await execute(initial, token, "other")).status, 401);
  const setup = await execute(initial),
    value = (await setup.json()).data;
  assert.equal(setup.status, 200);
  assert.ok(value.enrollment.secret);
  assert.deepEqual((await (await execute(initial)).json()).data, value);
  const factor = await db.adminAuthenticator.findUniqueOrThrow({
    where: { userId: a.id }
  });
  const secret = openAuthenticator(a.id, factor.secretCiphertext),
    counter = BigInt(Math.floor(Date.now() / 30000));
  const confirmation = {
    operation: "mfa-confirm",
    requestKey: randomUUID(),
    expectedVersion: value.version,
    code: authenticatorTotp(secret, counter - BigInt(1))
  };
  const confirmed = await execute(confirmation),
    confirmationValue = (await confirmed.json()).data;
  assert.equal(confirmed.status, 200);
  assert.equal(confirmationValue.recoveryCodes.length, 8);
  assert.deepEqual(
    (await (await execute(confirmation)).json()).data,
    confirmationValue
  );
  const other = await loginAccount(
    db,
    a.email,
    a.password,
    "fictional separate native session"
  );
  assert.equal((await execute(confirmation, other)).status, 409);
  const challenge = {
    operation: "mfa-challenge",
    requestKey: randomUUID(),
    expectedVersion: confirmationValue.version,
    code: authenticatorTotp(secret, counter),
    purpose: "change-access"
  };
  assert.equal((await execute(challenge)).status, 200);
  const requireProof = (credential: string) =>
    withOwnedSession(
      db,
      credential,
      (tx, session) => requirePrivilegedAuthentication(tx, session.userId),
      "shared"
    );
  await requireProof(token);
  await assert.rejects(requireProof(a.token));
  await assert.rejects(requireProof(other));
  const proof = await db.privilegedSessionProof.findUniqueOrThrow({
    where: {
      sessionId_purpose: {
        sessionId: (await row(token)).id,
        purpose: "change-access"
      }
    }
  });
  assert.equal((await execute(challenge)).status, 200);
  assert.equal(
    (
      await db.privilegedSessionProof.findUniqueOrThrow({
        where: {
          sessionId_purpose: {
            sessionId: proof.sessionId,
            purpose: proof.purpose
          }
        }
      })
    ).expiresAt.getTime(),
    proof.expiresAt.getTime()
  );
  assert.equal(
    (await execute(challenge, token, "other")).status,
    401,
    "wrong owner cannot replay a receipt"
  );
  await withOwnedSession(
    db,
    token,
    (tx, session) =>
      requirePrivilegedAuthentication(tx, session.userId, "change-access"),
    true
  );
  await assert.rejects(
    withOwnedSession(
      db,
      token,
      (tx, session) =>
        requirePrivilegedAuthentication(tx, session.userId, "change-access"),
      true
    )
  );
  await db.platformOperatorGrant.updateMany({
    where: { userId: a.id },
    data: { version: { increment: 1 } }
  });
  await assert.rejects(
    requireProof(token),
    "changed privileges invalidate native assurance"
  );
  assert.equal((await execute(challenge)).status, 409);
  assert.ok(notices.length > 0 && notices.every((id) => id === a.id));
  const view = await call("authenticator", token, a.id),
    viewText = await view.text();
  assert.equal(view.status, 200);
  assert.ok(
    !viewText.includes(value.enrollment.secret) &&
      !viewText.includes(confirmationValue.recoveryCodes[0])
  );
  assert.equal((await call("logout", token, a.id, {})).status, 200);
  assert.equal(
    await db.privilegedSessionProof.count({
      where: { sessionId: proof.sessionId }
    }),
    0
  );
});

test("typed notice-scheduling failure after MFA commit stays unconfirmed and exact retry recovers the receipt", async () => {
  process.env.PRIVILEGED_MFA_MODE = "enforce";
  const a = await createPortalActor(db, "nativenotice"),
    token = await signedIn(a);
  const input = {
    operation: "mfa-start",
    requestKey: randomUUID(),
    expectedVersion: 0,
    currentPassword: a.password
  };
  const response = await handleNativeSessionRequest(
    db,
    req("authenticator", token, a.id, input),
    "authenticator",
    () => {
      throw new AccountError("credentials");
    }
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "unconfirmed");
  assert.equal(
    await db.adminAuthenticator.count({ where: { userId: a.id } }),
    1
  );
  const retry = await call("authenticator", token, a.id, input);
  assert.equal(retry.status, 200);
  assert.ok((await retry.json()).data.enrollment.secret);
});
