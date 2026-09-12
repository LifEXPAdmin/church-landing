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
const { seedPortal, assertPortalTestDatabase } =
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
const output = fixtureDir + "/comment-reader-browser";
mkdirSync(output, { recursive: true });
const go = async (path) => {
  await page.goto(config.origin + path);
};
const bounded = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal page overflow"
  );

const signIn = async (actor) =>
  context.addCookies([
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

const { randomUUID } = await import("node:crypto");
const { commentCommand } = await import("../lib/platform/comment-commands.ts");
try {
  const f = await seedPortal(db);
  await signIn(f.memberA);
  const calendar = await db.platformCalendar.create({
    data: {
      churchId: f.churchA.id,
      creatorId: f.memberA.id,
      name: "Reader event calendar",
      timeZone: "UTC",
      requestKey: randomUUID()
    }
  });
  const event = await db.calendarEvent.create({
    data: {
      calendarId: calendar.id,
      requestKey: randomUUID(),
      title: "Reader event fixture",
      visibility: "PUBLIC",
      timeZone: "UTC",
      startLocal: "2026-09-20T10:00",
      endLocal: "2026-09-20T11:00"
    }
  });
  const occurrence = await db.calendarOccurrence.create({
    data: {
      eventId: event.id,
      ordinal: 0,
      title: event.title,
      allDay: false,
      timeZone: "UTC",
      startLocal: event.startLocal,
      endLocal: event.endLocal,
      startAt: new Date("2026-09-20T10:00:00Z"),
      endAt: new Date("2026-09-20T11:00:00Z")
    }
  });
  const post = await db.platformPost.create({
    data: {
      authorId: f.memberA.id,
      eventOccurrenceId: occurrence.id,
      content: "Reader comment source"
    }
  });
  const root = await commentCommand(db, f.memberB.token, {
    operation: "create",
    mutationId: randomUUID(),
    postId: post.id,
    content: "Helpful chronological root"
  });
  await go(`/platform/posts/${post.id}`);
  const thread = () =>
    page.getByRole("region", { name: "Full discussion", exact: true });
  const row = () => page.locator(`[data-comment-id="${root.id}"]`);
  await row().waitFor();
  await row()
    .getByRole("button", { name: "Pin helpful comment", exact: true })
    .click();
  await page
    .getByRole("complementary", { name: "Pinned helpful comment", exact: true })
    .waitFor();
  assert.ok((await thread().innerText()).includes("Discussion · 1"));
  assert.equal(await page.locator(`[data-comment-id="${root.id}"]`).count(), 1);
  const bodies = [];
  let lose = true;
  await page.route("**/api/platform/comments", async (route) => {
    const body = route.request().postData();
    if (body && JSON.parse(body).operation === "conversation") {
      bodies.push(body);
      const response = await route.fetch();
      if (lose) {
        lose = false;
        await route.abort("failed");
      } else await route.fulfill({ response });
    } else await route.continue();
  });
  await thread()
    .getByRole("button", { name: "Follow conversation", exact: true })
    .click();
  await thread()
    .getByRole("button", {
      name: "Retry same conversation preference",
      exact: true
    })
    .click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (b) =>
        b.textContent === "Follow conversation" &&
        b.getAttribute("aria-pressed") === "true"
    )
  );
  assert.equal(bodies[0], bodies[1]);
  await page.unroute("**/api/platform/comments");
  await commentCommand(db, f.memberA.token, {
    operation: "conversation",
    mutationId: randomUUID(),
    postId: post.id,
    mode: "MUTE",
    expectedVersion: 1
  });
  await thread().getByRole("button", { name: "Default", exact: true }).click();
  await thread()
    .getByText(/changed|version/i)
    .first()
    .waitFor();
  assert.equal(
    (
      await db.conversationPreference.findUniqueOrThrow({
        where: { ownerId_postId: { ownerId: f.memberA.id, postId: post.id } }
      })
    ).mode,
    "MUTE"
  );
  await thread()
    .getByRole("button", { name: "Refresh discussion", exact: true })
    .click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (b) =>
        b.textContent === "Mute conversation" &&
        b.getAttribute("aria-pressed") === "true"
    )
  );
  await commentCommand(db, f.memberB.token, {
    operation: "delete",
    mutationId: randomUUID(),
    postId: post.id,
    commentId: root.id,
    expectedVersion: 1
  });
  await thread()
    .getByRole("button", { name: "Refresh discussion", exact: true })
    .click();
  await page
    .getByRole("complementary", { name: "Pinned helpful comment", exact: true })
    .waitFor({ state: "detached" });
  ok(
    "Independent pin and conversation versions preserve chronological counts; exact retry, concurrent preference conflict and deleted pin behave correctly"
  );
  const shared = await commentCommand(db, f.memberB.token, {
    operation: "create",
    mutationId: randomUUID(),
    postId: post.id,
    content: "Shared reader comment identity"
  });
  await signIn(f.memberB);
  await go(`/platform/posts/${post.id}?comment=${shared.id}`);
  await page.locator(`[data-comment-id="${shared.id}"]`).waitFor();
  assert.equal(
    await thread()
      .getByRole("button", { name: "Pin helpful comment", exact: true })
      .count(),
    0
  );
  await page.waitForFunction(
    (id) => document.activeElement?.id === `comment-${id}`,
    shared.id
  );
  await context.clearCookies({ name: "church_platform_session" });
  await go(`/platform/posts/${post.id}?comment=${shared.id}`);
  await thread()
    .getByRole("link", { name: "Sign in to take part", exact: true })
    .click();
  await page
    .locator("main")
    .getByRole("link", { name: "Sign in", exact: true })
    .click();
  await page.locator("#account-login-email").fill(f.memberB.email);
  await page.locator("#account-login-password").fill(f.memberB.password);
  await page.locator("#account-login-form button[type=submit]").click();
  await page.waitForURL(`**/platform/posts/${post.id}?comment=${shared.id}`);
  await page.waitForFunction(
    (id) => document.activeElement?.id === `comment-${id}`,
    shared.id
  );
  ok(
    "Guest sign-in returns to the validated individual comment and restores target focus"
  );
  await context.addCookies([
    {
      name: "godschurches_reading",
      value: encodeURIComponent(
        JSON.stringify({
          appearance: "dark",
          mode: "pages",
          size: "largest",
          reduceMotion: true
        })
      ),
      domain: "127.0.0.1",
      path: "/",
      secure: true,
      sameSite: "Lax"
    }
  ]);
  for (const [width, path] of [
    [390, `/platform?mode=list&post=${post.id}`],
    [1280, `/platform?mode=pages&post=${post.id}`],
    [390, `/platform/feed?post=${post.id}`]
  ]) {
    await page.setViewportSize({ width, height: 844 });
    await go(path);
    const card = page.locator(`[data-post="${post.id}"]`);
    await card.waitFor();
    const button = card.getByRole("button", { name: /^Discussion \(/ });
    await button.click();
    const dialog = page.getByRole("dialog", {
      name: "Post discussion",
      exact: true
    });
    await dialog.waitFor();
    await dialog.locator(`[data-comment-id="${shared.id}"]`).waitFor();
    assert.equal(
      await dialog
        .getByText("Shared reader comment identity", { exact: true })
        .evaluate((el) => getComputedStyle(el).fontSize),
      "24px"
    );
    const before = page.url();
    await dialog
      .locator(`[data-comment-id="${shared.id}"] p`)
      .last()
      .dispatchEvent("wheel", {
        deltaX: 200,
        deltaY: 0,
        bubbles: true,
        cancelable: true
      });
    await page.keyboard.press("ArrowRight");
    assert.equal(page.url(), before);
    const composer = dialog.getByRole("form", {
      name: "Write a comment",
      exact: true
    });
    await composer
      .getByLabel("Comment text", { exact: true })
      .fill(`Reader draft ${width} ${path}`);
    await dialog
      .getByRole("button", { name: "Close discussion", exact: true })
      .click();
    await dialog
      .getByText(
        "Save or resolve your comment before closing this discussion.",
        { exact: true }
      )
      .waitFor();
    await composer
      .getByRole("button", { name: "Save comment draft", exact: true })
      .click();
    await composer.getByText("Saved privately.", { exact: true }).waitFor();
    await dialog.screenshot({
      path:
        output +
        `/reader-${width}-${path.includes("/feed") ? "focused" : "home"}.png`
    });
    if (width === 1280) {
      await composer
        .getByRole("button", { name: "Send comment", exact: true })
        .click();
      await dialog
        .locator("article[data-comment-id]")
        .filter({ hasText: `Reader draft ${width} ${path}` })
        .waitFor();
      const sent = await db.platformPostComment.findFirstOrThrow({
        where: { postId: post.id, content: `Reader draft ${width} ${path}` }
      });
      const sentRow = dialog.locator(`[data-comment-id="${sent.id}"]`);
      await sentRow.waitFor();
      await sentRow.getByRole("button", { name: "Edit", exact: true }).click();
      const edit = dialog.getByRole("form", {
        name: "Edit comment",
        exact: true
      });
      await edit
        .getByLabel("Edited comment text", { exact: true })
        .fill("Reader edited after lost response");
      const edits = [];
      let lost = true;
      await page.route("**/api/platform/comments", async (route) => {
        const body = route.request().postData();
        if (body && JSON.parse(body).operation === "edit") {
          edits.push(body);
          const response = await route.fetch();
          if (lost) {
            lost = false;
            await route.abort("failed");
          } else await route.fulfill({ response });
        } else await route.continue();
      });
      await edit
        .getByRole("button", { name: "Save edit", exact: true })
        .click();
      await edit
        .getByRole("button", { name: "Retry same edit", exact: true })
        .click();
      await sentRow
        .getByText("Reader edited after lost response", { exact: true })
        .waitFor();
      assert.equal(edits[0], edits[1]);
      await page.unroute("**/api/platform/comments");
      page.once("dialog", (d) => d.accept());
      await sentRow
        .getByRole("button", { name: "Delete", exact: true })
        .click();
      await dialog
        .getByText("Reader edited after lost response", { exact: true })
        .waitFor({ state: "detached" });
    }
    await dialog
      .getByRole("button", { name: "Close discussion", exact: true })
      .click();
    await dialog.waitFor({ state: "detached" });
    assert.equal(
      await button.evaluate((b) => b === document.activeElement),
      true
    );
    assert.equal(page.url(), before);
    await bounded();
  }
  ok(
    "Bible, List and focused reader share exact comment IDs; nested gestures do not turn feed; dirty close guard and focus restoration pass at 390/1280px with largest text, dark and reduced motion"
  );
  await go(`/platform?mode=list&post=${post.id}`);
  const source = page.locator(`[data-post="${post.id}"]`);
  const detailLink = source.getByRole("link", {
    name: "View post and comments",
    exact: true
  });
  await detailLink.scrollIntoViewIfNeeded();
  const savedY = await page.evaluate(() => scrollY),
    savedURL = page.url();
  await detailLink.click();
  await page
    .getByRole("button", { name: "Back to previous view", exact: true })
    .click();
  await page.waitForURL(savedURL);
  await page.waitForFunction((y) => Math.abs(scrollY - y) < 8, savedY);
  ok("Post detail returns to the same List feed URL and scroll position");
  await go(`/platform/events/${occurrence.id}`);
  await thread().locator(`[data-comment-id="${shared.id}"]`).waitFor();
  await db.calendarEvent.update({
    where: { id: event.id },
    data: { visibility: "CHURCH" }
  });
  await go(`/platform/events/${occurrence.id}`);
  assert.equal(
    await page.locator(`[data-comment-id="${shared.id}"]`).count(),
    0
  );
  ok(
    "Event discussion uses the same authorized comment IDs and disappears when the event audience is revoked"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/receipt.json",
    JSON.stringify({ results, pageErrors: errors }, null, 2)
  );
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
