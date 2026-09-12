import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
const dir = process.argv[2];
assert.ok(dir, "Pass the existing isolated HTTPS fixture directory");
const config = JSON.parse(readFileSync(dir + "/browser-env.json", "utf8"));
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
const disabled = process.argv.includes("--disabled");
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
const { seedPortal, assertPortalTestDatabase, seedOperatorGrants } =
  await import("../tests/seed-portal.ts");
const { communityReportCommand } =
  await import("../lib/platform/community-reports.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const f = await seedPortal(db);
await seedOperatorGrants(db, f.operator, ["REVIEW_COMMUNITY_REPORTS"]);
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
const out = dir + "/reports-browser";
mkdirSync(out, { recursive: true });
const groups = [];
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
const newPost = (church = false) =>
  db.platformPost.create({
    data: {
      authorId: f.contact.id,
      content: "Fictional browser report " + randomUUID(),
      ...(church ? { audience: "CHURCH", audienceChurchId: f.churchA.id } : {})
    }
  });
const form = (kind, id) =>
  go(`/platform/reports?targetType=${kind}&targetId=${id}`);
async function ready() {
  await page
    .getByRole("button", { name: "Check reporting access", exact: true })
    .waitFor();
  await page.getByLabel("Report reason").waitFor();
}
async function fill(reason = "SPAM", details = "") {
  await page.getByLabel("Report reason").selectOption(reason);
  if (details) await page.getByLabel("Report details").fill(details);
}
async function resetBudget() {
  await db.platformAuthLimit.deleteMany();
}
async function receipt() {
  await page
    .getByRole("link", { name: "View your private receipt", exact: true })
    .waitFor();
  await page
    .getByRole("link", { name: "View your private receipt", exact: true })
    .click();
  await page.getByRole("article", { name: "Private report receipt" }).waitFor();
  return new URL(page.url()).searchParams.get("receipt");
}
try {
  await login(f.memberA);
  const post = await newPost();
  await go(`/platform/posts/${post.id}`);
  assert.equal(
    reportRequests.length,
    0,
    "Reading a post must not request report metadata"
  );
  const manifest = JSON.parse(
    readFileSync(".next/app-build-manifest.json", "utf8")
  );
  const formChunks = manifest.pages["/platform/reports/page"].filter(
    (file) =>
      file.endsWith(".js") &&
      existsSync(".next/" + file) &&
      readFileSync(".next/" + file, "utf8").includes("Retry same report")
  );
  assert.ok(formChunks.length);
  const initialResources = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((e) => e.name)
  );
  assert.ok(
    formChunks.every(
      (file) => !initialResources.some((url) => url.includes(file))
    )
  );
  await page
    .getByRole("button", {
      name: `More options for ${f.contact.name}'s post`,
      exact: true
    })
    .click();
  await page
    .getByRole("link", { name: "Report this post", exact: true })
    .waitFor();
  assert.equal(
    reportRequests.length,
    0,
    "Opening More must not preload report data"
  );
  await page
    .getByRole("link", { name: "Report this post", exact: true })
    .click();
  await ready();
  assert.equal(new URL(page.url()).searchParams.get("targetId"), post.id);
  if (disabled) {
    await fill("SPAM", "Disabled intake details stay here");
    assert.ok(
      await page
        .getByRole("button", { name: "Send private report", exact: true })
        .isDisabled()
    );
    assert.ok(
      (await page.locator("main").innerText()).includes(
        "Reporting is unavailable"
      )
    );
    assert.equal(
      await db.communityReport.count({ where: { reporterId: f.memberA.id } }),
      0
    );
    await page.screenshot({ path: out + "/disabled-390.png", fullPage: true });
    groups.push(
      "disabled intake is honest, no fake success or writes, and no prefetch before opening"
    );
    await page
      .getByRole("button", { name: "Discard report", exact: true })
      .click();
  } else {
    await fill();
    await page
      .getByRole("button", { name: "Send private report", exact: true })
      .click();
    const firstId = await receipt();
    assert.equal(
      (await db.communityReport.findUniqueOrThrow({ where: { id: firstId } }))
        .details,
      ""
    );
    assert.equal(
      await page
        .getByRole("heading", { name: "Your submitted details" })
        .count(),
      0
    );
    await page.screenshot({ path: out + "/receipt-390.png", fullPage: true });
    groups.push(
      "post More target, no report prefetch, optional details and actual private receipt"
    );

    await resetBudget();
    await go(`/platform/profile/${f.contact.username}`);
    await page
      .getByText(`Connections with ${f.contact.name}`, { exact: true })
      .click();
    await page
      .getByRole("link", { name: "Report this profile", exact: true })
      .click();
    await ready();
    const marker = "Exact retry private detail " + randomUUID();
    await fill("HARASSMENT", marker);
    let lose = true;
    await page.route("**/api/platform/community-reports", async (route) => {
      if (route.request().method() === "POST" && lose) {
        lose = false;
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        await route.abort("failed");
      } else await route.continue();
    });
    const before = bodies.length;
    await page
      .getByRole("button", { name: "Send private report", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Retry same report", exact: true })
      .waitFor();
    await page.waitForFunction(() =>
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent === "Retry same report" && !b.disabled
      )
    );
    assert.equal(
      await db.communityReport.count({
        where: { reporterId: f.memberA.id, details: marker }
      }),
      1
    );
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await login(f.memberB);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page
      .getByText("Your sign-in changed. Reload before continuing.", {
        exact: true
      })
      .waitFor();
    assert.equal(await page.getByLabel("Report details").count(), 0);
    assert.ok(!(await page.locator("main").innerText()).includes(marker));
    await login(f.memberA);
    await page
      .getByRole("button", { name: "Check reporting access", exact: true })
      .click();
    await ready();
    assert.equal(await page.getByLabel("Report details").inputValue(), marker);
    await page
      .getByRole("button", { name: "Retry same report", exact: true })
      .click();
    const ownReceipt = await receipt();
    assert.equal(bodies[before], bodies[before + 1]);
    assert.equal(
      await db.communityReport.count({
        where: { reporterId: f.memberA.id, details: marker }
      }),
      1
    );
    await page.unroute("**/api/platform/community-reports");
    await login(f.contact);
    await go(`/platform/reports?receipt=${ownReceipt}`);
    await page
      .getByText("This private receipt is unavailable.", { exact: true })
      .waitFor();
    assert.ok(!(await page.locator("main").innerText()).includes(marker));
    await login(f.memberA);
    groups.push(
      "lost response retries identical bytes once; account replacement conceals details; reported person denied receipt"
    );

    await resetBudget();
    const stale = await newPost(true);
    await form("POST", stale.id);
    await ready();
    await fill("PRIVACY", "Keep these stale details");
    await db.platformPost.update({
      where: { id: stale.id },
      data: { version: { increment: 1 } }
    });
    await page
      .getByRole("button", { name: "Send private report", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Send private report", exact: true })
      .waitFor();
    await page.waitForFunction(
      () => document.querySelector("button.gc-button-primary")?.disabled
    );
    assert.equal(
      await page.getByLabel("Report details").inputValue(),
      "Keep these stale details"
    );
    await page
      .getByRole("button", { name: "Check reporting access", exact: true })
      .click();
    await ready();
    await db.churchConnection.updateMany({
      where: { userId: f.memberA.id, churchId: f.churchA.id },
      data: { state: "LEFT" }
    });
    await page
      .getByRole("button", { name: "Send private report", exact: true })
      .click();
    await page
      .getByText("This item is unavailable. No report was submitted.", {
        exact: true
      })
      .waitFor();
    assert.equal(
      await page.getByLabel("Report details").inputValue(),
      "Keep these stale details"
    );
    assert.equal(
      await db.communityReport.count({
        where: { reporterId: f.memberA.id, targetId: stale.id }
      }),
      0
    );
    await page
      .getByRole("button", { name: "Discard report", exact: true })
      .click();
    await db.churchConnection.updateMany({
      where: { userId: f.memberA.id, churchId: f.churchA.id },
      data: { state: "APPROVED" }
    });
    groups.push(
      "source-version conflict and revoked church access preserve details without new report"
    );

    await resetBudget();
    const navigation = await newPost();
    await go("/platform/menu");
    await form("POST", navigation.id);
    await ready();
    await fill("SPAM", "Back must keep this report");
    await page.evaluate(() => history.back());
    await page
      .getByText(
        "Send or discard this report before leaving. If its response was lost, retry the same report first.",
        { exact: true }
      )
      .waitFor();
    assert.equal(
      await page.getByLabel("Report details").inputValue(),
      "Back must keep this report"
    );
    await page
      .getByRole("link", { name: "Your private reports", exact: true })
      .click();
    assert.equal(
      new URL(page.url()).searchParams.get("targetId"),
      navigation.id
    );
    await page
      .getByRole("button", { name: "Discard report", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Your private reports", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Your private reports", exact: true })
      .waitFor();
    assert.equal(new URL(page.url()).search, "");
    groups.push(
      "Back and links protect unsent details; explicit discard permits navigation without stranded history"
    );

    await resetBudget();
    const p = await newPost();
    const c = await db.platformPostComment.create({
      data: {
        postId: p.id,
        authorId: f.contact.id,
        content: "Fictional selected comment"
      }
    });
    await go(`/platform/posts/${p.id}`);
    await page
      .locator(`[data-comment-id="${c.id}"]`)
      .getByRole("button", { name: /More comment options/ })
      .click();
    await page
      .getByRole("link", { name: "Report this comment", exact: true })
      .click();
    await ready();
    assert.equal(new URL(page.url()).searchParams.get("targetId"), c.id);
    assert.ok(
      (
        await page
          .getByRole("link", { name: "Selected comment", exact: true })
          .getAttribute("href")
      ).includes(`?comment=${c.id}`)
    );
    await fill("SPAM");
    await page
      .getByRole("button", { name: "Send private report", exact: true })
      .click();
    await receipt();
    await go(`/platform/churches/${f.churchA.id}`);
    await page
      .getByText(`Connections with ${f.churchA.name}`, { exact: true })
      .click();
    await page
      .getByRole("link", { name: "Report church representation", exact: true })
      .click();
    await ready();
    const claims = await db.churchClaim.count();
    await fill("IMPERSONATION", "Fictional representation concern");
    await page
      .getByRole("button", { name: "Send private report", exact: true })
      .click();
    await receipt();
    assert.equal(
      await page
        .getByRole("link", {
          name: "Open the existing church claim review",
          exact: true
        })
        .getAttribute("href"),
      `/platform/church-claims/new?churchId=${f.churchA.id}`
    );
    assert.equal(await db.churchClaim.count(), claims);
    groups.push(
      "comment and church More targets create private receipts and preserve the real claim workflow"
    );

    await resetBudget();
    const quota = await newPost();
    await form("POST", quota.id);
    await ready();
    await fill("SPAM", "Quota keeps these details");
    for (let i = 0; i < 5; i++) {
      const q = await newPost();
      await communityReportCommand(db, f.memberA.token, {
        operation: "create",
        mutationId: randomUUID(),
        targetType: "POST",
        targetId: q.id,
        expectedTargetVersion: 1,
        expectedContextVersion: 0,
        reason: "SPAM"
      });
    }
    await db.platformAuthLimit.updateMany({
      data: { expiresAt: new Date(Date.now() + 3000) }
    });
    await page
      .getByRole("button", { name: "Send private report", exact: true })
      .click();
    await page.getByText(/Try again in \d+ seconds/).waitFor();
    assert.equal(
      await page.getByLabel("Report details").inputValue(),
      "Quota keeps these details"
    );
    await page.waitForFunction(() =>
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent === "Send private report" && !b.disabled
      )
    );
    await page
      .getByRole("button", { name: "Send private report", exact: true })
      .click();
    await receipt();
    groups.push(
      "actual quota rejection displays Retry-After, retains text and succeeds after expiry"
    );
  }
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      ),
      `Report page overflow at ${width}`
    );
  }
  await page.screenshot({
    path: out + (disabled ? "/disabled-final.png" : "/receipts-final.png"),
    fullPage: true
  });
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(
    config.origin + `/platform/reports?targetType=POST&targetId=${post.id}`,
    { waitUntil: "networkidle" }
  );
  assert.equal(await guestPage.getByLabel("Report details").count(), 0);
  assert.equal(
    await guestPage
      .getByRole("article", { name: "Private report receipt" })
      .count(),
    0
  );
  await guest.close();
  assert.deepEqual(errors, []);
  groups.push(
    "320/390/1440 layout, guest privacy and zero browser page errors"
  );
  writeFileSync(
    out + (disabled ? "/disabled.json" : "/enabled.json"),
    JSON.stringify(
      {
        groups,
        groupCount: groups.length,
        errors,
        reportRequests: reportRequests.length,
        productionWrites: 0
      },
      null,
      2
    )
  );
  console.log(
    JSON.stringify(
      { groups, groupCount: groups.length, errors, productionWrites: 0 },
      null,
      2
    )
  );
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
