import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

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
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  BLOB_READ_WRITE_TOKEN: "",
  MEDIA_STORAGE_MODE: "local-test",
  MEDIA_TEST_DIR: process.cwd() + "/" + fixtureDir + "/images"
});
const { PrismaClient } = await import("@prisma/client");
const { seedPortal, assertPortalTestDatabase } =
  await import("../tests/seed-portal.ts");
const { portalCommand } = await import("../lib/platform/portal.ts");
const { postWorkspaceCommand } =
  await import("../lib/platform/post-workspace.ts");
const { EXCHANGE_ITEM_POLICY } =
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
    "--no-proxy-server"
  ]
});
const output = fixtureDir + "/membership-browser-" + Date.now();
mkdirSync(output, { recursive: true });
const results = [],
  errors = [];
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
try {
  for (const action of ["LEAVE", "REMOVE"]) {
    const f = await seedPortal(db),
      actor = f.memberA;
    const marker = "Private church boundary " + randomUUID();
    const post = await db.platformPost.create({
      data: {
        authorId: f.contact.id,
        content: marker,
        audience: "CHURCH",
        audienceChurchId: f.churchA.id,
        publishedAt: new Date(Date.now() - 1000)
      }
    });
    await postWorkspaceCommand(db, actor.token, {
      operation: "save-item",
      mutationId: randomUUID(),
      postId: post.id,
      expectedVersion: 0
    });
    const listing = await db.exchangeListing.create({
      data: {
        ownerId: f.contact.id,
        creatorId: f.contact.id,
        state: "ACTIVE",
        title: marker,
        description: "Private fictional listing",
        category: "FURNITURE",
        condition: "GOOD",
        audience: "CHURCH",
        audienceChurchId: f.churchA.id,
        country: "US",
        placeId: 4887398,
        placeLabel: "Chicago",
        itemPolicy: EXCHANGE_ITEM_POLICY,
        confirmedAt: new Date(),
        publishedAt: new Date()
      }
    });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }
    });
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === config.origin
        ? route.continue()
        : route.abort()
    );
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
    const paths = [
      "/platform/posts/" + post.id,
      "/platform/saved",
      "/platform/search?q=" + encodeURIComponent(marker),
      "/platform/exchange/" + listing.id
    ];
    const pages = [];
    for (const path of paths) {
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      page.on("pageerror", (e) => errors.push({ path, message: e.message }));
      await page.goto(config.origin + path);
      await page.getByText(marker, { exact: true }).first().waitFor();
      pages.push(page);
    }
    const api = [
      "/api/platform/posts?view=availability&postId=" + post.id,
      "/api/platform/search?q=" + encodeURIComponent(marker),
      "/api/platform/exchange?view=listing&id=" + listing.id
    ];
    for (const path of api) {
      const response = await context.request.get(config.origin + path, {
        ignoreHTTPSErrors: true
      });
      assert.equal(response.status(), 200);
    }
    const connection = await db.churchConnection.findUniqueOrThrow({
      where: {
        userId_churchId: { userId: actor.id, churchId: f.churchA.id }
      }
    });
    await portalCommand(
      db,
      action === "LEAVE" ? actor.token : f.reviewerA.token,
      {
        operation: "transition",
        action,
        churchId: f.churchA.id,
        connectionId: connection.id,
        expectedVersion: connection.version
      }
    );
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      await page.bringToFront();
      const readPath = [
        "/api/platform/posts",
        "/api/platform/post-workspace",
        "/api/platform/search",
        "/api/platform/exchange"
      ][i];
      const rechecked = page.waitForResponse(
        (r) => new URL(r.url()).pathname === readPath
      );
      await page.evaluate(() => {
        window.dispatchEvent(new Event("blur"));
        window.dispatchEvent(new Event("focus"));
      });
      await page.waitForFunction(
        (text) => !document.body.innerText.includes(text),
        marker
      );
      await (await rechecked).finished();
      assert.ok(!(await page.locator("body").innerText()).includes(marker));
      await page.screenshot({ path: `${output}/${action}-${i}-concealed.png` });
      const reloaded = await page.reload();
      assert.equal(reloaded.status(), i === 0 ? 404 : 200);
      await page.locator("body").waitFor();
      assert.ok(!(await page.locator("body").innerText()).includes(marker));
      await page.goto(config.origin + "/platform/menu");
      await page.goBack();
      await page.locator("body").waitFor();
      assert.ok(!(await page.locator("body").innerText()).includes(marker));
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1
        )
      );
    }
    ok(
      action +
        " conceals four retained views on resume; reload and Back keep private source text unavailable"
    );
    for (let i = 0; i < api.length; i++) {
      const path = api[i];
      const response = await context.request.get(config.origin + path, {
        ignoreHTTPSErrors: true
      });
      assert.equal(response.status(), i === 2 ? 404 : 200);
      const body = await response.json();
      if (i === 0) assert.equal(body.available, false);
      else if (i === 1) assert.deepEqual(body.items, []);
      else assert.ok(!JSON.stringify(body).includes(marker));
      assert.match(response.headers()["cache-control"] ?? "", /no-store/);
    }
    ok(
      action + " current API reads omit revoked private text and use no-store"
    );
    await context.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        results,
        errors,
        fixtureWritesOnly: true,
        realDeviceVerified: false
      },
      null,
      2
    )
  );
  console.log(
    JSON.stringify({ checks: results.length, errors: errors.length, output })
  );
} finally {
  await browser.close();
  await db.$disconnect();
}
