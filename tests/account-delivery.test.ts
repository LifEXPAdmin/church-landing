import test, { after, beforeEach, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { accountConfig } from "../lib/platform/account-config";
import { accountGrantDelivery } from "../lib/platform/account-delivery";
import { handleAccountRequest } from "../lib/platform/account-boundary";
import {
  requestAccountGrant,
  consumeAccountGrant
} from "../lib/platform/accounts";
import { createSessionToken, hashSessionToken } from "../lib/platform/auth";

assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
const database = new URL(process.env.DATABASE_URL!);
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.pathname, "/godschurches_security_test");
const db = new PrismaClient();
after(async () => db.$disconnect());
beforeEach(async () => db.platformAuthLimit.deleteMany());
const senderEnv = {
  ...process.env,
  VERCEL: "1",
  VERCEL_ENV: "production",
  ACCOUNT_ORIGIN: "https://godschurches.example.test",
  ACCOUNT_DELIVERY_MODE: "resend",
  ACCOUNT_EMAIL_FROM: "accounts@mail.godschurches.example.test",
  RESEND_API_KEY: "re_synthetic_never_a_real_key"
};
const config = accountConfig(senderEnv);
async function fixture() {
  const username = randomUUID().replaceAll("-", "").slice(0, 20);
  return db.platformUser.create({
    data: {
      name: "Delivery Fixture",
      username,
      email: `${username}@example.test`
    }
  });
}
function useSender(t: TestContext) {
  for (const key of [
    "VERCEL",
    "VERCEL_ENV",
    "ACCOUNT_ORIGIN",
    "ACCOUNT_DELIVERY_MODE",
    "ACCOUNT_EMAIL_FROM",
    "RESEND_API_KEY"
  ] as const) {
    const previous = process.env[key];
    process.env[key] = senderEnv[key];
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
}
function request(email: string, origin = config.origin) {
  return new Request(`${config.origin}/api/platform/account`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "request-reset", email })
  });
}

test("real delivery requires explicit mode, HTTPS, production scope and a same-site sender", () => {
  assert.equal(
    accountConfig({
      ...senderEnv,
      ACCOUNT_DELIVERY_MODE: "disabled",
      RESEND_API_KEY: ""
    }).delivery,
    "disabled"
  );
  for (const invalid of [
    { RESEND_API_KEY: "" },
    { RESEND_API_KEY: "re_key\ninjected" },
    { ACCOUNT_EMAIL_FROM: "" },
    { ACCOUNT_EMAIL_FROM: "accounts@unrelated.test" },
    { ACCOUNT_EMAIL_FROM: "accounts@godschurches.example.test.attacker.test" },
    { ACCOUNT_EMAIL_FROM: "Name <accounts@godschurches.example.test>" },
    { ACCOUNT_ORIGIN: "http://godschurches.example.test" },
    { ACCOUNT_ORIGIN: "https://127.0.0.1" },
    { VERCEL_ENV: "preview" },
    { VERCEL_ENV: "development" }
  ])
    assert.throws(() => accountConfig({ ...senderEnv, ...invalid }));
});

test("provider payload delivers only the requested purpose and fragment link; transient retry is idempotent", async () => {
  const token = createSessionToken();
  const calls: RequestInit[] = [];
  const send: typeof fetch = async (url, init) => {
    assert.equal(url, "https://api.resend.com/emails");
    calls.push(init!);
    return calls.length === 1
      ? new Response("Unavailable", { status: 503 })
      : Response.json({ id: "synthetic-provider-id" });
  };
  await accountGrantDelivery(config, send)(
    "owner@example.test",
    "RESET_PASSWORD",
    token
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body, calls[1].body);
  const headers = new Headers(calls[0].headers);
  assert.equal(
    headers.get("Idempotency-Key"),
    new Headers(calls[1].headers).get("Idempotency-Key")
  );
  assert.ok(!headers.get("Idempotency-Key")!.includes(token));
  assert.equal(
    headers.get("Authorization"),
    `Bearer ${senderEnv.RESEND_API_KEY}`
  );
  assert.equal(calls[0].redirect, "error");
  assert.equal(calls[0].cache, "no-store");
  assert.ok(calls[0].signal instanceof AbortSignal);
  const body = JSON.parse(String(calls[0].body));
  assert.deepEqual(body.to, ["owner@example.test"]);
  assert.equal(body.from, `Godschurches <${senderEnv.ACCOUNT_EMAIL_FROM}>`);
  assert.match(body.html, /<a href="https:\/\/[^\"]+#token=[A-Za-z0-9_-]{43}"/);
  assert.match(body.html, />Reset password<\/a>/);
  assert.ok(!body.html.includes("<img"));
  assert.match(body.subject, /Reset/);
  const link = new URL(
    body.text.split("\n").find((line: string) => line.startsWith("https://"))
  );
  assert.equal(link.origin, config.origin);
  assert.equal(link.pathname, "/platform/account/recover");
  assert.equal(link.search, "");
  assert.equal(new URLSearchParams(link.hash.slice(1)).get("token"), token);
  assert.equal(new URLSearchParams(link.hash.slice(1)).get("purpose"), null);
  assert.match(body.text, /30 minutes/);
  assert.ok(!JSON.stringify(body).includes(senderEnv.RESEND_API_KEY));
  await accountGrantDelivery(config, async (_url, init) => {
    const verification = JSON.parse(String(init!.body));
    assert.match(verification.subject, /Verify/);
    assert.match(verification.text, /\/platform\/account\/verify#token=/);
    assert.match(verification.html, />Verify email<\/a>/);
    assert.ok(!verification.text.includes("purpose="));
    assert.match(verification.text, /does not change your password/);
    return Response.json({ id: "synthetic-verification-id" });
  })("owner@example.test", "VERIFY_EMAIL", createSessionToken());
});

test("permanent provider errors are not retried and network or malformed responses stop after two attempts", async () => {
  for (const kind of ["forbidden", "network", "malformed", "throttled"]) {
    let calls = 0;
    const send: typeof fetch = async () => {
      calls++;
      if (kind === "network") throw new Error("private-recipient-and-link");
      if (kind === "malformed") return Response.json({});
      return new Response("private-recipient-and-link", {
        status: kind === "forbidden" ? 403 : 429
      });
    };
    await assert.rejects(
      accountGrantDelivery(config, send)(
        "owner@example.test",
        "RESET_PASSWORD",
        createSessionToken()
      ),
      { message: "Account delivery failed" }
    );
    assert.equal(calls, kind === "forbidden" ? 1 : 2);
  }
});

test("HTTP boundary responds before account lookup or slow provider work, with identical known/unknown/limited results", async (t) => {
  useSender(t);
  const user = await fixture();
  let providerCalls = 0;
  const callbacks: Array<() => Promise<void>> = [];
  const providerTokens: string[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      providerCalls++;
      const body = JSON.parse(String(init.body));
      const link = new URL(
        body.text
          .split("\n")
          .find((line: string) => line.startsWith("https://"))
      );
      providerTokens.push(
        new URLSearchParams(link.hash.slice(1)).get("token")!
      );
      return Response.json({ id: "synthetic-accepted" });
    }
  );
  const results: unknown[] = [];
  for (const email of [
    user.email,
    "absent@example.test",
    user.email,
    user.email,
    user.email
  ]) {
    const response = await handleAccountRequest(db, request(email), (work) =>
      callbacks.push(work)
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    results.push(await response.json());
  }
  assert.ok(
    results.every((body) => JSON.stringify(body) === JSON.stringify(results[0]))
  );
  assert.equal(callbacks.length, 4); // Only three eligible requests for the same subject.
  assert.equal(providerCalls, 0);
  assert.equal(
    await db.platformAccountGrant.count({ where: { userId: user.id } }),
    0
  );
  const rejected: Array<() => Promise<void>> = [];
  assert.equal(
    (
      await handleAccountRequest(
        db,
        request(user.email, "https://attacker.test"),
        (work) => rejected.push(work)
      )
    ).status,
    403
  );
  assert.equal(rejected.length, 0);
  for (const callback of callbacks) await callback();
  assert.equal(providerCalls, 3);
  const grants = await db.platformAccountGrant.findMany({
    where: { userId: user.id }
  });
  assert.equal(grants.length, 3);
  assert.ok(
    providerTokens.every((token) =>
      grants.some((grant) => grant.tokenHash === hashSessionToken(token))
    )
  );
  assert.ok(!JSON.stringify(grants).includes(providerTokens[0]));
});

test("failed delivery removes the new grant, preserves other grants, and logs only a safe request reference", async (t) => {
  useSender(t);
  const user = await fixture();
  let priorToken = "";
  await requestAccountGrant(
    db,
    user.email,
    "RESET_PASSWORD",
    async (_email, _purpose, token) => {
      priorToken = token;
    }
  );
  const callbacks: Array<() => Promise<void>> = [];
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("private provider detail", { status: 403 })
  );
  const logs: string[] = [];
  t.mock.method(console, "error", (value: string) => logs.push(value));
  const response = await handleAccountRequest(db, request(user.email), (work) =>
    callbacks.push(work)
  );
  assert.equal(response.status, 200);
  await callbacks[0]();
  const grants = await db.platformAccountGrant.findMany({
    where: { userId: user.id }
  });
  assert.equal(grants.length, 1);
  assert.equal(grants[0].tokenHash, hashSessionToken(priorToken));
  assert.deepEqual(
    logs.map((entry) => JSON.parse(entry)),
    [
      {
        event: "account_delivery_failed",
        requestId: response.headers.get("X-Account-Request-Id")
      }
    ]
  );
  assert.ok(!JSON.stringify(logs).includes(user.email));
});

test("suspended accounts neither receive grants nor consume grants issued before suspension", async () => {
  const user = await fixture();
  const tokens: string[] = [];
  for (const purpose of ["RESET_PASSWORD", "VERIFY_EMAIL"] as const)
    await requestAccountGrant(
      db,
      user.email,
      purpose,
      async (_email, _purpose, token) => {
        tokens.push(token);
      }
    );
  await db.platformUser.update({
    where: { id: user.id },
    data: { suspendedAt: new Date() }
  });
  let sent = false;
  for (const [index, purpose] of (
    ["RESET_PASSWORD", "VERIFY_EMAIL"] as const
  ).entries()) {
    await requestAccountGrant(db, user.email, purpose, async () => {
      sent = true;
    });
    await assert.rejects(
      consumeAccountGrant(
        db,
        tokens[index],
        purpose,
        "Fixture-new-password",
        "Fixture-new-password"
      )
    );
  }
  assert.equal(sent, false);
  const unchanged = await db.platformUser.findUniqueOrThrow({
    where: { id: user.id }
  });
  assert.equal(unchanged.passwordHash, null);
  assert.equal(unchanged.emailVerifiedAt, null);
  assert.equal(
    await db.platformAccountGrant.count({
      where: { userId: user.id, consumedAt: null }
    }),
    2
  );
});
