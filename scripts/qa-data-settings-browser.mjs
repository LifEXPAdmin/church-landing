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
  timezoneId: "America/Chicago",
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
const output = fixtureDir + "/data-settings-browser";
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

const { createPortalActor } = await import("../tests/seed-portal.ts");
const { randomUUID } = await import("node:crypto");
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
try {
  const a = await createPortalActor(db, "datafolder"),
    b = await createPortalActor(db, "dataother");
  const ownDraft = await db.privatePostDraft.create({
    data: {
      ownerId: a.id,
      id: randomUUID(),
      payload: {
        content: "Private Data draft",
        replyAudience: "CHURCH_MEMBERS"
      }
    }
  });
  await db.photoAlbum.create({
    data: { ownerId: a.id, name: "Private Data album" }
  });
  await db.photoAlbum.create({
    data: { ownerId: b.id, name: "Other account secret album" }
  });
  const writes = [];
  page.on("request", (r) => {
    if (r.method() !== "GET")
      writes.push({ method: r.method(), url: new URL(r.url()).pathname });
  });
  await signIn(a);
  await go("/platform/settings/data");
  const permissions = page.getByRole("region", {
    name: "Browser permissions",
    exact: true
  });
  await permissions.waitFor();
  await page.waitForFunction(
    () =>
      !document
        .querySelector("#browser-permissions")
        ?.textContent.includes("Checking this browser")
  );
  for (const name of ["camera", "microphone", "geolocation"])
    assert.match(
      await page.locator('[data-permission="' + name + '"]').innerText(),
      /Allowed by this browser|Blocked by this browser|Ask before use|Not reported by this browser/
    );
  assert.equal(
    await page.getByRole("button", { name: /Delete account/i }).count(),
    0
  );
  await page
    .getByRole("region", { name: "Take a break from your account" })
    .getByRole("link", { name: /Deactivate account/ })
    .waitFor();
  await page
    .getByText("How to change browser permissions", { exact: true })
    .click();
  for (const name of [
    "Chrome permission help",
    "Safari on iPhone privacy help",
    "Safari website settings help"
  ])
    assert.match(
      await page.getByRole("link", { name, exact: true }).getAttribute("href"),
      /^https:\/\/(support.google.com|support.apple.com)\//
    );
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "32px")
    );
    await bounded();
    await page.screenshot({
      path: output + "/data-" + width + ".png",
      fullPage: true
    });
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  }
  assert.deepEqual(writes, []);
  ok(
    "Real browser permission reads and Data links fit 320/390/1440px doubled text; closure is separate and overview makes no writes"
  );

  await page.addInitScript(() => {
    const states = {
      camera: "granted",
      microphone: "denied",
      geolocation: "prompt"
    };
    const results = {};
    window.permissionFixture = {
      states,
      results,
      queries: [],
      requests: 0,
      unsupported: false
    };
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: {
        query: async ({ name }) => {
          window.permissionFixture.queries.push(name);
          if (window.permissionFixture.unsupported)
            throw new TypeError("Unsupported permission");
          const status = new EventTarget();
          Object.defineProperty(status, "state", { get: () => states[name] });
          results[name] = status;
          return status;
        }
      }
    });
    if (navigator.mediaDevices)
      navigator.mediaDevices.getUserMedia = async () => {
        window.permissionFixture.requests++;
        throw new Error("Hardware must not be requested");
      };
    navigator.geolocation.getCurrentPosition = () => {
      window.permissionFixture.requests++;
    };
    navigator.geolocation.watchPosition = () => {
      window.permissionFixture.requests++;
      return 1;
    };
  });
  await page.reload();
  await permissions.waitFor();
  for (const [name, label] of [
    ["camera", "Allowed by this browser"],
    ["microphone", "Blocked by this browser"],
    ["geolocation", "Ask before use"]
  ])
    await page
      .locator('[data-permission="' + name + '"]')
      .getByText(label, { exact: true })
      .waitFor();
  await page.evaluate(() => {
    window.permissionFixture.states.camera = "denied";
    window.permissionFixture.results.camera.dispatchEvent(new Event("change"));
  });
  await page
    .locator('[data-permission="camera"]')
    .getByText("Blocked by this browser", { exact: true })
    .waitFor();
  await page.evaluate(() => (window.permissionFixture.unsupported = true));
  await page
    .getByRole("button", { name: "Check permissions again", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll("[data-permission] dd")).every(
      (e) => e.textContent === "Not reported by this browser"
    )
  );
  await page.evaluate(() => {
    window.permissionFixture.unsupported = false;
    window.permissionFixture.states.camera = "unknown-future-value";
    window.dispatchEvent(new Event("focus"));
  });
  await page
    .locator('[data-permission="microphone"]')
    .getByText("Blocked by this browser", { exact: true })
    .waitFor();
  await page
    .locator('[data-permission="camera"]')
    .getByText("Not reported by this browser", { exact: true })
    .waitFor();
  assert.equal(await page.evaluate(() => window.permissionFixture.requests), 0);
  assert.deepEqual(writes, []);
  await page.evaluate(() =>
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: undefined
    })
  );
  await page
    .getByRole("button", { name: "Check permissions again", exact: true })
    .click();
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll("[data-permission] dd")).every(
      (e) => e.textContent === "Not reported by this browser"
    )
  );
  ok(
    "Allowed/blocked/prompt/change/unknown/unsupported/missing-API states remain distinct; keyboard retry and return refresh never request hardware or location"
  );

  await go("/platform/settings?q=camera");
  await page.locator("#setting-data-permissions").click();
  await page.waitForURL("**/settings/data#browser-permissions");
  await permissions.waitFor();
  await page.locator("#setting-data-export").click();
  await page
    .getByRole("heading", { name: "Download your account data", exact: true })
    .waitFor();
  await page
    .getByLabel("Confirm your current password", { exact: true })
    .fill("Wrong-fixture-password-1");
  await page
    .getByRole("button", { name: "Prepare account download", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: /password/i })
    .waitFor();
  assert.equal(
    await page
      .getByRole("link", { name: "Save account data", exact: true })
      .count(),
    0
  );
  await page.clock.install();
  await page
    .getByLabel("Confirm your current password", { exact: true })
    .fill(a.password);
  await page
    .getByRole("button", { name: "Prepare account download", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  const link = page.getByRole("link", {
    name: "Save account data",
    exact: true
  });
  await link.waitFor();
  const blob = await link.getAttribute("href");
  assert.match(blob, /^blob:/);
  const downloading = page.waitForEvent("download");
  await link.click();
  const file = await downloading;
  await file.saveAs(output + "/fictional-export.json");
  const raw = readFileSync(output + "/fictional-export.json", "utf8"),
    data = JSON.parse(raw);
  assert.equal(data.account.username, a.username);
  assert.equal(data.account.email, a.email);
  assert.ok(data.photoAlbums.some((r) => r.name === "Private Data album"));
  assert.equal(
    data.privatePostDrafts.find((r) => r.id === ownDraft.id).payload
      .replyAudience,
    "CHURCH_MEMBERS"
  );
  assert.ok(!raw.includes("Other account secret album"));
  assert.ok(!raw.includes(b.email));
  assert.ok(!raw.includes(a.password));
  await page.clock.fastForward(61_000);
  await page
    .getByText(
      "This download has expired. Confirm your account to prepare another.",
      { exact: true }
    )
    .waitFor();
  assert.equal(await link.count(), 0);
  assert.equal(
    await page.evaluate(async (url) => {
      try {
        await fetch(url);
        return false;
      } catch {
        return true;
      }
    }, blob),
    true
  );
  assert.equal(
    await page
      .getByLabel("Confirm your current password", { exact: true })
      .inputValue(),
    ""
  );
  ok(
    "Search opens permission guidance; existing export rejects wrong confirmation, downloads only current-owner records/reply permissions and revokes its expired object URL"
  );

  await go("/platform/settings/data/deactivate");
  const closure = page.getByRole("region", {
    name: "Deactivate account",
    exact: true
  });
  await closure.waitFor();
  assert.match(await closure.innerText(), /personal photos and albums/);
  assert.match(
    await closure.innerText(),
    /calendar or event sharing are revoked/
  );
  await page
    .getByLabel("Current password for deactivation", { exact: true })
    .fill(a.password);
  const before = await db.platformUser.findUniqueOrThrow({
    where: { id: a.id }
  });
  await closure
    .getByRole("button", { name: "Deactivate account", exact: true })
    .click();
  assert.equal(
    await closure
      .locator('input[name="confirmed"]')
      .evaluate((el) => el.validity.valueMissing),
    true
  );
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { id: a.id } }))
      .deactivatedAt,
    before.deactivatedAt
  );
  // Seed an existing accountable duty, then verify the real server's handoff gate.
  await db.platformOperatorGrant.create({
    data: {
      userId: a.id,
      capability: "REVIEW_CHURCH_LISTINGS"
    }
  });
  await closure.locator('input[name="confirmed"]').check();
  await closure
    .getByRole("button", { name: "Deactivate account", exact: true })
    .click();
  await closure
    .getByRole("alert")
    .filter({ hasText: /hand|dut|transfer/i })
    .waitFor();
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { id: a.id } }))
      .deactivatedAt,
    null
  );
  ok(
    "Closure copy matches retained media and revoked sharing; explicit intent and current duty handoff remain server-enforced"
  );

  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(config.origin + "/platform/settings/data/export");
  await guestPage
    .getByRole("link", { name: "Sign in", exact: true })
    .last()
    .waitFor();
  assert.ok(
    (await guestPage.content()).includes(
      "%2Fplatform%2Fsettings%2Fdata%2Fexport"
    )
  );
  const denied = await guest.request.post(
    config.origin + "/api/platform/account",
    {
      headers: { Origin: config.origin },
      data: { operation: "prepare-export", currentPassword: a.password }
    }
  );
  assert.equal(denied.status(), 401);
  assert.match(denied.headers()["cache-control"], /no-store/);
  await guest.close();
  await page.bringToFront();
  await signIn(b);
  await go("/platform/settings/data/export");
  await page
    .getByLabel("Confirm your current password", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("link", { name: "Save account data", exact: true })
      .count(),
    0
  );
  assert.deepEqual(errors, []);
  ok(
    "Guest export is denied with no-store and exact sign-in return; replacement account starts without the previous download or secret"
  );
  writeFileSync(
    output + "/result.json",
    JSON.stringify({ results, errors }, null, 2)
  );
  console.log("DATA_SETTINGS_BROWSER_PASS " + results.length);
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.txt",
    await page
      .locator("body")
      .innerText()
      .catch(() => "")
  );
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
