import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the existing isolated Exchange preview directory");
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(config.origin, /^https:\/\/exchange-fixture\.example\.test:\d+$/);
assert.match(config.localOrigin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.localOrigin,
  NEXT_PUBLIC_SITE_URL: config.localOrigin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + fixtureDir + "/sink",
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: "",
  PRIVILEGED_MFA_MODE: "enroll",
  COMMUNITY_REPORTS_ENABLED: "true",
  BLOB_READ_WRITE_TOKEN: "",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  MEDIA_STORAGE_MODE: "local-test",
  MEDIA_TEST_DIR: process.cwd() + "/" + fixtureDir + "/images"
});
const { PrismaClient } = await import("@prisma/client");
const { createPortalActor, assertPortalTestDatabase, seedOperatorGrants } =
  await import("../tests/seed-portal.ts");
const { exchangeListingCommand, readExchangeListing } =
  await import("../lib/platform/exchange-listings.ts");
const { EXCHANGE_ITEM_POLICY, EXCHANGE_EDITOR_SCHEMA } =
  await import("../lib/platform/exchange-options.ts");
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
    "--host-resolver-rules=MAP exchange-fixture.example.test 127.0.0.1",
    "--no-proxy-server"
  ]
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true
});
await context.route("**/*", (route) =>
  new URL(route.request().url()).hostname === "exchange-fixture.example.test"
    ? route.continue()
    : route.abort()
);
const page = await context.newPage(),
  errors = [],
  results = [],
  output = fixtureDir + "/exchange-browser-" + Date.now();
mkdirSync(output, { recursive: true });
page.on("pageerror", (e) =>
  errors.push({ path: new URL(page.url()).pathname, message: e.message })
);
page.on("dialog", (dialog) => dialog.accept());
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const go = async (path) => {
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
  return response;
};
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
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Expected saved state was not observed");
};
const fetchIn = (path, body, owner, headers = {}) =>
  page.evaluate(
    async ({ path, body, owner, headers }) => {
      const response = await fetch(path, {
        method: body ? "POST" : "GET",
        cache: "no-store",
        headers: {
          ...(body ? { "content-type": "application/json" } : {}),
          ...(owner ? { "x-expected-account": owner } : {}),
          ...headers
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
      return {
        status: response.status,
        body: data,
        headers: Object.fromEntries(response.headers)
      };
    },
    { path, body, owner, headers }
  );
const confirmItem = () =>
  page.getByRole("checkbox", { name: /I may publish this listing/ }).check();
try {
  const owner = await createPortalActor(db, "exbrowser"),
    other = await createPortalActor(db, "exother"),
    reviewer = await createPortalActor(db, "exreview");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  await go("/platform/exchange/new");
  assert.ok(
    (
      await page
        .getByRole("link", { name: "Create an account", exact: true })
        .last()
        .getAttribute("href")
    ).includes("next=%2Fplatform%2Fexchange%2Fnew")
  );
  assert.equal(
    await page.getByRole("form", { name: "Listing editor" }).count(),
    0
  );
  ok(
    "Guest entry explains verified adult participation and preserves the editor destination without an action"
  );

  await signIn(owner);
  await go("/platform/exchange/new");
  const editor = page.getByRole("form", {
    name: "Listing editor",
    exact: true
  });
  await editor
    .getByLabel("Title (required to publish)", { exact: true })
    .fill("Fictional browser listing " + randomUUID());
  const title = await editor
    .getByLabel("Title (required to publish)", { exact: true })
    .inputValue();
  await editor
    .getByLabel("Description (required to publish)", { exact: true })
    .fill("Fictional retained draft description");
  let dropped = false,
    firstBody;
  await page.route("**/api/platform/exchange", async (route) => {
    if (route.request().method() === "POST" && !dropped) {
      dropped = true;
      firstBody = route.request().postData();
      const received = await route.fetch({
        url: config.localOrigin + new URL(route.request().url()).pathname
      });
      assert.ok([200, 202].includes(received.status()), await received.text());
      await route.abort("failed");
    } else {
      if (route.request().method() === "POST")
        assert.equal(route.request().postData(), firstBody);
      await route.continue();
    }
  });
  await editor
    .getByRole("button", { name: "Save a private draft", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Retry the same listing request",
      exact: true
    })
    .waitFor();
  await waitUntil(() =>
    page
      .getByRole("button", {
        name: "Retry the same listing request",
        exact: true
      })
      .isEnabled()
  );
  assert.equal(
    await db.exchangeListing.count({ where: { ownerId: owner.id } }),
    1
  );
  await page
    .getByRole("button", {
      name: "Retry the same listing request",
      exact: true
    })
    .click();
  await page.waitForURL(/\/platform\/exchange\/[^/]+\/edit$/);
  await page.unroute("**/api/platform/exchange");
  const id = new URL(page.url()).pathname.split("/")[3];
  await editor
    .getByLabel("Title (required to publish)", { exact: true })
    .waitFor();
  assert.equal(
    await editor
      .getByLabel("Title (required to publish)", { exact: true })
      .inputValue(),
    title
  );
  assert.equal(
    await db.exchangeListing.count({ where: { ownerId: owner.id } }),
    1
  );
  assert.equal(
    (await fetchIn(`/api/platform/exchange?view=listing&id=${id}`)).status,
    404
  );
  ok(
    "A lost create response retains the exact request and recovers one private draft with its title and description"
  );

  await editor.getByLabel("Listing type", { exact: true }).selectOption("SALE");
  await editor
    .getByLabel("Category (required to publish)", { exact: true })
    .selectOption("FURNITURE");
  await editor
    .getByLabel("Condition (required to publish)", { exact: true })
    .selectOption("GOOD");
  await editor.getByLabel("Currency", { exact: true }).selectOption("KWD");
  await editor.getByLabel("Amount", { exact: true }).fill("1.001");
  await editor.getByLabel("Country", { exact: true }).selectOption("US");
  await editor
    .getByLabel("Find a town or area", { exact: true })
    .fill("Chicago");
  await editor.getByRole("button", { name: "Find area", exact: true }).click();
  await editor
    .getByRole("button", { name: /^Chicago,/ })
    .first()
    .click();
  await editor
    .getByRole("button", { name: "Save private draft", exact: true })
    .click();
  await waitUntil(
    async () =>
      (await db.exchangeListing.findUniqueOrThrow({ where: { id } }))
        .priceMinor === 1001
  );
  await go(`/platform/exchange/${id}/edit`);
  assert.equal(
    await editor.getByLabel("Amount", { exact: true }).inputValue(),
    "1.001"
  );
  await page.getByText(/Selected area: Chicago/).waitFor();
  ok(
    "The complete editor persists exact KWD minor units and an explicitly selected catalog town across reload"
  );

  await editor
    .getByLabel("Title (required to publish)", { exact: true })
    .fill("Unsaved local marker");
  await page.getByRole("link", { name: "My listings", exact: true }).click();
  await page
    .getByText(
      "Save, retry or discard your local listing entries before leaving.",
      { exact: true }
    )
    .waitFor();
  assert.ok(page.url().endsWith(`/${id}/edit`));
  await page
    .getByRole("button", {
      name: "Discard local entries and reload",
      exact: true
    })
    .click();
  await page.waitForLoadState("domcontentloaded");
  await waitUntil(
    async () =>
      (await editor
        .getByLabel("Title (required to publish)", { exact: true })
        .inputValue()
        .catch(() => "")) === title
  );
  ok(
    "Unsent text blocks ordinary navigation and deliberate discard reloads the saved draft"
  );

  const bytes = await sharp({
    create: { width: 100, height: 75, channels: 3, background: "blue" }
  })
    .png()
    .toBuffer();
  await page.getByLabel("Choose photos", { exact: true }).setInputFiles({
    name: "fictional-item.png",
    mimeType: "image/png",
    buffer: bytes
  });
  await page.getByRole("button", { name: "Save photo", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit photo 1 description", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Edit photo 1 description", exact: true })
    .click();
  await page
    .getByLabel("Photo caption", { exact: true })
    .fill("Fictional blue item");
  await page
    .getByLabel("Alternative text", { exact: true })
    .fill("Blue rectangle, synthetic photo");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal(
    await page.getByLabel("Photo caption", { exact: true }).isVisible(),
    false
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByLabel("Photo caption", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Photo caption", { exact: true }).inputValue(),
    "Fictional blue item"
  );
  await page
    .getByRole("button", { name: "Save photo description", exact: true })
    .click();
  await page.getByText("Fictional blue item", { exact: true }).waitFor();
  await waitUntil(
    async () =>
      (
        await db.mediaAsset.findFirst({
          where: { exchangeListingId: id, status: "READY" }
        })
      )?.alt === "Blue rectangle, synthetic photo"
  );
  const image = await db.mediaAsset.findFirstOrThrow({
    where: { exchangeListingId: id, status: "READY" }
  });
  assert.equal(image.alt, "Blue rectangle, synthetic photo");
  ok(
    "Actual local photo upload, caption and alternative text use the listing gallery; blur conceals and preserves unsent photo edits"
  );

  let lostPhotoReply = false,
    uploadDetails,
    uploadBytes;
  await page.route("**/api/platform/images", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    if (!lostPhotoReply) {
      lostPhotoReply = true;
      uploadDetails = request.headers()["x-image-details"];
      uploadBytes = request.postDataBuffer();
      const received = await route.fetch({
        url: config.localOrigin + new URL(request.url()).pathname
      });
      assert.ok(
        [200, 201, 202].includes(received.status()),
        await received.text()
      );
      return route.abort("failed");
    }
    assert.equal(request.headers()["x-image-details"], uploadDetails);
    assert.deepEqual(request.postDataBuffer(), uploadBytes);
    return route.continue();
  });
  await page.getByLabel("Choose photos", { exact: true }).setInputFiles({
    name: "fictional-second-item.png",
    mimeType: "image/png",
    buffer: await sharp({
      create: { width: 90, height: 70, channels: 3, background: "red" }
    })
      .png()
      .toBuffer()
  });
  await page.getByRole("button", { name: "Save photo", exact: true }).click();
  const retryPhoto = page.getByRole("button", {
    name: "Retry same upload",
    exact: true
  });
  await retryPhoto.waitFor();
  await waitUntil(() => retryPhoto.isEnabled());
  assert.equal(
    await db.mediaAsset.count({
      where: { exchangeListingId: id, status: "READY" }
    }),
    2
  );
  await retryPhoto.click();
  await page
    .getByRole("button", { name: "Open listing photo 2 of 2", exact: true })
    .waitFor();
  await page.unroute("**/api/platform/images");
  assert.equal(
    await db.mediaAsset.count({
      where: { exchangeListingId: id, status: "READY" }
    }),
    2
  );
  const secondImage = await db.mediaAsset.findFirstOrThrow({
    where: { exchangeListingId: id, status: "READY", id: { not: image.id } }
  });
  const moveEarlier = page.getByRole("button", {
    name: "Move photo 2 earlier",
    exact: true
  });
  await waitUntil(() => moveEarlier.isEnabled());
  await moveEarlier.click();
  await waitUntil(
    async () =>
      (await db.mediaAsset.findUniqueOrThrow({ where: { id: secondImage.id } }))
        .position === 0
  );
  await go(`/platform/exchange/${id}/edit`);
  const firstPhoto = page.getByRole("button", {
    name: "Open listing photo 1 of 2",
    exact: true
  });
  await firstPhoto.waitFor();
  assert.ok(
    (await firstPhoto.locator("img").getAttribute("src")).includes(
      secondImage.id
    )
  );
  await page
    .getByRole("button", { name: "Remove photo 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open listing photo 1 of 1", exact: true })
    .waitFor();
  assert.equal(
    await db.mediaAsset.count({
      where: { exchangeListingId: id, status: "READY" }
    }),
    1
  );
  assert.equal(
    (await db.mediaAsset.findUniqueOrThrow({ where: { id: image.id } })).status,
    "READY"
  );
  ok(
    "Lost upload response retries the exact file once; photo reordering survives reload and removal preserves the other photo"
  );

  await confirmItem();
  await page
    .getByRole("button", { name: "Publish as active", exact: true })
    .click();
  await waitUntil(
    async () =>
      (await db.exchangeListing.findUniqueOrThrow({ where: { id } })).state ===
      "ACTIVE"
  );
  await signIn(null);
  const publicResponse = await go(`/platform/exchange/${id}`);
  assert.match(publicResponse.headers()["cache-control"], /no-store/);
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  await page.getByText("KWD 1.001", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Open listing photo 1 of 1", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Close photo", exact: true }).click();
  for (const variant of ["original", "large", "medium", "thumb"])
    assert.equal(
      (await fetchIn(`/api/platform/images/${image.id}/${variant}`)).status,
      200
    );
  const rsc = await fetchIn(`/platform/exchange/${id}`, undefined, undefined, {
    RSC: "1"
  });
  const encoded = String(rsc.body);
  assert.ok(encoded.includes(title));
  for (const privateValue of [
    owner.email,
    owner.token,
    owner.password,
    "storagePrefix",
    "creatorId"
  ])
    assert.equal(encoded.includes(privateValue), false);
  ok(
    "Publication requires confirmation; guest HTML/RSC show the exact price, coarse area and permitted photo bytes without private account data"
  );

  await signIn(other);
  await go(`/platform/exchange/${id}/edit`);
  assert.equal(
    await page.getByRole("form", { name: "Listing editor" }).count(),
    0
  );
  assert.equal(
    (
      await fetchIn(
        `/api/platform/exchange?view=editor&id=${id}`,
        undefined,
        other.id
      )
    ).status,
    404
  );
  await signIn(owner);
  await go(`/platform/exchange/${id}/edit`);
  await editor
    .getByLabel("Description (required to publish)", { exact: true })
    .fill("Preserved unsent conflict marker");
  const before = await readExchangeListing(db, owner.token, id, true);
  await exchangeListingCommand(db, owner.token, {
    operation: "save",
    listingId: id,
    expectedVersion: before.listing.version,
    mutationId: randomUUID(),
    schema: EXCHANGE_EDITOR_SCHEMA,
    fields: { ...before.fields, title: "Another saved title" },
    itemPolicy: EXCHANGE_ITEM_POLICY,
    itemConfirmed: true
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByRole("heading", {
      name: "Review the current saved listing",
      exact: true
    })
    .waitFor();
  assert.equal(
    await editor
      .getByLabel("Description (required to publish)", { exact: true })
      .inputValue(),
    "Preserved unsent conflict marker"
  );
  assert.equal(
    await editor
      .getByRole("button", { name: "Save listing changes", exact: true })
      .isEnabled(),
    false
  );
  await page
    .getByRole("button", {
      name: "Keep my entries with this reviewed version",
      exact: true
    })
    .click();
  await confirmItem();
  await editor
    .getByRole("button", { name: "Save listing changes", exact: true })
    .click();
  await waitUntil(
    async () =>
      (await db.exchangeListing.findUniqueOrThrow({ where: { id } }))
        .description === "Preserved unsent conflict marker"
  );
  ok(
    "Another owner is denied and a concurrent saved version requires explicit review while retaining unsent entries"
  );

  await page
    .getByRole("button", {
      name: "Duplicate into a private draft",
      exact: true
    })
    .click();
  await page.waitForURL(
    (url) => /\/edit$/.test(url.pathname) && !url.pathname.includes(id)
  );
  const duplicateId = new URL(page.url()).pathname.split("/")[3];
  const duplicate = await db.exchangeListing.findUniqueOrThrow({
    where: { id: duplicateId }
  });
  assert.equal(duplicate.state, "DRAFT");
  assert.equal(duplicate.title, title);
  assert.equal(
    await db.mediaAsset.count({ where: { exchangeListingId: duplicateId } }),
    0
  );
  await page
    .getByRole("button", { name: "Archive listing", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reopen as private draft", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Reopen as private draft", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Archive listing", exact: true })
    .waitFor();
  assert.equal(
    (await db.exchangeListing.findUniqueOrThrow({ where: { id: duplicateId } }))
      .state,
    "DRAFT"
  );
  ok(
    "Duplicate starts a private draft without copied photos; archive and explicit private reopening preserve the owned record"
  );

  await editor
    .getByLabel("Description (required to publish)", { exact: true })
    .fill("PRIVATE ALTERNATE ACCOUNT MARKER");
  await signIn(other);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByText(
      "Your sign-in changed. Private entries were cleared. Reload for your current account.",
      { exact: true }
    )
    .waitFor();
  assert.equal(
    await page
      .getByRole("textbox")
      .filter({ hasText: "PRIVATE ALTERNATE ACCOUNT MARKER" })
      .count(),
    0
  );
  assert.equal(
    await page
      .locator("textarea")
      .evaluateAll((nodes) =>
        nodes.some((node) =>
          node.value.includes("PRIVATE ALTERNATE ACCOUNT MARKER")
        )
      ),
    false
  );
  ok(
    "An account switch clears retained private editor values and requires a current-account reload"
  );

  await signIn(owner);
  await go(`/platform/exchange/${id}/edit`);
  await page.setViewportSize({ width: 320, height: 780 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
    document.documentElement.classList.add("dark");
  });
  await bounded();
  await page.screenshot({
    path: output + "/editor-320-large-dark.png",
    fullPage: true
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
    document.documentElement.classList.remove("dark");
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await bounded();
  await page.screenshot({
    path: output + "/editor-mobile.png",
    fullPage: true
  });
  await go("/platform/exchange/mine");
  await page.getByRole("link", { name: title, exact: true }).first().waitFor();
  await bounded();
  await page.screenshot({
    path: output + "/owned-listings-mobile.png",
    fullPage: true
  });
  ok(
    "Editor and My listings fit phone widths; 320px enlarged text and dark appearance have no horizontal page overflow"
  );

  await go(`/platform/exchange/${duplicateId}/edit`);
  assert.equal(
    await editor
      .locator('option[value="CHURCH_NEED"]')
      .evaluate((node) => node.disabled),
    true
  );
  await editor
    .getByLabel("Listing type", { exact: true })
    .selectOption("WANTED");
  await editor
    .getByLabel("Category (required to publish)", { exact: true })
    .selectOption("BOOKS");
  const requested = "Fictional requested books " + randomUUID();
  await editor
    .getByLabel("Requested items (required to publish)", { exact: true })
    .fill(requested);
  await editor
    .getByLabel("Needed by (optional)", { exact: true })
    .fill("2028-02-29");
  assert.equal(await editor.getByLabel("Amount", { exact: true }).count(), 0);
  assert.equal(
    await editor.getByLabel("Audience", { exact: true }).inputValue(),
    "PUBLIC"
  );
  await editor
    .getByRole("button", { name: "Save private draft", exact: true })
    .click();
  await waitUntil(
    async () =>
      (
        await db.exchangeListing.findUniqueOrThrow({
          where: { id: duplicateId }
        })
      ).requestedItems === requested
  );
  await go(`/platform/exchange/${duplicateId}/edit`);
  assert.equal(
    await editor
      .getByLabel("Needed by (optional)", { exact: true })
      .inputValue(),
    "2028-02-29"
  );
  await confirmItem();
  await page
    .getByRole("button", { name: "Publish as active", exact: true })
    .click();
  await waitUntil(
    async () =>
      (
        await db.exchangeListing.findUniqueOrThrow({
          where: { id: duplicateId }
        })
      ).state === "ACTIVE"
  );
  await signIn(null);
  await go(`/platform/exchange/${duplicateId}`);
  await page.getByText(requested, { exact: true }).waitFor();
  assert.equal(await page.locator('time[datetime="2028-02-29"]').count(), 1);
  await db.platformUser.update({
    where: { id: owner.id },
    data: { dateFormat: "DMY", regionalVersion: { increment: 1 } }
  });
  await signIn(owner);
  await go(`/platform/exchange/${duplicateId}`);
  assert.equal(
    await page.locator('time[datetime="2028-02-29"]').innerText(),
    "29/02/2028"
  );
  await signIn(null);
  await go("/platform/exchange?intent=WANTED");
  await page.locator(`a[href^="/platform/exchange/${duplicateId}?"]`).waitFor();
  assert.equal(
    await page
      .getByRole("navigation", { name: "Listing types", exact: true })
      .getByRole("link", { name: "Wanted", exact: true })
      .getAttribute("aria-current"),
    "page"
  );
  const filters = page.getByRole("form", {
    name: "Filter Exchange listings",
    exact: true
  });
  await filters.getByLabel("Search listings", { exact: true }).fill(requested);
  await filters.getByText("More filters and sorting", { exact: true }).click();
  await filters.getByText("Books", { exact: true }).click();
  assert.equal(
    await filters
      .getByRole("radio", { name: "Books", exact: true })
      .isChecked(),
    true
  );
  await filters
    .getByRole("button", { name: "Show listings", exact: true })
    .click();
  await page.waitForURL(
    (url) =>
      url.searchParams.get("q") === requested &&
      url.searchParams.get("category") === "BOOKS"
  );
  await page.locator(`a[href^="/platform/exchange/${duplicateId}?"]`).waitFor();
  assert.equal(
    (
      await fetchIn(
        `/api/platform/exchange?intent=WANTED&q=${encodeURIComponent(requested)}&category=BOOKS`
      )
    ).body.listings.length,
    1
  );
  await bounded();
  await page.screenshot({
    path: output + "/wanted-search-mobile.png",
    fullPage: true
  });
  await signIn(owner);
  await go("/platform/exchange/mine");
  await filters.getByText("More filters and sorting", { exact: true }).click();
  await filters
    .getByLabel("Listing status", { exact: true })
    .selectOption("ACTIVE");
  await filters.getByLabel("Search listings", { exact: true }).fill(title);
  await filters
    .getByRole("button", { name: "Show listings", exact: true })
    .click();
  await page.waitForURL((url) => url.searchParams.get("state") === "ACTIVE");
  await page
    .locator(`a[href^="/platform/exchange/${duplicateId}/edit?"]`)
    .waitFor();
  await filters
    .getByLabel("Listing status", { exact: true })
    .selectOption("ARCHIVED");
  await filters
    .getByRole("button", { name: "Show listings", exact: true })
    .click();
  await page.waitForURL((url) => url.searchParams.get("state") === "ARCHIVED");
  await page
    .getByText(
      "No saved listings match these choices. Create a private draft to begin.",
      { exact: true }
    )
    .waitFor();
  ok(
    "Wanted fields and calendar dates persist, including the reader's date format; type navigation, literal search, category chips and owned status filters use current authorized rows"
  );

  await signIn(owner);
  await go(`/platform/exchange/${duplicateId}/edit`);
  await editor
    .getByLabel("Listing type", { exact: true })
    .selectOption("SERVICE");
  await editor
    .getByLabel("Category (required to publish)", { exact: true })
    .selectOption("HOME_GARDEN");
  assert.equal(
    await editor
      .getByLabel("Condition (required to publish)", { exact: true })
      .count(),
    0
  );
  assert.equal(
    await editor
      .getByLabel("Requested items (required to publish)", { exact: true })
      .count(),
    0
  );
  const qualifications = "Fictional amateur experience " + randomUUID();
  await editor
    .getByLabel("Service area (required to publish)", { exact: true })
    .fill("Fictional Chicago area");
  await editor
    .getByLabel("Availability (required to publish)", { exact: true })
    .fill("Fictional Saturday afternoons by agreement");
  await editor
    .getByLabel("Self-stated qualifications (required to publish)", {
      exact: true
    })
    .fill(qualifications);
  await editor
    .getByLabel("Service pricing (required to publish)", { exact: true })
    .selectOption("FIXED");
  await editor
    .getByLabel("Price unit (required to publish)", { exact: true })
    .selectOption("HOUR");
  await editor.getByLabel("Currency", { exact: true }).selectOption("KWD");
  await editor.getByLabel("Amount", { exact: true }).fill("1.001");
  await confirmItem();
  await editor
    .getByRole("button", { name: "Save listing changes", exact: true })
    .click();
  await waitUntil(
    async () =>
      (
        await db.exchangeListing.findUniqueOrThrow({
          where: { id: duplicateId }
        })
      ).qualifications === qualifications
  );
  let typed = await db.exchangeListing.findUniqueOrThrow({
    where: { id: duplicateId }
  });
  assert.equal(typed.priceMinor, 1001);
  assert.equal(typed.requestedItems, "");
  assert.equal(typed.neededBy, null);
  await signIn(null);
  const serviceHtml = await go(`/platform/exchange/${duplicateId}`);
  await page.getByText("KWD 1.001 per hour", { exact: true }).waitFor();
  await page.getByText(qualifications, { exact: true }).waitFor();
  assert.ok(!(await serviceHtml.text()).includes(requested));
  assert.ok(
    !String(
      (
        await fetchIn(
          `/platform/exchange/${duplicateId}`,
          undefined,
          undefined,
          { RSC: "1" }
        )
      ).body
    ).includes(requested)
  );
  await page.getByText(/Godschurches has not verified licenses/).waitFor();
  await bounded();
  await page.screenshot({
    path: output + "/service-detail-mobile.png",
    fullPage: true
  });
  ok(
    "Changing Wanted to Service clears the old request in the database, HTML and RSC; paid help displays an exact rate and self-stated qualification notice"
  );

  await signIn(owner);
  await go(`/platform/exchange/${duplicateId}/edit`);
  await editor
    .getByLabel("Service pricing (required to publish)", { exact: true })
    .selectOption("FREE");
  assert.equal(await editor.getByLabel("Amount", { exact: true }).count(), 0);
  await confirmItem();
  await editor
    .getByRole("button", { name: "Save listing changes", exact: true })
    .click();
  await waitUntil(
    async () =>
      (
        await db.exchangeListing.findUniqueOrThrow({
          where: { id: duplicateId }
        })
      ).servicePricing === "FREE"
  );
  typed = await db.exchangeListing.findUniqueOrThrow({
    where: { id: duplicateId }
  });
  for (const key of ["priceMinor", "currency", "serviceUnit"])
    assert.equal(typed[key], null);
  await go(`/platform/exchange/${duplicateId}/edit`);
  assert.equal(
    await editor
      .getByLabel("Service pricing (required to publish)", { exact: true })
      .inputValue(),
    "FREE"
  );
  const typedCurrent = await readExchangeListing(
    db,
    owner.token,
    duplicateId,
    true
  );
  for (const delta of [
    { schema: 1 },
    { fields: { ...typedCurrent.fields, requestedItems: requested } }
  ]) {
    const denied = await fetchIn(
      "/api/platform/exchange",
      {
        operation: "save",
        mutationId: randomUUID(),
        listingId: duplicateId,
        expectedVersion: typedCurrent.listing.version,
        schema: EXCHANGE_EDITOR_SCHEMA,
        fields: typedCurrent.fields,
        itemPolicy: EXCHANGE_ITEM_POLICY,
        itemConfirmed: true,
        ...delta
      },
      owner.id
    );
    assert.equal(denied.status, 400);
  }
  assert.equal(
    (await db.exchangeListing.findUniqueOrThrow({ where: { id: duplicateId } }))
      .version,
    typedCurrent.listing.version
  );
  await page.setViewportSize({ width: 320, height: 780 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
    document.documentElement.classList.add("dark");
  });
  await bounded();
  await page.screenshot({
    path: output + "/service-editor-320-large-dark.png",
    fullPage: true
  });
  ok(
    "Switching paid help to free clears all rate fields; reload preserves that choice, stale schemas and hidden request fields fail without a write, and the service editor fits enlarged mobile text"
  );
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
    document.documentElement.classList.remove("dark");
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const church = await db.church.create({
    data: {
      name: "Fictional browser Exchange church",
      slug: "fixture-ex-browser-" + randomUUID(),
      summary: "Isolated church listing fixture",
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
  await db.churchCapabilityGrant.createMany({
    data: [
      {
        userId: owner.id,
        churchId: church.id,
        capability: "MANAGE_EXCHANGE_LISTINGS"
      },
      {
        userId: reviewer.id,
        churchId: church.id,
        capability: "MODERATE_EXCHANGE_LISTINGS"
      }
    ]
  });
  await go("/platform/exchange/new");
  await page
    .getByLabel("Listing owner", { exact: true })
    .selectOption(church.id);
  await editor
    .getByLabel("Listing type", { exact: true })
    .selectOption("CHURCH_NEED");
  const needTitle = "Fictional church books " + randomUUID();
  await editor
    .getByLabel("Title (required to publish)", { exact: true })
    .fill(needTitle);
  await editor
    .getByLabel("Description (required to publish)", { exact: true })
    .fill("Fictional shared church-owned request");
  await editor
    .getByLabel("Category (required to publish)", { exact: true })
    .selectOption("BOOKS");
  await editor
    .getByLabel("Requested items (required to publish)", { exact: true })
    .fill("Fictional church library books");
  await editor.getByLabel("Country", { exact: true }).selectOption("US");
  await editor
    .getByLabel("Find a town or area", { exact: true })
    .fill("Chicago");
  await editor.getByRole("button", { name: "Find area", exact: true }).click();
  await editor
    .getByRole("button", { name: /^Chicago,/ })
    .first()
    .click();
  await editor.getByLabel("Audience", { exact: true }).selectOption("CHURCH");
  await editor
    .getByLabel("Church (required to publish)", { exact: true })
    .selectOption(church.id);
  await editor
    .getByRole("button", { name: "Save a private draft", exact: true })
    .click();
  await page.waitForURL(/\/platform\/exchange\/[^/]+\/edit$/);
  const needId = new URL(page.url()).pathname.split("/")[3];
  await confirmItem();
  await page
    .getByRole("button", { name: "Publish as active", exact: true })
    .click();
  await waitUntil(
    async () =>
      (await db.exchangeListing.findUniqueOrThrow({ where: { id: needId } }))
        .state === "ACTIVE"
  );
  assert.equal(
    (await db.exchangeListing.findUniqueOrThrow({ where: { id: needId } }))
      .ownerChurchId,
    church.id
  );
  await signIn(reviewer);
  await go(`/platform/exchange/${needId}`);
  await page.getByRole("heading", { name: needTitle, exact: true }).waitFor();
  await page
    .getByText("Fictional church library books", { exact: true })
    .waitFor();
  await signIn(null);
  const privateNeed = await go(`/platform/exchange/${needId}`);
  assert.ok(!(await privateNeed.text()).includes(needTitle));
  await signIn(owner);
  await go(`/platform/exchange/${needId}/edit`);
  await editor
    .getByLabel("Requested items (required to publish)", { exact: true })
    .waitFor();
  await db.churchCapabilityGrant.updateMany({
    where: {
      userId: owner.id,
      churchId: church.id,
      capability: "MANAGE_EXCHANGE_LISTINGS"
    },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await waitUntil(async () => !(await editor.isVisible()));
  assert.equal(
    (
      await fetchIn(
        `/api/platform/exchange?view=editor&id=${needId}`,
        undefined,
        owner.id
      )
    ).status,
    404
  );
  ok(
    "A current church manager creates and publishes Church need through the real form; approved readers see it, guests cannot, and revoked management conceals the editor"
  );
  assert.deepEqual(errors, []);
  ok("No browser page errors in the exercised listing flows");
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.txt",
    await page
      .locator("body")
      .innerText()
      .catch(() => "")
  );
  throw error;
} finally {
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      {
        results,
        errors,
        at: new Date().toISOString(),
        productionWrites: 0,
        externalSends: 0
      },
      null,
      2
    )
  );
  await browser.close();
  await db.$disconnect();
}
