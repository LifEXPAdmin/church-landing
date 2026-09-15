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
  FEEDBACK_IDEAS_ENABLED: "true",
  FEEDBACK_FOLLOWUP_ENABLED: "true",
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
const output = dir + "/feedback-followup-browser";
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
  const response = await page.goto(config.origin + path, {
    waitUntil: "domcontentloaded"
  });
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
  await page.getByRole("button", { name: button, exact: true }).focus();
  await page.getByRole("button", { name: button, exact: true }).press("Enter");
  const r = await response;
  assert.equal(r.status(), 200, await r.text());
  await page.waitForFunction(
    (name) =>
      [...document.forms]
        .filter((f) => f.getAttribute("aria-label") === name)
        .every((f) => f.getAttribute("aria-busy") !== "true"),
    button
  );
  return r.json();
};

const { readSupport, supportCommand } =
  await import("../lib/platform/support.ts");
const { readNotificationPreferences, notificationPreferenceCommand } =
  await import("../lib/platform/notification-preferences.ts");
const { readActivity } = await import("../lib/platform/activity.ts");
const { FEEDBACK_NOTICE } = await import("../lib/platform/feedback-types.ts");
try {
  fixture = await seedSupport(db);
  const initial = await readNotificationPreferences(db, fixture.memberA.token);
  await notificationPreferenceCommand(db, fixture.memberA.token, {
    operation: "preferences",
    mutationId: crypto.randomUUID(),
    ownerId: fixture.memberA.id,
    expectedVersion: initial.preferences.version,
    inApp: initial.preferences.inApp,
    pushCategories: [],
    quietHours: null,
    feedbackEmail: true
  });
  const member = await pageFor(fixture.memberA);
  await go(member, "/platform/settings/notifications/availability");
  const group = member.getByRole("group", {
    name: "Feedback and ideas you chose to follow",
    exact: true
  });
  const email = group.getByRole("checkbox", { name: /Email updates/ });
  await email.waitFor();
  assert.equal(await email.isChecked(), true);
  await email.focus();
  await email.press("Space");
  assert.equal(await email.isChecked(), false);
  await fits(member);
  await member.screenshot({
    path: output + "/settings-320.png",
    fullPage: true
  });
  ok(
    "Feedback channels have keyboard controls at 320px; unavailable email still permits withdrawing an existing choice"
  );
  const url = config.origin + "/api/platform/notifications";
  const bodies = [];
  let lost = false;
  await member.route(url, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    bodies.push(route.request().postData());
    if (!lost) {
      lost = true;
      const result = await route.fetch();
      assert.equal(result.status(), 200);
      await result.dispose();
      return route.abort("failed");
    }
    return route.continue();
  });
  await member
    .getByRole("button", { name: "Save notification choices", exact: true })
    .click();
  await member
    .getByRole("button", {
      name: "Retry last notification action",
      exact: true
    })
    .waitFor();
  await until(
    async () =>
      !(await readNotificationPreferences(db, fixture.memberA.token))
        .preferences.feedbackEmail
  );
  await member
    .getByRole("button", {
      name: "Retry last notification action",
      exact: true
    })
    .click();
  await until(
    async () =>
      !(await member
        .getByRole("button", {
          name: "Retry last notification action",
          exact: true
        })
        .count()) &&
      (await member.locator(".gc-settings").getAttribute("aria-busy")) ===
        "false"
  );
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  assert.equal(
    await db.socialOperation.count({
      where: {
        ownerId: fixture.memberA.id,
        key: "notification:" + JSON.parse(bodies[0]).mutationId
      }
    }),
    1
  );
  await member.unroute(url);
  ok(
    "A lost email-choice acknowledgment retries exactly once without restoring withdrawn consent"
  );
  const intake = (
    await readSupport(db, fixture.memberA.token, "new", { feedbackOnly: true })
  ).intake;
  const receipt = await supportCommand(db, fixture.memberA.token, {
    operation: "feedback-create",
    requestKey: crypto.randomUUID(),
    kind: "GENERAL",
    rating: 2,
    description: "PRIVATE browser feedback detail",
    recipientId: intake.recipient.id,
    recipientVersion: intake.recipient.version,
    notice: FEEDBACK_NOTICE,
    consent: true,
    contactAllowed: true,
    channels: ["IN_APP"],
    allowIdea: false,
    publicAttribution: false
  });
  const owner = await pageFor(fixture.owner);
  await go(owner, "/platform/help/cases/" + receipt.caseId);
  await owner
    .getByRole("textbox", { name: "Your reply", exact: true })
    .fill("PRIVATE reviewed browser follow-up");
  const savedReply = owner.waitForResponse(
    (r) =>
      r.url().endsWith("/api/platform/support") &&
      r.request().method() === "POST"
  );
  await owner.getByRole("button", { name: "Save reply", exact: true }).click();
  assert.equal((await savedReply).status(), 200);
  await owner.waitForFunction(() =>
    [...document.forms]
      .filter((f) => f.getAttribute("aria-label") === "Save reply")
      .every((f) => f.getAttribute("aria-busy") !== "true")
  );
  await until(
    async () =>
      !!(await db.supportMessage.findFirst({
        where: { caseId: receipt.caseId, authorId: fixture.owner.id }
      }))
  );

  const activity = await readActivity(db, fixture.memberA.token, {
    category: "feedback"
  });
  assert.equal(activity.items.length, 1);
  assert.equal(activity.items[0].available, true);
  assert.equal(
    await db.notificationDelivery.count({
      where: { event: { sourceId: receipt.caseId } }
    }),
    0
  );
  await go(member, "/platform/activity?category=feedback");
  await member
    .getByText("An update to your private feedback", { exact: true })
    .waitFor();
  assert.ok(!(await member.locator("main").innerText()).includes("PRIVATE"));
  await fits(member);
  await member.screenshot({
    path: output + "/activity-320.png",
    fullPage: true
  });
  await member.getByRole("link", { name: "Open item", exact: true }).click();
  await member
    .getByText("PRIVATE reviewed browser follow-up", { exact: true })
    .waitFor();
  assert.ok(
    member.url().includes("/platform/feedback/cases/" + receipt.caseId)
  );
  ok(
    "A real staff reply creates one selected in-app update; its generic Activity card opens the current private receipt"
  );
  await member
    .getByText("Change contact and sharing choices", { exact: true })
    .click();
  await member
    .getByRole("checkbox", {
      name: "Allow staff to ask about this feedback.",
      exact: true
    })
    .uncheck();
  await send(member, "Save contact and sharing choices");
  await go(member, "/platform/activity?category=feedback");
  await until(
    async () =>
      (await readActivity(db, fixture.memberA.token, { category: "feedback" }))
        .items.length === 0
  );
  assert.equal(
    await member
      .getByText("An update to your private feedback", { exact: true })
      .count(),
    0
  );
  await fits(member);
  assert.deepEqual(errors, []);
  assert.deepEqual(dialogs, []);
  ok(
    "Contact withdrawal removes the Activity item and unread count; the complete narrow-screen flow has no browser errors or unexpected discard prompts"
  );
} finally {
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        results,
        errors,
        dialogs,
        completed: results.length === 4
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  for (const c of contexts) await c.close();
  await browser.close();
  await db.$disconnect();
}
