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
const output = fixtureDir + "/security-settings-browser";
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
try {
  const a = await createPortalActor(db, "securityfolder", { verified: false });
  const { requestAccountGrant, consumeAccountGrant } =
    await import("../lib/platform/accounts.ts");
  await signIn(a);
  await go("/platform/settings/security");
  const security = page.getByRole("region", {
    name: "Current sign-in protection",
    exact: true
  });
  await security.waitFor();
  assert.match(await security.innerText(), /Password\s+Set/);
  assert.match(await security.innerText(), /Google sign-in\s+Not connected/);
  assert.match(await security.innerText(), /Account email\s+Not verified/);
  await page.locator("#setting-security-password").click();
  await page.waitForURL("**/settings/security/password");
  await page.getByLabel("Current password", { exact: true }).waitFor();
  await page
    .getByRole("heading", { name: "Change password", exact: true })
    .waitFor();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "32px")
    );
    await bounded();
    await page.screenshot({
      path: output + "/password-" + width + ".png",
      fullPage: true
    });
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  ok(
    "Password-backed account has truthful Security state and reachable password confirmation controls at enlarged phone/desktop widths"
  );

  await page.route("**/api/platform/settings", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    delete data.methods;
    return route.fulfill({ response, json: data });
  });
  await page.evaluate(() => {
    dispatchEvent(new Event("blur"));
    dispatchEvent(new Event("focus"));
  });
  await page
    .getByText("Sign-in options could not be checked. Retry settings.", {
      exact: true
    })
    .waitFor();
  assert.equal(
    await page.getByLabel("New password", { exact: true }).isVisible(),
    false
  );
  await page.unroute("**/api/platform/settings");
  await page
    .getByRole("button", { name: "Retry settings", exact: true })
    .click();
  await page.getByLabel("Current password", { exact: true }).waitFor();
  ok(
    "Missing method metadata conceals write controls and retries without inventing authentication state"
  );

  await db.platformUser.update({
    where: { id: a.id },
    data: { passwordHash: null }
  });
  await page.reload();
  await page
    .getByText(
      "This account does not have a usable password or linked Google sign-in.",
      { exact: false }
    )
    .waitFor();
  assert.equal(
    await page.getByLabel("New password", { exact: true }).count(),
    0
  );
  await go("/platform/settings/account/sessions");
  await page
    .getByRole("button", { name: "Show active sign-ins", exact: true })
    .click();
  await page
    .getByRole("list", { name: "Active sign-ins", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Sign out other sessions", exact: true })
      .count(),
    0
  );
  await page
    .getByRole("link", { name: "Review recovery options", exact: true })
    .click();
  await page.waitForURL("**/account/recover");
  await page
    .getByRole("heading", { level: 1, name: "Password recovery", exact: true })
    .waitFor();
  await page
    .getByRole("link", { name: "Back to Security", exact: true })
    .click();
  await security.waitFor();
  assert.match(await security.innerText(), /Password\s+Not set/);
  assert.equal(await page.locator('input[name="currentPassword"]').count(), 0);
  ok(
    "Legacy passwordless account has no unusable write form, retains session reads, and returns from unavailable recovery to Security"
  );

  const subject = randomUUID();
  await db.platformGoogleIdentity.create({
    data: { userId: a.id, issuer: "https://accounts.google.com", subject }
  });
  await page.evaluate(() => {
    dispatchEvent(new Event("blur"));
    dispatchEvent(new Event("focus"));
  });
  await security
    .getByText("Connected; confirmation currently unavailable", { exact: true })
    .waitFor();
  await go("/platform/settings/security/password");
  await page
    .getByText(
      /This account has a linked Google sign-in, but Google confirmation is currently unavailable/
    )
    .waitFor();
  assert.equal(
    await page.getByLabel("New password", { exact: true }).count(),
    0
  );
  const dto = await (
    await context.request.get(config.origin + "/api/platform/settings")
  ).json();
  assert.deepEqual(dto.methods, { password: false, google: true });
  assert.equal(dto.googleAvailable, false);
  assert.ok(!JSON.stringify(dto).includes(subject));
  assert.ok(!JSON.stringify(dto).includes(a.token));
  ok(
    "Linked provider-only account respects the disabled provider gate and exposes only own safe method booleans"
  );

  let token = "";
  await requestAccountGrant(
    db,
    a.email,
    "VERIFY_EMAIL",
    async (_email, _purpose, t) => {
      token = t;
    }
  );
  assert.ok(token);
  await go("/platform/account/verify");
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { id: a.id } }))
      .emailVerifiedAt,
    null
  );
  await page
    .getByRole("link", { name: "Back to account settings", exact: true })
    .click();
  await page.waitForURL("**/settings/account/verification");
  await page
    .getByText("Your account email has not been verified.", { exact: true })
    .waitFor();
  await consumeAccountGrant(db, token, "VERIFY_EMAIL");
  await page.evaluate(() => {
    dispatchEvent(new Event("blur"));
    dispatchEvent(new Event("focus"));
  });
  await page
    .getByText("Your account email has been verified.", { exact: true })
    .waitFor();
  ok(
    "Requesting or opening verification does not imply success; confirmed service state refreshes the specific verification detail"
  );

  let recent = null,
    attempts = 0;
  await page.route("**/api/platform/settings", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    return route.fulfill({
      response,
      json: { ...data, googleAvailable: true }
    });
  });
  await page.route("**/api/platform/google", async (route) => {
    const data = route.request().postDataJSON();
    if (data.operation === "status")
      return route.fulfill({
        json: {
          signedIn: true,
          methods: { password: false, google: true },
          recentPurpose: recent,
          emailConfirmationReady: false,
          pending: null
        }
      });
    assert.equal(data.operation, "reauthenticate");
    assert.equal(data.purpose, "change-password");
    assert.equal(data.next, undefined);
    attempts++;
    return route.fulfill({
      status: 503,
      json: {
        message:
          "Fixture provider connection unavailable. Keep this setting open and retry."
      }
    });
  });
  await go("/platform/settings/security/password");
  await page
    .getByRole("heading", { name: "Add password", exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("Current password", { exact: true }).count(),
    0
  );
  await page
    .getByRole("button", {
      name: "Sign in with Google to confirm setting your password",
      exact: true
    })
    .click();
  await page
    .getByText(
      "Fixture provider connection unavailable. Keep this setting open and retry.",
      { exact: true }
    )
    .waitFor();
  assert.match(page.url(), /settings\/security\/password$/);
  assert.equal(attempts, 1);
  ok(
    "Simulated enabled provider-only UI offers Google confirmation without a password prompt and retains the setting after provider failure"
  );

  recent = "change-password";
  await page.reload();
  await page
    .getByText(
      "Google confirmation received for this action. Continue below.",
      { exact: true }
    )
    .waitFor();
  await page
    .getByLabel("New password", { exact: true })
    .fill("Fictional-new-security-password-1");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("Fictional-new-security-password-1");
  await page.route("**/api/platform/account", async (route) => {
    const data = route.request().postDataJSON();
    assert.equal(data.operation, "change-password");
    assert.equal(data.credentialMethod, "google");
    return route.fulfill({
      status: 400,
      json: {
        message: "Fixture confirmation expired. Confirm this action again."
      }
    });
  });
  await page
    .locator('#account-change-password-form button[type="submit"]')
    .click();
  await page
    .getByText("Fixture confirmation expired. Confirm this action again.", {
      exact: false
    })
    .waitFor();
  await page
    .getByRole("button", {
      name: "Sign in with Google to confirm setting your password",
      exact: true
    })
    .waitFor();
  assert.match(page.url(), /settings\/security\/password$/);
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { id: a.id } }))
      .passwordHash,
    null
  );
  await page.unroute("**/api/platform/account");
  await page.unroute("**/api/platform/google");
  await page.unroute("**/api/platform/settings");
  ok(
    "Simulated expired-confirmation UI clears apparent readiness and asks for a new proof while keeping the intended detail"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify({ results, errors, providerUiSimulated: true }, null, 2)
  );
  console.log("SECURITY_SETTINGS_BROWSER_PASS " + results.length);
} finally {
  await browser.close();
  await db.$disconnect();
}
