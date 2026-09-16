import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the existing isolated Exchange preview directory");
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(config.origin, /^https:\/\/exchange-fixture\.example\.test:\d+$/);
assert.match(config.localOrigin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.localOrigin,
  NEXT_PUBLIC_SITE_URL: config.localOrigin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + fixtureDir + "/sink",
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: "",
  PRIVILEGED_MFA_MODE: "enroll",
  COMMUNITY_REPORTS_ENABLED: "true",
  BLOB_READ_WRITE_TOKEN: "",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  MEDIA_STORAGE_MODE: "local-test",
  RETENTION_TEST_DIR: process.cwd() + "/" + fixtureDir + "/retention",
  MEDIA_TEST_DIR: process.cwd() + "/" + fixtureDir + "/images"
});
const { PrismaClient } = await import("@prisma/client");
const { createPortalActor, assertPortalTestDatabase, seedOperatorGrants } =
  await import("../tests/seed-portal.ts");
const { EXCHANGE_ITEM_POLICY } =
  await import("../lib/platform/exchange-options.ts");
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
      createHash("sha256").update(der).digest("base64"),
    "--host-resolver-rules=MAP exchange-fixture.example.test 127.0.0.1",
    "--no-proxy-server"
  ]
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true
});
await context.route("**/*", (route) =>
  new URL(route.request().url()).hostname === "exchange-fixture.example.test"
    ? route.continue()
    : route.abort()
);
const page = await context.newPage(),
  errors = [],
  results = [],
  output = fixtureDir + "/exchange-browser-" + Date.now();
mkdirSync(output, { recursive: true });
page.on("pageerror", (e) =>
  errors.push({ path: new URL(page.url()).pathname, message: e.message })
);
page.on("dialog", (dialog) => dialog.accept());
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const go = async (path) => {
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
  return response;
};
const signIn = async (actor) => {
  await context.clearCookies();
  if (actor)
    await context.addCookies([
      {
        name: "church_platform_session",
        value: actor.token,
        url: config.origin,
        secure: true,
        httpOnly: true,
        sameSite: "Lax"
      }
    ]);
};
const bounded = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal page overflow"
  );
const waitUntil = async (work) => {
  for (let i = 0; i < 80; i++) {
    if (await work()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Expected saved state was not observed");
};
try {
  const { exchangeHandoffCommand: command, readExchangeHandoffs } =
    await import("../lib/platform/exchange-handoffs.ts");
  const { relationshipCommand } =
    await import("../lib/platform/relationships.ts");
  const owner = await createPortalActor(db, "handbrowserowner"),
    requester = await createPortalActor(db, "handbrowserrequest"),
    stranger = await createPortalActor(db, "handbrowserstranger"),
    reviewer = await createPortalActor(db, "handbrowserreviewer");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  await db.socialPreferences.create({
    data: { ownerId: owner.id, contactRequests: "EVERYONE" }
  });
  const marker = "Fictional browser handoff " + randomUUID();
  const pickup = "Private fictional BLUE GATE code " + randomUUID();
  const purpose = "I would like this fictional table for an isolated test.";
  const makeListing = () =>
    db.exchangeListing.create({
      data: {
        ownerId: owner.id,
        creatorId: owner.id,
        state: "ACTIVE",
        title: marker,
        description: "An isolated browser fixture",
        category: "FURNITURE",
        condition: "GOOD",
        country: "US",
        placeId: 4887398,
        placeLabel: "Chicago",
        itemPolicy: EXCHANGE_ITEM_POLICY,
        confirmedAt: new Date(),
        publishedAt: new Date()
      }
    });
  const listing = await makeListing();
  const input = (operation, data) => ({
    operation,
    mutationId: randomUUID(),
    ...data
  });
  const plan = () => {
    const start = new Date(Date.now() + 3 * 86400000);
    start.setUTCSeconds(0, 0);
    return {
      startLocal: start.toISOString().slice(0, 16),
      endLocal: new Date(start.getTime() + 3600000).toISOString().slice(0, 16),
      timeZone: "UTC",
      pickupDetails: pickup
    };
  };
  const createInquiry = async (row) => {
    await command(
      db,
      owner.token,
      input("contact", {
        listingId: row.id,
        listingVersion: row.version,
        expectedVersion: row.inquiryContactVersion,
        enabled: true
      })
    );
    const target = (
      await readExchangeHandoffs(db, requester.token, {
        view: "target",
        listingId: row.id
      })
    ).target;
    return command(
      db,
      requester.token,
      input("inquire", {
        id: randomUUID(),
        expectedVersion: 0,
        listingId: row.id,
        listingVersion: target.listingVersion,
        contactVersion: target.contactVersion,
        purpose
      })
    );
  };
  const exact = (name) => page.getByRole("button", { name, exact: true });
  const state = (name) =>
    page.getByText(name, { exact: true }).first().waitFor();
  const resume = () =>
    page.evaluate(() => {
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("focus"));
    });
  await signIn(owner);
  await go("/platform/exchange/defaults");
  await page
    .getByRole("combobox", { name: /Default personal listing type/ })
    .selectOption("WANTED");
  await page
    .getByLabel("Reusable private pickup instructions (optional)", {
      exact: false
    })
    .fill(pickup);
  await page.goBack();
  await state("Save or resolve your private choice before leaving.");
  assert.equal(new URL(page.url()).pathname, "/platform/exchange/defaults");
  assert.equal(
    await page
      .getByLabel("Reusable private pickup instructions (optional)", {
        exact: false
      })
      .inputValue(),
    pickup
  );
  await exact("Save personal defaults").click();
  await waitUntil(
    async () =>
      (await db.exchangeDefaults.findUnique({ where: { ownerId: owner.id } }))
        ?.pickupDetails === pickup
  );
  await go("/platform/exchange/new");
  await exact("Apply my personal defaults").click();
  await state(
    "Personal defaults applied to this new draft. Review its type, audience and general town. Private pickup text and inquiry consent were not copied."
  );
  assert.equal(
    await page
      .locator("textarea")
      .evaluateAll(
        (elements, secret) => elements.some((e) => e.value.includes(secret)),
        pickup
      ),
    false
  );
  assert.equal(
    await db.exchangeListing.count({ where: { ownerId: owner.id } }),
    1
  );
  ok(
    "Private defaults save only for their owner and seed a new draft deliberately without pickup text, publication or inquiry consent"
  );

  await go(`/platform/exchange/${listing.id}/edit`);
  await page
    .getByLabel(
      "I volunteer as the receiving adult and understand that replacing the receiver ends existing handoffs.",
      { exact: false }
    )
    .check();
  await exact("Enable inquiries with me as receiver").click();
  await state("You are this listing’s named receiving adult.");
  await bounded();
  await signIn(requester);
  await go(`/platform/exchange/${listing.id}`);
  await page.getByLabel("Brief purpose", { exact: false }).fill(purpose);
  let lost = false,
    originalBody;
  await page.route("**/api/platform/exchange", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    if (!lost) {
      lost = true;
      originalBody = route.request().postData();
      const response = await route.fetch({
        url: config.localOrigin + new URL(route.request().url()).pathname
      });
      assert.equal(response.status(), 200, await response.text());
      return route.abort("failed");
    }
    assert.equal(route.request().postData(), originalBody);
    return route.continue();
  });
  await exact("Send private inquiry").click();
  await exact("Confirm original save").waitFor();
  await resume();
  await exact("Confirm original request").click();
  await page.waitForURL("**/platform/exchange/handoffs/*");
  await state("Inquiry sent");
  await page.unroute("**/api/platform/exchange");
  const inquiry = await db.exchangeInquiry.findFirstOrThrow({
    where: { listingId: listing.id, requesterId: requester.id }
  });
  assert.equal(
    await db.exchangeInquiry.count({ where: { listingId: listing.id } }),
    1
  );
  assert.equal(
    await db.exchangeInquiryAudit.count({ where: { inquiryId: inquiry.id } }),
    1
  );
  ok(
    "Separate receiver consent and private inquiry entry recover a lost successful reply after tab resume with one inquiry and audit"
  );

  await signIn(owner);
  await go("/platform/exchange/handoffs?view=incoming");
  assert.equal(await page.getByText(purpose, { exact: true }).count(), 0);
  await page
    .locator(`a[href='/platform/exchange/handoffs/${inquiry.id}']`)
    .click();
  await state(purpose);
  const windowPlan = plan();
  await page
    .getByLabel("Window begins", { exact: false })
    .fill(windowPlan.startLocal);
  await page
    .getByLabel("Window ends", { exact: false })
    .fill(windowPlan.endLocal);
  await page.getByLabel("Time zone", { exact: false }).fill("UTC");
  await exact("Copy my private pickup default").click();
  await waitUntil(
    async () =>
      (await page
        .getByLabel("Private pickup instructions (optional)", { exact: false })
        .inputValue()) === pickup
  );
  await exact("Select and propose this plan").click();
  await state("Waiting for pickup agreement");
  await signIn(requester);
  await go(`/platform/exchange/handoffs/${inquiry.id}`);
  assert.equal(await page.getByText(pickup, { exact: true }).count(), 0);
  assert.equal(
    await page
      .getByRole("region", { name: "Private pickup instructions", exact: true })
      .count(),
    0
  );
  assert.equal(await exact("Agree to pickup plan").isDisabled(), true);
  await page
    .getByLabel(
      "I agree to this exact pickup window and understand its expiry.",
      { exact: false }
    )
    .check();
  const selected = await db.exchangeInquiry.findUniqueOrThrow({
    where: { id: inquiry.id }
  });
  await command(
    db,
    owner.token,
    input("plan", {
      id: inquiry.id,
      expectedVersion: selected.version,
      schema: 1,
      plan: {
        ...windowPlan,
        endLocal: new Date(
          new Date(windowPlan.endLocal + "Z").getTime() + 3600000
        )
          .toISOString()
          .slice(0, 16)
      }
    })
  );
  await exact("Agree to pickup plan").click();
  await exact("Reload current saved choices").waitFor();
  assert.equal(
    (await db.exchangeInquiry.findUniqueOrThrow({ where: { id: inquiry.id } }))
      .state,
    "SELECTED"
  );
  await exact("Reload current saved choices").click();
  await state("Waiting for pickup agreement");
  assert.equal(
    await page
      .getByLabel(
        "I agree to this exact pickup window and understand its expiry.",
        { exact: false }
      )
      .isChecked(),
    false
  );
  await page
    .getByLabel(
      "I agree to this exact pickup window and understand its expiry.",
      { exact: false }
    )
    .check();
  await exact("Agree to pickup plan").click();
  await state("Pickup agreed");
  const history = page.getByRole("region", {
    name: "Handoff status history",
    exact: true
  });
  assert.deepEqual(
    await history.locator("li > p:first-child").allTextContents(),
    [
      "Inquiry sent",
      "Pickup window proposed",
      "Pickup window replaced",
      "Pickup agreed"
    ]
  );
  assert.equal(
    await page
      .getByRole("option", {
        name: "The agreed handoff was missed",
        exact: true
      })
      .count(),
    0
  );
  await state(pickup);
  await bounded();
  await page.screenshot({
    path: output + "/agreed-mobile.png",
    fullPage: true
  });
  ok(
    "Incoming summaries omit private bodies; proposed instructions stay hidden and stale agreement cannot accept a replacement window"
  );

  await page
    .getByRole("link", { name: "Report this agreed pickup plan", exact: true })
    .click();
  await state(pickup);
  assert.equal(
    await db.communityReport.count({ where: { reporterId: requester.id } }),
    0
  );
  await go(`/platform/exchange/handoffs/${inquiry.id}`);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addStyleTag({ content: "html{font-size:24px!important}" });
  await bounded();
  await page.screenshot({
    path: output + "/agreed-enlarged-dark.png",
    fullPage: true
  });
  await exact("Mark handoff complete").click();
  await state("Marked complete");
  await page
    .getByText("Completion was recorded by you.", { exact: false })
    .waitFor();
  assert.equal(await page.getByText(pickup, { exact: true }).count(), 0);
  assert.equal(
    (await db.exchangeListing.findUniqueOrThrow({ where: { id: listing.id } }))
      .state,
    "CLOSED"
  );
  await exact("Clear from my history").click();
  await waitUntil(
    async () =>
      !!(
        await db.exchangeInquiry.findUniqueOrThrow({
          where: { id: inquiry.id }
        })
      ).requesterClearedAt
  );
  await signIn(owner);
  await go(`/platform/exchange/handoffs/${inquiry.id}`);
  await state("Marked complete");
  await page
    .getByText("Completion was recorded by the other participant.", {
      exact: false
    })
    .waitFor();
  ok(
    "Agreed report preview is deliberate; enlarged mobile and dark views fit; completion conceals pickup, closes the listing and history clear stays participant-local"
  );

  const second = await makeListing(),
    secondInquiry = await createInquiry(second);
  await go(`/platform/exchange/handoffs/${secondInquiry.id}`);
  await page
    .getByLabel("Private pickup instructions (optional)", { exact: false })
    .fill("Unsaved fictional handoff notes");
  await page
    .getByRole("link", { name: "Open current listing", exact: true })
    .click();
  await state("Save or resolve your private choice before leaving.");
  assert.equal(
    new URL(page.url()).pathname,
    `/platform/exchange/handoffs/${secondInquiry.id}`
  );
  await exact("Discard unsaved handoff choices").click();
  await signIn(stranger);
  await resume();
  await waitUntil(
    async () =>
      !(await page
        .getByLabel("Private pickup instructions (optional)", { exact: false })
        .isVisible())
  );
  assert.equal(
    await page.getByText(purpose, { exact: true }).isVisible(),
    false
  );
  assert.equal(
    (
      await db.exchangeInquiry.findUniqueOrThrow({
        where: { id: secondInquiry.id }
      })
    ).state,
    "INQUIRED"
  );
  await signIn(owner);
  await go(`/platform/exchange/handoffs/${secondInquiry.id}`);
  await page
    .getByLabel("Window begins", { exact: false })
    .fill(windowPlan.startLocal);
  await page
    .getByLabel("Window ends", { exact: false })
    .fill(windowPlan.endLocal);
  await exact("Select and propose this plan").click();
  await state("Waiting for pickup agreement");
  await exact("Cancel handoff").click();
  await state("Canceled");
  assert.equal(
    (await db.exchangeListing.findUniqueOrThrow({ where: { id: second.id } }))
      .state,
    "CLOSED"
  );
  ok(
    "Unsaved entries block link navigation, switched-account resume conceals private content, and cancel leaves explicit owner reopening required"
  );

  const third = await makeListing(),
    thirdInquiry = await createInquiry(third);
  await signIn(requester);
  await go(`/platform/exchange/handoffs/${thirdInquiry.id}`);
  const relation = await db.socialRelationship.findFirst({
    where: { ownerId: owner.id, targetUserId: requester.id }
  });
  await relationshipCommand(
    db,
    owner.token,
    input("block", {
      kind: "person",
      targetId: requester.id,
      expectedVersion: relation?.version ?? 0,
      desired: true
    })
  );
  await resume();
  await waitUntil(
    async () => !(await page.getByText(purpose, { exact: true }).isVisible())
  );
  assert.equal(
    (
      await db.exchangeInquiry.findUniqueOrThrow({
        where: { id: thirdInquiry.id }
      })
    ).state,
    "REVOKED"
  );
  await signIn(null);
  await go(`/platform/exchange/handoffs/${thirdInquiry.id}`);
  assert.equal(await page.getByText(purpose, { exact: true }).count(), 0);
  assert.equal(await page.getByText(pickup, { exact: true }).count(), 0);
  await bounded();
  ok(
    "Current block revokes the original inquiry and resume conceals its body; signed-out private routes expose no purpose or pickup"
  );
  assert.deepEqual(errors, []);
  ok("No browser runtime errors in the complete private handoff flow");
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.txt",
    await page
      .locator("body")
      .innerText()
      .catch(() => "")
  );
  throw error;
} finally {
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      {
        results,
        errors,
        at: new Date().toISOString(),
        productionWrites: 0,
        externalSends: 0
      },
      null,
      2
    )
  );
  await browser.close();
  await db.$disconnect();
}
