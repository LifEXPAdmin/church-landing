import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const fixture = process.argv[2];
assert.ok(fixture, "Pass the owned isolated fixture directory");
Object.assign(
  process.env,
  JSON.parse(readFileSync(fixture + "/environment.json", "utf8"))
);
const origin = process.env.ACCOUNT_ORIGIN;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
const { PrismaClient } = await import("@prisma/client");
const { createPortalActor, assertPortalTestDatabase, seedOperatorGrants } =
  await import("../tests/seed-portal.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ??
    `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`
)("playwright");
const publicKey = execFileSync("openssl", [
  "x509",
  "-in",
  fixture + "/localhost-cert.pem",
  "-pubkey",
  "-noout"
]);
const der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], {
  input: publicKey
});
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: [
    "--ignore-certificate-errors-spki-list=" +
      createHash("sha256").update(der).digest("base64"),
    "--no-proxy-server"
  ]
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }
});
context.setDefaultTimeout(15000);
await context.route("**/*", (route) =>
  new URL(route.request().url()).hostname === "127.0.0.1"
    ? route.continue()
    : route.abort()
);
const page = await context.newPage(),
  errors = [],
  results = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
const output = fixture + "/browser-" + Date.now();
mkdirSync(output, { recursive: true });
const ok = (label) => {
  results.push(label);
  console.log("PASS " + label);
};
const wait = async (fn) => {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Expected saved state was not observed");
};
const go = async (path) => {
  await page.goto(origin + path);
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
};
const actor = await createPortalActor(db, "artistbrowser");
await context.addCookies([
  {
    name: sessionCookieFixtureName(origin),
    value: actor.token,
    url: origin,
    httpOnly: true,
    secure: true,
    sameSite: "Lax"
  }
]);
let providerAttempts = 0;
await context.unroute("**/*");
await context.route("**/*", (route) => {
  if (new URL(route.request().url()).hostname === "127.0.0.1")
    return route.continue();
  providerAttempts++;
  return route.abort();
});

const reviewer = await createPortalActor(db, "artistreview");
await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
const { artistCommand } = await import("../lib/platform/artist-commands.ts");
const title = "Fictional browser artist " + randomUUID();
const rights = () =>
  page
    .getByLabel("I reviewed this exact version", { exact: false })
    .first()
    .check();
const row = () =>
  db.artistProfile.findFirst({ where: { stewardId: actor.id, name: title } });
try {
  await go("/platform/music/new");
  await page.getByLabel("Artist name", { exact: true }).fill(title);
  await page
    .getByLabel("Biography", { exact: true })
    .fill("A supplied profile with no artwork or releases.");
  await page.getByLabel("Band", { exact: true }).check();
  await page.getByLabel("Genres", { exact: false }).fill("Acoustic");
  await page.getByLabel("I am this artist", { exact: false }).check();
  await rights();
  await page
    .getByRole("button", { name: "Create private draft", exact: true })
    .click();
  await wait(async () => !!(await row()));
  const artist = await row();
  await wait(async () =>
    page.url().endsWith(`/platform/music/${artist.id}/edit`)
  );
  await page
    .getByRole("button", { name: "Publish profile publicly", exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("Artist name", { exact: true }).inputValue(),
    title
  );
  ok("new artist saves once as a private draft and navigates to its editor");
  await rights();
  await page
    .getByRole("button", { name: "Publish profile publicly", exact: true })
    .click();
  await wait(async () => (await row()).state === "PUBLISHED");
  await page
    .getByRole("button", { name: "Unpublish artist", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Add release", exact: true }).click();
  const releaseEditor = page.getByRole("region", { name: "Release editor" });
  await releaseEditor
    .getByLabel("Release title", { exact: true })
    .fill("First supplied release");
  await releaseEditor
    .getByRole("button", { name: "Add track", exact: true })
    .click();
  await releaseEditor
    .getByLabel("Track 1 title", { exact: true })
    .fill("A fictional song");
  await releaseEditor
    .getByLabel("Release listening links", { exact: false })
    .fill("https://open.spotify.com/track/1234567890123456789012");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal(await releaseEditor.count(), 0);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await releaseEditor.waitFor();
  assert.equal(
    await releaseEditor
      .getByLabel("Release title", { exact: true })
      .inputValue(),
    "First supplied release"
  );
  ok("release edits disappear on blur and survive a fresh authorized return");
  let lostBody;
  await page.route(
    "**/api/platform/artists",
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      lostBody = route.request().postData();
      await route.fetch();
      await route.abort("failed");
    },
    { times: 1 }
  );
  await releaseEditor
    .getByRole("button", { name: "Save private release draft", exact: true })
    .click();
  await releaseEditor
    .getByRole("button", { name: "Retry exact change", exact: true })
    .waitFor();
  await wait(
    async () =>
      (await db.artistRelease.count({ where: { artistId: artist.id } })) === 1
  );
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await releaseEditor
    .getByRole("button", { name: "Retry exact change", exact: true })
    .waitFor();
  let replayBody;
  await page.route(
    "**/api/platform/artists",
    async (route) => {
      replayBody = route.request().postData();
      await route.continue();
    },
    { times: 1 }
  );
  await releaseEditor
    .getByRole("button", { name: "Retry exact change", exact: true })
    .click();
  await releaseEditor.waitFor({ state: "hidden" });
  assert.equal(replayBody, lostBody);
  assert.equal(
    await db.artistRelease.count({ where: { artistId: artist.id } }),
    1
  );
  ok(
    "lost accepted release save retains exact request across concealment and creates no duplicate"
  );
  await page.getByRole("button", { name: "Edit release", exact: true }).click();
  await releaseEditor
    .getByLabel("I reviewed this exact version", { exact: false })
    .check();
  await releaseEditor
    .getByRole("button", { name: "Publish release publicly", exact: true })
    .click();
  await wait(
    async () =>
      (await db.artistRelease.count({
        where: { artistId: artist.id, state: "PUBLISHED" }
      })) === 1
  );
  await releaseEditor
    .getByRole("button", { name: "Unpublish release", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Add release", exact: true })
      .isEnabled(),
    false
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Edit release", exact: true })
      .isEnabled(),
    false
  );
  ok(
    "an open release editor prevents sibling selectors from silently discarding edits"
  );
  await releaseEditor
    .getByRole("button", { name: "Close release editor", exact: true })
    .click();
  await go(`/platform/music/${artist.id}`);
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  await page
    .getByRole("heading", { name: "First supplied release", exact: true })
    .waitFor();
  assert.equal(providerAttempts, 0);
  assert.equal(await page.locator("iframe,audio,video").count(), 0);
  ok(
    "public artist and release render without artwork, embeds, autoplay or provider requests"
  );
  await page
    .getByRole("button", { name: "Follow artist", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Unfollow artist", exact: true })
    .waitFor();
  await go("/platform/music/following");
  await page.getByRole("link", { name: title, exact: true }).waitFor();
  assert.equal(
    await db.platformFollow.count({ where: { followerId: actor.id } }),
    0
  );
  ok(
    "canonical artist follows appear in the private list without personal contact or notification grants"
  );
  await go(`/platform/music/${artist.id}`);
  await page.getByRole("button", { name: "about", exact: true }).click();
  await page
    .getByText("A supplied profile with no artwork or releases.", {
      exact: true
    })
    .waitFor();
  await page.getByRole("button", { name: "support", exact: true }).click();
  await page
    .getByText("No support or purchase destination", { exact: false })
    .waitFor();
  await page.getByRole("button", { name: "events", exact: true }).click();
  await page
    .getByText("No currently available organizer-approved events.", {
      exact: true
    })
    .waitFor();
  await page.getByRole("button", { name: "music", exact: true }).click();
  assert.ok(
    await page
      .getByRole("link", { name: "Report this release or a rights concern" })
      .getAttribute("href")
  );
  ok(
    "Music, Events, About and Support explain empty states and supply specific report entry points"
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  );
  await page.screenshot({
    path: output + "/mobile-artist.png",
    fullPage: true
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: output + "/desktop-artist.png",
    fullPage: true
  });
  ok("phone and desktop artist pages fit without horizontal overflow");
  await go(
    "/platform/music?q=" +
      encodeURIComponent(title) +
      "&genre=Acoustic&role=Band&release=SINGLE"
  );
  await page.getByRole("link", { name: title, exact: true }).waitFor();
  await page.getByLabel("Genre", { exact: true }).fill("Impossible genre");
  await page.getByRole("button", { name: "Search music", exact: true }).click();
  await page
    .getByText("No currently available artists match these choices.", {
      exact: false
    })
    .waitFor();
  await page.goBack();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("link", { name: title, exact: true }).waitFor();
  ok("combined discovery filters and browser back restore exact URL state");

  const { calendarCommand } =
    await import("../lib/platform/calendar-commands.ts");
  const church = await db.church.create({
    data: {
      slug: randomUUID(),
      name: "Fictional browser concert church",
      summary: "Isolated",
      communityListed: true
    }
  });
  await db.churchConnection.create({
    data: { userId: reviewer.id, churchId: church.id, state: "APPROVED" }
  });
  await db.churchCapabilityGrant.createMany({
    data: ["EDIT_CHURCH_CALENDAR", "PUBLISH_CHURCH_EVENTS"].map(
      (capability) => ({ userId: reviewer.id, churchId: church.id, capability })
    )
  });
  const calendar = await calendarCommand(db, reviewer.token, {
    operation: "create-calendar",
    requestKey: randomUUID(),
    churchId: church.id,
    name: "Fictional concerts",
    timeZone: "America/Chicago"
  });
  const event = await calendarCommand(db, reviewer.token, {
    operation: "create-event",
    requestKey: randomUUID(),
    calendarId: calendar.id,
    expectedVersion: 1,
    title: "Fictional browser concert",
    allDay: false,
    startLocal: "2026-11-15T10:00",
    endLocal: "2026-11-15T11:00",
    timeZone: "America/Chicago",
    weeklyUntil: null,
    visibility: "PUBLIC"
  });
  const occurrence = await db.calendarOccurrence.findFirstOrThrow({
    where: { eventId: event.id }
  });
  const proposed = await artistCommand(db, actor.token, {
    operation: "propose-event",
    mutationId: randomUUID(),
    artistId: artist.id,
    occurrenceId: occurrence.id,
    expectedVersion: 0
  });
  await artistCommand(db, reviewer.token, {
    operation: "accept-event",
    mutationId: randomUUID(),
    artistId: artist.id,
    associationId: proposed.id,
    expectedVersion: 1
  });
  await go(`/platform/music/${artist.id}`);
  await page.getByRole("button", { name: "events", exact: true }).click();
  await page
    .getByRole("link", { name: "Fictional browser concert", exact: true })
    .click();
  await page.waitForURL(`**/platform/events/${occurrence.id}`);
  await page
    .getByRole("heading", { name: "Fictional browser concert", exact: true })
    .waitFor();
  ok(
    "organizer-approved artist performances open the actual canonical event page"
  );
  await go(`/platform/music/${artist.id}`);
  await page
    .getByRole("button", { name: "Open on Spotify", exact: true })
    .click();
  await wait(async () => providerAttempts === 1);
  ok(
    "a deliberate listening action rechecks the current source and makes exactly one provider request"
  );
  await go(`/platform/music/${artist.id}`);
  await page
    .getByRole("button", { name: "Open on Spotify", exact: true })
    .waitFor();
  const publishedRelease = await db.artistRelease.findFirstOrThrow({
    where: { artistId: artist.id, state: "PUBLISHED" }
  });
  await artistCommand(db, actor.token, {
    operation: "unpublish-release",
    mutationId: randomUUID(),
    artistId: artist.id,
    releaseId: publishedRelease.id,
    expectedVersion: publishedRelease.version
  });
  await page
    .getByRole("button", { name: "Open on Spotify", exact: true })
    .click();
  await page
    .getByText("This listening link changed or is no longer available.", {
      exact: true
    })
    .waitFor();
  assert.equal(providerAttempts, 1);
  ok(
    "a retained stale listening button cannot contact a provider after release withdrawal"
  );
  await go(`/platform/music/${artist.id}/edit`);
  await page
    .getByRole("button", { name: "Unpublish artist", exact: true })
    .click();
  await wait(async () => (await row()).state === "UNPUBLISHED");
  await go(`/platform/music/${artist.id}`);
  await page.getByText("unavailable", { exact: false }).first().waitFor();
  assert.equal(
    await page
      .getByRole("heading", { name: "First supplied release", exact: true })
      .count(),
    0
  );
  assert.equal(providerAttempts, 1);
  ok(
    "withdrawing parent publication hides all child releases and external actions"
  );
  await go("/platform/music/following");
  await page
    .getByRole("button", { name: "Remove unavailable follow 1", exact: true })
    .click();
  await wait(
    async () =>
      !(
        await db.socialRelationship.findUnique({
          where: {
            ownerId_artistId: { ownerId: actor.id, artistId: artist.id }
          }
        })
      )?.followingArtist
  );
  ok(
    "unavailable followed references can be removed without disclosing hidden artist metadata"
  );
  await go(`/platform/music/${artist.id}/edit`);
  await page.getByRole("button", { name: "Edit release", exact: true }).click();
  let removedBody;
  await page.route(
    "**/api/platform/artists",
    async (route) => {
      removedBody = route.request().postData();
      await route.fetch();
      await route.abort("failed");
    },
    { times: 1 }
  );
  await releaseEditor
    .getByRole("button", { name: "Remove release", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Retry exact change", exact: true })
    .waitFor();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("region", { name: "Pending release change" }).waitFor();
  assert.equal(
    await page.getByLabel("Release title", { exact: true }).count(),
    0
  );
  let removeReplay;
  await page.route(
    "**/api/platform/artists",
    async (route) => {
      removeReplay = route.request().postData();
      await route.continue();
    },
    { times: 1 }
  );
  await page
    .getByRole("button", { name: "Retry exact change", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Pending release change" })
    .waitFor({ state: "hidden" });
  assert.equal(removeReplay, removedBody);
  ok(
    "lost accepted removal conceals metadata while retaining exact retry controls"
  );

  const delegate = await createPortalActor(db, "artistbrowserdelegate");
  await page
    .getByLabel("Member account reference", { exact: true })
    .fill(delegate.id);
  await page.getByLabel("Edit profile descriptions", { exact: true }).check();
  await page
    .getByRole("button", { name: "Propose editor permissions", exact: true })
    .click();
  await wait(
    async () =>
      !!(await db.artistDelegate.findUnique({
        where: {
          artistId_accountId: { artistId: artist.id, accountId: delegate.id }
        }
      }))
  );
  await context.addCookies([
    {
      name: sessionCookieFixtureName(origin),
      value: delegate.token,
      url: origin,
      httpOnly: true,
      secure: true,
      sameSite: "Lax"
    }
  ]);
  await go("/platform/music/studio");
  await page
    .getByRole("button", {
      name: "Accept these editor permissions",
      exact: true
    })
    .click();
  await wait(
    async () =>
      (
        await db.artistDelegate.findUnique({
          where: {
            artistId_accountId: { artistId: artist.id, accountId: delegate.id }
          }
        })
      )?.state === "ACCEPTED"
  );
  await go(`/platform/music/${artist.id}/edit`);
  await page
    .getByRole("textbox", { name: "Biography", exact: true })
    .fill("UNSENT_PRIVATE_DELEGATE_MARKER");
  assert.equal(
    await page
      .getByRole("button", { name: "Add release", exact: true })
      .count(),
    0
  );
  ok(
    "an explicitly accepted profile editor can edit the profile without seeing release drafts or publication controls"
  );

  const grant = await db.artistDelegate.findUniqueOrThrow({
    where: {
      artistId_accountId: { artistId: artist.id, accountId: delegate.id }
    }
  });
  await artistCommand(db, actor.token, {
    operation: "revoke-invite",
    mutationId: randomUUID(),
    artistId: artist.id,
    invitationId: grant.id,
    expectedVersion: grant.version
  });
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByRole("button", {
      name: "Discard concealed profile edits",
      exact: true
    })
    .waitFor();
  assert.equal(
    await page.getByRole("textbox", { name: "Biography", exact: true }).count(),
    0
  );
  assert.ok(
    !(await page.locator("body").innerText()).includes(
      "UNSENT_PRIVATE_DELEGATE_MARKER"
    )
  );
  await page
    .getByRole("button", {
      name: "Discard concealed profile edits",
      exact: true
    })
    .click();
  await page.getByRole("link", { name: "Artist studio", exact: true }).click();
  await page.waitForURL("**/platform/music/studio");
  ok(
    "revoked profile access conceals local metadata and leaves an explicit discard path out of the guarded editor"
  );
  await context.addCookies([
    {
      name: sessionCookieFixtureName(origin),
      value: actor.token,
      url: origin,
      httpOnly: true,
      secure: true,
      sameSite: "Lax"
    }
  ]);
  const privateRelease = await artistCommand(db, actor.token, {
    operation: "create-release",
    mutationId: randomUUID(),
    artistId: artist.id,
    fields: {
      kind: "SINGLE",
      title: "Private transient draft",
      tracks: [],
      links: []
    }
  });
  await go(`/platform/music/${artist.id}/edit`);
  await page.getByRole("button", { name: "Edit release", exact: true }).click();
  await releaseEditor
    .getByLabel("Release title", { exact: true })
    .fill("UNSENT_PRIVATE_RELEASE_MARKER");
  await artistCommand(db, actor.token, {
    operation: "remove-release",
    mutationId: randomUUID(),
    artistId: artist.id,
    releaseId: privateRelease.id,
    expectedVersion: 1
  });
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByRole("button", {
      name: "Close concealed release editor",
      exact: true
    })
    .waitFor();
  assert.equal(
    await page.getByLabel("Release title", { exact: true }).count(),
    0
  );
  assert.ok(
    !(await page.locator("body").innerText()).includes(
      "UNSENT_PRIVATE_RELEASE_MARKER"
    )
  );
  await page
    .getByRole("button", {
      name: "Close concealed release editor",
      exact: true
    })
    .click();
  await page.getByRole("button", { name: "Add release", exact: true }).click();
  await releaseEditor.getByLabel("Release title", { exact: true }).waitFor();
  ok(
    "external release removal leaves a generic local-discard path without exposing retained private fields"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      { passed: results.length, results, errors, providerAttempts },
      null,
      2
    )
  );
  console.log(
    JSON.stringify({ output, passed: results.length, providerAttempts })
  );
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.txt",
    String(error) +
      "\n" +
      (await page
        .locator("body")
        .innerText()
        .catch(() => ""))
  );
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
