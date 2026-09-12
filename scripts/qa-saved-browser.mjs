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
const output = fixtureDir + "/saved-browser";
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
const { postWorkspaceCommand: command } =
  await import("../lib/platform/post-workspace.ts");
const change = (token, operation, fields) =>
  command(db, token, { operation, mutationId: randomUUID(), ...fields });
try {
  const f = await seedPortal(db);
  const post = await db.platformPost.create({
    data: {
      authorId: f.memberB.id,
      content: "Saved browser source marker",
      publishedAt: new Date()
    }
  });
  await go("/platform/posts/" + post.id);
  await page.getByText("Save post", { exact: true }).click();
  await page
    .getByRole("link", { name: "Sign in to save this post", exact: true })
    .waitFor();
  const href = await page
    .getByRole("link", { name: "Sign in to save this post", exact: true })
    .getAttribute("href");
  assert.equal(
    new URL(href, config.origin).searchParams.get("next"),
    "/platform/posts/" + post.id
  );
  await signIn(f.memberA);
  await go("/platform/posts/" + post.id);
  await page.getByText("Save post", { exact: true }).click();
  const bodies = [];
  let lose = true;
  await page.route("**/api/platform/post-workspace", async (route) => {
    const body = route.request().postData();
    if (body && JSON.parse(body).operation === "save-item") {
      bodies.push(body);
      const response = await route.fetch();
      if (lose) {
        lose = false;
        await route.abort("failed");
      } else await route.fulfill({ response });
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Save privately", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Retry same save choice", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove from saved", exact: true })
    .waitFor();
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  await page.unroute("**/api/platform/post-workspace");
  assert.equal(
    await db.savedPostItem.count({
      where: { ownerId: f.memberA.id, postId: post.id }
    }),
    1
  );
  ok("Guest safe return and canonical save with exact lost-response retry");
  await page
    .getByRole("link", { name: "Manage saved collections", exact: true })
    .click();
  const name = () =>
    page.getByRole("textbox", { name: "Collection name", exact: true });
  await name().fill("Private reading");
  await page
    .getByRole("button", { name: "Create collection", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Private reading", exact: true })
    .waitFor();
  let collection = await db.savedPostCollection.findFirstOrThrow({
    where: { ownerId: f.memberA.id, name: "Private reading" }
  });
  const item = () => page.locator("[data-saved-id]").first();
  await item().getByRole("combobox").selectOption(collection.id);
  await item()
    .getByRole("button", { name: "Move saved post", exact: true })
    .click();
  await page.getByText("Private changes saved.", { exact: true }).waitFor();
  assert.equal(
    (
      await db.savedPostItem.findFirstOrThrow({
        where: { ownerId: f.memberA.id, postId: post.id }
      })
    ).collectionId,
    collection.id
  );
  await page
    .locator('[data-collection-id="' + collection.id + '"]')
    .getByRole("button", { name: "Rename", exact: true })
    .click();
  await name().fill("My unsent rename");
  await change(f.memberA.token, "rename-collection", {
    id: collection.id,
    expectedVersion: collection.version,
    name: "Other session name"
  });
  await page
    .getByRole("button", { name: "Save collection name", exact: true })
    .click();
  await page.getByText("Your name is preserved.", { exact: false }).waitFor();
  assert.equal(await name().inputValue(), "My unsent rename");
  await page
    .getByRole("button", { name: "Refresh saved posts", exact: true })
    .click();
  await page
    .getByText("Saved name: Other session name", { exact: true })
    .waitFor();
  assert.equal(await name().inputValue(), "My unsent rename");
  await page
    .getByRole("button", { name: "Use saved collection name", exact: true })
    .click();
  await name().fill("Final name");
  await page
    .getByRole("button", { name: "Save collection name", exact: true })
    .click();
  await page.getByRole("link", { name: "Final name", exact: true }).waitFor();
  await name().fill("x".repeat(81));
  assert.equal(
    await page
      .getByRole("button", { name: "Create collection", exact: true })
      .isDisabled(),
    true
  );
  await page
    .getByRole("button", { name: "Cancel name changes", exact: true })
    .click();
  ok(
    "Collection create, move, name length, version conflict and explicit resolution preserve unsent name"
  );
  await page.getByRole("link", { name: "Final name", exact: true }).click();
  await page.waitForURL("**collectionId=" + collection.id);
  await page
    .getByRole("link", { name: "Open saved post", exact: true })
    .waitFor();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Delete collection", exact: true })
    .click();
  await page.waitForURL("**collectionId=unfiled");
  await page
    .getByRole("link", { name: "Open saved post", exact: true })
    .waitFor();
  assert.equal(
    (
      await db.savedPostItem.findFirstOrThrow({
        where: { ownerId: f.memberA.id, postId: post.id }
      })
    ).collectionId,
    null
  );
  await db.platformPost.update({
    where: { id: post.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  await page
    .getByRole("button", { name: "Refresh saved posts", exact: true })
    .click();
  await page.getByText("Saved post unavailable", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByText("Saved browser source marker", { exact: true })
      .count(),
    0
  );
  assert.equal(
    await page
      .getByRole("link", { name: "Open saved post", exact: true })
      .count(),
    0
  );
  await item()
    .getByRole("button", { name: "Remove saved post", exact: true })
    .click();
  await page
    .getByText("No saved posts in this view.", { exact: true })
    .waitFor();
  ok(
    "Deleting selected collection preserves unfiled bookmark; withdrawn source is neutral and removable"
  );
  for (let i = 0; i < 25; i++) {
    const p = await db.platformPost.create({
      data: {
        authorId: f.memberB.id,
        content: "Pagination saved " + i,
        publishedAt: new Date()
      }
    });
    await change(f.memberA.token, "save-item", {
      postId: p.id,
      expectedVersion: 0
    });
  }
  await go("/platform/saved");
  await page
    .getByRole("link", { name: "More saved posts", exact: true })
    .waitFor();
  const first = await page
    .locator("[data-saved-id]")
    .evaluateAll((es) => es.map((e) => e.dataset.savedId));
  assert.equal(first.length, 20);
  await page
    .getByRole("link", { name: "More saved posts", exact: true })
    .click();
  await page.waitForURL("**after=*");
  await page.waitForFunction(
    () => document.querySelectorAll("[data-saved-id]").length === 5
  );
  const last = await page
    .locator("[data-saved-id]")
    .evaluateAll((es) => es.map((e) => e.dataset.savedId));
  assert.equal(new Set([...first, ...last]).size, 25);
  await page.goBack();
  await page
    .getByRole("link", { name: "More saved posts", exact: true })
    .waitFor();
  assert.equal(await page.locator("[data-saved-id]").count(), 20);
  await name().fill("Unsent owner name");
  await signIn(f.memberB);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await page
    .getByText("No saved posts in this view.", { exact: true })
    .waitFor();
  assert.equal(await name().inputValue(), "");
  await bounded();
  ok(
    "Saved cursor pagination and Back retain context; account change clears private rows and input"
  );
  await name().fill("Retry collection");
  const createBodies = [];
  let loseCreate = true;
  await page.route("**/api/platform/post-workspace", async (route) => {
    const body = route.request().postData();
    if (body && JSON.parse(body).operation === "create-collection") {
      createBodies.push(body);
      const response = await route.fetch();
      if (loseCreate) {
        loseCreate = false;
        await route.abort("failed");
      } else await route.fulfill({ response });
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Create collection", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Retry same private change", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Retry collection", exact: true })
    .waitFor();
  assert.equal(createBodies.length, 2);
  assert.equal(createBodies[0], createBodies[1]);
  await page.unroute("**/api/platform/post-workspace");
  for (let i = 0; i < 24; i++)
    await change(f.memberB.token, "create-collection", {
      id: randomUUID(),
      expectedVersion: 0,
      name: "Extra collection " + i
    });
  await page
    .getByRole("button", { name: "Refresh saved posts", exact: true })
    .click();
  await page
    .getByRole("button", { name: "More collections", exact: true })
    .waitFor();
  assert.equal(await page.locator("[data-collection-id]").count(), 20);
  await page
    .getByRole("button", { name: "More collections", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll("[data-collection-id]").length === 25
  );
  ok(
    "Collection creation retries its exact body and collection pagination returns 25 unique rows"
  );
  const fresh = await db.platformPost.create({
    data: {
      authorId: f.memberA.id,
      content: "Concurrent saved source",
      publishedAt: new Date()
    }
  });
  await go("/platform/posts/" + fresh.id);
  await page.getByText("Save post", { exact: true }).click();
  await page
    .getByRole("button", { name: "Save privately", exact: true })
    .waitFor();
  await change(f.memberB.token, "save-item", {
    postId: fresh.id,
    expectedVersion: 0
  });
  await page
    .getByRole("button", { name: "Save privately", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Refresh saved status", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove from saved", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Remove from saved", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save privately", exact: true })
    .waitFor();
  assert.equal(
    await db.savedPostItem.count({
      where: { ownerId: f.memberB.id, postId: fresh.id }
    }),
    0
  );
  await db.platformPost.update({
    where: { id: fresh.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  await page
    .getByRole("button", { name: "Save privately", exact: true })
    .click();
  await page
    .getByText("Concurrent saved source", { exact: true })
    .waitFor({ state: "detached" });
  assert.equal(
    await db.savedPostItem.count({
      where: { ownerId: f.memberB.id, postId: fresh.id }
    }),
    0
  );
  ok(
    "Concurrent save refreshes canonical version, remove deletes only bookmark, and revoked source cannot be saved"
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
