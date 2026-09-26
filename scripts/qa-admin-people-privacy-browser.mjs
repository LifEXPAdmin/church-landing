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
  SUPPORT_INTAKE_ENABLED: "true"
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
const output = resolve(
  fixtureDir,
  "admin-people-privacy-browser-" + Date.now()
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
const form = page.getByRole("form", { name: "Look up account", exact: true });
const username = form.getByLabel("Complete username", { exact: true });
const purpose = form.getByLabel("Operational reason", { exact: true });
const retry = form.getByRole("button", {
  name: "Retry original action",
  exact: true
});
const submit = form.getByRole("button", {
  name: "Look up account",
  exact: true
});
const targetHeading = () =>
  page.getByRole("heading", {
    name: target.name + " (@" + target.username + ")",
    exact: true
  });
const identity = (url) =>
  url.pathname === "/api/platform/profile" &&
  url.searchParams.get("view") === "identity";
const navigation = (url) =>
  url.pathname === "/api/platform/admin" &&
  url.searchParams.get("view") === "navigation";
const command = (url) => url.pathname === "/api/platform/admin" && !url.search;
const attempts = [],
  receipts = [],
  dialogs = [];
let dialogAccept = true;
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
      name: "church_platform_session",
      value: who.token,
      url: config.origin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
};
const currentNavigation = async () => {
  const response = await context.request.get(
    config.origin + "/api/platform/admin?view=navigation",
    {
      headers: { "X-Expected-Account": actor.id }
    }
  );
  assert.equal(response.status(), 200, await response.text());
  assert.match(response.headers()["cache-control"], /no-store/);
  const value = await response.json();
  assert.equal(value.viewer.id, actor.id);
  return value;
};
const ready = async () => {
  await username.waitFor({ state: "visible" });
  await page.getByRole("heading", { name: "People", exact: true }).waitFor();
};
const fieldsAre = async (name, reason) => {
  await ready();
  await page.waitForFunction(
    ({ name, reason }) => {
      const node = document.querySelector('form[aria-label="Look up account"]');
      return (
        node?.querySelector('[name="username"]')?.value === name &&
        node?.querySelector('[name="purpose"]')?.value === reason
      );
    },
    { name, reason }
  );
};
const fill = async (name, reason) => {
  await username.fill(name);
  await purpose.selectOption(reason);
};
const privateAbsent = async (draft = "") => {
  await page.waitForFunction(
    ({ target, draft }) => {
      const main = document.querySelector("main");
      return (
        !!main &&
        !main.querySelector('[name="username"], [name="purpose"]') &&
        !main.querySelector('form[aria-label="Look up account"] fieldset') &&
        !main.textContent.includes(target.name) &&
        !main.textContent.includes(target.username) &&
        (!draft || !main.textContent.includes(draft))
      );
    },
    { target: { name: target.name, username: target.username }, draft }
  );
};
const noResult = async () => {
  await targetHeading().waitFor({ state: "detached" });
  assert.equal(
    await page.locator('section[aria-label="Admin workspace"] dl').count(),
    0
  );
};
const inactive = async (draft) => {
  await privateAbsent(draft);
  assert.equal(
    await page.locator('form[aria-label="Look up account"]').count(),
    0,
    "A concealed workspace removes the whole form presentation, not its controller"
  );
};
const denied = async (draft) => {
  await page
    .getByText(
      "Account lookup is not available with your current permissions.",
      { exact: true }
    )
    .waitFor();
  await privateAbsent(draft);
  assert.equal(await retry.count(), 0);
  assert.equal(await submit.count(), 0);
  await page
    .getByRole("link", {
      name: "Open the existing account-access review",
      exact: true
    })
    .waitFor();
};
const noNewWrite = (count) => assert.equal(browserWrites.length, count);
const lookupRows = () =>
  db.adminOperation.findMany({
    where: { actorId: actor.id, action: "lookup", sourceType: "LOOKUP" },
    orderBy: { createdAt: "asc" }
  });
const effectCount = async (expected) =>
  assert.equal((await lookupRows()).length, expected);
const oneKey = async (body) => {
  const payload = JSON.parse(body);
  const rows = await db.adminOperation.findMany({
    where: { actorId: actor.id, requestKey: payload.requestKey }
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sourceType, "LOOKUP");
  assert.equal(rows[0].sourceId, target.id);
  assert.equal(rows[0].action, "lookup");
  assert.equal(rows[0].result.purpose, payload.purpose);
  return rows[0];
};
const capturedWithin = async (captured) => {
  let timer;
  try {
    await Promise.race([
      captured,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error("Held People request did not arrive")),
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
      const response = await route.fetch();
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
const failedRead = async (matches, draft) => {
  const remove = register(matches, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Fictional People read unavailable" })
    })
  );
  try {
    await event("focus");
    await page
      .getByText(
        matches === identity
          ? "Your sign-in could not be checked. Reconnect and try again."
          : "Fictional People read unavailable",
        { exact: true }
      )
      .waitFor();
    await inactive(draft);
  } finally {
    remove();
  }
  await button("Recheck current access").click();
  await fieldsAre(draft, "VERIFICATION");
};
const lateRead = async (matches, draft) => {
  const held = hold(matches);
  try {
    await event("focus");
    await capturedWithin(held.captured);
    await inactive(draft);
    await event("pagehide");
    await held.finish();
    await page.waitForLoadState("networkidle");
    await inactive(draft);
  } finally {
    held.remove();
  }
  await event("pageshow");
  await fieldsAre(draft, "VERIFICATION");
};
const revoke = async (grant) => {
  await db.platformOperatorGrant.update({
    where: { id: grant.id },
    data: {
      revokedAt: new Date(),
      version: { increment: 1 }
    }
  });
  restoredGrants.set(grant.id, grant);
};
const restore = async (grant) => {
  await db.platformOperatorGrant.update({
    where: { id: grant.id },
    data: {
      revokedAt: grant.revokedAt,
      version: { increment: 1 }
    }
  });
  restoredGrants.delete(grant.id);
};
const fit = async (label, width, enlarged = false) => {
  const name = label + "-" + width + (enlarged ? "-font-200" : "");
  await page.setViewportSize({ width, height: 844 });
  const style = enlarged
    ? await page.addStyleTag({ content: "html{font-size:200%!important}" })
    : null;
  try {
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: resolve(output, name + "-top.png") });
    await form.scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(output, name + "-form.png") });
    await form.locator("button").last().scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(output, name + "-actions.png") });
    if (!enlarged)
      await page.screenshot({
        path: resolve(output, name + ".png"),
        fullPage: true
      });
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
const serialized = async () => {
  for (const rsc of [false, true]) {
    const response = await context.request.get(
      config.origin + "/platform/admin/people",
      rsc ? { headers: { RSC: "1" } } : {}
    );
    assert.equal(response.status(), 200);
    if (rsc)
      assert.match(response.headers()["content-type"], /text\/x-component/);
    const content = await response.text();
    for (const marker of [
      target.name,
      target.username,
      'name="username"',
      'name="purpose"'
    ])
      assert.ok(
        !content.includes(marker),
        "Initial People response omits private result and fields: " + marker
      );
  }
};
const run = async () => {
  actor = await createPortalActor(db, "peopleread");
  target = await createPortalActor(db, "peopletarg");
  replacement = await createPortalActor(db, "peopleswap");
  await seedOperatorGrants(db, actor, [
    "LOOKUP_ACCOUNTS",
    "MANAGE_ACCOUNTS",
    "REVIEW_CHURCH_LISTINGS",
    "ESTABLISH_CHURCH"
  ]);
  const grants = await db.platformOperatorGrant.findMany({
    where: { userId: actor.id }
  });
  const lookupGrant = grants.find(
    (row) => row.capability === "LOOKUP_ACCOUNTS"
  );
  const listingsGrant = grants.find(
    (row) => row.capability === "REVIEW_CHURCH_LISTINGS"
  );
  assert.ok(lookupGrant && listingsGrant);
  await signIn(actor);
  const nav = await currentNavigation();
  assert.ok(nav.capabilities.includes("LOOKUP_ACCOUNTS"));
  assert.equal("person" in nav, false);
  const response = await page.goto(config.origin + "/platform/admin/people");
  assert.equal(response.status(), 200);
  await fieldsAre("", "SUPPORT");
  await serialized();
  await page.evaluate(() => {
    window.__peopleDocument = "original";
  });
  await fill(target.username, "SAFETY");
  const firstLookupResponse = page.waitForResponse(
    (value) =>
      value.url() === config.origin + "/api/platform/admin" &&
      value.request().method() === "POST"
  );
  await submit.click();
  const firstResponse = await firstLookupResponse;
  assert.equal(firstResponse.status(), 200);
  assert.match(firstResponse.headers()["cache-control"], /no-store/);
  const firstReceipt = await firstResponse.json();
  assert.equal(firstReceipt.person.id, target.id);
  assert.ok(!JSON.stringify(firstReceipt).includes(target.email));
  assert.ok(!JSON.stringify(firstReceipt).includes(target.password));
  await targetHeading().waitFor();
  await fieldsAre("", "SUPPORT");
  await effectCount(1);
  assert.equal(browserWrites.length, 1);
  assert.equal(JSON.parse(browserWrites[0].body).purpose, "SAFETY");
  ok(
    "Authorized initial HTML/RSC omit lookup fields and private result; a real lookup shows only the permitted target and resets controlled fields to empty username and SUPPORT."
  );

  const draft = "private_draft_" + randomUUID().slice(0, 8);
  await fill(draft, "VERIFICATION");
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
    await inactive(draft);
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
    await fieldsAre(draft, "VERIFICATION");
    await noResult();
    noNewWrite(1);
  }
  await failedRead(identity, draft);
  await failedRead(navigation, draft);
  await lateRead(identity, draft);
  await lateRead(navigation, draft);
  await signIn(replacement);
  await event("focus");
  await page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .waitFor();
  await inactive(draft);
  await signIn(actor);
  await event("focus");
  await fieldsAre(draft, "VERIFICATION");
  await noResult();
  noNewWrite(1);
  assert.equal(await page.evaluate(() => window.__peopleDocument), "original");
  for (const [width, enlarged] of [
    [390, false],
    [320, false],
    [320, true]
  ])
    await fit("draft", width, enlarged);
  await page.setViewportSize({ width: 390, height: 844 });
  await button("Discard local entries").click();
  await fieldsAre("", "SUPPORT");
  assert.equal(dialogs.length, 0);
  ok(
    "Blur, offline, pagehide, hidden visibility, failed/held identity and navigation reads and account replacement remove private DOM. Same-owner restoration preserves unsent username/purpose but clears the confirmed result; discard resets the draft, and responsive captures fit."
  );

  // An account swap without a focus event must also fail at the existing transport boundary.
  await fill(target.username, "SAFETY");
  await signIn(replacement);
  await submit.click();
  await page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .waitFor();
  await inactive(target.username);
  noNewWrite(1);
  await signIn(actor);
  await event("focus");
  await fieldsAre(target.username, "SAFETY");
  await button("Discard local entries").click();
  await fieldsAre("", "SUPPORT");
  await effectCount(1);

  await fill(draft, "VERIFICATION");
  await revoke(lookupGrant);
  await event("focus");
  await denied(draft);
  const reduced = await currentNavigation();
  assert.ok(!reduced.capabilities.includes("LOOKUP_ACCOUNTS"));
  assert.ok(reduced.capabilities.includes("MANAGE_ACCOUNTS"));
  assert.ok(reduced.sections.some((section) => section.key === "people"));
  assert.equal(await form.count(), 0, "Denied access has no form to submit");
  await page.waitForLoadState("networkidle");
  noNewWrite(1);
  const cleanDialogCount = dialogs.length;
  await button("Discard local entries").click();
  assert.equal(dialogs.length, cleanDialogCount);
  await restore(lookupGrant);
  await event("focus");
  await fieldsAre("", "SUPPORT");
  await noResult();
  noNewWrite(1);
  ok(
    "A no-focus account swap sends no lookup, and partial LOOKUP revocation preserves the People section through MANAGE_ACCOUNTS while removing fields/retry. A denied unsent draft can be deliberately discarded without a write."
  );

  const held = hold(command);
  try {
    await fill(target.username, "SUPPORT");
    await submit.click();
    await capturedWithin(held.captured);
    const captured = await held.captured;
    const body = captured.request.postData();
    const accepted = await captured.response.json();
    assert.equal(accepted.person.id, target.id);
    await oneKey(body);
    await effectCount(2);
    await event("blur");
    await inactive(target.username);
    await event("focus");
    await fieldsAre(target.username, "SUPPORT");
    assert.equal(await username.isEnabled(), false);
    await held.finish();
    await submit.waitFor();
    await fieldsAre("", "SUPPORT");
    await noResult();
    await oneKey(body);
    receipts.push({
      scenario: "accepted-before-hide",
      body,
      receipt: accepted
    });
  } finally {
    held.remove();
  }
  assert.equal(browserWrites.length, 2);
  ok(
    "A real accepted lookup response held across blur and same-owner return settles its mounted command and resets fields, but cannot resurrect its stale target presentation."
  );

  let originalReceipt;
  const removeRetry = register(command, async (route) => {
    assert.equal(route.request().method(), "POST");
    const body = route.request().postData();
    const payload = JSON.parse(body);
    assert.equal(payload.operation, "lookup");
    assert.equal(payload.username, target.username);
    assert.equal(payload.purpose, "SAFETY");
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
        body: JSON.stringify({ message: "Fictional People retry cooldown" })
      });
    if (attempts.length === 3)
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Fictional People retry unavailable" })
      });
    assert.equal(attempts.length, 4);
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    assert.deepEqual(await response.json(), originalReceipt);
    return route.fulfill({ response });
  });
  try {
    await fill(target.username, "SAFETY");
    await submit.click();
    await retry.waitFor();
    await oneKey(attempts[0].body);
    await effectCount(3);
    const savedOperation = await oneKey(attempts[0].body);
    await revoke(lookupGrant);
    await event("focus");
    await denied(target.username);
    assert.equal(
      await form.count(),
      0,
      "Denied access has no original retry form"
    );
    await page.waitForLoadState("networkidle");
    assert.equal(attempts.length, 1);
    await restore(lookupGrant);
    await event("focus");
    await fieldsAre(target.username, "SAFETY");
    await retry.waitFor();
    assert.equal(await username.isEnabled(), false);
    await retry.click();
    await form
      .getByRole("alert")
      .filter({ hasText: "Fictional People retry cooldown" })
      .waitFor();
    assert.equal(await retry.isEnabled(), false, "429 honors Retry-After");
    assert.equal(await username.isEnabled(), false);
    // Playwright waits for the cooldown before triggering a retry under the replaced cookie.
    await signIn(replacement);
    await retry.click();
    await page
      .getByText("Your sign-in changed. Reload before continuing.", {
        exact: true
      })
      .waitFor();
    await inactive(target.username);
    assert.equal(
      attempts.length,
      2,
      "Replacement account cannot transmit the retained command"
    );
    await signIn(actor);
    await event("focus");
    await fieldsAre(target.username, "SAFETY");
    await retry.click();
    await form
      .getByRole("alert")
      .filter({ hasText: "Fictional People retry unavailable" })
      .waitFor();
    await oneKey(attempts[0].body);
    await fit("pending", 320, true);
    await page.setViewportSize({ width: 390, height: 844 });
    await retry.click();
    await targetHeading().waitFor();
    await fieldsAre("", "SUPPORT");
    await submit.waitFor();
    assert.equal(await retry.count(), 0);
    assert.equal(attempts.length, 4);
    assert.ok(
      attempts.every(
        (attempt) =>
          attempt.body === attempts[0].body && attempt.owner === actor.id
      )
    );
    assert.deepEqual(await oneKey(attempts[0].body), savedOperation);
    await effectCount(3);
    receipts.push({
      scenario: "lost-ack-retry",
      body: attempts[0].body,
      receipt: originalReceipt
    });
  } finally {
    removeRetry();
  }
  ok(
    "One accepted lookup survives lost acknowledgment, partial revocation and account replacement. Four transmitted attempts keep identical bytes/key/account through 429 and 503; explicit authorized retry displays current server details and confirms exactly one unchanged audit operation."
  );

  // A separate uncertain command tests deliberate discard while access is denied.
  let discardBody;
  const removeDiscard = register(command, async (route) => {
    discardBody = route.request().postData();
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    return route.abort("failed");
  });
  try {
    await fill(target.username, "VERIFICATION");
    await submit.click();
    await retry.waitFor();
  } finally {
    removeDiscard();
  }
  const discardedSavedOperation = await oneKey(discardBody);
  await effectCount(4);
  await revoke(lookupGrant);
  await event("focus");
  await denied(target.username);
  const beforeDiscardDialogs = dialogs.length;
  dialogAccept = false;
  await button("Discard local entries").click();
  assert.equal(dialogs.length, beforeDiscardDialogs + 1);
  assert.match(dialogs.at(-1).message, /may already be saved/);
  await button("Discard local entries").waitFor();
  dialogAccept = true;
  await button("Discard local entries").click();
  assert.equal(dialogs.length, beforeDiscardDialogs + 2);
  await button("Discard local entries").waitFor({ state: "detached" });
  await restore(lookupGrant);
  await event("focus");
  await fieldsAre("", "SUPPORT");
  assert.equal(await retry.count(), 0);
  await noResult();
  assert.deepEqual(await oneKey(discardBody), discardedSavedOperation);
  await effectCount(4);
  assert.equal(browserWrites.length, 7);
  ok(
    "Denied-access uncertain discard requires confirmation; cancel keeps recovery and accept clears only browser state. The already-saved lookup audit remains once, and restored authority receives a clean SUPPORT form."
  );

  await page.goto(config.origin + "/platform/admin/churches");
  const listing = page.getByRole("link", {
    name: "Review public church listings",
    exact: true
  });
  const establish = page.getByRole("link", {
    name: "Existing church administration",
    exact: true
  });
  await listing.waitFor();
  await establish.waitFor();
  await page.evaluate(() => {
    window.__churchesDocument = "original";
  });
  await revoke(listingsGrant);
  await event("focus");
  await listing.waitFor({ state: "detached" });
  await establish.waitFor();
  const churchNav = await currentNavigation();
  assert.ok(!churchNav.capabilities.includes("REVIEW_CHURCH_LISTINGS"));
  assert.ok(churchNav.capabilities.includes("ESTABLISH_CHURCH"));
  assert.ok(churchNav.sections.some((section) => section.key === "churches"));
  assert.equal(
    await page.locator('a[href="/platform/operator/listings"]').count(),
    0
  );
  await restore(listingsGrant);
  await event("focus");
  await listing.waitFor();
  await establish.waitFor();
  assert.equal(
    await page.evaluate(() => window.__churchesDocument),
    "original"
  );
  noNewWrite(7);
  ok(
    "Churches uses the fresh raw navigation payload: partial listing-review revocation removes its destination while retaining current establishment access, and same-grant restoration updates the original document without management actions."
  );

  const finalRows = await lookupRows();
  assert.equal(finalRows.length, 4);
  assert.equal(new Set(finalRows.map((row) => row.requestKey)).size, 4);
  assert.ok(
    browserWrites.every(
      (write) =>
        write.path === "/api/platform/admin" &&
        write.method === "POST" &&
        write.owner === actor.id &&
        JSON.parse(write.body).operation === "lookup"
    )
  );
  assert.equal(
    (
      await db.platformOperatorGrant.findUniqueOrThrow({
        where: { id: lookupGrant.id }
      })
    ).version,
    lookupGrant.version + 6
  );
  assert.equal(
    (
      await db.platformOperatorGrant.findUniqueOrThrow({
        where: { id: listingsGrant.id }
      })
    ).version,
    listingsGrant.version + 2
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
    attempts,
    receipts,
    dialogs,
    fixtureOnly: true,
    fixtureEffects: {
      createdActors: 3,
      createdGrants: 4,
      lookupOperations: 4,
      grantRevokeRestoreUpdates: 8
    },
    browserMutationAttempts: browserWrites.length,
    productionWrites: 0,
    recipientSends: 0,
    limitations: [
      "Lifecycle events are synthetic and do not establish physical-device or operating-system snapshot behavior.",
      "429/503 responses and lost acknowledgments are injected after a real first saved lookup; this is recovery evidence, not rate-limiter configuration evidence.",
      "Existing Admin and original-retry suites cover non-opt-in form owners. Churches verification changes only isolated grants and performs no management actions."
    ]
  });
  console.log("ADMIN_PEOPLE_PRIVACY_BROWSER_PASS " + results.length);
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
