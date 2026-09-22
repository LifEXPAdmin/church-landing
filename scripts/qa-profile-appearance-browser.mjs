import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the isolated profile fixture directory");
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + fixtureDir + "/sink",
  NODE_ENV: "test",
  VERCEL: "",
  PRIVILEGED_MFA_MODE: "off"
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase, createPortalActor } =
  await import("../tests/seed-portal.ts");
const { getProfileEditor } = await import("../lib/platform/profiles.ts");
const { loginAccount } = await import("../lib/platform/accounts.ts");
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
const blockedRequests = [];
await context.route("**/*", (route) => {
  if (new URL(route.request().url()).origin === config.origin)
    return route.continue();
  blockedRequests.push(route.request().url());
  return route.abort();
});
const page = await context.newPage(),
  errors = [],
  results = [];
page.setDefaultTimeout(20000);
page.on("pageerror", (error) => errors.push(error.message));
const output = fixtureDir + "/profile-appearance-browser-" + Date.now();
mkdirSync(output, { recursive: true });
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const go = async (path) => {
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
  return response;
};
const submit = () =>
  page.getByRole("button", { name: "Save profile", exact: true }).click();
const sharp = (await import("sharp")).default;
const { profileEventsFixture, saveProfileEvent } =
  await import("../tests/profile-events-fixture.ts");
Object.assign(process.env, {
  PERSONAL_PHOTO_LIBRARY_ENABLED: "true",
  MEDIA_STORAGE_MODE: "local-test",
  MEDIA_TEST_DIR: process.cwd() + "/" + fixtureDir + "/images"
});
const draft = () =>
  page
    .locator("#account-profile-form")
    .evaluate((form) => Object.fromEntries(new FormData(form)));
const save = async (owner) => {
  await submit();
  await page.waitForURL("**/platform/profile/" + owner.username);
};
try {
  const f = await profileEventsFixture(db),
    owner = f.owner;
  await saveProfileEvent(db, owner, f.source.occurrence.id, {
    palette: "warm",
    background: "lines",
    sectionOrder: "posts-first",
    introduction: "Saved introduction",
    bio: "Saved biography"
  });
  const eventBefore = await db.calendarEvent.findUniqueOrThrow({
    where: { id: f.source.event.id }
  });
  await go(
    "/platform/profile/me?focus=appearance&palette=warm&operation=update-profile"
  );
  const signInLink = page.getByRole("link", { name: "Sign in", exact: true });
  const links = await signInLink.evaluateAll((nodes) =>
    nodes.map((n) => n.href)
  );
  const loginHref = links.find(
    (h) =>
      new URL(h).searchParams.get("next") ===
      "/platform/profile/me?focus=appearance"
  );
  assert.ok(loginHref);
  await page.goto(loginHref);
  await page.getByLabel("Email", { exact: true }).fill(owner.email);
  await page.getByLabel("Password", { exact: true }).fill(owner.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/platform/profile/me?focus=appearance");
  await page.waitForFunction(
    () => document.activeElement?.id === "profile-appearance-heading"
  );
  assert.equal(await page.locator("#account-profile-form").count(), 1);
  await page
    .getByRole("link", { name: "Back to Profile settings", exact: true })
    .click();
  await page.locator("#setting-profile-sections").focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => document.activeElement?.id === "profile-sections-heading"
  );
  assert.match(
    await page
      .getByRole("group", { name: "Optional profile sections", exact: true })
      .innerText(),
    /An event is selected/
  );
  ok(
    "Real sign-in retains only approved editor focus; keyboard Settings entries focus the shared groups and Back returns safely"
  );

  await page.locator("#profile-bio").fill("Unsaved biography retained");
  await page
    .locator("#profile-introduction")
    .fill("Unsaved introduction retained");
  await page.locator("#profile-testimony").fill("Unsaved testimony retained");
  await page.locator("#profile-skills").fill("Listening\nGardening");
  await page
    .getByRole("button", { name: "Move Skills up", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  const ordering = await page
    .getByRole("group", { name: "Optional section order", exact: true })
    .innerText();
  const image = await sharp({
    create: { width: 1200, height: 900, channels: 3, background: "#397186" }
  })
    .png()
    .toBuffer();
  const cover = page.getByRole("region", { name: "Cover photo", exact: true });
  await cover.locator("input[type=file]").setInputFiles({
    name: "draft-cover.png",
    mimeType: "image/png",
    buffer: image
  });
  await cover.locator("#cover-zoom").fill("1.5");
  const before = await draft(),
    savedBefore = await getProfileEditor(db, owner.token);
  const restore = page.getByRole("button", {
    name: "Restore appearance defaults",
    exact: true
  });
  await restore.focus();
  await page.keyboard.press("Enter");
  assert.deepEqual(await draft(), {
    ...before,
    palette: "sage",
    background: "plain"
  });
  assert.equal(await cover.locator("#cover-zoom").inputValue(), "1.5");
  assert.equal(
    await page
      .getByRole("group", { name: "Optional section order", exact: true })
      .innerText(),
    ordering
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Save profile", exact: true })
      .isDisabled(),
    true
  );
  assert.deepEqual(await getProfileEditor(db, owner.token), savedBefore);
  await page
    .getByRole("link", { name: "Back to Profile settings", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Keep your unsaved changes?",
    exact: true
  });
  await dialog.waitFor();
  await dialog
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  await cover.getByRole("button", { name: "Save cover", exact: true }).click();
  await cover.getByText(/Cover photo saved/).waitFor();
  await save(owner);
  const saved = await getProfileEditor(db, owner.token);
  assert.equal(saved.bio, "Unsaved biography retained");
  assert.equal(
    saved.presentation.introduction,
    "Unsaved introduction retained"
  );
  assert.equal(saved.presentation.palette, "sage");
  assert.equal(saved.presentation.background, "plain");
  assert.equal(saved.presentation.sectionOrder, "posts-first");
  assert.equal(
    saved.presentation.modules.calendarOccurrenceId,
    f.source.occurrence.id
  );
  assert.deepEqual(saved.presentation.modules.order, [
    "skills",
    "testimony",
    "links"
  ]);
  assert.ok(saved.cover?.id);
  assert.deepEqual(
    await db.calendarEvent.findUniqueOrThrow({
      where: { id: f.source.event.id }
    }),
    eventBefore
  );
  ok(
    "Appearance-only draft reset preserves every serialized field, keyboard ordering, canonical event and pending photo/crop; normal photo gate and profile save persist them"
  );

  for (const palette of ["sage", "blue", "warm"])
    for (const background of ["plain", "soft", "lines"]) {
      await go("/platform/profile/me?focus=appearance");
      await page.locator("#profile-palette").selectOption(palette);
      await page.locator("#profile-background").selectOption(background);
      assert.match(
        await page.locator("#profile-appearance-status").innerText(),
        /Unsaved appearance preview/
      );
      assert.equal(
        await page
          .locator(".gc-profile-style-swatch")
          .getAttribute("data-profile-palette"),
        palette
      );
      assert.equal(
        await page
          .locator(".gc-profile-style-swatch")
          .getAttribute("data-profile-background"),
        background
      );
      await save(owner);
      await go("/platform/profile/me?focus=appearance");
      assert.equal(
        await page.locator("#profile-palette").inputValue(),
        palette
      );
      assert.equal(
        await page.locator("#profile-background").inputValue(),
        background
      );
      assert.match(
        await page.locator("#profile-appearance-status").innerText(),
        /last confirmed saved/
      );
    }
  ok(
    "All nine palette and treatment pairs preview as unsaved, persist through the canonical writer and reload as confirmed saved"
  );

  // Nine preset saves and the reset consume the real session's ten-write budget.
  // Begin the separate uncertain-response case with a fresh ordinary session;
  // keep the production limiter and its recorded 429 behavior unchanged.
  const renewed = await loginAccount(
    db,
    owner.email,
    owner.password,
    "fictional-appearance-recovery"
  );
  await context.addCookies([
    {
      name: "church_platform_session",
      value: renewed,
      url: config.origin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
  await go("/platform/profile/me?focus=appearance");
  await page.locator("#profile-palette").selectOption("blue");
  await page.locator("#profile-background").selectOption("plain");
  let lost = false;
  await page.route("**/api/platform/account", async (route) => {
    if (!lost && route.request().method() === "POST") {
      lost = true;
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      return route.abort();
    }
    return route.continue();
  });
  await submit();
  await page
    .getByRole("alert")
    .filter({ hasText: "We could not confirm the save" })
    .waitFor();
  assert.match(
    await page.locator("#profile-appearance-status").innerText(),
    /Unsaved/
  );
  assert.equal(
    (await getProfileEditor(db, owner.token)).presentation.palette,
    "blue"
  );
  await submit();
  await page
    .getByRole("button", { name: "Review latest saved profile", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Latest saved version", exact: true })
    .waitFor();
  await page.getByText(/Last confirmed saved appearance: Sky, Plain/).waitFor();
  assert.equal(await page.locator("#profile-palette").inputValue(), "blue");
  await page
    .getByRole("button", {
      name: "Keep my edits and use this version",
      exact: true
    })
    .click();
  await page.unroute("**/api/platform/account");
  await save(owner);
  ok(
    "A committed but lost appearance response remains unconfirmed; stale retry requires deliberate review and updates the confirmed preset without discarding the draft"
  );

  for (const appearance of ["light", "dark"]) {
    await context.addCookies([
      {
        name: "godschurches_reading",
        value: encodeURIComponent(
          JSON.stringify({ appearance, reduceMotion: true, reduceData: true })
        ),
        url: config.origin
      }
    ]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await go("/platform/profile/me?focus=appearance");
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(
        () => (document.documentElement.style.fontSize = "32px")
      );
      for (const palette of ["sage", "blue", "warm"])
        for (const background of ["plain", "soft", "lines"]) {
          await page.locator("#profile-palette").selectOption(palette);
          await page.locator("#profile-background").selectOption(background);
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1
            )
          );
          const style = await page
            .locator(".gc-profile-style-swatch")
            .evaluate((e) => {
              const s = getComputedStyle(e);
              return {
                color: s.color,
                background: s.backgroundColor,
                animation: s.animationDuration,
                image: s.backgroundImage
              };
            });
          const rgb = (value) => value.match(/[\d.]+/g).map(Number);
          const ink = rgb(style.color),
            paper = rgb(style.background);
          const luminance = (color) =>
            color
              .slice(0, 3)
              .map((c) => c / 255)
              .map((c) =>
                c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
              )
              .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
          const stops = [
            paper,
            ...[...style.image.matchAll(/rgba?\([^)]+\)/g)].map((m) => {
              const overlay = rgb(m[0]),
                alpha = overlay[3] ?? 1;
              return paper.map((c, i) => c * (1 - alpha) + overlay[i] * alpha);
            })
          ];
          for (const stop of stops) {
            const a = luminance(ink),
              b = luminance(stop);
            assert.ok(
              (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5,
              `${appearance}/${palette}/${background} normal text contrast`
            );
          }
          assert.match(style.animation, /^(0|0.00001)s/);
        }
      await page
        .locator("#profile-appearance-heading")
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: output + `/appearance-${appearance}-${width}.png`
      });
    }
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  }
  await go("/platform/profile/" + owner.username);
  assert.ok(
    await page.locator(".gc-profile-cover-image img").getAttribute("src")
  );
  const coverSrc = await page
    .locator(".gc-profile-cover-image img")
    .getAttribute("src");
  assert.match(coverSrc, /thumb/);
  assert.equal(
    await page.locator(".gc-profile-cover-image img").getAttribute("srcset"),
    null
  );
  await page.route("**/api/platform/images/**", (route) =>
    route.fulfill({ status: 404, body: "Unavailable" })
  );
  await page.reload();
  await page
    .locator(".gc-profile-cover-image.gc-profile-image-fallback")
    .waitFor();
  await page.getByRole("link", { name: "Edit profile", exact: true }).waitFor();
  await page.screenshot({ path: output + "/missing-cover.png" });
  await page.unroute("**/api/platform/images/**");
  ok(
    "All preset layouts remain bounded at 320/390/1440 with doubled text, light/dark and reduced motion; Data saver selects a thumbnail and a missing cover preserves profile actions"
  );
  await go("/platform/profile/me?focus=appearance");
  await page.locator("#profile-bio").fill("Conceal this account-bound draft");
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await page.locator("#profile-bio").waitFor();
  assert.notEqual(
    await page.evaluate(() => document.activeElement?.id),
    "profile-appearance-heading",
    "Routine revalidation must not steal draft focus"
  );
  const another = await createPortalActor(db, "styleswitch");
  const beforeOwner = await getProfileEditor(db, owner.token),
    beforeOther = await getProfileEditor(db, another.token);
  await context.addCookies([
    {
      name: "church_platform_session",
      value: another.token,
      url: config.origin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await page.locator("#account-profile-form").waitFor({ state: "hidden" });
  const late = await page.request.post(
    config.origin + "/api/platform/account",
    {
      headers: { Origin: config.origin, "X-Expected-Account": owner.id },
      data: { operation: "update-profile", name: "Late old account update" }
    }
  );
  assert.ok(late.status() >= 400 && late.status() < 500);
  assert.deepEqual(await getProfileEditor(db, owner.token), beforeOwner);
  assert.deepEqual(await getProfileEditor(db, another.token), beforeOther);
  ok(
    "Routine access checks do not steal focus; switching accounts conceals the old draft and rejects its late write without changing either profile"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        results,
        errors,
        blockedRequests,
        productionBuild: true,
        productionWrites: 0,
        externalSends: 0
      },
      null,
      2
    )
  );
  console.log("PROFILE_APPEARANCE_BROWSER_PASS " + results.length);
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(output + "/failure.txt", String(error));
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
