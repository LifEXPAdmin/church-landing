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
const output = fixtureDir + "/welcome-phone-browser";
mkdirSync(output, { recursive: true });
const go = async (path) => {
  await page.goto(config.origin + path);
  await page.getByRole("heading", { level: 1 }).waitFor();
};
const bounded = async () => {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r))
    );
  });
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll("main *")]
      .filter(
        (e) =>
          e.getBoundingClientRect().width &&
          e.getBoundingClientRect().right > innerWidth + 1
      )
      .map((e) => ({
        tag: e.tagName,
        classes: e.className,
        text: e.textContent.slice(0, 80),
        right: e.getBoundingClientRect().right
      }))
      .slice(0, 12)
  }));
  assert.ok(
    layout.scroll <= layout.width + 1,
    JSON.stringify({ path: page.url(), ...layout })
  );
};

const { randomUUID } = await import("node:crypto");
const { createPortalActor } = await import("../tests/seed-portal.ts");
const { uploadImage } = await import("../lib/platform/media.ts");
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

const { seedManagedChurch } =
  await import("../tests/seed-church-management.ts");
const { relationshipCommand } =
  await import("../lib/platform/relationships.ts");
process.env.PERSONAL_PHOTO_LIBRARY_ENABLED = "true";
process.env.PHOTO_ALBUMS_ENABLED = "true";
try {
  const owner = await createPortalActor(db, "welcomepreview");
  const f = await seedManagedChurch(db, owner);
  await db.church.update({
    where: { id: f.church.id },
    data: { website: "https://example.com/" }
  });
  const root = "/platform/churches/" + f.church.id;
  const panel = () =>
    page.getByRole("region", {
      name: "Church welcome and next steps",
      exact: true
    });
  await go(root);
  await panel().waitFor();
  assert.equal(
    await panel()
      .getByRole("link", { name: "Explore ministries and teams", exact: true })
      .count(),
    0
  );
  await panel()
    .getByRole("link", {
      name: "Join or sign in for your next steps",
      exact: true
    })
    .waitFor();
  assert.equal(
    await panel()
      .getByRole("link", {
        name: "Explore programs on the church website",
        exact: true
      })
      .getAttribute("href"),
    "https://example.com/"
  );
  await signIn(owner);
  await go(root);
  await panel()
    .getByRole("link", {
      name: "Add an introduction to your profile",
      exact: true
    })
    .waitFor();
  await panel()
    .getByRole("link", { name: "Add a profile photo", exact: true })
    .waitFor();
  await panel()
    .getByRole("link", {
      name: "Add an introduction to your profile",
      exact: true
    })
    .click();
  await page
    .getByRole("heading", { name: "Edit your profile", exact: true })
    .waitFor();
  const bytes = await sharp({
    create: { width: 1200, height: 900, channels: 3, background: "#3d6962" }
  })
    .png()
    .toBuffer();
  const upload = (purpose, alt, extra = {}) =>
    uploadImage(
      db,
      owner.token,
      { targetId: owner.id, purpose, alt, requestKey: randomUUID(), ...extra },
      bytes
    );
  const initial = await upload(
    "PROFILE_AVATAR",
    "First fictional profile photo"
  );
  await upload("PROFILE_AVATAR", "Current fictional profile photo", {
    replacesId: initial.id
  });
  await upload("PROFILE_COVER", "Fictional retained cover");
  await db.platformUser.update({
    where: { id: owner.id },
    data: { bio: "Fictional introduction for a current-account test." }
  });
  await relationshipCommand(db, owner.token, {
    operation: "follow",
    kind: "church",
    targetId: f.church.id,
    desired: true,
    expectedVersion: 0,
    mutationId: randomUUID()
  });
  await go(root);
  await panel()
    .getByText("You already follow this church.", { exact: true })
    .waitFor();
  assert.equal(
    await panel()
      .getByRole("link", {
        name: "Add an introduction to your profile",
        exact: true
      })
      .count(),
    0
  );
  assert.equal(
    await panel()
      .getByRole("link", { name: "Add a profile photo", exact: true })
      .count(),
    0
  );
  await panel()
    .getByRole("link", { name: "Explore ministries and teams", exact: true })
    .click();
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.waitForURL("**/structure");
  await page.goBack();
  await panel().waitFor();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal(await panel().count(), 0);
  await context.clearCookies();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await panel()
    .getByRole("link", {
      name: "Join or sign in for your next steps",
      exact: true
    })
    .waitFor();
  assert.equal(
    await panel()
      .getByRole("link", { name: "Explore ministries and teams", exact: true })
      .count(),
    0
  );
  ok(
    "Welcome reads current guest/member access, uses the real profile editor and hides completed optional steps on return and account change"
  );
  const pending = await createPortalActor(db, "welcomepending");
  await db.churchConnection.create({
    data: { userId: pending.id, churchId: f.church.id, state: "PENDING" }
  });
  await signIn(pending);
  await go(root);
  await panel()
    .getByText(
      "Your connection request is awaiting review. You do not need to request again.",
      { exact: true }
    )
    .waitFor();
  assert.equal(
    await panel()
      .getByRole("link", { name: "Review connection options", exact: true })
      .count(),
    0
  );
  assert.equal(
    await panel()
      .getByRole("link", { name: "Explore ministries and teams", exact: true })
      .count(),
    0
  );
  ok(
    "Pending connection is acknowledged without repeated requests or member/team access"
  );
  await signIn(owner);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 390, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of [
      root,
      "/platform/profile/" + owner.username,
      "/platform/profile/" + owner.username + "?tab=photos",
      "/platform/invitations",
      "/platform/share?qr=1",
      "/platform/features"
    ]) {
      await go(path);
      if (path.endsWith("?tab=photos")) {
        await page
          .getByRole("button", { name: "Open named albums", exact: true })
          .click();
        await page
          .getByRole("button", { name: "New album", exact: true })
          .click();
        await page
          .getByRole("heading", { name: "Create album", exact: true })
          .waitFor();
      }
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      await bounded();
      if (path === root) {
        await panel().waitFor();
        await bounded();
        await page.screenshot({
          path: output + `/welcome-${width}.png`,
          fullPage: true
        });
      }
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "";
      });
      await bounded();
    }
  }
  ok(
    "Church/profile/Photos/personal and website QR/feature screens fit 320px, 390px and 1024px with doubled root text and reduced motion"
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await go("/platform/profile/" + owner.username + "?tab=photos");
  await page
    .getByRole("button", { name: "Open photo 1 on this page", exact: true })
    .click();
  const viewer = page.getByRole("dialog", {
    name: "Photo viewer",
    exact: true
  });
  await viewer.waitFor();
  await page.keyboard.press("Tab");
  assert.equal(
    await viewer.evaluate((e) => e.contains(document.activeElement)),
    true
  );
  await page.goBack();
  await viewer.waitFor({ state: "hidden" });
  assert.ok(page.url().includes("tab=photos"));
  await page
    .getByRole("button", { name: "Open photo 1 on this page", exact: true })
    .click();
  await viewer.waitFor();
  await page.keyboard.press("Escape");
  await viewer.waitFor({ state: "hidden" });
  ok(
    "Shared photo viewer traps keyboard focus and returns to the Photos page with Back or Escape"
  );
  const iphone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
  });
  const ip = await iphone.newPage();
  ip.on("pageerror", (e) =>
    errors.push({ path: new URL(ip.url()).pathname, message: e.message })
  );
  await ip.goto(config.origin + "/platform/menu");
  await ip
    .getByText("Add Godschurches to your Home Screen", { exact: true })
    .waitFor();
  for (const width of [320, 390]) {
    await ip.setViewportSize({ width, height: 844 });
    assert.ok(
      await ip.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      )
    );
  }
  await ip.screenshot({
    path: output + "/iphone-guidance.png",
    fullPage: true
  });
  await iphone.close();
  ok(
    "Visible iPhone guidance remains available at 320/390px under Safari user-agent emulation; no physical installation claimed"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      { checkedAt: new Date().toISOString(), checks: results, errors },
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
  await context.close();
  await browser.close();
  await db.$disconnect();
}
