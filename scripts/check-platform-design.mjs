// Integration and browser checks run only against the disposable local test cluster.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { checkAccountBrowser } from "./check-account-browser.mjs";
const envPath = process.argv[2];
assert.ok(
  envPath?.startsWith(".account-test/run-") &&
    envPath.endsWith("/browser-env.json")
);
const env = JSON.parse(readFileSync(envPath));
assert.match(env.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
const url = new URL(env.database);
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/godschurches_security_test");
const db = new PrismaClient({ datasourceUrl: env.database });
const [actual] =
  await db.$queryRaw`SELECT current_database() AS name, host(inet_server_addr()) AS address`;
assert.equal(actual.name, "godschurches_security_test");
assert.equal(actual.address, "127.0.0.1");
const output = ".account-test/design/browser";
mkdirSync(output, { recursive: true, mode: 0o700 });
const username = "design_" + randomBytes(5).toString("hex");
const readerOnly = process.argv.includes("--reader-only");
const identity = readerOnly
  ? JSON.parse(readFileSync(output + "/identity-private.json"))
  : {
      username,
      email: username + "@example.test",
      name: "Fictional Design Reader",
      password: randomBytes(24).toString("base64url")
    };
writeFileSync(output + "/identity-private.json", JSON.stringify(identity), {
  mode: 0o600
});
const checks = [];
const pass = (name) => {
  checks.push(name);
  console.log("PASS " + name);
  writeFileSync(output + "/result.json", JSON.stringify({ checks }, null, 2), {
    mode: 0o600
  });
};
let browser;
try {
  await db.platformAuthLimit.deleteMany();
  if (!readerOnly) {
    const accounts = await checkAccountBrowser({
      ...env,
      identity,
      output: output + "/account-regression",
      onPageError: (error) =>
        writeFileSync(
          output + "/account-page-error-private.txt",
          String(error.stack),
          { mode: 0o600 }
        ),
      beforeLogin: () => db.platformAuthLimit.deleteMany(),
      onRegistered: async () => {
        const row = await db.platformUser.findUniqueOrThrow({
          where: { username: identity.username }
        });
        assert.ok(row.passwordHash);
        assert.equal(row.emailVerifiedAt, null);
      }
    });
    pass(
      `Existing account browser regression: ${accounts.checks.length} checks`
    );
  }
  await db.platformAuthLimit.deleteMany();
  const user = await db.platformUser.findUniqueOrThrow({
    where: { username: identity.username }
  });
  assert.match(user.username, /^design_[a-f0-9]{10}$/);
  await db.platformPost.deleteMany({ where: { authorId: user.id } });
  // Real schema, fictional local records only. Long text stress-tests reading independently of composer limits.
  const long = Array.from(
    { length: 20 },
    (_, i) =>
      `Paragraph ${i + 1}. This is fictional test content about making time to listen, sharing everyday life, serving a neighbour, and finding encouragement through community. This passage exists only in an isolated test database and does not represent a real member or church.`
  ).join("\n\n");
  const now = Date.now();
  const ids = [];
  for (let i = 0; i < 32; i++) {
    const p = await db.platformPost.create({
      data: {
        authorId: user.id,
        content:
          i === 1
            ? long
            : `Fictional design post ${i + 1}. A small act of kindness can make room for a conversation.`,
        type: i === 1 ? "TESTIMONY" : "UPDATE",
        createdAt: new Date(now - i * 1000)
      }
    });
    ids.push(p.id);
  }
  const { chromium } = createRequire(
    process.env.PLAYWRIGHT_MODULE ??
      `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`
  )("playwright");
  const pub = execFileSync("openssl", [
    "x509",
    "-in",
    env.certificate,
    "-pubkey",
    "-noout"
  ]);
  const der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], {
    input: pub
  });
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROMIUM_PATH ??
      `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium`,
    args: [
      "--ignore-certificate-errors-spki-list=" +
        createHash("sha256").update(der).digest("base64")
    ]
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    colorScheme: "light"
  });
  await context.route("**/*", (r) =>
    new URL(r.request().url()).origin === env.origin ? r.continue() : r.abort()
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(env.origin + "/platform/login");
  await page.locator("#account-login-email").fill(identity.email);
  await page.locator("#account-login-password").fill(identity.password);
  await page.locator("#account-login-form button[type=submit]").click();
  await page.waitForURL("**/platform");
  await page.locator(".gc-feed").waitFor();
  assert.equal(await page.locator(".gc-post").count(), 30);
  pass("Real signed-in home defaults to List with a finite 30-post batch");
  await page.getByRole("button", { name: "Pages", exact: true }).click();
  assert.equal(await page.locator(".gc-post").count(), 1);
  assert.equal(
    await page.locator("[data-top-previous]").getAttribute("aria-disabled"),
    "true"
  );
  await page.locator("[data-top-previous]").evaluate((n) => n.click());
  assert.match(
    await page.locator(".gc-post-body").innerText(),
    /design post 1/
  );
  await page.locator("[data-top-next]").focus();
  await page.keyboard.press("Enter");
  assert.match(await page.locator(".gc-post-body").innerText(), /Paragraph 20/);
  assert.ok(
    await page
      .locator("[data-top-next]")
      .evaluate((n) => n === document.activeElement)
  );
  assert.equal(await page.locator(".gc-post").count(), 1);
  assert.ok(
    await page
      .locator(".gc-post-body")
      .evaluate(
        (n) =>
          n.getBoundingClientRect().height > innerHeight &&
          n.scrollHeight <= n.clientHeight + 1
      )
  );
  pass(
    "Pages has stable keyboard focus, one article, no wrapping, and natural long-post height"
  );
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Pages", exact: true }).click();
  assert.match(await page.locator(".gc-post-body").innerText(), /Paragraph 20/);
  await page.reload();
  assert.match(await page.locator(".gc-post-body").innerText(), /Paragraph 20/);
  await page.locator(".gc-post-author").click();
  await page.waitForURL("**/platform/profile/**");
  await page.goBack();
  await page.locator(".gc-post-body").first().waitFor();
  assert.match(await page.locator(".gc-post-body").innerText(), /Paragraph 20/);
  pass(
    "Pages/List switch, reload, and profile Back preserve the selected post"
  );
  await page.locator(".gc-discussion summary").click();
  const comment = page.getByLabel("Add a comment");
  await comment.fill("Fictional design check comment");
  await comment.press("ArrowLeft");
  assert.match(await page.locator(".gc-post-body").innerText(), /Paragraph 20/);
  const commentResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/platform"
  );
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const committed = await commentResponse;
  assert.ok(committed.status() < 400);
  // Flight streams can remain open. Assert the committed UI, not transport closure.
  await page.waitForFunction(
    () =>
      document.querySelector(".gc-discussion summary span")?.textContent === "1"
  );
  assert.match(await page.locator(".gc-post-body").innerText(), /Paragraph 20/);
  assert.equal(
    await db.platformPostComment.count({
      where: { postId: ids[1], authorId: user.id }
    }),
    1
  );
  pass(
    "Discussion writes once to the current real post; input arrows do not navigate the feed"
  );
  await page.locator(".gc-reaction[aria-pressed]").click();
  await page.waitForFunction(
    () => document.querySelector('.gc-reaction[aria-pressed="true"]') !== null
  );
  assert.match(await page.locator(".gc-post-body").innerText(), /Paragraph 20/);
  assert.equal(
    await db.platformPostLike.count({
      where: { postId: ids[1], userId: user.id }
    }),
    1
  );
  pass("A real reaction preserves the selected post and updates its state");
  // Synthetic touch dispatch checks event logic, not a physical device or browser scroll implementation.
  const swipe = async (dx, dy = 0, edge = false) =>
    page.locator(".gc-post-body").evaluate(
      (n, { dx, dy, edge }) => {
        const startX = edge ? 10 : 220,
          y = 200;
        const t = new Touch({
          identifier: 1,
          target: n,
          clientX: startX,
          clientY: y
        });
        n.dispatchEvent(
          new TouchEvent("touchstart", { bubbles: true, touches: [t] })
        );
        const end = new Touch({
          identifier: 1,
          target: n,
          clientX: startX + dx,
          clientY: y + dy
        });
        n.dispatchEvent(
          new TouchEvent("touchmove", { bubbles: true, touches: [end] })
        );
        n.dispatchEvent(
          new TouchEvent("touchend", {
            bubbles: true,
            changedTouches: [end],
            touches: []
          })
        );
      },
      { dx, dy, edge }
    );
  await swipe(-110, 50);
  assert.match(await page.locator(".gc-post-body").innerText(), /Paragraph 20/);
  await swipe(110, 0, true);
  assert.match(await page.locator(".gc-post-body").innerText(), /Paragraph 20/);
  await swipe(-110);
  await page.waitForFunction(() =>
    document
      .querySelector(".gc-post-body")
      ?.textContent?.includes("design post 3")
  );
  assert.match(
    await page.locator(".gc-post-body").innerText(),
    /design post 3/
  );
  await swipe(110);
  await page.waitForFunction(() =>
    document
      .querySelector(".gc-post-body")
      ?.textContent?.includes("Paragraph 20")
  );
  assert.match(await page.locator(".gc-post-body").innerText(), /Paragraph 20/);
  pass(
    "Supplementary touch logic navigates horizontally but ignores vertical gestures and browser edges"
  );
  await page.goto(env.origin + "/platform/settings");
  await page.locator("#appearance").selectOption("dark");
  await page.locator("#reader-size").selectOption("largest");
  await page.locator("#reduce-motion").check();
  assert.equal(
    await page
      .locator(".gc-shell")
      .evaluate((n) =>
        getComputedStyle(n).getPropertyValue("--gc-canvas").trim()
      ),
    "#151d19"
  );
  await page.reload();
  assert.equal(await page.locator("#appearance").inputValue(), "dark");
  assert.equal(await page.locator("#reader-size").inputValue(), "largest");
  // Cookie-derived HTML prevents a forced-light flash before client hydration.
  const html = await page.evaluate(() =>
    fetch(location.href).then((response) => response.text())
  );
  assert.ok(html.includes('data-appearance="dark"'));
  pass(
    "Appearance, reading size and local reduced motion persist, including server-rendered appearance"
  );
  await page.goto(env.origin + `/platform?mode=pages&post=${ids[1]}`);
  assert.equal(
    await page
      .locator(".gc-post-body")
      .evaluate((n) => getComputedStyle(n).fontSize),
    "24px"
  );
  assert.equal(
    await page
      .locator(".gc-post-page")
      .evaluate((n) => getComputedStyle(n).animationName),
    "none"
  );
  await page.screenshot({
    path: output + "/mobile-pages-dark.png",
    fullPage: false
  });
  pass("Largest reader text and reduced motion apply to real Pages content");
  await page.goto(env.origin + "/platform/settings");
  await page.locator("#reduce-motion").uncheck();
  await page.locator("#appearance").selectOption("system");
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto(env.origin + `/platform?mode=pages&post=${ids[0]}`);
  assert.equal(
    await page
      .locator(".gc-shell")
      .evaluate((n) =>
        getComputedStyle(n).getPropertyValue("--gc-canvas").trim()
      ),
    "#f7f4ed"
  );
  assert.equal(
    await page
      .locator(".gc-post-page")
      .evaluate((n) => getComputedStyle(n).animationName),
    "none"
  );
  await page.emulateMedia({ colorScheme: "dark" });
  assert.equal(
    await page
      .locator(".gc-shell")
      .evaluate((n) =>
        getComputedStyle(n).getPropertyValue("--gc-canvas").trim()
      ),
    "#151d19"
  );
  pass(
    "System appearance follows OS changes; OS reduced motion cannot be overridden"
  );
  await page.emulateMedia({
    colorScheme: "light",
    reducedMotion: "no-preference"
  });
  await page.goto(env.origin + "/platform/settings");
  await page.locator("#reader-size").selectOption("comfortable");
  await page.locator("#feed-mode").selectOption("list");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "/platform",
      "/platform/search",
      "/platform/settings",
      "/platform/profile/me",
      "/platform/my-church",
      "/platform/help"
    ]) {
      await page.goto(env.origin + route);
      await page.waitForLoadState("networkidle");
      assert.equal(await page.locator("main").count(), 1, route);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1
        ),
        `${route} reflow at ${width}`
      );
    }
    if (width === 320) {
      await page.getByRole("button", { name: "Menu", exact: true }).click();
      assert.ok(
        await page
          .getByRole("navigation", { name: "Platform", exact: true })
          .isVisible()
      );
      await page
        .getByRole("navigation", { name: "Platform", exact: true })
        .getByRole("link", { name: "Home", exact: true })
        .click();
      assert.equal(
        await page
          .getByRole("button", { name: "Menu", exact: true })
          .getAttribute("aria-expanded"),
        "false"
      );
    }
    await page.goto(env.origin + "/platform?mode=pages");
    await page.screenshot({
      path: output + `/home-light-${width}.png`,
      fullPage: width === 1440
    });
  }
  pass(
    "320, 390, 768 and 1440px core routes reflow; compact menu works without tiny labels"
  );
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(env.origin + "/platform/settings");
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    )
  );
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  assert.ok(
    await page
      .getByRole("navigation", { name: "Platform", exact: true })
      .isVisible()
  );
  pass(
    "200% base text at 320px retains settings and navigation without horizontal overflow"
  );
  await page.goto(env.origin + `/platform?mode=pages&post=${ids[29]}`);
  assert.equal(
    await page.locator("[data-top-next]").getAttribute("aria-disabled"),
    "true"
  );
  const older = page.getByRole("link", { name: "Read older posts" });
  assert.ok(await older.isVisible());
  await older.click();
  await page.waitForLoadState("networkidle");
  assert.match(
    await page.locator(".gc-post-body").first().innerText(),
    /design post 31/
  );
  assert.ok(
    !(await page.locator(".gc-post-body").allTextContents()).some((t) =>
      t.includes("design post 30")
    )
  );
  pass(
    "Explicit older-post cursor advances without overlap and end does not wrap"
  );
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto(env.origin + "/platform?mode=pages");
  await page.locator("[data-top-next]").focus();
  assert.equal(
    await page
      .locator("[data-top-next]")
      .evaluate((n) => getComputedStyle(n).outlineStyle),
    "solid"
  );
  pass("Forced-colors keyboard focus remains visible");
  await page.emulateMedia({ forcedColors: "none" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(env.origin + "/platform");
  await page.getByRole("button", { name: "Share a post", exact: true }).click();
  assert.ok(
    await page
      .getByLabel("Post content")
      .evaluate((n) => n === document.activeElement)
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const postContent =
    "Fictional browser composer check. Local synthetic content only.";
  await page.getByLabel("Post content").fill(postContent);
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await page.waitForFunction(
    (text) =>
      [...document.querySelectorAll(".gc-post-body")].some(
        (n) => n.textContent === text
      ),
    postContent
  );
  assert.equal(
    await db.platformPost.count({
      where: { authorId: user.id, content: postContent }
    }),
    1
  );
  pass("Desktop composer focus and mobile real post submission save once");
  assert.deepEqual(errors, []);
  pass("No browser runtime exceptions across tested workflows");
} finally {
  await browser?.close();
  await db.$disconnect();
}
