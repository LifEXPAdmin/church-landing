import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";

const fixtureDir = resolve(process.argv[2] ?? "");
assert.ok(
  process.argv[2],
  "Pass the existing isolated HTTPS fixture directory"
);
assert.ok(fixtureDir.startsWith(resolve(".account-test") + "/"));
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
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: "",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  SOCIAL_EMAIL_ENABLED: "false",
  FOUNDER_WELCOME_ENABLED: "false",
  FOUNDER_ANNOUNCEMENTS_ENABLED: "false",
  PUSH_ENABLED: "false",
  SUPPORT_INTAKE_ENABLED: "true"
});
// Use the inspected runtime's modules even when this script lives elsewhere.
const require = createRequire(resolve("package.json"));
const load = (name) => import(pathToFileURL(resolve(name)));
const { PrismaClient } = require("@prisma/client");
const { assertPortalTestDatabase, createPortalActor, seedOperatorGrants } =
  await load("tests/seed-portal.ts");
const { readFeedbackWeekly, saveFeedbackWeekly } = await load(
  "lib/platform/feedback-weekly.ts"
);
const { metricDayStart, metricAddDays } = await load(
  "lib/platform/metric-time.ts"
);
const db = new PrismaClient();
await assertPortalTestDatabase(db);
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
const output = resolve(
  fixtureDir,
  "feedback-weekly-privacy-browser-" + Date.now()
);
mkdirSync(output, { recursive: true, mode: 0o700 });
const results = [],
  errors = [],
  routeErrors = [],
  externalRequests = [],
  browserWrites = [],
  requests = [];
const rules = [],
  releases = new Set(),
  restoredGrants = new Map();
let rejectRouting, actor, replacement;
const routingFailure = new Promise((_, reject) => {
  rejectRouting = reject;
});
void routingFailure.catch(() => {});
const register = (matches, handler) => {
  const rule = { matches, handler };
  rules.unshift(rule);
  return () => {
    const index = rules.indexOf(rule);
    if (index >= 0) rules.splice(index, 1);
  };
};
// One native handler owns every HTTP request throughout the suite. The local
// rule is sampled before any await, so later removal cannot reassign a hold.
await context.route(/^https?:\/\//, async (route) => {
  try {
    const url = new URL(route.request().url());
    if (url.origin !== config.origin) {
      externalRequests.push(url.origin + url.pathname);
      return await route.abort();
    }
    const rule = rules.find((candidate) => candidate.matches(url));
    if (rule) return await rule.handler(route);
    return await route.continue();
  } catch (error) {
    const request = route.request();
    const diagnostic = {
      method: request.method(),
      url: request.url(),
      resourceType: request.resourceType(),
      message: String(error),
      stack: error.stack
    };
    routeErrors.push(diagnostic);
    rejectRouting(
      new Error("Browser routing failed: " + JSON.stringify(diagnostic), {
        cause: error
      })
    );
  }
});
context.on("request", (request) => {
  const url = new URL(request.url());
  requests.push({
    method: request.method(),
    path: url.pathname + url.search,
    document: request.isNavigationRequest(),
    rsc: request.headers().rsc ?? null
  });
  if (!["GET", "HEAD"].includes(request.method()))
    browserWrites.push({
      method: request.method(),
      path: url.pathname,
      body: request.postData(),
      owner: request.headers()["x-expected-account"]
    });
});
page.on("pageerror", (error) => errors.push(error.message));
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const write = (name, value) =>
  writeFileSync(resolve(output, name), JSON.stringify(value, null, 2), {
    mode: 0o600
  });
const button = (name) => page.getByRole("button", { name, exact: true });
const event = (name) =>
  page.evaluate((type) => window.dispatchEvent(new Event(type)), name);
const workspace = page.locator('section[aria-label="Admin workspace"]');
const form = page.getByRole("form", {
  name: "Save private review",
  exact: true
});
const field = (name) => form.locator('[name="' + name + '"]');
const weekInput = page.locator("#feedback-review-week");
const weekForm = page.locator('form[action="/platform/admin/feedback/weekly"]');
const retry = form.getByRole("button", {
  name: "Retry original action",
  exact: true
});
const submit = form.getByRole("button", {
  name: "Save private review",
  exact: true
});
const identity = (url) =>
  url.pathname === "/api/platform/profile" &&
  url.searchParams.get("view") === "identity";
const source = (url) =>
  url.pathname === "/api/platform/admin" &&
  url.searchParams.get("view") === "feedback-weekly";
const command = (url) => url.pathname === "/api/platform/admin" && !url.search;
const path = "/platform/admin/feedback/weekly";
const attempts = [],
  dialogs = [],
  observations = [];
let dialogAccept = true,
  caseRow,
  week,
  selectedWeek,
  privateCaseTitle,
  saved,
  dirty;
const fields = ["learned", "tryNext", "checkNext", "buildUrl"];
page.on("dialog", async (dialog) => {
  dialogs.push({
    type: dialog.type(),
    message: dialog.message(),
    accepted: dialogAccept
  });
  if (dialogAccept) await dialog.accept();
  else await dialog.dismiss();
});
const signIn = async (who) => {
  await context.clearCookies();
  await context.addCookies([
    {
      name: sessionCookieFixtureName(config.origin),
      value: who.token,
      url: config.origin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
};
const readApi = async (status = 200, explicitWeek = week) => {
  const response = await context.request.get(
    config.origin +
      "/api/platform/admin?view=feedback-weekly&week=" +
      explicitWeek,
    { headers: { "X-Expected-Account": actor.id } }
  );
  assert.equal(response.status(), status, await response.text());
  assert.match(response.headers()["cache-control"], /no-store/);
  const result = await response.json();
  if (status === 200) {
    assert.equal(result.navigation.viewer.id, actor.id);
    assert.equal(result.weekly.window.from, explicitWeek);
  }
  return result;
};
const ready = async () => {
  await page
    .getByRole("heading", { name: "Weekly feedback review", exact: true })
    .waitFor();
  await field("learned").waitFor({ state: "visible" });
};
const valuesAre = async (values) => {
  await ready();
  await page.waitForFunction((values) => {
    const form = document.querySelector(
      'form[aria-label="Save private review"]'
    );
    return Object.entries(values).every(
      ([name, value]) =>
        form?.querySelector(`[name="${name}"]`)?.value === value
    );
  }, values);
};
const fill = async (values) => {
  for (const name of fields) await field(name).fill(values[name]);
};
const absent = async (label) => {
  await page.waitForFunction(
    ({ privateCaseTitle, caseId, markers }) => {
      const root = document.querySelector(
        'section[aria-label="Admin workspace"]'
      );
      return (
        root &&
        !root.querySelector(
          'form[aria-label="Save private review"], #feedback-review-week'
        ) &&
        !root.querySelector(
          `a[href="/platform/admin/cases/SUPPORT/${caseId}"]`
        ) &&
        !root.textContent.includes(privateCaseTitle) &&
        !root.querySelector('form[action="/platform/admin/feedback/weekly"]') &&
        markers.every((value) => !root.textContent.includes(value)) &&
        ![...root.querySelectorAll("h1")].some(
          (node) => node.textContent === "Weekly feedback review"
        )
      );
    },
    {
      privateCaseTitle,
      caseId: caseRow.id,
      markers: [...Object.values(saved), ...Object.values(dirty)]
    }
  );
  observations.push({ label, privateDomAbsent: true });
};
const blockedWeek = async () => {
  assert.equal(await weekInput.isEnabled(), false);
  assert.equal(await button("Open week").isEnabled(), false);
  const before = page.url();
  // requestSubmit bypasses a disabled button. The native form itself must guard.
  await weekForm.evaluate((node) => node.requestSubmit());
  await page.waitForLoadState("networkidle");
  assert.equal(page.url(), before);
  assert.equal(await page.evaluate(() => window.__weeklyDocument), "original");
};
const capturedWithin = async (promise) => {
  let timer;
  try {
    await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error("Held weekly read did not arrive")),
          30000
        );
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
};
const failedRead = async (matches, label) => {
  const remove = register(matches, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Fictional weekly read unavailable" })
    })
  );
  try {
    await event("focus");
    await page
      .getByText(
        matches === identity
          ? "Your sign-in could not be checked. Reconnect and try again."
          : "Fictional weekly read unavailable",
        { exact: true }
      )
      .waitFor();
    await absent(label);
  } finally {
    remove();
  }
  await button("Recheck current access").click();
  await valuesAre(dirty);
};
const lateRead = async (matches, label) => {
  let release, capture;
  const gate = new Promise((done) => {
    release = done;
  });
  const captured = new Promise((done) => {
    capture = done;
  });
  const deliveries = [];
  releases.add(release);
  const remove = register(matches, (route) => {
    const delivery = (async () => {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      capture();
      await gate;
      await route.fulfill({ response });
    })();
    deliveries.push(delivery);
    return delivery;
  });
  try {
    await event("focus");
    await capturedWithin(captured);
    await absent(label);
    await event("pagehide");
    release();
    await Promise.all(deliveries);
    await page.waitForLoadState("networkidle");
    await absent(label + "-late-after-pagehide");
  } finally {
    release();
    releases.delete(release);
    remove();
  }
  await event("pageshow");
  await valuesAre(dirty);
};
const revoke = async (grant) => {
  await db.platformOperatorGrant.update({
    where: { id: grant.id },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  restoredGrants.set(grant.id, grant);
};
const restore = async (grant) => {
  await db.platformOperatorGrant.update({
    where: { id: grant.id },
    data: { revokedAt: grant.revokedAt, version: { increment: 1 } }
  });
  restoredGrants.delete(grant.id);
};
const notes = (label, number) => ({
  learned: "Private weekly " + label + " learning " + randomUUID(),
  tryNext: "Private weekly " + label + " experiment " + randomUUID(),
  checkNext: "Private weekly " + label + " next check " + randomUUID(),
  buildUrl: "https://github.com/example/weekly-fixture/issues/" + number
});
const saveService = (expectedVersion, values) =>
  saveFeedbackWeekly(db, actor.token, {
    operation: "feedback-review",
    requestKey: randomUUID(),
    week,
    expectedVersion,
    ...values
  });
const reviewRow = () =>
  db.feedbackWeeklyReview.findFirstOrThrow({
    where: { userId: actor.id, week }
  });
const receipt = async (body) => {
  const input = JSON.parse(body);
  const rows = await db.adminOperation.findMany({
    where: {
      actorId: actor.id,
      requestKey: input.requestKey,
      sourceType: "FEEDBACK_REVIEW"
    }
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, "feedback-review");
  assert.equal(rows[0].sourceId, (await reviewRow()).id);
  return rows[0];
};
const fieldsEqualRow = (row, values) => {
  for (const name of fields) assert.equal(row[name], values[name]);
};
const fit = async (width, enlarged = false) => {
  const label = "weekly-" + width + (enlarged ? "-font-200" : "");
  await page.setViewportSize({ width, height: 844 });
  const style = enlarged
    ? await page.addStyleTag({ content: "html{font-size:200%!important}" })
    : null;
  try {
    const sections = [
      ["week", weekInput],
      [
        "case",
        workspace
          .getByRole("link", { name: privateCaseTitle, exact: true })
          .first()
      ],
      ["notes", field("learned")],
      ["actions", form.locator("button").last()]
    ];
    for (const [name, element] of sections) {
      await element.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: resolve(output, label + "-" + name + ".png")
      });
    }
    if (!enlarged)
      await page.screenshot({
        path: resolve(output, label + ".png"),
        fullPage: true
      });
    const layout = await page.evaluate(() => ({
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflow: [...document.querySelectorAll("main *")]
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            tag: node.tagName,
            name: node.getAttribute("name"),
            class: node.className,
            right: rect.right + scrollX,
            width: rect.width,
            text: node.textContent.slice(0, 100)
          };
        })
        .filter((row) => row.width && row.right > innerWidth + 1)
        .slice(0, 30)
    }));
    write(label + "-layout.json", layout);
    assert.ok(
      layout.scrollWidth <= layout.viewport + 1,
      "No horizontal overflow: " + label
    );
  } finally {
    if (style) await style.evaluate((node) => node.remove());
  }
};
const weeklyRequests = () =>
  requests.filter((request) => {
    const url = new URL(request.path, config.origin);
    return request.method === "GET" && source(url);
  });
const run = async () => {
  actor = await createPortalActor(db, "weekpriv");
  replacement = await createPortalActor(db, "weekswap");
  await seedOperatorGrants(db, actor, ["MANAGE_PRODUCT_FEEDBACK"]);
  const grant = await db.platformOperatorGrant.findUniqueOrThrow({
    where: {
      userId_capability: {
        userId: actor.id,
        capability: "MANAGE_PRODUCT_FEEDBACK"
      }
    }
  });
  const supportGrant = await db.supportCapabilityGrant.create({
    data: { userId: actor.id, capability: "RESPOND" }
  });
  const initial = await readFeedbackWeekly(db, actor.token);
  week = initial.weekly.window.from;
  selectedWeek = metricAddDays(week, -7);
  const at = new Date(
    metricDayStart(week, initial.weekly.window.zone).getTime() + 12 * 3600000
  );
  privateCaseTitle = "Private weekly browser case " + randomUUID();
  caseRow = await db.supportCase.create({
    data: {
      requesterId: replacement.id,
      category: "ACCOUNT_WEBSITE",
      subject: privateCaseTitle,
      description: "Private fictional weekly case description",
      ownerGrantId: supportGrant.id,
      ownerGrantVersion: supportGrant.version,
      priority: "HIGH",
      createdAt: at,
      triageTags: ["private-weekly-browser"],
      feedback: { create: { kind: "BUG", createdAt: at } }
    }
  });
  saved = notes("initial", 5101);
  dirty = notes("draft", 5103);
  const first = await saveService(0, saved);
  await signIn(actor);
  const firstApi = await readApi();
  assert.equal(firstApi.weekly.notes.version, first.version);
  fieldsEqualRow(firstApi.weekly.notes, saved);
  assert.equal(firstApi.weekly.cases.cases, 1);
  assert.ok(
    firstApi.weekly.cases.highImpact.some((row) => row.id === caseRow.id)
  );
  for (const rsc of [false, true]) {
    const response = await context.request.get(
      config.origin + path,
      rsc ? { headers: { RSC: "1" } } : {}
    );
    assert.equal(response.status(), 200);
    if (rsc)
      assert.match(response.headers()["content-type"], /text\/x-component/);
    const content = await response.text();
    for (const marker of [
      ...Object.values(saved),
      privateCaseTitle,
      caseRow.id
    ])
      assert.ok(
        !content.includes(marker),
        "Private weekly DTO absent from initial HTML/RSC"
      );
  }
  await page.goto(config.origin + path);
  await valuesAre(saved);
  await page.evaluate(() => {
    window.__weeklyDocument = "original";
  });
  const afterFirstSnapshot = weeklyRequests().length;
  assert.ok(afterFirstSnapshot > 0);
  assert.equal(await weekInput.inputValue(), week);
  await event("blur");
  await absent("clean-saved-blur");
  await event("focus");
  await valuesAre(saved);
  const cleanUpdate = notes("clean-refresh", 5102);
  const second = await saveService(first.version, cleanUpdate);
  await event("focus");
  await valuesAre(cleanUpdate);
  assert.equal(await button("Open week").isEnabled(), true);
  assert.equal(await button("Discard local entries").count(), 0);
  assert.equal(browserWrites.length, 0);
  saved = cleanUpdate;
  ok(
    "Initial HTML/RSC omit private weekly notes/cases while the authorized API is no-store. A real external service save updates all four clean control defaults after refresh without creating dirty work or a browser write."
  );

  await weekInput.fill(selectedWeek);
  await fill(dirty);
  await blockedWeek();
  for (const trigger of ["blur", "offline", "pagehide", "hidden"]) {
    if (trigger === "hidden")
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => "hidden"
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
    else await event(trigger);
    await absent("dirty-" + trigger);
    if (trigger === "hidden")
      await page.evaluate(() => {
        delete document.visibilityState;
        document.dispatchEvent(new Event("visibilitychange"));
      });
    else
      await event(
        trigger === "blur"
          ? "focus"
          : trigger === "offline"
            ? "online"
            : "pageshow"
      );
    await valuesAre(dirty);
    assert.equal(await weekInput.inputValue(), selectedWeek);
  }
  await failedRead(identity, "failed-identity");
  await failedRead(source, "failed-source");
  await lateRead(identity, "held-identity");
  await lateRead(source, "held-source");
  await signIn(replacement);
  await event("focus");
  await page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .waitFor();
  await absent("replacement-account");
  await signIn(actor);
  await event("focus");
  await valuesAre(dirty);
  assert.equal(await weekInput.inputValue(), selectedWeek);
  await blockedWeek();
  assert.equal(browserWrites.length, 0);
  const concurrent = notes("concurrent-saved", 5104);
  const third = await saveService(second.version, concurrent);
  await event("focus");
  await valuesAre(dirty);
  const adopt = form.getByRole("button", {
    name: "Use current version with these entries",
    exact: true
  });
  await adopt.waitFor();
  assert.equal(await submit.isEnabled(), false);
  assert.equal(await weekInput.inputValue(), selectedWeek);
  const currentApi = await readApi();
  fieldsEqualRow(currentApi.weekly.notes, concurrent);
  assert.equal(currentApi.weekly.notes.version, third.version);
  await adopt.click();
  await valuesAre(dirty);
  await blockedWeek();
  for (const [width, enlarged] of [
    [390, false],
    [320, false],
    [320, true]
  ])
    await fit(width, enlarged);
  await page.setViewportSize({ width: 390, height: 844 });
  ok(
    "All private report links, saved/default field DOM and unsent values disappear on lifecycle concealment, failed/held reads and account replacement. Four note drafts and the chosen week survive; real concurrent saved notes cause conflict instead of overwriting drafts, and explicit version adoption preserves the original report week while native week navigation remains blocked."
  );

  let originalReceipt;
  const removeRetry = register(command, async (route) => {
    assert.equal(route.request().method(), "POST");
    const body = route.request().postData(),
      value = JSON.parse(body);
    assert.equal(value.operation, "feedback-review");
    assert.equal(value.week, week);
    assert.equal(value.expectedVersion, third.version);
    fieldsEqualRow(value, dirty);
    attempts.push({
      body,
      owner: route.request().headers()["x-expected-account"]
    });
    if (attempts.length === 1) {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      originalReceipt = await response.json();
      return route.abort("failed");
    }
    if (attempts.length === 2)
      return route.fulfill({
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "2" },
        body: JSON.stringify({ message: "Fictional weekly retry cooldown" })
      });
    if (attempts.length === 3)
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Fictional weekly retry unavailable" })
      });
    assert.equal(attempts.length, 4);
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    assert.deepEqual(await response.json(), originalReceipt);
    return route.fulfill({ response });
  });
  try {
    await submit.click();
    await retry.waitFor();
    await valuesAre(dirty);
    const once = await reviewRow(),
      onceReceipt = await receipt(attempts[0].body);
    assert.equal(once.version, third.version + 1);
    fieldsEqualRow(once, dirty);
    await blockedWeek();
    await revoke(grant);
    await event("focus");
    await button("Recheck current access").waitFor();
    await page.waitForLoadState("networkidle");
    await absent("product-grant-revoked-pending");
    await readApi(404);
    assert.equal(attempts.length, 1);
    await restore(grant);
    await event("focus");
    await valuesAre(dirty);
    await retry.waitFor();
    assert.equal(await field("learned").isEnabled(), false);
    await blockedWeek();
    await retry.click();
    await form
      .getByRole("alert")
      .filter({ hasText: "Fictional weekly retry cooldown" })
      .waitFor();
    assert.equal(await retry.isEnabled(), false);
    await signIn(replacement);
    await retry.click();
    await page
      .getByText("Your sign-in changed. Reload before continuing.", {
        exact: true
      })
      .waitFor();
    await absent("replacement-account-pending");
    assert.equal(attempts.length, 2);
    await signIn(actor);
    await event("focus");
    await valuesAre(dirty);
    await retry.click();
    await form
      .getByRole("alert")
      .filter({ hasText: "Fictional weekly retry unavailable" })
      .waitFor();
    await receipt(attempts[0].body);
    await blockedWeek();
    await retry.click();
    await submit.waitFor();
    await valuesAre(dirty);
    await form
      .getByRole("status")
      .filter({ hasText: "Your private weekly review was saved." })
      .waitFor();
    await page.waitForFunction(() => {
      const active = document.activeElement;
      return (
        active?.getAttribute("role") === "status" &&
        active.closest('form[aria-label="Save private review"]') &&
        active.getClientRects().length > 0
      );
    });
    assert.equal(await retry.count(), 0);
    assert.equal(await weekInput.isEnabled(), true);
    assert.equal(attempts.length, 4);
    assert.ok(
      attempts.every(
        (attempt) =>
          attempt.body === attempts[0].body && attempt.owner === actor.id
      )
    );
    assert.deepEqual(await reviewRow(), once);
    assert.deepEqual(await receipt(attempts[0].body), onceReceipt);
  } finally {
    removeRetry();
  }
  ok(
    "One real review save with a lost acknowledgment survives actual product-grant revocation/restoration, account replacement, 429 and 503. Four transmitted commands retain identical bytes/key/week/expected version/account, leave one receipt and one review increment, and keep week navigation blocked until confirmation."
  );

  const discarded = notes("discarded-local-retry", 5105);
  await fill(discarded);
  let discardBody;
  const removeDiscard = register(command, async (route) => {
    discardBody = route.request().postData();
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    return route.abort("failed");
  });
  try {
    await submit.click();
    await retry.waitFor();
  } finally {
    removeDiscard();
  }
  const discardedSavedRow = await reviewRow(),
    discardedReceipt = await receipt(discardBody);
  assert.equal(discardedSavedRow.version, third.version + 2);
  fieldsEqualRow(discardedSavedRow, discarded);
  // Keep the pre-save source snapshot here. Confirmed local discard must fetch
  // actual saved defaults rather than resetting to that older snapshot.
  await valuesAre(discarded);
  await retry.waitFor();
  await blockedWeek();
  const beforeDialogs = dialogs.length;
  dialogAccept = false;
  await button("Discard local entries").click();
  assert.equal(dialogs.length, beforeDialogs + 1);
  assert.match(dialogs.at(-1).message, /may already be saved/);
  await retry.waitFor();
  await page.waitForLoadState("networkidle");
  dialogAccept = true;
  const freshDiscardRead = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      source(new URL(response.url())) &&
      response.status() === 200
  );
  await button("Discard local entries").click();
  const afterDiscard = await (await freshDiscardRead).json();
  fieldsEqualRow(afterDiscard.weekly.notes, discarded);
  assert.equal(afterDiscard.weekly.notes.version, discardedSavedRow.version);
  assert.equal(dialogs.length, beforeDialogs + 2);
  await submit.waitFor();
  await valuesAre(discarded);
  await form
    .getByRole("status")
    .filter({ hasText: "Local entries discarded. Saved changes remain." })
    .waitFor();
  assert.equal(await retry.count(), 0);
  assert.equal(await button("Discard local entries").count(), 0);
  assert.equal(await weekInput.isEnabled(), true);
  assert.deepEqual(await reviewRow(), discardedSavedRow);
  assert.deepEqual(await receipt(discardBody), discardedReceipt);
  assert.equal(browserWrites.length, 5);
  ok(
    "Warned uncertain discard first preserves recovery when canceled, then clears only local uncertainty when confirmed. The form returns the latest nonempty authoritative saved defaults, selectors unlock, and the saved review/receipt remain unchanged."
  );

  const pinnedRequests = weeklyRequests().slice(afterFirstSnapshot);
  assert.ok(pinnedRequests.length >= 10);
  assert.ok(
    pinnedRequests.every(
      (request) =>
        new URL(request.path, config.origin).searchParams.get("week") === week
    ),
    "Every subsequent accepted-document read carries the first resolved report week, regardless of the separate week draft"
  );
  assert.equal(await weekInput.inputValue(), selectedWeek);
  await button("Open week").click();
  await page.waitForURL(
    (url) =>
      url.pathname === path && url.searchParams.get("week") === selectedWeek
  );
  await valuesAre({ learned: "", tryNext: "", checkNext: "", buildUrl: "" });
  assert.equal(await page.evaluate(() => window.__weeklyDocument), undefined);
  assert.equal(await weekInput.inputValue(), selectedWeek);
  await event("focus");
  await ready();
  assert.equal(
    new URL(weeklyRequests().at(-1).path, config.origin).searchParams.get(
      "week"
    ),
    selectedWeek
  );
  assert.equal((await readApi(200, selectedWeek)).weekly.notes.version, 0);
  ok(
    "Actual default-week reads become explicitly pinned to the first accepted report week. After all work is resolved, Open week performs fresh-document GET navigation and loads the deliberately selected week's own defaults; no fake clock or Monday transition is claimed."
  );

  assert.equal(
    await db.feedbackWeeklyReview.count({ where: { userId: actor.id } }),
    1
  );
  assert.equal(
    await db.adminOperation.count({
      where: { actorId: actor.id, sourceType: "FEEDBACK_REVIEW" }
    }),
    5
  );
  assert.equal(
    await db.retentionControl.count({
      where: { targetId: actor.id, kind: "FEEDBACK_REVIEW" }
    }),
    5
  );
  assert.equal(
    (
      await db.platformOperatorGrant.findUniqueOrThrow({
        where: { id: grant.id }
      })
    ).version,
    grant.version + 2
  );
  assert.equal(
    await db.supportCase.count({ where: { requesterId: replacement.id } }),
    1
  );
  assert.ok(
    browserWrites.every(
      (write) =>
        write.method === "POST" &&
        write.path === "/api/platform/admin" &&
        write.owner === actor.id &&
        JSON.parse(write.body).operation === "feedback-review"
    )
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(routeErrors, []);
  assert.deepEqual(externalRequests, []);
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  write("result.json", {
    node: process.version,
    nodeExecutable: process.execPath,
    results,
    observations,
    errors,
    routeErrors,
    externalRequests,
    browserWrites,
    requests,
    attempts,
    dialogs,
    resolvedWeek: week,
    explicitlyOpenedWeek: selectedWeek,
    pinnedReadCount: pinnedRequests.length,
    fixtureOnly: true,
    productionWrites: 0,
    recipientSends: 0,
    fixtureEffects: {
      actors: 2,
      operatorGrants: 1,
      supportGrants: 1,
      supportCases: 1,
      feedbackSubmissions: 1,
      weeklyReviewRows: 1,
      serviceReviewSaves: 3,
      browserReviewSaves: 2,
      reviewVersion: third.version + 2,
      reviewAuditOperations: 5,
      reviewRetentionControls: 5,
      browserMutationAttempts: 5,
      grantRevokeRestoreUpdates: 2,
      supportIntakeSingletonWrites: 0
    },
    limitations: [
      "Synthetic lifecycle events do not prove operating-system or physical-device snapshot protection.",
      "Rate-limit/service failures and lost acknowledgments are injected after real saved effects; this does not test limiter policy.",
      "Resolved-week pinning is established by actual subsequent GET parameters, without fake clocks or a real Monday rollover.",
      "The fixture uses one owner's scoped case/review. Other AdminForm owners remain covered by their existing regression suites."
    ]
  });
  console.log("FEEDBACK_WEEKLY_PRIVACY_BROWSER_PASS " + results.length);
};
try {
  await Promise.race([run(), routingFailure]);
} catch (error) {
  await page
    .screenshot({ path: resolve(output, "failure.png"), fullPage: true })
    .catch(() => {});
  write("failure.json", {
    results,
    observations,
    errors,
    routeErrors,
    externalRequests,
    browserWrites,
    requests,
    attempts,
    dialogs,
    message: String(error),
    stack: error.stack,
    url: page.url(),
    fixtureOnly: true
  });
  throw error;
} finally {
  for (const release of releases) release();
  try {
    await browser.close();
  } finally {
    try {
      for (const grant of restoredGrants.values()) await restore(grant);
    } finally {
      await db.$disconnect();
    }
  }
}
