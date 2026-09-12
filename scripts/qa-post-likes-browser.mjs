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
const { createPortalActor, assertPortalTestDatabase } =
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
const output = fixtureDir + "/post-likes-browser";
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

try {
  const owner = await createPortalActor(db, "likebrowser");
  const other = await createPortalActor(db, "likebrowserother");
  const post = await db.platformPost.create({ data: { authorId: owner.id, content: "Fictional browser Like recovery" } });
  await signIn(owner);
  const path = "/platform/posts/" + post.id;
  await go(path);
  const stale = await context.newPage();
  stale.on("pageerror", error => errors.push({ message: error.message }));
  await stale.goto(config.origin + path);
  await stale.getByRole("button", { name: "Like post", exact: true }).waitFor();
  const bodies = [];
  await page.route("**/api/platform/post-likes", async route => {
    if (route.request().method() !== "POST") return route.continue();
    bodies.push(route.request().postData());
    if (bodies.length === 1) { await route.fetch(); return route.abort("failed"); }
    return route.continue();
  });
  await page.getByRole("button", { name: "Like post", exact: true }).click();
  const retry = page.getByRole("button", { name: "Retry same Like choice", exact: true });
  await retry.waitFor();
  await page.setViewportSize({ width: 320, height: 640 }); await bounded();
  await page.screenshot({ path: output + "/retry-320.png", fullPage: true });
  await retry.click();
  await page.getByRole("button", { name: "Unlike post", exact: true }).waitFor();
  assert.equal(bodies.length, 2); assert.equal(bodies[0], bodies[1]);
  let saved = await db.platformPostLike.findUniqueOrThrow({ where: { postId_userId: { postId: post.id, userId: owner.id } } });
  assert.equal(saved.active, true); assert.equal(saved.version, 1);
  await page.unroute("**/api/platform/post-likes");
  ok("Lost Like acknowledgement retains and retries identical bytes once; the confirmed state remains liked");

  await stale.getByRole("button", { name: "Like post", exact: true }).click();
  await stale.getByRole("button", { name: "Refresh Like status", exact: true }).click();
  await stale.getByRole("button", { name: "Unlike post", exact: true }).click();
  await stale.getByRole("button", { name: "Like post", exact: true }).waitFor();
  saved = await db.platformPostLike.findUniqueOrThrow({ where: { id: saved.id } });
  assert.equal(saved.active, false); assert.equal(saved.version, 2);
  ok("A stale tab must refresh before a deliberate Unlike; the tombstone retains version2");
  await stale.close();

  await context.clearCookies(); await signIn(other);
  const before = await db.platformPostLike.count({ where: { userId: other.id } });
  await page.getByRole("button", { name: "Unlike post", exact: true }).click();
  await page.getByText("Your sign-in changed. Reload before continuing.", { exact: true }).waitFor();
  assert.equal(await db.platformPostLike.count({ where: { userId: other.id } }), before);
  ok("Account replacement cannot replay the old account's Like choice under a new identity");
  await context.clearCookies(); await go(path);
  await page.getByRole("link", { name: "Sign in to like this post", exact: true }).waitFor();
  for (const width of [320, 390]) { await page.setViewportSize({ width, height: 844 }); await bounded(); }
  ok("Guest entry remains explicit and Like controls fit narrow screens");
  assert.deepEqual(errors, []);
  writeFileSync(output + "/RESULT.json", JSON.stringify({ passed: results, errors, isolated: true }, null, 2));
} finally { await browser.close(); await db.$disconnect(); }
