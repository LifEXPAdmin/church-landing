import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const fixtureDir = process.argv[2];
assert.ok(
  fixtureDir,
  "Pass the isolated guest resource entry fixture directory"
);
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
const output = fixtureDir + "/guest-resource-entry-" + Date.now();
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
const { mediaCatalogCommand } =
  await import("../lib/platform/media-catalog-commands.ts");
const { mediaFields } = await import("../lib/platform/media-catalog-input.ts");
const { MEDIA_POLICY } =
  await import("../lib/platform/media-catalog-options.ts");
const guest = async () => {
  await page.goto("about:blank");
  await context.clearCookies();
};
const headerReturn = async (expected) => {
  const href = await page
    .getByRole("banner")
    .getByRole("link", { name: "Sign in", exact: true })
    .getAttribute("href");
  assert.equal(new URL(href, config.origin).searchParams.get("next"), expected);
};
const signInThrough = async (link, actor, expected) => {
  await link.click();
  if (new URL(page.url()).pathname === "/platform/join")
    await page
      .getByRole("main")
      .getByRole("link", { name: "Sign in", exact: true })
      .click();
  await page.getByLabel("Email", { exact: true }).fill(actor.email);
  await page.getByLabel("Password", { exact: true }).fill(actor.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(config.origin + expected);
};
try {
  const owner = await createPortalActor(db, "guestentry"),
    reader = await createPortalActor(db, "guestread");
  const marker = "GuestEntry" + randomUUID().slice(0, 8);
  const fields = mediaFields({
    title: marker + " media",
    description: "Fictional public recording",
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
      textRights: true,
      evidenceReference: "PRIVATE_RIGHTS_" + marker
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
  const privateMedia = await mediaCatalogCommand(db, owner.token, {
    operation: "create",
    mutationId: randomUUID(),
    ownerChurchId: null,
    ...reviewed,
    fields: { ...fields, title: marker + " private media" }
  });
  const listing = await db.exchangeListing.create({
    data: {
      ownerId: owner.id,
      creatorId: owner.id,
      state: "ACTIVE",
      publishedAt: new Date(),
      confirmedAt: new Date(),
      itemPolicy: "exchange-listings-v3",
      category: "BOOKS",
      condition: "GOOD",
      country: "US",
      placeId: 4887398,
      placeLabel: "Chicago",
      title: marker + " listing",
      description: "Fictional publicly shared listing"
    }
  });
  const privateListing = await db.exchangeListing.create({
    data: {
      ownerId: owner.id,
      creatorId: owner.id,
      state: "DRAFT",
      title: marker + " private listing",
      description: "PRIVATE_LISTING_" + marker
    }
  });
  const church = await db.church.create({
    data: {
      slug: randomUUID(),
      name: "Fictional guest entry church",
      summary: "Fictional guest entry fixture",
      communityListed: true
    }
  });
  const calendar = await db.platformCalendar.create({
    data: {
      name: "Fictional guest calendar",
      creatorId: owner.id,
      churchId: church.id,
      requestKey: randomUUID(),
      timeZone: "UTC"
    }
  });
  const event = await db.calendarEvent.create({
    data: {
      calendarId: calendar.id,
      requestKey: randomUUID(),
      title: marker + " public event",
      timeZone: "UTC",
      startLocal: "2026-10-10T12:00",
      endLocal: "2026-10-10T13:00",
      visibility: "PUBLIC"
    }
  });
  const occurrence = await db.calendarOccurrence.create({
    data: {
      eventId: event.id,
      ordinal: 0,
      title: event.title,
      allDay: false,
      timeZone: "UTC",
      startLocal: event.startLocal,
      endLocal: event.endLocal,
      startAt: new Date("2026-10-10T12:00Z"),
      endAt: new Date("2026-10-10T13:00Z")
    }
  });
  await guest();
  const eventPath =
    "/platform/events/" + occurrence.id + "?timeZone=Pacific%2FAuckland";
  await go(eventPath);
  await page.getByRole("heading", { name: event.title, exact: true }).waitFor();
  await headerReturn(eventPath);
  const eventLinks = await page
    .getByRole("main")
    .locator('a[href*="/platform/login?"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
  assert.ok(eventLinks.length);
  for (const href of eventLinks)
    assert.equal(
      new URL(href, config.origin).searchParams.get("next"),
      eventPath
    );
  await go(
    "/platform/events/unavailable-guest-fixture?timeZone=Pacific%2FAuckland"
  );
  await headerReturn(
    "/platform/events/unavailable-guest-fixture?timeZone=Pacific%2FAuckland"
  );
  ok(
    "Public and unavailable event header and response-entry links retain the event and valid display zone"
  );
  const mediaPath = "/platform/media/" + media.id,
    listingPath = "/platform/exchange/" + listing.id;
  await guest();
  await go(mediaPath);
  await page
    .getByRole("heading", { name: fields.title, exact: true })
    .waitFor();
  await headerReturn(mediaPath);
  const bookmark = page.getByRole("link", {
    name: "Sign in to bookmark this resource",
    exact: true
  });
  assert.equal(
    new URL(
      await bookmark.getAttribute("href"),
      config.origin
    ).searchParams.get("next"),
    mediaPath
  );
  assert.equal(await page.locator("iframe").count(), 0);
  ok(
    "Public media reading and bookmark entry retain the media destination without starting a provider"
  );
  await signInThrough(bookmark, reader, mediaPath);
  await page
    .getByRole("button", { name: "Bookmark", exact: true })
    .waitFor({ state: "visible" });
  assert.equal(
    await db.savedPostItem.count({ where: { ownerId: reader.id } }),
    0
  );
  ok(
    "Actual media sign-in returns to the resource without automatically bookmarking it"
  );
  await guest();
  await go(listingPath);
  await page
    .getByRole("heading", { name: listing.title, exact: true })
    .waitFor();
  await headerReturn(listingPath);
  const inquiry = page.getByRole("link", {
    name: "Sign in to ask about this listing",
    exact: true
  });
  await inquiry.waitFor();
  await page.setViewportSize({ width: 320, height: 844 });
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    true
  );
  await page.screenshot({
    path: output + "/listing-320-enlarged.png",
    fullPage: true
  });
  await signInThrough(inquiry, reader, listingPath);
  await page
    .getByRole("region", { name: "Listing inquiry", exact: true })
    .waitFor();
  assert.equal(
    await db.exchangeInquiry.count({ where: { listingId: listing.id } }),
    0
  );
  ok(
    "Guest listing inquiry entry works at 320px enlarged text and actual sign-in sends no inquiry"
  );
  await guest();
  for (const path of [
    "/platform/media",
    "/platform/media/new",
    "/platform/media/studio",
    "/platform/media/saved",
    "/platform/media/playlists",
    mediaPath + "/edit"
  ]) {
    await go(path);
    await headerReturn(path);
  }
  ok(
    "Media library, draft, studio, saved, playlists and editor headers retain their current destination"
  );
  for (const [path, expected] of [
    ["/platform/media/new", "/platform/media/new"],
    [mediaPath + "/edit", mediaPath + "/edit"],
    ["/platform/media/saved", "/platform/media/saved"],
    [
      "/platform/media/playlists/fictional-id?edit=1",
      "/platform/media/playlists/fictional-id?edit=1"
    ]
  ]) {
    await go(path);
    const href = await page
      .getByRole("main")
      .getByRole("link", { name: "Sign in", exact: true })
      .getAttribute("href");
    assert.equal(
      new URL(href, config.origin).searchParams.get("next"),
      expected
    );
  }
  ok(
    "Inline media management sign-in links retain the exact form destination without form values"
  );
  for (const kind of ["media", "listings", "opportunities", "groups"]) {
    await go("/platform/search?" + new URLSearchParams({ kind, q: marker }));
    const href = await page
      .getByRole("banner")
      .getByRole("link", { name: "Sign in", exact: true })
      .getAttribute("href");
    const next = new URL(
      new URL(href, config.origin).searchParams.get("next"),
      config.origin
    );
    assert.equal(next.searchParams.get("kind"), kind);
    assert.equal(next.searchParams.get("q"), marker);
    assert.equal(next.searchParams.has("after"), false);
  }
  const searchPath =
    "/platform/search?" + new URLSearchParams({ kind: "media", q: marker });
  await go(searchPath);
  await signInThrough(
    page
      .getByRole("banner")
      .getByRole("link", { name: "Sign in", exact: true }),
    reader,
    searchPath
  );
  await page
    .getByRole("region", { name: "Search results" })
    .getByText(fields.title, { exact: true })
    .waitFor();
  ok(
    "New resource categories survive header sign-in, including actual media search login and results"
  );
  await guest();
  for (const [path, privateText] of [
    ["/platform/media/" + privateMedia.id, marker + " private media"],
    ["/platform/exchange/" + privateListing.id, privateListing.title]
  ]) {
    for (const rsc of [false, true]) {
      const response = await context.request.get(config.origin + path, {
        headers: rsc ? { RSC: "1" } : {}
      });
      const body = await response.text();
      for (const secret of [
        privateText,
        owner.email,
        owner.password,
        owner.token,
        "PRIVATE_RIGHTS_" + marker,
        "PRIVATE_LISTING_" + marker
      ])
        assert.ok(
          !body.includes(secret),
          "Guest HTML/RSC must omit private resource and owner details"
        );
    }
  }
  const privateResponse = await context.request.get(
    config.origin +
      "/api/platform/media-catalog?view=detail&id=" +
      privateMedia.id
  );
  assert.equal(privateResponse.status(), 404);
  const publicResponse = await context.request.get(
    config.origin + "/api/platform/media-catalog?view=detail&id=" + media.id
  );
  assert.equal(publicResponse.status(), 200);
  const publicText = await publicResponse.text();
  assert.ok(publicText.includes(fields.title));
  for (const secret of [
    owner.email,
    owner.password,
    owner.token,
    "PRIVATE_RIGHTS_" + marker
  ])
    assert.ok(!publicText.includes(secret));
  ok(
    "Guest HTML, RSC and media API preserve private-resource absence and omit owner credentials and rights evidence"
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(blockedRequests, []);
  writeFileSync(
    output + "/PASS.json",
    JSON.stringify(
      {
        source: process.env.VERCEL_GIT_COMMIT_SHA,
        results,
        errors,
        blockedRequests
      },
      null,
      2
    )
  );
} catch (error) {
  writeFileSync(
    output + "/FAIL.json",
    JSON.stringify(
      {
        error: String(error),
        stack: error.stack,
        results,
        errors,
        blockedRequests
      },
      null,
      2
    )
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
