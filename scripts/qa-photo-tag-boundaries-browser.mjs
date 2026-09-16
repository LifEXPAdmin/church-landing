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
  VERCEL: "",
  PUSH_ENABLED: "false",
  PERSONAL_PHOTO_LIBRARY_ENABLED: "true",
  MEDIA_STORAGE_MODE: "local-test",
  MEDIA_TEST_DIR: process.cwd() + "/" + fixtureDir + "/images",
  COMMUNITY_REPORTS_ENABLED: "true",
  RETENTION_TEST_DIR: process.cwd() + "/" + fixtureDir + "/retention"
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase } = await import("../tests/seed-portal.ts");
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
  timezoneId: "America/Chicago",
  hasTouch: true,
  viewport: { width: 390, height: 844 }
});
await context.grantPermissions([], { origin: config.origin });
const page = await context.newPage();
let phase = "initial";
const errors = [];
page.setDefaultTimeout(30000);
page.on("pageerror", (e) => {
  const issue = {
    phase,
    path: new URL(page.url()).pathname,
    message: e.message,
    stack: e.stack
  };
  errors.push(issue);
  console.log("BROWSER_ERROR", JSON.stringify(issue));
});
page.on("console", (message) => {
  if (["error", "warning"].includes(message.type()))
    console.log("BROWSER_CONSOLE", message.type(), message.text());
});
page.on("response", async (response) => {
  if (response.status() >= 400)
    console.log(
      "HTTP_ERROR",
      response.status(),
      new URL(response.url()).pathname
    );
});
const results = [];
const ok = (s) => {
  results.push(s);
  console.log("PASS " + s);
};
const output = fixtureDir + "/photo-tag-boundaries-browser-" + Date.now();
mkdirSync(output, { recursive: true });
const go = async (path) => {
  const response = await page.goto(config.origin + path);
  console.log("BROWSER_NAV", path, response?.status());
  await page.getByRole("heading", { level: 1 }).waitFor();
};
const bounded = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal page overflow"
  );

const { randomUUID } = await import("node:crypto");
const signIn = (actor) =>
  context.addCookies([
    {
      name: "church_platform_session",
      value: actor.token,
      url: config.origin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);

const { createPortalActor } = await import("../tests/seed-portal.ts");
const { uploadImage } = await import("../lib/platform/media.ts");
const { default: sharp } = await import("sharp");
const { photoTagCommand } = await import("../lib/platform/photo-tags.ts");
const { personalPhotoCommand } =
  await import("../lib/platform/personal-photos.ts");
const input = (owner, operation, fields) => ({
  ownerId: owner.id,
  operation,
  mutationId: randomUUID(),
  ...fields
});
try {
  const a = await createPortalActor(db, "uitagboundary"),
    b = await createPortalActor(db, "uitagreview"),
    c = await createPortalActor(db, "uitagother");
  const bytes = await sharp({
    create: { width: 160, height: 120, channels: 3, background: "blue" }
  })
    .png()
    .toBuffer();
  const image = await uploadImage(
    db,
    a.token,
    {
      purpose: "PROFILE_PHOTO",
      targetId: a.id,
      requestKey: randomUUID(),
      audience: "MEMBERS",
      caption: "Fictional private tag boundary photo"
    },
    bytes
  );
  const tag = await photoTagCommand(
    db,
    a.token,
    input(a, "request", {
      assetId: image.id,
      imageVersion: image.version,
      recipientId: b.id
    })
  );
  phase = "image-failure-recovery";
  await signIn(b);
  const imagePath = `**/api/platform/images/${image.id}/medium`;
  await page.route(imagePath, (route) => route.abort("failed"));
  await go(`/platform/photo-tags?tag=${tag.id}`);
  await page
    .getByText(
      "This photo could not load. Refresh to check its current availability.",
      { exact: true }
    )
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Approve tag", exact: true })
      .count(),
    0
  );
  await page.unroute(imagePath);
  await page
    .getByRole("button", { name: "Refresh photo tags", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Approve tag", exact: true })
    .waitFor();
  await page
    .locator('img[alt="Photo for tag review"]')
    .evaluate(async (img) => {
      await img.decode();
      if (!img.naturalWidth) throw Error("Photo not rendered");
    });
  ok(
    "An unavailable image conceals approval and current source details; explicit refresh restores the permitted photo without a write"
  );

  phase = "stale-photo-review";
  const photo = await db.personalPhoto.findUniqueOrThrow({
    where: { assetId: image.id }
  });
  await personalPhotoCommand(db, a.token, {
    operation: "metadata",
    mutationId: randomUUID(),
    imageId: image.id,
    expectedVersion: photo.version,
    imageVersion: image.version,
    caption: "Fictional changed photo before approval",
    alt: "Fictional changed photo"
  });
  const denied = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/platform/photo-tags" &&
      r.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Approve tag", exact: true }).click();
  assert.equal((await denied).status(), 409);
  await page
    .getByRole("button", { name: "Approve tag", exact: true })
    .waitFor({ state: "detached" });
  assert.equal(
    (await db.photoTag.findUniqueOrThrow({ where: { id: tag.id } })).state,
    "PENDING"
  );
  await page
    .getByRole("button", { name: "Refresh photo tags", exact: true })
    .click();
  await page
    .getByText("Fictional changed photo before approval", { exact: true })
    .waitFor();
  const declineBodies = [];
  let lost = false;
  await page.route("**/api/platform/photo-tags", async (route) => {
    const body = route.request().postData();
    if (!body || JSON.parse(body).operation !== "decline")
      return route.continue();
    declineBodies.push(body);
    const response = await route.fetch();
    if (!lost) {
      lost = true;
      return route.abort("failed");
    }
    return route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Decline tag", exact: true }).click();
  await page
    .getByRole("button", { name: "Retry photo tag change", exact: true })
    .click();
  await page
    .getByText("Photo tag declined. No association was published.", {
      exact: true
    })
    .waitFor();
  assert.equal(declineBodies.length, 2);
  assert.equal(declineBodies[0], declineBodies[1]);
  assert.equal(
    (await db.photoTag.findUniqueOrThrow({ where: { id: tag.id } })).state,
    "DECLINED"
  );
  assert.equal(
    (await db.mediaAsset.findUniqueOrThrow({ where: { id: image.id } })).status,
    "READY"
  );
  await page.unroute("**/api/platform/photo-tags");
  await signIn(c);
  await go(`/platform/photo-tags?profile=${b.id}`);
  await page
    .getByText("No approved tagged photos are visible on this page.", {
      exact: true
    })
    .waitFor();
  ok(
    "A real intervening photo edit rejects stale approval; an exact lost-response decline retry never publishes an association or deletes the photo"
  );

  phase = "in-flight-account-change";
  const currentImage = await db.mediaAsset.findUniqueOrThrow({
    where: { id: image.id }
  });
  const otherTag = await photoTagCommand(
    db,
    a.token,
    input(a, "request", {
      assetId: image.id,
      imageVersion: currentImage.version,
      recipientId: c.id
    })
  );
  await go(`/platform/photo-tags?tag=${otherTag.id}`);
  await page
    .getByRole("button", { name: "Approve tag", exact: true })
    .waitFor();
  const writes = [];
  page.on("request", (r) => {
    if (
      new URL(r.url()).pathname === "/api/platform/photo-tags" &&
      r.method() === "POST"
    )
      writes.push(r.postData());
  });
  let release,
    capture,
    intercepted = false;
  const captured = new Promise((resolve) => (capture = resolve));
  await page.route("**/api/platform/photo-tags?**", async (route) => {
    if (intercepted) return route.continue();
    intercepted = true;
    const response = await route.fetch();
    const body = await response.json();
    release = () => route.fulfill({ status: response.status(), json: body });
    capture();
  });
  await page
    .getByRole("button", { name: "Refresh photo tags", exact: true })
    .click();
  await captured;
  await page
    .getByText("Fictional changed photo before approval", { exact: true })
    .waitFor({ state: "detached" });
  await signIn(b);
  await release();
  await page.unroute("**/api/platform/photo-tags?**");
  await page
    .getByText("This photo tag is unavailable.", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Approve tag", exact: true })
      .count(),
    0
  );
  assert.equal(
    await page
      .getByText("Fictional changed photo before approval", { exact: true })
      .count(),
    0
  );
  assert.deepEqual(writes, []);
  ok(
    "An account change during a delayed private read discards the prior photo and approval controls without writing a decision"
  );
  await page.setViewportSize({ width: 320, height: 900 });
  await bounded();
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
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
    .screenshot({ path: output + "/failed.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failed.txt",
    String(error) + "\n" + (await page.locator("body").innerText())
  );
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
