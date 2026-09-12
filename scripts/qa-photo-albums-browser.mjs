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
const output = fixtureDir + "/album-browser";
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
  const owner = await createPortalActor(db, "albumuiowner"),
    reader = await createPortalActor(db, "albumuireader");
  const data = await sharp({
    create: { width: 240, height: 180, channels: 3, background: "#476f82" }
  })
    .png()
    .toBuffer();
  const photos = [];
  for (const [audience, alt] of [
    ["MEMBERS", "Member blue photo"],
    ["ONLY_ME", "Private blue photo"],
    ["PUBLIC", "Public blue photo"]
  ])
    photos.push(
      await uploadImage(
        db,
        owner.token,
        {
          purpose: "PROFILE_PHOTO",
          targetId: owner.id,
          requestKey: randomUUID(),
          audience,
          alt
        },
        data
      )
    );
  const path = "/platform/profile/" + owner.username + "?tab=photos";
  const open = async () => {
    await albumSection
      .getByRole("button", { name: "Open named albums", exact: true })
      .click();
    await albumSection.getByText(/albums? available/).waitFor();
  };
  await signIn(owner);
  await go(path);
  await open();
  await albumSection
    .getByRole("button", { name: "New album", exact: true })
    .click();
  await editor.getByLabel("Album name", { exact: true }).fill("A small album");
  await editor
    .getByRole("combobox", { name: /Album audience/ })
    .selectOption("MEMBERS");
  await editor
    .getByRole("button", { name: "Create album", exact: true })
    .click();
  await albumSection
    .getByRole("button", { name: "Edit album", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Choose saved photos", exact: true })
    .click();
  const picker = editor.getByRole("region", {
    name: "Choose album photos",
    exact: true
  });
  for (const alt of [
    "Member blue photo",
    "Private blue photo",
    "Public blue photo"
  ])
    await picker
      .getByRole("img", { name: alt, exact: true })
      .locator("..")
      .click();
  await picker
    .getByRole("button", { name: "Close photo picker", exact: true })
    .click();
  await editor.getByLabel("Use photo 2 as cover", { exact: true }).check();
  await editor
    .getByRole("button", { name: "Move photo 3 earlier", exact: true })
    .click();
  await editor.getByRole("button", { name: "Save album", exact: true }).click();
  await albumSection
    .getByText("3 photos shared with you", { exact: false })
    .waitFor();
  let album = await db.photoAlbum.findFirstOrThrow({
    where: { ownerId: owner.id },
    include: { entries: { orderBy: { position: "asc" } } }
  });
  assert.deepEqual(
    album.entries.map((e) => e.assetId),
    [photos[0].id, photos[2].id, photos[1].id]
  );
  assert.equal(album.coverAssetId, photos[1].id);
  assert.equal(album.version, 2);
  assert.equal(
    await db.mediaAsset.count({ where: { profileUserId: owner.id } }),
    3
  );
  assert.equal(
    large.length,
    0,
    "Album/picker thumbnails never prefetch originals or large images"
  );
  await bounded();
  await page.screenshot({ path: output + "/owned-390.png", fullPage: true });
  await albumSection
    .getByRole("button", {
      name: "Open album photo 1 on this page",
      exact: true
    })
    .click();
  await page.getByRole("dialog").getByRole("img").waitFor();
  await page.getByRole("button", { name: "Close photo", exact: true }).click();
  await albumSection
    .getByRole("button", { name: "Edit album", exact: true })
    .waitFor();
  ok(
    "Create, choose owned references, cover, reorder, save and shared viewer work at 390px without another upload or eager full-size reads"
  );

  await albumSection
    .getByRole("button", { name: "Edit album", exact: true })
    .click();
  await editor
    .getByLabel("Album name", { exact: true })
    .fill("Recovered album");
  const bodies = [];
  let lose = true;
  await page.route("**/api/platform/photo-albums", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    bodies.push(route.request().postData());
    const response = await route.fetch();
    if (lose) {
      lose = false;
      await route.abort("failed");
    } else await route.fulfill({ response });
  });
  await editor.getByRole("button", { name: "Save album", exact: true }).click();
  await editor
    .getByRole("button", { name: "Retry unchanged album save", exact: true })
    .waitFor();
  await editor
    .getByRole("button", { name: "Retry unchanged album save", exact: true })
    .click();
  await albumSection
    .getByRole("heading", { name: "Recovered album", exact: true })
    .waitFor();
  await page.unroute("**/api/platform/photo-albums");
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  assert.equal(
    (await db.photoAlbum.findUniqueOrThrow({ where: { id: album.id } }))
      .version,
    3
  );
  await albumSection
    .getByRole("button", { name: "Edit album", exact: true })
    .click();
  await editor
    .getByLabel("Album name", { exact: true })
    .fill("My kept album name");
  await serviceSave(
    owner.token,
    album.id,
    album.entries.map((e) => e.assetId),
    { name: "Another tab's album name" }
  );
  await editor.getByRole("button", { name: "Save album", exact: true }).click();
  await editor
    .getByRole("button", { name: "Review latest saved album", exact: true })
    .click();
  await editor.getByText(/Latest saved: Another tab/).waitFor();
  assert.equal(
    await editor.getByLabel("Album name", { exact: true }).inputValue(),
    "My kept album name"
  );
  await editor
    .getByRole("button", { name: "Keep my album edits", exact: true })
    .click();
  await editor.getByRole("button", { name: "Save album", exact: true }).click();
  await albumSection
    .getByRole("heading", { name: "My kept album name", exact: true })
    .waitFor();
  assert.equal(
    (await db.photoAlbum.findUniqueOrThrow({ where: { id: album.id } }))
      .version,
    5
  );
  ok(
    "Lost acknowledgement retries an identical snapshot once; conflict review shows current state and explicitly preserves/rebases local edits"
  );

  await albumSection
    .getByRole("button", { name: "Edit album", exact: true })
    .click();
  await editor
    .getByLabel("Album name", { exact: true })
    .fill("Unsent album name");
  const before = page.url();
  await page.goBack();
  await editor
    .getByText("Save or discard your album changes before leaving.", {
      exact: true
    })
    .waitFor();
  assert.equal(page.url(), before);
  assert.equal(
    await editor.getByLabel("Album name", { exact: true }).inputValue(),
    "Unsent album name"
  );
  await signIn(reader);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await pauseUntil(
    async () =>
      (await page.locator('input[value="Unsent album name"]').count()) === 0,
    "Changed account clears album editor"
  );
  assert.equal(
    await page.locator('input[value="Unsent album name"]').count(),
    0
  );
  await go(path);
  await open();
  await albumSection
    .getByRole("button", { name: /My kept album name/ })
    .click();
  await albumSection
    .getByText("2 photos shared with you", { exact: false })
    .waitFor();
  assert.equal(
    await albumSection
      .getByRole("button", { name: "Edit album", exact: true })
      .count(),
    0
  );
  assert.equal(
    await albumSection
      .getByRole("button", { name: /Open album photo/ })
      .count(),
    2
  );
  const projection = await page.request.get(
    config.origin +
      "/api/platform/photo-albums?profileId=" +
      owner.id +
      "&id=" +
      album.id
  );
  assert.equal(projection.status(), 200);
  assert.ok(!JSON.stringify(await projection.json()).includes(photos[1].id));
  await albumSection
    .getByRole("button", {
      name: "Open album photo 2 on this page",
      exact: true
    })
    .click();
  await page.getByRole("dialog").getByRole("img").waitFor();
  const r = await ref(photos[2].id);
  await personalPhotoCommand(db, owner.token, {
    operation: "audience",
    mutationId: randomUUID(),
    imageId: r.id,
    expectedVersion: r.photoVersion,
    imageVersion: r.imageVersion,
    audience: "ONLY_ME"
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByRole("dialog")
    .getByText("This photo is no longer available.", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Close photo", exact: true }).click();
  await albumSection
    .getByText("1 photo shared with you", { exact: false })
    .waitFor();
  await serviceSave(
    owner.token,
    album.id,
    album.entries.map((e) => e.assetId),
    { audience: "ONLY_ME" }
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await albumSection
    .getByText("This album is unavailable.", { exact: true })
    .waitFor();
  assert.equal(
    await albumSection
      .getByRole("button", { name: /Open album photo/ })
      .count(),
    0
  );
  ok(
    "Back protects unsaved edits; account switching clears stale work; member counts/cover/viewer narrow with source and album privacy"
  );

  await signIn(owner);
  await go(path);
  await open();
  await albumSection
    .getByRole("button", { name: /My kept album name/ })
    .click();
  await albumSection
    .getByRole("button", { name: "Edit album", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Remove photo 2 from album", exact: true })
    .click();
  await editor.getByRole("button", { name: "Save album", exact: true }).click();
  await albumSection
    .getByText("2 photos shared with you", { exact: false })
    .waitFor();
  assert.equal(
    await db.mediaAsset.count({
      where: { profileUserId: owner.id, status: "READY" }
    }),
    3
  );
  await albumSection
    .getByRole("button", { name: "Edit album", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Delete album", exact: true })
    .click();
  await editor
    .getByText(
      "Delete this album? Its photos stay in your library and source posts.",
      { exact: true }
    )
    .waitFor();
  await editor
    .getByRole("button", { name: "Confirm delete album", exact: true })
    .click();
  await albumSection
    .getByText("0 albums available", { exact: false })
    .waitFor();
  assert.equal(await db.photoAlbum.count({ where: { ownerId: owner.id } }), 0);
  assert.equal(
    await db.mediaAsset.count({
      where: { profileUserId: owner.id, status: "READY" }
    }),
    3
  );
  await page.setViewportSize({ width: 320, height: 844 });
  await bounded();
  await page.screenshot({ path: output + "/empty-320.png", fullPage: true });
  ok(
    "Remove reference and explicit album deletion retain all underlying saved photos; empty and editing layouts fit 320px"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      { results, pageErrors: errors, productionWrites: 0 },
      null,
      2
    )
  );
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(output + "/failure.txt", String(error?.stack ?? error));
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
