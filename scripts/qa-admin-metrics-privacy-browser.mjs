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
Object.assign(
  process.env,
  JSON.parse(readFileSync(resolve(fixtureDir, "test-env.json"), "utf8")),
  {
    DATABASE_URL: config.database,
    DIRECT_URL: config.database,
    ACCOUNT_ORIGIN: config.origin,
    NEXT_PUBLIC_SITE_URL: config.origin,
    ACCOUNT_TEST_ISOLATED: "1",
    ACCOUNT_DELIVERY_MODE: "test-sink",
    ACCOUNT_TEST_SINK_DIR: resolve(fixtureDir, "sink"),
    RETENTION_TEST_DIR: resolve(fixtureDir, "retention"),
    PRIVILEGED_MFA_MODE: "enforce",
    NODE_ENV: "test",
    VERCEL: "",
    RESEND_API_KEY: "",
    MAILERLITE_API_KEY: "",
    SOCIAL_EMAIL_ENABLED: "false",
    FOUNDER_WELCOME_ENABLED: "false",
    FOUNDER_ANNOUNCEMENTS_ENABLED: "false",
    PUSH_ENABLED: "false",
    PLATFORM_MEASUREMENT_ENABLED: "true",
    PLATFORM_METRICS_ZONE: "America/Chicago"
  }
);
// Use the inspected runtime's modules even when this script lives elsewhere.
const require = createRequire(resolve("package.json"));
const load = (name) => import(pathToFileURL(resolve(name)));
const { PrismaClient } = require("@prisma/client");
const { assertPortalTestDatabase, createPortalActor, seedOperatorGrants } =
  await load("tests/seed-portal.ts");
const { metricDay, metricAddDays } = await load("lib/platform/metric-time.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
assert.equal(process.env.PRIVILEGED_MFA_MODE, "enforce");

const { privilegedAuthenticatorCommand, readPrivilegedAuthentication } =
  await import("../lib/platform/privileged-auth.ts");
const { authenticatorTotp, openAuthenticator } =
  await import("../lib/platform/admin-authenticator-crypto.ts");
const { withOwnedSession } =
  await import("../lib/platform/account-sessions.ts");
const { privilegedAssurance } =
  await import("../lib/platform/privileged-auth-policy.ts");
const mfaCommands = new Map();
const authenticate = async (who, input, credential) => {
  const next = (mfaCommands.get(who.id) ?? 0) + 1;
  assert.ok(
    next <= 10,
    "This fictional actor exceeded the real ten-command authenticator budget; split independent cohorts"
  );
  mfaCommands.set(who.id, next);
  return privilegedAuthenticatorCommand(db, who.token, input, credential);
};
// All proofs come from canonical commands for this suite's fictional actor.
// No proof row, factor counter or production policy is fabricated.
const nextMfaCode = async (who) => {
  for (;;) {
    const factor = await db.adminAuthenticator.findUniqueOrThrow({
      where: { userId: who.id }
    });
    const current = BigInt(Math.floor(Date.now() / 30000));
    const next =
      factor.lastCounter < current - 1n
        ? current - 1n
        : factor.lastCounter + 1n;
    if (next <= current + 1n)
      return {
        version: factor.version,
        code: authenticatorTotp(
          openAuthenticator(who.id, factor.secretCiphertext),
          next
        )
      };
    await new Promise((done) =>
      setTimeout(done, 30000 - (Date.now() % 30000) + 50)
    );
  }
};
const confirmWork = async (who, purpose = "privileged-work") => {
  assert.match(who.username, /^p_/);
  let snapshot = await readPrivilegedAuthentication(db, who.token);
  assert.equal(snapshot.mode, "enforce");
  if (!snapshot.factor) {
    await authenticate(
      who,
      {
        operation: "mfa-start",
        requestKey: randomUUID(),
        expectedVersion: 0
      },
      who.password
    );
    const next = await nextMfaCode(who);
    await authenticate(
      who,
      {
        operation: "mfa-confirm",
        requestKey: randomUUID(),
        expectedVersion: next.version,
        code: next.code
      },
      undefined
    );
    snapshot = await readPrivilegedAuthentication(db, who.token);
  }
  if (
    await withOwnedSession(
      db,
      who.token,
      (tx) => privilegedAssurance(tx, who.id, purpose),
      "shared"
    )
  )
    return;
  const next = await nextMfaCode(who);
  await authenticate(
    who,
    {
      operation: "mfa-challenge",
      requestKey: randomUUID(),
      expectedVersion: next.version,
      code: next.code,
      purpose
    },
    undefined
  );
  assert.equal(
    (await readPrivilegedAuthentication(db, who.token)).confirmedForWork,
    true
  );
};

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
    (process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : chromium.executablePath()),
  args: [
    "--ignore-certificate-errors-spki-list=" +
      createHash("sha256").update(der).digest("base64")
  ]
});
const context = await browser.newContext({
  serviceWorkers: "block",
  timezoneId: "America/Chicago",
  viewport: { width: 390, height: 844 },
  acceptDownloads: true
});
const page = await context.newPage();
page.setDefaultTimeout(30000);
const output = resolve(
  fixtureDir,
  "admin-metrics-privacy-browser-" + Date.now()
);
mkdirSync(output, { recursive: true, mode: 0o700 });
const cohortOwners = [];
const results = [],
  errors = [],
  routeErrors = [],
  externalRequests = [],
  browserWrites = [],
  requests = [],
  downloads = [],
  receipts = [],
  observations = [],
  dialogs = [],
  captures = [];
const rules = [],
  releases = new Set(),
  restoredGrants = new Map();
let actor,
  replacement,
  rejectRouting,
  dialogAccept = true,
  grantUpdates = 0;
let reportDates, draftDates, growthPath;
const routingFailure = new Promise((_, reject) => {
  rejectRouting = reject;
});
void routingFailure.catch(() => {});
const register = (matches, handler) => {
  const rule = { matches, handler };
  rules.unshift(rule);
  return () => {
    const at = rules.indexOf(rule);
    if (at >= 0) rules.splice(at, 1);
  };
};
// This persistent dispatcher owns each HTTP request once. Local rule selection
// is synchronous, including held requests whose rule is removed before release.
await context.route(/^https?:\/\//, async (route) => {
  try {
    const url = new URL(route.request().url());
    if (url.origin !== config.origin) {
      externalRequests.push(url.origin + url.pathname);
      return await route.abort();
    }
    const rule = rules.find((entry) => entry.matches(url));
    return rule ? await rule.handler(route) : await route.continue();
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
      owner: request.headers()["x-expected-account"],
      expectedOwner: actor?.id
    });
});
page.on("pageerror", (error) => errors.push(error.message));
page.on("download", (download) => downloads.push(download));
page.on("dialog", async (dialog) => {
  dialogs.push({
    type: dialog.type(),
    message: dialog.message(),
    accepted: dialogAccept
  });
  if (dialogAccept) await dialog.accept();
  else await dialog.dismiss();
});
const write = (name, value) =>
  writeFileSync(resolve(output, name), JSON.stringify(value, null, 2), {
    mode: 0o600
  });
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const button = (name) => page.getByRole("button", { name, exact: true });
const currentExport = button("Export current aggregates as CSV");
const retry = button("Retry original export");
const discard = button("Discard pending export");
const from = page.locator('main input[name="from"]');
const through = page.locator('main input[name="through"]');
const periodForm = page.locator('main form[action="/platform/admin/growth"]');
const heading = page.getByRole("heading", {
  name: "Platform growth",
  exact: true
});
const event = (name) =>
  page.evaluate((type) => window.dispatchEvent(new Event(type)), name);
const identity = (url) =>
  url.pathname === "/api/platform/profile" &&
  url.searchParams.get("view") === "identity";
const source = (url) =>
  url.pathname === "/api/platform/admin" &&
  url.searchParams.get("view") === "metrics";
const command = (url) => url.pathname === "/api/platform/admin" && !url.search;
const settled = () => page.waitForLoadState("networkidle");
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
const ready = async () => {
  await heading.waitFor();
  await from.waitFor();
};
const valuesAre = async (dates) => {
  await ready();
  await page.waitForFunction(
    ({ from, through }) =>
      document.querySelector('main input[name="from"]')?.value === from &&
      document.querySelector('main input[name="through"]')?.value === through,
    dates
  );
};
const inactive = async (label) => {
  await page.waitForFunction(() => {
    const root = document.querySelector("main");
    return (
      !!root &&
      !root.querySelector(
        'input[name="from"],input[name="through"],#metric-accounts'
      ) &&
      !root.textContent.includes("Current eligible opted-in population:") &&
      ![...root.querySelectorAll("h1")].some(
        (node) => node.textContent === "Platform growth"
      )
    );
  });
  assert.equal(await currentExport.count(), 0);
  assert.equal(await retry.count(), 0);
  assert.equal(await discard.count(), 0);
  observations.push({
    label,
    privatePresentationAbsent: true,
    writes: browserWrites.length,
    downloads: downloads.length
  });
};
const resume = async () => {
  const recheck = button("Recheck this sign-in");
  if (await recheck.isVisible()) await recheck.click();
  else await event("focus");
  await valuesAre(draftDates);
};
const readApi = async (status = 200) => {
  const response = await context.request.get(
    config.origin +
      "/api/platform/admin?" +
      new URLSearchParams({ view: "metrics", ...reportDates }),
    {
      maxRedirects: 0,
      headers: { "X-Expected-Account": actor.id }
    }
  );
  assert.equal(response.status(), status, await response.text());
  assert.match(response.headers()["cache-control"], /no-store/);
  const body = await response.json();
  if (status === 200) {
    assert.equal(body.navigation.viewer.id, actor.id);
    assert.equal(body.report.window.from, reportDates.from);
    assert.equal(body.report.window.through, reportDates.through);
  }
  return body;
};
const rows = () =>
  db.adminOperation.findMany({
    where: { actorId: { in: cohortOwners }, sourceType: "METRICS_EXPORT" },
    orderBy: { createdAt: "asc" }
  });
const effectCount = async (count) => assert.equal((await rows()).length, count);
const receipt = async (body) => {
  const input = JSON.parse(body);
  const found = await db.adminOperation.findMany({
    where: { actorId: actor.id, requestKey: input.requestKey }
  });
  assert.equal(found.length, 1);
  const row = found[0];
  assert.equal(row.sourceType, "METRICS_EXPORT");
  assert.equal(row.action, "metrics-export");
  assert.equal(row.result.from, input.from);
  assert.equal(row.result.through, input.through);
  assert.equal(
    "csv" in row.result,
    false,
    "The audit never stores a recoverable private CSV"
  );
  return row;
};
const updateGrant = async (grant, revoked, reauthenticate = true) => {
  await db.platformOperatorGrant.update({
    where: { id: grant.id },
    data: {
      revokedAt: revoked ? new Date() : grant.revokedAt,
      version: { increment: 1 }
    }
  });
  grantUpdates++;
  if (revoked) restoredGrants.set(grant.id, grant);
  else restoredGrants.delete(grant.id);
  // Grant generations invalidate prior assurance, including remaining duties.
  assert.equal(
    (await readPrivilegedAuthentication(db, actor.token)).confirmedForWork,
    false
  );
  if (
    reauthenticate && (cohortOwners.length === 1 ||
    (await db.platformOperatorGrant.count({
      where: {
        userId: actor.id,
        capability: "VIEW_PLATFORM_METRICS",
        revokedAt: null
      }
    })))
  )
    await confirmWork(actor);
};
const capturedWithin = async (captured) => {
  let timer;
  try {
    return await Promise.race([
      captured,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error("Held Metrics request did not arrive")),
          30000
        );
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
};
const hold = (matches) => {
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
      const response = await route.fetch({ maxRedirects: 0 });
      assert.equal(response.status(), 200, await response.text());
      capture({ response, request: route.request() });
      await gate;
      await route.fulfill({ response });
    })();
    deliveries.push(delivery);
    return delivery;
  });
  return {
    captured,
    async finish() {
      release();
      await Promise.all(deliveries);
    },
    remove() {
      release();
      releases.delete(release);
      remove();
    }
  };
};
const failedRead = async (matches) => {
  const remove = register(matches, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Fictional Metrics source unavailable" })
    })
  );
  try {
    await event("focus");
    await page
      .getByText(
        matches === identity
          ? "Your sign-in could not be checked. Reconnect and try again."
          : "Fictional Metrics source unavailable",
        { exact: true }
      )
      .waitFor();
    await inactive(matches === identity ? "failed identity" : "failed source");
  } finally {
    remove();
  }
  await button("Recheck current access").click();
  await valuesAre(draftDates);
};
const lateRead = async (matches) => {
  const held = hold(matches);
  try {
    await event("focus");
    await capturedWithin(held.captured);
    await inactive(matches === identity ? "held identity" : "held source");
    await event("pagehide");
    await held.finish();
    await settled();
    await inactive(
      matches === identity
        ? "late identity after pagehide"
        : "late source after pagehide"
    );
  } finally {
    held.remove();
  }
  await event("pageshow");
  await valuesAre(draftDates);
};
const blockedNavigation = async () => {
  await valuesAre(draftDates);
  assert.equal(await from.isDisabled(), true);
  assert.equal(await through.isDisabled(), true);
  assert.equal(await button("Apply dates").isDisabled(), true);
  const presets = page.getByRole("navigation", {
    name: "Report periods",
    exact: true
  });
  const links = presets.locator("a[href]");
  assert.equal(await links.count(), 4);
  for (const link of await links.all())
    assert.equal(await link.getAttribute("aria-disabled"), "true");
  const before = requests.filter((request) => request.document).length;
  const location = page.url();
  // Force only bypasses Playwright's aria-disabled wait, so the real click
  // reaches the application's disabled-navigation handler.
  await links.first().click({ force: true });
  await periodForm.evaluate((node) => node.requestSubmit());
  await settled();
  assert.equal(page.url(), location);
  assert.equal(requests.filter((request) => request.document).length, before);
  assert.equal(await page.evaluate(() => window.__metricsDocument), "original");
};
const fit = async (width, enlarged = false) => {
  const name = "draft-" + width + (enlarged ? "-font-200" : "");
  await page.setViewportSize({ width, height: 844 });
  const style = enlarged
    ? await page.addStyleTag({ content: "html{font-size:200%!important}" })
    : null;
  try {
    await page.evaluate(() => scrollTo(0, 0));
    for (const [part, locator] of [
      ["top", null],
      ["dates", periodForm],
      ["export", currentExport],
      ["population", page.locator("#metric-accounts")]
    ]) {
      if (locator) await locator.scrollIntoViewIfNeeded();
      const path = resolve(output, name + "-" + part + ".png");
      await page.screenshot({ path });
      captures.push(path);
    }
    const layout = await page.evaluate(() => ({
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflow: [...document.querySelectorAll("main *")]
        .map((node) => {
          const box = node.getBoundingClientRect();
          return {
            tag: node.tagName,
            name: node.getAttribute("name"),
            class: node.className,
            right: box.right + scrollX,
            width: box.width,
            text: node.textContent.slice(0, 100)
          };
        })
        .filter((row) => row.width && row.right > innerWidth + 1)
        .slice(0, 30),
      unclippedOverflow: [...document.querySelectorAll("body *")]
        .filter((node) => {
          const box = node.getBoundingClientRect();
          if (!box.width || box.right + scrollX <= innerWidth + 1) return false;
          for (
            let ancestor = node.parentElement;
            ancestor;
            ancestor = ancestor.parentElement
          ) {
            if (
              ["auto", "scroll", "hidden", "clip"].includes(
                getComputedStyle(ancestor).overflowX
              ) &&
              ancestor.getBoundingClientRect().right + scrollX <= innerWidth + 1
            )
              return false;
          }
          return true;
        })
        .map((node) => {
          const box = node.getBoundingClientRect();
          const css = getComputedStyle(node);
          return {
            tag: node.tagName,
            name: node.getAttribute("name"),
            class: node.className,
            left: box.left + scrollX,
            right: box.right + scrollX,
            width: box.width,
            minWidth: css.minWidth,
            overflowX: css.overflowX,
            whiteSpace: css.whiteSpace,
            text: node.textContent.slice(0, 120)
          };
        })
        .slice(0, 30)
    }));
    write(name + "-layout.json", layout);
    assert.ok(
      layout.scrollWidth <= layout.viewport + 1,
      "No horizontal page overflow: " + name
    );
  } finally {
    if (style) await style.evaluate((node) => node.remove());
  }
};
const downloadCurrent = async (label) => {
  const before = browserWrites.length;
  const pending = page.waitForEvent("download");
  await confirmWork(actor, "export-metrics");
  await currentExport.click();
  const download = await pending;
  const path = resolve(output, label + ".csv");
  await download.saveAs(path);
  await page
    .getByText(/^Current aggregate export downloaded\. Audit receipt: /)
    .waitFor();
  assert.equal(browserWrites.length, before + 1);
  const body = browserWrites.at(-1).body;
  const audit = await receipt(body);
  const csv = readFileSync(path, "utf8");
  assert.equal(
    createHash("sha256").update(csv).digest("hex"),
    audit.result.sha256
  );
  assert.ok(csv.includes("window.from," + reportDates.from));
  assert.ok(csv.includes("window.through," + reportDates.through));
  assert.ok(!csv.includes(actor.id) && !csv.includes(actor.email));
  assert.ok(!csv.includes(replacement.id) && !csv.includes(replacement.email));
  assert.equal(
    download.suggestedFilename(),
    `godschurches-aggregates-${reportDates.from}-${reportDates.through}.csv`
  );
  receipts.push({
    label,
    id: audit.id,
    key: audit.requestKey,
    sha256: audit.result.sha256
  });
  return audit;
};
const run = async () => {
  const configuration = await db.platformMetricConfiguration.findFirstOrThrow({
    orderBy: { version: "desc" }
  });
  actor = await createPortalActor(db, "metricread");
  cohortOwners.push(actor.id);
  replacement = await createPortalActor(db, "metricswap");
  await seedOperatorGrants(db, actor, [
    "VIEW_PLATFORM_METRICS",
    "EXPORT_PLATFORM_METRICS"
  ]);
  const grants = await db.platformOperatorGrant.findMany({
    where: { userId: actor.id }
  });
  let viewGrant = grants.find(
    (grant) => grant.capability === "VIEW_PLATFORM_METRICS"
  );
  let exportGrant = grants.find(
    (grant) => grant.capability === "EXPORT_PLATFORM_METRICS"
  );
  assert.ok(viewGrant && exportGrant);
  const today = metricDay(new Date(), configuration.zone);
  reportDates = {
    from: metricAddDays(today, -13),
    through: metricAddDays(today, -7)
  };
  draftDates = {
    from: metricAddDays(today, -6),
    through: metricAddDays(today, -2)
  };
  growthPath = "/platform/admin/growth?" + new URLSearchParams(reportDates);
  await confirmWork(actor, "export-metrics");
  await signIn(actor);
  const snapshot = await readApi();
  for (const rsc of [false, true]) {
    const response = await context.request.get(config.origin + growthPath, {
      maxRedirects: 0,
      ...(rsc ? { headers: { RSC: "1" } } : {})
    });
    assert.equal(response.status(), 200);
    if (rsc)
      assert.match(response.headers()["content-type"], /text\/x-component/);
    const text = await response.text();
    for (const marker of [
      snapshot.report.checkedAt,
      '"measuredAccounts":',
      '"current":{"registrations":',
      'name="from"',
      'name="through"',
      "Current eligible opted-in population:"
    ])
      assert.ok(
        !text.includes(marker),
        "Initial response omits private report and date presentation: " + marker
      );
  }
  const response = await page.goto(config.origin + growthPath);
  assert.equal(response.status(), 200);
  await valuesAre(reportDates);
  const population = page
    .locator("section")
    .filter({ has: page.locator("#metric-accounts") });
  const existing = population.locator("dl > div").filter({
    has: page.getByText("Current registered accounts", { exact: true })
  });
  assert.equal(
    (await existing.locator("dd").innerText()).trim(),
    String(snapshot.report.population.existing)
  );
  await from.fill(draftDates.from);
  await through.fill(draftDates.through);
  await page.evaluate(() => {
    window.__metricsDocument = "original";
  });
  assert.equal(browserWrites.length, 0);
  ok(
    "Authorized no-store Metrics API matches the hydrated population; initial HTML/RSC omit private report values and date fields. The suite leaves shared measurement configuration and other actors unchanged."
  );

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
    await inactive(trigger);
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
    if (trigger === "offline") {
      await button("Recheck this sign-in").waitFor();
      await button("Recheck this sign-in").click();
    }
    await valuesAre(draftDates);
  }
  await failedRead(identity);
  await failedRead(source);
  await lateRead(identity);
  await lateRead(source);
  await signIn(replacement);
  await event("focus");
  await page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .waitFor();
  await inactive("account replacement");
  await signIn(actor);
  await resume();
  await updateGrant(viewGrant, true);
  await readApi(404);
  await event("focus");
  await settled();
  await inactive("actual VIEW revocation");
  await updateGrant(viewGrant, false);
  await resume();
  assert.equal(browserWrites.length, 0);
  assert.equal(downloads.length, 0);
  for (const [width, enlarged] of [
    [390, false],
    [320, false],
    [320, true]
  ])
    await fit(width, enlarged);
  await page.setViewportSize({ width: 390, height: 844 });
  ok(
    "Blur, offline, pagehide, hidden state, failed/held identity and source reads, late responses, account replacement and real VIEW revocation remove report/filter/export DOM. Revalidated original ownership restores both unsent dates; 390px, 320px and 200% captures have no page overflow."
  );

  const firstAudit = await downloadCurrent("authorized-current-export");
  await effectCount(1);
  await valuesAre(draftDates);
  assert.equal(downloads.length, 1);
  ok(
    "An actual browser CSV uses the displayed report period rather than unsent date edits and matches its owner-scoped persisted audit hash. The audit retains no CSV."
  );

  for (const trigger of ["blur", "pagehide", "refresh"]) {
    const beforeDownloads = downloads.length,
      beforeWrites = browserWrites.length;
    const held = hold(command);
    try {
      await confirmWork(actor, "export-metrics");
      await currentExport.click();
      const captured = await capturedWithin(held.captured);
      await receipt(captured.request.postData());
      if (trigger === "refresh") {
        await event("focus");
        await valuesAre(draftDates);
      } else {
        await event(trigger);
        await inactive("export held then " + trigger);
      }
      await held.finish();
      await settled();
      assert.equal(
        downloads.length,
        beforeDownloads,
        "A late successful CSV must never download after " + trigger
      );
      if (trigger !== "refresh") {
        await inactive("late export after " + trigger);
        await event(trigger === "blur" ? "focus" : "pageshow");
        await valuesAre(draftDates);
      }
      await page
        .getByText(
          "Export recorded, but the page changed before download. Generate a new current export when ready.",
          { exact: true }
        )
        .waitFor();
      await currentExport.waitFor();
      assert.equal(await currentExport.isEnabled(), true);
      assert.equal(await retry.count(), 0);
      assert.equal(browserWrites.length, beforeWrites + 1);
      await event("focus");
      await valuesAre(draftDates);
      await settled();
      assert.equal(
        downloads.length,
        beforeDownloads,
        "Restoration must not replay the abandoned CSV"
      );
    } finally {
      held.remove();
    }
  }
  await effectCount(4);
  ok(
    "Real export responses held across blur, pagehide and an authorized source refresh each leave one audit, drop their CSV without downloading, and never replay it after restoration. Only a deliberate new export is offered."
  );

  // The first four independent groups are complete. Start a separate original
  // owner/document for the inseparable retry/revocation/discard chain below.
  // No old owner's retained private frame or request is adopted by this actor.
  assert.equal(restoredGrants.size, 0);
  assert.equal(await retry.count(), 0);
  actor = await createPortalActor(db, "metricretry");
  cohortOwners.push(actor.id);
  await seedOperatorGrants(db, actor, [
    "VIEW_PLATFORM_METRICS",
    "EXPORT_PLATFORM_METRICS"
  ]);
  const retryGrants = await db.platformOperatorGrant.findMany({
    where: { userId: actor.id }
  });
  viewGrant = retryGrants.find((g) => g.capability === "VIEW_PLATFORM_METRICS");
  exportGrant = retryGrants.find(
    (g) => g.capability === "EXPORT_PLATFORM_METRICS"
  );
  assert.ok(viewGrant && exportGrant);
  await confirmWork(actor, "export-metrics");
  await signIn(actor);
  await page.goto(config.origin + growthPath);
  await valuesAre(reportDates);
  await from.fill(draftDates.from);
  await through.fill(draftDates.through);
  await page.evaluate(() => {
    window.__metricsDocument = "original";
  });

  const attempts = [],
    statuses = [],
    denialHolds = new Map();
  for (const code of [401, 403, 404]) {
    let release, capture;
    const gate = new Promise((done) => {
      release = done;
    });
    const captured = new Promise((done) => {
      capture = done;
    });
    releases.add(release);
    denialHolds.set(code, { gate, release, capture, captured });
  }
  const removeRetry = register(command, async (route) => {
    const request = route.request();
    attempts.push({
      body: request.postData(),
      owner: request.headers()["x-expected-account"]
    });
    if (attempts.length === 1) {
      const response = await route.fetch({ maxRedirects: 0 });
      assert.equal(response.status(), 200);
      statuses.push(200);
      return route.abort("failed");
    }
    const injected = [401, 403, 404, 429, 503][attempts.length - 2];
    if (injected) {
      statuses.push(injected);
      const held = denialHolds.get(injected);
      if (held) {
        held.capture();
        await held.gate;
      }
      return route.fulfill({
        status: injected,
        contentType: "application/json",
        headers: injected === 429 ? { "retry-after": "1" } : {},
        body: JSON.stringify({
          message: "Fictional export response " + injected
        })
      });
    }
    const response = await route.fetch({ maxRedirects: 0 });
    statuses.push(response.status());
    assert.equal(response.status(), 409);
    return route.fulfill({ response });
  });
  let originalAudit;
  try {
    await confirmWork(actor, "export-metrics");
    await currentExport.click();
    await retry.waitFor();
    originalAudit = await receipt(attempts[0].body);
    await effectCount(5);
    await blockedNavigation();
    assert.equal(JSON.parse(attempts[0].body).from, reportDates.from);
    assert.equal(JSON.parse(attempts[0].body).through, reportDates.through);
    await updateGrant(exportGrant, true);
    await event("focus");
    await valuesAre(draftDates);
    const withoutExport = await readApi();
    assert.ok(
      withoutExport.navigation.capabilities.includes("VIEW_PLATFORM_METRICS")
    );
    assert.ok(
      !withoutExport.navigation.capabilities.includes("EXPORT_PLATFORM_METRICS")
    );
    await page
      .getByText("An unconfirmed export is retained in this browser.", {
        exact: true
      })
      .waitFor();
    assert.equal(await currentExport.count(), 0);
    assert.equal(await retry.count(), 0);
    await blockedNavigation();
    dialogAccept = false;
    await discard.click();
    assert.match(dialogs.at(-1).message, /may already be recorded/);
    await discard.waitFor();
    dialogAccept = true;
    await updateGrant(exportGrant, false);
    await resume();
    await retry.waitFor();
    await updateGrant(viewGrant, true);
    await event("focus");
    await settled();
    await inactive("pending export VIEW revocation");
    await updateGrant(viewGrant, false);
    await resume();
    await retry.waitFor();
    const beforeSwap = browserWrites.length;
    // Keep presentation visible until the real command transport checks identity.
    await signIn(replacement);
    await retry.click();
    await page
      .getByText("Your sign-in changed. Reload before continuing.", {
        exact: true
      })
      .waitFor();
    await inactive("retry owner mismatch");
    assert.equal(
      browserWrites.length,
      beforeSwap,
      "A replaced account sends no export POST"
    );
    await signIn(actor);
    await resume();
    await retry.waitFor();
    for (const status of [401, 403, 404]) {
      const held = denialHolds.get(status);
      await retry.click();
      await capturedWithin(held.captured);
      if (status === 403) await updateGrant(exportGrant, true);
      const trigger = status === 403 ? "blur" : "pagehide";
      await event(trigger);
      await inactive("held export denial " + status);
      const sourceReads = () =>
        requests.filter(
          (request) =>
            request.method === "GET" &&
            source(new URL(request.path, config.origin))
        ).length;
      const beforeReads = sourceReads();
      held.release();
      await settled();
      await inactive("late export denial " + status);
      assert.equal(
        sourceReads(),
        beforeReads,
        "A late denial must not resume the source or reveal a concealed report"
      );
      await event(trigger === "blur" ? "focus" : "pageshow");
      await valuesAre(draftDates);
      if (status === 403) {
        assert.equal(await retry.count(), 0);
        await discard.waitFor();
        assert.equal(await currentExport.count(), 0);
        await updateGrant(exportGrant, false);
        await resume();
      }
      await retry.waitFor();
      assert.equal(statuses.at(-1), status);
      assert.deepEqual(await receipt(attempts[0].body), originalAudit);
    }
    for (const status of [429, 503]) {
      await retry.click();
      await page
        .getByText("Fictional export response " + status, { exact: true })
        .waitFor();
      await retry.waitFor();
      await page.waitForFunction(() =>
        [...document.querySelectorAll("button")].some(
          (node) =>
            node.textContent === "Retry original export" && !node.disabled
        )
      );
      await blockedNavigation();
      assert.equal(statuses.at(-1), status);
    }
    await retry.click();
    await page
      .getByText(
        "This export was already recorded. Generate a new current export to receive a new audit receipt.",
        { exact: true }
      )
      .waitFor();
    await currentExport.waitFor();
    assert.equal(await currentExport.isEnabled(), true);
    assert.equal(await retry.count(), 0);
    assert.equal(await discard.count(), 0);
    assert.equal(await from.isEnabled(), true);
    assert.equal(downloads.length, 1);
    assert.equal(attempts.length, 7);
    assert.deepEqual(statuses, [200, 401, 403, 404, 429, 503, 409]);
    assert.ok(
      attempts.every(
        (attempt) =>
          attempt.body === attempts[0].body && attempt.owner === actor.id
      )
    );
    assert.deepEqual(await receipt(attempts[0].body), originalAudit);
    await effectCount(5);
  } finally {
    for (const held of denialHolds.values()) {
      held.release();
      releases.delete(held.release);
    }
    removeRetry();
  }
  write("original-export-recovery.json", {
    attempts,
    statuses,
    audit: originalAudit
  });
  ok(
    "A real recorded export with a lost acknowledgment survives actual VIEW/EXPORT revocation and restoration, account replacement, held 401/403/404, 429 and 503. Late denials never reread or reveal a concealed report; explicit resume and authority restoration retain the command. Seven identical body/key/account attempts leave one audit; real duplicate 409 ends recovery without any download. Pending work blocks preset and native date navigation and offers warned discard even without export authority."
  );

  const nextAudit = await downloadCurrent("deliberate-new-current-export");
  assert.notEqual(nextAudit.requestKey, originalAudit.requestKey);
  assert.notEqual(nextAudit.requestKey, firstAudit.requestKey);
  await effectCount(6);
  assert.equal(downloads.length, 2);
  let discardBody;
  const removeDiscard = register(command, async (route) => {
    discardBody = route.request().postData();
    const response = await route.fetch({ maxRedirects: 0 });
    assert.equal(response.status(), 200);
    return route.abort("failed");
  });
  try {
    await confirmWork(actor, "export-metrics");
    await currentExport.click();
    await retry.waitFor();
  } finally {
    removeDiscard();
  }
  const discardedAudit = await receipt(discardBody);
  await effectCount(7);
  await updateGrant(exportGrant, true);
  await resume();
  await discard.waitFor();
  assert.equal(await retry.count(), 0);
  dialogAccept = false;
  const beforeDialogs = dialogs.length;
  await discard.click();
  await discard.waitFor();
  assert.equal(dialogs.length, beforeDialogs + 1);
  assert.match(dialogs.at(-1).message, /Discard only this browser/);
  await blockedNavigation();
  dialogAccept = true;
  await discard.click();
  await page
    .getByRole("status")
    .filter({
      hasText: "Local export retry discarded. Saved audit records remain."
    })
    .waitFor();
  assert.equal(await discard.count(), 0);
  assert.equal(await retry.count(), 0);
  assert.equal(await currentExport.count(), 0);
  assert.equal(await from.isEnabled(), true);
  assert.deepEqual(await receipt(discardBody), discardedAudit);
  await updateGrant(exportGrant, false);
  await resume();
  await currentExport.waitFor();
  await valuesAre(draftDates);
  assert.equal(browserWrites.length, 13);
  assert.equal(downloads.length, 2);
  await effectCount(7);
  ok(
    "After duplicate 409, a deliberate fresh export uses a new key, produces one new audit and downloads a matching current CSV. A separate lost acknowledgment remains cancelable without export authority: canceled discard preserves recovery, confirmed discard removes only local uncertainty, retains the saved audit and unlocks date navigation."
  );

  await button("Apply dates").click();
  await page.waitForURL(
    (url) =>
      url.pathname === "/platform/admin/growth" &&
      url.searchParams.get("from") === draftDates.from &&
      url.searchParams.get("through") === draftDates.through
  );
  await valuesAre(draftDates);
  assert.equal(
    await page.evaluate(() => window.__metricsDocument),
    undefined,
    "Applying dates creates a fresh document after pending work ends"
  );
  assert.equal(browserWrites.length, 13);
  assert.ok(
    browserWrites.every(
      (write) =>
        write.method === "POST" &&
        write.path === "/api/platform/admin" &&
        cohortOwners.includes(write.owner) &&
        write.owner === write.expectedOwner &&
        JSON.parse(write.body).operation === "metrics-export"
    )
  );
  assert.equal(new Set((await rows()).map((row) => row.requestKey)).size, 7);
  assert.deepEqual(
    await Promise.all(
      cohortOwners.map((id) =>
        db.adminOperation.count({
          where: { actorId: id, sourceType: "METRICS_EXPORT" }
        })
      )
    ),
    [4, 3]
  );
  assert.equal(mfaCommands.size, 2);
  assert.ok([...mfaCommands.values()].every((n) => n <= 10));
  assert.deepEqual(errors, []);
  assert.deepEqual(routeErrors, []);
  assert.deepEqual(externalRequests, []);
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  ok(
    "Once uncertainty ends, applying the retained date draft performs a fresh document read with no export mutation. All effects stay scoped to the fictional export owner, with no runtime errors or external requests."
  );
  write("result.json", {
    results,
    errors,
    routeErrors,
    externalRequests,
    requests,
    browserWrites,
    receipts,
    observations,
    dialogs,
    captures,
    downloads: downloads.map((download) => ({
      filename: download.suggestedFilename()
    })),
    node: { version: process.version, execPath: process.execPath },
    fixtureOnly: true,
    browserMutationAttempts: browserWrites.length,
    fixtureEffects: {
      createdActors: 3,
      seededOperatorGrants: 4,
      independentOwnerCohorts: 2,
      metricExportOperations: 7,
      grantRevokeRestoreUpdates: grantUpdates,
      sharedMetricConfigurationWrites: 0,
      otherActorMetricFlagWrites: 0,
      localVerificationMessages: 3
    },
    authenticatorCommandsByCohort: cohortOwners.map(
      (id) => mfaCommands.get(id) ?? 0
    ),
    productionWrites: 0,
    recipientSends: 0,
    limitations: [
      "Lifecycle events are synthetic browser events, not physical-device or operating-system snapshot verification.",
      "Held/lost responses and 401/403/404/429/503 are explicit response simulations. Actual owner checks, grant revocation, exports, duplicate 409 and audit hashes use the isolated server and database.",
      "Aggregate correctness beyond displayed current population, selected report period and downloaded audit hash remains covered by existing Metrics service/browser suites.",
      "Actors use existing test-sink signup helpers, including their existing isolated authentication-rate fixture reset. No shared metric configuration or unrelated measurement choices are changed.",
      "Two independent fictional owner cohorts use canonical authenticator commands with the current enforced policy; each retry/revocation chain keeps its original actor. This is isolated browser evidence, not provider or release acceptance."
    ]
  });
  console.log("ADMIN_METRICS_PRIVACY_BROWSER_PASS " + results.length);
};
try {
  await Promise.race([run(), routingFailure]);
} catch (error) {
  await page
    .screenshot({ path: resolve(output, "failure.png"), fullPage: true })
    .catch(() => {});
  write("failure.json", {
    results,
    errors,
    routeErrors,
    externalRequests,
    requests,
    browserWrites,
    observations,
    dialogs,
    captures,
    message: String(error),
    stack: error.stack,
    url: page.url(),
    fixtureOnly: true,
    node: { version: process.version, execPath: process.execPath }
  });
  throw error;
} finally {
  for (const release of releases) release();
  try {
    await browser.close();
  } finally {
    try {
      for (const grant of restoredGrants.values())
        await updateGrant(grant, false, false);
    } finally {
      await db.$disconnect();
    }
  }
}
