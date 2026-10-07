import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";

const dir = resolve(process.argv[2] ?? "");
assert.ok(process.argv[2], "Pass the active isolated HTTPS fixture directory.");
const config = JSON.parse(readFileSync(join(dir, "browser-env.json"), "utf8"));
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
Object.assign(
  process.env,
  JSON.parse(readFileSync(join(dir, "test-env.json"), "utf8")),
  {
    DATABASE_URL: config.database,
    DIRECT_URL: config.database,
    ACCOUNT_ORIGIN: config.origin,
    NEXT_PUBLIC_SITE_URL: config.origin,
    ACCOUNT_TEST_ISOLATED: "1",
    NODE_ENV: "test",
    VERCEL: "",
    COMMUNITY_REPORTS_ENABLED: "true"
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
  viewport: { width: 390, height: 844 }
});
const page = await context.newPage();
const errors = [],
  external = [],
  results = [];
page.on("pageerror", (error) => errors.push(error.message));
await context.route("**/*", (route) => {
  if (new URL(route.request().url()).origin === config.origin)
    return route.continue();
  external.push(route.request().url());
  return route.abort();
});
const output = join(dir, "public-resource-browser");
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
const robots = () =>
  page
    .locator('meta[name="robots"]')
    .evaluateAll((nodes) => nodes.map((node) => node.content).join(","));
async function go(path) {
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
  await page
    .locator('meta[property="og:title"]')
    .waitFor({ state: "attached" });
  return response;
}
async function generic(path) {
  const response = await go(path);
  assert.match(response.headers()["cache-control"], /no-store/);
  assert.equal(await page.title(), "God’s Churches");
  assert.match(await robots(), /noindex/);
  assert.equal(
    await page.locator('script[type="application/ld+json"]').count(),
    0
  );
  assert.equal(
    await page.locator('meta[property="og:image"]').getAttribute("content"),
    config.origin + "/brand/share-card.png"
  );
}
try {
  await db.platformAuthLimit.deleteMany();
  const owner = await createPortalActor(db, "resourcebrowser");
  const reviewer = await createPortalActor(db, "resourcebrowsereview");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  const draft = await exchangeListingCommand(
    db,
    owner.token,
    input("create", {
      expectedVersion: 0,
      ownerChurchId: null,
      schema: EXCHANGE_EDITOR_SCHEMA,
      fields: {
        ...emptyExchangeFields(),
        title: "Fictional browser table",
        description: "A supplied public table description.",
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
    title: "Fictional browser recording",
    description: "A supplied public recording description.",
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
      title: "Fictional browser table"
    },
    {
      kind: "media",
      id: media.id,
      path: "/platform/media/" + media.id,
      title: fields.title
    }
  ];
  for (const record of records) {
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const response = await go(record.path);
      assert.match(response.headers()["cache-control"], /no-store/);
      assert.ok(!response.headers()["x-robots-tag"]?.includes("noindex"));
      assert.equal(await page.title(), record.title + " | God’s Churches");
      await page
        .getByRole("heading", { name: record.title, exact: true })
        .waitFor();
      assert.doesNotMatch(await robots(), /noindex/);
      assert.equal(
        await page.locator('link[rel="canonical"]').getAttribute("href"),
        config.origin + record.path
      );
      const script = page.locator('script[type="application/ld+json"]');
      const data = JSON.parse(await script.textContent());
      assert.equal(data["@type"], "WebPage");
      assert.equal(data.name, record.title);
      assert.equal(data.url, config.origin + record.path);
      assert.ok(await script.evaluate((node) => !!node.nonce));
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1
        )
      );
      await page.screenshot({
        path: join(output, `${record.kind}-${width}.png`),
        fullPage: true
      });
    }
    const image = await page
      .locator('meta[property="og:image"]')
      .getAttribute("content");
    const png = await context.request.get(image);
    assert.equal(png.headers()["content-type"], "image/png");
    assert.match(png.headers()["cache-control"], /no-store/);
    for (const suffix of [
      "?comment=private",
      "?returnTo=%2Fplatform",
      "?unknown=one&unknown=two"
    ]) {
      await go(record.path + suffix);
      assert.match(await robots(), /noindex/);
      assert.equal(
        await page.locator('script[type="application/ld+json"]').count(),
        0
      );
      assert.equal(
        await page.locator('link[rel="canonical"]').getAttribute("href"),
        config.origin + record.path
      );
    }
    await go(record.path + "?utm_source=fixture");
    assert.doesNotMatch(await robots(), /noindex/);
    assert.equal(
      await page.locator('script[type="application/ld+json"]').count(),
      1
    );
  }
  ok(
    "Public listing and media pages render current canonical metadata and nonce-backed facts at 320/1440 pixels; unknown query variants remain noindex."
  );
  for (const path of [
    "/platform/exchange",
    "/platform/exchange/defaults",
    "/platform/exchange/handoffs",
    "/platform/exchange/help",
    "/platform/exchange/mine",
    "/platform/exchange/needs",
    "/platform/exchange/new",
    "/platform/exchange/saved",
    "/platform/media",
    "/platform/media/new",
    "/platform/media/playlists",
    "/platform/media/saved",
    "/platform/media/studio",
    records[0].path + "/edit",
    records[1].path + "/edit",
    "/platform/businesses",
    "/platform/ventures"
  ]) {
    const response = await context.request.get(config.origin + path, {
      maxRedirects: 0
    });
    assert.match(response.headers()["x-robots-tag"] ?? "", /noindex/, path);
  }
  ok(
    "Catalogs, management routes, private descendants and absent business/venture routes retain noindex headers."
  );
  const oldMediaImage =
    config.origin +
    "/api/platform/share-preview?" +
    new URLSearchParams({ format: "png", kind: "media", id: media.id });
  await db.mediaCatalogItem.update({
    where: { id: media.id },
    data: { audience: "MEMBERS", title: "PRIVATE MEMBER RECORDING" }
  });
  await generic(records[1].path);
  await context.addCookies([
    {
      name: sessionCookieFixtureName(config.origin),
      value: owner.token,
      url: config.origin,
      httpOnly: true,
      secure: true,
      sameSite: "Lax"
    }
  ]);
  await generic(records[1].path);
  const privateJson = await context.request.get(
    config.origin +
      "/api/platform/share-preview?" +
      new URLSearchParams({ kind: "media", id: media.id })
  );
  assert.equal((await privateJson.json()).available, false);
  await context.clearCookies();
  const former = await context.request.get(oldMediaImage);
  const fallback = await context.request.get(
    config.origin + "/brand/share-card.png"
  );
  assert.deepEqual(await former.body(), await fallback.body());
  await db.mediaCatalogItem.update({
    where: { id: media.id },
    data: { audience: "PUBLIC", title: fields.title }
  });
  await db.mediaCatalogRights.update({
    where: { itemId: media.id },
    data: { revokedAt: new Date() }
  });
  await generic(records[1].path);
  await db.exchangeListing.update({
    where: { id: listing.id },
    data: { state: "CLOSED", title: "FORMER LISTING TITLE" }
  });
  await generic(records[0].path);
  for (const [kind, id] of [
    ["listings", listing.id],
    ["media", media.id]
  ]) {
    const index = await context.request.get(config.origin + "/sitemap.xml");
    const urls = [...(await index.text()).matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((match) => match[1].replace(/&amp;/g, "&"))
      .filter((url) => new URL(url).searchParams.get("kind") === kind);
    for (const url of urls) {
      const response = await context.request.get(url);
      assert.equal(response.status(), 200);
      assert.ok(!(await response.text()).includes(id));
    }
  }
  ok(
    "Visibility changes, rights revocation and listing closure remove prior head copy, JSON-LD, sitemap entries and old PNG content; owner sessions cannot expand previews."
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
