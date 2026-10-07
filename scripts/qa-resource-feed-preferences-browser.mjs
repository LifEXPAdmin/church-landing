import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";

// Run against the parent's already running isolated production HTTPS fixture.
// The browser uses real settings, cookies, saved preferences and feed reads.
assert.ok(process.argv[2], "Pass the active isolated HTTPS fixture directory.");
const dir = resolve(process.argv[2]);
const config = JSON.parse(readFileSync(join(dir, "browser-env.json"), "utf8"));
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.ok(
  process.env.NODE_EXTRA_CA_CERTS &&
    resolve(process.env.NODE_EXTRA_CA_CERTS) === resolve(config.certificate),
  "Start Node with NODE_EXTRA_CA_CERTS set to the fixture certificate."
);
Object.assign(
  process.env,
  JSON.parse(readFileSync(join(dir, "test-env.json"), "utf8")),
  {
    DATABASE_URL: config.database,
    DIRECT_URL: config.database,
    ACCOUNT_ORIGIN: config.origin,
    NEXT_PUBLIC_SITE_URL: config.origin,
    ACCOUNT_TEST_ISOLATED: "1",
    ACCOUNT_DELIVERY_MODE: "test-sink",
    NODE_ENV: "test",
    VERCEL: "",
    COMMUNITY_REPORTS_ENABLED: "true",
    PRIVILEGED_MFA_MODE: "off"
  }
);
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase, createPortalActor, seedOperatorGrants } =
  await import("../tests/seed-portal.ts");
const { exchangeListingCommand } =
  await import("../lib/platform/exchange-listings.ts");
const { emptyExchangeFields, EXCHANGE_EDITOR_SCHEMA, EXCHANGE_ITEM_POLICY } =
  await import("../lib/platform/exchange-options.ts");
const { mediaCatalogCommand } =
  await import("../lib/platform/media-catalog-commands.ts");
const { mediaFields } = await import("../lib/platform/media-catalog-input.ts");
const { MEDIA_POLICY } =
  await import("../lib/platform/media-catalog-options.ts");
const { postCommand } = await import("../lib/platform/post-commands.ts");
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
const external = [],
  errors = [],
  results = [];
let phase = "fixture";
await context.route("**/*", (route) => {
  if (new URL(route.request().url()).origin === config.origin)
    return route.continue();
  external.push(route.request().url());
  return route.abort();
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
page.on("pageerror", (error) => errors.push({ phase, message: error.message }));
const output = join(dir, "resource-feed-preferences-browser-" + Date.now());
mkdirSync(output, { recursive: true, mode: 0o700 });
const labels = ["Listings", "Events", "Media", "Opportunities"];
const kinds = [
  "exchangeListing",
  "eventOccurrence",
  "mediaCatalogItem",
  "volunteerOpportunity"
];
const form = () =>
  page.getByRole("form", { name: "Save feed settings", exact: true });
const choices = () =>
  form().getByRole("group", { name: "Posts sharing resources", exact: true });
const feedIds = () =>
  page
    .locator(".gc-feed [data-post]")
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.post));
const ready = () =>
  page.waitForFunction(
    () => !!new URL(location.href).searchParams.get("feedCursor")
  );
const signIn = (actor) =>
  context.addCookies([
    {
      name: sessionCookieFixtureName(config.origin),
      value: actor.token,
      url: config.origin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const command = (operation, fields = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
async function go(mode = "latest") {
  await page.bringToFront();
  const response = await page.goto(config.origin + "/platform?feed=" + mode);
  assert.equal(response.status(), 200);
  await ready();
}
async function settings() {
  await page
    .getByRole("button", { name: "Feed Settings", exact: true })
    .click();
  await choices().waitFor();
}
async function selectResources(selected) {
  for (const label of labels)
    await choices()
      .getByRole("checkbox", { name: label, exact: true })
      .setChecked(selected.includes(label));
}
async function assertResources(selected) {
  for (const label of labels)
    assert.equal(
      await choices()
        .getByRole("checkbox", { name: label, exact: true })
        .isChecked(),
      selected.includes(label),
      label
    );
}
async function save(mode) {
  await form()
    .getByRole("button", { name: "Save feed settings", exact: true })
    .click();
  await page.waitForURL((url) => url.searchParams.get("feed") === mode);
  await form().waitFor({ state: "detached" });
  await ready();
}
async function assertFeed(present, absent) {
  const ids = await feedIds();
  assert.ok(ids.length <= 30, "The first feed remains bounded to 30 posts.");
  for (const id of present)
    assert.ok(ids.includes(id), "Expected feed post " + id);
  for (const id of absent)
    assert.ok(!ids.includes(id), "Excluded feed post " + id);
}
async function expandPresets() {
  const details = form()
    .locator("details")
    .filter({
      has: page.locator("summary", {
        hasText: "Saved strict or expanded presets"
      })
    });
  if (!(await details.evaluate((node) => node.open)))
    await details.locator(":scope > summary").click();
}
async function within(promise, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error(label + " timed out")), 20000);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
try {
  const author = await createPortalActor(db, "resource_feed_author");
  const reader = await createPortalActor(db, "resource_feed_reader");
  const replacement = await createPortalActor(db, "resource_feed_other");
  const reviewer = await createPortalActor(db, "resource_feed_reviewer");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  const church = await db.church.create({
    data: {
      slug: "resource-feed-" + randomUUID(),
      name: "Fictional resource feed church",
      summary: "Isolated resource feed preference fixture.",
      communityListed: true
    }
  });
  await db.churchConnection.createMany({
    data: [author, reviewer].map((actor) => ({
      userId: actor.id,
      churchId: church.id,
      state: "APPROVED"
    }))
  });
  await db.churchCapabilityGrant.create({
    data: {
      userId: reviewer.id,
      churchId: church.id,
      capability: "MODERATE_EXCHANGE_LISTINGS"
    }
  });
  async function listing(title, isPrivate = false) {
    const draft = await exchangeListingCommand(
      db,
      author.token,
      command("create", {
        expectedVersion: 0,
        ownerChurchId: null,
        schema: EXCHANGE_EDITOR_SCHEMA,
        fields: {
          ...emptyExchangeFields(),
          audience: isPrivate ? "CHURCH" : "PUBLIC",
          audienceChurchId: isPrivate ? church.id : "",
          title,
          description: "Fictional table used only by isolated browser QA.",
          category: "FURNITURE",
          condition: "GOOD",
          country: "US",
          placeId: 4887398
        }
      })
    );
    return exchangeListingCommand(
      db,
      author.token,
      command("status", {
        listingId: draft.id,
        expectedVersion: draft.version,
        state: "ACTIVE",
        itemPolicy: EXCHANGE_ITEM_POLICY,
        itemConfirmed: true
      })
    );
  }
  const publicListing = await listing("Fictional feed table");
  const privateListing = await listing(
    "Private fixture listing must remain hidden",
    true
  );
  const fields = mediaFields({
    title: "Fictional feed recording",
    description: "Isolated resource feed recording.",
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
  const draft = await mediaCatalogCommand(
    db,
    author.token,
    command("create", { ownerChurchId: null, ...reviewed })
  );
  const media = await mediaCatalogCommand(
    db,
    author.token,
    command("publish", {
      itemId: draft.id,
      expectedVersion: draft.version,
      ...reviewed
    })
  );
  const makePost = (content, references, extra = {}) =>
    postCommand(db, author.token, {
      operation: "create",
      requestKey: randomUUID(),
      audience: "PUBLIC",
      content,
      resourceReferences: references,
      ...extra
    });
  const listRef = { kind: "exchangeListing", id: publicListing.id };
  const mediaRef = { kind: "mediaCatalogItem", id: media.id };
  const listed = await makePost("Fictional post sharing a table", [listRef]);
  const recorded = await makePost("Fictional post sharing a recording", [
    mediaRef
  ]);
  const mixed = await makePost("Fictional post sharing a table and recording", [
    listRef,
    mediaRef
  ]);
  const plain = await makePost(
    "Fictional plain post without resource cards",
    []
  );
  const privatePost = await makePost(
    "Private fixture post must remain hidden",
    [{ kind: "exchangeListing", id: privateListing.id }],
    {
      audience: "CHURCH",
      audienceChurchId: church.id
    }
  );
  // Older ordinary posts establish a real finite first page without another
  // resource publisher or changing any existing fixture records.
  const at = Date.now() - 60000;
  await db.platformPost.createMany({
    data: Array.from({ length: 32 }, (_, i) => ({
      authorId: author.id,
      content: "Fictional older resource feed post " + i,
      publishedAt: new Date(at - i * 1000),
      topics: ["community"]
    }))
  });
  const shared = [listed.id, recorded.id, mixed.id];

  phase = "guest-default-and-layout";
  await go();
  await assertFeed([plain.id, ...shared], [privatePost.id]);
  await settings();
  await assertResources(labels);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "20px";
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "Larger text fits a 320 pixel viewport."
  );
  await choices().screenshot({
    path: join(output, "resource-choices-large-text-320.png")
  });
  await page.screenshot({
    path: join(output, "settings-large-text-320.png"),
    fullPage: true
  });
  ok(
    "Latest exposes all four resource choices with default inclusion and no 320 pixel enlarged-text overflow."
  );

  phase = "guest-latest-and-public";
  await selectResources(["Listings"]);
  await save("latest");
  await assertFeed(
    [plain.id, listed.id],
    [recorded.id, mixed.id, privatePost.id]
  );
  await page.reload();
  await ready();
  await assertFeed(
    [plain.id, listed.id],
    [recorded.id, mixed.id, privatePost.id]
  );
  await settings();
  await assertResources(["Listings"]);
  await form().getByLabel("Saved feed", { exact: true }).selectOption("public");
  await save("public");
  await assertFeed(
    [plain.id, listed.id],
    [recorded.id, mixed.id, privatePost.id]
  );
  ok(
    "Guest listing-only choices survive reload and filter both Latest and Public, including a mixed-resource post."
  );

  phase = "all-off";
  await settings();
  await selectResources([]);
  await save("public");
  await assertFeed([plain.id], [...shared, privatePost.id]);
  await go("latest");
  await assertFeed([plain.id], [...shared, privatePost.id]);
  const guestCookie = (await context.cookies()).find(
    (cookie) => cookie.name === "gc-guest-discovery"
  );
  assert.deepEqual(
    JSON.parse(decodeURIComponent(guestCookie.value)).filters.resources,
    []
  );
  assert.equal(
    await db.socialPreferences.count({ where: { ownerId: reader.id } }),
    0
  );
  ok(
    "All resource choices off keeps ordinary posts across both feeds and creates no account preference."
  );

  phase = "account-separation-and-preset";
  await signIn(reader);
  await go("latest");
  await assertFeed([plain.id, ...shared], [privatePost.id]);
  await settings();
  await assertResources(labels);
  await selectResources(["Media"]);
  await form().getByLabel("Saved feed", { exact: true }).selectOption("public");
  await expandPresets();
  await form()
    .getByLabel("Name the current discovery choices", { exact: true })
    .fill("Fictional media choices");
  await form()
    .getByRole("button", { name: "Add current choices as preset", exact: true })
    .click();
  await selectResources(["Listings"]);
  await form()
    .getByRole("button", { name: "Use this preset", exact: true })
    .click();
  await assertResources(["Media"]);
  await save("public");
  await assertFeed(
    [plain.id, recorded.id],
    [listed.id, mixed.id, privatePost.id]
  );
  const saved = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: reader.id }
  });
  assert.deepEqual(saved.discovery.filters.resources, ["mediaCatalogItem"]);
  assert.deepEqual(saved.discovery.presets[0].filters.resources, [
    "mediaCatalogItem"
  ]);
  assert.equal(
    (await context.cookies()).find(
      (cookie) => cookie.name === "gc-guest-discovery"
    ).value,
    guestCookie.value
  );
  await page.reload();
  await ready();
  await settings();
  await assertResources(["Media"]);
  ok(
    "Account settings remain separate from guest cookies, and saving, applying and reloading a preset retains resource choices."
  );

  phase = "held-save-owner-switch";
  await selectResources(["Listings"]);
  let release, arrived, rejectArrival, finished;
  const gate = new Promise((resolveGate) => {
    release = resolveGate;
  });
  const captured = new Promise((resolveArrival, reject) => {
    arrived = resolveArrival;
    rejectArrival = reject;
  });
  const done = new Promise((resolveDone) => {
    finished = resolveDone;
  });
  let held = false,
    failure;
  const matcher = "**/api/platform/discovery";
  const handler = async (route) => {
    if (route.request().method() !== "POST" || held) return route.continue();
    held = true;
    let response;
    try {
      assert.equal(route.request().headers()["x-expected-account"], reader.id);
      response = await route.fetch();
      assert.ok([200, 202].includes(response.status()));
      arrived();
      await gate;
      await route.fulfill({ response });
    } catch (error) {
      failure = error;
      rejectArrival(error);
      await route.abort().catch(() => {});
    } finally {
      await response?.dispose();
      finished();
    }
  };
  await page.route(matcher, handler);
  try {
    await form()
      .getByRole("button", { name: "Save feed settings", exact: true })
      .click();
    await within(captured, "Settings response interception");
    await signIn(replacement);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("focus"));
    });
    release();
    await within(done, "Held settings response completion");
    if (failure) throw failure;
    await page
      .getByRole("button", { name: "Recheck current access", exact: true })
      .waitFor();
    assert.equal(await choices().isVisible(), false);
    assert.equal(
      await db.socialPreferences.count({ where: { ownerId: replacement.id } }),
      0
    );
    assert.deepEqual(
      (
        await db.socialPreferences.findUniqueOrThrow({
          where: { ownerId: reader.id }
        })
      ).discovery.filters.resources,
      ["exchangeListing"]
    );
  } finally {
    release();
    if (held) await within(done, "Held settings response cleanup");
    await page.unroute(matcher, handler);
  }
  ok(
    "A held successful save remains owned by its original account; switching accounts conceals its form and cannot write the replacement account."
  );

  phase = "current-resource-access";
  await context.clearCookies({ name: sessionCookieFixtureName(config.origin) });
  await go("latest");
  await assertFeed([plain.id], [...shared, privatePost.id]);
  await settings();
  await selectResources(labels);
  await save("latest");
  await assertFeed([plain.id, ...shared], [privatePost.id]);
  // Revoke only this fictional public source after its post was published.
  await db.exchangeListing.update({
    where: { id: publicListing.id },
    data: {
      audience: "CHURCH",
      audienceChurchId: church.id,
      version: { increment: 1 }
    }
  });
  await go("latest");
  await assertFeed(
    [plain.id, listed.id, recorded.id, mixed.id],
    [privatePost.id]
  );
  const query = new URLSearchParams({ view: "availability-batch" });
  query.append("postId", listed.id);
  query.append("postId", privatePost.id);
  const response = await context.request.get(
    config.origin + "/api/platform/posts?" + query
  );
  assert.equal(response.status(), 200);
  const availability = await response.json();
  const current = availability.posts.find((post) => post.id === listed.id);
  assert.equal(current.available, true);
  assert.deepEqual(current.resources ?? [], []);
  const hidden = availability.posts.find((post) => post.id === privatePost.id);
  assert.equal(hidden.available, false);
  assert.ok(
    !JSON.stringify(availability).includes(
      "Private fixture listing must remain hidden"
    )
  );
  assert.equal(
    await page
      .getByRole("link", { name: "Fictional feed table", exact: true })
      .count(),
    0
  );
  await page.screenshot({
    path: join(output, "current-resource-access.png"),
    fullPage: true
  });
  ok(
    "Guest all-off choices return after sign-out; enabling resources never grants church access or restores a revoked public card."
  );

  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  writeFileSync(
    join(output, "results.json"),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        results,
        errors,
        external,
        resourceKinds: kinds,
        implementedBrowserFixtures: ["exchangeListing", "mediaCatalogItem"],
        limitations: [
          "Fictional loopback production build only",
          "Owner switch and source revocation are controlled fixture events",
          "No physical-device or hosted acceptance",
          "Event/opportunity resource semantics require the accompanying service tests"
        ],
        productionWrites: 0,
        externalRequests: 0
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
} catch (error) {
  writeFileSync(join(output, "failure.txt"), String(error.stack ?? error), {
    mode: 0o600
  });
  await page
    .screenshot({ path: join(output, "failure.png"), fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
