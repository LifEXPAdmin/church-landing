import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";

const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the existing isolated HTTPS fixture directory");
assert.ok(resolve(fixtureDir).startsWith(resolve(".account-test") + "/"));
const config = JSON.parse(
  readFileSync(resolve(fixtureDir, "browser-env.json"), "utf8")
);
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: resolve(fixtureDir, "sink"),
  RETENTION_TEST_DIR: resolve(fixtureDir, "retention"),
  MEDIA_STORAGE_MODE: "local-test",
  MEDIA_TEST_DIR: resolve(fixtureDir, "images"),
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: "",
  SUPPORT_INTAKE_ENABLED: "true",
  FEEDBACK_INTAKE_ENABLED: "true",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  SOCIAL_EMAIL_ENABLED: "false",
  FOUNDER_WELCOME_ENABLED: "false",
  FOUNDER_ANNOUNCEMENTS_ENABLED: "false",
  PUSH_ENABLED: "false"
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase } = await import("../tests/seed-portal.ts");
const { seedSupport } = await import("../tests/seed-support.ts");
const { supportCommand, readSupport } =
  await import("../lib/platform/support.ts");
const { FEEDBACK_NOTICE } = await import("../lib/platform/feedback-types.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const originalIntake = await db.supportIntakeSetting.findUnique({
  where: { id: "default" }
});
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ??
    process.env.HOME +
      "/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json"
)("playwright");
const publicKey = execFileSync("openssl", [
  "x509",
  "-in",
  config.certificate,
  "-pubkey",
  "-noout"
]);
const der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], {
  input: publicKey
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
page.setDefaultTimeout(30000);
const output = resolve(fixtureDir, "feedback-index-browser-" + Date.now());
mkdirSync(output, { recursive: true, mode: 0o700 });
const results = [],
  errors = [],
  externalRequests = [],
  browserWrites = [];
const retryEvidence = [],
  markers = [],
  releases = new Set();
await context.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (url.origin !== config.origin) {
    externalRequests.push(url.origin + url.pathname);
    await route.abort();
  } else await route.continue();
});
context.on("request", (request) => {
  if (!["GET", "HEAD"].includes(request.method()))
    browserWrites.push({
      method: request.method(),
      path: new URL(request.url()).pathname
    });
});
page.on("pageerror", (error) => errors.push(error.message));
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const nonce = randomUUID();
const marker = (name) => {
  const value = "Fictional feedback " + name + " " + nonce;
  markers.push(value);
  return value;
};
const listPath = "/platform/feedback/requests";
const feedbackEndpoint = config.origin + "/api/platform/feedback";
const preferenceEndpoint = config.origin + "/api/platform/feedback/prompts";
const identityRoute = "**/api/platform/profile?view=identity";
const listRoute = (url) =>
  url.pathname === "/api/platform/feedback" &&
  url.searchParams.get("view") === "requests";
const receiptLinks = () =>
  page.locator('main a[href^="/platform/feedback/cases/"]');
const preference = () =>
  page.locator("main details").filter({
    has: page
      .locator("summary")
      .filter({ hasText: "Automatic feedback prompts" })
  });
const button = (name) => page.getByRole("button", { name, exact: true });
const event = (name) =>
  page.evaluate((type) => window.dispatchEvent(new Event(type)), name);
const until = async (check, message) => {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((done) => setTimeout(done, 100));
  }
  assert.fail(message);
};
const signIn = async (actor) => {
  await context.clearCookies();
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
const go = async (path = listPath) => {
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
  await page.waitForLoadState("networkidle");
};
const ready = async (rows) => {
  await until(async () => {
    const hrefs = await receiptLinks().evaluateAll((links) =>
      links.map((link) => link.getAttribute("href"))
    );
    return (
      JSON.stringify(hrefs) ===
      JSON.stringify(rows.map((row) => "/platform/feedback/cases/" + row.id))
    );
  }, "Expected current receipt rows did not render");
  for (const row of rows)
    await page.getByRole("link", { name: row.subject, exact: true }).waitFor();
};
const absent = async () => {
  await page.waitForFunction((values) => {
    const html = document.documentElement.outerHTML;
    return (
      values.every((value) => !html.includes(value)) &&
      !document.querySelector('main a[href^="/platform/feedback/cases/"]') &&
      !document.querySelector('main nav[aria-label="Feedback pages"]') &&
      ![...document.querySelectorAll("main summary")].some((node) =>
        node.textContent.includes("Automatic feedback prompts")
      ) &&
      !html.includes("No feedback receipts yet.") &&
      !html.includes("Automatic feedback prompts are off for your account.") &&
      !html.includes("Retry the same preference") &&
      !html.includes("Finish protecting this preference")
    );
  }, markers);
};
const openPreferences = async () => {
  await preference().waitFor();
  if (!(await preference().evaluate((node) => node.open)))
    await preference().locator("summary").click();
};
const serialization = async (path) => {
  for (const flight of [false, true]) {
    const response = await context.request.get(
      config.origin + path,
      flight ? { headers: { RSC: "1" } } : {}
    );
    assert.equal(response.status(), 200);
    if (flight)
      assert.match(response.headers()["content-type"], /text\/x-component/);
    const text = await response.text();
    for (const value of markers)
      assert.ok(!text.includes(value), "Private receipt absent from HTML/RSC");
  }
};
const failedRead = async (pattern, rows) => {
  const deliveries = [];
  const handler = (route) => {
    const delivery = route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Fictional feedback list read outage" })
    });
    deliveries.push(delivery);
    return delivery;
  };
  await page.route(pattern, handler);
  try {
    await event("focus");
    await page
      .getByText(
        pattern === identityRoute
          ? "Your sign-in could not be checked. Reconnect and try again."
          : "Fictional feedback list read outage",
        { exact: true }
      )
      .waitFor();
    await absent();
    await Promise.all(deliveries);
  } finally {
    await page.unroute(pattern, handler);
  }
  await button("Recheck current access").click();
  await ready(rows);
};
const lateRead = async (pattern, rows) => {
  let capture, release;
  const captured = new Promise((done) => {
    capture = done;
  });
  const gate = new Promise((done) => {
    release = done;
  });
  releases.add(release);
  const deliveries = [];
  let reads = 0,
    timer;
  const handler = (route) => {
    const first = ++reads === 1;
    const delivery = (async () => {
      const response = await route.fetch();
      if (first) {
        capture();
        await gate;
      }
      await route.fulfill({ response });
    })();
    deliveries.push(delivery);
    return delivery;
  };
  await page.route(pattern, handler);
  try {
    await event("focus");
    await Promise.race([
      captured,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("List read was not captured")),
          30000
        );
      })
    ]);
    await absent();
    await event("pagehide");
    release();
    await deliveries[0];
    await page.waitForLoadState("networkidle");
    await absent();
    await Promise.all(deliveries);
  } finally {
    clearTimeout(timer);
    release();
    releases.delete(release);
    await page.unroute(pattern, handler);
  }
  await event("pageshow");
  await ready(rows);
};
const fitAndCapture = async (name, width, enlarged = false) => {
  await page.setViewportSize({ width, height: 844 });
  if (enlarged)
    await page.addStyleTag({ content: "html{font-size:200%!important}" });
  await page.evaluate(() => scrollTo(0, 0));
  // Twenty enlarged cards exceed common full-page raster limits. Keep actual
  // viewport captures of the header and final preferences at this text size.
  await page.screenshot({
    path: output + "/" + name + ".png",
    fullPage: !enlarged
  });
  if (enlarged) {
    await preference().scrollIntoViewIfNeeded();
    await page.screenshot({ path: output + "/" + name + "-preferences.png" });
  }
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal overflow at " + name
  );
};
let fixture;
const owned = [];
const createReceipt = async (actor, title) => {
  const intake = await readSupport(db, actor.token, "new", {
    feedbackOnly: true
  });
  assert.ok(intake.intake.available && intake.intake.recipient);
  const description = marker("private description " + owned.length);
  const receipt = await supportCommand(db, actor.token, {
    operation: "feedback-create",
    requestKey: randomUUID(),
    kind: "GENERAL",
    rating: 3,
    subject: title,
    description,
    notice: FEEDBACK_NOTICE,
    consent: true,
    recipientId: intake.intake.recipient.id,
    recipientVersion: intake.intake.recipient.version,
    contactAllowed: false,
    channels: [],
    allowIdea: false,
    publicAttribution: false
  });
  markers.push(receipt.caseId);
  return { id: receipt.caseId, subject: title };
};
const ownedEffects = async () => ({
  cases: await db.supportCase.findMany({
    where: { requesterId: fixture.memberA.id },
    select: { id: true, version: true, updatedAt: true },
    orderBy: { id: "asc" }
  }),
  messages: await db.supportMessage.count({
    where: { case: { requesterId: fixture.memberA.id } }
  }),
  operations: await db.supportOperation.count({
    where: { actorId: fixture.memberA.id }
  })
});
try {
  fixture = await seedSupport(db);
  const seededAt = Date.now();
  for (let index = 0; index < 22; index++) {
    const row = await createReceipt(
      fixture.memberA,
      marker("receipt " + String(index + 1).padStart(2, "0"))
    );
    owned.push(row);
    // Only this newly created fixture is aged. Real intake supplies every row;
    // no global daily-limit state is deleted or changed.
    const aged = await db.supportCase.updateMany({
      where: { id: row.id, requesterId: fixture.memberA.id },
      data: {
        createdAt: new Date(seededAt - 3 * 86400000 - index * 60000),
        updatedAt: new Date(seededAt - index * 60000)
      }
    });
    assert.equal(aged.count, 1);
  }
  const foreign = await createReceipt(
    fixture.memberB,
    marker("foreign receipt")
  );
  await signIn(fixture.memberA);
  for (const currentPage of [0, 1]) {
    await serialization(listPath + (currentPage ? "?page=1" : ""));
    const response = await context.request.get(
      feedbackEndpoint + "?view=requests&page=" + currentPage,
      { headers: { "X-Expected-Account": fixture.memberA.id } }
    );
    assert.equal(response.status(), 200);
    assert.match(response.headers()["cache-control"], /no-store/);
    const dto = await response.json();
    assert.equal(dto.viewer.id, fixture.memberA.id);
    assert.equal(dto.page, currentPage);
    assert.equal(dto.more, currentPage === 0);
    assert.deepEqual(
      dto.rows.map(({ id, subject }) => ({ id, subject })),
      currentPage ? owned.slice(20) : owned.slice(0, 20)
    );
    assert.ok(!JSON.stringify(dto).includes(foreign.id));
  }
  await go();
  await ready(owned.slice(0, 20));
  assert.equal(
    await page
      .getByRole("link", { name: "Previous page", exact: true })
      .count(),
    0
  );
  ok(
    "Twenty-two real owned receipts paginate 20/2 with no foreign receipt; initial HTML/RSC omit titles, descriptions and case IDs while the authorized no-store API remains complete."
  );

  for (const trigger of ["blur", "offline", "pagehide", "hidden"]) {
    if (trigger === "hidden") {
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => "hidden"
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
    } else await event(trigger);
    await absent();
    if (trigger === "hidden") {
      await page.evaluate(() => {
        delete document.visibilityState;
        document.dispatchEvent(new Event("visibilitychange"));
      });
    } else
      await event(
        trigger === "offline"
          ? "online"
          : trigger === "pagehide"
            ? "pageshow"
            : "focus"
      );
    await ready(owned.slice(0, 20));
  }
  await failedRead(identityRoute, owned.slice(0, 20));
  await failedRead(listRoute, owned.slice(0, 20));
  await lateRead(identityRoute, owned.slice(0, 20));
  await lateRead(listRoute, owned.slice(0, 20));
  await signIn(fixture.memberB);
  await event("focus");
  await page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .waitFor();
  await absent();
  await signIn(fixture.memberA);
  await event("focus");
  await ready(owned.slice(0, 20));
  ok(
    "Blur, offline, pagehide, hidden documents, failed and late identity/list reads and account replacement remove the physical list and preference presentation; only current authorized reads restore it."
  );

  const navigatePage = async (name, rows, pageNumber) => {
    await page.evaluate(() => {
      window.__feedbackIndexDocument = "original";
    });
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      page.getByRole("link", { name, exact: true }).click()
    ]);
    await ready(rows);
    assert.equal(
      new URL(page.url()).searchParams.get("page"),
      String(pageNumber)
    );
    assert.equal(
      await page.evaluate(() => window.__feedbackIndexDocument),
      undefined,
      "Pagination must open a fresh document"
    );
  };
  await navigatePage("Next page", owned.slice(20), 1);
  assert.equal(
    await page.getByRole("link", { name: "Next page", exact: true }).count(),
    0
  );
  await navigatePage("Previous page", owned.slice(0, 20), 0);
  await page.goBack();
  await ready(owned.slice(20));
  await page.goForward();
  await ready(owned.slice(0, 20));
  ok(
    "Next and Previous open fresh private documents with 2/20 rows; browser Back and Forward return to the correct owned page."
  );

  const supportBefore = await ownedEffects();
  const preferenceBefore = await db.feedbackPromptPreference.findUniqueOrThrow({
    where: { userId: fixture.memberA.id }
  });
  assert.equal(preferenceBefore.neverAskAt, null);
  const operationCountBefore = await db.socialOperation.count({
    where: { ownerId: fixture.memberA.id }
  });
  const attempts = [],
    deliveries = [];
  let originalReceipt;
  const losePreference = (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    attempts.push({
      body: request.postData(),
      account: request.headers()["x-expected-account"]
    });
    const first = attempts.length === 1;
    const delivery = (async () => {
      const response = await route.fetch();
      assert.equal(response.status(), 200, await response.text());
      if (first) {
        originalReceipt = await response.json();
        await route.abort("failed");
      } else await route.fulfill({ response });
    })();
    deliveries.push(delivery);
    return delivery;
  };
  await page.route(preferenceEndpoint, losePreference);
  try {
    await openPreferences();
    await button("Don’t ask again").click();
    await button("Retry the same preference").waitFor();
    await until(
      async () => deliveries.length === 1,
      "The original preference command did not reach the server"
    );
    await deliveries[0];
    assert.equal(attempts.length, 1);
    const command = JSON.parse(attempts[0].body);
    assert.deepEqual(Object.keys(command).sort(), ["mutationId", "operation"]);
    assert.equal(command.operation, "never-ask");
    assert.match(command.mutationId, /^[a-f0-9-]{36}$/);
    assert.equal(attempts[0].account, fixture.memberA.id);
    const saved = await db.feedbackPromptPreference.findUniqueOrThrow({
      where: { userId: fixture.memberA.id }
    });
    assert.ok(saved.neverAskAt);
    assert.equal(saved.version, preferenceBefore.version + 1);
    assert.equal(originalReceipt.id, fixture.memberA.id);
    assert.equal(originalReceipt.version, saved.version);
    assert.equal(
      await db.socialOperation.count({
        where: {
          ownerId: fixture.memberA.id,
          key: "feedback-prompt-preference:" + command.mutationId
        }
      }),
      1
    );

    await page.evaluate(() => {
      window.__feedbackIndexDocument = "pending preference";
    });
    const beforeBlockedUrl = page.url();
    await page.getByRole("link", { name: "Next page", exact: true }).click();
    await page
      .getByText(
        "Your feedback preference is unconfirmed. Retry the same choice or check its current status.",
        { exact: true }
      )
      .waitFor();
    assert.equal(page.url(), beforeBlockedUrl);
    assert.equal(
      await page.evaluate(() => window.__feedbackIndexDocument),
      "pending preference"
    );
    assert.equal(attempts.length, 1);

    for (const trigger of ["blur", "pagehide"]) {
      await event(trigger);
      await absent();
      await event(trigger === "pagehide" ? "pageshow" : "focus");
      await ready(owned.slice(0, 20));
      await openPreferences();
      await button("Finish protecting this preference").waitFor();
      assert.equal(attempts.length, 1);
    }
    await signIn(fixture.memberB);
    await event("focus");
    await page
      .getByText("Your sign-in changed. Reload before continuing.", {
        exact: true
      })
      .waitFor();
    await absent();
    assert.equal(
      attempts.length,
      1,
      "No old-account mutation during account replacement"
    );
    await signIn(fixture.memberA);
    await event("focus");
    await ready(owned.slice(0, 20));
    await openPreferences();
    await button("Finish protecting this preference").click();
    await until(
      async () =>
        (await preference()
          .getByText("Automatic feedback prompts are off for your account.", {
            exact: true
          })
          .count()) === 1 &&
        (await button("Finish protecting this preference").count()) === 0,
      "Preference acknowledgement did not clear the retained command"
    );
    await Promise.all(deliveries);
    assert.equal(attempts.length, 2);
    assert.deepEqual(attempts[1], attempts[0]);
    const after = await db.feedbackPromptPreference.findUniqueOrThrow({
      where: { userId: fixture.memberA.id }
    });
    assert.deepEqual(
      after,
      saved,
      "An exact retry must not change the persisted preference again"
    );
    assert.equal(
      await db.socialOperation.count({
        where: { ownerId: fixture.memberA.id }
      }),
      operationCountBefore + 1
    );
    assert.equal(
      await db.socialOperation.count({
        where: {
          ownerId: fixture.memberA.id,
          key: "feedback-prompt-preference:" + command.mutationId
        }
      }),
      1
    );
    assert.equal(
      await db.retentionControl.count({
        where: {
          kind: "FEEDBACK_PROMPT",
          sourceId: fixture.memberA.id,
          journaledAt: null
        }
      }),
      0
    );
    assert.deepEqual(await ownedEffects(), supportBefore);
    retryEvidence.push({
      operation: command.operation,
      mutationId: command.mutationId,
      sha256: createHash("sha256").update(attempts[0].body).digest("hex"),
      attempts: 2,
      sameAccountBodyAndKey: true,
      savedVersion: saved.version,
      operationEffects: 1,
      retryVersionIncrements: 0
    });
  } finally {
    await page.unroute(preferenceEndpoint, losePreference);
  }
  await navigatePage("Next page", owned.slice(20), 1);
  await navigatePage("Previous page", owned.slice(0, 20), 0);
  ok(
    "A real lost inline never-ask acknowledgement blocks pagination, survives concealment and account replacement, and replays identical account/body/key; one receipt and preference update are protected with no second effect or Support write."
  );

  await signIn(fixture.pending);
  const emptyDto = await context.request.get(
    feedbackEndpoint + "?view=requests",
    {
      headers: { "X-Expected-Account": fixture.pending.id }
    }
  );
  assert.equal(emptyDto.status(), 200);
  assert.equal((await emptyDto.json()).rows.length, 0);
  await go();
  await page
    .getByText(
      "No feedback receipts yet. Sending optional feedback creates a private receipt here.",
      { exact: true }
    )
    .waitFor();
  await event("pagehide");
  await absent();
  await event("pageshow");
  await page
    .getByText(
      "No feedback receipts yet. Sending optional feedback creates a private receipt here.",
      { exact: true }
    )
    .waitFor();
  assert.equal(await receiptLinks().count(), 0);
  assert.equal(
    await page
      .getByRole("navigation", { name: "Feedback pages", exact: true })
      .count(),
    0
  );
  ok(
    "An authorized empty list also removes its empty-state and preference presentation on pagehide, then restores on pageshow without inventing receipts or pagination."
  );

  await signIn(fixture.memberA);
  await go("/platform/feedback");
  const intakeForm = page.locator('form[aria-label="Send feedback"]');
  const draft = marker("retained intake draft");
  await intakeForm.waitFor();
  await intakeForm.locator('[name="description"]').fill(draft);
  for (const trigger of ["pagehide", "blur"]) {
    await event(trigger);
    await until(
      async () => !(await intakeForm.isVisible()),
      "Intake was not concealed"
    );
    // This is preservation coverage for the existing uncontrolled intake, not
    // an assertion that its private DOM has been removed by this list repair.
    assert.equal(await intakeForm.count(), 1);
    assert.equal(
      await intakeForm.locator('[name="description"]').inputValue(),
      draft
    );
    await event(trigger === "pagehide" ? "pageshow" : "focus");
    await intakeForm.waitFor();
    assert.equal(
      await intakeForm.locator('[name="description"]').inputValue(),
      draft
    );
  }
  await intakeForm
    .getByRole("button", { name: "Discard local entries", exact: true })
    .click();
  await until(
    async () =>
      (await intakeForm.locator('[name="description"]').inputValue()) === "",
    "Intake draft did not discard"
  );
  ok(
    "The shared hook's pagehide/pageshow and blur/focus transitions preserve an existing dirty intake field; intake DOM cleanup is deliberately not claimed and no feedback is submitted."
  );

  await go();
  await ready(owned.slice(0, 20));
  await openPreferences();
  await fitAndCapture("list-390", 390);
  await fitAndCapture("list-320", 320);
  await fitAndCapture("list-320-font-200", 320, true);
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  assert.equal(
    browserWrites.length,
    2,
    "Only the first preference command and its exact retry are browser writes"
  );
  assert.ok(
    browserWrites.every(
      (write) =>
        write.method === "POST" &&
        write.path === "/api/platform/feedback/prompts"
    )
  );
  ok(
    "The list and inline preferences fit 390px, 320px and 320px with 200% text; no browser errors, external requests or localStorage persistence occur, with exactly two browser POSTs."
  );
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        results,
        errors,
        externalRequests,
        browserWrites,
        retryEvidence,
        seededOwnedReceipts: owned.length,
        seededForeignReceipts: 1,
        fixtureOnly: true,
        productionWrites: 0,
        recipientSends: 0,
        limitations: [
          "Reviewed ideas and Following lists use their existing separate regression suites.",
          "Synthetic lifecycle events do not establish physical-device or operating-system snapshot behavior.",
          "Intake smoke checks retained uncontrolled field values, not physical DOM removal."
        ]
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  console.log("FEEDBACK_INDEX_BROWSER_PASS " + results.length);
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.json",
    JSON.stringify(
      {
        results,
        errors,
        externalRequests,
        browserWrites,
        retryEvidence,
        url: page.url(),
        message: String(error),
        fixtureOnly: true
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  throw error;
} finally {
  for (const release of releases) release();
  try {
    if (originalIntake)
      await db.supportIntakeSetting.upsert({
        where: { id: "default" },
        create: originalIntake,
        update: {
          ownerGrantId: originalIntake.ownerGrantId,
          enabled: originalIntake.enabled,
          approvedNoticeVersion: originalIntake.approvedNoticeVersion
        }
      });
    else if (fixture)
      await db.supportIntakeSetting.deleteMany({
        where: { id: "default", ownerGrantId: fixture.ownerGrant.id }
      });
  } finally {
    await browser.close();
    await db.$disconnect();
  }
}
