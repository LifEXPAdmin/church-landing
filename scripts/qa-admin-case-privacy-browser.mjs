import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
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
const { adminCaseCommand } = await load("lib/platform/admin-cases.ts");
const output = resolve(fixtureDir, "admin-case-privacy-browser-" + Date.now());
mkdirSync(output, { recursive: true, mode: 0o700 });
const originalIntake = await db.supportIntakeSetting.findUnique({
  where: { id: "default" }
});
const sinkBefore = new Set(readdirSync(resolve(fixtureDir, "sink")));
const marker = "Private case " + randomUUID().slice(0, 8);
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
const fixtureEffects = {
  actors: 0,
  respondGrants: 0,
  requesterCreates: 0,
  grantRevokeRestoreUpdates: 0,
  explicitlyReassignedOwnRows: 0,
  intakeWrites: 0
};
const rules = [],
  releases = new Set();
let rejectRouting,
  actor,
  requester,
  replacement,
  respondGrant,
  replacementGrant,
  grantRevoked = false,
  dialogAccept = true,
  currentId,
  initialNoteId;
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
    fixtureEffects,
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
const adminCommand = (url) =>
  url.pathname === "/api/platform/admin" && !url.search;
const nativeCommand = (url) =>
  url.pathname === "/api/platform/support" && !url.search;
const identity = (url) =>
  url.pathname === "/api/platform/profile" &&
  url.searchParams.get("view") === "identity";
const source = (url) =>
  url.pathname === "/api/platform/admin" &&
  url.searchParams.get("view") === "detail";
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
  await form("Save internal note").waitFor();
  await button("Refresh current view").waitFor();
};
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
const api = async (id = currentId) => {
  const response = await context.request.get(
    config.origin +
      "/api/platform/admin?" +
      new URLSearchParams({
        view: "detail",
        sourceType: "SUPPORT",
        sourceId: id
      }),
    { headers: { "X-Expected-Account": actor.id } }
  );
  assert.equal(response.status(), 200, await response.text());
  assert.match(response.headers()["cache-control"], /no-store/);
  return response.json();
};
const routePath = (id) =>
  "/platform/admin/cases/SUPPORT/" +
  id +
  "?returnTo=" +
  encodeURIComponent("/platform/admin/requests?state=ALL#request-" + id);
const go = async (id) => {
  currentId = id;
  await page.goto(config.origin + routePath(id));
  await ready();
};
const adminRetry = (owner) =>
  owner().getByRole("button", { name: "Retry original action", exact: true });
const adminDiscard = (owner) =>
  owner().getByRole("button", { name: "Discard local entries", exact: true });
const adminAdopt = (owner) =>
  owner().getByRole("button", {
    name: "Use current version with these entries",
    exact: true
  });
const submit = (name) => form(name).getByRole("button", { name, exact: true });
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
const absent = async (label) => {
  await page.waitForFunction(
    ({ marker, ids, requesterName }) => {
      const root = document.body;
      const presentation = root.cloneNode(true);
      presentation.querySelectorAll("script").forEach((node) => node.remove());
      return (
        !!root &&
        !root.textContent.includes(marker) &&
        !root.textContent.includes(requesterName) &&
        !ids.some((id) => presentation.textContent.includes(id)) &&
        !root.querySelector(
          '[name="nextAction"],[name="body"],[name="steps"],[name="relatedSourceId"],[name="reason"]'
        ) &&
        ![...root.querySelectorAll("[href],[aria-label],[value]")].some(
          (node) =>
            ["href", "aria-label", "value"].some((key) => {
              const value = node.getAttribute(key) ?? "";
              return (
                value.includes(marker) ||
                value.includes("fixture-only/private-case") ||
                ids.some((id) => value.includes(id))
              );
            })
        )
      );
    },
    { marker, ids: caseIds, requesterName: requester.name }
  );
  observations.push({
    label,
    physicalPrivateDomAbsent: true,
    browserWrites: browserWrites.length
  });
  progress(label);
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
        message: "Fictional failed current case read"
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
const originalReceipt = async (body, native = false) => {
  const data = JSON.parse(body),
    model = native ? db.supportOperation : db.adminOperation;
  const rows = await model.findMany({
    where: { actorId: actor.id, requestKey: data.requestKey }
  });
  assert.equal(rows.length, 1);
  if (!native) assert.equal(rows[0].action, data.operation);
  return rows;
};
const settle = async (owner) => {
  if (await owner().count())
    await page.waitForFunction(
      (name) => {
        const node = [...document.querySelectorAll("form")].find(
          (n) => n.getAttribute("aria-label") === name
        );
        return !node || node.getAttribute("aria-busy") !== "true";
      },
      await owner().getAttribute("aria-label")
    );
};
const clickAndRefresh = async (
  target,
  owner = () => form("Save internal note")
) => {
  const next = sourceResponse();
  await target.click();
  await (await next).json();
  await ready();
  await settle(owner);
};
const revokeAndRenew = async () => {
  const before = await db.supportCapabilityGrant.findUniqueOrThrow({
    where: { id: respondGrant.id }
  });
  await db.supportCapabilityGrant.update({
    where: { id: respondGrant.id },
    data: { revokedAt: new Date() }
  });
  grantRevoked = true;
  fixtureEffects.grantRevokeRestoreUpdates++;
  const denied = page.waitForResponse(
    (response) =>
      source(new URL(response.url())) &&
      [401, 403, 404].includes(response.status())
  );
  await event("focus");
  await denied;
  await absent("actual RESPOND revocation");
  const count = browserWrites.length;
  assert.equal(await button("Retry original action").count(), 0);
  assert.equal(browserWrites.length, count);
  const renewed = await db.supportCapabilityGrant.update({
    where: { id: respondGrant.id },
    data: { revokedAt: null }
  });
  grantRevoked = false;
  fixtureEffects.grantRevokeRestoreUpdates++;
  assert.equal(renewed.version, before.version + 2);
  const rows = await db.supportCase.updateMany({
    where: {
      id: { in: caseIds },
      requesterId: requester.id,
      ownerGrantId: respondGrant.id
    },
    data: { ownerGrantVersion: renewed.version }
  });
  assert.equal(rows.count, caseIds.length);
  fixtureEffects.explicitlyReassignedOwnRows += rows.count;
  respondGrant = renewed;
  write("grant-renewal.json", {
    before: { id: before.id, version: before.version },
    renewed: { id: renewed.id, version: renewed.version },
    explicitlyReassignedOwnRows: rows.count,
    automaticApplicationRestoration: false
  });
  await resume();
};
// A real accepted command loses its acknowledgment. Failed retries never create
// effects; the fourth identical request receives the existing receipt.
const recover = async ({
  owner,
  name,
  operation,
  native = false,
  afterSaved = async () => {},
  afterConfirmed = async () => {},
  revoke = false
}) => {
  const attempts = [],
    statuses = [],
    before = await ownedEffects();
  const matches = native ? nativeCommand : adminCommand;
  let concealed = false;
  const retry = () =>
    native
      ? concealed
        ? button("Confirm original request: " + name)
        : owner().getByRole("button", {
            name: "Retry original request",
            exact: true
          })
      : adminRetry(owner);
  const remove = register(matches, async (route) => {
    const request = route.request();
    attempts.push({
      body: request.postData(),
      owner: request.headers()["x-expected-account"]
    });
    assert.equal(JSON.parse(request.postData()).operation, operation);
    const status =
      attempts.length === 2 ? 429 : attempts.length === 3 ? 503 : 200;
    statuses.push(status);
    if (status !== 200)
      return route.fulfill({
        status,
        contentType: "application/json",
        headers: status === 429 ? { "retry-after": "1" } : {},
        body: JSON.stringify({ message: "Fictional case response " + status })
      });
    const response = await route.fetch();
    assert.equal(response.status(), 200, await response.text());
    if (attempts.length === 1) return route.abort("failed");
    return route.fulfill({ response });
  });
  try {
    await owner().getByRole("button", { name, exact: true }).click();
    await retry().waitFor();
    const receipt = await originalReceipt(attempts[0].body, native),
      body = JSON.parse(attempts[0].body);
    assert.equal(body[native ? "caseId" : "sourceId"], currentId);
    await fresh();
    if (native) concealed = true;
    await afterSaved(body);
    await retry().waitFor();
    await event("pagehide");
    await absent(operation + " pending pagehide");
    await resume("pageshow");
    await retry().waitFor();
    if (revoke) {
      const count = browserWrites.length;
      await signIn(replacement);
      await retry().click();
      await absent("pending note account replacement");
      assert.equal(browserWrites.length, count);
      await signIn(actor);
      await resume();
      await revokeAndRenew();
      await retry().waitFor();
    }
    for (const status of [429, 503]) {
      const delivered = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          matches(new URL(response.url())) &&
          response.status() === status
      );
      await retry().click();
      await delivered;
      if (concealed)
        await page
          .getByRole("alert")
          .filter({ hasText: "We could not confirm the original request" })
          .waitFor();
      else
        await owner()
          .getByText("Fictional case response " + status, { exact: true })
          .waitFor();
      await page.waitForFunction(
        (name) => {
          const b = [...document.querySelectorAll("button")].find(
            (node) =>
              node.getAttribute("aria-label") === name ||
              node.textContent === name
          );
          return !!b && !b.disabled;
        },
        concealed
          ? "Confirm original request: " + name
          : native
            ? "Retry original request"
            : "Retry original action"
      );
      assert.deepEqual(
        await originalReceipt(attempts[0].body, native),
        receipt
      );
    }
    const confirmed = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          matches(new URL(response.url())) &&
          response.request().postData() === attempts[0].body &&
          response.status() === 200
      ),
      updated = sourceResponse();
    await retry().click();
    await capturedWithin(
      (await confirmed).json(),
      "Original command acknowledgment"
    );
    await capturedWithin((await updated).json(), "Fresh case read");
    await ready();
    await settle(owner);
    await afterConfirmed(body);
    assert.equal(attempts.length, 4);
    assert.deepEqual(statuses, [200, 429, 503, 200]);
    assert.ok(
      attempts.every(
        (row) => row.body === attempts[0].body && row.owner === actor.id
      )
    );
    assert.deepEqual(await originalReceipt(attempts[0].body, native), receipt);
    const after = await ownedEffects();
    assert.deepEqual(after, {
      admin: before.admin + (native ? 0 : 1),
      support: before.support + (native ? 1 : 0)
    });
    recoveries.push({
      operation,
      attempts,
      statuses,
      receiptIds: receipt.map((row) => row.id),
      before,
      after
    });
    progress(operation + " exact recovery complete");
    return body;
  } finally {
    remove();
  }
};
const fit = async (width, enlarged = false) => {
  await page.setViewportSize({ width, height: 844 });
  const style = enlarged
    ? await page.addStyleTag({ content: "html{font-size:200%!important}" })
    : null;
  const name = "case" + "-" + width + (enlarged ? "-font-200" : "");
  try {
    const targets = [
      ["triage", form("Save triage details").locator('[name="nextAction"]')],
      ["note", submit("Save internal note")],
      ["native-reply", submit("Save reply")]
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
    originalIntake,
    candidate: process.cwd(),
    build: readFileSync(resolve(".next/BUILD_ID"), "utf8").trim(),
    pid: process.pid
  });
  progress("fictional setup");
  actor = await createPortalActor(db, "caseprivrev");
  fixtureEffects.actors++;
  requester = await createPortalActor(db, "caseprivreq");
  fixtureEffects.actors++;
  replacement = await createPortalActor(db, "caseprivswap");
  fixtureEffects.actors++;
  respondGrant = await db.supportCapabilityGrant.create({
    data: { userId: actor.id, capability: "RESPOND" }
  });
  fixtureEffects.respondGrants++;
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
  fixtureEffects.intakeWrites++;
  for (const name of ["original", "related", "handoff"]) {
    const result = await supportCommand(
      db,
      requester.token,
      await requestInput(db, requester.token, {
        subject: marker + " " + name + " subject",
        description: marker + " " + name + " conversation"
      })
    );
    caseIds.push(result.caseId);
    fixtureEffects.requesterCreates++;
  }
  currentId = caseIds[0];
  const serviceAdmin = async (operation, fields = {}) => {
    const beforeReceipts = await db.adminOperation.count({
      where: { actorId: actor.id }
    });
    const before = await db.supportCase.findUniqueOrThrow({
      where: { id: currentId }
    });
    const result = await adminCaseCommand(db, actor.token, {
      operation,
      sourceType: "SUPPORT",
      sourceId: currentId,
      expectedVersion: before.version,
      requestKey: randomUUID(),
      ...fields
    });
    serviceEffects.push({
      operation,
      caseId: currentId,
      version: result.version,
      adminReceiptsCreated:
        (await db.adminOperation.count({ where: { actorId: actor.id } })) -
        beforeReceipts
    });
    return result;
  };
  await serviceAdmin("note", { body: marker + " saved internal note" });
  initialNoteId = (
    await db.adminCaseNote.findFirstOrThrow({
      where: { supportCaseId: currentId, body: marker + " saved internal note" }
    })
  ).id;
  await serviceAdmin("group", {
    relatedSourceType: "SUPPORT",
    relatedSourceId: caseIds[1],
    relatedVersion: 1,
    title: marker + " private group",
    engineeringUrl: "https://github.com/fixture-only/private-case/issues/22"
  });
  await signIn(actor);
  for (const [suffix, headers] of [
    ["", {}],
    ["&_rsc=case-privacy", { RSC: "1" }]
  ]) {
    const response = await context.request.get(
      config.origin + routePath(currentId) + suffix,
      { headers }
    );
    assert.equal(response.status(), 200);
    const text = await response.text();
    assert.equal(text.includes(marker), false);
    assert.equal(text.includes("fixture-only/private-case"), false);
  }
  const original = await api();
  assert.equal(original.row.sourceId, currentId);
  assert.ok(original.notes.some((note) => note.id === initialNoteId));
  assert.equal(original.group.title, marker + " private group");
  assert.equal(
    original.support.detail.description,
    marker + " original conversation"
  );
  await go(currentId);
  for (const title of [
    "Priority, next action and reminder",
    "Bug reproduction and engineering link",
    "Link another original request"
  ])
    await openDetails(title);
  const drafts = [
    [
      "Save triage details",
      {
        priority: "HIGH",
        nextAction: marker + " unsent triage",
        tags: "private22, pending",
        reminderAt: ""
      }
    ],
    ["Save internal note", { body: marker + " unsent note" }],
    [
      "Save reproduction details",
      {
        steps: marker + " unsent bug steps",
        expected: marker + " expected",
        actual: marker + " observed",
        environment: marker + " browser",
        reproducibility: "REPRODUCED",
        engineeringUrl: "https://github.com/fixture-only/private-case/issues/23"
      }
    ],
    [
      "Link original requests",
      {
        relatedSourceType: "SUPPORT",
        relatedSourceId: caseIds[2],
        relatedVersion: "1",
        title: marker + " unsent group title",
        engineeringUrl: ""
      }
    ],
    ["Save reply", { body: marker + " unsent native reply" }]
  ];
  for (const [name, fields] of drafts) await fill(form(name), fields);
  const draftsRestored = async () => {
    for (const [name, fields] of drafts) await fieldsAre(form(name), fields);
  };
  for (const [hide, show] of [
    ["blur", "focus"],
    ["offline", "online"],
    ["pagehide", "pageshow"]
  ]) {
    await event(hide);
    await absent(hide);
    await resume(show);
    await draftsRestored();
  }
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden"
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await absent("document hidden");
  await page.evaluate(() => {
    delete document.visibilityState;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await ready();
  await draftsRestored();
  await signIn(replacement);
  await event("focus");
  await absent("same-page account replacement");
  await signIn(actor);
  await resume();
  await draftsRestored();
  await failedAndHeld(identity);
  await draftsRestored();
  await failedAndHeld(source);
  await draftsRestored();
  assert.equal(browserWrites.length, 0);
  ok(
    "Initial HTML/RSC omit private case content; the authorized no-store API and browser render the actual case. Five independent form drafts survive physical DOM removal across blur, offline, pagehide, hidden document, replacement account, failed/held identity and source reads, and late read delivery."
  );

  for (const size of [
    [390, false],
    [320, false],
    [320, true]
  ])
    await fit(...size);
  for (const [name] of drafts.slice(0, 4))
    await clickAndRefresh(
      adminDiscard(() => form(name)),
      () => form(name)
    );
  await form("Save reply")
    .getByRole("button", { name: "Discard local entries", exact: true })
    .click();
  await fieldsAre(form("Save reply"), { body: "" });
  await fieldsAre(form("Save internal note"), { body: "" });
  ok(
    "Nine viewport captures use actual Tab/Shift+Tab focus and verify visible focus indication, target center hit-testing, full placement above the platform navigation and zero horizontal overflow at390/320/320 with200% root text. Deliberate draft discard resets only the selected owner."
  );

  // A same-topology refresh adopts a new version only after the user chooses it.
  const noteDraft = marker + " retained note while native reply saves",
    replyDraft = marker + " accepted same-topology reply";
  await fill(form("Save internal note"), { body: noteDraft });
  await fill(form("Save reply"), { body: replyDraft });
  await serviceAdmin("triage", {
    priority: "HIGH",
    nextAction: marker + " current service triage",
    tags: [],
    reminderAt: ""
  });
  const current = await fresh();
  await fieldsAre(form("Save internal note"), { body: noteDraft });
  await fieldsAre(form("Save reply"), { body: replyDraft });
  await adminAdopt(() => form("Save internal note")).waitFor();
  const nativeAdopt = form("Save reply").getByRole("button", {
    name: "Use current request with these entries",
    exact: true
  });
  await nativeAdopt.waitFor();
  assert.equal(await submit("Save reply").isDisabled(), true);
  const beforePosts = browserWrites.length;
  await form("Save reply").evaluate((node) => node.requestSubmit());
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done))
      )
  );
  assert.equal(
    browserWrites.length,
    beforePosts,
    "Refresh never silently adopts a dirty command version"
  );
  await nativeAdopt.click();
  const acceptedReply = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        nativeCommand(new URL(response.url())) &&
        response.status() === 200
    ),
    replyRead = sourceResponse();
  await submit("Save reply").click();
  const replyRequest = (await acceptedReply).request();
  await (await replyRead).json();
  await ready();
  await fieldsAre(form("Save reply"), { body: "" });
  await page
    .locator("p")
    .filter({ hasText: new RegExp("^" + replyDraft + "$") })
    .waitFor();
  await fieldsAre(form("Save internal note"), { body: noteDraft });
  const submittedReply = JSON.parse(replyRequest.postData());
  assert.equal(submittedReply.expectedVersion, current.row.version);
  assert.equal(submittedReply.body, replyDraft);
  assert.equal(submittedReply.caseId, currentId);
  assert.equal(
    await db.supportMessage.count({
      where: { caseId: currentId, authorId: actor.id, body: replyDraft }
    }),
    1
  );
  await adminAdopt(() => form("Save internal note")).click();
  const noteBody = await recover({
    owner: () => form("Save internal note"),
    name: "Save internal note",
    operation: "note",
    revoke: true,
    afterSaved: async (body) => {
      assert.equal(body.body, noteDraft);
      await fieldsAre(form("Save internal note"), { body: noteDraft });
    },
    afterConfirmed: async () => {
      await fieldsAre(form("Save internal note"), { body: "" });
    }
  });
  assert.equal(
    await db.adminCaseNote.count({
      where: { supportCaseId: currentId, body: noteDraft }
    }),
    1
  );
  assert.equal(
    JSON.stringify(
      await readSupport(db, requester.token, "detail", { caseId: currentId })
    ).includes(noteDraft),
    false
  );
  assert.equal(noteBody.sourceId, currentId);
  ok(
    "Current same-topology refresh keeps both Admin and native dirty fields; only explicit current-version adoption permits a fresh reply. The note then survives real lost acknowledgment, account replacement, real RESPOND revocation/renewal, pagehide,429 and503 with four identical owner/body/key requests and one private note receipt; requester projection excludes it."
  );

  const initialNote = page.locator("li").filter({
    has: page.getByText(marker + " saved internal note", { exact: true })
  });
  await initialNote
    .locator("summary")
    .filter({ hasText: "Redact private information" })
    .click();
  const redactOwner = () =>
    page.getByRole("form", {
      name: /^(Redact this internal note|Confirm earlier note redaction)$/
    });
  await fill(redactOwner(), { reason: "PRIVATE_INFORMATION" });
  await recover({
    owner: redactOwner,
    name: "Redact this internal note",
    operation: "redact-note",
    afterSaved: async (body) => {
      assert.equal(body.noteId, initialNoteId);
      await form("Confirm earlier note redaction").waitFor();
      const note = await db.adminCaseNote.findUniqueOrThrow({
        where: { id: initialNoteId }
      });
      assert.ok(note.redactedAt);
      assert.equal(note.body, "[Removed for privacy.]");
      assert.equal(
        (await page.locator("body").textContent()).includes(
          marker + " saved internal note"
        ),
        false
      );
    },
    afterConfirmed: async () => {
      await form("Confirm earlier note redaction").waitFor({
        state: "detached"
      });
    }
  });
  await recover({
    owner: () => form("Ungroup this request"),
    name: "Ungroup this request",
    operation: "ungroup",
    afterSaved: async () => {
      assert.equal((await api()).group, null);
      assert.equal(
        (await db.supportCase.findUniqueOrThrow({ where: { id: currentId } }))
          .adminGroupId,
        null
      );
      assert.equal(
        (await page.locator("body").textContent()).includes(
          marker + " private group"
        ),
        false
      );
    }
  });
  assert.equal(
    (await db.supportCase.findUniqueOrThrow({ where: { id: caseIds[1] } }))
      .requesterId,
    requester.id
  );
  ok(
    "An actually saved note redaction keeps its generic earlier-note command owner after current content is redacted; ungroup keeps its original owner after the group disappears. Each lost acknowledgment survives current reads/pagehide/429/503 and four identical requests acknowledge exactly one existing Admin effect."
  );

  const closureSibling = marker + " unsent Admin sibling during closure";
  await fill(form("Save internal note"), { body: closureSibling });
  await fill(form("Save status"), {
    status: "CLOSED",
    reason: "Fictional verified final closure"
  });
  await recover({
    owner: () => form("Save status"),
    name: "Save status",
    operation: "transition",
    native: true,
    afterSaved: async (body) => {
      assert.equal(body.status, "CLOSED");
      const current = await api();
      assert.equal(current.support.detail.status, "CLOSED");
      await form("Save status").waitFor({ state: "detached" });
      await form("Save reply").waitFor({ state: "detached" });
      assert.equal(
        await page
          .locator(
            '[aria-labelledby="admin-requester-history"] input,[aria-labelledby="admin-requester-history"] textarea,[aria-labelledby="admin-requester-history"] select'
          )
          .count(),
        0
      );
      await button("Confirm original request: Save status").waitFor();
      await button("Discard local entries: Save status").waitFor();
      await fieldsAre(form("Save internal note"), { body: closureSibling });
    },
    afterConfirmed: async () => {
      await button("Confirm original request: Save status").waitFor({
        state: "detached"
      });
      await fieldsAre(form("Save internal note"), { body: closureSibling });
    }
  });
  await clickAndRefresh(adminDiscard(() => form("Save internal note")));
  ok(
    "A real accepted native CLOSED transition freezes the old native topology: reply/status fields disappear while the original labeled recovery remains.429/503 retries keep exact case/version/reason/key/account and one Support receipt; the independent unsent Admin sibling survives confirmation."
  );

  await go(caseIds[1]);
  const discardedNote = marker + " saved despite local retry discard";
  await fill(form("Save internal note"), { body: discardedNote });
  let discardedBody;
  const removeLostNote = register(adminCommand, async (route) => {
    discardedBody = route.request().postData();
    const response = await route.fetch();
    assert.equal(response.status(), 200, await response.text());
    return route.abort("failed");
  });
  try {
    await submit("Save internal note").click();
    await adminRetry(() => form("Save internal note")).waitFor();
  } finally {
    removeLostNote();
  }
  const savedBeforeDiscard = await originalReceipt(discardedBody);
  await fresh();
  dialogAccept = false;
  await adminDiscard(() => form("Save internal note")).click();
  assert.match(dialogs.at(-1).message, /may already be saved/);
  await adminRetry(() => form("Save internal note")).waitFor();
  dialogAccept = true;
  await clickAndRefresh(adminDiscard(() => form("Save internal note")));
  await fieldsAre(form("Save internal note"), { body: "" });
  await form("Save internal note")
    .getByRole("status")
    .filter({ hasText: "Local entries discarded. Saved changes remain." })
    .waitFor();
  assert.deepEqual(await originalReceipt(discardedBody), savedBeforeDiscard);
  assert.equal(
    await db.adminCaseNote.count({
      where: { supportCaseId: currentId, body: discardedNote }
    }),
    1
  );
  ok(
    "Canceling uncertain note discard retains the exact retry. Confirming discards only this browser's pending entries, returns an accessible success status and leaves the one actually saved note and audit receipt intact."
  );

  // The native failure's explicit reload intent must not bypass a dirty Admin
  // sibling, and discarding that failed form must not claim a successful save.
  const reloadSibling = marker + " Admin sibling across native local reload";
  const failedReply = marker + " failed reply deliberately discarded";
  await fill(form("Save internal note"), { body: reloadSibling });
  await fill(form("Save reply"), { body: failedReply });
  await page.evaluate(() => {
    window.__caseReloadDocument = "original";
  });
  const beforeFailedReply = await ownedEffects(),
    sameDocument = page.url();
  await serviceAdmin("triage", {
    priority: "HIGH",
    nextAction: marker + " second current triage",
    tags: [],
    reminderAt: ""
  });
  const failedReplyResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      nativeCommand(new URL(response.url())) &&
      response.status() === 409
  );
  await submit("Save reply").click();
  await failedReplyResponse;
  const loadLatest = form("Save reply").getByRole("button", {
    name: "Load the latest page (clears this draft)",
    exact: true
  });
  await loadLatest.waitFor();
  await fieldsAre(form("Save reply"), { body: failedReply });
  const latestRead = sourceResponse();
  await loadLatest.click();
  await (await latestRead).json();
  await ready();
  assert.match(dialogs.at(-1).message, /discard local entries/);
  await fieldsAre(form("Save reply"), { body: "" });
  await fieldsAre(form("Save internal note"), { body: reloadSibling });
  await form("Save reply")
    .getByRole("status")
    .filter({
      hasText: "Local entries discarded. Previously saved changes remain."
    })
    .waitFor();
  await loadLatest.waitFor({ state: "detached" });
  assert.equal(page.url(), sameDocument);
  assert.equal(
    await page.evaluate(() => window.__caseReloadDocument),
    "original"
  );
  await page
    .getByRole("status")
    .filter({
      hasText:
        "That form’s local entries were discarded. Other local entries remain on this page"
    })
    .waitFor();
  assert.equal(
    (await page.locator("body").textContent()).includes(
      "That request was saved. Other local entries remain"
    ),
    false
  );
  assert.equal(
    await db.supportMessage.count({
      where: { caseId: currentId, authorId: actor.id, body: failedReply }
    }),
    0
  );
  assert.deepEqual(await ownedEffects(), {
    admin: beforeFailedReply.admin + 1,
    support: beforeFailedReply.support
  });
  await clickAndRefresh(adminDiscard(() => form("Save internal note")));
  ok(
    "A genuinely rejected stale-version native reply can deliberately load current information without navigating away from its Admin sibling. Only the failed reply clears; its message truthfully describes local discard, the sibling remains, and no reply effect is created."
  );

  await go(caseIds[2]);
  const other = await db.supportCase.findUniqueOrThrow({
    where: { id: caseIds[1] }
  });
  await serviceAdmin("group", {
    relatedSourceType: "SUPPORT",
    relatedSourceId: caseIds[1],
    relatedVersion: other.version,
    title: marker + " stale ungroup fixture",
    engineeringUrl: ""
  });
  await fresh();
  await form("Ungroup this request").waitFor();
  await serviceAdmin("ungroup");
  const staleUngroup = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      adminCommand(new URL(response.url())) &&
      response.status() === 409
  );
  await submit("Ungroup this request").click();
  await staleUngroup;
  await adminAdopt(() => form("Ungroup this request")).waitFor();
  const ungroupCurrent = await fresh();
  assert.equal(ungroupCurrent.group, null);
  await form("Ungroup this request").waitFor();
  await adminDiscard(() => form("Ungroup this request")).waitFor();
  assert.equal(await submit("Ungroup this request").isDisabled(), true);
  const beforeUngroupDiscard = browserWrites.length;
  await clickAndRefresh(
    adminDiscard(() => form("Ungroup this request")),
    () => form("Ungroup this request")
  );
  await form("Ungroup this request").waitFor({ state: "detached" });
  assert.equal(browserWrites.length, beforeUngroupDiscard);
  ok(
    "A no-field ungroup rejected with a real409 remains recoverable after current group=null. Its retained conflict owner offers deliberate discard; discard clears that owner without adopting or sending a new action."
  );

  replacementGrant = await db.supportCapabilityGrant.create({
    data: { userId: replacement.id, capability: "RESPOND" }
  });
  fixtureEffects.respondGrants++;
  await go(caseIds[2]);
  const handoffDraft = marker + " unsent Admin note across real handoff",
    handoffUrl = page.url();
  await fill(form("Save internal note"), { body: handoffDraft });
  await page.evaluate(() => {
    window.__caseOriginalDocument = "retained";
  });
  await fill(form("Hand off request"), {
    ownerChoice: replacementGrant.id + ":" + replacementGrant.version
  });
  const handed = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      nativeCommand(new URL(response.url())) &&
      response.status() === 200
  );
  const denied = page.waitForResponse(
    (response) =>
      source(new URL(response.url())) &&
      [401, 403, 404].includes(response.status())
  );
  await submit("Hand off request").click();
  const handoffRequest = (await handed).request();
  await denied;
  await absent("current source authority lost after actual handoff");
  assert.equal(page.url(), handoffUrl);
  assert.equal(
    await page.evaluate(() => window.__caseOriginalDocument),
    "retained"
  );
  const handedBody = JSON.parse(handoffRequest.postData());
  assert.equal(handedBody.caseId, currentId);
  assert.equal(handedBody.ownerGrantId, replacementGrant.id);
  assert.equal(handedBody.ownerGrantVersion, replacementGrant.version);
  assert.equal(
    (await db.supportCase.findUniqueOrThrow({ where: { id: currentId } }))
      .ownerGrantId,
    replacementGrant.id
  );
  const restored = await db.supportCase.updateMany({
    where: {
      id: currentId,
      requesterId: requester.id,
      ownerGrantId: replacementGrant.id,
      ownerGrantVersion: replacementGrant.version
    },
    data: {
      ownerGrantId: respondGrant.id,
      ownerGrantVersion: respondGrant.version
    }
  });
  assert.equal(restored.count, 1);
  fixtureEffects.explicitlyReassignedOwnRows += restored.count;
  await resume();
  await fieldsAre(form("Save internal note"), { body: handoffDraft });
  assert.equal(page.url(), handoffUrl);
  assert.equal(
    await page.evaluate(() => window.__caseOriginalDocument),
    "retained"
  );
  await clickAndRefresh(adminDiscard(() => form("Save internal note")));
  assert.equal(
    await db.adminCaseNote.count({ where: { supportCaseId: currentId } }),
    0
  );
  ok(
    "An actual native owner handoff cannot navigate away from an unsent Admin sibling. The same document stays concealed after source authority is lost; explicitly counted fictional reassignment restores the original draft, which can be deliberately discarded without creating a note."
  );

  const effects = await ownedEffects(),
    sinkFiles = readdirSync(resolve(fixtureDir, "sink")).filter(
      (file) => !sinkBefore.has(file)
    );
  assert.equal(browserWrites.length, 21);
  assert.deepEqual(effects, { admin: 12, support: 3 });
  assert.equal(
    await db.supportOperation.count({ where: { actorId: requester.id } }),
    3
  );
  assert.equal(sinkFiles.length, 3);
  assert.ok(
    browserWrites.every(
      (row) =>
        row.method === "POST" &&
        ["/api/platform/admin", "/api/platform/support"].includes(row.path) &&
        row.owner === actor.id
    )
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(routeErrors, []);
  assert.deepEqual(externalRequests, []);
  write("result.json", {
    at: new Date().toISOString(),
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
    candidate: process.cwd(),
    build: readFileSync(resolve(".next/BUILD_ID"), "utf8").trim(),
    qaSha256: createHash("sha256")
      .update(readFileSync(new URL(import.meta.url)))
      .digest("hex"),
    fixtureOnly: true,
    fixtureEffects: {
      ...fixtureEffects,
      serviceEffects,
      adminOperations: effects.admin,
      responderSupportOperations: effects.support,
      browserPostAttempts: browserWrites.length,
      intakeRestorationPendingFinally: true,
      localVerificationSinkFiles: sinkFiles
    },
    productionWrites: 0,
    limitations: [
      "Lost acknowledgments and429/503 are transport simulations around real accepted service effects.",
      "Grant renewal advances generation; only this run's three fictional cases are explicitly reassigned to the actual renewed grant. The final handoff case is separately reassigned for draft recovery, not described as automatic application restoration.",
      "This suite covers SUPPORT Admin cases and native Support owners, not standalone CommunityReportReview commands, church claim decisions, or physical-device OS snapshots.",
      "The existing privacy repair does not need a pagination fixture; missing/redacted-note and absent-group owners are verified through actual source transitions.",
      "Canonical route IDs already exist in initial Next bootstrap scripts; only raw route-ID text checks exclude scripts. Private markers, named fields and source href/value/aria attributes remain checked across the entire body."
    ]
  });
  console.log(
    "ADMIN_CASE_PRIVACY_BROWSER_PASS " + results.length + " " + output
  );
};
try {
  await Promise.race([run(), routingFailure]);
} catch (error) {
  await page
    .screenshot({ path: resolve(output, "failure.png"), fullPage: true })
    .catch(() => {});
  write("failure.json", {
    at: new Date().toISOString(),
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
    replacementId: replacement?.id,
    caseIds,
    initialNoteId,
    serviceEffects,
    fixtureEffects
  });
  throw error;
} finally {
  for (const release of releases) release();
  try {
    if (grantRevoked) {
      await db.supportCapabilityGrant.update({
        where: { id: respondGrant.id },
        data: { revokedAt: null }
      });
      fixtureEffects.grantRevokeRestoreUpdates++;
    }
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
      fixtureEffects.intakeWrites++;
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
      actorId: actor?.id,
      requesterId: requester?.id,
      caseIds,
      fixtureEffects,
      actualOwnedEffects: actor ? await ownedEffects() : null,
      browserPostAttempts: browserWrites.length,
      localVerificationSinkFiles: readdirSync(
        resolve(fixtureDir, "sink")
      ).filter((file) => !sinkBefore.has(file))
    });
  } finally {
    await browser.close();
    await db.$disconnect();
  }
}
