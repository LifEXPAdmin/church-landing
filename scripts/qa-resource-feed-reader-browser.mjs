import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import { gunzipSync } from "node:zlib";
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
const { defaultDiscoveryPreferences } =
  await import("../lib/platform/discovery-options.ts");
const { saveDiscoveryPreferences } =
  await import("../lib/platform/discovery-preferences.ts");
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
  reducedMotion: "reduce",
  timezoneId: "America/Chicago",
  serviceWorkers: "block"
});
const external = [],
  errors = [],
  results = [];
let phase = "fixture";
let availabilityFault;
await context.route("**/*", (route) => {
  const url = new URL(route.request().url());
  if (url.origin !== config.origin) {
    external.push({ phase, reason: "non-fixture-origin" });
    return route.abort();
  }
  if (url.pathname === "/api/platform/posts" && availabilityFault)
    return availabilityFault(route);
  return route.continue();
});
const page = await context.newPage();
await page.bringToFront();
page.setDefaultTimeout(20000);
page.on("pageerror", (error) => errors.push({ phase, message: error.message }));
const output = join(dir, "resource-feed-reader-browser-" + Date.now());
mkdirSync(output, { recursive: true, mode: 0o700 });
const feed = () => page.locator(".gc-feed");
const card = (id) => feed().locator(`[data-post="${id}"]`);
const attached = (id) => card(id).locator(`[data-resource-cards="${id}"]`);
const ids = () =>
  feed()
    .locator("[data-post]")
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.post));
const ready = async () => {
  await page.waitForFunction(
    () => !!new URL(location.href).searchParams.get("feedCursor")
  );
  await feed().locator("[data-post]").first().waitFor({ state: "attached" });
  await page.waitForFunction(
    () =>
      document.querySelector(".gc-feed")?.getAttribute("aria-busy") === "false"
  );
};
const command = (operation, fields = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
async function state() {
  const url = new URL(page.url());
  return {
    path: url.pathname,
    ...Object.fromEntries(
      ["feed", "feedScope", "feedCursor", "mode", "post"].map((key) => [
        key,
        url.searchParams.get(key)
      ])
    ),
    display: await feed().getAttribute("data-mode"),
    ids: await ids()
  };
}
async function waitSelected(id) {
  await page.waitForFunction(
    (value) => new URL(location.href).searchParams.get("post") === value,
    id
  );
}
async function assertState(expected) {
  await ready();
  await page.waitForFunction(
    (expectedIds) =>
      JSON.stringify(
        [...document.querySelectorAll(".gc-feed [data-post]")].map(
          (node) => node.dataset.post
        )
      ) === JSON.stringify(expectedIds),
    expected.ids
  );
  await waitSelected(expected.post);
  assert.deepEqual(await state(), expected);
}
async function setMode(mode) {
  await page
    .getByRole("group", { name: "Feed view", exact: true })
    .getByRole("button", {
      name: mode === "list" ? "List" : "Pages",
      exact: true
    })
    .click();
  await page.waitForFunction(
    (value) =>
      document.querySelector(".gc-feed")?.getAttribute("data-mode") === value,
    mode
  );
}
async function selectPost(id) {
  if ((await feed().getAttribute("data-mode")) === "list") {
    await card(id).evaluate((node) => node.scrollIntoView({ block: "start" }));
    await card(id).locator("article.gc-post").waitFor({ state: "visible" });
    await card(id).evaluate((node) => node.scrollIntoView({ block: "start" }));
    await waitSelected(id);
    return;
  }
  const all = await ids(),
    target = all.indexOf(id);
  assert.notEqual(target, -1, "Post belongs to the current bounded set.");
  // An unavailable URL selection displays the first permitted post until the
  // reader makes its next deliberate turn.
  let current = Math.max(
    0,
    all.indexOf(new URL(page.url()).searchParams.get("post"))
  );
  while (current !== target) {
    const direction = current < target ? 1 : -1;
    const navigation =
      new URL(page.url()).pathname === "/platform/feed"
        ? page.locator(".gc-focused-footer")
        : page.getByRole("group", { name: "Post navigation", exact: true });
    await navigation
      .getByRole("button", {
        name: direction > 0 ? "Next" : "Previous",
        exact: true
      })
      .click();
    current += direction;
    await waitSelected(all[current]);
  }
}
async function resourceLink(record) {
  // The host permission boundary must intersect before it reveals its children.
  // Scroll the stable post wrapper before targeting a concealed resource card.
  await card(record.postId).scrollIntoViewIfNeeded();
  await attached(record.postId).scrollIntoViewIfNeeded();
  const link = attached(record.postId).getByRole("link", {
    name: record.title,
    exact: true
  });
  await link.waitFor({ state: "visible" });
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done))
      )
  );
  return link;
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
async function detailBack(record) {
  await selectPost(record.postId);
  const link = await resourceLink(record);
  const before = await state();
  const geometry = () =>
    card(record.postId).evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        scrollY,
        viewportHeight: innerHeight
      };
    });
  const beforeGeometry = await geometry();
  await link.click();
  await page.waitForURL((url) => url.pathname === record.path);
  await page.getByText(record.title, { exact: true }).first().waitFor();
  await page.goBack();
  await ready();
  await card(record.postId)
    .locator("article.gc-post")
    .waitFor({ state: "visible" });
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done))
      )
  );
  writeFileSync(
    join(output, `${phase}-${record.kind}-back.json`),
    JSON.stringify(
      {
        before,
        beforeGeometry,
        after: await state(),
        afterGeometry: await geometry()
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  await assertState(before);
  // A return check must never scroll to repair a drifted native position.
  await attached(record.postId)
    .getByRole("link", { name: record.title, exact: true })
    .waitFor({ state: "visible" });
  await assertState(before);
}
async function bounded() {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal document overflow."
  );
}
const ref = (kind, id) => ({ kind, id });
try {
  const author = await createPortalActor(db, "reader_author"),
    reader = await createPortalActor(db, "reader_viewer"),
    reviewer = await createPortalActor(db, "reader_review");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  const church = await db.church.create({
    data: {
      slug: "resource-reader-" + randomUUID(),
      name: "Fictional reader church",
      summary: "Isolated resource reader fixture.",
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
  await db.churchCapabilityGrant.createMany({
    data: [
      {
        userId: author.id,
        churchId: church.id,
        capability: "PUBLISH_CHURCH_POSTS"
      },
      {
        userId: reviewer.id,
        churchId: church.id,
        capability: "MODERATE_EXCHANGE_LISTINGS"
      }
    ]
  });
  const draft = await exchangeListingCommand(
    db,
    author.token,
    command("create", {
      expectedVersion: 0,
      ownerChurchId: null,
      schema: EXCHANGE_EDITOR_SCHEMA,
      fields: {
        ...emptyExchangeFields(),
        title: "Fictional reader table",
        description: "Isolated reader listing.",
        category: "FURNITURE",
        condition: "GOOD",
        country: "US",
        placeId: 4887398
      }
    })
  );
  const listing = await exchangeListingCommand(
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
  const fields = mediaFields({
    title: "Fictional reader recording",
    description: "Isolated reader recording.",
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
  const mediaDraft = await mediaCatalogCommand(
    db,
    author.token,
    command("create", { ownerChurchId: null, ...reviewed })
  );
  const media = await mediaCatalogCommand(
    db,
    author.token,
    command("publish", {
      itemId: mediaDraft.id,
      expectedVersion: mediaDraft.version,
      ...reviewed
    })
  );
  // Event/opportunity source shapes match the existing resource service fixtures.
  // Only fictional rows created by this script are modified below.
  const calendar = await db.platformCalendar.create({
    data: {
      churchId: church.id,
      creatorId: author.id,
      requestKey: randomUUID(),
      name: "Fictional reader calendar",
      timeZone: "UTC"
    }
  });
  const start = new Date(Date.now() + 86400000),
    end = new Date(+start + 3600000);
  const event = await db.calendarEvent.create({
    data: {
      calendarId: calendar.id,
      requestKey: randomUUID(),
      title: "Fictional reader event",
      visibility: "PUBLIC",
      timeZone: "UTC",
      startLocal: start.toISOString().slice(0, 16),
      endLocal: end.toISOString().slice(0, 16)
    }
  });
  const occurrence = await db.calendarOccurrence.create({
    data: {
      eventId: event.id,
      ordinal: 0,
      title: event.title,
      description: "Isolated reader occurrence.",
      allDay: false,
      timeZone: "UTC",
      startLocal: event.startLocal,
      endLocal: event.endLocal,
      startAt: start,
      endAt: end
    }
  });
  const tag = "reader-fixture-" + randomUUID();
  const makePost = (content, references = [], extra = {}) =>
    postCommand(db, author.token, {
      operation: "create",
      requestKey: randomUUID(),
      audience: "PUBLIC",
      content,
      resourceReferences: references,
      discovery: { denomination: tag },
      ...extra
    });
  const opportunitySource = await makePost("Fictional opportunity source", [], {
    authorChurchId: church.id,
    discovery: { denomination: null }
  });
  const opportunity = await db.volunteerOpportunity.create({
    data: {
      postId: opportunitySource.id,
      title: "Fictional reader opportunity",
      duties: "Arrange fictional books",
      requirements: "Adults only",
      contact: "Fictional coordinator",
      commitment: "One hour by arrangement",
      capacity: 3
    }
  });
  const records = [
    {
      kind: "exchangeListing",
      id: listing.id,
      title: "Fictional reader table",
      path: `/platform/exchange/${listing.id}`
    },
    {
      kind: "eventOccurrence",
      id: occurrence.id,
      title: event.title,
      path: `/platform/events/${occurrence.id}`
    },
    {
      kind: "mediaCatalogItem",
      id: media.id,
      title: fields.title,
      path: `/platform/media/${media.id}`
    },
    {
      kind: "volunteerOpportunity",
      id: opportunity.id,
      title: opportunity.title,
      path: `/platform/serve/${opportunity.id}`
    }
  ];
  const posts = [];
  for (const record of records) {
    const post = await makePost("Fictional reader post for " + record.kind, [
      ref(record.kind, record.id)
    ]);
    record.postId = post.id;
    posts.push(post);
  }
  const mixed = await makePost(
    "Fictional mixed listing, event and media post",
    records.slice(0, 3).map((record) => ref(record.kind, record.id))
  );
  const plain = await makePost("Fictional ordinary reader post");
  posts.push(mixed, plain);
  const at = Date.now() - 60000;
  for (const [index, post] of posts.entries())
    await db.platformPost.update({
      where: { id: post.id },
      data: { publishedAt: new Date(at - index * 1000) }
    });
  const older = [];
  for (let index = 6; index < 35; index++)
    older.push(
      await db.platformPost.create({
        data: {
          authorId: author.id,
          content: "Fictional finite reader post " + index,
          discoveryDenomination: tag,
          publishedAt: new Date(at - index * 1000)
        }
      })
    );
  const order = [...posts, ...older].map((post) => post.id);
  const preferences = defaultDiscoveryPreferences();
  preferences.filters.denominations = [tag];
  await saveDiscoveryPreferences(
    db,
    reader.token,
    command("save", {
      expectedVersion: 0,
      expectedFeedVersion: 0,
      mode: "public",
      preferences
    })
  );
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

  phase = "mixed-bounded-pages";
  await page.goto(config.origin + "/platform?feed=public&mode=pages");
  await ready();
  assert.deepEqual(await ids(), order.slice(0, 30));
  assert.equal(await feed().locator("[data-post]:visible").count(), 1);
  for (const record of records) await detailBack(record);
  await selectPost(mixed.id);
  await attached(mixed.id).scrollIntoViewIfNeeded();
  for (const record of records.slice(0, 3))
    await attached(mixed.id)
      .getByRole("link", { name: record.title, exact: true })
      .waitFor();
  ok(
    "Pages keeps a finite 30-post set; listing, event, media and opportunity details return through native Back to the exact feed, scope, cursor, post and display."
  );

  phase = "list-return";
  await setMode("list");
  assert.equal(await feed().locator("[data-post]:visible").count(), 30);
  await detailBack(records[2]);
  assert.deepEqual(await ids(), order.slice(0, 30));
  ok(
    "List uses the same bounded posts and native Back restores the selected resource host and display without changing the feed."
  );

  phase = "focused-keyboard-return";
  await selectPost(records[1].postId);
  await page.getByRole("button", { name: "Open My feed", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/platform/feed");
  const modal = page.getByRole("dialog", { name: "My feed", exact: true });
  await modal.waitFor();
  assert.equal(await feed().getAttribute("data-mode"), "pages");
  await detailBack(records[1]);
  await modal
    .getByRole("button", { name: "Close My feed", exact: true })
    .focus();
  await page.keyboard.press("ArrowRight");
  await waitSelected(records[2].postId);
  await page.keyboard.press("ArrowLeft");
  await waitSelected(records[1].postId);
  assert.equal(
    await card(records[1].postId).evaluate(
      (node) => getComputedStyle(node).animationName
    ),
    "none"
  );
  await modal
    .getByRole("button", { name: "Close My feed", exact: true })
    .focus();
  await page.keyboard.press("Shift+Tab");
  assert.ok(
    await modal.evaluate((node) => node.contains(document.activeElement)),
    "Focus stays within the reader."
  );
  await page.keyboard.press("Escape");
  await page.waitForURL((url) => url.pathname === "/platform");
  assert.equal(await feed().getAttribute("data-mode"), "list");
  assert.ok(
    await page
      .getByRole("button", { name: "Open My feed", exact: true })
      .evaluate((node) => node === document.activeElement)
  );
  ok(
    "Full-screen resource Back preserves the reading set; arrow keys, contained focus, Escape and reduced motion keep the selected post and restore List."
  );

  phase = "finite-continuation";
  await setMode("pages");
  assert.equal(
    await page
      .getByRole("link", { name: "Read more posts", exact: true })
      .count(),
    0
  );
  await selectPost(order[29]);
  await page
    .getByText("You've reached the end of this set.", { exact: true })
    .waitFor();
  const firstSet = await state();
  await page
    .getByRole("link", { name: "Read more posts", exact: true })
    .click();
  await page.waitForFunction(
    (cursor) =>
      new URL(location.href).searchParams.get("feedCursor") !== cursor,
    firstSet.feedCursor
  );
  await ready();
  assert.deepEqual(await ids(), order.slice(30));
  await selectPost(order.at(-1));
  await page
    .getByText(
      "You're caught up with the posts available when you opened this page.",
      { exact: true }
    )
    .waitFor();
  assert.equal(
    await page
      .getByRole("link", { name: "Read more posts", exact: true })
      .count(),
    0
  );
  await page.goBack();
  await assertState(firstSet);
  ok(
    "Only an explicit end-of-set action loads the disjoint final five posts; the final set is finite and native Back restores the first set and its last post."
  );

  phase = "new-arrival-snapshot";
  const frozen = await state();
  const arrived = await makePost("Fictional newly arrived reader post");
  await page.reload();
  await assertState(frozen);
  assert.ok(!(await ids()).includes(arrived.id));
  await page
    .getByRole("button", { name: "Refresh posts", exact: true })
    .click();
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(".gc-feed [data-post]")
        ?.getAttribute("data-post") === id,
    arrived.id
  );
  await ready();
  assert.equal((await state()).feed, "public");
  ok(
    "New arrivals do not silently reorder the retained reading set; deliberate Refresh admits the new post while preserving the Public feed."
  );

  phase = "source-revocation";
  await selectPost(records[0].postId);
  const listingLink = await resourceLink(records[0]);
  const beforeRevocation = await state();
  await listingLink.click();
  await page.waitForURL((url) => url.pathname === records[0].path);
  await db.exchangeListing.update({
    where: { id: listing.id },
    data: {
      audience: "CHURCH",
      audienceChurchId: church.id,
      version: { increment: 1 }
    }
  });
  await page.goBack();
  await assertState(beforeRevocation);
  // A fresh server read and the live resource boundary must agree. Retained
  // source metadata cannot reappear just because the host post remains public.
  await page.reload();
  await assertState(beforeRevocation);
  await card(records[0].postId)
    .getByText("Fictional reader post for exchangeListing", { exact: true })
    .waitFor();
  await attached(records[0].postId).scrollIntoViewIfNeeded();
  const availability = await context.request.get(
    config.origin +
      "/api/platform/posts?" +
      new URLSearchParams({
        view: "availability-batch",
        postId: records[0].postId
      }),
    { maxRedirects: 0 }
  );
  assert.equal(availability.status(), 200);
  const current = (await availability.json()).posts[0];
  assert.equal(current.available, true);
  assert.deepEqual(current.resources ?? [], []);
  assert.equal(
    await attached(records[0].postId)
      .getByRole("link", { name: records[0].title, exact: true })
      .count(),
    0
  );
  ok(
    "A resource becoming church-only removes its card while its permitted host post, selected feed and reading position remain available."
  );

  phase = "withdrawn-selected-post";
  await selectPost(records[2].postId);
  const mediaLink = await resourceLink(records[2]);
  const beforeWithdrawal = await state();
  await mediaLink.click();
  await page.waitForURL((url) => url.pathname === records[2].path);
  await postCommand(db, author.token, {
    operation: "withdraw",
    requestKey: randomUUID(),
    postId: records[2].postId,
    expectedVersion: posts[2].version,
    confirmed: true
  });
  let release, permissionArrived;
  const gate = new Promise((resolveGate) => {
    release = resolveGate;
  });
  const captured = new Promise((resolveArrival) => {
    permissionArrived = resolveArrival;
  });
  const pending = [];
  let routeFailure;
  let cachedPostPresent = false,
    heldTextVisible = false;

  const handler = (route) => {
    const query = new URL(route.request().url()).searchParams;
    if (
      query.get("view") !== "availability-batch" ||
      !query.getAll("postId").includes(records[2].postId)
    )
      return route.continue();
    const work = (async () => {
      let response;
      try {
        response = await route.fetch({ maxRedirects: 0 });
        assert.equal(response.status(), 200);
        const denied = (await response.json()).posts.find(
          (post) => post.id === records[2].postId
        );
        assert.equal(denied.available, false);
        permissionArrived();
        await gate;
        await route.fulfill({ response });
      } finally {
        await response?.dispose();
      }
    })();
    // Preserve the failure for the awaited cleanup instead of losing it in an
    // asynchronous route callback while the controlled response is held.
    const tracked = work.catch((error) => {
      routeFailure ??= error;
    });
    pending.push(tracked);
    return tracked;
  };
  availabilityFault = handler;
  try {
    await page.goBack();
    await ready();
    cachedPostPresent = (await card(records[2].postId).count()) > 0;
    if (cachedPostPresent) {
      await card(records[2].postId).scrollIntoViewIfNeeded();
      await within(captured, "Returning post permission response");
      heldTextVisible = await card(records[2].postId)
        .getByText("Fictional reader post for mediaCatalogItem", {
          exact: true
        })
        .isVisible();
      await page.screenshot({
        path: join(output, "withdrawal-held-permission.png"),
        fullPage: true
      });
    }
    writeFileSync(
      join(output, "withdrawal-held-permission.json"),
      JSON.stringify(
        { cachedPostPresent, heldTextVisible, heldResponses: pending.length },
        null,
        2
      ),
      { mode: 0o600 }
    );
  } finally {
    release();
    await within(Promise.all(pending), "Returning post permission cleanup");
    availabilityFault = undefined;
  }
  if (routeFailure) throw routeFailure;
  assert.equal(
    heldTextVisible,
    false,
    "Native Back must conceal retained withdrawn host text while current permission is unconfirmed."
  );
  if (cachedPostPresent) {
    await card(records[2].postId)
      .getByText("Original post unavailable.", { exact: true })
      .waitFor();
    const neighbor =
      beforeWithdrawal.ids[beforeWithdrawal.ids.indexOf(records[2].postId) + 1];
    await selectPost(neighbor);
    assert.equal((await state()).feed, beforeWithdrawal.feed);
    await selectPost(records[2].postId);
  }
  // Cached Back may retain an unavailable slot to protect mounted entries.
  // Reload exercises the established fresh-reader fallback to a permitted item.
  await page.reload();
  await ready();
  await page.waitForFunction(
    ({ cursor, withdrawn }) =>
      new URL(location.href).searchParams.get("feedCursor") !== cursor &&
      !document.querySelector(`.gc-feed [data-post="${withdrawn}"]`),
    { cursor: beforeWithdrawal.feedCursor, withdrawn: records[2].postId }
  );
  const resumed = await state();
  for (const key of ["feed", "feedScope", "mode"])
    assert.equal(resumed[key], beforeWithdrawal[key], key);
  const readingSet = (cursor) => {
    const { page: permittedPage, ...identity } = JSON.parse(
      gunzipSync(Buffer.from(cursor.split(".")[0], "base64url"), {
        maxOutputLength: 5000
      }).toString()
    );
    return { identity, permittedPage };
  };
  assert.deepEqual(
    readingSet(resumed.feedCursor).identity,
    readingSet(beforeWithdrawal.feedCursor).identity,
    "Withdrawal retains the signed reading-set identity."
  );
  assert.ok(
    !readingSet(resumed.feedCursor).permittedPage.includes(records[2].postId)
  );
  assert.ok(!resumed.ids.includes(records[2].postId));
  assert.ok(resumed.ids.length > 0);
  assert.equal(
    await feed().locator("[data-post]:visible").getAttribute("data-post"),
    resumed.ids[0]
  );
  await page
    .getByText(/The post you were reading is no longer in this set/)
    .waitFor();
  assert.equal(
    await page
      .getByText("Fictional reader post for mediaCatalogItem", { exact: true })
      .count(),
    0
  );
  ok(
    "A withdrawn selected post is absent on revalidation; the reader explains the change and shows the first permitted item within the same signed feed set."
  );

  phase = "responsive-reader";
  const settledMixed = async () => {
    await resourceLink({ ...records[1], postId: mixed.id });
    await attached(mixed.id)
      .getByRole("link", { name: records[2].title, exact: true })
      .waitFor({ state: "visible" });
    assert.equal(
      await attached(mixed.id)
        .getByRole("link", { name: records[0].title, exact: true })
        .count(),
      0
    );
    await page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done))
        )
    );
  };
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate((large) => {
      document.documentElement.style.fontSize = large ? "20px" : "";
    }, width === 320);
    await selectPost(mixed.id);
    await settledMixed();
    await bounded();
    await page.screenshot({
      path: join(output, `pages-${width}.png`),
      fullPage: true
    });
    await setMode("list");
    await selectPost(mixed.id);
    await settledMixed();
    await bounded();
    await page.screenshot({ path: join(output, `list-resource-${width}.png`) });
    await page
      .getByRole("button", { name: "Open My feed", exact: true })
      .click();
    await page.waitForURL((url) => url.pathname === "/platform/feed");
    await settledMixed();
    await bounded();
    assert.ok(
      await page
        .locator(".gc-focused-scroll")
        .evaluate((node) => node.scrollWidth <= node.clientWidth + 1)
    );
    await page.screenshot({
      path: join(output, `focused-resource-${width}.png`)
    });
    await page
      .getByRole("button", { name: "Close My feed", exact: true })
      .click();
    await page.waitForURL((url) => url.pathname === "/platform");
    await setMode("pages");
  }
  ok(
    "Pages, List and full-screen resource cards fit 320 pixels with enlarged text and 1440 pixels without horizontal overflow."
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
        resourceKinds: records.map((record) => record.kind),
        initialPosts: 35,
        firstSet: 30,
        continuation: 5,
        productionWrites: 0,
        externalRequests: external.length,
        limitations: [
          "Fictional loopback production build only",
          "Native browser history, not physical-device gestures",
          "Rapid repeated Back is not exercised; each detail return waits for settled reader state",
          "Source publication, revocation and withdrawal are controlled fixture events",
          "Unavailable retained slots preserve mounted work until the existing fresh-read boundary"
        ]
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
} catch (error) {
  // Persist the original failure before optional diagnostics can themselves fail.
  const diagnostics = [];
  try {
    writeFileSync(
      join(output, "failure.txt"),
      phase + "\n" + String(error.stack ?? error),
      { mode: 0o600 }
    );
  } catch {
    diagnostics.push("primary-failure-file-unavailable");
  }
  try {
    if (await feed().count())
      writeFileSync(
        join(output, "failure-state.json"),
        JSON.stringify({ phase, reading: await state() }, null, 2),
        { mode: 0o600 }
      );
  } catch {
    diagnostics.push("state-capture-failed");
  }
  try {
    await page.screenshot({
      path: join(output, "failure.png"),
      fullPage: true
    });
  } catch {
    diagnostics.push("screenshot-capture-failed");
  }
  if (diagnostics.length) {
    try {
      writeFileSync(
        join(output, "failure-diagnostics.json"),
        JSON.stringify({ phase, diagnostics }, null, 2),
        { mode: 0o600 }
      );
    } catch {
      console.error("Secondary failure diagnostics could not be written.");
    }
  }
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
