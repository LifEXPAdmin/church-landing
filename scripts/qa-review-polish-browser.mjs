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
const output = fixtureDir + "/review-polish-browser";
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

try {
  const f = await seedPortal(db);
  await db.platformPost.create({
    data: {
      authorId: f.memberA.id,
      content: "Fictional review post",
      publishedAt: new Date()
    }
  });
  for (const width of [1348, 390, 320]) {
    await page.setViewportSize({ width, height: 926 });
    await go("/platform?feed=latest&mode=list");
    await page.getByRole("group", { name: "Main feeds" }).waitFor();
    await page.waitForFunction(
      () => !document.querySelector('[aria-label="Choose feed"]')?.disabled
    );
    assert.equal(
      await page
        .getByRole("complementary", { name: "Updates and connection" })
        .count(),
      0
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Refresh posts", exact: true })
        .count(),
      1
    );
    assert.deepEqual(
      await page
        .getByRole("group", { name: "Main feeds" })
        .getByRole("button")
        .allTextContents(),
      ["Latest", "Friends", "Top This Week", "Trending"]
    );
    assert.equal(
      await page
        .getByRole("combobox", { name: "Choose feed" })
        .locator("option")
        .count(),
      8
    );
    await page
      .getByRole("link", { name: "Create an account", exact: true })
      .waitFor();
    assert.match(
      await page.locator(".gc-mission").innerText(),
      /God’s Churches/
    );
    const top = await page
      .locator(".gc-post")
      .first()
      .evaluate((el) => el.getBoundingClientRect().top);
    if (width === 1348)
      assert.ok(
        top < 926,
        "First post should start in the initial desktop viewport: " + top
      );
    await bounded();
    await page.screenshot({
      path: output + `/home-${width}.png`,
      fullPage: false
    });
    ok(
      `Home at ${width}px: one refresh, all feeds available, quiet header, no overflow; first post starts at ${Math.round(top)}px`
    );
    await page
      .getByRole("button", { name: "Open My feed", exact: true })
      .click();
    await page.getByRole("dialog", { name: "My feed", exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Open My feed", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Open My feed", exact: true })
        .evaluate((el) => el === document.activeElement),
      true
    );
    for (const path of [
      "/platform/signup",
      "/platform/login",
      "/platform/churches",
      "/platform/menu"
    ]) {
      await go(path);
      await page.locator("main").waitFor();
      assert.doesNotMatch(
        await page.locator("main").innerText(),
        /Godschurches/
      );
      await bounded();
    }
    ok(
      `Account, church and Menu branding fit ${width}px; full-screen reader returns keyboard focus`
    );
  }
  const manifest = await (
    await context.request.get(config.origin + "/manifest.webmanifest")
  ).json();
  assert.equal(manifest.name, "God’s Churches");
  assert.equal(manifest.short_name, "God’s Churches");
  assert.equal(manifest.id, "/");
  await signIn(f.memberA);
  await go("/platform?feed=latest&mode=list");
  const loaded = await page
    .locator(".platform-design[data-release]")
    .first()
    .getAttribute("data-release");
  let available = loaded;
  await page.route("**/api/platform/release", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ release: available })
    })
  );
  const manual = () =>
    page
      .getByRole("contentinfo")
      .getByRole("button", { name: "Check for updates", exact: true });
  const checkUpdate = async () => {
    await manual().click();
    await page.waitForFunction(
      () =>
        !document.querySelector('[aria-label="App update controls"] button')
          ?.disabled
    );
  };
  await checkUpdate();
  await page
    .getByRole("contentinfo")
    .getByText("This tab is up to date.", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("complementary", { name: "Updates and connection" })
      .count(),
    0
  );
  available = "2".repeat(40);
  await checkUpdate();
  await page
    .getByRole("button", { name: "Refresh now", exact: true })
    .waitFor();
  await page.locator("#compose-post > summary").click();
  const field = page
    .getByRole("form", { name: "Publish post", exact: true })
    .getByLabel("Post content", { exact: true });
  await field.fill("Fictional unsent work stays here");
  await page.locator('[data-update-decision="keep-work"]').waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Refresh now", exact: true })
      .count(),
    0
  );
  await page
    .getByRole("button", { name: "See what’s new", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "What’s new in the available release" })
    .waitFor();
  await page.getByRole("button", { name: "Close notes", exact: true }).click();
  assert.equal(await field.inputValue(), "Fictional unsent work stays here");
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page
    .getByRole("button", { name: "Retry connection", exact: true })
    .waitFor();
  assert.equal(await field.inputValue(), "Fictional unsent work stays here");
  await page.screenshot({
    path: output + "/offline-unsent-320.png",
    fullPage: false
  });
  await context.setOffline(false);
  await page
    .getByRole("button", { name: "Retry connection", exact: true })
    .click();
  await page.locator('[data-update-decision="keep-work"]').waitFor();
  assert.equal(await field.inputValue(), "Fictional unsent work stays here");
  ok(
    "Footer checks and current status stay quiet; update, offline and unsent-work notices retain explicit safe recovery and unchanged draft text"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify({ at: new Date().toISOString(), results, errors }, null, 2),
    { mode: 0o600 }
  );
} finally {
  await browser.close();
  await db.$disconnect();
}
