import assert from "node:assert/strict";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  realpathSync
} from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";

assert.ok(
  process.argv[2],
  "Pass the existing isolated Exchange preview directory"
);
const fixtureDir = realpathSync(resolve(process.argv[2]));
const fixtureRelative = relative(
  realpathSync(resolve(".account-test")),
  fixtureDir
);
assert.ok(
  fixtureRelative &&
    !fixtureRelative.startsWith("..") &&
    !isAbsolute(fixtureRelative)
);
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(
  config.origin,
  /^https:\/\/(?:exchange-fixture\.example\.test|127\.0\.0\.1):\d+$/
);
const localOrigin = config.localOrigin ?? config.origin;
assert.match(localOrigin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
assert.equal(new URL(config.origin).port, new URL(localOrigin).port);
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: localOrigin,
  NEXT_PUBLIC_SITE_URL: localOrigin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR:
    process.env.ACCOUNT_TEST_SINK_DIR ?? fixtureDir + "/sink",
  AUTH_RATE_LIMIT_SECRET:
    process.env.AUTH_RATE_LIMIT_SECRET ??
    "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: "",
  PRIVILEGED_MFA_MODE: process.env.PRIVILEGED_MFA_MODE ?? "off",
  COMMUNITY_REPORTS_ENABLED: "true",
  BLOB_READ_WRITE_TOKEN: "",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  MEDIA_STORAGE_MODE: "local-test",
  RETENTION_TEST_DIR:
    process.env.RETENTION_TEST_DIR ?? fixtureDir + "/retention",
  MEDIA_TEST_DIR: process.env.MEDIA_TEST_DIR ?? fixtureDir + "/images"
});
// The parent runner serves this browser phase with MFA off and then restarts
// the same build with MFA enforce for the separate HTTPS contract suite.
assert.equal(process.env.PRIVILEGED_MFA_MODE, "off");
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase } = await import("../tests/seed-portal.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ??
    process.env.HOME +
      "/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json"
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
if (process.platform !== "darwin")
  assert.ok(
    process.env.DISPLAY && process.env.XAUTHORITY,
    "Headed fixture requires the owned authenticated display"
  );
const browser = await chromium.launch({
  headless: false,
  executablePath:
    process.env.CHROMIUM_PATH ??
    (process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : undefined),
  args: [
    "--ignore-certificate-errors-spki-list=" +
      createHash("sha256").update(der).digest("base64"),
    "--host-resolver-rules=MAP exchange-fixture.example.test 127.0.0.1",
    "--no-proxy-server"
  ]
});

const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: "block"
});
context.setDefaultTimeout(15000);
const output = fixtureDir + "/need-role-browser-" + Date.now();
assert.ok(
  !output.startsWith(resolve(process.env.ACCOUNT_TEST_SINK_DIR) + "/")
);
mkdirSync(output, { mode: 0o700 });
const results = [],
  errors = [],
  layoutFailures = [],
  externalRequests = [],
  routingErrors = [];
const writes = [],
  responses = [],
  pendingRoutes = new Set();
let roleFault = null,
  roleDenials = 0,
  fault = null,
  releaseHeld = () => {},
  firstFailure = null;
const timeout = async (promise, name) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error(name + " timed out")), 15000);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
};
const deferred = () => {
  let release;
  const promise = new Promise((r) => {
    release = r;
  });
  return { promise, release };
};
await context.route("**/*", async (route) => {
  const request = route.request(),
    url = new URL(request.url());
  if (url.origin !== config.origin) {
    externalRequests.push({ method: request.method(), origin: url.origin });
    return route.abort("blockedbyclient");
  }
  if (
    roleFault &&
    request.method() === "GET" &&
    url.pathname === "/api/platform/exchange" &&
    url.searchParams.get("view") === "need-roles"
  ) {
    roleDenials++;
    return route.fulfill({
      status: roleFault,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Fictional same-owner role read unavailable"
      })
    });
  }
  if (
    request.method() !== "POST" ||
    url.pathname !== "/api/platform/exchange"
  )
    return route.continue();
  const body = request.postData();
  assert.ok(body);
  writes.push({
    body,
    owner: request.headers()["x-expected-account"] ?? null
  });
  if (!fault) return route.continue();
  const operation = Promise.resolve()
    .then(() => fault(route))
    .catch(async (error) => {
      routingErrors.push(String(error));
      await route.abort("failed").catch(() => {});
    });
  pendingRoutes.add(operation);
  await operation;
  pendingRoutes.delete(operation);
});
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(String(error)));
page.on("dialog", (dialog) => dialog.accept());
const until = async (work) => {
  for (let i = 0; i < 100; i++) {
    if (await work()) return;
    await page.waitForTimeout(100);
  }
  throw Error("Current form state was not observed");
};
const ready = async (locator) => {
  await locator.waitFor({ state: "visible" });
  await until(() => locator.isEnabled());
};
const signal = (event) =>
  page.evaluate((event) => window.dispatchEvent(new Event(event)), event);
const signIn = async (actor) => {
  await context.clearCookies();
  if (actor)
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
const visit = async (path) => {
  await page.bringToFront();
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
  assert.equal(new URL(page.url()).origin, config.origin);
};
const resume = async () => {
  await page.bringToFront();
  const recheck = page.getByRole("button", {
    name: "Recheck this sign-in",
    exact: true
  });
  if (await recheck.isVisible()) await recheck.click();
  await signal("focus");
};
const absentInputs = async () => {
  // Check actual descendant DOM, not merely visibility of the outer hidden wrapper.
  await until(
    async () =>
      (await page
        .locator("main form input,main form textarea,main form select")
        .count()) === 0
  );
};
const bounded = async () => {
  const value = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth
  }));
  if (value.scroll > value.width + 1) layoutFailures.push(value);
  assert.ok(value.scroll <= value.width + 1, "No horizontal page overflow");
};
const screenshot = async (name) => {
  await bounded();
  await page.screenshot({
    path: output + "/" + name + ".png",
    fullPage: true
  });
};
const ok = (name) => {
  results.push(name);
  console.log("PASS " + name);
};
const privateFile = (name, data) =>
  writeFileSync(output + "/" + name, JSON.stringify(data, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600
  });
try {
  const { seedNeedRolePrivacy } =
    await import("../tests/seed-need-role-privacy.ts");
  const { NEED_SCHEMA } =
    await import("../lib/platform/exchange-need-options.ts");
  const f = await seedNeedRolePrivacy(db);
  const slotRegion = () =>
    page.getByRole("region", {
      name: "Manage need action slots",
      exact: true
    });
  const form = () =>
    slotRegion().getByRole("form", {
      name: "Add need action slot",
      exact: true
    });
  const roleSelect = () =>
    form().getByRole("combobox", { name: "Current event role", exact: true });
  const label = () =>
    form().getByRole("textbox", {
      name: "Item or help description",
      exact: true
    });
  const open = async () => {
    await ready(slotRegion());
    const details = slotRegion()
      .locator("details")
      .filter({
        has: page.locator('form[aria-label="Add need action slot"]')
      });
    assert.equal(await details.count(), 1);
    if (!(await details.evaluate((el) => el.open)))
      await details.locator("summary").click();
    await ready(
      form().getByRole("combobox", { name: "Help requested", exact: true })
    );
  };
  const choose = async (id, text = "Fictional unsent role choice") => {
    await open();
    await form()
      .getByRole("combobox", { name: "Help requested", exact: true })
      .selectOption("VOLUNTEER");
    await ready(roleSelect());
    await roleSelect().selectOption(id);
    await label().fill(text);
  };
  const pinned = async (endpoint, actor = f.ada, owner = actor.id) => {
    const response = await context.request.get(config.origin + endpoint, {
      maxRedirects: 0,
      headers: { "X-Expected-Account": owner }
    });
    for (const name of [
      "cache-control",
      "cdn-cache-control",
      "vercel-cdn-cache-control"
    ])
      assert.match(response.headers()[name], /no-store/);
    return response;
  };
  const tick = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
    );
  await signIn(f.ada);
  const firstResponse = await pinned(f.endpoint);
  assert.equal(firstResponse.status(), 200);
  const first = await firstResponse.json();
  assert.equal(first.ownerId, f.ada.id);
  assert.equal(first.roles.length, 20);
  assert.ok(first.next);
  const secondResponse = await pinned(
    f.endpoint + "&after=" + encodeURIComponent(first.next)
  );
  assert.equal(secondResponse.status(), 200);
  const second = await secondResponse.json();
  assert.equal(second.roles.length, 1);
  assert.equal(second.next, null);
  assert.deepEqual(
    [...first.roles, ...second.roles].map((r) => r.id),
    f.sourceRoles.map((r) => r.id)
  );
  for (const rsc of [false, true]) {
    const response = await context.request.get(
      config.origin + f.page + (rsc ? "?_rsc=role-fixture" : ""),
      {
        maxRedirects: 0,
        headers: rsc ? { RSC: "1", "Next-Url": f.page } : {}
      }
    );
    assert.equal(response.status(), 200);
    const text = (await response.text()).replaceAll("\\", "");
    for (const marker of [
      ...f.sourceRoles.flatMap((r) => [r.id, r.role]),
      ...f.postIds,
      ...f.eventTitles,
      first.next
    ])
      assert.ok(
        !text.includes(marker),
        "Initial manager role marker leaked: fictional marker"
      );
    assert.ok(
      text.includes("Manage need action slots"),
      "Positive control: authorized management shell present"
    );
  }
  ok(
    "Manager HTML/RSC omits role choices/cursor while pinned API returns all21 canonical roles over20+1 pages"
  );

  await visit(f.page);
  await choose(first.roles[0].id);
  assert.equal(await roleSelect().locator("option").count(), 21);
  await signal("blur");
  await absentInputs();
  await resume();
  await open();
  assert.equal(await roleSelect().inputValue(), first.roles[0].id);
  assert.equal(await label().inputValue(), "Fictional unsent role choice");
  await screenshot("roles-selected-390");
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(
    () => (document.documentElement.style.fontSize = "200%")
  );
  await screenshot("roles-selected-320-200");
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  await page.setViewportSize({ width: 390, height: 844 });
  await form()
    .getByRole("button", { name: "Discard local slot changes", exact: true })
    .click();
  const more = page.getByRole("link", {
    name: "More current event roles",
    exact: true
  });
  assert.equal(
    await more.getAttribute("href"),
    f.page + "?rolesAfter=" + encodeURIComponent(first.next)
  );
  await more.click();
  await page.waitForURL(
    config.origin + f.page + "?rolesAfter=" + encodeURIComponent(first.next)
  );
  await open();
  await form()
    .getByRole("combobox", { name: "Help requested", exact: true })
    .selectOption("VOLUNTEER");
  assert.equal(await roleSelect().locator("option").count(), 2);
  assert.equal(
    await roleSelect().locator("option").nth(1).getAttribute("value"),
    second.roles[0].id
  );
  assert.equal(
    await page
      .getByRole("link", { name: "More current event roles", exact: true })
      .count(),
    0
  );
  ok(
    "Verified role options retain selected unsent drafts through concealment and actual link pagination reaches the21st role"
  );

  await visit(f.page);
  await choose(
    first.roles[1].id,
    "Fictional retained through same-owner denial"
  );
  const writesBefore = writes.length;
  for (const status of [401, 503]) {
    const before = roleDenials;
    roleFault = status;
    await signal("blur");
    await resume();
    await until(() => Promise.resolve(roleDenials > before));
    await page
      .getByText("Fictional same-owner role read unavailable", {
        exact: true
      })
      .first()
      .waitFor();
    assert.equal(await form().count(), 0);
    assert.equal(writes.length, writesBefore);
    roleFault = null;
    await resume();
    await open();
    assert.equal(await roleSelect().inputValue(), first.roles[1].id);
    assert.equal(
      await label().inputValue(),
      "Fictional retained through same-owner denial"
    );
  }
  ok(
    "Same-owner401 and unavailable role reads conceal without permanently clearing the original draft or dispatching commands"
  );

  for (const replacement of [f.blake, null]) {
    await signIn(f.ada);
    await visit(f.page);
    await choose(first.roles[2].id, "Fictional account-bound unsent role");
    const before = writes.length;
    await signIn(replacement);
    await signal("focus");
    await page
      .getByText(
        "Your sign-in changed. Private entries and requests were cleared. Reload for your current account.",
        { exact: true }
      )
      .first()
      .waitFor({ state: "attached" });
    assert.equal(await form().count(), 0);
    await signIn(f.ada);
    await signal("focus");
    await tick();
    assert.equal(await form().count(), 0);
    assert.equal(writes.length, before);
    assert.equal(
      await page
        .getByRole("button", {
          name: "Confirm original request",
          exact: true
        })
        .count(),
      0
    );
  }
  ok(
    "Confirmed replacement and signout remove the old slot owner and returning to the original account cannot resurrect it"
  );

  await signIn(f.ada);
  await visit(f.page);
  await choose(first.roles[3].id, "Fictional original role command");
  const saved = deferred(),
    held = deferred();
  releaseHeld = held.release;
  fault = async (route) => {
    const body = JSON.parse(route.request().postData());
    assert.equal(body.operation, "need-slot");
    const response = await route.fetch({ maxRedirects: 0 });
    assert.equal(response.status(), 200);
    responses.push(await response.json());
    saved.release();
    await timeout(held.promise, "Committed slot reply");
    return route.abort("failed");
  };
  await form()
    .getByRole("button", { name: "Save action slot", exact: true })
    .click();
  await timeout(saved.promise, "Canonical slot commit");
  const original = writes.at(-1),
    parsed = JSON.parse(original.body);
  assert.equal(original.owner, f.ada.id);
  assert.equal(parsed.schema, NEED_SCHEMA);
  assert.equal(parsed.fields.volunteerSlotId, first.roles[3].id);
  await signal("blur");
  await absentInputs();
  held.release();
  await timeout(Promise.all([...pendingRoutes]), "Lost slot reply");
  fault = null;
  await resume();
  const confirm = page.getByRole("button", {
    name: "Confirm original request",
    exact: true
  });
  await ready(confirm);
  assert.equal(
    writes.filter((w) => JSON.parse(w.body).slotId === parsed.slotId).length,
    1
  );
  const committed = await db.exchangeNeedSlot.findUniqueOrThrow({
    where: { id: parsed.slotId }
  });
  const replayResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/platform/exchange" &&
      response.request().method() === "POST" &&
      response.request().postData() === original.body
  );
  // The replay clears pending state before Back cleanup and router.refresh.
  // Observe the refresh that follows that cleanup before the next scenario.
  const refreshedResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.origin === config.origin &&
      url.pathname === f.page &&
      response.request().method() === "GET" &&
      response.request().headers()["rsc"] === "1"
    );
  });
  await confirm.click();
  const replay = await replayResponse;
  assert.equal(replay.status(), 200);
  const replayed = await replay.json();
  assert.equal(replayed.id, parsed.slotId);
  assert.equal(replayed.version, committed.version);
  await until(() =>
    Promise.resolve(
      writes.filter((w) => JSON.parse(w.body).slotId === parsed.slotId)
        .length === 2
    )
  );
  await until(
    async () =>
      (await db.exchangeNeedSlot.count({ where: { id: parsed.slotId } })) ===
      1
  );
  await until(async () => (await confirm.count()) === 0);
  const attempts = writes.filter(
    (w) => JSON.parse(w.body).slotId === parsed.slotId
  );
  assert.equal(attempts[1].body, original.body);
  assert.equal(attempts[1].owner, f.ada.id);
  const current = await db.exchangeNeedSlot.findUniqueOrThrow({
    where: { id: parsed.slotId }
  });
  assert.equal(current.version, committed.version);
  assert.equal(current.volunteerSlotId, first.roles[3].id);
  const refreshed = await refreshedResponse;
  assert.equal(refreshed.status(), 200);
  assert.equal(
    await timeout(refreshed.finished(), "Need refresh response completion"),
    null
  );
  await page.waitForFunction(() => !window.history.state?.gcPhotoWork);
  await slotRegion()
    .getByRole("form", {
      name: "Edit slot " + parsed.fields.label,
      exact: true,
      includeHidden: true
    })
    .waitFor({ state: "attached" });
  assert.equal(page.url(), config.origin + f.page);
  ok(
    "Lost committed slot response requires deliberate byte-identical owner/version replay and creates one canonical link"
  );

  await visit(f.page);
  const availableResponse = await pinned(f.endpoint);
  assert.equal(availableResponse.status(), 200);
  const available = await availableResponse.json();
  const stale = available.roles.find((r) => r.id !== first.roles[3].id);
  assert.ok(stale);
  await choose(stale.id, "Fictional stale organizer choice");
  const beforeCount = await db.exchangeNeedSlot.count({
    where: { needId: f.need.id }
  });
  await db.churchCapabilityGrant.update({
    where: {
      userId_churchId_capability: {
        userId: f.ada.id,
        churchId: f.churchA.id,
        capability: "MANAGE_CHURCH_VOLUNTEERS"
      }
    },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  const deniedResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/platform/exchange" &&
      response.request().method() === "POST"
  );
  await form()
    .getByRole("button", { name: "Save action slot", exact: true })
    .click();
  const denied = await deniedResponse;
  assert.equal(denied.status(), 403);
  assert.equal(
    await db.exchangeNeedSlot.count({ where: { needId: f.need.id } }),
    beforeCount
  );
  const filteredResponse = await pinned(f.endpoint);
  assert.equal(filteredResponse.status(), 200);
  const filtered = await filteredResponse.json();
  assert.deepEqual(filtered.roles, []);
  assert.equal(filtered.next, null);
  await signal("blur");
  await resume();
  await until(async () => (await form().count()) === 0);
  await screenshot("roles-revoked");
  ok(
    "Current volunteer-duty loss denies a previously selected role command and removes current choices without a new slot"
  );

  assert.equal(results.length, 6);
  assert.deepEqual(errors, []);
  assert.deepEqual(routingErrors, []);
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(layoutFailures, []);
} catch (error) {
  firstFailure = String(error.stack ?? error);
  // Record the original error before any secondary screenshot/DOM work.
  writeFileSync(output + "/first-failure.txt", firstFailure, {
    flag: "wx",
    mode: 0o600
  });
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  releaseHeld();
  await timeout(
    Promise.allSettled([...pendingRoutes]),
    "Route cleanup"
  ).catch((error) => routingErrors.push(String(error)));
  privateFile("observations.json", {
    writes,
    responses,
    routingErrors,
    externalRequests
  });
  privateFile("results.json", {
    source: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8"
    }).trim(),
    buildId: readFileSync(".next/BUILD_ID", "utf8").trim(),
    results,
    errors,
    layoutFailures,
    complete:
      !firstFailure &&
      results.length === 6 &&
      errors.length === 0 &&
      layoutFailures.length === 0 &&
      routingErrors.length === 0 &&
      externalRequests.length === 0,
    routingErrorCount: routingErrors.length,
    externalRequestCount: externalRequests.length,
    productionWrites: 0,
    externalSends: 0,
    scopeEvidence:
      "full-application-https-with-fictional-database-and-controlled-faults",
    limitations: [
      "Browser serving mode off; existing separate HTTPS phase enforces MFA.",
      "Controlled browser lifecycle signals are not native-window evidence.",
      "Minimal form recipients do not establish routing-only bootstrap or removal of the authorized own inline row.",
      "Parent-confirmed account clearing is covered; later multi-save/rearm and sibling draft survival after accepted RSC replacement are not."
    ]
  });
  await context.close();
  await browser.close();
  await db.$disconnect();
}
