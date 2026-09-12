import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
import { registerAccount, loginAccount } from "../lib/platform/accounts";

assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
const database = new URL(process.env.DATABASE_URL!);
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.pathname, "/godschurches_security_test");
const origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https?:\/\/127\.0\.0\.1:\d+$/);
const disabled = process.env.ACCOUNT_DELIVERY_MODE === "disabled";
const db = new PrismaClient();
after(() => db.$disconnect());
beforeEach(() => db.platformAuthLimit.deleteMany());
const password = "Fictional-email-http-password-1";
const unique = () => "mail_" + randomBytes(6).toString("hex");
async function owner() {
  const username = unique();
  await registerAccount(db, {
    username,
    name: "Fictional Email HTTP",
    email: username + "@example.test",
    role: "BELIEVER",
    password,
    confirmPassword: password
  });
  const user = await db.platformUser.findUniqueOrThrow({ where: { username } });
  return { user, token: await loginAccount(db, user.email, password, null) };
}
function post(
  body: Record<string, unknown>,
  token = "",
  headers: Record<string, string> = {}
) {
  return fetch(origin + "/api/platform/account", {
    method: "POST",
    redirect: "manual",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: "church_platform_session=" + token,
      ...headers
    },
    body: JSON.stringify(body)
  });
}
async function delivery(email: string) {
  for (let i = 0; i < 40; i++) {
    const files = await readdir(process.env.ACCOUNT_TEST_SINK_DIR!).catch(
      () => []
    );
    for (const file of files) {
      const value = JSON.parse(
        await readFile(join(process.env.ACCOUNT_TEST_SINK_DIR!, file), "utf8")
      );
      if (value.email === email && value.purpose === "CHANGE_EMAIL")
        return value as { email: string; purpose: string; url: string };
    }
    await delay(100);
  }
  assert.fail("The isolated email-change delivery was not written");
}

test("actual email-change HTTP rejects forged origins/owner fields and advertises unavailable delivery without changing accounts", async () => {
  const a = await owner();
  const body = {
    operation: "request-email-change",
    currentPassword: password,
    newEmail: unique() + "@example.test"
  };
  assert.equal(
    (await post(body, a.token, { Origin: "https://attacker.example.test" }))
      .status,
    403
  );
  assert.equal(
    (await post({ ...body, userId: a.user.id }, a.token)).status,
    400
  );
  const response = await post(body, a.token);
  assert.equal(response.status, disabled ? 503 : 200);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.deepEqual(
    await db.platformUser.findUnique({ where: { id: a.user.id } }),
    a.user
  );
  if (disabled) {
    assert.equal(response.headers.get("X-Account-Delivery-Disabled"), "1");
    assert.equal(
      await db.platformEmailChange.count({ where: { userId: a.user.id } }),
      0
    );
    const confirm = await post(
      {
        operation: "confirm-email-change",
        currentPassword: password,
        token: randomBytes(32).toString("base64url")
      },
      a.token
    );
    assert.equal(confirm.status, 503);
    for (const path of [
      "/platform/settings/account/email",
      "/platform/account/change-email"
    ]) {
      const html = await (
        await fetch(origin + path, {
          headers: { Cookie: "church_platform_session=" + a.token }
        })
      ).text();
      if (path === "/platform/account/change-email")
        assert.match(html, /Sign-in email changes are not available/);
      else {
        // Settings loads private capability context after hydration.
        const context = await fetch(origin + "/api/platform/settings", {
          headers: { Cookie: "church_platform_session=" + a.token }
        });
        assert.equal(context.status, 200);
        assert.equal((await context.json()).emailAvailable, false);
      }
      assert.ok(!html.includes('name="newEmail"'));
      assert.ok(!html.includes('id="confirm-email-change-password"'));
    }
  }
});

test(
  "actual development delivery link is inert on GET, binds to the requesting account and signs every session out on confirmation",
  { skip: disabled },
  async () => {
    const a = await owner();
    const b = await owner();
    const newEmail = unique() + "@example.test";
    const request = {
      operation: "request-email-change",
      currentPassword: password,
      newEmail
    };
    assert.equal((await post(request)).status, 401);
    assert.equal(
      (await post({ ...request, currentPassword: "Wrong-password-1" }, a.token))
        .status,
      400
    );
    assert.equal((await post(request, a.token)).status, 200);
    const mail = await delivery(newEmail);
    const link = new URL(mail.url);
    assert.equal(link.origin, origin);
    assert.equal(link.search, "");
    const token = new URLSearchParams(link.hash.slice(1)).get("token")!;
    const page = await fetch(link, {
      headers: { Cookie: "church_platform_session=" + a.token }
    });
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.ok(!html.includes(token));
    assert.deepEqual(
      await db.platformUser.findUnique({ where: { id: a.user.id } }),
      a.user
    );
    const confirm = {
      operation: "confirm-email-change",
      currentPassword: password,
      token
    };
    assert.equal((await post(confirm, b.token)).status, 400);
    assert.equal(
      (await post({ ...confirm, currentPassword: "Wrong-password-1" }, a.token))
        .status,
      400
    );
    const response = await post(confirm, a.token);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("set-cookie")!, /Max-Age=0/);
    assert.equal(
      (await response.json()).redirect,
      "/platform/login?notice=email-changed"
    );
    assert.equal(
      (await db.platformUser.findUniqueOrThrow({ where: { id: a.user.id } }))
        .email,
      newEmail
    );
    assert.equal(
      (await post({ operation: "login", email: a.user.email, password }))
        .status,
      400
    );
    assert.equal(
      (await post({ operation: "login", email: newEmail, password })).status,
      200
    );
    assert.equal((await post(confirm, a.token)).status, 401);
    assert.equal(
      await db.platformSession.count({ where: { userId: b.user.id } }),
      1
    );
  }
);

test(
  "actual email requests conceal recipient availability and bound repeated sends",
  { skip: disabled },
  async () => {
    const a = await owner();
    const b = await owner();
    let accepted: unknown;
    for (const newEmail of [
      b.user.email,
      a.user.email,
      unique() + "@example.test"
    ]) {
      const response = await post(
        {
          operation: "request-email-change",
          currentPassword: password,
          newEmail
        },
        a.token
      );
      assert.equal(response.status, 200);
      const body = await response.json();
      if (accepted) assert.deepEqual(body, accepted);
      else accepted = body;
    }
    const limited = await post(
      {
        operation: "request-email-change",
        currentPassword: password,
        newEmail: unique() + "@example.test"
      },
      a.token
    );
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "900");
    assert.deepEqual(
      await db.platformUser.findUnique({ where: { id: a.user.id } }),
      a.user
    );
  }
);
