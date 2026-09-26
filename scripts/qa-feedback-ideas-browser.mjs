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
const { seedOperatorGrants } = await import("../tests/seed-portal.ts");

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
const output = dir + "/feedback-ideas-browser";
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
  const submitting = await page
    .getByRole("button", { name: button, exact: true })
    .evaluateHandle((el) => el.closest("form"));
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
    (el) => !el?.isConnected || el.getAttribute("aria-busy") !== "true",
    submitting
  );
  return r.json();
};

const { readSupport, supportCommand } =
  await import("../lib/platform/support.ts");
const { FEEDBACK_NOTICE } = await import("../lib/platform/feedback-policy.ts");
const { readFeedbackIdeaAdministration, feedbackIdeaAdminCommand } =
  await import("../lib/platform/feedback-idea-admin.ts");
const { readCommunityReports } =
  await import("../lib/platform/community-reports.ts");
const form = (page, name) => page.getByRole("form", { name, exact: true });
async function suggestion() {
  const s = await readSupport(db, fixture.memberA.token, "new", {
    feedbackOnly: true
  });
  return supportCommand(db, fixture.memberA.token, {
    operation: "feedback-create",
    requestKey: crypto.randomUUID(),
    kind: "SUGGESTION",
    rating: null,
    outcome: "PRIVATE original browser source",
    helps: "PRIVATE original audience",
    recipientId: s.intake.recipient.id,
    recipientVersion: s.intake.recipient.version,
    notice: FEEDBACK_NOTICE,
    consent: true,
    contactAllowed: false,
    channels: [],
    allowIdea: true,
    publicAttribution: false
  });
}
async function publishFixture(caseId, title) {
  const s = await readFeedbackIdeaAdministration(db, fixture.owner.token, {
    caseId
  });
  return feedbackIdeaAdminCommand(db, fixture.owner.token, {
    operation: "idea-save",
    requestKey: crypto.randomUUID(),
    caseId,
    expectedVersion: 0,
    grantVersion: s.grantVersion,
    sourceVersion: s.source.version,
    feedbackVersion: s.source.feedbackVersion,
    sharingVersion: s.source.sharingVersion,
    title,
    summary: "A second separately reviewed public improvement.",
    status: "CONSIDERING",
    explanation: "A fictional proposed improvement is under review.",
    reviewed: true
  });
}
let member, admin;
try {
  fixture = await seedSupport(db);
  await seedOperatorGrants(db, fixture.owner, ["MANAGE_PRODUCT_FEEDBACK"]);
  await seedOperatorGrants(db, fixture.backup, [
    "MANAGE_PRODUCT_FEEDBACK",
    "REVIEW_COMMUNITY_REPORTS"
  ]);
  const first = await suggestion(),
    second = await suggestion(),
    marker = crypto.randomUUID().slice(0, 8);
  const title = `Reviewed keyboard improvement ${marker}`,
    destinationTitle = `Reviewed navigation improvement ${marker}`;
  const destination = await publishFixture(second.caseId, destinationTitle);
  admin = await pageFor(fixture.owner);
  await go(admin, "/platform/admin/feedback");
  await admin
    .getByRole("heading", { name: "Feedback requests", exact: true })
    .waitFor();
  await fits(admin);
  await go(admin, `/platform/admin/feedback/ideas/${first.caseId}`);
  const publication = form(admin, "Publish reviewed idea");
  await publication
    .getByLabel("Public idea title", { exact: true })
    .fill(title);
  await publication
    .getByLabel("Separate sanitized public summary", { exact: true })
    .fill("A public improvement that makes keyboard navigation easier.");
  await publication
    .getByLabel("Public explanation", { exact: true })
    .fill(
      "Considering the value and practical requirements of this improvement."
    );
  await publication.getByRole("checkbox").focus();
  await publication.getByRole("checkbox").press("Space");
  await supportCommand(db, fixture.memberA.token, {
    operation: "feedback-choices",
    requestKey: crypto.randomUUID(),
    caseId: first.caseId,
    expectedVersion: 1,
    feedbackVersion: 1,
    contactAllowed: false,
    channels: [],
    allowIdea: true,
    publicAttribution: false
  });
  await admin
    .getByRole("button", { name: "Refresh current view", exact: true })
    .click();
  await admin
    .getByRole("button", {
      name: "Use current version with these entries",
      exact: true
    })
    .waitFor();
  assert.equal(
    await publication
      .getByLabel("Public idea title", { exact: true })
      .inputValue(),
    title
  );
  assert.equal(
    await publication
      .getByLabel("Separate sanitized public summary", { exact: true })
      .inputValue(),
    "A public improvement that makes keyboard navigation easier."
  );
  await admin
    .getByRole("button", {
      name: "Use current version with these entries",
      exact: true
    })
    .click();
  await fits(admin);
  await admin.screenshot({
    path: output + "/publication-320.png",
    fullPage: true
  });
  const published = await send(admin, "Publish reviewed idea", "admin");
  await admin
    .getByRole("link", { name: "Open the public idea", exact: true })
    .waitFor();
  assert.equal(
    await db.feedbackIdeaEvent.count({
      where: { ideaId: published.id, action: "PUBLISH" }
    }),
    1
  );
  ok(
    "An authorized reviewer preserves unsent text across a source change, reviews the current version, and publishes separate public text through real 320px keyboard controls"
  );

  const guest = await pageFor();
  await go(guest, `/platform/feedback/ideas/${published.id}`);
  await guest.getByRole("heading", { name: title, exact: true }).waitFor();
  const publicText = await guest.locator("main").innerText();
  assert.ok(!publicText.includes("PRIVATE original"));
  assert.ok(!publicText.includes(first.caseId));
  assert.ok(!publicText.includes(fixture.memberA.name));
  await fits(guest);
  await guest
    .getByRole("link", {
      name: "Sign in to vote or choose updates",
      exact: true
    })
    .click();
  await until(() =>
    Promise.resolve(new URL(guest.url()).pathname === "/platform/login")
  );
  assert.equal(
    new URL(guest.url()).searchParams.get("next"),
    `/platform/feedback/ideas/${published.id}`
  );
  await go(guest, `/platform/feedback/ideas?q=${marker}`);
  await guest.getByRole("link", { name: title, exact: true }).waitFor();
  await fits(guest);
  ok(
    "Guests see only reviewed public summaries, can search the board, and retain the idea destination through sign-in"
  );

  member = await pageFor(fixture.memberA);
  await go(member, `/platform/feedback/ideas/${published.id}`);
  await member
    .getByRole("button", { name: "Add my vote", exact: true })
    .waitFor();
  const endpoint = config.origin + "/api/platform/feedback/ideas";
  let originalBody, replayBody;
  await member.route(endpoint, async (route) => {
    const body = route.request().postDataJSON();
    if (body.operation !== "idea-vote") return route.continue();
    if (!originalBody) {
      originalBody = route.request().postData();
      const accepted = await route.fetch();
      assert.equal(accepted.status(), 200);
      return route.abort("failed");
    }
    replayBody = route.request().postData();
    return route.continue();
  });
  await member
    .getByRole("button", { name: "Add my vote", exact: true })
    .click();
  await member
    .getByRole("button", { name: "Retry original request", exact: true })
    .waitFor();
  await send(member, "Retry original request", "feedback/ideas");
  assert.equal(replayBody, originalBody);
  await member.unroute(endpoint);
  await member
    .getByRole("button", { name: "Remove my vote", exact: true })
    .waitFor();
  assert.equal(
    await db.feedbackIdeaVote.count({
      where: { ideaId: published.id, userId: fixture.memberA.id, active: true }
    }),
    1
  );
  const subscriptions = form(member, "Save idea update choices");
  await subscriptions
    .getByRole("checkbox", { name: "In-app Activity", exact: true })
    .check();
  await send(member, "Save idea update choices", "feedback/ideas");
  await until(
    async () =>
      !!(await db.feedbackIdeaSubscription.findFirst({
        where: {
          ideaId: published.id,
          userId: fixture.memberA.id,
          inAppSince: { not: null }
        }
      }))
  );
  await member
    .getByRole("button", { name: "Remove my vote", exact: true })
    .waitFor();
  await fits(member);
  ok(
    "A lost vote acknowledgment retries the exact original payload once, and explicit idea subscriptions save through the native boundary"
  );

  await member
    .getByRole("link", { name: "Reviewed ideas", exact: true })
    .click();
  await member
    .getByRole("link", { name: destinationTitle, exact: true })
    .click();
  await send(member, "Add my vote", "feedback/ideas");
  await member
    .getByRole("button", { name: "Remove my vote", exact: true })
    .waitFor();
  await go(admin, `/platform/admin/feedback/ideas/${first.caseId}?q=${marker}`);
  const merge = form(admin, "Merge into selected idea");
  await merge
    .getByLabel("Current public destination", { exact: true })
    .selectOption({ label: destinationTitle });
  await merge
    .getByLabel("Public explanation", { exact: true })
    .fill(
      "These public improvements are equivalent for this fictional review."
    );
  await merge.getByRole("checkbox").check();
  await send(admin, "Merge into selected idea", "admin");
  await admin
    .getByRole("button", { name: "Reverse this idea merge", exact: true })
    .waitFor();
  await go(member, `/platform/feedback/ideas/${published.id}`);
  await member
    .getByRole("heading", { name: destinationTitle, exact: true })
    .waitFor();
  assert.match(
    await member.locator("main").innerText(),
    /This idea was merged/
  );
  assert.match(await member.locator("main article").innerText(), /1 vote/);
  await fits(member);
  await member.screenshot({
    path: output + "/merged-idea-320.png",
    fullPage: true
  });
  await admin.bringToFront();
  const unmerge = form(admin, "Reverse this idea merge");
  await unmerge
    .getByLabel("Public explanation", { exact: true })
    .fill(
      "Restore the separate ideas after reviewing their different purposes."
    );
  await unmerge.getByRole("checkbox").check();
  await send(admin, "Reverse this idea merge", "admin");
  await admin
    .getByRole("button", { name: "Merge into selected idea", exact: true })
    .waitFor();
  assert.equal(
    await db.feedbackIdeaVote.count({
      where: {
        userId: fixture.memberA.id,
        ideaId: { in: [published.id, destination.id] },
        active: true
      }
    }),
    2
  );
  assert.equal(
    await db.supportCase.count({
      where: { id: { in: [first.caseId, second.caseId] } }
    }),
    2
  );
  ok(
    "Real merge and reversal controls show the public destination, deduplicate the displayed voter, and preserve both native cases and original votes"
  );

  await go(member, `/platform/feedback/cases/${first.caseId}`);
  await member
    .getByText("Change contact and sharing choices", { exact: true })
    .click();
  await member
    .getByRole("checkbox", {
      name: "Also allow my name to be shown with that reviewed summary.",
      exact: true
    })
    .check();
  const choiceButton = member.getByRole("button", {
    name: "Save contact and sharing choices",
    exact: true
  });
  await choiceButton.waitFor();
  await send(member, "Save contact and sharing choices");
  await member
    .getByRole("heading", { name: "Your feedback choices", exact: true })
    .waitFor();
  await go(guest, `/platform/feedback/ideas/${published.id}`);
  await guest
    .getByText(
      `Contribution acknowledged, by choice: ${fixture.memberA.name}`,
      { exact: true }
    )
    .waitFor();
  await member.bringToFront();
  // Current-access checks remove the private receipt presentation. Returning
  // recreates its disclosure closed while retaining the confirmed choices.
  const choicesDisclosure = member.getByText(
    "Change contact and sharing choices",
    { exact: true }
  );
  await choicesDisclosure.waitFor();
  if (!(await choicesDisclosure.evaluate((node) => node.closest("details").open)))
    await choicesDisclosure.click();
  await member
    .getByRole("checkbox", {
      name: "Also allow my name to be shown with that reviewed summary.",
      exact: true
    })
    .uncheck();
  await member
    .getByRole("checkbox", {
      name: "Allow a reviewed summary of this suggestion to appear on the public ideas board.",
      exact: true
    })
    .uncheck();
  await send(member, "Save contact and sharing choices");
  await member
    .getByRole("heading", { name: "Your feedback choices", exact: true })
    .waitFor();
  await guest.bringToFront();
  await guest.reload({ waitUntil: "domcontentloaded" });
  await guest
    .getByText("This reviewed idea is not available.", { exact: true })
    .waitFor();
  assert.equal(
    await guest.getByRole("heading", { name: title, exact: true }).count(),
    0
  );
  const choiceControls = await db.retentionControl.findMany({
    where: { kind: "FEEDBACK_CHOICES", sourceId: first.caseId }
  });
  assert.ok(
    choiceControls.length >= 2 && choiceControls.every((c) => c.journaledAt)
  );
  ok(
    "Actual contributor controls separately allow name attribution, then withdraw publication; a reloaded public tab conceals the source and recovery is protected"
  );

  const reporter = await pageFor(fixture.memberB);
  await go(reporter, `/platform/feedback/ideas/${destination.id}`);
  await reporter
    .getByRole("link", { name: "Report this public idea", exact: true })
    .click();
  await reporter.getByLabel("Report reason").selectOption("PRIVACY");
  await reporter
    .getByLabel("Report details", { exact: true })
    .fill("A fictional concern limited to this public summary.");
  const report = await send(
    reporter,
    "Send private report",
    "community-reports"
  );
  const moderator = await pageFor(fixture.backup);
  await go(moderator, `/platform/admin/feedback/public/${destination.id}`);
  await moderator
    .getByRole("heading", { name: destinationTitle, exact: true })
    .waitFor();
  assert.ok(
    !(await moderator.locator("main").innerText()).includes("PRIVATE original")
  );
  const withdrawal = form(moderator, "Withdraw public idea");
  await withdrawal
    .getByLabel("Internal withdrawal reason", { exact: true })
    .fill("Withdrawn after a fictional review of the public summary.");
  await fits(moderator);
  await send(moderator, "Withdraw public idea", "admin");
  await until(
    async () =>
      !!(
        await db.feedbackIdea.findUniqueOrThrow({
          where: { id: destination.id }
        })
      ).withdrawnAt
  );
  const reviewed = await readCommunityReports(db, fixture.backup.token, {
    view: "review",
    id: report.id
  });
  assert.equal(reviewed.evidence, undefined);
  assert.ok(reviewed.report.details);
  await go(moderator, `/platform/admin/feedback/ideas/${second.caseId}`);
  await moderator
    .getByText("This admin view or request is not available to this account.", {
      exact: true
    })
    .waitFor();
  ok(
    "A native public-idea report and product-only withdrawal preserve the report receipt and deny private source access"
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(dialogs, []);
} catch (error) {
  for (const [name, page] of [
    ["member", member],
    ["admin", admin]
  ])
    if (page) {
      await page
        .screenshot({ path: output + `/failure-${name}.png`, fullPage: true })
        .catch(() => {});
      writeFileSync(
        output + `/failure-${name}.txt`,
        await page
          .locator("body")
          .innerText()
          .catch(() => "unavailable"),
        { mode: 0o600 }
      );
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
  for (const c of contexts) await c.close();
  await browser.close();
  await db.$disconnect();
}
