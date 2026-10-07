import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";

assert.ok(process.argv[2], "Pass an isolated preview directory");
const dir = resolve(process.argv[2]);
const config = JSON.parse(readFileSync(dir + "/browser-env.json", "utf8"));
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
const database = new URL(config.database);
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.pathname, "/godschurches_security_test");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  NODE_ENV: "test",
  VERCEL: "",
  PRIVILEGED_MFA_MODE: "off",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: dir + "/sink",
  RETENTION_TEST_DIR: dir + "/retention",
  AUTH_RATE_LIMIT_SECRET: "volunteer-history-browser-fictional-".repeat(3),
  SOCIAL_EMAIL_ENABLED: "false",
  BLOB_READ_WRITE_TOKEN: "",
  BLOB_STORE_ID: "",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: ""
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase } = await import("../tests/seed-portal.ts");
const { seedVolunteerApplications, volunteerAction } =
  await import("../tests/seed-volunteer-applications.ts");
const { volunteerCommand } =
  await import("../lib/platform/volunteer-commands.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
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
const output = dir + "/volunteer-service-history-browser-" + Date.now();
mkdirSync(output, { recursive: true, mode: 0o700 });
const groups = [],
  errors = [],
  external = [],
  contexts = [],
  requests = [];
const ok = (message) => {
  groups.push(message);
  console.log("PASS " + message);
};
const cookie = (actor) => ({
  name: sessionCookieFixtureName(config.origin),
  value: actor.token,
  url: config.origin,
  secure: true,
  httpOnly: true,
  sameSite: "Lax"
});
async function actorPage(actor, width = 390) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    timezoneId: "America/Chicago"
  });
  contexts.push(context);
  if (actor) await context.addCookies([cookie(actor)]);
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === config.origin) return route.continue();
    external.push(url.origin);
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (dialog) => dialog.accept());
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/platform/volunteers"
    )
      requests.push({
        owner: request.headers()["x-expected-account"],
        body: request.postData()
      });
  });
  return { page, context };
}
async function go(page, path) {
  await page.bringToFront();
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
  await page.getByRole("heading", { level: 1 }).waitFor();
}
async function deadline(promise, label, milliseconds = 20000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error(label + " timed out")),
          milliseconds
        );
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function refresh(page) {
  console.log("BROWSER_REFRESH", new URL(page.url()).pathname);
  const path = new URL(page.url()).pathname;
  const identityRequests = new Set();
  const completedIdentity = [];
  const requested = (request) => {
    const url = new URL(request.url());
    if (
      url.pathname === "/api/platform/profile" &&
      url.searchParams.get("view") === "identity"
    )
      identityRequests.add(request);
  };
  const received = async (response) => {
    if (!identityRequests.has(response.request())) return;
    // The access guard deliberately cancels denied bodies. Its settled notice
    // below proves handling; waiting for that cancelled body would deadlock QA.
    if (response.status() === 401) {
      completedIdentity.push(response.status());
      return;
    }
    try {
      if (!(await response.finished()))
        completedIdentity.push(response.status());
    } catch {
      // Interrupted checks never qualify as completed access verification.
    }
  };
  page.on("request", requested);
  page.on("response", received);
  const reply = page.waitForResponse(
    (response) =>
      response.request().headers().rsc === "1" &&
      new URL(response.url()).pathname === path
  );
  try {
    await deadline(
      page.evaluate(() => {
        if (typeof window.next?.router?.refresh !== "function")
          throw Error("Installed Next router refresh unavailable");
        // Next's HistoryUpdater replaces this tree in its insertion effect
        // after the refreshed router state commits. A streaming RSC response
        // need not finish before that commit, and headers alone prove nothing.
        const tree = history.state?.__PRIVATE_NEXTJS_INTERNALS_TREE;
        if (!tree || tree !== history.state.__PRIVATE_NEXTJS_INTERNALS_TREE)
          throw Error("Installed Next committed router tree unavailable");
        window.serviceTestRefreshTree = tree;
        // Read the current committed root, never a host fiber's stale alternate.
        // This additionally proves the service page itself consumed the RSC,
        // including while its original working children remain retained.
        window.serviceTestScopeProps = () => {
          const key = Object.getOwnPropertyNames(document).find((value) =>
            value.startsWith("__reactContainer$")
          );
          const root = key && document[key]?.stateNode?.current;
          const pending = root ? [root] : [];
          while (pending.length) {
            const node = pending.pop();
            const props = node.memoizedProps;
            if (
              props &&
              typeof props.url === "string" &&
              props.url.startsWith("/api/platform/volunteers?") &&
              typeof props.ready === "boolean" &&
              Object.hasOwn(props, "owner") &&
              Object.hasOwn(props, "children") &&
              !Object.hasOwn(props, "original")
            )
              return props;
            if (node.sibling) pending.push(node.sibling);
            if (node.child) pending.push(node.child);
          }
          return null;
        };
        window.serviceTestRefreshProps = window.serviceTestScopeProps();
        if (!window.serviceTestRefreshProps)
          throw Error("Committed service page scope unavailable");
        window.next.router.refresh();
      }),
      "Router refresh invocation"
    );
    const response = await reply;
    assert.equal(response.status(), 200);
    await page.waitForFunction(
      () =>
        !!history.state?.__PRIVATE_NEXTJS_INTERNALS_TREE &&
        history.state.__PRIVATE_NEXTJS_INTERNALS_TREE !==
          window.serviceTestRefreshTree &&
        !!window.serviceTestScopeProps() &&
        window.serviceTestScopeProps() !== window.serviceTestRefreshProps,
      undefined,
      { polling: 100 }
    );
    console.log("BROWSER_REFRESH_COMMITTED");
    if (
      await deadline(
        page.evaluate(
          () => document.hasFocus() && document.visibilityState !== "hidden"
        ),
        "Refresh foreground check"
      )
    ) {
      await until(
        async () =>
          completedIdentity.some((status) => status === 401) ||
          completedIdentity.filter((status) => status === 200).length >= 2,
        "Refreshed service frame never completed its account/source/account recheck"
      );
      console.log("BROWSER_REFRESH_ACCESS_FINISHED", completedIdentity);
      await deadline(
        page.evaluate(
          () =>
            new Promise((done) =>
              requestAnimationFrame(() => requestAnimationFrame(done))
            )
        ),
        "Foreground refresh animation frames",
        5000
      );
    }
  } finally {
    page.off("request", requested);
    page.off("response", received);
  }
}
async function until(fn, message) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(message);
}
const button = (page, name) => page.getByRole("button", { name, exact: true });
const wake = (page) =>
  page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true })
    );
  });
let phase = "seed";
function step(value) {
  phase = value;
  console.log("BROWSER_PHASE", value);
}
try {
  const f = await seedVolunteerApplications(db, false, 2);
  const applied = await volunteerCommand(
    db,
    f.lee.token,
    f.application("Fictional private browser statement")
  );
  await volunteerCommand(
    db,
    f.ada.token,
    volunteerAction("accept", {
      id: applied.id,
      expectedVersion: applied.version,
      ...f.snapshot
    })
  );
  const record = () =>
    db.volunteerApplication.findUniqueOrThrow({ where: { id: applied.id } });
  const applicant = await actorPage(f.lee),
    coordinator = await actorPage(f.ada, 1280),
    viewer = await actorPage(f.val),
    guest = await actorPage(null);
  step("private default");
  await go(applicant.page, "/platform/serve/history");
  await applicant.page
    .getByText("Completion has not been confirmed.", { exact: true })
    .waitFor();
  assert.equal(
    await button(
      applicant.page,
      "Share confirmed service on my profile"
    ).count(),
    0
  );
  assert.equal((await record()).serviceSharedAt, null);
  ok(
    "Unconfirmed accepted assignment remains private and offers no sharing control."
  );

  step("organizer completion");
  await go(
    coordinator.page,
    `/platform/serve/${f.opportunity.id}/applications`
  );
  await coordinator.page
    .getByRole("textbox", {
      name: "Optional private completion note",
      exact: true
    })
    .fill("Fictional private organizer note");
  const note = coordinator.page.getByRole("textbox", {
    name: "Optional private completion note",
    exact: true
  });
  const documentId = await coordinator.page.evaluate(
    () => (window.serviceTestDocument = crypto.randomUUID())
  );
  const beforeLifecycle = requests.length;
  await refresh(coordinator.page);
  await until(
    async () =>
      (await note.inputValue()) === "Fictional private organizer note",
    "Same-owner refresh discarded unsaved completion note"
  );
  await coordinator.context.addCookies([cookie(f.blake)]);
  await refresh(coordinator.page);
  await coordinator.page
    .getByText(
      "Return to the original account to recover your service entries and requests.",
      { exact: true }
    )
    .waitFor();
  await until(
    async () => (await note.count()) === 0,
    "Replacement-owner RSC exposed the original note"
  );
  await coordinator.context.addCookies([cookie(f.ada)]);
  await refresh(coordinator.page);
  await note.waitFor();
  assert.equal(await note.inputValue(), "Fictional private organizer note");
  assert.equal(
    await coordinator.page.evaluate(() => window.serviceTestDocument),
    documentId
  );
  const cover = await coordinator.context.newPage();
  await cover.goto("about:blank");
  const foregroundCdp = await coordinator.context.newCDPSession(
    coordinator.page
  );
  const backgroundCdp = await coordinator.context.newCDPSession(cover);
  // Playwright otherwise emulates focus on every page. Observe a trusted
  // browser blur with that override disabled on both actual tabs.
  await foregroundCdp.send("Emulation.setFocusEmulationEnabled", {
    enabled: false
  });
  await backgroundCdp.send("Emulation.setFocusEmulationEnabled", {
    enabled: false
  });
  await coordinator.page.bringToFront();
  await coordinator.page.waitForFunction(() => document.hasFocus());
  await note.waitFor();
  await coordinator.page.evaluate(() => {
    window.serviceTestTrustedBlur = 0;
    window.addEventListener("blur", (event) => {
      if (event.isTrusted) window.serviceTestTrustedBlur++;
    });
  });
  await cover.bringToFront();
  await until(
    async () => !(await coordinator.page.evaluate(() => document.hasFocus())),
    "Native secondary tab did not blur original page"
  );
  assert.ok(
    await coordinator.page.evaluate(() => window.serviceTestTrustedBlur > 0)
  );
  await coordinator.page.evaluate(() =>
    window.dispatchEvent(new Event("online"))
  );
  await refresh(coordinator.page);
  await until(
    async () => (await note.count()) === 0,
    "Background refresh revealed an unsaved private note"
  );
  await coordinator.page.bringToFront();
  await wake(coordinator.page);
  await note.waitFor();
  assert.equal(await note.inputValue(), "Fictional private organizer note");
  await foregroundCdp.send("Emulation.setFocusEmulationEnabled", {
    enabled: true
  });
  await foregroundCdp.detach();
  await backgroundCdp.detach();
  await cover.close();
  assert.equal(requests.length, beforeLifecycle);
  ok(
    "Actual same-document A-to-B-to-A refresh and native tab blur preserve the original note without background disclosure or writes."
  );
  await button(coordinator.page, "Confirm completed service").click();
  await until(
    async () => !!(await record()).completedAt,
    "Completion did not persist"
  );
  await button(coordinator.page, "Correct completion").waitFor();
  assert.equal((await record()).serviceSharedAt, null);
  assert.equal(
    await db.postVolunteerSignup.count({ where: { userId: f.lee.id } }),
    0,
    "Untimed assignment does not invent a signup"
  );
  ok(
    "Organizer confirms untimed service through the UI without granting consent or creating an event assignment."
  );

  step("lost consent reply");
  await go(applicant.page, "/platform/serve/history");
  let stage = 0;
  await applicant.page.route("**/api/platform/volunteers", async (route) => {
    if (
      stage < 2 &&
      route.request().method() === "POST" &&
      JSON.parse(route.request().postData()).operation === "service-visibility"
    ) {
      stage++;
      if (stage === 1)
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "unrelated-service",
            version: 99,
            message: "Unrelated acknowledgment"
          })
        });
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      return route.abort("failed");
    }
    return route.continue();
  });
  const requestStart = requests.length;
  await button(applicant.page, "Share confirmed service on my profile").click();
  const retry = () =>
    applicant.page.getByRole("button", { name: /^Confirm original/ }).first();
  await retry().waitFor();
  assert.equal(
    (await record()).serviceSharedAt,
    null,
    "Malformed acknowledgment must not stand in for a save"
  );
  await retry().click();
  await until(
    async () => !!(await record()).serviceSharedAt,
    "Consent did not persist before lost reply"
  );
  await retry().waitFor();
  await applicant.context.clearCookies();
  await refresh(applicant.page);
  await applicant.page
    .getByText(
      "Return to the original account to recover your service entries and requests.",
      { exact: true }
    )
    .waitFor();
  await until(
    async () => (await retry().count()) === 0,
    "Guest refresh exposed the original request"
  );
  await applicant.context.addCookies([cookie(f.lee)]);
  await refresh(applicant.page);
  await retry().click();
  await button(applicant.page, "Hide service from my profile").waitFor();
  await applicant.page.unroute("**/api/platform/volunteers");
  const retried = requests
    .slice(requestStart)
    .filter((r) => JSON.parse(r.body).operation === "service-visibility");
  assert.equal(retried.length, 3);
  for (const request of retried) {
    assert.equal(request.body, retried[0].body);
    assert.equal(request.owner, f.lee.id);
  }
  ok(
    "Malformed receipt remains pending; a lost real consent reply survives guest refresh and recovers the same original owner, immutable body and mutation key."
  );

  step("profile audience");
  await go(viewer.page, `/platform/profile/${f.lee.username}`);
  await viewer.page
    .getByRole("heading", { name: "Shared service history", exact: true })
    .waitFor();
  const html = await viewer.page.content();
  assert.ok(!html.includes("Fictional private browser statement"));
  assert.ok(!html.includes("Fictional private organizer note"));
  await go(guest.page, `/platform/profile/${f.lee.username}`);
  assert.equal(
    await guest.page
      .getByRole("heading", { name: "Shared service history", exact: true })
      .count(),
    0
  );
  ok(
    "Only an authorized member sees the voluntarily shared projection; private notes and guest profile stay clear."
  );

  step("bounded layout and keyboard");
  await applicant.page.bringToFront();
  await wake(applicant.page);
  await button(applicant.page, "Hide service from my profile").waitFor();
  for (const width of [320, 1280]) {
    await applicant.page.setViewportSize({ width, height: 900 });
    await applicant.page.evaluate((enlarged) => {
      document.documentElement.style.fontSize = enlarged ? "200%" : "";
    }, width === 320);
    assert.ok(
      await applicant.page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      )
    );
    await applicant.page.screenshot({
      path: output + `/history-${width}.png`,
      fullPage: true
    });
  }
  await applicant.page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await button(applicant.page, "Hide service from my profile").focus();
  await applicant.page.keyboard.press("Enter");
  await until(
    async () => (await record()).serviceSharedAt === null,
    "Keyboard withdrawal did not persist"
  );
  const withdrawnSnapshot = viewer.page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/platform/profile" &&
      url.searchParams.get("view") === "member-snapshot"
    );
  });
  await viewer.page.bringToFront();
  await wake(viewer.page);
  const checkedSnapshot = await withdrawnSnapshot;
  assert.equal(checkedSnapshot.status(), 200);
  assert.equal(await checkedSnapshot.finished(), null);
  await viewer.page
    .getByText(
      /^This member profile or its access changed\. Reload to inspect current details\./
    )
    .waitFor();
  await until(
    async () =>
      (await viewer.page
        .getByRole("heading", { name: "Shared service history", exact: true })
        .count()) === 0,
    "Retained profile did not conceal withdrawn service"
  );
  ok(
    "Narrow large-text and desktop layouts are bounded; keyboard withdrawal invalidates a retained profile."
  );

  step("correction and reconfirmation");
  await go(applicant.page, "/platform/serve/history");
  await button(applicant.page, "Share confirmed service on my profile").click();
  await until(
    async () => !!(await record()).serviceSharedAt,
    "Resharing did not persist"
  );
  await go(
    coordinator.page,
    `/platform/serve/${f.opportunity.id}/applications`
  );
  await coordinator.page
    .getByRole("textbox", {
      name: "Reason for correcting this completion",
      exact: true
    })
    .fill("Fictional correction after checking completion");
  await button(coordinator.page, "Correct completion").click();
  await until(
    async () =>
      !(await record()).completedAt && !(await record()).serviceSharedAt,
    "Correction did not clear consent"
  );
  await button(coordinator.page, "Confirm completed service").click();
  await until(
    async () => !!(await record()).completedAt,
    "Reconfirmation did not persist"
  );
  assert.equal((await record()).serviceSharedAt, null);
  ok(
    "Correction removes the completion and its consent; reconfirmation does not restore sharing."
  );

  step("account replacement");
  await go(applicant.page, "/platform/serve/history");
  await button(
    applicant.page,
    "Share confirmed service on my profile"
  ).waitFor();
  const beforeSwap = requests.length;
  await applicant.context.addCookies([cookie(f.blake)]);
  const replacementIdentity = applicant.page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/platform/profile" &&
      url.searchParams.get("view") === "identity" &&
      response.status() === 401
    );
  });
  await wake(applicant.page);
  assert.equal((await replacementIdentity).status(), 401);
  await applicant.page
    .getByText(
      "Return to the original account to recover your service entries and requests.",
      { exact: true }
    )
    .waitFor();
  await until(
    async () =>
      (await button(
        applicant.page,
        "Share confirmed service on my profile"
      ).count()) === 0,
    "Account replacement did not conceal original choices"
  );
  assert.equal(requests.length, beforeSwap);
  assert.equal((await record()).serviceSharedAt, null);
  ok(
    "Account replacement conceals the original volunteer choices without sending a cross-account command."
  );

  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  writeFileSync(
    output + "/receipt.json",
    JSON.stringify(
      {
        groups,
        errors,
        external,
        commandCount: requests.length,
        productionWrites: 0,
        nativeDeviceAcceptance: false,
        phase: "complete"
      },
      null,
      2
    )
  );
  console.log("Browser evidence:", output);
} catch (error) {
  writeFileSync(
    output + "/failure.json",
    JSON.stringify(
      {
        phase,
        message: error.message,
        stack: error.stack,
        groups,
        errors,
        external
      },
      null,
      2
    )
  );
  throw error;
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await db.$disconnect();
}
