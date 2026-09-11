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
const { createPortalActor, assertPortalTestDatabase } =
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
const output = fixtureDir + "/medium-browser";
mkdirSync(output, { recursive: true });
const go = async (path) => {
  await page.goto(config.origin + path);
  await page.waitForLoadState("networkidle");
};
const bounded = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal page overflow"
  );
let savedPosts = [],
  savedChurches = [];
try {
  const actor = await createPortalActor(db, "medium");
  writeFileSync(output + "/actor.json", JSON.stringify(actor), { mode: 0o600 });
  // Empty guest and new member acceptance on disposable fixtures; restore all fields.
  savedPosts = await db.platformPost.findMany({
    select: { id: true, status: true, updatedAt: true, pinUntil: true }
  });
  savedChurches = await db.church.findMany({
    select: { id: true, communityListed: true }
  });
  await db.platformPost.updateMany({
    data: { status: "WITHDRAWN", pinUntil: null }
  });
  await db.church.updateMany({ data: { communityListed: false } });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await go("/platform");
    assert.equal(
      await page
        .getByRole("heading", { name: "No posts yet.", exact: true })
        .count(),
      1
    );
    assert.equal(
      await page
        .getByRole("link", { name: "Join Godschurches", exact: true })
        .count(),
      1
    );
    await bounded();
    await page.screenshot({
      path: output + `/guest-empty-${width}.png`,
      fullPage: true
    });
  }
  ok(
    "Guest empty Home at 320/390: clear Join, real empty-state links, no overflow"
  );
  await go("/platform/menu");
  await page.getByRole("link", { name: /Your profile/ }).click();
  await page.waitForURL("**/platform/profile/me");
  await page.waitForFunction(
    () => document.title === "Join or sign in to view member profiles."
  );
  assert.equal(
    await page.locator("h1").innerText(),
    "Join or sign in to view member profiles."
  );
  const announcer = await page.evaluate(
    () =>
      document.querySelector("next-route-announcer")?.shadowRoot?.textContent ||
      ""
  );
  assert.ok(announcer.includes("Join or sign in to view member profiles."));
  await page.goBack();
  await page.waitForURL("**/platform/menu");
  assert.equal(await page.getByRole("dialog").count(), 0);
  ok(
    "Menu/profile guest gate: title, H1, route announcement and Back; Menu is a full page"
  );
  await go("/platform/settings");
  await page.waitForURL("**/platform/join?**");
  assert.equal(
    await page.title(),
    "Join or sign in to manage your account settings."
  );
  await page.getByRole("link", { name: "Sign in", exact: true }).last().click();
  await page.getByLabel("Email", { exact: true }).fill(actor.email);
  await page.getByLabel("Password", { exact: true }).fill(actor.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/platform/settings");
  ok(
    "Settings guest gate preserves destination through real fictional-account sign-in"
  );
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await go("/platform");
    await bounded();
    assert.equal(
      await page
        .getByRole("heading", { name: "No posts yet.", exact: true })
        .count(),
      1
    );
    await page.screenshot({
      path: output + `/member-empty-${width}.png`,
      fullPage: true
    });
  }
  ok("New member without posts/churches has honest empty Home at 320/390");
  await page.setViewportSize({ width: 320, height: 844 });
  await go("/platform/profile/me");
  assert.equal(await page.title(), "Edit your Godschurches profile");
  await page
    .getByLabel("Bio (optional)", { exact: true })
    .fill("Fictional unsaved medium review");
  const menu = page
    .getByRole("navigation", { name: "Platform", exact: true })
    .getByRole("link", { name: "Menu", exact: true });
  await menu.click();
  await page.getByRole("dialog").waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Keep editing", exact: true })
      .evaluate((el) => el === document.activeElement),
    true
  );
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(
    await menu.evaluate((el) => el === document.activeElement),
    true
  );
  await menu.click();
  await page.getByRole("dialog").waitFor();
  const y = await page.evaluate(() => scrollY);
  await page.mouse.move(5, 300);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(250);
  const yAfter = await page.evaluate(() => scrollY);
  writeFileSync(output + "/dialog-scroll.json", JSON.stringify({ y, yAfter }));
  assert.equal(yAfter, y, "Native modal locks background scrolling");
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  assert.notEqual(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).overflow
    ),
    "hidden",
    "Closing native modal restores scrolling"
  );
  assert.equal(
    await page.getByLabel("Bio (optional)", { exact: true }).inputValue(),
    "Fictional unsaved medium review"
  );
  await menu.click();
  await page
    .getByRole("button", {
      name: "Discard unsaved changes and leave",
      exact: true
    })
    .click();
  await page.waitForURL("**/platform/menu");
  assert.equal(
    (await db.platformUser.findUnique({ where: { id: actor.id } })).bio,
    null
  );
  ok(
    "Profile dialog: focus, Escape, keep, reopen and discard without saving; background scroll lock verified"
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await go("/platform/profile/me");
  await page
    .getByLabel("Bio (optional)", { exact: true })
    .fill("Another unsaved fixture");
  await menu.click();
  await page.getByRole("dialog").waitFor();
  await bounded();
  const narrowY = await page.evaluate(() => scrollY);
  await page.mouse.move(5, 300);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => scrollY), narrowY);
  await page.screenshot({
    path: output + "/profile-dialog-390.png",
    fullPage: true
  });
  await page.keyboard.press("Tab");
  assert.ok(
    await page
      .getByRole("dialog")
      .evaluate((el) => el.contains(document.activeElement))
  );
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(
    await menu.evaluate((el) => el === document.activeElement),
    true
  );
  await menu.click();
  await page
    .getByRole("button", {
      name: "Discard unsaved changes and leave",
      exact: true
    })
    .click();
  await page.waitForURL("**/platform/menu");
  ok(
    "Profile dialog regression at both 320/390: scroll lock, keyboard containment and focus restoration"
  );
  // Restore prior disposable fixture state before populated journeys.
  for (const p of savedPosts)
    await db.platformPost.update({
      where: { id: p.id },
      data: { status: p.status, updatedAt: p.updatedAt, pinUntil: p.pinUntil }
    });
  savedPosts = [];
  for (const c of savedChurches)
    await db.church.update({
      where: { id: c.id },
      data: { communityListed: c.communityListed }
    });
  savedChurches = [];
  const marker = "MediumPost" + Date.now();
  await db.platformPost.create({
    data: {
      authorId: actor.id,
      content: marker + " fictional public conversation",
      type: "TESTIMONY"
    }
  });
  const church = await db.church.create({
    data: {
      name: "MediumChurch" + Date.now(),
      slug: "medium-" + Date.now(),
      summary: "Fictional church search acceptance",
      communityListed: true
    }
  });
  await context.clearCookies();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await go("/platform");
    await bounded();
    await page
      .getByRole("navigation", { name: "Platform", exact: true })
      .getByRole("link", { name: "My feed", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Close My feed", exact: true })
      .waitFor();
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Close My feed", exact: true })
      .waitFor({ state: "hidden" });
    assert.equal(
      await page.evaluate(() => document.body.style.overflow === "hidden"),
      false
    );
  }
  ok(
    "Populated guest Home and focused reader open/Escape restore scrolling at 320/390"
  );
  await go("/platform/search?q=" + encodeURIComponent(marker));
  assert.ok((await page.locator("main").innerText()).includes(marker));
  assert.ok(!(await page.locator("main").innerText()).includes(church.name));
  await go("/platform/search?q=" + encodeURIComponent(church.name));
  assert.ok(
    (await page.locator("main").innerText()).includes("No posts found.")
  );
  await page
    .getByRole("link", { name: "Search churches", exact: true })
    .click();
  await page.waitForURL("**/platform/churches?**");
  assert.equal(new URL(page.url()).searchParams.get("q"), church.name);
  assert.ok((await page.locator("main").innerText()).includes(church.name));
  await page.goBack();
  await page.waitForURL("**/platform/search?**");
  assert.equal(await page.getByRole("searchbox").inputValue(), church.name);
  for (const query of [
    "  Peace & café / 平安 ?  ",
    "% <script>",
    "x".repeat(210),
    "   "
  ]) {
    await page.getByRole("searchbox").fill(query);
    const href = await page
      .getByRole("link", { name: "Search churches", exact: true })
      .getAttribute("href");
    assert.equal(
      new URL(href, config.origin).searchParams.get("q") || "",
      query.trim().slice(0, 100)
    );
  }
  await go("/platform/search?q=" + actor.username);
  const transferredQuery = "Grace & café + 100%";
  await page.getByRole("searchbox").fill(transferredQuery);
  await page.getByRole("link", { name: "Search churches", exact: true }).click();
  await page.waitForURL("**/platform/churches?**");
  assert.equal(new URL(page.url()).searchParams.get("q"), transferredQuery);
  await page.goBack();
  await page.waitForURL("**/platform/search?**");
  assert.equal(await page.getByRole("searchbox").inputValue(), transferredQuery);
  await go("/platform/search?q=" + actor.username);
  await page.getByRole("link", { name: new RegExp(actor.name) }).click();
  await page.waitForFunction(
    () => document.title === "Join or sign in to view member profiles."
  );
  assert.ok(!(await page.locator("main").innerText()).includes(actor.email));
  ok(
    "Explore post/person/church-only fixtures, literal Unicode/encoded/empty/bounded transfer, Back and member-profile gate"
  );
  assert.equal(
    await db.platformPost.count({ where: { authorId: actor.id } }),
    1
  );
  assert.equal(
    await db.platformFollow.count({ where: { followerId: actor.id } }),
    0
  );
  ok("Navigation caused no extra post, follow or membership action");
  assert.deepEqual(errors, []);
  ok("No browser page errors");
  writeFileSync(
    output + "/results.json",
    JSON.stringify({ results, errors }, null, 2)
  );
} finally {
  for (const p of savedPosts)
    await db.platformPost.update({
      where: { id: p.id },
      data: { status: p.status, updatedAt: p.updatedAt, pinUntil: p.pinUntil }
    });
  for (const c of savedChurches)
    await db.church.update({
      where: { id: c.id },
      data: { communityListed: c.communityListed }
    });
  await browser.close();
  await db.$disconnect();
}
