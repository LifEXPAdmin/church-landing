import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const dir = resolve(process.argv[2] ?? "");
assert.ok(process.argv[2], "Pass an existing isolated preview directory");
const config = JSON.parse(readFileSync(dir + "/browser-env.json"));
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
const database = new URL(config.database);
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.pathname, "/godschurches_security_test");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  NODE_ENV: "test",
  VERCEL: "",
  PRIVILEGED_MFA_MODE: "off",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: dir + "/sink",
  RETENTION_TEST_DIR: dir + "/retention",
  AUTH_RATE_LIMIT_SECRET: "volunteer-browser-fictional-only-".repeat(3),
  SOCIAL_EMAIL_ENABLED: "false",
  BLOB_READ_WRITE_TOKEN: "",
  BLOB_STORE_ID: "",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: ""
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase } = await import("../tests/seed-portal.ts");
const { seedVolunteerApplications } =
  await import("../tests/seed-volunteer-applications.ts");
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
const output = dir + "/volunteer-browser";
mkdirSync(output, { recursive: true });
const results = [],
  errors = [],
  contexts = [],
  requests = [];
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const cookie = (actor) => ({
  name: "church_platform_session",
  value: actor.token,
  domain: "127.0.0.1",
  path: "/",
  secure: true,
  httpOnly: true,
  sameSite: "Lax"
});
async function actorPage(actor, width = 390) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    timezoneId: "America/Chicago"
  });
  contexts.push(context);
  await context.addCookies([cookie(actor)]);
  const page = await context.newPage();
  page.on("pageerror", (error) =>
    errors.push({ path: new URL(page.url()).pathname, message: error.message })
  );
  page.on("response", async (response) => {
    const path = new URL(response.url()).pathname;
    if (
      path.startsWith("/platform/serve") ||
      path === "/api/platform/volunteers"
    ) {
      let submitted = false,
        accepted = false;
      try {
        const body = await response.text();
        submitted = body.includes("SUBMITTED");
        accepted = body.includes("ACCEPTED");
        if (response.headers()["content-type"]?.includes("x-component"))
          writeFileSync(output + "/rsc-" + requests.length + ".txt", body, {
            mode: 0o600
          });
      } catch {
        /* A canceled response is recorded by status only. */
      }
      requests.push({
        path,
        method: response.request().method(),
        status: response.status(),
        rsc:
          response.headers()["content-type"]?.includes("x-component") ?? false,
        submitted,
        accepted,
        cache: response.headers()["cache-control"]
      });
    }
  });
  page.on("dialog", (dialog) => dialog.accept());
  return { context, page };
}
const go = async (page, path) => {
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
  await page.getByRole("heading", { level: 1 }).waitFor();
  return response;
};
const noOverflow = async (page) =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal page overflow"
  );
let phase = "seed";
try {
  const f = await seedVolunteerApplications(db),
    untimed = await seedVolunteerApplications(db, false);
  const coordinator = await actorPage(f.ada, 1024),
    applicant = await actorPage(f.lee),
    other = await actorPage(f.val);
  phase = "editor";
  await go(coordinator.page, `/platform/serve/new?postId=${f.post.id}`);
  const editor = coordinator.page.getByRole("form", {
    name: "Create volunteer opportunity"
  });
  await editor.getByRole("button", { name: "Save opportunity" }).waitFor();
  await editor
    .getByLabel("Role title", { exact: true })
    .fill("Browser fictional setup shift");
  await editor
    .getByLabel("Purpose and duties")
    .fill("Prepare the fictional welcome table.");
  await editor
    .getByLabel("Requirements", { exact: true })
    .fill("Read the published preparation instructions.");
  await editor
    .getByLabel("Published coordinator contact or contact instructions")
    .fill("Ask the fictional church coordinator.");
  await editor.getByLabel("Use a shorter shift within this event").check();
  await editor
    .getByLabel("Shift starts (UTC)", { exact: true })
    .fill(f.occurrence.startLocal);
  await editor
    .getByLabel("Shift ends (UTC)", { exact: true })
    .fill(
      new Date(f.occurrence.startAt.getTime() + 1800000)
        .toISOString()
        .slice(0, 16)
    );
  await editor.getByRole("button", { name: "Save opportunity" }).click();
  await coordinator.page.waitForURL(
    (url) =>
      /^\/platform\/serve\/[A-Za-z0-9_-]+$/.test(url.pathname) &&
      url.pathname !== "/platform/serve/new"
  );
  const opportunity = await db.volunteerOpportunity.findFirstOrThrow({
    where: { postId: f.post.id, title: "Browser fictional setup shift" },
    include: { slot: true }
  });
  assert.ok(opportunity.slotId);
  assert.equal(
    opportunity.slot.shiftEndAt - opportunity.slot.shiftStartAt,
    1800000
  );
  await coordinator.page
    .getByRole("link", { name: "Review applications", exact: true })
    .waitFor();
  ok(
    "Coordinator creates an approval-required independent shift through the built editor."
  );

  phase = "application and lost response";
  const response = await go(
    applicant.page,
    `/platform/serve/${opportunity.id}`
  );
  assert.match(response.headers()["cache-control"], /no-store/);
  assert.match(response.headers()["x-robots-tag"], /noindex/);
  const form = applicant.page.getByRole("form", {
    name: "Volunteer application"
  });
  await form
    .getByLabel("Optional note to the coordinator")
    .fill("Fictional browser private application note");
  await form.getByRole("checkbox").check();
  let lost = false,
    replayFailure = false;
  await applicant.page.route("**/api/platform/volunteers", async (route) => {
    if (!lost && route.request().method() === "POST") {
      lost = true;
      try {
        const reply = await route.fetch();
        assert.equal(reply.status(), 200);
      } catch {
        replayFailure = true;
      }
      await route.abort("failed");
    } else await route.continue();
  });
  await form.getByRole("button", { name: "Submit application" }).click();
  await form.getByRole("button", { name: "Confirm original save" }).waitFor();
  assert.equal(
    replayFailure,
    false,
    "The isolated route replay must succeed with the trusted preview certificate"
  );
  assert.equal(
    await db.volunteerApplication.count({
      where: { opportunityId: opportunity.id, userId: f.lee.id }
    }),
    1
  );
  assert.equal(
    await db.postVolunteerSignup.count({
      where: { slotId: opportunity.slotId }
    }),
    0
  );
  await form.getByRole("button", { name: "Confirm original save" }).click();
  await applicant.page.waitForURL(
    (url) => url.pathname === "/platform/serve/applications"
  );
  await applicant.page
    .getByRole("main")
    .getByText("Application: submitted.", { exact: false })
    .waitFor();
  assert.equal(
    await db.volunteerApplicationEvent.count({
      where: {
        application: { opportunityId: opportunity.id, userId: f.lee.id },
        action: "SUBMITTED"
      }
    }),
    1
  );
  await applicant.page.unroute("**/api/platform/volunteers");
  ok(
    "A lost response reconciles the original application once, without reserving a place."
  );

  phase = "private review and acceptance";
  await go(other.page, `/platform/serve/${opportunity.id}`);
  assert.ok(
    !(await other.page.content()).includes(
      "Fictional browser private application note"
    )
  );
  await go(coordinator.page, `/platform/serve/${opportunity.id}/applications`);
  await coordinator.page
    .getByRole("button", { name: "Accept application", exact: true })
    .waitFor();
  await coordinator.page
    .getByRole("button", { name: "Accept application", exact: true })
    .click();
  try {
    await coordinator.page
      .getByRole("main")
      .getByText("Application: accepted.", { exact: false })
      .waitFor({ timeout: 7000 });
  } catch (error) {
    const state = await db.volunteerApplication.findMany({
      where: { opportunityId: opportunity.id },
      select: { state: true, version: true }
    });
    const api = await coordinator.page.evaluate(
      async ({ id, owner }) => {
        const r = await fetch(
          `/api/platform/volunteers?view=applications&id=${id}`,
          { headers: { "x-expected-account": owner } }
        );
        const v = await r.json();
        return {
          status: r.status,
          states: v.items?.map((row) => row.state),
          filled: v.opportunity?.filled
        };
      },
      { id: opportunity.id, owner: f.ada.id }
    );
    writeFileSync(
      output + "/accept-diagnostic.json",
      JSON.stringify({ state, api }),
      { mode: 0o600 }
    );
    throw error;
  }
  const accepted = await db.volunteerApplication.findUniqueOrThrow({
    where: {
      opportunityId_userId: { opportunityId: opportunity.id, userId: f.lee.id }
    },
    include: { signup: true }
  });
  assert.equal(accepted.signup.state, "ACTIVE");
  assert.equal(accepted.state, "ACCEPTED");
  await go(applicant.page, `/platform/serve/${opportunity.id}`);
  await applicant.page
    .getByRole("main")
    .getByText("Application: accepted.", { exact: false })
    .waitFor();
  await applicant.page.setViewportSize({ width: 320, height: 844 });
  await applicant.page.addStyleTag({
    content: "html { font-size: 200% !important; }"
  });
  await noOverflow(applicant.page);
  await applicant.page.screenshot({
    path: output + "/accepted-320-enlarged.png",
    fullPage: true
  });
  ok(
    "Only the coordinator sees application notes; approval creates one assignment; accepted details fit 320 pixels with enlarged text."
  );

  phase = "calendar and old entry point";
  await go(applicant.page, `/platform/commitments?signup=${accepted.signupId}`);
  await applicant.page
    .getByRole("heading", { name: opportunity.title, exact: true })
    .waitFor();
  await noOverflow(applicant.page);
  await go(other.page, `/platform/posts/${f.post.id}`);
  const role = other.page.locator(`#volunteer-${opportunity.slotId}`);
  await role
    .getByRole("link", { name: "View opportunity and application" })
    .waitFor();
  assert.equal(
    await role.getByRole("button", { name: "I can help", exact: true }).count(),
    0
  );
  ok(
    "My commitments uses the canonical accepted shift and the old post entry leads to applications."
  );

  phase = "retained account switch";
  await go(applicant.page, `/platform/serve/${opportunity.id}`);
  await applicant.page
    .getByRole("main")
    .getByText("Your application note:", { exact: false })
    .waitFor();
  await applicant.page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await applicant.context.clearCookies();
  await applicant.context.addCookies([cookie(f.val)]);
  await applicant.page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await applicant.page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: false
    })
    .waitFor();
  assert.equal(
    await applicant.page
      .getByRole("main")
      .getByText("Your application note:", { exact: false })
      .isVisible(),
    false
  );
  ok(
    "Retained application details are concealed when the signed-in account changes."
  );

  phase = "current coordinator revocation";
  await go(coordinator.page, `/platform/serve/${opportunity.id}/applications`);
  await coordinator.page
    .getByRole("main")
    .getByText("Application: accepted.", { exact: false })
    .waitFor();
  await db.churchCapabilityGrant.deleteMany({
    where: {
      churchId: f.churchA.id,
      userId: f.ada.id,
      capability: "MANAGE_CHURCH_VOLUNTEERS"
    }
  });
  await coordinator.page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await coordinator.page
    .getByText("This volunteer opportunity or application is unavailable.", {
      exact: false
    })
    .waitFor();
  assert.equal(
    await coordinator.page
      .getByRole("main")
      .getByText("Application: accepted.", { exact: false })
      .isVisible(),
    false
  );
  ok("A revoked coordinator loses access to the retained private queue.");

  phase = "minimal withdrawal";
  await applicant.context.clearCookies();
  await applicant.context.addCookies([cookie(f.lee)]);
  await db.platformPost.update({
    where: { id: f.post.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  await go(applicant.page, "/platform/serve/applications");
  await applicant.page
    .getByRole("main")
    .getByText("Unavailable volunteer opportunity", { exact: true })
    .waitFor();
  assert.ok(
    !(await applicant.page.content()).includes(
      "Fictional browser private application note"
    )
  );
  await applicant.page
    .getByRole("button", {
      name: "Withdraw application or assignment",
      exact: true
    })
    .click();
  await applicant.page
    .getByRole("main")
    .getByText("Application: withdrawn.", { exact: false })
    .waitFor();
  assert.equal(
    (
      await db.postVolunteerSignup.findUniqueOrThrow({
        where: { id: accepted.signupId }
      })
    ).state,
    "CANCELED"
  );
  ok(
    "Source withdrawal preserves a private minimal cancellation path and releases the same assignment."
  );

  phase = "ongoing assignment";
  const ongoingApplicant = await actorPage(untimed.lee),
    ongoingCoordinator = await actorPage(untimed.ada, 1024);
  await go(ongoingApplicant.page, `/platform/serve/${untimed.opportunity.id}`);
  const ongoingForm = ongoingApplicant.page.getByRole("form", {
    name: "Volunteer application"
  });
  await ongoingForm.getByRole("checkbox").check();
  await ongoingForm.getByRole("button", { name: "Submit application" }).click();
  await ongoingApplicant.page
    .getByRole("main")
    .getByText("Application: submitted.", { exact: false })
    .waitFor();
  await go(
    ongoingCoordinator.page,
    `/platform/serve/${untimed.opportunity.id}/applications`
  );
  await ongoingCoordinator.page
    .getByRole("button", { name: "Accept application", exact: true })
    .click();
  await ongoingCoordinator.page
    .getByRole("main")
    .getByText("Application: accepted.", { exact: false })
    .waitFor();
  const ongoing = await db.volunteerApplication.findUniqueOrThrow({
    where: {
      opportunityId_userId: {
        opportunityId: untimed.opportunity.id,
        userId: untimed.lee.id
      }
    }
  });
  assert.equal(ongoing.signupId, null);
  assert.equal(ongoing.state, "ACCEPTED");
  await go(ongoingApplicant.page, "/platform/serve/applications");
  await ongoingApplicant.page
    .getByRole("main")
    .getByText("Application: accepted.", { exact: false })
    .waitFor();
  ok(
    "An ongoing application is accepted and listed without creating a fake timed signup."
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        results,
        errors,
        externalSends: 0,
        productionWrites: 0
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  console.log("VOLUNTEER_BROWSER_PASS " + results.length);
} catch (error) {
  const retained = [];
  for (const context of contexts)
    for (const page of context.pages())
      retained.push(
        await page
          .evaluate(() => ({
            path: location.pathname,
            hasWorkHistory: !!history.state?.gcPhotoWork
          }))
          .catch(() => null)
      );
  writeFileSync(
    output + "/failure.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        phase,
        results,
        errors,
        requests,
        retained,
        error: String(error)
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  for (let i = 0; i < contexts.length; i++)
    for (const page of contexts[i].pages())
      await page
        .screenshot({ path: `${output}/failure-${i}.png`, fullPage: true })
        .catch(() => {});
  console.error("VOLUNTEER_BROWSER_FAILED", phase, error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await db.$disconnect();
}
