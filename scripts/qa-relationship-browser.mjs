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
const output = fixtureDir + "/relationship-browser";
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
const { relationshipCommand } = await import("../lib/platform/relationships.ts");
try {
  const f = await seedPortal(db);
  await signIn(f.memberA);
  const post = await db.platformPost.create({
    data: { authorId: f.memberB.id, content: "Relationship visible source" }
  });
  await go(`/platform/profile/${f.memberB.username}`);
  const choices = () =>
    page.locator(`[aria-label="Relationship choices for ${f.memberB.name}"]`);
  const summary = () =>
    page
      .locator(".gc-profile-header summary")
      .filter({ hasText: `Connections with ${f.memberB.name}` });
  async function open() {
    if (!(await choices().isVisible())) await summary().click();
    await choices()
      .getByRole("button", {
        name: "Refresh relationship choices",
        exact: true
      })
      .waitFor();
    await page.waitForFunction((name) => {
      const g = [...document.querySelectorAll("[aria-label]")].find(
        (x) =>
          x.getAttribute("aria-label") === `Relationship choices for ${name}`
      );
      return (
        g &&
        [...g.querySelectorAll("button")].some(
          (b) => b.textContent === "Follow" || b.textContent === "Unfollow"
        )
      );
    }, f.memberB.name);
  }
  async function change(name) {
    await choices().getByRole("button", { name, exact: true }).click();
    await choices().waitFor({ state: "detached" });
    await open();
  }
  await open();
  const bodies = [];
  let lose = true;
  await page.route("**/api/platform/relationships", async (route) => {
    const body = route.request().postData();
    if (body && JSON.parse(body).operation === "follow") {
      bodies.push(body);
      const response = await route.fetch();
      if (lose) {
        lose = false;
        await route.abort("failed");
      } else await route.fulfill({ response });
    } else await route.continue();
  });
  await choices().getByRole("button", { name: "Follow", exact: true }).click();
  await choices()
    .getByRole("button", {
      name: "Retry same relationship change",
      exact: true
    })
    .click();
  await choices().waitFor({ state: "detached" });
  assert.equal(bodies[0], bodies[1]);
  await page.unroute("**/api/platform/relationships");
  await open();
  await choices()
    .getByRole("button", { name: "Unfollow", exact: true })
    .waitFor();
  await change("Add private favorite");
  await choices()
    .getByRole("button", { name: "Remove favorite", exact: true })
    .waitFor();
  await change("Unfollow");
  assert.equal(
    await choices()
      .getByRole("button", { name: "Add private favorite", exact: true })
      .isDisabled(),
    true
  );
  await change("Mute in feed");
  await choices()
    .getByRole("button", { name: "Restore in feed", exact: true })
    .waitFor();
  await change("Restore in feed");
  await change("Snooze 1 day");
  await choices()
    .getByText(/Snoozed until/)
    .waitFor();
  let relation = await db.socialRelationship.findFirstOrThrow({
    where: { ownerId: f.memberA.id, targetUserId: f.memberB.id }
  });
  assert.ok(relation.snoozedUntil > Date.now());
  await db.socialRelationship.update({
    where: { id: relation.id },
    data: { snoozedUntil: new Date(Date.now() - 1000) }
  });
  await choices()
    .getByRole("button", { name: "Refresh relationship choices", exact: true })
    .click();
  await choices()
    .getByText("Your snooze has ended.", { exact: true })
    .waitFor();
  ok(
    "Profile controls preserve exact lost follow retry, private favorite/unfollow semantics, mute/restore and visible snooze expiry"
  );
  relation = await db.socialRelationship.findFirstOrThrow({
    where: { id: relation.id }
  });
  await relationshipCommand(db, f.memberA.token, {
    operation: "mute",
    mutationId: randomUUID(),
    kind: "person",
    targetId: f.memberB.id,
    expectedVersion: relation.version,
    desired: true
  });
  await choices().getByRole("button", { name: "Follow", exact: true }).click();
  await choices()
    .getByText(/changed|version/i)
    .first()
    .waitFor();
  assert.equal(
    await choices()
      .getByRole("button", { name: "Follow", exact: true })
      .isDisabled(),
    true
  );
  await choices()
    .getByRole("button", { name: "Refresh relationship choices", exact: true })
    .click();
  await choices()
    .getByRole("button", { name: "Restore in feed", exact: true })
    .waitFor();
  ok(
    "Concurrent relationship change conflicts and requires canonical refresh before another choice"
  );
  await signIn(f.memberB);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await page.getByRole("link", { name: "Edit profile", exact: true }).waitFor();
  assert.equal(await choices().count(), 0);
  await signIn(f.memberA);
  await go(`/platform/churches/${f.churchB.id}`);
  const church = () =>
    page.locator(`[aria-label="Relationship choices for ${f.churchB.name}"]`);
  await page
    .getByText(`Connections with ${f.churchB.name}`, { exact: true })
    .click();
  await church().getByRole("button", { name: "Follow", exact: true }).click();
  await church().waitFor({ state: "detached" });
  await page
    .getByText(`Connections with ${f.churchB.name}`, { exact: true })
    .click();
  await church()
    .getByRole("button", { name: "Unfollow", exact: true })
    .waitFor();
  assert.equal(
    await church()
      .getByRole("button", { name: "Block personal account", exact: true })
      .count(),
    0
  );
  assert.equal(
    await db.churchConnection.count({
      where: { userId: f.memberA.id, churchId: f.churchB.id, state: "APPROVED" }
    }),
    0
  );
  await go(`/platform/posts/${post.id}`);
  await page
    .getByText(`Connections with ${f.memberB.name}`, { exact: true })
    .click();
  await choices()
    .getByRole("button", { name: "Block personal account", exact: true })
    .waitFor();
  page.once("dialog", (d) => {
    assert.match(d.message(), /signed out/);
    return d.accept();
  });
  await choices()
    .getByRole("button", { name: "Block personal account", exact: true })
    .click();
  await page.locator(".gc-post").waitFor({state:"detached"});
  assert.ok(
    !(await page.locator("body").innerText()).includes(
      "Relationship visible source"
    )
  );
  ok(
    "Account change clears controls; church follow grants no membership; personal block confirms limits and removes canonical post projection"
  );
  await bounded();
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/receipt.json",
    JSON.stringify(
      {
        results,
        pageErrors: errors,
        actor: f.memberA.id,
        target: f.memberB.id
      },
      null,
      2
    )
  );
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
