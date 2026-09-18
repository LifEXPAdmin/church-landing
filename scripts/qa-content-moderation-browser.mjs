import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
const dir = process.argv[2];
const groupMode = process.argv.includes("--groups");
assert.ok(dir, "Pass the existing isolated HTTPS fixture directory");
const config = JSON.parse(readFileSync(dir + "/browser-env.json", "utf8"));
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + dir + "/sink",
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: "",
  CHURCH_CLAIM_REVIEW_ENABLED: "true",
  CHURCH_CLAIM_POLICY_VERSION: "manual-review-v1",
  COMMUNITY_REPORTS_ENABLED: "true"
});
const { PrismaClient } = await import("@prisma/client");
const {
  seedPortal,
  assertPortalTestDatabase,
  seedOperatorGrants,
  createPortalActor
} = await import("../tests/seed-portal.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const f = await seedPortal(db);
let gather, groupOwner;
const { groupCommand } = await import("../lib/platform/group-commands.ts");
if (groupMode) {
  f.operator = await createPortalActor(db, "groupmoderatorui");
  groupOwner = await createPortalActor(db, "groupownerui");
  gather = await groupCommand(db, groupOwner.token, {
    operation: "create",
    mutationId: randomUUID(),
    schema: 1,
    slug: "moderation-" + randomUUID(),
    acceptedRules: true,
    leaderDisclosure: true,
    fields: {
      name: "Fictional moderation group " + randomUUID(),
      purpose: "Isolated group review and reconsideration",
      rules: "Keep private group discussion within the group.",
      kind: "INTEREST",
      discovery: "LISTED",
      joinPolicy: "OPEN",
      format: "ONLINE",
      area: "",
      topic: "Fictional review",
      churchId: null
    }
  });
  for (const actor of [f.operator, f.memberA, f.contact])
    await groupCommand(db, actor.token, {
      operation: "join",
      mutationId: randomUUID(),
      groupId: gather.id,
      expectedVersion: 0,
      rulesVersion: 1,
      acceptedRules: true,
      rosterVisible: false
    });
  let member = await db.gatherGroupMembership.findUniqueOrThrow({
    where: { groupId_userId: { groupId: gather.id, userId: f.operator.id } }
  });
  await groupCommand(db, groupOwner.token, {
    operation: "offer-role",
    mutationId: randomUUID(),
    groupId: gather.id,
    targetId: f.operator.id,
    expectedVersion: member.version,
    role: "LEADER",
    reason: "Fictional scoped review responsibility"
  });
  member = await db.gatherGroupMembership.findUniqueOrThrow({
    where: { groupId_userId: { groupId: gather.id, userId: f.operator.id } }
  });
  await groupCommand(db, f.operator.token, {
    operation: "accept-role",
    mutationId: randomUUID(),
    groupId: gather.id,
    expectedVersion: member.version,
    role: "LEADER",
    rulesVersion: 1,
    acceptedRules: true,
    leaderDisclosure: true
  });
} else await seedOperatorGrants(db, f.operator, ["REVIEW_COMMUNITY_REPORTS"]);
await db.churchCapabilityGrant.create({
  data: {
    userId: f.coordinator.id,
    churchId: f.churchA.id,
    capability: "MODERATE_CHURCH_POSTS"
  }
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
const errors = [],
  reportRequests = [],
  bodies = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("request", (req) => {
  if (new URL(req.url()).pathname === "/api/platform/community-reports") {
    reportRequests.push(req.method());
    if (req.method() === "POST") bodies.push(req.postData());
  }
});
const out =
  dir +
  (groupMode
    ? "/group-content-moderation-browser"
    : "/content-moderation-browser");
mkdirSync(out, { recursive: true });
const groups = [];
groups.push = (...items) => {
  for (const item of items) console.log("PASS: " + item);
  return Array.prototype.push.apply(groups, items);
};
const login = (actor) =>
  context.addCookies([
    {
      name: "church_platform_session",
      value: actor.token,
      url: config.origin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
const go = (path) =>
  page.goto(config.origin + path, { waitUntil: "networkidle" });
const button = (name) => page.getByRole("button", { name, exact: true });
const link = (name) => page.getByRole("link", { name, exact: true });
const source = await db.platformPost.create({
  data: {
    authorId: f.memberA.id,
    content: "Fictional selected source " + randomUUID(),
    ...(groupMode
      ? {
          audience: "GROUP",
          groupId: gather.id,
          groupThreadKind: "DISCUSSION",
          groupCategory: "GENERAL",
          allowReposts: false
        }
      : { audienceChurchId: f.churchA.id }),
    replyAudience: groupMode ? "VIEWERS" : "CHURCH_MEMBERS",
    discussionClosed: true
  }
});
const report = await db.communityReport.create({
  data: {
    reporterId: f.contact.id,
    targetType: "POST",
    targetId: source.id,
    targetVersion: 1,
    ...(groupMode ? { scopeGroupId: gather.id } : {}),
    reason: groupMode ? "SPAM" : "PRIVACY",
    details: "Private reporter context " + randomUUID()
  }
});
const privateReason = "Private reviewer explanation " + randomUUID();
const explanation =
  "Please reconsider this fictional selected source " + randomUUID();
const supportBodies = [],
  dialogs = [];
page.on("request", (req) => {
  if (
    new URL(req.url()).pathname === "/api/platform/support" &&
    req.method() === "POST"
  )
    supportBodies.push(req.postData());
});
page.on("dialog", async (dialog) => {
  dialogs.push(dialog.type());
  await dialog.accept();
});
async function loseResponse(path) {
  let first = true;
  await page.route("**" + path, async (route) => {
    if (route.request().method() === "POST" && first) {
      first = false;
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      await route.abort("failed");
    } else await route.continue();
  });
}
const currentNotice = () =>
  page.getByRole("article", { name: "Your content decision" });
async function focusAgain() {
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
}
try {
  await login(f.operator);
  await go("/platform/reports/review?id=" + report.id);
  await page.getByRole("article", { name: "Selected report" }).waitFor();
  await page.getByLabel("Content action", { exact: true }).selectOption("HIDE");
  await page
    .getByLabel("Private decision reason", { exact: true })
    .fill(privateReason);
  const preview = page.getByLabel("Author notice preview", { exact: true });
  assert.ok(!(await preview.innerText()).includes(privateReason));
  assert.ok(!(await preview.innerText()).includes(report.details));
  await page
    .getByLabel(
      "Apply this decision to the selected content and create this author notice.",
      { exact: true }
    )
    .check();
  await loseResponse("/api/platform/community-reports");
  await button("Record review").click();
  await button("Retry same review").waitFor();
  await button("Retry same review").click();
  await button("Record review").waitFor();
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  const decision = await db.communityReportDecision.findFirstOrThrow({
    where: { reportId: report.id, action: "HIDE" }
  });
  assert.equal(
    await db.communityReportDecision.count({ where: { reportId: report.id } }),
    1
  );
  const hidden = await db.platformPost.findUniqueOrThrow({
    where: { id: source.id }
  });
  assert.equal(hidden.moderationState, "HIDDEN");
  assert.equal(hidden.replyAudience, groupMode ? "VIEWERS" : "CHURCH_MEMBERS");
  assert.equal(hidden.discussionClosed, true);
  groups.push(
    "previewed source action and lost-response retry create one decision, preserving reply permissions and closure"
  );
  await page.unroute("**/api/platform/community-reports");

  const noticePath = "/platform/reports/decisions?id=" + decision.id;
  await login(f.memberA);
  await go(noticePath);
  await currentNotice().waitFor();
  await page.getByRole("region", { name: "Your selected content" }).waitFor();
  assert.ok((await page.locator("main").innerText()).includes(source.content));
  const visible = await page.locator("main").innerText();
  for (const secret of [report.details, privateReason, f.contact.id])
    assert.ok(!visible.includes(secret));
  assert.ok(visible.includes(f.operator.name));
  assert.ok(visible.includes("not independent"));
  await page.screenshot({
    path: out + "/author-notice-phone.png",
    fullPage: true
  });
  await go("/platform/posts/" + source.id);
  assert.ok(!(await page.content()).includes(source.content));
  await login(f.contact);
  await go(noticePath);
  assert.ok(!(await page.content()).includes(source.content));
  assert.equal(await currentNotice().count(), 0);
  const foreign = await page.request.get(
    config.origin +
      "/api/platform/community-reports?view=decisions&id=" +
      decision.id
  );
  assert.equal(foreign.status(), 404);
  groups.push(
    "private author detail identifies only owned content; ordinary source and outsider HTML/API remain concealed"
  );

  await login(f.memberA);
  await go(noticePath);
  await currentNotice().waitFor();
  await page
    .getByLabel("Why should this decision be reconsidered?", { exact: true })
    .fill(explanation);
  await page
    .getByLabel(
      "I agree to share this explanation and future replies with the assigned report reviewer.",
      { exact: true }
    )
    .check();
  await loseResponse("/api/platform/support");
  await button("Request reconsideration").click();
  await button("Retry original request").waitFor();
  assert.equal(
    await page
      .getByLabel("Why should this decision be reconsidered?", { exact: true })
      .isDisabled(),
    true
  );
  assert.equal(
    await page
      .getByLabel("Why should this decision be reconsidered?", { exact: true })
      .inputValue(),
    explanation
  );
  await focusAgain();
  await currentNotice().waitFor({ state: "hidden" });
  await button("Confirm original request").waitFor();
  await button("Confirm original request").click();
  await page.waitForURL(/\/platform\/help\/cases\//);
  await page.getByText(explanation, { exact: true }).waitFor();
  assert.equal(supportBodies.length, 2);
  assert.equal(supportBodies[0], supportBodies[1]);
  assert.equal(
    dialogs.length,
    0,
    "successful retry must not trigger an unsaved-work dialog"
  );
  const help = await db.supportCase.findUniqueOrThrow({
    where: { moderationDecisionId: decision.id }
  });
  assert.equal(help.description, explanation);
  assert.equal(help.ownerGrantId, null);
  assert.equal(
    await db.supportCapabilityGrant.count({ where: { userId: f.operator.id } }),
    0
  );
  assert.equal(
    (await db.communityReport.findUniqueOrThrow({ where: { id: report.id } }))
      .status,
    "FOLLOW_UP_REQUIRED"
  );
  groups.push(
    "explicit consent and exact uncertain appeal retry create one real case with the assigned report reviewer"
  );
  await page.unroute("**/api/platform/support");

  await login(f.operator);
  await go("/platform/help/inbox");
  await page
    .getByRole("link", { name: /reconsideration/i })
    .first()
    .waitFor();
  await go("/platform/help/cases/" + help.id);
  await page.getByText(explanation, { exact: true }).waitFor();
  await link("Review the selected report and content").waitFor();
  const reviewerReply =
    "The selected context is being reviewed " + randomUUID();
  await page.getByLabel("Your reply", { exact: true }).fill(reviewerReply);
  await button("Save reply").click();
  await page.getByText(reviewerReply, { exact: true }).waitFor();
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: source.id } }))
      .moderationState,
    "HIDDEN"
  );
  await page.screenshot({
    path: out + "/reviewer-case-phone.png",
    fullPage: true
  });
  const currentVersion = (
    await db.supportCase.findUniqueOrThrow({ where: { id: help.id } })
  ).version;
  if (groupMode) {
    const member = await db.gatherGroupMembership.findUniqueOrThrow({
      where: { groupId_userId: { groupId: gather.id, userId: f.operator.id } }
    });
    await groupCommand(db, groupOwner.token, {
      operation: "revoke-role",
      mutationId: randomUUID(),
      groupId: gather.id,
      targetId: f.operator.id,
      expectedVersion: member.version,
      reason: "Fictional review responsibility ended"
    });
  } else
    await db.platformOperatorGrant.update({
      where: {
        userId_capability: {
          userId: f.operator.id,
          capability: "REVIEW_COMMUNITY_REPORTS"
        }
      },
      data: { revokedAt: new Date() }
    });
  await focusAgain();
  await page
    .getByText(explanation, { exact: true })
    .waitFor({ state: "hidden" });
  assert.ok(!(await page.locator("main").innerText()).includes(explanation));
  const denied = await page.request.post(
    config.origin + "/api/platform/support",
    {
      headers: { origin: config.origin, "x-expected-account": f.operator.id },
      data: JSON.parse(supportBodies.at(-1))
    }
  );
  assert.equal(denied.status(), 404);
  assert.equal(
    (await db.supportCase.findUniqueOrThrow({ where: { id: help.id } }))
      .version,
    currentVersion
  );
  groups.push(
    "assigned reviewer inbox/reply works; revocation conceals the case and denies an exact prior write"
  );

  await login(f.memberA);
  await go("/platform/help/cases/" + help.id);
  await page.getByText(explanation, { exact: true }).waitFor();
  assert.ok(
    (await page.locator("main").innerText()).includes("currently lacks access")
  );
  const draft = "Unsent private appeal reply " + randomUUID();
  await page.getByLabel("Your reply", { exact: true }).fill(draft);
  await login(f.contact);
  await focusAgain();
  await page
    .getByText(explanation, { exact: true })
    .waitFor({ state: "hidden" });
  assert.ok(!(await page.locator("main").innerText()).includes(explanation));
  const switched = await page.request.post(
    config.origin + "/api/platform/support",
    {
      headers: { origin: config.origin, "x-expected-account": f.memberA.id },
      data: {
        operation: "reply",
        caseId: help.id,
        expectedVersion: currentVersion,
        body: draft,
        requestKey: randomUUID()
      }
    }
  );
  assert.equal(switched.status(), 401);
  assert.equal(
    await db.supportMessage.count({ where: { caseId: help.id, body: draft } }),
    0
  );
  groups.push(
    "author retains honest missing-reviewer history; account switching conceals unsent work and rejects the old account write"
  );

  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1
    ),
    false
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    out + "/RESULT.json",
    JSON.stringify(
      { groups, pageErrors: errors, dialogs, fixtureOnly: true },
      null,
      2
    )
  );
  console.log("CONTENT_MODERATION_BROWSER_PASSED " + groups.length);
} finally {
  await db.platformOperatorGrant.updateMany({
    where: { userId: f.operator.id, capability: "REVIEW_COMMUNITY_REPORTS" },
    data: { revokedAt: null }
  });
  await browser.close();
  await db.$disconnect();
}
