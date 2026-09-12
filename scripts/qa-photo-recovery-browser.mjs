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
const output = fixtureDir + "/photo-recovery-browser";
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
  const owner = await createPortalActor(db, "photorecovery");
  const other = await createPortalActor(db, "photoother");
  const bytes = await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#397186" } }).png().toBuffer();
  await uploadImage(db, owner.token, makeUpload(owner.id, "PROFILE_PHOTO", { audience: "MEMBERS" }), bytes);
  await signIn(owner);
  const profile = "/platform/profile/" + owner.username;
  await go(profile);
  await page.getByRole("link", { name: "Photos", exact: true }).click();
  const library = page.locator("#photos");
  await library.getByLabel("Choose photos", { exact: true }).setInputFiles({ name: "retained-selection.png", mimeType: "image/png", buffer: bytes });
  const row = library.getByRole("listitem", { name: "Upload retained-selection.png", exact: true });
  await row.getByLabel("Caption", { exact: true }).fill("Keep this selected file and caption");
  await page.evaluate(() => history.back());
  await page.getByText("Finish or remove your selected uploads before leaving. An interrupted upload may already be saved; retry it to check.", { exact: true }).waitFor();
  assert.ok(page.url().includes("tab=photos"));
  assert.equal(await row.getByLabel("Caption", { exact: true }).inputValue(), "Keep this selected file and caption");
  await library.getByRole("button", { name: "Open photo 1 on this page", exact: true }).click();
  const dialog = page.getByRole("dialog"); await dialog.getByRole("img").waitFor();
  await page.evaluate(() => history.back()); await dialog.waitFor({ state: "hidden" });
  assert.ok(page.url().includes("tab=photos"));
  assert.equal(await row.getByLabel("Caption", { exact: true }).inputValue(), "Keep this selected file and caption");
  await row.getByRole("button", { name: "Remove selected file", exact: true }).click();
  await pauseUntil(async () => !(await page.evaluate(() => !!history.state?.gcPhotoWork)), "remove pending navigation entry");
  await page.evaluate(() => history.back()); await page.waitForURL(config.origin + profile);
  ok("Browser Back and nested photo-viewer Back preserve a selected upload; explicit discard restores normal navigation");

  await page.getByRole("link", { name: "Photos", exact: true }).click();
  await library.getByLabel("Choose photos", { exact: true }).setInputFiles({ name: "account-change.png", mimeType: "image/png", buffer: bytes });
  await signIn(other); await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await library.getByText("Your sign-in changed. Reload before continuing.", { exact: true }).waitFor();
  assert.equal(await library.getByRole("listitem", { name: "Upload account-change.png", exact: true }).count(), 0);
  assert.equal(await db.mediaAsset.count({ where: { profileUserId: other.id } }), 0);
  ok("Foreground account replacement clears selected files without a write under the replacement identity");

  await signIn(owner); await go(profile + "?tab=photos");
  await library.getByLabel("Choose photos", { exact: true }).setInputFiles({ name: "uncertain-cancel.png", mimeType: "image/png", buffer: bytes });
  const cancelRow = library.getByRole("listitem", { name: "Upload uncertain-cancel.png", exact: true });
  await cancelRow.getByLabel("Caption", { exact: true }).fill("Canceled acknowledgement fixture");
  let committed = false, releaseReply; const held = new Promise(resolve => {releaseReply = resolve;}); const canceledBodies=[];
  await page.route("**/api/platform/images", async route => {
    if (route.request().method() !== "POST") return route.continue();
    canceledBodies.push(route.request().headers()["x-image-details"]);
    if(canceledBodies.length===1) { const response=await route.fetch(); assert.equal(response.status(),200); committed=true; await held; await route.fulfill({response}).catch(()=>{}); }
    else await route.continue();
  });
  await cancelRow.getByRole("button", { name: "Save photo", exact: true }).click();
  await pauseUntil(async()=>committed,"server commits before canceled acknowledgement");
  await cancelRow.getByRole("button", { name: "Stop upload", exact: true }).click();
  await cancelRow.getByRole("button", { name: "Retry same upload", exact: true }).waitFor();
  releaseReply();
  await cancelRow.getByRole("button", { name: "Retry same upload", exact: true }).click();
  await cancelRow.getByText("Photo saved.", { exact: true }).waitFor();
  assert.equal(canceledBodies.length,2);assert.equal(canceledBodies[0],canceledBodies[1]);
  assert.equal(await db.mediaAsset.count({where:{profileUserId:owner.id,caption:"Canceled acknowledgement fixture",status:"READY"}}),1);
  await page.unroute("**/api/platform/images");
  ok("Stopping an upload after server commit reports uncertainty and an exact retry reconciles the single saved asset");

  const post = await postCommand(db, owner.token, { operation: "create", requestKey: randomUUID(), content: "Reduced data gallery fixture" });
  for(let index=0; index<3; index++) await uploadImage(db, owner.token, makeUpload(post.id, "POST_PHOTO"), bytes);
  await signIn(owner); await go("/platform/settings/display/reading");
  await page.getByLabel("Reduce photo data", { exact: false }).check();
  await page.getByLabel("Post text size", { exact: true }).selectOption("largest");
  await page.getByLabel("Reduce motion", { exact: false }).check();
  await page.getByRole("button", { name: "Save display choices", exact: true }).click();
  await page.reload();
  assert.equal(await page.getByLabel("Reduce photo data", { exact: false }).isChecked(), true);
  requestImages.length=0;
  await go("/platform/posts/" + post.id);
  const photos=page.locator('[aria-label="Post photos"]');
  await photos.getByRole("button", { name: "Open photo 1 of 3", exact: true }).waitFor();
  await photos.scrollIntoViewIfNeeded(); await page.waitForLoadState("networkidle");
  assert.equal(await photos.locator("img").count(), 1);
  assert.equal(new Set(requestImages).size, 1); assert.ok(requestImages.every(path => path.endsWith("/thumb")));
  await photos.getByRole("button", { name: "Next photo", exact: true }).click();
  await photos.getByRole("button", { name: "Open photo 2 of 3", exact: true }).scrollIntoViewIfNeeded();
  await pauseUntil(async () => new Set(requestImages).size === 2, "second deliberately selected thumbnail enters viewport");
  assert.equal(new Set(requestImages).size, 2); assert.ok(requestImages.every(path => path.endsWith("/thumb")));
  await photos.getByRole("button", { name: "Open photo 2 of 3", exact: true }).click();
  await dialog.getByRole("img").waitFor(); await page.waitForLoadState("networkidle");
  assert.equal(requestImages.filter(path => path.endsWith("/large")).length, 1);
  assert.equal(requestImages.filter(path => path.endsWith("/original")).length, 0);
  await page.screenshot({path:output+"/reduced-data-viewer-390.png"});
  await dialog.getByRole("button", { name: "Close photo", exact: true }).click();
  await dialog.waitFor({state:"hidden"}); await bounded();
  await page.screenshot({path:output+"/reduced-data-post-390.png"});
  ok("Reduced-data settings persist with largest text and reduced motion, load one thumbnail per deliberate step and one large image only on open");
  await go("/platform/settings/display/reading");await page.getByLabel("Reduce photo data",{exact:false}).uncheck();
  await page.getByRole("button", { name: "Save display choices", exact: true }).click();
  requestImages.length=0;await go("/platform/posts/"+post.id);await photos.getByRole("button",{name:"Open photo 1 of 3",exact:true}).scrollIntoViewIfNeeded();
  await pauseUntil(async()=>new Set(requestImages).size>=3,"normal gallery thumbnail loading");
  assert.equal(await photos.locator("img").count(),3);assert.ok(requestImages.every(path=>/\/(thumb|medium)$/.test(path)));
  const firstImage=await db.mediaAsset.findFirstOrThrow({where:{postId:post.id,status:"READY"}});
  await db.platformPost.update({where:{id:post.id},data:{status:"WITHDRAWN",withdrawnAt:new Date()}});
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await photos.getByRole("button",{name:"Check photos",exact:true}).waitFor();assert.equal(await photos.locator("img").count(),0);
  const denied=await context.request.get(config.origin+"/api/platform/images/"+firstImage.id+"/large");assert.equal(denied.status(),404);
  await db.platformPost.update({where:{id:post.id},data:{status:"PUBLISHED",withdrawnAt:null}});
  await photos.getByRole("button",{name:"Check photos",exact:true}).click();await photos.getByRole("button",{name:"Open photo 1 of 3",exact:true}).waitFor();
  ok("Normal photo mode uses responsive previews without large/original requests; withdrawal conceals stale photos and explicit access retry recovers when the fixture is restored");
  assert.equal(errors.length, 0);
  writeFileSync(output + "/result.json", JSON.stringify({ passed: results.length, checks: results, errors, productionWrites: 0 }, null, 2));
} catch (error) {
  await page.screenshot({ path: output + "/failure.png", fullPage: true }).catch(() => {});
  writeFileSync(output + "/failure.txt", String(error?.stack ?? error));
  throw error;
} finally { await context.close(); await browser.close(); await db.$disconnect(); }
