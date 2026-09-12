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
const output = fixtureDir + "/photo-viewer-browser";
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

const { randomUUID } = await import("node:crypto");
const { createPortalActor } = await import("../tests/seed-portal.ts");
const { uploadImage, removeImage } = await import("../lib/platform/media.ts");
const sharp = (await import("sharp")).default;
Object.assign(process.env, {
  MEDIA_STORAGE_MODE: "local-test",
  MEDIA_TEST_DIR: process.cwd() + "/" + fixtureDir + "/images"
});
const signIn = async (actor) => {
  await context.clearCookies();
  await context.addCookies([
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
};
try {
  const owner = await createPortalActor(db, "photo_viewer"),
    viewer = await createPortalActor(db, "photo_reader");
  const bytes = await sharp({
    create: { width: 1500, height: 1100, channels: 3, background: "#397186" }
  })
    .png()
    .toBuffer();
  const avatar = await uploadImage(
    db,
    owner.token,
    {
      purpose: "PROFILE_AVATAR",
      targetId: owner.id,
      requestKey: randomUUID(),
      alt: "A teal test profile"
    },
    bytes
  );
  await uploadImage(
    db,
    owner.token,
    {
      purpose: "PROFILE_COVER",
      targetId: owner.id,
      requestKey: randomUUID(),
      alt: "A teal test cover"
    },
    bytes
  );
  await signIn(viewer);
  const requests = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/platform/images/"))
      requests.push(new URL(r.url()).pathname);
  });
  await go("/platform/profile/" + owner.username);
  const trigger = page.getByRole("button", {
    name: `Enlarge ${owner.name}’s profile photo`,
    exact: true
  });
  await trigger.waitFor();
  const profileUrl = page.url();
  assert.ok(!requests.some((x) => x.endsWith("/original")));
  const scroll = await page.evaluate(() => scrollY);
  await trigger.click();
  const sheet = page.getByRole("dialog", { name: "Photo viewer", exact: true });
  await sheet.getByText("Photo 1 of 1", { exact: true }).waitFor();
  const large = sheet.getByRole("img", {
    name: "A teal test profile",
    exact: true
  });
  await large.evaluate((img) =>
    img.complete && img.naturalWidth
      ? Promise.resolve()
      : new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        })
  );
  assert.ok((await large.getAttribute("src")).endsWith("/large"));
  await sheet.getByRole("button", { name: "Zoom in", exact: true }).click();
  assert.equal(await large.evaluate((img) => img.style.width), "200%");
  await sheet.getByRole("button", { name: "Fit photo", exact: true }).click();
  await page.keyboard.press("Escape");
  await sheet.waitFor({ state: "detached" });
  assert.equal(page.url(), profileUrl);
  assert.equal(await page.evaluate(() => scrollY), scroll);
  assert.ok(await trigger.evaluate((el) => el === document.activeElement));
  await trigger.click();
  await sheet.getByText("Photo 1 of 1", { exact: true }).waitFor();
  await page.goBack();
  await sheet.waitFor({ state: "detached" });
  assert.equal(page.url(), profileUrl);
  ok(
    "Profile avatar opens sharp permitted image; zoom, Escape and Back preserve route, scroll and focus"
  );
  await page
    .getByRole("button", {
      name: `Enlarge ${owner.name}’s cover photo`,
      exact: true
    })
    .click();
  await sheet
    .getByRole("img", { name: "A teal test cover", exact: true })
    .waitFor();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await bounded();
  }
  await page.screenshot({ path: output + "/cover-1440.png" });
  await sheet.getByRole("button", { name: "Close photo", exact: true }).click();
  await sheet.waitFor({ state: "detached" });
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await sheet
    .getByRole("img", { name: "A teal test profile", exact: true })
    .waitFor();
  await removeImage(db, owner.token, avatar.id, avatar.version);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await sheet
    .getByText("This photo is no longer available.", { exact: true })
    .waitFor();
  assert.equal(await sheet.getByRole("img").count(), 0);
  await page.keyboard.press("Escape");
  await sheet.waitFor({ state: "detached" });
  ok(
    "Cover is enlargeable at phone and desktop widths; withdrawn image disappears on current-access refresh"
  );
  const post = await db.platformPost.create({
    data: {
      authorId: owner.id,
      content: "Photo gallery verification",
      publishedAt: new Date()
    }
  });
  const photos = [];
  for (let i = 0; i < 10; i++)
    photos.push(
      await uploadImage(
        db,
        owner.token,
        {
          purpose: "POST_PHOTO",
          targetId: post.id,
          requestKey: randomUUID(),
          caption: i === 0 ? "Long caption ".repeat(35) : `Caption ${i + 1}`,
          alt: `Gallery image ${i + 1}`
        },
        bytes
      )
    );
  requests.length = 0;
  await go("/platform/posts/" + post.id);
  const photo = page.getByRole("button", {
    name: "Open photo 1 of 10",
    exact: true
  });
  await photo.waitFor();
  assert.ok(
    !requests.some((x) => x.endsWith("/large") || x.endsWith("/original"))
  );
  await photo.click();
  await sheet.getByText("Photo 1 of 10", { exact: true }).waitFor();
  await sheet.getByRole("button", { name: "Next photo", exact: true }).click();
  await sheet
    .getByRole("img", { name: "Gallery image 2", exact: true })
    .waitFor();
  await page.keyboard.press("ArrowRight");
  await sheet.getByText("Photo 3 of 10", { exact: true }).waitFor();
  await page.keyboard.press("ArrowLeft");
  await sheet.getByText("Photo 2 of 10", { exact: true }).waitFor();
  await sheet
    .getByRole("button", { name: "Previous photo", exact: true })
    .click();
  await sheet
    .getByText("Long caption ".repeat(35).trim(), { exact: true })
    .waitFor();
  await bounded();
  await page.screenshot({ path: output + "/gallery-390.png" });
  assert.ok(!requests.some((x) => x.endsWith("/original")));
  assert.ok(new Set(requests.filter((x) => x.endsWith("/large"))).size <= 3);
  ok(
    "Ten-photo gallery preserves order, captions, keyboard navigation and bounded layout; only opened photos request large variants"
  );
  await db.platformPost.update({
    where: { id: post.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await sheet
    .getByText("This photo is unavailable. Reconnect to check again.", {
      exact: true
    })
    .waitFor();
  assert.equal(await sheet.getByRole("img").count(), 0);
  await page.keyboard.press("Escape");
  await sheet.waitFor({ state: "detached" });
  const one = await db.platformPost.create({
    data: {
      authorId: owner.id,
      content: "Single photo verification",
      publishedAt: new Date()
    }
  });
  await uploadImage(
    db,
    owner.token,
    {
      purpose: "POST_PHOTO",
      targetId: one.id,
      requestKey: randomUUID(),
      alt: "Single readable image"
    },
    bytes
  );
  await go("/platform/posts/" + one.id);
  await page
    .getByRole("button", { name: "Open photo 1 of 1", exact: true })
    .click();
  await sheet.getByText("Photo 1 of 1", { exact: true }).waitFor();
  assert.equal(
    await sheet
      .getByRole("button", { name: "Next photo", exact: true })
      .count(),
    0
  );
  await signIn(owner);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await sheet
    .getByText("This photo is unavailable. Reconnect to check again.", {
      exact: true
    })
    .waitFor();
  assert.equal(await sheet.getByRole("img").count(), 0);
  ok(
    "Source withdrawal and account switching conceal open photos; single-photo gallery omits next/previous controls"
  );
  await page.keyboard.press("Escape");
  await sheet.waitFor({ state: "detached" });
  await uploadImage(
    db,
    owner.token,
    {
      purpose: "POST_PHOTO",
      targetId: one.id,
      requestKey: randomUUID(),
      alt: "Second feed image"
    },
    bytes
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await go("/platform?post=" + one.id + "&mode=pages");
  const feedUrl = page.url();
  const feedPost = page.locator(`[data-post="${one.id}"]`);
  await feedPost
    .getByRole("button", { name: "Open photo 1 of 2", exact: true })
    .click();
  await sheet.getByText("Photo 1 of 2", { exact: true }).waitFor();
  await sheet.locator(".gc-photo-viewport").evaluate((el) => {
    const touch = (x) =>
      new Touch({ identifier: 1, target: el, clientX: x, clientY: 150 });
    el.dispatchEvent(
      new TouchEvent("touchstart", {
        bubbles: true,
        touches: [touch(260)],
        changedTouches: [touch(260)]
      })
    );
    el.dispatchEvent(
      new TouchEvent("touchend", {
        bubbles: true,
        touches: [],
        changedTouches: [touch(90)]
      })
    );
  });
  await sheet.getByText("Photo 2 of 2", { exact: true }).waitFor();
  assert.equal(page.url(), feedUrl);
  assert.equal(await feedPost.getAttribute("hidden"), null);
  await page.keyboard.press("Escape");
  await sheet.waitFor({ state: "detached" });
  assert.equal(page.url(), feedUrl);
  ok(
    "Reduced-motion nested gallery swipe changes only the photo, preserving the Bible-feed post and return position"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/receipt.json",
    JSON.stringify(
      {
        results,
        pageErrors: errors,
        productionWrites: 0,
        physicalDeviceAcceptance: false
      },
      null,
      2
    )
  );
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
