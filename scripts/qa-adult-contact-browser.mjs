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
  COMMUNITY_REPORTS_ENABLED: "true"
});
const { PrismaClient } = await import("@prisma/client");
const { seedPortal, assertPortalTestDatabase, seedOperatorGrants } =
  await import("../tests/seed-portal.ts");
const { adultContactCommand: command, readAdultContact: read } =
  await import("../lib/platform/adult-contact.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const f = await seedPortal(db);
await seedOperatorGrants(db, f.operator, ["REVIEW_COMMUNITY_REPORTS"]);
const input = (operation, fields) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
async function pref(actor, audience) {
  const data = await read(db, actor.token, { view: "preferences" });
  return command(
    db,
    actor.token,
    input("preferences", {
      audience,
      expectedVersion: data.preferences.version
    })
  );
}
async function request(sender, recipient, purpose) {
  const data = await read(db, sender.token, {
    view: "target",
    recipientId: recipient.id
  });
  return command(
    db,
    sender.token,
    input("create", {
      recipientId: recipient.id,
      purpose,
      expectedRecipientVersion: data.expectedRecipientVersion
    })
  );
}
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
const page = await context.newPage(),
  errors = [],
  bodies = [],
  requests = [],
  groups = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("request", (req) => {
  if (new URL(req.url()).pathname === "/api/platform/contact-requests") {
    requests.push(req.method());
    if (req.method() === "POST") bodies.push(req.postData());
  }
});
const out = dir + "/contact-browser" + (disabled ? "-disabled" : "");
mkdirSync(out, { recursive: true });
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
const button = (name) => page.getByRole("button", { name, exact: true });
async function enabled(name) {
  await page.waitForFunction(
    (name) =>
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent === name && !b.disabled
      ),
    name
  );
}
const choice = () =>
  page.getByRole("combobox", { name: "Who can send you a request" });
const receipt = (id) => go(`/platform/messages/requests?id=${id}`);
try {
  await login(f.memberA);
  await go("/platform/menu");
  await go("/platform/settings/privacy");
  assert.equal(
    requests.length,
    0,
    "Closed Menu/settings must not load contact data"
  );
  const manifest = JSON.parse(
    readFileSync(".next/app-build-manifest.json", "utf8")
  );
  const chunks = manifest.pages["/platform/messages/requests/page"].filter(
    (file) =>
      file.endsWith(".js") &&
      existsSync(".next/" + file) &&
      readFileSync(".next/" + file, "utf8").includes(
        "Retry same contact action"
      )
  );
  assert.ok(chunks.length);
  const resources = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((e) => e.name)
  );
  assert.ok(
    chunks.every((file) => !resources.some((url) => url.includes(file))),
    "Contact UI stays lazy until opened"
  );
  groups.push(
    "closed Menu/settings: zero contact reads and no contact workspace chunk"
  );

  if (disabled) {
    await pref(f.memberA, "EVERYONE");
    await pref(f.memberB, "EVERYONE");
    await pref(f.contact, "EVERYONE");
    const incoming = await request(
      f.memberB,
      f.memberA,
      "Fictional request before intake paused"
    );
    const outgoing = await request(
      f.memberA,
      f.contact,
      "Fictional withdraw while paused"
    );
    await receipt(incoming.id);
    assert.equal(await button("Accept request").count(), 0);
    await button("Decline request").click();
    await page.getByText("Declined", { exact: true }).waitFor();
    assert.equal(
      (
        await db.adultContactRequest.findUniqueOrThrow({
          where: { id: incoming.id }
        })
      ).status,
      "DECLINED"
    );
    await receipt(outgoing.id);
    await button("Withdraw request").click();
    await page.getByText("Withdrawn", { exact: true }).waitFor();
    await go("/platform/settings/privacy/messages");
    await choice().waitFor();
    assert.equal(await choice().inputValue(), "EVERYONE");
    for (const value of ["EVERYONE", "FOLLOWED"])
      assert.ok(
        await choice()
          .locator(`option[value="${value}"]`)
          .evaluate((option) => option.disabled),
        `Paused ${value} option must be natively disabled`
      );
    await choice().selectOption("NOBODY");
    await button("Save contact preferences").click();
    await page
      .getByText("Contact request choices saved.", { exact: true })
      .waitFor();
    assert.equal(
      (
        await db.socialPreferences.findUniqueOrThrow({
          where: { ownerId: f.memberA.id }
        })
      ).contactRequests,
      "NOBODY"
    );
    groups.push(
      "paused intake disables wider contact but preserves decline, withdraw and No one restriction"
    );
    await enabled("Refresh contact access");
    await page.route("**/api/platform/contact-requests?**", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Fictional preference read unavailable."
        })
      })
    );
    await button("Refresh contact access").click();
    await page
      .getByText("Fictional preference read unavailable.", { exact: true })
      .waitFor();
    assert.equal(
      await choice().count(),
      0,
      "A failed read must not present old saved preferences as current"
    );
    await page.unroute("**/api/platform/contact-requests?**");
    await button("Refresh contact access").click();
    await choice().waitFor();
    assert.equal(await choice().inputValue(), "NOBODY");
    groups.push(
      "failed preference read hides old saved choices and refresh restores current authoritative state"
    );
    await go(`/platform/messages/requests?recipientId=${f.contact.id}`);
    await page.getByLabel("Request purpose").waitFor();
    await page
      .getByLabel("Request purpose")
      .fill("No fake submission while paused");
    assert.ok(await button("Send contact request").isDisabled());
    assert.equal(
      await db.adultContactRequest.count({
        where: {
          senderId: f.memberA.id,
          recipientId: f.contact.id,
          status: "PENDING"
        }
      }),
      0
    );
    await page.screenshot({ path: out + "/paused-390.png", fullPage: true });
    groups.push(
      "paused composer preserves local purpose without enabling a submission"
    );
  } else {
    await go("/platform/settings/privacy/messages");
    await choice().waitFor();
    assert.equal(await choice().inputValue(), "NOBODY");
    await choice().selectOption("FOLLOWED");
    let lose = true;
    await page.route("**/api/platform/contact-requests", async (route) => {
      if (route.request().method() === "POST" && lose) {
        lose = false;
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        await route.abort("failed");
      } else await route.continue();
    });
    let before = bodies.length;
    await button("Save contact preferences").click();
    await enabled("Retry same contact action");
    await button("Retry same contact action").click();
    await page
      .getByText("Contact request choices saved.", { exact: true })
      .waitFor();
    assert.equal(bodies[before], bodies[before + 1]);
    await page.unroute("**/api/platform/contact-requests");
    await enabled("Refresh contact access");
    await choice().selectOption("EVERYONE");
    await pref(f.memberA, "NOBODY");
    await button("Save contact preferences").click();
    await enabled("Refresh contact access");
    assert.ok(await button("Save contact preferences").isDisabled());
    assert.equal(await choice().inputValue(), "EVERYONE");
    await button("Refresh contact access").click();
    await button("Use saved contact choices").waitFor();
    assert.equal(await choice().inputValue(), "EVERYONE");
    await button("Use saved contact choices").click();
    assert.equal(await choice().inputValue(), "NOBODY");
    await choice().selectOption("EVERYONE");
    await button("Save contact preferences").click();
    await page
      .getByText("Contact request choices saved.", { exact: true })
      .waitFor();
    assert.equal(
      (
        await db.socialPreferences.findUniqueOrThrow({
          where: { ownerId: f.memberA.id }
        })
      ).contactRequests,
      "EVERYONE"
    );
    groups.push(
      "No one default, all audiences, byte-identical preference retry and shared-version conflict preserve choices"
    );

    await pref(f.memberB, "EVERYONE");
    await go(`/platform/messages/requests?recipientId=${f.memberB.id}`);
    await page
      .getByLabel("Request purpose")
      .fill("Private purpose kept through lost response " + f.memberA.id);
    const purpose = await page.getByLabel("Request purpose").inputValue();
    await page.evaluate(() => history.back());
    await page
      .getByText("Save, retry or discard your unsent entries before leaving.", {
        exact: true
      })
      .waitFor();
    await page.getByRole("link", { name: "Sent", exact: true }).click();
    assert.equal(
      new URL(page.url()).searchParams.get("recipientId"),
      f.memberB.id
    );
    lose = true;
    await page.route("**/api/platform/contact-requests", async (route) => {
      if (route.request().method() === "POST" && lose) {
        lose = false;
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        await route.abort("failed");
      } else await route.continue();
    });
    before = bodies.length;
    await button("Send contact request").click();
    await enabled("Retry same contact action");
    assert.equal(
      await db.adultContactRequest.count({
        where: { senderId: f.memberA.id, purpose }
      }),
      1
    );
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await login(f.contact);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page
      .getByText("Your sign-in changed. Reload before continuing.", {
        exact: true
      })
      .waitFor();
    assert.equal(await page.getByLabel("Request purpose").count(), 0);
    assert.ok(!(await page.locator("main").innerText()).includes(purpose));
    await login(f.memberA);
    await button("Refresh contact access").click();
    await enabled("Retry same contact action");
    assert.equal(
      await page.getByLabel("Request purpose").inputValue(),
      purpose
    );
    assert.ok(await button("Send contact request").isDisabled());
    await button("Retry same contact action").click();
    await page
      .getByRole("link", { name: "View saved request", exact: true })
      .waitFor();
    assert.equal(bodies[before], bodies[before + 1]);
    await page.unroute("**/api/platform/contact-requests");
    const first = await db.adultContactRequest.findFirstOrThrow({
      where: { senderId: f.memberA.id, purpose }
    });
    await page
      .getByRole("link", { name: "View saved request", exact: true })
      .click();
    await page.getByText(purpose, { exact: true }).waitFor();
    assert.equal(await button("Accept request").count(), 0);
    await login(f.memberB);
    await receipt(first.id);
    await enabled("Accept request");
    await button("Accept request").click();
    await page.getByText("Accepted", { exact: true }).waitFor();
    const accepted = await db.adultContactRequest.findUniqueOrThrow({
      where: { id: first.id }
    });
    assert.ok(accepted.conversationId);
    assert.ok(
      (
        await db.adultConversation.findUniqueOrThrow({
          where: { id: accepted.conversationId }
        })
      ).sendingAllowed
    );
    groups.push(
      "guarded navigation, real creation, exact lost-response retry, account concealment and recipient-only acceptance"
    );

    await page
      .getByRole("button", {
        name: `More options for ${f.memberA.name}'s contact request`,
        exact: true
      })
      .click();
    await page
      .getByRole("link", { name: "Report this request", exact: true })
      .click();
    await page.getByLabel("Report reason").waitFor();
    assert.equal(
      new URL(page.url()).searchParams.get("targetType"),
      "CONTACT_REQUEST"
    );
    assert.equal(new URL(page.url()).searchParams.get("targetId"), first.id);
    await page.getByLabel("Report reason").selectOption("HARASSMENT");
    await button("Send private report").click();
    await page
      .getByRole("link", { name: "View your private receipt", exact: true })
      .waitFor();
    assert.equal(
      await db.communityReport.count({
        where: {
          reporterId: f.memberB.id,
          targetType: "CONTACT_REQUEST",
          targetId: first.id
        }
      }),
      1
    );
    await receipt(first.id);
    await page
      .getByRole("button", {
        name: `More options for ${f.memberA.name}'s contact request`,
        exact: true
      })
      .click();
    await enabled("Block");
    page.once("dialog", (dialog) => dialog.accept());
    await button("Block").click();
    await page
      .getByText(
        "New messages are unavailable. This retained request does not restore contact permission.",
        { exact: true }
      )
      .waitFor();
    assert.equal(
      (
        await db.adultConversation.findUniqueOrThrow({
          where: { id: accepted.conversationId }
        })
      ).sendingAllowed,
      false
    );
    groups.push(
      "request More uses selected private reporting and blocking immediately refreshes accepted-contact access"
    );

    await pref(f.contact, "EVERYONE");
    await db.platformAuthLimit.deleteMany();
    const withdrawal = await request(
      f.memberA,
      f.contact,
      "Fictional withdraw request"
    );
    await login(f.memberA);
    await receipt(withdrawal.id);
    await button("Withdraw request").click();
    await page.getByText("Withdrawn", { exact: true }).waitFor();
    const decline = await request(
      f.memberA,
      f.contact,
      "Fictional decline request"
    );
    await login(f.contact);
    await receipt(decline.id);
    await button("Decline request").click();
    await page.getByText("Declined", { exact: true }).waitFor();
    const expired = await request(
      f.contact,
      f.memberA,
      "Fictional expired request"
    );
    await db.adultContactRequest.update({
      where: { id: expired.id },
      data: { expiresAt: new Date(Date.now() - 1000) }
    });
    await login(f.memberA);
    await receipt(expired.id);
    await page.getByText("Expired", { exact: true }).waitFor();
    assert.equal(await button("Accept request").count(), 0);
    groups.push(
      "real withdraw, recipient decline and expired receipt without stale decision actions"
    );

    await go("/platform/settings/privacy/messages");
    await choice().waitFor();
    await choice().selectOption("NOBODY");
    let replaceOwner = true;
    await page.route("**/api/platform/contact-requests", async (route) => {
      if (route.request().method() === "POST" && replaceOwner) {
        replaceOwner = false;
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        await login(f.contact);
        await route.fulfill({ response });
      } else await route.continue();
    });
    before = bodies.length;
    await button("Save contact preferences").click();
    await page
      .getByText("Your sign-in changed. Reload before continuing.", {
        exact: true
      })
      .waitFor();
    assert.equal(await choice().count(), 0);
    await login(f.memberA);
    await button("Refresh contact access").click();
    await enabled("Retry same contact action");
    await button("Retry same contact action").click();
    await page
      .getByText("Contact request choices saved.", { exact: true })
      .waitFor();
    assert.equal(bodies[before], bodies[before + 1]);
    await page.unroute("**/api/platform/contact-requests");
    groups.push(
      "account replaced after commit conceals choices and retains the original receipt key for the restored owner"
    );

    await go(`/platform/messages/requests?recipientId=${f.contact.id}`);
    await page
      .getByLabel("Request purpose")
      .fill("Retain this after retry delay");
    let quota = true;
    await page.route("**/api/platform/contact-requests", async (route) => {
      if (route.request().method() === "POST" && quota) {
        quota = false;
        await route.fulfill({
          status: 429,
          contentType: "application/json",
          headers: { "Retry-After": "2" },
          body: JSON.stringify({ message: "Fictional browser retry delay." })
        });
      } else await route.continue();
    });
    await button("Send contact request").click();
    await page
      .getByText("Fictional browser retry delay.", { exact: true })
      .waitFor();
    assert.ok(await button("Send contact request").isDisabled());
    assert.equal(
      await page.getByLabel("Request purpose").inputValue(),
      "Retain this after retry delay"
    );
    await enabled("Send contact request");
    await page.unroute("**/api/platform/contact-requests");
    await button("Discard unsent entries").click();
    assert.equal(await page.getByLabel("Request purpose").inputValue(), "");
    groups.push(
      "Retry-After preserves purpose and enables a deliberate retry after its deadline; explicit discard works"
    );
  }
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.screenshot({
      path: out + `/layout-${width}.png`,
      fullPage: true
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      ),
      `No overflow at ${width}`
    );
  }
  if (disabled) await button("Discard unsent entries").click();
  await context.addCookies([
    {
      name: "godschurches_reading",
      value: encodeURIComponent(
        JSON.stringify({
          appearance: "dark",
          size: "largest",
          reduceMotion: true,
          reduceData: true
        })
      ),
      url: config.origin
    }
  ]);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("Request purpose").waitFor();
  await page.getByLabel("Request purpose").focus();
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.getAttribute("aria-label")
    ),
    "Request purpose"
  );
  await page.keyboard.type("Keyboard entered unsent purpose");
  assert.equal(
    await page.getByLabel("Request purpose").inputValue(),
    "Keyboard entered unsent purpose"
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    )
  );
  await page.screenshot({
    path: out + "/dark-largest-320.png",
    fullPage: true
  });
  assert.deepEqual(errors, []);
  groups.push(
    "320/390/1440 layout, dark/largest text keyboard entry and zero page errors"
  );
  writeFileSync(
    out + "/receipt.json",
    JSON.stringify(
      {
        passed: groups.length,
        groups,
        errors,
        contactReads: requests.filter((v) => v === "GET").length,
        contactWrites: bodies.length
      },
      null,
      2
    )
  );
  console.log(
    JSON.stringify({ passed: groups.length, groups, errors }, null, 2)
  );
} catch (error) {
  await page
    .screenshot({ path: out + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    out + "/failure.txt",
    String(error) +
      "\n" +
      (await page
        .locator("main")
        .innerText()
        .catch(() => ""))
  );
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
