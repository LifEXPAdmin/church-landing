import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

const fixtureDir = process.argv[2];
assert.match(fixtureDir ?? "", /^\.account-test\/[a-z0-9-]+$/);
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
assert.equal(new URL(config.database).pathname, "/godschurches_security_test");
assert.ok(
  process.env.AUTH_RATE_LIMIT_SECRET,
  "Use the isolated preview environment"
);
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + fixtureDir + "/sink",
  NODE_ENV: "test",
  VERCEL: "",
  PRIVILEGED_MFA_MODE: "off",
  COMMUNITY_REPORTS_ENABLED: "true",
  SOCIAL_EMAIL_ENABLED: "false",
  BLOB_READ_WRITE_TOKEN: "",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  MEDIA_STORAGE_MODE: "local-test",
  MEDIA_TEST_DIR: process.cwd() + "/" + fixtureDir + "/images"
});
const { PrismaClient } = await import("@prisma/client");
const { createPortalActor, assertPortalTestDatabase, seedOperatorGrants } =
  await import("../tests/seed-portal.ts");
const { churchListingCommand } =
  await import("../lib/platform/church-listings.ts");
const { churchClaimCommand, getChurchClaims, CLAIM_POLICY } =
  await import("../lib/platform/church-claims.ts");
const { listingFields, churchVisitorFields, projectListingData } =
  await import("../lib/platform/church-listing-data.ts");
const { authorityFields, projectClaimAuthority } =
  await import("../lib/platform/church-claim-data.ts");
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
    "--no-proxy-server"
  ]
});
const context = await browser.newContext({
  viewport: { width: 320, height: 844 },
  hasTouch: true
});
await context.route("**/*", (route) =>
  new URL(route.request().url()).origin === config.origin
    ? route.continue()
    : route.abort()
);
const page = await context.newPage(),
  errors = [],
  results = [];
const output = fixtureDir + "/church-visitor-browser-" + Date.now();
mkdirSync(output, { recursive: true });
page.on("pageerror", (e) =>
  errors.push({ path: new URL(page.url()).pathname, message: e.message })
);
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const go = async (path) =>
  assert.equal((await page.goto(config.origin + path)).status(), 200);
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
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error("Expected current visitor state was not observed");
};

const post = async (button, operation, endpoint = "church-listings") => {
  const url = "**/api/platform/" + endpoint;
  let resolve, reject;
  const observed = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const handler = async (route) => {
    const request = route.request();
    if (
      request.method() !== "POST" ||
      request.postDataJSON().operation !== operation
    )
      return route.continue();
    try {
      // Forward once and retain the real response before the form navigates.
      const response = await route.fetch();
      const body = await response.body();
      assert.equal(response.status(), 200, body.toString());
      const result = {
        value: JSON.parse(body.toString()),
        request: request.postDataJSON(),
        bytes: Buffer.byteLength(request.postData())
      };
      await route.fulfill({ response, body });
      resolve(result);
    } catch (error) {
      reject(error);
      await route.abort();
    }
  };
  await page.route(url, handler);
  try {
    await page.getByRole("button", { name: button, exact: true }).click();
    return await observed;
  } finally {
    await page.unroute(url, handler);
  }
};
const approved = async (id) => {
  await signIn(reviewer);
  await go("/platform/operator/listings/" + id);
  await page
    .getByRole("form", { name: "Save review decision", exact: true })
    .getByLabel("Decision (required)", { exact: true })
    .selectOption("APPROVE");
  await page
    .getByRole("form", { name: "Save review decision", exact: true })
    .getByLabel("Reason or requested information")
    .fill("Independently confirmed fictional visitor details");
  await page
    .getByRole("checkbox", { name: "For approval:", exact: false })
    .check();
  await post("Save review decision", "review");
  await page.waitForURL("**/platform/operator/listings");
};
const submit = async () => {
  await page
    .getByRole("checkbox", {
      name: "I checked for an existing church",
      exact: false
    })
    .check();
  await page
    .getByRole("checkbox", {
      name: "The preview is intended to be public.",
      exact: false
    })
    .check();
  await post("Submit correction", "publish");
  await page.getByText("Waiting for review", { exact: true }).waitFor();
};
let reviewer;
try {
  const owner = await createPortalActor(db, "visitorbrowser");
  reviewer = await createPortalActor(db, "visitorbrowserreview");
  await seedOperatorGrants(db, reviewer, [
    "REVIEW_CHURCH_LISTINGS",
    "REVIEW_CHURCH_CLAIMS",
    "MANAGE_CHURCH_ACCESS"
  ]);
  const church = await db.church.create({
    data: {
      name: "Fictional visitor browser " + randomUUID(),
      slug: randomUUID(),
      summary: "Fictional public visitor fixture",
      serviceArea: "Fictional region"
    }
  });
  const details = {
    serviceTimes: "Sunday 10:30 AM Central. Confirm holiday changes.",
    accessibilityInfo:
      "Step-free side entrance. Ask the public office about assistance.",
    languages: "English, español, 中文 😀",
    childrenPrograms: "Family welcome at 10 AM. Confirm arrangements directly.",
    contactPreferences: "Email the public church office on weekdays."
  };
  await go("/platform/churches/" + church.id);
  assert.equal(
    await page
      .getByRole("heading", { name: "Supplied visitor information" })
      .count(),
    0
  );
  await bounded();
  ok(
    "An existing church with empty fields shows no invented visitor facts or empty heading"
  );
  await signIn(owner);
  await go("/platform/churches/" + church.id);
  await page
    .getByRole("link", { name: "Suggest a correction", exact: true })
    .click();
  const created = await post("Start a private correction draft", "create");
  const id = created.value.id;
  await page.waitForURL("**/platform/church-listings/" + id);
  for (const [key, field] of Object.entries(churchVisitorFields)) {
    const input = page
      .getByRole("form", {
        name: "Save private draft and preview",
        exact: true
      })
      .getByLabel(field.label, { exact: true });
    assert.equal(await input.inputValue(), "");
    assert.equal(await input.getAttribute("maxlength"), String(field.max));
    assert.ok(await input.getAttribute("aria-describedby"));
    await input.fill(details[key]);
  }
  await page
    .getByRole("form", { name: "Save private draft and preview", exact: true })
    .getByLabel("Service times", { exact: true })
    .focus();
  await page.keyboard.press("Tab");
  assert.equal(
    await page
      .getByRole("form", {
        name: "Save private draft and preview",
        exact: true
      })
      .getByLabel("Accessibility information", { exact: true })
      .evaluate((node) => node === document.activeElement),
    true
  );
  await bounded();
  await post("Save private draft and preview", "save");
  await page.waitForURL("**/platform/church-listings/" + id + "?preview=1");
  await page
    .getByRole("heading", { name: "Supplied visitor information", exact: true })
    .first()
    .waitFor();
  assert.equal(
    (await db.church.findUniqueOrThrow({ where: { id: church.id } }))
      .serviceTimes,
    ""
  );
  ok(
    "Owner edits five labeled optional fields with keyboard access and previews a private correction"
  );
  await signIn(null);
  await go("/platform/churches/" + church.id);
  assert.ok(
    !(await page.locator("body").innerText()).includes(details.serviceTimes)
  );
  await signIn(owner);
  await go("/platform/church-listings/" + id + "?preview=1");
  await submit();
  assert.equal(
    (await db.church.findUniqueOrThrow({ where: { id: church.id } }))
      .serviceTimes,
    ""
  );
  await approved(id);
  await signIn(null);
  await go("/platform/churches/" + church.id);
  const visibleVisitorSection = page.getByRole("region", {
    name: "Supplied visitor information",
    exact: true
  });
  for (const value of Object.values(details))
    await visibleVisitorSection.getByText(value, { exact: true }).waitFor();
  await visibleVisitorSection
    .getByText("Confirm schedules and arrangements directly with the church.", {
      exact: false
    })
    .waitFor();
  assert.equal(
    (await db.church.findUniqueOrThrow({ where: { id: church.id } })).slug,
    church.slug
  );
  assert.ok(!(await page.locator("body").innerText()).includes(owner.email));
  ok(
    "A separate current reviewer approves the correction before guests see the supplied facts on the same church URL"
  );
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await bounded();
    await page.screenshot({
      path: output + "/public-" + width + ".png",
      fullPage: true
    });
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await bounded();
  await page.screenshot({
    path: output + "/public-320-enlarged.png",
    fullPage: true
  });
  ok(
    "Published visitor details remain readable without horizontal overflow at 320, 390, 1440 and doubled text size"
  );
  await signIn(owner);
  await go("/platform/church-listings/new?churchId=" + church.id);
  const clear = await post("Start a private correction draft", "create");
  await page.waitForURL("**/platform/church-listings/" + clear.value.id);
  for (const [key, field] of Object.entries(churchVisitorFields)) {
    assert.equal(
      await page
        .getByRole("form", {
          name: "Save private draft and preview",
          exact: true
        })
        .getByLabel(field.label, { exact: true })
        .inputValue(),
      details[key]
    );
    await page
      .getByRole("form", {
        name: "Save private draft and preview",
        exact: true
      })
      .getByLabel(field.label, { exact: true })
      .fill("");
  }
  await post("Save private draft and preview", "save");
  await page.waitForURL(
    "**/platform/church-listings/" + clear.value.id + "?preview=1"
  );
  await submit();
  assert.equal(
    (await db.church.findUniqueOrThrow({ where: { id: church.id } }))
      .serviceTimes,
    details.serviceTimes
  );
  await approved(clear.value.id);
  await signIn(null);
  await go("/platform/churches/" + church.id);
  assert.equal(
    await page
      .getByRole("heading", { name: "Supplied visitor information" })
      .count(),
    0
  );
  ok(
    "Clearing supplied fields is a reviewed correction and removes the empty public section only after approval"
  );

  const representative = await createPortalActor(db, "visitorbrowserclaim");
  const claim = await churchClaimCommand(db, representative.token, {
    operation: "create",
    requestKey: randomUUID()
  });
  await signIn(representative);
  await go("/platform/church-claims/" + claim.id);
  const maximum = projectListingData(
    Object.fromEntries(
      Object.entries(listingFields).map(([key, rule]) => [
        key,
        "漢".repeat(rule.max)
      ])
    )
  );
  Object.assign(maximum, {
    locationModel: "NO_BUILDING",
    website: "https://example.test/" + "a".repeat(479),
    publicEmail: "office@example.test",
    publicPhone: "+123456789"
  });
  const maxAuthority = projectClaimAuthority(
    Object.fromEntries(
      Object.entries(authorityFields).map(([key, rule]) => [
        key,
        "漢".repeat(rule.max)
      ])
    )
  );
  maxAuthority.method = "OTHER";
  for (const [key, field] of Object.entries(listingFields)) {
    const input = page
      .getByRole("form", {
        name: "Save private details and preview",
        exact: true
      })
      .getByLabel(field.label, { exact: true });
    if (key === "locationModel") await input.selectOption(maximum[key]);
    else await input.fill(maximum[key]);
  }
  for (const [key, field] of Object.entries(authorityFields)) {
    const input = page
      .getByRole("form", {
        name: "Save private details and preview",
        exact: true
      })
      .getByLabel(field.label + " (private)", { exact: true });
    if (key === "method") await input.selectOption("OTHER");
    else await input.fill(maxAuthority[key]);
  }
  await page
    .getByRole("checkbox", {
      name: "Manage the public church profile",
      exact: true
    })
    .check();
  const wire = await post(
    "Save private details and preview",
    "save",
    "church-claims"
  );
  assert.ok(wire.bytes > 8192 && wire.bytes < 32768);
  assert.deepEqual(
    Object.keys(wire.request).sort(),
    [
      "authority",
      "dispute",
      "expectedChurchVersion",
      "expectedVersion",
      "id",
      "operation",
      "profile",
      "scopes"
    ].sort()
  );
  assert.deepEqual(wire.request.profile, maximum);
  assert.ok(
    Object.values(wire.request.scopes).every(
      (value) => typeof value === "boolean"
    )
  );
  await page.waitForURL("**/platform/church-claims/" + claim.id + "?preview=1");
  assert.equal(
    (await getChurchClaims(db, representative.token, { id: claim.id }))
      .claims[0].profile.serviceTimes,
    maximum.serviceTimes
  );
  ok(
    "Real representative form saves maximum multilingual public and private fields once in a bounded " +
      wire.bytes +
      " byte request"
  );

  process.env.CHURCH_CLAIM_REVIEW_ENABLED = "true";
  process.env.CHURCH_CLAIM_POLICY_VERSION = CLAIM_POLICY;
  await churchClaimCommand(db, representative.token, {
    operation: "submit",
    id: claim.id,
    expectedVersion: 2,
    contactConsent: true,
    searchedConfirmed: true
  });
  await churchClaimCommand(db, reviewer.token, {
    operation: "review",
    id: claim.id,
    expectedVersion: 3,
    action: "APPROVE",
    reason: "Fictional independently checked authority",
    trustedSource: "Independent fictional source",
    confirmingPerson: "Fictional confirming leader",
    checkedAt: new Date().toISOString().slice(0, 10),
    independentConfirmed: true,
    scopeConfirmed: true,
    distinctConfirmed: true
  });
  const active = await churchClaimCommand(db, representative.token, {
    operation: "activate",
    id: claim.id,
    expectedVersion: 4,
    publicConfirmed: true,
    accessConfirmed: true
  });
  await go("/platform/church-claims/" + claim.id);
  await page
    .getByRole("form", {
      name: "Save profile changes and preview",
      exact: true
    })
    .getByLabel("Service times", { exact: true })
    .fill(details.serviceTimes);
  const managed = await post(
    "Save profile changes and preview",
    "profile-save",
    "church-claims"
  );
  assert.deepEqual(
    Object.keys(managed.request).sort(),
    [
      "expectedChurchVersion",
      "expectedVersion",
      "id",
      "operation",
      "profile"
    ].sort()
  );
  await page.waitForURL("**/platform/church-claims/" + claim.id + "?preview=1");
  assert.equal(
    (await db.church.findUniqueOrThrow({ where: { id: active.churchId } }))
      .serviceTimes,
    maximum.serviceTimes
  );
  await page
    .getByRole("checkbox", {
      name: "I confirm these details are intended to be public on the church page.",
      exact: false
    })
    .check();
  await post("Publish profile preview", "profile-publish", "church-claims");
  await waitUntil(
    async () =>
      (await db.church.findUniqueOrThrow({ where: { id: active.churchId } }))
        .serviceTimes === details.serviceTimes
  );
  ok(
    "Current representative manager saves privately, previews and explicitly publishes on the original church identity"
  );
  const claimant = await createPortalActor(db, "visitorbrowserdispute");
  const dispute = await churchClaimCommand(db, claimant.token, {
    operation: "create",
    requestKey: randomUUID(),
    churchId: active.churchId
  });
  const unchanged = await db.church.findUniqueOrThrow({
    where: { id: active.churchId }
  });
  await signIn(claimant);
  await go("/platform/church-claims/" + dispute.id);
  const disputeForm = page.getByRole("form", {
    name: "Save private details and preview",
    exact: true
  });
  await disputeForm
    .getByRole("checkbox", {
      name: "Manage the public church profile",
      exact: true
    })
    .check();
  const structureChoice = disputeForm.getByRole("checkbox", {
    name: "Manage church positions and assignments",
    exact: true
  });
  await structureChoice.check();
  await structureChoice.uncheck();
  await disputeForm
    .getByRole("checkbox", {
      name: "This is an authority dispute or recovery request",
      exact: false
    })
    .check();
  const disputed = await post(
    "Save private details and preview",
    "save",
    "church-claims"
  );
  assert.equal(disputed.request.dispute, true);
  assert.equal(disputed.request.scopes.MANAGE_STRUCTURE, false);
  const privateDispute = (
    await getChurchClaims(db, claimant.token, { id: dispute.id })
  ).claims[0];
  assert.equal(privateDispute.kind, "DISPUTE");
  assert.deepEqual(privateDispute.scopes, ["MANAGE_CHURCH_PROFILE"]);
  assert.deepEqual(
    await db.church.findUniqueOrThrow({ where: { id: active.churchId } }),
    unchanged
  );
  ok(
    "Existing-church draft keeps explicit dispute and checked/unchecked scope choices without changing public facts or granting access"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        groups: results.length,
        results,
        errors,
        claimRequestBytes: wire.bytes,
        productionWrites: 0,
        externalSends: 0
      },
      null,
      2
    )
  );
  console.log("RESULT " + output);
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure-page.txt",
    await page
      .locator("body")
      .innerText()
      .catch(() => "Unavailable")
  );
  writeFileSync(
    output + "/failure.json",
    JSON.stringify({ message: String(error), results, errors }, null, 2)
  );
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
