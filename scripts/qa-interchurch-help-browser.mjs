import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const fixture = process.argv[2];
assert.ok(fixture, "Pass the owned isolated fixture directory");
Object.assign(
  process.env,
  JSON.parse(readFileSync(fixture + "/environment.json", "utf8"))
);
const origin = process.env.ACCOUNT_ORIGIN;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
const { PrismaClient } = await import("@prisma/client");
const { createPortalActor, assertPortalTestDatabase } =
  await import("../tests/seed-portal.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ??
    `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`
)("playwright");
const publicKey = execFileSync("openssl", [
  "x509",
  "-in",
  fixture + "/localhost-cert.pem",
  "-pubkey",
  "-noout"
]);
const der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], {
  input: publicKey
});
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: [
    "--ignore-certificate-errors-spki-list=" +
      createHash("sha256").update(der).digest("base64"),
    "--no-proxy-server"
  ]
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }
});
context.setDefaultTimeout(15000);
await context.route("**/*", (route) =>
  new URL(route.request().url()).hostname === "127.0.0.1"
    ? route.continue()
    : route.abort()
);
const page = await context.newPage(),
  errors = [],
  results = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
const output = fixture + "/browser-" + Date.now();
mkdirSync(output, { recursive: true });
const ok = (label) => {
  results.push(label);
  console.log("PASS " + label);
};
const wait = async (fn) => {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Expected saved state was not observed");
};
const go = async (path) => {
  if (page.url().startsWith(origin))
    await page.waitForFunction(() => !window.history.state?.gcPhotoWork);
  const response = await page.goto(origin + path);
  assert.equal(response.status(), 200);
  await page.waitForLoadState("networkidle");
  return response;
};
const signIn = async (actor) => {
  await context.clearCookies();
  if (actor)
    await context.addCookies([
      {
        name: "church_platform_session",
        value: actor.token,
        url: origin,
        secure: true,
        httpOnly: true,
        sameSite: "Lax"
      }
    ]);
};
const button = (name) => page.getByRole("button", { name, exact: true });
const bounds = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal overflow"
  );
const setTerms = async (form, duties) => {
  await form
    .getByLabel("Expected duties and resources", { exact: true })
    .fill(duties);
  await form
    .getByLabel("Duty classification", { exact: true })
    .selectOption("ADULT_LOGISTICS");
  await form
    .getByLabel("Equipment arrangement", { exact: true })
    .selectOption("NONE");
  await form
    .getByLabel("Proposed start", { exact: true })
    .fill(new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 16));
  await form
    .getByLabel("Proposed end", { exact: true })
    .fill(new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 16));
  await form.getByLabel("Time zone", { exact: true }).fill("UTC");
  await form
    .getByLabel("Paid or voluntary", { exact: true })
    .selectOption("VOLUNTARY");
  await form
    .getByLabel("Expense reimbursement, including none", { exact: true })
    .fill("No expenses proposed.");
};
try {
  const manager = await createPortalActor(db, "helpbrowsermgr"),
    a = await createPortalActor(db, "helpbrowsera"),
    b = await createPortalActor(db, "helpbrowserb");
  const church = await db.church.create({
    data: {
      slug: "browserhelp-" + randomUUID(),
      name: "Fictional browser ministry church",
      summary: "Isolated whole-feature acceptance",
      communityListed: true
    }
  });
  await db.churchConnection.createMany({
    data: [manager, a].map((p) => ({
      userId: p.id,
      churchId: church.id,
      state: "APPROVED"
    }))
  });
  await db.churchCapabilityGrant.createMany({
    data: ["MANAGE_EXCHANGE_LISTINGS", "MODERATE_EXCHANGE_LISTINGS"].map(
      (capability) => ({ userId: manager.id, churchId: church.id, capability })
    )
  });
  await db.socialPreferences.create({
    data: { ownerId: manager.id, contactRequests: "EVERYONE" }
  });
  const marker = "Fictional browser ministry " + randomUUID();
  await signIn(manager);
  await go("/platform/exchange/help/new");
  const editor = page.getByRole("form", { name: "Ministry request editor" });
  await editor.waitFor();
  await editor
    .getByLabel("Requesting church", { exact: true })
    .selectOption(church.id);
  await editor.getByLabel("Request title", { exact: true }).fill(marker);
  await editor.getByLabel("Help category", { exact: true }).selectOption("AV");
  await setTerms(
    editor,
    "Public adult-only microphone setup. No child contact or supervision."
  );
  await editor
    .getByLabel("Find a town or area", { exact: true })
    .fill("Chicago");
  await editor.getByRole("button", { name: "Find area", exact: true }).click();
  await editor
    .getByRole("button", { name: /^Chicago,/ })
    .first()
    .click();
  await editor
    .getByLabel("Public coordinator name or role", { exact: true })
    .fill("Consenting fictional worship coordinator");
  await editor
    .getByRole("checkbox", { name: /I am the current church Exchange manager/ })
    .check();
  await bounds();
  await page.screenshot({
    path: output + "/request-editor-390.png",
    fullPage: true
  });
  await editor
    .getByRole("button", { name: "Save request", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Open saved record", exact: true })
    .waitFor();
  const request = await db.interchurchHelpRequest.findFirstOrThrow({
    where: { listing: { title: marker } }
  });
  await page
    .getByRole("link", { name: "Open saved record", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: /I may publish this request/ })
    .check();
  await button("Publish request").click();
  await wait(
    async () =>
      (await db.exchangeListing.findUnique({ where: { id: request.id } }))
        .state === "ACTIVE"
  );
  ok(
    "Create, save, reopen and publish through the actual request interface with explicit coordinator and place choices"
  );
  await go("/platform/exchange/help/" + request.id);
  const editForm = page.getByRole("form", { name: "Ministry request editor" });
  await editForm.waitFor();
  const headers = { "x-expected-account": manager.id, origin };
  const projected = await (
    await context.request.get(
      origin + "/api/platform/exchange?view=help-request&id=" + request.id,
      { headers }
    )
  ).json();
  const currentView = projected.data ?? projected;
  const revisedTitle = marker + " revised";
  const revisedFields = {
    title: revisedTitle,
    category: currentView.request.category,
    terms: currentView.request.terms,
    country: currentView.listing.country,
    placeId: currentView.listing.placeId,
    audience: currentView.listing.audience,
    acceptCoordinator: false,
    coordinatorDisplay: currentView.request.coordinatorDisplay
  };
  const { EXCHANGE_ITEM_POLICY } =
    await import("../lib/platform/exchange-options.ts");
  const changed = await context.request.post(
    origin + "/api/platform/exchange",
    {
      headers,
      data: {
        operation: "help-save",
        mutationId: randomUUID(),
        requestId: request.id,
        expectedVersion: currentView.request.version,
        schema: 1,
        fields: revisedFields,
        itemPolicy: EXCHANGE_ITEM_POLICY,
        itemConfirmed: true
      }
    }
  );
  assert.ok(changed.ok(), await changed.text());
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(
    (title) =>
      [...document.querySelectorAll("input")].some((i) => i.value === title),
    revisedTitle
  );
  assert.equal(
    await editForm.getByLabel("Request title", { exact: true }).inputValue(),
    revisedTitle
  );
  ok("Pristine editor adopts concurrent saved fields and version together");
  await signIn(a);
  await go("/platform/exchange/help/" + request.id);
  let form = page.getByRole("form", { name: "Private help offer" });
  await form.waitFor();
  await form
    .getByLabel("I am offering", { exact: true })
    .selectOption("ORGANIZATION");
  await page
    .getByText("No current church commitment permission is available.", {
      exact: false
    })
    .waitFor();
  assert.equal(
    await form
      .getByLabel("Represented church", { exact: true })
      .locator("option")
      .count(),
    1
  );
  ok("Membership never exposes an organization commitment choice");
  await form
    .getByLabel("I am offering", { exact: true })
    .selectOption("PERSONAL");
  const secret = "My private adult equipment promise " + randomUUID();
  await setTerms(form, secret);
  await form
    .getByRole("checkbox", { name: /I explicitly accept responsibility/ })
    .check();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal(await page.locator("textarea").count(), 0);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await form.waitFor();
  assert.equal(
    await form
      .getByLabel("Expected duties and resources", { exact: true })
      .inputValue(),
    secret
  );
  await context.setOffline(true);
  await page.waitForFunction(
    () => document.querySelectorAll("textarea").length === 0
  );
  await context.setOffline(false);
  await form.waitFor();
  assert.equal(
    await form
      .getByLabel("Expected duties and resources", { exact: true })
      .inputValue(),
    secret
  );
  ok(
    "Blur and offline conceal fields while retaining the original local draft for current-account recheck"
  );
  let lost = false,
    originalBody;
  await page.route("**/api/platform/exchange", async (route) => {
    if (
      !lost &&
      route.request().method() === "POST" &&
      JSON.parse(route.request().postData()).operation === "help-offer"
    ) {
      lost = true;
      originalBody = route.request().postData();
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await form
    .getByRole("button", { name: "Submit private offer", exact: true })
    .click();
  await button("Confirm original request").waitFor();
  await button("Confirm original request").click();
  await page
    .getByRole("link", { name: "Open saved record", exact: true })
    .waitFor();
  await page.unroute("**/api/platform/exchange");
  assert.equal(
    await db.interchurchHelpOffer.count({
      where: { requestId: request.id, responderId: a.id }
    }),
    1
  );
  const offer = await db.interchurchHelpOffer.findFirstOrThrow({
    where: { requestId: request.id, responderId: a.id }
  });
  assert.ok(originalBody.includes(secret));
  ok(
    "Lost committed response retries the original body and key without duplicating the offer"
  );
  await go("/platform/exchange/help/offers?id=" + offer.id);
  await page.getByRole("article", { name: "Private ministry offer" }).waitFor();
  const html = await (
    await context.request.get(
      origin + "/platform/exchange/help/offers?id=" + offer.id
    )
  ).text();
  assert.ok(!html.includes(secret));
  const rsc = await (
    await context.request.get(
      origin + "/platform/exchange/help/offers?id=" + offer.id,
      { headers: { RSC: "1" } }
    )
  ).text();
  assert.ok(!rsc.includes(secret));
  ok("Private offer body is absent from built HTML and RSC snapshots");
  await db.churchCapabilityGrant.create({
    data: {
      userId: a.id,
      churchId: church.id,
      capability: "COMMIT_INTERCHURCH_HELP"
    }
  });
  await go("/platform/exchange/help/" + request.id);
  form = page.getByRole("form", { name: "Private help offer" });
  await form
    .getByLabel("I am offering", { exact: true })
    .selectOption("ORGANIZATION");
  await form
    .getByLabel("Represented church", { exact: true })
    .selectOption(church.id);
  await form
    .getByLabel("Paid or voluntary", { exact: true })
    .selectOption("PAID");
  await form
    .getByLabel("Payment amount (leave empty for voluntary)", { exact: true })
    .fill("125.00");
  await form
    .getByLabel("Currency (leave empty for voluntary)", { exact: true })
    .selectOption("USD");
  await form
    .getByLabel("Rate unit (leave empty for voluntary)", { exact: true })
    .selectOption("TASK");
  await form
    .getByRole("checkbox", { name: /I explicitly accept responsibility/ })
    .check();
  await form
    .getByRole("button", { name: "Submit private offer", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Open saved record", exact: true })
    .click();
  const organization = await db.interchurchHelpOffer.findFirstOrThrow({
    where: { requestId: request.id, responderId: a.id, kind: "ORGANIZATION" }
  });
  await page
    .getByText(/Represented church: Fictional browser ministry church/)
    .waitFor();
  const person = await db.platformUser.findUniqueOrThrow({
    where: { id: a.id }
  });
  assert.ok(
    (await page.locator("body").innerText()).includes(
      "Named responder: " + person.name
    )
  );
  assert.equal(organization.terms.compensation, "PAID");
  assert.equal(organization.terms.price, "125.00");
  await button("Withdraw pending offer").click();
  await wait(
    async () =>
      (
        await db.interchurchHelpOffer.findUniqueOrThrow({
          where: { id: organization.id }
        })
      ).state === "WITHDRAWN"
  );
  ok(
    "Explicit church delegation enables a separate paid organization offer with named private identity and withdrawal"
  );
  await go("/platform/exchange/help/offers?id=" + offer.id);
  await signIn(b);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(
    () =>
      document.querySelectorAll('article[aria-label="Private ministry offer"]')
        .length === 0
  );
  ok(
    "Account switching removes retained private content before another account can use it"
  );
  await signIn(manager);
  await go("/platform/exchange/help/offers?id=" + offer.id);
  await page
    .getByRole("checkbox", {
      name: "I explicitly accept the displayed scope and responsibility.",
      exact: true
    })
    .check();
  await button("Select and acknowledge offer").click();
  await wait(
    async () =>
      !!(await db.interchurchHelpAgreement.findUnique({
        where: { offerId: offer.id }
      }))
  );
  let agreement = await db.interchurchHelpAgreement.findUniqueOrThrow({
    where: { offerId: offer.id }
  });
  assert.equal(agreement.state, "NEEDS_REVIEW");
  ok("Selecting help alone does not create confirmation or fulfillment");
  await signIn(a);
  await go("/platform/exchange/help/offers?id=" + offer.id);
  await page
    .getByRole("checkbox", {
      name: "I acknowledge the exact current terms shown for this private agreement.",
      exact: true
    })
    .check();
  await button("Acknowledge current agreement").click();
  await wait(
    async () =>
      (
        await db.interchurchHelpAgreement.findUnique({
          where: { offerId: offer.id }
        })
      ).state === "CONFIRMED"
  );
  await page
    .getByRole("checkbox", {
      name: "I acknowledge the exact current terms shown for this private agreement.",
      exact: true
    })
    .check();
  assert.equal(
    await page
      .getByRole("checkbox", { name: /Share only the contact value/ })
      .isChecked(),
    false
  );
  ok(
    "Acknowledging agreement terms never selects optional contact-sharing consent"
  );
  await page
    .getByLabel("My optional contact for this exact pair", { exact: true })
    .fill("Chosen synthetic contact only");
  await page
    .getByRole("checkbox", { name: /Share only the contact value/ })
    .check();
  await button("Share chosen contact").click();
  await wait(
    async () =>
      (
        await db.interchurchHelpAgreement.findUnique({
          where: { offerId: offer.id }
        })
      ).responderContact === "Chosen synthetic contact only"
  );
  await button("Withdraw my contact sharing").click();
  await wait(
    async () =>
      (
        await db.interchurchHelpAgreement.findUnique({
          where: { offerId: offer.id }
        })
      ).responderContact === ""
  );
  ok(
    "Bilateral confirmation and optional contact sharing/withdrawal preserve the underlying commitment"
  );
  await page.setViewportSize({ width: 320, height: 760 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addStyleTag({ content: "html{font-size:200% !important}" });
  await bounds();
  await page.screenshot({
    path: output + "/private-agreement-320-enlarged-dark.png",
    fullPage: true
  });
  ok("320px and enlarged dark layout remain bounded");
  await signIn(manager);
  await go("/platform/exchange/help/offers?id=" + offer.id);
  await page
    .getByLabel("Cancellation or completion explanation", { exact: true })
    .fill(
      "Current coordinator confirms the complete adult setup was delivered."
    );
  await button("Confirm agreed scope completed").click();
  await wait(
    async () =>
      (
        await db.interchurchHelpAgreement.findUnique({
          where: { offerId: offer.id }
        })
      ).state === "COMPLETED"
  );
  await go("/platform/exchange/help/" + request.id);
  await page
    .getByLabel("Request outcome", { exact: true })
    .selectOption("FULFILLED");
  await page
    .getByLabel("Outcome explanation and delivered scope", { exact: true })
    .fill(
      "All requested adult setup scope and the selected agreement were completed."
    );
  await button("Record request outcome").click();
  await wait(
    async () =>
      (
        await db.interchurchHelpRequest.findUnique({
          where: { id: request.id }
        })
      ).outcome === "FULFILLED"
  );
  ok(
    "Current named coordinator explicitly records completion and full request fulfillment through the interface"
  );
  assert.deepEqual(errors, []);
  ok("No uncaught browser errors");
  writeFileSync(
    output + "/result.json",
    JSON.stringify({ passed: results.length, results, errors }, null, 2)
  );
  writeFileSync(
    fixture + "/latest-browser-result.json",
    JSON.stringify({ output, passed: results.length })
  );
} catch (error) {
  writeFileSync(
    output + "/failure.json",
    JSON.stringify(
      { message: error.message, stack: error.stack, results, errors },
      null,
      2
    )
  );
  writeFileSync(output + "/failure.html", await page.content());
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
