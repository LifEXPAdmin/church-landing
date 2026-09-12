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
const output = fixtureDir + "/search-browser";
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
try {
  const f = await seedPortal(db),
    marker = "Search " + randomUUID();
  for (let i = 0; i < 23; i++)
    await db.platformPost.create({
      data: {
        authorId: f.memberA.id,
        content: marker + " result " + i,
        topics: ["community"],
        publishedAt: new Date()
      }
    });
  await db.platformPost.create({
    data: {
      authorId: f.memberA.id,
      content: marker + " hidden church",
      audience: "CHURCH",
      audienceChurchId: f.churchA.id,
      publishedAt: new Date()
    }
  });
  await db.platformPost.create({
    data: {
      authorId: f.memberA.id,
      content: marker + " withdrawn",
      status: "WITHDRAWN",
      withdrawnAt: new Date(),
      publishedAt: new Date()
    }
  });
  const search = async (q, kind = "posts") => {
    await go("/platform/search?" + new URLSearchParams({ q, kind }));
  };
  const rows = () => page.locator("[data-search-id]");
  await search(marker);
  await page.getByRole("link", { name: "More posts", exact: true }).waitFor();
  assert.equal(await rows().count(), 20);
  const first = await rows().evaluateAll((es) =>
    es.map((e) => e.dataset.searchId)
  );
  await page.getByRole("link", { name: "More posts", exact: true }).click();
  await page.waitForURL("**after=*");
  await page.waitForFunction(
    () => document.querySelectorAll("[data-search-id]").length === 3
  );
  const second = await rows().evaluateAll((es) =>
    es.map((e) => e.dataset.searchId)
  );
  assert.equal(new Set([...first, ...second]).size, 23);
  await page.goBack();
  await page.getByRole("link", { name: "More posts", exact: true }).waitFor();
  assert.equal(await page.getByRole("searchbox").inputValue(), marker);
  assert.equal(
    await page.getByText(marker + " hidden church", { exact: true }).count(),
    0
  );
  ok(
    "Typed post pagination returns 23 permitted unique results and Back restores query"
  );
  const literal = marker + " ñ 中文 100%_literal";
  await db.platformPost.create({
    data: { authorId: f.memberA.id, content: literal, publishedAt: new Date() }
  });
  await db.platformPost.create({
    data: {
      authorId: f.memberA.id,
      content: marker + " ñ 中文 100XXliteral",
      publishedAt: new Date()
    }
  });
  await search(literal);
  await page.getByRole("link", { name: literal, exact: true }).waitFor();
  assert.equal(await rows().count(), 1);
  await db.platformUser.update({
    where: { id: f.pending.id },
    data: { bio: "PRIVATE SEARCH BIO" }
  });
  await search(f.pending.username, "people");
  await page
    .getByText("Sign in to view this member’s profile.", { exact: true })
    .waitFor();
  assert.equal(await rows().count(), 1);
  assert.equal(
    await page.getByText("PRIVATE SEARCH BIO", { exact: true }).count(),
    0
  );
  assert.equal(
    await page.getByText(f.pending.email, { exact: true }).count(),
    0
  );
  await search(f.churchA.name, "churches");
  await page.locator('[data-search-id="' + f.churchA.id + '"]').waitFor();
  await search("pray", "topics");
  await page
    .getByRole("link", { name: "View posts about prayer", exact: true })
    .click();
  await page.waitForURL("**topic=prayer");
  assert.equal(new URL(page.url()).searchParams.get("kind"), "posts");
  await page
    .getByRole("combobox", { name: "Search category", exact: true })
    .selectOption("people");
  await page.getByRole("searchbox").fill(f.pending.username);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .getByText("Sign in to view this member’s profile.", { exact: true })
    .waitFor();
  assert.equal(new URL(page.url()).searchParams.has("topic"), false);
  ok(
    "Unicode and literal wildcard queries, minimal guest author labels, churches and topic actions"
  );
  const calendar = await db.platformCalendar.create({
    data: {
      churchId: f.churchA.id,
      creatorId: f.memberA.id,
      requestKey: randomUUID(),
      name: "Search fixture calendar",
      timeZone: "UTC"
    }
  });
  const event = await db.calendarEvent.create({
    data: {
      calendarId: calendar.id,
      requestKey: randomUUID(),
      title: marker,
      visibility: "PUBLIC",
      timeZone: "UTC",
      startLocal: "2026-10-01T10:00",
      endLocal: "2026-10-01T11:00",
      occurrences: {
        create: {
          ordinal: 0,
          title: marker,
          allDay: false,
          timeZone: "UTC",
          startLocal: "2026-10-01T10:00",
          endLocal: "2026-10-01T11:00",
          startAt: new Date("2026-10-01T10:00Z"),
          endAt: new Date("2026-10-01T11:00Z")
        }
      }
    },
    include: { occurrences: true }
  });
  await search(marker, "events");
  const result = page.locator(
    '[data-search-id="' + event.occurrences[0].id + '"]'
  );
  await result.waitFor();
  assert.equal(
    await result.getByRole("link").getAttribute("href"),
    "/platform/events/" + event.occurrences[0].id
  );
  await result.getByText("Church event occurrence", { exact: true }).waitFor();
  await db.calendarEvent.update({
    where: { id: event.id },
    data: { visibility: "PRIVATE" }
  });
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await page
    .getByText("No matching events available to you.", { exact: true })
    .waitFor();
  ok(
    "Occurrence links and time-zone labels use current event access; foreground revocation removes result"
  );
  let fail = true;
  await page.route("**/api/platform/search?*", async (route) => {
    if (fail) {
      fail = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Search reconnect fixture" })
      });
    } else await route.continue();
  });
  await search(literal);
  await page.getByRole("button", { name: "Retry search", exact: true }).click();
  await page.getByRole("link", { name: literal, exact: true }).waitFor();
  assert.equal(await page.getByRole("searchbox").inputValue(), literal);
  await page.unroute("**/api/platform/search?*");
  await page.setViewportSize({ width: 320, height: 844 });
  await bounded();
  await page.screenshot({ path: output + "/search-320.png", fullPage: true });
  await page.getByRole("searchbox").fill("New church query");
  await page
    .getByRole("link", { name: "Search churches", exact: true })
    .click();
  await page.waitForURL("**/platform/churches?*");
  assert.equal(new URL(page.url()).searchParams.get("q"), "New church query");
  await page.goBack();
  await page.getByRole("searchbox").waitFor();
  assert.equal(
    await page.getByRole("searchbox").inputValue(),
    "New church query"
  );
  await bounded();
  ok(
    "Retry keeps query, 320px layout fits, and church-query handoff plus Back preserve newly typed input"
  );
  await signIn(f.coordinator);
  await search(marker);
  await page.getByRole("link", { name: "More posts", exact: true }).waitFor();
  const hidden = await db.platformPost.findFirstOrThrow({
    where: { content: marker + " hidden church" }
  });
  await search(marker + " hidden church");
  await page.locator('[data-search-id="' + hidden.id + '"]').waitFor();
  await context.clearCookies();
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await page
    .getByText("No matching posts available to you.", { exact: true })
    .waitFor();
  ok(
    "Account change clears private search projection and rechecks guest access"
  );
  const filterMarker = "Filter ñ " + randomUUID(),
    base = "filter-" + randomUUID();
  const filterPosts = [];
  for (let i = 0; i < 23; i++)
    filterPosts.push(
      await db.platformPost.create({
        data: {
          id: base + "-" + String(i).padStart(2, "0"),
          authorId: f.memberA.id,
          authorChurchId: f.churchA.id,
          audienceChurchId: f.churchA.id,
          content: filterMarker + " " + i,
          topics: ["community"],
          publishedAt: new Date()
        }
      })
    );
  await db.platformPost.create({
    data: {
      authorId: f.memberA.id,
      authorChurchId: f.churchB.id,
      audienceChurchId: f.churchB.id,
      content: filterMarker + " other church",
      topics: ["community"],
      publishedAt: new Date()
    }
  });
  await search(filterMarker);
  await page.getByRole("link", { name: "More posts", exact: true }).waitFor();
  await page.getByText("Search filters", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Search topic", exact: true })
    .selectOption("community");
  await page
    .getByRole("textbox", { name: "Find a church by name", exact: true })
    .fill(f.churchA.name);
  await page
    .getByRole("button", { name: "Find churches for filter", exact: true })
    .click();
  await page
    .getByRole("button")
    .filter({ hasText: "Choose " + f.churchA.name })
    .click();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("link", { name: "More posts", exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("churchId"), f.churchA.id);
  assert.equal(new URL(page.url()).searchParams.get("topic"), "community");
  await page.getByRole("link", { name: "More posts", exact: true }).click();
  await page.waitForURL("**after=*");
  await page.waitForFunction(
    () => document.querySelectorAll("[data-search-id]").length === 3
  );
  const secondUrl = page.url();
  await page.goBack();
  await page.getByRole("link", { name: "More posts", exact: true }).waitFor();
  await page.goForward();
  await page.waitForFunction(
    () => document.querySelectorAll("[data-search-id]").length === 3
  );
  assert.deepEqual(
    Object.fromEntries(new URL(page.url()).searchParams),
    Object.fromEntries(new URL(secondUrl).searchParams)
  );
  assert.equal(
    await page
      .getByRole("combobox", { name: "Search topic", exact: true })
      .inputValue(),
    "community"
  );
  await page
    .getByRole("link", { name: "Search churches", exact: true })
    .click();
  await page.waitForURL("**/platform/churches?*");
  await page.goBack();
  await page.waitForFunction(
    () => document.querySelectorAll("[data-search-id]").length === 3
  );
  assert.deepEqual(
    Object.fromEntries(new URL(page.url()).searchParams),
    Object.fromEntries(new URL(secondUrl).searchParams)
  );
  await page
    .getByRole("combobox", { name: "Search topic", exact: true })
    .selectOption("prayer");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .getByText("No matching posts available to you.", { exact: true })
    .waitFor();
  assert.equal(new URL(page.url()).searchParams.has("after"), false);
  await page
    .getByRole("button", { name: "Clear search filters", exact: true })
    .click();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("link", { name: "More posts", exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.has("churchId"), false);
  assert.equal(new URL(page.url()).searchParams.get("topic") ?? "", "");
  ok(
    "Topic/church filters preserve Unicode query and page through Back/Forward; changed filter clears cursor"
  );
  await go(
    "/platform/search?" +
      new URLSearchParams({
        q: filterMarker,
        kind: "posts",
        churchId: f.churchA.id,
        topic: "community"
      })
  );
  await page.getByRole("link", { name: "More posts", exact: true }).waitFor();
  await db.platformPost.updateMany({
    where: { id: { in: filterPosts.slice(20).map((p) => p.id) } },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  await page.getByRole("link", { name: "More posts", exact: true }).click();
  await page.waitForURL("**after=*");
  await page
    .getByText("No matching posts available to you.", { exact: true })
    .waitFor();
  assert.equal(await rows().count(), 0);
  await go(
    "/platform/search?" +
      new URLSearchParams({ q: filterMarker, kind: "posts", after: "bogus" })
  );
  await page
    .getByRole("link", { name: "Restart search", exact: true })
    .waitFor();
  await page.getByRole("link", { name: "Restart search", exact: true }).click();
  await page.getByRole("link", { name: "More posts", exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.has("after"), false);
  await go("/platform/search?kind=posts&topic=community");
  await page.getByRole("link", { name: "More posts", exact: true }).waitFor();
  assert.equal(await page.getByRole("searchbox").inputValue(), "");
  await page.setViewportSize({ width: 390, height: 844 });
  await bounded();
  await page
    .getByRole("combobox", { name: "Search topic", exact: true })
    .focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Tab");
  await page.setViewportSize({ width: 320, height: 844 });
  await bounded();
  ok(
    "Revoked sources disappear between pages; invalid cursor restarts safely; empty-query topic and keyboard filters fit phone widths"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/receipt.json",
    JSON.stringify({ results, pageErrors: errors }, null, 2)
  );
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
