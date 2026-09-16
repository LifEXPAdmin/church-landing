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
const output = fixtureDir + "/founder-welcome-browser";
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
const { founder, member, welcome } = JSON.parse(
  readFileSync(fixtureDir + "/founder-browser-actors.json", "utf8")
);
const { FOUNDER_WELCOME_BODY, FOUNDER_WELCOME_LABEL } =
  await import("../lib/platform/founder-welcome-content.ts");
const notice = page
  .getByRole("region", { name: "Private messages", exact: true })
  .getByRole("status");
try {
  await signIn(founder);
  await go("/platform/messages");
  await page
    .getByRole("heading", { name: "No conversations yet", exact: true })
    .waitFor();
  await page.getByRole("link", { name: "Sent welcomes", exact: true }).click();
  await page
    .locator(`a[href^="/platform/messages/${welcome.conversationId}"]`)
    .waitFor();
  ok(
    "Initial automatic welcome is separate from the founder main inbox and reachable in Sent welcomes"
  );

  await signIn(member);
  await go("/platform/messages/" + welcome.conversationId);
  await page.getByText(FOUNDER_WELCOME_LABEL, { exact: true }).waitFor();
  await page.waitForFunction(() => {
    const history = document.querySelector(".gc-message-history");
    return !!history && history.scrollTop === 0;
  });
  assert.equal(
    await page
      .getByRole("textbox", { name: "Your message", exact: true })
      .count(),
    0
  );
  await page
    .getByRole("link", { name: "Matthew 17:20", exact: true })
    .waitFor();
  assert.equal(
    await page
      .locator("strong")
      .filter({ hasText: "you can help this community come alive." })
      .count(),
    1
  );
  assert.equal(
    (
      await db.adultMessage.findUniqueOrThrow({
        where: { id: welcome.messageId }
      })
    ).content,
    FOUNDER_WELCOME_BODY
  );
  await page
    .getByRole("link", {
      name: "Enable notifications or change announcement preferences",
      exact: true
    })
    .waitFor();
  await page.screenshot({
    path: output + "/member-welcome.png",
    fullPage: true
  });
  ok(
    "The approved body and separate automatic label use the shared history; reply requires a deliberate action and phone opt-in stays optional"
  );

  await page
    .getByRole("button", { name: "Reply to Andrew", exact: true })
    .click();
  const composer = page.getByRole("textbox", {
    name: "Your message",
    exact: true
  });
  await composer.waitFor();
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "Your message"
  );
  await composer.fill("Thank you. I would like to help in my community.");
  const bodies = [];
  let lost = false;
  await page.route("**/api/platform/messages", async (route) => {
    if (
      route.request().method() !== "POST" ||
      route.request().postDataJSON()?.operation !== "send"
    )
      return route.continue();
    bodies.push(route.request().postData());
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    if (!lost) {
      lost = true;
      return route.abort("failed");
    }
    return route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page
    .getByRole("button", { name: "Retry same action", exact: true })
    .click();
  await notice
    .filter({ hasText: "Sent and saved in this conversation." })
    .waitFor();
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  assert.equal(JSON.parse(bodies[0]).welcomeReply, true);
  await page.unroute("**/api/platform/messages");
  assert.equal(
    await db.adultMessage.count({
      where: { conversationId: welcome.conversationId, senderId: member.id }
    }),
    1
  );
  const preferences = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: member.id }
  });
  assert.equal(preferences.contactRequests, "NOBODY");
  assert.equal(preferences.founderAnnouncements, false);
  ok(
    "Explicit reply focuses the shared composer; a lost acknowledgement retries one identical consent/send without widening ordinary preferences"
  );

  await signIn(founder);
  await go("/platform/messages");
  const conversationLink = page.locator(
    `a[href^="/platform/messages/${welcome.conversationId}"]`
  );
  await conversationLink.waitFor();
  await page
    .getByRole("link", { name: "Welcome replies", exact: true })
    .click();
  await conversationLink.waitFor();
  await page.getByRole("link", { name: "Unanswered", exact: true }).click();
  await conversationLink.waitFor();
  await conversationLink.click();
  await page
    .getByText("Thank you. I would like to help in my community.", {
      exact: true
    })
    .waitFor();
  await composer.fill(
    "I am glad you are here. What would you like to work on?"
  );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await notice
    .filter({ hasText: "Sent and saved in this conversation." })
    .waitFor();
  await go("/platform/messages?filter=unanswered");
  await page
    .getByRole("heading", { name: "No conversations yet", exact: true })
    .waitFor();
  assert.equal(await conversationLink.count(), 0);
  ok(
    "The member reply surfaces in the founder main, Welcome replies and Unanswered inboxes; a personal founder response resolves Unanswered"
  );

  await signIn(member);
  await go("/platform/messages/" + welcome.conversationId);
  await page
    .getByText("I am glad you are here. What would you like to work on?", {
      exact: true
    })
    .waitFor();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "32px")
    );
    await bounded();
    await page.screenshot({
      path: output + "/conversation-" + width + ".png",
      fullPage: true
    });
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  }
  ok(
    "Both participants share the canonical history, with usable narrow/enlarged layouts"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      { results, errors, productionWrites: 0, physicalDeviceObserved: false },
      null,
      2
    )
  );
  console.log("FOUNDER_WELCOME_BROWSER_PASS " + results.length);
} catch (error) {
  await page.screenshot({ path: output + "/failure.png", fullPage: true });
  console.log(
    "FIXTURE_PAGE",
    (await page.locator("main").innerText()).slice(-2500)
  );
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
