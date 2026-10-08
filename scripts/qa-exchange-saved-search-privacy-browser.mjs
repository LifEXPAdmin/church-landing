import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";
const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the existing isolated Exchange preview directory");
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(
  config.origin,
  /^https:\/\/(?:exchange-fixture\.example\.test|127\.0\.0\.1):\d+$/
);
const localOrigin = config.localOrigin ?? config.origin;
assert.match(localOrigin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: localOrigin,
  NEXT_PUBLIC_SITE_URL: localOrigin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR:
    process.env.ACCOUNT_TEST_SINK_DIR ?? fixtureDir + "/sink",
  AUTH_RATE_LIMIT_SECRET:
    process.env.AUTH_RATE_LIMIT_SECRET ??
    "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: "",
  PRIVILEGED_MFA_MODE: process.env.PRIVILEGED_MFA_MODE ?? "enroll",
  COMMUNITY_REPORTS_ENABLED: "true",
  BLOB_READ_WRITE_TOKEN: "",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  MEDIA_STORAGE_MODE: "local-test",
  RETENTION_TEST_DIR:
    process.env.RETENTION_TEST_DIR ?? fixtureDir + "/retention",
  MEDIA_TEST_DIR: process.env.MEDIA_TEST_DIR ?? fixtureDir + "/images"
});
const { PrismaClient } = await import("@prisma/client");
const { createPortalActor, assertPortalTestDatabase } =
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
      createHash("sha256").update(der).digest("base64"),
    "--host-resolver-rules=MAP exchange-fixture.example.test 127.0.0.1",
    "--no-proxy-server"
  ]
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true
});
// One dispatcher owns each request. Keep the origin fence mounted while
// changing fault injections, so page/context routing cannot race for ownership.
const within = async (promise, label) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error(label + " timed out")), 15000);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
};
let intercepts = [];
const routed = new Set(),
  routingErrors = [];
const intercept = async (match, handle) => {
  intercepts.push({ match, handle });
};
const clearIntercepts = async () => {
  intercepts = [];
  await within(Promise.all([...routed]), "Routed saved-search requests");
  assert.deepEqual(routingErrors, []);
};
await context.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (url.origin !== config.origin) return route.abort();
  const rule = [...intercepts]
    .reverse()
    .find(({ match }) =>
      typeof match === "string" ? url.href === match : match(url)
    );
  if (!rule) return route.continue();
  const pending = Promise.resolve()
    .then(() => rule.handle(route))
    .catch((error) => {
      routingErrors.push(error.message);
    });
  routed.add(pending);
  await pending;
  routed.delete(pending);
});
const page = await context.newPage(),
  errors = [],
  results = [],
  output = fixtureDir + "/exchange-saved-search-browser-" + Date.now();
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
        name: sessionCookieFixtureName(config.origin),
        value: actor.token,
        url: config.origin,
        secure: true,
        httpOnly: true,
        sameSite: "Lax"
      }
    ]);
};
const layoutFailures = [];
const bounded = async () => {
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll("body *")]
      .filter(
        (element) => element.getBoundingClientRect().right > innerWidth + 1
      )
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        text: element.textContent.slice(0, 100),
        right: element.getBoundingClientRect().right,
        width: element.getBoundingClientRect().width,
        whiteSpace: getComputedStyle(element).whiteSpace
      }))
      .slice(0, 20)
  }));
  if (layout.scrollWidth > layout.viewport + 1) {
    layoutFailures.push(layout);
    console.log("LAYOUT DIAGNOSTIC " + JSON.stringify(layout));
  }
};
const waitUntil = async (work) => {
  for (let i = 0; i < 100; i++) {
    if (await work()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Expected current saved-search state was not observed");
};
const exact = (name) => page.getByRole("button", { name, exact: true });
const signal = (name) =>
  page.evaluate((name) => window.dispatchEvent(new Event(name)), name);
try {
  const { exchangeSavedCommand: command, readExchangeSaved: read } =
    await import("../lib/platform/exchange-saved.ts");
  const { EXCHANGE_SAVED_SCHEMA } =
    await import("../lib/platform/exchange-options.ts");
  const owner = await createPortalActor(db, "savedsearchowner"),
    other = await createPortalActor(db, "savedsearchother");
  const searchName = "Private named search " + randomUUID(),
    unsent = "Unsent private name " + randomUUID();
  const criteria = { q: "Fictional private criteria" };
  const saved = await command(db, owner.token, {
    operation: "search-save",
    mutationId: randomUUID(),
    searchId: randomUUID(),
    expectedVersion: 0,
    schema: EXCHANGE_SAVED_SCHEMA,
    name: searchName,
    criteria,
    alerts: true
  });
  const path =
    "/platform/exchange?" +
    new URLSearchParams({ ...criteria, savedSearch: saved.id });
  const editor = page.locator('form[aria-label="Update saved search"]');
  const name = editor.locator('input[type="text"], input:not([type])');
  const alerts = editor.locator('input[type="checkbox"]');
  const panel = page.locator('section[aria-label="Saved search editor"]');
  const endpoint = config.origin + "/api/platform/exchange";
  const detailRoute = (url) =>
    url.pathname === "/api/platform/exchange" &&
    url.searchParams.get("view") === "search";
  const fail = (route, status, message) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify({ message })
    });
  const submit = () =>
    editor.getByRole("button", { name: "Update saved search", exact: true });
  const ready = async (form = editor) => {
    await form.getByLabel("Search name", { exact: true }).waitFor();
    await waitUntil(
      async () => !(await form.locator('button[type="submit"]').isDisabled())
    );
  };
  const retry = () =>
    panel.getByRole("button", { name: "Confirm original save", exact: true });
  const retryReady = async () => {
    await retry().waitFor();
    await waitUntil(async () => !(await retry().isDisabled()));
  };
  const details = () =>
    read(db, owner.token, { view: "search", searchId: saved.id });
  await signIn(owner);
  await intercept(detailRoute, (route) =>
    fail(route, 403, "Injected current search access denial")
  );
  const html = await (await go(path)).text();
  const rsc = await (
    await context.request.get(config.origin + path, { headers: { RSC: "1" } })
  ).text();
  for (const text of [html, rsc]) assert.ok(!text.includes(searchName));
  await panel
    .getByText("Injected current search access denial", { exact: true })
    .waitFor();
  assert.equal(await name.count(), 0);
  assert.equal(await alerts.count(), 0);
  await clearIntercepts();
  await panel
    .getByRole("button", { name: "Recheck current access", exact: true })
    .click();
  await ready();
  assert.equal(await name.inputValue(), searchName);
  assert.equal(await alerts.isChecked(), true);
  ok(
    "Saved-search HTML/RSC omit the saved row; denied first current read mounts no private inputs"
  );
  await name.fill(unsent);
  await alerts.uncheck();
  for (const event of ["blur", "pagehide", "offline"]) {
    await signal(event);
    assert.equal(await panel.locator("input").count(), 0);
    assert.ok(!(await panel.textContent()).includes(unsent));
    await signal("social-relationships-changed");
    await signal("online");
    assert.equal(await panel.locator("input").count(), 0);
    await signal("focus");
    await ready();
    assert.equal(await name.inputValue(), unsent);
    assert.equal(await alerts.isChecked(), false);
  }
  await bounded();
  await page.screenshot({
    path: output + "/saved-search-390.png",
    fullPage: true
  });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await bounded();
  await page.screenshot({
    path: output + "/saved-search-320-200.png",
    fullPage: true
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.setViewportSize({ width: 390, height: 844 });
  ok(
    "Blur, pagehide and offline physically omit unsent fields; only current-owner resume restores them, including mobile enlarged text"
  );

  const bodies = [];
  await intercept(endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postData();
    bodies.push(body);
    const sent = JSON.parse(body);
    if (bodies.length === 1) {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      return route.abort("failed");
    }
    if (bodies.length === 2 || bodies.length === 3)
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: bodies.length === 2 ? randomUUID() : sent.searchId,
          version:
            bodies.length === 3
              ? sent.expectedVersion
              : sent.expectedVersion + 1,
          message: "Injected incorrect receipt"
        })
      });
    if (bodies.length === 4) return fail(route, 429, "Injected retry limit");
    if (bodies.length === 5)
      return fail(route, 503, "Injected temporary failure");
    return route.continue();
  });
  await submit().click();
  await retryReady();
  await signal("blur");
  await signal("focus");
  await retryReady();
  assert.equal(await panel.locator("input").count(), 0);
  for (let i = 0; i < 5; i++) {
    await retry().click();
    if (i < 4) await retryReady();
  }
  await ready();
  await clearIntercepts();
  assert.equal(bodies.length, 6);
  assert.ok(bodies.every((body) => body === bodies[0]));
  assert.equal((await details()).searches[0].version, 2);
  assert.equal(await name.inputValue(), unsent);
  assert.equal(await alerts.isChecked(), false);
  ok(
    "Lost existing save, changed row, wrong target/version, 429 and 503 preserve six identical requests and one version increment with the retained command"
  );

  // A newer unrelated edit cannot be adopted on the strength of an older receipt.
  const laterBodies = [];
  await intercept(endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    laterBodies.push(route.request().postData());
    if (laterBodies.length === 1) {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      return route.abort("failed");
    }
    return route.continue();
  });
  await name.fill(unsent + " second");
  await submit().click();
  await retryReady();
  await command(db, owner.token, {
    operation: "search-save",
    mutationId: randomUUID(),
    searchId: saved.id,
    expectedVersion: 3,
    schema: EXCHANGE_SAVED_SCHEMA,
    name: "Changed independently",
    criteria,
    alerts: true
  });
  await signal("blur");
  await signal("focus");
  await retryReady();
  await retry().click();
  await panel
    .getByText(
      "The original save is confirmed, but this search changed again. Reload to review current information.",
      { exact: true }
    )
    .waitFor();
  await clearIntercepts();
  assert.equal(await panel.locator("input").count(), 0);
  assert.equal(laterBodies.length, 2);
  assert.equal(laterBodies[0], laterBodies[1]);
  assert.equal((await details()).searches[0].version, 4);
  ok(
    "An exact older receipt cannot rebase the retained editor onto a newer independent version"
  );

  const newPath = "/platform/exchange?" + new URLSearchParams(criteria);
  await go(newPath);
  await page.getByText("Save this search", { exact: true }).click();
  const fresh = page.locator('form[aria-label="Save current search"]');
  const freshName = fresh.getByLabel("Search name", { exact: true });
  const freshAlerts = fresh.locator('input[type="checkbox"]');
  await ready(fresh);
  await freshName.fill(unsent + " new");
  await freshAlerts.check();
  await signal("blur");
  assert.equal(await panel.locator("input").count(), 0);
  await signal("focus");
  await ready(fresh);
  assert.equal(await freshName.inputValue(), unsent + " new");
  assert.equal(await freshAlerts.isChecked(), true);
  // A definitive 400 leaves a correctable draft, even across a fresh access read.
  await intercept(endpoint, (route) =>
    route.request().method() === "POST"
      ? fail(route, 400, "Injected validation rejection")
      : route.continue()
  );
  await fresh.locator('button[type="submit"]').click();
  await fresh
    .getByText("Injected validation rejection", { exact: true })
    .waitFor();
  await clearIntercepts();
  await signal("blur");
  await signal("focus");
  await ready(fresh);
  assert.equal(await freshName.inputValue(), unsent + " new");
  ok(
    "New-search fields survive concealment and definitive validation rejection without becoming a missing-row replay trap"
  );

  let releaseRead,
    readStarted,
    holdRead = false;
  const readGate = new Promise((resolve) => {
    releaseRead = resolve;
  });
  const readReady = new Promise((resolve) => {
    readStarted = resolve;
  });
  const newBodies = [];
  await intercept(detailRoute, async (route) => {
    const response = await route.fetch();
    if (holdRead) {
      readStarted();
      await within(readGate, "New search readback");
    }
    return route.fulfill({ response });
  });
  await intercept(endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    newBodies.push(route.request().postData());
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    holdRead = true;
    return route.fulfill({ response });
  });
  await fresh.locator('button[type="submit"]').click();
  try {
    await within(readReady, "New search canonical acknowledgment");
    assert.equal(await panel.locator("input").count(), 0);
    await signal("blur");
  } finally {
    releaseRead();
  }
  await clearIntercepts();
  assert.equal(await panel.locator("input").count(), 0);
  await signal("focus");
  await ready(fresh);
  await waitUntil(async () => (await freshName.inputValue()) === "");
  assert.equal(await freshAlerts.isChecked(), false);
  const firstNew = JSON.parse(newBodies[0]);
  await freshName.fill("Another saved search");
  await fresh.locator('button[type="submit"]').click();
  await waitUntil(
    async () =>
      (await freshName.count()) === 1 && (await freshName.inputValue()) === ""
  );
  await ready(fresh);
  const currentSearches = (await read(db, owner.token, { view: "searches" }))
    .searches;
  const secondNew = currentSearches.find(
    (row) => row.name === "Another saved search"
  );
  assert.ok(secondNew && secondNew.id !== firstNew.searchId);
  assert.equal(secondNew.version, 1);
  assert.equal(
    currentSearches.find((row) => row.id === firstNew.searchId).version,
    1
  );
  ok(
    "A held readback and hidden receipt cannot reset the new draft; visible exact acknowledgment permits a distinct second version-one search"
  );

  // Remove a newly saved row before the lost response can be confirmed.
  const removedBodies = [];
  await intercept(endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    removedBodies.push(route.request().postData());
    if (removedBodies.length === 1) {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      return route.abort("failed");
    }
    return route.continue();
  });
  await freshName.fill("Removed before confirmation");
  await fresh.locator('button[type="submit"]').click();
  await retryReady();
  const removedBody = JSON.parse(removedBodies[0]);
  await command(db, owner.token, {
    operation: "search-delete",
    mutationId: randomUUID(),
    searchId: removedBody.searchId,
    expectedVersion: 1
  });
  await signal("blur");
  await signal("focus");
  await retryReady();
  assert.equal(await panel.locator("input").count(), 0);
  const retainedUrl = page.url();
  await panel
    .getByRole("link", { name: "Open current named searches", exact: true })
    .click();
  assert.equal(page.url(), retainedUrl);
  await retry().click();
  await panel
    .getByText(
      "The original save is confirmed, but this search is now unavailable. Open your current named searches.",
      { exact: true }
    )
    .waitFor();
  await clearIntercepts();
  assert.equal(await panel.locator("input").count(), 0);
  assert.equal(removedBodies.length, 2);
  assert.equal(removedBodies[0], removedBodies[1]);
  assert.equal(
    (
      await db.exchangeSavedSearch.findUniqueOrThrow({
        where: { id: removedBody.searchId }
      })
    ).version,
    2
  );
  await panel
    .getByRole("button", { name: "Open current named searches", exact: true })
    .click();
  await page.waitForURL("**/platform/exchange/saved?view=searches");
  await page
    .getByRole("heading", { name: "Another saved search", exact: true })
    .waitFor();
  ok(
    "A missing minted row grants only pinned-actor exact replay, blocks departure while unresolved and never revives a deleted search"
  );

  await go(path);
  await ready();
  await name.fill(unsent + " account switch");
  await signIn(other);
  await signal("blur");
  await signal("focus");
  await waitUntil(async () => (await panel.locator("input").count()) === 0);
  await panel
    .getByText(
      "Your sign-in changed. Private entries were cleared. Reload for your current account.",
      { exact: true }
    )
    .waitFor({ state: "attached" });
  assert.ok(!(await panel.textContent()).includes(unsent));
  assert.equal(
    await db.exchangeSavedSearch.count({ where: { ownerId: other.id } }),
    0
  );
  ok(
    "Confirmed account replacement clears the retained editor and never transfers unsent fields"
  );
  await signIn(other);
  const foreign = await (await go(path)).text();
  assert.ok(!foreign.includes(searchName));
  await page
    .getByText(
      "This saved search is unavailable. Open your current named searches.",
      { exact: true }
    )
    .waitFor();
  assert.equal(
    await page.getByLabel("Search name", { exact: true }).count(),
    0
  );
  await assert.rejects(
    read(db, other.token, { view: "search", searchId: saved.id }),
    (error) => error.status === 404
  );
  ok(
    "CONTROL: canonical search detail and rendered editor exclude another account's named search"
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(layoutFailures, []);
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      {
        layoutFailures,
        results,
        errors,
        productionWrites: 0,
        externalSends: 0
      },
      null,
      2
    )
  );
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.txt",
    String(error.stack) +
      "\n" +
      (await page
        .locator("body")
        .innerText()
        .catch(() => ""))
  );
  writeFileSync(
    output + "/results.json",
    JSON.stringify({ results, errors, error: String(error) }, null, 2)
  );
  throw error;
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
