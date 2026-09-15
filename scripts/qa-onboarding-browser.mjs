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
page.on("response", async (response) => {
  if (
    response.url().endsWith("/api/platform/church-tools") &&
    response.request().method() === "POST"
  ) {
    const body = await response.json().catch(() => ({}));
    console.log("WELCOME_RESULT", response.status(), body.message);
  }
});
const results = [];
const ok = (s) => {
  results.push(s);
  console.log("PASS " + s);
};
const output = fixtureDir + "/onboarding-browser";
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

const { seedOnboarding } = await import("../tests/seed-onboarding.ts");
const { requestConnection } = await import("../tests/seed-portal.ts");
const { portalCommand } = await import("../lib/platform/portal.ts");
const f = await seedOnboarding(db);
const signin = async (actor) => {
  await context.clearCookies();
  await page.goto(
    config.origin + "/platform/login?next=%2Fplatform%2Fgetting-started"
  );
  await page.getByLabel("Email", { exact: true }).fill(actor.email);
  await page.getByLabel("Password", { exact: true }).fill(actor.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(config.origin + "/platform/getting-started");
  await page
    .getByRole("heading", { name: "Getting started", exact: true, level: 2 })
    .waitFor();
};
const waitFor = async (work, message, timeout = 15000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await work()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error(message);
};
const payloads = [];
page.on("request", (request) => {
  if (new URL(request.url()).pathname === "/api/platform/church-tools")
    payloads.push({
      method: request.method(),
      url: request.url(),
      body: request.postData()
    });
});
try {
  await page.setViewportSize({ width: 320, height: 780 });
  for (const path of ["/help", "/platform/help"]) {
    await go(path);
    await page
      .getByRole("link", {
        name: "Getting started and saved next steps",
        exact: true
      })
      .click();
    await page.waitForURL(config.origin + "/platform/getting-started");
    await page
      .getByRole("heading", { name: "Getting started", exact: true, level: 1 })
      .waitFor();
  }
  await go("/platform/getting-started");
  await bounded();
  assert.equal(
    await page
      .getByRole("link", { name: "Create account", exact: true })
      .count(),
    1
  );
  await page.getByRole("link", { name: "Create account", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/platform/signup");
  assert.equal(
    new URL(page.url()).searchParams.get("next"),
    "/platform/getting-started"
  );
  const participation = page.getByLabel("How would you like to participate?", {
    exact: true
  });
  await participation.selectOption("EXPLORING_FAITH");
  assert.equal(await participation.inputValue(), "EXPLORING_FAITH");
  ok(
    "Guest guidance preserves signup return and Exploring Faith at 320px without automatic actions."
  );

  await signin(f.newcomer);
  await bounded();
  const profileStep = page.getByRole("listitem").filter({
    has: page.getByRole("link", {
      name: "Introduce yourself on your profile",
      exact: true
    })
  });
  await profileStep.getByRole("button", { name: "Later", exact: true }).click();
  await waitFor(
    async () =>
      (
        await db.socialPreferences.findUnique({
          where: { ownerId: f.newcomer.id }
        })
      )?.onboardingDismissed.includes("profile"),
    "Profile hint did not save"
  );
  await page.reload();
  await page
    .getByRole("link", {
      name: "Introduce yourself on your profile · Saved for later",
      exact: true
    })
    .waitFor();
  assert.equal(
    await db.churchCapabilityGrant.count({ where: { userId: f.newcomer.id } }),
    0
  );
  assert.equal(
    await db.socialRelationship.count({ where: { ownerId: f.newcomer.id } }),
    0
  );
  await go("/platform");
  const baseline = payloads.length;
  await page.getByText("Next steps and this week", { exact: true }).waitFor();
  await page.waitForTimeout(500);
  assert.equal(
    payloads
      .slice(baseline)
      .filter((p) => new URL(p.url).searchParams.get("view") === "home").length,
    0
  );
  await page.getByText("Next steps and this week", { exact: true }).focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("heading", { name: "Make yourself at home", exact: true })
    .waitFor();
  await bounded();
  await page.screenshot({ path: output + "/home-320.png", fullPage: false });
  ok(
    "Actual sign-in and saved optional hints resume; closed Home makes zero onboarding requests or automatic follows."
  );

  const connection = await requestConnection(db, f.newcomer, f.churchA.id);
  await go("/platform/getting-started");
  await page.getByText(/Your church request is pending review/).waitFor();
  assert.equal(
    await page.getByRole("heading", { name: /This week at/ }).count(),
    0
  );
  await portalCommand(db, f.reviewerA.token, {
    operation: "transition",
    action: "APPROVE",
    churchId: f.churchA.id,
    connectionId: connection.id,
    expectedVersion: connection.version
  });
  const meaningfulStart = performance.now();
  await page.reload();
  await page
    .getByRole("heading", {
      name: "This week at " + f.churchA.name,
      exact: true
    })
    .waitFor();
  await page.getByRole("link", { name: /Welcome neighbors · 1 open/ }).click();
  await page.getByRole("button", { name: "I can help", exact: true }).click();
  await waitFor(
    async () =>
      (await db.postVolunteerSignup.count({
        where: { userId: f.newcomer.id, state: "ACTIVE" }
      })) === 1,
    "Volunteer reservation did not persist"
  );
  const meaningfulMs = performance.now() - meaningfulStart;
  await go("/platform/getting-started");
  await page
    .getByRole("link", { name: /Welcome neighbors · You are signed up/ })
    .waitFor();
  assert.equal(
    await db.socialRelationship.count({ where: { ownerId: f.newcomer.id } }),
    0
  );
  writeFileSync(
    output + "/meaningful-action.json",
    JSON.stringify({
      measuredAt: new Date().toISOString(),
      milliseconds: meaningfulMs,
      kind: "automated actual browser after isolated ordinary approval to stored volunteer reservation",
      physicalPilot: false
    }),
    { mode: 0o600 }
  );
  ok(
    "Ordinary approval unlocks real church content and a stored volunteer action with no follows; automated timing recorded."
  );

  await signin(f.ada);
  await go("/platform/churches/" + f.churchA.id + "/welcome");
  await page.getByLabel("Choose a recent church post").selectOption(f.post.id);
  await page
    .getByRole("button", { name: "Save Start here post", exact: true })
    .click();
  await waitFor(
    async () =>
      (await db.church.findUnique({ where: { id: f.churchA.id } }))
        ?.welcomePostId === f.post.id,
    "Welcome not selected"
  );
  await page
    .getByLabel("Or enter an older church post’s address")
    .fill("https://elsewhere.test/platform/posts/nope");
  await page
    .getByRole("button", { name: "Save Start here post", exact: true })
    .click();
  await page
    .getByText(
      "Use a church post address from this website. The current welcome is unchanged.",
      { exact: true }
    )
    .waitFor();
  assert.equal(
    (await db.church.findUnique({ where: { id: f.churchA.id } })).welcomePostId,
    f.post.id
  );
  await page
    .getByRole("button", { name: "Discard local welcome choice", exact: true })
    .click();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await bounded();
    await page.screenshot({
      path: output + "/publisher-" + width + ".png",
      fullPage: true
    });
  }
  ok(
    "Publisher selects a real church welcome; invalid external address leaves it unchanged; layouts fit 320/390/1440px."
  );

  await signin(f.val);
  await go("/platform/posts/" + f.introduction.id);
  await page.getByText("Welcome and questions", { exact: true }).click();
  await page.getByLabel("Post label").selectOption("QUESTION");
  await db.churchWelcomeThread.update({
    where: { postId: f.introduction.id },
    data: { version: { increment: 1 } }
  });
  await page
    .getByRole("button", { name: "Save post label", exact: true })
    .click();
  await page.getByText(/This information changed/).waitFor();
  assert.equal(
    (
      await db.churchWelcomeThread.findUnique({
        where: { postId: f.introduction.id }
      })
    ).purpose,
    "INTRODUCTION"
  );
  await page
    .getByRole("button", { name: "I reviewed the current label", exact: true })
    .click();
  let drop = true;
  await page.route("**/api/platform/church-tools", async (route) => {
    if (route.request().method() === "POST" && drop) {
      drop = false;
      const committed = await route.fetch();
      assert.equal(
        committed.status(),
        200,
        "The dropped response must follow a committed save"
      );
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Save post label", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Retry unconfirmed change", exact: true })
    .waitFor();
  await waitFor(
    () =>
      page
        .getByRole("button", { name: "Retry unconfirmed change", exact: true })
        .isEnabled(),
    "The lost-response request did not finish"
  );
  assert.equal(
    (
      await db.churchWelcomeThread.findUnique({
        where: { postId: f.introduction.id }
      })
    ).purpose,
    "QUESTION"
  );
  const beforeRetry = (
    await db.churchWelcomeThread.findUnique({
      where: { postId: f.introduction.id }
    })
  ).version;
  await page
    .getByRole("button", { name: "Retry unconfirmed change", exact: true })
    .click();
  await page.getByText("Post label saved.", { exact: true }).waitFor();
  await waitFor(
    async () =>
      !(await page
        .getByRole("button", { name: "Retry unconfirmed change", exact: true })
        .count()),
    "Retry did not resolve"
  );
  assert.equal(
    (
      await db.churchWelcomeThread.findUnique({
        where: { postId: f.introduction.id }
      })
    ).version,
    beforeRetry
  );
  await page.unroute("**/api/platform/church-tools");
  ok(
    "Author label detects stale version and preserves the original uncertain mutation for an exact no-duplicate retry."
  );

  await signin(f.lee);
  await go("/platform/churches/" + f.churchA.id + "/welcome");
  await page
    .getByRole("link", {
      name: "Fictional newcomer introduction for the ordinary welcome journey.",
      exact: true
    })
    .waitFor();
  await page
    .getByRole("button", { name: "Mark follow-up handled", exact: true })
    .click();
  await waitFor(
    async () =>
      (
        await db.churchWelcomeThread.findUnique({
          where: { postId: f.introduction.id }
        })
      )?.handled,
    "Host did not mark handled"
  );
  await page.getByRole("button", { name: "Handled", exact: true }).click();
  await page
    .getByRole("button", { name: "Reopen follow-up", exact: true })
    .click();
  await waitFor(
    async () =>
      !(
        await db.churchWelcomeThread.findUnique({
          where: { postId: f.introduction.id }
        })
      )?.handled,
    "Host did not reopen"
  );
  await page.getByRole("button", { name: "Unanswered", exact: true }).click();
  await page
    .getByRole("button", { name: "Mark follow-up handled", exact: true })
    .waitFor();
  await page
    .getByLabel("Until, exclusive (UTC)", { exact: true })
    .fill(new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Apply dates", exact: true }).click();
  await page.getByText("Confirmed volunteer places", { exact: true }).waitFor();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await bounded();
    await page.screenshot({
      path: output + "/host-" + width + ".png",
      fullPage: true
    });
  }
  ok(
    "Current scoped host handles and reopens a tagged thread and reads date-filtered totals at phone and desktop widths."
  );

  await db.churchCapabilityGrant.updateMany({
    where: {
      churchId: f.churchA.id,
      userId: f.lee.id,
      capability: "HOST_CHURCH_WELCOME"
    },
    data: { revokedAt: new Date() }
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByText(
      "Current church tools are unavailable until your access is confirmed.",
      { exact: true }
    )
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Mark follow-up handled", exact: true })
      .count(),
    0
  );
  assert.equal(
    await page
      .getByText(
        "Fictional newcomer introduction for the ordinary welcome journey.",
        { exact: true }
      )
      .count(),
    0
  );
  await signin(f.blake);
  await go("/platform/churches/" + f.churchA.id + "/welcome");
  await page
    .getByText(
      "Current church tools are unavailable until your access is confirmed.",
      { exact: true }
    )
    .waitFor();
  assert.equal(
    await page
      .getByRole("heading", { name: "Participation totals", exact: true })
      .count(),
    0
  );
  ok(
    "Revoked and unrelated hosts receive no cached thread details, actions or totals."
  );
  const { churchListingCommand } =
    await import("../lib/platform/church-listings.ts");
  const { churchClaimCommand } =
    await import("../lib/platform/church-claims.ts");
  const churchCount = await db.church.count();
  const grantCount = await db.churchCapabilityGrant.count();
  const listingDraft = await churchListingCommand(db, f.newcomer.token, {
    operation: "create",
    requestKey: crypto.randomUUID(),
    kind: "COMMUNITY"
  });
  const claimDraft = await churchClaimCommand(db, f.newcomer.token, {
    operation: "create",
    requestKey: crypto.randomUUID()
  });
  await signin(f.newcomer);
  const listingPath = "/platform/church-listings/" + listingDraft.id;
  const claimPath = "/platform/church-claims/" + claimDraft.id;
  await go("/platform/help");
  await page
    .getByRole("link", {
      name: "Getting started and saved next steps",
      exact: true
    })
    .click();
  await page.waitForURL(config.origin + "/platform/getting-started");
  await page
    .getByRole("heading", { name: "Getting started", exact: true, level: 2 })
    .waitFor();
  ok(
    "Public, guest and signed-in Help navigate back to the saved guide at phone width."
  );
  await page.locator(`a[href="${listingPath}"]`).click();
  await page.waitForURL(config.origin + listingPath);
  await page
    .getByRole("heading", { name: "Your private church draft", exact: true })
    .waitFor();
  await page.getByLabel("Church name", { exact: true }).waitFor();
  await go("/platform/getting-started");
  await page.locator(`a[href="${claimPath}"]`).click();
  await page.waitForURL(config.origin + claimPath);
  await page
    .getByRole("heading", { name: "Your church setup", exact: true })
    .waitFor();
  await page.getByLabel("Church name", { exact: true }).waitFor();
  await signin(f.blake);
  await page
    .getByRole("heading", {
      name: "Adding or representing a church",
      exact: true
    })
    .waitFor();
  assert.equal(
    await page
      .locator(`a[href="${listingPath}"],a[href="${claimPath}"]`)
      .count(),
    0
  );
  assert.equal(await db.church.count(), churchCount);
  assert.equal(await db.churchCapabilityGrant.count(), grantCount);
  ok(
    "The full guide resumes both existing private listing and representative drafts; another account sees neither, and no church or grant is created."
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/results.json",
    JSON.stringify({
      results,
      errors,
      measuredAt: new Date().toISOString(),
      productionMode: true,
      fictionalOnly: true,
      physicalDevice: false
    }),
    { mode: 0o600 }
  );
} catch (error) {
  writeFileSync(output + "/failure.txt", String(error.stack ?? error), {
    mode: 0o600
  });
  writeFileSync(
    output + "/failure-dom.txt",
    await page
      .locator("body")
      .innerText()
      .catch(() => "unavailable"),
    { mode: 0o600 }
  );
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
