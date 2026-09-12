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
const output = fixtureDir + "/photo-editor-browser";
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
  const owner=await createPortalActor(db,"cropretention");
  const bytes=await sharp({create:{width:1200,height:900,channels:3,background:"#397186"}}).png().toBuffer();
  await signIn(owner); await go("/platform/profile/me");
  for(const [index,title,purpose] of [[0,"avatar","PROFILE_AVATAR"],[1,"cover","PROFILE_COVER"]]) {
    const input=page.locator("input[type=file]").nth(index);
    await input.setInputFiles({name:"first-crop.png",mimeType:"image/png",buffer:bytes});
    await page.getByRole("button",{name:"Save "+title,exact:true}).click();
    await page.getByRole("button",{name:"Remove "+title,exact:true}).waitFor();
    const first=await db.mediaAsset.findFirstOrThrow({where:{profileUserId:owner.id,purpose,status:"READY",isCurrent:true}});
    await input.setInputFiles({name:"canceled-crop.png",mimeType:"image/png",buffer:bytes});
    await page.getByRole("button",{name:"Discard selected photo",exact:true}).click();
    assert.equal((await db.mediaAsset.findFirstOrThrow({where:{profileUserId:owner.id,purpose,status:"READY",isCurrent:true}})).id,first.id);
    await input.setInputFiles({name:"second-crop.png",mimeType:"image/png",buffer:bytes});
    await page.getByRole("button",{name:"Save "+title,exact:true}).click();
    await pauseUntil(async()=>await db.mediaAsset.count({where:{profileUserId:owner.id,purpose,status:"READY"}})===2,"second retained crop");
    await page.getByText((title==="avatar"?"Avatar":"Cover photo")+" saved. Previous pictures remain in Photos.",{exact:true}).waitFor();
    assert.equal((await db.mediaAsset.findUniqueOrThrow({where:{id:first.id}})).isCurrent,false);
    await page.reload(); await page.getByRole("button",{name:"Remove "+title,exact:true}).waitFor();
  }
  await page.getByRole("button",{name:"Remove cover",exact:true}).click();
  await page.getByRole("button",{name:"Confirm remove cover",exact:true}).click();
  await page.getByText("Cover photo removed from current selection. The saved picture remains in Photos.",{exact:true}).waitFor();
  assert.equal(await db.mediaAsset.count({where:{profileUserId:owner.id,purpose:"PROFILE_COVER",status:"READY"}}),2);
  assert.equal(await db.mediaAsset.count({where:{profileUserId:owner.id,purpose:"PROFILE_COVER",status:"READY",isCurrent:true}}),0);
  await go("/platform/profile/me?tab=photos");
  assert.equal(new URL(page.url()).pathname,"/platform/profile/"+owner.username);
  await page.locator("#photos").getByRole("button",{name:"Open photo 4 on this page",exact:true}).waitFor();
  await page.screenshot({path:output+"/history-390.png"});
  ok("Existing crop editor retains both avatar and cover replacements, cancel preserves current, removal retains history, and the owner Photos shortcut resolves correctly");
  await go("/platform/features");
  await page.getByRole("searchbox",{name:"Search features"}).fill("photo");
  for(const title of ["Your photo library","Add and arrange post photos","View photos","Profile photos"]) await page.getByRole("heading",{name:title,exact:true}).waitFor();
  assert.equal(await page.getByText("The photo library is currently unavailable. Existing photo permissions remain in effect.",{exact:true}).count(),0);
  await page.setViewportSize({width:320,height:844});await bounded();await page.screenshot({path:output+"/features-320.png"});
  await go("/platform/releases/personal-photo-library"); await page.getByRole("heading",{name:"Version 2026.09.12.6",exact:true}).waitFor(); await bounded();
  const r=await context.request.get(config.origin+"/api/platform/release"); const release=await r.json();assert.equal(release.product.version,"2026.09.12.6");
  ok("New release and four photo guide entries are reachable and fit 320px; the serving release maps to version 2026.09.12.6");
  assert.equal(errors.length,0);writeFileSync(output+"/result.json",JSON.stringify({passed:results.length,checks:results,errors,productionWrites:0},null,2));
} catch(error) {await page.screenshot({path:output+"/failure.png",fullPage:true}).catch(()=>{});writeFileSync(output+"/failure.txt",String(error?.stack??error));throw error;}
finally {await context.close();await browser.close();await db.$disconnect();}
