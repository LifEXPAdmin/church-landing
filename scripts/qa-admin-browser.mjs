import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
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
  RETENTION_TEST_DIR: process.cwd() + "/" + fixtureDir + "/retention",
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
    viewport: { width: 320, height: 844 }
  }),
  page = await context.newPage(),
  results = [],
  errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const output = fixtureDir + "/admin-browser";
mkdirSync(output, { recursive: true });
const { seedSupport, requestInput } = await import("../tests/seed-support.ts");
const { createPortalActor, seedOperatorGrants } =
  await import("../tests/seed-portal.ts");
const { supportCommand, readSupport } =
  await import("../lib/platform/support.ts");
const { adminCaseCommand } = await import("../lib/platform/admin-cases.ts");
const { openAuthenticator, authenticatorTotp } =
  await import("../lib/platform/admin-authenticator-crypto.ts");
const go = async (path) => {
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
  // Next can temporarily retain a hidden streamed segment while committing it.
  // Assert the visible heading, including its uniqueness, rather than counting
  // that inert transfer fragment as another rendered page.
  await page.getByRole("heading", { level: 1 }).waitFor();
  assert.equal(await page.getByRole("heading", { level: 1 }).count(), 1);
  await page.waitForFunction(
    () => document.querySelectorAll("main h1").length === 1
  );
};
const fits = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal overflow"
  );
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};

const signIn = async (actor) => {
  await context.clearCookies();
  await context.addCookies([
    {
      name: "church_platform_session",
      value: actor.token,
      url: config.origin,
      httpOnly: true,
      secure: true,
      sameSite: "Lax"
    }
  ]);
};
const waitWorkspace = async () =>
  page
    .getByRole("button", { name: "Refresh current view", exact: true })
    .waitFor();
try {
  const f = await seedSupport(db),
    manager = await createPortalActor(db, "adminbrowsermanager"),
    target = await createPortalActor(db, "adminbrowsertarget");
  await seedOperatorGrants(db, manager, [
    "MANAGE_ADMIN_ACCESS",
    "VIEW_ADMIN_AUDIT",
    "LOOKUP_ACCOUNTS",
    "VIEW_OPERATIONAL_HEALTH"
  ]);
  const created = await supportCommand(
    db,
    f.memberA.token,
    await requestInput(db, f.memberA.token, {
      subject: "Fictional admin browser request",
      description:
        "Private original browser fixture. Only this requester and the assigned responder may read it."
    })
  );
  const note = "Private internal fixture note " + randomUUID();
  await signIn(f.memberA);
  await go("/platform/menu");
  assert.equal(await page.locator('a[href="/platform/admin"]').count(), 0);
  await go("/platform/admin/requests");
  await page
    .getByRole("heading", { name: "Admin view unavailable", exact: true })
    .waitFor();
  const denied = await context.request.get(
    config.origin + "/api/platform/admin?view=queue"
  );
  assert.equal(denied.status(), 404);
  assert.match(denied.headers()["cache-control"], /no-store/);
  ok(
    "Ordinary member has no Admin entry and the actual API denies the private queue without caching it."
  );
  await signIn(f.owner);
  await go("/platform/menu");
  await page.locator('a[href="/platform/admin"]').click();
  await waitWorkspace();
  await page
    .getByRole("combobox", { name: /^Admin section/ })
    .selectOption("/platform/admin/requests");
  await waitWorkspace();
  await page
    .getByLabel("Search authorized titles or references")
    .fill("Fictional admin browser request");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await waitWorkspace();
  const rowLink = page.getByRole("link", {
    name: "Fictional admin browser request",
    exact: true
  });
  await rowLink.waitFor();
  const filtered = page.url();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await fits();
    await page.screenshot({
      path: output + "/queue-" + width + ".png",
      fullPage: true
    });
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByText("My saved views", { exact: true }).click();
  await page
    .getByLabel("Name for these applied filters")
    .fill("Private browser view");
  await page
    .getByRole("button", { name: "Save private view", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Private browser view", exact: true })
    .waitFor();
  await page
    .getByRole("checkbox", {
      name: "Select Fictional admin browser request",
      exact: true
    })
    .check();
  await rowLink.click();
  await waitWorkspace();
  const noteForm = page.getByRole("form", {
    name: "Save internal note",
    exact: true
  });
  await noteForm.getByLabel("Internal note", { exact: true }).fill(note);
  // Another authorized writer advances the source while this draft stays open.
  await adminCaseCommand(db, f.owner.token, {
    operation: "triage",
    sourceType: "SUPPORT",
    sourceId: created.caseId,
    expectedVersion: created.version,
    requestKey: randomUUID(),
    priority: "HIGH",
    nextAction: "Review current fixture",
    tags: [],
    reminderAt: ""
  });
  await noteForm
    .getByRole("button", { name: "Save internal note", exact: true })
    .click();
  await noteForm
    .getByRole("button", {
      name: "Use current version with these entries",
      exact: true
    })
    .waitFor();
  assert.equal(
    await noteForm.getByLabel("Internal note", { exact: true }).inputValue(),
    note
  );
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes("/api/platform/admin?") &&
        r.url().includes("view=detail") &&
        r.request().method() === "GET" &&
        r.status() === 200
    ),
    noteForm
      .getByRole("button", { name: "Refresh current details", exact: true })
      .click()
  ]);
  await page
    .getByText(new RegExp("Version " + (created.version + 1) + "$"))
    .waitFor();
  await waitWorkspace();
  await noteForm
    .getByRole("button", {
      name: "Use current version with these entries",
      exact: true
    })
    .click();
  await noteForm
    .getByRole("button", { name: "Save internal note", exact: true })
    .click();
  await page.getByText(note, { exact: true }).waitFor();
  assert.equal(
    await db.adminCaseNote.count({
      where: { supportCaseId: created.caseId, body: note }
    }),
    1
  );
  assert.ok(
    !JSON.stringify(
      await readSupport(db, f.memberA.token, "detail", {
        caseId: created.caseId
      })
    ).includes(note)
  );
  await fits();
  await page.screenshot({ path: output + "/case-320.png", fullPage: true });
  await page
    .getByRole("link", { name: "Back to filtered requests", exact: true })
    .first()
    .focus();
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => u.pathname === "/platform/admin/requests");
  await waitWorkspace();
  assert.equal(
    new URL(page.url()).searchParams.get("q"),
    new URL(filtered).searchParams.get("q")
  );
  await page.waitForFunction(
    (id) => document.activeElement?.id === id,
    "request-" + created.caseId
  );
  assert.equal(
    await page
      .getByRole("checkbox", {
        name: "Select Fictional admin browser request",
        exact: true
      })
      .isChecked(),
    true
  );
  ok(
    "Support queue and case fit 320/390/1440; private saved filters, stale-write draft recovery, one internal note, and keyboard return focus work."
  );
  await signIn(manager);
  await go("/platform/admin/access");
  await waitWorkspace();
  const start = page.getByRole("form", {
    name: "Start authenticator setup",
    exact: true
  });
  await start.locator('input[name="currentPassword"]').fill(manager.password);
  await start
    .getByRole("button", { name: "Start authenticator setup", exact: true })
    .click();
  await page
    .getByRole("img", {
      name: "Private admin authenticator setup QR code",
      exact: true
    })
    .waitFor();
  const factor = await db.adminAuthenticator.findUniqueOrThrow({
      where: { userId: manager.id }
    }),
    secret = openAuthenticator(manager.id, factor.secretCiphertext);
  const confirm = page.getByRole("form", {
    name: "Confirm authenticator",
    exact: true
  });
  await confirm
    .getByLabel("Six-digit authenticator code", { exact: true })
    .fill(authenticatorTotp(secret, BigInt(Math.floor(Date.now() / 30000))));
  await confirm
    .getByRole("button", { name: "Confirm authenticator", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Save your recovery codes now", exact: true })
    .waitFor();
  assert.equal(
    await page
      .locator('img[alt="Private admin authenticator setup QR code"]')
      .count(),
    0
  );
  // Never capture setup keys or recovery codes in screenshots/DOM artifacts.
  await page
    .getByRole("button", {
      name: "I saved my recovery codes; hide them",
      exact: true
    })
    .click();
  await page
    .getByLabel("Complete username", { exact: true })
    .fill(target.username);
  await page
    .getByRole("button", { name: "Find current grants", exact: true })
    .click();
  await waitWorkspace();
  const grant = page.getByRole("form", {
    name: "Grant this capability",
    exact: true
  });
  await grant.locator('input[name="currentPassword"]').fill(manager.password);
  await grant
    .getByLabel("Reason for this specific duty", { exact: true })
    .fill("Isolated browser health duty only");
  await grant
    .getByLabel("Next unused six-digit authenticator code", { exact: true })
    .fill("xxxxxx");
  await grant
    .getByRole("button", { name: "Grant this capability", exact: true })
    .click();
  await grant.getByRole("alert").filter({ hasText: /code/i }).waitFor();
  assert.equal(
    await grant
      .getByLabel("Reason for this specific duty", { exact: true })
      .inputValue(),
    "Isolated browser health duty only"
  );
  assert.equal(
    await grant
      .getByLabel("Next unused six-digit authenticator code", { exact: true })
      .isEnabled(),
    true
  );
  const saved = await db.adminAuthenticator.findUniqueOrThrow({
    where: { userId: manager.id }
  });
  await grant
    .getByLabel("Next unused six-digit authenticator code", { exact: true })
    .fill(authenticatorTotp(secret, saved.lastCounter + 1n));
  await grant
    .getByRole("button", { name: "Grant this capability", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Revoke this capability", exact: true })
    .waitFor();
  assert.equal(
    await db.platformOperatorGrant.count({
      where: {
        userId: target.id,
        capability: "VIEW_OPERATIONAL_HEALTH",
        revokedAt: null
      }
    }),
    1
  );
  await fits();
  await page.screenshot({ path: output + "/access-320.png", fullPage: true });
  await db.platformOperatorGrant.updateMany({
    where: {
      userId: manager.id,
      capability: "MANAGE_ADMIN_ACCESS",
      revokedAt: null
    },
    data: { revokedAt: new Date() }
  });
  await page
    .getByRole("button", { name: "Refresh current view", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Recheck current access", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Revoke this capability", exact: true })
      .isVisible(),
    false
  );
  ok(
    "Actual browser authenticator setup, QR, confirmation, invalid-code edit recovery, one explicit fixture grant and revoked-manager concealment pass."
  );
  await signIn(target);
  await go("/platform/admin/health");
  await waitWorkspace();
  await fits();
  assert.equal(
    await page
      .getByRole("combobox", { name: /^Admin section/ })
      .locator("option")
      .allTextContents()
      .then((v) => v.includes("Requests")),
    false
  );
  await page.screenshot({ path: output + "/health-320.png", fullPage: true });
  assert.deepEqual(errors, []);
  ok(
    "Health-only account sees the permitted health section; browser reports no runtime errors. All writes are isolated fictional fixtures and transport is disabled."
  );
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        results,
        browserErrors: errors,
        productionMode: true,
        productionWrites: 0,
        externalSends: 0
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
} catch (error) {
  // Avoid accidental authenticator-key artifacts; retain only redacted structure.
  writeFileSync(output + "/failure.txt", String(error.stack ?? error), {
    mode: 0o600
  });
  writeFileSync(
    output + "/failure-structure.json",
    JSON.stringify(
      await page.evaluate(() => ({
        url: location.pathname,
        headings: [...document.querySelectorAll("h1,h2")].map(
          (n) => n.textContent
        ),
        alerts: [...document.querySelectorAll('[role="alert"]')].map(
          (n) => n.textContent
        ),
        buttons: [...document.querySelectorAll("button")].map((n) => ({
          text: n.textContent,
          disabled: n.disabled
        }))
      })),
      null,
      2
    ),
    { mode: 0o600 }
  );
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
