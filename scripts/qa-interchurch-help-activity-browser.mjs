import assert from "node:assert/strict";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";

assert.ok(
  process.argv[2],
  "Pass the parent's ready isolated HTTPS fixture directory."
);
const fixture = realpathSync(resolve(process.argv[2]));
assert.ok(fixture.startsWith(realpathSync(resolve(".account-test")) + "/"));
const supplied = JSON.parse(
  readFileSync(join(fixture, "test-env.json"), "utf8")
);
const config = JSON.parse(
  readFileSync(join(fixture, "browser-env.json"), "utf8")
);
assert.equal(config.database, supplied.DATABASE_URL);
assert.equal(supplied.ACCOUNT_TEST_ISOLATED, "1");
assert.equal(supplied.ACCOUNT_DELIVERY_MODE, "test-sink");
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.ok(realpathSync(config.certificate).startsWith(fixture + "/"));
assert.equal(
  process.env.NODE_EXTRA_CA_CERTS,
  config.certificate,
  "Supply the owned CA before Node starts."
);
assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED, "0");
Object.assign(process.env, supplied, {
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  NODE_ENV: "test",
  VERCEL: "",
  VERCEL_ENV: "",
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  PRIVILEGED_MFA_MODE: "off",
  COMMUNITY_REPORTS_ENABLED: "true",
  PUSH_ENABLED: "false",
  SOCIAL_EMAIL_ENABLED: "false",
  FOUNDER_WELCOME_ENABLED: "false",
  FOUNDER_ANNOUNCEMENTS_ENABLED: "false",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  ACCOUNT_GOOGLE_ENABLED: "false",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  BLOB_READ_WRITE_TOKEN: "",
  BLOB_STORE_ID: ""
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase, createPortalActor, seedOperatorGrants } =
  await import("../tests/seed-portal.ts");
const { seedInterchurchHelp, helpAction } =
  await import("../tests/seed-interchurch-help.ts");
const { interchurchHelpCommand } =
  await import("../lib/platform/interchurch-help-commands.ts");
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
  headless: true,
  executablePath:
    process.env.CHROMIUM_PATH ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: [
    "--no-proxy-server",
    "--ignore-certificate-errors-spki-list=" +
      createHash("sha256").update(der).digest("base64")
  ]
});
const context = await browser.newContext({
  viewport: { width: 320, height: 900 },
  timezoneId: "America/Chicago"
});
context.setDefaultTimeout(15000);
context.setDefaultNavigationTimeout(15000);
const page = await context.newPage(),
  errors = [],
  external = [],
  results = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("dialog", (dialog) => dialog.accept());
await context.route("**/*", (route) => {
  if (new URL(route.request().url()).origin === config.origin)
    return route.continue();
  external.push(route.request().url());
  return route.abort();
});
const output = join(fixture, "interchurch-activity-browser-" + Date.now());
mkdirSync(output, { recursive: true, mode: 0o700 });
const sha = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const identity = {
  head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  buildId: readFileSync(".next/BUILD_ID", "utf8").trim(),
  runnerSha256: sha(new URL(import.meta.url)),
  sources: Object.fromEntries(
    [
      "lib/platform/activity.ts",
      "lib/platform/interchurch-help-notifications.ts",
      "components/platform/activity-workspace.tsx"
    ].map((path) => [path, sha(path)])
  )
};
const write = (name, value) =>
  writeFileSync(join(output, name), JSON.stringify(value, null, 2), {
    mode: 0o600
  });
const step = (label) => {
  write("progress.json", {
    identity,
    label,
    results,
    at: new Date().toISOString()
  });
  console.log("STEP " + label);
};
const ok = (label) => {
  results.push(label);
  console.log("PASS " + label);
};
const rows = () =>
  page.getByRole("list", { name: "Activity updates" }).getByRole("article");
const button = (name) => page.getByRole("button", { name, exact: true });
const total = (n) =>
  page
    .getByText(
      `${n} unread update${n === 1 ? "" : "s"} across all categories`,
      { exact: true }
    )
    .waitFor();
const settled = () => page.waitForLoadState("networkidle", { timeout: 15000 });
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
const go = async (path) => {
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
  await page.bringToFront();
  await settled();
};
const offerRow = (id) =>
  rows().filter({
    has: page.locator(`a[href="/platform/exchange/help/offers?id=${id}"]`)
  });
try {
  step("Verify serving build and seed canonical offers");
  const manifest = await context.request.get(
    `${config.origin}/_next/static/${identity.buildId}/_buildManifest.js`,
    { timeout: 15000 }
  );
  assert.equal(manifest.status(), 200);
  assert.match(await manifest.text(), /__BUILD_MANIFEST/);
  await seedOperatorGrants(db, await createPortalActor(db, "actreview"), [
    "REVIEW_COMMUNITY_REPORTS"
  ]);
  const f = await seedInterchurchHelp(db),
    first = await f.offer();
  const otherResponder = await createPortalActor(db, "actsecond");
  const request = await db.interchurchHelpRequest.findUniqueOrThrow({
    where: { id: f.request.id }
  });
  const made = await interchurchHelpCommand(
    db,
    otherResponder.token,
    helpAction("offer", {
      requestId: request.id,
      expectedVersion: request.termsVersion,
      kind: "PERSONAL",
      respondingChurchId: null,
      schema: 1,
      terms: f.terms,
      acceptResponsibility: true,
      externalNotices: false
    })
  );
  await interchurchHelpCommand(
    db,
    f.manager.token,
    helpAction("select", {
      offerId: made.id,
      expectedVersion: made.version,
      requestTermsVersion: request.termsVersion,
      acceptTerms: true,
      externalNotices: false
    })
  );
  await f.acknowledge(made.id, otherResponder);
  const second = made.id;
  const count = () =>
    db.socialEvent.count({
      where: { recipientId: f.manager.id, kind: "INTERCHURCH_HELP" }
    });
  assert.equal(await count(), 4);

  await signIn(f.manager);
  await go("/platform/activity");
  await total(4);
  await page
    .getByRole("navigation", { name: "Activity categories" })
    .getByRole("link", { name: "Church Needs", exact: true })
    .click();
  await page.waitForURL(
    (url) =>
      url.pathname === "/platform/activity" &&
      url.searchParams.get("category") === "needs"
  );
  await total(4);
  assert.equal(await rows().count(), 2);
  for (const id of [first, second]) {
    assert.equal(await offerRow(id).count(), 1);
    assert.match(await offerRow(id).innerText(), /2 updates · 2 unread/);
  }
  assert.ok(
    !(await page.locator("#platform-content").innerText()).includes(
      f.terms.duties
    )
  );
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      )
    );
    await page.screenshot({
      path: join(output, `needs-${width}.png`),
      fullPage: true
    });
  }
  ok(
    "Church Needs shows two separate canonical offer groups with exact event totals at 320 and 1440 pixels"
  );

  for (const width of [320, 1440]) {
    step(
      `Open exact offer, return with Back, and change one group's read state at ${width} pixels`
    );
    await page.setViewportSize({ width, height: 1000 });
    await offerRow(second)
      .getByRole("link", { name: "Open item", exact: true })
      .click();
    await page.waitForURL(
      (url) =>
        url.pathname === "/platform/exchange/help/offers" &&
        url.searchParams.get("id") === second
    );
    await page
      .getByRole("article", { name: "Private ministry offer", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("article", { name: "Private ministry offer", exact: true })
        .count(),
      1
    );
    await page.goBack();
    await page.waitForURL(
      (url) =>
        url.pathname === "/platform/activity" &&
        url.searchParams.get("category") === "needs"
    );
    await total(4);
    await offerRow(second)
      .getByRole("button", { name: "Mark group read", exact: true })
      .click();
    await total(2);
    assert.match(await offerRow(first).innerText(), /2 updates · 2 unread/);
    assert.match(await offerRow(second).innerText(), /2 updates · Read/);
    await offerRow(second)
      .getByRole("button", { name: "Mark group unread", exact: true })
      .click();
    await total(4);
  }
  ok(
    "At 320 and 1440 pixels, Needs opens only the selected offer; Back preserves the filter and opening alone does not mark read; explicit read/unread affects one group"
  );

  step(
    "Drop a committed group-read reply and retain a later arrival through exact retry"
  );
  const bodies = [];
  let dropped = false;
  const loseReply = async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    bodies.push(route.request().postData());
    if (dropped) return route.continue();
    dropped = true;
    const reply = await route.fetch({ timeout: 15000 });
    assert.equal(reply.status(), 200);
    const a = await f.agreement(second);
    await interchurchHelpCommand(
      db,
      otherResponder.token,
      helpAction("contact", {
        offerId: second,
        expectedVersion: a.version,
        termsVersion: a.termsVersion,
        contact: "Fictional later private Activity contact",
        consent: true
      })
    );
    return route.abort("failed");
  };
  await page.route("**/api/platform/activity", loseReply);
  await offerRow(second)
    .getByRole("button", { name: "Mark group read", exact: true })
    .click();
  await button("Retry read change").waitFor();
  await button("Retry read change").click();
  await total(3);
  await page.unroute("**/api/platform/activity", loseReply);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[1], bodies[0]);
  assert.match(await offerRow(second).innerText(), /3 updates · 1 unread/);
  assert.match(await offerRow(first).innerText(), /2 updates · 2 unread/);
  assert.equal(await count(), 5);
  ok(
    "Exact browser retry preserves the later arrival and the other offer while reading only the captured group's original events"
  );

  step("Recheck a current-source loss without exposing old private details");
  await f.acknowledge(second, f.manager);
  await button("Refresh activity").click();
  await total(3);
  await page
    .getByRole("heading", { name: "Activity unavailable", exact: true })
    .waitFor();
  assert.equal(await rows().count(), 2);
  const unavailable = rows().filter({
    has: page.getByRole("heading", {
      name: "Activity unavailable",
      exact: true
    })
  });
  assert.match(await unavailable.innerText(), /3 updates · 1 unread/);
  assert.equal(
    await unavailable
      .getByRole("link", { name: "Open item", exact: true })
      .count(),
    0
  );
  assert.ok(
    !(await page.locator("#platform-content").innerText()).includes(
      "Fictional later private Activity contact"
    )
  );
  ok(
    "A stale source retains a grouped unavailable Needs receipt with read controls and no link or private contact"
  );

  step("Replace the account and await the new owner's final Activity read");
  await signIn(f.outsider);
  const changed = page.waitForResponse(
    async (response) => {
      if (
        new URL(response.url()).pathname !== "/api/platform/activity" ||
        response.request().method() !== "GET" ||
        response.status() !== 200
      )
        return false;
      return (await response.json()).ownerId === f.outsider.id;
    },
    { timeout: 15000 }
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await changed;
  await total(0);
  await settled();
  assert.equal(await rows().count(), 0);
  assert.equal(
    await page.locator(`a[href*="${first}"], a[href*="${second}"]`).count(),
    0
  );
  ok(
    "Account replacement settles on the new owner's empty Needs view without retained offer links or counts"
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  write("results.json", { identity, results, errors, external });
  console.log("EVIDENCE " + output);
} catch (error) {
  write("failure.json", {
    identity,
    results,
    errors,
    external,
    message: error.message,
    stack: error.stack
  });
  writeFileSync(join(output, "failure.html"), await page.content(), {
    mode: 0o600
  });
  await page
    .screenshot({ path: join(output, "failure.png"), fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
