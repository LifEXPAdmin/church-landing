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
const output = fixtureDir + "/church-disabled-browser";
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
  const manager = await createPortalActor(db, "churchdisabled");
  const { church } = await seedManagedChurch(db, manager);
  await signIn(manager);
  await go("/platform/churches/" + church.id);
  await page
    .getByRole("button", { name: "Edit church logo and cover", exact: true })
    .click();
  const identity = page.getByRole("region", { name: "Church identity photos" });
  assert.equal(await identity.locator("input[type=file]").count(), 0);
  assert.equal(
    await identity
      .getByText(
        "Photo uploads are not available yet. Your saved images are unchanged.",
        { exact: true }
      )
      .count(),
    2
  );
  const response = await page.request.get(
    config.origin + "/api/platform/church-images?churchId=" + church.id
  );
  assert.equal(response.status(), 200);
  const data = await response.json();
  assert.equal(data.canManage, true);
  assert.equal(data.imagesAvailable, false);
  await bounded();
  await page.screenshot({ path: output + "/disabled-390.png", fullPage: true });
  assert.deepEqual(errors, []);
  ok(
    "Provider-disabled manager sees honest unavailable upload state, current permission and neutral initials, with no file controls"
  );
  writeFileSync(
    output + "/results.json",
    JSON.stringify({ results, pageErrors: errors }, null, 2)
  );
} finally {
  await browser.close();
  await db.$disconnect();
}
