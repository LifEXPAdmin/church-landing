import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import {
  AccountError,
  changeAccountPassword,
  loginAccount,
  readAccountSession,
  registerAccount
} from "../lib/platform/accounts";
import {
  listAccountSessions,
  withOwnedSession
} from "../lib/platform/account-sessions";
import {
  readAccountSessionActivity,
  recordAccountSessionActivity
} from "../lib/platform/account-session-activity";
import { handleAccountSessionRequest } from "../lib/platform/account-session-boundary";
import { createSessionToken, hashSessionToken } from "../lib/platform/auth";
import {
  ACCOUNT_IDLE_SECONDS,
  LEGACY_IDLE_ENDS_AT,
  activeAccountSessionWhere,
  inactiveAccountSessionWhere
} from "../lib/platform/account-session-policy";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import {
  beginGoogleAttempt,
  finishGoogleAttempt
} from "../lib/platform/google-accounts";
import {
  GOOGLE_ISSUER,
  GoogleAccountError
} from "../lib/platform/google-provider";
import { socialCommand } from "../lib/platform/social-operations";

const db = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
let updates = 0;
db.$on("query", (event) => {
  if (/UPDATE\s+"(?:public"\.")?PlatformSession"/.test(event.query)) updates++;
});
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const expired = (error: unknown) =>
  error instanceof AccountError && error.code === "session";
const row = (token: string) =>
  db.platformSession.findUniqueOrThrow({
    where: { tokenHash: hashSessionToken(token) }
  });
async function actor() {
  const username = "idle_" + randomBytes(6).toString("hex");
  const password = "Fictional-only-" + randomBytes(15).toString("hex");
  const email = username + "@example.test";
  await registerAccount(db, {
    username,
    name: "Fictional inactivity owner",
    email,
    password,
    confirmPassword: password,
    role: "BELIEVER"
  });
  const user = await db.platformUser.findUniqueOrThrow({ where: { username } });
  const token = await loginAccount(db, email, password, "Fictional idle test");
  return { ...user, password, token };
}
const origin = process.env.ACCOUNT_ORIGIN!;
function request(
  token: string,
  owner?: string,
  method = "GET",
  body: unknown = { activity: "foreground" },
  extra: Record<string, string> = {}
) {
  return new Request(origin + "/api/platform/session", {
    method,
    headers: {
      Cookie: sessionCookieFixtureName(origin) + "=" + token,
      ...(owner ? { "X-Expected-Account": owner } : {}),
      ...(method === "POST"
        ? { Origin: origin, "Content-Type": "application/json" }
        : {}),
      ...extra
    },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {})
  });
}

test("password issuance and database defaults set idle deadlines without changing thirty-day expiry", async () => {
  const a = await actor(),
    current = await row(a.token);
  assert.ok(current.idleExpiresAt);
  assert.ok(
    Math.abs(
      current.idleExpiresAt.getTime() -
        current.createdAt.getTime() -
        ACCOUNT_IDLE_SECONDS * 1000
    ) < 1000
  );
  assert.ok(
    Math.abs(
      current.expiresAt.getTime() - current.createdAt.getTime() - 30 * 86400000
    ) < 1000
  );
  const fallback = await db.platformSession.create({
    data: {
      userId: a.id,
      tokenHash: hashSessionToken(createSessionToken()),
      expiresAt: current.expiresAt
    }
  });
  assert.ok(fallback.idleExpiresAt);
  assert.ok(
    Math.abs(
      fallback.idleExpiresAt.getTime() -
        fallback.createdAt.getTime() -
        ACCOUNT_IDLE_SECONDS * 1000
    ) < 1000
  );
});

test("idle expiry denies readers, owned commands, password change and activity without deleting recovery state", async () => {
  const a = await actor();
  await db.platformSession.update({
    where: { tokenHash: hashSessionToken(a.token) },
    data: { idleExpiresAt: new Date(Date.now() - 1) }
  });
  const before = await row(a.token);
  assert.equal(await readAccountSession(db, a.token), null);
  await assert.rejects(
    withOwnedSession(db, a.token, async () => true),
    expired
  );
  await assert.rejects(
    changeAccountPassword(
      db,
      a.token,
      a.password,
      "Fictional-new-" + randomBytes(12).toString("hex"),
      "mismatch"
    )
  );
  const newPassword = "Fictional-new-" + randomBytes(12).toString("hex");
  await assert.rejects(
    changeAccountPassword(db, a.token, a.password, newPassword, newPassword),
    expired
  );
  await assert.rejects(
    recordAccountSessionActivity(db, a.token, a.id),
    expired
  );
  assert.deepEqual(await row(a.token), before);
  const response = await handleAccountSessionRequest(
    db,
    request(a.token, a.id, "POST")
  );
  assert.equal(response.status, 401);
  assert.deepEqual(response.headers.getSetCookie(), []);
});

test("passive reads work inside read-only transactions and never renew", async () => {
  const a = await actor(),
    before = await row(a.token),
    count = updates;
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    assert.equal((await readAccountSession(tx, a.token))?.id, a.id);
  });
  for (let i = 0; i < 4; i++) {
    assert.equal(
      (await readAccountSessionActivity(db, a.token, a.id)).owner,
      a.id
    );
    assert.equal(
      (await handleAccountSessionRequest(db, request(a.token, a.id))).status,
      200
    );
  }
  assert.equal(updates, count);
  assert.deepEqual(await row(a.token), before);
});

test("concurrent activity writes once per interval and never accepts another expected account", async () => {
  const a = await actor(),
    before = await row(a.token),
    count = updates;
  await Promise.all(
    Array.from({ length: 8 }, () =>
      recordAccountSessionActivity(db, a.token, a.id)
    )
  );
  assert.equal(updates - count, 1);
  const current = await row(a.token);
  assert.equal(current.expiresAt.getTime(), before.expiresAt.getTime());
  assert.ok(current.idleExpiresAt! > before.idleExpiresAt!);
  await assert.rejects(
    recordAccountSessionActivity(db, a.token, "different-owner"),
    expired
  );
  assert.deepEqual(await row(a.token), current);
});

test("time is checked after a blocked owner lock, never before it", async () => {
  const a = await actor();
  let locked!: () => void, release!: () => void;
  const acquired = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const unblock = new Promise<void>((resolve) => {
    release = resolve;
  });
  const held = db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "PlatformUser" WHERE "id" = ${a.id} FOR UPDATE`;
    await tx.platformSession.update({
      where: { tokenHash: hashSessionToken(a.token) },
      data: { idleExpiresAt: new Date(Date.now() + 150) }
    });
    locked();
    await unblock;
  });
  await acquired;
  const attempt = recordAccountSessionActivity(db, a.token, a.id);
  const denied = assert.rejects(attempt, expired);
  await delay(250);
  release();
  await held;
  await denied;
  assert.equal(await readAccountSession(db, a.token), null);
});

test("legacy transition adopts on activity; SQL listing and cleanup predicates agree at cutoff", async () => {
  const a = await actor();
  const before = await db.platformSession.update({
    where: { tokenHash: hashSessionToken(a.token) },
    data: { idleExpiresAt: null }
  });
  assert.equal((await readAccountSession(db, a.token))?.id, a.id);
  assert.equal((await row(a.token)).idleExpiresAt, null);
  await recordAccountSessionActivity(db, a.token, a.id);
  const adopted = await row(a.token);
  assert.ok(adopted.idleExpiresAt);
  assert.equal(adopted.expiresAt.getTime(), before.expiresAt.getTime());
  const cutoff = new Date(LEGACY_IDLE_ENDS_AT);
  await db.platformSession.update({
    where: { id: adopted.id },
    data: {
      idleExpiresAt: null,
      expiresAt: new Date(cutoff.getTime() + 86400000)
    }
  });
  assert.equal(
    await db.platformSession.count({
      where: { id: adopted.id, ...activeAccountSessionWhere(cutoff) }
    }),
    0
  );
  assert.equal(
    await db.platformSession.count({
      where: { id: adopted.id, ...inactiveAccountSessionWhere(cutoff) }
    }),
    1
  );
});

test("active-session list excludes an idle device while keeping its live sibling", async () => {
  const a = await actor();
  const other = await loginAccount(
    db,
    a.email,
    a.password,
    "Other fictional device"
  );
  await db.platformSession.update({
    where: { tokenHash: hashSessionToken(other) },
    data: { idleExpiresAt: new Date(0) }
  });
  const list = await listAccountSessions(db, a.token, a.id);
  assert.equal(list.otherCount, 0);
  assert.equal(list.sessions.length, 1);
  assert.equal(
    list.sessions[0].expiresAt,
    (await row(a.token)).idleExpiresAt!.toISOString()
  );
});

test("HTTP origin, body and owner guards fail closed without renewing or clearing cookies", async () => {
  const a = await actor(),
    before = await row(a.token);
  for (const [req, status] of [
    [
      request(
        a.token,
        a.id,
        "POST",
        { activity: "foreground" },
        { Origin: "https://example.test" }
      ),
      403
    ],
    [
      request(a.token, a.id, "POST", {
        activity: "foreground",
        serverTime: Date.now()
      }),
      400
    ],
    [request(a.token, undefined, "POST"), 400],
    [request(a.token, "other-owner", "POST"), 401],
    [
      request(a.token, a.id, "GET", undefined, {
        "Sec-Fetch-Site": "cross-site"
      }),
      403
    ]
  ] as const) {
    const result = await handleAccountSessionRequest(db, req);
    assert.equal(result.status, status);
    assert.equal(result.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(result.headers.getSetCookie(), []);
  }
  assert.deepEqual(await row(a.token), before);
});

test("activity does not depend on unrelated email or rate-limit configuration", async () => {
  const a = await actor(),
    oldDelivery = process.env.ACCOUNT_DELIVERY_MODE,
    oldRate = process.env.AUTH_RATE_LIMIT_SECRET;
  try {
    process.env.ACCOUNT_DELIVERY_MODE = "invalid-mail-config";
    process.env.AUTH_RATE_LIMIT_SECRET = "bad";
    assert.equal(
      (await handleAccountSessionRequest(db, request(a.token, a.id))).status,
      200
    );
    assert.equal(
      (await handleAccountSessionRequest(db, request(a.token, a.id, "POST")))
        .status,
      200
    );
  } finally {
    if (oldDelivery === undefined) delete process.env.ACCOUNT_DELIVERY_MODE;
    else process.env.ACCOUNT_DELIVERY_MODE = oldDelivery;
    if (oldRate === undefined) delete process.env.AUTH_RATE_LIMIT_SECRET;
    else process.env.AUTH_RATE_LIMIT_SECRET = oldRate;
  }
});

test("a Google linking round trip cannot finish after its original session idles", async () => {
  const a = await actor(),
    browserToken = createSessionToken();
  const proof = await beginGoogleAttempt(db, browserToken, "/platform", {
    sessionToken: a.token,
    password: a.password
  });
  await assert.rejects(
    finishGoogleAttempt(
      db,
      {
        clientId: "fixture.apps.googleusercontent.com",
        clientSecret: "fictional",
        callback: origin + "/api/platform/google/callback"
      },
      { ...proof, browserToken, code: "fictional-code", sessionToken: a.token },
      async () => {
        await db.platformSession.update({
          where: { tokenHash: hashSessionToken(a.token) },
          data: { idleExpiresAt: new Date(0) }
        });
        return {
          issuer: GOOGLE_ISSUER,
          subject: randomUUID(),
          email: a.email,
          emailAuthoritative: true
        };
      }
    ),
    (error) => error instanceof GoogleAccountError
  );
  assert.equal(
    await db.platformGoogleIdentity.count({ where: { userId: a.id } }),
    0
  );
});

test("same-owner new sign-in recovers an exact saved receipt without replaying its effect", async () => {
  const a = await actor(),
    input = { mutationId: randomUUID(), operation: "fixture-increment" };
  let executions = 0;
  const run = () =>
    socialCommand(db, a.token, "idle-recovery", input, async (tx, owner) => {
      executions++;
      const user = await tx.platformUser.update({
        where: { id: owner },
        data: { portalVersion: { increment: 1 } }
      });
      return { id: owner, version: user.portalVersion, message: "Saved once" };
    });
  const committed = await run(); // Simulated response loss: retain input/key.
  await db.platformSession.update({
    where: { tokenHash: hashSessionToken(a.token) },
    data: { idleExpiresAt: new Date(0) }
  });
  await assert.rejects(run(), expired);
  a.token = await loginAccount(db, a.email, a.password, "Same fictional owner");
  assert.deepEqual(await run(), committed);
  assert.equal(executions, 1);
  assert.equal(
    await db.socialOperation.count({
      where: { ownerId: a.id, key: "idle-recovery:" + input.mutationId }
    }),
    1
  );
});
