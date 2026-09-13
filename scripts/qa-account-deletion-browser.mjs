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
const output = fixtureDir + "/account-deletion-browser";
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
  const a = await createPortalActor(db, "deletebrowser");
  const b = await createPortalActor(db, "deleteother");
  const { readAccountSession } = await import("../lib/platform/accounts.ts");
  await signIn(a);
  await go("/platform/settings/data/delete");
  const password = page.getByLabel(
    "Confirm your current sign-in for deletion",
    { exact: true }
  );
  await password.fill("wrong-password");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Confirm permanent deletion", exact: true })
    .click();
  await page
    .locator('[role="alert"]')
    .filter({ hasText: /password|sign-in|confirm/i })
    .last()
    .waitFor();
  assert.equal(await db.accountDeletion.count({ where: { userId: a.id } }), 0);
  assert.ok(await readAccountSession(db, a.token));
  ok(
    "Wrong credentials cannot close an account; explicit disclosures and confirmation are visible"
  );
  await password.fill(a.password);
  let acceptedBody;
  await page.route("**/api/platform/account", async (route) => {
    const body = route.request().postDataJSON();
    if (body?.operation !== "delete-account") return route.continue();
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    acceptedBody = body;
    await route.abort("failed");
  });
  await page
    .getByRole("button", { name: "Confirm permanent deletion", exact: true })
    .click();
  await page
    .locator('[role="alert"]')
    .filter({ hasText: /fetch|response|progress/i })
    .last()
    .waitFor();
  assert.ok(acceptedBody);
  assert.equal(await readAccountSession(db, a.token), null);
  assert.equal(await db.accountDeletion.count({ where: { userId: a.id } }), 1);
  const saved = JSON.parse(
    await page.evaluate(() => localStorage.getItem("gc.account-deletion.v1"))
  );
  assert.equal(saved.proof, acceptedBody.proof);
  assert.deepEqual(Object.keys(saved).sort(), ["owner", "proof", "savedAt"]);
  await page.unroute("**/api/platform/account");
  await page
    .getByRole("button", { name: "Check deletion progress", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Your permanent deletion request was accepted" })
    .waitFor();
  await go("/platform/account/deletion");
  await page
    .getByRole("button", { name: "Check deletion progress", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Your permanent deletion request was accepted" })
    .waitFor();
  assert.ok(!(await page.locator("main").innerText()).includes(a.email));
  assert.equal(await db.accountDeletion.count({ where: { userId: a.id } }), 1);
  ok(
    "A lost accepted response retains one progress capability, revokes access and recovers status after reload without a duplicate request"
  );
  await signIn(b);
  await go("/platform/settings/data/delete");
  await page
    .getByRole("button", { name: "Confirm permanent deletion", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Check deletion progress", exact: true })
      .count(),
    0
  );
  assert.equal(
    await page
      .getByText("Your permanent deletion request was accepted.", {
        exact: false
      })
      .count(),
    0
  );
  const c = await createPortalActor(db, "deletestale");
  await signIn(c);
  await go("/platform/settings/data/delete");
  await password.fill(c.password);
  await page.getByRole("checkbox").check();
  await signIn(b);
  await page
    .getByRole("button", { name: "Confirm permanent deletion", exact: true })
    .click();
  await page
    .locator('[role="alert"]')
    .filter({ hasText: /account|sign|reload/i })
    .last()
    .waitFor();
  assert.equal(
    await db.accountDeletion.count({ where: { userId: { in: [b.id, c.id] } } }),
    0
  );
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await bounded();
  }
  ok(
    "Another account cannot see the prior settings receipt or submit a stale owner's deletion; responsive controls remain bounded"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        checks: results,
        pageErrors: errors,
        environment: "isolated built HTTPS; no production erasure"
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
