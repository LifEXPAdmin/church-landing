import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the existing isolated HTTPS fixture directory");
const config = JSON.parse(readFileSync(fixtureDir + "/browser-env.json"));
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + fixtureDir + "/sink",
  RETENTION_TEST_DIR: process.cwd() + "/" + fixtureDir + "/retention",
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: ""
});
// Resolve from the inspected candidate, including when this QA is run privately
// against an unchanged earlier build to reproduce the regression.
const require = createRequire(process.cwd() + "/package.json");
const { PrismaClient } = require("@prisma/client");
const load = (name) => import(pathToFileURL(process.cwd() + "/" + name));
const { assertPortalTestDatabase } = await load("tests/seed-portal.ts");
const { seedSupport, requestInput } = await load("tests/seed-support.ts");
const { supportCommand, readSupport } = await load("lib/platform/support.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ??
    process.env.HOME +
      "/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json"
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
const output = fixtureDir + "/admin-retry-browser-" + Date.now();
mkdirSync(output, { recursive: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }
});
const page = await context.newPage();
const errors = [],
  external = [],
  attempts = [],
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
await context.route("**/*", (route) => {
  const url = new URL(route.request().url());
  if (url.origin !== config.origin) {
    external.push(url.origin);
    return route.abort();
  }
  return route.continue();
});
const ok = (text) => {
  checks.push(text);
  console.log("PASS " + text);
};
let receipt;
try {
  const f = await seedSupport(db);
  const created = await supportCommand(
    db,
    f.memberA.token,
    await requestInput(db, f.memberA.token, {
      subject: "Fictional original Admin retry " + randomUUID()
    })
  );
  const before = await db.supportCase.findUniqueOrThrow({
    where: { id: created.caseId }
  });
  const note = "Private fictional retry note " + randomUUID();
  await context.addCookies([
    {
      name: "church_platform_session",
      value: f.owner.token,
      url: config.origin,
      httpOnly: true,
      secure: true,
      sameSite: "Lax"
    }
  ]);
  await page.goto(
    config.origin + "/platform/admin/cases/SUPPORT/" + created.caseId
  );
  await page
    .getByRole("button", { name: "Refresh current view", exact: true })
    .waitFor();
  const form = page.getByRole("form", {
    name: "Save internal note",
    exact: true
  });
  const field = form.getByLabel("Internal note", { exact: true });
  const retry = form.getByRole("button", {
    name: "Retry original action",
    exact: true
  });
  await field.fill(note);
  await page.route(config.origin + "/api/platform/admin", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    const body = request.postData();
    const payload = JSON.parse(body);
    assert.equal(payload.operation, "note");
    assert.equal(payload.sourceId, created.caseId);
    attempts.push({ body, owner: request.headers()["x-expected-account"] });
    if (attempts.length === 1) {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      receipt = await response.json();
      return route.abort("failed");
    }
    if (attempts.length === 2)
      return route.fulfill({
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "2" },
        body: JSON.stringify({
          message: "Fictional rate limit. Retry after the short wait."
        })
      });
    if (attempts.length === 3)
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          message:
            "Fictional temporary service failure. Retry the original action."
        })
      });
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    assert.deepEqual(await response.json(), receipt);
    return route.fulfill({ response });
  });
  const oneEffect = async () => {
    assert.equal(
      await db.adminCaseNote.count({
        where: { supportCaseId: created.caseId, body: note }
      }),
      1
    );
    assert.equal(
      await db.adminOperation.count({
        where: { actorId: f.owner.id, sourceId: created.caseId, action: "note" }
      }),
      1
    );
    const after = await db.supportCase.findUniqueOrThrow({
      where: { id: created.caseId }
    });
    assert.equal(after.version, before.version + 1);
    assert.equal(after.adminVersion, before.adminVersion + 1);
    assert.equal(
      JSON.stringify(
        await readSupport(db, f.memberA.token, "detail", {
          caseId: created.caseId
        })
      ).includes(note),
      false
    );
  };
  await form
    .getByRole("button", { name: "Save internal note", exact: true })
    .click();
  await retry.waitFor();
  assert.equal(await field.inputValue(), note);
  assert.equal(await field.isEnabled(), false);
  await oneEffect();
  ok(
    "A real accepted internal note with a lost response retains the original command and stays private from its requester."
  );
  await retry.click();
  await form
    .getByRole("alert")
    .filter({ hasText: "Fictional rate limit" })
    .waitFor();
  assert.equal(
    await retry.count(),
    1,
    "429 must retain the original retry action"
  );
  assert.equal(
    await retry.isEnabled(),
    false,
    "Retry-After cooldown remains enforced"
  );
  assert.equal(
    await field.isEnabled(),
    false,
    "Uncertain command inputs remain frozen"
  );
  assert.equal(await field.inputValue(), note);
  await oneEffect();
  await retry.click();
  await form
    .getByRole("alert")
    .filter({ hasText: "Fictional temporary service failure" })
    .waitFor();
  assert.equal(await field.isEnabled(), false);
  assert.equal(await field.inputValue(), note);
  await oneEffect();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate((large) => {
      document.documentElement.style.fontSize = large ? "200%" : "";
    }, width === 320);
    await retry.scrollIntoViewIfNeeded();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      )
    );
    await page.screenshot({ path: output + "/pending-" + width + ".png" });
  }
  ok(
    "Rate limiting and temporary service failure preserve frozen entries, accessible retry controls and the cooldown."
  );
  await retry.click();
  await page.getByText(note, { exact: true }).waitFor();
  assert.equal(attempts.length, 4);
  assert.ok(
    attempts.every((a) => a.body === attempts[0].body && a.owner === f.owner.id)
  );
  const key = JSON.parse(attempts[0].body).requestKey;
  assert.equal(
    await db.adminOperation.count({
      where: { actorId: f.owner.id, requestKey: key }
    }),
    1
  );
  await oneEffect();
  assert.equal(await field.inputValue(), "");
  assert.equal(await retry.count(), 0);
  ok(
    "All four attempts have identical bytes, key, expected version and account; the original receipt confirms one note and one version increment."
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  writeFileSync(
    output + "/receipt.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        checks,
        attempts: attempts.length,
        identicalBodies: true,
        effects: 1,
        errors,
        external,
        productionWrites: 0,
        recipientSends: 0
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
  await db.$disconnect();
}
