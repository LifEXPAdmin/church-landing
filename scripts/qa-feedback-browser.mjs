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
const { default: sharp } = await import("sharp");
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
const output = dir + "/feedback-browser";
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
try {
  fixture = await seedSupport(db);
  await seedOperatorGrants(db, fixture.owner, ["REVIEW_COMMUNITY_REPORTS"]);
  const guest = await pageFor();
  await go(guest, "/platform/feedback/requests?description=private&received=1");
  assert.equal(new URL(guest.url()).pathname, "/platform/login");
  assert.equal(
    new URL(guest.url()).searchParams.get("next"),
    "/platform/feedback/requests"
  );
  ok(
    "Guest account entry preserves the feedback destination without draft or saved-action query fields"
  );
  const page = await pageFor(fixture.memberA);
  await go(page, "/platform/feedback");
  await page
    .getByRole("button", { name: "Send feedback", exact: true })
    .waitFor();
  await fits(page);
  assert.equal(
    await page
      .getByRole("checkbox", {
        name: "Allow staff to ask about this feedback.",
        exact: true
      })
      .isChecked(),
    false
  );
  assert.equal(
    await page
      .getByRole("combobox", {
        name: "How has the website been for you? (optional)",
        exact: true
      })
      .inputValue(),
    ""
  );
  assert.match(
    await page.getByRole("main").innerText(),
    new RegExp(fixture.owner.name)
  );
  await page
    .getByRole("combobox", {
      name: "What would you like to share?",
      exact: true
    })
    .selectOption("BUG");
  await page
    .getByLabel("What happened?", { exact: true })
    .fill("Fictional retained problem details.");
  await page
    .getByLabel("What did you expect?", { exact: true })
    .fill("Fictional expected behavior.");
  await page
    .getByRole("combobox", {
      name: "What would you like to share?",
      exact: true
    })
    .selectOption("GENERAL");
  await page
    .getByRole("combobox", {
      name: "What would you like to share?",
      exact: true
    })
    .selectOption("BUG");
  assert.equal(
    await page.getByLabel("What happened?", { exact: true }).inputValue(),
    "Fictional retained problem details."
  );
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await until(async () => !(await createForm(page).isVisible()));
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await createForm(page).waitFor();
  assert.equal(
    await page.getByLabel("What happened?", { exact: true }).inputValue(),
    "Fictional retained problem details."
  );
  await db.supportIntakeSetting.update({
    where: { id: "default" },
    data: { ownerGrantId: fixture.backupGrant.id }
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByRole("button", {
      name: "Use current request with these entries",
      exact: true
    })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Send feedback", exact: true })
      .isDisabled(),
    true
  );
  assert.equal(
    await page.getByLabel("What happened?", { exact: true }).inputValue(),
    "Fictional retained problem details."
  );
  await page
    .getByRole("button", {
      name: "Use current request with these entries",
      exact: true
    })
    .click();
  await page
    .getByRole("button", { name: "Discard local entries", exact: true })
    .click();
  await until(
    async () =>
      !(await page
        .getByRole("button", { name: "Discard local entries", exact: true })
        .isVisible())
  );
  await db.supportIntakeSetting.update({
    where: { id: "default" },
    data: { ownerGrantId: fixture.ownerGrant.id }
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await createForm(page).waitFor();
  ok(
    "320px optional form preserves kind-specific drafts through reconnect and requires review of a changed recipient"
  );
  await page
    .getByRole("combobox", {
      name: "How has the website been for you? (optional)",
      exact: true
    })
    .selectOption("1");
  await page
    .getByRole("checkbox", { name: /I have read the privacy notice/ })
    .check();
  let lost = null,
    retries = [];
  const endpoint = config.origin + "/api/platform/feedback";
  await page.route(endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = JSON.parse(route.request().postData());
    if (body.operation !== "feedback-create") return route.continue();
    retries.push(route.request().postData());
    if (!lost) {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      lost = await response.json();
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Send feedback", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Retry original request", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("combobox", {
        name: "How has the website been for you? (optional)",
        exact: true
      })
      .isDisabled(),
    true
  );
  await send(page, "Retry original request");
  await page.waitForURL(
    (url) => url.pathname === "/platform/feedback/cases/" + lost.caseId
  );
  await page
    .getByRole("heading", { name: "Your feedback choices", exact: true })
    .waitFor();
  assert.equal(retries.length, 2);
  assert.equal(retries[0], retries[1]);
  assert.equal(
    await db.feedbackSubmission.count({
      where: { case: { requesterId: fixture.memberA.id } }
    }),
    1
  );
  assert.match(await page.getByRole("main").innerText(), /1 out of 5/);
  await fits(page);
  await page.unroute(endpoint);
  ok(
    "A rating-only response survives a lost save acknowledgement with an identical retry and one private receipt"
  );
  const owner = await pageFor(fixture.owner);
  await go(owner, "/platform/help/cases/" + lost.caseId);
  await owner
    .getByRole("main")
    .getByText("Follow-up permission is off.", { exact: false })
    .waitFor();
  assert.equal(
    await owner
      .getByRole("button", { name: "Save reply", exact: true })
      .count(),
    0
  );
  assert.equal(
    await owner
      .locator('select[name="status"] option[value="WAITING_FOR_REQUESTER"]')
      .count(),
    0
  );
  await page.bringToFront();
  await page
    .getByText("Change contact and sharing choices", { exact: true })
    .click();
  await page
    .getByLabel("Your reply", { exact: true })
    .fill("A fictional reply retained while choices change.");
  await page
    .getByRole("checkbox", {
      name: "Allow staff to ask about this feedback.",
      exact: true
    })
    .check();
  await page
    .getByRole("checkbox", { name: "Updates in this website", exact: true })
    .check();
  await send(page, "Save contact and sharing choices");
  await page
    .getByRole("button", {
      name: "Use current request with these entries",
      exact: true
    })
    .waitFor();
  assert.equal(
    await page.getByLabel("Your reply", { exact: true }).inputValue(),
    "A fictional reply retained while choices change."
  );
  await page
    .getByRole("button", {
      name: "Use current request with these entries",
      exact: true
    })
    .click();
  await send(page, "Save reply", "support");
  await until(
    async () =>
      (await db.supportMessage.count({
        where: {
          caseId: lost.caseId,
          body: "A fictional reply retained while choices change."
        }
      })) === 1
  );
  await page
    .getByRole("main")
    .getByText("A fictional reply retained while choices change.", {
      exact: true
    })
    .waitFor();
  ok(
    "Follow-up consent gates staff questions; saving choices preserves and deliberately rebases another unsent reply"
  );
  await page.getByRole("link", { name: "Share feedback", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/platform/feedback");
  await createForm(page).waitFor();
  const image = await sharp({
    create: { width: 180, height: 100, channels: 3, background: "blue" }
  })
    .png()
    .toBuffer();
  const file = {
    name: "fictional-screen.png",
    mimeType: "image/png",
    buffer: image
  };
  await page.getByLabel("Choose photos", { exact: true }).setInputFiles(file);
  await page
    .getByRole("button", { name: "Remove selected file", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "Upload private attachment", exact: true })
      .count(),
    0
  );
  await page
    .getByLabel("Choose photos", { exact: true })
    .setInputFiles([file, { ...file, name: "fictional-detail.png" }]);
  await page
    .getByRole("button", { name: "Upload selected attachments", exact: true })
    .click();
  await until(
    async () =>
      (await page
        .getByRole("button", {
          name: "Remove uploaded attachment",
          exact: true
        })
        .count()) === 2
  );
  await page
    .getByRole("button", { name: "Remove uploaded attachment", exact: true })
    .first()
    .click();
  await until(
    async () =>
      (await page
        .getByRole("button", {
          name: "Remove uploaded attachment",
          exact: true
        })
        .count()) === 1
  );
  await page
    .getByLabel("Your experience (optional with a rating)", { exact: true })
    .fill("A fictional screenshot illustrates this website feedback.");
  await page
    .getByRole("checkbox", { name: /I have read the privacy notice/ })
    .check();
  const attached = await send(page, "Send feedback");
  assert.equal(typeof attached.caseId, "string");
  await page.waitForURL(
    (url) => url.pathname === "/platform/feedback/cases/" + attached.caseId,
    { waitUntil: "domcontentloaded" }
  );
  await page
    .getByRole("heading", { name: "Private attachments", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Enlarge attachment", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Close photo", exact: true }).click();
  await until(async () => !(await page.getByRole("dialog").count()));
  assert.equal(
    await page
      .getByRole("button", { name: "Enlarge attachment", exact: true })
      .evaluate((el) => el === document.activeElement),
    true
  );
  await fits(page);
  await page.screenshot({
    path: output + "/private-receipt-320.png",
    fullPage: true
  });
  const assets = await db.mediaAsset.findMany({
    where: { feedbackCaseId: attached.caseId, status: "READY" }
  });
  assert.equal(assets.length, 1);
  await page.getByRole("link", { name: "Report this attachment", exact: true }).click();
  await page.getByLabel("Report reason").waitFor();
  assert.match(await page.getByRole("main").innerText(), /current private case access/);
  await page.getByLabel("Report reason").selectOption("PRIVACY");
  await page.getByLabel("Report details").fill("Fictional private attachment report for browser acceptance.");
  await send(page, "Send private report", "community-reports");
  await page.getByRole("link", { name: "View your private receipt", exact: true }).click();
  await page.getByRole("article", { name: "Private report receipt" }).waitFor();
  assert.match(await page.getByRole("article", { name: "Private report receipt" }).innerText(), /Fictional private attachment report/);
  await fits(page);
  const reportId = new URL(page.url()).searchParams.get("receipt");
  assert.ok(reportId);
  const report = await db.communityReport.findUniqueOrThrow({ where: { id: reportId } });
  assert.equal(report.targetType, "FEEDBACK_ATTACHMENT");
  assert.equal(report.targetId, assets[0].id);
  await go(page, "/platform/feedback/cases/" + attached.caseId);
  await page.getByRole("button", { name: "Remove this attachment", exact: true }).waitFor();
  await send(page, "Remove this attachment");
  await until(
    async () =>
      !(await page
        .getByRole("heading", { name: "Private attachments", exact: true })
        .count())
  );
  assert.equal(
    (await db.mediaAsset.findUniqueOrThrow({ where: { id: assets[0].id } }))
      .status,
    "RETIRED"
  );
  assert.ok(
    (
      await db.retentionControl.findFirstOrThrow({
        where: { kind: "SUPPORT_ATTACHMENT", sourceId: attached.caseId }
      })
    ).journaledAt
  );
  ok(
    "Selected files remove before upload; private uploads attach once, enlarge with restored focus, create a private harm-report receipt and remove through protected case controls"
  );
  const foreign = await pageFor(fixture.memberB);
  await go(foreign, "/platform/feedback/cases/" + attached.caseId);
  await until(
    async () =>
      !(await foreign
        .getByRole("heading", { name: "Your feedback choices", exact: true })
        .count()) &&
      (await foreign.getByRole("main").innerText()).includes("not available")
  );
  assert.equal(
    (await foreign.getByRole("main").innerText()).includes(
      "A fictional screenshot"
    ),
    false
  );
  await page.bringToFront();
  await go(page, "/platform/feedback/requests");
  await page
    .getByRole("link", { name: "Share feedback", exact: true })
    .first()
    .waitFor();
  await until(
    async () =>
      (await page
        .locator('a[href="/platform/feedback/cases/' + attached.caseId + '"]')
        .count()) === 1
  );
  await fits(page);
  assert.deepEqual(errors, []);
  assert.deepEqual(dialogs, []);
  ok(
    "My feedback shows owned receipts at 320px, foreign cases remain concealed, and the complete flow has no browser errors or unexpected discard prompts"
  );
} catch (error) {
  const page = contexts[1]?.pages()[0];
  if (page) {
    await page
      .screenshot({ path: output + "/failure.png", fullPage: true })
      .catch(() => {});
    writeFileSync(
      output + "/failure-layout.json",
      JSON.stringify(
        await page
          .evaluate(() =>
            [
              ...document.querySelectorAll(
                'button[aria-label="Enlarge attachment"],button[aria-label="Enlarge attachment"] img'
              )
            ].map((el) => ({
              tag: el.tagName,
              rect: el.getBoundingClientRect().toJSON(),
              style: {
                display: getComputedStyle(el).display,
                visibility: getComputedStyle(el).visibility
              },
              width: el.width,
              height: el.height,
              naturalWidth: el.naturalWidth,
              complete: el.complete
            }))
          )
          .catch(() => []),
        null,
        2
      )
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
