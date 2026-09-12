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
const output = fixtureDir + "/photo-library-browser";
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
  PERSONAL_PHOTO_LIBRARY_ENABLED: "true",
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
const { postCommand } = await import("../lib/platform/post-commands.ts");
const { readPersonalPhotos } = await import("../lib/platform/personal-photos.ts");
const pauseUntil = async (predicate, label) => { const until = Date.now() + 20_000; while (Date.now() < until) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw Error("Timed out: " + label); };
const makeUpload = (targetId, purpose = "PROFILE_PHOTO", extra = {}) => ({ targetId, purpose, requestKey: randomUUID(), ...extra });
const requestImages = [];
page.on("request", request => { if (/\/api\/platform\/images\/[^/]+\/(thumb|medium|large|original)/.test(request.url())) requestImages.push(new URL(request.url()).pathname); });
try {
  const owner = await createPortalActor(db, "photolibrary"), viewer = await createPortalActor(db, "photovisitor");
  const bytes = await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#397186" } }).png().toBuffer();
  const avatar = await uploadImage(db, owner.token, makeUpload(owner.id, "PROFILE_AVATAR", { alt: "First profile fixture" }), bytes);
  await uploadImage(db, owner.token, makeUpload(owner.id, "PROFILE_AVATAR", { replacesId: avatar.id, alt: "Current profile fixture" }), bytes);
  const cover = await uploadImage(db, owner.token, makeUpload(owner.id, "PROFILE_COVER", { alt: "First cover fixture" }), bytes);
  await uploadImage(db, owner.token, makeUpload(owner.id, "PROFILE_COVER", { replacesId: cover.id, alt: "Current cover fixture" }), bytes);
  const direct = [];
  for (let index = 0; index < 25; index++) direct.push(await uploadImage(db, owner.token, makeUpload(owner.id, "PROFILE_PHOTO", { audience: index === 0 ? "ONLY_ME" : "MEMBERS", caption: "Library photo " + index, alt: "Teal landscape " + index }), bytes));
  const sourcePost = await postCommand(db, owner.token, { operation: "create", requestKey: randomUUID(), content: "Fictional personal post photo" });
  await uploadImage(db, owner.token, makeUpload(sourcePost.id, "POST_PHOTO", { caption: "Source photo fixture" }), bytes);
  const path = "/platform/profile/" + owner.username + "?tab=photos";
  await signIn(owner); await go(path);
  const library = page.locator("#photos");
  await library.getByRole("button", { name: "Open photo 24 on this page", exact: true }).waitFor();
  assert.equal(await library.locator("article").count(), 24);
  assert.ok((await library.innerText()).includes("30 photos available"));
  assert.ok(!requestImages.some(path => /\/(large|original)$/.test(path)), "No large/original is prefetched for profile/library previews");
  await bounded(); await page.screenshot({ path: output + "/library-390.png", fullPage: true });
  await library.getByRole("button", { name: "Open photo 24 on this page", exact: true }).click();
  const dialog = page.getByRole("dialog"); await dialog.getByRole("img").waitFor();
  assert.ok((await dialog.innerText()).includes("Photo 24 of 24"));
  await page.goBack(); await dialog.waitFor({ state: "hidden" });
  assert.equal(page.url(), config.origin + path);
  await library.getByRole("button", { name: "Next page", exact: true }).click();
  await pauseUntil(async () => await library.locator("article").count() === 6, "second photo page");
  await library.getByRole("button", { name: "Previous page", exact: true }).click();
  await pauseUntil(async () => await library.locator("article").count() === 24, "first photo page");
  for (const width of [320, 1440]) { await page.setViewportSize({ width, height: 1000 }); await bounded(); }
  await page.setViewportSize({ width: 390, height: 844 });
  ok("Profile Photos has 30 owner photos, 24-item pagination, responsive bounds and a working 24th-photo viewer/Back");

  await library.getByRole("button", { name: "Profile pictures", exact: true }).click();
  await pauseUntil(async () => await library.locator("article").count() === 2, "profile history");
  const oldAvatar = library.locator("article").filter({ has: page.getByRole("img", { name: "First profile fixture", exact: true }) });
  await oldAvatar.getByRole("button", { name: "Manage photo", exact: true }).click();
  const manager = page.getByRole("region", { name: "Manage selected photo" });
  await manager.getByRole("button", { name: "Use as current profile picture", exact: true }).click();
  await manager.waitFor({ state: "hidden" });
  assert.equal((await db.mediaAsset.findFirstOrThrow({ where: { profileUserId: owner.id, purpose: "PROFILE_AVATAR", status: "READY", isCurrent: true } })).id, avatar.id);
  await page.reload(); await library.getByRole("button", { name: "Profile pictures", exact: true }).click();
  await pauseUntil(async () => await library.locator("article").count() === 2, "history after reload");
  await signIn(viewer); await go(path);
  await library.getByRole("button", { name: "Open photo 1 on this page", exact: true }).waitFor();
  assert.ok((await library.innerText()).includes("29 photos available"));
  assert.equal(await library.getByRole("button", { name: "Manage photo", exact: true }).count(), 0);
  assert.equal(await library.getByLabel("Choose photos", { exact: true }).count(), 0);
  assert.ok(!await library.getByText("Library photo 0", { exact: true }).count());
  ok("Retained profile selection persists across reload and another member sees only permitted photos without owner controls");

  await signIn(owner); await go(path);
  await library.getByLabel("Choose photos", { exact: true }).waitFor();
  const beforePosts = await db.platformPost.count({ where: { authorId: owner.id } });
  await library.getByLabel("Audience for new uploads").selectOption("PUBLIC");
  await library.getByText("I understand people who are not signed in can view these photos.", { exact: true }).click();
  await library.getByText("Also create a post · open a private draft after saving photos", { exact: true }).click();
  await library.getByLabel("Choose photos", { exact: true }).setInputFiles([
    { name: "saved-landscape.png", mimeType: "image/png", buffer: bytes },
    { name: "invalid.png", mimeType: "image/png", buffer: Buffer.from("not an image") },
    { name: "oversized.png", mimeType: "image/png", buffer: Buffer.alloc(4 * 1024 * 1024 + 1) }
  ]);
  const uploadRow = library.getByRole("listitem", { name: "Upload saved-landscape.png", exact: true });
  await uploadRow.getByLabel("Caption", { exact: true }).fill("Browser saved landscape");
  await uploadRow.getByLabel("Image description for screen readers").fill("A teal landscape used for browser verification");
  assert.ok((await library.getByRole("listitem", { name: "Upload invalid.png" }).innerText()).includes("Other selected files are unchanged"));
  assert.ok((await library.getByRole("listitem", { name: "Upload oversized.png" }).innerText()).includes("Other selected files are unchanged"));
  await page.getByRole("link", { name: "Menu", exact: true }).first().click();
  assert.ok(page.url().includes("tab=photos"), "Unsaved file selections block navigation");
  let lose = true; const uploads = [];
  await page.route("**/api/platform/images", async route => {
    if (route.request().method() !== "POST") return route.continue();
    uploads.push(route.request().headers()["x-image-details"]);
    if (lose) { lose = false; const response = await route.fetch(); assert.equal(response.status(), 200); await route.abort("failed"); }
    else await route.continue();
  });
  await uploadRow.getByRole("button", { name: "Save photo", exact: true }).click();
  await uploadRow.getByRole("button", { name: "Retry same upload", exact: true }).waitFor();
  await uploadRow.getByRole("button", { name: "Retry same upload", exact: true }).click();
  await uploadRow.getByText("Photo saved.", { exact: true }).waitFor();
  assert.equal(uploads.length, 2); assert.equal(uploads[0], uploads[1]);
  await page.unroute("**/api/platform/images");
  for (const name of ["invalid.png", "oversized.png"]) await library.getByRole("listitem", { name: "Upload " + name, exact: true }).getByRole("button", { name: "Remove selected file", exact: true }).click();
  assert.equal(await db.mediaAsset.count({ where: { profileUserId: owner.id, caption: "Browser saved landscape", status: "READY" } }), 1);
  assert.equal(await db.platformPost.count({ where: { authorId: owner.id } }), beforePosts, "No empty placeholder post exists");
  await library.getByRole("button", { name: "Prepare post draft with saved photos", exact: true }).click();
  const openDraft = library.getByRole("link", { name: "Open photo draft in composer", exact: true }); await openDraft.waitFor();
  await openDraft.click();
  const composer = page.getByRole("form", { name: "Publish post", exact: true });
  await composer.getByText(/^Draft resumed\./).waitFor();
  await composer.locator("summary").filter({ hasText: /^Photos/ }).click();
  await composer.getByRole("region", { name: "Draft photos", exact: true }).getByRole("img").waitFor();
  await composer.getByLabel("Post content", { exact: true }).fill("A photo saved privately first, now deliberately published in this isolated fixture.");
  const publishButton = composer.getByRole("button", { name: "Post", exact: true });
  await publishButton.click();
  await pauseUntil(async () => await db.platformPost.count({ where: { authorId: owner.id } }) === beforePosts + 1, "photo draft publication");
  const published = await db.platformPost.findFirstOrThrow({ where: { authorId: owner.id, content: { startsWith: "A photo saved privately first" } } });
  assert.equal(await db.postPhotoReference.count({ where: { postId: published.id } }), 1);
  assert.equal(published.replyAudience, "VIEWERS");
  assert.equal(await db.mediaAsset.count({ where: { profileUserId: owner.id, caption: "Browser saved landscape", status: "READY" } }), 1);
  ok("Mixed-file upload preserves good selections, exact lost-response retry writes one asset, and explicit shared-composer handoff publishes one referenced post");

  // Keep the ten-attempt upload quota independent from the preceding retry test.
  const galleryOwner = await createPortalActor(db, "galleryfresh");
  await signIn(galleryOwner);
  const galleryPost = await postCommand(db, galleryOwner.token, { operation: "create", requestKey: randomUUID(), content: "Fictional browser gallery management" });
  await go("/platform/posts/" + galleryPost.id);
  await page.getByText("Manage photos", { exact: true }).click();
  const gallery = page.getByRole("region", { name: "Manage post photos", exact: true });
  await gallery.getByLabel("Choose photos", { exact: true }).waitFor();
  await gallery.getByLabel("Choose photos", { exact: true }).setInputFiles(Array.from({ length: 10 }, (_, index) => ({ name: `gallery-${index}.png`, mimeType: "image/png", buffer: bytes })));
  await gallery.getByRole("button", { name: "Save selected photos", exact: true }).click();
  await pauseUntil(async () => await gallery.getByText("Photo saved.", { exact: true }).count() === 10, "ten processed browser uploads");
  assert.equal(await db.mediaAsset.count({ where: { postId: galleryPost.id, status: "READY" } }), 10);
  await gallery.getByRole("listitem", { name: "Photo 1", exact: true }).getByRole("button", { name: "Move later", exact: true }).click();
  const intended = await gallery.locator("ol > li img").evaluateAll(images => images.map(image => image.getAttribute("src").split("/")[4]));
  await gallery.getByRole("button", { name: "Save photo order", exact: true }).click();
  await gallery.getByText("Gallery saved. Other unsaved caption edits remain here.", { exact: true }).waitFor();
  const persisted = await db.mediaAsset.findMany({ where: { postId: galleryPost.id, status: "READY" }, orderBy: [{ position: "asc" }, { id: "asc" }] });
  assert.deepEqual(persisted.map(row => row.id), intended);
  const firstPhoto = gallery.getByRole("listitem", { name: "Photo 1", exact: true });
  await firstPhoto.getByLabel("Caption", { exact: true }).fill("Saved gallery caption");
  await firstPhoto.getByLabel("Image description for screen readers").fill("A descriptive gallery image");
  await firstPhoto.getByRole("button", { name: "Save caption and description", exact: true }).click();
  await pauseUntil(async () => (await db.mediaAsset.findUniqueOrThrow({ where: { id: persisted[0].id } })).caption === "Saved gallery caption", "caption persistence");
  await page.reload(); await page.getByText("Manage photos", { exact: true }).click(); await gallery.getByRole("listitem", { name: "Photo 1", exact: true }).getByLabel("Caption", { exact: true }).waitFor();
  assert.equal(await gallery.getByRole("listitem", { name: "Photo 1", exact: true }).getByLabel("Caption", { exact: true }).inputValue(), "Saved gallery caption");
  await page.setViewportSize({ width: 320, height: 1000 }); await bounded(); await page.screenshot({ path: output + "/gallery-320.png", fullPage: true });
  ok("Ten published-post uploads, keyboard ordering and caption/alt changes persist through reload at phone width");

  assert.equal(errors.length, 0);
  writeFileSync(output + "/result.json", JSON.stringify({ passed: results.length, checks: results, errors, productionWrites: 0 }, null, 2));
} catch (error) {
  await page.screenshot({ path: output + "/failure.png", fullPage: true }).catch(() => {});
  writeFileSync(output + "/failure.txt", String(error?.stack ?? error));
  throw error;
} finally { await context.close(); await browser.close(); await db.$disconnect(); }
