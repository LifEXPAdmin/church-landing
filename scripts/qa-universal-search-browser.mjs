import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";
const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the isolated universal-search fixture directory");
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + fixtureDir + "/sink",
  NODE_ENV: "test",
  VERCEL: "",
  PRIVILEGED_MFA_MODE: "off"
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase, createPortalActor } =
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
  viewport: { width: 390, height: 844 },
  timezoneId: "America/Chicago"
});
const blockedRequests = [];
await context.route("**/*", (route) => {
  if (new URL(route.request().url()).origin === config.origin)
    return route.continue();
  blockedRequests.push(route.request().url());
  return route.abort();
});
const page = await context.newPage(),
  errors = [],
  results = [];
page.setDefaultTimeout(20000);
page.on("pageerror", (error) => errors.push(error.message));
const output = fixtureDir + "/universal-search-browser-" + Date.now();
mkdirSync(output, { recursive: true });
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const go = async (path) => {
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
  return response;
};
const { randomUUID } = await import("node:crypto");

const signIn = async (actor) => {
  // Set up a new fictional login after leaving the prior account document.
  await page.goto("about:blank");
  await context.clearCookies();
  await context.addCookies([
    {
      name: sessionCookieFixtureName(config.origin),
      value: actor.token,
      url: config.origin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
};

// All records are fictional and created through the guarded isolated database.
// The app under test is the actual production build, with no mocked API payloads.
const { mediaCatalogCommand } =
  await import("../lib/platform/media-catalog-commands.ts");
const { mediaFields } = await import("../lib/platform/media-catalog-input.ts");
const { MEDIA_POLICY } =
  await import("../lib/platform/media-catalog-options.ts");
const { groupCommand } = await import("../lib/platform/group-commands.ts");
const { postCommand } = await import("../lib/platform/post-commands.ts");
const resultsRegion = () =>
  page.getByRole("region", { name: "Search results" });
const query = (kind, text, extra = {}) =>
  "/platform/search?" + new URLSearchParams({ q: text, kind, ...extra });
const count = async (n) => {
  await page.waitForFunction(
    (n) => document.querySelectorAll("[data-search-id]").length === n,
    n
  );
};
const bounded = async () =>
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    true
  );
try {
  const owner = await createPortalActor(db, "searchqa"),
    reader = await createPortalActor(db, "searchread"),
    other = await createPortalActor(db, "searchother");
  const marker = "Browse" + randomUUID().slice(0, 8);
  const church = await db.church.create({
    data: {
      slug: randomUUID(),
      name: "Fictional search church " + marker,
      summary: "Isolated search fixture",
      communityListed: true
    }
  });
  await db.churchConnection.createMany({
    data: [owner, reader].map((actor) => ({
      userId: actor.id,
      churchId: church.id,
      state: "APPROVED"
    }))
  });
  await db.churchCapabilityGrant.create({
    data: {
      userId: owner.id,
      churchId: church.id,
      capability: "PUBLISH_CHURCH_POSTS"
    }
  });
  const listing = async (i, extra = {}) =>
    db.exchangeListing.create({
      data: {
        ownerId: owner.id,
        creatorId: owner.id,
        state: "ACTIVE",
        publishedAt: new Date(Date.now() - i * 1000),
        confirmedAt: new Date(),
        itemPolicy: "exchange-listings-v3",
        category: "BOOKS",
        condition: "GOOD",
        country: "US",
        placeId: 4887398,
        placeLabel: "Chicago",
        title: `${marker} listing ${i}`,
        description: "Fictional publicly shared listing details",
        ...extra
      }
    });
  const listingRows = [];
  for (let i = 0; i < 21; i++) listingRows.push(await listing(i));
  const privateListing = await listing(50, {
    title: `${marker} private church listing`,
    audience: "CHURCH",
    audienceChurchId: church.id
  });
  const fields = mediaFields({
    title: `${marker} media`,
    description: "Fictional recording",
    format: "SERMON",
    presentation: "VIDEO",
    audience: "PUBLIC",
    details: { preachedOn: null },
    sourceUrl: "https://youtu.be/abcdefghijk"
  });
  const reviewed = {
    fields,
    acknowledgment: {
      policy: MEDIA_POLICY,
      sourceUrl: fields.sourceUrl,
      audience: fields.audience,
      accepted: true
    },
    rights: {
      basis: "OWN",
      reviewed: true,
      publicRecording: true,
      textRights: true
    }
  };
  const media = await mediaCatalogCommand(db, owner.token, {
    operation: "create",
    mutationId: randomUUID(),
    ownerChurchId: null,
    ...reviewed
  });
  await mediaCatalogCommand(db, owner.token, {
    operation: "publish",
    mutationId: randomUUID(),
    itemId: media.id,
    expectedVersion: media.version,
    ...reviewed
  });
  const post = await postCommand(db, owner.token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "Fictional volunteer source",
    authorChurchId: church.id,
    audience: "PUBLIC"
  });
  const opportunity = await db.volunteerOpportunity.create({
    data: {
      postId: post.id,
      title: `${marker} opportunity`,
      contact: "Private coordinator contact must stay out of Search",
      requirements: "Adults only",
      commitment: "One hour",
      capacity: 3,
      duties: "Private detail not needed for a search card"
    }
  });
  const slug = `search-${randomUUID()}`;
  await groupCommand(db, owner.token, {
    operation: "create",
    mutationId: randomUUID(),
    schema: 1,
    slug,
    fields: {
      name: `${marker} group`,
      purpose: "Fictional listed community group",
      rules: "Respect each member",
      kind: "INTEREST",
      discovery: "LISTED",
      joinPolicy: "APPROVAL",
      format: "LOCAL",
      area: "Fictional town",
      topic: "Community",
      churchId: null
    },
    acceptedRules: true,
    leaderDisclosure: true
  });
  // Reproduce the anonymous ABA boundary using a real response, not mocked data.
  await page.goto("about:blank");
  await context.clearCookies();
  await go(query("listings", privateListing.title));
  await resultsRegion()
    .getByText("No matching listings available to you.", { exact: true })
    .waitFor();
  await page.evaluate((id) => {
    window.__privateSearchWasRendered = false;
    new MutationObserver(() => {
      if (document.querySelector(`[data-search-id="${id}"]`))
        window.__privateSearchWasRendered = true;
    }).observe(document.body, { childList: true, subtree: true });
  }, privateListing.id);
  let finishRace;
  const raceFinished = new Promise((resolve) => {
    finishRace = resolve;
  });
  let intercepted = false;
  const raceRoute = async (route) => {
    if (intercepted) return route.continue();
    intercepted = true;
    await context.addCookies([
      {
        name: sessionCookieFixtureName(config.origin),
        value: reader.token,
        url: config.origin,
        secure: true,
        httpOnly: true,
        sameSite: "Lax"
      }
    ]);
    const reply = await route.fetch({
      headers: {
        ...route.request().headers(),
        cookie: `${sessionCookieFixtureName(config.origin)}=${reader.token}`
      }
    });
    const payload = await reply.json();
    assert.ok(
      payload.items.some((item) => item.id === privateListing.id),
      "The held real response exercises the private reader"
    );
    await context.clearCookies();
    await route.fulfill({ response: reply });
    finishRace();
  };
  await page.route("**/api/platform/search?**", raceRoute);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await raceFinished;
  await page.waitForFunction(() => {
    const region = document.querySelector('[aria-label="Search results"]');
    return region && region.getAttribute("aria-busy") === "false";
  });
  const anonymousPrivateVisible = await page.evaluate(
    () => window.__privateSearchWasRendered
  );
  await page.unroute("**/api/platform/search?**", raceRoute);
  await go(query("listings", marker) + "&q=unused");
  await page.waitForFunction(
    () =>
      document.querySelector("[data-search-id]") ||
      document.querySelector('[role="alert"]')
  );
  const duplicateQueryBrowsed =
    (await page.locator("[data-search-id]").count()) > 0;
  writeFileSync(
    output + "/account-url-boundary.json",
    JSON.stringify(
      {
        anonymousPrivateVisible,
        duplicateQueryBrowsed,
        intercepted,
        source: process.env.VERCEL_GIT_COMMIT_SHA
      },
      null,
      2
    )
  );
  assert.equal(
    anonymousPrivateVisible,
    false,
    "Guest to signed-in reader to guest must not show the reader's private response"
  );
  assert.equal(
    duplicateQueryBrowsed,
    false,
    "Ambiguous URL must not turn into a browse query"
  );
  ok("Anonymous ABA response and ambiguous page URL stay concealed");
  await signIn(other);
  const response = await go(query("listings", marker));
  assert.ok(
    !(await response.text()).includes(`${marker} listing 0`),
    "Result payload is absent from server HTML"
  );
  await count(20);
  assert.equal(
    await resultsRegion()
      .getByText(privateListing.title, { exact: true })
      .count(),
    0
  );
  assert.equal(
    await resultsRegion().locator('a[href^="/platform/exchange/"]').count(),
    20
  );
  ok(
    "Real listing results enforce church privacy before rendering and stay out of SSR"
  );
  const more = resultsRegion().getByRole("link", { name: "More listings" });
  assert.ok(
    new URL(await more.getAttribute("href"), config.origin).searchParams.get(
      "after"
    ).length > 257
  );
  await more.click();
  await count(1);
  const second = await resultsRegion()
    .locator("[data-search-id]")
    .getAttribute("data-search-id");
  await page.goBack();
  await count(20);
  assert.equal(
    await resultsRegion().locator(`[data-search-id="${second}"]`).count(),
    0
  );
  ok(
    "Signed continuation survives the full page route and Back restores prior results"
  );
  for (const [kind, label, href] of [
    ["media", `${marker} media`, `/platform/media/${media.id}`],
    [
      "opportunities",
      `${marker} opportunity`,
      `/platform/serve/${opportunity.id}`
    ],
    ["groups", `${marker} group`, `/platform/groups/${slug}`]
  ]) {
    await page.getByLabel("Search category").selectOption(kind);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await resultsRegion()
      .getByRole("link", { name: label, exact: true })
      .waitFor();
    assert.equal(
      await resultsRegion()
        .getByRole("link", { name: label, exact: true })
        .getAttribute("href"),
      href
    );
    const body = await page.request.get(
      config.origin +
        "/api/platform/search?" +
        new URLSearchParams({ kind, q: marker })
    );
    assert.equal(body.status(), 200);
    const json = await body.text();
    for (const secret of [
      "sourceUrl",
      "Private coordinator",
      "passwordHash",
      '"total"',
      '"rights"',
      '"members"'
    ])
      assert.ok(!json.includes(secret));
    ok(
      `Actual ${kind} adapter renders the correct local destination and minimal payload`
    );
  }
  await go(
    query("listings", marker, {
      country: "US",
      placeId: "4887398",
      radiusKm: "25"
    })
  );
  await count(20);
  assert.equal(
    await page.getByLabel("Approximate listing distance").inputValue(),
    "25"
  );
  await resultsRegion().getByRole("link", { name: "More listings" }).click();
  await count(1);
  assert.equal(new URL(page.url()).searchParams.get("placeId"), "4887398");
  assert.equal(new URL(page.url()).searchParams.get("radiusKm"), "25");
  ok("Country, named town and approximate distance survive actual pagination");
  await go(query("media", marker));
  await count(1);
  const historyToggle = page.getByRole("checkbox", {
    name: "Remember my searches in this browser"
  });
  assert.equal(await historyToggle.isChecked(), false);
  await historyToggle.click();
  await page.getByLabel("Search category").selectOption("opportunities");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await count(1);
  const history = page.getByRole("region", { name: "Recent searches" });
  await history
    .getByRole("link", { name: `${marker} (opportunities)`, exact: true })
    .waitFor();
  await page.reload();
  await count(1);
  const historyKey = `godschurches:recent-searches:v1:${encodeURIComponent(other.id)}`;
  assert.equal(
    (
      await page.evaluate(
        (k) => JSON.parse(localStorage.getItem(k)),
        historyKey
      )
    ).items.length,
    1
  );
  await history
    .getByRole("button", { name: "Clear all recent searches" })
    .click();
  await page.waitForFunction(
    (k) => JSON.parse(localStorage.getItem(k)).items.length === 0,
    historyKey
  );
  await page.reload();
  await count(1);
  assert.equal(
    (
      await page.evaluate(
        (k) => JSON.parse(localStorage.getItem(k)),
        historyKey
      )
    ).items.length,
    0
  );
  ok(
    "New-category recent history remains opt in; reload and clear do not recreate entries"
  );
  await signIn(reader);
  await go(query("listings", "private church"));
  await count(1);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await count(0);
  await db.churchConnection.update({
    where: { userId_churchId: { userId: reader.id, churchId: church.id } },
    data: { state: "REMOVED", version: { increment: 1 } }
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await resultsRegion()
    .getByText("No matching listings available to you.", { exact: true })
    .waitFor();
  assert.equal(
    await resultsRegion()
      .getByText(privateListing.title, { exact: true })
      .count(),
    0
  );
  ok(
    "Blur removes results and revoked church access stays concealed after recheck"
  );
  const mismatch = await page.request.get(
    config.origin + "/api/platform/search?kind=media&q=" + marker,
    { headers: { "X-Expected-Account": other.id } }
  );
  assert.equal(mismatch.status(), 401);
  assert.ok(!(await mismatch.text()).includes(`${marker} media`));
  const repeated = await page.request.get(
    config.origin + "/api/platform/search?kind=media&kind=listings&q=" + marker
  );
  assert.equal(repeated.status(), 400);
  ok("Actual HTTPS rejects account mismatch and ambiguous duplicate filters");
  await go(query("media", marker));
  await count(1);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await count(0);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await count(1);
  // The platform's independent sign-in boundary deliberately asks for recheck
  // after an offline transition. Complete that visible recovery before capture.
  const recheck = page.getByRole("button", {
    name: "Recheck this sign-in",
    exact: true
  });
  if (await recheck.isVisible()) {
    await recheck.click();
    await recheck.waitFor({ state: "hidden" });
    await count(1);
  }
  await page.setViewportSize({ width: 320, height: 740 });
  await page.reload();
  await page.addStyleTag({ content: "html { font-size: 24px !important; }" });
  await count(1);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => window.scrollTo(0, 0));
  await bounded();
  await page.screenshot({
    path: output + "/search-320-enlarged.png",
    fullPage: true
  });
  ok("Offline concealment, current reconnection and 320-pixel enlarged text");
  assert.deepEqual(errors, []);
  assert.deepEqual(blockedRequests, []);
  writeFileSync(
    output + "/summary.json",
    JSON.stringify(
      {
        results,
        errors,
        blockedRequests,
        source: process.env.VERCEL_GIT_COMMIT_SHA,
        scope:
          "Production-build browser through actual HTTPS and fictional PostgreSQL; no provider sends or production data"
      },
      null,
      2
    )
  );
  console.log("UNIVERSAL SEARCH BROWSER PASS", output);
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
