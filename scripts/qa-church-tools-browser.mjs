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
const output = fixtureDir + "/church-tools-browser";
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
const { uploadImage, readImage } = await import("../lib/platform/media.ts");
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
const { readPersonalPhotos } =
  await import("../lib/platform/personal-photos.ts");
const pauseUntil = async (predicate, label) => {
  const until = Date.now() + 20_000;
  while (Date.now() < until) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error("Timed out: " + label);
};
const makeUpload = (targetId, purpose = "PROFILE_PHOTO", extra = {}) => ({
  targetId,
  purpose,
  requestKey: randomUUID(),
  ...extra
});
const requestImages = [];
page.on("request", (request) => {
  if (
    /\/api\/platform\/images\/[^/]+\/(thumb|medium|large|original)/.test(
      request.url()
    )
  )
    requestImages.push(new URL(request.url()).pathname);
});

const { seedManagedChurch } =
  await import("../tests/seed-church-management.ts");
try {
  const manager = await createPortalActor(db, "churchbrowser");
  const { church, claim, connection } = await seedManagedChurch(db, manager);
  const member = await createPortalActor(db, "churchmemberui");
  await db.churchConnection.create({
    data: { churchId: church.id, userId: member.id, state: "APPROVED" }
  });
  const root = "/platform/churches/" + church.id;
  const bytes = await sharp({
    create: { width: 1200, height: 900, channels: 3, background: "#397186" }
  })
    .png()
    .toBuffer();
  const file = {
    name: "church-image.png",
    mimeType: "image/png",
    buffer: bytes
  };
  await signIn(manager);
  await go(root);
  const manage = page.getByRole("navigation", {
    name: "Manage church",
    exact: true
  });
  await manage.waitFor();
  for (const [label, href] of [
    ["Profile", "/platform/church-claims/" + claim.id + "#church-profile"],
    ["Logo and cover", root + "#church-photos"],
    ["Team / organization", root + "/structure"],
    ["Roles", root + "/structure/roles"],
    ["Privileges", root + "/structure/assign"],
    ["Chart history and undo", root + "/structure/history"]
  ])
    assert.equal(
      await manage
        .getByRole("link", { name: label, exact: true })
        .getAttribute("href"),
      href
    );
  await bounded();
  await page
    .getByRole("button", { name: "Edit church logo and cover", exact: true })
    .click();
  const identity = page.getByRole("region", { name: "Church identity photos" });
  for (const [index, label, purpose] of [
    [0, "logo", "CHURCH_LOGO"],
    [1, "cover", "CHURCH_COVER"]
  ]) {
    await identity.locator("input[type=file]").nth(index).setInputFiles(file);
    await identity
      .getByRole("button", { name: "Save " + label, exact: true })
      .click();
    await identity
      .getByRole("button", { name: "Remove " + label, exact: true })
      .waitFor();
    const first = await db.mediaAsset.findFirstOrThrow({
      where: { churchId: church.id, purpose, status: "READY" }
    });
    const meta = await sharp(
      await readImage(db, manager.token, first.id, "medium")
    ).metadata();
    assert.ok(
      Math.abs(meta.width - meta.height * (label === "logo" ? 1 : 3)) <= 2,
      "Crop aspect allows integer-pixel rounding"
    );
    await identity.locator("input[type=file]").nth(index).setInputFiles(file);
    await identity
      .getByRole("button", { name: "Discard selected photo", exact: true })
      .click();
    assert.equal(
      (
        await db.mediaAsset.findFirstOrThrow({
          where: { churchId: church.id, purpose, status: "READY" }
        })
      ).id,
      first.id
    );
    await identity
      .getByRole("button", { name: "Adjust " + label + " crop", exact: true })
      .click();
    await identity
      .getByRole("button", { name: "Save " + label, exact: true })
      .click();
    await identity
      .getByRole("button", { name: "Remove " + label, exact: true })
      .waitFor();
    const next = await db.mediaAsset.findFirstOrThrow({
      where: { churchId: church.id, purpose, status: "READY" }
    });
    assert.notEqual(next.id, first.id);
    assert.equal(
      await db.personalPhoto.count({ where: { assetId: next.id } }),
      0,
      "Church identity does not enter uploader's personal library"
    );
  }
  await bounded();
  await page.screenshot({ path: output + "/manager-390.png", fullPage: true });
  await go(root);
  await page
    .getByRole("button", {
      name: "Enlarge " + church.name + "’s church logo",
      exact: true
    })
    .click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Close photo", exact: true }).click();
  ok(
    "Current manager reaches existing profile/team/role/privilege tools; logo/cover crop, replacement, cancel, dimensions and viewer work on mobile"
  );

  await page
    .getByRole("button", { name: "Edit church logo and cover", exact: true })
    .click();
  const before = await db.mediaAsset.findFirstOrThrow({
    where: { churchId: church.id, purpose: "CHURCH_LOGO", status: "READY" }
  });
  await identity.locator("input[type=file]").first().setInputFiles(file);
  const requests = [];
  let lose = true;
  await page.route("**/api/platform/images", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    requests.push({
      header: route.request().headers()["x-image-details"],
      body: route.request().postDataBuffer().toString("base64")
    });
    const response = await route.fetch();
    if (lose) {
      lose = false;
      await route.abort("failed");
    } else await route.fulfill({ response });
  });
  await identity
    .getByRole("button", { name: "Save logo", exact: true })
    .click();
  await identity
    .getByText("The connection stopped before the save was confirmed.", {
      exact: false
    })
    .waitFor();
  await identity
    .getByRole("button", { name: "Save logo", exact: true })
    .click();
  await identity
    .getByRole("button", { name: "Remove logo", exact: true })
    .waitFor();
  await page.unroute("**/api/platform/images");
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0], requests[1]);
  const saved = await db.mediaAsset.findFirstOrThrow({
    where: { churchId: church.id, purpose: "CHURCH_LOGO", status: "READY" }
  });
  assert.notEqual(saved.id, before.id);
  assert.equal(
    await db.mediaAsset.count({
      where: { churchId: church.id, purpose: "CHURCH_LOGO", status: "READY" }
    }),
    1
  );
  await identity.locator("input[type=file]").first().setInputFiles(file);
  const newer = await uploadImage(
    db,
    manager.token,
    {
      purpose: "CHURCH_LOGO",
      targetId: church.id,
      requestKey: randomUUID(),
      replacesId: saved.id
    },
    bytes
  );
  await identity
    .getByRole("button", { name: "Save logo", exact: true })
    .click();
  await identity
    .getByRole("button", { name: "Review latest saved logo", exact: true })
    .waitFor();
  await identity
    .getByRole("button", { name: "Review latest saved logo", exact: true })
    .click();
  await identity
    .getByRole("button", { name: "Save logo", exact: true })
    .click();
  await identity
    .getByRole("button", { name: "Remove logo", exact: true })
    .waitFor();
  assert.notEqual(
    (
      await db.mediaAsset.findFirstOrThrow({
        where: { churchId: church.id, purpose: "CHURCH_LOGO", status: "READY" }
      })
    ).id,
    newer.id
  );
  await identity
    .getByRole("button", { name: "Remove cover", exact: true })
    .click();
  await identity
    .getByRole("button", { name: "Confirm remove cover", exact: true })
    .click();
  await pauseUntil(
    async () =>
      (await db.mediaAsset.count({
        where: { churchId: church.id, purpose: "CHURCH_COVER", status: "READY" }
      })) === 0,
    "cover removed"
  );
  ok(
    "Lost-response retry sends the same bytes/key, remains one current image, and conflict review preserves edits; removal clears current cover"
  );

  await signIn(member);
  await go(root);
  assert.equal(
    await page
      .getByRole("navigation", { name: "Manage church", exact: true })
      .count(),
    0
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Edit church logo and cover", exact: true })
      .count(),
    0
  );
  assert.ok(
    await page
      .getByRole("link", { name: "My responsibilities", exact: true })
      .count()
  );
  await signIn(manager);
  await go(root);
  await page
    .getByRole("button", { name: "Edit church logo and cover", exact: true })
    .click();
  await identity.locator("input[type=file]").first().setInputFiles(file);
  await db.churchConnection.update({
    where: { id: connection.id },
    data: { state: "REMOVED" }
  });
  await identity
    .getByRole("button", { name: "Save logo", exact: true })
    .click();
  await identity
    .getByText("You cannot change images here.", { exact: false })
    .waitFor();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByText(
      "Church photo management access changed. Selected files were cleared.",
      { exact: true }
    )
    .waitFor();
  assert.equal(
    await page
      .getByRole("navigation", { name: "Manage church", exact: true })
      .count(),
    0
  );
  assert.equal(await identity.locator("input[type=file]").count(), 0);
  ok(
    "Ordinary members have no image editing; a manager revoked while editing cannot save and foreground refresh clears selected files/tools"
  );

  const contributor = await createPortalActor(db, "contributorui");
  await db.churchListingSubmission.create({
    data: {
      ownerId: contributor.id,
      churchId: church.id,
      requestKey: randomUUID(),
      kind: "COMMUNITY",
      status: "PUBLISHED",
      data: {}
    }
  });
  const pending = await db.churchClaim.create({
    data: {
      ownerId: contributor.id,
      churchId: church.id,
      requestKey: randomUUID(),
      kind: "INITIAL",
      status: "SUBMITTED",
      profile: {},
      authority: { contact: "private-authority-marker" }
    }
  });
  await signIn(contributor);
  await go(root);
  await page.getByText("Pending review", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("link", {
        name: "Open your representative request",
        exact: true
      })
      .getAttribute("href"),
    "/platform/church-claims/" + pending.id
  );
  assert.equal(
    await page
      .getByRole("navigation", { name: "Manage church", exact: true })
      .count(),
    0
  );
  assert.doesNotMatch(
    await page.locator("body").innerText(),
    /private-authority-marker/
  );
  await bounded();
  await context.clearCookies();
  await go(root);
  await page
    .getByRole("button", {
      name: "Enlarge " + church.name + "’s church logo",
      exact: true
    })
    .waitFor();
  assert.equal(
    await page
      .getByRole("region", { name: "Your church tools", exact: true })
      .count(),
    0
  );
  await db.church.update({
    where: { id: church.id },
    data: { communityListed: false }
  });
  const denied = await page.request.get(
    config.origin + "/api/platform/church-images?churchId=" + church.id
  );
  assert.equal(denied.status(), 404);
  await signIn(member);
  const allowed = await page.request.get(
    config.origin + "/api/platform/church-images?churchId=" + church.id
  );
  assert.equal(allowed.status(), 200);
  assert.equal((await allowed.json()).canManage, false);
  ok(
    "Contributors see their own pending status without appointment/private fields; public logo reads and unlisted membership boundaries remain intact"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/results.json",
    JSON.stringify({ results, pageErrors: errors }, null, 2)
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
