import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
const fixtureDir = process.argv[2];
assert.ok(
  fixtureDir,
  "Pass the existing isolated following-list preview directory"
);
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(
  config.origin,
  /^https:\/\/(?:following-fixture\.example\.test|127\.0\.0\.1):\d+$/
);
const localOrigin = config.localOrigin ?? config.origin;
assert.match(localOrigin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: localOrigin,
  NEXT_PUBLIC_SITE_URL: localOrigin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + fixtureDir + "/sink",
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: "",
  PRIVILEGED_MFA_MODE: "enroll",
  COMMUNITY_REPORTS_ENABLED: "true",
  BLOB_READ_WRITE_TOKEN: "",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  MEDIA_STORAGE_MODE: "local-test",
  RETENTION_TEST_DIR: process.cwd() + "/" + fixtureDir + "/retention",
  MEDIA_TEST_DIR: process.cwd() + "/" + fixtureDir + "/images"
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
      createHash("sha256").update(der).digest("base64"),
    "--host-resolver-rules=MAP following-fixture.example.test 127.0.0.1",
    "--no-proxy-server"
  ]
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true
});
await context.route("**/*", (route) =>
  new URL(route.request().url()).origin === config.origin
    ? route.continue()
    : route.abort()
);
const page = await context.newPage(),
  errors = [],
  results = [],
  output = fixtureDir + "/following-lists-browser-" + Date.now();
mkdirSync(output, { recursive: true });
page.on("pageerror", (e) =>
  errors.push({ path: new URL(page.url()).pathname, message: e.message })
);
page.on("dialog", (dialog) => dialog.accept());
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const go = async (path) => {
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
  return response;
};
const signIn = async (actor) => {
  await context.clearCookies();
  if (actor)
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
const bounded = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal page overflow"
  );
const waitUntil = async (work) => {
  for (let i = 0; i < 80; i++) {
    if (await work()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Expected saved state was not observed");
};
const exact = (name) => page.getByRole("button", { name, exact: true });
const resume = () =>
  page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
try {
  const owner = await createPortalActor(db, "listbrowser"),
    person = await createPortalActor(db, "listperson"),
    other = await createPortalActor(db, "listother");
  const { readFollowingLists } =
    await import("../lib/platform/following-lists.ts");
  const { relationshipCommand } =
    await import("../lib/platform/relationships.ts");
  await db.platformFollow.createMany({
    data: [person, other].map((p) => ({
      followerId: owner.id,
      followingId: p.id
    }))
  });
  const church = await db.church.create({
    data: {
      name: "Fictional reading church " + randomUUID().slice(0, 8),
      slug: "list-browser-" + randomUUID(),
      summary: "Fixture",
      communityListed: true
    }
  });
  await db.socialRelationship.create({
    data: { ownerId: owner.id, churchId: church.id, followingChurch: true }
  });
  const marker = randomUUID().slice(0, 8),
    privateName = "My private circle " + marker,
    renamed = "Quiet reading circle " + marker;
  for (const [author, content] of [
    [person, "Listed person " + marker],
    [other, "Other follow " + marker]
  ])
    await db.platformPost.create({
      data: {
        authorId: author.id,
        content,
        publishedAt: new Date(Date.now() - 1000)
      }
    });
  await db.platformPost.create({
    data: {
      authorId: person.id,
      authorChurchId: church.id,
      audienceChurchId: church.id,
      content: "Listed church " + marker,
      publishedAt: new Date(Date.now() - 1000)
    }
  });
  await db.platformPost.create({
    data: {
      authorId: person.id,
      authorChurchId: church.id,
      audienceChurchId: church.id,
      audience: "CHURCH",
      content: "Restricted church " + marker,
      publishedAt: new Date(Date.now() - 1000)
    }
  });
  await signIn(null);
  await go("/platform/relationships/lists?list=unavailable&action=delete");
  assert.ok(!(await page.locator("body").innerText()).includes(privateName));
  const logins = await page
    .locator('a[href*="/platform/login"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  assert.ok(
    logins.some(
      (href) =>
        new URL(href, config.origin).searchParams.get("next") ===
        "/platform/relationships/lists"
    )
  );
  ok(
    "Guest entry preserves only the private list destination and exposes no account choices"
  );

  await signIn(owner);
  await go("/platform/relationships/lists");
  await page.getByLabel("Private list name", { exact: true }).fill(privateName);
  let originalBody,
    lost = false;
  await page.route("**/api/platform/following-lists", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    if (!lost) {
      lost = true;
      originalBody = route.request().postData();
      const response = await route.fetch({
        url: localOrigin + new URL(route.request().url()).pathname
      });
      assert.equal(response.status(), 200, await response.text());
      return route.abort("failed");
    }
    assert.equal(route.request().postData(), originalBody);
    return route.continue();
  });
  await exact("Create private list").click();
  await exact("Confirm original save").waitFor();
  await resume();
  await exact("Confirm original save").click();
  await page.waitForURL("**/platform/relationships/lists?list=*");
  await page.unroute("**/api/platform/following-lists");
  const initial = await readFollowingLists(db, owner.token),
    id = initial.lists[0].id;
  assert.equal(initial.lists.length, 1);
  assert.equal(
    await db.socialOperation.count({
      where: { ownerId: owner.id, key: { startsWith: "following-lists:" } }
    }),
    1
  );
  await page.getByLabel("Private list name", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Private list name", { exact: true }).inputValue(),
    privateName
  );
  ok(
    "Lost successful create survives tab recheck and exact confirmation with one private list and receipt"
  );

  await exact("Save private list").waitFor();
  await page
    .getByRole("button", {
      name: `Add ${person.name} to this list`,
      exact: true
    })
    .click();
  await page
    .getByRole("combobox", { name: /Followed accounts/ })
    .selectOption("church");
  await page
    .getByRole("button", {
      name: `Add ${church.name} to this list`,
      exact: true
    })
    .click();
  await page.getByLabel("Private list name", { exact: true }).fill(renamed);
  await page
    .getByRole("link", { name: "Back to connections", exact: true })
    .click();
  assert.equal(new URL(page.url()).pathname, "/platform/relationships/lists");
  await page
    .getByText("Save or resolve your private choice before leaving.", {
      exact: true
    })
    .waitFor();
  await exact("Save private list").click();
  await page.waitForLoadState("load");
  await waitUntil(
    async () =>
      (await readFollowingLists(db, owner.token, { listId: id })).list?.name ===
      renamed
  );
  await go("/platform/relationships/lists?list=" + id);
  await exact("Use this list in Following").waitFor();
  const saved = await readFollowingLists(db, owner.token, { listId: id });
  assert.equal(saved.list.members.length, 2);
  assert.equal(saved.list.name, renamed);
  await bounded();
  await page.screenshot({ path: output + "/lists-mobile.png", fullPage: true });
  ok(
    "Atomic name and membership editing retains selections across picker changes and prevents unsaved link navigation"
  );

  await page.emulateMedia({ colorScheme: "dark" });
  await page.addStyleTag({ content: "html{font-size:24px!important}" });
  await bounded();
  await page.screenshot({
    path: output + "/lists-enlarged-dark.png",
    fullPage: true
  });
  await exact("Use this list in Following").click();
  await page.waitForURL("**/platform?feed=following");
  const selector = page.getByRole("combobox", {
    name: "Choose private following list",
    exact: true
  });
  await selector.waitFor();
  assert.equal(await selector.inputValue(), id);
  await page
    .getByRole("group", { name: "Feed view", exact: true })
    .getByRole("button", { name: "List", exact: true })
    .click();
  await page
    .getByText("Listed person " + marker, { exact: true })
    .first()
    .waitFor();
  await page
    .getByText("Listed church " + marker, { exact: true })
    .first()
    .waitFor();
  assert.ok(
    !(await page.locator("body").innerText()).includes("Other follow " + marker)
  );
  assert.ok(
    !(await page.locator("body").innerText()).includes(
      "Restricted church " + marker
    )
  );
  await bounded();
  await selector.selectOption("");
  await page
    .getByText("Other follow " + marker, { exact: true })
    .first()
    .waitFor();
  await selector.selectOption(id);
  await waitUntil(
    async () =>
      !(await page.locator("body").innerText()).includes(
        "Other follow " + marker
      )
  );
  ok(
    "Enlarged dark mobile editor fits; the built Following selector uses current personal and church entries while audience checks remain restrictive"
  );

  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal(await selector.isVisible(), false);
  await signIn(other);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByText(/Your sign-in changed/)
    .first()
    .waitFor();
  assert.equal(await selector.isVisible(), false);
  assert.ok(!(await page.locator("body").innerText()).includes(renamed));
  ok(
    "A switched account cannot reopen the previous private list names in the feed selector"
  );

  await signIn(owner);
  await go("/platform/relationships/lists?list=" + id);
  const name = page.getByLabel("Private list name", { exact: true });
  await name.fill("Retained local edit " + marker);
  const priorVersion = (await readFollowingLists(db, owner.token)).version;
  await db.platformUser.update({
    where: { id: person.id },
    data: { suspendedAt: new Date() }
  });
  await resume();
  await page
    .getByText(
      "Your saved lists or follows changed. Your local entries are retained and concealed. Confirm any original save, then reload to review current choices.",
      { exact: true }
    )
    .waitFor();
  assert.equal(
    (await readFollowingLists(db, owner.token)).version,
    priorVersion
  );
  assert.equal(await name.isVisible(), false);
  assert.ok(!(await page.locator("body").innerText()).includes(person.name));
  await db.platformUser.update({
    where: { id: person.id },
    data: { suspendedAt: null }
  });
  await resume();
  await name.waitFor();
  assert.equal(await name.inputValue(), "Retained local edit " + marker);
  ok(
    "A changed account's availability conceals retained member identities even when the saved list version is unchanged"
  );
  await relationshipCommand(db, owner.token, {
    operation: "block",
    kind: "person",
    targetId: person.id,
    desired: true,
    expectedVersion: 0,
    mutationId: randomUUID()
  });
  await resume();
  await page
    .getByText(
      "Your saved lists or follows changed. Your local entries are retained and concealed. Confirm any original save, then reload to review current choices.",
      { exact: true }
    )
    .waitFor();
  assert.equal(await name.isVisible(), false);
  assert.ok(!(await page.locator("body").innerText()).includes(person.name));
  assert.equal(await name.inputValue(), "Retained local edit " + marker);
  await exact("Reload current lists").click();
  await page.getByLabel("Private list name", { exact: true }).waitFor();
  assert.equal(
    (await readFollowingLists(db, owner.token, { listId: id })).list.members
      .length,
    1
  );
  ok(
    "Current block removes the entry and conceals stale editor content while retaining a local draft until deliberate reload"
  );

  const followingBefore = await db.platformFollow.count({
    where: { followerId: owner.id }
  });
  const churchBefore = await db.socialRelationship.count({
    where: { ownerId: owner.id, followingChurch: true }
  });
  await exact("Delete list").click();
  await exact("Confirm delete list").click();
  await page.waitForURL("**/platform/relationships/lists");
  await page
    .getByText(
      "The selected list was deleted. Choose another list or All following before opening Following.",
      { exact: true }
    )
    .waitFor();
  assert.equal(
    await db.platformFollow.count({ where: { followerId: owner.id } }),
    followingBefore
  );
  assert.equal(
    await db.socialRelationship.count({
      where: { ownerId: owner.id, followingChurch: true }
    }),
    churchBefore
  );
  await go("/platform?feed=following");
  await page
    .getByText(
      "Your selected private list was deleted. Choose another list or All following in Private following lists.",
      { exact: true }
    )
    .waitFor();
  await page
    .getByRole("link", { name: "Private following lists", exact: true })
    .click();
  await exact("Use All following").click();
  await page.waitForURL("**/platform?feed=following");
  await selector.waitFor();
  assert.equal(await selector.inputValue(), "");
  ok(
    "Deleting the selected list preserves personal and church follows and requires a deliberate new feed choice"
  );
  assert.deepEqual(errors, []);
} catch (error) {
  console.error("FAILED", page.url(), error);
  writeFileSync(
    output + "/failure.txt",
    await page
      .locator("body")
      .innerText()
      .catch(() => "")
  );
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      { at: new Date().toISOString(), results, errors, productionWrites: 0 },
      null,
      2
    )
  );
  console.log("ARTIFACTS " + output);
  await browser.close();
  await db.$disconnect();
}
