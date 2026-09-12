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
const output = fixtureDir + "/photo-gallery-browser";
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
  const bytes = await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#397186" } }).png().toBuffer();
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


  const { readPostGallery, postGalleryCommand } = await import("../lib/platform/post-gallery.ts");
  const imageId = persisted[0].id;
  const local = gallery.getByRole("listitem", { name: "Photo 1", exact: true });
  await local.getByLabel("Caption", { exact: true }).fill("Kept local caption after conflict");
  const remote = await readPostGallery(db, galleryOwner.token, galleryPost.id);
  await postGalleryCommand(db, galleryOwner.token, { operation: "metadata", mutationId: randomUUID(), postId: galleryPost.id, expectedVersion: remote.postVersion, imageId, imageVersion: remote.images[0].version, caption: "Other tab caption", alt: "Remote description" });
  await local.getByRole("button", { name: "Save caption and description", exact: true }).click();
  await gallery.getByRole("button", { name: "Retry exact gallery change", exact: true }).waitFor();
  assert.equal(await local.getByLabel("Caption", { exact: true }).inputValue(), "Kept local caption after conflict");
  await gallery.getByRole("button", { name: "Review latest gallery", exact: true }).click();
  await gallery.getByRole("button", { name: "Keep my edits against latest", exact: true }).click();
  assert.equal(await local.getByLabel("Caption", { exact: true }).inputValue(), "Kept local caption after conflict");
  await local.getByRole("button", { name: "Save caption and description", exact: true }).click();
  await pauseUntil(async () => (await db.mediaAsset.findUniqueOrThrow({ where: { id: imageId } })).caption === "Kept local caption after conflict", "conflict recovery");
  await gallery.getByText("Gallery saved. Other unsaved caption edits remain here.", { exact: true }).waitFor();
  await local.getByLabel("Image description for screen readers").fill("Exact retry description");
  let lose = true; const requests = [];
  await page.route("**/api/platform/gallery?*", async route => {
    if (route.request().method() !== "POST") return route.continue();
    requests.push(route.request().postData());
    if (lose) { lose = false; const response = await route.fetch(); assert.equal(response.status(), 200); await route.abort("failed"); }
    else await route.continue();
  });
  const version = (await db.platformPost.findUniqueOrThrow({ where: { id: galleryPost.id } })).version;
  await local.getByRole("button", { name: "Save caption and description", exact: true }).click();
  await gallery.getByRole("button", { name: "Retry exact gallery change", exact: true }).click();
  await gallery.getByText("Gallery saved. Other unsaved caption edits remain here.", { exact: true }).waitFor();
  assert.equal(requests.length, 2); assert.equal(requests[0], requests[1]);
  assert.equal((await db.platformPost.findUniqueOrThrow({ where: { id: galleryPost.id } })).version, version + 1);
  await page.unroute("**/api/platform/gallery?*");
  ok("Two-tab metadata conflicts preserve local text and a lost acknowledgement retries the exact body without a second version increment");
  assert.equal(errors.length, 0);
  writeFileSync(output + "/result.json", JSON.stringify({ passed: results.length, checks: results, errors, productionWrites: 0 }, null, 2));
} catch (error) {
  await page.screenshot({ path: output + "/failure.png", fullPage: true }).catch(() => {});
  writeFileSync(output + "/failure.txt", String(error?.stack ?? error));
  throw error;
} finally { await context.close(); await browser.close(); await db.$disconnect(); }
