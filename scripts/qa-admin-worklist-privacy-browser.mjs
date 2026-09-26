import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
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
  PUSH_ENABLED: "false",
  FEEDBACK_INTAKE_ENABLED: "true",
  FEEDBACK_IDEAS_ENABLED: "true",
  SUPPORT_INTAKE_ENABLED: "true"
});
// Use the inspected runtime's modules even when this script lives elsewhere.
const require = createRequire(resolve("package.json"));
const load = (name) => import(pathToFileURL(resolve(name)));
const { PrismaClient } = require("@prisma/client");
const { assertPortalTestDatabase, createPortalActor } = await load(
  "tests/seed-portal.ts"
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
  viewport: { width: 390, height: 844 },
  acceptDownloads: true
});
const page = await context.newPage();
page.setDefaultTimeout(30000);
const { supportCommand, readSupport } = await load("lib/platform/support.ts");
const { requestInput } = await load("tests/seed-support.ts");
const { SUPPORT_NOTICE } = await load("lib/platform/support-types.ts");
const { FEEDBACK_NOTICE } = await load("lib/platform/feedback-policy.ts");
const { adminSavedViewCommand, adminCaseCommand, adminChildRequestKey } =
  await load("lib/platform/admin-cases.ts");
const output = resolve(
  fixtureDir,
  "admin-worklist-privacy-browser-" + Date.now()
);
mkdirSync(output, { recursive: true, mode: 0o700 });
const originalIntake = await db.supportIntakeSetting.findUnique({
  where: { id: "default" }
});
const sinkBefore = new Set(readdirSync(resolve(fixtureDir, "sink")));
const marker = "Worklist " + randomUUID().slice(0, 8);
const results = [],
  errors = [],
  externalRequests = [],
  routeErrors = [],
  browserWrites = [],
  requests = [],
  observations = [],
  recoveries = [],
  dialogs = [],
  captures = [],
  serviceEffects = [],
  caseIds = [];
const rules = [],
  releases = new Set();
let rejectRouting,
  actor,
  requester,
  replacement,
  respondGrant,
  grantRevoked = false,
  dialogAccept = true,
  section = "requests",
  feedbackCaseId;
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
// One persistent native dispatcher samples a local rule before any await.
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
    const diagnostic = {
      url: route.request().url(),
      method: route.request().method(),
      message: String(error)
    };
    routeErrors.push(diagnostic);
    rejectRouting(new Error(JSON.stringify(diagnostic), { cause: error }));
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
const progress = (stage) => {
  write("progress.json", {
    stage,
    at: new Date().toISOString(),
    observations,
    browserWrites,
    captures,
    actorId: actor?.id,
    requesterId: requester?.id,
    replacementId: replacement?.id,
    caseIds
  });
  console.log("STAGE " + stage);
};
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const button = (name) => page.getByRole("button", { name, exact: true });
const form = (name) => page.getByRole("form", { name, exact: true });
const filters = form("Filter requests"),
  save = form("Save private view"),
  bulk = form("Apply to selected requests");
const retry = (owner) =>
  owner().getByRole("button", { name: "Retry original action", exact: true });
const discard = (owner) =>
  owner().getByRole("button", { name: "Discard local entries", exact: true });
const adopt = (owner) =>
  owner().getByRole("button", {
    name: "Use current version with these entries",
    exact: true
  });
const identity = (url) =>
  url.pathname === "/api/platform/profile" &&
  url.searchParams.get("view") === "identity";
const source = (url) =>
  url.pathname === "/api/platform/admin" &&
  url.searchParams.get("view") === "queue";
const command = (url) => url.pathname === "/api/platform/admin" && !url.search;
const event = (name) =>
  page.evaluate((name) => window.dispatchEvent(new Event(name)), name);
const sourceResponse = () =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      source(new URL(response.url())) &&
      response.status() === 200
  );
const ready = async () => {
  await page
    .getByRole("heading", {
      name: section === "feedback" ? "Feedback requests" : "Requests",
      exact: true
    })
    .waitFor();
  await filters.waitFor();
};
const signIn = async (who) => {
  await context.clearCookies();
  await context.addCookies([
    {
      name: "church_platform_session",
      value: who.token,
      url: config.origin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
};
const resume = async (name = "focus") => {
  await event(name);
  await ready();
};
const fresh = async () => {
  const next = sourceResponse();
  await button("Refresh current view").click();
  const data = await (await next).json();
  await ready();
  return data;
};
const api = async (query = {}) => {
  const response = await context.request.get(
    config.origin +
      "/api/platform/admin?" +
      new URLSearchParams({ view: "queue", ...query }),
    { headers: { "X-Expected-Account": actor.id } }
  );
  assert.equal(response.status(), 200, await response.text());
  assert.match(response.headers()["cache-control"], /no-store/);
  return response.json();
};
const fieldsAre = async (owner, expected) => {
  await owner.waitFor();
  await page.waitForFunction(
    ({ name, expected }) => {
      const form = [...document.querySelectorAll("form")].find(
        (node) => node.getAttribute("aria-label") === name
      );
      return (
        !!form &&
        Object.entries(expected).every(([key, value]) => {
          const field = form.querySelector(`[name="${key}"]`);
          return (
            field &&
            (typeof value === "boolean"
              ? field.checked === value
              : field.value === value)
          );
        })
      );
    },
    { name: await owner.getAttribute("aria-label"), expected }
  );
};
const fill = async (owner, values) => {
  for (const [name, value] of Object.entries(values)) {
    const field = owner.locator(`[name="${name}"]`);
    if (typeof value === "boolean") await field.setChecked(value);
    else if (await field.evaluate((node) => node.tagName === "SELECT"))
      await field.selectOption(value);
    else await field.fill(value);
  }
};
const openDetails = async (title) => {
  const summary = page.locator("summary").filter({ hasText: title });
  if (!(await summary.evaluate((node) => node.parentElement.open)))
    await summary.click();
};
const detailsOpen = async () => {
  for (const title of ["More filters", "My saved views"])
    assert.equal(
      await page
        .locator("summary")
        .filter({ hasText: title })
        .evaluate((node) => node.parentElement.open),
      true
    );
};
const absent = async (label) => {
  await page.waitForFunction(
    ({ marker, ids }) => {
      const root = document.body;
      return (
        !!root &&
        !root.textContent.includes(marker) &&
        !root.querySelector(
          'form[aria-label="Filter requests"], [name="name"], [name="tags"], [name="reason"]'
        ) &&
        ![...root.querySelectorAll("[href],[aria-label],[value]")].some(
          (node) =>
            ["href", "aria-label", "value"].some((key) => {
              const value = node.getAttribute(key) ?? "";
              return (
                value.includes(marker) || ids.some((id) => value.includes(id))
              );
            })
        )
      );
    },
    { marker, ids: caseIds }
  );
  observations.push({
    label,
    physicalPrivateDomAbsent: true,
    browserWrites: browserWrites.length
  });
  progress(label);
};
const blockedNavigation = async () => {
  const current = page.url(),
    count = browserWrites.length;
  assert.equal(await button("Apply filters").isDisabled(), true);
  await filters.evaluate((node) => node.requestSubmit());
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done))
      )
  );
  assert.equal(page.url(), current);
  assert.equal(browserWrites.length, count);
  assert.equal(
    await page.evaluate(() => window.__worklistDocument),
    "original"
  );
};
const heldRead = (matches) => {
  let release, capture;
  const gate = new Promise((done) => {
      release = done;
    }),
    captured = new Promise((done) => {
      capture = done;
    });
  releases.add(release);
  const remove = register(matches, async (route) => {
    const response = await route.fetch();
    capture();
    await gate;
    await route.fulfill({ response });
  });
  return { captured, release, remove };
};
const capturedWithin = async (promise, label = "Held read") => {
  let timeout;
  try {
    await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(Error(label + " did not complete within30 seconds")),
          30000
        );
      })
    ]);
  } finally {
    clearTimeout(timeout);
  }
};
const failedAndHeld = async (matches) => {
  let deliveryDone;
  const delivered = new Promise((resolve) => {
    deliveryDone = resolve;
  });
  let remove = register(matches, async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Fictional failed current worklist read"
      })
    });
    deliveryDone();
  });
  try {
    progress(matches === identity ? "inject identity503" : "inject source503");
    const failed = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        matches(new URL(response.url())) &&
        response.status() === 503
    );
    await event("blur");
    await event("focus");
    const response = await failed;
    assert.equal(response.status(), 503);
    await capturedWithin(delivered, "Injected503 dispatcher delivery");
    progress(
      matches === identity ? "identity503 delivered" : "source503 delivered"
    );
    await page.waitForLoadState("networkidle");
    await absent(matches === identity ? "failed identity" : "failed source");
  } finally {
    remove();
  }
  await resume();
  const hold = heldRead(matches);
  try {
    await event("blur");
    await event("focus");
    await capturedWithin(hold.captured);
    await absent(matches === identity ? "held identity" : "held source");
    await event("pagehide");
    hold.release();
    await page.waitForLoadState("networkidle");
    await absent(
      matches === identity
        ? "late identity after pagehide"
        : "late source after pagehide"
    );
  } finally {
    hold.release();
    hold.remove();
    releases.delete(hold.release);
  }
  await resume("pageshow");
};
const ownedEffects = async () => ({
  admin: await db.adminOperation.count({ where: { actorId: actor.id } }),
  support: await db.supportOperation.count({ where: { actorId: actor.id } })
});
const verifyOriginal = async (body, expectedChildren) => {
  const data = JSON.parse(body);
  if (data.operation !== "bulk") {
    const rows = await db.adminOperation.findMany({
      where: { actorId: actor.id, requestKey: data.requestKey }
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].action, data.operation);
    return rows;
  }
  const receiptRows = [];
  assert.equal(data.rows.length, expectedChildren);
  for (const row of data.rows) {
    const key = adminChildRequestKey(
      data.requestKey,
      row.sourceType + ":" + row.sourceId
    );
    const receipts =
      data.action === "status"
        ? await db.supportOperation.findMany({
            where: { actorId: actor.id, requestKey: key }
          })
        : await db.adminOperation.findMany({
            where: { actorId: actor.id, requestKey: key }
          });
    assert.equal(receipts.length, 1);
    receiptRows.push(...receipts);
  }
  return receiptRows;
};
// Every accepted operation is real. Only acknowledgment loss and failure statuses
// are simulated; exact bytes/owner and actual child receipts are compared.
const recover = async ({
  owner,
  submit,
  operation,
  children = 0,
  partial429 = false,
  afterSaved = async () => {}
}) => {
  const attempts = [],
    statuses = [],
    before = await ownedEffects();
  const remove = register(command, async (route) => {
    const request = route.request();
    attempts.push({
      body: request.postData(),
      owner: request.headers()["x-expected-account"]
    });
    assert.equal(JSON.parse(request.postData()).operation, operation);
    if (attempts.length === 1) {
      const response = await route.fetch();
      assert.equal(response.status(), 200, await response.text());
      const data = await response.json();
      statuses.push(200);
      if (partial429) {
        assert.equal(data.results.length, 2);
        assert.ok(data.results.every((row) => row.ok));
        const delivered = {
          ...data,
          message: "Fictional mixed child acknowledgment",
          results: [
            data.results[0],
            {
              ...data.results[1],
              ok: false,
              status: 429,
              message: "Fictional child429: confirm the same batch."
            }
          ]
        };
        recoveries.push({
          simulation:
            "Both actual tag children saved; only second delivered acknowledgment is429",
          actual: data,
          delivered
        });
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(delivered)
        });
      }
      return route.abort("failed");
    }
    const status =
      attempts.length === 2 ? 429 : attempts.length === 3 ? 503 : 200;
    statuses.push(status);
    if (status !== 200)
      return route.fulfill({
        status,
        contentType: "application/json",
        headers: status === 429 ? { "retry-after": "1" } : {},
        body: JSON.stringify({
          message: "Fictional worklist response " + status
        })
      });
    const response = await route.fetch();
    assert.equal(response.status(), 200, await response.text());
    if (operation === "bulk")
      assert.ok((await response.json()).results.every((row) => row.ok));
    return route.fulfill({ response });
  });
  try {
    await owner().getByRole("button", { name: submit, exact: true }).click();
    await retry(owner).waitFor();
    const original = await verifyOriginal(attempts[0].body, children);
    await fresh();
    await afterSaved(JSON.parse(attempts[0].body));
    await retry(owner).waitFor();
    await blockedNavigation();
    await event("pagehide");
    await absent(operation + " pending pagehide");
    await resume("pageshow");
    await retry(owner).waitFor();
    if (operation === "delete-view") {
      const count = browserWrites.length;
      await signIn(replacement);
      await retry(owner).click();
      await absent("pending delete-view account replacement");
      assert.equal(
        browserWrites.length,
        count,
        "A different account cannot send the retained command"
      );
      await signIn(actor);
      await resume();
      await retry(owner).waitFor();
    }
    for (const status of [429, 503]) {
      await retry(owner).click();
      await owner()
        .getByText("Fictional worklist response " + status, { exact: true })
        .waitFor();
      await page.waitForFunction(
        (name) => {
          const form = [...document.querySelectorAll("form")].find(
            (node) => node.getAttribute("aria-label") === name
          );
          return (
            form?.getAttribute("aria-busy") !== "true" &&
            form?.querySelector('button:not([type]),button[type="submit"]')
              ?.disabled === false
          );
        },
        await owner().getAttribute("aria-label")
      );
      assert.deepEqual(
        await verifyOriginal(attempts[0].body, children),
        original
      );
    }
    const submitting = await owner().elementHandle(),
      updated = sourceResponse();
    const confirmed = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        command(new URL(response.url())) &&
        response.request().postData() === attempts[0].body &&
        response.status() === 200
    );
    await retry(owner).click();
    await capturedWithin(
      (await confirmed).finished(),
      "Confirmed command response"
    );
    await capturedWithin((await updated).finished(), "Current queue response");
    await page.waitForFunction(
      (node) => !node?.isConnected || node.getAttribute("aria-busy") !== "true",
      submitting
    );
    await ready();
    assert.equal(attempts.length, 4);
    assert.deepEqual(statuses, [200, 429, 503, 200]);
    assert.ok(
      attempts.every(
        (row) => row.body === attempts[0].body && row.owner === actor.id
      )
    );
    assert.deepEqual(
      await verifyOriginal(attempts[0].body, children),
      original
    );
    const after = await ownedEffects();
    assert.deepEqual(after, {
      admin:
        before.admin +
        (operation === "bulk"
          ? JSON.parse(attempts[0].body).action === "tags"
            ? children
            : 0
          : 1),
      support:
        before.support +
        (operation === "bulk" &&
        JSON.parse(attempts[0].body).action === "status"
          ? children
          : 0)
    });
    recoveries.push({
      operation,
      attempts,
      statuses,
      originalReceiptIds: original.map((row) => row.id),
      before,
      after
    });
    return JSON.parse(attempts[0].body);
  } finally {
    remove();
  }
};
const selectRows = async (ids) => {
  for (const id of ids)
    await page
      .locator("li")
      .filter({ has: page.locator('a[id="request-' + id + '"]') })
      .getByRole("checkbox")
      .check();
};
const clearSelection = async () => {
  const clear = button("Clear selected requests");
  if (await clear.count()) {
    await clear.waitFor();
    await page.waitForFunction(() =>
      [...document.querySelectorAll("button")].some(
        (node) =>
          node.textContent === "Clear selected requests" && !node.disabled
      )
    );
    await clear.click();
  }
  assert.equal(
    await page.locator('ul[aria-label="Requests"] input:checked').count(),
    0
  );
};
const action = () =>
  page
    .locator("label")
    .filter({ hasText: /^ActionReplace internal tags/ })
    .locator("select");
const currentOrdinary = async (count) =>
  (await api()).rows
    .filter((row) => row.sourceId !== feedbackCaseId)
    .slice(0, count);
const serviceTransition = async (id) => {
  const row = await db.supportCase.findUniqueOrThrow({ where: { id } });
  const result = await supportCommand(db, actor.token, {
    operation: "transition",
    requestKey: randomUUID(),
    caseId: id,
    expectedVersion: row.version,
    status: "RESOLVED",
    reason: "Fictional independent current row resolution"
  });
  serviceEffects.push({ operation: "transition", id, version: result.version });
};
const fit = async (width, enlarged = false, phase = "dirty") => {
  await page.setViewportSize({ width, height: 844 });
  const style = enlarged
    ? await page.addStyleTag({ content: "html{font-size:200%!important}" })
    : null;
  const name = phase + "-" + width + (enlarged ? "-font-200" : "");
  try {
    const targets =
      phase === "clean"
        ? [["filter", filters.locator('[name="q"]')]]
        : [
            ["save", save.locator('button:not([type]),button[type="submit"]')],
            ["bulk", bulk.locator('button:not([type]),button[type="submit"]')]
          ];
    for (const [part, target] of targets) {
      await target.focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      await target.evaluate((node) =>
        node.scrollIntoView({ block: "center", inline: "nearest" })
      );
      const geometry = await target.evaluate((node) => {
        const r = node.getBoundingClientRect(),
          n = document
            .querySelector('nav[aria-label="Platform"]')
            .getBoundingClientRect(),
          s = getComputedStyle(node),
          hit = document.elementFromPoint(
            (r.left + r.right) / 2,
            (r.top + r.bottom) / 2
          );
        return {
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          availableBottom: n.top,
          focused: document.activeElement === node,
          focusVisible: node.matches(":focus-visible"),
          outlineStyle: s.outlineStyle,
          outlineWidth: s.outlineWidth,
          outlineColor: s.outlineColor,
          boxShadow: s.boxShadow,
          centerHit: node === hit || node.contains(hit),
          viewport: innerWidth,
          scrollWidth: document.documentElement.scrollWidth
        };
      });
      const path = resolve(output, name + "-" + part + ".png");
      await page.screenshot({ path });
      captures.push({ path, geometry });
      assert.ok(
        geometry.focused && geometry.focusVisible && geometry.centerHit
      );
      assert.ok(
        geometry.top >= 0 && geometry.bottom <= geometry.availableBottom
      );
      assert.ok(
        (geometry.outlineStyle !== "none" &&
          parseFloat(geometry.outlineWidth) > 0) ||
          geometry.boxShadow !== "none"
      );
    }
    const layout = await page.evaluate(() => ({
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflow: [...document.querySelectorAll("main *")]
        .map((node) => {
          const r = node.getBoundingClientRect();
          return {
            tag: node.tagName,
            name: node.getAttribute("name"),
            class: node.className,
            width: r.width,
            right: r.right + scrollX,
            text: node.textContent.slice(0, 100)
          };
        })
        .filter((row) => row.width && row.right > innerWidth + 1)
        .slice(0, 30)
    }));
    write(name + "-layout.json", layout);
    assert.ok(
      layout.scrollWidth <= width + 1,
      "No horizontal overflow: " + name
    );
  } finally {
    if (style) await style.evaluate((node) => node.remove());
  }
};
const run = async () => {
  write("fixture-checkpoint.json", {
    at: new Date().toISOString(),
    pid: process.pid,
    candidate: process.cwd(),
    build: readFileSync(resolve(".next/BUILD_ID"), "utf8").trim(),
    originalIntake,
    note: "Saved before any fixture mutation; restore this exact shared intake configuration in finally."
  });
  actor = await createPortalActor(db, "workqarev");
  requester = await createPortalActor(db, "workqareq");
  replacement = await createPortalActor(db, "workqaswap");
  respondGrant = await db.supportCapabilityGrant.create({
    data: { userId: actor.id, capability: "RESPOND" }
  });
  await db.supportIntakeSetting.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      ownerGrantId: respondGrant.id,
      enabled: true,
      approvedNoticeVersion: SUPPORT_NOTICE
    },
    update: {
      ownerGrantId: respondGrant.id,
      enabled: true,
      approvedNoticeVersion: SUPPORT_NOTICE
    }
  });
  for (let i = 0; i < 26; i++) {
    const created = await supportCommand(
      db,
      requester.token,
      await requestInput(db, requester.token, {
        subject: marker + " private request " + String(i).padStart(2, "0"),
        description: marker + " private original description " + i
      })
    );
    caseIds.push(created.caseId);
    // Date only this newly created fictional row for the pagination fixture.
    // The actual daily intake limit remains enabled and unchanged.
    const aged = await db.supportCase.updateMany({
      where: {
        id: created.caseId,
        requesterId: requester.id,
        ownerGrantId: respondGrant.id
      },
      data: { createdAt: new Date(Date.now() - 3 * 86400000 - i * 60000) }
    });
    assert.equal(aged.count, 1);
  }
  const intake = await readSupport(db, requester.token, "new", {
    feedbackOnly: true
  });
  feedbackCaseId = (
    await supportCommand(db, requester.token, {
      operation: "feedback-create",
      requestKey: randomUUID(),
      kind: "SUGGESTION",
      rating: null,
      outcome: marker + " private feedback outcome",
      helps: marker + " private feedback audience",
      recipientId: intake.intake.recipient.id,
      recipientVersion: intake.intake.recipient.version,
      notice: FEEDBACK_NOTICE,
      consent: true,
      contactAllowed: false,
      channels: [],
      allowIdea: false,
      publicAttribution: false
    })
  ).caseId;
  caseIds.push(feedbackCaseId);
  const viewName = marker + " saved original";
  const existing = await adminSavedViewCommand(db, actor.token, {
    operation: "save-view",
    requestKey: randomUUID(),
    name: viewName,
    filters: { state: "OPEN", type: "SUPPORT" }
  });
  serviceEffects.push({ operation: "save-view", id: existing.id });
  await signIn(actor);
  const url = config.origin + "/platform/admin/requests";
  for (const [suffix, headers] of [
    ["", {}],
    ["?_rsc=worklist-privacy", { RSC: "1" }]
  ]) {
    const response = await context.request.get(url + suffix, { headers });
    assert.equal(response.status(), 200);
    assert.ok(
      !(await response.text()).includes(marker),
      "Initial HTML/RSC must omit private rows and saved views"
    );
  }
  let data = await api();
  assert.equal(data.rows.length, 25);
  assert.ok(data.next);
  const second = await api({ after: data.next });
  assert.equal(second.rows.length, 2);
  assert.equal(
    new Set([...data.rows, ...second.rows].map((row) => row.sourceId)).size,
    27
  );
  await page.goto(url);
  await ready();
  await page.evaluate(() => {
    window.__worklistDocument = "original";
  });
  await openDetails("More filters");
  await openDetails("My saved views");
  const filterDraft = {
    q: marker + " unsent query",
    type: "BUG",
    state: "WAITING_REQUESTER",
    priority: "HIGH",
    owner: "ME",
    age: "7",
    churchId: "",
    topicId: "",
    tag: "private-draft-tag",
    due: true
  };
  await fill(filters, filterDraft);
  await fit(390, false, "clean");
  await fit(320, false, "clean");
  await fit(320, true, "clean");
  await fill(save, { name: marker + " unsent private view" });
  const selected = data.rows
    .filter((row) => row.sourceId !== feedbackCaseId)
    .slice(0, 2);
  await selectRows(selected.map((row) => row.sourceId));
  await fill(bulk, { tags: "original-draft, second-tag" });
  await blockedNavigation();
  assert.equal(await action().isDisabled(), true);
  assert.equal(await button("Clear selected requests").isDisabled(), true);
  assert.equal(
    await page
      .locator('ul[aria-label="Requests"] input:checked:not(:disabled)')
      .count(),
    0
  );
  for (const trigger of ["blur", "offline", "pagehide"]) {
    await event(trigger);
    await absent(trigger);
    await resume(
      trigger === "offline"
        ? "online"
        : trigger === "pagehide"
          ? "pageshow"
          : "focus"
    );
    await fieldsAre(filters, filterDraft);
    await fieldsAre(save, { name: marker + " unsent private view" });
    await fieldsAre(bulk, { tags: "original-draft, second-tag" });
    await detailsOpen();
  }
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden"
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await absent("document hidden");
  await page.evaluate(() => {
    delete document.visibilityState;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await ready();
  await failedAndHeld(identity);
  await failedAndHeld(source);
  await signIn(replacement);
  await event("focus");
  await absent("same-page account replacement");
  assert.equal(browserWrites.length, 0);
  await signIn(actor);
  await resume();
  await fieldsAre(filters, filterDraft);
  await fieldsAre(save, { name: marker + " unsent private view" });
  await fieldsAre(bulk, { tags: "original-draft, second-tag" });
  await db.supportCapabilityGrant.update({
    where: { id: respondGrant.id },
    data: { revokedAt: new Date() }
  });
  grantRevoked = true;
  await event("focus");
  await absent("actual responder capability revoked");
  const renewedGrant = await db.supportCapabilityGrant.update({
    where: { id: respondGrant.id },
    data: { revokedAt: null }
  });
  grantRevoked = false;
  assert.equal(renewedGrant.version, respondGrant.version + 2);
  // A grant renewal deliberately does not restore old case assignments in the
  // product. Restore only this run's own fictional fixture assignments to the
  // actual new generation so the following independent recovery tests can run.
  const reassigned = await db.supportCase.updateMany({
    where: {
      id: { in: caseIds },
      requesterId: requester.id,
      ownerGrantId: respondGrant.id
    },
    data: { ownerGrantVersion: renewedGrant.version }
  });
  assert.equal(reassigned.count, 27);
  await resume();
  assert.equal((await api()).rows.length, 25);
  await fieldsAre(filters, filterDraft);
  await fieldsAre(bulk, { tags: "original-draft, second-tag" });
  await detailsOpen();
  await fit(390);
  await fit(320);
  await fit(320, true);
  ok(
    "Actual25+2 authorized rows omit private data from HTML/RSC. Ten filter values, both details states and save/bulk sibling drafts survive concealment, failed/held reads, account replacement and real responder revocation. Private rows, names, links and fields physically disappear; native navigation stays blocked. Nine captures use actual keyboard focus and strict narrow/200% overflow checks."
  );

  const saveBody = await recover({
    owner: () => save,
    submit: "Save private view",
    operation: "save-view"
  });
  assert.equal(saveBody.name, marker + " unsent private view");
  assert.equal(
    saveBody.filters.q,
    "",
    "Saving uses applied filters, not unsent filter edits"
  );
  await fieldsAre(save, { name: "" });
  await fieldsAre(bulk, { tags: "original-draft, second-tag" });
  await fieldsAre(filters, filterDraft);
  await fill(save, { name: marker + " second sibling draft" });
  // The removed view changes to a generic name while its retained command remains.
  const deletedOwner = () =>
    page.getByRole("form", {
      name: new RegExp("^(Remove " + viewName + "|Confirm removed saved view)$")
    });
  const deleteBody = await recover({
    owner: deletedOwner,
    submit: "Remove " + viewName,
    operation: "delete-view",
    afterSaved: async (body) => {
      assert.equal(
        await db.adminSavedView.count({ where: { id: body.id } }),
        0
      );
      assert.equal(
        await page.getByRole("link", { name: viewName, exact: true }).count(),
        0
      );
    }
  });
  assert.equal(deleteBody.id, existing.id);
  assert.equal(deleteBody.expectedVersion, 1);
  await fieldsAre(save, { name: marker + " second sibling draft" });
  await fieldsAre(bulk, { tags: "original-draft, second-tag" });
  ok(
    "A real saved-view creation and deletion each survive lost acknowledgment, concealment,429,503 and exact confirmation with one audit. The removed name disappears while its generic recovery owner survives; independent bulk/save/filter drafts remain unchanged."
  );

  const tagsBody = await recover({
    owner: () => bulk,
    submit: "Apply to selected requests",
    operation: "bulk",
    children: 2,
    partial429: true
  });
  assert.deepEqual(
    tagsBody.rows.map((row) => row.sourceId),
    selected.map((row) => row.sourceId)
  );
  assert.deepEqual(
    tagsBody.rows.map((row) => row.expectedVersion),
    selected.map((row) => row.version)
  );
  await fieldsAre(save, { name: marker + " second sibling draft" });
  await clearSelection();
  ok(
    "A real two-child tags batch with one delivered row429 remains uncertain. Mixed HTTP200 then top-level429/503 and final confirmation preserve the exact parent bytes/key/account and both derived child receipts, with one tag effect per child."
  );

  const closeRows = await currentOrdinary(2);
  await selectRows(closeRows.map((row) => row.sourceId));
  await action().selectOption("status");
  await fill(bulk, {
    status: "RESOLVED",
    reason: marker + " original selected resolution"
  });
  const statusBody = await recover({
    owner: () => bulk,
    submit: "Apply to selected requests",
    operation: "bulk",
    children: 2,
    afterSaved: async (body) => {
      const current = await api();
      assert.ok(
        body.rows.every(
          (row) => !current.rows.some((now) => now.sourceId === row.sourceId)
        )
      );
      assert.equal(
        await bulk.count(),
        1,
        "All absent selected rows must not destroy the original controller"
      );
      await fieldsAre(bulk, {
        status: "RESOLVED",
        reason: marker + " original selected resolution"
      });
    }
  });
  assert.deepEqual(
    statusBody.rows.map((row) => row.sourceId),
    closeRows.map((row) => row.sourceId)
  );
  await clearSelection();
  await fieldsAre(save, { name: marker + " second sibling draft" });
  ok(
    "An accepted bulk resolution removes every selected row from the current open queue, yet the original ordered rows, versions, status/reason and controller survive. Exact retries confirm both original child receipts without another resolution."
  );

  const partialRows = await currentOrdinary(2);
  await selectRows(partialRows.map((row) => row.sourceId));
  await action().selectOption("tags");
  await fill(bulk, { tags: "partial-original-draft" });
  await serviceTransition(partialRows[0].sourceId);
  await fresh();
  await fieldsAre(bulk, { tags: "partial-original-draft" });
  assert.equal(
    await bulk
      .getByRole("button", { name: "Apply to selected requests", exact: true })
      .isDisabled(),
    true
  );
  const beforeMissing = browserWrites.length;
  await bulk.evaluate((node) => node.requestSubmit());
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done))
      )
  );
  assert.equal(browserWrites.length, beforeMissing);
  await blockedNavigation();
  assert.equal(
    await adopt(() => bulk).count(),
    0,
    "A missing selected row must not be silently replaced by current rows"
  );
  await discard(() => bulk).click();
  await ready();
  await clearSelection();
  await fieldsAre(save, { name: marker + " second sibling draft" });
  ok(
    "If one original row disappears while another remains, the unsent bulk draft is retained and fresh/native submission cannot drop that row. Deliberate bulk discard unlocks selection without losing the sibling saved-view draft."
  );

  const stale = (await currentOrdinary(1))[0];
  await selectRows([stale.sourceId]);
  await fill(bulk, { tags: "explicit-current-tags" });
  await adminCaseCommand(db, actor.token, {
    operation: "tags",
    sourceType: stale.sourceType,
    sourceId: stale.sourceId,
    expectedVersion: stale.version,
    requestKey: randomUUID(),
    tags: ["independent-current-tags"]
  });
  serviceEffects.push({ operation: "tags", id: stale.sourceId });
  let refreshed = sourceResponse();
  await bulk
    .getByRole("button", { name: "Apply to selected requests", exact: true })
    .click();
  await capturedWithin((await refreshed).finished(), "Conflict queue refresh");
  await ready();
  await adopt(() => bulk).waitFor();
  await fieldsAre(bulk, { tags: "explicit-current-tags" });
  assert.equal(await retry(() => bulk).count(), 0);
  const conflictBody = JSON.parse(browserWrites.at(-1).body);
  assert.equal(conflictBody.rows[0].expectedVersion, stale.version);
  await adopt(() => bulk).click();
  refreshed = sourceResponse();
  await bulk
    .getByRole("button", { name: "Apply to selected requests", exact: true })
    .click();
  await capturedWithin((await refreshed).finished(), "Adopted queue refresh");
  await ready();
  const adoptedBody = JSON.parse(browserWrites.at(-1).body);
  assert.equal(adoptedBody.rows[0].sourceId, stale.sourceId);
  assert.equal(adoptedBody.rows[0].expectedVersion, stale.version + 1);
  assert.notEqual(adoptedBody.requestKey, conflictBody.requestKey);
  assert.equal(
    (
      await db.supportCase.findUniqueOrThrow({ where: { id: stale.sourceId } })
    ).triageTags.join(),
    "explicit-current-tags"
  );
  await clearSelection();
  ok(
    "A definitive409 keeps the entered tags and requires explicit current-version adoption. Only the following deliberate submission uses a new key/current version for the same selected source."
  );

  // Save the sibling command once, lose its acknowledgment, then exercise warned local discard.
  let uncertainBody;
  const remove = register(command, async (route) => {
    uncertainBody = route.request().postData();
    const response = await route.fetch();
    assert.equal(response.status(), 200, await response.text());
    return route.abort("failed");
  });
  try {
    await save
      .getByRole("button", { name: "Save private view", exact: true })
      .click();
    await retry(() => save).waitFor();
  } finally {
    remove();
  }
  const preserved = await verifyOriginal(uncertainBody, 0);
  await fresh();
  dialogAccept = false;
  await discard(() => save).click();
  assert.match(dialogs.at(-1).message, /may already be saved/);
  await retry(() => save).waitFor();
  dialogAccept = true;
  await discard(() => save).click();
  await ready();
  await fieldsAre(save, { name: "" });
  await save
    .getByRole("status")
    .filter({ hasText: "Local entries discarded. Saved changes remain." })
    .waitFor();
  assert.deepEqual(await verifyOriginal(uncertainBody, 0), preserved);
  await fill(filters, {
    q: "",
    type: "ALL",
    state: "ALL",
    priority: "ALL",
    owner: "ALL",
    age: "ALL",
    churchId: "",
    topicId: "",
    tag: "",
    due: false
  });
  await button("Apply filters").click();
  await page.waitForURL(
    (url) =>
      url.pathname === "/platform/admin/requests" &&
      url.searchParams.get("state") === "ALL"
  );
  await ready();
  assert.equal(
    await page.evaluate(() => window.__worklistDocument),
    undefined,
    "Clean native filters open a fresh document"
  );
  const next = page.getByRole("link", { name: "Next requests", exact: true });
  await next.waitFor();
  const nextHref = await next.getAttribute("href"),
    nextUrl = new URL(nextHref, config.origin);
  assert.equal(nextUrl.pathname, "/platform/admin/requests");
  assert.equal(nextUrl.searchParams.get("state"), "ALL");
  assert.ok(nextUrl.searchParams.get("after"));
  await next.click();
  await page.waitForURL((url) => !!url.searchParams.get("after"));
  await ready();
  await page.waitForFunction(
    () => document.querySelectorAll('a[id^="request-"]').length === 2
  );
  const currentLink = page.locator('a[id^="request-"]').first(),
    href = await currentLink.getAttribute("href"),
    returnTo = new URL(href, config.origin).searchParams.get("returnTo");
  assert.ok(returnTo.startsWith("/platform/admin/requests?"));
  assert.match(returnTo, /#request-/);
  await page.goto(config.origin + returnTo);
  await ready();
  const focusedId = new URL(returnTo, config.origin).hash.slice(1);
  await page.waitForFunction(
    (id) => document.activeElement?.id === id,
    focusedId
  );
  section = "feedback";
  for (const [suffix, headers] of [
    ["", {}],
    ["?_rsc=feedback-worklist-privacy", { RSC: "1" }]
  ]) {
    const response = await context.request.get(
      config.origin + "/platform/admin/feedback" + suffix,
      { headers }
    );
    assert.equal(response.status(), 200);
    assert.ok(!(await response.text()).includes(marker));
  }
  await page.goto(config.origin + "/platform/admin/feedback");
  await ready();
  await fieldsAre(filters, { type: "FEEDBACK" });
  assert.equal(
    await page.locator('a[id="request-' + feedbackCaseId + '"]').count(),
    1
  );
  assert.equal(await page.locator('a[id^="request-"]').count(), 1);
  await openDetails("My saved views");
  await fill(save, { name: marker + " feedback unsent view" });
  await event("pagehide");
  await absent("Feedback worklist pagehide");
  await resume("pageshow");
  await fieldsAre(save, { name: marker + " feedback unsent view" });
  await fieldsAre(filters, { type: "FEEDBACK" });
  await discard(() => save).click();
  await ready();
  ok(
    "Canceling then confirming an uncertain saved-view discard preserves the real audit. Clean native filters open a fresh document; existing pagination keeps the canonical Requests filters/cursor and return-focus anchor. The shared Feedback worklist omits private HTML/RSC and retains its FEEDBACK type and draft through physical concealment."
  );

  const effects = await ownedEffects();
  assert.equal(browserWrites.length, 19);
  assert.deepEqual(effects, { admin: 8, support: 3 });
  assert.equal(
    await db.supportOperation.count({ where: { actorId: requester.id } }),
    27
  );
  assert.ok(
    browserWrites.every(
      (row) =>
        row.method === "POST" &&
        row.path === "/api/platform/admin" &&
        row.owner === actor.id
    )
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(routeErrors, []);
  assert.deepEqual(externalRequests, []);
  const sinkFiles = readdirSync(resolve(fixtureDir, "sink")).filter(
    (file) => !sinkBefore.has(file)
  );
  assert.equal(sinkFiles.length, 3);
  write("result.json", {
    results,
    observations,
    recoveries,
    browserWrites,
    requests,
    captures,
    dialogs,
    errors,
    routeErrors,
    externalRequests,
    node: { version: process.version, execPath: process.execPath },
    build: readFileSync(resolve(".next/BUILD_ID"), "utf8").trim(),
    candidate: process.cwd(),
    fixtureOnly: true,
    fixtureEffects: {
      actors: 3,
      respondGrants: 1,
      ordinaryRequests: 26,
      datedOwnPaginationRows: 26,
      feedbackSubmissions: 1,
      requesterCreateOperations: 27,
      serviceEffects,
      adminOperations: effects.admin,
      responderSupportOperations: effects.support,
      browserPostAttempts: browserWrites.length,
      responderRevokeRestoreUpdates: 2,
      deliberatelyReassignedOwnCaseRowsAfterRenewal: 27,
      renewedResponderVersion: renewedGrant.version,
      intakeTemporaryAndRestoreWrites: 2,
      localVerificationSinkFiles: sinkFiles
    },
    productionWrites: 0,
    limitations: [
      "The second child429 is an explicit acknowledgment simulation around two actual accepted tag effects; top-level429/503 and lost responses are transport simulations.",
      "All ten filters are checked; church/topic use their actual empty permitted values in this responder-only fixture.",
      "Each ordinary pagination row is created by the real service, then only that owned fictional row is dated three days earlier. The real five-request daily intake limit remains enabled.",
      "Synthetic lifecycle events do not establish physical-device or operating-system snapshot behavior.",
      "Real responder revocation and renewal advance the grant generation. Only this run's27 fictional owned case assignments are deliberately set to the actual renewed generation; this is fixture reassignment, not automatic application restoration.",
      "Shared AdminForm owners outside worklists retain their separate full regression suites."
    ]
  });
  console.log("ADMIN_WORKLIST_PRIVACY_BROWSER_PASS " + results.length);
};
try {
  await Promise.race([run(), routingFailure]);
} catch (error) {
  await page
    .screenshot({ path: resolve(output, "failure.png"), fullPage: true })
    .catch(() => {});
  write("failure.json", {
    message: String(error),
    stack: error.stack,
    results,
    observations,
    recoveries,
    browserWrites,
    requests,
    captures,
    dialogs,
    errors,
    routeErrors,
    externalRequests,
    actorId: actor?.id,
    requesterId: requester?.id,
    caseIds,
    serviceEffects
  });
  throw error;
} finally {
  for (const release of releases) release();
  try {
    if (grantRevoked)
      await db.supportCapabilityGrant.update({
        where: { id: respondGrant.id },
        data: { revokedAt: respondGrant.revokedAt }
      });
    if (respondGrant) {
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
      else
        await db.supportIntakeSetting.deleteMany({
          where: { id: "default", ownerGrantId: respondGrant.id }
        });
    }
    const restoredIntake = await db.supportIntakeSetting.findUnique({
      where: { id: "default" }
    });
    assert.deepEqual(restoredIntake, originalIntake);
    write("cleanup.json", {
      at: new Date().toISOString(),
      originalIntake,
      restoredIntake,
      exactIntakeRestorationVerified: true,
      createdCaseIds: caseIds,
      actorId: actor?.id,
      requesterId: requester?.id,
      replacementId: replacement?.id
    });
  } finally {
    await browser.close();
    await db.$disconnect();
  }
}
