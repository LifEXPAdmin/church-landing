import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";

// Requires the parent's already running isolated production HTTPS fixture.
// Clipboard/native share and lifecycle events are controlled browser probes;
// source reads, canonical commands, QR rendering and downloads are real.
assert.ok(process.argv[2], "Pass the active isolated HTTPS fixture directory.");
const dir = resolve(process.argv[2]);
const config = JSON.parse(readFileSync(join(dir, "browser-env.json"), "utf8"));
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.ok(
  process.env.NODE_EXTRA_CA_CERTS &&
    resolve(process.env.NODE_EXTRA_CA_CERTS) === resolve(config.certificate),
  "Start Node with NODE_EXTRA_CA_CERTS set to this fixture's certificate so intercepted HTTP reads trust the local TLS endpoint."
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
const { default: jsQR } = await import("jsqr");
const { default: sharp } = await import("sharp");
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
  viewport: { width: 390, height: 900 },
  acceptDownloads: true
});
const external = [],
  errors = [],
  results = [];
await context.route("**/*", (route) => {
  if (new URL(route.request().url()).origin === config.origin)
    return route.continue();
  external.push(route.request().url());
  return route.abort();
});
await context.addInitScript(() => {
  window.__copied = [];
  window.__shared = [];
  window.__downloadClicks = [];
  window.__shareMode = "cancel";
  window.__pendingReads = 0;
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => true
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (text) => window.__copied.push(text) }
  });
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: async (data) => {
      if (window.__shareMode === "cancel")
        throw new DOMException("Canceled", "AbortError");
      window.__shared.push(data);
    }
  });
  const fetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    window.__pendingReads++;
    try {
      return await fetch(...args);
    } finally {
      window.__pendingReads--;
    }
  };
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) window.__downloadClicks.push(this.download);
    return click.call(this);
  };
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on("pageerror", (error) => errors.push(error.message));
let downloads = 0;
page.on("download", () => downloads++);
const output = join(dir, "resource-sharing-browser");
mkdirSync(output, { recursive: true, mode: 0o700 });
const input = (operation, fields = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const summary = () =>
  page.locator("summary").filter({ hasText: /^Share publicly$/ });
const button = (name) => page.getByRole("button", { name, exact: true });
const dialog = () =>
  page.getByRole("dialog", { name: "Public link QR code", exact: true });
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
async function settle() {
  await page.waitForFunction(() => window.__pendingReads === 0);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
  );
}
async function go(record, suffix = "") {
  await page.bringToFront();
  const response = await page.goto(config.origin + record.path + suffix);
  assert.equal(response.status(), 200);
  await page
    .getByRole("heading", { name: record.title, exact: true })
    .waitFor();
  await settle();
}
async function open(record) {
  await summary().click();
  await page
    .getByRole("textbox", { name: "Public link", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("textbox", { name: "Public link", exact: true })
      .inputValue(),
    config.origin + record.path
  );
}
async function qr() {
  await button("Show QR code").click();
  await dialog().waitFor();
  await page.waitForFunction(() => {
    const canvas = document.querySelector("dialog canvas");
    const download = [...document.querySelectorAll("dialog button")].find(
      (b) => b.textContent === "Download QR PNG"
    );
    return canvas?.width === 512 && download && !download.disabled;
  });
}
async function assertQr(record) {
  const pixels = await dialog()
    .locator("canvas")
    .evaluate((canvas) => ({
      data: Array.from(
        canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height)
          .data
      ),
      width: canvas.width,
      height: canvas.height
    }));
  assert.equal(
    jsQR(Uint8ClampedArray.from(pixels.data), pixels.width, pixels.height)
      ?.data,
    config.origin + record.path
  );
}
async function activity() {
  return {
    ...(await page.evaluate(() => ({
      copied: window.__copied.length,
      shared: window.__shared.length,
      anchors: window.__downloadClicks.length
    }))),
    downloads
  };
}
async function concealed() {
  await page.waitForFunction(
    () =>
      !document.querySelector('input[aria-label="Public link"]') &&
      !document.querySelector('dialog[aria-label="Public link QR code"]')
  );
}
async function preview(record) {
  const response = await context.request.get(
    config.origin +
      "/api/platform/share-preview?" +
      new URLSearchParams({ kind: record.kind, id: record.id })
  );
  assert.equal(response.status(), 200);
  assert.match(response.headers()["cache-control"], /no-store/);
  return response.json();
}
async function within(promise, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out`)),
          20000
        );
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function holdPreview(record) {
  let arrive, rejectArrival, release;
  const arrived = new Promise((resolve, reject) => {
    arrive = resolve;
    rejectArrival = reject;
  });
  // A failed interception may settle while Playwright is still finishing click.
  void arrived.catch(() => {});
  const held = new Promise((resolve) => {
    release = resolve;
  });
  let finished;
  const done = new Promise((resolve) => {
    finished = resolve;
  });
  const matcher = (url) =>
    url.pathname === "/api/platform/share-preview" &&
    url.searchParams.get("kind") === record.kind &&
    url.searchParams.get("id") === record.id &&
    !url.searchParams.has("format");
  let captured = false,
    failure = null,
    finishPromise;
  const handler = async (route) => {
    if (captured) return route.fallback();
    captured = true;
    let response;
    try {
      response = await route.fetch({ timeout: 15000 });
      assert.equal(response.status(), 200);
      assert.equal((await response.json()).available, true);
      arrive();
      await held;
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
  return {
    arrived,
    finish() {
      return (finishPromise ??= (async () => {
        release();
        try {
          if (captured) await within(done, "Held preview completion");
        } finally {
          await page.unroute(matcher, handler);
        }
        if (failure) throw failure;
      })());
    }
  };
}
async function heldAction(record, action, change, replacement) {
  await go(record);
  if (action !== "load") await open(record);
  if (action === "download") await qr();
  const before = await activity();
  const hold = await holdPreview(record);
  try {
    if (action === "load") await summary().click();
    else
      await button(
        {
          copy: "Copy public link",
          share: "Open share dialog",
          qr: "Show QR code",
          download: "Download QR PNG"
        }[action]
      ).click();
    await within(hold.arrived, "Share preview interception");
    if (change === "owner") await signIn(replacement);
    else if (change === "close") {
      if (action === "download") await button("Close QR code").click();
      await summary().click();
    } else
      await page.evaluate((event) => {
        if (event === "offline")
          Object.defineProperty(navigator, "onLine", {
            configurable: true,
            get: () => false
          });
        window.dispatchEvent(new Event(event));
      }, change);
    if (change !== "owner") await concealed();
    await hold.finish();
    await settle();
    await concealed();
    assert.deepEqual(
      await activity(),
      before,
      `${record.kind} ${action} cannot dispatch after ${change}`
    );
  } finally {
    // Also release the route if a browser assertion fails, before closing context.
    await hold.finish().catch(() => {});
  }
}
try {
  const owner = await createPortalActor(db, "share_resource");
  const reviewer = await createPortalActor(db, "share_review");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  const church = await db.church.create({
    data: {
      slug: "sharing-" + randomUUID(),
      name: "Fictional sharing church",
      summary: "Fictional sharing QA community.",
      communityListed: true
    }
  });
  await db.churchConnection.createMany({
    data: [owner, reviewer].map((actor) => ({
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
  const draft = await exchangeListingCommand(
    db,
    owner.token,
    input("create", {
      expectedVersion: 0,
      ownerChurchId: null,
      schema: EXCHANGE_EDITOR_SCHEMA,
      fields: {
        ...emptyExchangeFields(),
        audience: "PUBLIC",
        title: "Fictional shared table",
        description: "Public sharing fixture table.",
        category: "FURNITURE",
        condition: "GOOD",
        country: "US",
        placeId: 4887398
      }
    })
  );
  const listing = await exchangeListingCommand(
    db,
    owner.token,
    input("status", {
      listingId: draft.id,
      expectedVersion: draft.version,
      state: "ACTIVE",
      itemPolicy: EXCHANGE_ITEM_POLICY,
      itemConfirmed: true
    })
  );
  const fields = mediaFields({
    title: "Fictional shared recording",
    description: "Public sharing fixture recording.",
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
    owner.token,
    input("create", { ownerChurchId: null, ...reviewed })
  );
  const media = await mediaCatalogCommand(
    db,
    owner.token,
    input("publish", {
      itemId: mediaDraft.id,
      expectedVersion: mediaDraft.version,
      ...reviewed
    })
  );
  const records = [
    {
      kind: "listing",
      id: listing.id,
      path: "/platform/exchange/" + listing.id,
      title: "Fictional shared table"
    },
    {
      kind: "media",
      id: media.id,
      path: "/platform/media/" + media.id,
      title: fields.title
    }
  ];
  for (const record of records) {
    for (const suffix of [
      "?utm_source=fixture",
      "?returnTo=%2Fplatform&unknown=private"
    ]) {
      await go(record, suffix);
      await open(record);
      await button("Copy public link").click();
      await page.getByText("Public link copied.", { exact: true }).waitFor();
      assert.deepEqual(await page.evaluate(() => window.__copied), [
        config.origin + record.path
      ]);
      await button("Open share dialog").click();
      await page.getByText("Sharing canceled.", { exact: true }).waitFor();
      assert.deepEqual(await page.evaluate(() => window.__shared), []);
      await page.evaluate(() => {
        window.__shareMode = "success";
      });
      await button("Open share dialog").click();
      await page
        .getByText("Share dialog completed.", { exact: true })
        .waitFor();
      assert.deepEqual(await page.evaluate(() => window.__shared), [
        { title: record.title, url: config.origin + record.path }
      ]);
    }
    ok(
      `${record.kind}: query variants copy the canonical URL; native cancellation and completion report accurately.`
    );
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await go(record);
      await open(record);
      await qr();
      await assertQr(record);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1
        ),
        "No horizontal overflow"
      );
      await page.screenshot({
        path: join(output, `${record.kind}-${width}.png`),
        fullPage: true
      });
      const pending = page.waitForEvent("download");
      await button("Download QR PNG").click();
      const png = join(output, `${record.kind}-${width}-qr.png`);
      await (await pending).saveAs(png);
      const raw = await sharp(png)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      assert.equal(
        jsQR(new Uint8ClampedArray(raw.data), raw.info.width, raw.info.height)
          ?.data,
        config.origin + record.path
      );
      await button("Close QR code").click();
      await dialog().waitFor({ state: "detached" });
    }
    ok(
      `${record.kind}: canvas and actual downloaded QR PNG decode correctly at 320 and 1440 pixels.`
    );
    for (const action of ["load", "copy", "share", "qr", "download"])
      for (const event of ["blur", "offline", "close"])
        await heldAction(record, action, event);
    ok(
      `${record.kind}: 15 held successful source responses cannot reveal links, copy, share or download after blur, offline or closing sharing.`
    );
  }
  await page.setViewportSize({ width: 390, height: 900 });
  for (const [record, action] of [
    [records[0], "copy"],
    [records[1], "download"]
  ]) {
    await signIn(owner);
    await heldAction(record, action, "owner", reviewer);
    await context.clearCookies();
  }
  ok(
    "A different signed-in account arriving during a held Copy or QR download cannot dispatch the original account's action or retain its preview."
  );
  for (const record of records) {
    await go(record);
    await open(record);
    await qr();
    const before = await activity();
    if (record.kind === "listing")
      await db.exchangeListing.update({
        where: { id: record.id },
        data: { state: "CLOSED" }
      });
    else
      await db.mediaCatalogRights.update({
        where: { itemId: record.id },
        data: { revokedAt: new Date() }
      });
    await button("Download QR PNG").click();
    await page
      .getByText("A public share link is not available for this page.", {
        exact: true
      })
      .waitFor();
    await concealed();
    assert.deepEqual(await activity(), before);
    assert.equal((await preview(record)).available, false);
    if (record.kind === "listing") await go(record);
    else {
      await page.goto(config.origin + record.path);
      await page
        .getByText("This media item is unavailable.", { exact: true })
        .waitFor();
      await settle();
    }
    assert.equal(await summary().count(), 0);
    if (record.kind === "listing")
      await db.exchangeListing.update({
        where: { id: record.id },
        data: { state: "ACTIVE" }
      });
    else
      await db.mediaCatalogRights.update({
        where: { itemId: record.id },
        data: { revokedAt: null }
      });
  }
  ok(
    "Closed listings and rights-revoked media remove sharing; downloading an already displayed QR rechecks and refuses both sources."
  );
  await go(records[0]);
  await open(records[0]);
  await qr();
  await button("Close QR code").click();
  await dialog().waitFor({ state: "detached" });
  await db.exchangeListing.update({
    where: { id: listing.id },
    data: { state: "CLOSED" }
  });
  await button("Refresh public link").click();
  await page
    .getByText("A public share link is not available for this page.", {
      exact: true
    })
    .waitFor();
  await concealed();
  await db.exchangeListing.update({
    where: { id: listing.id },
    data: { state: "RESERVED" }
  });
  await go(records[0]);
  await open(records[0]);
  assert.equal((await preview(records[0])).available, true);
  ok(
    "Explicit Refresh removes the old public link after closure; a currently reserved public listing remains shareable."
  );
  await signIn(owner);
  await db.exchangeListing.update({
    where: { id: listing.id },
    data: { audience: "CHURCH", audienceChurchId: church.id }
  });
  await db.mediaCatalogItem.update({
    where: { id: media.id },
    data: { audience: "MEMBERS" }
  });
  for (const record of records) {
    await go(record);
    assert.equal(await summary().count(), 0);
    assert.equal((await preview(record)).available, false);
  }
  ok(
    "Signed-in owners can read their church/member resources without public sharing controls or public preview availability."
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
        assumptions: [
          "Existing built loopback HTTPS fixture",
          "Public controls use the canonical share-preview service",
          "Clipboard and native-share outcomes are simulated",
          "Blur and offline lifecycle events are simulated while actual successful loopback responses finish",
          "Source revocation is injected only into fictional fixture records"
        ],
        productionMode: true,
        fictionalOnly: true,
        physicalDevice: false
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
