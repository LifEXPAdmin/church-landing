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
const { createPortalActor, assertPortalTestDatabase } =
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
const { mediaCatalogCommand } =
  await import("../lib/platform/media-catalog-commands.ts");
const { MEDIA_POLICY } =
  await import("../lib/platform/media-catalog-options.ts");
const actor = await createPortalActor(db, "plistbrowser"),
  other = await createPortalActor(db, "plistbrowser2");
const signIn = async (user) => {
  await context.clearCookies();
  if (user)
    await context.addCookies([
      {
        name: sessionCookieFixtureName(origin),
        value: user.token,
        url: origin,
        httpOnly: true,
        secure: true,
        sameSite: "Lax"
      }
    ]);
};
const input = (operation, more = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...more
});
const title = "Fictional browser playlist " + randomUUID();
const sourceTitle = "Fictional playlist recording " + randomUUID();
const fields = {
  title: sourceTitle,
  description: "Fictional recording",
  format: "SERMON",
  presentation: "VIDEO",
  audience: "PUBLIC",
  details: { preachedOn: null },
  sourceUrl: "https://www.youtube.com/watch?v=abcdefghijk"
};
const reviewed = {
  fields,
  acknowledgment: {
    policy: MEDIA_POLICY,
    sourceUrl: fields.sourceUrl,
    audience: "PUBLIC",
    accepted: true
  },
  rights: {
    basis: "OWN",
    reviewed: true,
    publicRecording: true,
    textRights: true
  }
};
const source = await mediaCatalogCommand(
  db,
  actor.token,
  input("create", { ownerChurchId: null, ...reviewed })
);
await mediaCatalogCommand(
  db,
  actor.token,
  input("publish", {
    itemId: source.id,
    expectedVersion: source.version,
    ...reviewed
  })
);
let providerAttempts = 0;
await context.unroute("**/*");
await context.route("**/*", (route) => {
  if (new URL(route.request().url()).hostname === "127.0.0.1")
    return route.continue();
  providerAttempts++;
  return route.abort();
});
const row = () =>
  db.mediaPlaylist.findFirst({
    where: { ownerId: actor.id, title },
    orderBy: { createdAt: "desc" }
  });
const details = () => page.getByLabel("Playlist title", { exact: true });
const focus = () =>
  page.evaluate(() => window.dispatchEvent(new Event("focus")));
try {
  await signIn(actor);
  await go("/platform/media/playlists");
  await details().fill(title);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Private collection description");
  await page.getByRole("link", { name: "Browse media", exact: true }).click();
  assert.ok(page.url().endsWith("/playlists"));
  assert.ok(
    (await page.locator("body").innerText()).includes("Save or discard")
  );
  await page
    .getByRole("button", { name: "Create playlist", exact: true })
    .click();
  await wait(async () => !!(await row()));
  let p = await row();
  await page.waitForURL("**/playlists/" + p.id + "?edit=1");
  await focus();
  await details().waitFor();
  assert.equal(await details().inputValue(), title);
  assert.equal(p.state, "DRAFT");
  assert.equal(p.audience, "PRIVATE");
  ok(
    "create private draft with unsaved-navigation protection and confirmed hydration"
  );
  await page
    .getByRole("button", { name: "Find media to add", exact: true })
    .click();
  await page.getByLabel("Media title", { exact: true }).fill(sourceTitle);
  await page.getByRole("button", { name: "Search media", exact: true }).click();
  await page
    .getByRole("button", { name: "Add this recording", exact: true })
    .click();
  await wait(
    async () =>
      (await db.mediaPlaylistEntry.count({ where: { playlistId: p.id } })) === 1
  );
  await page.getByRole("link", { name: sourceTitle, exact: true }).waitFor();
  await page.getByLabel("Playlist audience").selectOption("PUBLIC");
  await page
    .getByRole("button", { name: "Publish playlist", exact: true })
    .click();
  await wait(async () => (await row())?.state === "PUBLISHED");
  await details().waitFor();
  assert.equal(providerAttempts, 0);
  ok(
    "media picker adds canonical recording and explicit publication creates no provider request"
  );
  await page.screenshot({ path: output + "/editor-390.png", fullPage: true });
  await details().fill(title + " unsent");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal(await details().count(), 0);
  assert.ok(
    !(await page.locator("body").innerHTML()).includes(title + " unsent")
  );
  await focus();
  await details().waitFor();
  assert.equal(await details().inputValue(), title + " unsent");
  await page
    .getByRole("button", { name: "Discard unsent changes", exact: true })
    .click();
  assert.equal(await details().inputValue(), title);
  ok(
    "blur removes private form DOM while same-account foreground restores pending values"
  );
  let releaseWrite,
    intercepted = false;
  const delay = async (route) => {
    if (route.request().method() !== "POST" || intercepted)
      return route.continue();
    intercepted = true;
    await new Promise((r) => (releaseWrite = r));
    return route.continue();
  };
  await page.route("**/api/platform/media-playlists", delay);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Delayed confirmed details");
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await wait(() => intercepted);
  assert.equal(await details().isDisabled(), true);
  assert.equal(
    await page.getByLabel("Description", { exact: true }).isDisabled(),
    true
  );
  releaseWrite();
  await wait(
    async () => (await row())?.description === "Delayed confirmed details"
  );
  await page.unroute("**/api/platform/media-playlists", delay);
  await wait(async () => !(await details().isDisabled()));
  ok("in-flight writes freeze fields and preserve exact submitted values");
  // Commit before dropping the response, then reconcile the identical receipt.
  let lost = false;
  const lose = async (route) => {
    if (route.request().method() !== "POST" || lost) return route.continue();
    lost = true;
    await route.fetch();
    return route.abort("failed");
  };
  await page.route("**/api/platform/media-playlists", lose);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Recovered exact save");
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await page
    .getByRole("button", { name: "Retry same change", exact: true })
    .waitFor();
  assert.equal(await details().isDisabled(), true);
  const committed = await row();
  await page.unroute("**/api/platform/media-playlists", lose);
  await page
    .getByRole("button", { name: "Retry same change", exact: true })
    .click();
  await wait(
    async () =>
      (await page
        .getByRole("button", { name: "Retry same change", exact: true })
        .count()) === 0
  );
  assert.equal((await row()).version, committed.version);
  assert.equal((await row()).description, "Recovered exact save");
  ok(
    "lost successful update reconciles one immutable mutation without duplicate version"
  );
  let switched = false;
  const switchAfterCommit = async (route) => {
    if (route.request().method() !== "POST" || switched)
      return route.continue();
    switched = true;
    const response = await route.fetch();
    await signIn(other);
    return route.fulfill({ response });
  };
  await page.route("**/api/platform/media-playlists", switchAfterCommit);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Owner-pinned committed retry");
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await page
    .getByRole("button", { name: "Retry same change", exact: true })
    .waitFor();
  await wait(async () => (await details().count()) === 0);
  assert.ok(
    !(await page.locator("body").innerHTML()).includes(
      "Owner-pinned committed retry"
    )
  );
  const switchedVersion = (await row()).version;
  await page.unroute("**/api/platform/media-playlists", switchAfterCommit);
  await signIn(actor);
  await focus();
  await details().waitFor();
  await page
    .getByRole("button", { name: "Retry same change", exact: true })
    .click();
  await wait(
    async () =>
      (await page
        .getByRole("button", { name: "Retry same change", exact: true })
        .count()) === 0
  );
  assert.equal((await row()).version, switchedVersion);
  ok(
    "post-commit account change conceals draft and preserves an original-owner-only exact retry"
  );
  // Account replacement conceals old private draft; current expected-owner denies stale writes.
  await details().fill("Owner A private unsent sentinel");
  await signIn(other);
  await focus();
  await wait(async () => (await details().count()) === 0);
  assert.ok(
    !(await page.locator("body").innerHTML()).includes(
      "Owner A private unsent sentinel"
    )
  );
  await page.reload();
  await focus();
  await wait(
    async () =>
      !(await page.locator("body").innerText()).includes(
        "Checking current media access"
      )
  );
  assert.equal(await details().count(), 0);
  assert.ok(
    !(await page.locator("body").innerHTML()).includes(
      "Owner A private unsent sentinel"
    )
  );
  await signIn(actor);
  await go("/platform/media/playlists/" + p.id + "?edit=1");
  await details().waitFor();
  assert.equal(await details().inputValue(), title);
  ok(
    "account replacement conceals and cannot submit another account's private draft"
  );
  // Bounded second page, keyboard crossing its boundary, current version conflicts.
  const seed = await db.mediaCatalogItem.findUniqueOrThrow({
      where: { id: source.id }
    }),
    rights = await db.mediaCatalogRights.findUniqueOrThrow({
      where: { itemId: source.id }
    });
  const mediaIds = Array.from({ length: 26 }, () => randomUUID());
  await db.mediaCatalogItem.createMany({
    data: mediaIds.map((id, i) => ({
      ...seed,
      id,
      title: `Playlist keyboard recording ${i + 2}`,
      details: seed.details ?? {},
      scriptureRanges: seed.scriptureRanges ?? []
    }))
  });
  await db.mediaCatalogRights.createMany({
    data: mediaIds.map((itemId) => ({ ...rights, itemId }))
  });
  await db.mediaPlaylistEntry.createMany({
    data: mediaIds.map((mediaId, i) => ({
      id: randomUUID(),
      playlistId: p.id,
      mediaId,
      position: i + 1
    }))
  });
  await page
    .getByRole("button", { name: "Refresh current access", exact: true })
    .click();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  const move = page.getByRole("button", {
    name: "Move item 26 up",
    exact: true
  });
  await move.waitFor();
  await move.focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: "Move item 25 up", exact: true })
    .waitFor();
  await wait(
    async () =>
      await page.evaluate(
        () =>
          document.activeElement?.getAttribute("aria-label") ===
          "Move item 25 up"
      )
  );
  ok("keyboard reorder across page boundary retains moved item and focus");
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await page
    .getByRole("button", { name: "Move item 26 up", exact: true })
    .waitFor();
  await db.mediaPlaylist.update({
    where: { id: p.id },
    data: { version: { increment: 1 } }
  });
  await page
    .getByRole("button", { name: "Refresh current access", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Return to first page", exact: true })
    .click();
  await details().waitFor();
  ok("stale signed page cursor has an available first-page recovery action");
  await go("/platform/media/saved");
  await page
    .getByRole("button", { name: "Find media to add", exact: true })
    .click();
  await page.getByLabel("Media title", { exact: true }).fill(sourceTitle);
  await page.getByRole("button", { name: "Search media", exact: true }).click();
  await page
    .getByRole("button", { name: "Add this recording", exact: true })
    .click();
  await page.getByRole("button", { name: "Unsave", exact: true }).waitFor();
  await db.mediaCatalogRights.update({
    where: { itemId: source.id },
    data: { revokedAt: new Date() }
  });
  await page
    .getByRole("button", { name: "Close media picker", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Refresh current access", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Item unavailable", exact: true })
    .waitFor();
  assert.ok(!(await page.locator("body").innerHTML()).includes(sourceTitle));
  await page.getByRole("button", { name: "Unsave", exact: true }).click();
  await wait(
    async () =>
      (await page
        .getByRole("button", { name: "Unsave", exact: true })
        .count()) === 0
  );
  assert.equal(
    await db.mediaPlaylistEntry.count({ where: { playlistId: p.id } }),
    27
  );
  ok(
    "private save becomes removable opaque tombstone without altering playlist membership"
  );
  await signIn(null);
  await go("/platform/media/playlists/" + p.id);
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  assert.ok(!(await page.locator("body").innerHTML()).includes(sourceTitle));
  assert.equal(
    await page.getByRole("button", { name: "Move item", exact: false }).count(),
    0
  );
  await page.setViewportSize({ width: 320, height: 740 });
  await page.screenshot({ path: output + "/public-320.png", fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    true
  );
  assert.equal(providerAttempts, 0);
  ok(
    "public finite playlist filters revoked item, fits320px, and makes zero provider requests"
  );
  await signIn(actor);
  await go("/platform/media/playlists/" + p.id + "?edit=1");
  await details().waitFor();
  lost = false;
  await page.route("**/api/platform/media-playlists", lose);
  await page
    .getByRole("button", { name: "Remove playlist", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Retry same change", exact: true })
    .waitFor();
  await page.unroute("**/api/platform/media-playlists", lose);
  await page
    .getByRole("button", { name: "Retry same change", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Return to playlists", exact: true })
    .waitFor();
  assert.equal(
    (await db.mediaPlaylist.findUniqueOrThrow({ where: { id: p.id } })).state,
    "REMOVED"
  );
  ok(
    "committed removal with lost response remains retryable after editor reads deny it"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      { passed: results.length, results, pageErrors: errors, providerAttempts },
      null,
      2
    )
  );
  console.log(JSON.stringify({ passed: results.length, output }));
} catch (error) {
  writeFileSync(
    output + "/failure-state.json",
    JSON.stringify(
      await page.evaluate(() => ({
        url: location.href,
        focused: document.hasFocus(),
        visibility: document.visibilityState,
        html: document.body.innerHTML
      })),
      null,
      2
    )
  );
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.json",
    JSON.stringify(
      {
        message: String(error),
        stack: error.stack,
        results,
        pageErrors: errors
      },
      null,
      2
    )
  );
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
