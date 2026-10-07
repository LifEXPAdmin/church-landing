import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { request as httpsRequest } from "node:https";
import { resolve } from "node:path";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";

const fixture = resolve(process.argv[2]);
const config = JSON.parse(readFileSync(fixture + "/browser-env.json", "utf8"));
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
assert.equal(new URL(config.database).pathname, "/godschurches_security_test");
assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase, createPortalActor } =
  await import("../tests/seed-portal.ts");
const { changeAccountPassword, loginAccount } =
  await import("../lib/platform/accounts.ts");
const { createSessionToken, hashSessionToken } =
  await import("../lib/platform/auth.ts");
const { googleCookieName } = await import("../lib/platform/google-cookies.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ??
    `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`
)("playwright");
const pub = execFileSync("openssl", [
  "x509",
  "-in",
  config.certificate,
  "-pubkey",
  "-noout"
]);
const der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], {
  input: pub
});
const browser = await chromium.launch({
  headless: false,
  executablePath:
    process.env.CHROMIUM_PATH ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: [
    "--ignore-certificate-errors-spki-list=" +
      createHash("sha256").update(der).digest("base64")
  ]
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
const evidence = {
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8"
  }).trim(),
  build: readFileSync(".next/BUILD_ID", "utf8").trim(),
  results: [],
  errors: [],
  external: [],
  trustedEvents: []
};
context.on("page", (p) =>
  p.on("pageerror", () =>
    evidence.errors.push("Browser page error; private values omitted")
  )
);
page.on("pageerror", () =>
  evidence.errors.push("Browser page error; private values omitted")
);
await context.route("**/*", (route) => {
  const u = new URL(route.request().url());
  if (u.origin === config.origin) return route.continue();
  evidence.external.push(u.origin + u.pathname);
  return route.abort();
});
let commands = 0;
page.on("request", (request) => {
  if (
    request.method() === "POST" &&
    new URL(request.url()).pathname === "/api/platform/account" &&
    request.postDataJSON()?.operation === "deactivate-account"
  )
    commands++;
});
const path = "/platform/settings/data/deactivate";
const field = page.locator("#deactivate-password"),
  ack = page.locator('input[name="confirmed"]');
const submit = page.getByRole("button", {
  name: "Deactivate account",
  exact: true
});
const ok = (result) => {
  evidence.results.push(result);
  console.log("PASS " + result);
};
async function bounded(promise, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error(label)), 20000);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function waitFor(check) {
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    if (await check()) return;
    await page.waitForTimeout(50);
  }
  assert.fail("Expected browser state did not settle");
}
async function pair(label) {
  const a = await createPortalActor(db, label + "a"),
    b = await createPortalActor(db, label + "b");
  await changeAccountPassword(
    db,
    b.token,
    b.password,
    a.password,
    a.password,
    b.id
  );
  b.password = a.password;
  b.token = await loginAccount(
    db,
    b.email,
    b.password,
    "Fictional replacement login"
  );
  await db.platformAuthLimit.deleteMany();
  return { a, b };
}
async function cookieOwner(actor) {
  await context.clearCookies();
  if (actor)
    await context.addCookies([
      {
        name: sessionCookieFixtureName(config.origin),
        value: actor.token,
        url: config.origin,
        secure: true,
        httpOnly: true,
        sameSite: "Lax"
      }
    ]);
}
async function active(actor) {
  return !(
    await db.platformUser.findUniqueOrThrow({
      where: { id: actor.id },
      select: { deactivatedAt: true }
    })
  ).deactivatedAt;
}
async function open(actor) {
  await page.goto("about:blank");
  await cookieOwner(actor);
  assert.equal((await page.goto(config.origin + path)).status(), 200);
  await page.bringToFront();
  await field.fill(actor.password);
  await ack.check();
}
async function restored(actor) {
  await field.waitFor({ state: "visible" });
  assert.equal(await field.inputValue(), actor.password);
  assert.equal(await ack.isChecked(), true);
}
async function concealed() {
  await waitFor(
    async () => (await field.count()) === 0 && (await ack.count()) === 0
  );
}
async function recheck() {
  const original = page.getByRole("button", {
    name: "Recheck original settings access",
    exact: true
  });
  if (await original.isVisible()) await original.click();
  else
    await page
      .getByRole("button", { name: "Recheck current account", exact: true })
      .click();
}
async function forward(route) {
  const request = route.request(),
    url = new URL(request.url());
  assert.equal(url.origin, config.origin);
  const headers = { ...(await request.allHeaders()) };
  delete headers["accept-encoding"];
  return new Promise((yes, no) => {
    const out = httpsRequest(
      url,
      {
        method: request.method(),
        headers,
        ca: readFileSync(config.certificate),
        agent: false,
        timeout: 20000
      },
      (incoming) => {
        const chunks = [];
        incoming.on("data", (chunk) => chunks.push(chunk));
        incoming.once("error", no);
        incoming.once("end", () =>
          yes({
            status: incoming.statusCode,
            body: Buffer.concat(chunks),
            headers: Object.fromEntries(
              Object.entries(incoming.headers)
                .filter(
                  ([name]) =>
                    ![
                      "connection",
                      "transfer-encoding",
                      "content-length"
                    ].includes(name)
                )
                .map(([name, value]) => [
                  name,
                  Array.isArray(value)
                    ? value.join(name === "set-cookie" ? "\n" : ", ")
                    : String(value)
                ])
            )
          })
        );
      }
    );
    out.once("error", no);
    out.once("timeout", () => out.destroy(Error("Fixture response timeout")));
    out.end(request.postDataBuffer() ?? undefined);
  });
}
async function refresh() {
  const done = Promise.withResolvers();
  const match = (url) => url.pathname === path;
  const handler = async (route) => {
    if (route.request().headers().rsc !== "1") return route.fallback();
    try {
      const response = await forward(route);
      assert.equal(response.status, 200);
      await route.fulfill(response);
      done.resolve();
    } catch (error) {
      done.reject(error);
      await route.abort().catch(() => {});
    }
  };
  await page.route(match, handler);
  try {
    await page.evaluate(() => {
      if (!window.next?.router?.refresh)
        throw Error("Actual Next router unavailable");
      window.next.router.refresh();
    });
    await bounded(done.promise, "Actual RSC refresh did not settle");
    await page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done))
        )
    );
  } finally {
    await page.unroute(match, handler);
  }
}
async function nativeOtherWindow() {
  const browserCdp = await browser.newBrowserCDPSession(),
    pageCdp = await context.newCDPSession(page);
  await pageCdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  await page.bringToFront();
  await page.waitForFunction(() => document.hasFocus());
  await page.evaluate(() => {
    window.deactivationFocus = [];
    for (const event of ["blur", "focus"])
      window.addEventListener(event, (e) =>
        window.deactivationFocus.push({
          type: e.type,
          trusted: e.isTrusted,
          focused: document.hasFocus()
        })
      );
  });
  const { targetInfo } = await pageCdp.send("Target.getTargetInfo");
  const created = context.waitForEvent("page");
  await browserCdp.send("Target.createTarget", {
    url: "about:blank",
    browserContextId: targetInfo.browserContextId,
    newWindow: true,
    background: false
  });
  const other = await created,
    otherCdp = await context.newCDPSession(other);
  await otherCdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  await other.bringToFront();
  await page.waitForFunction(() => !document.hasFocus());
  assert.equal(await other.evaluate(() => document.hasFocus()), true);
  return other;
}
let other;
try {
  const first = await pair("deactowner");
  for (const expected of [undefined, "", first.a.id]) {
    const response = await fetch(config.origin + "/api/platform/account", {
      method: "POST",
      headers: {
        Origin: config.origin,
        "Content-Type": "application/json",
        Cookie: sessionCookieFixtureName(config.origin) + "=" + first.b.token,
        ...(expected === undefined ? {} : { "X-Expected-Account": expected })
      },
      body: JSON.stringify({
        operation: "deactivate-account",
        currentPassword: first.a.password,
        confirmed: true
      })
    });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(await active(first.a), true);
    assert.equal(await active(first.b), true);
  }
  ok(
    "Actual HTTPS rejects missing, empty and stale original owners without changing either account"
  );
  await open(first.a);
  let before = commands;
  await cookieOwner(first.b);
  await submit.click();
  await concealed();
  assert.equal(commands, before);
  assert.equal(await active(first.b), true);
  await cookieOwner(first.a);
  await recheck();
  await restored(first.a);
  ok(
    "A stale form cannot submit as B and recovers A's exact password and acknowledgment"
  );
  for (const replacement of [first.b, null]) {
    await cookieOwner(replacement);
    await refresh();
    await concealed();
    assert.equal(new URL(page.url()).pathname, path);
    await cookieOwner(first.a);
    await recheck();
    await restored(first.a);
    assert.equal(commands, before);
  }
  ok(
    "Genuine focused B and guest RSC refreshes retain A's unsaved form for A's return"
  );

  other = await nativeOtherWindow();
  await concealed();
  const captured = Promise.withResolvers(),
    release = Promise.withResolvers();
  let hold = true;
  const identity = (url) =>
    url.pathname === "/api/platform/profile" &&
    url.searchParams.get("view") === "identity";
  const delayed = async (route) => {
    if (!hold) return route.fallback();
    hold = false;
    const response = await forward(route);
    captured.resolve();
    await release.promise;
    await route.fulfill(response);
  };
  await page.route(identity, delayed);
  await page.bringToFront();
  await bounded(captured.promise, "Fresh identity was not requested");
  await other.bringToFront();
  await page.waitForFunction(() => !document.hasFocus());
  release.resolve();
  await concealed();
  await page.waitForTimeout(100);
  assert.equal(await field.count(), 0);
  await page.unroute(identity, delayed);
  await page.bringToFront();
  await restored(first.a);
  const events = await page.evaluate(() => window.deactivationFocus);
  assert.ok(events.some((e) => e.type === "blur" && e.trusted && !e.focused));
  assert.ok(events.some((e) => e.type === "focus" && e.trusted && e.focused));
  evidence.trustedEvents.push(...events);
  await other.close();
  other = null;
  ok(
    "Trusted native blur suppresses a delayed identity result and fresh focus restores the exact draft"
  );
  await page.setViewportSize({ width: 320, height: 720 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    true
  );
  await page.screenshot({
    path: fixture + "/deactivation-owner-small.png",
    fullPage: true
  });
  await page.setViewportSize({ width: 390, height: 844 });
  ok("Retained deactivation controls fit the small-screen layout");

  const late = await pair("deactlate");
  await open(late.a);
  before = commands;
  const committed = Promise.withResolvers(),
    delivery = Promise.withResolvers();
  const account = config.origin + "/api/platform/account";
  const heldResponse = async (route) => {
    if (
      route.request().method() !== "POST" ||
      route.request().postDataJSON()?.operation !== "deactivate-account"
    )
      return route.fallback();
    const response = await forward(route);
    assert.equal(response.status, 200);
    assert.equal(response.headers["set-cookie"], undefined);
    committed.resolve();
    await delivery.promise;
    await route.fulfill(response);
  };
  await page.route(account, heldResponse);
  await submit.click();
  await bounded(committed.promise, "Actual deactivation did not commit");
  assert.equal(await active(late.a), false);
  await cookieOwner(late.b);
  delivery.resolve();
  await concealed();
  await waitFor(async () =>
    (await page.locator("[data-credential-concealed]").textContent()).includes(
      "confirmed"
    )
  );
  assert.equal(new URL(page.url()).pathname, path);
  assert.equal(
    (await context.cookies(config.origin)).find(
      (c) => c.name === sessionCookieFixtureName(config.origin)
    )?.value,
    late.b.token
  );
  const identityB = await page.evaluate(
    async () =>
      (
        await (
          await fetch("/api/platform/profile?view=identity", {
            cache: "no-store"
          })
        ).json()
      ).id
  );
  assert.equal(identityB, late.b.id);
  assert.equal(await active(late.b), true);
  assert.equal(commands, before + 1);
  await page.unroute(account, heldResponse);
  ok(
    "A committed delayed A response preserves B's cookie and identity without redirect or duplicate command"
  );

  const lost = await pair("deactlost");
  await open(lost.a);
  before = commands;
  const lostReply = async (route) => {
    if (
      route.request().method() !== "POST" ||
      route.request().postDataJSON()?.operation !== "deactivate-account"
    )
      return route.fallback();
    const response = await forward(route);
    assert.equal(response.status, 200);
    await route.abort("failed");
  };
  await page.route(account, lostReply);
  await submit.click();
  await waitFor(async () => !(await active(lost.a)));
  await concealed();
  await refresh();
  await concealed();
  assert.equal(new URL(page.url()).pathname, path);
  await recheck();
  await concealed();
  assert.equal(commands, before + 1);
  await page.unroute(account, lostReply);
  ok(
    "A lost committed response survives guest RSC and rechecks without automatically repeating deactivation"
  );

  const normal = await pair("deactgood");
  await open(normal.a);
  before = commands;
  await submit.click();
  await page.waitForURL("**/platform/account/reactivate?notice=deactivated");
  assert.equal(await active(normal.a), false);
  assert.equal(await active(normal.b), true);
  assert.equal(commands, before + 1);
  ok("Normal confirmed deactivation still completes and opens reactivation");
  if (process.env.ACCOUNT_GOOGLE_ENABLED === "true") {
    async function googleActor(label) {
      const a = await createPortalActor(db, label);
      a.identity = await db.platformGoogleIdentity.create({
        data: {
          userId: a.id,
          issuer: "https://accounts.google.com",
          subject: createSessionToken()
        }
      });
      await db.platformUser.update({
        where: { id: a.id },
        data: { passwordHash: null }
      });
      return a;
    }
    async function googlePage(a, recent) {
      await page.goto("about:blank");
      await cookieOwner(a);
      if (recent)
        await context.addCookies([
          {
            name: googleCookieName("recent", true),
            value: recent,
            url: config.origin,
            secure: true,
            httpOnly: true,
            sameSite: "Lax"
          }
        ]);
      assert.equal((await page.goto(config.origin + path)).status(), 200);
      await page.bringToFront();
      await ack.waitFor();
    }
    const original = await googleActor("deactgoog");
    await googlePage(original);
    const googleStarted = Promise.withResolvers(),
      releaseGoogle = Promise.withResolvers();
    const googleUrl = config.origin + "/api/platform/google";
    const delayedGoogle = async (route) => {
      if (route.request().postDataJSON()?.operation !== "reauthenticate")
        return route.fallback();
      assert.equal(
        route.request().headers()["x-expected-account"],
        original.id
      );
      const response = await forward(route);
      assert.equal(response.status, 200);
      googleStarted.resolve();
      await releaseGoogle.promise;
      await route.fulfill(response);
    };
    await page.route(googleUrl, delayedGoogle);
    before = commands;
    await page
      .getByRole("button", {
        name: "Sign in with Google to confirm deactivating your account",
        exact: true
      })
      .click();
    await bounded(
      googleStarted.promise,
      "Actual Google confirmation start did not complete"
    );
    await cookieOwner(normal.b);
    releaseGoogle.resolve();
    await waitFor(async () => (await ack.count()) === 0);
    assert.equal(new URL(page.url()).pathname, path);
    assert.equal(await active(original), true);
    assert.equal(await active(normal.b), true);
    assert.equal(commands, before);
    const attempt = await db.platformGoogleAttempt.findFirstOrThrow({
      where: { linkUserId: original.id },
      orderBy: { createdAt: "desc" }
    });
    assert.equal(attempt.reauthPurpose, "deactivate-account");
    await page.unroute(googleUrl, delayedGoogle);
    ok(
      "Actual Google confirmation start carries the original owner and a delayed redirect is suppressed after B signs in"
    );

    const confirmedGoogle = await googleActor("deactproof");
    const session = await db.platformSession.findUniqueOrThrow({
      where: { tokenHash: hashSessionToken(confirmedGoogle.token) }
    });
    const recent = createSessionToken();
    await db.platformRecentAuthentication.create({
      data: {
        userId: confirmedGoogle.id,
        sessionId: session.id,
        googleIdentityId: confirmedGoogle.identity.id,
        credentialVersion: session.credentialVersion,
        purpose: "deactivate-account",
        tokenHash: hashSessionToken(recent),
        expiresAt: new Date(Date.now() + 300000)
      }
    });
    // Trusted test verifier seam only. No actual Google provider exchange is claimed.
    await googlePage(confirmedGoogle, recent);
    await page
      .getByText(
        "Google confirmation received for this action. Continue below.",
        { exact: true }
      )
      .waitFor();
    assert.equal(await field.count(), 0);
    await ack.check();
    before = commands;
    const googleDeactivation = page.waitForRequest(
      (r) => r.method() === "POST" && r.url() === account
    );
    await submit.click();
    const submitted = await googleDeactivation;
    assert.equal(submitted.headers()["x-expected-account"], confirmedGoogle.id);
    assert.deepEqual(submitted.postDataJSON(), {
      operation: "deactivate-account",
      confirmed: true,
      credentialMethod: "google"
    });
    await page.waitForURL("**/platform/account/reactivate?notice=deactivated");
    assert.equal(await active(confirmedGoogle), false);
    assert.equal(
      await db.platformRecentAuthentication.count({
        where: { tokenHash: hashSessionToken(recent) }
      }),
      0
    );
    assert.equal(commands, before + 1);
    ok(
      "Google-only deactivation uses the HttpOnly purpose proof once and still requires explicit acknowledgment"
    );
  }
  assert.deepEqual(evidence.errors, []);
  assert.deepEqual(evidence.external, []);
} finally {
  writeFileSync(
    fixture + "/deactivation-owner-browser.json",
    JSON.stringify(evidence, null, 2),
    { flag: "wx", mode: 0o600 }
  );
  if (other) await other.close();
  await browser.close();
  await db.$disconnect();
}
