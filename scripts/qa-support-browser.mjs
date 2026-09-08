import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const dir = resolve(process.env.QA_PREVIEW_DIR ?? ".account-test/missing");
assert.ok(dir.startsWith(resolve(".account-test") + "/"));
const f = JSON.parse(readFileSync(join(dir, "SUPPORT_PREVIEW.json"), "utf8"));
const origin = new URL(f.origin).origin;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
for (const a of Object.values(f.actors)) {
  assert.ok(a.name.startsWith("Fictional "));
  assert.ok(a.email.endsWith("@example.test"));
}
const output = join(dir, "support-browser");
mkdirSync(output, { recursive: true, mode: 0o700 });
const require = createRequire(
  process.env.QA_PLAYWRIGHT_PACKAGE ??
    "/Users/awmccuen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json"
);
const { chromium } = require("playwright");
const binary = join(
  process.env.HOME,
  "Library/Caches/ms-playwright/chromium_headless_shell-1194/chrome-mac/headless_shell"
);
const executablePath = existsSync(chromium.executablePath())
  ? chromium.executablePath()
  : binary;
assert.ok(existsSync(executablePath));
const pub = execFileSync("openssl", [
  "x509",
  "-in",
  join(dir, "localhost-cert.pem"),
  "-pubkey",
  "-noout"
]);
const der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], {
  input: pub
});
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: [
    `--ignore-certificate-errors-spki-list=${createHash("sha256").update(der).digest("base64")}`
  ]
});
const subject = `Fictional mobile support journey ${Date.now()}`;
const report = {
  startedAt: new Date().toISOString(),
  checks: [],
  screenshots: [],
  pageErrors: [],
  demoRequests: []
};
async function check(label, fn) {
  await fn();
  report.checks.push(label);
  console.log("PASS " + label);
}
async function pageFor(role, width = 390) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    isMobile: width < 600,
    hasTouch: width < 600,
    ignoreHTTPSErrors: false
  });
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.abort()
  );
  const page = await context.newPage();
  page.on("pageerror", () => report.pageErrors.push("Browser runtime error"));
  if (role) {
    await page.goto(origin + "/platform/login");
    const form = page.locator("form").filter({
      has: page.getByRole("button", { name: "Sign in", exact: true })
    });
    await form.locator('input[name="email"]').fill(f.actors[role].email);
    await form.locator('input[name="password"]').fill(f.actors[role].password);
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/platform/account") &&
        r.request().method() === "POST"
    );
    await form.getByRole("button", { name: "Sign in", exact: true }).click();
    assert.equal((await response).status(), 200);
    await page.waitForURL((url) => url.pathname !== "/platform/login");
  }
  return page;
}
async function submit(page, name) {
  const button = page.getByRole("button", { name, exact: true });
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/platform/support") &&
      r.request().method() === "POST"
  );
  await button.click();
  const r = await response;
  assert.equal(r.status(), 200, "Support action succeeds");
  return r.status();
}
async function screenshot(page, name) {
  await page.screenshot({
    path: join(output, name + ".png"),
    fullPage: true,
    mask: [page.locator('input[type="password"],input[name="email"]')]
  });
  report.screenshots.push(name + ".png");
}
async function layout(page) {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal overflow"
  );
}
try {
  const requester = await pageFor("requester");
  let caseId;
  await check(
    "390px requester sees named recipient and deliberately submits a case",
    async () => {
      await requester.goto(
        origin + `/platform/help/new?churchId=${f.churchId}`
      );
      await layout(requester);
      assert.ok(
        (await requester.locator("main").innerText()).includes(
          f.actors.owner.name
        )
      );
      await requester
        .getByLabel("Short summary", { exact: true })
        .fill(subject);
      await requester
        .getByLabel("What happened, and what would help?", { exact: true })
        .fill(
          "A fictional browser test of ordinary setup help and clear follow-through."
        );
      await requester
        .getByLabel("I have read the notice", { exact: false })
        .check();
      await submit(requester, "Send request");
      await requester.waitForURL((url) =>
        url.pathname.startsWith("/platform/help/cases/")
      );
      caseId = new URL(requester.url()).pathname.split("/").at(-1);
      await requester
        .getByRole("heading", { name: "Your request", exact: true })
        .waitFor();
      await screenshot(requester, "mobile-request");
    }
  );
  const owner = await pageFor("owner", 1440);
  await check(
    "desktop owner finds assigned case and requests a follow-up",
    async () => {
      await owner.goto(origin + "/platform/help/inbox");
      await owner
        .getByRole("link", {
          name: subject,
          exact: true
        })
        .click();
      await owner
        .getByLabel("New status", { exact: true })
        .selectOption("WAITING_FOR_REQUESTER");
      await owner
        .getByLabel("What changed or resolved the issue?", { exact: true })
        .fill("Please tell us which setup screen needs help.");
      await submit(owner, "Save status");
      await owner
        .getByText("Account or website problem / Waiting for requester", {
          exact: true
        })
        .waitFor();
      await layout(owner);
      await screenshot(owner, "desktop-owner");
    }
  );
  await check("requester reply returns waiting work to progress", async () => {
    await requester.reload();
    await requester
      .getByLabel("Your reply", { exact: true })
      .fill("The church welcome screen is the one I meant.");
    await submit(requester, "Save reply");
    await requester
      .getByText("Account or website problem / In progress", { exact: true })
      .waitFor();
  });
  const coordinator = await pageFor("coordinator");
  await check(
    "explicit sharing exposes history then withdrawal removes it in the same session",
    async () => {
      await requester
        .getByLabel("I agree that this person can read", { exact: false })
        .check();
      await submit(requester, "Share with this coordinator");
      await requester
        .getByRole("button", { name: "Remove coordinator access", exact: true })
        .waitFor();
      await coordinator.goto(origin + `/platform/help/cases/${caseId}`);
      await coordinator
        .getByRole("heading", { name: "Your request", exact: true })
        .waitFor();
      await submit(requester, "Remove coordinator access");
      await coordinator.reload();
      await coordinator
        .getByRole("heading", { name: "Request not available", exact: true })
        .waitFor();
      assert.ok(
        !(await coordinator.locator("main").innerText()).includes(
          "The church welcome screen is the one I meant."
        )
      );
    }
  );
  await check(
    "resolution and requester reopening are usable on mobile",
    async () => {
      await owner.reload();
      await owner
        .getByLabel("New status", { exact: true })
        .selectOption("RESOLVED");
      await owner
        .getByLabel("What changed or resolved the issue?", { exact: true })
        .fill("The fictional setup question is resolved by this explanation.");
      await submit(owner, "Save status");
      await requester.reload();
      await requester
        .getByLabel("Why are you reopening this request?", { exact: true })
        .fill("There is one more ordinary setup question.");
      await submit(requester, "Reopen request");
      await requester
        .getByText("Account or website problem / Received", { exact: true })
        .waitFor();
    }
  );
  const manager = await pageFor("manager", 320);
  await check(
    "320px routing manager has a separate queue and no case-content authority",
    async () => {
      await manager.goto(origin + "/platform/help/routing");
      await layout(manager);
      await screenshot(manager, "mobile-routing");
      await manager.goto(origin + `/platform/help/cases/${caseId}`);
      await manager
        .getByRole("heading", { name: "Request not available", exact: true })
        .waitFor();
    }
  );
  await check(
    "320px forms, visible labels, focus and keyboard navigation",
    async () => {
      await requester.setViewportSize({ width: 320, height: 740 });
      await requester.goto(origin + "/platform/help/new", {
        waitUntil: "networkidle"
      });
      await layout(requester);
      await requester.getByLabel("Short summary", { exact: true }).focus();
      assert.equal(
        await requester.evaluate(() =>
          document.activeElement?.getAttribute("name")
        ),
        "subject"
      );
      await requester.keyboard.press("Tab");
      assert.equal(
        await requester.evaluate(() =>
          document.activeElement?.getAttribute("name")
        ),
        "description"
      );
      await screenshot(requester, "narrow-intake");
    }
  );
  const demo = await pageFor(null);
  await demo.route("**/api/**", (route) => {
    report.demoRequests.push("Unexpected API call");
    return route.abort();
  });
  await check(
    "public support demos are readable on mobile and make no API calls",
    async () => {
      for (const path of [
        "support-requests",
        "support-case",
        "support-inbox"
      ]) {
        await demo.goto(origin + "/platform/demo/" + path);
        await layout(demo);
        assert.equal(await demo.locator("form").count(), 0);
        await screenshot(demo, path);
      }
      assert.deepEqual(report.demoRequests, []);
    }
  );
  assert.deepEqual(report.pageErrors, []);
  report.completedAt = new Date().toISOString();
  report.passed = true;
} finally {
  if (!report.passed) {
    report.failureViews = [];
    for (const context of browser.contexts())
      for (const page of context.pages()) {
        report.failureViews.push({
          path: new URL(page.url()).pathname,
          text: await page
            .locator("main")
            .innerText()
            .catch(() => "")
        });
        await screenshot(page, "failure-" + report.failureViews.length).catch(
          () => {}
        );
      }
  }
  writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2), {
    mode: 0o600
  });
  await browser.close();
}
