import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const fixture = process.argv[2];
assert.ok(fixture, "Pass the owned isolated fixture directory");
Object.assign(
  process.env,
  JSON.parse(readFileSync(fixture + "/environment.json", "utf8"))
);
const origin = process.env.ACCOUNT_ORIGIN;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
const { PrismaClient } = await import("@prisma/client");
const { createPortalActor, assertPortalTestDatabase } =
  await import("../tests/seed-portal.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ??
    `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`
)("playwright");
const publicKey = execFileSync("openssl", [
  "x509",
  "-in",
  fixture + "/localhost-cert.pem",
  "-pubkey",
  "-noout"
]);
const der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], {
  input: publicKey
});
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: [
    "--ignore-certificate-errors-spki-list=" +
      createHash("sha256").update(der).digest("base64"),
    "--no-proxy-server"
  ]
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }
});
context.setDefaultTimeout(15000);
await context.route("**/*", (route) =>
  new URL(route.request().url()).hostname === "127.0.0.1"
    ? route.continue()
    : route.abort()
);
const page = await context.newPage(),
  errors = [],
  results = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
const output = fixture + "/browser-" + Date.now();
mkdirSync(output, { recursive: true });
const ok = (label) => {
  results.push(label);
  console.log("PASS " + label);
};
const wait = async (fn) => {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Expected saved state was not observed");
};
const go = async (path) => {
  if (page.url().startsWith(origin))
    await page.waitForFunction(() => !window.history.state?.gcPhotoWork);
  const response = await page.goto(origin + path);
  assert.equal(response.status(), 200);
  await page.waitForLoadState("networkidle");
  return response;
};
const signIn = async (actor) => {
  await context.clearCookies();
  if (actor)
    await context.addCookies([
      {
        name: "church_platform_session",
        value: actor.token,
        url: origin,
        secure: true,
        httpOnly: true,
        sameSite: "Lax"
      }
    ]);
};
const button = (name) => page.getByRole("button", { name, exact: true });
const bounds = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal overflow"
  );
try {
  const actor = await createPortalActor(db, "cardsbrowser"),
    other = await createPortalActor(db, "cardsother");
  const makeListing = (title) =>
    db.exchangeListing.create({
      data: {
        ownerId: actor.id,
        creatorId: actor.id,
        state: "ACTIVE",
        title,
        description: "Entirely fictional browser source",
        category: "BOOKS",
        condition: "GOOD",
        country: "US",
        placeId: 4887398,
        placeLabel: "Chicago",
        itemPolicy: "exchange-listings-v3",
        confirmedAt: new Date(),
        publishedAt: new Date()
      }
    });
  const first = await makeListing(
    "Fictional current resource A " + randomUUID()
  );
  const second = await makeListing(
    "Fictional current resource B " + randomUUID()
  );
  const third = await makeListing("Fictional late resource C " + randomUUID());
  await signIn(actor);
  await go("/platform");
  await button("Share what's on your heart").click();
  const form = page.getByRole("form", { name: "Publish post" });
  await form
    .getByLabel("Post content", { exact: true })
    .fill("Initial fictional browser draft");
  await form
    .getByLabel("Resource page link", { exact: true })
    .fill(origin + "/platform/exchange/" + first.id);
  await form
    .getByRole("button", { name: "Add resource card", exact: true })
    .click();
  await form
    .getByRole("button", { name: "Remove resource card 1", exact: true })
    .waitFor();
  await form.getByText("Listing: " + first.title, { exact: false }).waitFor();
  await bounds();
  await page.screenshot({
    path: output + "/composer-mobile.png",
    fullPage: true
  });
  ok(
    "Mobile composer attaches a current resource with accessible remove controls and no overflow"
  );

  await form
    .getByLabel("Resource page link", { exact: true })
    .fill("https://external.example/platform/exchange/" + first.id);
  await form
    .getByRole("button", { name: "Add resource card", exact: true })
    .click();
  await form
    .getByText(
      "Copy a listing, event or opportunity page link from this website.",
      { exact: true }
    )
    .waitFor();
  await form
    .getByLabel("Resource page link", { exact: true })
    .fill(origin + "/platform/exchange/" + first.id);
  await form
    .getByRole("button", { name: "Add resource card", exact: true })
    .click();
  await form
    .getByText("That resource is already attached.", { exact: true })
    .waitFor();
  ok("Chooser rejects external and duplicate links without changing the draft");

  let releaseAdd,
    heldAdd = false;
  const pauseAdd = new Promise((resolve) => {
    releaseAdd = resolve;
  });
  const addRoute = async (route) => {
    if (
      new URL(route.request().url()).searchParams
        .get("references")
        .includes(second.id)
    ) {
      heldAdd = true;
      await pauseAdd;
    }
    await route.continue();
  };
  await context.route("**/api/platform/post-resources?*", addRoute);
  await form
    .getByLabel("Resource page link", { exact: true })
    .fill(origin + "/platform/exchange/" + second.id);
  await form
    .getByRole("button", { name: "Add resource card", exact: true })
    .click();
  await wait(() => heldAdd);
  const content =
    "Newer fictional text while resource check waits " + randomUUID();
  await form.getByLabel("Post content", { exact: true }).fill(content);
  releaseAdd();
  await form
    .getByRole("button", { name: "Remove resource card 2", exact: true })
    .waitFor();
  assert.equal(
    await form.getByLabel("Post content", { exact: true }).inputValue(),
    content
  );
  await context.unroute("**/api/platform/post-resources?*", addRoute);
  ok(
    "A delayed Add preserves newer post text instead of restoring a captured draft"
  );

  let releaseLate,
    heldLate = false;
  const pauseLate = new Promise((resolve) => {
    releaseLate = resolve;
  });
  const lateRoute = async (route) => {
    if (
      new URL(route.request().url()).searchParams
        .get("references")
        .includes(third.id)
    ) {
      const response = await route.fetch();
      heldLate = true;
      await pauseLate;
      await route.fulfill({ response });
    } else await route.continue();
  };
  await context.route("**/api/platform/post-resources?*", lateRoute);
  await form
    .getByLabel("Resource page link", { exact: true })
    .fill(origin + "/platform/exchange/" + third.id);
  await form
    .getByRole("button", { name: "Add resource card", exact: true })
    .click();
  await wait(() => heldLate);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  releaseLate();
  await page.waitForTimeout(350);
  assert.equal(
    await page
      .getByRole("button", { name: "Remove resource card 3", exact: true })
      .count(),
    0
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await form.getByLabel("Post content", { exact: true }).waitFor();
  assert.equal(
    await form.getByLabel("Post content", { exact: true }).inputValue(),
    content
  );
  await context.unroute("**/api/platform/post-resources?*", lateRoute);
  ok(
    "Blur invalidates a late authorized Add response and preserves the unfinished draft"
  );
  let releaseChanged,
    heldChanged = false;
  const pauseChanged = new Promise((resolve) => {
    releaseChanged = resolve;
  });
  const changedRoute = async (route) => {
    if (
      new URL(route.request().url()).searchParams
        .get("references")
        .includes(third.id)
    ) {
      const response = await route.fetch();
      heldChanged = true;
      await pauseChanged;
      await route.fulfill({ response });
    } else await route.continue();
  };
  await context.route("**/api/platform/post-resources?*", changedRoute);
  await form
    .getByLabel("Resource page link", { exact: true })
    .fill(origin + "/platform/exchange/" + third.id);
  await form
    .getByRole("button", { name: "Add resource card", exact: true })
    .click();
  await wait(() => heldChanged);
  await page.evaluate(() =>
    window.dispatchEvent(new Event("social-relationships-changed"))
  );
  await wait(() =>
    form
      .getByRole("button", { name: "Add resource card", exact: true })
      .isEnabled()
  );
  releaseChanged();
  await page.waitForTimeout(350);
  assert.equal(
    await form
      .getByRole("button", { name: "Remove resource card 3", exact: true })
      .count(),
    0
  );
  assert.equal(
    await form
      .getByRole("button", { name: "Add resource card", exact: true })
      .isEnabled(),
    true
  );
  await context.unroute("**/api/platform/post-resources?*", changedRoute);
  ok(
    "A relationship change invalidates delayed Add without leaving the chooser busy or accepting its stale response"
  );
  await form.getByLabel("Resource page link", { exact: true }).fill("");
  if (
    await form
      .getByRole("button", { name: "Save draft", exact: true })
      .isEnabled()
  )
    await form.getByRole("button", { name: "Save draft", exact: true }).click();
  let saved;
  await wait(async () => {
    saved = await db.privatePostDraft.findFirst({
      where: { ownerId: actor.id, deletedAt: null },
      orderBy: { updatedAt: "desc" }
    });
    return (
      saved?.payload?.content === content &&
      saved.payload.resourceReferences?.length === 2
    );
  });
  await wait(() =>
    form.getByRole("button", { name: "Post", exact: true }).isEnabled()
  );
  await form
    .getByRole("button", { name: "Close composer", exact: true })
    .click();
  await go("/platform/drafts?resume=" + saved.id);
  await form.getByLabel("Post content", { exact: true }).waitFor();
  assert.equal(
    await form.getByLabel("Post content", { exact: true }).inputValue(),
    content
  );
  await form
    .getByRole("button", { name: "Remove resource card 2", exact: true })
    .waitFor();
  await form.getByRole("button", { name: "Post", exact: true }).click();
  let published;
  await wait(async () => {
    published = await db.platformPost.findFirst({
      where: { authorId: actor.id, content }
    });
    return !!published;
  });
  assert.equal(published.resourceReferences.length, 2);
  await page
    .getByRole("button", { name: "Close composer", exact: true })
    .click();
  await go("/platform/posts/" + published.id);
  const cards = page.locator(`[data-resource-cards="${published.id}"]`);
  await cards.scrollIntoViewIfNeeded();
  await cards.getByRole("link", { name: first.title, exact: true }).waitFor();
  await cards.getByRole("link", { name: second.title, exact: true }).waitFor();
  ok(
    "Saved draft resumes and publishes once with ordered current resource cards"
  );

  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await db.exchangeListing.update({
    where: { id: first.id },
    data: { moderationState: "HIDDEN" }
  });
  await page.evaluate(() =>
    window.dispatchEvent(new Event("social-relationships-changed"))
  );
  await page.waitForTimeout(350);
  assert.equal(await cards.getByRole("link").count(), 0);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await cards.getByRole("link", { name: second.title, exact: true }).waitFor();
  assert.equal(
    await cards.getByRole("link", { name: first.title, exact: true }).count(),
    0
  );
  assert.ok((await page.textContent("body")).includes(content));
  ok(
    "Background relationship signals cannot redisplay concealed cards; focus rechecks revocation and keeps the post usable"
  );

  await page.getByText("Edit post", { exact: true }).click();
  const edit = page.locator("#post-edit");
  await edit
    .getByRole("button", { name: "Remove resource card 1", exact: true })
    .click();
  await edit
    .getByRole("button", { name: "Save post changes", exact: true })
    .click();
  await wait(
    async () =>
      (await db.platformPost.findUnique({ where: { id: published.id } }))
        .resourceReferences.length === 1
  );
  await page.reload();
  await page.waitForLoadState("networkidle");
  assert.ok((await page.textContent("body")).includes("Edited"));
  const edited = await db.platformPost.findUniqueOrThrow({
    where: { id: published.id }
  });
  assert.ok(edited.editedAt);
  assert.equal(edited.version, published.version + 1);
  ok(
    "Attachment removal uses the existing versioned post edit and Edited marker"
  );

  await signIn(other);
  await go("/platform/posts/" + published.id);
  const otherCards = page.locator(`[data-resource-cards="${published.id}"]`);
  await otherCards.scrollIntoViewIfNeeded();
  await otherCards
    .getByRole("link", { name: second.title, exact: true })
    .waitFor();
  await db.exchangeListing.update({
    where: { id: second.id },
    data: { state: "ARCHIVED" }
  });
  await page.evaluate(() =>
    window.dispatchEvent(new Event("social-relationships-changed"))
  );
  await wait(async () => (await otherCards.getByRole("link").count()) === 0);
  assert.ok((await page.textContent("body")).includes(content));
  await bounds();
  await page.screenshot({
    path: output + "/unavailable-source-mobile.png",
    fullPage: true
  });
  ok(
    "A different reader loses an archived source card without losing the original post"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify({ passed: results.length, results, errors }, null, 2)
  );
  console.log(JSON.stringify({ output, passed: results.length }));
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(output + "/failure.txt", String(error));
  throw error;
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
