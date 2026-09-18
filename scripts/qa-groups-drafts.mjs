import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
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
  results = [],
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
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const go = async (path) => {
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
  await page.locator("main").first().waitFor({ state: "visible" });
  await page.waitForFunction(
    () => document.querySelectorAll("main").length === 1
  );
  return response;
};
try {
  const { owner, slug } = JSON.parse(
    readFileSync(fixtureDir + "/latest-group-actors.json")
  );
  const group = await db.gatherGroup.findUniqueOrThrow({ where: { slug } });
  const base = "/platform/groups/" + slug;
  await go(base + "/discussion");
  await page
    .locator("main")
    .getByRole("link", { name: "Sign in", exact: true })
    .click();
  await page.waitForURL((u) => u.pathname === "/platform/login");
  assert.equal(
    new URL(page.url()).searchParams.get("next"),
    base + "/discussion"
  );
  await page.getByLabel("Email", { exact: true }).fill(owner.email);
  await page.getByLabel("Password", { exact: true }).fill(owner.password);
  await page
    .locator("main")
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await page.waitForURL((u) => u.pathname === base + "/discussion");
  await page
    .getByRole("heading", { name: "Group discussions", exact: true })
    .waitFor();
  ok(
    "Actual password sign-in returns to the intended private group discussion"
  );
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/platform");
  await page
    .getByRole("button", { name: "Share what's on your heart", exact: true })
    .click();
  const composer = page.getByRole("form", {
      name: "Publish post",
      exact: true
    }),
    marker = "Fictional original public draft " + randomUUID();
  await composer.getByLabel("Post content", { exact: true }).fill(marker);
  await composer
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await page.getByText("Saved privately.", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Close composer", exact: true })
    .click();
  await page.waitForFunction(() => !history.state?.gcPhotoWork);
  await page.getByRole("link", { name: "Menu", exact: true }).click();
  await page.getByRole("link", { name: /^Gather groups / }).click();
  await page.getByRole("link", { name: "My choices", exact: true }).click();
  await page.getByRole("link", { name: group.name, exact: true }).click();
  await page
    .getByRole("link", { name: "Group discussions", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Start a private group discussion",
      exact: true
    })
    .click();
  await page.getByText(/Your current draft belongs elsewhere/).waitFor();
  assert.equal(
    await composer.getByLabel("Post content", { exact: true }).inputValue(),
    marker
  );
  if (process.argv.includes("--repro")) {
    assert.equal(
      await page
        .getByRole("button", { name: /Start a separate group draft/ })
        .count(),
      0
    );
    ok(
      "Reproduced: a saved public draft blocks group composition without an in-place separate-draft action"
    );
  } else {
    await page
      .getByRole("button", {
        name: "Start a separate group draft",
        exact: true
      })
      .click();
    await page
      .getByText(
        new RegExp(
          "Private discussion in " +
            group.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        )
      )
      .waitFor();
    assert.equal(
      await composer.getByLabel("Post content", { exact: true }).inputValue(),
      ""
    );
    const original = await db.privatePostDraft.findFirstOrThrow({
      where: {
        ownerId: owner.id,
        payload: { path: ["content"], equals: marker }
      }
    });
    assert.equal(original.groupId, null);
    assert.equal(original.payload.audience, "PUBLIC");
    await composer
      .getByLabel("Post content", { exact: true })
      .fill("Fictional separate private group draft");
    await composer
      .getByRole("button", { name: "Save draft", exact: true })
      .click();
    await page.getByText("Saved privately.", { exact: true }).waitFor();
    const fresh = await db.privatePostDraft.findFirstOrThrow({
      where: {
        ownerId: owner.id,
        groupId: group.id,
        payload: {
          path: ["content"],
          equals: "Fictional separate private group draft"
        }
      }
    });
    assert.notEqual(original.id, fresh.id);
    assert.equal(fresh.payload.audience, "GROUP");
    ok(
      "Starting a separate group draft preserves the original saved draft and fixes the new immutable private destination"
    );
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/receipt.json",
    JSON.stringify({ results, errors, at: new Date().toISOString() })
  );
  console.log("OUTPUT " + output);
} catch (error) {
  writeFileSync(
    output + "/failure.txt",
    await page.locator("body").innerText()
  );
  writeFileSync(
    output + "/failure.json",
    JSON.stringify({ error: String(error), errors })
  );
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
