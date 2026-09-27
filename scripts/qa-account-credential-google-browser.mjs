import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { request as httpsRequest } from "node:https";
assert.ok(process.argv[2], "Pass the isolated credential environment JSON");
const config = JSON.parse(readFileSync(process.argv[2], "utf8"));
const prefix = config.fixture + "/credential-google-browser";
const source = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: config.candidate,
  encoding: "utf8"
}).trim();
assert.equal(source, config.source);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
assert.ok(Number(new URL(config.database).port) > 1024);
assert.equal(new URL(config.database).pathname, "/godschurches_security_test");
Object.assign(process.env, JSON.parse(readFileSync(config.testEnv, "utf8")), {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.localOrigin,
  NEXT_PUBLIC_SITE_URL: config.localOrigin,
  NODE_ENV: "test",
  VERCEL: "",
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: config.fixture + "/google-baseline-sink",
  ACCOUNT_GOOGLE_ENABLED: "true",
  GOOGLE_CLIENT_ID: "fixture.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "fictional-google-baseline-secret",
  AUTH_RATE_LIMIT_SECRET:
    "fictional-google-baseline-budget-" + randomBytes(10).toString("hex")
});
const require = createRequire(config.candidate + "/package.json");
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
const mod = (name) => import(pathToFileURL(config.candidate + "/" + name).href);
const { assertPortalTestDatabase } = await mod("tests/seed-portal.ts");
await assertPortalTestDatabase(db);
const { registerAccount, loginAccount } = await mod("lib/platform/accounts.ts");
const { hashSessionToken, createSessionToken } = await mod(
  "lib/platform/auth.ts"
);
const { requestEmailChange } = await mod(
  "lib/platform/account-email-change.ts"
);
const { handleAccountRequest } = await mod("lib/platform/account-boundary.ts");
const results = [],
  actors = [],
  errors = [];
async function actor() {
  const username = "gbase_" + randomBytes(6).toString("hex");
  const email = username + "@example.test",
    password = "Fictional-baseline-" + randomBytes(12).toString("hex");
  await registerAccount(db, {
    username,
    name: "Fictional Google Baseline",
    email,
    password,
    confirmPassword: password,
    role: "BELIEVER"
  });
  const user = await db.platformUser.findUniqueOrThrow({ where: { username } });
  const token = await loginAccount(db, email, password, null);
  const a = { ...user, token, password };
  actors.push(a.id);
  return a;
}
async function proof(a, purpose) {
  const identity = await db.platformGoogleIdentity.upsert({
    where: { userId: a.id },
    create: {
      userId: a.id,
      issuer: "https://accounts.google.com",
      subject: "fictional_" + randomBytes(12).toString("hex")
    },
    update: {}
  });
  const session = await db.platformSession.findUniqueOrThrow({
    where: { tokenHash: hashSessionToken(a.token) }
  });
  const token = createSessionToken();
  await db.platformRecentAuthentication.create({
    data: {
      userId: a.id,
      sessionId: session.id,
      googleIdentityId: identity.id,
      credentialVersion: session.credentialVersion,
      purpose,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + 300000)
    }
  });
  return token;
}
const { chromium } = createRequire(
  process.env.HOME +
    "/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json"
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
      createHash("sha256").update(der).digest("base64"),
    "--host-resolver-rules=MAP mfa-fixture.example.test 127.0.0.1",
    "--no-proxy-server"
  ]
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }
});
let externalAttempts = 0,
  actualCredentialCommands = 0,
  simulatedReauthRequests = 0;
await context.route("**/*", (route) => {
  if (new URL(route.request().url()).hostname !== "mfa-fixture.example.test") {
    externalAttempts++;
    return route.abort();
  }
  return route.continue();
});
const page = await context.newPage();
page.on("pageerror", () =>
  errors.push("Browser page error (details omitted to preserve credentials)")
);
const signIn = async (a) => {
  await context.clearCookies();
  await context.addCookies([
    {
      name: "church_platform_session",
      value: a.token,
      url: config.origin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
};
const forward = async (route) => {
  const incoming = route.request(),
    headers = await incoming.allHeaders(),
    pathname =
      new URL(incoming.url()).pathname + new URL(incoming.url()).search;
  return new Promise((resolve, reject) => {
    const r = httpsRequest(
      config.localOrigin + pathname,
      {
        method: incoming.method(),
        ca: readFileSync(config.certificate),
        headers: {
          host: new URL(config.origin).host,
          origin: config.origin,
          cookie: headers.cookie ?? "",
          "content-type": "application/json"
        }
      },
      (res) => {
        let body = "";
        res.on("data", (x) => (body += x));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      }
    );
    r.on("error", () => reject(new Error("Loopback request failed")));
    r.end(incoming.postData() ?? undefined);
  });
};
let stage = "starting";
try {
  const a = await actor();
  await context.route("**/api/platform/settings", async (route) => {
    const response = await forward(route);
    assert.equal(response.status, 200);
    const data = JSON.parse(response.body);
    data.googleAvailable = true;
    data.methods = { password: true, google: true };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data)
    });
  });
  for (const event of ["blur", "pagehide", "account replacement"]) {
    stage = "Google redirect after " + event;
    await signIn(a);
    let release, arrived, handled;
    const gate = new Promise((r) => (release = r)),
      reached = new Promise((r) => (arrived = r)),
      settled = new Promise((r) => (handled = r));
    const googleRoute = async (route) => {
      const body = route.request().postDataJSON();
      if (body.operation === "status")
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            signedIn: true,
            methods: { password: true, google: true },
            recentPurpose: null,
            emailConfirmationReady: false,
            pending: null
          })
        });
      assert.equal(body.operation, "reauthenticate");
      assert.equal(body.purpose, "change-password");
      simulatedReauthRequests++;
      arrived();
      await gate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          redirect: "/platform/login?notice=fictional-google-baseline"
        })
      });
      handled();
    };
    await context.route("**/api/platform/google", googleRoute);
    await page.goto(config.origin + "/platform/settings/security/password");
    await page.getByRole("button", { name: "Use Google", exact: true }).click();
    await page
      .getByRole("button", {
        name: "Sign in with Google to confirm setting your password",
        exact: true
      })
      .click();
    await reached;
    const originalUrl = page.url();
    if (event === "account replacement") await signIn(await actor());
    else
      await page.evaluate(
        (event) => window.dispatchEvent(new Event(event)),
        event
      );
    if (event !== "account replacement")
      await page.waitForFunction(
        () => document.querySelector("#account-change-password-form") === null
      );
    const beforeRequests = simulatedReauthRequests;
    release();
    await settled;
    await page.waitForTimeout(250);
    await page.waitForFunction(
      () => document.querySelector("#account-change-password-form") === null
    );
    assert.equal(page.url(), originalUrl);
    assert.equal(simulatedReauthRequests, beforeRequests);
    await signIn(a);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page
      .getByRole("button", {
        name: "Sign in with Google to confirm setting your password",
        exact: true
      })
      .waitFor();
    assert.equal(simulatedReauthRequests, beforeRequests);
    await page
      .getByRole("button", {
        name: "Sign in with Google to confirm setting your password",
        exact: true
      })
      .click();
    await page.waitForURL("**/platform/login?notice=fictional-google-baseline");
    assert.equal(simulatedReauthRequests, beforeRequests + 1);
    results.push({
      kind: "browser Google initiation lifecycle",
      event,
      lateRedirectOccurred: false,
      explicitVisibleRetryNavigates: true,
      providerResponse:
        "fictional same-origin redirect; actual Google transport disabled"
    });
    writeFileSync(
      prefix + "-result.json",
      JSON.stringify({ source, stage, results }, null, 2),
      { mode: 0o600 }
    );
    await context.unroute("**/api/platform/google", googleRoute);
  }
  await context.unroute("**/api/platform/settings");
  const replacement = await actor();
  for (const operation of ["change-password", "confirm-email-change"]) {
    stage = "Newer Google proof cookie after " + operation;
    const original = await actor();
    let emailToken;
    if (operation === "confirm-email-change") {
      const send = await requestEmailChange(
        db,
        original.token,
        original.password,
        "changed_" + randomBytes(8).toString("hex") + "@example.test",
        async (_e, _p, t) => (emailToken = t)
      );
      await send();
    }
    const oldProof = await proof(original, operation);
    const response = await handleAccountRequest(
      db,
      new Request(config.localOrigin + "/api/platform/account", {
        method: "POST",
        headers: {
          Origin: config.localOrigin,
          "Content-Type": "application/json",
          "X-Expected-Account": original.id,
          Cookie:
            "church_platform_session=" +
            original.token +
            "; __Host-gc_google_recent=" +
            oldProof
        },
        body: JSON.stringify({
          operation,
          credentialMethod: "google",
          ...(operation === "change-password"
            ? {
                password: original.password + "-new",
                confirmPassword: original.password + "-new"
              }
            : { token: emailToken })
        })
      })
    );
    assert.equal(response.status, 200);
    actualCredentialCommands++;
    const newer = await proof(replacement, operation);
    await signIn(replacement);
    await context.addCookies([
      {
        name: "__Host-gc_google_recent",
        value: newer,
        url: config.origin,
        secure: true,
        httpOnly: true,
        sameSite: "Lax"
      }
    ]);
    const newerStoredBefore = (await context.cookies()).some(
      (c) => c.name === "__Host-gc_google_recent" && c.value === newer
    );
    assert.ok(newerStoredBefore);
    const responseHeaders = Object.fromEntries(response.headers);
    const cookieHeaders = response.headers.getSetCookie();
    if (cookieHeaders.length)
      responseHeaders["set-cookie"] = cookieHeaders.join("\n");
    const payload = await response.text();
    const delayed = (route) =>
      route.fulfill({
        status: response.status,
        headers: responseHeaders,
        body: payload
      });
    await page.route("**/api/platform/account", delayed);
    const browserStatus = await page.evaluate(
      async () =>
        (
          await fetch("/api/platform/account", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ operation: "change-password" })
          })
        ).status
    );
    assert.equal(browserStatus, 200);
    const cookies = await context.cookies();
    const newerCookieSurvives = cookies.some(
      (c) => c.name === "__Host-gc_google_recent" && c.value === newer
    );
    const newerProofRemainsInDb =
      (await db.platformRecentAuthentication.count({
        where: { tokenHash: hashSessionToken(newer) }
      })) === 1;
    assert.equal(newerCookieSurvives, true);
    assert.ok(newerProofRemainsInDb);
    assert.ok(
      cookies.some(
        (c) =>
          c.name === "church_platform_session" && c.value === replacement.token
      )
    );
    results.push({
      kind: "real candidate service response applied by browser",
      operation,
      status: response.status,
      newerStoredBefore,
      newerCookieSurvives,
      newerProofRemainsInDb,
      replacementSessionCookieSurvives: true,
      clearsRecentCookie: cookieHeaders.some((c) =>
        c.startsWith("__Host-gc_google_recent=;")
      )
    });
    await page.unroute("**/api/platform/account", delayed);
  }
  assert.equal(externalAttempts, 0);
  assert.deepEqual(errors, []);
  const finalSource = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: config.candidate,
    encoding: "utf8"
  }).trim();
  assert.equal(finalSource, source);
  const receipt = {
    outcome: "passed",
    source,
    candidate: config.candidate,
    at: new Date().toISOString(),
    results,
    fictionalActors: actors.length,
    actualCredentialCommands,
    simulatedReauthRequests,
    externalAttempts,
    productionWrites: 0,
    sourceUnchanged: true,
    limits: [
      "Google redirect response was injected; provider remains disabled.",
      "Google cookie responses came from actual candidate handleAccountRequest with fictional proof rows and were applied through browser route fulfillment; not the disabled server Google HTTP branch.",
      "No secrets, provider payloads or screenshots recorded."
    ]
  };
  writeFileSync(prefix + "-result.json", JSON.stringify(receipt, null, 2), {
    mode: 0o600
  });
  console.log(
    JSON.stringify({
      outcome: receipt.outcome,
      groups: results.length,
      actualCredentialCommands,
      simulatedReauthRequests,
      externalAttempts,
      source
    })
  );
} catch (e) {
  writeFileSync(
    prefix + "-failure.json",
    JSON.stringify(
      {
        stage,
        source,
        results,
        errorName: e?.name ?? "Error",
        message: "Failure details omitted to avoid credential exposure"
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  console.error(
    "Google acceptance stopped at " +
      stage +
      " (" +
      (e?.name ?? "Error") +
      "); private sanitized failure receipt saved."
  );
  process.exitCode = 1;
} finally {
  await browser.close();
  await db.$disconnect();
}
