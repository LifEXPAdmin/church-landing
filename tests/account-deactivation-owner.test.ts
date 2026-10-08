import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  registerAccount,
  loginAccount,
  readAccountSession
} from "../lib/platform/accounts";
import { deactivateAccount } from "../lib/platform/account-lifecycle";
import { AccountSessionOwnerError } from "../lib/platform/account-sessions";
import { handleAccountRequest } from "../lib/platform/account-boundary";
import { handleGoogleRequest } from "../lib/platform/google-boundary";
import { beginGoogleReauthentication } from "../lib/platform/google-accounts";
import { createSessionToken, hashSessionToken } from "../lib/platform/auth";
import { googleCookieName } from "../lib/platform/google-cookies";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";

assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
const database = new URL(process.env.DATABASE_URL!);
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.pathname, "/godschurches_security_test");
const db = new PrismaClient();
after(() => db.$disconnect());
const origin = "https://127.0.0.1:54443";
const password = "Fictional-deactivation-owner-password-1";
beforeEach(async () => {
  process.env.ACCOUNT_ORIGIN = origin;
  process.env.ACCOUNT_DELIVERY_MODE = "test-sink";
  process.env.ACCOUNT_GOOGLE_ENABLED = "true";
  process.env.GOOGLE_CLIENT_ID = "fixture.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "fictional-deactivation-owner-secret";
  await db.platformAuthLimit.deleteMany();
});
async function owner() {
  const username = "deact_" + randomBytes(6).toString("hex");
  await registerAccount(db, {
    username,
    name: "Fictional owner",
    email: username + "@example.test",
    role: "BELIEVER",
    password,
    confirmPassword: password
  });
  const user = await db.platformUser.findUniqueOrThrow({ where: { username } });
  return {
    user,
    token: await loginAccount(db, user.email, password, "Fictional owner test")
  };
}
async function state(userId: string) {
  return {
    user: await db.platformUser.findUniqueOrThrow({ where: { id: userId } }),
    sessions: await db.platformSession.findMany({
      where: { userId },
      orderBy: { id: "asc" }
    }),
    proofs: await db.platformRecentAuthentication.findMany({
      where: { userId },
      orderBy: { id: "asc" }
    }),
    grants: await db.platformAccountGrant.findMany({
      where: { userId },
      orderBy: { id: "asc" }
    })
  };
}
function request(
  path: string,
  token: string,
  body: object,
  expectedOwner?: string,
  recent?: string
) {
  return new Request(origin + path, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie:
        sessionCookieFixtureName(origin) +
        "=" +
        token +
        (recent ? "; " + googleCookieName("recent", true) + "=" + recent : ""),
      ...(expectedOwner === undefined
        ? {}
        : { "X-Expected-Account": expectedOwner })
    },
    body: JSON.stringify(body)
  });
}
for (const http of [false, true]) {
  for (const google of [false, true]) {
    test(`${http ? "HTTP boundary" : "service"} rejects a stale original deactivation owner without consuming ${google ? "a replacement account's Google proof" : "same-password confirmation"}`, async () => {
      const a = await owner(),
        b = await owner();
      const second = await loginAccount(db, b.user.email, password, null);
      let credential: unknown = password;
      let recent: string | undefined;
      if (google) {
        const identity = await db.platformGoogleIdentity.create({
          data: {
            userId: b.user.id,
            issuer: "https://accounts.google.com",
            subject: randomBytes(12).toString("hex")
          }
        });
        const session = await db.platformSession.findUniqueOrThrow({
          where: { tokenHash: hashSessionToken(b.token) }
        });
        recent = createSessionToken();
        await db.platformRecentAuthentication.create({
          data: {
            userId: b.user.id,
            sessionId: session.id,
            googleIdentityId: identity.id,
            credentialVersion: session.credentialVersion,
            purpose: "deactivate-account",
            tokenHash: hashSessionToken(recent),
            expiresAt: new Date(Date.now() + 300_000)
          }
        });
        await db.platformUser.update({
          where: { id: b.user.id },
          data: { passwordHash: null }
        });
        credential = { kind: "google-reauth", token: recent };
      }
      const beforeA = await state(a.user.id),
        beforeB = await state(b.user.id);
      const command = (expectedOwner?: string) =>
        handleAccountRequest(
          db,
          request(
            "/api/platform/account",
            b.token,
            {
              operation: "deactivate-account",
              confirmed: true,
              ...(google
                ? { credentialMethod: "google" }
                : { currentPassword: password })
            },
            expectedOwner,
            recent
          )
        );
      for (const expected of http
        ? [undefined, "", a.user.id]
        : ["", a.user.id]) {
        if (http) {
          const response = await command(expected);
          assert.equal(response.status, 401);
          assert.equal(response.headers.get("set-cookie"), null);
        } else {
          await assert.rejects(
            deactivateAccount(db, b.token, credential, true, expected),
            AccountSessionOwnerError
          );
        }
        assert.deepEqual(await state(a.user.id), beforeA);
        assert.deepEqual(await state(b.user.id), beforeB);
      }
      if (http) {
        const response = await command(b.user.id);
        assert.equal(response.status, 200, await response.clone().text());
        assert.equal(
          response.headers.get("set-cookie"),
          null,
          "A delayed response must leave any newer login and Google cookies untouched"
        );
      } else await deactivateAccount(db, b.token, credential, true, b.user.id);
      assert.ok((await state(b.user.id)).user.deactivatedAt);
      assert.equal(await readAccountSession(db, b.token), null);
      assert.equal(await readAccountSession(db, second), null);
      assert.deepEqual(await state(a.user.id), beforeA);
      if (recent)
        assert.equal(
          await db.platformRecentAuthentication.count({
            where: { tokenHash: hashSessionToken(recent) }
          }),
          0
        );
    });
  }
}

test("Google deactivation confirmation start requires the original owner before creating or canceling attempts", async () => {
  const a = await owner(),
    b = await owner();
  await db.platformGoogleIdentity.create({
    data: {
      userId: b.user.id,
      issuer: "https://accounts.google.com",
      subject: randomBytes(12).toString("hex")
    }
  });
  const before = await db.platformGoogleAttempt.count();
  for (const expected of [undefined, "", a.user.id]) {
    const response = await handleGoogleRequest(
      db,
      request(
        "/api/platform/google",
        b.token,
        { operation: "reauthenticate", purpose: "deactivate-account" },
        expected
      )
    );
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(await db.platformGoogleAttempt.count(), before);
  }
  await assert.rejects(
    beginGoogleReauthentication(
      db,
      b.token,
      createSessionToken(),
      "deactivate-account",
      "/platform/settings/data/deactivate",
      a.user.id
    ),
    AccountSessionOwnerError
  );
  assert.equal(await db.platformGoogleAttempt.count(), before);
  const accepted = await handleGoogleRequest(
    db,
    request(
      "/api/platform/google",
      b.token,
      { operation: "reauthenticate", purpose: "deactivate-account" },
      b.user.id
    )
  );
  assert.equal(accepted.status, 200, await accepted.clone().text());
  const attempt = await db.platformGoogleAttempt.findFirstOrThrow({
    where: { linkUserId: b.user.id },
    orderBy: { createdAt: "desc" }
  });
  assert.equal(attempt.reauthPurpose, "deactivate-account");
  assert.equal(
    attempt.linkSessionId,
    (
      await db.platformSession.findUniqueOrThrow({
        where: { tokenHash: hashSessionToken(b.token) }
      })
    ).id
  );
});

for (const change of ["revoked", "expired", "credentials"] as const) {
  test(`deactivation rechecks a ${change} session after waiting for the account transaction gate`, async () => {
    const a = await owner();
    let locked!: () => void, release!: () => void;
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blocker = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(730221, 2)`;
        locked();
        await held;
        if (change === "revoked")
          await tx.platformSession.deleteMany({ where: { userId: a.user.id } });
        else if (change === "expired")
          await tx.platformSession.updateMany({
            where: { userId: a.user.id },
            data: { expiresAt: new Date(0) }
          });
        else
          await tx.platformUser.update({
            where: { id: a.user.id },
            data: { credentialVersion: { increment: 1 } }
          });
      },
      { timeout: 15000 }
    );
    await ready;
    const outcome = deactivateAccount(
      db,
      a.token,
      password,
      true,
      a.user.id
    ).then(
      () => null,
      (error: unknown) => error
    );
    try {
      const deadline = Date.now() + 5000;
      let waiting = false;
      while (!waiting && Date.now() < deadline) {
        const rows = await db.$queryRaw<
          Array<{ count: bigint }>
        >`SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND classid = 730221 AND objid = 2 AND NOT granted`;
        waiting = Number(rows[0].count) > 0;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.ok(
        waiting,
        "The command must actually be waiting behind the real transaction gate"
      );
    } finally {
      release();
    }
    await blocker;
    assert.ok(
      await outcome,
      "A stale session must not deactivate the account after the gate opens"
    );
    assert.equal((await state(a.user.id)).user.deactivatedAt, null);
  });
}
