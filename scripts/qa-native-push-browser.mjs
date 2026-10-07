import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";

assert.ok(process.argv[2], "Pass an isolated preview directory");
const dir = resolve(process.argv[2]);
const config = JSON.parse(readFileSync(dir + "/browser-env.json", "utf8"));
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
const database = new URL(config.database);
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.pathname, "/godschurches_security_test");
const enabled = process.env.NATIVE_PUSH_HTTP_ENABLED === "1";
// Fictional seeding permits registration in this process only. The actual
// application independently runs with native delivery enabled or disabled.
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  NODE_ENV: "test",
  VERCEL: "",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  NATIVE_PUSH_ENABLED: "true",
  NATIVE_PUSH_EXPO_PROJECT_ID: "838ff30c-8791-4344-b4d4-c42b2a533c30",
  NATIVE_PUSH_EXPO_ACCESS_TOKEN: "fictional-no-provider-request-token",
  PUSH_ENABLED: "false"
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase, createPortalActor } =
  await import("../tests/seed-portal.ts");
const { createSessionToken } = await import("../lib/platform/auth.ts");
const { prepareNativePush, registerNativePush, nativeInstallationHash } =
  await import("../lib/platform/native-push.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ??
    `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`
)("playwright");
const publicKey = execFileSync("openssl", [
  "x509",
  "-in",
  config.certificate,
  "-pubkey",
  "-noout"
]);
const der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], {
  input: publicKey
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
  viewport: { width: 390, height: 844 },
  timezoneId: "America/Chicago"
});
const page = await context.newPage();
const output = dir + "/native-push-browser-" + Date.now();
mkdirSync(output, { recursive: true, mode: 0o700 });
const groups = [],
  errors = [],
  external = [],
  mutations = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
await context.route("**/*", (route) => {
  const url = new URL(route.request().url());
  if (url.origin === config.origin) return route.continue();
  external.push(url.origin + url.pathname);
  return route.abort();
});
page.on("request", (request) => {
  if (
    request.url() === config.origin + "/api/platform/notifications" &&
    request.method() === "POST"
  )
    mutations.push(JSON.parse(request.postData()));
});
const ok = (text) => {
  groups.push(text);
  console.log("PASS", text);
};
const signIn = async (actor) => {
  await context.clearCookies();
  await context.addCookies([
    {
      name: sessionCookieFixtureName(config.origin),
      value: actor.token,
      url: config.origin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
  const loaded = page.waitForResponse(
    (response) =>
      response.url() ===
        config.origin + "/api/platform/notifications?view=devices" &&
      response.status() === 200
  );
  await page.goto(
    config.origin + "/platform/settings/notifications/availability"
  );
  await loaded;
};
try {
  const actor = await createPortalActor(db, "nativeui"),
    other = await createPortalActor(db, "nativeuib");
  const devices = [];
  for (let i = 0; i < 8; i++) {
    const installationSecret = createSessionToken();
    const preparation = await prepareNativePush(db, actor.token, actor.id, {
      installationSecret
    });
    const input = {
      id: randomUUID(),
      mutationId: randomUUID(),
      installationSecret,
      expectedInstallationVersion: preparation.installationVersion,
      recoveryEpoch: preparation.recoveryEpoch,
      provider: "EXPO",
      platform: "IOS",
      token: `ExpoPushToken[${randomUUID()}]`,
      label: `Fictional native phone ${i + 1}`
    };
    await registerNativePush(db, actor.token, actor.id, input);
    devices.push(input);
  }
  await signIn(actor);
  const enable = page.getByRole("button", {
    name: "Enable notifications",
    exact: true
  });
  assert.equal(await enable.isDisabled(), true);
  await page.getByText(/Browser delivery is unavailable/).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: /^Remove Fictional native phone/ })
      .count(),
    8
  );
  assert.equal(mutations.length, 0);
  ok(
    "Native devices appear without enabling browser push or creating a browser association"
  );
  const phone = page.getByRole("checkbox", { name: /^Phone alerts/ }).first();
  assert.equal(await phone.isDisabled(), !enabled);
  if (enabled) {
    await phone.check();
    await page
      .getByRole("button", { name: "Save notification choices", exact: true })
      .click();
    await page
      .getByText("Your notification choices are saved.", { exact: true })
      .waitFor();
    assert.deepEqual(
      (
        await db.socialPreferences.findUniqueOrThrow({
          where: { ownerId: actor.id }
        })
      ).pushCategories,
      ["messages"]
    );
  }
  ok(
    enabled
      ? "Native-only configuration saves explicit phone category consent through the website"
      : "Disabled delivery prevents enabling new phone categories while retaining device cleanup"
  );
  const remove = page.getByRole("button", {
    name: "Remove Fictional native phone 1",
    exact: true
  });
  await remove.focus();
  assert.equal(
    await remove.evaluate((element) => element === document.activeElement),
    true
  );
  const removed = page.waitForResponse(
    (response) =>
      response.url() === config.origin + "/api/platform/notifications" &&
      response.request().method() === "POST"
  );
  await page.keyboard.press("Enter");
  assert.equal((await removed).status(), 200);
  await remove.waitFor({ state: "detached" });
  const row = await db.pushSubscription.findUniqueOrThrow({
    where: { id: devices[0].id }
  });
  assert.ok(row.revokedAt);
  for (const key of [
    "nativeToken",
    "nativeProjectId",
    "installationHash",
    "nativeRecoveryEpoch"
  ])
    assert.equal(row[key], null);
  assert.equal(
    (
      await db.nativePushInstallation.findUniqueOrThrow({
        where: { id: nativeInstallationHash(devices[0].installationSecret) }
      })
    ).version,
    2
  );
  ok(
    "Keyboard removal uses the website command and scrubs native routing while advancing its replay fence"
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    )
  );
  await page
    .getByRole("heading", { name: "This phone or browser" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: output + "/mobile.png" });
  await page.setViewportSize({ width: 1440, height: 900 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    )
  );
  await page.screenshot({ path: output + "/desktop.png" });
  ok(
    "Phone and desktop layouts retain bounded controls without horizontal overflow"
  );
  await signIn(other);
  await page
    .getByText("No enabled device is confirmed for this sign-in.", {
      exact: true
    })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: /^Remove Fictional native phone/ })
      .count(),
    0
  );
  assert.ok(
    !(await page.locator("body").innerText()).includes("Fictional native phone")
  );
  ok("A different account sees no prior account devices after navigation");
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  writeFileSync(
    output + "/PASS.json",
    JSON.stringify(
      {
        source: process.env.QA_EXPECTED_SOURCE,
        enabled,
        groups,
        errors,
        external,
        scope:
          "Actual local browser/API/database checks with fictional native registrations. No OS permission, provider networking or physical device acceptance."
      },
      null,
      2
    ),
    { flag: "wx" }
  );
} finally {
  writeFileSync(
    output + "/observations.json",
    JSON.stringify({ enabled, groups, errors, external }, null, 2)
  );
  await context.close();
  await browser.close();
  await db.$disconnect();
}
