import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  registerAccount,
  loginAccount,
  readAccountSession,
  AccountError,
  changeAccountPassword,
  requestAccountGrant,
  consumeAccountGrant
} from "../lib/platform/accounts";
import {
  requestEmailChange,
  confirmEmailChange,
  AccountEmailChangeError
} from "../lib/platform/account-email-change";
import { deactivateAccount } from "../lib/platform/account-lifecycle";
import { hashSessionToken, createSessionToken } from "../lib/platform/auth";
import { handleAccountRequest } from "../lib/platform/account-boundary";

assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
const database = new URL(process.env.DATABASE_URL!);
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.pathname, "/godschurches_security_test");
const db = new PrismaClient();
after(() => db.$disconnect());
beforeEach(() => db.platformAuthLimit.deleteMany());
const password = "Fictional-email-change-password-1";
const unique = () => "email_" + randomBytes(6).toString("hex");
async function owner() {
  const username = unique();
  await registerAccount(db, {
    username,
    name: "Fictional Email Owner",
    email: username + "@example.test",
    role: "BELIEVER",
    password,
    confirmPassword: password
  });
  const user = await db.platformUser.findUniqueOrThrow({ where: { username } });
  return { user, token: await loginAccount(db, user.email, password, null) };
}
async function prepare(
  a: Awaited<ReturnType<typeof owner>>,
  newEmail = unique() + "@example.test"
) {
  const deliveries: Array<{ email: string; purpose: string; token: string }> =
    [];
  const work = await requestEmailChange(
    db,
    a.token,
    password,
    newEmail,
    async (email, purpose, token) => {
      deliveries.push({ email, purpose, token });
    }
  );
  return { work, deliveries, newEmail };
}
const code = (value: string) => (e: unknown) =>
  e instanceof AccountError && e.code === value;

test("email changes require the owner and current password; preparation stores only a hash and leaves identity unchanged", async () => {
  const a = await owner();
  const fail = async () => {
    throw new Error("Unexpected delivery");
  };
  await assert.rejects(
    requestEmailChange(db, "", password, "new@example.test", fail),
    code("session")
  );
  await assert.rejects(
    requestEmailChange(
      db,
      a.token,
      "Wrong-password-1",
      "new@example.test",
      fail
    ),
    code("credentials")
  );
  await assert.rejects(
    requestEmailChange(db, a.token, password, "invalid", fail),
    AccountEmailChangeError
  );
  assert.equal(
    await db.platformEmailChange.count({ where: { userId: a.user.id } }),
    0
  );
  const p = await prepare(a, "  " + unique().toUpperCase() + "@EXAMPLE.TEST  ");
  assert.equal(p.deliveries.length, 0);
  assert.deepEqual(
    await db.platformUser.findUnique({ where: { id: a.user.id } }),
    a.user
  );
  await p.work();
  assert.equal(p.deliveries.length, 1);
  const sent = p.deliveries[0];
  assert.equal(sent.email, p.newEmail.trim().toLowerCase());
  assert.equal(sent.purpose, "CHANGE_EMAIL");
  const row = await db.platformEmailChange.findUniqueOrThrow({
    where: { userId: a.user.id }
  });
  assert.equal(row.tokenHash, hashSessionToken(sent.token));
  assert.ok(!JSON.stringify(row).includes(sent.token));
  assert.equal(row.credentialVersion, a.user.credentialVersion);
  assert.ok(row.expiresAt.getTime() - row.createdAt.getTime() <= 30 * 60_000);
  assert.ok(await readAccountSession(db, a.token));
});

test("confirmation checks owner, password, purpose and expiry, then atomically changes email and revokes every session and grant", async () => {
  const a = await owner();
  const b = await owner();
  const otherSession = await loginAccount(db, a.user.email, password, null);
  const p = await prepare(a);
  await p.work();
  const token = p.deliveries[0].token;
  let reset = "";
  await requestAccountGrant(
    db,
    a.user.email,
    "RESET_PASSWORD",
    async (_email, _purpose, value) => {
      reset = value;
    }
  );
  await assert.rejects(
    confirmEmailChange(db, b.token, password, token),
    code("grant")
  );
  await assert.rejects(
    confirmEmailChange(db, a.token, "Wrong-password-1", token),
    code("credentials")
  );
  await assert.rejects(
    confirmEmailChange(db, a.token, password, reset),
    code("grant")
  );
  await assert.rejects(
    consumeAccountGrant(db, token, "RESET_PASSWORD", password, password),
    code("grant")
  );
  await db.platformEmailChange.update({
    where: { userId: a.user.id },
    data: { expiresAt: new Date(0) }
  });
  await assert.rejects(
    confirmEmailChange(db, a.token, password, token),
    code("grant")
  );
  await db.platformEmailChange.update({
    where: { userId: a.user.id },
    data: { expiresAt: new Date(Date.now() + 60_000) }
  });
  await confirmEmailChange(db, otherSession, password, token);
  const after = await db.platformUser.findUniqueOrThrow({
    where: { id: a.user.id }
  });
  const {
    email,
    emailVerifiedAt,
    credentialVersion,
    portalVersion,
    updatedAt,
    ...retained
  } = after;
  const original = Object.fromEntries(
    Object.entries(a.user).filter(([key]) => Object.hasOwn(retained, key))
  );
  assert.deepEqual(retained, original);
  assert.ok(updatedAt >= a.user.updatedAt);
  assert.equal(email, p.newEmail);
  assert.ok(emailVerifiedAt);
  assert.equal(credentialVersion, a.user.credentialVersion + 1);
  assert.equal(portalVersion, a.user.portalVersion + 1);
  assert.equal(
    await db.platformSession.count({ where: { userId: a.user.id } }),
    0
  );
  assert.equal(
    await db.platformAccountGrant.count({
      where: { userId: a.user.id, consumedAt: null }
    }),
    0
  );
  assert.equal(
    await db.platformEmailChange.count({ where: { userId: a.user.id } }),
    0
  );
  assert.equal(await readAccountSession(db, a.token), null);
  assert.ok(await readAccountSession(db, b.token));
  await assert.rejects(
    loginAccount(db, a.user.email, password, null),
    code("credentials")
  );
  const fresh = await loginAccount(db, p.newEmail, password, null);
  await assert.rejects(
    confirmEmailChange(db, fresh, password, token),
    code("grant")
  );
  await assert.rejects(
    consumeAccountGrant(db, reset, "RESET_PASSWORD", password, password),
    code("grant")
  );
});

test("only the newest email request can send or confirm, and concurrent confirmation has one winner", async () => {
  const a = await owner();
  const old = await prepare(a);
  await old.work();
  const newer = await prepare(a);
  await newer.work();
  await old.work();
  assert.equal(old.deliveries.length, 1);
  await assert.rejects(
    confirmEmailChange(db, a.token, password, old.deliveries[0].token),
    code("grant")
  );
  const result = await Promise.allSettled([
    confirmEmailChange(db, a.token, password, newer.deliveries[0].token),
    confirmEmailChange(db, a.token, password, newer.deliveries[0].token)
  ]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { id: a.user.id } }))
      .email,
    newer.newEmail
  );
  const b = await owner();
  const [one, two] = await Promise.all([prepare(b), prepare(b)]);
  await Promise.all([one.work(), two.work()]);
  assert.equal(one.deliveries.length + two.deliveries.length, 1);
  assert.equal(
    await db.platformEmailChange.count({ where: { userId: b.user.id } }),
    1
  );
});

test("existing, same and newly claimed emails never merge identities; unique-constraint races leave the owner unchanged", async () => {
  const a = await owner();
  const b = await owner();
  const legacy = await db.platformUser.create({
    data: {
      username: unique(),
      name: "Fictional Legacy",
      email: unique() + "@example.test"
    }
  });
  for (const email of [a.user.email, b.user.email, legacy.email]) {
    const p = await prepare(a, email);
    await p.work();
    assert.equal(p.deliveries.length, 0);
    assert.deepEqual(
      await db.platformUser.findUnique({ where: { id: a.user.id } }),
      a.user
    );
  }
  const p = await prepare(a);
  await p.work();
  const claimant = await db.platformUser.create({
    data: {
      username: unique(),
      name: "Fictional Later Claimant",
      email: p.newEmail
    }
  });
  await assert.rejects(
    confirmEmailChange(db, a.token, password, p.deliveries[0].token),
    AccountEmailChangeError
  );
  // Simulate the availability read racing a committed registration; the actual
  // database unique constraint must reject the update and roll back its transaction.
  const racingDb = new Proxy(db, {
    get(target, key) {
      if (key !== "$transaction") return Reflect.get(target, key);
      return (
        callback: Parameters<PrismaClient["$transaction"]>[0],
        options: unknown
      ) =>
        target.$transaction(async (tx) => {
          const racingTx = new Proxy(tx, {
            get(transaction, name) {
              if (name !== "platformUser")
                return Reflect.get(transaction, name);
              return new Proxy(transaction.platformUser, {
                get(delegate, method) {
                  if (method !== "findUnique")
                    return Reflect.get(delegate, method);
                  return (args: { where: { email?: string } }) =>
                    args.where.email === p.newEmail
                      ? Promise.resolve(null)
                      : delegate.findUnique(args as never);
                }
              });
            }
          });
          return (callback as (value: typeof tx) => Promise<unknown>)(racingTx);
        }, options as never);
    }
  });
  await assert.rejects(
    confirmEmailChange(racingDb, a.token, password, p.deliveries[0].token),
    AccountEmailChangeError
  );
  assert.deepEqual(
    await db.platformUser.findUnique({ where: { id: a.user.id } }),
    a.user
  );
  assert.deepEqual(
    await db.platformUser.findUnique({ where: { id: claimant.id } }),
    claimant
  );
  assert.ok(await readAccountSession(db, a.token));
});

test("password changes, resets and lifecycle transitions invalidate pending email changes and deferred delivery", async () => {
  for (const action of [
    "password",
    "reset",
    "deactivate",
    "suspend",
    "version"
  ]) {
    const a = await owner();
    const p = await prepare(a);
    const row = await db.platformEmailChange.findUniqueOrThrow({
      where: { userId: a.user.id }
    });
    if (action === "password")
      await changeAccountPassword(
        db,
        a.token,
        password,
        password + "2",
        password + "2"
      );
    if (action === "reset") {
      let token = "";
      await requestAccountGrant(
        db,
        a.user.email,
        "RESET_PASSWORD",
        async (_email, _purpose, value) => {
          token = value;
        }
      );
      await consumeAccountGrant(
        db,
        token,
        "RESET_PASSWORD",
        password + "2",
        password + "2"
      );
    }
    if (action === "deactivate")
      await deactivateAccount(db, a.token, password, true);
    if (action === "suspend")
      await db.platformUser.update({
        where: { id: a.user.id },
        data: { suspendedAt: new Date() }
      });
    if (action === "version")
      await db.platformUser.update({
        where: { id: a.user.id },
        data: { credentialVersion: { increment: 1 } }
      });
    if (["password", "reset", "deactivate"].includes(action))
      assert.equal(
        await db.platformEmailChange.count({ where: { userId: a.user.id } }),
        0
      );
    await p.work();
    assert.equal(p.deliveries.length, 0);
    assert.equal(
      await db.platformEmailChange.count({ where: { userId: a.user.id } }),
      0
    );
    await assert.rejects(
      confirmEmailChange(db, a.token, password, createSessionToken()),
      code("session")
    );
    assert.equal(
      (await db.platformUser.findUniqueOrThrow({ where: { id: row.userId } }))
        .email,
      a.user.email
    );
  }
});

test("a failed older send cannot delete a newer pending request and provider detail is not leaked", async () => {
  const a = await owner();
  let started!: () => void;
  let fail!: () => void;
  const beginning = new Promise<void>((resolve) => {
    started = resolve;
  });
  const blocked = new Promise<void>((_resolve, reject) => {
    fail = () => reject(new Error("private-provider-recipient-token"));
  });
  const work = await requestEmailChange(
    db,
    a.token,
    password,
    unique() + "@example.test",
    async () => {
      started();
      await blocked;
    }
  );
  const sending = work();
  await beginning;
  const newer = await prepare(a);
  const assertion = assert.rejects(sending, {
    message: "Account email-change delivery failed"
  });
  fail();
  await assertion;
  await newer.work();
  const row = await db.platformEmailChange.findUniqueOrThrow({
    where: { userId: a.user.id }
  });
  assert.equal(row.tokenHash, hashSessionToken(newer.deliveries[0].token));
  // Keep this pending row for the harness's backup/restore fingerprint check.
});

test("production-config boundary defers recipient checks and emits a purpose-specific provider link after identical responses", async (t) => {
  const sender = {
    VERCEL: "1",
    VERCEL_ENV: "production",
    ACCOUNT_ORIGIN: "https://godschurches.example.test",
    ACCOUNT_DELIVERY_MODE: "resend",
    ACCOUNT_EMAIL_FROM: "accounts@mail.godschurches.example.test",
    RESEND_API_KEY: "re_synthetic_never_a_real_key"
  };
  for (const [key, value] of Object.entries(sender)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  const a = await owner();
  const b = await owner();
  const calls: Array<{ to: string[]; subject: string; text: string }> = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://api.resend.com/emails");
    calls.push(JSON.parse(String(init.body)));
    return Response.json({ id: "synthetic-provider-id" });
  });
  const request = (newEmail: string) =>
    new Request(sender.ACCOUNT_ORIGIN + "/api/platform/account", {
      method: "POST",
      headers: {
        Origin: sender.ACCOUNT_ORIGIN,
        "Content-Type": "application/json",
        Cookie: "church_platform_session=" + a.token
      },
      body: JSON.stringify({
        operation: "request-email-change",
        currentPassword: password,
        newEmail
      })
    });
  let accepted: unknown;
  for (const newEmail of [b.user.email, unique() + "@example.test"]) {
    const callbacks: Array<() => Promise<void>> = [];
    const response = await handleAccountRequest(db, request(newEmail), (work) =>
      callbacks.push(work)
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("set-cookie"), null);
    const body = await response.json();
    if (accepted) assert.deepEqual(body, accepted);
    else accepted = body;
    assert.equal(calls.length, 0);
    assert.equal(callbacks.length, 1);
    await callbacks[0]();
  }
  assert.equal(calls.length, 1);
  assert.match(calls[0].subject, /new Godschurches sign-in email/);
  assert.match(calls[0].text, /current password/);
  const link = new URL(
    calls[0].text.split("\n").find((line) => line.startsWith("https://"))!
  );
  assert.equal(link.pathname, "/platform/account/change-email");
  assert.equal(link.search, "");
  const fragment = new URLSearchParams(link.hash.slice(1));
  assert.equal(fragment.get("purpose"), "CHANGE_EMAIL");
  assert.match(fragment.get("token")!, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(!JSON.stringify(accepted).includes(fragment.get("token")!));
});
