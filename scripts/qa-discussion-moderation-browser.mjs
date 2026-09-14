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
const output = fixtureDir + "/discussion-moderation-browser";
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

const { seedPortal } = await import("../tests/seed-portal.ts");
const { randomUUID } = await import("node:crypto");
const { postCommand } = await import("../lib/platform/post-commands.ts");
const { portalCommand } = await import("../lib/platform/portal.ts");
const { relationshipCommand } =
  await import("../lib/platform/relationships.ts");
page.setDefaultTimeout(25000);
const signIn = async (actor) => {
  await context.clearCookies();
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
const resume = () =>
  page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
const form = () =>
  page.getByRole("form", { name: "Save discussion settings", exact: true });
const history = () =>
  page.getByRole("region", {
    name: "Recent discussion moderation",
    exact: true
  });
const openSettings = async () => {
  const summary = page
    .locator("summary")
    .filter({ hasText: /^Discussion settings$/ });
  await summary.waitFor();
  if (!(await summary.evaluate((el) => el.parentElement.open)))
    await summary.click();
  await form().waitFor();
};
const bodies = [];
page.on("request", (request) => {
  if (
    request.method() === "POST" &&
    new URL(request.url()).pathname === "/api/platform/posts"
  )
    bodies.push(request.postData());
});
try {
  const f = await seedPortal(db);
  for (const [actor, capability] of [
    [f.memberA, "PUBLISH_CHURCH_POSTS"],
    [f.contact, "MODERATE_CHURCH_POSTS"]
  ])
    await portalCommand(db, f.operator.token, {
      operation: "grant",
      churchId: f.churchA.id,
      userId: actor.id,
      capability,
      expectedVersion: 0
    });
  const post = await postCommand(db, f.memberA.token, {
    operation: "create",
    requestKey: randomUUID(),
    authorChurchId: f.churchA.id,
    content: "Fictional reasoned discussion " + randomUUID(),
    replyAudience: "CHURCH_MEMBERS"
  });
  const path = `/platform/posts/${post.id}`;
  const row = () =>
    db.platformPost.findUniqueOrThrow({ where: { id: post.id } });
  const auditCount = () =>
    db.churchAuditEvent.count({
      where: { targetId: post.id, action: "DISCUSSION_MODERATED" }
    });
  await signIn(f.memberA);
  await go(path);
  await openSettings();
  assert.equal(
    await form()
      .getByLabel("Reason for moderation changes", { exact: true })
      .count(),
    0
  );
  assert.equal(
    await form().getByLabel("Who may reply?", { exact: true }).inputValue(),
    "CHURCH_MEMBERS"
  );
  ok(
    "Author retains existing discussion controls and church-only replies without a new mandatory reason"
  );
  await signIn(f.contact);
  await go(path);
  await openSettings();
  const reason = () =>
    form().getByLabel("Reason for moderation changes", { exact: true });
  assert.equal(await reason().getAttribute("required"), "");
  const beforeInvalid = bodies.length;
  await form()
    .getByLabel("Close this discussion to new replies", { exact: true })
    .check();
  await form()
    .getByRole("button", { name: "Save discussion settings", exact: true })
    .click();
  assert.equal(await reason().evaluate((el) => el.validity.valueMissing), true);
  assert.equal(bodies.length, beforeInvalid);
  assert.equal((await row()).version, 1);
  assert.equal(await auditCount(), 0);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await reason().scrollIntoViewIfNeeded();
    await bounded();
    await form().screenshot({ path: output + `/moderator-form-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await reason().focus();
  await page.keyboard.press("p");
  await page.keyboard.press("Tab");
  // Explicitly assert the selected value before exercising the action.
  await reason().selectOption("PRIVACY");
  assert.equal(await reason().inputValue(), "PRIVACY");
  ok(
    "Required labeled reason prevents a missing-reason request and remains usable without horizontal overflow at 320, 390 and 1280 pixels"
  );
  let dropped;
  await page.route("**/api/platform/posts", async (route) => {
    if (route.request().method() === "POST" && !dropped) {
      dropped = route.request().postData();
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      await route.abort("failed");
    } else await route.continue();
  });
  await form()
    .getByRole("button", { name: "Save discussion settings", exact: true })
    .click();
  await form()
    .getByRole("button", { name: "Retry original request", exact: true })
    .waitFor();
  assert.equal(await reason().isDisabled(), true);
  assert.equal(JSON.parse(dropped).moderationReason, "PRIVACY");
  await resume();
  await page
    .getByRole("button", { name: "Confirm original request", exact: true })
    .waitFor();
  assert.equal(await form().isVisible(), false);
  await page
    .getByRole("button", { name: "Confirm original request", exact: true })
    .click();
  await form()
    .getByRole("button", { name: "Make another change", exact: true })
    .waitFor();
  assert.equal(bodies.at(-1), dropped);
  assert.equal(bodies.filter((x) => x === dropped).length, 2);
  assert.equal((await row()).version, 2);
  assert.equal((await row()).replyAudience, "CHURCH_MEMBERS");
  assert.equal(await auditCount(), 1);
  assert.equal(
    await db.postAudit.count({
      where: { postId: post.id, action: "discussion-changed" }
    }),
    1
  );
  await page.unroute("**/api/platform/posts");
  ok(
    "Lost committed moderator response freezes its reason and exact body, conceals on blur and confirms one original decision without duplicate audit or widened replies"
  );
  await go(path);
  await openSettings();
  await history().waitFor();
  assert.ok(
    (await history().innerText()).includes("Protecting personal information")
  );
  assert.ok((await history().innerText()).includes(f.contact.name));
  assert.ok(
    (await history().innerText()).includes(
      "Closed; church-member reply setting retained"
    )
  );
  assert.match(await history().locator("time").innerText(), /UTC$/);
  assert.equal(await history().locator("li").count(), 1);
  for (const secret of [f.contact.id, f.contact.email, f.contact.token])
    assert.ok(!(await history().innerText()).includes(secret));
  await bounded();
  await history().screenshot({ path: output + "/reason-history-390.png" });
  await signIn(f.memberA);
  await go(path);
  await openSettings();
  await history().waitFor();
  assert.equal(await reason().count(), 0);
  await form()
    .getByLabel("Close this discussion to new replies", { exact: true })
    .uncheck();
  await form()
    .getByRole("button", { name: "Save discussion settings", exact: true })
    .click();
  await form()
    .getByRole("button", { name: "Make another change", exact: true })
    .waitFor();
  assert.equal((await row()).discussionClosed, false);
  assert.equal((await row()).replyAudience, "CHURCH_MEMBERS");
  assert.equal(await auditCount(), 1);
  ok(
    "Current authorized history shows one safe reason, visible actor, prior/new settings and explicit UTC date; author can reopen with original reply scope and no extra moderation audit"
  );
  await signIn(f.contact);
  await go(path);
  await openSettings();
  await reason().selectOption("SAFETY");
  const beforeSwitch = bodies.length;
  await signIn(f.coordinator);
  await form().evaluate((el) => el.requestSubmit());
  await form()
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .waitFor();
  assert.equal(bodies.length, beforeSwitch);
  await resume();
  await form().waitFor({ state: "hidden" });
  await history().waitFor({ state: "hidden" });
  assert.equal((await row()).version, 3);
  assert.equal(await auditCount(), 1);
  ok(
    "Account replacement denies the retained moderator form before POST and conceals both pending choices and audit history"
  );
  await signIn(f.contact);
  await go(path);
  await openSettings();
  await reason().selectOption("REVIEW_NEEDED");
  await db.churchCapabilityGrant.updateMany({
    where: {
      userId: f.contact.id,
      churchId: f.churchA.id,
      capability: "MODERATE_CHURCH_POSTS"
    },
    data: { revokedAt: new Date() }
  });
  await resume();
  await form().waitFor({ state: "hidden" });
  await history().waitFor({ state: "hidden" });
  const denied = await context.request.post(
    config.origin + "/api/platform/posts",
    {
      headers: {
        Origin: config.origin,
        "X-Expected-Account": f.contact.id,
        "Content-Type": "application/json"
      },
      data: dropped
    }
  );
  assert.equal(denied.status(), 403);
  await denied.dispose();
  assert.equal(
    await page
      .getByRole("button", { name: "Confirm original request", exact: true })
      .count(),
    0
  );
  assert.equal((await row()).version, 3);
  assert.equal(await auditCount(), 1);
  ok(
    "Revoked church moderator loses retained settings/history and cannot replay an earlier successful request"
  );
  await signIn(f.coordinator);
  await go(path);
  assert.equal(
    await page
      .getByRole("region", { name: "Manage post", exact: true })
      .count(),
    0
  );
  assert.equal(await history().count(), 0);
  await signIn(f.memberB);
  await go(path);
  assert.equal(
    await page
      .getByRole("region", { name: "Manage post", exact: true })
      .count(),
    0
  );
  assert.equal(await history().count(), 0);
  await relationshipCommand(db, f.memberA.token, {
    operation: "block",
    kind: "person",
    targetId: f.contact.id,
    desired: true,
    expectedVersion: 0,
    mutationId: randomUUID()
  });
  await signIn(f.memberA);
  await go(path);
  await openSettings();
  await history().waitFor();
  assert.ok((await history().innerText()).includes("Unavailable member"));
  assert.ok(!(await history().innerText()).includes(f.contact.name));
  ok(
    "Ordinary and unrelated church readers receive no management history; blocking a prior moderator conceals their identity in the author's permitted audit"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      { results, errors, productionWrites: 0, externalSends: 0 },
      null,
      2
    )
  );
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.txt",
    String(error) +
      "\n" +
      (await page
        .locator("body")
        .innerText()
        .catch(() => ""))
  );
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
