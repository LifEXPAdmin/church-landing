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
const output = fixtureDir + "/installation-browser";
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

try {
  await go("/platform");
  await page.evaluate(() => {
    window.installCalls = 0;
    const event = new Event("beforeinstallprompt", { cancelable: true });
    event.prompt = async () => {
      window.installCalls++;
    };
    event.userChoice = Promise.resolve({ outcome: "dismissed" });
    window.dispatchEvent(event);
  });
  await page.getByRole("link", { name: "Menu", exact: true }).first().click();
  const trigger = page.getByRole("button", {
    name: "Install Godschurches Add an app shortcut, or keep using your browser."
  });
  await trigger.click();
  const sheet = page.getByRole("dialog", {
    name: "Install Godschurches",
    exact: true
  });
  await sheet.waitFor();
  assert.equal(await page.evaluate(() => window.installCalls), 0);
  await sheet.getByRole("button", { name: "Install app", exact: true }).click();
  await sheet
    .getByText("Installation dismissed. You can keep using this browser.", {
      exact: true
    })
    .waitFor();
  assert.equal(await page.evaluate(() => window.installCalls), 1);
  assert.equal(
    await sheet
      .getByRole("button", { name: "Install app", exact: true })
      .count(),
    0
  );
  await page.keyboard.press("Escape");
  assert.equal(
    await trigger.evaluate((el) => el === document.activeElement),
    true
  );
  assert.notEqual(
    await page.evaluate(() => document.body.style.overflow),
    "hidden"
  );
  ok(
    "Prompt retained across navigation, invoked only by click, dismissal consumes it and Escape restores focus"
  );
  await page.reload();
  await trigger.click();
  await sheet
    .getByText(/This browser has not offered an install prompt/)
    .waitFor();
  assert.equal(
    await sheet
      .getByRole("button", { name: "Install app", exact: true })
      .count(),
    0
  );
  for (const name of [
    "Android · Chrome",
    "iPhone · Safari",
    "Computer · Chrome"
  ]) {
    await sheet.getByText(name, { exact: true }).click();
  }
  await bounded();
  assert.equal(await sheet.getByRole("link").count(), 3);
  await sheet.getByRole("button", { name: "Close", exact: true }).click();
  ok(
    "Absent capability remains unknown with current platform instructions and bounded mobile layout"
  );
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    event.prompt = async () => {};
    event.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(event);
  });
  await trigger.click();
  await sheet.getByRole("button", { name: "Install app", exact: true }).click();
  await sheet.getByText(/Installation requested/).waitFor();
  assert.equal(
    await sheet.getByText(/browser has reported installation/).count(),
    0
  );
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await sheet.getByText(/browser has reported installation/).waitFor();
  assert.equal(
    await sheet
      .getByRole("button", { name: "Install app", exact: true })
      .count(),
    0
  );
  ok(
    "Accepted prompt is not mislabeled installed; appinstalled supplies the installed state"
  );
  await sheet.getByRole("button", { name: "Close", exact: true }).click();
  const standalone = await browser.newContext();
  await standalone.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (q) =>
      q === "(display-mode: standalone)"
        ? {
            ...original(q),
            matches: true,
            addEventListener() {},
            removeEventListener() {}
          }
        : original(q);
  });
  const second = await standalone.newPage();
  await second.goto(config.origin + "/platform/menu");
  await second
    .getByRole("button", { name: /Install Godschurches Add an app/ })
    .click();
  await second
    .getByRole("dialog")
    .getByText(/open as an installed app/)
    .waitFor();
  await standalone.close();
  await page.bringToFront();
  await go("/platform/menu");
  const login = page
    .locator(".gc-menu-page")
    .getByRole("link", { name: "Sign in", exact: true });
  assert.ok(
    (await login.getAttribute("href")).includes("next=%2Fplatform%2Fmenu")
  );
  await login.click();
  await page.waitForURL((url) => url.pathname === "/platform/login");
  assert.ok(new URL(page.url()).searchParams.get("next") === "/platform/menu");
  assert.deepEqual(errors, []);
  assert.equal(
    await page.evaluate(
      async () => (await navigator.serviceWorker.getRegistrations()).length
    ),
    0
  );
  ok(
    "Standalone detection and existing guest sign-in return remain independent of installation"
  );
  writeFileSync(
    output + "/receipt.json",
    JSON.stringify(
      {
        results,
        pageErrors: errors,
        applicationMutationRequests: 0,
        capabilityEvents:
          "synthetic browser fixtures; no physical installation claimed"
      },
      null,
      2
    )
  );
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
