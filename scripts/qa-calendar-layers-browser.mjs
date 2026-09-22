import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the isolated calendar fixture directory");
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
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
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + fixtureDir + "/sink",
  NODE_ENV: "test",
  VERCEL: "",
  PRIVILEGED_MFA_MODE: "off"
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase, seedPortal } =
  await import("../tests/seed-portal.ts");
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
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }
});
const blockedRequests = [];
await context.route("**/*", (route) => {
  if (new URL(route.request().url()).origin === config.origin)
    return route.continue();
  blockedRequests.push(route.request().url());
  return route.abort();
});
const page = await context.newPage(),
  errors = [],
  results = [];
page.setDefaultTimeout(20000);
page.on("pageerror", (error) => errors.push(error.message));
const output = fixtureDir + "/calendar-layers-browser-" + Date.now();
mkdirSync(output, { recursive: true });
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const go = async (path) => {
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
  return response;
};
const { randomUUID } = await import("node:crypto");
const { calendarCommand } =
  await import("../lib/platform/calendar-commands.ts");
const signIn = async (actor) => {
  // Set up a new fictional login after leaving the prior account document.
  await page.goto("about:blank");
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
const basePath = "/platform/calendars?month=2026-10&timeZone=UTC";
const { loginAccount } = await import("../lib/platform/accounts.ts");
try {
  const f = await seedPortal(db);
  const owner = f.contact,
    reader = f.coordinator;
  const create = async (actor, name) => {
    const calendar = await calendarCommand(db, actor.token, {
      operation: "create-calendar",
      requestKey: randomUUID(),
      name,
      timeZone: "UTC"
    });
    const event = await calendarCommand(db, actor.token, {
      operation: "create-event",
      calendarId: calendar.id,
      expectedVersion: 1,
      requestKey: randomUUID(),
      title: name + " appointment",
      description: "Fictional private layer details",
      location: "Fictional private address",
      timeZone: "UTC",
      allDay: false,
      startLocal: "2026-10-10T09:00",
      endLocal: "2026-10-10T10:00",
      weeklyUntil: null
    });
    return {
      id: calendar.id,
      eventId: event.id,
      name,
      eventTitle: name + " appointment"
    };
  };
  const mine = await create(reader, "My layer fixture"),
    shared = await create(owner, "Other private layer fixture");
  await calendarCommand(db, owner.token, {
    operation: "share-calendar",
    calendarId: shared.id,
    churchId: f.churchA.id,
    expectedVersion: 0,
    level: "BUSY",
    confirmed: true
  });
  const where = {
    ownerId_calendarId: { ownerId: reader.id, calendarId: mine.id }
  };
  const open = async () => {
    const summary = page.getByText(`My choices for ${mine.name}`, {
      exact: true
    });
    const details = summary.locator("..");
    if (
      !(await details.getAttribute("open")) &&
      (await details.getAttribute("open")) !== ""
    )
      await summary.click();
    return details.getByRole("form", {
      name: `Save my choices for ${mine.name}`,
      exact: true
    });
  };
  const submit = async (form) => {
    await Promise.all([
      page.waitForEvent("framenavigated", {
        predicate: (frame) =>
          frame === page.mainFrame() &&
          frame.url().startsWith(config.origin + "/platform/calendars?") &&
          !new URL(frame.url()).searchParams.has("layers")
      }),
      form
        .getByRole("button", {
          name: `Save my choices for ${mine.name}`,
          exact: true
        })
        .click()
    ]);
    await page.waitForLoadState("load");
    await page
      .getByRole("heading", { name: "My calendars", exact: true })
      .waitFor();
  };
  const agenda = () => page.getByRole("list", { name: "Event agenda" });
  await signIn(reader);
  await go(basePath);
  await agenda()
    .getByRole("link", { name: mine.eventTitle, exact: true })
    .waitFor();
  assert.ok(
    !(await page.locator("body").innerText()).includes(shared.eventTitle)
  );
  let form = await open();
  await form
    .getByLabel("My calendar color", { exact: true })
    .selectOption("PURPLE");
  await form.getByLabel("Show in My calendars", { exact: true }).uncheck();
  await submit(form);
  await page.waitForFunction(
    (title) =>
      !document
        .querySelector('[aria-label="Event agenda"]')
        ?.textContent?.includes(title),
    mine.eventTitle
  );
  await page.reload();
  form = await open();
  assert.equal(
    await form.getByLabel("Show in My calendars", { exact: true }).isChecked(),
    false
  );
  assert.equal(
    await form.getByLabel("Follow this calendar", { exact: true }).isChecked(),
    true
  );
  assert.equal(
    await form.getByLabel("My calendar color", { exact: true }).inputValue(),
    "PURPLE"
  );
  const secondToken = await loginAccount(
    db,
    reader.email,
    reader.password,
    "second-layer-browser"
  );
  await signIn({ ...reader, token: secondToken });
  await go(basePath);
  form = await open();
  assert.equal(
    await form.getByLabel("Show in My calendars", { exact: true }).isChecked(),
    false
  );
  await form.getByLabel("Show in My calendars", { exact: true }).check();
  await submit(form);
  await agenda()
    .getByRole("link", { name: mine.eventTitle, exact: true })
    .waitFor();
  assert.ok((await agenda().innerText()).includes("Purple layer"));
  ok(
    "saved visibility and decorative color persist across reload and a second sign-in without exposing Busy source details"
  );

  await go(basePath + "&layers=selected&layer=" + mine.id);
  form = await open();
  await form.getByLabel("Follow this calendar", { exact: true }).uncheck();
  await submit(form);
  assert.ok(!new URL(page.url()).searchParams.has("layers"));
  await page.waitForFunction(
    (title) =>
      !document
        .querySelector('[aria-label="Event agenda"]')
        ?.textContent?.includes(title),
    mine.eventTitle
  );
  assert.equal(
    (await db.calendarLayerPreference.findUniqueOrThrow({ where })).followed,
    false
  );
  await go("/platform/calendars/" + mine.id + "?month=2026-10&timeZone=UTC");
  await agenda()
    .getByRole("link", { name: mine.eventTitle, exact: true })
    .waitFor();
  await go(basePath);
  form = await open();
  await form.getByLabel("Follow this calendar", { exact: true }).check();
  const before = await db.calendarLayerPreference.findUniqueOrThrow({ where });
  let lost = false;
  await page.route("**/api/platform/calendars", async (route) => {
    const request = route.request();
    if (
      request.method() === "POST" &&
      request.postDataJSON().operation === "save-layer" &&
      !lost
    ) {
      lost = true;
      const saved = await route.fetch();
      assert.equal(saved.status(), 200);
      await route.abort("failed");
    } else await route.continue();
  });
  await form
    .getByRole("button", {
      name: `Save my choices for ${mine.name}`,
      exact: true
    })
    .click();
  await form
    .getByRole("button", {
      name: "Retry the same calendar request",
      exact: true
    })
    .waitFor();
  assert.equal(
    (await db.calendarLayerPreference.findUniqueOrThrow({ where })).version,
    before.version + 1
  );
  await form
    .getByRole("button", {
      name: "Retry the same calendar request",
      exact: true
    })
    .click();
  await agenda()
    .getByRole("link", { name: mine.eventTitle, exact: true })
    .waitFor();
  await page.unroute("**/api/platform/calendars");
  assert.equal(
    (await db.calendarLayerPreference.findUniqueOrThrow({ where })).version,
    before.version + 1
  );
  ok(
    "unfollowing clears a temporary overlay, retains direct source access and retries one committed save after a lost response"
  );

  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await go(basePath);
    await open();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      )
    );
    await page.screenshot({
      path: output + "/choices-" + width + ".png",
      fullPage: true
    });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
  }
  await go("/platform/settings/calendar");
  assert.ok(
    (
      await page.locator("#calendar-subscriptions").locator("..").innerText()
    ).includes("follow")
  );
  assert.ok(
    !(await page.locator("body").innerText()).includes(
      "Following calendars, private subscription"
    )
  );
  ok(
    "saved choices are reachable from Settings with labeled controls and no horizontal overflow at 320, 390 and 1280 pixels with enlarged text"
  );

  await go(basePath);
  const sharedSummary = page.getByText("My choices for Shared calendar", {
    exact: true
  });
  await sharedSummary.click();
  const sharedForm = sharedSummary.locator("..").getByRole("form");
  await sharedForm
    .getByLabel("My calendar color", { exact: true })
    .selectOption("ROSE");
  await calendarCommand(db, owner.token, {
    operation: "revoke-calendar-share",
    calendarId: shared.id,
    churchId: f.churchA.id,
    expectedVersion: 1
  });
  await sharedForm
    .getByRole("button", {
      name: "Save my choices for Shared calendar",
      exact: true
    })
    .click();
  await page
    .getByText(
      /its access changed. Reload to inspect current details/i
    )
    .first()
    .waitFor();
  assert.equal(
    await db.calendarLayerPreference.count({
      where: { ownerId: reader.id, calendarId: shared.id }
    }),
    0
  );
  await page.goto("about:blank");
  await go(basePath);
  assert.equal(
    await page
      .getByText("My choices for Shared calendar", { exact: true })
      .count(),
    0
  );
  await open();
  const formBeforeSwitch = await db.calendarLayerPreference.findUniqueOrThrow({
    where
  });
  await context.clearCookies();
  await context.addCookies([
    {
      name: "church_platform_session",
      value: owner.token,
      domain: "127.0.0.1",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(
    (name) => !document.body.innerText.includes("My choices for " + name),
    mine.name
  );
  assert.deepEqual(
    await db.calendarLayerPreference.findUniqueOrThrow({ where }),
    formBeforeSwitch
  );
  ok(
    "revoking a source rejects an open save, refresh removes its layer, and switching accounts clears private controls without writing"
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(blockedRequests, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        passed: results.length,
        results,
        browserErrors: errors,
        externalRequests: blockedRequests,
        productionWrites: 0,
        evidence: "isolated built HTTPS browser"
      },
      null,
      2
    )
  );
  console.log(JSON.stringify({ passed: results.length, output }));
} catch (error) {
  writeFileSync(
    output + "/failure.json",
    JSON.stringify(
      {
        error: String(error),
        stack: error.stack,
        url: page.url(),
        results,
        errors,
        text: await page
          .locator("body")
          .innerText()
          .catch(() => "")
      },
      null,
      2
    )
  );
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
