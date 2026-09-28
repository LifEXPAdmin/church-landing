import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { resolve } from "node:path";

// Inject only harmless markup into intercepted fictional local responses. This
// tests the browser's defense, not the existence of an application injection bug.
const fixture = resolve(process.argv[2] ?? ".account-test/script-csp");
assert.ok(fixture.startsWith(resolve(".account-test") + "/"));
const config = JSON.parse(readFileSync(fixture + "/browser-env.json", "utf8"));
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
const reproduce = process.argv.includes("--reproduce");
const publicKey = execFileSync("openssl", [
  "x509",
  "-in",
  config.certificate,
  "-pubkey",
  "-noout"
]);
const der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], {
  input: publicKey
});
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ??
    `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`
)("playwright");
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: [
    "--ignore-certificate-errors-spki-list=" +
      createHash("sha256").update(der).digest("base64"),
    "--no-proxy-server"
  ]
});
const output =
  fixture + "/" + (reproduce ? "baseline-" : "verified-") + Date.now();
mkdirSync(output, { recursive: true });
const checks = [],
  errors = [],
  violations = [],
  reports = [],
  blockedRequests = [];
try {
  const context = await browser.newContext();
  let policy;
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== config.origin) {
      blockedRequests.push({ kind: "external", method: request.method() });
      return route.abort();
    }
    if (
      url.pathname === "/api/security/csp-report" &&
      request.method() === "POST"
    ) {
      reports.push(request.postDataJSON());
      // The dedicated report-route tests exercise delivery. Do not write even
      // limiter rows during this markup-only reproduction.
      return route.fulfill({ status: 204 });
    }
    if (!["GET", "HEAD"].includes(request.method())) {
      blockedRequests.push({ kind: "mutation", method: request.method() });
      return route.abort();
    }
    if (url.pathname === "/fictional-csp-sentinel.js")
      return route.fulfill({
        contentType: "application/javascript",
        body: "window.__cspExternal = true;"
      });
    if (url.pathname === "/about" && request.isNavigationRequest()) {
      const response = await route.fetch();
      policy = response.headers()["content-security-policy"] ?? "";
      const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
      const markup = `<script>window.__cspInline = true;</script>
        <script src="/fictional-csp-sentinel.js"></script>
        <script ${nonce ? `nonce="${nonce}"` : ""}>window.__cspTrusted = true; try { new Function('window.__cspEval = true')(); } catch { window.__cspEvalBlocked = true; }</script>
        <button id="fictional-csp-event" onclick="window.__cspEvent = true">Fictional event sentinel</button>`;
      return route.fulfill({
        response,
        body: (await response.text()).replace("</body>", markup + "</body>")
      });
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (/Content Security Policy|content security policy/i.test(message.text()))
      violations.push(message.text());
  });
  await page.goto(config.origin + "/about", { waitUntil: "networkidle" });
  await page.locator("#fictional-csp-event").click();
  const observed = await page.evaluate(() => ({
    inline: window.__cspInline === true,
    external: window.__cspExternal === true,
    event: window.__cspEvent === true,
    eval: window.__cspEval === true,
    trusted: window.__cspTrusted === true,
    evalBlocked: window.__cspEvalBlocked === true
  }));
  assert.deepEqual(
    observed,
    reproduce
      ? {
          inline: true,
          external: true,
          event: true,
          eval: true,
          trusted: true,
          evalBlocked: false
        }
      : {
          inline: false,
          external: false,
          event: false,
          eval: false,
          trusted: true,
          evalBlocked: true
        }
  );
  checks.push({
    check:
      "Parser-inserted inline/external scripts, event handlers and trusted-script eval",
    observed,
    policy
  });
  if (!reproduce) {
    await context.close();
    const clean = await browser.newContext({
      extraHTTPHeaders: {
        "x-gc-csp-nonce": "caller-controlled",
        "content-security-policy": "script-src 'unsafe-inline'",
        "content-security-policy-report-only": "script-src 'nonce-attacker'"
      }
    });
    const cleanErrors = [],
      cleanPolicyErrors = [],
      cleanMutations = [];
    await clean.route("**/*", (route) => {
      const request = route.request();
      if (
        new URL(request.url()).origin !== config.origin ||
        !["GET", "HEAD"].includes(request.method())
      ) {
        cleanMutations.push(request.method());
        return route.abort();
      }
      return route.continue();
    });
    const ordinary = await clean.newPage();
    ordinary.on("pageerror", (error) => cleanErrors.push(error.message));
    ordinary.on("console", (message) => {
      if (
        /Content Security Policy|content security policy/i.test(message.text())
      )
        cleanPolicyErrors.push(message.text());
    });
    const nonces = new Set();
    for (const path of [
      ...config.publicRoutes,
      "/platform/login",
      "/platform/media",
      "/about",
      "/about"
    ]) {
      const start = Date.now();
      const response = await ordinary.goto(config.origin + path, {
        waitUntil: "networkidle"
      });
      assert.ok(response);
      const headers = response.headers();
      assert.match(headers["cache-control"], /no-store/);
      const nonce =
        headers["content-security-policy"]?.match(/'nonce-([^']+)'/)?.[1];
      assert.match(nonce ?? "", /^[A-Za-z0-9+/]{32}$/);
      assert.ok(!nonces.has(nonce), "Each document needs fresh authority");
      nonces.add(nonce);
      const scripts = await ordinary
        .locator("script")
        .evaluateAll((elements) =>
          elements.map((el) => ({ type: el.type, nonce: el.nonce }))
        );
      assert.ok(scripts.length > 0);
      assert.ok(
        scripts.every((script) => script.nonce === nonce),
        `${path} must nonce all framework and authored scripts`
      );
      checks.push({
        check: "Document scripts, spoof rejection and cache boundary",
        path,
        status: response.status(),
        scriptCount: scripts.length,
        ms: Date.now() - start
      });
    }
    await ordinary.goto(config.origin + "/about", { waitUntil: "networkidle" });
    const marker = await ordinary.evaluate(() => {
      window.__cspNavigation = "same-document";
      return window.__cspNavigation;
    });
    await ordinary
      .getByRole("navigation", { name: "Website", exact: true })
      .getByRole("link", { name: "Help", exact: true })
      .click();
    await ordinary.waitForURL(config.origin + "/help");
    await ordinary.getByRole("heading", { level: 1 }).waitFor();
    assert.equal(
      await ordinary.evaluate(() => window.__cspNavigation),
      marker,
      "Next link remains client navigation"
    );
    await ordinary.goBack();
    await ordinary.waitForURL(config.origin + "/about");
    await ordinary
      .getByRole("link", { name: "Sign in", exact: true })
      .first()
      .click();
    await ordinary.waitForURL(config.origin + "/platform/login");
    await ordinary
      .getByLabel("Password", { exact: true })
      .fill("Fictional input, never submitted");
    assert.equal(
      await ordinary.getByLabel("Password", { exact: true }).inputValue(),
      "Fictional input, never submitted"
    );
    checks.push({
      check: "Hydrated client navigation, Back, lazy sign-in controls"
    });
    const worker = await ordinary.evaluate(async () => {
      const registration = await navigator.serviceWorker.register(
        "/notification-worker.js",
        { scope: "/", updateViaCache: "none" }
      );
      await navigator.serviceWorker.ready;
      return {
        scope: registration.scope,
        removed: await registration.unregister()
      };
    });
    assert.equal(worker.scope, config.origin + "/");
    assert.equal(worker.removed, true);
    checks.push({
      check:
        "Same-origin notification worker registration without subscription or permission prompt"
    });
    for (const authorization of [
      undefined,
      "Basic !!!",
      "Basic " + Buffer.from("wrong:wrong").toString("base64")
    ]) {
      const response = await clean.request.get(config.origin + "/admin", {
        headers: authorization ? { authorization } : {}
      });
      assert.ok([401, 500].includes(response.status()));
      assert.match(
        response.headers()["content-security-policy"],
        /script-src .*'nonce-/
      );
      assert.match(response.headers()["cache-control"], /no-store/);
    }
    checks.push({
      check:
        "Admin denial remains isolated and protected, including malformed credentials"
    });
    assert.deepEqual(cleanErrors, []);
    assert.deepEqual(cleanPolicyErrors, []);
    assert.deepEqual(cleanMutations, []);
    await clean.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(blockedRequests, []);
  const receipt = {
    at: new Date().toISOString(),
    reproduce,
    source: config.source,
    buildId: config.buildId,
    checks,
    errors,
    violations,
    reports: reports.length,
    applicationWrites: 0,
    providerRequests: 0,
    simulatedMarkupOnly: true
  };
  writeFileSync(output + "/receipt.json", JSON.stringify(receipt, null, 2));
  console.log(
    JSON.stringify({
      output,
      checks: checks.length,
      reproduced: reproduce,
      observed,
      applicationWrites: 0
    })
  );
} finally {
  await browser.close();
}
