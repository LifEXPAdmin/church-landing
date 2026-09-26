import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";

assert.ok(process.argv[2], "Pass an existing isolated preview directory");
const dir = resolve(process.argv[2]);
const config = JSON.parse(readFileSync(dir + "/browser-env.json", "utf8"));
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
  AUTH_RATE_LIMIT_SECRET: "volunteer-availability-browser-fictional-".repeat(3),
  SOCIAL_EMAIL_ENABLED: "false",
  BLOB_READ_WRITE_TOKEN: "",
  BLOB_STORE_ID: "",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: ""
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase } = await import("../tests/seed-portal.ts");
const { seedVolunteerAvailability } =
  await import("../tests/seed-volunteer-availability.ts");
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
const output = dir + "/volunteer-availability-browser-" + Date.now();
mkdirSync(output, { recursive: true, mode: 0o700 });
const results = [],
  errors = [],
  contexts = [],
  externalRequests = [];
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
    viewport: { width, height: 900 },
    timezoneId: "America/Chicago"
  });
  contexts.push(context);
  if (actor) await context.addCookies([cookie(actor)]);
  await context.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === config.origin)
      return route.continue();
    externalRequests.push(new URL(route.request().url()).origin);
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  return { context, page };
}
async function go(page, path) {
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
  await page.getByRole("heading", { level: 1 }).waitFor();
  return response;
}
async function until(fn, message) {
  for (let n = 0; n < 100; n++) {
    if (await fn()) return;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(message ?? "State did not settle");
}
async function noOverflow(page) {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal page overflow"
  );
}
const availabilityForm = (page) =>
  page.getByRole("form", {
    name: "Private volunteer availability",
    exact: true
  });
const availabilityInput = (page) =>
  availabilityForm(page).getByRole("textbox", {
    name: "Preferred days or times for this opportunity (optional)",
    exact: true
  });
const endpoint = "/api/platform/volunteers";
async function api(page, owner, path, body) {
  return page.evaluate(
    async ({ owner, path, body }) => {
      const response = await fetch(path, {
        method: body ? "POST" : "GET",
        headers: {
          ...(owner ? { "x-expected-account": owner } : {}),
          ...(body ? { "content-type": "application/json" } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      return { status: response.status, text: await response.text() };
    },
    { owner, path, body }
  );
}
let phase = "seed";
try {
  const f = await seedVolunteerAvailability(db);
  const applicant = await actorPage(f.lee);
  const optional = await actorPage(f.morgan);
  const coordinator = await actorPage(f.ada, 1280);
  const unrelated = await actorPage(f.val);
  const anonymous = await actorPage(null);
  const path = `/platform/serve/${f.opportunity.id}`;
  const record = () =>
    db.volunteerApplication.findUniqueOrThrow({
      where: {
        opportunityId_userId: {
          opportunityId: f.opportunity.id,
          userId: f.lee.id
        }
      }
    });
  const canonical = () =>
    db.calendarOccurrence.findUniqueOrThrow({
      where: { id: f.occurrence.id },
      select: {
        startAt: true,
        endAt: true,
        startLocal: true,
        endLocal: true,
        timeZone: true,
        version: true,
        canceledAt: true
      }
    });
  const sourceBefore = await canonical();

  phase = "optional application";
  await go(optional.page, path);
  const emptyForm = optional.page.getByRole("form", {
    name: "Volunteer application",
    exact: true
  });
  await emptyForm.getByRole("checkbox").check();
  await emptyForm
    .getByRole("button", { name: "Submit application", exact: true })
    .click();
  await optional.page.waitForURL("**/platform/serve/applications");
  const empty = await db.volunteerApplication.findUniqueOrThrow({
    where: {
      opportunityId_userId: {
        opportunityId: f.opportunity.id,
        userId: f.morgan.id
      }
    }
  });
  assert.equal(empty.availability, "");
  assert.equal(empty.state, "SUBMITTED");
  ok(
    "Availability is optional; an application saves with no preference or reserved place."
  );

  phase = "apply with private availability";
  const response = await go(applicant.page, path);
  assert.match(response.headers()["cache-control"], /no-store/);
  assert.match(response.headers()["x-robots-tag"], /noindex/);
  const apply = applicant.page.getByRole("form", {
    name: "Volunteer application",
    exact: true
  });
  await apply
    .getByLabel("Optional note to the coordinator", { exact: true })
    .fill(f.privateStatement);
  await apply
    .getByLabel("Availability for this opportunity (optional)", { exact: true })
    .fill(f.privateAvailability);
  await apply.getByRole("checkbox").check();
  await apply
    .getByRole("button", { name: "Submit application", exact: true })
    .click();
  await applicant.page.waitForURL("**/platform/serve/applications");
  assert.equal((await record()).availability, f.privateAvailability);
  assert.equal((await record()).signupId, null);
  await go(applicant.page, path);
  await availabilityInput(applicant.page).waitFor();
  assert.equal(
    await availabilityInput(applicant.page).inputValue(),
    f.privateAvailability
  );
  assert.equal(
    await db.postVolunteerSignup.count({
      where: { slotId: f.opportunity.slotId }
    }),
    0
  );
  assert.deepEqual(await canonical(), sourceBefore);
  ok(
    "Private availability survives actual navigation and reload without changing the canonical shift or allocating a place."
  );

  phase = "responsive availability";
  for (const width of [320, 390, 1280]) {
    await applicant.page.setViewportSize({ width, height: 900 });
    await applicant.page.evaluate((enlarged) => {
      document.documentElement.style.fontSize = enlarged ? "200%" : "";
    }, width === 320);
    await noOverflow(applicant.page);
    await applicant.page.screenshot({
      path: `${output}/availability-${width}.png`,
      fullPage: true
    });
  }
  await applicant.page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await applicant.page.setViewportSize({ width: 390, height: 900 });
  ok(
    "The saved preference and edit controls fit 320, 390 and 1280 pixels, including enlarged text at 320."
  );

  phase = "private read and write boundaries";
  await go(coordinator.page, path + "/applications");
  await coordinator.page
    .getByText(`Availability for this opportunity: ${f.privateAvailability}`, {
      exact: true
    })
    .waitFor();
  await noOverflow(coordinator.page);
  assert.equal(
    await coordinator.page
      .getByRole("form", {
        name: "Private volunteer availability",
        exact: true
      })
      .count(),
    0
  );
  await go(unrelated.page, path);
  await go(anonymous.page, path);
  for (const actor of [unrelated, anonymous]) {
    const html = await actor.page.content();
    assert.ok(!html.includes(f.privateAvailability));
    assert.ok(!html.includes(f.privateStatement));
    const denied = await api(
      actor.page,
      actor === unrelated ? f.val.id : null,
      `${endpoint}?view=applications&id=${f.opportunity.id}`
    );
    assert.equal(denied.status, actor === unrelated ? 404 : 401);
    assert.ok(!denied.text.includes(f.privateAvailability));
  }
  const beforeDenied = await record();
  const deniedEdit = await api(unrelated.page, f.val.id, endpoint, {
    operation: "availability",
    mutationId: randomUUID(),
    id: beforeDenied.id,
    expectedVersion: beforeDenied.version,
    availability: "Unauthorized fictional edit"
  });
  assert.equal(deniedEdit.status, 404);
  assert.deepEqual(await record(), beforeDenied);
  ok(
    "Only the applicant and current coordinator read the preference; unrelated and anonymous requests cannot disclose or edit it."
  );

  phase = "lost response and exact retry";
  await availabilityInput(applicant.page).fill(f.editedAvailability);
  const requests = [];
  let lost = false;
  await applicant.page.route(config.origin + endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    requests.push(route.request().postData());
    if (!lost) {
      lost = true;
      const reply = await route.fetch();
      assert.ok([200, 202].includes(reply.status()));
      await reply.dispose();
      return route.abort("failed");
    }
    return route.continue();
  });
  const beforeRetry = await record();
  await availabilityForm(applicant.page)
    .getByRole("button", { name: "Save availability", exact: true })
    .click();
  await availabilityForm(applicant.page)
    .getByRole("button", { name: "Confirm original save", exact: true })
    .click();
  await until(
    async () => (await record()).availability === f.editedAvailability
  );
  await until(
    async () => requests.length === 2,
    "The exact retry must reach the request interceptor"
  );
  await until(
    async () =>
      await availabilityForm(applicant.page)
        .getByRole("button", { name: "Save availability", exact: true })
        .isEnabled(),
    "The retry must settle before removing the request interceptor"
  );
  await applicant.page.unroute(config.origin + endpoint);
  assert.equal(requests.length, 2);
  assert.equal(requests[0], requests[1]);
  assert.equal((await record()).version, beforeRetry.version + 1);
  assert.equal(
    await db.volunteerApplicationEvent.count({
      where: {
        applicationId: beforeRetry.id,
        action: "AVAILABILITY_UPDATED"
      }
    }),
    1
  );
  await go(applicant.page, path);
  assert.equal(
    await availabilityInput(applicant.page).inputValue(),
    f.editedAvailability
  );
  assert.deepEqual(await canonical(), sourceBefore);
  ok(
    "A lost save response retries the exact request once and preserves the saved preference and canonical schedule."
  );

  phase = "validation and conflict recovery";
  const overlong = "Fictional availability ".repeat(25);
  await availabilityInput(applicant.page).evaluate((element) =>
    element.removeAttribute("maxlength")
  );
  await availabilityInput(applicant.page).fill(overlong);
  await availabilityForm(applicant.page)
    .getByRole("button", { name: "Save availability", exact: true })
    .click();
  await applicant.page
    .getByText(
      "Use 0 to 500 characters for this field. Your text has not been shortened.",
      { exact: true }
    )
    .waitFor();
  assert.equal(await availabilityInput(applicant.page).inputValue(), overlong);
  assert.equal((await record()).availability, f.editedAvailability);
  await availabilityInput(applicant.page).fill(
    "Fictional unsaved conflict preference"
  );
  const current = await record();
  const changed = await api(applicant.page, f.lee.id, endpoint, {
    operation: "availability",
    mutationId: randomUUID(),
    id: current.id,
    expectedVersion: current.version,
    availability: f.privateAvailability
  });
  assert.ok([200, 202].includes(changed.status));
  await availabilityForm(applicant.page)
    .getByRole("button", { name: "Save availability", exact: true })
    .click();
  await applicant.page
    .getByRole("button", { name: "Reload current saved choices", exact: true })
    .waitFor();
  assert.equal(
    await availabilityInput(applicant.page).inputValue(),
    "Fictional unsaved conflict preference"
  );
  assert.equal((await record()).availability, f.privateAvailability);
  await applicant.page
    .getByRole("button", { name: "Reload current saved choices", exact: true })
    .click();
  await until(
    async () =>
      (await availabilityInput(applicant.page).inputValue()) ===
      f.privateAvailability
  );
  ok(
    "Server validation retains unshortened entries; a real version conflict preserves the draft and reloads the current saved preference."
  );

  phase = "remove and restore preference";
  await availabilityForm(applicant.page)
    .getByRole("button", { name: "Remove availability", exact: true })
    .click();
  await until(async () => (await record()).availability === "");
  await go(applicant.page, path);
  assert.equal(await availabilityInput(applicant.page).inputValue(), "");
  assert.equal(
    await availabilityForm(applicant.page)
      .getByRole("button", { name: "Remove availability", exact: true })
      .count(),
    0
  );
  await availabilityInput(applicant.page).fill(f.privateAvailability);
  await availabilityForm(applicant.page)
    .getByRole("button", { name: "Save availability", exact: true })
    .click();
  await until(
    async () => (await record()).availability === f.privateAvailability
  );
  ok(
    "Removing availability persists an empty value; the applicant can add a fresh preference without reapplying."
  );

  phase = "coordinator approval";
  await go(coordinator.page, path + "/applications");
  const review = coordinator.page.getByRole("article").filter({
    has: coordinator.page.getByRole("heading", {
      name: f.lee.name,
      exact: true
    })
  });
  await review
    .getByRole("button", { name: "Accept application", exact: true })
    .click();
  await review.getByText("Application: accepted.", { exact: false }).waitFor();
  const accepted = await record();
  assert.equal(accepted.state, "ACCEPTED");
  assert.equal(accepted.availability, f.privateAvailability);
  assert.equal(
    (
      await db.postVolunteerSignup.findUniqueOrThrow({
        where: { id: accepted.signupId }
      })
    ).state,
    "ACTIVE"
  );
  await go(applicant.page, path);
  assert.equal(
    await availabilityInput(applicant.page).inputValue(),
    f.privateAvailability
  );
  ok(
    "Coordinator approval preserves the preference and creates only the canonical volunteer assignment."
  );

  phase = "independent reminder opt-in";
  await go(applicant.page, "/platform/settings/notifications/availability");
  const reminder = () =>
    applicant.page.getByLabel("Volunteer shift reminders", { exact: true });
  const calendar = () =>
    applicant.page.getByLabel("Timed calendar reminders", { exact: true });
  const save = () =>
    applicant.page.getByRole("button", {
      name: "Save notification choices",
      exact: true
    });
  await reminder().waitFor();
  assert.equal(await reminder().inputValue(), "0");
  assert.equal(await calendar().inputValue(), "0");
  for (const value of ["15", "60", "0"]) {
    await reminder().selectOption(value);
    await save().click();
    await until(
      async () =>
        (
          await db.socialPreferences.findUnique({
            where: { ownerId: f.lee.id }
          })
        )?.volunteerReminderMinutes === Number(value)
    );
    await until(async () => !(await save().isEnabled()));
    await applicant.page.reload();
    await reminder().waitFor();
    assert.equal(await reminder().inputValue(), value);
    assert.equal(await calendar().inputValue(), "0");
  }
  await applicant.page.setViewportSize({ width: 320, height: 900 });
  await noOverflow(applicant.page);
  await applicant.page.screenshot({
    path: output + "/reminder-preference-320.png",
    fullPage: true
  });
  await applicant.page.setViewportSize({ width: 390, height: 900 });
  assert.deepEqual(await canonical(), sourceBefore);
  assert.equal(
    await db.calendarResponse.count({
      where: { userId: f.lee.id, occurrenceId: f.occurrence.id }
    }),
    0
  );
  ok(
    "Volunteer reminders start Off after approval; explicit 15, 60 and Off choices survive reload separately from calendar RSVP reminders."
  );

  phase = "retained account switch";
  await go(applicant.page, path);
  await availabilityInput(applicant.page).waitFor();
  await applicant.page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await applicant.context.clearCookies();
  await applicant.context.addCookies([cookie(f.val)]);
  await applicant.page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await applicant.page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: false
    })
    .waitFor();
  assert.equal(await availabilityForm(applicant.page).isVisible(), false);
  assert.equal(
    await applicant.page
      .getByText(
        `Availability for this opportunity: ${f.privateAvailability}`,
        { exact: true }
      )
      .isVisible(),
    false
  );
  await applicant.context.clearCookies();
  await applicant.context.addCookies([cookie(f.lee)]);
  ok(
    "Switching accounts conceals both the retained private preference and its controls before another action."
  );

  phase = "revoked coordinator";
  await go(coordinator.page, path + "/applications");
  await coordinator.page
    .getByText(`Availability for this opportunity: ${f.privateAvailability}`, {
      exact: true
    })
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
      .getByText(
        `Availability for this opportunity: ${f.privateAvailability}`,
        { exact: true }
      )
      .isVisible(),
    false
  );
  ok(
    "Revoking coordinator authority conceals a retained preference and private application queue."
  );

  phase = "withdrawal erases availability";
  await go(applicant.page, path);
  await applicant.page
    .getByRole("button", {
      name: "Withdraw application or assignment",
      exact: true
    })
    .click();
  await applicant.page
    .getByText("Application: withdrawn.", { exact: false })
    .waitFor();
  const withdrawn = await record();
  assert.equal(withdrawn.availability, "");
  assert.equal(withdrawn.state, "WITHDRAWN");
  assert.equal(
    (
      await db.postVolunteerSignup.findUniqueOrThrow({
        where: { id: accepted.signupId }
      })
    ).state,
    "CANCELED"
  );
  await go(applicant.page, path);
  assert.ok(!(await applicant.page.content()).includes(f.privateAvailability));
  assert.equal(
    await applicant.page
      .getByLabel("Availability for this opportunity (optional)", {
        exact: true
      })
      .inputValue(),
    ""
  );
  assert.deepEqual(await canonical(), sourceBefore);
  ok(
    "Withdrawal clears availability, cancels the same assignment and leaves a fresh empty preference if the applicant applies again."
  );

  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        results,
        errors,
        externalRequests,
        externalSends: 0,
        productionWrites: 0
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  console.log("VOLUNTEER_AVAILABILITY_BROWSER_PASS " + results.length);
  console.log("Evidence: " + output);
} catch (error) {
  writeFileSync(
    output + "/failure.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        phase,
        results,
        errors,
        externalRequests,
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
  console.error("VOLUNTEER_AVAILABILITY_BROWSER_FAILED", phase, error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await db.$disconnect();
}
