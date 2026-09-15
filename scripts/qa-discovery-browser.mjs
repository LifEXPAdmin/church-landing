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
  hasTouch: true,
  viewport: { width: 390, height: 844 }
});
const page = await context.newPage();
let phase = "initial";
const errors = [];
page.on("pageerror", (e) => {
  const issue = {
    phase,
    path: new URL(page.url()).pathname,
    message: e.message,
    stack: e.stack
  };
  errors.push(issue);
  console.log("BROWSER_ERROR", JSON.stringify(issue));
});
const results = [];
const ok = (s) => {
  results.push(s);
  console.log("PASS " + s);
};
const output = fixtureDir + "/discovery-browser-" + Date.now();
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
const { defaultDiscoveryPreferences } =
  await import("../lib/platform/discovery-options.ts");
const { searchDiscoveryPlaces } =
  await import("../lib/platform/discovery-places.ts");
const { postDiscoveryData } = await import("../lib/platform/post-discovery.ts");
const signIn = (actor) =>
  context.addCookies([
    {
      name: "church_platform_session",
      value: actor.token,
      url: config.origin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
const selector = () =>
  page.getByRole("combobox", { name: "Choose feed", exact: true });
const form = () =>
  page.getByRole("form", { name: "Save feed settings", exact: true });
const getIds = () =>
  page
    .locator(".gc-feed [data-post]")
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.post));
const ready = () =>
  page.waitForFunction(
    () => !!new URL(location.href).searchParams.get("feedCursor")
  );
const expand = async (scope, text) => {
  const details = scope
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: text }) })
    .first();
  if (!(await details.getAttribute("open"))) {
    const open = await details.evaluate((node) => node.open);
    if (!open) await details.locator(":scope > summary").click();
  }
};
const settings = async () => {
  await ready();
  await page
    .getByRole("button", { name: "Feed Settings", exact: true })
    .click();
  await form()
    .getByLabel("Saved feed", { exact: true })
    .waitFor({ state: "visible" });
};
const saveSettings = async (mode) => {
  await form()
    .getByRole("button", { name: "Save feed settings", exact: true })
    .click();
  await page.waitForURL((url) => url.searchParams.get("feed") === mode);
  await form().waitFor({ state: "detached" });
  await ready();
};
const resume = () =>
  page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
const posts = [],
  actors = [];
page.setDefaultTimeout(25000);
try {
  const a = await createPortalActor(db, "discbrowsera"),
    b = await createPortalActor(db, "discbrowserb"),
    c = await createPortalActor(db, "discbrowserc");
  actors.push(a, b, c);
  const tag = "browser " + randomUUID(),
    at = new Date(Date.now() - 10000);
  const chicago = (await searchDiscoveryPlaces("US", "Chicago")).places.find(
    (p) => p.label.startsWith("Chicago,")
  );
  assert.ok(chicago);
  const classification = await postDiscoveryData({
    country: "US",
    placeId: chicago.id,
    language: "en",
    denomination: tag,
    shareLocality: true
  });
  for (let i = 0; i < 37; i++)
    posts.push(
      await db.platformPost.create({
        data: {
          authorId: b.id,
          content: `Fictional browser discovery ${i} ${tag}`,
          publishedAt: new Date(+at - i * 1000),
          topics: ["community"],
          ...classification
        }
      })
    );
  const prefs = defaultDiscoveryPreferences();
  prefs.filters.denominations = [tag];
  prefs.filters.country = "US";
  prefs.filters.placeId = chicago.id;
  await db.socialPreferences.create({
    data: { ownerId: a.id, discovery: prefs, feedMode: "for-you" }
  });
  await db.platformFollow.create({
    data: { followerId: a.id, followingId: b.id }
  });
  await db.socialRelationship.create({
    data: { ownerId: a.id, targetUserId: b.id, favorite: true }
  });
  phase = "guest-settings";
  await go("/platform?feed=latest");
  await ready();
  assert.equal(await selector().locator("option").count(), 11);
  await settings();
  await form().getByLabel("Saved feed", { exact: true }).selectOption("public");
  await form()
    .getByLabel("Exactly these self-declared denominations or traditions", {
      exact: true
    })
    .fill(tag);
  await form()
    .getByLabel("Reading languages", { exact: true })
    .selectOption(["en"]);
  await form()
    .getByLabel("Include posts with unclassified language", { exact: true })
    .uncheck();
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await bounded();
    await form().screenshot({ path: output + `/settings-${width}.png` });
  }
  await saveSettings("public");
  assert.deepEqual(
    await getIds(),
    posts.slice(0, 30).map((p) => p.id)
  );
  await page.reload();
  await ready();
  assert.equal(await selector().inputValue(), "public");
  assert.ok(
    (await context.cookies()).some(
      (cookie) => cookie.name === "gc-guest-discovery"
    )
  );
  ok(
    "Guest filters save on this browser, survive reload and fit 320, 390 and desktop widths without a server account preference"
  );
  phase = "guest-unreadable";
  await context.addCookies([
    {
      name: "gc-guest-discovery",
      value: "unreadable",
      url: config.origin,
      secure: true,
      sameSite: "Lax"
    }
  ]);
  await go("/platform?feed=public");
  assert.equal(await page.locator(".gc-feed [data-post]").count(), 0);
  await page
    .getByRole("button", {
      name: "Clear unreadable guest choices",
      exact: true
    })
    .click();
  await form().getByLabel("Saved feed", { exact: true }).waitFor();
  assert.ok(
    !(await context.cookies()).some(
      (cookie) => cookie.name === "gc-guest-discovery"
    )
  );
  ok(
    "Malformed guest choices fail closed and offer an explicit browser-only reset"
  );
  phase = "signed-in-selection";
  await signIn(a);
  await go("/platform");
  await ready();
  assert.equal(await selector().inputValue(), "for-you");
  assert.deepEqual(
    await getIds(),
    posts.slice(0, 30).map((p) => p.id)
  );
  for (const mode of ["following", "favorites", "local", "public", "for-you"]) {
    await selector().selectOption(mode);
    await page.waitForURL((url) => url.searchParams.get("feed") === mode);
    await ready();
    assert.deepEqual(
      await getIds(),
      posts.slice(0, 30).map((p) => p.id)
    );
  }
  ok(
    "Signed-in discovery uses account choices; Following, Favorites, Local, Public and For You retain canonical matching posts"
  );
  phase = "preset-and-dirty-navigation";
  await settings();
  await form().getByLabel("Saved feed", { exact: true }).selectOption("local");
  await form()
    .getByLabel("Find a town or area", { exact: true })
    .fill("Chicago");
  await form().getByRole("button", { name: "Find area", exact: true }).click();
  await form()
    .getByRole("button", { name: chicago.label, exact: true })
    .click();
  await expand(form(), "Saved strict or expanded presets");
  await form()
    .getByLabel("Name the current discovery choices", { exact: true })
    .fill("My strict Chicago feed");
  await form()
    .getByRole("button", { name: "Add current choices as preset", exact: true })
    .click();
  await form()
    .getByRole("link", { name: "Open your saved feed", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Keep reading", exact: true })
    .waitFor();
  assert.equal(
    await form().getByLabel("Preset name", { exact: true }).inputValue(),
    "My strict Chicago feed"
  );
  await page.getByRole("button", { name: "Keep reading", exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get("feed"), "for-you");
  await saveSettings("local");
  const presetSaved = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: a.id }
  });
  assert.equal(presetSaved.discovery.presets.length, 1);
  assert.equal(presetSaved.discovery.presets[0].filters.expand, false);
  assert.equal(presetSaved.feedMode, "local");
  await settings();
  await expand(form(), "Saved strict or expanded presets");
  await form()
    .getByLabel("Preset name", { exact: true })
    .fill("Renamed strict local feed");
  await form().getByLabel("Saved feed", { exact: true }).selectOption("public");
  await form()
    .getByRole("button", { name: "Use this preset", exact: true })
    .click();
  assert.equal(
    await form().getByLabel("Saved feed", { exact: true }).inputValue(),
    "local"
  );
  await saveSettings("local");
  ok(
    "Town selection and strict presets save atomically; rename/apply preserve filters and unsaved choices block accidental navigation"
  );
  phase = "lost-settings-response";
  await settings();
  await expand(
    form(),
    "Hidden words, hidden topics and recommendation feedback"
  );
  await form()
    .getByLabel("Hidden words or phrases", { exact: true })
    .fill("not present private phrase");
  let dropped;
  const bodies = [];
  await page.route("**/api/platform/discovery", async (route) => {
    if (route.request().method() === "POST") {
      bodies.push(route.request().postData());
      if (!dropped) {
        dropped = route.request().postData();
        const response = await route.fetch();
        assert.ok([200, 202].includes(response.status()));
        await route.abort("failed");
        return;
      }
    }
    await route.continue();
  });
  await form()
    .getByRole("button", { name: "Save feed settings", exact: true })
    .click();
  await form()
    .getByRole("button", { name: "Retry the same feed settings", exact: true })
    .waitFor();
  await page.waitForFunction(() =>
    [
      ...document.querySelectorAll(
        'form[aria-label="Save feed settings"] button'
      )
    ].some(
      (button) =>
        button.textContent === "Retry the same feed settings" &&
        !button.disabled
    )
  );
  const afterLoss = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: a.id }
  });
  await resume();
  await page
    .getByRole("button", { name: "Confirm original request", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Confirm original request", exact: true })
    .click();
  await form().waitFor({ state: "detached" });
  await ready();
  assert.equal(bodies.at(-1), dropped);
  assert.equal(
    (await db.socialPreferences.findUniqueOrThrow({ where: { ownerId: a.id } }))
      .discoveryVersion,
    afterLoss.discoveryVersion
  );
  await page.unroute("**/api/platform/discovery");
  ok(
    "A lost settings response survives focus revalidation and retries the exact original mutation once"
  );
  phase = "recommendation-feedback";
  const before = await getIds();
  const first = page.locator(`.gc-feed [data-post="${before[0]}"]`);
  await first.locator("summary", { hasText: "Why this post?" }).click();
  await first
    .getByText("Author-selected language: English", { exact: false })
    .waitFor();
  let feedbackDropped;
  const feedbackBodies = [];
  await page.route("**/api/platform/discovery", async (route) => {
    if (route.request().method() === "POST") {
      feedbackBodies.push(route.request().postData());
      if (!feedbackDropped) {
        feedbackDropped = route.request().postData();
        await route.fetch();
        await route.abort("failed");
        return;
      }
    }
    await route.continue();
  });
  await first
    .getByRole("button", { name: "More of this topic", exact: true })
    .click();
  await first
    .getByRole("button", {
      name: "Retry the same recommendation choice",
      exact: true
    })
    .waitFor();
  await first
    .getByRole("button", {
      name: "Retry the same recommendation choice",
      exact: true
    })
    .click();
  await first
    .getByRole("button", { name: "More of this topic", exact: true })
    .waitFor();
  assert.equal(feedbackBodies.at(-1), feedbackDropped);
  assert.deepEqual(await getIds(), before);
  await page.unroute("**/api/platform/discovery");
  const afterFeedback = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: a.id }
  });
  assert.equal(afterFeedback.discovery.feedback.community, 1);
  await settings();
  await expand(
    form(),
    "Hidden words, hidden topics and recommendation feedback"
  );
  await form()
    .getByRole("button", { name: "Reset recommendation feedback", exact: true })
    .click();
  await saveSettings("local");
  const reset = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: a.id }
  });
  assert.deepEqual(reset.discovery.feedback, {});
  assert.deepEqual(reset.discovery.filters, afterFeedback.discovery.filters);
  assert.deepEqual(
    reset.discovery.hiddenWords,
    afterFeedback.discovery.hiddenWords
  );
  assert.equal(
    await db.platformFollow.count({ where: { followerId: a.id } }),
    1
  );
  ok(
    "Truthful readable explanations and More/Less exact retry keep mounted order; Reset preserves filters, hidden choices and follows"
  );
  phase = "stable-pages";
  await page.getByRole("button", { name: "List", exact: true }).click();
  const beforePage = await getIds(),
    firstUrl = page.url();
  const fresh = await db.platformPost.create({
    data: {
      authorId: b.id,
      content: "Fictional browser discovery refreshed " + tag,
      publishedAt: new Date(),
      topics: ["community"],
      ...classification
    }
  });
  posts.push(fresh);
  assert.deepEqual(await getIds(), beforePage);
  await page
    .getByRole("link", { name: /^Read (?:more|older) posts$/, exact: true })
    .click();
  await page.waitForFunction((url) => location.href !== url, firstUrl);
  assert.deepEqual(
    await getIds(),
    posts.slice(30, 37).map((p) => p.id)
  );
  await page.goBack();
  await page.waitForFunction(
    (ids) =>
      JSON.stringify(
        [...document.querySelectorAll(".gc-feed [data-post]")].map(
          (n) => n.dataset.post
        )
      ) === JSON.stringify(ids),
    beforePage
  );
  await page
    .getByRole("button", { name: "Refresh for new posts", exact: true })
    .click();
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(".gc-feed [data-post]")
        ?.getAttribute("data-post") === id,
    fresh.id
  );
  ok(
    "Finite List paging stays disjoint; Back restores its set and only explicit refresh inserts a new matching post"
  );
  phase = "private-account-switch";
  await settings();
  await expand(
    form(),
    "Hidden words, hidden topics and recommendation feedback"
  );
  await form()
    .getByLabel("Hidden words or phrases", { exact: true })
    .fill("unsent private owner marker");
  await signIn(c);
  await resume();
  await page
    .getByRole("button", { name: "Recheck current access", exact: true })
    .waitFor();
  assert.equal(
    await form()
      .getByLabel("Hidden words or phrases", { exact: true })
      .isVisible(),
    false
  );
  assert.equal(
    await db.socialPreferences.count({ where: { ownerId: c.id } }),
    0
  );
  await signIn(a);
  await resume();
  await form()
    .getByLabel("Hidden words or phrases", { exact: true })
    .waitFor({ state: "visible" });
  assert.equal(
    await form()
      .getByLabel("Hidden words or phrases", { exact: true })
      .inputValue(),
    "unsent private owner marker"
  );
  await form()
    .getByRole("button", {
      name: "Discard local choices and reload",
      exact: true
    })
    .click();
  await ready();
  ok(
    "Account switches conceal retained private entries, prevent cross-account writes and restore the original owner's unsent form"
  );
  phase = "standalone-settings";
  await go("/platform/settings/feed/discovery");
  await form()
    .getByLabel("Saved feed", { exact: true })
    .waitFor({ state: "visible" });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "20px";
  });
  await bounded();
  await form().screenshot({ path: output + "/standalone-large-text-320.png" });
  await expand(
    form(),
    "Hidden words, hidden topics and recommendation feedback"
  );
  await form()
    .getByLabel("Hidden words or phrases", { exact: true })
    .fill("standalone private marker");
  await form()
    .getByRole("button", { name: "Save feed settings", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('form[aria-label="Save feed settings"]')
        ?.getAttribute("data-reader-dirty") === "false" &&
      [
        ...document.querySelectorAll(
          'form[aria-label="Save feed settings"] button'
        )
      ].some(
        (button) =>
          button.textContent === "Save feed settings" && !button.disabled
      )
  );
  assert.deepEqual(
    (await db.socialPreferences.findUniqueOrThrow({ where: { ownerId: a.id } }))
      .discovery.hiddenWords,
    ["standalone private marker"]
  );
  await page.reload();
  await form()
    .getByLabel("Saved feed", { exact: true })
    .waitFor({ state: "visible" });
  await expand(
    form(),
    "Hidden words, hidden topics and recommendation feedback"
  );
  assert.equal(
    await form()
      .getByLabel("Hidden words or phrases", { exact: true })
      .inputValue(),
    "standalone private marker"
  );
  await go("/platform");
  await ready();
  ok(
    "The standalone Settings destination saves and reloads the same private choices and remains usable with larger text at 320 pixels"
  );
  phase = "break-reminder";
  const reminder = page
    .locator("details")
    .filter({
      has: page.locator("summary", {
        hasText: "Optional reading break reminder"
      })
    })
    .first();
  await reminder.locator(":scope > summary").click();
  await page.clock.install();
  await reminder.getByRole("combobox").selectOption("15");
  await reminder.locator(":scope > summary").click();
  await page.clock.fastForward(15 * 60 * 1000 + 100);
  await page
    .getByText("You’ve reached your chosen reading interval.", { exact: false })
    .waitFor();
  assert.equal(await reminder.evaluate((n) => n.open), false);
  await page
    .getByRole("button", {
      name: "Continue and start another interval",
      exact: true
    })
    .click();
  assert.equal(
    await page.evaluate(() => localStorage.getItem("gc-reading-break-minutes")),
    "15"
  );
  ok(
    "The optional in-memory break reminder appears even when its disclosure is closed and stores only the chosen interval"
  );
  assert.deepEqual(errors, []);
  await page.screenshot({ path: output + "/final.png" });
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      {
        origin: config.origin,
        results,
        errors,
        applicationWrites: "isolated fictional fixtures only",
        physicalDeviceTested: false
      },
      null,
      2
    )
  );
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.json",
    JSON.stringify(
      { phase, message: error.message, stack: error.stack, results, errors },
      null,
      2
    )
  );
  throw error;
} finally {
  await db.platformPost.updateMany({
    where: { authorId: { in: actors.map((a) => a.id) } },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  await context.close();
  await browser.close();
  await db.$disconnect();
}
