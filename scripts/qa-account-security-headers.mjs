import assert from "node:assert/strict";
import { createServer } from "node:https";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { homedir } from "node:os";

const fixture = resolve(process.argv[2] ?? ".account-test/security-headers");
assert.ok(fixture.startsWith(resolve(".account-test") + "/"));
const config = JSON.parse(readFileSync(fixture + "/browser-env.json", "utf8"));
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
const reproduce = process.argv.includes("--reproduce");
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
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ??
    `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`
)("playwright");
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROMIUM_PATH ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: [
    "--ignore-certificate-errors-spki-list=" +
      createHash("sha256").update(der).digest("base64"),
    "--no-proxy-server"
  ]
});
const embedder = createServer(
  { key: readFileSync(config.key), cert: readFileSync(config.certificate) },
  (_req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    res.end(
      `<!doctype html><html><head><title>Fictional frame boundary</title></head><body><h1>Fictional embedding origin</h1><iframe title="Framed sign-in" src="${config.origin}/platform/login" width="600" height="700"></iframe></body></html>`
    );
  }
);
await new Promise((done, fail) => {
  embedder.once("error", fail);
  embedder.listen(0, "127.0.0.1", done);
});
const embeddingOrigin = `https://127.0.0.1:${embedder.address().port}`;
const output = fixture + "/security-headers-" + Date.now();
mkdirSync(output, { recursive: true });
const checks = [],
  errors = [],
  deniedMutations = [],
  policyMessages = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1000, height: 900 }
  });
  await context.route("**/*", (route) => {
    const request = route.request();
    if (!["GET", "HEAD"].includes(request.method())) {
      deniedMutations.push(request.method());
      return route.abort();
    }
    return [config.origin, embeddingOrigin].includes(
      new URL(request.url()).origin
    )
      ? route.continue()
      : route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.text().includes("frame-ancestors"))
      policyMessages.push(message.text());
  });
  for (const path of [
    "/",
    "/platform",
    "/platform/login",
    "/platform/settings",
    "/api/platform/settings",
    "/api/platform/account",
    "/missing-security-fixture",
    "/manifest.webmanifest"
  ]) {
    const response = await context.request.get(config.origin + path, {
      ignoreHTTPSErrors: true
    });
    const headers = response.headers();
    if (reproduce && path === "/platform/login") {
      assert.equal(headers["content-security-policy"], undefined);
      assert.equal(headers["x-frame-options"], undefined);
      assert.equal(headers["x-content-type-options"], undefined);
    } else if (!reproduce) {
      assert.match(
        headers["content-security-policy"],
        /frame-ancestors 'none'/
      );
      assert.match(headers["content-security-policy"], /object-src 'none'/);
      assert.match(headers["content-security-policy"], /base-uri 'none'/);
      assert.equal(headers["x-content-type-options"], "nosniff");
      assert.equal(headers["x-frame-options"], "DENY");
    }
    if (path.startsWith("/platform") || path.startsWith("/api/platform")) {
      assert.match(headers["cache-control"], /no-store/);
      assert.equal(headers["referrer-policy"], "no-referrer");
    }
    checks.push({
      path,
      status: response.status(),
      headers: Object.fromEntries(
        [
          "content-security-policy",
          "x-frame-options",
          "x-content-type-options"
        ].map((key) => [key, headers[key] ?? null])
      )
    });
  }
  await page.goto(config.origin + "/platform/login");
  await page.getByRole("heading", { name: "Sign in", exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Password", { exact: true }).isEnabled(),
    true
  );
  checks.push({ check: "Top-level sign-in still renders usable controls" });
  const blocked = reproduce
    ? undefined
    : page.waitForEvent("console", {
        predicate: (message) => message.text().includes("frame-ancestors"),
        timeout: 15000
      });
  await page.goto(embeddingOrigin);
  const framed = page.frameLocator('iframe[title="Framed sign-in"]');
  if (reproduce) {
    await framed
      .getByRole("heading", { name: "Sign in", exact: true })
      .waitFor();
    assert.equal(
      await framed.getByLabel("Password", { exact: true }).isEnabled(),
      true
    );
    checks.push({
      check:
        "Reproduced sign-in rendered in an independent origin frame; no input or submit"
    });
  } else {
    await blocked;
    assert.equal(
      await framed
        .getByRole("heading", { name: "Sign in", exact: true })
        .count(),
      0
    );
    assert.equal(
      await framed.getByLabel("Password", { exact: true }).count(),
      0
    );
    checks.push({
      check: "Browser policy rejects cross-origin sign-in embedding"
    });
  }
  await page.screenshot({
    path: output + "/frame-boundary.png",
    fullPage: true
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(deniedMutations, []);
  const result = {
    at: new Date().toISOString(),
    reproduce,
    checks,
    errors,
    policyDenials: policyMessages.length,
    applicationWrites: 0,
    recipientSends: 0
  };
  writeFileSync(output + "/receipt.json", JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({
      output,
      checks: checks.length,
      reproduced: reproduce,
      policyDenials: policyMessages.length,
      applicationWrites: 0
    })
  );
} finally {
  await browser.close();
  await new Promise((done) => embedder.close(done));
}
