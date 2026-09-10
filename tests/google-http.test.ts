import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";

assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
assert.equal(new URL(process.env.DATABASE_URL!).hostname, "127.0.0.1");
assert.equal(
  new URL(process.env.DATABASE_URL!).pathname,
  "/godschurches_security_test"
);
assert.equal(process.env.ACCOUNT_GOOGLE_ENABLED, "false");
const db = new PrismaClient();
after(() => db.$disconnect());
beforeEach(() => db.platformAuthLimit.deleteMany());
const origin = process.env.ACCOUNT_ORIGIN!;

test("HTML and RSC keep request cookies private while preserving account recognition", async () => {
  const session = randomBytes(32).toString("base64url");
  const privateCookies = [
    "gc_google_browser",
    "gc_google_signup",
    "gc_google_reactivate",
    "gc_google_recent",
    "gc_google_email",
    "__Host-gc_google_browser",
    "__Host-gc_google_recent",
    "unrelated_private_cookie"
  ].map((name) => ({ name, value: randomBytes(32).toString("base64url") }));
  const suffix = randomBytes(6).toString("hex");
  const account = await db.platformUser.create({
    data: {
      name: "Fictional Cookie Privacy Member",
      username: "cookie_" + suffix,
      email: "cookie_" + suffix + "@example.test",
      sessions: {
        create: {
          tokenHash: createHash("sha256").update(session).digest("hex"),
          expiresAt: new Date(Date.now() + 600_000)
        }
      }
    }
  });
  try {
    for (const signedIn of [false, true]) {
      const cookie = [
        ...(signedIn ? ["church_platform_session=" + session] : []),
        ...privateCookies.map(({ name, value }) => `${name}=${value}`)
      ].join("; ");
      for (const path of [
        "/platform",
        "/platform/login",
        "/platform/signup",
        "/platform/account/google",
        "/platform/account/change-email",
        "/platform/settings",
        "/platform/search",
        "/platform/churches"
      ]) {
        for (const rsc of [false, true]) {
          const response = await fetch(origin + path, {
            redirect: "manual",
            headers: { Cookie: cookie, ...(rsc ? { RSC: "1" } : {}) }
          });
          const guestSettings = !signedIn && path === "/platform/settings";
          assert.ok(
            guestSettings
              ? [200, 307].includes(response.status)
              : response.status === 200,
            `${path}: unexpected page response ${response.status}`
          );
          const body = await response.text();
          if (guestSettings) {
            const redirect = response.headers.get("location");
            if (redirect) {
              const destination = new URL(redirect, origin);
              assert.equal(destination.pathname, "/platform/join");
              assert.equal(destination.searchParams.get("next"), path);
            } else assert.match(body, /NEXT_REDIRECT/);
          }
          for (const value of [session, ...privateCookies.map((c) => c.value)])
            assert.ok(
              !body.includes(value),
              `${path}: credentials stay private`
            );
          if (path === "/platform/settings" && !rsc)
            assert.equal(body.includes("Show active sign-ins"), signedIn);
          if (!signedIn) assert.ok(!body.includes(account.email));
        }
      }
    }
  } finally {
    await db.platformUser.delete({ where: { id: account.id } });
  }
});

test("actual disabled Google routes create no attempts or sessions and strip callback parameters", async () => {
  const before = {
    attempts: await db.platformGoogleAttempt.count(),
    sessions: await db.platformSession.count()
  };
  const start = await fetch(origin + "/api/platform/google", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "start", next: "/platform" })
  });
  assert.equal(start.status, 503);
  assert.match(
    start.headers.get("cache-control")!,
    /(?:^|,\s*)no-store(?:,|$)/
  );
  assert.equal(start.headers.get("set-cookie"), null);
  const callback = await fetch(
    origin +
      "/api/platform/google/callback?code=fictional-private-code&state=fictional-state",
    { redirect: "manual" }
  );
  assert.equal(callback.status, 303);
  assert.equal(
    new URL(callback.headers.get("location")!, origin).pathname,
    "/platform/login"
  );
  assert.ok(!callback.headers.get("location")!.includes("fictional"));
  assert.equal(callback.headers.get("referrer-policy"), "no-referrer");
  assert.match(
    callback.headers.get("cache-control")!,
    /(?:^|,\s*)no-store(?:,|$)/
  );
  assert.equal(callback.headers.get("set-cookie"), null);
  assert.deepEqual(
    {
      attempts: await db.platformGoogleAttempt.count(),
      sessions: await db.platformSession.count()
    },
    before
  );
});

test("actual Google endpoints reject forged origins and unsupported methods; sensitive Google confirmation stays disabled", async () => {
  assert.equal(
    (
      await fetch(origin + "/api/platform/google", {
        method: "POST",
        headers: {
          Origin: "https://evil.example",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ operation: "start" })
      })
    ).status,
    403
  );
  assert.equal((await fetch(origin + "/api/platform/google")).status, 405);
  assert.equal(
    (await fetch(origin + "/api/platform/google/callback", { method: "POST" }))
      .status,
    405
  );
  const response = await fetch(origin + "/api/platform/account", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "prepare-export",
      credentialMethod: "google"
    })
  });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.match(await response.text(), /not available yet/);
  for (const path of [
    "/platform/login",
    "/platform/signup",
    "/platform/account/google",
    "/platform/account/reactivate"
  ]) {
    const page = await fetch(origin + path);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.ok(!html.includes('aria-label="Sign in with Google"'));
    assert.ok(!html.includes('src="/images/google-sign-in-button.png"'));
  }
});
