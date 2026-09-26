// Run from the inspected candidate with its TypeScript resolver registered.
// node --import ./tests/register.mjs <script> <fixture> [receipt.json]
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";

const root = process.cwd();
assert.ok(process.argv[2], "Pass an existing isolated HTTPS fixture directory");
const fixture = resolve(process.argv[2]);
assert.ok(fixture.startsWith(resolve(root, ".account-test") + "/"));
const outputArgument = process.argv[3]?.startsWith("--")
  ? undefined
  : process.argv[3];
const output = resolve(
  outputArgument ??
    resolve(fixture, "menu-choice-privacy-" + Date.now() + ".json")
);
const config = JSON.parse(
  readFileSync(resolve(fixture, "browser-env.json"), "utf8")
);
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
assert.match(
  new URL(config.database).pathname,
  /^\/godschurches_security_test(?:_restore)?$/
);
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: resolve(fixture, "sink"),
  RETENTION_TEST_DIR: resolve(fixture, "retention"),
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: "",
  PRIVILEGED_MFA_MODE: "off",
  COMMUNITY_REPORTS_ENABLED: "true",
  SOCIAL_EMAIL_ENABLED: "false",
  PUSH_ENABLED: "false",
  FOUNDER_WELCOME_ENABLED: "false",
  FOUNDER_ANNOUNCEMENTS_ENABLED: "false",
  ACCOUNT_GOOGLE_ENABLED: "false",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  BLOB_READ_WRITE_TOKEN: "",
  BLOB_STORE_ID: "",
  VAPID_PRIVATE_KEY: "",
  VAPID_PUBLIC_KEY: ""
});
const require = createRequire(resolve(root, "package.json"));
const load = (path) => import(pathToFileURL(resolve(root, path)).href);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const git = (...args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
const source = () => {
  const files = git("ls-files", "-z").split("\0").filter(Boolean);
  return {
    head: git("rev-parse", "HEAD").trim(),
    status: git("status", "--porcelain").trim(),
    fileCount: files.length,
    sha256: sha(
      JSON.stringify(
        files.map((path) => [path, sha(readFileSync(resolve(root, path)))])
      )
    )
  };
};
const receipt = {
  startedAt: new Date().toISOString(),
  mode: "verification",
  status: "running",
  root,
  fixture,
  origin: config.origin,
  runnerSha256: sha(readFileSync(fileURLToPath(import.meta.url))),
  sourceBefore: source(),
  groups: [],
  actors: [],
  grants: [],
  fixtureMutations: [],
  requests: [],
  responses: [],
  browserWrites: [],
  errors: [],
  consoleErrors: [],
  routeErrors: [],
  externalRequests: [],
  requestFailures: [],
  observations: [],
  effects: [],
  simulations: [],
  recoveries: [],
  dialogs: [],
  captures: [],
  serviceCommands: [],
  productionWrites: 0,
  externalSends: 0,
  limitations: [
    "Two fictional isolated accounts and one own VIEW_PLATFORM_METRICS grant; no unrelated grants or application records.",
    "Real bounded Menu service and browser saves are owner-scoped; unrelated preferences and other actors remain unchanged.",
    "Authenticated HTML and RSC are actual local responses. Lifecycle signals are synthetic, not physical-device snapshots.",
    "Actor setup clears isolated PlatformAuthLimit rows with counts recorded under exclusive fixture ownership.",
    "Only Menu's opt-in original retry contract includes injected429 and actual revoked-choice403. Other shared-hook callers are outside scope. No production writes or external delivery."
  ]
};
if (process.env.QA_EXPECTED_SOURCE)
  assert.equal(receipt.sourceBefore.head, process.env.QA_EXPECTED_SOURCE);
if (process.env.QA_EXPECTED_FILE_COUNT)
  assert.equal(
    receipt.sourceBefore.fileCount,
    Number(process.env.QA_EXPECTED_FILE_COUNT)
  );
mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
const save = () =>
  writeFileSync(
    output,
    JSON.stringify(
      receipt,
      (_, value) => (typeof value === "bigint" ? value.toString() : value),
      2
    ),
    { mode: 0o600 }
  );
const stage = (name) => {
  receipt.stage = name;
  save();
  console.log("STAGE " + name);
};
const pass = (name) => {
  receipt.groups.push(name);
  save();
  console.log("PASS " + name);
};
save();
const { PrismaClient } = require("@prisma/client");
const { assertPortalTestDatabase, createPortalActor, seedOperatorGrants } =
  await load("tests/seed-portal.ts");
const client = new PrismaClient();
const db = client.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const result = await query(args);
        if (/^(create|update|delete|upsert)/.test(operation))
          receipt.fixtureMutations.push({
            model,
            operation,
            id: typeof result?.id === "string" ? result.id : undefined,
            count: typeof result?.count === "number" ? result.count : undefined,
            authLimitClear:
              model === "PlatformAuthLimit" &&
              operation === "deleteMany" &&
              !args?.where
          });
        return result;
      }
    }
  }
});

let browser, context, page, owner, other, failure;
const rules = [],
  holds = new Set();
const sinksBefore = new Set(readdirSync(resolve(fixture, "sink"))),
  savedIds = ["admin", "calendars", "settings", "qr"];
const editor = () =>
  page.locator("details").filter({
    has: page.locator("summary", { hasText: "Edit Menu shortcuts" })
  });
const login = async (actor) => {
  await context.clearCookies();
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
const frame = () =>
  page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done))
      )
  );
const signal = async (name) => {
  await page.evaluate((name) => window.dispatchEvent(new Event(name)), name);
  receipt.simulations.push({ type: "browser lifecycle event", name });
};
const observe = async (label) => {
  const row = await page.evaluate(() => ({
    savedLinks: [
      ...document.querySelectorAll('ul[aria-label="Saved Menu shortcuts"] a')
    ].map((a) => a.getAttribute("href")),
    checkboxes: document.querySelectorAll('details input[type="checkbox"]')
      .length,
    checkedLabels: [
      ...document.querySelectorAll('details input[type="checkbox"]:checked')
    ].map((n) => n.closest("label").innerText.trim()),
    order: [
      ...document.querySelectorAll('ol[aria-label="Shortcut order"] li>span')
    ].map((n) => n.textContent.trim()),
    derivedAdminLinks: document.querySelectorAll(
      'section[aria-labelledby="menu-admin"] a[href="/platform/admin"]'
    ).length,
    adminChecked: [
      ...document.querySelectorAll('details input[type="checkbox"]:checked')
    ].some((n) => n.closest("label").textContent.trim() === "Admin"),
    hiddenAncestor: !![...document.querySelectorAll("details")]
      .find((n) =>
        n.querySelector("summary")?.textContent.includes("Edit Menu shortcuts")
      )
      ?.closest("[hidden]")
  }));
  receipt.observations.push({ label, ...row });
  save();
  return row;
};
async function setup() {
  stage("seed two scoped accounts and one own Admin capability");
  await assertPortalTestDatabase(db);
  receipt.database =
    await db.$queryRaw`SELECT current_database() AS name,host(inet_server_addr()) AS address,inet_server_port() AS port`;
  owner = await createPortalActor(db, "menu_private");
  other = await createPortalActor(db, "menu_other");
  receipt.actors = [owner, other].map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    username: a.username
  }));
  await seedOperatorGrants(db, owner, ["VIEW_PLATFORM_METRICS"]);
  receipt.grants = await db.platformOperatorGrant.findMany({
    where: { userId: owner.id }
  });
  assert.equal(
    await db.platformOperatorGrant.count({ where: { userId: other.id } }),
    0
  );
  await db.socialPreferences.create({
    data: {
      ownerId: owner.id,
      feedMode: "friends",
      feedVersion: 7,
      mentions: "NOBODY",
      version: 3
    }
  });
  const { readMenuShortcuts, saveMenuShortcuts } = await load(
    "lib/platform/menu-shortcuts.ts"
  );
  const original = await readMenuShortcuts(db, owner.token);
  assert.ok(original.choices.some((c) => c.id === "admin"));
  const body = {
      expectedVersion: original.version,
      ids: savedIds,
      mutationId: randomUUID()
    },
    result = await saveMenuShortcuts(db, owner.token, body);
  receipt.serviceCommands.push({ owner: owner.id, body, result });
  receipt.initial = await readMenuShortcuts(db, owner.token);
  assert.deepEqual(receipt.initial.ids, savedIds);
  const { chromium } = createRequire(
      process.env.PLAYWRIGHT_MODULE ??
        process.env.HOME +
          "/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json"
    )("playwright"),
    pub = execFileSync("openssl", [
      "x509",
      "-in",
      config.certificate,
      "-pubkey",
      "-noout"
    ]),
    der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], {
      input: pub
    });
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROMIUM_PATH ??
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: [
      "--ignore-certificate-errors-spki-list=" +
        createHash("sha256").update(der).digest("base64")
    ]
  });
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block"
  });
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  await context.route(/^https?:\/\//, async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== config.origin) {
      receipt.externalRequests.push(url.origin + url.pathname);
      return route.abort("blockedbyclient");
    }
    const rule = rules.find((rule) => rule.matches(route.request()));
    if (rule) await rule.handler(route);
    else await route.continue();
  });
  context.on("request", (request) => {
    const url = new URL(request.url()),
      row = {
        path: url.pathname + url.search,
        method: request.method(),
        owner: request.headers()["x-expected-account"] ?? null
      };
    receipt.requests.push(row);
    if (!["GET", "HEAD"].includes(row.method))
      receipt.browserWrites.push({ ...row, body: request.postData() });
  });
  context.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/api/platform/"))
      receipt.responses.push({
        path: url.pathname + url.search,
        method: response.request().method(),
        status: response.status()
      });
  });
  context.on("requestfailed", (request) =>
    receipt.requestFailures.push({
      path: new URL(request.url()).pathname,
      method: request.method(),
      error: request.failure()?.errorText
    })
  );
  page.on("pageerror", (e) => receipt.errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error")
      receipt.consoleErrors.push({ text: m.text(), location: m.location() });
  });
  await login(owner);
}

const button = (name) => page.getByRole("button", { name, exact: true });
const menuRead = (request) =>
  request.method() === "GET" &&
  new URL(request.url()).pathname === "/api/platform/menu-shortcuts";
const identityRead = (request) =>
  request.method() === "GET" &&
  new URL(request.url()).pathname === "/api/platform/profile" &&
  new URL(request.url()).searchParams.get("view") === "identity";
const command = (request) =>
  request.method() === "POST" &&
  new URL(request.url()).pathname === "/api/platform/menu-shortcuts";
const retry = () =>
  page
    .getByRole("button", { name: /^Confirm original (save|request)$/ })
    .first();
const readCount = () =>
  receipt.requests.filter(
    (r) => r.method === "GET" && r.path === "/api/platform/menu-shortcuts"
  ).length;
const prefs = () =>
  db.socialPreferences.findUniqueOrThrow({ where: { ownerId: owner.id } });
const savedLinks = () =>
  page.locator('ul[aria-label="Saved Menu shortcuts"] a');
const order = () => page.locator('ol[aria-label="Shortcut order"] li>span');
const stamp = () =>
  page.evaluate((id) => {
    window.__menuChoiceDocument = id;
  }, owner.id);
const sameDocument = async () =>
  assert.equal(
    await page.evaluate(() => window.__menuChoiceDocument),
    owner.id
  );
const openEditor = async () => {
  await editor().waitFor({ state: "visible" });
  if (!(await editor().evaluate((n) => n.open)))
    await editor().locator("summary").click();
  await editor().getByRole("checkbox").first().waitFor();
};
const enabled = async (name) => {
  await button(name).waitFor();
  await page.waitForFunction(
    (name) =>
      [...document.querySelectorAll("button")].some(
        (n) => n.textContent === name && !n.disabled
      ),
    name
  );
};
const noPrivateDom = async (label) => {
  await page.waitForFunction(
    () =>
      !document.querySelector(
        'ul[aria-label="Saved Menu shortcuts"],ol[aria-label="Shortcut order"],details input[type="checkbox"],section[aria-labelledby="menu-admin"],a[href="/platform/admin"]'
      )
  );
  await sameDocument();
  const row = await observe(label);
  assert.equal(
    row.savedLinks.length +
      row.checkboxes +
      row.checkedLabels.length +
      row.order.length +
      row.derivedAdminLinks,
    0
  );
};
const once = (matches, handler) => {
  let used = false;
  const rule = {
    matches: (r) => !used && matches(r),
    handler: async (route) => {
      used = true;
      await handler(route);
    }
  };
  rules.unshift(rule);
  return () => {
    const i = rules.indexOf(rule);
    if (i >= 0) rules.splice(i, 1);
  };
};
const hold = (matches, label, abort = false) => {
  let used = false,
    capture,
    release;
  const captured = new Promise((done) => {
      capture = done;
    }),
    gate = new Promise((done) => {
      release = done;
    });
  const rule = {
    matches: (r) => !used && matches(r),
    handler: async (route) => {
      used = true;
      const response = await route.fetch();
      assert.equal(response.status(), 200, await response.text());
      const data = await response.json();
      receipt.simulations.push({
        type: "held actual response",
        label,
        status: 200,
        body: command(route.request()) ? route.request().postData() : undefined,
        result: data,
        abort
      });
      capture();
      await gate;
      if (abort) await route.abort("failed");
      else await route.fulfill({ response });
    }
  };
  rules.unshift(rule);
  const item = {
    captured,
    release: () => {
      release();
      const i = rules.indexOf(rule);
      if (i >= 0) rules.splice(i, 1);
      holds.delete(item);
    }
  };
  holds.add(item);
  return item;
};
const bounded = async (promise) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error("Held response capture exceeded30seconds")),
          30000
        );
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
};
const waitPrefs = async (ids, version) => {
  for (let i = 0; i < 60; i++) {
    const r = await prefs();
    if (
      JSON.stringify(r.menuShortcutIds) === JSON.stringify(ids) &&
      r.menuShortcutsVersion === version
    )
      return r;
    await new Promise((done) => setTimeout(done, 50));
  }
  throw Error("Expected scoped saved preference state was not observed");
};
const current = async (label) => {
  const response = page.waitForResponse((r) => menuRead(r.request()));
  await signal("focus");
  const r = await response,
    data = await r.json();
  receipt.recoveries.push({
    type: "actual current choices",
    label,
    status: r.status(),
    version: data.version,
    ids: data.ids,
    adminAvailable: data.choices?.some((c) => c.id === "admin")
  });
  return data;
};
const confirm = async (name, accept = true) => {
  const seen = page.waitForEvent("dialog"),
    click = button(name).click(),
    dialog = await seen;
  receipt.dialogs.push({ name, message: dialog.message(), accepted: accept });
  if (accept) await dialog.accept();
  else await dialog.dismiss();
  await click;
};
const exactOperations = async (count) =>
  assert.equal(
    await db.socialOperation.count({
      where: { ownerId: owner.id, key: { startsWith: "menu-shortcuts:" } }
    }),
    count
  );
async function serviceSave(ids, label) {
  const { saveMenuShortcuts } = await load("lib/platform/menu-shortcuts.ts"),
    before = await prefs(),
    body = {
      expectedVersion: before.menuShortcutsVersion,
      ids,
      mutationId: randomUUID()
    },
    result = await saveMenuShortcuts(db, owner.token, body);
  receipt.serviceCommands.push({ owner: owner.id, label, body, result });
  return result.version;
}
async function keyboardFit() {
  await page.setViewportSize({ width: 320, height: 844 });
  for (const enlarged of [false, true]) {
    const style = enlarged
      ? await page.addStyleTag({ content: "html{font-size:200%!important}" })
      : null;
    try {
      for (const name of [
        "Save Menu shortcuts",
        "Discard local shortcut edits"
      ]) {
        const target = button(name);
        await target.focus();
        await page.keyboard.press("Tab");
        await page.keyboard.press("Shift+Tab");
        await target.evaluate((n) =>
          n.scrollIntoView({ block: "center", inline: "nearest" })
        );
        const geometry = await target.evaluate((n) => {
          const b = n.getBoundingClientRect(),
            nav = document
              .querySelector('nav[aria-label="Platform"]')
              ?.getBoundingClientRect(),
            s = getComputedStyle(n),
            hit = document.elementFromPoint(
              (b.left + b.right) / 2,
              (b.top + b.bottom) / 2
            );
          return {
            focused: document.activeElement === n,
            focusVisible: n.matches(":focus-visible"),
            outlineStyle: s.outlineStyle,
            outlineWidth: s.outlineWidth,
            boxShadow: s.boxShadow,
            centerHit: hit === n || n.contains(hit),
            top: b.top,
            bottom: b.bottom,
            availableBottom: nav?.top ?? innerHeight,
            width: innerWidth,
            scrollWidth: document.documentElement.scrollWidth
          };
        });
        const path =
          output.replace(/\.json$/, "") +
          "-320-" +
          (enlarged ? "200-" : "100-") +
          (name.startsWith("Save") ? "save" : "discard") +
          ".png";
        await page.screenshot({ path });
        receipt.captures.push({ path, name, enlarged, geometry });
        save();
        assert.ok(
          geometry.focused && geometry.focusVisible && geometry.centerHit
        );
        assert.ok(
          geometry.top >= 0 && geometry.bottom <= geometry.availableBottom
        );
        assert.ok(
          (geometry.outlineStyle !== "none" &&
            parseFloat(geometry.outlineWidth) > 0) ||
            geometry.boxShadow !== "none"
        );
        assert.ok(geometry.scrollWidth <= 321);
      }
    } finally {
      if (style) await style.evaluate((n) => n.remove());
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
}
async function verifyPrivacy() {
  stage(
    "private saved order/Admin absent from HTML/RSC before fresh client read"
  );
  receipt.serialized = [];
  for (const kind of ["HTML", "RSC"]) {
    const response = await context.request.get(
      config.origin +
        "/platform/menu" +
        (kind === "RSC" ? "?_rsc=" + randomUUID() : ""),
      { headers: kind === "RSC" ? { RSC: "1" } : {} }
    );
    assert.equal(response.status(), 200);
    const body = await response.text(),
      normalized = body.replaceAll('\\"', '"'),
      row = {
        kind,
        status: response.status(),
        contentType: response.headers()["content-type"],
        sha256: sha(body),
        bytes: Buffer.byteLength(body),
        savedOrderedIdsSerialized: normalized.includes(
          '"ids":' + JSON.stringify(savedIds)
        ),
        adminHrefSerialized: body.includes("/platform/admin"),
        derivedAdminSectionSerialized: body.includes("menu-admin")
      };
    receipt.serialized.push(row);
    assert.equal(row.savedOrderedIdsSerialized, false);
    assert.equal(row.adminHrefSerialized, false);
    assert.equal(row.derivedAdminSectionSerialized, false);
    if (kind === "RSC") assert.match(row.contentType, /text\/x-component/);
  }
  const initial = hold(menuRead, "initial current account choices");
  try {
    await page.goto(config.origin + "/platform/menu", {
      waitUntil: "domcontentloaded"
    });
    await stamp();
    await bounded(initial.captured);
    await noPrivateDom("initial choices held");
    initial.release();
    await openEditor();
  } finally {
    initial.release();
  }
  const original = await observe("authorized fresh Menu choices");
  await editor().evaluate((node) => {
    node.dataset.mountMarker = "original-menu-editor";
  });
  assert.equal(original.derivedAdminLinks, 1);
  assert.equal(original.adminChecked, true);
  await editor()
    .getByRole("checkbox", { name: "Exchange", exact: true })
    .check();
  const dirty = await order().allTextContents();
  for (const [hide, resume] of [
    ["blur", "focus"],
    ["offline", "online"],
    ["pagehide", "pageshow"]
  ]) {
    await signal(hide);
    await noPrivateDom("dirty Menu choices " + hide);
    const reads = readCount();
    await signal("social-relationships-changed");
    await frame();
    assert.equal(readCount(), reads);
    await noPrivateDom("concealed relationship signal " + hide);
    const held = hold(identityRead, "owner check " + resume);
    try {
      await signal(resume);
      await bounded(held.captured);
      await noPrivateDom("owner identity held " + resume);
      held.release();
      await openEditor();
      assert.deepEqual(await order().allTextContents(), dirty);
      assert.equal(
        await editor().getAttribute("data-mount-marker"),
        "original-menu-editor"
      );
      assert.equal(await editor().evaluate((node) => node.open), true);
    } finally {
      held.release();
    }
  }
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden"
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  receipt.simulations.push({
    type: "document visibility override",
    state: "hidden"
  });
  await noPrivateDom("hidden document choices");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible"
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await openEditor();
  await page.evaluate(() => {
    delete document.visibilityState;
  });
  assert.deepEqual(await order().allTextContents(), dirty);
  await signal("blur");
  await login(other);
  await signal("focus");
  await page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .waitFor();
  await noPrivateDom("replacement owner choices/Admin denied");
  await login(owner);
  await signal("focus");
  await openEditor();
  assert.deepEqual(await order().allTextContents(), dirty);
  await sameDocument();
  pass(
    "Initial HTML/RSC and concealed DOM contain no saved order, checked controls or derived Admin; original owner recovers its unsaved order after lifecycle and identity changes"
  );
  stage("late queued choice read and503 cannot reopen hidden state");
  await signal("blur");
  const held = hold(
    menuRead,
    "queued current choices released after second conceal"
  );
  try {
    const reads = readCount();
    await signal("focus");
    await bounded(held.captured);
    await noPrivateDom("choice read held");
    await signal("focus");
    await signal("online");
    await frame();
    assert.equal(readCount(), reads + 1);
    await signal("pagehide");
    await signal("social-relationships-changed");
    const checked = page.waitForResponse((r) => identityRead(r.request()));
    held.release();
    await checked;
    await frame();
    await noPrivateDom("late queued choices after pagehide");
    assert.equal(readCount(), reads + 1);
  } finally {
    held.release();
  }
  await signal("pageshow");
  await openEditor();
  assert.deepEqual(await order().allTextContents(), dirty);
  await signal("blur");
  const remove = once(menuRead, async (route) => {
    receipt.simulations.push({
      type: "injected current-choice503",
      forwardedToService: false
    });
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Fictional Menu choices temporarily unavailable"
      })
    });
  });
  try {
    await signal("focus");
    await page
      .getByText("Fictional Menu choices temporarily unavailable", {
        exact: true
      })
      .waitFor();
    await noPrivateDom("failed current choice read");
  } finally {
    remove();
  }
  await signal("focus");
  await openEditor();
  assert.deepEqual(await order().allTextContents(), dirty);
  await confirm("Discard local shortcut edits");
  await enabled("Reset Menu shortcuts");
  assert.equal(receipt.browserWrites.length, 0);
  assert.deepEqual((await prefs()).menuShortcutIds, savedIds);
  pass(
    "Late queued and failed reads keep Menu choices physically absent; same owner restores its controlled order and explicit discard writes nothing"
  );
}
async function verifyAuthorityRemoval() {
  stage(
    "same-version Admin revocation keeps generic unavailable selection and baseline"
  );
  const grant = receipt.grants[0],
    version = (await prefs()).menuShortcutsVersion;
  await db.platformOperatorGrant.update({
    where: { id: grant.id },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  const state = await current(
    "Admin capability revoked without preference version change"
  );
  assert.equal(state.version, version);
  assert.equal(
    state.choices.some((c) => c.id === "admin"),
    false
  );
  await openEditor();
  await button("Remove unavailable shortcut").waitFor();
  assert.equal(await page.locator('a[href="/platform/admin"]').count(), 0);
  assert.equal(
    await editor()
      .getByRole("checkbox", { name: "Admin", exact: true })
      .count(),
    0
  );
  assert.equal(await button("Save Menu shortcuts").isDisabled(), true);
  await button("Remove unavailable shortcut").click();
  await enabled("Save Menu shortcuts");
  await confirm("Discard local shortcut edits", false);
  await enabled("Save Menu shortcuts");
  await confirm("Discard local shortcut edits");
  await button("Remove unavailable shortcut").waitFor();
  assert.equal(await button("Save Menu shortcuts").isDisabled(), true);
  assert.equal(receipt.browserWrites.length, 0);
  assert.deepEqual((await prefs()).menuShortcutIds, savedIds);
  await button("Remove unavailable shortcut").click();
  await enabled("Save Menu shortcuts");
  await keyboardFit();
  await button("Save Menu shortcuts").click();
  await waitPrefs(
    savedIds.filter((x) => x !== "admin"),
    2
  );
  await page.waitForFunction(() => {
    const links = [
      ...document.querySelectorAll('ul[aria-label="Saved Menu shortcuts"] a')
    ];
    return (
      links.length === 3 &&
      links.every((link) => link.getAttribute("href") !== "/platform/admin")
    );
  });
  await db.platformOperatorGrant.update({
    where: { id: grant.id },
    data: { revokedAt: null, version: { increment: 1 } }
  });
  await current("Admin capability renewed after saved removal");
  await openEditor();
  assert.equal(
    await editor()
      .getByRole("checkbox", { name: "Admin", exact: true })
      .isChecked(),
    false
  );
  assert.equal(
    await page.locator('section[aria-labelledby="menu-admin"] a').count(),
    1
  );
  assert.equal(await savedLinks().filter({ hasText: "Admin" }).count(), 0);
  await exactOperations(2);
  pass(
    "Same-version authority changes remove Admin metadata, preserve generic unavailable choices and discard baseline; actual saved removal survives renewal with four inspected keyboard targets"
  );
}
async function verifyOriginalSave() {
  stage(
    "held accepted save concealed before lost acknowledgment retains original owner/body"
  );
  await openEditor();
  await editor()
    .getByRole("checkbox", { name: "Gather groups", exact: true })
    .check();
  await editor().getByRole("checkbox", { name: "Admin", exact: true }).check();
  const selected = [
      ...savedIds.filter((x) => x !== "admin"),
      "groups",
      "admin"
    ],
    held = hold(
      command,
      "accepted Menu save with lost acknowledgment after conceal",
      true
    );
  try {
    await button("Save Menu shortcuts").click();
    await bounded(held.captured);
    await signal("blur");
    await noPrivateDom("accepted save blurred before lost acknowledgment");
    held.release();
    await page.waitForEvent("requestfailed", { predicate: (r) => command(r) });
    await frame();
    await noPrivateDom("lost acknowledgment remains concealed");
  } finally {
    held.release();
  }
  const original = receipt.browserWrites.at(-1).body;
  receipt.originalSaveBody = original;
  await waitPrefs(selected, 3);
  await login(other);
  await signal("focus");
  await page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .waitFor();
  await noPrivateDom("pending save cannot transfer to replacement owner");
  await login(owner);
  await signal("focus");
  await retry().waitFor();
  const limited = once(command, async (route) => {
    receipt.simulations.push({
      type: "injected original Menu retry429",
      retryAfter: 2,
      forwardedToService: false
    });
    await route.fulfill({
      status: 429,
      headers: { "Retry-After": "2" },
      contentType: "application/json",
      body: JSON.stringify({
        message: "Fictional Menu original retry rate limit"
      })
    });
  });
  try {
    const received = page.waitForResponse(
      (r) => command(r.request()) && r.status() === 429
    );
    await retry().click();
    await received;
    // Concealed recovery intentionally uses generic status text. The actual
    // response and returned original-save control establish settled recovery.
    await retry().waitFor();
  } finally {
    limited();
  }
  const remove = once(command, async (route) => {
    receipt.simulations.push({
      type: "injected unconfirmed Menu save503",
      forwardedToService: false
    });
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Fictional Menu save unconfirmed" })
    });
  });
  try {
    const received = page.waitForResponse(
      (r) => command(r.request()) && r.status() === 503
    );
    await retry().click();
    await received;
    await retry().waitFor();
  } finally {
    remove();
  }
  const grant = receipt.grants[0];
  await db.platformOperatorGrant.update({
    where: { id: grant.id },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  try {
    const state = await current(
      "pending original Admin selection loses current authority"
    );
    assert.equal(
      state.choices.some((choice) => choice.id === "admin"),
      false
    );
    const denied = page.waitForResponse(
      (r) => command(r.request()) && r.status() === 403
    );
    await retry().click();
    await denied;
    await retry().waitFor();
    assert.equal(receipt.browserWrites.at(-1).body, original);
    assert.equal(await page.locator('a[href="/platform/admin"]').count(), 0);
    assert.equal(
      await editor()
        .getByRole("checkbox", { name: "Admin", exact: true })
        .count(),
      0
    );
  } finally {
    await db.platformOperatorGrant.update({
      where: { id: grant.id },
      data: { revokedAt: null, version: { increment: 1 } }
    });
  }
  await current("pending original Admin authority renewed");
  await retry().waitFor();
  const accepted = hold(
    command,
    "accepted original Menu receipt after fresh owner check"
  );
  try {
    await retry().click();
    await bounded(accepted.captured);
    await signal("pagehide");
    await noPrivateDom("successful original save receipt pagehide");
    const checked = page.waitForResponse((r) => identityRead(r.request()));
    accepted.release();
    await checked;
    await frame();
    await noPrivateDom("late accepted Menu receipt cannot reveal choices");
  } finally {
    accepted.release();
  }
  await signal("pageshow");
  await waitPrefs(selected, 3);
  await page.waitForFunction(() =>
    document
      .querySelector('ul[aria-label="Saved Menu shortcuts"]')
      ?.textContent.includes("Gather groups")
  );
  // Receipt adoption deliberately mounts a new version-owned editor. Wait for
  // that accepted list before opening its fresh native details element.
  await openEditor();
  const attempts = receipt.browserWrites.slice(1);
  assert.equal(attempts.length, 5);
  for (const r of attempts) {
    assert.equal(r.body, original);
    assert.equal(r.owner, owner.id);
  }
  await exactOperations(3);
  pass(
    "Menu's accepted save keeps its exact body and owner through conceal, account replacement,429/503 and revoked-choice403; late replay creates one preference version/receipt"
  );
}
async function verifyConflictAndReset() {
  stage("competing version409 requires deliberate reload");
  await openEditor();
  await editor()
    .getByRole("checkbox", { name: "Exchange", exact: true })
    .check();
  await serviceSave(["settings"], "competing same-owner saved version");
  const denied = page.waitForResponse(
    (r) => command(r.request()) && r.status() === 409
  );
  await button("Save Menu shortcuts").click();
  await denied;
  await button("Reload current saved choices").waitFor();
  assert.equal(
    await editor()
      .getByRole("checkbox", { name: "Exchange", exact: true })
      .isChecked(),
    true
  );
  await confirm("Reload current saved choices", false);
  assert.deepEqual((await prefs()).menuShortcutIds, ["settings"]);
  await confirm("Reload current saved choices");
  await openEditor();
  await stamp();
  assert.equal(
    await editor()
      .getByRole("checkbox", { name: "Exchange", exact: true })
      .isChecked(),
    false
  );
  await waitPrefs(["settings"], 4);
  stage(
    "explicit reset removes all hidden stored choices without altering other preferences"
  );
  await serviceSave(["admin"], "owned reset fixture with only Admin stored");
  await page.goto(config.origin + "/platform/menu", {
    waitUntil: "domcontentloaded"
  });
  await stamp();
  await openEditor();
  const grant = receipt.grants[0];
  await db.platformOperatorGrant.update({
    where: { id: grant.id },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  try {
    const state = await current("only saved Admin choice is now unavailable");
    assert.deepEqual(state.ids, []);
    await openEditor();
    await confirm("Reset Menu shortcuts", false);
    await waitPrefs(["admin"], 5);
    assert.equal(await button("Discard local shortcut edits").count(), 0);
    const historyState = () =>
      page.evaluate(() => ({
        key: history.state?.gcPhotoWork ?? null,
        pops: window.__menuResetHistory.pops,
        backs: window.__menuResetHistory.backs,
        address: location.href
      }));
    await page.evaluate(() => {
      const state = { pops: 0, backs: 0 };
      window.__menuResetHistory = state;
      window.addEventListener("popstate", () => state.pops++);
      const original = history.back.bind(history);
      history.back = () => {
        state.backs++;
        original();
      };
    });
    receipt.simulations.push({
      type: "history observer",
      note: "Counts actual native popstate and forwards history.back unchanged; no simulated traversal."
    });
    const clean = await historyState();
    // Full-page reload preserves native history state, including a prior
    // document's marker. The clean editor has no active work; compare the new
    // Reset guard against this exact pre-Reset entry rather than assuming null.
    const heldReset = hold(command, "accepted clean Reset held across conceal");
    try {
      await confirm("Reset Menu shortcuts");
      await bounded(heldReset.captured);
      await waitPrefs([], 6);
      const pending = await historyState();
      assert.equal(typeof pending.key, "string");
      assert.notEqual(pending.key, clean.key);
      await signal("blur");
      await noPrivateDom("held clean Reset blur");
      await signal("pagehide");
      await noPrivateDom("held clean Reset pagehide");
      const checked = page.waitForResponse((r) => identityRead(r.request()));
      heldReset.release();
      await checked;
      await retry().waitFor({ state: "detached" });
      await frame();
      await noPrivateDom("accepted clean Reset remains concealed");
      const concealed = await historyState();
      assert.deepEqual(concealed, pending);
      const recheck = hold(
        menuRead,
        "clean Reset requires current owner recheck"
      );
      try {
        await signal("pageshow");
        await bounded(recheck.captured);
        await noPrivateDom("clean Reset current choices read held");
        assert.deepEqual(await historyState(), pending);
        recheck.release();
        await page.waitForFunction(
          (originalKey) =>
            (history.state?.gcPhotoWork ?? null) === originalKey &&
            window.__menuResetHistory.pops > 0,
          clean.key
        );
        const settled = await historyState();
        assert.equal(settled.backs, pending.backs + 1);
        assert.equal(settled.pops, pending.pops + 1);
        assert.equal(settled.address, pending.address);
        receipt.recoveries.push({
          type: "held clean Reset history protection",
          clean,
          pending,
          concealed,
          settled
        });
      } finally {
        recheck.release();
      }
    } finally {
      heldReset.release();
    }
    await page
      .getByText("No shortcuts selected. Choose the places you use most.", {
        exact: true
      })
      .waitFor();
  } finally {
    await db.platformOperatorGrant.update({
      where: { id: grant.id },
      data: { revokedAt: null, version: { increment: 1 } }
    });
  }
  await current("authority restored after explicit hidden-choice reset");
  await openEditor();
  assert.equal(
    await editor()
      .getByRole("checkbox", { name: "Admin", exact: true })
      .isChecked(),
    false
  );
  const final = await prefs();
  assert.equal(final.feedMode, "friends");
  assert.equal(final.feedVersion, 7);
  assert.equal(final.mentions, "NOBODY");
  assert.equal(final.version, 3);
  assert.equal(receipt.browserWrites.length, 8);
  await exactOperations(6);
  pass(
    "Definitive409 preserves entries until warned reload; clean hidden-choice Reset retains history protection through concealed acceptance until current owner recheck, with unrelated preferences unchanged"
  );
}

try {
  await setup();
  await verifyPrivacy();
  await verifyAuthorityRemoval();
  await verifyOriginalSave();
  await verifyConflictAndReset();
  assert.deepEqual(receipt.errors, []);
  assert.deepEqual(receipt.externalRequests, []);
} catch (error) {
  failure = error;
  receipt.failure = { message: String(error), stack: error?.stack };
  if (page)
    await page
      .screenshot({
        path: output.replace(/\.json$/, "") + "-failure.png",
        fullPage: true
      })
      .catch(() => {});
} finally {
  for (const held of holds) held.release();
  rules.length = 0;
  if (browser)
    await browser.close().catch((error) => receipt.errors.push(String(error)));
  try {
    receipt.finalPreferences = owner
      ? await db.socialPreferences.findUniqueOrThrow({
          where: { ownerId: owner.id }
        })
      : null;
    receipt.finalOperations = owner
      ? await db.socialOperation.findMany({ where: { ownerId: owner.id } })
      : [];
    receipt.finalGrants = owner
      ? await db.platformOperatorGrant.findMany({ where: { userId: owner.id } })
      : [];
    receipt.sinkFiles = readdirSync(resolve(fixture, "sink")).filter(
      (n) => !sinksBefore.has(n)
    );
    receipt.sourceAfter = source();
    receipt.sourceUnchanged =
      JSON.stringify(receipt.sourceBefore) ===
      JSON.stringify(receipt.sourceAfter);
    assert.equal(receipt.sourceUnchanged, true);
  } catch (error) {
    failure ??= error;
    receipt.readbackError = String(error);
  }
  await client.$disconnect();
  receipt.finishedAt = new Date().toISOString();
  receipt.status = failure ? "failed" : "passed";
  save();
}
if (failure) throw failure;
console.log(
  "MENU_CHOICE_PRIVACY_BROWSER_PASS " + receipt.groups.length + " " + output
);
