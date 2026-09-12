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
const output = fixtureDir + "/repost-referral-browser";
mkdirSync(output, { recursive: true });
const go = async (path) => {
  await page.goto(config.origin + path);
};
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
  await page.goto("about:blank");
};

page.setDefaultTimeout(20000);

const { randomUUID } = await import("node:crypto");
const { repostCommand } = await import("../lib/platform/reposts.ts");
const pause = async (predicate) => {
  for (let i = 0; i < 100; i++) {
    if (await predicate()) return;
    await page.waitForTimeout(100);
  }
  throw Error("Expected fixture state did not appear");
};
await context.addInitScript(() => {
  window.fixtureShares = [];
  window.fixtureClipboard = "";
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: async (value) => {
      window.fixtureShares.push(value);
    }
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (value) => {
        window.fixtureClipboard = value;
      }
    }
  });
});
try {
  const author = await createPortalActor(db, "refauthor"),
    actor = await createPortalActor(db, "refactor");
  const source = await db.platformPost.create({
    data: {
      authorId: author.id,
      content: "Original referral source marker",
      allowReposts: true,
      publishedAt: new Date()
    }
  });
  const plain = await repostCommand(db, actor.token, {
    operation: "repost",
    mutationId: randomUUID(),
    sourceId: source.id,
    expectedSourceVersion: 1
  });
  await signIn(actor);
  await go(`/platform/posts/${plain.id}`);
  await page.getByLabel("Original post preview").waitFor();
  const before = await db.platformPost.count({ where: { authorId: actor.id } });
  await page.getByRole("button", { name: "Share post", exact: true }).click();
  const share = page.getByRole("dialog", { name: "Share post", exact: true });
  await share.getByRole("button", { name: "Copy link", exact: true }).click();
  await pause(
    async () => !!(await page.evaluate(() => window.fixtureClipboard))
  );
  const copied = await page.evaluate(() => window.fixtureClipboard);
  assert.equal(copied, config.origin + `/platform/posts/${source.id}`);
  await page.getByRole("button", { name: "Share post", exact: true }).click();
  await share
    .getByRole("button", { name: "Share externally", exact: true })
    .click();
  await pause(
    async () => (await page.evaluate(() => window.fixtureShares)).length === 1
  );
  assert.equal(
    (await page.evaluate(() => window.fixtureShares))[0].url,
    copied
  );
  assert.equal(
    await db.platformPost.count({ where: { authorId: actor.id } }),
    before
  );
  assert.equal(
    await db.savedPostItem.count({ where: { ownerId: actor.id } }),
    0
  );
  await page.keyboard.press("Escape");
  ok(
    "Copy/native-handoff simulation uses the original canonical URL and creates no repost, quote or private bookmark"
  );
  await page.getByRole("button", { name: "Share post", exact: true }).click();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw Error("Fixture clipboard unavailable");
        }
      }
    })
  );
  await share.getByRole("button", { name: "Copy link", exact: true }).click();
  await share
    .getByText(
      "The link was not copied. Select and copy the public link below.",
      { exact: true }
    )
    .waitFor();
  assert.equal(
    await share.getByLabel("Public link", { exact: true }).inputValue(),
    copied
  );
  assert.equal(
    await db.platformPost.count({ where: { authorId: actor.id } }),
    before
  );
  await page.keyboard.press("Escape");
  ok(
    "Unavailable clipboard retains a selectable original URL and does not create a post or send a message"
  );

  await page.getByRole("button", { name: "Bookmark", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove bookmark", exact: true })
    .waitFor();
  const item = await db.savedPostItem.findFirstOrThrow({
    where: { ownerId: actor.id, postId: source.id }
  });
  assert.equal(
    await db.savedPostItem.count({ where: { ownerId: actor.id } }),
    1
  );
  assert.equal(
    await db.savedPostItem.count({
      where: { ownerId: actor.id, postId: plain.id }
    }),
    0
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Remove bookmark", exact: true })
    .waitFor();
  assert.equal(
    await db.platformPost.count({ where: { authorId: actor.id } }),
    before
  );
  await go("/platform/saved");
  await page
    .getByText("Original referral source marker", { exact: true })
    .waitFor();
  ok(
    "Bookmark from a plain repost persists on the original across reload, stays private and adds no feed entry"
  );
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  const phone = await mobile.newPage();
  phone.on("pageerror", (e) =>
    errors.push({ surface: "mobile-referral", message: e.message })
  );
  await phone.goto(copied);
  await phone
    .getByText("Original referral source marker", { exact: true })
    .waitFor();
  await phone.goto(
    config.origin +
      "/platform/login?" +
      new URLSearchParams({
        next: `/platform/posts/${source.id}`,
        reason: "account"
      })
  );
  await phone.getByLabel("Email", { exact: true }).fill(actor.email);
  await phone.getByLabel("Password", { exact: true }).fill(actor.password);
  await phone.getByRole("button", { name: "Sign in", exact: true }).click();
  await phone.waitForURL(copied);
  await phone
    .getByText("Original referral source marker", { exact: true })
    .waitFor();
  const response = await phone.request.get(
    config.origin + `/api/platform/share-preview?kind=post&id=${source.id}`
  );
  assert.equal((await response.json()).available, true);
  await phone.screenshot({
    path: output + "/mobile-return.png",
    fullPage: true
  });
  ok(
    "A mobile-sized guest opens the copied source, signs in through the real account form and returns to the same authorized post"
  );
  const church = await db.church.create({
    data: {
      slug: `referral-${randomUUID()}`,
      name: "Fictional restricted referral church",
      summary: "Isolated reference fixture"
    }
  });
  await db.platformPost.update({
    where: { id: source.id },
    data: {
      audienceChurchId: church.id,
      audience: "CHURCH",
      version: { increment: 1 }
    }
  });
  await phone.goto(copied);
  assert.equal(
    await phone
      .getByText("Original referral source marker", { exact: true })
      .count(),
    0
  );
  const restricted = await phone.request.get(
    config.origin + `/api/platform/share-preview?kind=post&id=${plain.id}`
  );
  assert.equal((await restricted.json()).available, false);
  assert.equal(
    await db.churchConnection.count({
      where: { userId: actor.id, churchId: church.id }
    }),
    0
  );
  await go("/platform/saved");
  await page.getByText("Saved post unavailable", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByText("Original referral source marker", { exact: true })
      .count(),
    0
  );
  const retained = await db.savedPostItem.findUniqueOrThrow({
    where: { id: item.id }
  });
  assert.equal(retained.postId, source.id);
  await mobile.close();
  ok(
    "Restricting the source after referral reveals no body/preview or implied membership, while the private bookmark remains removable"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        passed: results.length,
        results,
        browserErrors: errors,
        productionWrites: 0,
        device:
          "Chrome mobile emulation; native handoff and clipboard simulated; no messages delivered"
      },
      null,
      2
    )
  );
  console.log(
    JSON.stringify({
      passed: results.length,
      browserErrors: errors.length,
      productionWrites: 0
    })
  );
} catch (e) {
  await page.screenshot({ path: output + "/failure.png", fullPage: true });
  writeFileSync(
    output + "/failure.txt",
    String(e) + "\n" + (await page.locator("body").innerText())
  );
  throw e;
} finally {
  await browser.close();
  await db.$disconnect();
}
