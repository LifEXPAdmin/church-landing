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
const output = fixtureDir + "/album-disabled-browser";
mkdirSync(output, { recursive: true });
const go = async (path) => {
  await page.goto(config.origin + path);
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

process.env.PHOTO_ALBUMS_ENABLED = "true";
const { photoAlbumCommand, readPhotoAlbums } =
  await import("../lib/platform/photo-albums.ts");
const { personalPhotoCommand } =
  await import("../lib/platform/personal-photos.ts");
const pauseUntil = async (predicate, label) => {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Timed out: " + label);
};
async function ref(id) {
  const row = await db.personalPhoto.findUniqueOrThrow({
    where: { assetId: id },
    include: { asset: true }
  });
  return { id, photoVersion: row.version, imageVersion: row.asset.version };
}
async function serviceSave(token, id, ids, extra = {}) {
  const row = await db.photoAlbum.findUniqueOrThrow({ where: { id } });
  return photoAlbumCommand(db, token, {
    operation: "save",
    mutationId: randomUUID(),
    id,
    expectedVersion: row.version,
    name: row.name,
    audience: row.audience,
    audienceChurchId: row.audienceChurchId,
    coverAssetId: row.coverAssetId,
    photos: await Promise.all(ids.map(ref)),
    ...extra
  });
}
const albumSection = page.getByRole("region", {
  name: "Named photo albums",
  exact: true
});
const editor = page.getByRole("region", {
  name: "Edit photo album",
  exact: true
});
const large = [];
page.on("request", (r) => {
  if (/\/api\/platform\/images\/[^/]+\/(large|original)/.test(r.url()))
    large.push(r.url());
});
try {
  const owner = await createPortalActor(db, "albumsdisabledui");
  await signIn(owner);
  await go("/platform/profile/" + owner.username + "?tab=photos");
  await page
    .locator("#photos")
    .getByRole("button", { name: "All photos", exact: true })
    .waitFor();
  const response = await page.request.get(
    config.origin + "/api/platform/photos?profileId=" + owner.id
  );
  assert.equal(response.status(), 200);
  assert.equal((await response.json()).albumsAvailable, false);
  assert.equal(
    await page
      .getByRole("button", { name: "Open named albums", exact: true })
      .count(),
    0
  );
  await go("/platform/features");
  await page
    .getByRole("searchbox", { name: "Search features" })
    .fill("Named photo albums");
  await page
    .getByRole("heading", { name: "Named photo albums", exact: true })
    .waitFor();
  await page
    .getByText(
      "Named albums are currently unavailable. Existing photo permissions remain in effect.",
      { exact: true }
    )
    .waitFor();
  await bounded();
  assert.deepEqual(errors, []);
  ok(
    "Disabled album flag hides new controls and states availability honestly while core Photos remains active"
  );
  writeFileSync(
    output + "/results.json",
    JSON.stringify({ results, errors }, null, 2)
  );
} finally {
  await browser.close();
  await db.$disconnect();
}
