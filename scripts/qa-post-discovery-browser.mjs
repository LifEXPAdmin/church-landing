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
  hasTouch: true,
  viewport: { width: 390, height: 844 }
});
const page = await context.newPage();
let phase = "initial";
const errors = [];
page.on("pageerror", (e) => {
  const issue = {
    phase,
    path: new URL(page.url()).pathname,
    message: e.message,
    stack: e.stack
  };
  errors.push(issue);
  console.log("BROWSER_ERROR", JSON.stringify(issue));
});
const results = [];
const ok = (s) => {
  results.push(s);
  console.log("PASS " + s);
};
const output = fixtureDir + "/post-discovery-browser-" + Date.now();
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

const { createPortalActor } = await import("../tests/seed-portal.ts");
const { randomUUID } = await import("node:crypto");
const signIn = (actor) =>
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
const form = () =>
  page.getByRole("form", { name: "Publish post", exact: true });
const field = () => form().getByLabel("Post content", { exact: true });
const save = async () => {
  const button = form().getByRole("button", {
    name: "Save draft",
    exact: true
  });
  if (await button.isEnabled()) await button.click();
};
const saved = () =>
  page.waitForFunction(() =>
    document
      .querySelector('form[aria-label="Publish post"]')
      ?.textContent.includes("Saved privately.")
  );
const waitDb = async (query) => {
  const deadline = Date.now() + 20000;
  while (!(await query())) {
    if (Date.now() > deadline)
      throw Error("Expected isolated state did not arrive");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};
const openChoices = async (scope) => {
  const details = scope
    .locator("details")
    .filter({
      has: page.locator("summary", { hasText: "Optional discovery choices" })
    })
    .first();
  if (!(await details.evaluate((node) => node.open)))
    await details.locator(":scope > summary").click();
};
page.setDefaultTimeout(25000);
let actor;
try {
  actor = await createPortalActor(db, "postdiscoverybrowser");
  await signIn(actor);
  const marker = "Fictional post discovery " + randomUUID();
  phase = "draft-without-public-consent";
  await go("/platform?feed=latest");
  await page.locator("#compose-post").click();
  await field().waitFor();
  await field().fill(marker);
  await openChoices(form());
  await form().getByLabel("Post language", { exact: true }).selectOption("en");
  await form()
    .getByLabel("Optional denomination or tradition for this post", {
      exact: true
    })
    .fill("My explicit tradition");
  await form().getByLabel("Country", { exact: true }).selectOption("US");
  await form()
    .getByLabel("Find a town or area", { exact: true })
    .fill("Chicago");
  await form().getByRole("button", { name: "Find area", exact: true }).click();
  await form()
    .getByRole("button", { name: "Chicago, Illinois, US", exact: true })
    .click();
  const consent = () =>
    form().getByRole("checkbox", {
      name: /I choose to share this broad country or town/
    });
  assert.equal(await consent().isChecked(), false);
  await save();
  await saved();
  const draft = await db.privatePostDraft.findFirstOrThrow({
    where: { ownerId: actor.id, deletedAt: null }
  });
  assert.equal(draft.payload.discovery.shareLocality, false);
  assert.equal(draft.payload.discovery.country, "US");
  assert.ok(draft.payload.discovery.placeId);
  assert.equal(draft.payload.discovery.language, "en");
  await form().getByRole("button", { name: "Post", exact: true }).click();
  await form()
    .getByText(/Confirm sharing the broad locality/)
    .waitFor();
  assert.equal(
    await db.platformPost.count({ where: { authorId: actor.id } }),
    0
  );
  assert.equal(await field().inputValue(), marker);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "20px";
  });
  await bounded();
  for (const name of ["Save draft", "Post"]) {
    const box = await form()
      .getByRole("button", { name, exact: true })
      .boundingBox();
    assert.ok(
      box && box.y >= 0 && box.y + box.height <= 568 && box.height >= 44
    );
  }
  await form().screenshot({ path: output + "/unconfirmed-locality.png" });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.setViewportSize({ width: 390, height: 844 });
  ok(
    "Optional author classification survives a private draft without public locality consent; publication is blocked without losing entries"
  );
  phase = "draft-resume-and-consent";
  await go(`/platform/drafts?resume=${draft.id}#resume`);
  await field().waitFor();
  await openChoices(form());
  assert.equal(await field().inputValue(), marker);
  assert.equal(
    await form().getByLabel("Post language", { exact: true }).inputValue(),
    "en"
  );
  assert.equal(await consent().isChecked(), false);
  await consent().check();
  await save();
  await saved();
  await form().getByLabel("Country", { exact: true }).selectOption("CA");
  assert.equal(await consent().isChecked(), false);
  await consent().check();
  await save();
  await saved();
  const changed = await db.privatePostDraft.findUniqueOrThrow({
    where: { ownerId_id: { ownerId: actor.id, id: draft.id } }
  });
  assert.equal(changed.payload.discovery.country, "CA");
  assert.equal(changed.payload.discovery.placeId, null);
  assert.equal(changed.payload.discovery.shareLocality, true);
  let dropped;
  const bodies = [];
  await page.route("**/api/platform/post-workspace", async (route) => {
    const body = route.request().postData();
    if (body && JSON.parse(body).operation === "publish-draft") {
      bodies.push(body);
      if (!dropped) {
        dropped = body;
        const response = await route.fetch();
        assert.ok([200, 202].includes(response.status()));
        await route.abort("failed");
        return;
      }
    }
    await route.continue();
  });
  await form().getByRole("button", { name: "Post", exact: true }).click();
  await form()
    .getByRole("button", { name: "Retry same request", exact: true })
    .waitFor();
  await form()
    .getByRole("button", { name: "Retry same request", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Write another post", exact: true })
    .waitFor();
  assert.equal(bodies.at(-1), dropped);
  await page.unroute("**/api/platform/post-workspace");
  const published = await db.platformPost.findFirstOrThrow({
    where: { authorId: actor.id }
  });
  assert.equal(
    await db.platformPost.count({ where: { authorId: actor.id } }),
    1
  );
  assert.equal(published.discoveryCountry, "CA");
  assert.equal(published.discoveryLanguage, "en");
  assert.equal(published.discoveryDenomination, "my explicit tradition");
  ok(
    "Resume preserves classification; changing country clears the old town and consent, and lost publication retries create exactly one post"
  );
  phase = "canonical-edit-clear";
  await go(`/platform/posts/${published.id}#post-edit`);
  const editor = () =>
    page.getByRole("form", { name: "Save post changes", exact: true });
  await editor().getByLabel("Post content", { exact: true }).waitFor();
  await openChoices(editor());
  assert.equal(
    await editor().getByLabel("Country", { exact: true }).inputValue(),
    "CA"
  );
  await editor()
    .getByRole("button", { name: "Clear post locality", exact: true })
    .click();
  await editor().getByLabel("Post language", { exact: true }).selectOption("");
  await editor()
    .getByLabel("Optional denomination or tradition for this post", {
      exact: true
    })
    .fill("");
  let editDropped;
  const editBodies = [];
  await page.route("**/api/platform/posts", async (route) => {
    if (route.request().method() === "POST") {
      editBodies.push(route.request().postData());
      if (!editDropped) {
        editDropped = route.request().postData();
        await route.fetch();
        await route.abort("failed");
        return;
      }
    }
    await route.continue();
  });
  await editor()
    .getByRole("button", { name: "Save post changes", exact: true })
    .click();
  await editor()
    .getByRole("button", { name: "Retry original request", exact: true })
    .waitFor();
  await editor()
    .getByRole("button", { name: "Retry original request", exact: true })
    .click();
  await waitDb(
    async () =>
      (await db.platformPost.findUniqueOrThrow({ where: { id: published.id } }))
        .discoveryCountry === null
  );
  assert.equal(editBodies.at(-1), editDropped);
  await page.unroute("**/api/platform/posts");
  await go(`/platform/posts/${published.id}`);
  assert.ok(
    !(await page.locator(".gc-post").first().textContent()).includes(
      "Author-selected:"
    )
  );
  const cleared = await db.platformPost.findUniqueOrThrow({
    where: { id: published.id }
  });
  assert.equal(cleared.discoveryLanguage, null);
  assert.equal(cleared.discoveryDenomination, null);
  assert.equal(cleared.content, marker);
  assert.equal(
    await db.retentionControl.count({
      where: { sourceId: published.id, kind: "POST_DISCOVERY" }
    }),
    2
  );
  ok(
    "Canonical edit removes optional labels and public locality with exact retry while preserving the post body and protected controls"
  );
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await bounded();
    await page.screenshot({ path: output + `/canonical-${width}.png` });
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      {
        origin: config.origin,
        results,
        errors,
        applicationWrites: "isolated fictional fixtures only",
        physicalDeviceTested: false
      },
      null,
      2
    )
  );
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.json",
    JSON.stringify(
      { phase, message: error.message, stack: error.stack, results, errors },
      null,
      2
    )
  );
  throw error;
} finally {
  if (actor)
    await db.platformPost.updateMany({
      where: { authorId: actor.id },
      data: { status: "WITHDRAWN", withdrawnAt: new Date() }
    });
  await context.close();
  await browser.close();
  await db.$disconnect();
}
