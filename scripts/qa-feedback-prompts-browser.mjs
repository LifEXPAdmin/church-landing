import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const dir = process.argv[2];
assert.match(dir ?? "", /^\.account-test\/[a-z0-9-]+$/);
const config = JSON.parse(readFileSync(dir + "/browser-env.json", "utf8"));
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: resolve(dir, "sink"),
  RETENTION_TEST_DIR: resolve(dir, "retention"),
  MEDIA_STORAGE_MODE: "local-test",
  MEDIA_TEST_DIR: resolve(dir, "images"),
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: "",
  FEEDBACK_INTAKE_ENABLED: "true",
  PLATFORM_MEASUREMENT_ENABLED: "true",
  SUPPORT_INTAKE_ENABLED: "true",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  FOUNDER_WELCOME_ENABLED: "false",
  FOUNDER_ANNOUNCEMENTS_ENABLED: "false",
  PUSH_ENABLED: "false"
});
const { PrismaClient } = await import("@prisma/client"),
  db = new PrismaClient();
const { seedSupport } = await import("../tests/seed-support.ts");
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
const results = [],
  errors = [],
  dialogs = [],
  contexts = [];
const output = dir + "/feedback-prompts-browser";
mkdirSync(output, { recursive: true, mode: 0o700 });
let fixture;
const ok = (label) => {
  results.push(label);
  console.log("PASS " + label);
};
async function pageFor(actor) {
  const context = await browser.newContext({
    viewport: { width: 320, height: 844 }
  });
  contexts.push(context);
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === config.origin
      ? route.continue()
      : route.abort()
  );
  if (actor)
    await context.addCookies([
      {
        name: "church_platform_session",
        value: actor.token,
        url: config.origin,
        httpOnly: true,
        secure: true,
        sameSite: "Lax"
      }
    ]);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.type());
    await dialog.accept();
  });
  return page;
}
const go = async (page, path) => {
  await page.bringToFront();
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
};
const fits = async (page) => {
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= innerWidth + 1
  );
  if (!fits) {
    writeFileSync(
      output + "/overflow.json",
      JSON.stringify(
        await page.evaluate(() =>
          [...document.querySelectorAll("main *")]
            .map((el) => ({
              tag: el.tagName,
              name: el.getAttribute("name"),
              class: el.className,
              right: Math.round(el.getBoundingClientRect().right),
              width: Math.round(el.getBoundingClientRect().width)
            }))
            .filter((el) => el.right > innerWidth + 1)
        ),
        null,
        2
      )
    );
    await page.screenshot({ path: output + "/overflow.png", fullPage: true });
  }
  assert.ok(fits, "No 320px page overflow");
};
const until = async (fn) => {
  for (let n = 0; n < 80; n++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail("Expected browser state did not arrive");
};
const send = async (page, button, endpoint = "feedback") => {
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/platform/" + endpoint) &&
      r.request().method() === "POST"
  );
  await page.getByRole("button", { name: button, exact: true }).click();
  const r = await response;
  assert.equal(r.status(), 200, await r.text());
  return r.json();
};
const createForm = (page) =>
  page.getByRole("form", { name: "Send feedback", exact: true });

const { saveMeasurementChoice } =
  await import("../lib/platform/platform-measurement.ts");
const prompt = (page) =>
  page.getByRole("dialog", {
    name: "How is Godschurches working for you?",
    exact: true
  });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function qualify(f) {
  const now = Date.now();
  await db.platformUser.update({
    where: { id: f.memberA.id },
    data: { createdAt: new Date(now - 8 * 86400000) }
  });
  await saveMeasurementChoice(db, f.memberA.token, {
    operation: "choice",
    mutationId: crypto.randomUUID(),
    expectedVersion: 0,
    enabled: true,
    shareDevice: false,
    referral: "UNKNOWN"
  });
  await db.platformMeasurementChoice.update({
    where: { userId: f.memberA.id },
    data: {
      enabledAt: new Date(now - 3 * 86400000),
      lastForegroundAt: new Date(now),
      sessionStarts: [3, 2, 1].map((n) => new Date(now - n * 3600000)),
      eligibleSessions: 3
    }
  });
  await db.platformFollow.create({
    data: {
      followerId: f.memberA.id,
      followingId: f.memberB.id,
      createdAt: new Date(now - 86400000)
    }
  });
}
async function menu(page) {
  const measured = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/platform/measurement") &&
      r.request().method() === "GET"
  );
  await go(page, "/platform/menu");
  await page.getByRole("heading", { name: "Menu", exact: true }).waitFor();
  assert.equal((await measured).status(), 200);
  await pause(200);
}
async function offer(page) {
  const signal = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/platform/measurement") &&
      r.request().method() === "POST"
  );
  await page.getByRole("link", { name: "Menu", exact: true }).click();
  assert.equal((await signal).status(), 200);
  await prompt(page).waitFor();
  await prompt(page)
    .getByRole("link", { name: "Share feedback", exact: true })
    .waitFor();
}
try {
  fixture = await seedSupport(db);
  const off = await pageFor(fixture.memberB);
  await menu(off);
  await off.getByRole("link", { name: "Menu", exact: true }).click();
  await pause(1500);
  assert.equal(await prompt(off).count(), 0);
  assert.equal(
    await db.feedbackPromptClaim.count({
      where: { userId: fixture.memberB.id }
    }),
    0
  );
  ok(
    "Measurement off creates no automatic prompt or reservation on real Menu navigation"
  );

  await qualify(fixture);
  const writing = await pageFor(fixture.memberA);
  await go(writing, "/platform/feedback");
  await createForm(writing).waitFor();
  await writing
    .getByLabel("Your experience (optional with a rating)", { exact: true })
    .fill("Fictional unfinished feedback must not be interrupted.");
  await writing.getByRole("link", { name: "Menu", exact: true }).click();
  await pause(1500);
  assert.equal(new URL(writing.url()).pathname, "/platform/feedback");
  assert.equal(await prompt(writing).count(), 0);
  assert.equal(
    await db.feedbackPromptClaim.count({
      where: { userId: fixture.memberA.id }
    }),
    0
  );
  assert.equal(
    await writing
      .getByLabel("Your experience (optional with a rating)", { exact: true })
      .inputValue(),
    "Fictional unfinished feedback must not be interrupted."
  );
  await writing.context().close();
  ok(
    "An actual unfinished feedback form preserves its text and blocks departure without opening or reserving a prompt"
  );

  const page = await pageFor(fixture.memberA);
  await menu(page);
  assert.equal(
    await prompt(page).count(),
    0,
    "Initial page load is not a quiet navigation invitation"
  );
  await offer(page);
  assert.equal(await prompt(page).getAttribute("aria-modal"), "false");
  assert.equal(
    await prompt(page)
      .getByRole("button", { name: "Close feedback prompt" })
      .evaluate((el) => el === document.activeElement),
    true
  );
  await fits(page);
  await page.screenshot({ path: output + "/prompt-320.png", fullPage: true });
  assert.equal(
    await db.feedbackPromptClaim.count({
      where: { userId: fixture.memberA.id, shownAt: { not: null } }
    }),
    1
  );
  const dismiss = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/platform/feedback/prompts") &&
      r.request().method() === "POST" &&
      r.request().postDataJSON()?.operation === "dismiss"
  );
  await page.keyboard.press("Escape");
  assert.equal((await dismiss).status(), 200);
  await until(async () => !(await prompt(page).count()));
  assert.equal(
    await page
      .getByRole("link", { name: "Menu", exact: true })
      .evaluate((el) => el === document.activeElement),
    true
  );
  assert.ok(
    (
      await db.feedbackPromptPreference.findUniqueOrThrow({
        where: { userId: fixture.memberA.id }
      })
    ).dismissedUntil > new Date(Date.now() + 29 * 86400000)
  );
  const secondTab = await pageFor(fixture.memberA);
  await menu(secondTab);
  await secondTab.getByRole("link", { name: "Menu", exact: true }).click();
  await pause(1500);
  assert.equal(await prompt(secondTab).count(), 0);
  assert.equal(
    await db.feedbackPromptClaim.count({
      where: { userId: fixture.memberA.id, shownAt: { not: null } }
    }),
    1
  );
  ok(
    "A real quiet Menu interaction opens one named nonmodal sheet at 320px; Escape saves the account cooldown, restores focus and suppresses a second tab"
  );

  fixture = await seedSupport(db);
  await qualify(fixture);
  const refusing = await pageFor(fixture.memberA);
  await menu(refusing);
  await offer(refusing);
  const endpoint = config.origin + "/api/platform/feedback/prompts",
    retries = [];
  await refusing.route(endpoint, async (route) => {
    if (
      route.request().method() !== "POST" ||
      route.request().postDataJSON()?.operation !== "never-ask"
    )
      return route.continue();
    retries.push(route.request().postData());
    if (retries.length === 1) {
      const r = await route.fetch();
      assert.equal(r.status(), 200);
      await route.abort("failed");
    } else await route.continue();
  });
  await prompt(refusing)
    .getByRole("button", { name: "Don’t ask again", exact: true })
    .click();
  await prompt(refusing)
    .getByRole("button", { name: "Retry the same choice", exact: true })
    .waitFor();
  await prompt(refusing)
    .getByRole("button", { name: "Retry the same choice", exact: true })
    .click();
  await until(async () => !(await prompt(refusing).count()));
  assert.equal(retries.length, 2);
  assert.equal(retries[0], retries[1]);
  const noAsk = await db.feedbackPromptPreference.findUniqueOrThrow({
    where: { userId: fixture.memberA.id }
  });
  assert.ok(noAsk.neverAskAt);
  assert.equal(
    await db.retentionControl.count({
      where: {
        kind: "FEEDBACK_PROMPT",
        sourceId: fixture.memberA.id,
        journaledAt: null
      }
    }),
    0
  );
  await refusing.unroute(endpoint);
  await go(refusing, "/platform/feedback");
  await createForm(refusing).waitFor();
  await refusing
    .getByText("Automatic feedback prompts", { exact: true })
    .click();
  await refusing
    .getByText("Automatic feedback prompts are off for your account.", {
      exact: true
    })
    .waitFor();
  ok(
    "A lost never-ask acknowledgement retries identical bytes once, protects the persistent account refusal and still allows voluntary feedback"
  );

  fixture = await seedSupport(db);
  await qualify(fixture);
  const response = await pageFor(fixture.memberA);
  await menu(response);
  await offer(response);
  const claim = await db.feedbackPromptClaim.findFirstOrThrow({
    where: { userId: fixture.memberA.id, shownAt: { not: null } }
  });
  await prompt(response)
    .getByRole("link", { name: "Share feedback", exact: true })
    .click();
  await createForm(response).waitFor();
  assert.equal(new URL(response.url()).searchParams.get("prompt"), claim.id);
  await response
    .getByRole("combobox", {
      name: "How has the website been for you? (optional)",
      exact: true
    })
    .selectOption("1");
  await response
    .getByRole("checkbox", { name: /I have read the privacy notice/ })
    .check();
  const receipt = await send(response, "Send feedback");
  await response.waitForURL(
    (url) => url.pathname === "/platform/feedback/cases/" + receipt.caseId,
    { waitUntil: "domcontentloaded" }
  );
  await response
    .getByRole("heading", { name: "Your feedback choices", exact: true })
    .waitFor();
  const saved = await db.feedbackSubmission.findUniqueOrThrow({
    where: { caseId: receipt.caseId }
  });
  assert.equal(saved.entryPoint, "PROMPT");
  assert.equal(saved.promptClaimId, claim.id);
  assert.equal(saved.rating, 1);
  assert.equal(saved.contactAllowed, false);
  assert.equal(saved.allowIdea, false);
  assert.ok(
    (
      await db.feedbackPromptPreference.findUniqueOrThrow({
        where: { userId: fixture.memberA.id }
      })
    ).respondedUntil > new Date(Date.now() + 89 * 86400000)
  );
  await fits(response);
  await response.screenshot({
    path: output + "/prompt-response-320.png",
    fullPage: true
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(dialogs, []);
  ok(
    "The prompt opens the same optional form; a real low-rating submission joins exactly its shown exposure and private receipt with default-off sharing and ninety-day suppression"
  );
  fixture = await seedSupport(db);
  await qualify(fixture);
  const retained = await pageFor(fixture.memberA);
  await menu(retained); await offer(retained);
  await prompt(retained).getByRole("link", { name: "Share feedback", exact: true }).click();
  await createForm(retained).waitFor();
  await retained.getByLabel("Your experience (optional with a rating)", { exact: true }).fill("Fictional feedback retained through a deliberate measurement withdrawal.");
  const settings = await pageFor(fixture.memberA);
  await go(settings, "/platform/settings/privacy/measurement");
  await settings.getByRole("checkbox", { name: "Allow optional platform measurement", exact: true }).uncheck();
  await send(settings, "Save measurement choices", "measurement");
  await until(async () => (await db.feedbackPromptClaim.count({ where: { userId: fixture.memberA.id } })) === 0);
  await retained.bringToFront();
  await retained.getByLabel("Your experience (optional with a rating)", { exact: true }).waitFor();
  assert.equal(await retained.getByLabel("Your experience (optional with a rating)", { exact: true }).inputValue(), "Fictional feedback retained through a deliberate measurement withdrawal.");
  await retained.getByRole("checkbox", { name: /I have read the privacy notice/ }).check();
  const unlinked = await send(retained, "Send feedback");
  await retained.waitForURL(url => url.pathname === "/platform/feedback/cases/" + unlinked.caseId, { waitUntil: "domcontentloaded" });
  await retained.getByRole("heading", { name: "Your feedback choices", exact: true }).waitFor();
  const unmeasured = await db.feedbackSubmission.findUniqueOrThrow({ where: { caseId: unlinked.caseId } });
  assert.equal(unmeasured.entryPoint, "UNATTRIBUTED"); assert.equal(unmeasured.promptClaimId, null); assert.equal(unmeasured.rating, null);
  assert.deepEqual(errors, []); assert.deepEqual(dialogs, []);
  ok("Turning measurement off in another real settings tab removes the exposure, preserves the unsent feedback and accepts an unattributed receipt without inventing prompt or Menu coverage");
} catch (error) {
  for (let i = 0; i < contexts.length; i++) {
    const page = contexts[i].pages()[0];
    if (page && !page.isClosed())
      await page
        .screenshot({ path: output + `/failure-${i}.png`, fullPage: true })
        .catch(() => {});
  }
  throw error;
} finally {
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        results,
        errors,
        dialogs,
        completed: results.length === 6
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  for (const c of contexts) await c.close().catch(() => {});
  await browser.close();
  await db.$disconnect();
}
