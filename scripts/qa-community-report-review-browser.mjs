import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
const dir = process.argv[2];
assert.ok(dir, "Pass the existing isolated HTTPS fixture directory");
const config = JSON.parse(readFileSync(dir + "/browser-env.json", "utf8"));
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + dir + "/sink",
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: "",
  CHURCH_CLAIM_REVIEW_ENABLED: "true",
  CHURCH_CLAIM_POLICY_VERSION: "manual-review-v1",
  COMMUNITY_REPORTS_ENABLED: "true"
});
const { PrismaClient } = await import("@prisma/client");
const { seedPortal, assertPortalTestDatabase, seedOperatorGrants } =
  await import("../tests/seed-portal.ts");
const { communityReportCommand } =
  await import("../lib/platform/community-reports.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const f = await seedPortal(db);
await seedOperatorGrants(db, f.operator, ["REVIEW_COMMUNITY_REPORTS"]);
await db.churchCapabilityGrant.create({
  data: {
    userId: f.coordinator.id,
    churchId: f.churchA.id,
    capability: "MODERATE_CHURCH_POSTS"
  }
});
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
const errors = [],
  reportRequests = [],
  bodies = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("request", (req) => {
  if (new URL(req.url()).pathname === "/api/platform/community-reports") {
    reportRequests.push(req.method());
    if (req.method() === "POST") bodies.push(req.postData());
  }
});
const out = dir + "/review-browser";
mkdirSync(out, { recursive: true });
const groups = [];
groups.push = (...items) => {
  for (const item of items) console.log("PASS: " + item);
  return Array.prototype.push.apply(groups, items);
};
const login = (actor) =>
  context.addCookies([
    {
      name: "church_platform_session",
      value: actor.token,
      url: config.origin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
const go = (path) =>
  page.goto(config.origin + path, { waitUntil: "networkidle" });
const button = (name) => page.getByRole("button", { name, exact: true });
const link = (name) => page.getByRole("link", { name, exact: true });
async function retryReady() {
  await button("Retry same review").waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (b) => b.textContent === "Retry same review" && !b.disabled
    )
  );
}
const caseView = () => page.getByRole("article", { name: "Selected report" });
const reason = () =>
  page.getByLabel("Private decision reason", { exact: true });
const open = async (id) => {
  await go("/platform/reports/review?id=" + id);
  await caseView().waitFor();
};
const decision = (id, version, text) => ({
  operation: "resolve",
  mutationId: randomUUID(),
  id,
  expectedVersion: version,
  resolution: "CLOSED",
  decisionReason: text
});
const source = await db.platformPost.create({
  data: {
    authorId: f.contact.id,
    content: "Selected source " + randomUUID(),
    audience: "CHURCH",
    audienceChurchId: f.churchA.id
  }
});
const secret = await db.platformPost.create({
  data: {
    authorId: f.contact.id,
    content: "Unrelated private source " + randomUUID(),
    audience: "CHURCH",
    audienceChurchId: f.churchB.id
  }
});
async function newCase(post = source, version = 1) {
  return db.communityReport.create({
    data: {
      reporterId: f.contact.id,
      targetType: "POST",
      targetId: post.id,
      targetVersion: version,
      scopeChurchId: post.audienceChurchId,
      reason: "PRIVACY",
      details: "Submitted context " + randomUUID()
    }
  });
}
const cases = [];
for (let i = 0; i < 32; i++) cases.push(await newCase(source, i + 1));
await newCase(secret);
const main = cases[31];
const setGrant = (revoked) =>
  db.churchCapabilityGrant.updateMany({
    where: {
      userId: f.coordinator.id,
      churchId: f.churchA.id,
      capability: "MODERATE_CHURCH_POSTS"
    },
    data: { revokedAt: revoked ? new Date() : null }
  });
async function refresh() {
  await button("Refresh review access").click();
  await caseView().waitFor();
}
async function concealed() {
  await caseView().waitFor({ state: "hidden" });
  assert.equal(await reason().count(), 0);
  assert.ok(!(await page.locator("main").innerText()).includes(main.details));
}
async function count(id) {
  return db.communityReportDecision.count({ where: { reportId: id } });
}
async function lostOnce(onCommit) {
  let lose = true;
  await page.route("**/api/platform/community-reports", async (route) => {
    if (route.request().method() === "POST" && lose) {
      lose = false;
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      if (onCommit) await onCommit();
      await route.abort("failed");
    } else await route.continue();
  });
}
try {
  await go("/platform/reports/review?id=" + main.id);
  assert.equal(await caseView().count(), 0);
  assert.ok(!(await page.content()).includes(main.details));
  for (const actor of [f.memberA, f.operator]) {
    // A support operator must not inherit church report authority from its title or global report grant.
    await login(actor);
    await go("/platform/reports/review?id=" + main.id);
    await concealed();
  }
  await login(f.memberA);
  await go("/platform/reports");
  assert.equal(
    await link("Review reports in your authorized scopes").count(),
    0
  );
  await login(f.coordinator);
  await go("/platform/reports");
  await link("Review reports in your authorized scopes").waitFor();
  const manifest = JSON.parse(
    readFileSync(".next/app-build-manifest.json", "utf8")
  );
  const chunks = manifest.pages["/platform/reports/review/page"].filter(
    (file) =>
      file.endsWith(".js") &&
      existsSync(".next/" + file) &&
      readFileSync(".next/" + file, "utf8").includes("Retry same review")
  );
  assert.ok(chunks.length);
  const resources = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((r) => r.name)
  );
  assert.ok(
    chunks.every((file) => !resources.some((url) => url.includes(file))),
    "Own report history must not preload review workspace"
  );
  await link("Review reports in your authorized scopes").click();
  await page.getByRole("list", { name: "Authorized reports" }).waitFor();
  assert.equal(
    await page
      .getByRole("list", { name: "Authorized reports" })
      .locator("li")
      .count(),
    30
  );
  assert.ok(!(await page.locator("main").innerText()).includes(source.content));
  assert.ok(!(await page.locator("main").innerText()).includes(secret.content));
  await link("Older reviews").click();
  await page.waitForURL((url) => url.searchParams.has("after"));
  await page.waitForFunction(
    () =>
      document.querySelectorAll('ul[aria-label="Authorized reports"] > li')
        .length === 2
  );
  await page.getByRole("list", { name: "Authorized reports" }).waitFor();
  assert.equal(
    await page
      .getByRole("list", { name: "Authorized reports" })
      .locator("li")
      .count(),
    2
  );
  const cursor = new URL(page.url()).searchParams.get("after");
  await db.communityReport.update({
    where: { id: cursor },
    data: { status: "CLOSED" }
  });
  await button("Refresh review access").click();
  await page
    .getByText("Refresh the review queue. Its access or status has changed.", {
      exact: true
    })
    .waitFor();
  await link("Newest reviews").click();
  await page.getByRole("list", { name: "Authorized reports" }).waitFor();
  groups.push(
    "guest/member/global-only church denial; scoped 30+2 pagination, metadata-only queue, stale-cursor recovery and no review preload"
  );

  const html = await context.request.get(
    config.origin + "/platform/reports/review?id=" + main.id
  );
  assert.ok(!(await html.text()).includes(main.details));
  await open(main.id);
  assert.ok((await caseView().innerText()).includes(source.content));
  assert.ok(!(await page.locator("main").innerText()).includes(secret.content));
  assert.ok(
    (await caseView().innerText()).includes(
      "current text, not a saved snapshot"
    )
  );
  await reason().fill("Selected case checked once");
  await page
    .getByLabel("Review outcome", { exact: true })
    .selectOption("FOLLOW_UP_REQUIRED");
  await button("Record review").click();
  await page
    .getByRole("region", { name: "Private review history" })
    .getByText("Selected case checked once", { exact: true })
    .waitFor();
  assert.equal(await count(main.id), 1);
  assert.equal(
    (await db.communityReport.findUniqueOrThrow({ where: { id: main.id } }))
      .status,
    "FOLLOW_UP_REQUIRED"
  );
  groups.push(
    "no private case in SSR; selected canonical evidence, changed version notice and durable follow-up decision"
  );

  await reason().fill("Lost response must use the same decision");
  const before = bodies.length;
  await lostOnce();
  await button("Record review").click();
  await retryReady();
  assert.equal(await count(main.id), 2);
  await button("Retry same review").click();
  await button("Retry same review").waitFor({ state: "hidden" });
  await page
    .getByRole("region", { name: "Private review history" })
    .getByText("Lost response must use the same decision", { exact: true })
    .waitFor();
  assert.equal(bodies[before], bodies[before + 1]);
  assert.equal(await count(main.id), 2);
  await page.unroute("**/api/platform/community-reports");
  groups.push(
    "lost committed response exact-body retry acknowledges once with one decision record"
  );

  await reason().fill("Revoked after a committed uncertain review");
  const revokeIndex = bodies.length;
  await lostOnce();
  await button("Record review").click();
  await retryReady();
  await setGrant(true);
  await button("Retry same review").click();
  await button("Retry same review").waitFor({ state: "hidden" });
  await concealed();
  assert.equal(await count(main.id), 3);
  await button("Refresh review access").click();
  await page
    .getByText("This report is unavailable.", { exact: true })
    .waitFor();
  await concealed();
  await setGrant(false);
  await refresh();
  await retryReady();
  assert.equal(
    await reason().inputValue(),
    "Revoked after a committed uncertain review"
  );
  await button("Retry same review").click();
  await button("Retry same review").waitFor({ state: "hidden" });
  await page
    .getByRole("region", { name: "Private review history" })
    .getByText("Revoked after a committed uncertain review", { exact: true })
    .waitFor();
  assert.equal(bodies[revokeIndex], bodies[revokeIndex + 1]);
  assert.equal(bodies[revokeIndex], bodies[revokeIndex + 2]);
  assert.equal(await count(main.id), 3);
  await page.unroute("**/api/platform/community-reports");
  groups.push(
    "revoked privilege denies reads and receipt replay; legitimate restoration retains exact uncertain key without duplicate audit"
  );

  await reason().fill("Old account private draft reason");
  const ownerIndex = bodies.length;
  await lostOnce(() => login(f.memberB));
  await button("Record review").click();
  await concealed();
  assert.equal(await count(main.id), 4);
  await login(f.coordinator);
  await refresh();
  await button("Retry same review").click();
  await button("Retry same review").waitFor({ state: "hidden" });
  await page
    .getByRole("region", { name: "Private review history" })
    .getByText("Old account private draft reason", { exact: true })
    .waitFor();
  assert.equal(bodies[ownerIndex], bodies[ownerIndex + 1]);
  assert.equal(await count(main.id), 4);
  await page.unroute("**/api/platform/community-reports");
  groups.push(
    "account replaced after commit conceals private work and preserves original-account retry"
  );

  await reason().fill("Keep this reason through the version conflict");
  const current = await db.communityReport.findUniqueOrThrow({
    where: { id: main.id }
  });
  await communityReportCommand(
    db,
    f.coordinator.token,
    decision(main.id, current.version, "Independent concurrent decision")
  );
  await button("Record review").click();
  await concealed();
  await refresh();
  assert.equal(
    await reason().inputValue(),
    "Keep this reason through the version conflict"
  );
  assert.ok(await button("Record review").isDisabled());
  await button("Use this current review version").click();
  await button("Record review").click();
  await page
    .getByRole("region", { name: "Private review history" })
    .getByText("Keep this reason through the version conflict", { exact: true })
    .waitFor();
  assert.equal(await count(main.id), 6);
  groups.push(
    "concurrent decision conflict preserves draft and requires explicit current version before new command"
  );

  await reason().fill("Private draft hidden on a failed read");
  await page.route("**/api/platform/community-reports?*", (route) =>
    route.abort("failed")
  );
  await button("Refresh review access").click();
  await concealed();
  await page.unroute("**/api/platform/community-reports?*");
  await refresh();
  assert.equal(
    await reason().inputValue(),
    "Private draft hidden on a failed read"
  );
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await concealed();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await caseView().waitFor();
  assert.equal(
    await reason().inputValue(),
    "Private draft hidden on a failed read"
  );
  await db.platformPost.update({
    where: { id: source.id },
    data: { audienceChurchId: f.churchB.id }
  });
  await button("Refresh review access").click();
  await page
    .getByText("This report is unavailable.", { exact: true })
    .waitFor();
  await concealed();
  await db.platformPost.update({
    where: { id: source.id },
    data: { audienceChurchId: f.churchA.id }
  });
  await refresh();
  assert.equal(
    await reason().inputValue(),
    "Private draft hidden on a failed read"
  );
  await button("Discard local review").click();
  groups.push(
    "failed reads, blur and current source move conceal evidence and unsaved reasons until authorized refresh"
  );

  await reason().fill("Discarding local retry does not retract a decision");
  await lostOnce();
  await button("Record review").click();
  await retryReady();
  page.once("dialog", (dialog) => dialog.dismiss());
  await button("Discard local review").click();
  await retryReady();
  assert.equal(
    await reason().inputValue(),
    "Discarding local retry does not retract a decision"
  );
  page.once("dialog", (dialog) => dialog.accept());
  await button("Discard local review").click();
  assert.equal(await button("Retry same review").count(), 0);
  assert.equal(await reason().inputValue(), "");
  assert.equal(await count(main.id), 7);
  await page.unroute("**/api/platform/community-reports");
  groups.push(
    "uncertain discard requires acknowledgement, retains a cancelled retry and never retracts its stored decision"
  );

  await go("/platform/menu");
  await open(main.id);
  await reason().fill("Navigation and update must protect this review");
  await page.evaluate(() => history.back());
  await page
    .getByText("Record, retry or discard your unsaved review before leaving.", {
      exact: true
    })
    .waitFor();
  await link("Back to review queue").click();
  assert.equal(new URL(page.url()).searchParams.get("id"), main.id);
  await page.route("**/api/platform/release", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ release: "f".repeat(40) })
    })
  );
  await button("Check for updates").click();
  await page.locator('[data-update-decision="keep-work"]').waitFor();
  assert.equal(await button("Refresh now").count(), 0);
  assert.equal(
    await reason().inputValue(),
    "Navigation and update must protect this review"
  );
  await page.unroute("**/api/platform/release");
  await button("Discard local review").click();
  await link("Back to review queue").click();
  await page
    .getByRole("heading", { name: "Report review queue", exact: true })
    .waitFor();
  groups.push(
    "Back, links and safe update protect unsaved review; explicit discard permits navigation"
  );

  await link("Closed reviews").click();
  await page.waitForURL((url) => url.searchParams.get("status") === "CLOSED");
  await page.waitForFunction(
    () =>
      document.querySelectorAll('ul[aria-label="Authorized reports"] > li')
        .length === 2
  );
  assert.equal(
    await page
      .getByRole("list", { name: "Authorized reports" })
      .locator("li")
      .count(),
    2
  );
  groups.push(
    "closed queue reflects persisted decisions while open queue excludes them"
  );

  await open(main.id);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      )
    );
    assert.ok(
      await reason().evaluate(
        (e) =>
          e.getBoundingClientRect().width >=
          e.closest("form").getBoundingClientRect().width - 2
      )
    );
    await page.screenshot({
      path: out + `/review-${width}.png`,
      fullPage: true
    });
  }
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => (document.documentElement.style.fontSize = "24px"));
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    )
  );
  await reason().focus();
  assert.ok(await reason().evaluate((e) => e === document.activeElement));
  await page.screenshot({
    path: out + "/review-large-dark.png",
    fullPage: true
  });
  assert.deepEqual(errors, []);
  groups.push(
    "320/390/1440 layouts, enlarged text, dark scheme, focus and zero browser page errors"
  );
  writeFileSync(
    out + "/result.json",
    JSON.stringify(
      { groups, groupCount: groups.length, errors, productionWrites: 0 },
      null,
      2
    )
  );
  console.log(
    JSON.stringify(
      { groups, groupCount: groups.length, errors, productionWrites: 0 },
      null,
      2
    )
  );
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
