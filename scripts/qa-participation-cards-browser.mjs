import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the existing isolated preview artifact directory");
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
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + fixtureDir + "/sink",
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: ""
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase } = await import("../tests/seed-portal.ts");
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
  timezoneId: "America/Chicago",
  viewport: { width: 390, height: 844 }
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => {
  const issue = { path: new URL(page.url()).pathname, message: e.message };
  errors.push(issue);
  console.log("BROWSER_ERROR", JSON.stringify(issue));
});
const results = [];
const ok = (s) => {
  results.push(s);
  console.log("PASS " + s);
};
const output = fixtureDir + "/participation-browser";
mkdirSync(output, { recursive: true });
const go = async (path) => {
  await page.goto(config.origin + path);
  await page.getByRole("heading", { level: 1 }).waitFor();
};
const bounded = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal page overflow"
  );

const { seedParticipation } =
  await import("../tests/seed-post-participation.ts");
const { getPostParticipation } =
  await import("../lib/platform/post-participation-reads.ts");
const { postCommand } = await import("../lib/platform/post-commands.ts");
const { calendarCommand } =
  await import("../lib/platform/calendar-commands.ts");
const { randomUUID } = await import("node:crypto");
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
const waitUntil = async (predicate, label) => {
  for (let i = 0; i < 120; i++) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error(label);
};
try {
  const f = await seedParticipation(db);
  await signIn(f.ada);
  await go("/platform");
  await page.locator("#compose-post").click();
  const composer = page.getByRole("form", { name: "Publish post" });
  await composer
    .getByText("Author, audience and replies", { exact: true })
    .click();
  await composer
    .getByLabel("Also share on a church page")
    .selectOption(f.churchA.id);
  await composer.getByLabel("Who may reply?").selectOption("CHURCH_MEMBERS");
  await composer
    .locator('textarea[name="content"]')
    .fill("Fictional poll composer preserves draft permission.");
  await composer.getByRole("complementary", { name: "Add a poll" }).waitFor();
  await composer
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await waitUntil(
    async () =>
      !!(await db.privatePostDraft.findFirst({
        where: { ownerId: f.ada.id, deletedAt: null }
      })),
    "Draft saved"
  );
  await page.waitForFunction(() =>
    document
      .querySelector('form[aria-label="Publish post"]')
      ?.textContent.includes("Saved privately.")
  );
  await composer
    .getByLabel("Share my personal post on", { exact: false })
    .check();
  await composer.getByRole("button", { name: "Post", exact: true }).click();
  await composer
    .getByRole("link", { name: "Add a poll", exact: true })
    .waitFor();
  const href = await composer
    .getByRole("link", { name: "Add a poll", exact: true })
    .getAttribute("href");
  const postId = href.split("/").at(-1).split("#")[0];
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: postId } }))
      .replyAudience,
    "CHURCH_MEMBERS"
  );
  await composer.getByRole("link", { name: "Add a poll", exact: true }).click();
  await page.getByLabel("Poll question").waitFor();
  assert.ok(await page.locator("#poll-create").evaluate((e) => e.open));
  await page.getByLabel("Poll question").fill("Which fictional activity?");
  await page.getByLabel("Options — one per line").fill("Tea\nCoffee\nWater");
  await page.getByRole("link", { name: "Menu", exact: true }).first().click();
  await page
    .getByText(
      "Save or discard your participation entries before leaving or updating this tab.",
      { exact: true }
    )
    .waitFor();
  assert.equal(new URL(page.url()).pathname, "/platform/posts/" + postId);
  await page.getByRole("button", { name: "Save poll", exact: true }).click();
  await page
    .getByRole("heading", { name: "Which fictional activity?", exact: true })
    .waitFor();
  await page.getByText("No votes yet.", { exact: true }).waitFor();
  await bounded();
  ok(
    "Shared composer keeps member-only replies and opens existing poll setup; unsaved entries guard navigation"
  );
  await signIn(f.lee);
  await go("/platform/posts/" + postId);
  let drop = true;
  await page.route("**/api/platform/participation", async (route) => {
    if (drop && route.request().method() === "POST") {
      drop = false;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("radio", { name: /^Tea/ }).check();
  await page.getByRole("button", { name: "Submit vote", exact: true }).click();
  await page.getByText(/The response was interrupted/).waitFor();
  assert.equal(
    await page.getByRole("radio", { name: /^Tea/ }).isChecked(),
    true
  );
  await page.getByRole("button", { name: "Submit vote", exact: true }).click();
  await page
    .getByRole("button", { name: "Save changed vote", exact: true })
    .waitFor();
  await page.unroute("**/api/platform/participation");
  await page.getByRole("radio", { name: /^Coffee/ }).check();
  await page
    .getByRole("button", { name: "Save changed vote", exact: true })
    .click();
  await waitUntil(async () => {
    let v = await getPostParticipation(db, f.lee.token, postId);
    return v.poll.options.find((o) => o.label === "Coffee").count === 1;
  }, "Changed vote");
  await page.getByText("Your vote", { exact: true }).waitFor();
  assert.equal(
    (await getPostParticipation(db, f.lee.token, postId)).poll.total,
    1
  );
  await page.setViewportSize({ width: 320, height: 844 });
  await bounded();
  await page.screenshot({ path: output + "/poll-320.png", fullPage: true });
  ok(
    "Single-choice result bars and own vote survive a committed lost response and change without a duplicate ballot at 320px"
  );
  await signIn(f.ada);
  await go("/platform/posts/" + postId);
  await page.getByRole("button", { name: "Close voting", exact: true }).click();
  await page.getByText(/Voting closed/).waitFor();
  assert.equal(await page.getByRole("radio").count(), 0);
  const multi = await postCommand(db, f.ada.token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "Fictional multiple choice",
    audience: "PUBLIC"
  });
  const { participationCommand } =
    await import("../lib/platform/post-participation.ts");
  await participationCommand(db, f.ada.token, {
    operation: "configure-poll",
    postId: multi.id,
    expectedVersion: 0,
    question: "Pick fictional colors",
    options: ["Blue", "Gold"],
    multiple: true,
    closesLocal: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    timeZone: "UTC"
  });
  await signIn(f.lee);
  await go("/platform/posts/" + multi.id);
  await page.getByRole("checkbox", { name: /^Blue/ }).check();
  await page.getByRole("checkbox", { name: /^Gold/ }).check();
  await page.getByRole("button", { name: "Submit vote", exact: true }).click();
  await page.getByText(/Percentages show the share/).waitFor();
  assert.equal(
    (await getPostParticipation(db, f.lee.token, multi.id)).poll.total,
    1
  );
  assert.equal(
    await page.getByText("1 vote · 100%", { exact: true }).count(),
    2
  );
  await bounded();
  ok(
    "Poll close removes voting controls; multiple-choice percentages describe voters without inventing totals"
  );
  await f.slot();
  await signIn(f.val);
  await go("/platform/posts/" + f.post.id);
  const event = page.getByRole("region", { name: "Linked event" });
  await event
    .getByText("Your time · America/Chicago", { exact: true })
    .waitFor();
  assert.match(
    await event
      .getByRole("link", { name: "Event details and RSVP", exact: true })
      .getAttribute("href"),
    /timeZone=America%2FChicago/
  );
  const role = page.getByRole("region", {
    name: "Welcome neighbors",
    exact: true
  });
  await role
    .getByText("0 of 1 places reserved · 1 available", { exact: true })
    .waitFor();
  await role.getByRole("button", { name: "I can help", exact: true }).click();
  await role.getByText("Your place is reserved.", { exact: true }).waitFor();
  assert.equal(
    await db.calendarResponse.count({
      where: { userId: f.val.id, occurrenceId: f.occurrence.id }
    }),
    0
  );
  await signIn(f.morgan);
  await go("/platform/posts/" + f.post.id);
  assert.equal(
    await page
      .getByRole("button", { name: "Role full", exact: true })
      .isDisabled(),
    true
  );
  await signIn(f.val);
  await go("/platform/posts/" + f.post.id);
  await page
    .getByRole("button", { name: "Cancel my signup", exact: true })
    .click();
  await page.getByRole("button", { name: "I can help", exact: true }).waitFor();
  await bounded();
  await page.screenshot({
    path: output + "/volunteer-320.png",
    fullPage: true
  });
  ok(
    "Local-time event links, last volunteer place and cancellation reuse canonical reservations without implicit RSVP"
  );
  await calendarCommand(db, f.ada.token, {
    operation: "cancel-event",
    eventId: f.event.id,
    expectedVersion: 1,
    scope: "OCCURRENCE",
    occurrenceId: f.occurrence.id,
    occurrenceVersion: 1,
    confirmed: true
  });
  await go("/platform/posts/" + f.post.id);
  await page
    .getByText(
      "This event is canceled. No new RSVPs or volunteer places are available.",
      { exact: true }
    )
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "I can help", exact: true }).count(),
    0
  );
  await signIn(f.blake);
  await go("/platform/posts/" + f.post.id);
  assert.equal(
    await page.getByRole("region", { name: "Linked event" }).count(),
    0
  );
  await context.clearCookies();
  await go("/platform/posts/" + multi.id);
  assert.equal(await page.getByRole("checkbox").count(), 0);
  await page
    .getByRole("link", { name: "Join or sign in to participate", exact: true })
    .waitFor();
  ok(
    "Canceled and private church events keep permissions; guests see readable poll results without voting"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      { checkedAt: new Date().toISOString(), checks: results, errors },
      null,
      2
    )
  );
} catch (error) {
  await page.screenshot({ path: output + "/failure.png", fullPage: true });
  console.log((await page.locator("main").innerText()).slice(-7000));
  throw error;
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
