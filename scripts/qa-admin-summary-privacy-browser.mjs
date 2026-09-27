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
const { seedSupport, requestInput } = await load("tests/seed-support.ts");
const { supportCommand } = await load("lib/platform/support.ts");
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
const output = resolve(
  fixtureDir,
  "admin-summary-privacy-browser-" + Date.now()
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
  restoredGrants = new Map(),
  snapshots = {};
let rejectRouting, fixture, healthReader;
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
    browserWrites.push({ method: request.method(), path: url.pathname });
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
const title = (view) =>
  view === "health" ? "Operational health" : "Admin overview";
const path = (view) =>
  view === "health" ? "/platform/admin/health" : "/platform/admin";
const panel = (view) =>
  page
    .locator('section[aria-label="Admin workspace"] h1')
    .filter({ hasText: title(view) })
    .locator("..");
const identity = (url) =>
  url.pathname === "/api/platform/profile" &&
  url.searchParams.get("view") === "identity";
const source = (view) => (url) =>
  url.pathname === "/api/platform/admin" &&
  url.searchParams.get("view") === view;
const privateMarkers = new Map();
const signIn = async (actor) => {
  await context.clearCookies();
  await context.addCookies([
    {
      name: sessionCookieFixtureName(config.origin),
      value: actor.token,
      url: config.origin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
};
const api = async (view, actor, expectedStatus = 200) => {
  const response = await context.request.get(
    config.origin + "/api/platform/admin?view=" + view,
    { headers: { "X-Expected-Account": actor.id } }
  );
  assert.equal(response.status(), expectedStatus, await response.text());
  assert.match(response.headers()["cache-control"], /no-store/);
  const result = await response.json();
  if (expectedStatus === 200)
    assert.equal(result.navigation.viewer.id, actor.id);
  return result;
};
const captureMarkers = async (view) =>
  privateMarkers.set(
    view,
    await panel(view).evaluate((node) =>
      [
        ...node.querySelectorAll(
          'dl, [aria-label="Current alerts"], [aria-label="Permitted growth summary"], a[href*="requests?"]'
        ),
        node.querySelector("p")
      ]
        .filter(Boolean)
        .map((element) => element.textContent.trim())
        .filter((text) => text.length > 12)
    )
  );
const ready = async (view, growth = true) => {
  await page.getByRole("heading", { name: title(view), exact: true }).waitFor();
  if (view === "health") {
    await panel(view)
      .getByRole("heading", { name: "Current queue counts", exact: true })
      .waitFor();
    assert.equal(await panel(view).locator("dl").count(), 2);
    assert.match(
      await panel(view).locator("p").first().innerText(),
      /^Checked /
    );
  } else {
    await panel(view)
      .getByRole("heading", {
        name: "Current work needing attention",
        exact: true
      })
      .waitFor();
    const summary = panel(view).locator(
      '[aria-label="Permitted growth summary"]'
    );
    if (growth) await summary.waitFor();
    else await summary.waitFor({ state: "detached" });
    const open = panel(view)
      .locator('a[href="/platform/admin/requests"]')
      .filter({ hasText: "Open requests" });
    assert.equal(await open.locator("span").first().innerText(), "1");
  }
  await captureMarkers(view);
};
const absent = (view) =>
  page.waitForFunction(
    ({ heading, values }) => {
      const main = document.querySelector("main");
      return (
        ![...main.querySelectorAll("h1")].some(
          (node) => node.textContent === heading
        ) &&
        !main.querySelector(
          'dl, [aria-label="Current alerts"], [aria-label="Permitted growth summary"]'
        ) &&
        values.every((value) => !main.textContent.includes(value)) &&
        !main.textContent.includes(
          "Current health could not be loaded. This is an unavailable result, not a healthy empty queue."
        )
      );
    },
    { heading: title(view), values: privateMarkers.get(view) ?? [] }
  );
const serialization = async (view) => {
  for (const rsc of [false, true]) {
    const response = await context.request.get(
      config.origin + path(view),
      rsc ? { headers: { RSC: "1" } } : {}
    );
    assert.equal(response.status(), 200);
    if (rsc)
      assert.match(response.headers()["content-type"], /text\/x-component/);
    const html = await response.text();
    const values =
      view === "health"
        ? ["Current queue counts", snapshots.health.health.checkedAt]
        : [
            "Current work needing attention",
            "Current registered accounts:",
            snapshots.overview.checkedAt
          ];
    for (const value of values)
      assert.ok(
        !html.includes(value),
        "Private " + view + " summary absent from initial HTML/RSC"
      );
  }
};
const capturedWithin = async (captured) => {
  let timer;
  try {
    await Promise.race([
      captured,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error("Held summary read did not arrive")),
          30000
        );
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
};
const failedRead = async (view, matches) => {
  const remove = register(matches, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Fictional summary read outage" })
    })
  );
  try {
    await event("focus");
    await page
      .getByText(
        matches === identity
          ? "Your sign-in could not be checked. Reconnect and try again."
          : "Fictional summary read outage",
        { exact: true }
      )
      .waitFor();
    await absent(view);
  } finally {
    remove();
  }
  await button("Recheck current access").click();
  await ready(view);
};
const lateRead = async (view, matches) => {
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
    await absent(view);
    await event("pagehide");
    release();
    await Promise.all(deliveries);
    await page.waitForLoadState("networkidle");
    await absent(view);
  } finally {
    release();
    releases.delete(release);
    remove();
  }
  await event("pageshow");
  await ready(view);
};
const fit = async (view, width, enlarged = false) => {
  const name = view + "-" + width + (enlarged ? "-font-200" : "");
  await page.setViewportSize({ width, height: 844 });
  const style = enlarged
    ? await page.addStyleTag({ content: "html{font-size:200%!important}" })
    : null;
  try {
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: resolve(output, name + "-top.png") });
    const sections =
      view === "health"
        ? [panel(view).locator("dl").first(), panel(view).locator("dl").nth(1)]
        : [
            panel(view).locator("ul").first(),
            panel(view).locator('[aria-label="Permitted growth summary"]')
          ];
    for (let index = 0; index < sections.length; index++) {
      await sections[index].scrollIntoViewIfNeeded();
      await page.screenshot({
        path: resolve(output, name + "-summary-" + index + ".png")
      });
    }
    if (!enlarged)
      await page.screenshot({
        path: resolve(output, name + ".png"),
        fullPage: true
      });
    const layout = await page.evaluate(() => ({
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      elements: [...document.querySelectorAll("main *")]
        .map((node) => {
          const r = node.getBoundingClientRect();
          return {
            tag: node.tagName,
            class: node.className,
            right: r.right + scrollX,
            width: r.width,
            text: node.textContent.slice(0, 100)
          };
        })
        .filter((row) => row.width && row.right > innerWidth + 1)
        .slice(0, 30)
    }));
    write(name + "-layout.json", layout);
    assert.ok(
      layout.scrollWidth <= layout.viewport + 1,
      "No horizontal overflow: " + name
    );
  } finally {
    if (style) await style.evaluate((node) => node.remove());
  }
};
const open = async (view, actor) => {
  await signIn(actor);
  const response = await page.goto(config.origin + path(view));
  assert.equal(response.status(), 200);
  await ready(view);
  await page.waitForLoadState("networkidle");
  await page.evaluate((view) => {
    window.__summaryDocument = view;
  }, view);
};
const exercise = async (view, actor) => {
  await open(view, actor);
  await serialization(view);
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
    await absent(view);
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
    await ready(view);
    assert.equal(await page.evaluate(() => window.__summaryDocument), view);
  }
  await failedRead(view, identity);
  await failedRead(view, source(view));
  await lateRead(view, identity);
  await lateRead(view, source(view));
  await signIn(fixture.memberB);
  await event("focus");
  await page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .waitFor();
  await absent(view);
  await api(view, fixture.memberB, 404);
  await signIn(actor);
  await event("focus");
  await ready(view);
  assert.equal(await page.evaluate(() => window.__summaryDocument), view);
  for (const [width, enlarged] of [
    [390, false],
    [320, false],
    [320, true]
  ])
    await fit(view, width, enlarged);
  await page.setViewportSize({ width: 390, height: 844 });
  ok(
    view +
      " HTML/RSC omit private summaries; lifecycle concealment, failed/held identity and source reads, and account replacement physically remove presentation; the original account restores the same document and 390/320/200% captures fit."
  );
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
const run = async () => {
  fixture = await seedSupport(db);
  healthReader = await createPortalActor(db, "summaryhealth");
  await seedOperatorGrants(db, healthReader, ["VIEW_OPERATIONAL_HEALTH"]);
  await seedOperatorGrants(db, fixture.owner, ["VIEW_PLATFORM_METRICS"]);
  const grants = await db.platformOperatorGrant.findMany({
    where: { userId: { in: [healthReader.id, fixture.owner.id] } }
  });
  const healthGrant = grants.find(
    (grant) =>
      grant.userId === healthReader.id &&
      grant.capability === "VIEW_OPERATIONAL_HEALTH"
  );
  const metricsGrant = grants.find(
    (grant) =>
      grant.userId === fixture.owner.id &&
      grant.capability === "VIEW_PLATFORM_METRICS"
  );
  assert.ok(healthGrant && metricsGrant);
  await signIn(fixture.owner);
  const before = await api("overview", fixture.owner);
  assert.equal(before.requests.open, 0);
  const created = await supportCommand(
    db,
    fixture.memberA.token,
    await requestInput(db, fixture.memberA.token, {
      subject: "Fictional summary request " + randomUUID()
    })
  );
  snapshots.overview = await api("overview", fixture.owner);
  assert.equal(snapshots.overview.requests.open, 1);
  assert.equal(snapshots.overview.requests.open, before.requests.open + 1);
  assert.ok(snapshots.overview.growth.existing > 0);
  assert.equal(
    snapshots.overview.navigation.sections.some(
      (section) => section.key === "health"
    ),
    false
  );
  await signIn(healthReader);
  snapshots.health = await api("health", healthReader);
  assert.equal(snapshots.health.available, true);
  assert.ok(snapshots.health.health.checkedAt);
  assert.equal(
    snapshots.health.navigation.sections.some(
      (section) => section.key === "requests" || section.key === "growth"
    ),
    false
  );
  await api("health", fixture.owner, 401);
  // Explicit cross-account expected-owner headers above must deny even though
  // this browser still holds the health reader's cookie.
  await signIn(fixture.owner);
  await api("health", fixture.owner, 404);
  ok(
    "Separate authorized roles read actual no-store health and overview sources; one real isolated Support request advances its owner's open count from zero to one while cross-account and absent-capability health reads deny."
  );

  await exercise("health", healthReader);
  await revoke(healthGrant);
  await event("focus");
  await button("Recheck current access").waitFor();
  await page.waitForLoadState("networkidle");
  await absent("health");
  await api("health", healthReader, 404);
  await restore(healthGrant);
  await button("Recheck current access").click();
  await ready("health");
  assert.equal(await page.evaluate(() => window.__summaryDocument), "health");
  ok(
    "Revoking the health reader's sole capability removes retained summaries and denies the actual API; restoring that same fixture grant reopens the original document."
  );

  const simulations = [];
  for (const mode of ["unavailable", "healthy-empty"]) {
    const remove = register(source("health"), async (route) => {
      const response = await route.fetch();
      assert.equal(response.status(), 200, await response.text());
      const actual = await response.json();
      assert.equal(actual.navigation.viewer.id, healthReader.id);
      const payload =
        mode === "unavailable"
          ? {
              ...actual,
              available: false,
              emailDelivery: "unavailable",
              health: null
            }
          : {
              ...actual,
              health: {
                ...actual.health,
                needsAttention: false,
                alerts: [],
                queues: Object.fromEntries(
                  Object.entries(actual.health.queues).map(([key, value]) => [
                    key,
                    typeof value === "number"
                      ? 0
                      : Object.fromEntries(
                          Object.entries(value).map(([name, item]) => [
                            name,
                            typeof item === "number" ? 0 : null
                          ])
                        )
                  ])
                )
              }
            };
      simulations.push({ mode, authorizedUnderlyingStatus: response.status() });
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, no-store"
        },
        body: JSON.stringify(payload)
      });
    });
    try {
      await event("focus");
      if (mode === "unavailable") {
        await page
          .getByText(
            "Current health could not be loaded. This is an unavailable result, not a healthy empty queue.",
            { exact: true }
          )
          .waitFor();
        assert.equal(await panel("health").locator("dl").count(), 0);
        assert.equal(
          await page
            .getByText("No current queue threshold is exceeded.", {
              exact: true
            })
            .count(),
          0
        );
      } else {
        await ready("health");
        await page
          .getByText(/No current queue threshold is exceeded\./)
          .waitFor();
        assert.equal(
          await panel("health")
            .locator('[aria-label="Current alerts"]')
            .count(),
          0
        );
        const values = await panel("health")
          .locator("dl")
          .nth(1)
          .locator("dd")
          .allTextContents();
        assert.ok(
          values.length > 0 &&
            values.every(
              (value) =>
                (value.match(/\d+/g) ?? []).length > 0 &&
                value.match(/\d+/g).every((number) => Number(number) === 0)
            )
        );
      }
      await captureMarkers("health");
      await event("pagehide");
      await absent("health");
    } finally {
      remove();
    }
    await event("pageshow");
    await ready("health");
  }
  ok(
    "Explicit response simulations, after real authorized reads, keep unavailable health distinct from a healthy empty queue; both presentations leave DOM on pagehide. The database and real worker configuration are unchanged."
  );

  await exercise("overview", fixture.owner);
  const growthText = await panel("overview")
    .locator('[aria-label="Permitted growth summary"]')
    .textContent();
  assert.ok(growthText);
  await revoke(metricsGrant);
  await event("focus");
  await ready("overview", false);
  const limited = await api("overview", fixture.owner);
  assert.equal(limited.growth, null);
  assert.equal(limited.requests.open, 1);
  assert.ok(
    limited.navigation.sections.some((section) => section.key === "requests")
  );
  assert.equal(
    limited.navigation.sections.some((section) => section.key === "growth"),
    false
  );
  assert.equal(
    await page.locator('a[href="/platform/admin/growth"]').count(),
    0
  );
  assert.ok(!(await page.locator("main").textContent()).includes(growthText));
  await panel("overview")
    .getByRole("link", { name: "Requests", exact: true })
    .waitFor();
  await event("pagehide");
  await absent("overview");
  await event("pageshow");
  await ready("overview", false);
  await restore(metricsGrant);
  await button("Refresh current view").click();
  await ready("overview");
  assert.equal(await page.evaluate(() => window.__summaryDocument), "overview");
  assert.equal((await api("overview", fixture.owner)).requests.open, 1);
  ok(
    "Partial metrics revocation removes growth data and its permitted destination while preserving the currently authorized request count/section; concealment and same-grant restoration preserve the original overview document."
  );

  assert.equal(
    await db.supportCase.count({ where: { requesterId: fixture.memberA.id } }),
    1
  );
  assert.equal(
    (await db.supportCase.findUniqueOrThrow({ where: { id: created.caseId } }))
      .version,
    created.version
  );
  for (const grant of [healthGrant, metricsGrant])
    assert.equal(
      (
        await db.platformOperatorGrant.findUniqueOrThrow({
          where: { id: grant.id }
        })
      ).version,
      grant.version + 2
    );
  assert.deepEqual(browserWrites, []);
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(routeErrors, []);
  assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  write("result.json", {
    results,
    errors,
    routeErrors,
    externalRequests,
    browserWrites,
    requests,
    snapshots,
    simulations,
    fixtureOnly: true,
    fixtureEffects: { supportCases: 1, grantRevokeRestoreUpdates: 4 },
    productionWrites: 0,
    recipientSends: 0,
    limitations: [
      "Unavailable and healthy-empty health payloads are labeled response simulations, not induced database/worker outages.",
      "Synthetic lifecycle events do not establish physical-device or operating-system snapshot behavior.",
      "Existing Admin browser and original-retry suites retain responsibility for stateful mutation recovery; these summaries make no browser mutations."
    ]
  });
  console.log("ADMIN_SUMMARY_PRIVACY_BROWSER_PASS " + results.length);
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
    browserWrites,
    requests,
    message: String(error),
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
      await db.$disconnect();
    }
  }
}
