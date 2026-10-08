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
    process.env.CHROMIUM_PATH ??
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
let providerAttempts = 0,
  allowProviderAttempt = false,
  expectedProviderUrl = null;
const unexpectedExternal = [];
const admitOrigin = (route) => {
  if (new URL(route.request().url()).origin === origin) return true;
  providerAttempts++;
  if (!allowProviderAttempt || route.request().url() !== expectedProviderUrl)
    unexpectedExternal.push("unexpected-origin");
  return false;
};
await context.route("**/*", (route) =>
  admitOrigin(route) ? route.continue() : route.abort()
);
const page = await context.newPage(),
  errors = [],
  results = [];
page.on("pageerror", (e) => errors.push(e.message));
let detailReads = 0;
page.on("request", (request) => {
  const url = new URL(request.url());
  if (
    request.method() === "GET" &&
    url.origin === origin &&
    url.pathname === "/api/platform/media-catalog" &&
    url.searchParams.get("view") === "detail"
  )
    detailReads++;
});
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
const actor = await createPortalActor(db, "mediabrowser");
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
const title = "Fictional browser media " + randomUUID();
const acknowledge = () =>
  page.getByLabel("I understand this source and catalog audience.").check();
const review = () =>
  page.getByLabel("I reviewed this exact source", { exact: false }).check();
const readRow = () =>
  db.mediaCatalogItem.findFirst({
    where: { ownerId: actor.id, title },
    orderBy: { createdAt: "desc" }
  });
try {
  await go("/platform/media/new");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page
    .getByLabel("Description")
    .fill("Readable recording without artwork or a transcript.");
  await page.getByLabel("Format").selectOption("SERMON");
  await page.getByLabel("Audio or video").selectOption("VIDEO");
  await page.getByLabel("Catalog audience").selectOption("MEMBERS");
  await page
    .getByLabel("Public source URL")
    .fill("https://youtu.be/abcdefghijk");
  assert.equal(
    await page.getByText("Review before saving", { exact: true }).count(),
    1
  );
  await acknowledge();
  await page
    .getByRole("button", { name: "Save private draft", exact: true })
    .click();
  await wait(async () => !!(await readRow()));
  let row = await readRow();
  await page
    .getByRole("button", { name: "Publish media", exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("Title", { exact: true }).inputValue(),
    title
  );
  assert.ok(
    !(await page.locator("body").innerText()).includes(
      "The saved item changed."
    )
  );
  ok(
    "create saves one private draft and loads only its fresh confirmed version"
  );
  await acknowledge();
  await review();
  await page
    .getByRole("button", { name: "Publish media", exact: true })
    .click();
  await wait(async () => (await readRow())?.state === "PUBLISHED");
  row = await readRow();
  await page
    .getByRole("button", { name: "Save reviewed publication", exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("Title", { exact: true }).inputValue(),
    title
  );
  ok("publish through explicit source, audience and current rights review");
  await page.getByLabel("Description").fill("Preserved unsent description");
  await page.getByRole("link", { name: "Browse media", exact: true }).click();
  assert.ok(page.url().includes("/platform/media/new"));
  assert.ok(
    (await page.locator("body").innerText()).includes("Save or discard")
  );
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal(
    await page.getByLabel("Title", { exact: true }).isVisible(),
    false
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByLabel("Title", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Description").inputValue(),
    "Preserved unsent description"
  );
  ok("unsaved navigation guard and foreground privacy preserve local edits");
  await page
    .getByRole("button", { name: "Discard unsent changes", exact: true })
    .click();
  await page.getByRole("link", { name: "Browse media", exact: true }).click();
  await page.getByRole("link", { name: title, exact: true }).waitFor();
  await page.screenshot({ path: output + "/library-390.png", fullPage: true });
  await page.getByRole("link", { name: title, exact: true }).click();
  await page
    .getByRole("heading", { name: title, exact: true, level: 1 })
    .waitFor();
  assert.equal(providerAttempts, 0);
  assert.ok(
    (await page.locator("body").innerText()).includes("Open on YOUTUBE")
  );
  await page.screenshot({ path: output + "/detail-390.png", fullPage: true });
  ok("library and detail render readable metadata with zero provider requests");
  const popupPromise = context.waitForEvent("page");
  expectedProviderUrl = row.sourceUrl;
  assert.match(expectedProviderUrl, /^https:\/\//);
  allowProviderAttempt = true;
  await page.getByRole("button", { name: "Open source", exact: true }).click();
  const popup = await popupPromise;
  await wait(async () => providerAttempts === 1);
  allowProviderAttempt = false;
  assert.equal(await popup.evaluate(() => window.opener === null), true);
  await popup.close();
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByRole("heading", { name: title, exact: true, level: 1 })
    .waitFor();
  ok(
    "explicit source action rechecks access and opens one isolated provider tab"
  );
  let releaseSourceRead,
    sourceReadIntercepted = false;
  const delayedSourceRead = async (route) => {
    if (!admitOrigin(route)) return route.abort();
    if (route.request().method() !== "GET" || sourceReadIntercepted)
      return route.continue();
    sourceReadIntercepted = true;
    const response = await route.fetch({ maxRedirects: 0 });
    assert.ok(
      response.status() < 300 || response.status() >= 400,
      "API redirects are not fixture responses"
    );
    await new Promise((resolve) => {
      releaseSourceRead = resolve;
    });
    await route.fulfill({ response });
  };
  await context.route(
    "**/api/platform/media-catalog?view=detail*",
    delayedSourceRead
  );
  await page.getByRole("button", { name: "Open source", exact: true }).click();
  await wait(async () => !!releaseSourceRead);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  releaseSourceRead();
  await page.waitForTimeout(300);
  assert.equal(providerAttempts, 1);
  await context.unroute(
    "**/api/platform/media-catalog?view=detail*",
    delayedSourceRead
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByRole("heading", { name: title, exact: true, level: 1 })
    .waitFor();
  ok("a source read finishing after blur cannot launch the external source");
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  assert.equal(
    await page
      .getByRole("heading", { name: title, exact: true, level: 1 })
      .count(),
    0
  );
  const readsBeforeReconnect = detailReads;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  const recheckSignIn = page.getByRole("button", {
    name: "Recheck this sign-in",
    exact: true
  });
  await recheckSignIn.waitFor();
  assert.equal(
    await page
      .getByRole("heading", { name: title, exact: true, level: 1 })
      .count(),
    0
  );
  assert.equal(detailReads, readsBeforeReconnect);
  assert.equal(providerAttempts, 1);
  // SessionActivity deliberately conceals readers after an offline event.
  // Its explicit same-owner check emits the recovery focus event.
  await recheckSignIn.click();
  await page
    .getByRole("heading", { name: title, exact: true, level: 1 })
    .waitFor();
  assert.ok(detailReads > readsBeforeReconnect);
  assert.equal(providerAttempts, 1);
  ok("focused reconnect rechecks this sign-in before restoring fresh permitted metadata");
  const readsBeforeBackgroundReconnect = detailReads;
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
  });
  await page.waitForTimeout(300);
  assert.equal(
    await page
      .getByRole("heading", { name: title, exact: true, level: 1 })
      .count(),
    0
  );
  assert.equal(detailReads, readsBeforeBackgroundReconnect);
  assert.equal(providerAttempts, 1);
  await recheckSignIn.waitFor();
  await recheckSignIn.click();
  await page
    .getByRole("heading", { name: title, exact: true, level: 1 })
    .waitFor();
  assert.ok(detailReads > readsBeforeBackgroundReconnect);
  assert.equal(providerAttempts, 1);
  ok("background reconnect stays concealed until a same-account recheck restores focus");
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.addStyleTag({ content: "html {font-size:32px !important}" });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1
      )
    );
    await page.screenshot({
      path: output + `/detail-${width}-double.png`,
      fullPage: true
    });
  }
  ok(
    "320 and 390 pixel detail supports doubled text without horizontal overflow"
  );
  await db.mediaCatalogRights.update({
    where: { itemId: row.id },
    data: { revokedAt: new Date() }
  });
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await page
    .getByText("This media item is unavailable.", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("heading", { name: title, exact: true, level: 1 })
      .count(),
    0
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Open source", exact: true })
      .count(),
    0
  );
  ok("rights revocation conceals retained detail and source action");

  await page.setViewportSize({ width: 390, height: 844 });
  const other = await createPortalActor(db, "mediaswap");
  await go("/platform/media/new");
  const retryTitle = "Uncertain media " + randomUUID();
  await page.getByLabel("Title", { exact: true }).fill(retryTitle);
  let intercepted = false;
  const swapResponse = async (route) => {
    if (!admitOrigin(route)) return route.abort();
    if (route.request().method() !== "POST" || intercepted)
      return route.continue();
    intercepted = true;
    const response = await route.fetch({ maxRedirects: 0 });
    assert.ok(
      response.status() < 300 || response.status() >= 400,
      "API redirects are not fixture responses"
    );
    await context.addCookies([
      {
        name: sessionCookieFixtureName(origin),
        value: other.token,
        url: origin,
        httpOnly: true,
        secure: true,
        sameSite: "Lax"
      }
    ]);
    await route.fulfill({ response });
  };
  await context.route("**/api/platform/media-catalog", swapResponse);
  await page
    .getByRole("button", { name: "Save private draft", exact: true })
    .click();
  await wait(
    async () =>
      (await db.mediaCatalogItem.count({
        where: { ownerId: actor.id, title: retryTitle }
      })) === 1
  );
  await page
    .getByRole("button", { name: "Retry original request", exact: true })
    .waitFor();
  await page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .first()
    .waitFor();
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await wait(
    async () => !(await page.getByLabel("Title", { exact: true }).isVisible())
  );
  assert.ok(!(await page.locator("body").innerText()).includes(retryTitle));
  await context.unroute("**/api/platform/media-catalog", swapResponse);
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
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByRole("button", { name: "Retry original request", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Publish media", exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("Title", { exact: true }).inputValue(),
    retryTitle
  );
  assert.equal(
    await db.mediaCatalogItem.count({
      where: { ownerId: actor.id, title: retryTitle }
    }),
    1
  );
  assert.equal(
    await db.mediaCatalogItem.count({
      where: { ownerId: other.id, title: retryTitle }
    }),
    0
  );
  ok(
    "post-commit account switch conceals private fields and retains one exact create retry"
  );

  const retryRow = await db.mediaCatalogItem.findFirstOrThrow({
    where: { ownerId: actor.id, title: retryTitle }
  });
  await page.getByLabel("Description").fill("Local conflict text preserved");
  await db.mediaCatalogItem.update({
    where: { id: retryRow.id },
    data: { title: "External fixture change", version: { increment: 1 } }
  });
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await page.getByText("The saved item changed.", { exact: false }).waitFor();
  assert.equal(
    await page.getByLabel("Description").inputValue(),
    "Local conflict text preserved"
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Save private draft", exact: true })
      .isDisabled(),
    true
  );
  await page
    .getByRole("button", { name: "Discard unsent changes", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Title", { exact: true }).inputValue(),
    "External fixture change"
  );
  ok(
    "version conflicts preserve local edits until deliberate discard and fresh reload"
  );

  await page.getByText("Manage availability", { exact: true }).click();
  let lost = false;
  const loseRemoval = async (route) => {
    if (!admitOrigin(route)) return route.abort();
    if (route.request().method() !== "POST" || lost) return route.continue();
    lost = true;
    const response = await route.fetch({ maxRedirects: 0 });
    assert.ok(
      response.status() < 300 || response.status() >= 400,
      "API redirects are not fixture responses"
    );
    await route.abort();
  };
  await context.route("**/api/platform/media-catalog", loseRemoval);
  await page.getByRole("button", { name: "Remove media", exact: true }).click();
  await wait(
    async () =>
      (await db.mediaCatalogItem.findUnique({ where: { id: retryRow.id } }))
        ?.state === "REMOVED"
  );
  await page
    .getByRole("button", { name: "Retry original request", exact: true })
    .waitFor();
  await context.unroute("**/api/platform/media-catalog", loseRemoval);
  await page
    .getByRole("button", { name: "Retry original request", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Return to publishing studio", exact: true })
    .waitFor();
  assert.equal(
    await db.mediaCatalogEvent.count({
      where: { itemId: retryRow.id, action: "remove" }
    }),
    1
  );
  ok(
    "lost removal response recovers its original receipt without a second removal"
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpectedExternal, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      { results, providerAttempts, errors, unexpectedExternal, unexpectedExternalRequests: unexpectedExternal.length },
      null,
      2
    )
  );
  console.log(
    JSON.stringify({ output, passed: results.length, providerAttempts, errors })
  );
} catch (e) {
  await page.screenshot({ path: output + "/failure.png", fullPage: true });
  writeFileSync(
    output + "/failure.json",
    JSON.stringify(
      { error: String(e), results, errors, url: page.url() },
      null,
      2
    )
  );
  throw e;
} finally {
  await browser.close();
  await db.$disconnect();
}
