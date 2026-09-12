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
const { assertPortalTestDatabase } =
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
const output = fixtureDir + "/demo-entry-browser";
mkdirSync(output, { recursive: true });
const go = async (path) => {
  await page.goto(config.origin + path);
};
const bounded = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal page overflow"
  );

const { randomUUID } = await import("node:crypto");
try {
  await db.platformAuthLimit.deleteMany();
  await go("/platform/share");
  await page
    .locator("main")
    .getByRole("link", { name: "Create account", exact: true })
    .click();
  const username = "demo_" + randomUUID().replaceAll("-", "").slice(0, 12),
    email = username + "@example.test",
    password = "Fictional-only-" + randomUUID();
  const form = page.locator("#account-register-form");
  for (const [name, value] of Object.entries({
    name: "Fictional demo signup",
    username,
    email,
    password,
    confirmPassword: password
  }))
    await form.locator(`[name=${name}]`).fill(value);
  await form
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.locator("#account-login-form").waitFor();
  assert.equal(
    new URL(page.url()).searchParams.get("next"),
    "/platform/churches"
  );
  const user = await db.platformUser.findUniqueOrThrow({ where: { email } });
  assert.equal(user.emailVerifiedAt, null);
  // Production-mode isolated preview forbids test delivery. Exercise the same
  // grant service in this guarded test process, then consume its real link in UI.
  const { requestAccountGrant } = await import("../lib/platform/accounts.ts");
  const { deliverAccountGrant } =
    await import("../lib/platform/account-delivery.ts");
  await requestAccountGrant(db, email, "VERIFY_EMAIL", deliverAccountGrant);
  const { readdirSync } = await import("node:fs");
  const messages = readdirSync(process.env.ACCOUNT_TEST_SINK_DIR).map((file) =>
    JSON.parse(
      readFileSync(process.env.ACCOUNT_TEST_SINK_DIR + "/" + file, "utf8")
    )
  );
  const link = messages.find(
    (m) => m.email === email && m.purpose === "VERIFY_EMAIL"
  ).url;
  const { handleAccountRequest } =
    await import("../lib/platform/account-boundary.ts");
  const inert = await context.request.get(link);
  assert.equal(inert.status(), 200);
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { email } }))
      .emailVerifiedAt,
    null
  );
  const token = new URLSearchParams(new URL(link).hash.slice(1)).get("token");
  const verified = await handleAccountRequest(
    db,
    new Request(config.origin + "/api/platform/account", {
      method: "POST",
      headers: { Origin: config.origin, "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "consume-verification", token })
    })
  );
  assert.equal(verified.status, 200);
  assert.ok(
    (await db.platformUser.findUniqueOrThrow({ where: { email } }))
      .emailVerifiedAt
  );
  await page.locator("#account-login-password").fill(password);
  await page.locator("#account-login-form button[type=submit]").click();
  await page.waitForURL("**/platform/churches");
  await bounded();
  ok(
    "Actual signup, isolated verification link consumption and sign-in preserve church destination without automatic membership"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/receipt.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        results,
        errors,
        delivery: "isolated service sink; no external mail"
      },
      null,
      2
    )
  );
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
