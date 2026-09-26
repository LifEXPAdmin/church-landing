import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { homedir } from "node:os";

const fixture = resolve(process.argv[2] ?? ".account-test/c3-empty-pages");
assert.ok(fixture.startsWith(resolve(".account-test") + "/"));
const config = JSON.parse(readFileSync(fixture + "/browser-env.json", "utf8"));
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(config.localOrigin, config.origin);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: fixture + "/sink",
  AUTH_RATE_LIMIT_SECRET: "empty-pages-fictional-only-".repeat(3),
  NODE_ENV: "test",
  VERCEL: "",
  PRIVILEGED_MFA_MODE: "off",
  SOCIAL_EMAIL_ENABLED: "false",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  BLOB_READ_WRITE_TOKEN: "",
  MEDIA_STORAGE_MODE: "local-test",
  MEDIA_TEST_DIR: fixture + "/images",
  RETENTION_TEST_DIR: fixture + "/retention"
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase, createPortalActor } =
  await import("../tests/seed-portal.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ??
    `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`
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
      createHash("sha256").update(der).digest("base64"),
    "--no-proxy-server"
  ]
});
const output = fixture + "/empty-pages-browser-" + Date.now();
mkdirSync(output, { recursive: true });
const results = [],
  errors = [];
const ok = (name) => {
  results.push(name);
  console.log("PASS " + name);
};
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }
});
await context.route("**/*", (route) =>
  new URL(route.request().url()).origin === config.origin
    ? route.continue()
    : route.abort()
);
context.setDefaultTimeout(15000);
const page = await context.newPage();
page.on("pageerror", (error) =>
  errors.push({ path: new URL(page.url()).pathname, message: error.message })
);
const go = async (path) => {
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200, path);
  await page.locator("main").waitFor({ state: "visible" });
};
const heading = (text) =>
  page.getByRole("heading", { name: text, exact: true });
const bounded = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal page overflow"
  );
const keyboardLink = async (name, destination) => {
  const link = page.getByRole("link", { name, exact: true }).first();
  const href = await link.getAttribute("href");
  assert.equal(new URL(href, config.origin).pathname, destination);
  await page.keyboard.press("Control+Home");
  for (let i = 0; i < 100; i++) {
    await page.keyboard.press("Tab");
    if (await link.evaluate((element) => element === document.activeElement)) {
      await page.keyboard.press("Enter");
      await page.waitForURL(
        (url) => url.href === new URL(href, config.origin).href
      );
      return;
    }
  }
  assert.fail("Link was not reachable by keyboard: " + name);
};
try {
  // An empty, freshly migrated database establishes a genuinely empty directory.
  assert.equal(await db.gatherGroup.count(), 0);
  assert.equal(await db.exchangeListing.count(), 0);
  const cases = [
    [
      "groups",
      "No public groups to show yet",
      "No groups match these filters",
      "Clear group filters"
    ],
    [
      "exchange",
      "No listings to show yet",
      "No listings match these filters",
      "Clear listing filters"
    ],
    [
      "serve",
      "No volunteer opportunities to show yet",
      "No opportunities match these filters",
      "Clear filters"
    ]
  ];
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [area, empty] of cases) {
      await go("/platform/" + area);
      await heading(empty).waitFor({ state: "visible" });
      await bounded();
      assert.doesNotMatch(
        await page.locator("main").innerText(),
        /continue to the next page|available to this account/
      );
      assert.equal(
        await page
          .getByRole("link", { name: /^Next (groups|opportunities)$/ })
          .count(),
        0
      );
      await page.screenshot({
        path: `${output}/${area}-${width}.png`,
        fullPage: true
      });
      await heading(empty).locator("..").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/${area}-empty-${width}.png` });
    }
    ok(`Unfiltered guest directories are truthful and fit ${width}px`);
  }
  for (const [area, empty, filtered, reset] of cases) {
    await go(`/platform/${area}?q=fictionalnomatch`);
    await heading(filtered).waitFor({ state: "visible" });
    await keyboardLink(reset, "/platform/" + area);
    await heading(empty).waitFor({ state: "visible" });
    assert.equal(new URL(page.url()).search, "");
    ok(
      area +
        " filtered empty state resets through a real keyboard-operable link"
    );
  }
  for (const [area, empty] of cases.filter(([area]) => area !== "exchange")) {
    await go(
      `/platform/${area}?q=fictionalnomatch&after=fictional-end-of-page`
    );
    await heading(
      area === "groups"
        ? "No groups on this page"
        : "No opportunities on this page"
    ).waitFor({ state: "visible" });
    await keyboardLink(
      area === "groups"
        ? "Back to first groups"
        : "Back to first opportunities",
      "/platform/" + area
    );
    assert.equal(new URL(page.url()).searchParams.get("q"), "fictionalnomatch");
    assert.equal(new URL(page.url()).searchParams.has("after"), false);
    assert.equal(await heading(empty).count(), 0);
    ok(
      area +
        " empty later page returns to the first page while retaining its search"
    );
  }
  const exchangeResponse = await page.request.get(
    config.origin + "/api/platform/exchange?view=list&q=fictionalnomatch"
  );
  assert.equal(exchangeResponse.status(), 200);
  const exchangePage = await exchangeResponse.json();
  assert.ok(exchangePage.pageCursor);
  await go(
    "/platform/exchange?" +
      new URLSearchParams({
        q: "fictionalnomatch",
        after: exchangePage.pageCursor
      })
  );
  await heading("No listings on this page").waitFor({ state: "visible" });
  assert.equal(
    await page
      .getByRole("link", { name: "More listings", exact: true })
      .count(),
    0
  );
  await keyboardLink("Back to first listings", "/platform/exchange");
  assert.equal(new URL(page.url()).searchParams.get("q"), "fictionalnomatch");
  assert.equal(new URL(page.url()).searchParams.has("after"), false);
  ok("Exchange signed empty-page cursor returns to its first filtered page");
  await go("/platform/exchange?sort=newest&scope=all&availability=ACTIVE");
  await heading("No listings to show yet").waitFor({ state: "visible" });
  assert.equal(
    await page
      .getByRole("link", { name: "Clear listing filters", exact: true })
      .count(),
    0
  );
  ok("Default Exchange choices do not masquerade as restrictive filters");
  for (const [path, label, next] of [
    ["/platform/groups", "Sign in for group choices", "/platform/groups"],
    [
      "/platform/exchange",
      "Sign in to create a listing",
      "/platform/exchange/new"
    ],
    [
      "/platform/serve",
      "Sign in to review my applications",
      "/platform/serve/applications"
    ]
  ]) {
    await go(path);
    const link = page.getByRole("link", { name: label, exact: true });
    await link.waitFor({ state: "visible" });
    const href = new URL(await link.getAttribute("href"), config.origin);
    assert.equal(href.searchParams.get("next"), next);
    await link.click();
    await page.waitForURL((url) => url.pathname === href.pathname);
    assert.equal(new URL(page.url()).searchParams.get("next"), next);
  }
  ok("Guest sign-in actions preserve the exact intended destination");
  await go("/platform/serve");
  await heading("No volunteer opportunities to show yet").waitFor({
    state: "visible"
  });
  await keyboardLink("Explore churches", "/platform/churches");
  ok("Serve offers a working public discovery destination");
  await go("/platform/groups?kind=not-a-group-type");
  await page
    .getByText("Choose a supported group type.", { exact: true })
    .waitFor({ state: "visible" });
  assert.equal(await heading("No public groups to show yet").count(), 0);
  ok("Invalid input remains an error, not an empty-data claim");

  let releaseRequest;
  const heldRequest = new Promise((resolve) => {
    releaseRequest = resolve;
  });
  await page.route("**/api/platform/groups?**", async (route) => {
    await heldRequest;
    await route.abort();
  });
  await go("/platform/groups");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page
    .getByText("Checking current group information information…", {
      exact: true
    })
    .waitFor({ state: "visible" });
  assert.equal(
    await heading("No public groups to show yet").isVisible(),
    false
  );
  releaseRequest();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByText(
      "Current group information access could not be confirmed. Reconnect and check again.",
      { exact: true }
    )
    .waitFor({ state: "visible" });
  assert.equal(
    await heading("No public groups to show yet").isVisible(),
    false
  );
  await page.unroute("**/api/platform/groups?**");
  await page
    .getByRole("button", {
      name: "Check group information access",
      exact: true
    })
    .click();
  await heading("No public groups to show yet").waitFor({ state: "visible" });
  ok(
    "Pending and failed access checks conceal empty-data claims and recover explicitly"
  );

  // A guest choice is browser-local; changing empty-state copy must not erase it.
  await context.clearCookies();
  await go("/platform?mode=list");
  await heading("No posts yet.").waitFor({ state: "visible" });
  assert.equal(
    await page
      .getByRole("button", { name: "Latest", exact: true })
      .getAttribute("aria-pressed"),
    "true"
  );
  await page.getByRole("button", { name: "Friends", exact: true }).click();
  await page
    .getByText("Sign in to see posts from your accepted friends.", {
      exact: true
    })
    .waitFor({ state: "visible" });
  await go("/platform?mode=list");
  assert.equal(
    await page
      .getByRole("button", { name: "Friends", exact: true })
      .getAttribute("aria-pressed"),
    "true"
  );
  await page.getByRole("button", { name: "Open Latest", exact: true }).click();
  await heading("No posts yet.").waitFor({ state: "visible" });
  await page.screenshot({ path: output + "/home-latest.png", fullPage: true });
  ok(
    "Fresh Home defaults to Latest; deliberate Friends persists and offers working Latest escape"
  );
  await keyboardLink("Explore the community", "/platform/search");
  await go(
    "/platform?feed=latest&mode=list&before=2000-01-01T00%3A00%3A00.000Z&cursor=fictional-old-post"
  );
  await heading("No posts on this page").waitFor({ state: "visible" });
  assert.equal(
    await page
      .getByRole("link", { name: "Read older posts", exact: true })
      .count(),
    0
  );
  await keyboardLink("Refresh this feed", "/platform");
  await heading("No posts yet.").waitFor({ state: "visible" });
  assert.equal(new URL(page.url()).searchParams.get("mode"), "list");
  assert.equal(new URL(page.url()).searchParams.get("feed"), "latest");
  ok(
    "Home empty old pages refresh the selected feed and display without an invented next page"
  );
  await go("/platform?feed=latest&feedCursor=invalid-cursor");
  await page
    .getByText(
      "This reading set expired or belongs to a different feed or account. Refresh posts to start a new set.",
      { exact: true }
    )
    .waitFor({ state: "visible" });
  assert.equal(await heading("No posts on this page").count(), 0);
  ok(
    "Invalid Home reading sets retain their explicit error and recovery state"
  );

  const actor = await createPortalActor(db, "emptypages");
  await context.clearCookies();
  const applicationCount = await db.volunteerApplication.count();
  await go("/platform/serve");
  await keyboardLink("Sign in to review my applications", "/platform/login");
  await page.getByLabel("Email", { exact: true }).fill(actor.email);
  await page.getByLabel("Password", { exact: true }).fill(actor.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(
    (url) => url.pathname === "/platform/serve/applications"
  );
  await heading("Private volunteer applications").waitFor({ state: "visible" });
  assert.equal(await db.volunteerApplication.count(), applicationCount);
  await go("/platform/serve");
  await keyboardLink("Review my applications", "/platform/serve/applications");
  ok(
    "Serve sign-in returns to private applications without submitting an application"
  );
  await go("/platform/groups");
  await page
    .getByRole("link", { name: "Review my group choices", exact: true })
    .waitFor({ state: "visible" });
  await keyboardLink("Review my group choices", "/platform/groups/mine");
  await go("/platform/groups/invitations?q=fictionalnomatch");
  await heading("No group invitations match these filters").waitFor({
    state: "visible"
  });
  await keyboardLink("Clear group filters", "/platform/groups/invitations");
  await heading("No current group invitations").waitFor({ state: "visible" });
  ok(
    "Private invitations distinguish search misses and reset within their guarded view"
  );
  await go("/platform/exchange");
  await page
    .getByRole("link", { name: "Create a private draft", exact: true })
    .waitFor({ state: "visible" });
  await keyboardLink("Create a private draft", "/platform/exchange/new");
  ok(
    "Verified adult empty states link to guarded private choices and draft creation"
  );
  assert.equal(errors.length, 0, JSON.stringify(errors));
  writeFileSync(
    output + "/result.json",
    JSON.stringify({ results, errors, noProductionWrites: true }, null, 2)
  );
  console.log(JSON.stringify({ passed: results.length, output }));
} catch (error) {
  writeFileSync(
    output + "/failure.json",
    JSON.stringify({ results, errors, error: String(error) }, null, 2)
  );
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
