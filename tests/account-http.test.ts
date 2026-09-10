import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  handleAccountRequest,
  SESSION_COOKIE
} from "../lib/platform/account-boundary";
import { hashSessionToken } from "../lib/platform/auth";

const db = new PrismaClient();
const origin = process.env.ACCOUNT_ORIGIN!;
assert.ok(origin.startsWith("http://127.0.0.1:"));
after(async () => db.$disconnect());
beforeEach(async () => db.platformAuthLimit.deleteMany());
const password = "Http-password-fixture-1";
async function post(
  body: Record<string, unknown>,
  cookie?: string,
  extra: Record<string, string> = {}
) {
  return fetch(`${origin}/api/platform/account`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      ...extra
    },
    body: JSON.stringify(body),
    redirect: "manual"
  });
}
async function signup(username: string) {
  return post({
    operation: "register",
    name: "Synthetic HTTP Account",
    email: `${username}@example.test`,
    username,
    password,
    confirmPassword: password,
    role: "CHURCH"
  });
}
async function login(username: string) {
  const response = await post({
    operation: "login",
    email: `${username}@example.test`,
    password
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie")!;
}

test("actual HTTP registration/login rejects origin forgery, duplicates and forged category", async () => {
  assert.equal((await signup("http_account")).status, 200);
  const before = await db.platformUser.findUniqueOrThrow({
    where: { username: "http_account" }
  });
  const duplicate = await signup("http_account");
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.headers.get("set-cookie"), null);
  assert.equal(
    (await duplicate.json()).message,
    "That public username is already taken. Choose another, or sign in if you already have an account."
  );
  assert.deepEqual(
    await db.platformUser.findUnique({ where: { id: before.id } }),
    before
  );
  assert.equal(
    (
      await post(
        { operation: "login", email: before.email, password },
        undefined,
        { Origin: "https://evil.example" }
      )
    ).status,
    403
  );
  assert.equal(
    (await post({ operation: "login" }, undefined, { Origin: "" })).status,
    403
  );
  const cookie = await login("http_account");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.equal(before.role, "CHURCH");
  assert.equal(
    (
      await post({
        operation: "register",
        username: "forged_admin",
        name: "Synthetic Forged",
        email: "forged@example.test",
        password,
        confirmPassword: password,
        role: "ADMIN"
      })
    ).status,
    400
  );
  assert.equal(
    await db.platformUser.count({ where: { username: "forged_admin" } }),
    0
  );
  const unknown = await post({
    operation: "login",
    email: "absent@example.test",
    password
  });
  const wrong = await post({
    operation: "login",
    email: before.email,
    password: "Incorrect-password"
  });
  assert.equal(unknown.status, wrong.status);
  assert.deepEqual(await unknown.json(), await wrong.json());
  assert.equal(
    (
      await post({
        operation: "login",
        email: before.email,
        password: "x".repeat(129)
      })
    ).status,
    400
  );
  assert.equal(
    (await post({ operation: "login", password: "x".repeat(9000) })).status,
    400
  );
});
test("public HTML/RSC and unauthenticated settings do not expose private account data", async () => {
  const user = await db.platformUser.findUniqueOrThrow({
    where: { username: "http_account" }
  });
  for (const path of [
    "/",
    "/platform",
    "/platform/profile/http_account",
    "/platform/search?q=Synthetic",
    "/platform/login",
    "/privacy",
    "/terms"
  ]) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.ok(!html.includes(user.email), `${path}: private email absent`);
    assert.ok(
      !html.includes(user.passwordHash!),
      `${path}: password hash absent`
    );
    assert.ok(!html.includes('"tokenHash"'), `${path}: tokenHash absent`);
    if (path === "/platform") assert.ok(html.includes("Synthetic testimony"));
    if (path.includes("search"))
      assert.ok(html.includes("Synthetic testimony"));
  }
  const response = await fetch(origin + "/platform/settings", {
    redirect: "manual"
  });
  assert.equal(response.status, 307);
  assert.match(
    response.headers.get("location")!,
    /^\/platform\/join\?next=%2Fplatform%2Fsettings&reason=settings$/
  );
  const rsc = await fetch(origin + "/platform/profile/http_account", {
    headers: { RSC: "1" }
  });
  const body = await rsc.text();
  assert.ok(!body.includes(user.email));
  assert.ok(!body.includes(user.passwordHash!));
});
test("HTTP password change invalidates cookie and all DB sessions; signed-in intro stays hidden", async () => {
  const cookie = await login("http_account");
  const user = await db.platformUser.findUniqueOrThrow({
    where: { username: "http_account" }
  });
  const feed = await fetch(origin + "/platform", {
    headers: { Cookie: cookie }
  });
  assert.ok(
    !(await feed.text()).includes("Create a test account, post updates")
  );
  const settings = await fetch(origin + "/platform/settings", {
    headers: { Cookie: cookie }
  });
  assert.equal(settings.status, 200);
  assert.ok((await settings.text()).includes("Current password"));
  assert.equal(
    (
      await post(
        {
          operation: "change-password",
          currentPassword: "Wrong-password",
          password: "Http-new-password-1",
          confirmPassword: "Http-new-password-1"
        },
        cookie
      )
    ).status,
    400
  );
  assert.ok(await db.platformSession.count({ where: { userId: user.id } }));
  const changed = await post(
    {
      operation: "change-password",
      currentPassword: password,
      password: "Http-new-password-1",
      confirmPassword: "Http-new-password-1"
    },
    cookie
  );
  assert.equal(changed.status, 200);
  assert.match(changed.headers.get("set-cookie")!, /Max-Age=0/);
  assert.equal(
    await db.platformSession.count({ where: { userId: user.id } }),
    0
  );
  const denied = await fetch(origin + "/platform/settings", {
    headers: { Cookie: cookie },
    redirect: "manual"
  });
  assert.equal(denied.status, 307);
});
test("HTTP recovery uses sink delivery, link preview is inert, purpose enforced, and reset succeeds once", async () => {
  await signup("http_recovery");
  const cookie = await login("http_recovery");
  const response = await post({
    operation: "request-reset",
    email: "http_recovery@example.test"
  });
  assert.equal(response.status, 200);
  const absent = await post({
    operation: "request-reset",
    email: "absent@example.test"
  });
  assert.deepEqual(await response.json(), await absent.json());
  const dir = process.env.ACCOUNT_TEST_SINK_DIR!;
  // Actual Next after() work starts after the request completes. Wait only for
  // this fictional recipient's sink entry, never infer delivery from HTTP 200.
  let message;
  for (let attempt = 0; attempt < 50 && !message; attempt++) {
    const messages = await Promise.all(
      (await readdir(dir)).map(async (file) => {
        try {
          return JSON.parse(await readFile(join(dir, file), "utf8"));
        } catch {
          return null;
        } // A newly created sink file may still be writing.
      })
    );
    message = messages.find((m) => m?.email === "http_recovery@example.test");
    if (!message) await delay(100);
  }
  assert.ok(message);
  const url = new URL(message.url);
  const token = new URLSearchParams(url.hash.slice(1)).get("token")!;
  const page = await fetch(url);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("referrer-policy"), "no-referrer");
  assert.match(page.headers.get("cache-control")!, /no-store/);
  assert.ok(!(await page.text()).includes(token));
  const row = await db.platformAccountGrant.findUniqueOrThrow({
    where: { tokenHash: hashSessionToken(token) }
  });
  assert.equal(row.consumedAt, null);
  assert.ok(await db.platformSession.count({ where: { userId: row.userId } }));
  assert.equal(
    (await post({ operation: "consume-verification", token })).status,
    400
  );
  const reset = await post(
    {
      operation: "consume-reset",
      token,
      password: "Http-recovered-password",
      confirmPassword: "Http-recovered-password"
    },
    cookie
  );
  assert.equal(reset.status, 200);
  assert.match(reset.headers.get("set-cookie")!, /Max-Age=0/);
  assert.equal(
    await db.platformSession.count({ where: { userId: row.userId } }),
    0
  );
  assert.equal(
    (
      await post({
        operation: "consume-reset",
        token,
        password,
        confirmPassword: password
      })
    ).status,
    400
  );
  assert.equal(
    (
      await post({
        operation: "login",
        email: "http_recovery@example.test",
        password: "Http-recovered-password"
      })
    ).status,
    200
  );
  assert.equal((await fetch(origin + "/api/platform/account")).status, 405);
  assert.equal(
    await db.waitlistEvent.count({
      where: { path: { contains: "account/recover" } }
    }),
    0
  );
});
test("actual boundary disables recovery with no sender and never returns private tokens", async () => {
  const old = process.env.ACCOUNT_DELIVERY_MODE;
  process.env.ACCOUNT_DELIVERY_MODE = "disabled";
  try {
    const response = await handleAccountRequest(
      db,
      new Request(origin + "/api/platform/account", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "request-reset",
          email: "http_recovery@example.test"
        })
      })
    );
    assert.equal(response.status, 503);
    assert.match((await response.json()).message, /not available/);
  } finally {
    process.env.ACCOUNT_DELIVERY_MODE = old;
  }
  const csrf = await fetch(origin + "/api/platform/account", {
    method: "POST",
    headers: {
      Origin: "https://evil.example",
      Cookie: `${SESSION_COOKIE}=fictional`
    },
    body: "{}"
  });
  assert.equal(csrf.status, 403);
});

test("existing logout Server Action signs out only this device and denies cross-origin submission", async () => {
  await signup("http_logout");
  const first = await login("http_logout");
  const second = await login("http_logout");
  const page = await fetch(origin + "/platform/settings", {
    headers: { Cookie: first }
  });
  const html = await page.text();
  const action = html.match(/name="(\$ACTION_ID_[^"]+)"/);
  assert.ok(action, "Logout Server Action is rendered");
  const invoke = (source: string) => {
    const form = new FormData();
    form.set(action[1], "");
    return fetch(origin + "/platform/settings", {
      method: "POST",
      redirect: "manual",
      headers: {
        Cookie: first,
        Origin: source
      },
      body: form
    });
  };
  const rejected = await invoke("https://evil.example");
  assert.notEqual(
    rejected.status,
    303,
    "No successful logout redirect for foreign origin"
  );
  assert.equal(
    (
      await fetch(origin + "/platform/settings", {
        headers: { Cookie: first },
        redirect: "manual"
      })
    ).status,
    200,
    "Foreign-origin action did not revoke the session"
  );
  const logout = await invoke(origin);
  assert.equal(logout.status, 303);
  assert.match(logout.headers.get("set-cookie")!, /church_platform_session=;/);
  assert.equal(
    (
      await fetch(origin + "/platform/settings", {
        headers: { Cookie: first },
        redirect: "manual"
      })
    ).status,
    307
  );
  assert.equal(
    (
      await fetch(origin + "/platform/settings", {
        headers: { Cookie: second }
      })
    ).status,
    200
  );
});
