import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

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
  PUSH_ENABLED: "false"
});
// Use the inspected runtime's modules even when this script lives elsewhere.
const require = createRequire(resolve("package.json"));
const load = (name) => import(pathToFileURL(resolve(name)));
const { PrismaClient } = require("@prisma/client");
const { assertPortalTestDatabase, createPortalActor, seedOperatorGrants } =
  await load("tests/seed-portal.ts");
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
const output = resolve(fixtureDir, "admin-audit-privacy-browser-" + Date.now());
mkdirSync(output, { recursive: true, mode: 0o700 });
const results = [],
  errors = [],
  routeErrors = [],
  externalRequests = [],
  browserWrites = [],
  requests = [];
const rules = [],
  releases = new Set(),
  markers = [];
let rejectRouting,
  reader,
  author,
  replacement,
  grant,
  grantRevoked = false;
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
const identity = (url) =>
  url.pathname === "/api/platform/profile" &&
  url.searchParams.get("view") === "identity";
const audit = (url) =>
  url.pathname === "/api/platform/admin" &&
  url.searchParams.get("view") === "audit";
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
const ready = async (rows) => {
  await page
    .getByRole("heading", { name: "Access and lookup audit", exact: true })
    .waitFor();
  await page.waitForFunction(
    (expected) => {
      const actual = [...document.querySelectorAll("main ol li")].map(
        (row) => row.textContent
      );
      return (
        actual.length === expected.length &&
        expected.every((reason, index) => actual[index].includes(reason))
      );
    },
    rows.map((row) => row.result.reason)
  );
  if (!rows.length)
    await page
      .getByText("No audit records on this page.", { exact: true })
      .waitFor();
};
const absent = () =>
  page.waitForFunction((values) => {
    const html = document.documentElement.outerHTML;
    return (
      values.every((value) => !html.includes(value)) &&
      !document.querySelector("main ol li") &&
      !document.querySelector('main a[href^="/platform/admin/audit?after="]') &&
      ![...document.querySelectorAll("main p")].some(
        (node) => node.textContent === "No audit records on this page."
      )
    );
  }, markers);
const go = async (path, rows) => {
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
  await ready(rows);
  await page.waitForLoadState("networkidle");
};
const api = async (after) => {
  const response = await context.request.get(
    config.origin +
      "/api/platform/admin?" +
      new URLSearchParams({ view: "audit", after }),
    { headers: { "X-Expected-Account": reader.id } }
  );
  assert.equal(response.status(), 200, await response.text());
  assert.match(response.headers()["cache-control"], /no-store/);
  return response.json();
};
const serialization = async (path) => {
  for (const rsc of [false, true]) {
    const response = await context.request.get(
      config.origin + path,
      rsc ? { headers: { RSC: "1" } } : {}
    );
    assert.equal(response.status(), 200);
    if (rsc)
      assert.match(response.headers()["content-type"], /text\/x-component/);
    const html = await response.text();
    for (const marker of markers)
      assert.ok(
        !html.includes(marker),
        "Private audit rows absent from initial HTML/RSC"
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
          () => reject(Error("Held read did not arrive")),
          30000
        );
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
};
const failedRead = async (matches, rows) => {
  const remove = register(matches, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Fictional audit read outage" })
    })
  );
  try {
    await event("focus");
    await page
      .getByText(
        matches === identity
          ? "Your sign-in could not be checked. Reconnect and try again."
          : "Fictional audit read outage",
        { exact: true }
      )
      .waitFor();
    await absent();
  } finally {
    remove();
  }
  await button("Recheck current access").click();
  await ready(rows);
};
const lateRead = async (matches, rows) => {
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
    await absent();
    await event("pagehide");
    release();
    await Promise.all(deliveries);
    await page.waitForLoadState("networkidle");
    await absent();
  } finally {
    release();
    releases.delete(release);
    remove();
  }
  await event("pageshow");
  await ready(rows);
};
const screenshot = async (name, width, enlarged = false) => {
  await page.setViewportSize({ width, height: 844 });
  const style = enlarged
    ? await page.addStyleTag({ content: "html{font-size:200%!important}" })
    : null;
  try {
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: resolve(output, name + "-top.png") });
    await page.locator("main ol li").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(output, name + "-row.png") });
    await page
      .getByRole("link", { name: "Older audit records", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(output, name + "-pagination.png") });
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
            text: node.textContent.slice(0, 120)
          };
        })
        .filter((r) => r.width && r.right > innerWidth + 1)
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
const run = async () => {
  reader = await createPortalActor(db, "auditreader");
  author = await createPortalActor(db, "auditauthor");
  replacement = await createPortalActor(db, "auditswap");
  await seedOperatorGrants(db, reader, ["VIEW_ADMIN_AUDIT"]);
  grant = await db.platformOperatorGrant.findUniqueOrThrow({
    where: {
      userId_capability: { userId: reader.id, capability: "VIEW_ADMIN_AUDIT" }
    }
  });
  const minimum = await db.adminOperation.findFirst({
    orderBy: { id: "asc" },
    select: { id: true }
  });
  const nonce = randomUUID().replaceAll("-", "");
  const prefix =
    "0".repeat((minimum?.id.match(/^0*/)?.[0].length ?? 0) + 1) +
    "qa" +
    nonce +
    "_";
  const upper = prefix + "99",
    lower = prefix + "00";
  assert.ok(upper.length <= 100);
  assert.ok(
    !minimum || upper < minimum.id,
    "The isolated audit range must precede every existing row; never change unrelated rows"
  );
  const rows = Array.from({ length: 26 }, (_, index) => ({
    id: prefix + String(index + 1).padStart(2, "0"),
    actorId: author.id,
    requestKey: randomUUID(),
    fingerprint: createHash("sha256")
      .update(nonce + index)
      .digest("hex"),
    action: "fixture-audit",
    sourceType: "ACCESS",
    sourceId: reader.id,
    version: index + 1,
    result: {
      reason:
        "Fictional private audit reason " + nonce + " number " + (index + 1)
    }
  })).reverse();
  markers.push(
    author.name,
    author.username,
    ...rows.map((row) => row.result.reason)
  );
  await db.adminOperation.createMany({ data: rows });
  const firstRows = rows.slice(0, 25),
    lastRows = rows.slice(25);
  const path = "/platform/admin/audit?" + new URLSearchParams({ after: upper });
  const emptyPath =
    "/platform/admin/audit?" + new URLSearchParams({ after: lower });
  await signIn(reader);
  const first = await api(upper);
  assert.equal(first.navigation.viewer.id, reader.id);
  assert.deepEqual(
    first.rows.map((row) => row.id),
    firstRows.map((row) => row.id)
  );
  assert.equal(first.next, firstRows.at(-1).id);
  assert.equal(first.rows[0].actor.name, author.name);
  assert.equal(first.rows[0].reason, firstRows[0].result.reason);
  const nextPath =
    "/platform/admin/audit?" + new URLSearchParams({ after: first.next });
  await serialization(path);
  await go(path, firstRows);
  await page.evaluate(() => {
    window.__auditDocument = "original audit";
  });
  ok(
    "Initial HTML/RSC omit the separate audit actor and private reasons; the real account-bound no-store API and hydrated first page disclose exactly 25 scoped records."
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
    await absent();
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
    await ready(firstRows);
    assert.equal(
      await page.evaluate(() => window.__auditDocument),
      "original audit"
    );
  }
  ok(
    "Blur, offline, pagehide and hidden documents physically remove audit rows, actor details and cursor controls; the same authorized document restores all 25 rows."
  );
  await failedRead(identity, firstRows);
  await failedRead(audit, firstRows);
  await lateRead(identity, firstRows);
  await lateRead(audit, firstRows);
  ok(
    "Failed identity/source reads and late successful responses remain physically concealed; a fresh current-access check restores the audit without writes."
  );

  await signIn(replacement);
  await event("focus");
  await page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .waitFor();
  await absent();
  const denied = await context.request.get(
    config.origin + "/api/platform/admin?view=audit",
    { headers: { "X-Expected-Account": replacement.id } }
  );
  assert.equal(denied.status(), 404);
  assert.match(denied.headers()["cache-control"], /no-store/);
  const deniedBody = await denied.text();
  assert.ok(!markers.some((value) => deniedBody.includes(value)));
  await signIn(reader);
  await event("focus");
  await ready(firstRows);
  assert.equal(
    await page.evaluate(() => window.__auditDocument),
    "original audit"
  );
  ok(
    "Replacing the account removes old audit rows and the ordinary account's actual API read is denied; returning to the original account restores the same page."
  );

  await db.platformOperatorGrant.update({
    where: { id: grant.id },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  grantRevoked = true;
  await event("focus");
  await button("Recheck current access").waitFor();
  await page.waitForLoadState("networkidle");
  await absent();
  const revoked = await context.request.get(
    config.origin + "/api/platform/admin?view=audit",
    { headers: { "X-Expected-Account": reader.id } }
  );
  assert.equal(revoked.status(), 404);
  assert.match(revoked.headers()["cache-control"], /no-store/);
  await db.platformOperatorGrant.update({
    where: { id: grant.id },
    data: { revokedAt: null, version: { increment: 1 } }
  });
  grantRevoked = false;
  await button("Recheck current access").click();
  await ready(firstRows);
  assert.equal(
    (
      await db.platformOperatorGrant.findUniqueOrThrow({
        where: { id: grant.id }
      })
    ).version,
    grant.version + 2
  );
  ok(
    "Revoking this fixture reader's sole audit capability conceals retained rows and denies the real API; restoring the same fictional grant restores authorized access without replacing the document."
  );

  await screenshot("audit-390", 390);
  await screenshot("audit-320", 320);
  await screenshot("audit-320-font-200", 320, true);
  await page.setViewportSize({ width: 390, height: 844 });
  const older = page.getByRole("link", {
    name: "Older audit records",
    exact: true
  });
  assert.equal(await older.getAttribute("href"), nextPath);
  await older.hover();
  await page.waitForLoadState("networkidle");
  assert.equal(
    requests.filter((request) => {
      const url = new URL(request.path, config.origin);
      return (
        url.pathname === "/platform/admin/audit" &&
        url.searchParams.get("after") === first.next
      );
    }).length,
    0,
    "Audit pagination must not speculatively request the next private page"
  );
  const navigation = page.waitForRequest(
    (request) =>
      request.isNavigationRequest() &&
      new URL(request.url()).pathname + new URL(request.url()).search ===
        nextPath
  );
  await older.click();
  await navigation;
  await page.waitForURL(config.origin + nextPath);
  await ready(lastRows);
  assert.equal(await page.evaluate(() => window.__auditDocument), undefined);
  assert.equal(
    await page
      .getByRole("link", { name: "Older audit records", exact: true })
      .count(),
    0
  );
  const second = await api(first.next);
  assert.deepEqual(
    second.rows.map((row) => row.id),
    lastRows.map((row) => row.id)
  );
  assert.equal(second.next, null);
  await serialization(nextPath);
  ok(
    "Actual cursor pagination displays 25 then one scoped row with no hover prefetch, opens a fresh document, and ends without another cursor; 390/320/200% viewport screenshots fit without overflow."
  );

  const empty = await api(lower);
  assert.deepEqual(empty.rows, []);
  assert.equal(empty.next, null);
  await go(emptyPath, []);
  await event("pagehide");
  await absent();
  await event("pageshow");
  await ready([]);
  ok(
    "A real empty cursor range presents its empty message only while authorized and visible; pagehide removes that presentation without deleting other fixture records."
  );
  assert.equal(
    await db.adminOperation.count({
      where: { actorId: author.id, id: { in: rows.map((row) => row.id) } }
    }),
    26
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
    fixtureOnly: true,
    fixtureSetup: {
      actors: 3,
      auditGrants: 1,
      seededAuditRows: 26,
      grantLifecycleUpdates: 2
    },
    productionWrites: 0,
    recipientSends: 0,
    limitations: [
      "Synthetic lifecycle events do not establish physical-device or operating-system snapshot behavior.",
      "Admin mutation recovery remains covered by the existing Admin browser and original-retry suites; this reader performs no mutation.",
      "Audit operation rows are explicit fictional setup, not evidence of real access-management commands."
    ]
  });
  console.log("ADMIN_AUDIT_PRIVACY_BROWSER_PASS " + results.length);
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
      if (grantRevoked && grant)
        await db.platformOperatorGrant.update({
          where: { id: grant.id },
          data: { revokedAt: grant.revokedAt, version: { increment: 1 } }
        });
    } finally {
      await db.$disconnect();
    }
  }
}
