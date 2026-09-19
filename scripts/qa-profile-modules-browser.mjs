import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the isolated profile fixture directory");
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + fixtureDir + "/sink",
  NODE_ENV: "test",
  VERCEL: "",
  PRIVILEGED_MFA_MODE: "off"
});
const { PrismaClient } = await import("@prisma/client");
const { createPortalActor, assertPortalTestDatabase } =
  await import("../tests/seed-portal.ts");
const { updateAccountProfile, loginAccount } =
  await import("../lib/platform/accounts.ts");
const { getProfileEditor } = await import("../lib/platform/profiles.ts");
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
const blockedRequests = [];
await context.route("**/*", (route) => {
  if (new URL(route.request().url()).origin === config.origin)
    return route.continue();
  blockedRequests.push(route.request().url());
  return route.abort();
});
const page = await context.newPage(),
  errors = [],
  results = [];
page.setDefaultTimeout(20000);
page.on("pageerror", (error) => errors.push(error.message));
const output = fixtureDir + "/profile-modules-browser-" + Date.now();
mkdirSync(output, { recursive: true });
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
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
const go = async (path) => {
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
  return response;
};
const submit = () =>
  page.getByRole("button", { name: "Save profile", exact: true }).click();
const row = (actor) =>
  db.profilePresentation.findUniqueOrThrow({ where: { userId: actor.id } });
try {
  const owner = await createPortalActor(db, "modulesbrowser"),
    other = await createPortalActor(db, "modulesvisitor");
  await updateAccountProfile(
    db,
    owner.token,
    {
      name: owner.name,
      bio: "Preserved biography",
      location: "Private location marker",
      locationAudience: "ONLY_ME",
      expectedLocationVersion: 0,
      expectedVersion: 0,
      palette: "warm",
      background: "lines",
      sectionOrder: "posts-first",
      introduction: "Preserved introduction"
    },
    owner.id
  );
  const path = "/platform/profile/" + owner.username;
  const guest = await go(path);
  assert.equal((await guest.text()).includes("Preserved biography"), false);
  await page
    .getByRole("link", { name: "Sign in", exact: true })
    .first()
    .waitFor();
  assert.equal(
    await page.evaluate(
      async () => (await fetch("/api/platform/profile")).status
    ),
    401
  );
  ok("Guest profile and editor API reveal no optional details");

  await signIn(owner);
  await go("/platform/profile/me");
  // No text edits: order alone must engage the existing navigation guard.
  await page
    .getByRole("button", { name: "Move Skills up", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Back to Profile settings", exact: true })
    .click();
  const leave = page.getByRole("dialog", {
    name: "Keep your unsaved changes?",
    exact: true
  });
  await leave.waitFor();
  await leave
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  assert.equal((await row(owner)).modules.order, undefined);
  await page
    .getByRole("button", { name: "Move Skills down", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute("aria-label") === "Move Skills down"
  );
  ok(
    "Order-only edits engage the navigation guard and retain keyboard focus after moving a row down"
  );
  const testimony =
    "Fictional story <img src=x onerror=window.profileInjected=true>";
  await page
    .getByLabel("My testimony (optional)", { exact: true })
    .fill(testimony);
  await page
    .getByLabel("Skills (optional)", { exact: true })
    .fill("Listening\nGardening");
  await page.getByLabel("Link 1 label", { exact: true }).fill("Fictional work");
  await page
    .getByLabel("Link 1 address", { exact: true })
    .fill("https://example.test/work");
  const orderNames = ["Links", "Skills", "My testimony"];
  const visibleOrder = () =>
    page.locator('section[aria-labelledby^="profile-"] > h3').allTextContents();
  await page
    .getByRole("button", { name: "Move Skills up", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute("aria-label") === "Move Skills up"
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Move Skills up", exact: true })
      .getAttribute("aria-disabled"),
    "true"
  );
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: "Move Links up", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move Links up", exact: true })
    .click();
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "Move Links up"
  );
  await page
    .getByRole("button", { name: "Move Skills down", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute("aria-label") === "Move Skills down"
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Move Skills down", exact: true })
      .getAttribute("aria-disabled"),
    "true"
  );
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: "Move Skills up", exact: true })
    .click();
  const orderList = page.getByRole("group", {
    name: "Optional section order",
    exact: true
  });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "32px";
    });
    await orderList.scrollIntoViewIfNeeded();
    assert.ok(
      await orderList.getByRole("button").evaluateAll((buttons) =>
        buttons.every((button) => {
          const range = document.createRange();
          range.selectNodeContents(button);
          return range.getClientRects().length === 1;
        })
      ),
      "Each movement label stays on one line at enlarged text"
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      )
    );
    await page.screenshot({ path: output + "/order-editor-" + width + ".png" });
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await submit();
  await page.waitForURL("**" + path);
  await page
    .getByRole("heading", { name: "My testimony", exact: true })
    .waitFor();
  assert.deepEqual((await row(owner)).modules, {
    testimony,
    order: ["links", "skills", "testimony"],
    skills: ["Listening", "Gardening"],
    links: [{ label: "Fictional work", url: "https://example.test/work" }]
  });
  assert.deepEqual(await visibleOrder(), orderNames);
  await page.reload();
  assert.deepEqual(await visibleOrder(), orderNames);
  assert.equal(await page.getByText(testimony, { exact: true }).count(), 1);
  assert.equal(
    await page.evaluate(() => Boolean(window.profileInjected)),
    false
  );
  assert.equal(await page.locator('img[src="x"], iframe').count(), 0);
  assert.equal(
    await page
      .getByRole("link", { name: "Fictional work", exact: true })
      .getAttribute("rel"),
    "ugc nofollow noreferrer"
  );
  assert.equal((await row(owner)).introduction, "Preserved introduction");
  assert.equal((await row(owner)).sectionOrder, "posts-first");
  assert.equal(
    blockedRequests.length,
    0,
    "Profile links must not be embedded or fetched"
  );
  ok(
    "Owner saves bounded modules through the actual form; text stays inert and existing introduction, order and biography remain"
  );

  await go(path + "?preview=visitor");
  assert.equal((await page.content()).includes(testimony), false);
  await go(path + "?preview=member");
  await page
    .getByRole("heading", { name: "My testimony", exact: true })
    .waitFor();
  assert.deepEqual(await visibleOrder(), orderNames);
  for (const marker of [owner.email, "Private location marker"])
    assert.equal((await page.content()).includes(marker), false);
  await signIn(other);
  const response = await go(path);
  const serialized = await response.text();
  for (const marker of [
    owner.email,
    owner.token,
    "Private location marker",
    '"modulesVersion"'
  ])
    assert.equal(serialized.includes(marker), false);
  await page.getByRole("heading", { name: "Skills", exact: true }).waitFor();
  assert.deepEqual(await visibleOrder(), orderNames);
  assert.equal(
    await page.getByRole("link", { name: "Edit profile", exact: true }).count(),
    0
  );
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "32px";
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      )
    );
    await page.screenshot({
      path: output + "/member-" + width + ".png",
      fullPage: true
    });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
  }
  ok(
    "Member/visitor previews and another account preserve contact privacy, owner-only editing and enlarged phone/desktop layout"
  );

  await signIn(owner);
  await go("/platform/profile/me");
  await page
    .getByLabel("Link 1 address", { exact: true })
    .fill("javascript:alert(1)");
  const beforeInvalid = await row(owner);
  await submit();
  await page
    .getByRole("alert")
    .filter({ hasText: "Optional sections allow" })
    .waitFor();
  assert.deepEqual(await row(owner), beforeInvalid);
  await page
    .getByLabel("Link 1 address", { exact: true })
    .fill("https://example.test/updated");
  await page
    .getByRole("button", { name: "Move My testimony up", exact: true })
    .click();
  const invalidText = "Keep my draft\u0001until corrected";
  await page
    .getByLabel("My testimony (optional)", { exact: true })
    .fill(invalidText);
  const receiptsBefore = await db.retentionControl.count({
    where: { sourceId: owner.id, kind: "PROFILE_MODULES" }
  });
  const [invalidResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/platform/account" &&
        response.request().method() === "POST"
    ),
    submit()
  ]);
  assert.equal(invalidResponse.status(), 400, await invalidResponse.text());
  await page
    .getByRole("alert")
    .filter({ hasText: "Optional sections allow" })
    .waitFor();
  assert.equal(
    await page
      .getByLabel("My testimony (optional)", { exact: true })
      .inputValue(),
    invalidText
  );
  assert.deepEqual(await row(owner), beforeInvalid);
  assert.match(await orderList.innerText(), /2\. My testimony/);
  assert.equal(
    await db.retentionControl.count({
      where: { sourceId: owner.id, kind: "PROFILE_MODULES" }
    }),
    receiptsBefore
  );
  ok(
    "Unsupported control text returns HTTP400 through the real form, retains the draft and writes no profile or recovery receipt"
  );
  await page
    .getByLabel("My testimony (optional)", { exact: true })
    .fill("Retained story after uncertain save");
  let lost = false;
  await page.route("**/api/platform/account", async (route) => {
    if (
      !lost &&
      route.request().method() === "POST" &&
      route.request().postDataJSON().operation === "update-profile"
    ) {
      lost = true;
      const saved = await route.fetch();
      assert.equal(saved.status(), 200);
      await saved.dispose();
      return route.abort();
    }
    return route.continue();
  });
  await submit();
  await page
    .getByRole("alert")
    .filter({ hasText: "We could not confirm the save" })
    .waitFor();
  assert.deepEqual((await row(owner)).modules.order, [
    "links",
    "testimony",
    "skills"
  ]);
  assert.equal(
    (await row(owner)).modules.testimony,
    "Retained story after uncertain save"
  );
  await submit();
  await page
    .getByRole("button", { name: "Review latest saved profile", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByLabel("My testimony (optional)", { exact: true })
      .inputValue(),
    "Retained story after uncertain save"
  );
  await page
    .getByRole("button", { name: "Review latest saved profile", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Latest saved version", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByText("Retained story after uncertain save", { exact: true })
      .count(),
    1
  );
  await page
    .getByRole("button", {
      name: "Keep my edits and use this version",
      exact: true
    })
    .click();
  await page.unroute("**/api/platform/account");
  await submit();
  await page.waitForURL("**" + path);
  ok(
    "Unsafe links fail without writes; uncertain save retains fields and stale retry requires explicit saved-version review"
  );

  await go("/platform/profile/me");
  await page
    .getByRole("button", { name: "Move Links down", exact: true })
    .click();
  const secondToken = await loginAccount(
    db,
    owner.email,
    owner.password,
    "fictional-order-conflict"
  );
  const savedProfile = await getProfileEditor(db, secondToken);
  await updateAccountProfile(
    db,
    secondToken,
    {
      name: savedProfile.name,
      bio: savedProfile.bio ?? "",
      location: savedProfile.location ?? "",
      website: savedProfile.website ?? "",
      interests: savedProfile.interests.join(","),
      expectedVersion: savedProfile.presentation.version,
      profileModules: {
        ...savedProfile.presentation.modules,
        order: ["skills", "links", "testimony"]
      }
    },
    owner.id
  );
  await submit();
  await page
    .getByRole("button", { name: "Review latest saved profile", exact: true })
    .click();
  const latest = page.getByRole("region", {
    name: "Latest saved version",
    exact: true
  });
  await latest.waitFor();
  assert.equal(
    await latest
      .getByText("Skills, Links, My testimony", { exact: true })
      .count(),
    1
  );
  assert.match(await orderList.innerText(), /1\. My testimony/);
  assert.deepEqual((await row(owner)).modules.order, [
    "skills",
    "links",
    "testimony"
  ]);
  await latest
    .getByRole("button", {
      name: "Keep my edits and use this version",
      exact: true
    })
    .click();
  await submit();
  await page.waitForURL("**" + path);
  assert.deepEqual((await row(owner)).modules.order, [
    "testimony",
    "links",
    "skills"
  ]);
  assert.deepEqual(await visibleOrder(), ["My testimony", "Links", "Skills"]);
  ok(
    "A second session's conflicting order is shown for review while the local order stays intact until explicit save"
  );

  await go("/platform/profile/me");
  await page.getByLabel("My testimony (optional)", { exact: true }).fill("");
  await page.getByLabel("Skills (optional)", { exact: true }).fill("");
  await page.getByLabel("Link 1 label", { exact: true }).fill("");
  await page.getByLabel("Link 1 address", { exact: true }).fill("");
  await submit();
  await page.waitForURL("**" + path);
  assert.deepEqual((await row(owner)).modules, {
    testimony: "",
    skills: [],
    links: [],
    order: ["testimony", "links", "skills"]
  });
  assert.equal(
    await page
      .getByRole("heading", { name: "My testimony", exact: true })
      .count(),
    0
  );
  assert.equal(
    await page.getByRole("heading", { name: "Skills", exact: true }).count(),
    0
  );
  assert.equal(
    await page.getByRole("heading", { name: "Links", exact: true }).count(),
    0
  );
  assert.equal(
    await page.getByText("Preserved biography", { exact: true }).count(),
    1
  );
  assert.equal(
    await db.profilePresentation.count({ where: { userId: other.id } }),
    0
  );
  assert.ok(
    (await db.retentionControl.count({
      where: {
        sourceId: owner.id,
        kind: "PROFILE_MODULES",
        journaledAt: { not: null }
      }
    })) > 0
  );
  ok(
    "Clearing all module fields removes empty sections and journals recovery protection without changing another account"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        results,
        errors,
        blockedRequests,
        productionBuild: true,
        externalSends: 0,
        productionWrites: 0
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  console.log("PROFILE_MODULES_BROWSER_PASS " + results.length);
} finally {
  await browser.close();
  await db.$disconnect();
}
