import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the existing isolated preview artifact directory");
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + fixtureDir + "/sink",
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: ""
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
      createHash("sha256").update(der).digest("base64")
  ]
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => {
  const issue = { path: new URL(page.url()).pathname, message: e.message };
  errors.push(issue);
  console.log("BROWSER_ERROR", JSON.stringify(issue));
});
const results = [];
const ok = (s) => {
  results.push(s);
  console.log("PASS " + s);
};
const output = fixtureDir + "/draft-library-browser";
mkdirSync(output, { recursive: true });
const go = async (path) => {
  await page.goto(config.origin + path);
  await page.waitForLoadState("networkidle");
};
const bounded = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal page overflow"
  );

const { privateDraftPayload } =
  await import("../lib/platform/post-workspace.ts");
const signIn = async (actor) =>
  context.addCookies([
    {
      name: "church_platform_session",
      value: actor.token,
      domain: "127.0.0.1",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
const rows = () =>
  page.getByRole("list", { name: "Saved drafts" }).locator(":scope > li");
const settle = () =>
  page.waitForFunction(
    () =>
      document
        .querySelector('[aria-label="Your private drafts"]')
        ?.getAttribute("aria-busy") === "false"
  );
try {
  const a = await createPortalActor(db, "librarya"),
    b = await createPortalActor(db, "libraryb");
  const postCount = await db.platformPost.count({ where: { authorId: a.id } });
  const marker = `Private library ${a.id}`;
  for (let i = 0; i < 22; i++)
    await db.privatePostDraft.create({
      data: {
        ownerId: a.id,
        id: `library-${String(i).padStart(2, "0")}`,
        payload: privateDraftPayload({
          content:
            i === 0
              ? marker + " " + "x".repeat(1000)
              : i === 1
                ? " "
                : `${marker} row ${i}`,
          scripture: i === 0 ? "  Scripture\ntext  " : ""
        })
      }
    });
  await db.privatePostDraft.create({
    data: {
      ownerId: b.id,
      id: "library-00",
      payload: privateDraftPayload({ content: "Other account private marker" })
    }
  });
  await go("/platform/drafts");
  assert.equal(await rows().count(), 0);
  assert.ok(!(await page.content()).includes(marker));
  assert.equal(
    (
      await context.request.get(
        config.origin + "/api/platform/post-workspace?view=drafts"
      )
    ).status(),
    401
  );
  assert.ok((await page.content()).includes("%2Fplatform%2Fdrafts"));
  ok("Guest gate, safe return destination and private API denial");
  await signIn(a);
  await go("/platform/drafts");
  await settle();
  assert.equal(await rows().count(), 20);
  assert.ok(!(await page.content()).includes("Other account private marker"));
  assert.equal(
    await page.getByText("No text entered yet.", { exact: true }).count(),
    1
  );
  await bounded();
  await page.setViewportSize({ width: 320, height: 844 });
  await bounded();
  await page.screenshot({
    path: output + "/library-mobile.png",
    fullPage: true
  });
  await page.getByRole("button", { name: "More drafts", exact: true }).click();
  await settle();
  assert.equal(await rows().count(), 22);
  ok("Owner-only pagination, exact incomplete text and 320/390 pixel layout");
  await page
    .getByRole("button", { name: "Discard draft 1", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute("aria-label") === "Confirm discard"
  );
  await page.screenshot({ path: output + "/confirmation-mobile.png" });
  await page.getByRole("button", { name: "Keep draft", exact: true }).click();
  assert.equal(await rows().count(), 22);
  assert.equal(
    (
      await db.privatePostDraft.findUniqueOrThrow({
        where: { ownerId_id: { ownerId: a.id, id: "library-00" } }
      })
    ).deletedAt,
    null
  );
  ok("Cancel discard preserves the saved draft");
  await db.privatePostDraft.update({
    where: { ownerId_id: { ownerId: a.id, id: "library-00" } },
    data: {
      version: { increment: 1 },
      payload: privateDraftPayload({ content: marker + " newer saved text" })
    }
  });
  await page
    .getByRole("button", { name: "Discard draft 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Discard saved draft", exact: true })
    .click();
  await settle();
  assert.match(await page.getByRole("status").innerText(), /changed elsewhere/);
  assert.equal(
    (
      await db.privatePostDraft.findUniqueOrThrow({
        where: { ownerId_id: { ownerId: a.id, id: "library-00" } }
      })
    ).deletedAt,
    null
  );
  await page
    .getByRole("button", { name: "Refresh and review", exact: true })
    .click();
  await settle();
  assert.equal(
    await page.getByText(marker + " newer saved text", { exact: true }).count(),
    1
  );
  ok("Stale discard fails closed and requires review of refreshed version");
  const sent = [];
  let dropped = false;
  await page.route("**/api/platform/post-workspace", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    sent.push(route.request().postData());
    if (!dropped) {
      dropped = true;
      const r = await route.fetch();
      assert.equal(r.status(), 200);
      await route.abort();
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Discard draft 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Discard saved draft", exact: true })
    .click();
  await settle();
  assert.match(
    await page.getByRole("status").innerText(),
    /could not be confirmed/
  );
  assert.equal(await rows().count(), 20);
  await page
    .getByRole("button", { name: "Retry discard", exact: true })
    .click();
  await settle();
  assert.equal(sent.length, 2);
  assert.equal(sent[0], sent[1]);
  assert.equal(await rows().count(), 19);
  assert.match(await page.getByRole("status").innerText(), /Draft discarded/);
  await page.unroute("**/api/platform/post-workspace");
  ok(
    "Lost acknowledgment preserves list and retries the identical mutation safely"
  );
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal(await rows().count(), 0);
  await signIn(b);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForURL(config.origin + "/platform/drafts");
  await page
    .getByText("Other account private marker", { exact: true })
    .waitFor();
  assert.equal(await rows().count(), 1);
  assert.ok(!(await page.content()).includes(marker));
  ok("Background account switch clears private rows before refetch");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await context.clearCookies();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(
    () => !document.querySelector('[aria-label="Your private drafts"]')
  );
  assert.ok(!(await page.content()).includes("Other account private marker"));
  ok("Sign-out removes the account library");
  const c = await createPortalActor(db, "libraryempty");
  await signIn(c);
  await page.route("**/api/platform/post-workspace?*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Temporary draft test outage" })
    })
  );
  await go("/platform/drafts");
  await settle();
  assert.match(
    await page.getByRole("status").innerText(),
    /Temporary draft test outage/
  );
  await page.unroute("**/api/platform/post-workspace?*");
  await page
    .getByRole("button", { name: "Refresh drafts", exact: true })
    .click();
  await settle();
  assert.equal(
    await page.getByText("No saved drafts to show.", { exact: true }).count(),
    1
  );
  ok(
    "Failed initial load recovers to the empty state without creating a draft"
  );
  await context.clearCookies();
  for (const path of ["/platform", "/platform/menu", "/platform/drafts"]) {
    const response = await context.request.get(config.origin + path);
    assert.ok(!(await response.text()).includes(marker));
  }
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  assert.equal(
    await db.platformPost.count({ where: { authorId: a.id } }),
    postCount
  );
  ok("No localStorage copies, public serialization or published-post writes");
  await go("/platform");
  assert.equal(await page.locator('link[rel="manifest"]').count(), 1);
  assert.equal(await page.locator('link[rel="apple-touch-icon"]').count(), 1);
  const response = await context.request.get(
    config.origin + "/manifest.webmanifest"
  );
  assert.equal(response.status(), 200);
  assert.match(
    response.headers()["content-type"],
    /application\/manifest\+json/
  );
  const manifest = await response.json();
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/platform");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  const sharp = (await import("sharp")).default;
  for (const icon of manifest.icons) {
    const r = await context.request.get(config.origin + icon.src);
    assert.equal(r.status(), 200);
    assert.match(r.headers()["content-type"], /image\/png/);
    const info = await sharp(await r.body()).metadata();
    assert.equal(`${info.width}x${info.height}`, icon.sizes);
  }
  const cdp = await context.newCDPSession(page);
  const parsed = await cdp.send("Page.getAppManifest");
  assert.equal(parsed.errors.length, 0);
  const install = await cdp.send("Page.getInstallabilityErrors");
  writeFileSync(output + "/installability.json", JSON.stringify(install));
  assert.equal(
    await page.evaluate(
      async () => (await navigator.serviceWorker.getRegistrations()).length
    ),
    0
  );
  assert.deepEqual(await page.evaluate(() => caches.keys()), []);
  ok(
    "Browser parses one manifest; declared PNG dimensions match; no service worker/private cache"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      { passed: results.length, results, errors, installability: install },
      null,
      2
    )
  );
} finally {
  await browser.close();
  await db.$disconnect();
}
