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
  PUSH_ENABLED: "false",
  PRIVILEGED_MFA_MODE: "off"
});
// Use the inspected runtime's modules even when this script lives elsewhere.
const require = createRequire(resolve("package.json"));
const load = (name) => import(pathToFileURL(resolve(name)));
const { PrismaClient } = require("@prisma/client");
const { assertPortalTestDatabase, createPortalActor, seedOperatorGrants } =
  await load("tests/seed-portal.ts");
const { adminAuthenticatorCommand } = await load(
  "lib/platform/admin-access.ts"
);
const { openAuthenticator, authenticatorTotp } = await load(
  "lib/platform/admin-authenticator-crypto.ts"
);
const secrets = new Set();
const redact = (value) => {
  let text = String(value);
  for (const secret of secrets)
    if (secret) text = text.replaceAll(secret, "[credential removed]");
  return text;
};
const remember = (value) => {
  secrets.add(value);
  return value;
};
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
  "admin-access-privacy-browser-" + Date.now()
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
let rejectRouting, actor, target, replacement;
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
      message: redact(error.message),
      stack: redact(error.stack)
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
      command: safeCommand(request.postData()),
      owner: request.headers()["x-expected-account"]
    });
});
page.on("pageerror", (error) => errors.push(redact(error.message)));
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const write = (name, value) =>
  writeFileSync(resolve(output, name), redact(JSON.stringify(value, null, 2)), {
    mode: 0o600
  });
const button = (name) => page.getByRole("button", { name, exact: true });
const event = (name) =>
  page.evaluate((type) => window.dispatchEvent(new Event(type)), name);
// Credential-bearing bytes exist only in memory. Artifacts retain a digest and
// explicitly selected noncredential command fields, never a request body.
const safeCommand = (body) => {
  if (!body) return null;
  const sha256 = createHash("sha256").update(body).digest("hex");
  let value;
  try {
    value = JSON.parse(body);
  } catch {
    return { operation: "unparsed", sha256 };
  }
  return {
    operation: value.operation,
    requestKey: value.requestKey,
    managerVersion: value.managerVersion,
    expectedVersion: value.expectedVersion,
    username: value.username,
    capability: value.capability,
    enabled: value.enabled,
    sha256
  };
};
const workspace = page.locator('section[aria-label="Admin workspace"]');
const grant = workspace.locator(
  'form[aria-label="Grant this capability"], form[aria-label="Revoke this capability"]'
);
const reason = grant.locator('[name="reason"]');
const password = grant.locator('input[name="currentPassword"]');
const code = grant.locator('input[name="code"]');
const lookup = workspace.getByRole("textbox", {
  name: "Complete username",
  exact: true
});
const duty = workspace
  .locator("label")
  .filter({ hasText: "Explicit capability" })
  .locator("select");
const retry = grant.getByRole("button", {
  name: "Retry original action",
  exact: true
});
const submit = () =>
  grant.getByRole("button", { name: /^(Grant|Revoke) this capability$/ });
const targetHeading = () =>
  workspace.getByRole("heading", {
    name: target.name + " (@" + target.username + ")",
    exact: true
  });
const identity = (url) =>
  url.pathname === "/api/platform/profile" &&
  url.searchParams.get("view") === "identity";
const source = (url) =>
  url.pathname === "/api/platform/admin" &&
  url.searchParams.get("view") === "access";
const command = (url) => url.pathname === "/api/platform/admin" && !url.search;
const accessPath = () =>
  "/platform/admin/access?username=" + encodeURIComponent(target.username);
const attempts = [],
  dialogs = [];
let dialogAccept = true,
  factor,
  factorHidden = false,
  targetHidden = false;
page.on("dialog", async (dialog) => {
  dialogs.push({
    type: dialog.type(),
    message: redact(dialog.message()),
    accepted: dialogAccept
  });
  if (dialogAccept) await dialog.accept();
  else await dialog.dismiss();
});
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
const api = async (status = 200) => {
  const response = await context.request.get(
    config.origin +
      "/api/platform/admin?view=access&username=" +
      encodeURIComponent(target.username),
    { headers: { "X-Expected-Account": actor.id } }
  );
  assert.equal(response.status(), status, "Expected current access API status");
  assert.match(response.headers()["cache-control"], /no-store/);
  const data = await response.json();
  if (status === 200) {
    assert.equal(data.navigation.viewer.id, actor.id);
    assert.equal(
      data.accountAuthenticator,
      false,
      "This suite establishes only off-mode grant acceptance"
    );
  }
  return data;
};
const ready = async () => {
  await targetHeading().waitFor();
  await reason.waitFor({ state: "visible" });
};
const draftMatches = async (draft, secretCode) => {
  await ready();
  await page.waitForFunction(
    ({ draft, secretCode, expectedPassword }) => {
      const form = document.querySelector(
        'form[aria-label="Grant this capability"], form[aria-label="Revoke this capability"]'
      );
      return (
        form?.querySelector('[name="reason"]')?.value === draft &&
        form?.querySelector('[name="code"]')?.value === secretCode &&
        form?.querySelector('[name="currentPassword"]')?.value ===
          expectedPassword
      );
    },
    { draft, secretCode, expectedPassword: actor.password }
  );
  assert.equal(
    await password.getAttribute("type"),
    "password",
    "Remounted credential is concealed by default"
  );
};
const clearFields = async () => {
  await ready();
  await page.waitForFunction(() => {
    const form = document.querySelector(
      'form[aria-label="Grant this capability"], form[aria-label="Revoke this capability"]'
    );
    return ["reason", "code", "currentPassword"].every(
      (name) => form?.querySelector(`[name="${name}"]`)?.value === ""
    );
  });
};
const fill = async (draft, secretCode) => {
  await reason.fill(draft);
  await password.fill(actor.password);
  await code.fill(secretCode);
};
const privateAbsent = async (draft, queryDraft) => {
  await page.waitForFunction(
    ({ targetName, username, draft, queryDraft }) => {
      const root = document.querySelector(
        'section[aria-label="Admin workspace"]'
      );
      return (
        root &&
        !root.querySelector('form[action="/platform/admin/access"]') &&
        !root.querySelector(
          'form[aria-label="Grant this capability"], form[aria-label="Revoke this capability"]'
        ) &&
        !root.textContent.includes(targetName) &&
        !root.textContent.includes(username) &&
        !root.textContent.includes(draft) &&
        !root.textContent.includes(queryDraft)
      );
    },
    { targetName: target.name, username: target.username, draft, queryDraft }
  );
};
const grantAbsent = async () => {
  await grant.waitFor({ state: "detached" });
  assert.equal(await retry.count(), 0);
  await workspace
    .getByText(/Confirm your authenticator and check the recipient/)
    .waitFor();
};
const capturedWithin = async (promise) => {
  let timer;
  try {
    await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error("Held access read did not arrive")),
          30000
        );
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
};
const failedRead = async (matches, draft, queryDraft, secretCode) => {
  const remove = register(matches, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Fictional access read unavailable" })
    })
  );
  try {
    await event("focus");
    await page
      .getByText(
        matches === identity
          ? "Your sign-in could not be checked. Reconnect and try again."
          : "Fictional access read unavailable",
        { exact: true }
      )
      .waitFor();
    await privateAbsent(draft, queryDraft);
  } finally {
    remove();
  }
  await button("Recheck current access").click();
  await draftMatches(draft, secretCode);
};
const lateRead = async (matches, draft, queryDraft, secretCode) => {
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
    await privateAbsent(draft, queryDraft);
    await event("pagehide");
    release();
    await Promise.all(deliveries);
    await page.waitForLoadState("networkidle");
    await privateAbsent(draft, queryDraft);
  } finally {
    release();
    releases.delete(release);
    remove();
  }
  await event("pageshow");
  await draftMatches(draft, secretCode);
};
const setFactor = async (confirmed) => {
  await db.adminAuthenticator.update({
    where: { userId: actor.id },
    data: { confirmedAt: confirmed ? factor.confirmedAt : null }
  });
  factorHidden = !confirmed;
};
const setTarget = async (eligible) => {
  await db.platformUser.update({
    where: { id: target.id },
    data: { suspendedAt: eligible ? null : new Date() }
  });
  targetHidden = !eligible;
};
const revoke = async (manager) => {
  await db.platformOperatorGrant.update({
    where: { id: manager.id },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  restoredGrants.set(manager.id, manager);
};
const restore = async (manager) => {
  await db.platformOperatorGrant.update({
    where: { id: manager.id },
    data: { revokedAt: manager.revokedAt, version: { increment: 1 } }
  });
  restoredGrants.delete(manager.id);
};
const freshCode = async () => {
  const current = await db.adminAuthenticator.findUniqueOrThrow({
    where: { userId: actor.id }
  });
  let now = BigInt(Math.floor(Date.now() / 30000));
  const counter = current.lastCounter >= now ? current.lastCounter + 1n : now;
  if (counter > now + 1n) {
    await page.waitForTimeout(Number(counter - now - 1n) * 30000 + 20);
    now = BigInt(Math.floor(Date.now() / 30000));
  }
  assert.ok(
    counter <= now + 1n,
    "Next code is inside the accepted unused counter window"
  );
  return remember(
    authenticatorTotp(
      openAuthenticator(actor.id, current.secretCiphertext),
      counter
    )
  );
};
const operation = async (body) => {
  const value = JSON.parse(body);
  const rows = await db.adminOperation.findMany({
    where: {
      actorId: actor.id,
      requestKey: value.requestKey,
      sourceType: "ACCESS",
      action: "grant"
    }
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sourceId, target.id);
  assert.equal(rows[0].result.capability, value.capability);
  assert.equal(rows[0].result.enabled, value.enabled);
  assert.ok(
    !JSON.stringify(rows).includes(actor.password),
    "Credential absent from persisted audit"
  );
  assert.ok(
    !JSON.stringify(rows).includes(value.code),
    "Code absent from persisted audit"
  );
  return rows[0];
};
const accessCount = async (count) =>
  assert.equal(
    await db.adminOperation.count({
      where: { actorId: actor.id, sourceType: "ACCESS", action: "grant" }
    }),
    count
  );
const fit = async (width, enlarged = false) => {
  const label = "access-" + width + (enlarged ? "-font-200" : "");
  await page.setViewportSize({ width, height: 844 });
  const style = enlarged
    ? await page.addStyleTag({ content: "html{font-size:200%!important}" })
    : null;
  // Mask complete credential containers in every capture, including any legacy
  // section elsewhere in the viewport. The mask does not alter layout or values.
  const masks = [
    workspace.locator('input[name="currentPassword"]').locator(".."),
    workspace
      .locator('input[name="code"], input[name="recoveryCode"]')
      .locator("..")
  ];
  try {
    for (const [name, element] of [
      ["target", targetHeading()],
      ["reason", reason],
      ["actions", grant.locator("button").last()]
    ]) {
      await element.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: resolve(output, label + "-" + name + ".png"),
        mask: masks
      });
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
            width: box.width
          };
        })
        .filter((row) => row.width && row.right > innerWidth + 1)
        .slice(0, 30)
    }));
    write(label + "-layout.json", layout);
    assert.ok(
      layout.scrollWidth <= layout.viewport + 1,
      "No horizontal overflow at " + label
    );
  } finally {
    if (style) await style.evaluate((node) => node.remove());
  }
};
const run = async () => {
  actor = await createPortalActor(db, "accesspriv");
  remember(actor.password);
  target = await createPortalActor(db, "accesstarg");
  remember(target.password);
  replacement = await createPortalActor(db, "accessswap");
  remember(replacement.password);
  await seedOperatorGrants(db, actor, [
    "MANAGE_ADMIN_ACCESS",
    "VIEW_ADMIN_AUDIT"
  ]);
  await seedOperatorGrants(db, target, [
    "LOOKUP_ACCOUNTS",
    "VIEW_PLATFORM_METRICS"
  ]);
  const manager = await db.platformOperatorGrant.findUniqueOrThrow({
    where: {
      userId_capability: { userId: actor.id, capability: "MANAGE_ADMIN_ACCESS" }
    }
  });
  const initialGrant = await db.platformOperatorGrant.update({
    where: {
      userId_capability: {
        userId: target.id,
        capability: "VIEW_PLATFORM_METRICS"
      }
    },
    data: { revokedAt: new Date() }
  });
  const setup = await adminAuthenticatorCommand(
    db,
    actor.token,
    {
      operation: "mfa-start",
      requestKey: randomUUID(),
      managerVersion: manager.version,
      expectedVersion: 0,
      currentPassword: actor.password
    },
    actor.password
  );
  if (typeof setup.secret === "string") remember(setup.secret);
  const started = await db.adminAuthenticator.findUniqueOrThrow({
    where: { userId: actor.id }
  });
  const confirmation = remember(
    authenticatorTotp(
      openAuthenticator(actor.id, started.secretCiphertext),
      BigInt(Math.floor(Date.now() / 30000)) - 1n
    )
  );
  const enrollment = await adminAuthenticatorCommand(
    db,
    actor.token,
    {
      operation: "mfa-confirm",
      requestKey: randomUUID(),
      managerVersion: manager.version,
      expectedVersion: started.version,
      code: confirmation
    },
    undefined
  );
  for (const recovery of enrollment.recoveryCodes ?? []) remember(recovery);
  factor = await db.adminAuthenticator.findUniqueOrThrow({
    where: { userId: actor.id }
  });
  assert.ok(factor.confirmedAt);
  await signIn(actor);
  const initial = await api();
  assert.equal(initial.target.id, target.id);
  assert.equal(initial.authenticator.confirmed, true);
  for (const rsc of [false, true]) {
    const response = await context.request.get(
      config.origin + accessPath(),
      rsc ? { headers: { RSC: "1" } } : {}
    );
    assert.equal(response.status(), 200);
    if (rsc)
      assert.match(response.headers()["content-type"], /text\/x-component/);
    const text = await response.text();
    assert.ok(!text.includes(target.name));
    assert.ok(!text.includes(initialGrant.id));
    assert.ok(!text.includes('name="currentPassword"'));
  }
  await page.goto(config.origin + accessPath());
  await ready();
  assert.equal(await duty.count(), 1);
  await duty.selectOption("VIEW_PLATFORM_METRICS");
  const queryDraft = "unsent_access_" + randomUUID().slice(0, 8);
  await lookup.fill(queryDraft);
  const draft = "Private fictional duty rationale " + randomUUID();
  const draftCode = remember("654321");
  await fill(draft, draftCode);
  await draftMatches(draft, draftCode);
  await page.evaluate(() => {
    window.__accessDocument = "original";
  });
  assert.equal(await duty.isEnabled(), false);
  assert.equal(await lookup.isEnabled(), false);
  assert.equal(await button("Find current grants").isEnabled(), false);
  await grant
    .getByRole("button", {
      name: "Show confirm your current sign-in for this action",
      exact: true
    })
    .click();
  assert.equal(await password.getAttribute("type"), "text");
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
    await privateAbsent(draft, queryDraft);
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
    await draftMatches(draft, draftCode);
    assert.equal(await lookup.inputValue(), queryDraft);
    assert.equal(await duty.inputValue(), "VIEW_PLATFORM_METRICS");
  }
  await failedRead(identity, draft, queryDraft, draftCode);
  await failedRead(source, draft, queryDraft, draftCode);
  await lateRead(identity, draft, queryDraft, draftCode);
  await lateRead(source, draft, queryDraft, draftCode);
  await signIn(replacement);
  await event("focus");
  await page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .waitFor();
  await privateAbsent(draft, queryDraft);
  await signIn(actor);
  await event("focus");
  await draftMatches(draft, draftCode);
  assert.equal(await page.evaluate(() => window.__accessDocument), "original");
  assert.equal(browserWrites.length, 0);
  ok(
    "Off-mode authorized access DTO is no-store and initial HTML/RSC omit private target/grant data. Concealment, failed/held reads and account replacement physically remove the scoped target/form while retaining query, selected duty, reason and credential draft; restoration remounts a password input."
  );

  // An independent fixture writer changes the current state while the browser
  // owns a grant intention. Explicit version adoption must not become revoke.
  const flipped = await db.platformOperatorGrant.update({
    where: { id: initialGrant.id },
    data: { revokedAt: null, version: { increment: 1 } }
  });
  await event("focus");
  await draftMatches(draft, draftCode);
  const adopt = grant.getByRole("button", {
    name: "Use current version with these entries",
    exact: true
  });
  await adopt.waitFor();
  assert.equal(await grant.getAttribute("aria-label"), "Grant this capability");
  assert.equal(await submit().isEnabled(), false);
  await adopt.click();
  assert.equal(await grant.getAttribute("aria-label"), "Grant this capability");
  let adoptionCommand;
  const removeAdoption = register(command, async (route) => {
    const value = JSON.parse(route.request().postData());
    adoptionCommand = safeCommand(route.request().postData());
    assert.equal(value.username, target.username);
    assert.equal(value.capability, "VIEW_PLATFORM_METRICS");
    assert.equal(value.enabled, true);
    assert.equal(value.expectedVersion, flipped.version);
    assert.equal(value.managerVersion, manager.version);
    return route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ message: "Fictional no-write intention check" })
    });
  });
  try {
    await submit().click();
    await grant
      .getByRole("alert")
      .filter({ hasText: "Fictional no-write intention check" })
      .waitFor();
  } finally {
    removeAdoption();
  }
  await accessCount(0);
  await button("Discard local entries").click();
  await clearFields();
  await grant
    .getByRole("button", { name: "Revoke this capability", exact: true })
    .waitFor();
  assert.equal(await duty.isEnabled(), true);
  assert.equal(await lookup.isEnabled(), true);
  assert.equal(
    dialogs.length,
    0,
    "A confirmed rejection leaves no uncertain command to discard"
  );
  const grantBase = await db.platformOperatorGrant.update({
    where: { id: initialGrant.id },
    data: { revokedAt: initialGrant.revokedAt, version: { increment: 1 } }
  });
  await event("focus");
  await ready();
  await grant
    .getByRole("button", { name: "Grant this capability", exact: true })
    .waitFor();
  await fill(draft, draftCode);
  ok(
    "After an isolated current-grant state flip, explicit version adoption keeps the original grant intention and recipient. A labeled no-write command interception verifies enabled=true and the adopted version; only discard permits fresh revoke presentation and unlocks recipient/duty selectors."
  );

  await revoke(manager);
  await event("focus");
  await button("Recheck current access").waitFor();
  await page.waitForLoadState("networkidle");
  await privateAbsent(draft, queryDraft);
  await api(404);
  await restore(manager);
  await event("focus");
  await draftMatches(draft, draftCode);
  await grant
    .getByRole("button", {
      name: "Use current version with these entries",
      exact: true
    })
    .waitFor();
  assert.equal(await submit().isEnabled(), false);
  assert.equal(await lookup.inputValue(), queryDraft);
  assert.equal(await duty.inputValue(), "VIEW_PLATFORM_METRICS");
  await grant
    .getByRole("button", {
      name: "Use current version with these entries",
      exact: true
    })
    .click();
  await draftMatches(draft, draftCode);
  await setFactor(false);
  await event("focus");
  await grantAbsent();
  await setFactor(true);
  await event("focus");
  await draftMatches(draft, draftCode);
  await setTarget(false);
  await event("focus");
  await grantAbsent();
  await setTarget(true);
  await event("focus");
  await draftMatches(draft, draftCode);
  assert.equal(browserWrites.length, 1);
  for (const [width, enlarged] of [
    [390, false],
    [320, false],
    [320, true]
  ])
    await fit(width, enlarged);
  await page.setViewportSize({ width: 390, height: 844 });
  ok(
    "Real manager revocation conceals the target/grant and restoration requires explicit manager-version adoption, preserving recipient, duty and enable intention. Factor and target eligibility loss remove the presenter without losing its draft; 390/320/200% layouts fit with credential containers excluded from captures."
  );

  let originalReceipt;
  const removeRetry = register(command, async (route) => {
    assert.equal(route.request().method(), "POST");
    const body = route.request().postData(),
      value = JSON.parse(body);
    assert.equal(value.operation, "grant");
    assert.equal(value.username, target.username);
    assert.equal(value.capability, "VIEW_PLATFORM_METRICS");
    assert.equal(value.enabled, true);
    assert.equal(value.managerVersion, manager.version + 2);
    assert.equal(value.expectedVersion, grantBase.version);
    assert.ok(
      value.currentPassword === actor.password,
      "Original credential preserved in memory"
    );
    attempts.push({
      body,
      owner: route.request().headers()["x-expected-account"]
    });
    if (attempts.length === 1) {
      const response = await route.fetch();
      assert.equal(response.status(), 200, "First real grant is accepted");
      originalReceipt = await response.json();
      return route.abort("failed");
    }
    if (attempts.length === 2)
      return route.fulfill({
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "2" },
        body: JSON.stringify({ message: "Fictional grant retry cooldown" })
      });
    if (attempts.length === 3)
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Fictional grant retry unavailable" })
      });
    assert.equal(attempts.length, 4);
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    assert.deepEqual(await response.json(), originalReceipt);
    return route.fulfill({ response });
  });
  try {
    const unused = await freshCode();
    await code.fill(unused);
    await submit().click();
    await retry.waitFor();
    await draftMatches(draft, unused);
    const savedOperation = await operation(attempts[0].body);
    await accessCount(1);
    const currentGrant = await db.platformOperatorGrant.findUniqueOrThrow({
      where: { id: initialGrant.id }
    });
    assert.equal(currentGrant.revokedAt, null);
    assert.equal(currentGrant.version, grantBase.version + 1);
    await event("focus");
    await draftMatches(draft, unused);
    assert.equal(
      await grant.getAttribute("aria-label"),
      "Grant this capability",
      "Accepted source change cannot flip pending intention to revoke"
    );
    assert.equal(await duty.isEnabled(), false);
    assert.equal(await lookup.isEnabled(), false);
    await setFactor(false);
    await event("focus");
    await grantAbsent();
    assert.equal(attempts.length, 1);
    await accessCount(1);
    await setFactor(true);
    await event("focus");
    await draftMatches(draft, unused);
    await retry.click();
    await grant
      .getByRole("alert")
      .filter({ hasText: "Fictional grant retry cooldown" })
      .waitFor();
    assert.equal(await retry.isEnabled(), false);
    assert.equal(await password.isEnabled(), false);
    await signIn(replacement);
    await retry.click();
    await page
      .getByText("Your sign-in changed. Reload before continuing.", {
        exact: true
      })
      .waitFor();
    await privateAbsent(draft, queryDraft);
    assert.equal(attempts.length, 2);
    await signIn(actor);
    await event("focus");
    await draftMatches(draft, unused);
    await retry.click();
    await grant
      .getByRole("alert")
      .filter({ hasText: "Fictional grant retry unavailable" })
      .waitFor();
    await operation(attempts[0].body);
    await retry.click();
    await clearFields();
    await grant
      .getByRole("button", { name: "Revoke this capability", exact: true })
      .waitFor();
    assert.equal(attempts.length, 4);
    assert.ok(
      attempts.every(
        (attempt) =>
          attempt.body === attempts[0].body && attempt.owner === actor.id
      ),
      "Four transmitted attempts use identical bytes and account"
    );
    assert.deepEqual(await operation(attempts[0].body), savedOperation);
    assert.deepEqual(
      await db.platformOperatorGrant.findUniqueOrThrow({
        where: { id: initialGrant.id }
      }),
      currentGrant
    );
    await accessCount(1);
  } finally {
    removeRetry();
  }
  ok(
    "A real grant with lost acknowledgment survives fresh active-grant data, factor loss, account replacement, 429 and 503. Four exact in-memory bodies retain original target/capability/enabled/versions/key/account, produce one unchanged ACCESS audit and one grant version increment, then clear credentials and written fields on confirmation."
  );

  await duty.selectOption("VIEW_OPERATIONAL_HEALTH");
  const discardedReason = "Fictional acknowledged-discard duty " + randomUUID();
  const secondCode = await freshCode();
  await fill(discardedReason, secondCode);
  let discardBody;
  const removeDiscard = register(command, async (route) => {
    discardBody = route.request().postData();
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    return route.abort("failed");
  });
  try {
    await submit().click();
    await retry.waitFor();
  } finally {
    removeDiscard();
  }
  const savedDiscard = await operation(discardBody);
  await accessCount(2);
  await setFactor(false);
  await event("focus");
  await grantAbsent();
  const beforeDialogs = dialogs.length;
  dialogAccept = false;
  await button("Discard local entries").click();
  assert.equal(dialogs.length, beforeDialogs + 1);
  assert.match(dialogs.at(-1).message, /may already be saved/);
  await button("Discard local entries").waitFor();
  dialogAccept = true;
  await button("Discard local entries").click();
  assert.equal(dialogs.length, beforeDialogs + 2);
  await button("Discard local entries").waitFor({ state: "detached" });
  await setFactor(true);
  await event("focus");
  await clearFields();
  await grant
    .getByRole("button", { name: "Revoke this capability", exact: true })
    .waitFor();
  assert.equal(await retry.count(), 0);
  assert.deepEqual(await operation(discardBody), savedDiscard);
  await accessCount(2);
  assert.equal(
    await db.platformOperatorGrant.count({
      where: {
        userId: target.id,
        capability: "VIEW_OPERATIONAL_HEALTH",
        revokedAt: null
      }
    }),
    1
  );
  ok(
    "A second accepted grant can be deliberately discarded while factor access is unavailable: cancellation preserves recovery, confirmation clears only local fields/password/code, and the once-saved grant/audit remain intact."
  );

  assert.equal(browserWrites.length, 6);
  assert.ok(
    browserWrites.every(
      (write) =>
        write.path === "/api/platform/admin" &&
        write.command.operation === "grant" &&
        write.owner === actor.id
    )
  );
  assert.equal(
    await db.adminOperation.count({
      where: { actorId: actor.id, sourceType: "MFA" }
    }),
    2
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(routeErrors, []);
  assert.deepEqual(externalRequests, []);
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  write("result.json", {
    results,
    errors,
    routeErrors,
    externalRequests,
    browserWrites,
    requests,
    dialogs,
    exactRetry: {
      attempts: attempts.length,
      identicalBytesInMemory: true,
      commands: attempts.map((attempt) => ({
        ...safeCommand(attempt.body),
        owner: attempt.owner
      }))
    },
    fixtureEffects: {
      actors: 3,
      seededOperatorGrants: 4,
      serviceMfaOperations: 2,
      browserGrantOperations: 2,
      browserMutationAttempts: 6,
      targetGrantIntentionFixtureUpdates: 2,
      managerRevokeRestoreUpdates: 2,
      factorAvailabilityUpdates: 6,
      targetEligibilityUpdates: 2
    },
    privilegedMode: "off",
    simulations: [
      {
        name: "no-write intention after explicit version adoption",
        command: adoptionCommand,
        status: 409
      }
    ],
    fixtureOnly: true,
    productionWrites: 0,
    recipientSends: 0,
    credentialsInArtifacts: false,
    failureScreenshots: false,
    limitations: [
      "This suite covers the target/grant workspace in off mode only. Legacy enrollment/recovery presentation and canonical Account security authenticator are separate owners and are not claimed here.",
      "Factor availability and target eligibility changes are direct isolated fixture transitions, not authenticator recovery or account-management browser acceptance.",
      "429/503 and lost acknowledgments are injected recovery conditions. Synthetic lifecycle events do not prove physical-device snapshots.",
      "Screenshots mask complete credential containers. Only safe command metadata and hashes are persisted; exact bytes are compared in memory."
    ]
  });
  console.log("ADMIN_ACCESS_PRIVACY_BROWSER_PASS " + results.length);
};
try {
  await Promise.race([run(), routingFailure]);
} catch (error) {
  // No failure screenshot/DOM dump: pending forms may contain plaintext codes.
  write("failure.json", {
    results,
    errors,
    routeErrors,
    externalRequests,
    browserWrites,
    requests,
    dialogs,
    attempts: attempts.map((attempt) => ({
      ...safeCommand(attempt.body),
      owner: attempt.owner
    })),
    message: redact(error.message),
    url: page.url(),
    fixtureOnly: true,
    credentialsInArtifacts: false
  });
  throw new Error(redact(error.message));
} finally {
  for (const release of releases) release();
  try {
    await browser.close();
  } finally {
    try {
      for (const manager of restoredGrants.values()) await restore(manager);
      if (factorHidden) await setFactor(true);
      if (targetHidden) await setTarget(true);
    } finally {
      await db.$disconnect();
    }
  }
}
