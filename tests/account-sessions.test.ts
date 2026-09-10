import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  AccountError,
  registerAccount,
  loginAccount,
  readAccountSession
} from "../lib/platform/accounts";
import {
  listAccountSessions,
  revokeOtherAccountSessions
} from "../lib/platform/account-sessions";
import { createSessionToken, hashSessionToken } from "../lib/platform/auth";

const db = new PrismaClient();
const origin = process.env.ACCOUNT_ORIGIN!;
assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
const database = new URL(process.env.DATABASE_URL!);
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.pathname, "/godschurches_security_test");
after(() => db.$disconnect());
beforeEach(() => db.platformAuthLimit.deleteMany());
const password = "Fictional-session-password-1";
async function owner() {
  const username = "sess_" + randomBytes(7).toString("hex");
  await registerAccount(db, {
    name: "Synthetic Sessions",
    username,
    email: username + "@example.test",
    role: "BELIEVER",
    password,
    confirmPassword: password
  });
  return db.platformUser.findUniqueOrThrow({ where: { username } });
}
async function signins() {
  const user = await owner();
  const current = await loginAccount(
    db,
    user.email,
    password,
    "Private-UA-marker Mozilla/5.0 (Windows NT 10.0) Firefox/142.0"
  );
  const other = await loginAccount(
    db,
    user.email,
    password,
    "Mozilla/5.0 (iPhone) Version/18.0 Mobile Safari/604.1"
  );
  return { user, current, other };
}
const row = (token: string) =>
  db.platformSession.findUniqueOrThrow({
    where: { tokenHash: hashSessionToken(token) }
  });
const cookie = (token: string) => "church_platform_session=" + token;
const post = (
  body: Record<string, unknown>,
  token = "",
  headers: Record<string, string> = {}
) =>
  fetch(origin + "/api/platform/account", {
    method: "POST",
    redirect: "manual",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: cookie(token),
      ...headers
    },
    body: JSON.stringify(body)
  });
const isSessionError = (error: unknown) =>
  error instanceof AccountError && error.code === "session";

test("session listing is owner-only, bounded, current-first and contains only safe labels/dates", async () => {
  const { user, current, other } = await signins();
  const stranger = await signins();
  const currentRow = await row(current);
  await db.platformSession.update({
    where: { id: currentRow.id },
    data: { createdAt: new Date(Date.now() - 86400000) }
  });
  await db.platformSession.createMany({
    data: Array.from({ length: 22 }, (_, index) => ({
      userId: user.id,
      tokenHash: hashSessionToken(createSessionToken()),
      credentialVersion: index === 0 ? 99 : 0,
      expiresAt: index === 1 ? new Date(0) : new Date(Date.now() + 86400000),
      userAgent: "private-unknown-marker"
    }))
  });
  const before = await db.platformSession.findMany({ orderBy: { id: "asc" } });
  const result = await listAccountSessions(db, current);
  assert.equal(result.otherCount, 21);
  assert.equal(result.sessions.length, 21);
  assert.equal(result.sessions.filter((s) => s.isCurrent).length, 1);
  assert.equal(result.sessions[0].label, "Firefox on Windows");
  assert.equal(result.sessions[0].isCurrent, true);
  for (const item of result.sessions)
    assert.deepEqual(Object.keys(item).sort(), [
      "createdAt",
      "expiresAt",
      "isCurrent",
      "label"
    ]);
  for (const secret of [
    user.email,
    user.passwordHash!,
    current,
    other,
    currentRow.id,
    currentRow.tokenHash,
    stranger.user.email,
    "private-unknown-marker",
    "Private-UA-marker"
  ])
    assert.ok(!JSON.stringify(result).includes(secret));
  assert.deepEqual(
    await db.platformSession.findMany({ orderBy: { id: "asc" } }),
    before
  );
});

test("password-confirmed revocation preserves current session, other owners, credentials and grants", async () => {
  const { user, current, other } = await signins();
  const stranger = await signins();
  const before = await db.platformSession.findMany({ orderBy: { id: "asc" } });
  await assert.rejects(
    revokeOtherAccountSessions(db, current, "Wrong-password-1"),
    (error) => error instanceof AccountError && error.code === "credentials"
  );
  assert.deepEqual(
    await db.platformSession.findMany({ orderBy: { id: "asc" } }),
    before
  );
  const grants = await db.platformAccountGrant.findMany({
    orderBy: { id: "asc" }
  });
  await revokeOtherAccountSessions(db, current, password);
  assert.equal(await readAccountSession(db, other), null);
  assert.equal((await readAccountSession(db, current))?.id, user.id);
  assert.ok(await readAccountSession(db, stranger.current));
  assert.ok(await readAccountSession(db, stranger.other));
  assert.deepEqual(
    await db.platformUser.findUniqueOrThrow({ where: { id: user.id } }),
    user
  );
  assert.deepEqual(
    await db.platformAccountGrant.findMany({ orderBy: { id: "asc" } }),
    grants
  );
  assert.equal((await listAccountSessions(db, current)).otherCount, 0);
});

test("expired, revoked, stale-version and suspended sessions cannot list or revoke", async () => {
  for (const invalid of ["expired", "revoked", "stale", "suspended"]) {
    const { user, current, other } = await signins();
    if (invalid === "expired")
      await db.platformSession.update({
        where: { tokenHash: hashSessionToken(current) },
        data: { expiresAt: new Date(0) }
      });
    if (invalid === "revoked")
      await db.platformSession.delete({
        where: { tokenHash: hashSessionToken(current) }
      });
    if (invalid === "stale")
      await db.platformSession.update({
        where: { tokenHash: hashSessionToken(current) },
        data: { credentialVersion: 99 }
      });
    if (invalid === "suspended")
      await db.platformUser.update({
        where: { id: user.id },
        data: { suspendedAt: new Date() }
      });
    const untouched = await row(other);
    await assert.rejects(listAccountSessions(db, current), isSessionError);
    await assert.rejects(
      revokeOtherAccountSessions(db, current, password),
      isSessionError
    );
    assert.deepEqual(await row(other), untouched);
  }
  await assert.rejects(listAccountSessions(db, undefined), isSessionError);
  await assert.rejects(
    revokeOtherAccountSessions(db, "invalid", password),
    isSessionError
  );
});

test("competing revocations serialize and only the winning current session survives", async () => {
  const { user, current, other } = await signins();
  const results = await Promise.allSettled([
    revokeOtherAccountSessions(db, current, password),
    revokeOtherAccountSessions(db, other, password)
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    await db.platformSession.count({ where: { userId: user.id } }),
    1
  );
  assert.equal(
    [
      await readAccountSession(db, current),
      await readAccountSession(db, other)
    ].filter(Boolean).length,
    1
  );
  for (const result of results)
    if (result.status === "rejected") assert.ok(isSessionError(result.reason));
});

test("production HTTPS session controls revoke another login on its next request and retain current access", async () => {
  const user = await owner();
  const login = async (agent: string) => {
    const response = await post(
      { operation: "login", email: user.email, password },
      "",
      { "User-Agent": agent }
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("set-cookie")!, /Secure/);
    return response.headers.get("set-cookie")!.split(";")[0].split("=")[1];
  };
  const current = await login("Mozilla/5.0 (Windows NT 10.0) Firefox/142.0");
  const other = await login(
    "Mozilla/5.0 (iPhone) Version/18.0 Mobile Safari/604.1"
  );
  const listing = await post({ operation: "list-sessions" }, current);
  assert.equal(listing.status, 200);
  assert.match(listing.headers.get("cache-control")!, /\bno-store\b/);
  assert.equal(listing.headers.get("set-cookie"), null);
  const body = await listing.json();
  assert.equal(body.otherCount, 1);
  assert.equal(body.sessions[1].label, "Safari on iPhone");
  for (const secret of [
    user.email,
    user.passwordHash!,
    current,
    other,
    "tokenHash",
    "userAgent"
  ])
    assert.ok(!JSON.stringify(body).includes(secret));
  const removed = await post(
    { operation: "revoke-other-sessions", currentPassword: password },
    current
  );
  assert.equal(removed.status, 200);
  assert.equal(removed.headers.get("set-cookie"), null);
  assert.equal((await post({ operation: "list-sessions" }, other)).status, 401);
  assert.equal(
    (await post({ operation: "list-sessions" }, current)).status,
    200
  );
  const signedOut = await fetch(origin + "/platform/settings", {
    redirect: "manual",
    headers: { Cookie: cookie(other) }
  });
  assert.equal(signedOut.status, 307);
  assert.match(
    signedOut.headers.get("location")!,
    /^\/platform\/join\?next=%2Fplatform%2Fsettings&reason=settings$/
  );
  for (const rsc of [false, true]) {
    const page = await fetch(origin + "/platform/settings", {
      headers: { Cookie: cookie(current), ...(rsc ? { RSC: "1" } : {}) }
    });
    assert.equal(page.status, 200);
    const html = await page.text();
    // Flight data references the client component; its text is rendered in HTML.
    if (!rsc) assert.ok(html.includes("Active sign-ins"));
    for (const secret of [
      user.email,
      user.passwordHash!,
      current,
      other,
      "tokenHash",
      "userAgent"
    ])
      assert.ok(!html.includes(secret));
  }
});

test("HTTPS rejects forged owner/target/origin and anonymous callers without touching sessions", async () => {
  const { current } = await signins();
  const stranger = await signins();
  const before = await db.platformSession.findMany({ orderBy: { id: "asc" } });
  for (const operation of ["list-sessions", "revoke-other-sessions"]) {
    const body = { operation, currentPassword: password };
    const validBody = operation === "list-sessions" ? { operation } : body;
    for (const headers of [
      { Origin: "https://wrong.example" },
      { Origin: "" },
      { "Sec-Fetch-Site": "cross-site" }
    ] as Array<Record<string, string>>)
      assert.equal((await post(validBody, current, headers)).status, 403);
    assert.equal((await post(validBody)).status, 401);
    assert.equal(
      (await post({ ...validBody, userId: stranger.user.id }, current)).status,
      400
    );
    assert.equal(
      (
        await post(
          { ...validBody, sessionId: (await row(stranger.current)).id },
          current
        )
      ).status,
      400
    );
  }
  assert.deepEqual(
    await db.platformSession.findMany({ orderBy: { id: "asc" } }),
    before
  );
});

test("wrong-password session revocation is durably rate limited", async () => {
  const { current, other } = await signins();
  for (let index = 0; index < 11; index++) {
    const response = await post(
      {
        operation: "revoke-other-sessions",
        currentPassword: "Wrong-password-2"
      },
      current
    );
    assert.equal(response.status, index < 10 ? 400 : 429);
    if (index === 10) assert.equal(response.headers.get("retry-after"), "900");
  }
  assert.ok(await readAccountSession(db, current));
  assert.ok(await readAccountSession(db, other));
});
