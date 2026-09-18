import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the existing isolated preview artifact directory");
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + fixtureDir + "/sink",
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: ""
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase } = await import("../tests/seed-portal.ts");
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
    "--ignore-certificate-errors-spki-list=" +
      createHash("sha256").update(der).digest("base64")
  ]
});
const context = await browser.newContext({
  timezoneId: "America/Chicago",
  viewport: { width: 390, height: 844 }
});
await context.route("**/*", (route) =>
  new URL(route.request().url()).hostname === "127.0.0.1"
    ? route.continue()
    : route.abort()
);
context.setDefaultTimeout(15000);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => {
  const issue = { path: new URL(page.url()).pathname, message: e.message };
  errors.push(issue);
  console.log("BROWSER_ERROR", JSON.stringify(issue));
});
const results = [];
const ok = (s) => {
  results.push(s);
  console.log("PASS " + s);
};
const output = fixtureDir + "/church-settings-browser-" + Date.now();
mkdirSync(output, { recursive: true });
const go = async (path) => {
  await page.goto(config.origin + path);
  await page.getByRole("heading", { level: 1 }).waitFor();
};
const bounded = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal page overflow"
  );

const { createPortalActor } = await import("../tests/seed-portal.ts");
const signIn = async (actor) => {
  await context.clearCookies();
  await context.addCookies([
    {
      name: "church_platform_session",
      value: actor.token,
      domain: "127.0.0.1",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
};
try {
  const { seedManagedChurch } =
    await import("../tests/seed-church-management.ts");
  const { portalCommand } = await import("../lib/platform/portal.ts");
  const manager = await createPortalActor(db, "settingsmanager"),
    member = await createPortalActor(db, "settingsmember"),
    other = await createPortalActor(db, "settingsother");
  const managed = await seedManagedChurch(db, manager);
  const churchId = managed.church.id;
  await db.church.update({
    where: { id: churchId },
    data: { name: "Fictional Settings Church" }
  });
  await db.churchCapabilityGrant.upsert({
    where: {
      userId_churchId_capability: {
        userId: manager.id,
        churchId,
        capability: "REVIEW_CONNECTIONS"
      }
    },
    create: { userId: manager.id, churchId, capability: "REVIEW_CONNECTIONS" },
    update: { revokedAt: null }
  });
  const overview = () => go("/platform/settings/church");
  const organization = () => go("/platform/settings/church/organization");
  await signIn(member);
  await overview();
  await page
    .getByText("You have no current church connection.", { exact: false })
    .waitFor();
  await page
    .getByRole("link", {
      name: "Review or change my church connection",
      exact: true
    })
    .click();
  await page.waitForURL("**/platform/my-church");
  await page.getByRole("heading", { name: "My church", exact: true }).waitFor();
  await go("/platform/churches/" + churchId);
  await page
    .getByRole("button", { name: "Request church connection", exact: true })
    .click();
  await page.getByText("Pending", { exact: true }).first().waitFor();
  await overview();
  await page.getByText("Awaiting review", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("link", { name: "Directory and contact choices", exact: true })
      .count(),
    0
  );
  await organization();
  await page
    .getByText("No church administration is available", { exact: false })
    .waitFor();
  assert.equal(await page.getByLabel("Church", { exact: true }).count(), 0);
  ok(
    "No-church personal Settings links the actual request flow; pending remains unapproved with no directory or administration"
  );

  await overview();
  await page
    .getByRole("link", {
      name: "Review or change my church connection",
      exact: true
    })
    .click();
  await page
    .getByLabel("I want to withdraw this connection request.", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Withdraw request", exact: true })
    .click();
  await page.getByText("Withdrawn", { exact: true }).first().waitFor();
  await overview();
  await page.getByText("Request withdrawn", { exact: true }).waitFor();
  await go("/platform/churches/" + churchId);
  await page
    .getByRole("button", { name: "Request connection again", exact: true })
    .click();
  await page.getByText("Pending", { exact: true }).first().waitFor();
  const connection = await db.churchConnection.findUniqueOrThrow({
    where: { userId_churchId: { userId: member.id, churchId } }
  });
  await portalCommand(db, manager.token, {
    operation: "transition",
    action: "APPROVE",
    churchId,
    connectionId: connection.id,
    expectedVersion: connection.version
  });
  await overview();
  await page.getByText("Approved connection", { exact: true }).waitFor();
  await page
    .getByRole("link", { name: "Directory and contact choices", exact: true })
    .click();
  await page.waitForURL("**/platform/my-church/sharing");
  await page
    .getByRole("heading", { name: "My sharing", exact: true })
    .waitFor();
  await page.goBack();
  await page.getByText("Approved connection", { exact: true }).waitFor();
  await organization();
  await page
    .getByText("No church administration is available", { exact: false })
    .waitFor();
  ok(
    "Actual withdrawal and rerequest require fresh approval; approved members reach canonical directory choices without becoming administrators"
  );

  await overview();
  await page
    .getByRole("link", {
      name: "Review or change my church connection",
      exact: true
    })
    .click();
  await page
    .getByLabel(
      "I understand that leaving ends my approved connection and church-only access.",
      { exact: true }
    )
    .check();
  await page
    .getByRole("button", { name: "Leave this church", exact: true })
    .click();
  await page.getByText("Left", { exact: true }).first().waitFor();
  await overview();
  await page.getByText("Connection ended", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("link", { name: "Directory and contact choices", exact: true })
      .count(),
    0
  );
  const ended = await db.churchConnection.findUniqueOrThrow({
    where: { id: connection.id },
    include: { preference: true }
  });
  assert.equal(ended.state, "LEFT");
  assert.ok(!ended.preference?.listed);
  ok(
    "Canonical leave confirmation ends access and the Settings overview removes directory controls"
  );

  await signIn(manager);
  await organization();
  await page.getByLabel("Church", { exact: true }).selectOption(churchId);
  await page
    .getByRole("region", { name: "Current organization scope", exact: true })
    .waitFor();
  assert.match(
    await page
      .getByRole("region", { name: "Current organization scope", exact: true })
      .innerText(),
    /Fictional Settings Church/
  );
  const tools = page.getByRole("navigation", {
    name: "Manage church",
    exact: true
  });
  await tools
    .getByRole("link", { name: "Team / organization", exact: true })
    .waitFor();
  await tools
    .getByRole("link", { name: "Team / organization", exact: true })
    .click();
  await page.waitForURL("**/structure");
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.goBack();
  await page.getByLabel("Church", { exact: true }).selectOption(churchId);
  await page
    .getByRole("region", { name: "Current organization scope", exact: true })
    .waitFor();
  ok(
    "Administration selection preserves a visible church scope and uses the existing current-permission structure destination"
  );

  await db.churchCapabilityGrant.updateMany({
    where: { userId: manager.id, churchId },
    data: { revokedAt: new Date() }
  });
  await page.getByLabel("Church", { exact: true }).selectOption("");
  await page.getByLabel("Church", { exact: true }).selectOption(churchId);
  await page
    .getByText("Church administration is no longer available", { exact: false })
    .waitFor();
  assert.equal(
    await page
      .getByRole("region", { name: "Current organization scope", exact: true })
      .count(),
    0
  );
  assert.equal(
    await page
      .getByRole("navigation", { name: "Manage church", exact: true })
      .count(),
    0
  );
  await page.reload();
  await page
    .getByText("No church administration is available", { exact: false })
    .waitFor();
  ok(
    "Revoking duties defeats an already-loaded selection, removes protected tools and disappears after reload"
  );

  for (const [capability, label, path] of [
    [
      "MANAGE_CHURCH_GROUPS",
      "Church Gather groups",
      `/platform/groups?churchId=${churchId}`
    ],
    [
      "MANAGE_CHURCH_ASSISTANCE",
      "Church pantry and support hub",
      `/platform/pantry/${churchId}`
    ],
    [
      "MANAGE_EXCHANGE_LISTINGS",
      "Church Exchange listings",
      `/platform/exchange/mine?churchId=${churchId}`
    ],
    [
      "MODERATE_CHURCH_POSTS",
      "Your assigned report reviews",
      "/platform/reports/review"
    ],
    [
      "APPOINT_COORDINATORS",
      "Appoint help coordinators",
      "/platform/operator/churches"
    ],
    [
      "MANAGE_CHURCH_VOLUNTEERS",
      "Events and volunteer roles",
      `/platform/churches/${churchId}/calendar`
    ]
  ]) {
    await db.churchCapabilityGrant.updateMany({
      where: { userId: manager.id, churchId },
      data: { revokedAt: new Date() }
    });
    await db.churchCapabilityGrant.upsert({
      where: {
        userId_churchId_capability: { userId: manager.id, churchId, capability }
      },
      create: { userId: manager.id, churchId, capability },
      update: { revokedAt: null }
    });
    await organization();
    await page.getByLabel("Church", { exact: true }).selectOption(churchId);
    const link = page
      .getByRole("navigation", { name: "Manage church", exact: true })
      .getByRole("link", { name: label, exact: true });
    await link.waitFor();
    assert.equal(await link.getAttribute("href"), path);
    await link.click();
    await page.waitForURL(config.origin + path);
    await page.getByRole("heading", { level: 1 }).waitFor();
    assert.equal(await page.getByText("404", { exact: true }).count(), 0);
  }
  ok(
    "Single-capability administrators reach existing Groups, Pantry, Exchange, review, coordinator and volunteer tools"
  );

  await organization();
  await page.getByLabel("Church", { exact: true }).selectOption(churchId);
  await page
    .getByRole("region", { name: "Current organization scope", exact: true })
    .waitFor();
  await page.route("**/api/platform/settings?scope=church", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Fictional church settings read failure"
      })
    })
  );
  await page.evaluate(() => {
    dispatchEvent(new Event("blur"));
    dispatchEvent(new Event("focus"));
  });
  await page
    .getByText("Fictional church settings read failure", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByText("Fictional Settings Church", { exact: true }).count(),
    0
  );
  await page.unroute("**/api/platform/settings?scope=church");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByLabel("Church", { exact: true }).waitFor();
  ok(
    "Failed current-access reads conceal church details and recover through Retry"
  );

  await signIn(other);
  await page.getByLabel("Church", { exact: true }).selectOption(churchId);
  await page
    .getByText("Your church tools could not be checked", { exact: false })
    .waitFor();
  assert.equal(
    await page
      .getByRole("region", { name: "Current organization scope", exact: true })
      .count(),
    0
  );
  const mismatch = await context.request.get(
    config.origin + "/api/platform/settings?scope=church",
    { headers: { "X-Expected-Account": manager.id } }
  );
  assert.equal(mismatch.status(), 401);
  assert.match(mismatch.headers()["cache-control"], /no-store/);
  ok(
    "A changed account cannot open the old account's selected organization; server identity checks reject the stale owner"
  );

  await signIn(member);
  await overview();
  for (const state of ["REMOVED", "DECLINED"]) {
    await db.churchConnection.update({
      where: { id: connection.id },
      data: { state }
    });
    await page.reload();
    await page
      .getByText(
        state === "REMOVED" ? "Connection removed" : "Request declined",
        { exact: true }
      )
      .waitFor();
  }
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.addStyleTag({ content: "html { font-size: 24px !important; }" });
    await bounded();
  }
  await page
    .getByRole("link", {
      name: "Review or change my church connection",
      exact: true
    })
    .focus();
  await page.keyboard.press("Enter");
  await page.waitForURL("**/platform/my-church");
  ok(
    "Removed and declined states explain the next step; keyboard and enlarged 320/390/1440 layouts remain usable"
  );

  await context.clearCookies();
  await go("/platform/settings/church");
  assert.match(new URL(page.url()).pathname, /\/platform\/(login|join)/);
  assert.equal(
    new URL(page.url()).searchParams.get("next"),
    "/platform/settings/church"
  );
  const guest = await context.request.get(
    config.origin + "/api/platform/settings?scope=church"
  );
  assert.equal(guest.status(), 401);
  assert.match(guest.headers()["cache-control"], /no-store/);
  assert.deepEqual(errors, []);
  ok(
    "Guest return and private no-store church summaries preserve the existing sign-in boundary"
  );
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      { results, errors, fixtureOnly: true, physicalDeviceVerified: false },
      null,
      2
    )
  );
  console.log("CHURCH_SETTINGS_BROWSER_PASS " + results.length + " " + output);
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.json",
    JSON.stringify(
      {
        results,
        errors,
        message: error.message,
        path: new URL(page.url()).pathname
      },
      null,
      2
    )
  );
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
