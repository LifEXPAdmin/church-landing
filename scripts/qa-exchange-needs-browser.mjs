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
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
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
  new URL(route.request().url()).hostname === "127.0.0.1"
    ? route.continue()
    : route.abort()
);
context.setDefaultTimeout(15000);
const page = await context.newPage(),
  errors = [],
  results = [],
  output = fixtureDir + "/needs-browser-" + Date.now();
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
  const { seedParticipation } =
    await import("../tests/seed-post-participation.ts");
  const date = (days) =>
    new Date(Date.now() + days * 86400000).toISOString().slice(0, 16);
  const exact = (name) => page.getByRole("button", { name, exact: true });
  const f = await seedParticipation(db);
  const manager = f.ada,
    a = f.val,
    b = f.morgan;
  const reviewer = await createPortalActor(db, "needbrowserreview");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  await db.churchCapabilityGrant.createMany({
    data: [
      {
        userId: manager.id,
        churchId: f.churchA.id,
        capability: "MANAGE_EXCHANGE_LISTINGS"
      },
      {
        userId: a.id,
        churchId: f.churchA.id,
        capability: "MODERATE_EXCHANGE_LISTINGS"
      }
    ]
  });
  await db.socialPreferences.upsert({
    where: { ownerId: manager.id },
    create: { ownerId: manager.id, contactRequests: "EVERYONE" },
    update: { contactRequests: "EVERYONE" }
  });
  const role = await f.slot({ capacity: 2 });
  const marker = "Fictional Church Needs " + randomUUID();
  const listing = await db.exchangeListing.create({
    data: {
      ownerChurchId: f.churchA.id,
      creatorId: manager.id,
      intent: "CHURCH_NEED",
      title: marker,
      description: "Isolated whole-feature browser journey",
      category: "HOUSEHOLD",
      requestedItems: "Ten parcels, two trips and event help",
      audience: "CHURCH",
      audienceChurchId: f.churchA.id,
      country: "US",
      placeId: 4887398,
      placeLabel: "Chicago"
    }
  });
  const path = `/platform/exchange/${listing.id}/needs`;
  writeFileSync(
    fixtureDir + "/latest-needs-actors.json",
    JSON.stringify({
      manager,
      a,
      b,
      listingId: listing.id,
      churchId: f.churchA.id,
      roleId: role.id
    }),
    { mode: 0o600 }
  );
  const currentNeed = () =>
    db.exchangeNeed.findUniqueOrThrow({ where: { listingId: listing.id } });
  const slotRow = (label) =>
    db.exchangeNeedSlot.findFirstOrThrow({
      where: { needId: listing.id, label }
    });
  await go(path);
  assert.ok(!(await page.locator("main").innerText()).includes(marker));
  await go("/platform/exchange/needs");
  await page
    .getByRole("link", { name: "Create an account", exact: true })
    .last()
    .waitFor();
  ok(
    "Guest entry asks for an account and does not expose an unpublished church need"
  );

  await signIn(manager);
  await go(path);
  const setup = page.getByRole("form", {
    name: "Need deadline and coordinator"
  });
  await setup.getByLabel("Exact need deadline").fill(date(3));
  await setup.getByLabel("Time zone, for example America/Chicago").fill("UTC");
  await setup
    .getByRole("checkbox", { name: /I accept responsibility/ })
    .check();
  await setup
    .getByRole("button", {
      name: "Save deadline and coordinator choice",
      exact: true
    })
    .click();
  await page.getByText("Add an action slot", { exact: true }).waitFor();
  assert.equal(
    (await db.exchangeListing.findUniqueOrThrow({ where: { id: listing.id } }))
      .state,
    "DRAFT"
  );
  const addSlot = async (action, label, target, extra = {}) => {
    await page
      .locator("summary")
      .filter({ hasText: "Add an action slot" })
      .click();
    const form = page.getByRole("form", {
      name: "Add need action slot",
      exact: true
    });
    await form
      .getByRole("combobox", { name: "Help requested", exact: true })
      .selectOption(action);
    await form
      .getByLabel("Item or help description", { exact: true })
      .fill(label);
    if (action === "VOLUNTEER")
      await form
        .getByRole("combobox", { name: "Current event role", exact: true })
        .selectOption(role.id);
    else {
      await form
        .getByLabel("Quantity unit, for example parcels or trips", {
          exact: true
        })
        .fill(action === "TRANSPORT" ? "trips" : "parcels");
      await form
        .getByLabel("Target quantity", { exact: true })
        .fill(String(target));
    }
    if (extra.loan) {
      await form
        .getByRole("checkbox", {
          name: "This is a physical equipment loan that must be returned"
        })
        .check();
      await form
        .getByLabel("Equipment return date and time", { exact: true })
        .fill(date(7));
      await form.getByLabel("Return time zone", { exact: true }).fill("UTC");
      await form
        .getByLabel("Who is responsible for returning the equipment", {
          exact: true
        })
        .fill("The fictional coordinator returns the equipment to its lender.");
    }
    await form
      .getByRole("button", { name: "Save action slot", exact: true })
      .click();
    await page.getByRole("heading", { name: label, exact: true }).waitFor();
    await waitUntil(
      async () =>
        (await db.exchangeNeedSlot.count({
          where: { needId: listing.id, label }
        })) === 1
    );
    await bounded();
  };
  await addSlot("DONATE", "Food parcels", 10);
  await addSlot("SELL", "Paid parcel sourcing", 10);
  await addSlot("TRANSPORT", "Parcel transport", 2);
  await addSlot("VOLUNTEER", "Event helpers", 2);
  await addSlot("DONATE", "Loaned equipment", 2, { loan: true });
  await page.screenshot({
    path: output + "/manager-preview.png",
    fullPage: true
  });
  assert.equal(
    await db.exchangeNeedSlot.count({ where: { needId: listing.id } }),
    5
  );
  const { postCommand } = await import("../lib/platform/post-commands.ts");
  const postExcerpt = "Fictional eligible Need post " + randomUUID();
  const needPost = await postCommand(db, manager.token, {
    operation: "create",
    requestKey: randomUUID(),
    authorChurchId: f.churchA.id,
    type: "NEED",
    content: postExcerpt,
    audience: "CHURCH"
  });
  const wake = () =>
    page.evaluate(() => {
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("focus"));
    });
  await go(path);
  await page
    .getByRole("region", { name: "Church Need post links", exact: true })
    .getByText(postExcerpt, { exact: true })
    .waitFor();
  await db.churchCapabilityGrant.updateMany({
    where: {
      churchId: f.churchA.id,
      userId: manager.id,
      capability: "PUBLISH_CHURCH_POSTS"
    },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  await wake();
  await page
    .getByText(/This eligible church Need posts or its access changed/)
    .waitFor();
  assert.equal(
    await page
      .getByRole("region", { name: "Church Need post links", exact: true })
      .isVisible(),
    false
  );
  assert.equal(
    await page.getByRole("heading", { name: marker, exact: true }).isVisible(),
    true
  );
  await db.churchCapabilityGrant.updateMany({
    where: {
      churchId: f.churchA.id,
      userId: manager.id,
      capability: "PUBLISH_CHURCH_POSTS"
    },
    data: { revokedAt: null, version: { increment: 1 } }
  });
  await go(path);
  await page
    .getByRole("region", { name: "Manage need action slots", exact: true })
    .waitFor();
  await db.churchCapabilityGrant.updateMany({
    where: {
      churchId: f.churchA.id,
      userId: manager.id,
      capability: "MANAGE_CHURCH_VOLUNTEERS"
    },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  await wake();
  await page
    .getByText(/This available event roles or its access changed/)
    .waitFor();
  assert.equal(
    await page
      .getByRole("region", { name: "Manage need action slots", exact: true })
      .isVisible(),
    false
  );
  assert.equal(
    await page.getByRole("heading", { name: marker, exact: true }).isVisible(),
    true
  );
  await db.churchCapabilityGrant.updateMany({
    where: {
      churchId: f.churchA.id,
      userId: manager.id,
      capability: "MANAGE_CHURCH_VOLUNTEERS"
    },
    data: { revokedAt: null, version: { increment: 1 } }
  });
  await go(path);
  await exact("Link this post to this need").click();
  await waitUntil(
    async () =>
      (await db.platformPost.findUniqueOrThrow({ where: { id: needPost.id } }))
        .exchangeNeedId === listing.id
  );
  ok(
    "Independent publisher and volunteer duty revocation conceal retained picker content; restored current authority links the existing Need post to canonical slots"
  );
  await go(`/platform/exchange/${listing.id}/edit`);
  await page
    .getByRole("checkbox", { name: /I may publish this listing/ })
    .check();
  await exact("Publish as active").click();
  await waitUntil(
    async () =>
      (
        await db.exchangeListing.findUniqueOrThrow({
          where: { id: listing.id }
        })
      ).state === "ACTIVE"
  );
  await go(path);
  await page
    .getByRole("heading", { name: "Food parcels", exact: true })
    .waitFor();
  ok(
    "Coordinator configures five typed slots, previews truthful private counts and publishes through the existing listing editor"
  );

  await signIn(a);
  await go(path);
  let offer = page.getByRole("form", {
    name: "Offer help for Food parcels",
    exact: true
  });
  const privateNote = "Fictional PRIVATE parcel detail " + randomUUID();
  await offer.getByLabel("Quantity in parcels", { exact: true }).fill("6");
  await offer
    .getByLabel("Optional private note to the coordinator", { exact: true })
    .fill(privateNote);
  const requests = [];
  let lose = true;
  const intercept = async (route) => {
    const req = route.request();
    const body = req.method() === "POST" ? req.postDataJSON() : null;
    if (body?.operation === "need-claim" && body.note === privateNote) {
      requests.push(req.postData());
      if (lose) {
        lose = false;
        await route.fetch();
        await route.abort("failed");
        return;
      }
    }
    await route.continue();
  };
  await page.route("**/api/platform/exchange", intercept);
  await offer
    .getByRole("button", { name: "Commit this quantity", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Confirm original (save|request)/ })
    .first()
    .click();
  await waitUntil(
    async () =>
      (await db.exchangeNeedContribution.count({
        where: { needId: listing.id, contributorId: a.id, note: privateNote }
      })) === 1
  );
  await page
    .getByRole("article", { name: "Your need contribution", exact: true })
    .filter({ hasText: privateNote })
    .waitFor();
  await page.unroute("**/api/platform/exchange", intercept);
  assert.equal(requests.length, 2);
  assert.equal(requests[0], requests[1]);
  const six = await db.exchangeNeedContribution.findFirstOrThrow({
    where: { needId: listing.id, contributorId: a.id, note: privateNote }
  });
  assert.equal(six.shareName, false);
  await signIn(b);
  await go(path);
  assert.ok(!(await page.locator("main").innerText()).includes(privateNote));
  offer = page.getByRole("form", {
    name: "Offer help for Food parcels",
    exact: true
  });
  await offer.getByLabel("Quantity in parcels", { exact: true }).fill("4");
  await offer
    .getByRole("button", { name: "Commit this quantity", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Donate: Food parcels", exact: true })
    .getByText(/Committed: 10/)
    .waitFor();
  const food = await slotRow("Food parcels");
  const four = await db.exchangeNeedContribution.findFirstOrThrow({
    where: { slotId: food.id, contributorId: b.id }
  });
  ok(
    "Lost claim response retries exactly once with the original body; six plus four fills ten without revealing another private note"
  );

  await signIn(manager);
  await go(path + "?view=contributors");
  const incoming = page
    .getByRole("article", { name: "Private contribution", exact: true })
    .filter({ hasText: privateNote });
  await incoming
    .getByLabel("Total quantity actually received", { exact: true })
    .fill("5");
  await incoming
    .getByRole("button", { name: "Record actual receipt", exact: true })
    .click();
  await waitUntil(
    async () =>
      (
        await db.exchangeNeedContribution.findUniqueOrThrow({
          where: { id: six.id }
        })
      ).received === 5
  );
  await page
    .getByRole("region", { name: "Donate: Food parcels", exact: true })
    .getByText(/Received: 5/)
    .waitFor();
  await signIn(b);
  await go(path);
  const own = page.getByRole("article", {
    name: "Your need contribution",
    exact: true
  });
  await own
    .getByRole("button", { name: "Withdraw remaining promise", exact: true })
    .click();
  await waitUntil(
    async () =>
      (
        await db.exchangeNeedContribution.findUniqueOrThrow({
          where: { id: four.id }
        })
      ).state === "CANCELED"
  );
  await page
    .getByRole("region", { name: "Donate: Food parcels", exact: true })
    .getByText(/Committed: 6/)
    .waitFor();
  await go(path);
  const quote = page.getByRole("form", {
    name: "Offer help for Paid parcel sourcing",
    exact: true
  });
  await quote.getByLabel("Quantity in parcels", { exact: true }).fill("3");
  await quote
    .getByLabel("Exact scope of this quote", { exact: true })
    .fill("Fictional paid sourcing of three parcels");
  await quote
    .getByLabel("Total quoted amount for this quantity", { exact: true })
    .fill("12.50");
  await quote
    .getByRole("button", { name: "Submit private quote", exact: true })
    .click();
  await page
    .getByRole("article", { name: "Your need contribution", exact: true })
    .filter({ hasText: "Fictional paid sourcing" })
    .waitFor();
  const paid = await slotRow("Paid parcel sourcing");
  const quoteRow = await db.exchangeNeedContribution.findFirstOrThrow({
    where: { slotId: paid.id, contributorId: b.id }
  });
  assert.equal(quoteRow.state, "QUOTED");
  assert.equal(quoteRow.quoteMinor, 1250);
  assert.equal(quoteRow.received, 0);
  await signIn(manager);
  await go(path + "?view=contributors");
  await page
    .getByRole("article", { name: "Private contribution", exact: true })
    .filter({ hasText: "Fictional paid sourcing" })
    .getByRole("button", {
      name: "Accept quote and reserve quantity",
      exact: true
    })
    .click();
  await waitUntil(
    async () =>
      (
        await db.exchangeNeedContribution.findUniqueOrThrow({
          where: { id: quoteRow.id }
        })
      ).state === "COMMITTED"
  );
  assert.equal(
    (
      await db.exchangeNeedContribution.findUniqueOrThrow({
        where: { id: quoteRow.id }
      })
    ).received,
    0
  );
  ok(
    "Organizer confirms partial receipts, contributor cancellation reopens only unreceived quantity and paid quotes require deliberate acceptance"
  );

  await signIn(b);
  await go(path);
  const loan = page.getByRole("form", {
    name: "Offer help for Loaned equipment",
    exact: true
  });
  await loan.getByLabel("Quantity in parcels", { exact: true }).fill("1");
  await loan
    .getByRole("checkbox", {
      name: "I agree to the displayed equipment return date and responsibility."
    })
    .check();
  await loan
    .getByLabel("Optional private note to the coordinator", { exact: true })
    .fill("Fictional loan marker");
  await loan
    .getByRole("button", { name: "Commit this quantity", exact: true })
    .click();
  await page
    .getByRole("article", { name: "Your need contribution", exact: true })
    .filter({ hasText: "Fictional loan marker" })
    .waitFor();
  const loanSlot = await slotRow("Loaned equipment");
  const loanRow = await db.exchangeNeedContribution.findFirstOrThrow({
    where: { slotId: loanSlot.id, contributorId: b.id }
  });
  await signIn(manager);
  await go(path + "?view=contributors");
  const loanIncoming = page
    .getByRole("article", { name: "Private contribution", exact: true })
    .filter({ hasText: "Fictional loan marker" });
  await loanIncoming
    .getByLabel("Total quantity actually received", { exact: true })
    .fill("1");
  await loanIncoming
    .getByRole("button", { name: "Record actual receipt", exact: true })
    .click();
  await waitUntil(
    async () =>
      (
        await db.exchangeNeedContribution.findUniqueOrThrow({
          where: { id: loanRow.id }
        })
      ).received === 1
  );
  const closing = page.getByRole("region", {
    name: "Close Loaned equipment",
    exact: true
  });
  await closing
    .getByLabel("Public reason for closing, including any unmet help", {
      exact: true
    })
    .fill("One loan received; the other item is no longer needed.");
  await closing
    .getByRole("button", { name: "Close this slot", exact: true })
    .click();
  await waitUntil(async () => !!(await slotRow("Loaned equipment")).closedAt);
  assert.equal(
    (
      await db.exchangeNeedContribution.findUniqueOrThrow({
        where: { id: loanRow.id }
      })
    ).returned,
    0
  );
  await signIn(b);
  await go("/platform/exchange/needs");
  const loanOwn = page
    .getByRole("article", { name: "Your need contribution", exact: true })
    .filter({ hasText: "Fictional loan marker" });
  await loanOwn
    .getByLabel("Total equipment actually returned", { exact: true })
    .fill("1");
  await loanOwn
    .getByRole("button", {
      name: "Confirm equipment returned to me",
      exact: true
    })
    .click();
  await waitUntil(
    async () =>
      (
        await db.exchangeNeedContribution.findUniqueOrThrow({
          where: { id: loanRow.id }
        })
      ).returned === 1
  );
  ok(
    "Equipment terms require explicit agreement; partial closing preserves the outstanding return until its actual confirmation"
  );

  await go(path);
  const volunteers = page.getByRole("region", {
    name: "Volunteer: Event helpers",
    exact: true
  });
  await volunteers
    .getByRole("button", { name: "Reserve one volunteer place", exact: true })
    .click();
  await waitUntil(
    async () =>
      (await db.postVolunteerSignup.count({
        where: { slotId: role.id, userId: b.id, state: "ACTIVE" }
      })) === 1
  );
  assert.equal(
    await db.exchangeNeedContribution.count({
      where: { slotId: (await slotRow("Event helpers")).id }
    }),
    0
  );
  await signIn(manager);
  await go(path + "?volunteers=" + (await slotRow("Event helpers")).id);
  await exact("Confirm help actually completed").click();
  await waitUntil(
    async () =>
      !!(
        await db.postVolunteerSignup.findUniqueOrThrow({
          where: { slotId_userId: { slotId: role.id, userId: b.id } }
        })
      ).completedAt
  );
  await page.getByText("Help recorded as completed", { exact: true }).waitFor();
  ok(
    "Volunteer actions use the canonical event signup and organizer completion without creating a second contribution ledger"
  );

  await go(path);
  await page
    .getByLabel("Public organizer update", { exact: true })
    .fill("Fictional update: collection arrangements changed.");
  await exact("Publish update for current contributors").click();
  await page
    .getByText("Fictional update: collection arrangements changed.", {
      exact: true
    })
    .waitFor();
  const organizer = page.getByRole("region", {
    name: "Organizer updates and closing",
    exact: true
  });
  await organizer
    .getByLabel("Public reason for closing, including any unmet help", {
      exact: true
    })
    .fill("The fictional need has ended with honest partial progress.");
  await organizer
    .getByRole("button", {
      name: "Cancel need and release unreceived promises",
      exact: true
    })
    .click();
  await waitUntil(async () => !!(await currentNeed()).canceledAt);
  await page
    .getByText(
      "Repeat this need from the listing editor to prepare a new private draft with fresh dates and consent.",
      { exact: true }
    )
    .waitFor();
  assert.equal(
    (
      await db.exchangeNeedContribution.findUniqueOrThrow({
        where: { id: six.id }
      })
    ).received,
    5
  );
  await go(`/platform/exchange/${listing.id}/edit`);
  await exact("Duplicate into a private draft").click();
  await waitUntil(
    async () =>
      new URL(page.url()).pathname !== `/platform/exchange/${listing.id}/edit`
  );
  const copyId = new URL(page.url()).pathname.split("/")[3];
  const copy = await db.exchangeNeed.findUniqueOrThrow({
    where: { listingId: copyId },
    include: { slots: true, contributions: true }
  });
  assert.equal(copy.slots.length, 5);
  assert.equal(copy.contributions.length, 0);
  assert.equal(copy.coordinatorId, null);
  assert.equal(copy.deadlineAt, null);
  assert.ok(copy.slots.every((s) => !s.volunteerSlotId && !s.returnAt));
  ok(
    "Organizer updates and cancellation retain honest receipts; repeat copies structure into a private draft without old people, dates or event capacity"
  );

  await go(`/platform/exchange/${copyId}/needs`);
  const unsent = page.getByRole("form", {
    name: "Need deadline and coordinator"
  });
  const unsentDeadline = date(4);
  await unsent.getByLabel("Exact need deadline").fill(unsentDeadline);
  await page.goBack();
  await page
    .getByText("Save or resolve your private choice before leaving.", {
      exact: true
    })
    .waitFor();
  assert.equal(
    await unsent.getByLabel("Exact need deadline").inputValue(),
    unsentDeadline
  );
  await signIn(a);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await waitUntil(async () => !(await unsent.isVisible()));
  await go("/platform/settings/exchange");
  await page.getByRole("link", { name: /My Needs contributions/ }).waitFor();
  await go("/platform/exchange/needs");
  for (const width of [1348, 390, 320]) {
    await page.setViewportSize({ width, height: 926 });
    await bounded();
    await page.screenshot({
      path: output + `/contributions-${width}.png`,
      fullPage: true
    });
  }
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await bounded();
  ok(
    "Unsent setup blocks Back and conceals on account change; Settings opens the correct private history with desktop, narrow and enlarged dark layouts"
  );
  assert.deepEqual(errors, []);
  ok("No browser runtime errors in the complete Needs journey");
} catch (error) {
  writeFileSync(output + "/failure.html", await page.content());
  writeFileSync(
    output + "/failure-aria.txt",
    await page.locator("main").ariaSnapshot()
  );
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
