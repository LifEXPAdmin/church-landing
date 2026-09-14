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
const output = fixtureDir + "/participation-choice-browser";
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
const { randomUUID } = await import("node:crypto");
const { requestAccountGrant } = await import("../lib/platform/accounts.ts");
const { handleAccountRequest } =
  await import("../lib/platform/account-boundary.ts");
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
  const username = "explore_" + randomUUID().replaceAll("-", "").slice(0, 12);
  const email = username + "@example.test",
    password = "Fictional-explorer-password-17";
  const destination = "/platform/activity";
  await go("/platform/signup?next=" + encodeURIComponent(destination));
  const choice = page.getByLabel("How would you like to participate?", {
    exact: true
  });
  await choice.focus();
  await choice.press("Home");
  await choice.press("ArrowDown");
  await choice.press("Enter");
  assert.equal(await choice.inputValue(), "EXPLORING_FAITH");
  await page
    .getByText(
      "I’m learning about Christianity and figuring out what I believe.",
      { exact: true }
    )
    .waitFor();
  await page
    .getByLabel("Name", { exact: true })
    .fill("Fictional Exploring Reader");
  await page.getByLabel("Public username", { exact: true }).fill(username);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await bounded();
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.screenshot({ path: output + "/signup-320.png", fullPage: true });
  await page.route(
    "**/api/platform/account",
    async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Fictional temporary outage. Try again."
        })
      });
    },
    { times: 1 }
  );
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByText("Fictional temporary outage. Try again.").waitFor();
  assert.equal(await choice.inputValue(), "EXPLORING_FAITH");
  assert.equal(await db.platformUser.count({ where: { username } }), 0);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
  const saved = await db.platformUser.findUniqueOrThrow({
    where: { username }
  });
  assert.equal(saved.role, "EXPLORING_FAITH");
  assert.equal(saved.emailVerifiedAt, null);
  assert.equal(saved.adultAcknowledgedAt, null);
  assert.equal(
    await page.getByLabel("Email", { exact: true }).inputValue(),
    email
  );
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(config.origin + destination);
  ok(
    "Keyboard and 320/390/1280px signup preserve Exploring Faith through a failed response, real registration and sign-in return"
  );

  let grant = "";
  await requestAccountGrant(
    db,
    email,
    "VERIFY_EMAIL",
    async (_email, _purpose, token) => {
      grant = token;
    }
  );
  const verified = await handleAccountRequest(
    db,
    new Request(config.origin + "/api/platform/account", {
      method: "POST",
      headers: { Origin: config.origin, "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "consume-verification", token: grant })
    })
  );
  assert.equal(verified.status, 200);
  assert.ok(
    (await db.platformUser.findUniqueOrThrow({ where: { username } }))
      .emailVerifiedAt
  );
  await go("/platform/profile/me");
  const edit = page.getByLabel("How would you like to participate?", {
    exact: true
  });
  assert.equal(await edit.inputValue(), "EXPLORING_FAITH");
  await page.reload();
  assert.equal(await edit.inputValue(), "EXPLORING_FAITH");
  await edit.selectOption("CREATOR");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await page.waitForURL(config.origin + "/platform/profile/" + username);
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { username } })).role,
    "CREATOR"
  );
  await go("/platform/profile/me");
  assert.equal(await edit.inputValue(), "CREATOR");
  await edit.selectOption("EXPLORING_FAITH");
  await page.route(
    "**/api/platform/account",
    async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Fictional save interruption" })
      });
    },
    { times: 1 }
  );
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await page.getByText(/Fictional save interruption/).waitFor();
  assert.equal(await edit.inputValue(), "EXPLORING_FAITH");
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { username } })).role,
    "CREATOR"
  );
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await page.waitForURL(config.origin + "/platform/profile/" + username);
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { username } })).role,
    "EXPLORING_FAITH"
  );
  ok(
    "Verified choice survives reload, changes to an existing choice, and preserves edits through failed profile save and retry"
  );

  const reader = await createPortalActor(db, "choice_reader");
  await signIn(reader);
  await go("/platform/profile/" + username);
  assert.equal(
    await page.getByText("Exploring Faith", { exact: true }).count(),
    0
  );
  for (const headers of [{}, { RSC: "1" }]) {
    const response = await context.request.get(
      config.origin + "/platform/profile/" + username,
      { headers }
    );
    assert.equal(response.status(), 200);
    assert.ok(!(await response.text()).includes('"role":"EXPLORING_FAITH"'));
  }
  assert.equal(
    await db.churchConnection.count({ where: { userId: saved.id } }),
    0
  );
  assert.equal(
    await db.platformOperatorGrant.count({ where: { userId: saved.id } }),
    0
  );
  await context.clearCookies();
  await go("/platform/profile/" + username);
  assert.equal(
    await page.getByText("Exploring Faith", { exact: true }).count(),
    0
  );
  ok(
    "Other member and guest profiles disclose no faith-status badge; signup grants no church connection or operator authority"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        results,
        errors,
        productionWrites: 0
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
  await db.$disconnect();
}
