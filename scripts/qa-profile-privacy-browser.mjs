import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";

// Run from the immutable candidate with its existing isolated HTTPS fixture.
// PROFILE_PRIVACY_HEADFUL=1 additionally exercises an actual background tab.
const fixture = resolve(process.argv[2] ?? "");
assert.ok(
  process.argv[2],
  "Pass an existing isolated browser fixture directory"
);
const config = JSON.parse(
  readFileSync(join(fixture, "browser-env.json"), "utf8")
);
const origin = new URL(config.origin);
assert.equal(origin.protocol, "https:");
assert.ok(["127.0.0.1", "localhost"].includes(origin.hostname));
assert.ok(origin.port);
assert.equal(origin.origin, config.origin);
const database = new URL(config.database);
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.pathname, "/godschurches_security_test");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: join(fixture, "sink"),
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  MEDIA_STORAGE_MODE: "local-test",
  MEDIA_TEST_DIR: join(fixture, "images"),
  PERSONAL_PHOTO_LIBRARY_ENABLED: "true",
  NODE_ENV: "test",
  VERCEL: ""
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase } = await import("../tests/seed-portal.ts");
const { registerAccount, loginAccount, updateAccountProfile } =
  await import("../lib/platform/accounts.ts");
const { getProfileEditor } = await import("../lib/platform/profiles.ts");
const { ADULT_POLICY } = await import("../lib/platform/portal-types.ts");
const { uploadImage } = await import("../lib/platform/media.ts");
const sharp = (await import("sharp")).default;
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ??
    `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`
)("playwright");
const certificate = readFileSync(config.certificate);
const publicKey = execFileSync("openssl", ["x509", "-pubkey", "-noout"], {
  input: certificate
});
const der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], {
  input: publicKey
});
const headful = process.env.PROFILE_PRIVACY_HEADFUL === "1";
const output = join(
  fixture,
  `profile-privacy-browser-${Date.now()}-${randomUUID().slice(0, 8)}`
);
mkdirSync(output, { recursive: false, mode: 0o700 });
const hash = (value) => createHash("sha256").update(value).digest("hex");
const receipt = {
  startedAt: new Date().toISOString(),
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8"
  }).trim(),
  buildId: readFileSync(".next/BUILD_ID", "utf8").trim(),
  harnessSha256: hash(readFileSync(fileURLToPath(import.meta.url))),
  origin: config.origin,
  headful,
  lifecycleMethod: headful
    ? "Actual browser background-tab blur plus explicitly identified synthetic offline/pagehide signals"
    : "Synthetic blur/offline/pagehide/focus signals; native foreground acceptance requires the headful run",
  cases: [],
  passed: [],
  pageErrors: [],
  routeErrors: [],
  blockedExternal: [],
  fictionalActors: [],
  fixtureProfileSaves: 0,
  fixtureMediaUploads: 0,
  globalAuthLimitReset: false,
  productionWrites: 0,
  providerRequests: 0,
  scope:
    "Version-checked profile saves. Exact retries do not imply schema idempotency or receipt replay."
};
const secrets = [config.database];
const clean = (value) =>
  secrets.reduce(
    (text, secret) => text.replaceAll(secret, "[redacted]"),
    String(value)
  );
const persist = () =>
  writeFileSync(
    join(output, "receipt.json"),
    JSON.stringify(receipt, null, 2) + "\n",
    { mode: 0o600 }
  );
const ok = (message) => {
  receipt.passed.push(message);
  persist();
  console.log("PASS " + message);
};
const contexts = new Set(),
  holds = new Set(),
  handlingRoutes = new Set();
let browser, currentPage;
const button = (page, name) => page.getByRole("button", { name, exact: true });
const pulse = (page, name) =>
  page.evaluate((value) => window.dispatchEvent(new Event(value)), name);
const profileRead = (url) =>
  url.pathname === "/api/platform/profile" && !url.search;
const accountWrite = (url) =>
  url.pathname === "/api/platform/account" && !url.search;

async function actor(label) {
  const tag = randomBytes(5).toString("hex"),
    username = `priv_${label}_${tag}`;
  const password = `Fictional-only-${randomBytes(16).toString("hex")}`;
  secrets.push(password);
  const created = await registerAccount(db, {
    name: `Fictional ${label} ${tag}`,
    username,
    email: `${username}@example.test`,
    password,
    confirmPassword: password,
    role: "BELIEVER"
  });
  // Owner-scoped eligibility seed, not a provider verification claim. Do not use
  // createPortalActor: that older helper globally deletes limiter rows.
  await db.platformUser.update({
    where: { id: created.id },
    data: {
      emailVerifiedAt: new Date(),
      adultAcknowledgedAt: new Date(),
      adultPolicyVersion: ADULT_POLICY,
      metricExcluded: true
    }
  });
  const token = await loginAccount(
    db,
    `${username}@example.test`,
    password,
    "fictional-profile-privacy"
  );
  secrets.push(token);
  receipt.fictionalActors.push(created.id);
  return { id: created.id, username, token };
}
async function savedState(owner) {
  const view = await getProfileEditor(db, owner.token);
  return {
    id: view.id,
    role: view.role,
    locationAudience: view.locationAudience,
    profileVersion: view.presentation.version,
    locationVersion: view.locationVersion,
    contentSha256: hash(
      JSON.stringify({
        name: view.name,
        bio: view.bio,
        location: view.location,
        website: view.website,
        interests: view.interests,
        presentation: view.presentation
      })
    )
  };
}
async function seedProfile(owner, label) {
  const prior = await getProfileEditor(db, owner.token);
  const values = {
    location: `Only me ${label}`,
    bio: `Saved biography ${label}`
  };
  await updateAccountProfile(
    db,
    owner.token,
    {
      name: prior.name,
      ...values,
      website: "",
      interests: "",
      locationAudience: "ONLY_ME",
      expectedVersion: prior.presentation.version,
      expectedLocationVersion: prior.locationVersion
    },
    owner.id
  );
  receipt.fixtureProfileSaves++;
  return values;
}
async function signIn(context, owner) {
  await context.clearCookies();
  await context.addCookies([
    {
      name: sessionCookieFixtureName(config.origin),
      value: owner.token,
      url: config.origin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
}
async function newCase(name, replacement, { open = true, photo = false } = {}) {
  const owner = await actor(name.slice(0, 7));
  const saved = await seedProfile(owner, randomBytes(5).toString("hex"));
  if (photo) {
    const bytes = await sharp({
      create: { width: 1200, height: 900, channels: 3, background: "#397186" }
    })
      .png()
      .toBuffer();
    await uploadImage(
      db,
      owner.token,
      {
        targetId: owner.id,
        purpose: "PROFILE_AVATAR",
        requestKey: randomUUID(),
        alt: `Fictional saved portrait ${owner.id}`
      },
      bytes
    );
    receipt.fixtureMediaUploads++;
  }
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: "America/Chicago",
    serviceWorkers: "block"
  });
  contexts.add(context);
  await context.route(
    (url) => url.origin !== config.origin,
    async (route) => {
      const url = new URL(route.request().url());
      try {
        receipt.blockedExternal.push({
          origin: url.origin,
          path: url.pathname
        });
        await route.abort("blockedbyclient");
      } catch (error) {
        receipt.routeErrors.push(clean(error.message));
        persist();
      }
    }
  );
  const page = await context.newPage();
  currentPage = page;
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(30000);
  const details = {
    name,
    ownerId: owner.id,
    writes: [],
    observations: [],
    before: await savedState(owner),
    replacementBefore: await savedState(replacement)
  };
  receipt.cases.push(details);
  page.on("pageerror", (error) =>
    receipt.pageErrors.push({ case: name, message: clean(error.message) })
  );
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (accountWrite(url) && request.method() === "POST") {
      const body = request.postDataJSON();
      details.writes.push({
        operation: body.operation,
        owner: request.headers()["x-expected-account"] ?? null,
        bodySha256: hash(request.postData() ?? ""),
        expectedVersion: body.expectedVersion,
        expectedLocationVersion: body.expectedLocationVersion
      });
    }
  });
  const s = {
    owner,
    replacement,
    saved,
    context,
    page,
    details,
    markers: Object.values(saved)
  };
  await signIn(context, owner);
  if (open) await openEditor(s);
  return s;
}
async function openEditor(s) {
  const response = await s.page.goto(config.origin + "/platform/profile/me");
  assert.equal(response.status(), 200);
  await s.page.locator("#profile-location").waitFor();
  assert.equal(
    await s.page.locator("#profile-location").inputValue(),
    s.saved.location
  );
}
async function fillDraft(s, complete = false) {
  const tag = randomBytes(5).toString("hex");
  s.draft = {
    "#profile-location": `Private draft ${tag}`,
    "#profile-bio": `Biography draft ${tag}`
  };
  if (complete)
    Object.assign(s.draft, {
      "#profile-name": `Fictional retained name ${tag}`,
      "#profile-testimony": `Testimony draft ${tag}`,
      "#profile-skills": `Listening ${tag}\nGardening ${tag}`,
      "#profile-link-label-0": `Fictional link ${tag}`,
      "#profile-link-url-0": `https://example.test/${tag}`,
      "#profile-introduction": `Introduction draft ${tag}`,
      "#profile-interests": `Music ${tag}, service`,
      "#profile-website": `https://example.test/site-${tag}`,
      "#profile-event-link": `${config.origin}/platform/events/typed-${tag}`
    });
  for (const [selector, value] of Object.entries(s.draft))
    await s.page.locator(selector).fill(value);
  if (complete) {
    s.choices = {
      "#profile-role": "EXPLORING_FAITH",
      "#profile-location-audience": "MEMBERS",
      "#profile-palette": "warm",
      "#profile-background": "lines",
      "#profile-order": "posts-first"
    };
    for (const [selector, value] of Object.entries(s.choices))
      await s.page.locator(selector).selectOption(value);
    const down = s.page.getByRole("button", { name: /^Move .+ down$/ }).first();
    await down.click();
    s.moduleOrder = await moduleOrder(s.page);
  }
  s.markers.push(...Object.values(s.draft));
}
const moduleOrder = (page) =>
  page.locator("#account-profile-form ol").innerText();
async function assertDraft(s) {
  await s.page.locator("#profile-location").waitFor();
  for (const [selector, value] of Object.entries({ ...s.draft, ...s.choices }))
    assert.equal(
      await s.page.locator(selector).inputValue(),
      value,
      selector + " retained"
    );
  if (s.moduleOrder) assert.equal(await moduleOrder(s.page), s.moduleOrder);
}
async function absent(s, stage, extra = []) {
  await s.page.waitForFunction(
    () =>
      !document.querySelector(
        "#profile-location, #profile-bio, #profile-event-link, #avatar-zoom, #latest-profile-heading"
      ),
    undefined,
    { polling: 100 }
  );
  const markers = [...s.markers, ...extra];
  const state = await s.page.evaluate((markers) => {
    const serialized = document.documentElement.outerHTML;
    const content =
      (document.body.textContent ?? "") +
      "\n" +
      [...document.querySelectorAll("input,textarea,select")]
        .map((node) => node.value)
        .join("\n");
    return {
      path: location.pathname,
      leaked: markers.filter(
        (value) => serialized.includes(value) || content.includes(value)
      ),
      privateControls: document.querySelectorAll(
        "#account-profile-form input, #account-profile-form textarea, #account-profile-form select"
      ).length,
      privateImages: document.querySelectorAll(
        ".gc-profile-editor img, .gc-photo-viewer"
      ).length
    };
  }, markers);
  assert.deepEqual(
    state.leaked,
    [],
    stage + ": all DOM including scripts and control values is private-free"
  );
  assert.equal(
    state.privateControls,
    0,
    stage + ": fields removed, not CSS-hidden"
  );
  assert.equal(state.privateImages, 0, stage + ": media presentation removed");
  s.details.observations.push({ stage, ...state });
  persist();
}
async function resume(s) {
  await pulse(s.page, "focus");
  await s.page.locator("#profile-location").waitFor();
}
async function replace(s) {
  await signIn(s.context, s.replacement);
  await pulse(s.page, "focus");
  await s.page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .waitFor();
  await absent(s, "replacement owner denied");
}
async function finish(s) {
  assert.deepEqual(
    await savedState(s.replacement),
    s.details.replacementBefore,
    "Replacement account unchanged"
  );
  s.details.after = await savedState(s.owner);
  s.details.completedAt = new Date().toISOString();
  persist();
  await s.page.unrouteAll({ behavior: "wait" });
  await s.context.unrouteAll({ behavior: "wait" });
  await s.context.close();
  contexts.delete(s.context);
}

// Forward only the intercepted local request through a certificate-pinned Node
// connection. Avoid global TLS bypasses and logging request cookies or bodies.
async function forwarded(route) {
  const request = route.request(),
    url = new URL(request.url());
  assert.equal(url.origin, config.origin);
  const headers = { ...(await request.allHeaders()) };
  delete headers["accept-encoding"];
  return new Promise((resolveResponse, reject) => {
    const outgoing = httpsRequest(
      url,
      {
        method: request.method(),
        headers,
        ca: certificate,
        agent: false,
        timeout: 20000
      },
      (incoming) => {
        const chunks = [];
        incoming.on("data", (chunk) => chunks.push(chunk));
        incoming.on("error", reject);
        incoming.on("end", () => {
          const responseHeaders = Object.fromEntries(
            Object.entries(incoming.headers)
              .filter(
                ([name]) =>
                  ![
                    "connection",
                    "transfer-encoding",
                    "content-length"
                  ].includes(name)
              )
              .map(([name, value]) => [
                name,
                Array.isArray(value) ? value.join(", ") : String(value)
              ])
          );
          resolveResponse({
            status: incoming.statusCode,
            headers: responseHeaders,
            body: Buffer.concat(chunks)
          });
        });
      }
    );
    outgoing.on("timeout", () =>
      outgoing.destroy(new Error("Local forwarded response timeout"))
    );
    outgoing.on("error", reject);
    outgoing.end(request.postDataBuffer() ?? undefined);
  });
}
async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Controlled local response did not settle")),
          25000
        );
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function hold(s, match, method) {
  const captured = Promise.withResolvers(),
    released = Promise.withResolvers(),
    done = Promise.withResolvers();
  let used = false;
  const release = () => released.resolve();
  holds.add(release);
  const handler = async (route) => {
    if (used || route.request().method() !== method) return route.fallback();
    used = true;
    handlingRoutes.add(done.promise);
    try {
      const response = await forwarded(route);
      captured.resolve({
        status: response.status,
        body: JSON.parse(response.body.toString())
      });
      await released.promise;
      await route.fulfill(response);
      done.resolve({});
    } catch (error) {
      const failure = clean(error.message);
      receipt.routeErrors.push(failure);
      captured.resolve({ failure });
      done.resolve({ failure });
      await route.abort("failed");
    } finally {
      holds.delete(release);
      handlingRoutes.delete(done.promise);
    }
  };
  await s.page.route(match, handler);
  return {
    captured: async () => {
      const result = await bounded(captured.promise);
      assert.ok(!result.failure, result.failure);
      return result;
    },
    release: async () => {
      release();
      const result = await bounded(done.promise);
      assert.ok(!result.failure, result.failure);
      await s.page.unroute(match, handler);
    }
  };
}
const idleForm = (page) =>
  page.waitForFunction(
    () =>
      document
        .querySelector("#account-profile-form")
        ?.getAttribute("aria-busy") === "false"
  );
async function submitStatus(s, name, expected) {
  const response = s.page.waitForResponse(
    (value) =>
      accountWrite(new URL(value.url())) && value.request().method() === "POST"
  );
  await button(s.page, name).click();
  assert.equal((await response).status(), expected);
  await idleForm(s.page);
}
async function serializerCase(replacement) {
  const s = await newCase("payload", replacement);
  for (const flight of [false, true]) {
    const response = await s.context.request.get(
      config.origin + "/platform/profile/me" + (flight ? "?_rsc=privacy" : ""),
      { headers: flight ? { RSC: "1" } : {} }
    );
    assert.equal(response.status(), 200);
    if (flight)
      assert.match(response.headers()["content-type"], /text\/x-component/);
    const body = await response.text();
    for (const marker of s.markers)
      assert.ok(
        !body.includes(marker),
        "Private profile data omitted from initial HTML/RSC"
      );
    s.details.observations.push({
      kind: flight ? "RSC" : "HTML",
      bytes: Buffer.byteLength(body),
      sha256: hash(body)
    });
    await response.dispose();
  }
  assert.equal(s.details.writes.length, 0);
  ok(
    "Authenticated HTML and real RSC omit Only-me location and biography; client access reads render the current owner"
  );
  await finish(s);
}
async function initialReadCase(replacement, switchAccount) {
  const s = await newCase(
    switchAccount ? "initialswap" : "initialblur",
    replacement,
    { open: false }
  );
  const held = await hold(s, profileRead, "GET");
  const navigation = s.page.goto(config.origin + "/platform/profile/me", {
    waitUntil: "domcontentloaded"
  });
  assert.equal((await navigation).status(), 200);
  assert.equal((await held.captured()).body.id, s.owner.id);
  await pulse(s.page, "blur");
  await absent(s, "initial read held after blur");
  if (switchAccount) await replace(s);
  await held.release();
  await s.page.waitForTimeout(150);
  await absent(s, "late initial snapshot rejected");
  await signIn(s.context, s.owner);
  await resume(s);
  assert.equal(
    await s.page.locator("#profile-location").inputValue(),
    s.saved.location
  );
  assert.equal(s.details.writes.length, 0);
  ok(
    `A held initial private read cannot populate after ${switchAccount ? "account replacement" : "blur"}; a fresh original-owner read recovers`
  );
  await finish(s);
}
async function retentionCase(replacement) {
  const s = await newCase("retained", replacement);
  await fillDraft(s, true);
  if (headful) {
    await s.page.bringToFront();
    await s.page.locator("#profile-bio").focus();
    assert.equal(await s.page.evaluate(() => document.hasFocus()), true);
    await s.page.evaluate(() => {
      window.__profileNativeBlur = 0;
      window.addEventListener("blur", (event) => {
        if (event.isTrusted) window.__profileNativeBlur++;
      });
    });
    const away = await s.context.newPage();
    const foreground = await s.context.newCDPSession(s.page);
    const background = await s.context.newCDPSession(away);
    try {
      // Playwright normally makes every page appear focused. Disable that
      // override so actual tab activation, rather than a synthetic event, blurs.
      await foreground.send("Emulation.setFocusEmulationEnabled", {
        enabled: false
      });
      await background.send("Emulation.setFocusEmulationEnabled", {
        enabled: false
      });
      await s.page.bringToFront();
      await s.page.waitForFunction(() => document.hasFocus());
      await assertDraft(s);
      await s.page.evaluate(() => {
        window.__profileNativeBlur = 0;
      });
      await away.bringToFront();
      await s.page.waitForFunction(() => !document.hasFocus(), undefined, {
        polling: 100
      });
      assert.ok(await s.page.evaluate(() => window.__profileNativeBlur > 0));
      await absent(s, "native background-tab blur");
      await s.page.bringToFront();
      await assertDraft(s);
      s.details.nativeBlurVerified = true;
    } finally {
      await foreground.send("Emulation.setFocusEmulationEnabled", {
        enabled: true
      });
      await foreground.detach();
      await background.detach();
      await away.close();
      await s.page.bringToFront();
    }
  } else {
    await pulse(s.page, "blur");
    await absent(s, "synthetic blur");
    await resume(s);
    await assertDraft(s);
  }
  for (const [hide, show] of [
    ["offline", "online"],
    ["pagehide", "pageshow"]
  ]) {
    await pulse(s.page, hide);
    await absent(s, hide);
    await pulse(s.page, show);
    await assertDraft(s);
  }
  const failIdentity = async (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Fictional identity read unavailable" })
    });
  await s.page.route("**/api/platform/profile?view=identity", failIdentity);
  await pulse(s.page, "blur");
  await pulse(s.page, "focus");
  await s.page
    .getByText("Your sign-in could not be checked. Reconnect and try again.", {
      exact: true
    })
    .waitFor();
  await absent(s, "identity503");
  await s.page.unroute("**/api/platform/profile?view=identity", failIdentity);
  await resume(s);
  await assertDraft(s);
  await pulse(s.page, "blur");
  await replace(s);
  assert.equal(s.details.writes.length, 0);
  await signIn(s.context, s.owner);
  await resume(s);
  await assertDraft(s);
  assert.deepEqual(await savedState(s.owner), s.details.before);
  ok(
    "Text, participation, audience, module order, palette and typed event link survive concealment, failed identity and account replacement without a save"
  );
  for (const [width, size] of [
    [390, "100%"],
    [320, "100%"],
    [320, "200%"]
  ]) {
    await s.page.setViewportSize({ width, height: 844 });
    await s.page.evaluate((size) => {
      document.documentElement.style.fontSize = size;
    }, size);
    assert.ok(
      await s.page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      ),
      `${width}/${size}: no horizontal overflow`
    );
    await s.page.screenshot({
      path: join(output, `retained-${width}-${size.replace("%", "")}.png`),
      fullPage: true
    });
  }
  await s.page.evaluate(() => {
    document.documentElement.style.fontSize = "100%";
  });
  await s.page
    .getByRole("link", { name: "Back to Profile settings", exact: true })
    .focus();
  await s.page.keyboard.press("Enter");
  await s.page
    .getByRole("dialog", { name: "Keep your unsaved changes?", exact: true })
    .waitFor();
  assert.equal(new URL(s.page.url()).pathname, "/platform/profile/me");
  await button(s.page, "Keep editing").click();
  await assertDraft(s);
  ok(
    "Keyboard navigation warns about retained work, and complete drafts fit at 390px, 320px and 200% text"
  );
  await finish(s);
}
async function ownerRefreshCase(replacement) {
  const s = await newCase("refresh", replacement);
  await fillDraft(s, true);
  const documentId = randomUUID();
  await s.page.evaluate((value) => {
    window.__profilePrivacyDocument = value;
  }, documentId);
  async function refreshAs(owner) {
    await signIn(s.context, owner);
    const completed = Promise.withResolvers();
    let handled = false;
    const match = (url) => url.pathname === "/platform/profile/me";
    const handler = async (route) => {
      if (handled || route.request().headers().rsc !== "1")
        return route.fallback();
      handled = true;
      handlingRoutes.add(completed.promise);
      try {
        const response = await forwarded(route);
        assert.equal(response.status, 200);
        assert.match(response.headers["content-type"], /text\/x-component/);
        const body = response.body.toString("utf8");
        assert.ok(
          body.includes(owner.id),
          "Refresh RSC identifies the actual cookie owner"
        );
        for (const marker of s.markers)
          assert.ok(
            !body.includes(marker),
            "Refresh RSC does not serialize retained private fields"
          );
        await route.fulfill(response);
        completed.resolve({
          owner: owner.id,
          bytes: response.body.length,
          sha256: hash(response.body)
        });
      } catch (error) {
        const failure = clean(error.message);
        receipt.routeErrors.push(failure);
        completed.resolve({ failure });
        await route.abort("failed");
      } finally {
        handlingRoutes.delete(completed.promise);
      }
    };
    await s.page.route(match, handler);
    // A replacement tree must keep the original scope concealed. Returning to
    // the original account also requires a fresh owner-bound access read.
    const currentRead =
      owner.id === s.owner.id
        ? s.page.waitForResponse((response) => {
            const url = new URL(response.url());
            return (
              url.pathname === "/api/platform/profile" &&
              url.searchParams.get("view") === "identity" &&
              response.request().headers()["x-expected-account"] === owner.id
            );
          })
        : null;
    await s.page.evaluate(() => {
      if (typeof window.next?.router?.refresh !== "function")
        throw new Error("Installed Next router.refresh is unavailable");
      window.next.router.refresh();
    });
    const result = await bounded(completed.promise);
    assert.ok(!result.failure, result.failure);
    if (currentRead) assert.equal((await currentRead).status(), 200);
    await s.page.unroute(match, handler);
    if (owner.id !== s.owner.id)
      await s.page
        .getByText(
          "This profile editor belongs to the account that opened it. Return to that account to continue your draft, or reload to open the current profile.",
          { exact: true }
        )
        .waitFor();
    else await s.page.locator("#profile-location").waitFor();
    assert.equal(
      await s.page.evaluate(() => window.__profilePrivacyDocument),
      documentId,
      "Router refresh must preserve the original document and mounted draft owner"
    );
    assert.equal(new URL(s.page.url()).pathname, "/platform/profile/me");
    s.details.observations.push({
      stage: "actual owner-prop RSC refresh",
      ...result
    });
  }
  await refreshAs(s.replacement);
  await absent(
    s,
    "replacement props after completed RSC and current-owner read"
  );
  assert.equal(s.details.writes.length, 0);
  await refreshAs(s.owner);
  await assertDraft(s);
  assert.equal(
    await s.page.locator('[name="expectedVersion"]').inputValue(),
    String(s.details.before.profileVersion)
  );
  assert.deepEqual(await savedState(s.owner), s.details.before);
  assert.equal(s.details.writes.length, 0);
  ok(
    "Actual Next router refresh accepts replacement-owner RSC without revealing the original draft, then original-owner refresh restores every draft field and version in the same document without a save"
  );
  await finish(s);
}
async function reviewCase(replacement, switchAccount) {
  const s = await newCase(
    switchAccount ? "reviewswap" : "reviewblur",
    replacement
  );
  await fillDraft(s);
  const newer = await seedProfile(
    s.owner,
    `newer-${randomBytes(5).toString("hex")}`
  );
  const saved = await savedState(s.owner);
  await submitStatus(s, "Save profile", 409);
  const held = await hold(s, profileRead, "GET");
  await button(s.page, "Review latest saved profile").click();
  assert.equal((await held.captured()).body.location, newer.location);
  await pulse(s.page, "blur");
  if (switchAccount) await replace(s);
  await held.release();
  await idleForm(s.page);
  await absent(s, "late review concealed", Object.values(newer));
  await signIn(s.context, s.owner);
  await resume(s);
  await assertDraft(s);
  assert.equal(await s.page.locator("#latest-profile-heading").count(), 0);
  assert.equal(
    await s.page.locator('[name="expectedVersion"]').inputValue(),
    String(s.details.before.profileVersion)
  );
  await button(s.page, "Review latest saved profile").click();
  await s.page
    .getByRole("heading", { name: "Latest saved version", exact: true })
    .waitFor();
  assert.ok(
    (
      await s.page
        .getByRole("region", { name: "Latest saved version" })
        .innerText()
    ).includes(newer.location)
  );
  assert.deepEqual(await savedState(s.owner), saved);
  assert.equal(s.details.writes.length, 1);
  ok(
    `A held review after ${switchAccount ? "replacement" : "blur"} cannot reveal stale values; returning requires deliberate fresh review and preserves original versions`
  );
  await finish(s);
}
async function acceptedCase(replacement, switchAccount) {
  const s = await newCase(
    switchAccount ? "savedswap" : "savedblur",
    replacement
  );
  await fillDraft(s);
  const held = await hold(s, accountWrite, "POST");
  await button(s.page, "Save profile").click();
  const response = await held.captured();
  assert.equal(response.status, 200);
  const accepted = await savedState(s.owner);
  assert.equal(accepted.profileVersion, s.details.before.profileVersion + 1);
  await pulse(s.page, "blur");
  if (switchAccount) await replace(s);
  await held.release();
  await idleForm(s.page);
  await absent(s, "late accepted save stays private");
  assert.equal(new URL(s.page.url()).pathname, "/platform/profile/me");
  await signIn(s.context, s.owner);
  await resume(s);
  await assertDraft(s);
  await button(s.page, "Continue to saved profile").waitFor();
  assert.equal(
    new URL(s.page.url()).pathname,
    "/platform/profile/me",
    "Focus must not navigate automatically"
  );
  await button(s.page, "Continue to saved profile").click();
  await s.page.waitForURL(
    config.origin + `/platform/profile/${s.owner.username}`
  );
  assert.equal(s.details.writes.length, 1, "Continuing is read-only");
  assert.deepEqual(await savedState(s.owner), accepted);
  ok(
    `Accepted save delayed through ${switchAccount ? "replacement" : "blur"} remains in the editor until current original-owner confirmation and explicit Continue`
  );
  await finish(s);
}
async function retryCase(replacement) {
  const s = await newCase("exactretry", replacement);
  await fillDraft(s);
  let attempts = 0,
    originalBody,
    accepted;
  const handler = async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    try {
      const body = route.request().postData();
      if (!originalBody) originalBody = body;
      else
        assert.equal(
          body,
          originalBody,
          "Every uncertain retry sends byte-identical values and versions"
        );
      assert.equal(route.request().headers()["x-expected-account"], s.owner.id);
      attempts++;
      if (attempts === 1) {
        const response = await forwarded(route);
        assert.equal(response.status, 200);
        accepted = await savedState(s.owner);
        return route.abort("failed");
      }
      if (attempts <= 4)
        return route.fulfill({
          status: [429, 503, 401][attempts - 2],
          contentType: "application/json",
          headers: attempts === 2 ? { "retry-after": "1" } : {},
          body: JSON.stringify({ message: "Fictional uncertain response" })
        });
      return route.fulfill(await forwarded(route));
    } catch (error) {
      receipt.routeErrors.push(clean(error.message));
      await route.abort("failed");
    }
  };
  await s.page.route(accountWrite, handler);
  await button(s.page, "Save profile").click();
  await s.page
    .getByText(
      "We could not confirm the save. Your entries and original request are retained. Retry that request or review the saved profile.",
      { exact: true }
    )
    .waitFor();
  assert.equal(accepted.profileVersion, s.details.before.profileVersion + 1);
  for (const status of [429, 503, 401]) {
    await pulse(s.page, "blur");
    await absent(s, `original retained before ${status}`);
    await resume(s);
    await assertDraft(s);
    await submitStatus(s, "Retry original save", status);
    assert.deepEqual(
      await savedState(s.owner),
      accepted,
      `${status}: no second server effect`
    );
  }
  await pulse(s.page, "blur");
  await replace(s);
  assert.equal(
    attempts,
    4,
    "Replacement must not submit the original owner's request"
  );
  await signIn(s.context, s.owner);
  await resume(s);
  await assertDraft(s);
  await submitStatus(s, "Retry original save", 409);
  assert.equal(attempts, 5);
  assert.equal(new Set(s.details.writes.map((row) => row.bodySha256)).size, 1);
  assert.equal(await button(s.page, "Retry original save").count(), 0);
  assert.equal(
    await s.page.locator('[name="expectedVersion"]').inputValue(),
    String(s.details.before.profileVersion)
  );
  assert.equal(await button(s.page, "Save profile").isDisabled(), true);
  await button(s.page, "Review latest saved profile").click();
  await s.page
    .getByRole("heading", { name: "Latest saved version", exact: true })
    .waitFor();
  assert.equal(
    await s.page.locator('[name="expectedVersion"]').inputValue(),
    String(s.details.before.profileVersion),
    "Review alone cannot adopt"
  );
  await button(s.page, "Keep my edits and use this version").click();
  await idleForm(s.page);
  assert.equal(
    await s.page.locator('[name="expectedVersion"]').inputValue(),
    String(accepted.profileVersion)
  );
  await assertDraft(s);
  assert.equal(await button(s.page, "Save profile").isEnabled(), true);
  assert.deepEqual(
    await savedState(s.owner),
    accepted,
    "Explicit version adoption does not save"
  );
  await s.page.unroute(accountWrite, handler);
  const change = `New deliberate edit ${randomBytes(5).toString("hex")}`;
  await s.page.locator("#profile-bio").fill(change);
  await button(s.page, "Save profile").click();
  await s.page.waitForURL(
    config.origin + `/platform/profile/${s.owner.username}`
  );
  assert.equal(s.details.writes.length, 6);
  assert.notEqual(
    s.details.writes[5].bodySha256,
    s.details.writes[0].bodySha256
  );
  assert.equal(s.details.writes[5].expectedVersion, accepted.profileVersion);
  assert.equal((await getProfileEditor(db, s.owner.token)).bio, change);
  assert.equal(
    (await savedState(s.owner)).profileVersion,
    accepted.profileVersion + 1
  );
  ok(
    "Lost accepted save retains exact bytes through 429/503/401 and account replacement; actual 409 requires deliberate review and version adoption before a new save"
  );
  await finish(s);
}
async function stopCase(replacement) {
  const s = await newCase("stopretry", replacement);
  await fillDraft(s);
  const fail = (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Fictional unavailable save" })
    });
  await s.page.route(accountWrite, fail);
  await submitStatus(s, "Save profile", 503);
  let answer = "dismiss";
  const decisions = [];
  const dialog = async (value) => {
    assert.equal(value.type(), "confirm");
    assert.match(value.message(), /may already be saved/);
    decisions.push(answer);
    await value[answer]();
  };
  s.page.on("dialog", dialog);
  await button(s.page, "Stop retrying and review").click();
  await button(s.page, "Retry original save").waitFor();
  answer = "accept";
  await button(s.page, "Stop retrying and review").click();
  await idleForm(s.page);
  assert.equal(await button(s.page, "Retry original save").count(), 0);
  assert.equal(await button(s.page, "Save profile").isDisabled(), true);
  await assertDraft(s);
  assert.deepEqual(decisions, ["dismiss", "accept"]);
  assert.deepEqual(await savedState(s.owner), s.details.before);
  assert.equal(s.details.writes.length, 1);
  s.page.off("dialog", dialog);
  await s.page.unroute(accountWrite, fail);
  await button(s.page, "Review latest saved profile").click();
  await button(s.page, "Keep my edits and use this version").waitFor();
  ok(
    "Stopping an uncertain retry requires explicit confirmation, keeps the draft, sends nothing and still requires reviewing the current saved version"
  );
  await finish(s);
}
async function validationCase(replacement, kind) {
  const s = await newCase(`valid${kind}`, replacement);
  await fillDraft(s);
  let attempts = 0,
    originalBody;
  const handler = async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    attempts++;
    const body = route.request().postData();
    if (!originalBody) originalBody = body;
    else
      assert.equal(
        body,
        originalBody,
        "Prior uncertain POST prevents validation from dropping the original request"
      );
    if (kind === "uncertain" && attempts === 1) return route.abort("failed");
    const tagged = kind !== "untagged";
    return route.fulfill({
      status: 400,
      contentType: "application/json",
      headers: tagged ? { "x-account-code": "ACCOUNT_PROFILE_VALIDATION" } : {},
      body: JSON.stringify({
        message: "Fictional profile validation. Check these entries.",
        ...(tagged ? { code: "ACCOUNT_PROFILE_VALIDATION" } : {})
      })
    });
  };
  await s.page.route(accountWrite, handler);
  if (kind === "uncertain") {
    await button(s.page, "Save profile").click();
    await s.page
      .getByText(
        "We could not confirm the save. Your entries and original request are retained. Retry that request or review the saved profile.",
        { exact: true }
      )
      .waitFor();
    await pulse(s.page, "blur");
    await absent(s, "uncertain save before tagged400");
    await resume(s);
    await assertDraft(s);
    await submitStatus(s, "Retry original save", 400);
    assert.equal(attempts, 2);
    assert.equal(
      new Set(s.details.writes.map((row) => row.bodySha256)).size,
      1
    );
  } else await submitStatus(s, "Save profile", 400);
  await assertDraft(s);
  assert.equal(
    await s.page.locator('[name="expectedVersion"]').inputValue(),
    String(s.details.before.profileVersion)
  );
  if (kind === "first") {
    assert.equal(await s.page.locator("#profile-bio").isEnabled(), true);
    assert.equal(await button(s.page, "Save profile").isEnabled(), true);
    assert.equal(await button(s.page, "Retry original save").count(), 0);
    await s.page
      .getByText("Fictional profile validation. Check these entries.", {
        exact: true
      })
      .waitFor();
    await s.page
      .locator("#profile-bio")
      .fill("A corrected fictional biography");
  } else {
    assert.equal(await s.page.locator("#profile-bio").isDisabled(), true);
    await button(s.page, "Retry original save").waitFor();
    assert.equal(await button(s.page, "Save profile").isDisabled(), true);
  }
  assert.deepEqual(await savedState(s.owner), s.details.before);
  await s.page.unroute(accountWrite, handler);
  ok(
    kind === "first"
      ? "A first, explicitly tagged validation400 restores editable draft fields without changing versions or saving"
      : kind === "untagged"
        ? "An untagged400 cannot prove rollback and retains the exact original request for deliberate retry or review"
        : "A tagged400 after an uncertain original POST cannot discard that command or rebase its bytes and versions"
  );
  await finish(s);
}
async function photoCase(replacement) {
  const s = await newCase("photokeep", replacement, { photo: true });
  await fillDraft(s);
  const avatar = s.page.getByRole("region", {
    name: "Profile photo",
    exact: true
  });
  await avatar.getByRole("button", { name: /^Enlarge / }).click();
  const viewer = s.page.getByRole("dialog", {
    name: "Photo viewer",
    exact: true
  });
  await viewer.waitFor();
  await viewer.locator("img").waitFor();
  const history = await s.page.evaluate(() => ({
    length: window.history.length,
    key: window.history.state.gcPhotoViewer
  }));
  assert.equal(typeof history.key, "string");
  await pulse(s.page, "blur");
  await absent(s, "viewer concealed");
  assert.equal(await s.page.evaluate(() => document.body.style.overflow), "");
  await resume(s);
  await viewer.waitFor();
  await viewer.locator("img").waitFor();
  assert.deepEqual(
    await s.page.evaluate(() => ({
      length: window.history.length,
      key: window.history.state.gcPhotoViewer
    })),
    history,
    "Concealment preserves exactly one mounted viewer history entry"
  );
  await button(s.page, "Close photo").click();
  await viewer.waitFor({ state: "detached" });
  assert.equal(new URL(s.page.url()).pathname, "/platform/profile/me");
  await assertDraft(s);
  const bytes = await sharp({
    create: { width: 1000, height: 800, channels: 3, background: "#864973" }
  })
    .png()
    .toBuffer();
  await avatar.locator('input[type="file"]').setInputFiles({
    name: "fictional-retained.png",
    mimeType: "image/png",
    buffer: bytes
  });
  await s.page.locator("#avatar-zoom").fill("1.5");
  const preview = await avatar
    .locator('img[alt="Selected photo crop preview"]')
    .getAttribute("src");
  assert.match(preview, /^blob:/);
  await pulse(s.page, "pagehide");
  await absent(s, "selected crop concealed", [preview]);
  await pulse(s.page, "pageshow");
  await assertDraft(s);
  assert.equal(await s.page.locator("#avatar-zoom").inputValue(), "1.5");
  assert.equal(
    await avatar
      .locator('img[alt="Selected photo crop preview"]')
      .getAttribute("src"),
    preview
  );
  assert.equal(
    await button(s.page, "Save profile").isDisabled(),
    true,
    "Selected photo still owns unsaved work"
  );
  assert.equal(
    await db.mediaAsset.count({ where: { uploaderId: s.owner.id } }),
    1
  );
  assert.equal(s.details.writes.length, 0);
  ok(
    "Saved photo viewer removes private DOM and scroll lock, restores with one history entry, and unsent photo/crop plus sibling text survive pagehide without upload"
  );
  await finish(s);
}

async function chooserTransitionCase(replacement) {
  const s = await newCase("chooser", replacement);
  await fillDraft(s);
  const avatar = s.page.getByRole("region", {
    name: "Profile photo",
    exact: true
  });
  const filename = `fictional-chooser-${randomBytes(5).toString("hex")}.png`;
  const bytes = await sharp({
    create: { width: 1000, height: 800, channels: 3, background: "#627349" }
  })
    .png()
    .toBuffer();
  let uploads = 0;
  s.page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === "/api/platform/images" &&
      request.method() === "POST"
    )
      uploads++;
  });
  async function concealedChooser(files) {
    const choose = avatar.locator("label.gc-profile-file-label");
    assert.equal((await choose.textContent()).trim(), "Choose avatar");
    const [chooser] = await Promise.all([
      s.page.waitForEvent("filechooser"),
      choose.click()
    ]);
    const target = chooser.element();
    await pulse(s.page, "blur");
    await absent(s, "controlled chooser blur", [filename]);
    assert.equal(
      await target.evaluate((input) => input.isConnected),
      true,
      "The actual chooser target must stay mounted while concealed"
    );
    await chooser.setFiles(files);
    assert.deepEqual(
      await target.evaluate((input) => ({
        value: input.value,
        files: input.files.length,
        hidden: input.closest("label").hidden,
        inert: input.closest("label").inert
      })),
      { value: "", files: 0, hidden: true, inert: true },
      "Returning a chooser stores no filename or FileList in concealed DOM"
    );
    await absent(s, "controlled chooser returned while concealed", [filename]);
    await resume(s);
    await assertDraft(s);
  }
  await concealedChooser({
    name: filename,
    mimeType: "image/png",
    buffer: bytes
  });
  await s.page.locator("#avatar-zoom").waitFor();
  await avatar.getByText(`Selected: ${filename}`, { exact: true }).waitFor();
  await s.page.locator("#avatar-zoom").fill("1.75");
  const preview = await avatar
    .locator('img[alt="Selected photo crop preview"]')
    .getAttribute("src");
  assert.match(preview, /^blob:/);
  await concealedChooser([]);
  await avatar.getByText(`Selected: ${filename}`, { exact: true }).waitFor();
  assert.equal(await s.page.locator("#avatar-zoom").inputValue(), "1.75");
  assert.equal(
    await avatar
      .locator('img[alt="Selected photo crop preview"]')
      .getAttribute("src"),
    preview,
    "An empty chooser result preserves the previous File and crop"
  );
  assert.equal(
    await avatar
      .locator('input[type="file"]')
      .evaluate((input) => input.files.length),
    0
  );
  assert.equal(await button(s.page, "Save profile").isDisabled(), true);
  assert.equal(uploads, 0);
  assert.equal(s.details.writes.length, 0);
  assert.equal(
    await db.mediaAsset.count({ where: { uploaderId: s.owner.id } }),
    0
  );
  assert.deepEqual(await savedState(s.owner), s.details.before);
  s.details.observations.push({
    stage: "chooser return and empty selection",
    chooserEvents: 2,
    method:
      "Actual Playwright filechooser events with synthetic blur and controlled setFiles; not an operating-system picker test",
    browserUploads: uploads,
    inputFileListEntries: 0
  });
  ok(
    "Controlled chooser return after blur preserves the private File and crop while clearing input value/FileList; an empty second chooser keeps the prior selection without upload"
  );
  await finish(s);
}

try {
  browser = await chromium.launch({
    headless: !headful,
    executablePath:
      process.env.CHROMIUM_PATH ??
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: [
      "--no-proxy-server",
      "--ignore-certificate-errors-spki-list=" +
        createHash("sha256").update(der).digest("base64")
    ]
  });
  const replacement = await actor("other");
  await serializerCase(replacement);
  await initialReadCase(replacement, false);
  await initialReadCase(replacement, true);
  await retentionCase(replacement);
  await ownerRefreshCase(replacement);
  await reviewCase(replacement, false);
  await reviewCase(replacement, true);
  await acceptedCase(replacement, false);
  await acceptedCase(replacement, true);
  await retryCase(replacement);
  await stopCase(replacement);
  await validationCase(replacement, "first");
  await validationCase(replacement, "untagged");
  await validationCase(replacement, "uncertain");
  await photoCase(replacement);
  await chooserTransitionCase(replacement);
  assert.deepEqual(receipt.routeErrors, []);
  assert.deepEqual(receipt.pageErrors, []);
  assert.deepEqual(
    receipt.blockedExternal,
    [],
    "No attempted provider or external image requests"
  );
  receipt.outcome = "passed";
  receipt.passedGroups = receipt.passed.length;
  receipt.completedAt = new Date().toISOString();
  persist();
  console.log(
    JSON.stringify({
      outcome: receipt.outcome,
      passed: receipt.passedGroups,
      output,
      accountPostAttempts: receipt.cases.reduce(
        (n, row) => n + row.writes.length,
        0
      ),
      productionWrites: 0
    })
  );
} catch (error) {
  receipt.outcome = "failed";
  receipt.failure = clean(error.message);
  receipt.failureStack = clean(error.stack);
  receipt.passedGroups = receipt.passed.length;
  receipt.completedAt = new Date().toISOString();
  if (currentPage && !currentPage.isClosed()) {
    try {
      await currentPage.screenshot({
        path: join(output, "failure.png"),
        fullPage: true
      });
    } catch (captureError) {
      receipt.captureFailure = clean(captureError.message);
    }
  }
  persist();
  console.error("FAIL " + receipt.failure);
  process.exitCode = 1;
} finally {
  for (const release of holds) release();
  if (handlingRoutes.size) {
    try {
      await bounded(Promise.all([...handlingRoutes]));
    } catch (error) {
      receipt.routeErrors.push(clean(error.message));
      persist();
    }
  }
  for (const context of contexts) {
    for (const page of context.pages())
      await page.unrouteAll({ behavior: "wait" });
    await context.unrouteAll({ behavior: "wait" });
    await context.close();
  }
  await browser?.close();
  await db.$disconnect();
}
