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
const output = fixtureDir + "/seo-browser";
mkdirSync(output, { recursive: true });
const { seedSharing } = await import("../tests/seed-sharing.ts");
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
const structured = async () =>
  JSON.parse(
    await page.locator('script[type="application/ld+json"]').textContent()
  );
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
try {
  const f = await seedSharing(db);
  f.church = await db.church.update({
    where: { id: f.church.id },
    data: {
      name: "Fictional community " + randomUUID().slice(0, 8),
      communityListed: false,
      city: "Fictional town",
      locationModel: "NO_BUILDING"
    }
  });
  await db.church.createMany({
    data: Array.from({ length: 101 }, (_, index) => ({
      name: "Fictional directory continuation " + index,
      slug: randomUUID(),
      summary: "Public fictional directory fixture",
      communityListed: true
    }))
  });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await go("/platform/churches/" + f.church.id);
    await page
      .getByRole("heading", { level: 1, name: f.church.name, exact: true })
      .waitFor();
    await page
      .getByText("Church listing · Unmanaged", { exact: true })
      .waitFor();
    await fits();
    assert.equal((await structured())["@type"], "Organization");
    assert.doesNotMatch(
      await page.locator('meta[name="robots"]').getAttribute("content"),
      /noindex/
    );
    await page.screenshot({
      path: output + "/church-" + width + ".png",
      fullPage: true
    });
    await page
      .getByRole("link", { name: f.occurrence.title, exact: true })
      .click();
    await page.waitForURL(
      (url) =>
        url.origin === config.origin &&
        url.pathname === "/platform/events/" + f.occurrence.id
    );
    assert.equal(
      await page.locator('link[rel="canonical"]').getAttribute("href"),
      config.origin + "/platform/events/" + f.occurrence.id
    );
    await page
      .getByRole("heading", { level: 1, name: f.occurrence.title, exact: true })
      .waitFor();
    await fits();
    assert.equal((await structured()).name, f.occurrence.title);
    await page.screenshot({
      path: output + "/event-" + width + ".png",
      fullPage: true
    });
  }
  ok(
    "Canonical unmanaged church and its actual upcoming event match public structured facts and fit 320/390/1440 pixels."
  );
  await go("/platform/churches");
  await page.getByRole("link", { name: "More churches", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.has("cursor"));
  await page
    .getByRole("heading", { level: 1, name: "Find your church", exact: true })
    .waitFor();
  assert.equal(
    await page.locator('link[rel="canonical"]').getAttribute("href"),
    page.url()
  );
  await fits();
  await go("/platform/churches?q=" + encodeURIComponent(f.church.name));
  assert.match(
    await page.locator('meta[name="robots"]').getAttribute("content"),
    /noindex/
  );
  await page.getByText(f.church.name, { exact: true }).waitFor();
  ok(
    "Actual directory continuation keeps its own canonical address; user search remains noindex."
  );
  await context.addCookies([
    {
      name: "church_platform_session",
      value: f.author.token,
      url: config.origin,
      httpOnly: true,
      secure: true,
      sameSite: "Lax"
    }
  ]);
  await go("/platform/posts/" + f.post.id);
  await page.getByRole("button", { name: "Log out", exact: true }).waitFor();
  assert.equal(
    await page.locator('link[rel="canonical"]').getAttribute("href"),
    config.origin + "/platform/posts/" + f.post.id
  );
  assert.ok((await page.title()).includes(f.post.content));
  await context.clearCookies();
  await go("/platform/posts/" + f.post.id);
  const formerImage = await page
    .locator('meta[property="og:image"]')
    .getAttribute("content");
  await db.platformPost.update({
    where: { id: f.post.id },
    data: {
      audience: "CHURCH",
      audienceChurchId: f.church.id,
      content: "PRIVATE BROWSER SEO BODY"
    }
  });
  await page.reload();
  assert.match(
    await page.locator('meta[name="robots"]').getAttribute("content"),
    /noindex/
  );
  assert.ok(
    !(await page.locator("body").innerText()).includes(
      "PRIVATE BROWSER SEO BODY"
    )
  );
  const imageResponse = await context.request.get(formerImage),
    fallback = await context.request.get(
      config.origin + "/brand/share-card.png"
    );
  assert.deepEqual(await imageResponse.body(), await fallback.body());
  ok(
    "Member and guest metadata retain anonymous scope; source restriction clears the public page and old preview bytes."
  );
  await db.calendarEvent.update({
    where: { id: f.event.id },
    data: { canceledAt: new Date() }
  });
  await go("/platform/events/" + f.occurrence.id);
  await page
    .getByText("Canceled · this occurrence is no longer accepting RSVPs.", {
      exact: true
    })
    .waitFor();
  assert.equal(
    await page.locator('script[type="application/ld+json"]').count(),
    0
  );
  assert.match(
    await page.locator('meta[name="robots"]').getAttribute("content"),
    /noindex/
  );
  await go("/help");
  assert.equal(
    await page.locator('meta[property="og:image"]').getAttribute("content"),
    config.origin + "/brand/share-card.png"
  );
  await page
    .getByRole("link", {
      name: "Getting started and saved next steps",
      exact: true
    })
    .click();
  await page.waitForURL(config.origin + "/platform/getting-started");
  assert.match(
    await page.locator('meta[name="robots"]').getAttribute("content"),
    /noindex/
  );
  ok(
    "Canceled events retain honest guidance without scheduled markup; public Help retains branding and its protected guide link."
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/results.json",
    JSON.stringify({
      at: new Date().toISOString(),
      results,
      errors,
      productionMode: true,
      fictionalOnly: true,
      physicalDevice: false
    }),
    { mode: 0o600 }
  );
} catch (error) {
  writeFileSync(
    output + "/failure-structure.json",
    JSON.stringify(
      await page.evaluate(() => ({
        headings: [...document.querySelectorAll("main h1")].map((e) => ({
          text: e.textContent,
          hidden: e.closest("[hidden]")?.outerHTML.slice(0, 300),
          visible: e.checkVisibility()
        })),
        hidden: [...document.querySelectorAll("[hidden]")].map((e) => ({
          tag: e.tagName,
          id: e.id,
          children: e.childElementCount
        })),
        scripts: [
          ...document.querySelectorAll('script[type="application/ld+json"]')
        ].map((e) => ({ text: e.textContent, hidden: !!e.closest("[hidden]") }))
      }))
    ),
    { mode: 0o600 }
  );
  writeFileSync(output + "/failure.txt", String(error.stack ?? error), {
    mode: 0o600
  });
  writeFileSync(
    output + "/failure-dom.txt",
    await page.locator("body").innerText(),
    { mode: 0o600 }
  );
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
