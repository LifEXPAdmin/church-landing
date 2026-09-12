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
const output = fixtureDir + "/help-settings-browser";
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
const originalIntake = await db.supportIntakeSetting.findUnique({
  where: { id: "default" }
});
try {
  const { seedSupport } = await import("../tests/seed-support.ts");
  await seedSupport(db);
  const a = await createPortalActor(db, "helpfolder");
  await signIn(a);
  await go("/platform/settings/help");
  const help = page.getByRole("region", { name: "Settings help", exact: true });
  await help.waitFor();
  const search = page.getByRole("searchbox", {
    name: "Search settings help",
    exact: true
  });
  await search.fill("  QUIET   hours ");
  const quiet = help.locator("details");
  assert.equal(await quiet.count(), 1);
  await quiet.locator("summary").focus();
  await page.keyboard.press("Enter");
  assert.match(
    await quiet.innerText(),
    /Quiet hours, delivery channels and notification categories are unavailable/
  );
  await quiet.getByRole("link").click();
  await page.waitForURL("**/settings/notifications/availability");
  await page
    .getByText(
      "In-app notification categories, email alerts, push and quiet hours are not available yet.",
      { exact: true }
    )
    .waitFor();
  await go("/platform/settings/help");
  await help.waitFor();
  await search.fill("unknown help term");
  await help
    .getByText(
      "No matching help. Try another word or open Help and contacts.",
      { exact: true }
    )
    .waitFor();
  await help
    .getByRole("link", { name: "Get help or find contacts", exact: true })
    .waitFor();
  await search.fill("<script>private secret</script>");
  assert.equal(await help.locator("details").count(), 0);
  await search.fill("");
  for (const details of await help.locator("details").all())
    await details.locator("summary").click();
  assert.match(await help.innerText(), /sign-in email stays private/);
  assert.match(
    await help.innerText(),
    /Calendar and event-series shares are separate/
  );
  assert.match(await help.innerText(), /five reading choices/);
  assert.match(await help.innerText(), /does not reset your profile/);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "32px")
    );
    await bounded();
    await page.screenshot({
      path: output + "/help-" + width + ".png",
      fullPage: true
    });
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: output + "/help-phone.png", fullPage: true });
  ok(
    "Help search supports multiple words, empty/no-match states and keyboard disclosure; approved summaries and contact fallback fit narrow/doubled text"
  );

  const { settingsHelpTopics } =
    await import("../lib/platform/settings-help.ts");
  const { settingsRegistry } =
    await import("../lib/platform/settings-registry.ts");
  for (const topic of settingsHelpTopics) {
    const r = await context.request.get(config.origin + topic.href);
    assert.equal(r.status(), 200, topic.href);
  }
  for (const entry of settingsRegistry.filter((s) => s.folder === "help")) {
    const href = entry.destination.href;
    assert.ok(href);
    const response = await page.goto(config.origin + href);
    assert.equal(response.status(), 200, href);
    await page.getByRole("heading", { level: 1 }).waitFor();
    if (href === "/privacy" || href === "/terms")
      await page.getByText(/Service information updated/).waitFor();
  }
  await go("/platform/settings/help");
  await help.waitFor();
  const loaded = help.getByRole("link", {
    name: "App version 2026.09.12.18",
    exact: true
  });
  await loaded.waitFor();
  const release = await (
    await context.request.get(config.origin + "/api/platform/release")
  ).json();
  assert.equal(release.product.version, "2026.09.12.18");
  await loaded.click();
  await page
    .getByRole("heading", { name: "Version 2026.09.12.18", exact: true })
    .waitFor();
  await page
    .getByRole("link", { name: "All release notes", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Version 2026.09.12.17", exact: true })
    .waitFor();
  ok(
    "Every current help/topic/policy destination resolves; policy dates stay on their source pages and loaded version reuses retained release content"
  );

  await go("/platform/settings/help");
  await help.waitFor();
  await help
    .getByRole("link", { name: "Get help or find contacts", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Help and contacts", exact: true })
    .waitFor();
  const contact = page.locator('a[href^="mailto:"]');
  assert.ok(await contact.count());
  await page
    .getByText(
      "This opens your email app. Nothing is submitted through this page. Never send your password or sign-in codes.",
      { exact: true }
    )
    .waitFor();
  await page.getByRole("link", { name: "Get help", exact: true }).click();
  const form = page.getByRole("form", { name: "Send request", exact: true });
  await form.waitFor();
  await form
    .getByLabel("Short summary", { exact: true })
    .fill("Fictional phone support question");
  await form
    .getByLabel("What happened, and what would help?", { exact: true })
    .fill(
      "Fictional message preserved through a failed request; do not send externally."
    );
  await form.getByRole("checkbox").check();
  const attempts = [];
  await page.route("**/api/platform/support", async (route) => {
    attempts.push(route.request().postData());
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Fictional temporary failure. Your request is not confirmed."
      })
    });
  });
  await form.getByRole("button", { name: "Send request", exact: true }).click();
  await form
    .getByRole("alert")
    .filter({ hasText: /Fictional temporary failure/ })
    .waitFor();
  assert.equal(
    await form.getByLabel("Short summary", { exact: true }).inputValue(),
    "Fictional phone support question"
  );
  assert.match(
    await form
      .getByLabel("What happened, and what would help?", { exact: true })
      .inputValue(),
    /preserved through a failed request/
  );
  await form
    .getByRole("button", { name: /Retry|Send request/, exact: false })
    .last()
    .click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[aria-label="Send request"]')
        ?.getAttribute("aria-busy") === "false"
  );
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0], attempts[1]);
  assert.equal(await page.locator('input[type="file"]').count(), 0);
  await bounded();
  await page.screenshot({
    path: output + "/support-phone-failure.png",
    fullPage: true
  });
  await page.unroute("**/api/platform/support");
  ok(
    "Phone support route discloses its recipient; simulated failure preserves text and identical request-key retry, with no attachment or external submission"
  );

  const guest = await browser.newContext({
      viewport: { width: 390, height: 844 }
    }),
    g = await guest.newPage();
  await g.goto(config.origin + "/platform/settings/help");
  assert.equal(
    new URL(g.url()).searchParams.get("next"),
    "/platform/settings/help"
  );
  await g.goto(config.origin + "/platform/help");
  await g
    .getByRole("heading", { name: "Help and contacts", exact: true })
    .waitFor();
  assert.ok(await g.locator('a[href^="mailto:"]').count());
  assert.equal(
    await g.getByRole("form", { name: "Send request", exact: true }).count(),
    0
  );
  assert.ok(
    await g.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    )
  );
  await guest.close();
  assert.deepEqual(errors, []);
  ok(
    "Guest Settings preserves sign-in return while direct Help remains readable without private request or church contact disclosure"
  );
  writeFileSync(
    output + "/result.json",
    JSON.stringify({ results, errors }, null, 2)
  );
  console.log("HELP_SETTINGS_BROWSER_PASS " + results.length);
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.txt",
    await page
      .locator("body")
      .innerText()
      .catch(() => "")
  );
  throw error;
} finally {
  if (originalIntake)
    await db.supportIntakeSetting.update({
      where: { id: "default" },
      data: {
        ownerGrantId: originalIntake.ownerGrantId,
        enabled: originalIntake.enabled,
        approvedNoticeVersion: originalIntake.approvedNoticeVersion
      }
    });
  await browser.close();
  await db.$disconnect();
}
