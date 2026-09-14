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
  hasTouch: true,
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
const output = fixtureDir + "/prayer-browser";
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
const panel = () =>
  page.getByRole("dialog", { name: "Prayer and follow-up", exact: true });
const control = (name) => panel().getByRole("button", { name, exact: true });
const ready = () =>
  panel()
    .getByLabel("Save to my private prayer list", { exact: true })
    .waitFor();
const open = async (name = "Pray for this post", row = page) => {
  await row.getByRole("button", { name, exact: true }).click();
  await ready();
};
const close = async () => {
  await control("Close prayer").click();
  await panel().waitFor({ state: "hidden" });
};
const check = async (label, value) => {
  assert.notEqual(
    await panel().getByLabel(label, { exact: true }).isChecked(),
    value
  );
  await panel().getByLabel(label, { exact: true }).click();
  await ready();
  await page.waitForFunction(
    ({ label, value }) =>
      [...document.querySelectorAll("dialog label")].some(
        (el) =>
          el.textContent.trim() === label &&
          el.querySelector("input")?.checked === value &&
          !el.querySelector("input")?.disabled
      ),
    { label, value }
  );
};
try {
  const f = await seedPortal(db);
  await signIn(f.memberA);
  const p = await db.platformPost.create({
    data: {
      authorId: f.memberA.id,
      content: "Fictional browser prayer source",
      publishedAt: new Date(Date.now() - 1000)
    }
  });
  const root = await commentCommand(db, f.memberA.token, {
    operation: "create",
    mutationId: randomUUID(),
    postId: p.id,
    content: "Fictional comment prayer source"
  });
  const reply = await commentCommand(db, f.memberA.token, {
    operation: "create",
    mutationId: randomUUID(),
    postId: p.id,
    replyToId: root.id,
    content: "Fictional reply prayer source"
  });
  let prayerReads = 0;
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === "/api/platform/prayers" &&
      request.method() === "GET"
    )
      prayerReads++;
  });
  await go(`/platform/posts/${p.id}`);
  await page
    .getByRole("button", { name: "Pray for this post", exact: true })
    .waitFor();
  assert.equal(
    prayerReads,
    0,
    "Displaying prayer controls adds no per-card prayer reads"
  );
  await open();
  assert.equal(await control("I prayed").isDisabled(), true);
  assert.equal(
    await panel()
      .getByLabel("Show my name to people who can read this content", {
        exact: true
      })
      .isChecked(),
    false
  );
  assert.equal(await control("Accept prayer guide").isDisabled(), true);
  const guideBodies = [];
  let loseGuide = true;
  await page.route("**/api/platform/prayers", async (route) => {
    const body = route.request().postData();
    if (body && JSON.parse(body).operation === "guide") {
      guideBodies.push(body);
      const response = await route.fetch();
      if (loseGuide) {
        loseGuide = false;
        await route.abort("failed");
      } else await route.fulfill({ response });
    } else await route.continue();
  });
  await panel()
    .getByLabel("I have read this prayer guide", { exact: true })
    .check();
  await control("Accept prayer guide").click();
  await control("Retry same prayer action").click();
  await ready();
  await control("I prayed").waitFor();
  assert.equal(guideBodies.length, 2);
  assert.equal(guideBodies[0], guideBodies[1]);
  assert.equal(
    (
      await db.prayerGuideReceipt.findUniqueOrThrow({
        where: { ownerId: f.memberA.id }
      })
    ).version,
    1
  );
  ok(
    "Guide is deliberate and required; lost guide responses retry the exact accepted request once"
  );
  await control("I prayed").click();
  await control("Undo I prayed").waitFor();
  assert.equal(
    (
      await db.prayerRecord.findUniqueOrThrow({
        where: {
          ownerId_targetKey: {
            ownerId: f.memberA.id,
            targetKey: `post:${p.id}`
          }
        }
      })
    ).shareName,
    false
  );
  await check("Show my name to people who can read this content", true);
  assert.ok(
    (
      await panel()
        .getByRole("region", { name: "Prayer participants" })
        .innerText()
    ).includes(f.memberA.name)
  );
  await check("Save to my private prayer list", true);
  await check("Receive future author updates in Activity", true);
  await control("Undo I prayed").click();
  await control("I prayed").waitFor();
  assert.equal(
    await panel()
      .getByLabel("Save to my private prayer list", { exact: true })
      .isChecked(),
    true
  );
  assert.equal(
    await panel()
      .getByLabel("Receive future author updates in Activity", { exact: true })
      .isChecked(),
    true
  );
  assert.equal(await db.platformPostLike.count({ where: { postId: p.id } }), 0);
  assert.equal(
    (
      await db.socialPreferences.findUnique({
        where: { ownerId: f.memberA.id }
      })
    )?.pushCategories.includes("prayer") ?? false,
    false
  );
  ok(
    "Acknowledgment, explicit name sharing, private saving, Activity updates and phone consent stay independent"
  );

  await panel()
    .getByLabel("Your prayer update", { exact: true })
    .fill("Preserved author update through permission recheck");
  await control("Close prayer").click();
  assert.equal(await panel().isVisible(), true);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await ready();
  assert.equal(
    await panel()
      .getByLabel("Your prayer update", { exact: true })
      .inputValue(),
    "Preserved author update through permission recheck"
  );
  const updateBodies = [];
  let loseUpdate = true;
  await page.unroute("**/api/platform/prayers");
  await page.route("**/api/platform/prayers", async (route) => {
    const body = route.request().postData();
    if (body && JSON.parse(body).operation === "update") {
      updateBodies.push(body);
      const response = await route.fetch();
      if (loseUpdate) {
        loseUpdate = false;
        await route.abort("failed");
      } else await route.fulfill({ response });
    } else await route.continue();
  });
  await panel()
    .getByLabel("Update kind", { exact: true })
    .selectOption("PRAISE");
  await control("Publish prayer update").click();
  await control("Retry same prayer action").click();
  await panel()
    .getByRole("link", {
      name: "View your published prayer update",
      exact: true
    })
    .waitFor();
  await ready();
  assert.equal(
    await panel()
      .getByLabel("Your prayer update", { exact: true })
      .inputValue(),
    ""
  );
  assert.equal(updateBodies.length, 2);
  assert.equal(updateBodies[0], updateBodies[1]);
  const posted = await db.prayerUpdate.findMany({ where: { postId: p.id } });
  assert.equal(posted.length, 1);
  assert.equal(posted[0].kind, "PRAISE");
  await control("Read prayer updates").click();
  await panel()
    .getByRole("link", { name: "Open update in discussion", exact: true })
    .waitFor();
  await close();
  await go(`/platform/posts/${p.id}?comment=${posted[0].commentId}`);
  await page.locator(`[data-comment-id="${posted[0].commentId}"]`).waitFor();
  assert.ok(
    (
      await page
        .locator(`[data-comment-id="${posted[0].commentId}"]`)
        .innerText()
    ).includes("Praise report")
  );
  ok(
    "Author input survives rechecks, guards closing, retries one canonical update and opens its labeled discussion comment"
  );

  await page.unroute("**/api/platform/prayers");
  await open();
  let failRead = false;
  await page.route("**/api/platform/prayers**", async (route) => {
    const body = route.request().postData();
    if (body && JSON.parse(body).operation === "update") {
      const response = await route.fetch();
      failRead = true;
      await route.fulfill({ response });
    } else if (route.request().method() === "GET" && failRead) {
      failRead = false;
      await route.abort("failed");
    } else await route.continue();
  });
  await panel()
    .getByLabel("Your prayer update", { exact: true })
    .fill("Confirmed update with failed status refresh");
  await control("Publish prayer update").click();
  await panel()
    .getByRole("link", {
      name: "View your published prayer update",
      exact: true
    })
    .waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('dialog [role="status"]')].some((node) =>
      node.textContent.includes("published")
    )
  );
  assert.equal(await control("Retry same prayer action").count(), 0);
  assert.equal(await control("Discard unsent prayer update").count(), 0);
  await control("Refresh prayer choices").click();
  await ready();
  assert.equal(
    await panel()
      .getByLabel("Your prayer update", { exact: true })
      .inputValue(),
    ""
  );
  assert.equal(await db.prayerUpdate.count({ where: { postId: p.id } }), 2);
  await page.unroute("**/api/platform/prayers**");
  await close();
  ok(
    "Confirmed publication followed by a failed read offers refresh, with no resend or retained dirty draft"
  );

  await go(`/platform/posts/${p.id}?comment=${reply.id}`);
  const replyRow = page.locator(`[data-comment-id="${reply.id}"]`);
  await replyRow.waitFor();
  await open("Pray for this comment", replyRow);
  await check("Save to my private prayer list", true);
  await panel()
    .getByLabel("Your prayer update", { exact: true })
    .fill("Nested reply author update");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await ready();
  assert.equal(
    await panel()
      .getByLabel("Your prayer update", { exact: true })
      .inputValue(),
    "Nested reply author update"
  );
  await control("Publish prayer update").click();
  await panel()
    .getByRole("link", {
      name: "View your published prayer update",
      exact: true
    })
    .waitFor();
  await ready();
  assert.equal(
    await db.prayerUpdate.count({ where: { targetCommentId: reply.id } }),
    1
  );
  await close();
  ok(
    "Nested comment Pray opens the correct target; remounting comment rows retains the shared author draft"
  );

  await go(`/platform/feed?feed=latest&post=${p.id}`);
  const beforeReader = new URL(page.url()).searchParams.get("post");
  await page
    .getByRole("button", { name: "Pray for this post", exact: true })
    .first()
    .tap();
  await ready();
  assert.equal(new URL(page.url()).searchParams.get("post"), beforeReader);
  for (const [width, appearance] of [
    [320, "light"],
    [390, "dark"]
  ]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate((appearance) => {
      document
        .querySelector(".platform-design[data-reader-size]")
        .setAttribute("data-appearance", appearance);
      document
        .querySelector(".platform-design[data-reader-size]")
        .setAttribute("data-reader-size", "largest");
    }, appearance);
    await bounded();
    assert.ok(
      await panel().evaluate((el) => el.scrollWidth <= el.clientWidth + 1)
    );
    await page.screenshot({
      path: `${output}/prayer-${width}-${appearance}.png`,
      fullPage: true
    });
    assert.equal(
      await panel().evaluate(
        (el) => getComputedStyle(el).backgroundColor === "rgba(0, 0, 0, 0)"
      ),
      false
    );
  }
  await close();
  const readerCard = page.locator(`[data-post="${p.id}"]`);
  await readerCard.getByRole("button", { name: /^Comment, / }).tap();
  const discussion = page.getByRole("dialog", {
    name: "Post discussion",
    exact: true
  });
  await discussion
    .locator(`[data-comment-id="${root.id}"]`)
    .getByRole("button", { name: "Pray for this comment", exact: true })
    .tap();
  await ready();
  assert.equal(new URL(page.url()).searchParams.get("post"), beforeReader);
  await page.keyboard.press("Escape");
  await panel().waitFor({ state: "hidden" });
  await discussion
    .getByRole("button", { name: "Close discussion", exact: true })
    .click();
  assert.equal(new URL(page.url()).searchParams.get("post"), beforeReader);
  ok(
    "Simulated post and nested comment Pray taps preserve the page-reader destination; Escape and 320/390px light/dark largest-text views pass"
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await go("/platform/settings/display/reading");
  const displayPreview = page.getByRole("region", {
    name: "Display preview",
    exact: true
  });
  await page.getByLabel("Hide reaction counts", { exact: true }).check();
  assert.equal(
    await displayPreview.locator(".gc-reaction-count").first().isVisible(),
    false
  );
  await page
    .getByRole("button", { name: "Save display choices", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document
        .querySelector(".platform-design[data-release][data-reader-size]")
        ?.getAttribute("data-hide-reaction-counts") === "true"
  );
  await go(`/platform/posts/${p.id}`);
  await open();
  assert.equal(await panel().locator(".gc-reaction-count").isVisible(), false);
  assert.equal(await control("I prayed").isVisible(), true);
  await close();
  ok(
    "Hide reaction counts previews and persists in the browser without hiding prayer controls"
  );

  await go("/platform/prayers");
  await page
    .getByRole("heading", { name: `Post by ${f.memberA.name}`, exact: true })
    .waitFor();
  await db.platformPost.update({
    where: { id: p.id },
    data: {
      withdrawnAt: new Date(),
      status: "WITHDRAWN",
      version: { increment: 1 }
    }
  });
  await page
    .getByRole("button", { name: "Refresh private prayer list", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Source unavailable", exact: true })
    .first()
    .waitFor();
  assert.equal(
    (await page.locator("main").innerText()).includes(f.memberA.name),
    false
  );
  const saves = await db.prayerRecord.count({
    where: { ownerId: f.memberA.id, savedAt: { not: null } }
  });
  await page
    .getByRole("button", { name: "Remove private save", exact: true })
    .first()
    .click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[role="status"]')].some((node) =>
      node.textContent.includes("Private save removed")
    )
  );
  assert.equal(
    await db.prayerRecord.count({
      where: { ownerId: f.memberA.id, savedAt: { not: null } }
    }),
    saves - 1
  );
  ok(
    "Private saved prayers conceal withdrawn source details and remain removable without source access"
  );

  const later = [];
  for (let index = 0; index < 25; index++) {
    const source = await db.platformPost.create({
      data: {
        authorId: f.contact.id,
        content: `Fictional private-list source ${index}`
      }
    });
    later.push(
      await db.prayerRecord.create({
        data: {
          ownerId: f.memberA.id,
          postId: source.id,
          targetKey: `post:${source.id}`,
          savedAt: new Date(Date.now() + index + 10000)
        }
      })
    );
  }
  await go("/platform/prayers");
  await page
    .getByRole("link", { name: "More saved prayers", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Newest saved prayers", exact: true })
    .waitFor();
  await page.locator("main article h2 a").first().waitFor();
  assert.equal(await page.locator("main article").count(), 6);
  const returnRow = page
    .locator("main article")
    .filter({ has: page.locator("h2 a") })
    .nth(3);
  const returnId = await returnRow.getAttribute("id");
  const sourceHref = await returnRow.locator("h2 a").getAttribute("href");
  const pageAddress = page.url();
  await returnRow.locator("h2 a").click();
  await page
    .getByRole("heading", { name: "Post and discussion", exact: true })
    .waitFor();
  assert.equal(new URL(page.url()).pathname, sourceHref);
  await page.goBack();
  await page.locator("#" + returnId).waitFor();
  assert.equal(page.url(), pageAddress + "#" + returnId);
  await page.waitForFunction(
    (id) => document.activeElement?.id === id,
    returnId
  );
  assert.equal(await page.locator("main article").count(), 6);
  await page.reload();
  await page.locator("#" + returnId).waitFor();
  await page.waitForFunction(
    (id) => document.activeElement?.id === id,
    returnId
  );
  ok(
    "Private prayer pagination keeps the same page and source item through browser Back and reload, after current access is checked"
  );

  const fresh = await db.platformPost.create({
    data: {
      authorId: f.memberA.id,
      content: "Revocation recovery prayer source"
    }
  });
  await go(`/platform/posts/${fresh.id}`);
  await open();
  await panel()
    .getByLabel("Your prayer update", { exact: true })
    .fill("Keep my own unsent text while source is unavailable");
  await db.platformPost.update({
    where: { id: fresh.id },
    data: {
      withdrawnAt: new Date(),
      status: "WITHDRAWN",
      version: { increment: 1 }
    }
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await panel()
    .getByLabel("Preserved unsent prayer update", { exact: true })
    .waitFor();
  assert.equal(await control("Publish prayer update").count(), 0);
  await signIn(f.contact);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => {
    const dialog = document.querySelector(".gc-prayer-dialog");
    return (
      !dialog ||
      (dialog.textContent.includes("Sign in again") &&
        !dialog.querySelector("textarea"))
    );
  });
  assert.equal(await panel().locator("textarea").count(), 0);
  if (await panel().isVisible()) {
    assert.equal(
      (await panel().innerText()).includes("Keep my own unsent text"),
      false
    );
    await close();
  }
  ok(
    "Same-account revocation preserves only unsent author input; changed accounts clear private state and cannot publish it"
  );

  await context.clearCookies();
  await go("/platform/prayers");
  assert.equal(
    await page
      .getByRole("heading", { name: "My private prayer list", exact: true })
      .count(),
    0
  );
  const denied = await page.evaluate(async () => {
    const response = await fetch("/api/platform/prayers?view=saved");
    return {
      status: response.status,
      cache: response.headers.get("cache-control"),
      body: await response.text()
    };
  });
  assert.equal(denied.status, 401);
  assert.match(denied.cache, /no-store/);
  assert.equal(denied.body.includes(f.memberA.name), false);
  ok("Guests receive a private no-store denial without saved source data");
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        passed: results,
        pageErrors: errors,
        realMessages: 0,
        realPhoneSends: 0,
        physicalDevice: false,
        fixtureOnly: true
      },
      null,
      2
    )
  );
} catch (error) {
  writeFileSync(
    output + "/failure.txt",
    String(error) + "\n" + (await page.locator("body").innerText())
  );
  await page.screenshot({ path: output + "/failure.png", fullPage: true });
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
