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
  timezoneId: "America/Chicago",
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
const output = fixtureDir + "/profile-settings-browser";
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

const { createPortalActor } = await import("../tests/seed-portal.ts");
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
Object.assign(process.env, {
  PERSONAL_PHOTO_LIBRARY_ENABLED: "true",
  MEDIA_STORAGE_MODE: "local-test",
  MEDIA_TEST_DIR: process.cwd() + "/" + fixtureDir + "/images"
});
const sharp = (await import("sharp")).default;
const { getProfileEditor } = await import("../lib/platform/profiles.ts");
const { updateAccountProfile } = await import("../lib/platform/accounts.ts");
const { defaultProfileStyle } =
  await import("../lib/platform/profile-style.ts");
try {
  const a = await createPortalActor(db, "profilesettings");
  await signIn(a);
  await go("/platform/settings/profile");
  await page.locator("#setting-profile-contacts").waitFor();
  assert.equal(
    await page.locator("#setting-profile-contacts").getAttribute("href"),
    "/platform/my-church/sharing"
  );
  await page.locator("#setting-profile-information").focus();
  await page.keyboard.press("Enter");
  await page.waitForURL("**/platform/profile/me");
  await page.getByRole("group", { name: "Identity", exact: true }).waitFor();
  await page
    .getByRole("group", { name: "Introduction and about you", exact: true })
    .waitFor();
  await page
    .getByRole("region", { name: "Optional contact details", exact: true })
    .waitFor();
  assert.equal(
    await page.locator("#account-profile-form [required]").count(),
    1
  );
  assert.equal(
    await page
      .locator(
        "#account-profile-form input[type=email], #account-profile-form input[type=tel]"
      )
      .count(),
    0
  );
  await page.locator("#profile-name").fill("");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  assert.equal(
    await page
      .locator("#profile-name")
      .evaluate((e) => e.validity.valueMissing),
    true
  );
  assert.equal((await getProfileEditor(db, a.token)).presentation.version, 0);
  await page.locator("#profile-name").fill("Optional Fields Fixture");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await page.waitForURL("**/platform/profile/" + a.username);
  const empty = await getProfileEditor(db, a.token);
  assert.equal(empty.name, "Optional Fields Fixture");
  for (const field of ["bio", "location", "website"])
    assert.equal(empty[field], null);
  assert.deepEqual(empty.interests, []);
  assert.equal(empty.presentation.introduction, "");
  ok(
    "Settings opens the shared grouped editor; only name is required and all optional text can remain empty"
  );

  await go("/platform/profile/me");
  await page
    .locator("#profile-bio")
    .fill("Retained biography through image retries");
  const bytes = await sharp({
    create: { width: 1200, height: 900, channels: 3, background: "#397186" }
  })
    .png()
    .toBuffer();
  const avatar = page.getByRole("region", {
    name: "Profile photo",
    exact: true
  });
  await avatar.locator("input[type=file]").setInputFiles({
    name: "profile-settings.png",
    mimeType: "image/png",
    buffer: bytes
  });
  await avatar.locator("#avatar-zoom").fill("1.5");
  let attempts = 0;
  const details = [];
  await page.route("**/api/platform/images", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    details.push(route.request().headers()["x-image-details"]);
    attempts++;
    if (attempts === 1) return route.abort("failed");
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    if (attempts === 2) return route.abort("failed");
    await route.fulfill({ response });
  });
  await avatar
    .getByRole("button", { name: "Save avatar", exact: true })
    .click();
  await avatar
    .getByText(/connection stopped before the save was confirmed/i)
    .waitFor();
  assert.equal(
    await page.locator("#profile-bio").inputValue(),
    "Retained biography through image retries"
  );
  assert.equal(await db.mediaAsset.count({ where: { uploaderId: a.id } }), 0);
  await avatar
    .getByRole("button", { name: "Save avatar", exact: true })
    .click();
  await avatar
    .getByText(/connection stopped before the save was confirmed/i)
    .waitFor();
  assert.equal(await db.mediaAsset.count({ where: { uploaderId: a.id } }), 1);
  await avatar
    .getByRole("button", { name: "Save avatar", exact: true })
    .click();
  await avatar.getByText(/saved\. Previous pictures/).waitFor();
  await page.unroute("**/api/platform/images");
  assert.equal(new Set(details).size, 1);
  assert.equal(await db.mediaAsset.count({ where: { uploaderId: a.id } }), 1);
  assert.equal(await db.personalPhoto.count({ where: { ownerId: a.id } }), 1);
  assert.equal(
    await page.locator("#profile-bio").inputValue(),
    "Retained biography through image retries"
  );
  const cover = page.getByRole("region", { name: "Cover photo", exact: true });
  await cover.locator("input[type=file]").setInputFiles({
    name: "profile-cover.png",
    mimeType: "image/png",
    buffer: bytes
  });
  await cover.getByRole("button", { name: "Save cover", exact: true }).click();
  await cover.getByText(/Cover photo saved/).waitFor();
  assert.equal(
    await page.locator("#profile-bio").inputValue(),
    "Retained biography through image retries"
  );
  const withImage = await getProfileEditor(db, a.token);
  assert.equal(withImage.avatar.crop.zoom, 1.5);
  assert.ok(withImage.cover?.id);
  ok(
    "Failed and committed-but-lost uploads retain biography/crop and retry the same body/key without duplicate assets or library entries"
  );

  await page.evaluate(() => history.back());
  await page
    .getByText(
      "Your unsaved profile changes are still here. Finish or discard them before leaving.",
      { exact: true }
    )
    .waitFor();
  assert.equal(
    await page.locator("#profile-bio").inputValue(),
    "Retained biography through image retries"
  );
  await page
    .getByRole("link", {
      name: "Review church directory contacts",
      exact: true
    })
    .click();
  const leave = page.getByRole("dialog", {
    name: "Keep your unsaved changes?",
    exact: true
  });
  await leave.waitFor();
  await leave
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  assert.equal(
    await page.locator("#profile-bio").inputValue(),
    "Retained biography through image retries"
  );
  await updateAccountProfile(db, a.token, {
    name: "Other session name",
    bio: "Other session biography",
    location: "",
    website: "",
    interests: "",
    palette: defaultProfileStyle.palette,
    background: defaultProfileStyle.background,
    sectionOrder: defaultProfileStyle.sectionOrder,
    introduction: defaultProfileStyle.introduction,
    expectedVersion: withImage.presentation.version
  });
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await page
    .getByRole("button", { name: "Review latest saved profile", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Latest saved version", exact: true })
    .waitFor();
  await page
    .getByRole("button", {
      name: "Keep my edits and use this version",
      exact: true
    })
    .click();
  assert.equal(
    await page.locator("#profile-bio").inputValue(),
    "Retained biography through image retries"
  );
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await page.waitForURL("**/platform/profile/" + a.username);
  const confirmed = await getProfileEditor(db, a.token);
  assert.equal(confirmed.bio, "Retained biography through image retries");
  assert.equal(confirmed.avatar.id, withImage.avatar.id);
  assert.equal(confirmed.cover.id, withImage.cover.id);
  await page.reload();
  await page
    .getByText("Retained biography through image retries", { exact: true })
    .waitFor();
  ok(
    "Contact navigation preserves edits; actual concurrent profile conflict requires review before saving text while retaining the confirmed image"
  );

  await go("/platform/profile/me");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#profile-name").scrollIntoViewIfNeeded();
  await page.screenshot({ path: output + "/profile-fields-390.png" });
  await page
    .getByRole("region", { name: "Optional contact details", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: output + "/profile-contacts-390.png" });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "32px")
    );
    await bounded();
    await page.screenshot({
      path: output + "/profile-" + width + ".png",
      fullPage: true
    });
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  }
  await page
    .getByRole("link", { name: "Back to Profile settings", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await page.waitForURL("**/platform/settings/profile");
  await page.locator("#setting-profile-information").waitFor();
  ok(
    "Grouped controls reflow at phone/desktop doubled text and keyboard return reaches Profile settings"
  );

  await context.clearCookies();
  const guest = await page.request.get(config.origin + "/platform/profile/me");
  assert.equal(guest.status(), 200);
  const html = await guest.text();
  assert.ok(!html.includes(confirmed.bio));
  assert.ok(!html.includes(a.email));
  const api = await page.request.get(config.origin + "/api/platform/profile");
  assert.equal(api.status(), 401);
  ok(
    "Guest editor HTML and API retain private profile and sign-in-contact boundaries"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify({ passed: results.length, results, errors }, null, 2)
  );
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.txt",
    String(error) + "\n" + (await page.locator("body").innerText())
  );
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
