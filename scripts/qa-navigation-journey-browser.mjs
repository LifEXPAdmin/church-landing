import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, createHmac, randomUUID } from "node:crypto";

const fixtureDir = process.argv[2];
assert.match(fixtureDir ?? "", /^\.account-test\/[a-z0-9-]+$/);
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
assert.equal(new URL(config.database).pathname, "/godschurches_security_test");
assert.ok(
  process.env.AUTH_RATE_LIMIT_SECRET,
  "Use the isolated preview environment"
);
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
  PRIVILEGED_MFA_MODE: "off",
  COMMUNITY_REPORTS_ENABLED: "true",
  SOCIAL_EMAIL_ENABLED: "false",
  BLOB_READ_WRITE_TOKEN: "",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  MEDIA_STORAGE_MODE: "local-test",
  MEDIA_TEST_DIR: process.cwd() + "/" + fixtureDir + "/images"
});
const { PrismaClient } = await import("@prisma/client");
const { seedPortal, assertPortalTestDatabase, seedOperatorGrants } =
  await import("../tests/seed-portal.ts");
const { exchangeListingCommand } =
  await import("../lib/platform/exchange-listings.ts");
const { EXCHANGE_ITEM_POLICY, EXCHANGE_EDITOR_SCHEMA, emptyExchangeFields } =
  await import("../lib/platform/exchange-options.ts");
const { searchDiscoveryPlaces } =
  await import("../lib/platform/discovery-places.ts");
const { calendarCommand } =
  await import("../lib/platform/calendar-commands.ts");
const { portalCommand } = await import("../lib/platform/portal.ts");
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
      createHash("sha256").update(der).digest("base64"),
    "--no-proxy-server"
  ]
});
const context = await browser.newContext({
  viewport: { width: 320, height: 844 },
  hasTouch: true
});
await context.route("**/*", (route) =>
  new URL(route.request().url()).origin === config.origin
    ? route.continue()
    : route.abort()
);
const page = await context.newPage(),
  errors = [],
  results = [],
  diagnostics = [],
  readCosts = [];
const output = fixtureDir + "/navigation-journey-" + Date.now();
mkdirSync(output, { recursive: true });
page.on("pageerror", (e) =>
  errors.push({ path: new URL(page.url()).pathname, message: e.message })
);
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const go = async (path) =>
  assert.equal((await page.goto(config.origin + path)).status(), 200);
const signIn = async (actor) => {
  await context.clearCookies();
  if (actor)
    await context.addCookies([
      {
        name: "church_platform_session",
        value: actor.token,
        url: config.origin,
        secure: true,
        httpOnly: true,
        sameSite: "Lax"
      }
    ]);
};
const bounded = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal page overflow"
  );
const waitUntil = async (work) => {
  for (let i = 0; i < 80; i++) {
    if (await work()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error("Expected current navigation state was not observed");
};
const menu = () => page.locator(".gc-menu-page");
const menuLink = (href) => menu().locator(`a[href="${href}"]`);
const platformNav = () =>
  page.getByRole("navigation", { name: "Platform", exact: true });
const settingsLink = () =>
  page
    .getByRole("navigation", { name: "Account and website", exact: true })
    .getByRole("link", { name: "Settings", exact: true });
const backTo = async (address) => {
  await page.goBack();
  await page.waitForURL(address);
};
const watchLeaks = async (marker, target = page) =>
  target.evaluate((value) => {
    window.journeyLeaks = [];
    window.journeyObserver?.disconnect();
    window.journeyObserver = new MutationObserver(() => {
      if (document.body.innerText.includes(value))
        window.journeyLeaks.push(performance.now());
    });
    window.journeyObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true
    });
  }, marker);
try {
  const f = await seedPortal(db),
    publisher = f.contact,
    viewer = f.memberA;
  await seedOperatorGrants(db, f.operator, ["REVIEW_COMMUNITY_REPORTS"]);
  const marker = "Linked journey " + randomUUID();
  const posts = [];
  for (let i = 0; i < 6; i++)
    posts.push(
      await db.platformPost.create({
        data: {
          authorId: publisher.id,
          content: marker + " post " + i,
          audience: "PUBLIC",
          publishedAt: new Date(Date.now() - i * 1000)
        }
      })
    );
  const place = (await searchDiscoveryPlaces("US", "Chicago")).places[0],
    listings = [];
  for (const price of ["1.00", "2.00", "3.00"]) {
    const draft = await exchangeListingCommand(db, publisher.token, {
      operation: "create",
      mutationId: randomUUID(),
      expectedVersion: 0,
      ownerChurchId: null,
      schema: EXCHANGE_EDITOR_SCHEMA,
      fields: {
        ...emptyExchangeFields(),
        intent: "SALE",
        title: marker + " item " + price,
        description: "Fictional linked journey listing",
        category: "FURNITURE",
        condition: "GOOD",
        country: "US",
        placeId: place.id,
        currency: "USD",
        price
      }
    });
    listings.push(
      await exchangeListingCommand(db, publisher.token, {
        operation: "status",
        mutationId: randomUUID(),
        listingId: draft.id,
        expectedVersion: draft.version,
        state: "ACTIVE",
        itemPolicy: EXCHANGE_ITEM_POLICY,
        itemConfirmed: true
      })
    );
  }
  const calendarName = marker + " shared calendar",
    eventTitle = marker + " private appointment";
  const calendar = await calendarCommand(db, publisher.token, {
    operation: "create-calendar",
    requestKey: randomUUID(),
    name: calendarName,
    timeZone: "America/Chicago"
  });
  const calRow = await db.platformCalendar.findUniqueOrThrow({
    where: { id: calendar.id }
  });
  const initialEvent = await calendarCommand(db, publisher.token, {
    operation: "create-event",
    calendarId: calendar.id,
    expectedVersion: calRow.version,
    requestKey: randomUUID(),
    title: eventTitle,
    description: "PRIVATE-JOURNEY-NOTES",
    location: "PRIVATE-JOURNEY-LOCATION",
    allDay: false,
    startLocal: "2026-11-09T09:00",
    endLocal: "2026-11-09T10:00",
    timeZone: "America/Chicago",
    weeklyUntil: null
  });
  await calendarCommand(db, publisher.token, {
    operation: "share-calendar",
    calendarId: calendar.id,
    churchId: f.churchA.id,
    expectedVersion: 0,
    level: "DETAILS",
    confirmed: true
  });
  await signIn(viewer);
  await go("/platform?feed=latest&mode=list");
  const chosenPost = posts[4];
  await page.getByText(chosenPost.content, { exact: true }).waitFor();
  await page
    .getByText(chosenPost.content, { exact: true })
    .scrollIntoViewIfNeeded();
  await page.waitForFunction(
    (id) => new URL(location.href).searchParams.get("post") === id,
    chosenPost.id
  );
  const feedAddress = page.url(),
    feedScroll = await page.evaluate(() => scrollY);
  await platformNav().getByRole("link", { name: "Menu", exact: true }).click();
  await page.waitForURL("**/platform/menu");
  const menuFromFeed = page.url();
  await menuLink("/platform/exchange").click();
  await page.waitForURL("**/platform/exchange");
  const allListings = page.url();
  const filters = page.getByRole("form", {
    name: "Filter Exchange listings",
    exact: true
  });
  await filters.getByLabel("Search listings", { exact: true }).fill(marker);
  await filters
    .locator("summary", { hasText: "More filters and sorting" })
    .click();
  await filters.getByLabel("Currency", { exact: true }).selectOption("USD");
  await filters.locator('[name="basis"]').selectOption("item");
  await filters.getByLabel("Maximum price", { exact: true }).fill("2.00");
  await filters
    .getByLabel("Sort listings", { exact: true })
    .selectOption("price-high");
  await filters.locator('button[type="submit"]').click();
  const firstTitle = marker + " item 2.00";
  await page.getByRole("link", { name: firstTitle, exact: true }).waitFor();
  const criteria = page.url(),
    resultsSelector = 'h2 a[href^="/platform/exchange/"]';
  assert.deepEqual(await page.locator(resultsSelector).allTextContents(), [
    firstTitle,
    marker + " item 1.00"
  ]);
  await page
    .getByRole("link", { name: firstTitle, exact: true })
    .scrollIntoViewIfNeeded();
  const listingScroll = await page.evaluate(() => scrollY);
  await page
    .getByRole("link", { name: firstTitle, exact: true })
    .evaluate((link) =>
      link.addEventListener(
        "click",
        () => {
          window.journeyDeparture = { y: scrollY, history: history.state };
        },
        { once: true }
      )
    );
  await page.getByRole("link", { name: firstTitle, exact: true }).click();
  await page.waitForURL(
    (url) => url.pathname === "/platform/exchange/" + listings[1].id
  );
  const listingAddress = page.url();
  const listingDeparture = await page.evaluate(() => window.journeyDeparture);
  assert.ok(listingDeparture);
  await page.getByRole("heading", { name: firstTitle, exact: true }).waitFor();
  await page
    .getByRole("link", {
      name: "View " + publisher.name + " and contact choices",
      exact: true
    })
    .click();
  await page.waitForURL("**/platform/profile/" + publisher.username);
  const profileAddress = page.url();
  await page
    .getByRole("heading", { name: publisher.name, exact: true, level: 1 })
    .waitFor();
  await platformNav().getByRole("link", { name: "Menu", exact: true }).click();
  await page.waitForURL(menuFromFeed);
  const menuFromProfile = page.url();
  await menuLink("/platform/calendars").click();
  await page.waitForURL("**/platform/calendars");
  const calendarsAddress = page.url();
  const calendarRequests = [];
  const measureCalendar = (request) => {
    const url = new URL(request.url());
    if (
      url.pathname === "/api/platform/calendars" ||
      (url.pathname === "/api/platform/profile" &&
        url.searchParams.get("view") === "identity")
    )
      calendarRequests.push(url.pathname + url.search);
  };
  page.on("request", measureCalendar);
  await page.getByRole("link", { name: calendarName, exact: true }).click();
  await page.waitForURL("**/platform/calendars/" + calendar.id);
  const calendarAddress = page.url();
  await page
    .getByText("No events in this month for the selected calendars.", {
      exact: true
    })
    .waitFor();
  page.off("request", measureCalendar);
  readCosts.push({
    view: "shared calendar detail",
    calendarGets: calendarRequests.filter((url) =>
      url.startsWith("/api/platform/calendars?")
    ).length,
    identityGets: calendarRequests.filter((url) =>
      url.startsWith("/api/platform/profile?")
    ).length
  });
  console.log("READ_COST " + JSON.stringify(readCosts.at(-1)));

  const dates = page.getByRole("form", {
    name: "Change calendar view",
    exact: true
  });
  await dates.getByLabel("Month", { exact: true }).fill("2026-11");
  await dates
    .getByLabel("Viewing time zone", { exact: true })
    .fill("America/Chicago");
  await dates.getByRole("button", { name: "Update view", exact: true }).click();
  await page.getByRole("link", { name: eventTitle, exact: true }).waitFor();
  const monthAddress = page.url();
  await settingsLink().click();
  await page.waitForURL("**/platform/settings");
  const settingsAddress = page.url();
  await page.getByLabel("Search settings", { exact: true }).fill("alerts");
  // Settings records its query on departure so Back can restore the input.
  const settingsSearchAddress = settingsAddress + "?q=alerts";
  await page.locator("#setting-notifications-availability").click();
  await page.waitForURL("**/settings/notifications/availability");
  await page
    .getByRole("heading", { name: "Notification preferences", exact: true })
    .waitFor();
  await backTo(settingsSearchAddress);
  assert.equal(
    await page.getByLabel("Search settings", { exact: true }).inputValue(),
    "alerts"
  );
  await backTo(monthAddress);
  await page.getByRole("link", { name: eventTitle, exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Month", { exact: true }).inputValue(),
    "2026-11"
  );
  assert.equal(
    await page.getByLabel("Viewing time zone", { exact: true }).inputValue(),
    "America/Chicago"
  );
  await backTo(calendarAddress);
  await backTo(calendarsAddress);
  await backTo(menuFromProfile);
  await backTo(profileAddress);
  await page
    .getByRole("heading", { name: publisher.name, exact: true, level: 1 })
    .waitFor();
  await backTo(listingAddress);
  await page.getByRole("heading", { name: firstTitle, exact: true }).waitFor();
  await backTo(criteria);
  await page.getByRole("link", { name: firstTitle, exact: true }).waitFor();
  assert.deepEqual(await page.locator(resultsSelector).allTextContents(), [
    firstTitle,
    marker + " item 1.00"
  ]);
  assert.equal(
    await filters.getByLabel("Search listings", { exact: true }).inputValue(),
    marker
  );
  assert.equal(
    await filters.getByLabel("Sort listings", { exact: true }).inputValue(),
    "price-high"
  );
  try {
    await waitUntil(
      async () =>
        Math.abs((await page.evaluate(() => scrollY)) - listingDeparture.y) < 80
    );
  } catch (error) {
    const restored = await page.evaluate(() => ({
      y: scrollY,
      history: history.state,
      height: document.documentElement.scrollHeight
    }));
    diagnostics.push({
      check: "Listing scroll restoration",
      originalMeasurement: listingScroll,
      departure: listingDeparture,
      restored,
      error: String(error)
    });
    console.log("FAIL " + JSON.stringify(diagnostics.at(-1)));
  }
  await backTo(allListings);
  await page.goBack();
  await page.waitForURL((url) => url.pathname === "/platform/menu");
  if (page.url() !== menuFromFeed)
    diagnostics.push({
      check: "Feed state escaped onto Menu URL",
      expected: menuFromFeed,
      actual: page.url()
    });
  await backTo(feedAddress);
  await page.getByText(chosenPost.content, { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("post"), chosenPost.id);
  try {
    await waitUntil(
      async () =>
        Math.abs((await page.evaluate(() => scrollY)) - feedScroll) < 100
    );
  } catch (error) {
    diagnostics.push({
      check: "Feed scroll restoration",
      before: feedScroll,
      after: await page.evaluate(() => scrollY),
      error: String(error)
    });
    console.log("FAIL " + JSON.stringify(diagnostics.at(-1)));
  }
  await bounded();
  await page.screenshot({ path: output + "/restored-feed.png" });
  if (!diagnostics.length)
    ok(
      "One linked feed, filtered listing, owner profile, shared calendar and Settings journey restores the same post, result order, filters, month, zone, settings search and scroll on Back"
    );

  await go("/platform/profile/me");
  const bio = page.locator('textarea[name="bio"]');
  await bio.waitFor();
  const originalBio = (
    await db.platformUser.findUniqueOrThrow({ where: { id: viewer.id } })
  ).bio;
  await bio.fill("Unsaved journey profile text");
  await platformNav().getByRole("link", { name: "Home", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("heading", { name: "Keep your unsaved changes?", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  assert.equal(await bio.inputValue(), "Unsaved journey profile text");
  await page.evaluate(() => history.back());
  await page
    .getByText(
      "Your unsaved profile changes are still here. Finish or discard them before leaving.",
      { exact: true }
    )
    .waitFor();
  assert.equal(await bio.inputValue(), "Unsaved journey profile text");
  await platformNav().getByRole("link", { name: "Home", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Discard unsaved changes and leave",
      exact: true
    })
    .click();
  await page.waitForURL((url) => url.pathname === "/platform");
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { id: viewer.id } })).bio,
    originalBio
  );
  ok(
    "Unsaved profile text survives linked navigation and browser Back; explicit discard leaves without a write"
  );

  await signIn(publisher);
  await go(new URL(monthAddress).pathname + new URL(monthAddress).search);
  const eventForm = page.getByRole("form", {
    name: "Create event",
    exact: true
  });
  const eventInput = eventForm.getByLabel("Event title", { exact: true });
  await eventInput.fill("Unsaved calendar journey text");
  await settingsLink().click();
  await eventForm
    .getByText(
      "Your calendar entries are still here. Finish, retry or discard them before leaving.",
      { exact: true }
    )
    .waitFor();
  assert.equal(page.url(), monthAddress);
  assert.equal(await eventInput.inputValue(), "Unsaved calendar journey text");
  await page.evaluate(() => history.back());
  await eventForm
    .getByText(
      "Your calendar entries are still here. Finish, retry or discard them before leaving.",
      { exact: true }
    )
    .waitFor();
  assert.equal(await eventInput.inputValue(), "Unsaved calendar journey text");
  await eventForm
    .getByRole("button", {
      name: "Discard local calendar entries and reload",
      exact: true
    })
    .click();
  await eventInput.waitFor();
  await waitUntil(async () => (await eventInput.inputValue()) === "");
  const retryTitle = marker + " recovered event";
  await eventInput.fill(retryTitle);
  const originalRequests = [];
  let loseReply = true;
  await page.route("**/api/platform/calendars", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    originalRequests.push(route.request().postData());
    if (loseReply) {
      loseReply = false;
      const saved = await route.fetch();
      assert.equal(saved.status(), 200, await saved.text());
      await route.abort("failed");
    } else await route.continue();
  });
  await eventForm
    .getByRole("button", { name: "Create event", exact: true })
    .click();
  await eventForm
    .getByRole("button", {
      name: "Retry the same calendar request",
      exact: true
    })
    .waitFor();
  await waitUntil(
    async () =>
      (await db.calendarEvent.count({
        where: { calendarId: calendar.id, title: retryTitle }
      })) === 1
  );
  // A current reader refresh must not replace the immutable pending form.
  await page.evaluate(() => {
    dispatchEvent(new Event("blur"));
    dispatchEvent(new Event("focus"));
  });
  await page
    .getByRole("button", { name: "Confirm original request", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Confirm original request", exact: true })
    .click();
  await page.waitForURL((url) => url.pathname.startsWith("/platform/events/"));
  await page.getByRole("heading", { name: retryTitle, exact: true }).waitFor();
  assert.equal(originalRequests.length, 2);
  assert.equal(originalRequests[0], originalRequests[1]);
  assert.equal(
    await db.calendarEvent.count({
      where: { calendarId: calendar.id, title: retryTitle }
    }),
    1
  );
  await page.unroute("**/api/platform/calendars");
  ok(
    "Calendar edits survive link and native Back navigation; a lost creation reply retries the identical request after access recheck and creates one event"
  );
  const savedEvent = await db.calendarEvent.findFirstOrThrow({
    where: { calendarId: calendar.id, title: retryTitle },
    include: { occurrences: true }
  });
  const editForm = page.getByRole("form", {
    name: "Save this occurrence",
    exact: true
  });
  await editForm
    .getByLabel("Event title", { exact: true })
    .fill(marker + " retained edit");
  const beforeEdit = savedEvent.occurrences[0];
  const externalTitle = marker + " newer saved title";
  await calendarCommand(db, publisher.token, {
    operation: "edit-event",
    scope: "OCCURRENCE",
    eventId: savedEvent.id,
    occurrenceId: beforeEdit.id,
    expectedVersion: savedEvent.version,
    occurrenceVersion: beforeEdit.version,
    title: externalTitle,
    description: "",
    location: "",
    onlineUrl: "",
    organizer: "",
    allDay: false,
    startLocal: "2026-11-01T09:00",
    endLocal: "2026-11-01T10:00",
    timeZone: "America/Chicago",
    weeklyUntil: null
  });
  // Saving a sibling calendar form refreshes server props while this edit stays mounted.
  const rsvpForm = page.getByRole("form", {
    name: "Save my RSVP",
    exact: true
  });
  // Its old occurrence version first conflicts; explicitly load that form's current view.
  await rsvpForm
    .getByRole("button", { name: "Save my RSVP", exact: true })
    .click();
  await rsvpForm
    .getByRole("button", { name: "Load latest saved version", exact: true })
    .click();
  await page
    .getByRole("heading", { name: externalTitle, exact: true })
    .waitFor();
  assert.equal(
    await editForm.getByLabel("Event title", { exact: true }).inputValue(),
    marker + " retained edit"
  );
  await editForm
    .getByRole("button", { name: "Save this occurrence", exact: true })
    .click();
  await editForm
    .getByRole("button", { name: "Load latest saved version", exact: true })
    .waitFor();
  assert.equal(
    (
      await db.calendarOccurrence.findUniqueOrThrow({
        where: { id: beforeEdit.id }
      })
    ).title,
    externalTitle
  );
  await editForm
    .getByRole("button", { name: "Load latest saved version", exact: true })
    .click();
  await editForm
    .getByRole("button", { name: "Save this occurrence", exact: true })
    .click();
  await page
    .getByRole("heading", { name: marker + " retained edit", exact: true })
    .waitFor();
  assert.equal(
    (
      await db.calendarOccurrence.findUniqueOrThrow({
        where: { id: beforeEdit.id }
      })
    ).title,
    marker + " retained edit"
  );
  ok(
    "A server refresh preserves an unsaved calendar edit's original version; conflict review is explicit before saving over a newer occurrence"
  );
  let hiddenDraft;
  for (const definitiveStatus of [409, 429, 400]) {
    hiddenDraft = marker + " hidden retained edit " + definitiveStatus;
    await editForm.getByLabel("Event title", { exact: true }).fill(hiddenDraft);
    const uncertainEditRequests = [];
    await page.route("**/api/platform/calendars", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      uncertainEditRequests.push(route.request().postData());
      await route.abort("failed");
    });
    await editForm
      .getByRole("button", { name: "Save this occurrence", exact: true })
      .click();
    await editForm
      .getByRole("button", {
        name: "Retry the same calendar request",
        exact: true
      })
      .waitFor();
    await page.unroute("**/api/platform/calendars");
    const secondCurrent = await db.calendarOccurrence.findUniqueOrThrow({
      where: { id: beforeEdit.id },
      include: { event: true }
    });
    const secondExternalTitle = marker + " newer while uncertain " + definitiveStatus;
    await calendarCommand(db, publisher.token, {
      operation: "edit-event",
      scope: "OCCURRENCE",
      eventId: savedEvent.id,
      occurrenceId: beforeEdit.id,
      expectedVersion: secondCurrent.event.version,
      occurrenceVersion: secondCurrent.version,
      title: secondExternalTitle,
      description: "",
      location: "",
      onlineUrl: "",
      organizer: "",
      allDay: false,
      startLocal: "2026-11-01T09:00",
      endLocal: "2026-11-01T10:00",
      timeZone: "America/Chicago",
      weeklyUntil: null
    });
    // Saturate only this fictional member's edit budget for a real boundary 429.
    const editLimitKey = createHmac(
      "sha256", process.env.AUTH_RATE_LIMIT_SECRET + ":calendars"
    ).update("edit-event:" + publisher.id).digest("hex");
    if (definitiveStatus === 429) {
      const limit = { hits: 10, expiresAt: new Date(Date.now() + 900_000) };
      await db.platformAuthLimit.upsert({
        where: { key: editLimitKey },
        create: { key: editLimitKey, ...limit },
        update: limit
      });
    }
    let retryStatus;
    await page.route("**/api/platform/calendars", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      uncertainEditRequests.push(route.request().postData());
      // A definitive validation rejection is injected without forwarding or writing.
      // The 409 and 429 branches exercise the actual calendar HTTP boundary.
      if (definitiveStatus === 400) {
        retryStatus = 400;
        return route.fulfill({ status: 400, contentType: "application/json",
          body: JSON.stringify({ message: "Check the calendar fields." }) });
      }
      const response = await route.fetch();
      retryStatus = response.status();
      await route.fulfill({ response });
    });
    await page.evaluate(() => {
      dispatchEvent(new Event("blur"));
      dispatchEvent(new Event("focus"));
    });
    await page
      .getByRole("button", { name: "Confirm original request", exact: true })
      .click();
    await waitUntil(() => retryStatus !== undefined);
    assert.equal(retryStatus, definitiveStatus);
    await editForm.getByLabel("Event title", { exact: true }).waitFor();
    assert.equal(
      await editForm.getByLabel("Event title", { exact: true }).inputValue(),
      hiddenDraft
    );
    assert.equal(
      (
        await db.calendarOccurrence.findUniqueOrThrow({
          where: { id: beforeEdit.id }
        })
      ).title,
      secondExternalTitle
    );
    assert.equal(uncertainEditRequests.length, 2);
    assert.equal(uncertainEditRequests[0], uncertainEditRequests[1]);
    await page.unroute("**/api/platform/calendars");
    if (definitiveStatus === 429)
      await db.platformAuthLimit.delete({ where: { key: editLimitKey } });
    if (definitiveStatus !== 409) {
      // Ending a throttle or validation error must not silently adopt newer props.
      await editForm.getByRole("button", { name: "Save this occurrence", exact: true }).click();
      await editForm.getByRole("button", { name: "Load latest saved version", exact: true }).waitFor();
      assert.equal((await db.calendarOccurrence.findUniqueOrThrow({
        where: { id: beforeEdit.id }
      })).title, secondExternalTitle);
    }
    await editForm
      .getByRole("button", { name: "Load latest saved version", exact: true })
      .click();
    await editForm
      .getByRole("button", { name: "Save this occurrence", exact: true })
      .click();
    await page.getByRole("heading", { name: hiddenDraft, exact: true }).waitFor();
    assert.equal(
      (
        await db.calendarOccurrence.findUniqueOrThrow({
          where: { id: beforeEdit.id }
        })
      ).title,
      hiddenDraft
    );
    ok(
      `An uncertain edit, external update and concealed-snapshot retry ${definitiveStatus} preserve the draft and explicit conflict review without an overwrite`
    );
  }
  const responsesBefore = await db.calendarResponse.count({
    where: { occurrenceId: savedEvent.occurrences[0].id }
  });
  await signIn(viewer);
  // Keep the original owner's mounted editor, then switch only the session.
  await page
    .getByRole("form", { name: "Save my RSVP", exact: true })
    .getByRole("button", { name: "Save my RSVP", exact: true })
    .click();
  await page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .first()
    .waitFor();
  assert.equal(
    (await page.locator("body").innerText()).includes(hiddenDraft),
    false
  );
  assert.equal(
    await db.calendarResponse.count({
      where: { occurrenceId: savedEvent.occurrences[0].id }
    }),
    responsesBefore
  );
  ok(
    "An account switch in a mounted calendar form denies the save, conceals the former owner's event and performs no response write"
  );

  await go(new URL(listingAddress).pathname + new URL(listingAddress).search);
  await page.getByRole("heading", { name: firstTitle, exact: true }).waitFor();
  await settingsLink().click();
  await page.waitForURL(settingsAddress);
  const currentListing = await db.exchangeListing.findUniqueOrThrow({
    where: { id: listings[1].id }
  });
  await exchangeListingCommand(db, publisher.token, {
    operation: "status",
    mutationId: randomUUID(),
    listingId: currentListing.id,
    expectedVersion: currentListing.version,
    state: "ARCHIVED"
  });
  await watchLeaks(firstTitle);
  await backTo(listingAddress);
  await waitUntil(
    async () => !(await page.locator("body").innerText()).includes(firstTitle)
  );
  await page
    .getByText(/unavailable|access changed|no longer available/i)
    .first()
    .waitFor();
  assert.deepEqual(await page.evaluate(() => window.journeyLeaks ?? []), []);
  await page.screenshot({ path: output + "/revoked-listing-back.png" });
  ok(
    "Archiving a listing while elsewhere prevents private source restoration on Back without a prior reload or a visible stale-title flash"
  );

  await go(new URL(monthAddress).pathname + new URL(monthAddress).search);
  await page.getByRole("link", { name: eventTitle, exact: true }).waitFor();
  await settingsLink().click();
  await page.waitForURL(settingsAddress);
  const occurrence = await db.calendarOccurrence.findUniqueOrThrow({
    where: { id: initialEvent.occurrenceId }
  });
  await calendarCommand(db, viewer.token, {
    operation: "rsvp",
    occurrenceId: occurrence.id,
    eventId: occurrence.eventId,
    occurrenceVersion: occurrence.version,
    expectedVersion: 0,
    state: "GOING"
  });
  const cachedViews = [];
  for (const path of [
    "/platform/events/" + occurrence.id,
    "/platform/calendars?month=2026-11&timeZone=America%2FChicago",
    "/platform/commitments?month=2026-11&timeZone=America%2FChicago"
  ]) {
    const target = await context.newPage();
    target.on("pageerror", (e) =>
      errors.push({ path: new URL(target.url()).pathname, message: e.message })
    );
    await target.goto(config.origin + path);
    await target.getByText(eventTitle, { exact: true }).first().waitFor();
    await target
      .getByRole("navigation", { name: "Account and website", exact: true })
      .getByRole("link", { name: "Settings", exact: true })
      .click();
    await target.waitForURL(settingsAddress);
    await watchLeaks(eventTitle, target);
    cachedViews.push({ target, address: config.origin + path });
  }
  const connection = await db.churchConnection.findUniqueOrThrow({
    where: { userId_churchId: { userId: viewer.id, churchId: f.churchA.id } }
  });
  await portalCommand(db, viewer.token, {
    operation: "transition",
    action: "LEAVE",
    churchId: f.churchA.id,
    connectionId: connection.id,
    expectedVersion: connection.version
  });
  const currentRead = await context.request.get(
    config.origin +
      "/api/platform/calendars?view=calendar&calendarId=" +
      calendar.id,
    { ignoreHTTPSErrors: true }
  );
  assert.ok(
    [403, 404].includes(currentRead.status()),
    await currentRead.text()
  );
  await watchLeaks(eventTitle);
  await backTo(monthAddress);
  await waitUntil(
    async () => !(await page.locator("body").innerText()).includes(eventTitle)
  );
  await page
    .getByText(/access changed|not available|unavailable/i)
    .first()
    .waitFor();
  assert.deepEqual(await page.evaluate(() => window.journeyLeaks ?? []), []);
  await page.screenshot({ path: output + "/revoked-calendar-back.png" });
  ok(
    "Leaving the sharing church prevents previously cached private calendar details from appearing on Back"
  );
  for (const { target, address } of cachedViews) {
    await target.goBack();
    await target.waitForURL(address);
    await waitUntil(
      async () =>
        !(await target.locator("body").innerText()).includes(eventTitle)
    );
    await target
      .getByText(/access changed|not available|unavailable/i)
      .first()
      .waitFor();
    assert.deepEqual(
      await target.evaluate(() => window.journeyLeaks ?? []),
      []
    );
    await target.close();
  }
  ok(
    "Revoked event detail, combined calendar layers and commitments remain concealed on Back without a stale-title flash"
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(diagnostics, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        results,
        errors,
        readCosts,
        productionBuild: true,
        productionWrites: 0,
        externalSends: 0
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  console.log("NAVIGATION_JOURNEY_BROWSER_PASS " + results.length);
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.json",
    JSON.stringify(
      {
        results,
        errors,
        diagnostics,
        url: page.url(),
        error: String(error),
        body: await page
          .locator("body")
          .innerText()
          .catch(() => "")
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
