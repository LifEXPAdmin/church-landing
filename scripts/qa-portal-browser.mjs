import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";

const root = process.cwd();
const runDir = resolve(
  process.env.QA_PREVIEW_DIR ?? ".account-test/run-MSq1n6"
);
assert.ok(
  runDir.startsWith(resolve(root, ".account-test") + "/"),
  "Only ignored synthetic previews are allowed"
);
const preview = readFileSync(join(runDir, "PREVIEW.md"), "utf8");
const origin = new URL(
  preview.match(/^Login: (https:\/\/[^\s]+)/m)?.[1] ?? "http://invalid"
).origin;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
const actors = Object.fromEntries(
  preview
    .split("\n")
    .filter(
      (line) =>
        line.startsWith("| Fictional ") && line.includes("@example.test")
    )
    .map((line) => {
      const [name, email, password] = line
        .split("|")
        .slice(1, 4)
        .map((value) => value.trim());
      assert.ok(
        email.endsWith("@example.test") && name.startsWith("Fictional ")
      );
      return [name.split(" ")[1], { name, email, password }];
    })
);
for (const role of [
  "member_a",
  "member_b",
  "pending",
  "review_a",
  "review_b",
  "coordinat",
  "operator",
  "unverify",
  "unack",
  "contact",
  "rel_owner"
])
  assert.ok(actors[role], `Missing fictional ${role} fixture`);
const churchName = preview.match(/^Church A: (.+)$/m)?.[1];
assert.ok(churchName?.startsWith("Fictional "));
const output = join(
  runDir,
  `browser-qa-${new Date().toISOString().replace(/[:.]/g, "-")}`
);
mkdirSync(output, { recursive: true, mode: 0o700 });
const extraSecrets = [];
const sanitize = (value) => {
  let text = String(value);
  for (const actor of Object.values(actors))
    for (const secret of [actor.email, actor.password])
      text = text.replaceAll(secret, "[REDACTED]");
  for (const secret of extraSecrets)
    text = text.replaceAll(secret, "[REDACTED]");
  return text
    .replace(/[A-Za-z0-9_-]{43,}/g, "[REDACTED_OPAQUE]")
    .slice(0, 2500);
};
const packagePath =
  process.env.QA_PLAYWRIGHT_PACKAGE ??
  "/Users/awmccuen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json";
const require = createRequire(packagePath);
const { chromium } = require("playwright");
const installedBrowser = join(
  process.env.HOME,
  "Library/Caches/ms-playwright/chromium_headless_shell-1194/chrome-mac/headless_shell"
);
const executablePath =
  process.env.QA_CHROMIUM_PATH ??
  (existsSync(chromium.executablePath())
    ? chromium.executablePath()
    : installedBrowser);
assert.ok(
  existsSync(executablePath),
  "An installed Chromium is required; this script never downloads browsers"
);
const publicKey = execFileSync("openssl", [
  "x509",
  "-in",
  join(runDir, "localhost-cert.pem"),
  "-pubkey",
  "-noout"
]);
const der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], {
  input: publicKey
});
const pin = createHash("sha256").update(der).digest("base64");
const report = {
  origin,
  startedAt: new Date().toISOString(),
  browser: "",
  checks: [],
  layouts: [],
  keyboard: [],
  blockedExternalRequests: 0,
  pageErrors: [],
  demoNetworkAttempts: [],
  demoPages: [],
  screenshots: []
};
const sessions = new Map();
const only = process.env.QA_ONLY ?? "";
assert.ok(["", "keyboard", "account", "demo"].includes(only));
let browser;
let churchId;
let sequence = 0;
function saveReport() {
  writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2), {
    mode: 0o600
  });
}
async function evidence(page, label, fullPage = true) {
  if (!page || page.isClosed()) return;
  const name = `${String(++sequence).padStart(2, "0")}-${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
  await page.screenshot({
    path: join(output, name),
    fullPage,
    mask: [page.locator('input[type="password"], input[name="email"]')]
  });
  report.screenshots.push(name);
}
async function check(name, action, page) {
  const started = Date.now();
  try {
    await action();
    report.checks.push({
      name,
      status: "passed",
      durationMs: Date.now() - started
    });
    console.log(`PASS ${name}`);
    return true;
  } catch (error) {
    report.checks.push({
      name,
      status: "failed",
      durationMs: Date.now() - started,
      message: sanitize(error.message)
    });
    console.log(`FAIL ${name}: ${sanitize(error.message)}`);
    await evidence(page, `failure-${name}`).catch(() => {});
    return false;
  } finally {
    saveReport();
  }
}
async function contextPage(mobile = false, demo = false) {
  const context = await browser.newContext({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: false
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      report.blockedExternalRequests++;
      await route.abort();
    } else if (
      demo &&
      (url.pathname.startsWith("/api/") ||
        !["GET", "HEAD"].includes(route.request().method()))
    ) {
      report.demoNetworkAttempts.push({
        path: url.pathname,
        method: route.request().method()
      });
      await route.abort();
    } else await route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) =>
    report.pageErrors.push(sanitize(error.message))
  );
  return { context, page };
}
async function go(page, path) {
  assert.ok(
    path.startsWith("/platform"),
    "QA navigation stays within the synthetic portal"
  );
  const response = await page.goto(origin + path, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200, "Local page loads successfully");
}
async function submit(
  page,
  form,
  label,
  operation,
  endpoint = "portal",
  expected = 200,
  keyboard = false
) {
  const responsePromise = page.waitForResponse((response) => {
    if (
      new URL(response.url()).pathname !== `/api/platform/${endpoint}` ||
      response.request().method() !== "POST"
    )
      return false;
    try {
      return response.request().postDataJSON().operation === operation;
    } catch {
      return false;
    }
  });
  const button = form.getByRole("button", { name: label, exact: true });
  if (keyboard) {
    await button.focus();
    await page.keyboard.press("Enter");
  } else await button.click();
  const response = await responsePromise;
  assert.equal(
    response.status(),
    expected,
    `${operation}: expected HTTP outcome`
  );
  await page.waitForLoadState("networkidle");
  return response;
}
async function login(role, mobile = false, suppliedPassword) {
  const session = await contextPage(mobile);
  await go(session.page, "/platform/login");
  const form = session.page.locator("form").filter({
    has: session.page.getByRole("heading", { name: "Sign in", exact: true })
  });
  await form.getByLabel("Email", { exact: true }).fill(actors[role].email);
  await form
    .getByLabel("Password", { exact: true })
    .fill(suppliedPassword ?? actors[role].password);
  await submit(session.page, form, "Sign in", "login", "account", 200, true);
  await session.page.waitForURL(origin + "/platform");
  return session;
}
async function getSession(role, mobile = false) {
  const key = `${role}-${mobile}`;
  if (!sessions.has(key)) sessions.set(key, await login(role, mobile));
  return sessions.get(key);
}
async function portalSubmit(page, label, operation, confirmation = false) {
  const form = page.getByRole("form", { name: label, exact: true });
  if (confirmation) await form.getByRole("checkbox").check();
  await submit(page, form, label, operation, "portal", 200, true);
}
async function layout(page, name) {
  await page.locator("main").waitFor();
  const result = await page.evaluate(() => {
    const visible = (element) => element.getClientRects().length > 0;
    const fields = [
      ...document.querySelectorAll("input:not([type=hidden]), select, textarea")
    ].filter(visible);
    const unlabelled = fields
      .filter(
        (el) =>
          !el.labels?.length &&
          !el.getAttribute("aria-label") &&
          !el.getAttribute("aria-labelledby")
      )
      .map((el) => el.tagName + ":" + (el.getAttribute("name") || ""));
    const overflow = [...document.querySelectorAll("body *")]
      .filter(visible)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.width > 0 &&
          (r.left < -1 || r.right > innerWidth + 1) &&
          getComputedStyle(el).position !== "absolute"
        );
      })
      .slice(0, 8)
      .map((el) => ({
        tag: el.tagName,
        role: el.getAttribute("role"),
        class: el.className?.toString().slice(0, 100)
      }));
    return {
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      mains: document.querySelectorAll("main").length,
      platformNavs: document.querySelectorAll('nav[aria-label="Platform"]')
        .length,
      unlabelled,
      overflow
    };
  });
  report.layouts.push({ name, ...result });
  assert.equal(result.mains, 1, "One main landmark after hydration");
  assert.equal(result.platformNavs, 1, "One labelled platform navigation");
  assert.equal(
    result.unlabelled.length,
    0,
    "Visible form controls have associated labels"
  );
  assert.ok(
    result.scrollWidth <= result.width + 1,
    "No horizontal page overflow"
  );
  assert.equal(
    await page
      .getByRole("link", { name: "Join Waitlist", exact: true })
      .count(),
    0
  );
  await evidence(page, name);
}
async function keyboardAudit(page, name) {
  const applyCandidate = async () => {
    if (process.env.QA_VERIFY_SCROLL_FIX === "1")
      await page.addStyleTag({
        content: `
      @media (max-width: 767px) {
        html:has(#platform-content) { scroll-padding-bottom: calc(6rem + env(safe-area-inset-bottom)); }
        #platform-content :is(a, button, input, select, textarea, [tabindex]) { scroll-margin-block: 1rem; }
      }
    `
      });
  };
  await go(page, "/platform/my-church");
  await applyCandidate();
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement?.textContent?.trim()),
    "Skip to content",
    "Skip link is first keyboard target"
  );
  await page.keyboard.press("Enter");
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    "platform-content",
    "Skip link moves focus to main"
  );
  await go(page, "/platform/my-church/sharing");
  await applyCandidate();
  const stops = [];
  for (let i = 0; i < 18; i++) {
    await page.keyboard.press("Tab");
    stops.push(
      await page.evaluate(() => {
        const el = document.activeElement;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const x = Math.min(
          innerWidth - 1,
          Math.max(0, rect.left + rect.width / 2)
        );
        const y = Math.min(
          innerHeight - 1,
          Math.max(0, rect.top + rect.height / 2)
        );
        const top = document.elementFromPoint(x, y);
        return {
          tag: el.tagName,
          name:
            el.getAttribute("name") ||
            el.getAttribute("aria-label") ||
            el.textContent?.trim().slice(0, 45),
          visible: rect.width > 0 && rect.height > 0,
          covered: !(top === el || el.contains(top)),
          bounds: {
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right
          },
          viewport: { width: innerWidth, height: innerHeight },
          coveringElement: {
            tag: top?.tagName,
            nav: top?.closest("nav")?.getAttribute("aria-label") ?? null
          },
          focusStyle:
            (style.outlineStyle !== "none" &&
              parseFloat(style.outlineWidth) > 0) ||
            style.boxShadow !== "none"
        };
      })
    );
    if (stops.at(-1).covered)
      await evidence(page, `${name}-covered-${stops.at(-1).name}`, false);
  }
  report.keyboard.push({
    name,
    injectedCandidateCss: process.env.QA_VERIFY_SCROLL_FIX === "1",
    stops
  });
  assert.ok(
    stops.every((stop) => stop.visible),
    "Keyboard never focuses a visually hidden control"
  );
  assert.ok(
    stops.every((stop) => !stop.covered),
    "Focused controls are not covered by fixed navigation"
  );
  assert.ok(
    stops.every((stop) => stop.focusStyle),
    "Every keyboard stop has a visible focus indicator"
  );
  await evidence(page, name);
}

async function demoAudit() {
  const { demoViews, demoFixture, DEMO_NOTICE, DEMO_ROOT } =
    await import("../lib/platform/demo-fixtures.ts");
  for (const width of [1440, 390, 320]) {
    const session = await contextPage(width < 768, true);
    const { page, context } = session;
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    await check(
      `Signed-out read-only demo: overview and seven routes at ${width}px`,
      async () => {
        const routes = [{ slug: "", title: "Overview" }, ...demoViews];
        for (const route of routes) {
          const path = route.slug ? `${DEMO_ROOT}/${route.slug}` : DEMO_ROOT;
          let response;
          if (!route.slug)
            response = await page.goto(origin + path, {
              waitUntil: "networkidle"
            });
          else {
            [response] = await Promise.all([
              page.waitForResponse(
                (value) =>
                  new URL(value.url()).pathname === path &&
                  value.request().resourceType() === "document"
              ),
              page
                .getByRole("navigation", { name: "Demo views", exact: true })
                .getByRole("link", { name: route.title, exact: true })
                .click()
            ]);
            await page.waitForURL(origin + path);
            await page.waitForLoadState("networkidle");
          }
          assert.equal(
            response.status(),
            200,
            "Demo loads without authentication"
          );
          assert.equal(
            Boolean(response.headers()["set-cookie"]),
            false,
            "Demo never creates a session cookie"
          );
          assert.ok(
            (response.headers()["x-robots-tag"] ?? "").includes("noindex")
          );
          const raw = await response.text();
          assert.ok(
            raw.includes(DEMO_NOTICE) && raw.includes(demoFixture.church.name),
            "Every demo page identifies its fictional church"
          );
          for (const actor of Object.values(actors)) {
            for (const privateValue of [
              actor.name,
              actor.email,
              actor.password
            ])
              assert.ok(
                !raw.includes(privateValue),
                "Demo response never includes an actual fixture account"
              );
          }
          assert.ok(
            !/passwordHash|tokenHash|credentialVersion|church_platform_session|\/api\/platform\/|\$ACTION_/.test(
              raw
            ),
            "Demo HTML and embedded payload have no authentication or live-action references"
          );
          const heading = route.slug
            ? `${route.title} demo`
            : "Explore the church portal";
          await page
            .getByRole("heading", { name: heading, exact: true })
            .waitFor();
          assert.equal(await page.locator("main#demo-content").count(), 1);
          assert.equal(await page.locator("main").count(), 1);
          assert.equal(
            await page.locator("form").count(),
            0,
            "Demo has no submitting forms"
          );
          assert.equal(
            await page.locator('a[href^="mailto:"],a[href^="tel:"]').count(),
            0,
            "Example contacts are not live communication actions"
          );
          const controls = await page
            .locator("button,input,select,textarea")
            .evaluateAll((elements) =>
              elements.map((element) => ({
                disabled: element.matches(":disabled"),
                readOnly: element.readOnly === true
              }))
            );
          assert.ok(
            controls.every((control) => control.disabled || control.readOnly),
            "Every example control is disabled or read-only"
          );
          assert.equal(
            (await context.cookies()).filter(
              (cookie) => cookie.name === "church_platform_session"
            ).length,
            0
          );
          const dimensions = await page.evaluate(() => ({
            width: innerWidth,
            scrollWidth: document.documentElement.scrollWidth
          }));
          assert.ok(
            dimensions.scrollWidth <= dimensions.width + 1,
            "Demo has no horizontal overflow"
          );
          report.demoPages.push({
            path,
            width,
            heading,
            controls: controls.length,
            signedOut: true,
            ...dimensions
          });
          await evidence(page, `demo-${width}-${route.slug || "overview"}`);
        }
        await go(page, DEMO_ROOT);
        await page.keyboard.press("Tab");
        assert.equal(
          await page.evaluate(() =>
            document.activeElement?.textContent?.trim()
          ),
          "Skip to demo content"
        );
        await page.keyboard.press("Enter");
        assert.equal(
          await page.evaluate(() => document.activeElement?.id),
          "demo-content"
        );
        await go(page, `${DEMO_ROOT}/sharing`);
        for (let i = 0; i < 14; i++) {
          await page.keyboard.press("Tab");
          assert.equal(
            await page.evaluate(
              () =>
                document.activeElement?.matches(
                  "button,input,select,textarea"
                ) ?? false
            ),
            false,
            "Disabled demo actions are excluded from keyboard navigation"
          );
        }
        assert.equal(
          report.demoNetworkAttempts.length,
          0,
          "Demo never attempts a live API request or mutation"
        );
      },
      page
    );
    await context.close();
  }
}

try {
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: [`--ignore-certificate-errors-spki-list=${pin}`]
  });
  report.browser = browser.version();
  if (only === "demo") {
    await demoAudit();
  } else if (only === "keyboard") {
    const mobile = await getSession("coordinat", true);
    await mobile.page.setViewportSize({ width: 320, height: 844 });
    await check(
      "320px keyboard focus and fixed mobile navigation",
      () => keyboardAudit(mobile.page, "mobile-keyboard"),
      mobile.page
    );
  } else {
    if (only !== "account") {
      await demoAudit();
      const coordinator = await getSession("coordinat");
      await go(coordinator.page, "/platform/my-church");
      const link = await coordinator.page
        .getByRole("link", { name: "Member directory", exact: true })
        .getAttribute("href");
      churchId = link.match(/^\/platform\/churches\/([^/]+)\/directory$/)?.[1];
      assert.ok(churchId);
      await check(
        "Desktop navigation, contacts and directory",
        async () => {
          for (const [path, title] of [
            ["/platform/my-church", "My church"],
            ["/platform/my-church/sharing", "My sharing"],
            [`/platform/churches/${churchId}/directory`, "Member directory"],
            ["/platform/help", "Help and contacts"]
          ]) {
            await go(coordinator.page, path);
            await coordinator.page
              .getByRole("heading", { name: title, exact: true })
              .waitFor();
            await layout(coordinator.page, `desktop-${title}`);
          }
          assert.ok(
            (await coordinator.page.locator("main").innerText()).includes(
              actors.contact.name
            )
          );
          assert.ok(
            (await coordinator.page.locator("main").innerText()).includes(
              actors.rel_owner.name
            )
          );
          await coordinator.page
            .getByRole("navigation", { name: "Platform", exact: true })
            .getByRole("link", { name: "My church", exact: true })
            .click();
          await coordinator.page.waitForURL(origin + "/platform/my-church");
        },
        coordinator.page
      );
      await check(
        "Desktop keyboard skip link, focus and unobscured controls",
        () => keyboardAudit(coordinator.page, "desktop-keyboard"),
        coordinator.page
      );
      const memberB = await getSession("member_b");
      const reviewerB = await getSession("review_b");
      await check(
        "Cross-church directory and review denied in real browser",
        async () => {
          for (const [page, suffix] of [
            [memberB.page, "directory"],
            [reviewerB.page, "review"]
          ]) {
            await go(page, `/platform/churches/${churchId}/${suffix}`);
            await page
              .getByRole("heading", {
                name: "Access not available",
                exact: true
              })
              .waitFor();
            const body = await page.locator("main").innerText();
            assert.ok(
              !body.includes(actors.pending.name) &&
                !body.includes(actors.contact.name)
            );
            await evidence(page, `denied-${suffix}`);
          }
        },
        memberB.page
      );
      const reviewer = await getSession("review_a");
      const pending = await getSession("pending", true);
      await check(
        "Real mobile request, desktop review, sharing consent and contacts workflow",
        async () => {
          await go(pending.page, "/platform/my-church");
          await portalSubmit(
            pending.page,
            "Withdraw request",
            "transition",
            true
          );
          await go(pending.page, `/platform/churches/${churchId}`);
          await portalSubmit(
            pending.page,
            "Request connection again",
            "request"
          );
          await go(pending.page, `/platform/churches/${churchId}/directory`);
          await pending.page
            .getByRole("heading", { name: "Access not available" })
            .waitFor();
          await go(reviewer.page, `/platform/churches/${churchId}/review`);
          const card = reviewer.page
            .locator("section, article, div")
            .filter({
              has: reviewer.page.getByRole("heading", {
                name: actors.pending.name,
                exact: true
              })
            })
            .filter({
              has: reviewer.page.getByRole("form", {
                name: "Approve connection",
                exact: true
              })
            });
          const form = card
            .last()
            .getByRole("form", { name: "Approve connection", exact: true });
          await submit(
            reviewer.page,
            form,
            "Approve connection",
            "transition",
            "portal",
            200,
            true
          );
          await go(pending.page, "/platform/my-church/sharing");
          const sharing = pending.page.getByRole("form", {
            name: "Save sharing choices"
          });
          const displayName = `Fictional browser QA ${randomBytes(3).toString("hex")}`;
          const contactEmail = `fictional-browser-${randomBytes(3).toString("hex")}@example.test`;
          await sharing
            .getByLabel("Include me in my church's member directory", {
              exact: true
            })
            .check();
          await sharing
            .getByLabel("Directory display name", { exact: false })
            .fill(displayName);
          await sharing
            .getByLabel("Directory contact email", { exact: true })
            .fill(contactEmail);
          await sharing
            .getByLabel("Who can see this email?", { exact: true })
            .selectOption("ONLY_ME");
          await sharing
            .getByLabel("Directory phone number", { exact: true })
            .fill("+1 202 555 0119");
          await sharing
            .getByLabel("Who can see this phone number?", { exact: true })
            .selectOption("ONLY_ME");
          await submit(
            pending.page,
            sharing,
            "Save sharing choices",
            "share",
            "portal",
            200,
            true
          );
          await go(
            coordinator.page,
            `/platform/churches/${churchId}/directory`
          );
          assert.ok(
            (await coordinator.page.locator("main").innerText()).includes(
              displayName
            )
          );
          assert.ok(
            !(await coordinator.page.locator("main").innerText()).includes(
              contactEmail
            )
          );
          await sharing
            .getByLabel("Who can see this email?", { exact: true })
            .selectOption("SAME_CHURCH");
          await submit(
            pending.page,
            sharing,
            "Save sharing choices",
            "share",
            "portal",
            200,
            true
          );
          await go(
            coordinator.page,
            `/platform/churches/${churchId}/directory`
          );
          assert.ok(
            (await coordinator.page.locator("main").innerText()).includes(
              contactEmail
            )
          );
          await evidence(coordinator.page, "consented-directory");
          await go(pending.page, "/platform/help");
          assert.ok(
            (await pending.page.locator("main").innerText()).includes(
              actors.contact.name
            )
          );
          await layout(pending.page, "mobile-approved-contacts");
          await go(pending.page, "/platform/my-church");
          await portalSubmit(
            pending.page,
            "Leave this church",
            "transition",
            true
          );
          await go(
            coordinator.page,
            `/platform/churches/${churchId}/directory`
          );
          assert.ok(
            !(await coordinator.page.locator("main").innerText()).includes(
              displayName
            )
          );
          await go(pending.page, `/platform/churches/${churchId}`);
          await portalSubmit(
            pending.page,
            "Request connection again",
            "request"
          );
          await go(pending.page, "/platform/my-church");
          await pending.page
            .getByText("Awaiting review", { exact: true })
            .waitFor();
        },
        pending.page
      );
      const mobile = await getSession("coordinat", true);
      await check(
        "390px and 320px mobile pages, labels, nav and overflow",
        async () => {
          for (const width of [390, 320]) {
            await mobile.page.setViewportSize({ width, height: 844 });
            for (const [suffix, label] of [
              ["/my-church", "church"],
              ["/my-church/sharing", "sharing"],
              [`/churches/${churchId}/directory`, "directory"],
              ["/help", "contacts"]
            ]) {
              await go(mobile.page, "/platform" + suffix);
              await layout(mobile.page, `mobile-${width}-${label}`);
            }
            await mobile.page
              .getByRole("navigation", { name: "Platform", exact: true })
              .getByRole("link", { name: "My church", exact: true })
              .tap();
            await mobile.page.waitForURL(origin + "/platform/my-church");
          }
        },
        mobile.page
      );
      await check(
        "320px keyboard focus and fixed mobile navigation",
        () => keyboardAudit(mobile.page, "mobile-keyboard"),
        mobile.page
      );
      const operator = await getSession("operator", true);
      await check(
        "Operator controls render on narrow mobile without overflow",
        async () => {
          await operator.page.setViewportSize({ width: 320, height: 844 });
          await go(operator.page, "/platform/operator/churches");
          await layout(operator.page, "mobile-operator");
        },
        operator.page
      );
      const unverified = await getSession("unverify", true);
      await check(
        "Unverified account cannot request private membership",
        async () => {
          await go(unverified.page, `/platform/churches/${churchId}`);
          assert.equal(
            await unverified.page
              .getByRole("button", {
                name: "Request church connection",
                exact: true
              })
              .isDisabled(),
            true
          );
          await unverified.page
            .getByRole("link", {
              name: "Verify your account email",
              exact: true
            })
            .waitFor();
          await evidence(unverified.page, "unverified-denial");
        },
        unverified.page
      );
      const anonymous = await contextPage(true);
      await check(
        "Production recovery is truthfully disabled with no submit control",
        async () => {
          await go(anonymous.page, "/platform/account/recover");
          await anonymous.page
            .getByText(
              "Email recovery and verification are not available yet.",
              {
                exact: false
              }
            )
            .waitFor();
          assert.equal(
            await anonymous.page
              .getByRole("button", {
                name: /Request a password reset|Verify my email/
              })
              .count(),
            0
          );
          await evidence(anonymous.page, "recovery-disabled");
        },
        anonymous.page
      );
    }
    const account = await getSession("member_a");
    await check(
      "Real sign-in and password change revoke sessions; original fictional password restored",
      async () => {
        const oldSession = await login("member_a");
        const replacement = `Fictional-browser-${randomBytes(12).toString("hex")}`;
        extraSecrets.push(replacement);
        const recoveryFile = join(output, "fictional-login-recovery.json");
        writeFileSync(
          recoveryFile,
          JSON.stringify({
            email: actors.member_a.email,
            candidatePassword: replacement,
            note: "Temporary fictional password recorded before mutation; reset to PREVIEW.md password is attempted at completion."
          }),
          { mode: 0o600 }
        );
        let changed = false;
        const change = async (page, currentPassword, newPassword, accepted) => {
          await go(page, "/platform/settings");
          const form = page.locator("form").filter({
            has: page.getByRole("heading", {
              name: "Change password",
              exact: true
            })
          });
          await form
            .getByLabel("Current password", { exact: true })
            .fill(currentPassword);
          await form
            .getByLabel("New password", { exact: true })
            .fill(newPassword);
          await form
            .getByLabel("Confirm password", { exact: true })
            .fill(newPassword);
          await submit(
            page,
            form,
            "Change password",
            "change-password",
            "account",
            200,
            true
          );
          accepted();
          await page.waitForURL(
            (url) => url.origin === origin && url.pathname === "/platform/login"
          );
        };
        try {
          await change(
            account.page,
            actors.member_a.password,
            replacement,
            () => {
              changed = true;
            }
          );
          await go(oldSession.page, "/platform/settings");
          assert.equal(
            new URL(oldSession.page.url()).pathname,
            "/platform/login"
          );
          const fresh = await login("member_a", false, replacement);
          await change(
            fresh.page,
            replacement,
            actors.member_a.password,
            () => {
              changed = false;
            }
          );
          await fresh.context.close();
          const restored = await login("member_a");
          await restored.context.close();
        } finally {
          await oldSession.context.close();
          if (changed) {
            try {
              const restore = await login("member_a", false, replacement);
              await change(
                restore.page,
                replacement,
                actors.member_a.password,
                () => {
                  changed = false;
                }
              );
              await restore.context.close();
            } catch {
              /* The ignored recovery file retains the synthetic candidate, never a session token. */
            }
          }
          if (changed)
            writeFileSync(
              join(output, "fictional-login-recovery.json"),
              JSON.stringify({
                email: actors.member_a.email,
                currentPassword: replacement,
                note: "Password change succeeded but restoration was not confirmed. Synthetic local account only."
              }),
              { mode: 0o600 }
            );
          else
            writeFileSync(
              recoveryFile,
              JSON.stringify({ restoredToPreviewPassword: true }),
              { mode: 0o600 }
            );
        }
      },
      account.page
    );
  }
} catch (error) {
  report.checks.push({
    name: "Browser QA setup/execution",
    status: "failed",
    message: sanitize(error.message)
  });
  console.log(`FAIL Browser setup/execution: ${sanitize(error.message)}`);
} finally {
  await browser?.close();
  report.finishedAt = new Date().toISOString();
  saveReport();
  console.log(`Browser evidence: ${output}`);
  console.log(
    `Checks passed: ${report.checks.filter((c) => c.status === "passed").length}; failed: ${report.checks.filter((c) => c.status === "failed").length}; page errors: ${report.pageErrors.length}`
  );
  process.exitCode =
    report.checks.some((c) => c.status === "failed") || report.pageErrors.length
      ? 1
      : 0;
}
