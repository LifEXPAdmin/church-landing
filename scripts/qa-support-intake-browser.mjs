import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";

const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the existing isolated preview artifact directory");
assert.ok(resolve(fixtureDir).startsWith(resolve(".account-test") + "/"));
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: resolve(fixtureDir, "sink"),
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: ""
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase } = await import("../tests/seed-portal.ts");
const { seedSupport } = await import("../tests/seed-support.ts");
const { SUPPORT_NOTICE } = await import("../lib/platform/support-types.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
// Only this verified isolated seed process is configured here. The preview
// must already have ordinary Support intake enabled for the fictional suite.
process.env.SUPPORT_INTAKE_ENABLED = "true";
const originalIntake = await db.supportIntakeSetting.findUnique({
  where: { id: "default" }
});
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ??
    `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`
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
const externalRequests = [],
  browserWrites = [],
  errors = [],
  results = [];
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
const page = await context.newPage();
page.setDefaultTimeout(30000);
page.on("pageerror", (error) =>
  errors.push({ path: new URL(page.url()).pathname, message: error.message })
);
const output = fixtureDir + "/support-intake-browser-" + Date.now();
mkdirSync(output, { recursive: true, mode: 0o700 });
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const nonce = randomUUID();
const ownerName = "Fictional intake owner " + nonce;
const backupName = "Fictional replacement owner " + nonce;
const churchName = "Fictional intake context " + nonce;
const subject = "Unsent intake " + nonce;
const description = "Fictional private unsent intake description " + nonce;
const savedSubject = "Unconfirmed intake " + nonce;
const savedDescription = "Fictional exact uncertain create body " + nonce;
const privateMarkers = [
  ownerName,
  backupName,
  churchName,
  subject,
  description,
  savedSubject,
  savedDescription
];
const intakeRoute = (url) =>
  url.pathname === "/api/platform/support" &&
  url.searchParams.get("view") === "new";
const identityRoute = "**/api/platform/profile?view=identity";
const form = () =>
  page.getByRole("form", { name: "Send request", exact: true });
const button = (name) => page.getByRole("button", { name, exact: true });
const summary = () => form().getByLabel("Short summary", { exact: true });
const details = () =>
  form().getByLabel("What happened, and what would help?", {
    exact: true
  });
const category = () =>
  form().getByLabel("What do you need help with?", {
    exact: true
  });
const consent = () => form().getByRole("checkbox");
const changed = () =>
  page.getByRole("status").filter({ hasText: /changed.*Reload/i });
const event = (name) =>
  page.evaluate((type) => window.dispatchEvent(new Event(type)), name);
const signIn = async (actor) => {
  await context.clearCookies();
  await context.addCookies([
    {
      name: "church_platform_session",
      value: actor.token,
      domain: "127.0.0.1",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
};
const go = async (path) => {
  await page.goto(config.origin + path);
  await page.waitForLoadState("networkidle");
};
const absent = async () => {
  await page.waitForFunction((markers) => {
    const content = document.documentElement.textContent ?? "";
    const values = [
      ...document.querySelectorAll("input, textarea, select")
    ].map((field) => field.value);
    return (
      markers.every(
        (marker) =>
          !content.includes(marker) &&
          values.every((value) => !value.includes(marker))
      ) &&
      !document.querySelector(
        'input[name="subject"], textarea[name="description"]'
      )
    );
  }, privateMarkers);
};
const fill = async (
  text = subject,
  body = description,
  choice = "DIRECTORY_SHARING"
) => {
  await form().waitFor();
  await summary().fill(text);
  await details().fill(body);
  await category().selectOption(choice);
  await consent().check();
};
const retained = async (
  text = subject,
  body = description,
  choice = "DIRECTORY_SHARING"
) => {
  await form().waitFor();
  assert.equal(await summary().inputValue(), text);
  assert.equal(await details().inputValue(), body);
  assert.equal(await category().inputValue(), choice);
  assert.equal(await consent().isChecked(), true);
};
const empty = async () => {
  await form().waitFor();
  assert.equal(await summary().inputValue(), "");
  assert.equal(await details().inputValue(), "");
  assert.equal(await consent().isChecked(), false);
};
const bounded = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal page overflow"
  );
const reloadChoice = async (accept) => {
  const dialogs = [];
  const answer = async (dialog) => {
    dialogs.push({ type: dialog.type(), message: dialog.message() });
    if (accept && ["confirm", "beforeunload"].includes(dialog.type()))
      await dialog.accept();
    else await dialog.dismiss();
  };
  page.on("dialog", answer);
  try {
    const loaded = accept ? page.waitForEvent("load") : null;
    await button("Reload current information").click();
    if (loaded) await loaded;
  } finally {
    page.off("dialog", answer);
  }
  assert.equal(
    dialogs[0]?.type,
    "confirm",
    "Reload requires deliberate discard confirmation"
  );
  assert.match(dialogs[0].message, /discard|clear/i);
  assert.ok(
    dialogs.slice(1).every((dialog) => accept && dialog.type === "beforeunload")
  );
};
let releaseHeldRead;
const holdRead = async () => {
  let capture,
    release,
    reads = 0;
  const captured = new Promise((resolve) => {
    capture = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  releaseHeldRead = release;
  await page.route(intakeRoute, async (route) => {
    reads++;
    const response = await route.fetch();
    if (reads === 1) {
      capture();
      await gate;
    }
    await route.fulfill({ response });
  });
  await event("focus");
  let timeout;
  try {
    await Promise.race([
      captured,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Intake read was not captured")),
          30000
        );
      })
    ]);
  } finally {
    clearTimeout(timeout);
  }
  return { release, reads: () => reads };
};
let fixture;
try {
  fixture = await seedSupport(db);
  await db.platformUser.update({
    where: { id: fixture.owner.id },
    data: { name: ownerName }
  });
  await db.platformUser.update({
    where: { id: fixture.backup.id },
    data: { name: backupName }
  });
  await db.church.update({
    where: { id: fixture.churchA.id },
    data: { name: churchName }
  });
  const path =
    "/platform/help/new?churchId=" + encodeURIComponent(fixture.churchA.id);
  const ownCases = () =>
    db.supportCase.count({ where: { requesterId: fixture.memberA.id } });
  const setRecipient = (id, enabled = true) =>
    db.supportIntakeSetting.update({
      where: { id: "default" },
      data: { ownerGrantId: id, enabled }
    });

  await go(path);
  assert.equal(new URL(page.url()).pathname, "/platform/login");
  const guestRead = await context.request.get(
    config.origin + "/api/platform/support?view=new"
  );
  assert.equal(guestRead.status(), 401);
  await absent();
  ok("Guest intake redirects to sign-in and its private API denies access");

  await signIn(fixture.memberA);
  for (const flight of [false, true]) {
    const response = await context.request.get(config.origin + path, {
      ...(flight ? { headers: { RSC: "1" } } : {})
    });
    assert.equal(response.status(), 200);
    if (flight)
      assert.match(response.headers()["content-type"], /text\/x-component/);
    const serialized = await response.text();
    for (const marker of [ownerName, churchName])
      assert.ok(
        !serialized.includes(marker),
        "No private intake marker in initial HTML/RSC"
      );
  }
  await go(path);
  await form().waitFor();
  assert.ok((await page.locator("main").innerText()).includes(ownerName));
  assert.ok((await page.locator("main").innerText()).includes(churchName));
  assert.equal(
    await page.evaluate(
      (markers) =>
        [...document.scripts].some((node) =>
          markers.some((marker) => node.textContent.includes(marker))
        ),
      [ownerName, churchName]
    ),
    false
  );
  await fill();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await bounded();
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await bounded();
  await page.screenshot({
    path: output + "/intake-320-enlarged.png",
    fullPage: true
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  ok(
    "Authenticated HTML/RSC omits private intake data; the disclosed recipient, church context and dirty form fit 320/390px and enlarged text"
  );

  const beforeNavigation = page.url();
  await page
    .getByRole("link", { name: "General account or website", exact: true })
    .click();
  assert.equal(page.url(), beforeNavigation);
  await retained();
  await page
    .getByText("Save, retry or discard these local entries before leaving.", {
      exact: true
    })
    .waitFor();
  assert.equal(await ownCases(), 0);
  ok(
    "Changing church context cannot navigate away from unsaved entries or submit them implicitly"
  );

  for (const trigger of ["blur", "offline", "pagehide", "hidden"]) {
    if (trigger === "hidden") {
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          value: "hidden"
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
    } else await event(trigger === "offline" ? "online" : "focus");
    await retained();
  }
  ok(
    "Blur, offline, pagehide and hidden visibility remove private DOM text and controls; unchanged same-owner reads restore every dirty field"
  );

  for (const source of ["identity", "intake"]) {
    const pattern = source === "identity" ? identityRoute : intakeRoute;
    await page.route(pattern, (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Fictional Support intake read outage"
        })
      })
    );
    await event("focus");
    await page
      .getByText(
        source === "identity"
          ? "Your sign-in could not be checked. Reconnect and try again."
          : "Fictional Support intake read outage",
        { exact: true }
      )
      .waitFor();
    await absent();
    await page.unroute(pattern);
    await button("Recheck current access").click();
    await retained();
  }
  ok(
    "Failed identity and intake reads remove private DOM values without losing the original local draft"
  );

  let held = await holdRead();
  await absent();
  await event("pagehide");
  held.release();
  await page.waitForLoadState("networkidle");
  await absent();
  assert.equal(held.reads(), 1);
  await page.unroute(intakeRoute);
  await event("focus");
  await retained();
  ok(
    "A late successful intake read cannot restore private content after pagehide"
  );

  held = await holdRead();
  await event("blur");
  await event("focus");
  await absent();
  assert.equal(held.reads(), 1);
  held.release();
  await retained();
  await page.waitForLoadState("networkidle");
  assert.equal(held.reads(), 2, "Focus queues one current intake read");
  await page.unroute(intakeRoute);
  ok(
    "Focus during a held read queues one fresh check before restoring the draft"
  );

  held = await holdRead();
  await signIn(fixture.memberB);
  await event("blur");
  await event("focus");
  held.release();
  await page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .waitFor();
  await page.waitForLoadState("networkidle");
  await absent();
  assert.equal(await button("Confirm original request").count(), 0);
  await page.unroute(intakeRoute);
  await button("Recheck current access").click();
  await page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .waitFor();
  await absent();
  await signIn(fixture.memberA);
  await event("focus");
  await retained();
  assert.equal(await ownCases(), 0);
  ok(
    "Account replacement rejects a held old-account read, exposes no old fields, and preserves the draft for its original account"
  );

  await setRecipient(fixture.backupGrant.id);
  await event("focus");
  await changed().waitFor();
  await absent();
  await reloadChoice(false);
  await absent();
  await button("Recheck current access").click();
  await changed().waitFor();
  await absent();
  await setRecipient(fixture.ownerGrant.id);
  await event("focus");
  await retained();
  assert.equal(await ownCases(), 0);
  await setRecipient(fixture.backupGrant.id);
  await event("focus");
  await changed().waitFor();
  const reloaded = page.waitForEvent("load");
  await reloadChoice(true);
  await reloaded;
  await empty();
  assert.ok((await page.locator("main").innerText()).includes(backupName));
  assert.equal(await ownCases(), 0);
  ok(
    "A changed recipient never rebases or sends a dirty form; cancelling reload preserves it, and accepting the warning deliberately opens a fresh empty form"
  );

  await setRecipient(fixture.ownerGrant.id, false);
  await go(path);
  await page
    .getByText(/Private request intake is not available yet\./)
    .waitFor();
  assert.equal(await form().count(), 0);
  const disabled = await context.request.post(
    config.origin + "/api/platform/support",
    {
      headers: {
        origin: config.origin,
        "x-expected-account": fixture.memberA.id
      },
      data: {
        operation: "create",
        requestKey: randomUUID(),
        churchId: fixture.churchA.id,
        recipientId: fixture.ownerGrant.id,
        recipientVersion: fixture.ownerGrant.version,
        notice: SUPPORT_NOTICE,
        consent: true,
        category: "ACCOUNT_WEBSITE",
        subject: "Fictional disabled intake",
        description: "Fictional disabled request must never save."
      }
    }
  );
  assert.equal(disabled.status(), 503);
  assert.equal(await ownCases(), 0);
  await setRecipient(fixture.ownerGrant.id);
  await go(path);
  await empty();
  ok(
    "Disabled intake exposes no send form and the existing API refuses storage"
  );

  await fill();
  await signIn(fixture.memberB);
  // Do not dispatch blur/focus: the mutation's own identity check must conceal.
  await form().waitFor();
  await button("Send request").click();
  await absent();
  await button("Recheck current access").waitFor();
  assert.deepEqual(
    browserWrites,
    [],
    "Changed identity must prevent the Support POST itself"
  );
  assert.equal(await button("Confirm original request").count(), 0);
  assert.equal(await ownCases(), 0);
  await signIn(fixture.memberA);
  await event("focus");
  await retained();
  await button("Retry original request").waitFor();
  const discardDialog = page.waitForEvent("dialog");
  const discarding = button("Discard local entries").click();
  const warning = await discardDialog;
  assert.match(warning.message(), /may already be saved/i);
  await warning.accept();
  await discarding;
  await empty();
  assert.equal(await ownCases(), 0);
  ok(
    "A visible form detects cookie replacement before POST, removes private controls, and preserves its original command until the restored owner explicitly discards it"
  );

  await fill(savedSubject, savedDescription, "FEATURE_SUGGESTION");
  const attempts = [];
  let lostReceipt;
  const endpoint = config.origin + "/api/platform/support";
  await page.route(endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    attempts.push(route.request().postData());
    if (attempts.length === 1) {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      lostReceipt = await response.json();
      await route.abort("failed");
    } else if (attempts.length === 2) {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        headers: { "Retry-After": "1" },
        body: JSON.stringify({ message: "Fictional intake retry rate limit" })
      });
    } else if (attempts.length === 3) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Fictional intake retry outage" })
      });
    } else await route.continue();
  });
  await button("Send request").click();
  await button("Retry original request").waitFor();
  assert.ok(lostReceipt?.caseId);
  assert.equal(await ownCases(), 1);
  await retained(savedSubject, savedDescription, "FEATURE_SUGGESTION");
  assert.equal(await summary().isDisabled(), true);
  await event("pagehide");
  await absent();
  await setRecipient(fixture.backupGrant.id);
  await event("focus");
  await changed().waitFor();
  await absent();
  await button("Confirm original request").waitFor();
  await reloadChoice(false);
  await absent();
  assert.equal(attempts.length, 1);
  await signIn(fixture.memberB);
  await event("blur");
  await event("focus");
  await page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .waitFor();
  await absent();
  assert.equal(await button("Confirm original request").count(), 0);
  const denied = await context.request.post(endpoint, {
    headers: {
      origin: config.origin,
      "x-expected-account": fixture.memberA.id,
      "content-type": "application/json"
    },
    data: attempts[0]
  });
  assert.equal(denied.status(), 401);
  assert.equal(
    await db.supportCase.count({ where: { requesterId: fixture.memberB.id } }),
    0
  );
  assert.equal(await ownCases(), 1);
  await signIn(fixture.memberA);
  await event("focus");
  await button("Confirm original request").waitFor();
  await absent();
  for (const status of [429, 503]) {
    const response = page.waitForResponse(
      (result) => result.url() === endpoint && result.status() === status
    );
    await button("Confirm original request").click();
    const failedRetry = await response;
    if (status === 429) assert.equal(failedRetry.headers()["retry-after"], "1");
    await page
      .getByRole("alert")
      .filter({
        hasText:
          /^We could not confirm the original request\.\s+Recheck access and retry the same request\.$/
      })
      .waitFor();
    await absent();
    await button("Confirm original request").waitFor();
    assert.equal(attempts.length, status === 429 ? 2 : 3);
    assert.equal(attempts.at(-1), attempts[0]);
    assert.equal(await ownCases(), 1);
  }
  await button("Confirm original request").click();
  await page.waitForURL(
    (url) => url.pathname === "/platform/help/cases/" + lostReceipt.caseId
  );
  await page
    .getByRole("heading", { name: savedSubject, exact: true })
    .waitFor();
  assert.equal(attempts.length, 4);
  assert.ok(
    attempts.every((attempt) => attempt === attempts[0]),
    "The exact serialized original command survives every concealment"
  );
  const command = JSON.parse(attempts[0]);
  const saved = await db.supportCase.findUniqueOrThrow({
    where: { id: lostReceipt.caseId }
  });
  assert.equal(saved.requesterId, fixture.memberA.id);
  assert.equal(saved.ownerGrantId, fixture.ownerGrant.id);
  assert.equal(saved.ownerGrantVersion, fixture.ownerGrant.version);
  assert.equal(saved.churchId, fixture.churchA.id);
  assert.equal(saved.subject, savedSubject);
  assert.equal(saved.description, savedDescription);
  assert.equal(saved.category, "FEATURE_SUGGESTION");
  assert.equal(saved.version, lostReceipt.version);
  assert.equal(await ownCases(), 1);
  assert.equal(
    await db.supportOperation.count({
      where: { actorId: fixture.memberA.id, requestKey: command.requestKey }
    }),
    1
  );
  await page.unroute(endpoint);
  ok(
    "A committed but lost create response retains identical bytes/key across concealment, cancelled reload, account replacement, 429 and 503; final confirmation creates no duplicate or recipient rebase"
  );

  await setRecipient(fixture.ownerGrant.id);
  await go(path);
  await fill();
  await button("Discard local entries").click();
  await empty();
  assert.equal(await ownCases(), 1);
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(browserWrites, [
    { method: "POST", path: "/api/platform/support" },
    { method: "POST", path: "/api/platform/support" },
    { method: "POST", path: "/api/platform/support" },
    { method: "POST", path: "/api/platform/support" }
  ]);
  ok(
    "Explicit local discard clears unsent controls; only the original create and three exact retries were browser writes, with no external requests, localStorage copies or page errors"
  );

  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        results,
        errors,
        externalRequests,
        browserWrites,
        createdCases: 1,
        createAndRetryAttempts: 4,
        fixtureOnly: true
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  console.log("SUPPORT_INTAKE_BROWSER_PASS " + results.length);
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
  releaseHeldRead?.();
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
        where: {
          id: "default",
          ownerGrantId: { in: [fixture.ownerGrant.id, fixture.backupGrant.id] }
        }
      });
  } finally {
    await browser.close();
    await db.$disconnect();
  }
}
