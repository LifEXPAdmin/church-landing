import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the existing isolated Exchange preview directory");
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.match(config.localOrigin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.localOrigin,
  NEXT_PUBLIC_SITE_URL: config.localOrigin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + fixtureDir + "/sink",
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: "",
  PRIVILEGED_MFA_MODE: "enroll",
  COMMUNITY_REPORTS_ENABLED: "true",
  BLOB_READ_WRITE_TOKEN: "",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  MEDIA_STORAGE_MODE: "local-test",
  RETENTION_TEST_DIR: process.cwd() + "/" + fixtureDir + "/retention",
  MEDIA_TEST_DIR: process.cwd() + "/" + fixtureDir + "/images"
});
const { PrismaClient } = await import("@prisma/client");
const { createPortalActor, assertPortalTestDatabase } =
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
      createHash("sha256").update(der).digest("base64"),
    "--host-resolver-rules=MAP exchange-fixture.example.test 127.0.0.1",
    "--no-proxy-server"
  ]
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true
});
await context.route("**/*", (route) =>
  new URL(route.request().url()).hostname === "127.0.0.1"
    ? route.continue()
    : route.abort()
);
context.setDefaultTimeout(15000);
const page = await context.newPage(),
  errors = [],
  output = fixtureDir + "/groups-browser-" + Date.now();
mkdirSync(output, { recursive: true });
await page.addInitScript(() => {
  window.__groupHistory = [];
  const record = (kind) =>
    window.__groupHistory.push({
      kind,
      at: Date.now(),
      state: history.state,
      path: location.pathname
    });
  for (const name of ["back", "pushState", "replaceState"]) {
    const original = history[name].bind(history);
    history[name] = (...args) => {
      record(name);
      return original(...args);
    };
  }
  window.addEventListener("popstate", () => record("popstate capture"), true);
  window.addEventListener("popstate", () => {
    record("popstate bubble");
    requestAnimationFrame(() => record("popstate frame"));
    setTimeout(() => record("popstate timeout"), 0);
  });
});
page.on("pageerror", (e) =>
  errors.push({ path: new URL(page.url()).pathname, message: e.message })
);
page.on("dialog", (dialog) => dialog.accept());
const requests = [];
page.on("request", (r) => {
  const u = new URL(r.url());
  if (u.pathname.includes("groups"))
    requests.push({
      kind: "request",
      method: r.method(),
      path: u.pathname,
      query: u.search,
      at: Date.now()
    });
});
page.on("requestfailed", (r) => {
  const u = new URL(r.url());
  requests.push({
    kind: "failed",
    path: u.pathname,
    error: r.failure(),
    at: Date.now()
  });
});
page.on("response", async (r) => {
  const u = new URL(r.url());
  if (u.pathname.includes("groups")) {
    const entry = {
      kind: "response",
      status: r.status(),
      path: u.pathname,
      query: u.search,
      at: Date.now()
    };
    requests.push(entry);
    if (u.searchParams.has("_rsc"))
      try {
        writeFileSync(output + "/rsc-" + Date.now() + ".txt", await r.text());
      } catch {}
  }
});
const go = async (path) => {
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
  await page.locator("main").first().waitFor({ state: "visible" });
  await page.waitForFunction(
    () => document.querySelectorAll("main").length === 1
  );
  return response;
};
const signIn = async (actor) => {
  await context.clearCookies();
  if (actor)
    await context.addCookies([
      {
        name: "church_platform_session",
        value: actor.token,
        url: config.origin,
        secure: true,
        httpOnly: true,
        sameSite: "Lax"
      }
    ]);
};
try {
  const previous = JSON.parse(
    readFileSync(fixtureDir + "/latest-group-actors.json")
  );
  const group = await db.gatherGroup.findUniqueOrThrow({
    where: { slug: previous.slug }
  });
  for (let i = 0; i < 12; i++) {
    requests.length = 0;
    const actor = await createPortalActor(db, "refreshprobe");
    await signIn(actor);
    await go("/platform/groups?q=" + encodeURIComponent(group.name));
    await page.getByRole("link", { name: group.name, exact: true }).click();
    await page.waitForURL(
      (u) => u.pathname === "/platform/groups/" + group.slug
    );
    const form = page.getByRole("form", {
      name: "Request membership",
      exact: true
    });
    await form
      .getByLabel("I have read and accept the current group rules", {
        exact: true
      })
      .check();
    await page.evaluate(() => history.back());
    await page
      .getByText("Save or resolve your private choice before leaving.", {
        exact: true
      })
      .waitFor();
    assert.equal(
      await form
        .getByLabel("I have read and accept the current group rules", {
          exact: true
        })
        .isChecked(),
      true
    );
    let lost = false;
    const lose = async (route) => {
      if (
        route.request().method() === "POST" &&
        route.request().postDataJSON()?.operation === "join" &&
        !lost
      ) {
        lost = true;
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    };
    await page.route("**/api/platform/groups", lose);
    await form
      .getByRole("button", { name: "Request membership", exact: true })
      .click();
    await form
      .getByRole("button", { name: "Confirm original save", exact: true })
      .click();
    await page.unroute("**/api/platform/groups", lose);
    await page
      .getByText("Your membership: pending.", { exact: true })
      .waitFor({ timeout: 4000 });
    await page.waitForFunction(() => !history.state?.gcPhotoWork);
    await page.evaluate(() => history.back());
    await page.waitForURL((u) => u.pathname === "/platform/groups");
    console.log("PASS refresh iteration " + i);
  }
  console.log("OUTPUT " + output);
} catch (error) {
  writeFileSync(output + "/requests.json", JSON.stringify(requests));
  writeFileSync(
    output + "/history.json",
    JSON.stringify(await page.evaluate(() => window.__groupHistory))
  );
  writeFileSync(
    output + "/failure.json",
    JSON.stringify({ message: String(error), url: page.url(), errors })
  );
  writeFileSync(output + "/failure.html", await page.content());
  writeFileSync(
    output + "/failure.txt",
    await page.locator("body").innerText()
  );
  await page.screenshot({ path: output + "/failure.png", fullPage: true });
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
