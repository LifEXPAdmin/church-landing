import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the isolated fixture directory");
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
  NODE_ENV: "test",
  VERCEL: "",
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  PRIVILEGED_MFA_MODE: "off"
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase } = await import("../tests/seed-portal.ts");
const { profileEventsFixture, saveProfileEvent, profileEventTime } =
  await import("../tests/profile-events-fixture.ts");
const { getProfileEditor } = await import("../lib/platform/profiles.ts");
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
const output = fixtureDir + "/browser-" + Date.now();
mkdirSync(output, { recursive: true });
const external = [],
  errors = [],
  results = [],
  startedAt = new Date().toISOString();
await context.route("**/*", (route) => {
  if (new URL(route.request().url()).origin === config.origin)
    return route.continue();
  external.push(route.request().url());
  return route.abort();
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
page.on("pageerror", (error) => errors.push(error.message));
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const signIn = async (actor) => {
  await context.clearCookies();
  if (actor)
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
const go = async (path) => {
  const r = await page.goto(config.origin + path);
  assert.equal(r.status(), 200);
};
const button = (name) => page.getByRole("button", { name, exact: true });
const choose = async (link) => {
  await page.getByLabel("Existing event page link", { exact: true }).fill(link);
  await button("Check original event").click();
  await button("Use this event").waitFor();
};
const submit = async (path) => {
  await button("Save profile").click();
  await page.waitForURL("**" + path);
};
let receipt;
try {
  const f = await profileEventsFixture(db),
    source = await f.create(false, "PUBLIC");
  const path = "/platform/profile/" + f.owner.username;
  // The exact link format emitted by CalendarAgenda and LocalEventTime.
  const link =
    config.origin +
    "/platform/events/" +
    source.occurrence.id +
    "?timeZone=America%2FChicago";
  await signIn(f.owner);
  await go("/platform/groups/" + f.group.slug + "/manage");
  const lookup = page.getByRole("form", {
    name: "Check existing event link",
    exact: true
  });
  await lookup
    .getByLabel("Existing event page link", { exact: true })
    .fill(link);
  await lookup
    .getByRole("button", { name: "Check original event", exact: true })
    .click();
  if (process.argv.includes("--reproduce-group-link")) {
    await lookup
      .getByRole("status")
      .filter({ hasText: "without extra query or fragment values" })
      .waitFor();
    assert.equal(
      await db.gatherGroupEventLink.count({
        where: { groupId: f.group.id, occurrenceId: source.occurrence.id }
      }),
      0
    );
    ok(
      "Reproduced: a normal calendar URL with timeZone is rejected by the existing group picker without a write"
    );
    receipt = {
      reproduced: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      results,
      errors,
      external
    };
  } else {
    const form = page.getByRole("form", {
      name: "Link event to group",
      exact: true
    });
    await form.getByLabel(/I understand the original event/).check();
    const linkedResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/platform/groups" &&
        response.request().method() === "POST"
    );
    const refreshedGroup = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          "/platform/groups/" + f.group.slug + "/manage" &&
        response.request().headers().rsc === "1"
    );
    await form
      .getByRole("button", { name: "Link event to group", exact: true })
      .click();
    const linkedResult = await linkedResponse;
    assert.equal(linkedResult.status(), 200, await linkedResult.text());
    await (await refreshedGroup).finished();
    await page.waitForFunction(() => !window.history.state?.gcPhotoWork);
    const linked = await db.gatherGroupEventLink.findUniqueOrThrow({
      where: {
        groupId_occurrenceId: {
          groupId: f.group.id,
          occurrenceId: source.occurrence.id
        }
      }
    });
    assert.equal(linked.active, true);
    ok("Copied calendar URL links the original event to the group");
    await go("/platform/profile/me");
    const initial = await getProfileEditor(db, f.owner.token);
    await page
      .getByLabel("Existing event page link", { exact: true })
      .fill(link + "&operation=publish");
    await button("Check original event").click();
    await page
      .getByRole("status")
      .filter({ hasText: "without extra options" })
      .waitFor();
    assert.equal(await button("Use this event").count(), 0);
    await choose(link);
    assert.deepEqual(await getProfileEditor(db, f.owner.token), initial);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await button("Use this event").waitFor({ state: "hidden" });
    assert.equal(
      await page.getByText(source.event.title, { exact: true }).count(),
      0
    );
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await choose(link);
    ok(
      "Picker accepts calendar display zone only; checking and backgrounding reveal no persisted selection"
    );
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "32px";
      });
      await button("Use this event").scrollIntoViewIfNeeded();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1
        ),
        "No horizontal page overflow at enlarged text"
      );
      await page
        .getByRole("group", { name: "Selected event (optional)", exact: true })
        .screenshot({ path: `${output}/picker-${width}.png` });
    }
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await button("Use this event").focus();
    await page.keyboard.press("Enter");
    assert.equal(
      (await getProfileEditor(db, f.owner.token)).presentation.modules
        .calendarOccurrenceId,
      undefined
    );
    await page
      .getByRole("link", { name: "Back to Profile settings", exact: true })
      .click();
    const leave = page.getByRole("dialog", {
      name: "Keep your unsaved changes?",
      exact: true
    });
    await leave
      .getByRole("button", { name: "Keep editing", exact: true })
      .click();
    await submit(path);
    await page
      .getByRole("link", { name: "Event details and RSVP", exact: true })
      .waitFor();
    assert.equal(
      (await getProfileEditor(db, f.owner.token)).presentation.modules
        .calendarOccurrenceId,
      source.occurrence.id
    );
    assert.equal(
      await db.calendarResponse.count({
        where: { occurrenceId: source.occurrence.id }
      }),
      0
    );
    ok(
      "Keyboard selection engages unsaved navigation protection; explicit save shows the original event without RSVPing"
    );
    await go("/platform/profile/me");
    await button("Remove selected event").click();
    await page.route("**/api/platform/account", (route) => route.abort());
    await button("Save profile").click();
    await page
      .getByRole("alert")
      .filter({ hasText: "We could not confirm the save" })
      .waitFor();
    assert.equal(
      (await getProfileEditor(db, f.owner.token)).presentation.modules
        .calendarOccurrenceId,
      source.occurrence.id
    );
    await page.unroute("**/api/platform/account");
    await submit(path);
    assert.equal(
      (await getProfileEditor(db, f.owner.token)).presentation.modules
        .calendarOccurrenceId,
      null
    );
    assert.equal(
      await page
        .getByRole("link", { name: "Event details and RSVP", exact: true })
        .count(),
      0
    );
    ok(
      "Failed removal retains local intent and the saved reference; explicit retry removes only the profile selection"
    );
    await go("/platform/profile/me");
    await choose(link);
    await button("Use this event").click();
    await saveProfileEvent(db, f.owner, f.source.occurrence.id);
    await button("Save profile").click();
    await button("Review latest saved profile").click();
    // Use the saved-review link, independent of the enclosing semantic element.
    assert.equal(
      await page
        .getByRole("link", { name: "Open saved event selection", exact: true })
        .getAttribute("href"),
      "/platform/events/" + f.source.occurrence.id
    );
    await button("Keep my edits and use this version").click();
    await submit(path);
    assert.equal(
      (await getProfileEditor(db, f.owner.token)).presentation.modules
        .calendarOccurrenceId,
      source.occurrence.id
    );
    ok(
      "Concurrent profile save requires reviewing the saved selection before explicitly applying retained local choice"
    );
    await signIn(f.viewer);
    await go(path);
    await page.getByText(source.event.title, { exact: true }).waitFor();
    await f.command({
      operation: "edit-event",
      eventId: source.event.id,
      expectedVersion: source.event.version,
      occurrenceId: source.occurrence.id,
      occurrenceVersion: source.occurrence.version,
      scope: "OCCURRENCE",
      title: "Fictional rescheduled linked event",
      location: "Changed room",
      ...profileEventTime,
      startLocal: "2030-10-25T11:00",
      endLocal: "2030-10-25T12:00",
      confirmed: true
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page
      .getByText(source.event.title, { exact: true })
      .waitFor({ state: "hidden" });
    await page.getByText(/or its access changed\. Reload/).waitFor();
    await go(path);
    await page
      .getByText("Fictional rescheduled linked event", { exact: true })
      .waitFor();
    await page
      .locator('section[aria-labelledby="profile-event-heading"]')
      .screenshot({ path: output + "/profile-current-event.png" });
    await go("/platform/groups/" + f.group.slug + "/events");
    await page
      .getByRole("link", {
        name: "Fictional rescheduled linked event",
        exact: true
      })
      .waitFor();
    assert.equal(
      await db.calendarResponse.count({
        where: { occurrenceId: source.occurrence.id }
      }),
      0
    );
    ok(
      "Source edit invalidates retained profile details; reloaded group and profile show the updated event and share its RSVP owner"
    );
    await signIn(f.memberB);
    await go(path);
    await page
      .getByText("Fictional rescheduled linked event", { exact: true })
      .waitFor();
    const current = await db.calendarEvent.findUniqueOrThrow({
      where: { id: source.event.id }
    });
    await f.command({
      operation: "set-visibility",
      eventId: current.id,
      expectedVersion: current.version,
      visibility: "CHURCH",
      confirmed: true
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page
      .getByText("Fictional rescheduled linked event", { exact: true })
      .waitFor({ state: "hidden" });
    await go(path);
    assert.equal(
      await page
        .getByText("Fictional rescheduled linked event", { exact: true })
        .count(),
      0
    );
    assert.ok(!(await page.content()).includes(source.occurrence.id));
    await signIn(f.owner);
    await go(path + "?preview=member");
    assert.equal(
      await page
        .getByText("Fictional rescheduled linked event", { exact: true })
        .count(),
      0
    );
    await signIn(null);
    await go(path);
    assert.ok(!(await page.content()).includes(source.occurrence.id));
    ok(
      "Audience reduction conceals retained event details and removes its reference from outsider, generic-preview and guest payloads"
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    receipt = {
      startedAt,
      finishedAt: new Date().toISOString(),
      results,
      errors,
      external,
      source: "A1 isolated production build",
      productionWrites: 0
    };
  }
} catch (error) {
  await page.screenshot({ path: output + "/failure.png" }).catch(() => {});
  writeFileSync(
    output + "/failure.json",
    JSON.stringify(
      {
        startedAt,
        failedAt: new Date().toISOString(),
        results,
        message: error.stack,
        errors,
        external
      },
      null,
      2
    )
  );
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
writeFileSync(output + "/receipt.json", JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ output, ...receipt }));
