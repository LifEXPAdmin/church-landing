import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";
const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the isolated credential preview directory");
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(config.origin, /^https:\/\/mfa-fixture\.example\.test:\d+$/);
assert.match(config.localOrigin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.localOrigin,
  NEXT_PUBLIC_SITE_URL: config.localOrigin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: fixtureDir + "/sink",
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: "",
  PRIVILEGED_MFA_MODE: "off"
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase, createPortalActor } =
  await import("../tests/seed-portal.ts");
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
      createHash("sha256").update(der).digest("base64"),
    "--host-resolver-rules=MAP mfa-fixture.example.test 127.0.0.1",
    "--no-proxy-server"
  ]
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }
});
await context.route("**/*", async (route) => {
  try {
    if (new URL(route.request().url()).hostname === "mfa-fixture.example.test")
      await route.continue();
    else await route.abort();
  } catch (error) {
    // A navigation may cancel a prefetch before its continuation settles.
    if (
      !/Route is already handled/.test(String(error)) ||
      !route.request().failure()
    )
      throw error;
  }
});
const page = await context.newPage();
const results = [],
  errors = [];
const outbound = [];
context.on("request", (request) =>
  outbound.push({ url: request.url(), body: request.postData() ?? "" })
);
context.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
page.on("pageerror", (e) => errors.push(e.message));
const output = fixtureDir + "/credential-privacy-browser";
mkdirSync(output, { recursive: true });
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const signIn = async (actor) => {
  await context.clearCookies();
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
};
const go = async (path, p = page) => {
  const response = await p.goto(config.origin + path);
  assert.equal(response.status(), 200);
};
const fetchIn = (path, body, owner, p = page) =>
  p.evaluate(
    async ({ path, body, owner }) => {
      const response = await fetch(path, {
        method: body ? "POST" : "GET",
        cache: "no-store",
        headers: {
          ...(body ? { "content-type": "application/json" } : {}),
          ...(owner ? { "x-expected-account": owner } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      return { status: response.status, body: await response.json() };
    },
    { path, body, owner }
  );

const { requestEmailChange } =
  await import("../lib/platform/account-email-change.ts");
const pulse = (event) =>
  page.evaluate((event) => window.dispatchEvent(new Event(event)), event);
const refocusNatively = async () => {
  const browserCdp = await browser.newBrowserCDPSession();
  const pageCdp = await context.newCDPSession(page);
  await pageCdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  await page.bringToFront();
  await page.waitForFunction(() => document.hasFocus());
  await page.evaluate(() => {
    window.credentialFocusEvents = [];
    for (const event of ["blur", "focus"])
      window.addEventListener(event, (e) =>
        window.credentialFocusEvents.push({
          type: e.type,
          trusted: e.isTrusted
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
  const other = await created;
  try {
    const otherCdp = await context.newCDPSession(other);
    await otherCdp.send("Emulation.setFocusEmulationEnabled", {
      enabled: false
    });
    await other.bringToFront();
    await page.waitForFunction(() => !document.hasFocus());
    await page.bringToFront();
    await page.waitForFunction(() => document.hasFocus());
    const events = await page.evaluate(() => window.credentialFocusEvents);
    for (const type of ["blur", "focus"])
      assert.ok(events.some((event) => event.type === type && event.trusted));
  } finally {
    await other.close();
    await pageCdp.detach();
    await browserCdp.detach();
  }
};
const waitFor = async (predicate) => {
  for (let n = 0; n < 100; n++) {
    if (await predicate()) return;
    await page.waitForTimeout(50);
  }
  assert.fail("Expected condition did not arrive");
};
const surface = async (operation, actor) => {
  await signIn(actor);
  await db.platformAuthLimit.deleteMany();
  let token;
  const newEmail = "credential-" + randomUUID() + "@example.test";
  if (operation === "confirm-email-change") {
    const work = await requestEmailChange(
      db,
      actor.token,
      actor.password,
      newEmail,
      async (_e, _p, t) => {
        token = t;
      }
    );
    await work();
  }
  await go(
    operation === "change-password"
      ? "/platform/settings/security/password"
      : operation === "request-email-change"
        ? "/platform/settings/account/email"
        : "/platform/account/change-email#token=" +
          token +
          "&purpose=CHANGE_EMAIL"
  );
  const fields =
    operation === "change-password"
      ? [
          ["#account-change-password-current-password", actor.password],
          ["#account-change-password-password", "Fictional-credential-new-1"],
          [
            "#account-change-password-confirmation",
            "Fictional-credential-new-1"
          ]
        ]
      : operation === "request-email-change"
        ? [
            ["#new-sign-in-email", newEmail],
            ["#request-email-change-password", actor.password]
          ]
        : [["#confirm-email-change-password", actor.password]];
  for (const [selector, value] of fields)
    await page.locator(selector).fill(value);
  if (token) assert.equal(new URL(page.url()).hash, "");
  return {
    fields,
    newEmail,
    token,
    button:
      operation === "change-password"
        ? "Change password"
        : operation === "request-email-change"
          ? "Send email-change confirmation"
          : "Confirm sign-in email change"
  };
};
const concealed = async (fields) =>
  waitFor(async () =>
    (
      await Promise.all(
        fields.map(async ([selector]) => await page.locator(selector).count())
      )
    ).every((n) => n === 0)
  );
const restored = async (fields) => {
  for (const [selector, value] of fields) {
    await page.locator(selector).waitFor();
    assert.equal(await page.locator(selector).inputValue(), value);
  }
};
// Forward only to the verified loopback TLS fixture, retaining its real Origin
// and cookie. Held responses let the browser replace its login before arrival.
const forward = async (route) => {
  const { request } = await import("node:https");
  const incoming = route.request();
  const headers = await incoming.allHeaders();
  return new Promise((resolve, reject) => {
    const req = request(
      config.localOrigin + "/api/platform/account",
      {
        method: "POST",
        ca: readFileSync(config.certificate),
        headers: {
          "content-type": "application/json",
          host: new URL(config.origin).host,
          origin: config.origin,
          cookie: headers.cookie ?? "",
          "x-expected-account": headers["x-expected-account"] ?? ""
        }
      },
      (res) => {
        let body = "";
        res.on("data", (x) => (body += x));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: Object.fromEntries(
              Object.entries(res.headers)
                .filter(
                  ([name]) =>
                    ![
                      "connection",
                      "transfer-encoding",
                      "content-length"
                    ].includes(name)
                )
                .map(([k, v]) => [
                  k,
                  Array.isArray(v) ? v.join("\n") : String(v)
                ])
            ),
            body
          })
        );
      }
    );
    req.on("error", reject);
    req.end(incoming.postData());
  });
};
const operations = [
  "change-password",
  "request-email-change",
  "confirm-email-change"
];
try {
  const actor = await createPortalActor(db, "credprivacy"),
    other = await createPortalActor(db, "credother");
  for (const operation of operations) {
    const { fields } = await surface(operation, actor);
    for (const [hide, resume] of [
      ["blur", "focus"],
      ["offline", "online"],
      ["pagehide", "pageshow"]
    ]) {
      await pulse(hide);
      await concealed(fields);
      await pulse(resume);
      await restored(fields);
    }
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden"
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await concealed(fields);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible"
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await restored(fields);
    const fail = (route) => route.abort();
    await page.route("**/api/platform/profile?view=identity", fail);
    await pulse("blur");
    await pulse("focus");
    await concealed(fields);
    await page
      .getByText("Your account could not be checked.", { exact: false })
      .waitFor({ state: "attached" });
    await page.unroute("**/api/platform/profile?view=identity", fail);
    await pulse("focus");
    await restored(fields);
    await pulse("blur");
    await signIn(other);
    await pulse("focus");
    await page
      .getByText("Your sign-in changed. Private entries remain concealed.", {
        exact: false
      })
      .waitFor({ state: "attached" });
    await page.waitForTimeout(300);
    await concealed(fields);
    await signIn(actor);
    await pulse("focus");
    await restored(fields);
    assert.equal(
      await page.evaluate(() =>
        Object.keys(localStorage).some((k) =>
          /credential|password|email-change/i.test(k)
        )
      ),
      false
    );
    ok(
      operation +
        ": four concealment events, failed identity and replacement account hide fields; original owner recovers unchanged memory draft"
    );
  }
  // A late identity response cannot redisplay entries after concealment.
  const initial = await surface("change-password", actor);
  let heldIdentity;
  let releaseIdentity;
  const arrivedIdentity = new Promise((r) => (heldIdentity = r)),
    gateIdentity = new Promise((r) => (releaseIdentity = r));
  const identityRoute = async (route) => {
    heldIdentity();
    await gateIdentity;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: actor.id })
    });
  };
  await page.route("**/api/platform/profile?view=identity", identityRoute);
  await pulse("focus");
  await arrivedIdentity;
  await pulse("blur");
  releaseIdentity();
  await page.waitForTimeout(100);
  await concealed(initial.fields);
  await page.unroute("**/api/platform/profile?view=identity", identityRoute);
  await pulse("focus");
  await restored(initial.fields);
  ok("late identity response cannot restore concealed fields");
  for (const operation of operations) {
    const a = await createPortalActor(db, "credlost");
    const f = await surface(operation, a);
    let count = 0;
    let accepted;
    const intercept = async (route) => {
      count++;
      accepted = await forward(route);
      assert.equal(accepted.status, 200);
      await route.abort();
    };
    await page.route("**/api/platform/account", intercept);
    await page.getByRole("button", { name: f.button, exact: true }).click();
    await waitFor(() => accepted);
    if (operation === "request-email-change")
      await page
        .getByText("We could not confirm the response.", { exact: false })
        .waitFor();
    else
      await page
        .getByText("Your sign-in changed. Private entries remain concealed.", {
          exact: false
        })
        .waitFor({ state: "attached" });
    for (const [hide, resume] of [
      ["blur", "focus"],
      ["offline", "online"],
      ["pagehide", "pageshow"]
    ]) {
      await pulse(hide);
      await pulse(resume);
    }
    await page.waitForTimeout(150);
    assert.equal(count, 1);
    const current = await db.platformUser.findUniqueOrThrow({
      where: { id: a.id }
    });
    if (operation === "request-email-change") {
      assert.equal(
        await db.platformEmailChange.count({ where: { userId: a.id } }),
        1
      );
      await restored(f.fields);
    } else {
      assert.equal(current.credentialVersion, 1);
      assert.equal(
        await db.platformSession.count({ where: { userId: a.id } }),
        0
      );
      await concealed(f.fields);
      if (operation === "confirm-email-change")
        assert.equal(current.email, f.newEmail);
    }
    await page.unroute("**/api/platform/account", intercept);
    ok(
      operation +
        ": accepted lost response retained as uncertain, no automatic replay across lifecycle events"
    );
  }
  for (const operation of ["change-password", "confirm-email-change"]) {
    const a = await createPortalActor(db, "credrace"),
      replacement = await createPortalActor(db, "crednewlogin");
    const f = await surface(operation, a);
    let delivered;
    let release;
    let response;
    let count = 0;
    const arrived = new Promise((r) => (delivered = r)),
      held = new Promise((r) => (release = r));
    const fulfilled = Promise.withResolvers();
    const intercept = async (route) => {
      try {
        count++;
        response = await forward(route);
        assert.equal(response.status, 200);
        delivered();
        await held;
        await route.fulfill(response);
        fulfilled.resolve();
      } catch (error) {
        fulfilled.reject(error);
      }
    };
    await page.route("**/api/platform/account", intercept);
    const browserReply = page.waitForResponse(
      (reply) =>
        new URL(reply.url()).pathname === "/api/platform/account" &&
        reply.request().postDataJSON()?.operation === operation
    );
    await page.getByRole("button", { name: f.button, exact: true }).click();
    await arrived;
    await pulse("blur");
    await concealed(f.fields);
    await signIn(replacement);
    const before = page.url();
    release();
    await fulfilled.promise;
    assert.equal(await (await browserReply).finished(), null);
    assert.equal(response.headers["set-cookie"], undefined);
    assert.equal(
      (await context.cookies()).find(
        (c) => c.name === sessionCookieFixtureName(config.origin)
      )?.value,
      replacement.token
    );
    assert.equal(page.url(), before);
    await concealed(f.fields);
    await pulse("focus");
    // The global session monitor deliberately conceals again when it detects
    // the replacement account. Let that check settle before testing recovery.
    await page
      .getByText("The signed-in account changed.", { exact: false })
      .waitFor();
    if (operation === "change-password") {
      // Settings conceal their entire workspace, including its recheck button.
      // Native focus can recover the retained outcome without bypassing inert.
      await refocusNatively();
    } else {
      await page
        .getByRole("button", { name: "Recheck current account", exact: true })
        .click();
    }
    await page
      .getByText("The change was confirmed.", { exact: false })
      .waitFor({ state: "attached" });
    // Attached is intentional: the password workspace remains concealed.
    await concealed(f.fields);
    assert.equal(page.url(), before);
    assert.equal(count, 1);
    assert.equal(
      (await context.cookies()).find(
        (cookie) => cookie.name === sessionCookieFixtureName(config.origin)
      )?.value,
      replacement.token
    );
    const changed = await db.platformUser.findUniqueOrThrow({
      where: { id: a.id }
    });
    assert.equal(changed.credentialVersion, 1);
    assert.equal(
      await db.platformSession.count({ where: { userId: a.id } }),
      0
    );
    if (operation === "confirm-email-change")
      assert.equal(changed.email, f.newEmail);
    await page.unroute("**/api/platform/account", intercept);
    ok(
      operation +
        ": delayed confirmed response preserves replacement login and conceals original form without hidden navigation"
    );
  }
  for (const operation of ["change-password", "confirm-email-change"]) {
    const a = await createPortalActor(db, "crednormal");
    const f = await surface(operation, a);
    await page.getByRole("button", { name: f.button, exact: true }).click();
    await page.waitForURL("**/platform/login?notice=*");
    assert.equal(
      await db.platformSession.count({ where: { userId: a.id } }),
      0
    );
    ok(
      operation +
        ": confirmed success recognizes intentionally revoked session and reaches sign-in"
    );
  }
  for (const operation of operations) {
    const a = await createPortalActor(db, "credhttp");
    const f = await surface(operation, a);
    const before = await db.platformUser.findUniqueOrThrow({
      where: { id: a.id }
    });
    const pending = await db.platformEmailChange.findUnique({
      where: { userId: a.id }
    });
    const body = {
      operation,
      currentPassword: a.password,
      ...(operation === "change-password"
        ? { password: "Fictional-new-2", confirmPassword: "Fictional-new-2" }
        : operation === "request-email-change"
          ? { newEmail: f.newEmail }
          : { token: f.token })
    };
    const denied = await fetchIn("/api/platform/account", body, other.id);
    assert.equal(denied.status, operation === "change-password" ? 400 : 401);
    assert.deepEqual(
      await db.platformUser.findUniqueOrThrow({ where: { id: a.id } }),
      before
    );
    assert.deepEqual(
      await db.platformEmailChange.findUnique({ where: { userId: a.id } }),
      pending
    );
    assert.equal(
      await db.platformSession.count({ where: { userId: a.id } }),
      1
    );
    ok(
      operation +
        ": built HTTPS boundary rejects expected-account mismatch before account effects"
    );
  }
  const visual = await surface("request-email-change", actor);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "32px")
    );
    await pulse("focus");
    await restored(visual.fields);
    const button = page.getByRole("button", {
      name: visual.button,
      exact: true
    });
    await button.focus();
    assert.ok(await button.evaluate((e) => e === document.activeElement));
    await button.scrollIntoViewIfNeeded();
    assert.ok(
      await button.evaluate((e) => {
        const r = e.getBoundingClientRect();
        return e.contains(
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        );
      })
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1
      )
    );
    if (width === 320)
      await page.screenshot({
        path: output + "/320-enlarged.png",
        fullPage: true
      });
  }
  ok(
    "email form keyboard focus, hit target and no horizontal overflow at 320/390/1280 with doubled text"
  );
  await context.clearCookies();
  await go("/platform/login");
  await page.getByLabel("Email", { exact: true }).waitFor();
  await page.getByLabel("Password", { exact: true }).waitFor();
  await go("/platform/signup");
  await page.getByLabel("Public username", { exact: true }).waitFor();
  ok(
    "public login and registration remain available without an owner-bound privacy gate"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        results,
        pageErrors: errors,
        productionWrites: 0,
        externalSends: 0,
        limits: [
          "Synthetic lifecycle events plus trusted native refocus and local fictional accounts; no physical-device or Google-provider acceptance",
          "Concealment removes DOM, not memory or operating-system snapshots"
        ]
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  console.log(
    JSON.stringify({
      passed: results.length,
      pageErrors: errors.length,
      productionWrites: 0,
      externalSends: 0
    })
  );
} finally {
  await browser.close();
  await db.$disconnect();
}
