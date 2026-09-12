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
const output = fixtureDir + "/mission-browser";
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
const signIn = async (actor) => {
  await context.clearCookies();
  await context.addCookies([
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
};
const headline = "Jesus gave us a mission. You have a part to play.";
const signature = "United in Christ. Equipping believers. Making disciples.";
try {
  const a = await createPortalActor(db, "missionmember");
  const post = await db.platformPost.create({
    data: {
      authorId: a.id,
      content: "Fictional mission populated Home fixture " + a.id,
      status: "PUBLISHED"
    }
  });
  const mission = page.getByRole("region", { name: headline, exact: true });
  const root = await context.request.get(config.origin + "/", {
    maxRedirects: 0
  });
  assert.equal(root.status(), 307);
  assert.equal(root.headers().location, "/platform");
  for (const empty of [false, true]) {
    await page.goto(
      config.origin +
        (empty
          ? "/platform?before=1970-01-01T00%3A00%3A00.000Z&cursor=" + post.id
          : "/platform?post=" + post.id)
    );
    await mission.waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.getByRole("heading", { level: 1 }).count(), 1);
    assert.equal(
      await mission.getByRole("heading", { level: 1 }).innerText(),
      "Jesus gave us a mission.\nYou have a part to play."
    );
    assert.equal(
      await mission
        .getByRole("link", { name: "Create an account", exact: true })
        .getAttribute("href"),
      "/platform/signup"
    );
    assert.equal(
      await mission
        .getByRole("link", { name: "Explore the community", exact: true })
        .getAttribute("href"),
      "/platform/search"
    );
    assert.equal(
      await mission
        .getByRole("link", { name: "Our mission", exact: true })
        .getAttribute("href"),
      "/about#our-mission"
    );
    const metrics = await page.evaluate(() => {
      const m = document.querySelector(".gc-mission"),
        h = m.querySelector("h1").getBoundingClientRect(),
        d = m.querySelector(".gc-mission-description").getBoundingClientRect(),
        b = m.querySelector("a").getBoundingClientRect(),
        nav = document.querySelector(".gc-primary-nav").getBoundingClientRect(),
        feed = document
          .querySelector(".gc-screen-heading")
          .getBoundingClientRect();
      return {
        h: { top: h.top, bottom: h.bottom },
        d: { top: d.top, bottom: d.bottom },
        button: { top: b.top, bottom: b.bottom },
        navTop: nav.top,
        feedTop: feed.top,
        heroBottom: m.getBoundingClientRect().bottom
      };
    });
    writeFileSync(
      output + "/first-screen-" + empty + ".json",
      JSON.stringify(metrics, null, 2)
    );
    assert.ok(
      metrics.h.top >= 0 &&
        metrics.d.bottom < 844 &&
        metrics.button.bottom <= Math.min(844, metrics.navTop),
      "Headline, mission description and primary action visible above mobile navigation"
    );
    assert.ok(
      metrics.feedTop >= metrics.heroBottom,
      "Mission before feed chrome"
    );
    if (empty)
      await page
        .getByRole("heading", { name: "No posts yet.", exact: true })
        .waitFor();
    else
      await page
        .getByText(post.content, { exact: true })
        .waitFor();
    await page.screenshot({
      path: output + "/first-screen-" + (empty ? "empty" : "populated") + ".png"
    });
    assert.equal(await page.getByText(signature, { exact: true }).count(), 1);
  }
  ok(
    "Root entry is unchanged; empty and populated guest Home show exact mission/actions before feed chrome in the first390x844 screen with one footer signature"
  );

  for (const appearance of ["light", "dark"]) {
    await context.addCookies([
      {
        name: "godschurches_reading",
        value: encodeURIComponent(
          JSON.stringify({
            appearance,
            mode: "pages",
            size: "comfortable",
            reduceMotion: false,
            reduceData: false
          })
        ),
        domain: "127.0.0.1",
        path: "/platform",
        secure: true
      }
    ]);
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await go("/platform?post=" + post.id);
      await mission.waitFor();
      await page.evaluate(() => document.fonts.ready);
      await bounded();
      await page.screenshot({
        path: output + "/mission-" + appearance + "-" + width + ".png",
        fullPage: true
      });
      await page.evaluate(
        () => (document.documentElement.style.fontSize = "32px")
      );
      await bounded();
      await page.screenshot({
        path: output + "/mission-" + appearance + "-" + width + "-large.png",
        fullPage: true
      });
      await page.evaluate(() => (document.documentElement.style.fontSize = ""));
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await mission
    .getByRole("link", { name: "Create an account", exact: true })
    .focus();
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent.trim()),
    "Explore the community"
  );
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent),
    "Our mission"
  );
  await page.keyboard.press("Enter");
  await page.waitForURL("**/about#our-mission");
  await page
    .getByRole("heading", {
      name: "His authority. Our shared calling.",
      exact: true
    })
    .waitFor();
  assert.match(
    await page.locator("article").innerText(),
    /Jesus Christ holds all authority in heaven and on earth/
  );
  await page
    .getByText(
      "The mission comes from Christ. Our part is to help you take yours.",
      { exact: true }
    )
    .waitFor();
  await page
    .getByText("Rooted in Matthew 28:18–20.", { exact: true })
    .waitFor();
  assert.equal(await page.getByText(signature, { exact: true }).count(), 1);
  await page.waitForLoadState("networkidle");
  await page.goBack();
  console.log("MISSION_BACK", page.url());
  await mission.waitFor();
  await mission
    .getByRole("link", { name: "Explore the community", exact: true })
    .click();
  await page.waitForURL("**/platform/search");
  await page
    .getByRole("heading", { name: "Find your community.", exact: true })
    .waitFor();
  await go("/manifesto");
  await page
    .getByText(
      "A worldwide Church. A shared mission. Every believer has a part.",
      { exact: true }
    )
    .waitFor();
  assert.equal(await page.getByText(signature, { exact: true }).count(), 1);
  await go("/platform/menu");
  await page
    .locator(".gc-menu-links")
    .getByRole("link", { name: /Our mission/ })
    .click();
  await page.waitForURL("**/about#our-mission");
  ok(
    "Light/dark/narrow/desktop/enlarged reflow and keyboard order pass; About anchor, exact statement, manifesto and Menu mission links resolve"
  );

  await signIn(a);
  await go("/platform?post=" + post.id);
  await page
    .getByRole("heading", { name: "Home", exact: true, level: 1 })
    .waitFor();
  assert.equal(await page.locator(".gc-mission").count(), 0);
  await page.locator("#compose-post summary").waitFor();
  assert.equal(
    await page
      .getByText("You have a place in this mission.", { exact: true })
      .count(),
    0
  );
  await page
    .getByRole("navigation", { name: "Platform", exact: true })
    .getByRole("link", { name: "My feed", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Close My feed", exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Close My feed", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(
    await page.evaluate(() => document.body.style.overflow === "hidden"),
    false
  );
  assert.equal(await page.locator(".gc-mission").count(), 0);
  const before = {
    posts: await db.platformPost.count({ where: { authorId: a.id } }),
    follows: await db.platformFollow.count({ where: { followerId: a.id } }),
    connections: await db.churchConnection.count({ where: { userId: a.id } })
  };
  await page
    .getByRole("navigation", { name: "Platform", exact: true })
    .getByRole("link", { name: "Menu", exact: true })
    .click();
  await page.goBack();
  await page
    .getByRole("heading", { name: "Home", level: 1, exact: true })
    .waitFor();
  assert.deepEqual(
    {
      posts: await db.platformPost.count({ where: { authorId: a.id } }),
      follows: await db.platformFollow.count({ where: { followerId: a.id } }),
      connections: await db.churchConnection.count({ where: { userId: a.id } })
    },
    before
  );
  ok(
    "Returning member retains Home/composer/focused-reader Escape and Back without visitor/welcome hero or automatic social actions"
  );

  await context.clearCookies();
  const username = "mission_" + randomUUID().replaceAll("-", "").slice(0, 12),
    email = username + "@example.test",
    password = "Fictional-Mission-Signup-1";
  await go("/platform/signup?next=%2Fplatform%2Fmenu");
  await page
    .getByLabel("Name", { exact: true })
    .fill("Fictional Mission Welcome");
  await page.getByLabel("Public username", { exact: true }).fill(username);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "You have a place in this mission.",
      level: 1,
      exact: true
    })
    .waitFor();
  assert.equal(new URL(page.url()).searchParams.get("next"), "/platform/menu");
  await page
    .getByText(
      /Registration never changes an existing account or resets its password/
    )
    .waitFor();
  await page
    .getByRole("link", { name: "Find a church", exact: true })
    .waitFor();
  await page
    .getByRole("link", { name: "Explore people", exact: true })
    .waitFor();
  assert.equal(
    (await context.cookies()).some((c) => c.name === "church_platform_session"),
    false
  );
  const created = await db.platformUser.findUniqueOrThrow({
    where: { username }
  });
  assert.equal(
    await db.churchCapabilityGrant.count({ where: { userId: created.id } }),
    0
  );
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/platform/menu");
  assert.equal(
    await page
      .getByText("You have a place in this mission.", { exact: true })
      .count(),
    0
  );
  await go("/platform");
  assert.equal(await page.locator(".gc-mission").count(), 0);
  ok(
    "Existing registration acknowledgement shows welcome without asserting new-account identity; separate sign-in preserves intended Menu return and grants no church authority"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify({ results, errors }, null, 2)
  );
  console.log("MISSION_BROWSER_PASS " + results.length);
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.txt",
    await page
      .locator("body")
      .innerText()
      .catch(() => "")
  );
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
