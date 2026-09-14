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
const output = fixtureDir + "/safety-settings-browser";
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
const { seedOperatorGrants } = await import("../tests/seed-portal.ts");
try {
  const operator = await createPortalActor(db, "000accountoperator");
  const target = await createPortalActor(db, "000accounttarget");
  const other = await createPortalActor(db, "000otheroperator");
  await seedOperatorGrants(db, operator, ["MANAGE_ACCOUNTS"]);
  await seedOperatorGrants(db, other, ["MANAGE_ACCOUNTS"]);
  const auditWhere = {
    targetId: target.id,
    action: { in: ["SUSPEND", "RESTORE_ACCOUNT"] }
  };
  const inspect = async () => {
    await go("/platform/operator/churches");
    await page.getByLabel("Account to manage", { exact: true }).waitFor();
    await page
      .getByLabel("Account to manage", { exact: true })
      .selectOption(target.id);
  };
  await signIn(operator);
  await inspect();
  const form = page.getByRole("form", { name: "Suspend account", exact: true });
  await form
    .getByRole("button", { name: "Suspend account", exact: true })
    .click();
  assert.equal(await db.churchAuditEvent.count({ where: auditWhere }), 0);
  await form
    .getByLabel("Reason for this decision", { exact: true })
    .selectOption("SAFETY_REVIEW");
  await form
    .getByRole("button", { name: "Suspend account", exact: true })
    .click();
  assert.equal(await db.churchAuditEvent.count({ where: auditWhere }), 0);
  assert.equal(
    await page.getByLabel("Account to manage", { exact: true }).isDisabled(),
    true
  );
  await bounded();
  await page.screenshot({
    path: output + "/reason-mobile.png",
    fullPage: true
  });
  ok(
    "390px form requires a reason and confirmation, protects the selected target and has no horizontal overflow"
  );

  await form.getByRole("checkbox").check();
  const bodies = [];
  let lost = true;
  await page.route("**/api/platform/portal", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    bodies.push(route.request().postData());
    assert.equal(route.request().headers()["x-expected-account"], operator.id);
    const response = await route.fetch();
    if (lost) {
      lost = false;
      assert.equal(response.status(), 200);
      await response.dispose();
      return route.abort("failed");
    }
    return route.fulfill({ response });
  });
  await form
    .getByRole("button", { name: "Suspend account", exact: true })
    .click();
  await form
    .getByRole("button", { name: "Retry original request", exact: true })
    .waitFor();
  assert.equal(await db.churchAuditEvent.count({ where: auditWhere }), 1);
  assert.equal(
    await form
      .getByLabel("Reason for this decision", { exact: true })
      .isDisabled(),
    true
  );
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal(
    await page.getByLabel("Account to manage", { exact: true }).isVisible(),
    false
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByRole("button", { name: "Confirm original request", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Confirm original request", exact: true })
    .click();
  await page.waitForFunction(
    () => !document.body.textContent.includes("Confirming original request")
  );
  // The guarded snapshot remains deliberately stale until explicit inspection.
  await page.waitForFunction(
    () =>
      !Array.from(document.querySelectorAll("button")).some(
        (b) => b.textContent === "Confirm original request"
      )
  );
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  assert.equal(await db.churchAuditEvent.count({ where: auditWhere }), 1);
  assert.equal(
    await db.platformSession.count({ where: { userId: target.id } }),
    0
  );
  await page.unroute("**/api/platform/portal");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Reload current information", exact: true })
    .click();
  await page.getByLabel("Account to manage", { exact: true }).waitFor();
  await page
    .locator("li")
    .filter({ hasText: target.name })
    .getByText("Safety review", { exact: true })
    .waitFor();
  ok(
    "A saved action with a lost response is concealed on blur; current access permits only the identical pending retry, leaving one audit and no sessions"
  );

  await page
    .getByLabel("Account to manage", { exact: true })
    .selectOption(target.id);
  const restore = page.getByRole("form", {
    name: "Restore account access",
    exact: true
  });
  await restore
    .getByLabel("Reason for this decision", { exact: true })
    .selectOption("REVIEW_COMPLETE");
  await restore.getByRole("checkbox").check();
  await restore
    .getByRole("button", { name: "Restore account access", exact: true })
    .click();
  await restore
    .getByRole("button", {
      name: "Inspect current account access",
      exact: true
    })
    .waitFor();
  assert.equal(await db.churchAuditEvent.count({ where: auditWhere }), 2);
  assert.equal(
    await db.platformSession.count({ where: { userId: target.id } }),
    0
  );
  assert.equal(
    await restore
      .getByRole("button", { name: "Restore account access", exact: true })
      .count(),
    0
  );
  await restore
    .getByRole("button", {
      name: "Inspect current account access",
      exact: true
    })
    .click();
  await page.getByLabel("Account to manage", { exact: true }).waitFor();
  await page
    .locator("li")
    .filter({ hasText: target.name })
    .getByText("Review completed; access may resume", { exact: true })
    .waitFor();
  ok(
    "Restoration records its separate reason, leaves old sessions ended, and requires current-state inspection before another action"
  );

  await page
    .getByLabel("Account to manage", { exact: true })
    .selectOption(target.id);
  await page
    .getByLabel("Reason for this decision", { exact: true })
    .selectOption("ACCOUNT_SECURITY");
  await form.getByRole("checkbox").check();
  const beforeVersion = (
    await db.platformUser.findUniqueOrThrow({ where: { id: target.id } })
  ).portalVersion;
  await db.platformUser.update({
    where: { id: target.id },
    data: { portalVersion: { increment: 1 } }
  });
  await form
    .getByRole("button", { name: "Suspend account", exact: true })
    .click();
  await form
    .getByRole("alert")
    .filter({ hasText: /changed|Refresh|refresh/ })
    .waitFor();
  assert.equal(
    await form
      .getByRole("button", { name: "Suspend account", exact: true })
      .count(),
    0
  );
  assert.equal(await db.churchAuditEvent.count({ where: auditWhere }), 2);
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { id: target.id } }))
      .portalVersion,
    beforeVersion + 1
  );
  page.once("dialog", (dialog) => dialog.accept());
  await form
    .getByRole("button", {
      name: "Discard local decision and reload",
      exact: true
    })
    .click();
  await page.getByLabel("Account to manage", { exact: true }).waitFor();
  ok(
    "A concurrent target change rejects the stale decision and requires deliberate reload without rebasing or changing status"
  );

  await page
    .getByLabel("Account to manage", { exact: true })
    .selectOption(target.id);
  await page
    .getByLabel("Reason for this decision", { exact: true })
    .selectOption("SAFETY_REVIEW");
  await form.getByRole("checkbox").check();
  await signIn(other);
  await form
    .getByRole("button", { name: "Suspend account", exact: true })
    .click();
  await form
    .getByRole("alert")
    .filter({ hasText: /sign-in changed/ })
    .waitFor();
  assert.equal(await db.churchAuditEvent.count({ where: auditWhere }), 2);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .first()
    .waitFor();
  assert.equal(
    await page.getByLabel("Account to manage", { exact: true }).isVisible(),
    false
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Confirm original request", exact: true })
      .count(),
    0
  );
  ok(
    "Switching between two authorized operators blocks a stale form and conceals the prior account snapshot without a mutation"
  );

  await signIn(operator);
  await go("/platform/operator/churches");
  await page.getByLabel("Account to manage", { exact: true }).waitFor();
  await page.setViewportSize({ width: 320, height: 740 });
  await bounded();
  await page.screenshot({ path: output + "/audit-320.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await bounded();
  await page.screenshot({
    path: output + "/audit-desktop.png",
    fullPage: true
  });
  await db.platformOperatorGrant.updateMany({
    where: { userId: operator.id },
    data: { revokedAt: new Date() }
  });
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByRole("button", { name: "Reload current information", exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("Account to manage", { exact: true }).isVisible(),
    false
  );
  ok(
    "Account audit remains readable at 320px and desktop widths; revoking current authority conceals the original privileged page"
  );
  assert.deepEqual(errors, []);
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.txt",
    String(error) + "\n" + (await page.locator("body").innerText())
  );
  throw error;
} finally {
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        results,
        errors,
        checkedAt: new Date().toISOString(),
        fictionalOnly: true
      },
      null,
      2
    )
  );
  await db.$disconnect();
  await browser.close();
}
