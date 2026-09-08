// Browser checks use an isolated profile, not a person's password vault.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { request as httpsRequest } from "node:https";
const modulePath =
  process.env.PLAYWRIGHT_MODULE ??
  `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`;
export async function checkAccountBrowser({
  origin,
  identity,
  output,
  certificate,
  onRegistered,
  beforeLogin
}) {
  assert.ok(
    origin === "https://godschurches.com" ||
      /^https:\/\/127\.0\.0\.1:\d+$/.test(origin)
  );
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const { chromium } = createRequire(modulePath)("playwright");
  const args = [];
  if (certificate) {
    assert.match(origin, /127\.0\.0\.1/);
    const pub = execFileSync("openssl", [
      "x509",
      "-in",
      certificate,
      "-pubkey",
      "-noout"
    ]);
    const der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], {
      input: pub
    });
    args.push(
      "--ignore-certificate-errors-spki-list=" +
        createHash("sha256").update(der).digest("base64")
    );
  }
  const options = {
    headless: true,
    executablePath:
      process.env.CHROMIUM_PATH ??
      `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium`,
    args,
    viewport: { width: 390, height: 844 },
    ignoreHTTPSErrors: false
  };
  const get = (path, headers) =>
    new Promise((resolve, reject) => {
      const r = httpsRequest(
        new URL(path, origin),
        { headers, ca: certificate ? readFileSync(certificate) : undefined },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (v) => (body += v));
          res.on("end", () =>
            resolve({ status: res.statusCode, headers: res.headers, body })
          );
        }
      );
      r.on("error", () => reject(Error("Verified HTTPS browser check failed")));
      r.end();
    });
  const result = {
    checks: [],
    pageErrors: 0,
    externalRequestsBlocked: 0,
    passwordManagerVaultTested: false
  };
  const pass = (label) => {
    result.checks.push(label);
    writeFileSync(output + "/result.json", JSON.stringify(result, null, 2), {
      mode: 0o600
    });
  };
  let context;
  const open = async () => {
    const c = await chromium.launchPersistentContext(
      output + "/browser-profile",
      options
    );
    c.on("page", (p) => p.on("pageerror", () => result.pageErrors++));
    await c.route("**/*", (route) =>
      new URL(route.request().url()).origin === origin
        ? route.continue()
        : (result.externalRequestsBlocked++, route.abort())
    );
    return c;
  };
  try {
    context = await open();
    await context.clearCookies();
    let page = await context.newPage();
    for (const width of [320, 390, 1440])
      for (const path of ["/platform/login", "/platform/signup"]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(origin + path, { waitUntil: "networkidle" });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1
          )
        );
        assert.equal(await page.locator('form[id^="account-"]').count(), 1);
        const form = page.locator('form[id^="account-"]');
        assert.equal(await form.getAttribute("method"), "post");
        const email = form.locator('input[name="email"]');
        assert.equal(await email.getAttribute("autocomplete"), "username");
        assert.equal(await email.getAttribute("type"), "email");
        const ids = await form
          .locator("input")
          .evaluateAll((inputs) =>
            inputs.map((i) => ({ id: i.id, labels: i.labels.length }))
          );
        assert.ok(ids.every((i) => i.id && i.labels));
        assert.equal(new Set(ids.map((i) => i.id)).size, ids.length);
        assert.equal(
          await form.locator('[name="password"]').getAttribute("autocomplete"),
          path.endsWith("signup") ? "new-password" : "current-password"
        );
        if (path.endsWith("signup"))
          assert.equal(
            await form
              .locator('[name="username"]')
              .getAttribute("autocomplete"),
            "off"
          );
        await page.screenshot({
          path: `${output}/${path.endsWith("signup") ? "signup" : "login"}-${width}.png`,
          fullPage: true
        });
        pass(`semantic form and no horizontal overflow: ${path} ${width}px`);
      }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + "/platform/login");
    let submissions = 0;
    page.on("request", (r) => {
      if (r.url().endsWith("/api/platform/account") && r.method() === "POST")
        submissions++;
    });
    await page.locator("#account-login-email").fill("invalid-email");
    await page.locator("#account-login-password").fill(identity.password);
    await page.locator("#account-login-form button[type=submit]").click();
    assert.equal(submissions, 0);
    assert.equal(
      await page
        .locator("#account-login-email")
        .evaluate((el) => el.validity.typeMismatch),
      true
    );
    pass("browser validity rejects malformed email without a network request");
    await page.goto(origin + "/platform/signup");
    for (const [name, value] of Object.entries({
      name: identity.name,
      username: identity.username,
      email: identity.email,
      password: identity.password,
      confirmPassword: identity.password
    }))
      await page.locator(`#account-register-form [name="${name}"]`).fill(value);
    await page
      .getByRole("button", { name: "Show password", exact: true })
      .click();
    assert.equal(
      await page.locator("#account-register-password").getAttribute("type"),
      "text"
    );
    await page
      .getByRole("button", { name: "Hide password", exact: true })
      .click();
    const registered = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/platform/account") &&
        r.request().method() === "POST"
    );
    await page.locator("#account-register-form button[type=submit]").click();
    assert.equal((await registered).status(), 200);
    await page.waitForURL(origin + "/platform/login");
    await page.locator("#account-login-form").waitFor();
    assert.equal(await page.locator("#account-register-form").count(), 0);
    assert.equal(
      await page.locator("#account-login-email").inputValue(),
      identity.email
    );
    assert.match(
      await page.locator("main").innerText(),
      /Registration never changes an existing account/
    );
    assert.ok(!page.url().includes(identity.email));
    assert.equal(
      (await context.cookies()).filter(
        (c) => c.name === "church_platform_session"
      ).length,
      0
    );
    await onRegistered();
    pass(
      "real registration commits, then distinct neutral sign-in without issuing a session"
    );
    const enterLogin = async () => {
      await beforeLogin?.();
      // Simulate a manager filling DOM values without React input/change events.
      await page.evaluate(
        ({ email, password }) => {
          document.querySelector("#account-login-email").value = email;
          document.querySelector("#account-login-password").value = password;
        },
        { email: identity.email, password: identity.password }
      );
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/platform/account") &&
          r.request().method() === "POST"
      );
      await page.locator("#account-login-form button[type=submit]").click();
      assert.equal((await response).status(), 200);
      await page.waitForURL(origin + "/platform");
    };
    await enterLogin();
    assert.equal(await page.locator("#account-login-form").count(), 0);
    pass(
      "event-free DOM autofill submits current credentials and removes sign-in form"
    );
    const cookies = (await context.cookies()).filter(
      (c) => c.name === "church_platform_session"
    );
    assert.equal(cookies.length, 1);
    const cookie = cookies[0];
    assert.ok(
      cookie.secure &&
        cookie.httpOnly &&
        cookie.sameSite === "Lax" &&
        cookie.path === "/"
    );
    assert.ok(cookie.expires > Date.now() / 1000 + 29 * 86400);
    pass("persistent Secure/HttpOnly/SameSite=Lax host-scoped cookie");
    await page.goto(origin + "/platform/profile/me", {
      waitUntil: "networkidle"
    });
    assert.equal(await page.locator("#profile-bio").inputValue(), "");
    assert.equal(await page.locator("#profile-interests").inputValue(), "");
    await page.locator("#profile-bio").fill("Account persistence check.");
    await page.locator("#profile-location").fill("Fictional Town");
    await page.locator("#profile-website").fill("https://example.test/");
    await page.locator("#profile-interests").fill("Prayer, Gardening");
    await page
      .getByRole("button", { name: "Save profile", exact: true })
      .click();
    await page.waitForURL(origin + "/platform/profile/" + identity.username);
    await page.reload();
    assert.ok(
      (await page.locator("main").innerText()).includes(
        "Account persistence check."
      )
    );
    const tab = await context.newPage();
    await tab.goto(origin + "/platform/profile/me");
    assert.equal(
      await tab.locator("#profile-bio").inputValue(),
      "Account persistence check."
    );
    await tab.close();
    pass("profile save survives full reload and authenticated new tab");
    const storage = await page.evaluate(() => ({
      local: JSON.stringify(localStorage),
      session: JSON.stringify(sessionStorage)
    }));
    for (const value of [identity.email, identity.password, cookie.value])
      assert.ok(
        !storage.local.includes(value) && !storage.session.includes(value)
      );
    for (const path of [
      "/platform",
      "/platform/profile/" + identity.username,
      "/platform/profile/me",
      "/platform/search?q=Account"
    ])
      for (const rsc of [false, true]) {
        const r = await get(path, {
          Cookie: `church_platform_session=${cookie.value}`,
          ...(rsc ? { RSC: "1" } : {})
        });
        assert.equal(r.status, 200);
        const body = r.body;
        for (const secret of [identity.email, identity.password, cookie.value])
          assert.ok(!body.includes(secret));
      }
    pass(
      "authenticated HTML/RSC and application storage omit credential material"
    );
    await context.close();
    context = await open();
    page = await context.newPage();
    await page.goto(origin + "/platform/profile/me");
    assert.equal(
      await page.locator("#profile-bio").inputValue(),
      "Account persistence check."
    );
    pass("persistent session survives actual browser-process close and reopen");
    const logout = page.getByRole("button", { name: /log out/i });
    await logout.click();
    await page.waitForURL(origin + "/platform/login");
    const denied = await get("/platform/profile/me", {
      Cookie: `church_platform_session=${cookie.value}`
    });
    assert.equal(denied.status, 307);
    pass("logout invalidates the prior server session");
    await enterLogin();
    await page.goto(origin + "/platform/profile/me");
    assert.equal(
      await page.locator("#profile-bio").inputValue(),
      "Account persistence check."
    );
    pass("fresh sign-in loads the saved profile");
    assert.equal(result.pageErrors, 0);
    result.passed = true;
    pass("no browser JavaScript errors");
    return result;
  } finally {
    await context?.close();
  }
}
