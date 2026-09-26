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
const { seedSupport, requestInput } = await import("../tests/seed-support.ts");
const { supportCommand, readSupport } =
  await import("../lib/platform/support.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
// Only this verified isolated seed process is configured here. The preview
// must already have ordinary Support intake enabled for the fictional suite.
Object.assign(process.env, {
  SUPPORT_INTAKE_ENABLED: "true",
  FEEDBACK_INTAKE_ENABLED: "true",
  MEDIA_STORAGE_MODE: "local-test",
  MEDIA_TEST_DIR: resolve(fixtureDir, "images"),
  RETENTION_TEST_DIR: resolve(fixtureDir, "retention"),
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  PUSH_ENABLED: "false"
});
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
const output = fixtureDir + "/support-case-privacy-browser-" + Date.now();
mkdirSync(output, { recursive: true, mode: 0o700 });
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};

const nonce = randomUUID();
const subject = "Fictional private case " + nonce;
const description = "Fictional private case description " + nonce;
const reply = "Fictional reply recovery " + nonce;
const reason = "Fictional sibling reason " + nonce;
const caption = "Fictional attachment caption " + nonce;
const imageAlt = "Fictional blue screenshot " + nonce;
const messagePrefix = "Fictional case history " + nonce;
const markers = [
  subject,
  description,
  reply,
  reason,
  caption,
  imageAlt,
  messagePrefix
];
const endpoint = config.origin + "/api/platform/support";
const readRoute = (url) =>
  url.pathname === "/api/platform/support" &&
  ["detail", "routing"].includes(url.searchParams.get("view"));
const identityRoute = "**/api/platform/profile?view=identity";
const button = (name) => page.getByRole("button", { name, exact: true });
const replyForm = () =>
  page.getByRole("form", { name: "Save reply", exact: true });
const statusForm = () =>
  page.getByRole("form", { name: "Save status", exact: true });
const replyField = () =>
  replyForm().getByRole("textbox", { name: "Your reply", exact: true });
const reasonField = () =>
  statusForm().getByRole("textbox", {
    name: "What changed or resolved the issue?",
    exact: true
  });
const savedSiblingNotice =
  "This change is saved. Other local entries or unconfirmed requests remain on this page. Review them before reloading.";
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
  await page.waitForFunction((values) => {
    const text = document.documentElement.textContent ?? "";
    const fields = [...document.querySelectorAll("input,textarea,select")];
    return (
      values.every(
        (value) =>
          !text.includes(value) &&
          fields.every((field) => !field.value.includes(value))
      ) && !document.querySelector("main form")
    );
  }, markers);
};
const accessibleMain = async () => {
  const main = page.getByRole("main");
  assert.equal(await main.count(), 1, "One accessible main landmark");
  assert.equal(
    await main.evaluate(
      (current, values) =>
        [...document.querySelectorAll("main")]
          .filter((node) => node !== current)
          .every((node) => {
            const rect = node.getBoundingClientRect();
            return (
              !!node.closest('div[hidden][id^="S:"]') &&
              rect.width === 0 &&
              rect.height === 0 &&
              !node.querySelector("form,input,textarea,select") &&
              values.every((value) => !node.outerHTML.includes(value))
            );
          }),
      markers
    ),
    true,
    "Extra streaming shells contain no private case data or controls"
  );
  return main;
};
const serialization = async (path, privateValues) => {
  for (const flight of [false, true]) {
    const response = await context.request.get(config.origin + path, {
      ...(flight ? { headers: { RSC: "1" } } : {})
    });
    assert.equal(response.status(), 200);
    if (flight)
      assert.match(response.headers()["content-type"], /text\/x-component/);
    const body = await response.text();
    for (const value of privateValues)
      assert.ok(
        !body.includes(value),
        "Initial HTML/RSC excludes private case snapshot"
      );
  }
};
const detailReady = async () => {
  await replyForm().waitFor();
  await page.getByRole("heading", { name: subject, exact: true }).waitFor();
  await accessibleMain();
};
const dirtyDetail = async () => {
  await detailReady();
  await replyField().fill(reply);
  await reasonField().fill(reason);
  await statusForm()
    .getByRole("combobox", { name: "New status", exact: true })
    .selectOption("RESOLVED");
};
const retainedDetail = async () => {
  await detailReady();
  assert.equal(await replyField().inputValue(), reply);
  assert.equal(await reasonField().inputValue(), reason);
  assert.equal(
    await statusForm().getByRole("combobox").inputValue(),
    "RESOLVED"
  );
};
const reload = async (accept) => {
  const dialogs = [];
  const answer = async (d) => {
    dialogs.push({ type: d.type(), message: d.message() });
    if (accept && ["confirm", "beforeunload"].includes(d.type()))
      await d.accept();
    else await d.dismiss();
  };
  page.on("dialog", answer);
  try {
    const loaded = accept ? page.waitForEvent("load") : null;
    await button("Reload current information").click();
    if (loaded) await loaded;
  } finally {
    page.off("dialog", answer);
  }
  assert.equal(dialogs[0]?.type, "confirm");
  assert.match(dialogs[0].message, /discard|clear/i);
  assert.ok(dialogs.slice(1).every((d) => accept && d.type === "beforeunload"));
};
const discardPending = async (target) => {
  const next = page.waitForEvent("dialog"),
    clicked = target.click();
  const dialog = await next;
  assert.match(dialog.message(), /may already be saved/i);
  await dialog.accept();
  await clicked;
};
const failRead = async (pattern, action) => {
  const deliveries = [];
  const handler = (route) => {
    const done = route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Fictional case read outage" })
    });
    deliveries.push(done);
    return done;
  };
  await page.route(pattern, handler);
  await event("focus");
  await page
    .getByText(
      pattern === identityRoute
        ? "Your sign-in could not be checked. Reconnect and try again."
        : "Fictional case read outage",
      { exact: true }
    )
    .waitFor();
  await absent();
  await Promise.all(deliveries);
  await page.unroute(pattern, handler);
  await button("Recheck current access").click();
  await action();
};
let releaseHeld;
const heldRead = async () => {
  let capture,
    release,
    reads = 0;
  const captured = new Promise((resolve) => {
      capture = resolve;
    }),
    gate = new Promise((resolve) => {
      release = resolve;
    });
  const deliveries = [];
  releaseHeld = release;
  const handler = async (route) => {
    const index = ++reads;
    const done = (async () => {
      const response = await route.fetch();
      if (index === 1) {
        capture();
        await gate;
      }
      await route.fulfill({ response });
    })();
    deliveries.push(done);
    await done;
  };
  await page.route(readRoute, handler);
  await event("focus");
  let timer;
  try {
    await Promise.race([
      captured,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Case read not captured")),
          30000
        );
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
  return {
    reads: () => reads,
    release: async () => {
      release();
      await deliveries[0];
    },
    stop: async () => {
      await Promise.all(deliveries);
      await page.unroute(readRoute, handler);
    }
  };
};
const lifecycle = async (name, restore) => {
  for (const trigger of ["blur", "offline", "pagehide", "hidden"]) {
    if (trigger === "hidden")
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          value: "hidden"
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
    else await event(trigger === "offline" ? "online" : "focus");
    await restore();
  }
  await failRead(identityRoute, restore);
  await failRead(readRoute, restore);
  const held = await heldRead();
  await absent();
  await event("pagehide");
  await held.release();
  await page.waitForLoadState("networkidle");
  await absent();
  assert.equal(held.reads(), 1);
  await held.stop();
  await event("focus");
  await restore();
  ok(
    name +
      ": concealment, read failures and a late response remove all private DOM while unchanged current access restores dirty controls"
  );
};
let fixture;
try {
  fixture = await seedSupport(db);
  // Keep this run's eligible choices inside the API's bounded first 20 without
  // deleting or altering another fixture's grant. Only our new grant IDs change.
  fixture.ownerGrant = await db.supportCapabilityGrant.update({
    where: { id: fixture.ownerGrant.id },
    data: { id: "000-case-" + nonce + "-owner" }
  });
  fixture.backupGrant = await db.supportCapabilityGrant.update({
    where: { id: fixture.backupGrant.id },
    data: { id: "000-case-" + nonce + "-backup" }
  });
  const created = await supportCommand(
    db,
    fixture.memberA.token,
    await requestInput(db, fixture.memberA.token, { subject, description })
  );
  const detailPath = "/platform/help/cases/" + created.caseId;
  // Owner-scoped fictional history exercises the real bounded message reader.
  await db.supportMessage.createMany({
    data: Array.from({ length: 21 }, (_, index) => ({
      caseId: created.caseId,
      authorId: fixture.memberA.id,
      kind: "REPLY",
      body: messagePrefix + " " + String(index + 1).padStart(2, "0"),
      version: index + 2,
      createdAt: new Date(Date.UTC(2026, 8, 15, 13, index))
    }))
  });
  await db.supportCase.update({
    where: { id: created.caseId },
    data: { version: 22 }
  });
  const routing = [];
  for (let index = 0; index < 2; index++) {
    const row = await supportCommand(
      db,
      fixture.memberA.token,
      await requestInput(db, fixture.memberA.token, {
        subject: "Fictional routing " + nonce + " " + index
      })
    );
    await db.supportCase.update({
      where: { id: row.caseId },
      data: {
        ownerGrantId: null,
        ownerGrantVersion: null,
        version: { increment: 1 },
        createdAt: new Date(Date.UTC(1900, 0, 1, 0, index))
      }
    });
    routing.push(row.caseId);
    markers.push(row.caseId);
  }
  const routeCard = (id) =>
    page
      .getByRole("main")
      .getByText("Reference: " + id + " / General support", { exact: true })
      .locator("xpath=ancestor::section[1]");
  const routeForm = (id) =>
    routeCard(id).getByRole("form", { name: "Assign request", exact: true });
  const routeChoice = (id) =>
    routeForm(id).getByRole("combobox", {
      name: "Assign an authorized support owner",
      exact: true
    });
  const selected = fixture.backupGrant.id + ":" + fixture.backupGrant.version;
  const retainedRouting = async () => {
    for (const id of routing) {
      await routeChoice(id).waitFor();
      assert.equal(await routeChoice(id).inputValue(), selected);
    }
    await accessibleMain();
  };

  for (const path of [detailPath, "/platform/help/routing"]) {
    await go(path);
    assert.equal(new URL(page.url()).pathname, "/platform/login");
  }
  ok("Guest detail and routing require sign-in");
  await signIn(fixture.memberA);
  await serialization(detailPath, [subject, description, messagePrefix]);
  await go(detailPath);
  await detailReady();
  const documentIdentity = randomUUID();
  await page.evaluate((id) => {
    window.casePrivacyDocument = id;
  }, documentIdentity);
  assert.equal(await page.getByText(new RegExp(messagePrefix)).count(), 20);
  await page.getByRole("link", { name: "Next page", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("page") === "1");
  await detailReady();
  assert.equal(await page.getByText(new RegExp(messagePrefix)).count(), 1);
  assert.equal(
    await page.evaluate(() => window.casePrivacyDocument),
    undefined
  );
  await page.getByRole("link", { name: "Previous page", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("page") === "0");
  await detailReady();
  assert.equal(await page.getByText(new RegExp(messagePrefix)).count(), 20);
  ok(
    "Detail HTML/RSC omits private history, and actual fresh-document pagination reads 20/1 messages correctly"
  );
  await dirtyDetail();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      )
    );
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    )
  );
  await page.screenshot({
    path: output + "/detail-320-enlarged.png",
    fullPage: true
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await lifecycle("Detail sibling reply and status forms", retainedDetail);
  let held = await heldRead();
  await event("blur");
  await event("focus");
  await held.release();
  await retainedDetail();
  await page.waitForLoadState("networkidle");
  assert.equal(held.reads(), 2);
  await held.stop();
  held = await heldRead();
  await signIn(fixture.memberB);
  await event("blur");
  await event("focus");
  await held.release();
  await page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .waitFor();
  await absent();
  await held.stop();
  await signIn(fixture.memberA);
  await event("focus");
  await retainedDetail();
  ok(
    "Coalesced rechecks and account replacement preserve both detail drafts without restoring old-account DOM"
  );

  // An identity change without a lifecycle event must be caught by submission.
  await signIn(fixture.memberB);
  const writesBefore = browserWrites.length;
  await button("Save reply").click();
  await absent();
  assert.equal(browserWrites.length, writesBefore);
  await signIn(fixture.memberA);
  await event("focus");
  await retainedDetail();
  await discardPending(
    replyForm().getByRole("button", {
      name: "Discard local entries",
      exact: true
    })
  );
  await replyField().fill(reply);
  for (const code of [403, 404]) {
    const deliveries = [];
    const handler = (route) => {
      const done = route.fulfill({
        status: code,
        contentType: "application/json",
        body: JSON.stringify({ message: "Fictional case authority denial" })
      });
      deliveries.push(done);
      return done;
    };
    await page.route(endpoint, handler);
    await button("Save reply").click();
    await absent();
    assert.equal(
      await button("Confirm original request: Save reply").count(),
      0
    );
    await Promise.all(deliveries);
    await page.unroute(endpoint, handler);
    await event("focus");
    await retainedDetail();
    await discardPending(
      replyForm().getByRole("button", {
        name: "Discard local entries",
        exact: true
      })
    );
    await replyField().fill(reply);
  }
  ok(
    "Mutation identity replacement prevents POST; 403/404 responses remove case DOM while original-account recovery remains explicit"
  );

  const replyAttempts = [];
  let replyReceipt;
  const deliveries = [];
  const replyHandler = async (route) => {
    const body = route.request().postData();
    const command = JSON.parse(body);
    assert.equal(command.operation, "reply");
    replyAttempts.push(body);
    const done = (async () => {
      if (replyAttempts.length === 1) {
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        replyReceipt = await response.json();
        await route.abort("failed");
      } else if (replyAttempts.length < 4) {
        await route.fulfill({
          status: replyAttempts.length === 2 ? 429 : 503,
          headers: { "Retry-After": "1" },
          contentType: "application/json",
          body: JSON.stringify({ message: "Fictional reply retry outage" })
        });
      } else await route.continue();
    })();
    deliveries.push(done);
    await done;
  };
  await page.route(endpoint, replyHandler);
  await button("Save reply").click();
  await replyForm()
    .getByRole("button", { name: "Retry original request", exact: true })
    .waitFor();
  await retainedDetail();
  await event("blur");
  await event("focus");
  await changed().waitFor();
  await absent();
  await button("Confirm original request: Save reply").waitFor();
  await signIn(fixture.memberB);
  await event("blur");
  await event("focus");
  await absent();
  await page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .waitFor();
  assert.equal(await button("Confirm original request: Save reply").count(), 0);
  await signIn(fixture.memberA);
  await event("focus");
  await button("Confirm original request: Save reply").waitFor();
  for (const status of [429, 503]) {
    const response = page.waitForResponse(
      (r) => r.url() === endpoint && r.status() === status
    );
    await button("Confirm original request: Save reply").click();
    await response;
    await page
      .getByRole("alert")
      .filter({ hasText: /We could not confirm the original request/ })
      .waitFor();
    await absent();
    assert.equal(replyAttempts.at(-1), replyAttempts[0]);
  }
  const beforeConfirmURL = page.url();
  await button("Confirm original request: Save reply").click();
  await page.getByText(savedSiblingNotice, { exact: true }).waitFor();
  await absent();
  assert.equal(page.url(), beforeConfirmURL);
  assert.equal(replyAttempts.length, 4);
  assert.ok(replyAttempts.every((body) => body === replyAttempts[0]));
  assert.equal(
    await db.supportMessage.count({
      where: { caseId: created.caseId, body: reply }
    }),
    1
  );
  assert.equal(
    (await db.supportCase.findUniqueOrThrow({ where: { id: created.caseId } }))
      .version,
    replyReceipt.version
  );
  assert.equal(
    await db.supportMessage.count({
      where: { caseId: created.caseId, body: reason }
    }),
    0
  );
  await reload(false);
  await absent();
  await button("Discard local entries: Save status").click();
  assert.equal(page.url(), beforeConfirmURL);
  await absent();
  await reload(true);
  await detailReady();
  assert.equal(await reasonField().inputValue(), "");
  await Promise.all(deliveries);
  await page.unroute(endpoint, replyHandler);
  ok(
    "Lost reply retries preserve exact bytes through account change, 429 and 503; confirmation keeps the sibling draft until explicit discard and warned reload"
  );

  await signIn(fixture.manager);
  await serialization("/platform/help/routing", routing);
  await go("/platform/help/routing");
  for (const id of routing) await routeChoice(id).selectOption(selected);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      )
    );
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    )
  );
  await page.screenshot({
    path: output + "/routing-320-enlarged.png",
    fullPage: true
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await lifecycle("Routing owner choices", retainedRouting);
  const routeSnapshot = await readSupport(db, fixture.manager.token, "routing");
  const labels = routing.map((id) => {
    const index = routeSnapshot.routing.findIndex((row) => row.id === id);
    assert.ok(index >= 0);
    return "Assign request " + (index + 1);
  });
  const commands = new Map(),
    routeDeliveries = [];
  const handoffHandler = async (route) => {
    const raw = route.request().postData(),
      command = JSON.parse(raw);
    assert.equal(command.operation, "handoff");
    assert.ok(routing.includes(command.caseId));
    const attempts = commands.get(command.caseId) ?? [];
    attempts.push(raw);
    commands.set(command.caseId, attempts);
    const done = (async () => {
      if (attempts.length === 1) {
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        await route.abort("failed");
      } else if (attempts.length === 2) {
        await route.fulfill({
          status: command.caseId === routing[0] ? 429 : 503,
          headers: { "Retry-After": "1" },
          contentType: "application/json",
          body: JSON.stringify({ message: "Fictional handoff retry outage" })
        });
      } else await route.continue();
    })();
    routeDeliveries.push(done);
    await done;
  };
  await page.route(endpoint, handoffHandler);
  for (const id of routing) {
    await routeForm(id)
      .getByRole("button", { name: "Assign request", exact: true })
      .click();
    await routeForm(id)
      .getByRole("button", { name: "Retry original request", exact: true })
      .waitFor();
  }
  await event("blur");
  await event("focus");
  await changed().waitFor();
  await absent();
  for (const label of labels)
    await button("Confirm original request: " + label).waitFor();
  await signIn(fixture.memberB);
  await event("blur");
  await event("focus");
  await page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .waitFor();
  await absent();
  assert.equal(
    await page
      .getByRole("button", { name: /^Confirm original request:/ })
      .count(),
    0
  );
  await signIn(fixture.manager);
  await event("focus");
  for (const label of labels)
    await button("Confirm original request: " + label).waitFor();
  for (let index = 0; index < routing.length; index++) {
    const confirm = button("Confirm original request: " + labels[index]);
    const status = index === 0 ? 429 : 503;
    const response = page.waitForResponse(
      (r) => r.url() === endpoint && r.status() === status
    );
    await confirm.click();
    await response;
    await page
      .getByRole("alert")
      .filter({ hasText: /We could not confirm the original request/ })
      .waitFor();
    await absent();
    if (index === 0) {
      await confirm.click();
      await page.getByText(savedSiblingNotice, { exact: true }).waitFor();
      await absent();
      await button("Confirm original request: " + labels[1]).waitFor();
    } else {
      await page.evaluate(() => {
        window.casePrivacyDocument = "before-final-handoff-confirmation";
      });
      const loaded = page.waitForEvent("load");
      await confirm.click();
      await loaded;
      await page.waitForLoadState("networkidle");
      assert.equal(new URL(page.url()).pathname, "/platform/help/routing");
      assert.equal(
        await page.evaluate(() => window.casePrivacyDocument),
        undefined,
        "The final confirmation starts a new current-account document"
      );
      await page
        .getByRole("navigation", { name: "Support", exact: true })
        .waitFor();
      await accessibleMain();
      for (const id of routing)
        assert.ok(!(await page.locator("html").textContent()).includes(id));
    }
  }
  for (const id of routing) {
    const attempts = commands.get(id);
    assert.equal(attempts.length, 3);
    assert.ok(attempts.every((raw) => raw === attempts[0]));
    const command = JSON.parse(attempts[0]);
    assert.equal(
      await db.supportOperation.count({
        where: { actorId: fixture.manager.id, requestKey: command.requestKey }
      }),
      1
    );
    const row = await db.supportCase.findUniqueOrThrow({ where: { id } });
    assert.equal(row.ownerGrantId, fixture.backupGrant.id);
    assert.equal(row.version, command.expectedVersion + 1);
  }
  await Promise.all(routeDeliveries);
  await page.unroute(endpoint, handoffHandler);
  ok(
    "Two independently uncertain routing handoffs survive concealment and account change; 429/503 retries preserve each command and confirming one never discards the other"
  );

  // Exercise the shared attachment viewer through the actual Support detail URL.
  const sharp = (await import("sharp")).default;
  const { uploadImage } = await import("../lib/platform/media.ts");
  const { FEEDBACK_NOTICE } = await import("../lib/platform/feedback-types.ts");
  const image = await uploadImage(
    db,
    fixture.memberA.token,
    {
      purpose: "SUPPORT_ATTACHMENT",
      targetId: fixture.memberA.id,
      requestKey: randomUUID(),
      caption,
      alt: imageAlt
    },
    await sharp({
      create: { width: 160, height: 120, channels: 3, background: "blue" }
    })
      .png()
      .toBuffer()
  );
  const intake = await readSupport(db, fixture.memberA.token, "new", {
    feedbackOnly: true
  });
  const feedback = await supportCommand(db, fixture.memberA.token, {
    operation: "feedback-create",
    requestKey: randomUUID(),
    kind: "GENERAL",
    rating: 3,
    description: "Fictional case attachment privacy",
    attachments: [image.id],
    notice: FEEDBACK_NOTICE,
    consent: true,
    recipientId: intake.intake.recipient.id,
    recipientVersion: intake.intake.recipient.version,
    contactAllowed: false,
    channels: [],
    allowIdea: false,
    publicAttribution: false
  });
  await signIn(fixture.memberA);
  const photoPath = "/platform/help/cases/" + feedback.caseId;
  await serialization(photoPath, [caption, imageAlt]);
  await go(photoPath);
  const open = button("Enlarge attachment: " + caption);
  await open.waitFor();
  const beforeHistory = await page.evaluate(() => history.length);
  await open.click();
  await page.getByRole("dialog").waitFor();
  await page
    .getByRole("dialog")
    .getByRole("img", { name: imageAlt, exact: true })
    .waitFor();
  const viewerState = await page.evaluate(() => ({
    length: history.length,
    key: history.state?.gcPhotoViewer
  }));
  assert.equal(viewerState.length, beforeHistory + 1);
  assert.equal(typeof viewerState.key, "string");
  await event("blur");
  await absent();
  assert.equal(await page.locator("dialog").count(), 0);
  assert.equal(await page.locator('img[src*="' + image.id + '"]').count(), 0);
  await event("focus");
  await page
    .getByRole("dialog")
    .getByRole("img", { name: imageAlt, exact: true })
    .waitFor();
  assert.deepEqual(
    await page.evaluate(() => ({
      length: history.length,
      key: history.state?.gcPhotoViewer
    })),
    viewerState
  );
  await page.goBack();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(new URL(page.url()).pathname, photoPath);
  assert.equal(await open.count(), 1);
  ok(
    "A real private attachment dialog and image leave DOM on concealment, revalidate on return and preserve exactly one viewer history entry"
  );

  const attachmentEndpoint = config.origin + "/api/platform/feedback";
  const removalAttempts = [],
    removalDeliveries = [];
  let removalReceipt;
  const removalHandler = async (route) => {
    const raw = route.request().postData(),
      command = JSON.parse(raw);
    assert.equal(command.operation, "feedback-remove-attachment");
    assert.equal(command.caseId, feedback.caseId);
    assert.equal(command.assetId, image.id);
    removalAttempts.push(raw);
    const done = (async () => {
      if (removalAttempts.length === 1) {
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        removalReceipt = await response.json();
        await route.abort("failed");
      } else await route.continue();
    })();
    removalDeliveries.push(done);
    await done;
  };
  await page.route(attachmentEndpoint, removalHandler);
  const removalForm = page.getByRole("form", {
    name: "Remove this attachment",
    exact: true
  });
  await removalForm
    .getByRole("button", { name: "Remove this attachment", exact: true })
    .click();
  await removalForm
    .getByRole("button", { name: "Retry original request", exact: true })
    .waitFor();
  const retiredOnce = await db.mediaAsset.findUniqueOrThrow({
    where: { id: image.id },
    select: { status: true, version: true, caption: true, alt: true }
  });
  assert.equal(retiredOnce.status, "RETIRED");
  assert.equal(retiredOnce.caption, "");
  assert.equal(retiredOnce.alt, "");
  const removalCommand = JSON.parse(removalAttempts[0]);
  assert.equal(retiredOnce.version, removalCommand.assetVersion + 1);
  assert.equal(removalReceipt.version, removalCommand.expectedVersion + 1);
  const removedSnapshot = await readSupport(
    db,
    fixture.memberA.token,
    "detail",
    { caseId: feedback.caseId }
  );
  assert.deepEqual(removedSnapshot.detail.feedback.attachments, []);
  await event("blur");
  await event("focus");
  await changed().waitFor();
  await absent();
  assert.equal(await page.locator('img[src*="' + image.id + '"]').count(), 0);
  const confirmRemoval = button(
    "Confirm original request: Remove attachment 1"
  );
  await confirmRemoval.waitFor();
  await page.evaluate(() => {
    window.casePrivacyDocument = "before-attachment-receipt-confirmation";
  });
  const removalLoaded = page.waitForEvent("load");
  await confirmRemoval.click();
  await removalLoaded;
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("navigation", { name: "Support", exact: true })
    .waitFor();
  assert.equal(new URL(page.url()).pathname, photoPath);
  assert.equal(
    await page.evaluate(() => window.casePrivacyDocument),
    undefined
  );
  await accessibleMain();
  assert.equal(await open.count(), 0);
  assert.equal(await removalForm.count(), 0);
  for (const value of [caption, imageAlt])
    assert.ok(!(await page.locator("html").textContent()).includes(value));
  assert.equal(removalAttempts.length, 2);
  assert.equal(removalAttempts[1], removalAttempts[0]);
  assert.deepEqual(
    await db.mediaAsset.findUniqueOrThrow({
      where: { id: image.id },
      select: { status: true, version: true, caption: true, alt: true }
    }),
    retiredOnce
  );
  assert.equal(
    (
      await db.supportCase.findUniqueOrThrow({
        where: { id: feedback.caseId }
      })
    ).version,
    removalReceipt.version
  );
  assert.equal(
    await db.supportOperation.count({
      where: {
        actorId: fixture.memberA.id,
        requestKey: removalCommand.requestKey
      }
    }),
    1
  );
  assert.equal(
    await db.supportAuditEvent.count({
      where: {
        caseId: feedback.caseId,
        action: "FEEDBACK-REMOVE-ATTACHMENT",
        targetId: image.id
      }
    }),
    1
  );
  await Promise.all(removalDeliveries);
  await page.unroute(attachmentEndpoint, removalHandler);
  ok(
    "Attachment removal retains its original descendant command after the attachment disappears; hidden confirmation sends identical bytes and confirms one removal without another version increment"
  );

  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  assert.ok(
    browserWrites.every(
      (row) =>
        row.method === "POST" &&
        ["/api/platform/support", "/api/platform/feedback"].includes(row.path)
    )
  );
  assert.equal(
    browserWrites.length,
    14,
    "Two authority denials, four reply attempts, six handoff attempts and two attachment-removal attempts only"
  );
  assert.equal(
    browserWrites.filter((row) => row.path === "/api/platform/feedback").length,
    2
  );
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      { results, errors, externalRequests, browserWrites, fixtureOnly: true },
      null,
      2
    ),
    { mode: 0o600 }
  );
  console.log("SUPPORT_CASE_PRIVACY_BROWSER_PASS " + results.length);
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
  releaseHeld?.();
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
        where: { id: "default", ownerGrantId: fixture.ownerGrant.id }
      });
  } finally {
    await browser.close();
    await db.$disconnect();
  }
}
