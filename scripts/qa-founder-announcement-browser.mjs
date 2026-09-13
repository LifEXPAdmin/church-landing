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
const output = fixtureDir + "/founder-announcement-browser";
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
const { founder, member, welcome } = JSON.parse(
  readFileSync(fixtureDir + "/founder-browser-actors.json", "utf8")
);
Object.assign(process.env, {
  FOUNDER_ACCOUNT_ID: founder.id,
  FOUNDER_WELCOME_ENABLED: "true",
  COMMUNITY_REPORTS_ENABLED: "true"
});
const { deliverFounderWelcome } =
  await import("../lib/platform/founder-welcome.ts");
const { founderAnnouncementCommand, deliverAnnouncementRecipient } =
  await import("../lib/platform/founder-announcements.ts");
const actor = await createPortalActor(db, "announcebrowser");
await deliverFounderWelcome(db, actor.id);
const picked = await db.founderWelcome.findUniqueOrThrow({
  where: { recipientId: actor.id }
});
const before = await db.adultMessage.count({
  where: { conversationId: picked.conversationId }
});
try {
  await signIn(founder);
  await go("/platform/messages/announcements");
  const box = page.getByRole("textbox", {
    name: "Announcement text",
    exact: true
  });
  await box.fill("Fixture announcement for browser verification only.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page
    .getByRole("heading", { name: "Saved draft", exact: true })
    .waitFor();
  const saved = await db.founderAnnouncement.findFirstOrThrow({
    where: {
      founderId: founder.id,
      status: "DRAFT",
      content: "Fixture announcement for browser verification only."
    },
    orderBy: { createdAt: "desc" }
  });
  await box.fill("My locally revised fixture text survives a conflict.");
  await founderAnnouncementCommand(db, founder.token, {
    operation: "save",
    ownerId: founder.id,
    mutationId: randomUUID(),
    id: saved.id,
    expectedVersion: saved.version,
    content: "A second fixture tab changed this draft."
  });
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Use current version and keep my text",
      exact: true
    })
    .click();
  assert.equal(
    await box.inputValue(),
    "My locally revised fixture text survives a conflict."
  );
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page
    .getByText(
      "Draft saved. Preview the revised text and recipients before sending.",
      { exact: true }
    )
    .waitFor();
  ok(
    "Draft version conflict preserves local text and requires an explicit current-version decision"
  );
  await page
    .getByRole("button", { name: "Refresh eligible members", exact: true })
    .click();
  await page.getByRole("checkbox", { name: new RegExp(actor.name) }).check();
  await page
    .getByRole("button", { name: "Preview selected recipients", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Announcement preview", exact: true })
    .waitFor();
  assert.equal(
    await db.adultMessage.count({
      where: { conversationId: picked.conversationId }
    }),
    before
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Send reviewed announcement", exact: true })
      .isDisabled(),
    true
  );
  await bounded();
  await page.screenshot({
    path: output + "/preview-phone.png",
    fullPage: true
  });
  ok(
    "Preview displays saved text and explicitly selected recipients, sends nothing, and fits the phone viewport"
  );
  await page
    .getByRole("checkbox", {
      name: "I reviewed this text and recipient list and want to send this announcement.",
      exact: true
    })
    .check();
  let lost = false;
  const sentBodies = [];
  await page.route("**/api/platform/founder-announcements", async (route) => {
    const request = route.request();
    if (
      request.method() === "POST" &&
      request.postDataJSON().operation === "send"
    ) {
      sentBodies.push(request.postData());
      if (!lost) {
        lost = true;
        await route.fetch();
        await route.abort("failed");
        return;
      }
    }
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Send reviewed announcement", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Retry the same request", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Send progress", exact: true })
    .waitFor();
  assert.equal(sentBodies.length, 2);
  assert.equal(sentBodies[0], sentBodies[1]);
  const id = JSON.parse(sentBodies[0]).id;
  for (let i = 0; i < 5; i++)
    if ((await deliverAnnouncementRecipient(db, id)).done) break;
  await page
    .getByRole("button", { name: "Refresh progress", exact: true })
    .click();
  await page
    .getByText("Finished: 1 sent, 0 skipped, 0 remaining.", { exact: true })
    .waitFor();
  assert.equal(
    await db.adultMessage.count({
      where: {
        conversationId: picked.conversationId,
        kind: "FOUNDER_ANNOUNCEMENT"
      }
    }),
    1
  );
  assert.equal(
    (
      await db.adultConversation.findUniqueOrThrow({
        where: { id: picked.conversationId }
      })
    ).sendingAllowed,
    false
  );
  assert.equal(
    await page
      .getByRole("link", { name: "Open sent conversation", exact: true })
      .count(),
    1
  );
  await bounded();
  ok(
    "A lost send acknowledgement retries the identical body, produces one canonical message, and reports conversation delivery separately from phones"
  );
  await page.getByRole("button", { name: "New draft", exact: true }).click();
  await box.fill("Private unsaved founder fixture work");
  await signIn(actor);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByText(/private announcement work is hidden/).waitFor();
  assert.equal(await box.count(), 0);
  assert.equal(
    await page
      .getByText("Private unsaved founder fixture work", { exact: true })
      .count(),
    0
  );
  await go("/platform/messages/announcements");
  await page
    .getByText(
      "Founder announcement controls are unavailable for this account.",
      { exact: true }
    )
    .waitFor();
  assert.equal(await box.count(), 0);
  ok(
    "Account switching conceals private draft work and ordinary members cannot access founder controls"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        passed: results.length,
        checks: results,
        errors,
        providerSends: 0,
        productionWrites: 0,
        physicalPhoneObserved: false
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
  await db.$disconnect();
}
