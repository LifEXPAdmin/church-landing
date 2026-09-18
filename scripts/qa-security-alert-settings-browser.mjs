import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";

const fixture = resolve(process.argv[2] ?? "");
assert.ok(process.argv[2], "Pass an isolated built HTTPS fixture directory");
const config = JSON.parse(
  readFileSync(join(fixture, "browser-env.json"), "utf8")
);
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
assert.equal(
  process.env.DATABASE_URL,
  config.database,
  "Use the matching isolated environment"
);
assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase, createPortalActor } =
  await import("../tests/seed-portal.ts");
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
await context.route("**/*", (route) =>
  new URL(route.request().url()).origin === config.origin
    ? route.continue()
    : route.abort()
);
const page = await context.newPage();
const checks = [],
  errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const output = join(fixture, "security-alert-browser-" + Date.now());
mkdirSync(output, { mode: 0o700 });
const ok = (text) => {
  checks.push(text);
  console.log("PASS " + text);
};
const go = async (path) => {
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
};
const signIn = async (actor) => {
  await context.clearCookies();
  await context.addCookies([
    {
      name: "church_platform_session",
      value: actor.token,
      url: config.origin,
      httpOnly: true,
      secure: true,
      sameSite: "Lax"
    }
  ]);
};
const section = page.getByRole("region", {
  name: "Security notices and optional alerts",
  exact: true
});
try {
  await go("/platform/settings/security");
  assert.equal(await section.count(), 0);
  await page
    .getByRole("link", { name: "Sign in", exact: true })
    .first()
    .waitFor();
  ok(
    "Guest Security entry offers sign-in without revealing account settings or notices."
  );
  const actor = await createPortalActor(db, "alertsettings");
  const other = await createPortalActor(db, "alertother");
  // Synthetic notice projections only. Real confirmation and dispatch are
  // exercised separately in security-alert-settings.test.ts; no browser email sends.
  const pending = await db.privilegedSecurityNotice.create({
    data: {
      userId: actor.id,
      factorVersion: 1,
      action: "confirmed"
    }
  });
  await db.privilegedSecurityNotice.create({
    data: {
      userId: actor.id,
      factorVersion: 2,
      action: "replaced",
      deliveredAt: new Date()
    }
  });
  await signIn(actor);
  await go("/platform/settings/security");
  await section.waitFor();
  assert.match(await section.innerText(), /cannot be turned off/);
  assert.match(await section.innerText(), /quiet hours/);
  assert.match(
    await section.innerText(),
    /Provider acceptance does not confirm/
  );
  assert.equal(await section.getByRole("checkbox").count(), 0);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "32px";
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      )
    );
    await section.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(output, "security-" + width + ".png") });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
  }
  ok(
    "Essential notices are explained without an unsupported switch at phone/desktop widths and doubled text."
  );

  const optional = section.getByRole("link", {
    name: "Review optional notifications",
    exact: true
  });
  await optional.focus();
  await page.keyboard.press("Enter");
  await page.waitForURL("**/settings/notifications");
  await page.locator("#setting-notifications-availability").click();
  await page.waitForURL("**/settings/notifications/availability");
  const replies = page
    .getByRole("group", {
      name: "Replies to your posts and comments",
      exact: true
    })
    .getByRole("checkbox", { name: "In-app alerts", exact: true });
  await replies.waitFor();
  await replies.uncheck();
  await page
    .getByRole("button", { name: "Save notification choices", exact: true })
    .click();
  await page
    .getByText("Your notification choices are saved.", { exact: true })
    .waitFor();
  const preferences = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: actor.id }
  });
  assert.ok(preferences.mutedNotificationCategories.includes("replies"));
  assert.equal(
    await db.privilegedSecurityNotice.count({ where: { userId: actor.id } }),
    2
  );
  assert.equal(
    (
      await db.privilegedSecurityNotice.findUniqueOrThrow({
        where: { id: pending.id }
      })
    ).deliveredAt,
    null
  );
  assert.equal(
    await db.socialPreferences.count({ where: { ownerId: other.id } }),
    0
  );
  await page.reload();
  await replies.waitFor();
  assert.equal(await replies.isChecked(), false);
  ok(
    "Keyboard navigation reaches existing optional controls; a real save persists without changing notices or another account."
  );

  await go("/platform/settings/security");
  await section.waitFor();
  await page
    .getByRole("link", { name: "Review authenticator protection", exact: true })
    .click();
  await page.waitForURL("**/account/authenticator");
  await page
    .getByRole("heading", { name: "Your authenticator", exact: true })
    .waitFor();
  const notices = page.getByRole("region", {
    name: "Authenticator security notices",
    exact: true
  });
  await notices.waitFor();
  assert.match(
    await notices.innerText(),
    /Email delivery has not been confirmed/
  );
  assert.match(await notices.innerText(), /Email provider accepted the notice/);
  await page
    .getByRole("link", { name: "Return to Account security", exact: true })
    .click();
  await page.waitForURL("**/settings/security");
  await section.waitFor();
  ok(
    "Authenticator notice status distinguishes pending delivery from provider acceptance and returns to Security."
  );

  await signIn(other);
  await go("/platform/account/authenticator");
  await page
    .getByRole("heading", { name: "Your authenticator", exact: true })
    .waitFor();
  assert.equal(await notices.count(), 0);
  assert.equal(
    await page.locator("[data-nextjs-dialog], .vite-error-overlay").count(),
    0
  );
  assert.deepEqual(errors, []);
  ok(
    "Another account cannot see the first account's notices; all journeys finish without page errors."
  );
  writeFileSync(
    join(output, "result.json"),
    JSON.stringify(
      {
        checks,
        passed: checks.length,
        errors,
        isolated: true,
        productionBuild: true,
        productionWrites: 0,
        externalSends: 0,
        noticeProjection: "synthetic local rows; real service tested separately"
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  console.log(output);
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
