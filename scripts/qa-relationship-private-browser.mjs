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
const { seedPortal, assertPortalTestDatabase } =
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
const output = fixtureDir + "/relationship-private-browser";
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

const signIn = async (actor) =>
  context.addCookies([
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

const { randomUUID } = await import("node:crypto");
const { relationshipCommand } =
  await import("../lib/platform/relationships.ts");
try {
  const f = await seedPortal(db);
  await signIn(f.memberA);
  await go("/platform/settings");
  const privacy = () =>
    page.getByRole("region", { name: "Relationship privacy", exact: true });
  const mentions = () =>
      privacy().getByLabel("Who may mention you", { exact: true }),
    counts = () =>
      privacy().getByRole("checkbox", {
        name: "Show relationship counts on my profile",
        exact: true
      });
  await mentions().waitFor();
  await mentions().selectOption("FOLLOWED");
  await counts().uncheck();
  const bodies = [];
  let lose = true;
  await page.route("**/api/platform/relationships", async (route) => {
    const body = route.request().postData();
    if (body && JSON.parse(body).operation === "privacy") {
      bodies.push(body);
      const response = await route.fetch();
      if (lose) {
        lose = false;
        await route.abort("failed");
      } else await route.fulfill({ response });
    } else await route.continue();
  });
  await privacy()
    .getByRole("button", { name: "Save privacy choices", exact: true })
    .click();
  await privacy()
    .getByRole("button", { name: "Retry same privacy choices", exact: true })
    .click();
  await privacy()
    .getByText("Privacy choices saved.", { exact: true })
    .waitFor();
  assert.equal(bodies[0], bodies[1]);
  await page.unroute("**/api/platform/relationships");
  for (const choice of ["NOBODY", "EVERYONE"]) {
    await mentions().selectOption(choice);
    await privacy()
      .getByRole("button", { name: "Save privacy choices", exact: true })
      .click();
    await privacy()
      .getByText("Privacy choices saved.", { exact: true })
      .waitFor();
  }
  const other = await browser.newContext({
      viewport: { width: 1280, height: 900 }
    }),
    otherPage = await other.newPage();
  await otherPage.goto(
    config.origin + "/platform/login?next=%2Fplatform%2Fsettings"
  );
  await otherPage.locator("#account-login-email").fill(f.memberA.email);
  await otherPage.locator("#account-login-password").fill(f.memberA.password);
  await otherPage.locator("#account-login-form button[type=submit]").click();
  await otherPage.waitForURL("**/platform/settings");
  const otherPrivacy = otherPage.getByRole("region", {
    name: "Relationship privacy",
    exact: true
  });
  await otherPrivacy
    .getByLabel("Who may mention you", { exact: true })
    .waitFor();
  assert.equal(
    await otherPrivacy
      .getByLabel("Who may mention you", { exact: true })
      .inputValue(),
    "EVERYONE"
  );
  assert.equal(await otherPrivacy.getByRole("checkbox").isChecked(), false);
  await mentions().selectOption("NOBODY");
  await otherPrivacy
    .getByLabel("Who may mention you", { exact: true })
    .selectOption("FOLLOWED");
  await otherPrivacy
    .getByRole("button", { name: "Save privacy choices", exact: true })
    .click();
  await otherPrivacy
    .getByText("Privacy choices saved.", { exact: true })
    .waitFor();
  await privacy()
    .getByRole("button", { name: "Save privacy choices", exact: true })
    .click();
  await privacy()
    .getByRole("button", { name: "Review saved privacy choices", exact: true })
    .click();
  await privacy()
    .getByRole("button", {
      name: "Replace my selections with saved choices",
      exact: true
    })
    .waitFor();
  assert.equal(await mentions().inputValue(), "NOBODY");
  await privacy()
    .getByRole("button", {
      name: "Replace my selections with saved choices",
      exact: true
    })
    .click();
  assert.equal(await mentions().inputValue(), "FOLLOWED");
  await other.close();
  ok(
    "Privacy choices all save and reload in a second signed-in session; exact retry and two-session conflict preserve selected input"
  );
  await signIn(f.memberB);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await page.waitForFunction(
    () =>
      document.querySelector('select[aria-label="Who may mention you"]')
        ?.value === "EVERYONE"
  );
  assert.equal(await counts().isChecked(), true);
  await context.clearCookies({ name: "church_platform_session" });
  await go("/platform/settings");
  assert.equal(await privacy().count(), 0);
  ok(
    "Privacy values clear on account change and are absent from the guest settings gate"
  );
  await signIn(f.memberA);
  const targets = [];
  for (let i = 0; i < 27; i++) {
    const suffix = randomUUID().slice(0, 8);
    targets.push(
      await db.platformUser.create({
        data: {
          name: `Fictional library ${i} ${suffix}`,
          username: `rl_${suffix}`,
          email: `rl_${suffix}@example.test`
        }
      })
    );
  }
  await db.platformFollow.createMany({
    data: targets.map((t) => ({ followerId: f.memberA.id, followingId: t.id }))
  });
  for (const [index, operation] of [
    [0, "block"],
    [2, "mute"],
    [3, "favorite"],
    [4, "block"]
  ])
    await relationshipCommand(db, f.memberA.token, {
      operation,
      mutationId: randomUUID(),
      kind: "person",
      targetId: targets[index].id,
      expectedVersion: 0,
      desired: true
    });
  await db.platformUser.update({
    where: { id: targets[4].id },
    data: { suspendedAt: new Date() }
  });
  await go("/platform/relationships?view=following");
  const library = () =>
    page.getByRole("region", {
      name: "Private relationship library",
      exact: true
    });
  await page.waitForFunction(
    () => document.querySelectorAll("[data-relationship-id]").length === 20
  );
  const first = await page
    .locator("[data-relationship-id]")
    .evaluateAll((rows) => rows.map((r) => r.dataset.relationshipId));
  await library()
    .getByRole("link", { name: "More connections", exact: true })
    .click();
  await page.waitForURL("**/platform/relationships?view=following&after=*");
  await library()
    .getByRole("link", { name: "First page", exact: true })
    .waitFor();
  const secondURL = page.url();
  await page.waitForFunction(
    () => document.querySelectorAll("[data-relationship-id]").length === 5
  );
  const second = await page
    .locator("[data-relationship-id]")
    .evaluateAll((rows) => rows.map((r) => r.dataset.relationshipId));
  assert.equal(new Set([...first, ...second]).size, 25);
  const profileLink = library()
    .getByRole("link", { name: "Open profile", exact: true })
    .first();
  const profileHref = await profileLink.getAttribute("href");
  await profileLink.click();
  await page.waitForURL(config.origin + profileHref);
  await page.goBack();
  await page.waitForURL(secondURL);
  await page.waitForFunction(
    () => document.querySelectorAll("[data-relationship-id]").length === 5
  );
  assert.deepEqual(
    await page
      .locator("[data-relationship-id]")
      .evaluateAll((rows) => rows.map((r) => r.dataset.relationshipId)),
    second
  );
  ok(
    "Private following list pages 25 unique records and Back preserves the exact view and page cursor"
  );
  await library()
    .getByRole("link", { name: "Muted and snoozed", exact: true })
    .click();
  await page
    .getByText(`Connections with ${targets[2].name}`, { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Restore in feed", exact: true })
    .click();
  await library()
    .getByText("No connections in this view.", { exact: true })
    .waitFor();
  await library().getByRole("link", { name: "Blocked", exact: true }).click();
  await library()
    .getByText("Account or church unavailable", { exact: true })
    .waitFor();
  await page
    .getByText(`Connections with ${targets[0].name}`, { exact: true })
    .click();
  await page.getByRole("button", { name: "Unblock", exact: true }).click();
  await page
    .getByText(targets[0].name, { exact: true })
    .waitFor({ state: "detached" });
  assert.equal(
    await db.platformFollow.count({
      where: { followerId: f.memberA.id, followingId: targets[0].id }
    }),
    0
  );
  await library().getByRole("link", { name: "Favorites", exact: true }).click();
  await library().getByText(targets[3].name, { exact: true }).waitFor();
  await signIn(f.memberB);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await library()
    .getByText("No connections in this view.", { exact: true })
    .waitFor();
  assert.equal(await page.locator("[data-relationship-id]").count(), 0);
  await bounded();
  assert.deepEqual(errors, []);
  ok(
    "Private library restores mute, renders unavailable targets, unblocks without refollowing and clears rows on account change"
  );
  writeFileSync(
    output + "/receipt.json",
    JSON.stringify({ results, pageErrors: errors }, null, 2)
  );
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
