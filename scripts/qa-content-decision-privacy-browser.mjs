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
    resolve(fixture, "content-decision-privacy-" + Date.now() + ".json")
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
    "Fictional isolated local data; one own platform reviewer grant, one own church with scoped publisher/moderator grants and three real moderation commands.",
    "Authenticated HTML and RSC are read directly from the isolated built server with the author session.",
    "Lifecycle events are synthetic browser signals; held response is an actual accepted local appeal.",
    "One429 and two503 responses are explicit transport injections. Eighteen direct notice rows test20-row paging and are not additional moderation commands.",
    "Actor setup clears isolated PlatformAuthLimit rows and records deletion counts under exclusive fixture ownership.",
    "No production write or external delivery; scoped fictional records remain for readback."
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

let browser,
  context,
  page,
  author,
  reporter,
  reviewer,
  replacement,
  failure,
  current,
  routeReject;
const cases = [];
const sinksBefore = new Set(readdirSync(resolve(fixture, "sink"))),
  rules = [],
  holds = new Set();
const routeFailure = new Promise((_, reject) => {
  routeReject = reject;
});
void routeFailure.catch(() => {});
const button = (name) => page.getByRole("button", { name, exact: true });
const explanation = () =>
  page.getByLabel("Why should this decision be reconsidered?", { exact: true });
const consent = () =>
  page.getByLabel(
    "I agree to share this explanation and future replies with the assigned report reviewer.",
    { exact: true }
  );
const notice = () =>
  page.getByRole("article", { name: "Your content decision", exact: true });
const command = (request) =>
  request.method() === "POST" &&
  new URL(request.url()).pathname === "/api/platform/support";
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
  receipt.simulations.push({ type: "browser lifecycle signal", name });
};
const visibility = async (state) => {
  await page.evaluate((state) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: state
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
  receipt.simulations.push({ type: "document visibility override", state });
};
const hold = (matches = command, label = "accepted appeal response") => {
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
    matches: (request) => !used && matches(request),
    handler: async (route) => {
      used = true;
      const response = await route.fetch();
      assert.equal(response.status(), 200, await response.text());
      const result = await response.json();
      if (command(route.request())) current.caseId = result.caseId;
      receipt.simulations.push({
        type: "held actual response",
        label,
        actualStatus: response.status(),
        result
      });
      capture();
      await gate;
      await route.fulfill({ response });
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
const observation = async (label) => {
  const actual = await page.evaluate(
    ({ markers, draft }) => ({
      textMarkers: Object.fromEntries(
        Object.entries(markers).map(([key, value]) => [
          key,
          document.body.textContent.includes(value)
        ])
      ),
      descriptionInputs: document.querySelectorAll(
        'textarea[name="description"]'
      ).length,
      draftInLiveValue: [...document.querySelectorAll("textarea,input")].some(
        (node) => node.value === draft
      ),
      checkedConsent: !!document.querySelector('input[name="consent"]:checked'),
      articleCount: document.querySelectorAll(
        'article[aria-label="Your content decision"]'
      ).length,
      sourceSections: document.querySelectorAll(
        'section[aria-label="Your selected content"]'
      ).length,
      hiddenAncestor: !!document
        .querySelector('textarea[name="description"]')
        ?.closest("[hidden]")
    }),
    { markers: current.markers, draft: current.draft }
  );
  receipt.observations.push({ label, ...actual });
  save();
  return actual;
};
async function newCase(churchId) {
  const marker = randomUUID();
  current = {
    markers: {
      source: "Fictional source " + marker,
      note: "Fictional content note " + marker,
      excerpt: "Fictional safe excerpt " + marker,
      reviewer: "Fictional assigned reviewer " + marker
    },
    draft: "Fictional private reconsideration explanation " + marker
  };
  await db.platformUser.update({
    where: { id: reviewer.id },
    data: { name: current.markers.reviewer }
  });
  current.post = await db.platformPost.create({
    data: {
      authorId: author.id,
      ...(churchId
        ? { authorChurchId: churchId, audienceChurchId: churchId }
        : {}),
      audience: "PUBLIC",
      content: current.markers.source,
      contentNote: current.markers.note,
      safeExcerpt: current.markers.excerpt,
      replyAudience: "VIEWERS",
      discussionClosed: true
    }
  });
  current.report = await db.communityReport.create({
    data: {
      reporterId: reporter.id,
      ...(churchId ? { scopeChurchId: churchId } : {}),
      targetType: "POST",
      targetId: current.post.id,
      targetVersion: current.post.version,
      reason: "PRIVACY",
      details: "Fictional excluded private reporter detail " + marker
    }
  });
  const { communityReportCommand } = await load(
    "lib/platform/community-reports.ts"
  );
  const body = {
    operation: "moderate",
    mutationId: randomUUID(),
    id: current.report.id,
    expectedVersion: current.report.version,
    action: "HIDE",
    authorReason: "PRIVATE_INFORMATION",
    expectedSourceVersion: current.post.version,
    expectedContextVersion: 0,
    decisionReason: "Fictional excluded private review reason " + marker
  };
  const result = await communityReportCommand(db, reviewer.token, body);
  receipt.serviceCommands.push({ owner: reviewer.id, body, result });
  current.decision = await db.communityReportDecision.findFirstOrThrow({
    where: { reportId: current.report.id, action: "HIDE" }
  });
  current.path = "/platform/reports/decisions?id=" + current.decision.id;
  receipt.fixtureRows = {
    postId: current.post.id,
    reportId: current.report.id,
    decisionId: current.decision.id,
    markers: current.markers
  };
  cases.push(current);
}
async function setup() {
  stage("seed four scoped actors and own moderation authority");
  await assertPortalTestDatabase(db);
  receipt.database =
    await db.$queryRaw`SELECT current_database() AS name, host(inet_server_addr()) AS address, inet_server_port() AS port`;
  for (const label of [
    "decision_author",
    "decision_reporter",
    "decision_reviewer",
    "decision_other"
  ]) {
    const actor = await createPortalActor(db, label);
    receipt.actors.push({
      id: actor.id,
      name: actor.name,
      username: actor.username,
      email: actor.email
    });
    if (label === "decision_author") author = actor;
    else if (label === "decision_reporter") reporter = actor;
    else if (label === "decision_reviewer") reviewer = actor;
    else replacement = actor;
  }
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  receipt.grants = await db.platformOperatorGrant.findMany({
    where: { userId: reviewer.id }
  });
  assert.equal(
    await db.platformOperatorGrant.count({
      where: { userId: { in: [author.id, reporter.id, replacement.id] } }
    }),
    0
  );
  await newCase();
  const { chromium } = createRequire(
    process.env.PLAYWRIGHT_MODULE ??
      process.env.HOME +
        "/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json"
  )("playwright");
  const publicKey = execFileSync("openssl", [
      "x509",
      "-in",
      config.certificate,
      "-pubkey",
      "-noout"
    ]),
    der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], {
      input: publicKey
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
    timezoneId: "America/Chicago",
    serviceWorkers: "block"
  });
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  await context.route(/^https?:\/\//, async (route) => {
    try {
      const request = route.request(),
        url = new URL(request.url());
      if (url.origin !== config.origin) {
        receipt.externalRequests.push(url.origin + url.pathname);
        return await route.abort("blockedbyclient");
      }
      const rule = rules.find((rule) => rule.matches(request));
      if (rule) await rule.handler(route);
      else await route.continue();
    } catch (error) {
      receipt.routeErrors.push(String(error));
      routeReject(error);
    }
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
  page.on("pageerror", (error) => receipt.errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error")
      receipt.consoleErrors.push({
        text: message.text(),
        location: message.location()
      });
  });
  await login(author);
}

const identityRead = (request) => {
  const url = new URL(request.url());
  return (
    request.method() === "GET" &&
    url.pathname === "/api/platform/profile" &&
    url.searchParams.get("view") === "identity"
  );
};
const decisionRead = (request) => {
  const url = new URL(request.url());
  return (
    request.method() === "GET" &&
    url.pathname === "/api/platform/community-reports" &&
    url.searchParams.get("view") === "decisions"
  );
};
const readCount = () =>
  receipt.requests.filter(
    (row) =>
      row.method === "GET" &&
      row.path.startsWith("/api/platform/community-reports?view=decisions")
  ).length;
const originalButton = () =>
  page.getByRole("button", {
    name: "Confirm original request: reconsideration",
    exact: true
  });
const discardButton = () =>
  page.getByRole("button", {
    name: "Discard local entries: reconsideration",
    exact: true
  });
const originalReady = async () => {
  await originalButton().waitFor();
  await page.waitForFunction(() => {
    const node = document.querySelector(
      'button[aria-label="Confirm original request: reconsideration"]'
    );
    return node && !node.disabled;
  });
};
const stamp = () =>
  page.evaluate((marker) => {
    window.__contentDecisionDocument = marker;
  }, current.draft);
const sameDocument = async () =>
  assert.equal(
    await page.evaluate(() => window.__contentDecisionDocument),
    current.draft
  );
const changed = () =>
  page.getByText(
    "This content decision or its access changed. Reload to inspect current details. Unsaved entries will be cleared; an unconfirmed request may already be saved.",
    { exact: true }
  );
const ready = async (value = current.draft) => {
  await explanation().waitFor();
  await page.waitForFunction(
    (value) =>
      document.querySelector('textarea[name="description"]')?.value === value,
    value
  );
  await sameDocument();
};
const noPrivateDom = async (label) => {
  await page.waitForFunction(
    ({ markers, draft }) => {
      const all = [...Object.values(markers), draft],
        body = document.body;
      return (
        !body.querySelector(
          'article[aria-label="Your content decision"],section[aria-label="Your selected content"],textarea[name="description"],input[name="consent"],a[href^="/platform/help/cases/"]'
        ) &&
        all.every((marker) => !body.textContent.includes(marker)) &&
        ![...body.querySelectorAll("textarea,input,select")].some((node) =>
          all.some((marker) => String(node.value).includes(marker))
        ) &&
        ![...body.querySelectorAll("*")].some((node) =>
          [...node.attributes].some((attr) =>
            all.some((marker) => attr.value.includes(marker))
          )
        )
      );
    },
    { markers: current.markers, draft: current.draft }
  );
  await sameDocument();
  const actual = await observation(label);
  assert.equal(actual.descriptionInputs, 0);
  assert.equal(actual.draftInLiveValue, false);
  assert.equal(actual.articleCount, 0);
  assert.equal(actual.sourceSections, 0);
  for (const value of Object.values(actual.textMarkers))
    assert.equal(value, false);
};
const frozen = async (label) => {
  await changed().waitFor();
  await noPrivateDom(label);
  assert.equal(await button("Request reconsideration").count(), 0);
  assert.equal(
    await button("Use current request with these entries").count(),
    0
  );
};
const once = (matches, handler) => {
  let used = false;
  const rule = {
    matches: (request) => !used && matches(request),
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
const readResult = async (promise, label) => {
  const response = await promise;
  const result = await response.json();
  receipt.recoveries.push({
    type: "actual current decision read",
    label,
    status: response.status(),
    offer: result.appeal,
    notices: result.notices?.length,
    after: result.after ?? null
  });
  return result;
};
const nextRead = () =>
  page.waitForResponse((response) => decisionRead(response.request()));
const recheck = async (label) => {
  const response = nextRead();
  await signal("focus");
  return readResult(response, label);
};
const lateRelease = async (item, label) => {
  await page.evaluate(() => {
    window.__decisionLeaks = [];
    window.__decisionObserver = new MutationObserver(() => {
      if (
        document.querySelector(
          'article[aria-label="Your content decision"],section[aria-label="Your selected content"],textarea[name="description"],input[name="consent"]'
        )
      )
        window.__decisionLeaks.push("private element attached");
    });
    window.__decisionObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });
  });
  try {
    const checked = page.waitForResponse((response) =>
      identityRead(response.request())
    );
    item.release();
    await checked;
    await frame();
    await noPrivateDom(label);
    assert.deepEqual(await page.evaluate(() => window.__decisionLeaks), []);
    receipt.recoveries.push({
      type: "late response MutationObserver",
      label,
      transientAttachments: 0
    });
  } finally {
    await page.evaluate(() => {
      window.__decisionObserver.disconnect();
      delete window.__decisionObserver;
    });
  }
};
const keyboardFit = async () => {
  await page.setViewportSize({ width: 320, height: 844 });
  for (const enlarged of [false, true]) {
    const style = enlarged
      ? await page.addStyleTag({ content: "html{font-size:200%!important}" })
      : null;
    try {
      for (const [label, target] of [
        ["retry", originalButton()],
        ["discard", discardButton()]
      ]) {
        await target.focus();
        await page.keyboard.press("Tab");
        await page.keyboard.press("Shift+Tab");
        await target.evaluate((node) =>
          node.scrollIntoView({ block: "center", inline: "nearest" })
        );
        const geometry = await target.evaluate((node) => {
          const box = node.getBoundingClientRect(),
            nav = document
              .querySelector('nav[aria-label="Platform"]')
              ?.getBoundingClientRect(),
            style = getComputedStyle(node),
            hit = document.elementFromPoint(
              (box.left + box.right) / 2,
              (box.top + box.bottom) / 2
            );
          return {
            focused: document.activeElement === node,
            focusVisible: node.matches(":focus-visible"),
            outlineStyle: style.outlineStyle,
            outlineWidth: style.outlineWidth,
            boxShadow: style.boxShadow,
            centerHit: node === hit || node.contains(hit),
            top: box.top,
            bottom: box.bottom,
            availableBottom: nav?.top ?? innerHeight,
            viewport: innerWidth,
            scrollWidth: document.documentElement.scrollWidth
          };
        });
        const path =
          output.replace(/\.json$/, "") +
          "-320-" +
          (enlarged ? "200-" : "100-") +
          label +
          ".png";
        await page.screenshot({ path });
        receipt.captures.push({ path, label, enlarged, geometry });
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
      if (style) await style.evaluate((node) => node.remove());
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
};
async function verifySerializedAndDraft() {
  stage("author-only fresh client read and no private initialHTML/RSC payload");
  receipt.serialized = [];
  for (const kind of ["HTML", "RSC"]) {
    const response = await context.request.get(
      config.origin +
        current.path +
        (kind === "RSC" ? "&_rsc=" + randomUUID() : ""),
      { headers: kind === "RSC" ? { RSC: "1" } : {} }
    );
    assert.equal(response.status(), 200);
    const body = await response.text(),
      row = {
        kind,
        status: response.status(),
        contentType: response.headers()["content-type"],
        bytes: Buffer.byteLength(body),
        sha256: sha(body),
        markers: Object.fromEntries(
          Object.entries(current.markers).map(([key, value]) => [
            key,
            body.includes(value)
          ])
        ),
        privateReporterIncluded: body.includes(current.report.details),
        privateReviewIncluded: body.includes(
          receipt.serviceCommands[0].body.decisionReason
        )
      };
    receipt.serialized.push(row);
    for (const value of Object.values(row.markers)) assert.equal(value, false);
    assert.equal(row.privateReporterIncluded, false);
    assert.equal(row.privateReviewIncluded, false);
    if (kind === "RSC") assert.match(row.contentType, /text\/x-component/);
  }
  const initial = hold(decisionRead, "initial fresh decision read");
  try {
    await page.goto(config.origin + current.path, {
      waitUntil: "domcontentloaded"
    });
    await stamp();
    await bounded(initial.captured);
    await noPrivateDom("initial current decision read held");
    initial.release();
    await notice().waitFor();
    await ready("");
  } finally {
    initial.release();
  }
  await explanation().fill(current.draft);
  await consent().check();
  current.formControlId = await explanation().getAttribute("id");
  const visible = await observation(
    "authorized fresh read reveals only own source and reviewer"
  );
  for (const value of Object.values(visible.textMarkers))
    assert.equal(value, true);
  assert.ok(
    !(await page.locator("main").innerText()).includes(current.report.details)
  );
  assert.ok(
    !(await page.locator("main").innerText()).includes(
      receipt.serviceCommands[0].body.decisionReason
    )
  );
  pass(
    "InitialHTML/RSC exclude private source/note/excerpt/reviewer; actual owner-checked client read reveals only authorized author details"
  );
  stage("controlled appeal draft lifecycle and owner revalidation");
  for (const [hide, resume] of [
    ["blur", "focus"],
    ["offline", "online"],
    ["pagehide", "pageshow"]
  ]) {
    await signal(hide);
    await noPrivateDom("draft " + hide);
    const count = readCount();
    await signal("social-relationships-changed");
    await frame();
    assert.equal(
      readCount(),
      count,
      "Relationship changes must not activate a concealed workspace"
    );
    await noPrivateDom("relationship change remains concealed after " + hide);
    const owner = hold(identityRead, "owner recheck " + resume);
    try {
      await signal(resume);
      await bounded(owner.captured);
      await noPrivateDom("held identity " + resume);
      owner.release();
      await ready();
      assert.equal(await consent().isChecked(), true);
      assert.equal(
        await explanation().getAttribute("id"),
        current.formControlId
      );
    } finally {
      owner.release();
    }
  }
  await visibility("hidden");
  await noPrivateDom("draft hidden visibility");
  await visibility("visible");
  await ready();
  await page.evaluate(() => {
    delete document.visibilityState;
  });
  await signal("blur");
  await noPrivateDom("draft before account replacement");
  await login(replacement);
  await signal("focus");
  await page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .waitFor();
  await noPrivateDom("replacement account cannot access original draft");
  const foreign = await context.request.get(
    config.origin +
      "/api/platform/community-reports?view=decisions&id=" +
      current.decision.id
  );
  assert.equal(foreign.status(), 404);
  receipt.recoveries.push({
    type: "actual foreign author read denied",
    status: foreign.status(),
    result: await foreign.json()
  });
  await login(author);
  await signal("focus");
  await ready();
  assert.equal(await consent().isChecked(), true);
  assert.equal(await explanation().getAttribute("id"), current.formControlId);
  assert.equal(receipt.browserWrites.length, 0);
  pass(
    "Appeal controls and source physically conceal across lifecycle/account changes, retaining controlled explanation and consent for the original owner"
  );
  stage("late queued read and transient503 cannot reattach private content");
  await signal("blur");
  await noPrivateDom("before held decision read");
  const held = hold(
    decisionRead,
    "decision read with queued resume then second conceal"
  );
  try {
    const reads = readCount();
    await signal("focus");
    await bounded(held.captured);
    await noPrivateDom("decision read held");
    await signal("focus");
    await signal("online");
    await frame();
    assert.equal(readCount(), reads + 1);
    await signal("pagehide");
    await noPrivateDom("held read after pagehide");
    await signal("social-relationships-changed");
    await lateRelease(held, "late decision read stays physically absent");
    assert.equal(readCount(), reads + 1, "Conceal clears queued reads");
  } finally {
    held.release();
  }
  await signal("pageshow");
  await ready();
  await signal("blur");
  const remove = once(decisionRead, async (route) => {
    receipt.simulations.push({
      type: "injected decision503",
      forwardedToService: false
    });
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Fictional current decision temporarily unavailable"
      })
    });
  });
  try {
    await signal("focus");
    await page
      .getByText("Fictional current decision temporarily unavailable", {
        exact: true
      })
      .waitFor();
    await noPrivateDom("failed decision read");
  } finally {
    remove();
  }
  await signal("focus");
  await ready();
  assert.equal(await consent().isChecked(), true);
  pass(
    "Queued/late reads remain inactive after conceal and relationship events; failed current reads retain the original controlled draft without exposing it"
  );
}
async function verifyOfferChangesAndReplay() {
  stage("dirty form owner survives reviewer availability/name changes");
  const grant = receipt.grants[0];
  try {
    await db.platformOperatorGrant.update({
      where: { id: grant.id },
      data: { revokedAt: new Date(), version: { increment: 1 } }
    });
    const unavailable = await recheck("own reviewer grant revoked");
    assert.equal(unavailable.appeal.available, false);
    assert.equal(unavailable.appeal.reviewerName, null);
    await frozen("dirty form retained when reviewer unavailable");
    await discardButton().waitFor();
    await db.platformOperatorGrant.update({
      where: { id: grant.id },
      data: { revokedAt: grant.revokedAt, version: { increment: 1 } }
    });
    await recheck("own reviewer grant renewed");
    await ready();
    assert.equal(await consent().isChecked(), true);
    assert.equal(await explanation().getAttribute("id"), current.formControlId);
    await db.platformUser.update({
      where: { id: reviewer.id },
      data: { name: current.markers.reviewer + " updated" }
    });
    const renamed = await recheck("same assigned reviewer name changed");
    assert.equal(
      renamed.appeal.reviewerName,
      current.markers.reviewer + " updated"
    );
    await frozen("dirty form retained when disclosed reviewer changes");
    await db.platformUser.update({
      where: { id: reviewer.id },
      data: { name: current.markers.reviewer }
    });
    await recheck("original reviewer name restored");
    await ready();
    assert.equal(await consent().isChecked(), true);
    assert.equal(await explanation().getAttribute("id"), current.formControlId);
  } finally {
    const now = await db.platformOperatorGrant.findUniqueOrThrow({
      where: { id: grant.id }
    });
    if (now.revokedAt)
      await db.platformOperatorGrant.update({
        where: { id: grant.id },
        data: { revokedAt: grant.revokedAt, version: { increment: 1 } }
      });
    await db.platformUser.update({
      where: { id: reviewer.id },
      data: { name: current.markers.reviewer }
    });
  }
  assert.equal(receipt.browserWrites.length, 0);
  pass(
    "Reviewer availability and name changes conceal stale presentation while preserving the same dirty SupportForm owner and original disclosure"
  );
  stage(
    "lost accepted appeal acknowledgment retains original body through current caseId offer"
  );
  const lose = once(command, async (route) => {
    const response = await route.fetch();
    assert.equal(response.status(), 200, await response.text());
    const result = await response.json();
    current.caseId = result.caseId;
    receipt.simulations.push({
      type: "lost accepted appeal acknowledgment",
      actualStatus: 200,
      result
    });
    await route.abort("failed");
  });
  try {
    await button("Request reconsideration").click();
    await button("Retry original request").waitFor();
  } finally {
    lose();
  }
  const original = receipt.browserWrites.at(-1).body;
  current.original = original;
  assert.equal(await explanation().inputValue(), current.draft);
  assert.equal(await explanation().isDisabled(), true);
  const offer = await recheck(
    "accepted appeal now has caseId and alreadyRequested"
  );
  assert.equal(offer.appeal.caseId, current.caseId);
  assert.equal(offer.appeal.alreadyRequested, true);
  assert.equal(offer.appeal.available, false);
  await frozen("changed caseId and alreadyRequested retain original retry");
  await originalButton().waitFor();
  await discardButton().waitFor();
  const limited = once(command, async (route) => {
    receipt.simulations.push({
      type: "injected original appeal429",
      retryAfter: 2,
      forwardedToService: false
    });
    await route.fulfill({
      status: 429,
      headers: { "Retry-After": "2" },
      contentType: "application/json",
      body: JSON.stringify({ message: "Fictional original appeal rate limit" })
    });
  });
  try {
    const received = page.waitForResponse(
      (response) => command(response.request()) && response.status() === 429
    );
    await originalButton().click();
    await received;
    await page
      .getByText(
        "We could not confirm the original request. Recheck access and retry the same request.",
        { exact: true }
      )
      .waitFor();
    await originalReady();
    assert.equal(receipt.browserWrites.length, 2);
    assert.equal(receipt.browserWrites[1].body, original);
    await noPrivateDom(
      "rate-limited original appeal stays generic and concealed"
    );
  } finally {
    limited();
  }
  const fail = once(command, async (route) => {
    receipt.simulations.push({
      type: "injected unconfirmed appeal503",
      forwardedToService: false
    });
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Fictional original appeal unconfirmed" })
    });
  });
  try {
    const received = page.waitForResponse(
      (response) => command(response.request()) && response.status() === 503
    );
    await originalButton().click();
    await received;
    await page
      .getByText(
        "We could not confirm the original request. Recheck access and retry the same request.",
        { exact: true }
      )
      .waitFor();
  } finally {
    fail();
  }
  await originalReady();
  await noPrivateDom("original retry after503 remains generic and concealed");
  const seen = page.waitForEvent("dialog"),
    click = discardButton().click(),
    dialog = await seen;
  receipt.dialogs.push({
    type: dialog.type(),
    message: dialog.message(),
    accepted: false
  });
  assert.match(dialog.message(), /may already be saved/);
  await dialog.dismiss();
  await click;
  await originalButton().waitFor();
  for (const row of receipt.browserWrites) {
    assert.equal(row.body, original);
    assert.equal(row.owner, author.id);
  }
  await keyboardFit();
  pass(
    "Accepted caseId/alreadyRequested and unconfirmed503 preserve exact original body; warned discard cancellation and four keyboard recovery captures pass"
  );
  stage(
    "accepted replay cannot navigate until original owner fresh access after conceal"
  );
  const held = hold(
    command,
    "accepted original appeal replay held before conceal"
  );
  try {
    await originalButton().click();
    await bounded(held.captured);
    await signal("blur");
    await noPrivateDom("accepted replay blurred before release");
    const before = page.url();
    await lateRelease(
      held,
      "accepted replay cannot attach source while concealed"
    );
    assert.equal(page.url(), before);
    receipt.recoveries.push({
      type: "held accepted replay navigation deferred",
      url: before,
      noNavigationWhileConcealed: true
    });
    await login(replacement);
    await signal("focus");
    await page
      .getByText("Your sign-in changed. Reload before continuing.", {
        exact: true
      })
      .waitFor();
    await noPrivateDom(
      "replacement cannot consume successful navigation intent"
    );
    assert.equal(page.url(), before);
    await login(author);
    await signal("focus");
    await page.waitForURL(
      (url) => url.pathname === "/platform/help/cases/" + current.caseId
    );
    receipt.recoveries.push({
      type: "fresh original owner permits saved receipt navigation",
      caseId: current.caseId,
      url: page.url()
    });
  } finally {
    held.release();
  }
  assert.equal(receipt.browserWrites.length, 4);
  for (const row of receipt.browserWrites) {
    assert.equal(row.body, original);
    assert.equal(row.owner, author.id);
  }
  const saved = await db.supportCase.findMany({
      where: { moderationDecisionId: current.decision.id }
    }),
    operations = await db.supportOperation.findMany({
      where: { actorId: author.id, caseId: current.caseId }
    });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].description, current.draft);
  assert.equal(operations.length, 1);
  assert.equal(operations[0].requestKey, JSON.parse(original).requestKey);
  pass(
    "Held successful replay stays on the concealed document through account replacement; fresh original-owner access consumes one saved navigation with one case/operation"
  );
}

async function verifyChurchPublisher() {
  stage("actual own church publisher revocation and same-owner recovery");
  const church = await db.church.create({
    data: {
      slug: "fictional-decision-" + randomUUID(),
      name: "Fictional decision church " + randomUUID(),
      summary: "Isolated current-publisher privacy fixture"
    }
  });
  const grants = [];
  for (const [actor, capability] of [
    [author, "PUBLISH_CHURCH_POSTS"],
    [reviewer, "MODERATE_CHURCH_POSTS"]
  ]) {
    const connection = await db.churchConnection.create({
      data: {
        userId: actor.id,
        churchId: church.id,
        state: "APPROVED",
        approvedSince: new Date()
      }
    });
    grants.push(
      await db.churchCapabilityGrant.create({
        data: {
          userId: actor.id,
          churchId: church.id,
          capability,
          dependencyConnectionId: connection.id
        }
      })
    );
  }
  receipt.churchFixture = {
    churchId: church.id,
    grantsBefore: grants,
    purpose:
      "One own church with exact approved connections and dependent publisher/moderator capabilities; no unrelated authority"
  };
  await newCase(church.id);
  assert.equal(current.decision.authorId, null);
  assert.equal(current.decision.authorChurchId, church.id);
  await page.goto(config.origin + current.path, {
    waitUntil: "domcontentloaded"
  });
  await stamp();
  await notice().waitFor();
  await ready("");
  await explanation().fill(current.draft);
  await consent().check();
  const controlId = await explanation().getAttribute("id"),
    grant = grants[0];
  try {
    await db.churchCapabilityGrant.update({
      where: { id: grant.id },
      data: { revokedAt: new Date(), version: { increment: 1 } }
    });
    const result = await recheck(
      "same author account loses current church publishing capability"
    );
    assert.match(result.message, /unavailable/i);
    await page.getByText(result.message, { exact: true }).waitFor();
    await noPrivateDom("current church publishing grant revoked");
    assert.equal(await originalButton().count(), 0);
    assert.equal(await discardButton().count(), 0);
    assert.equal(receipt.browserWrites.length, 5);
  } finally {
    await db.churchCapabilityGrant.update({
      where: { id: grant.id },
      data: { revokedAt: grant.revokedAt, version: { increment: 1 } }
    });
  }
  const returned = await recheck(
    "same author regains exact church publishing capability"
  );
  assert.equal(returned.notices[0].church, true);
  await ready();
  assert.equal(await consent().isChecked(), true);
  assert.equal(await explanation().getAttribute("id"), controlId);
  receipt.churchFixture.grantsAfter = await db.churchCapabilityGrant.findMany({
    where: { churchId: church.id }
  });
  assert.equal(
    await db.supportCase.count({
      where: { moderationDecisionId: current.decision.id }
    }),
    0
  );
  await button("Discard local entries").click();
  await ready("");
  pass(
    "Actual dependent church-publisher revocation denies the same account and removes private draft/source; renewal restores its original controlled form without any appeal POST"
  );
}
async function verifyConflictAndPaging() {
  stage(
    "definitive409 requires warned full reload rather than automatic version adoption"
  );
  await newCase();
  await page.goto(config.origin + current.path, {
    waitUntil: "domcontentloaded"
  });
  await stamp();
  await notice().waitFor();
  await ready("");
  await explanation().fill(current.draft);
  await consent().check();
  const revised = await db.communityReport.update({
    where: { id: current.report.id },
    data: { version: { increment: 1 } }
  });
  receipt.simulations.push({
    type: "controlled own report version fixture",
    reportId: revised.id,
    fromVersion: current.decision.version,
    toVersion: revised.version
  });
  const denied = page.waitForResponse(
    (response) => command(response.request()) && response.status() === 409
  );
  await button("Request reconsideration").click();
  const result = await (await denied).json();
  await page.getByText(result.message, { exact: true }).waitFor();
  await ready();
  assert.equal(await button("Retry original request").count(), 0);
  await recheck("definitive conflict changed report version");
  await frozen("409 requires deliberate current information reload");
  assert.equal(await originalButton().count(), 0);
  assert.equal(await button("Refresh this request").count(), 0);
  assert.equal(
    await db.supportCase.count({
      where: { moderationDecisionId: current.decision.id }
    }),
    0
  );
  for (const accept of [false, true]) {
    const seen = page.waitForEvent("dialog"),
      click = button("Reload current information").click(),
      dialog = await seen;
    receipt.dialogs.push({
      type: dialog.type(),
      message: dialog.message(),
      accepted: accept
    });
    assert.match(dialog.message(), /discard local entries/);
    if (accept) await dialog.accept();
    else await dialog.dismiss();
    await click;
    if (!accept) {
      await frozen("cancelled reload retains concealed original draft");
      await sameDocument();
    } else {
      await page.waitForLoadState("domcontentloaded");
      await notice().waitFor();
      await stamp();
      await ready("");
      assert.equal(await consent().isChecked(), false);
    }
  }
  assert.equal(receipt.browserWrites.length, 5);
  assert.equal(
    await db.supportOperation.count({ where: { actorId: author.id } }),
    1
  );
  pass(
    "Definitive409 creates no case; cancelled reload keeps the original owner and accepted warned reload clears entries before current-version use"
  );
  await verifyChurchPublisher();
  stage("actual20+1 author notice paging and authority");
  receipt.paginationFixture = [];
  const count = await db.communityReportDecision.count({
    where: { id: { in: cases.map((row) => row.decision.id) } }
  });
  assert.equal(count, 3);
  for (let index = 1; index <= 18; index++) {
    const row = await db.communityReportDecision.create({
      data: {
        reportId: cases[1].report.id,
        actorId: reviewer.id,
        fromStatus: "RECEIVED",
        toStatus: "CLOSED",
        reason: "Fictional paging metadata",
        version: 100 + index,
        action: "HIDE",
        authorReason: "PRIVATE_INFORMATION",
        authorId: author.id,
        fromVisibility: "VISIBLE",
        toVisibility: "HIDDEN",
        sourceVersion: current.post.version,
        contextVersion: 0,
        createdAt: new Date(Date.now() - (index + 1) * 60000)
      }
    });
    receipt.paginationFixture.push({
      id: row.id,
      fixtureOnly: true,
      purpose:
        "Notice paging metadata, not additional review commands or author delivery"
    });
  }
  await page.goto(config.origin + "/platform/reports/decisions", {
    waitUntil: "domcontentloaded"
  });
  await stamp();
  await page.waitForFunction(
    () =>
      document.querySelectorAll('article[aria-label="Your content decision"]')
        .length === 20
  );
  const links = () =>
      page.getByRole("link", {
        name: "Open decision and reconsideration",
        exact: true
      }),
    older = page.getByRole("link", {
      name: "Older content decisions",
      exact: true
    }),
    first = await links().evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("href"))
    ),
    olderHref = await older.getAttribute("href");
  for (const [hide, resume] of [
    ["offline", "online"],
    ["pagehide", "pageshow"]
  ]) {
    await signal(hide);
    await noPrivateDom("notice list " + hide);
    assert.equal(await older.count(), 0);
    await signal("social-relationships-changed");
    await frame();
    await noPrivateDom("notice list relationship event after " + hide);
    await signal(resume);
    await older.waitFor();
    assert.deepEqual(
      await links().evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("href"))
      ),
      first
    );
  }
  await older.click();
  await page.waitForURL(
    (url) =>
      url.searchParams.get("after") ===
      new URL(olderHref, config.origin).searchParams.get("after")
  );
  await stamp();
  await page.waitForFunction(
    () =>
      document.querySelectorAll('article[aria-label="Your content decision"]')
        .length === 1
  );
  const second = await links().evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("href"))
  );
  assert.equal(new Set([...first, ...second]).size, 21);
  assert.equal(await older.count(), 0);
  const cursor = new URL(page.url()).searchParams.get("after");
  await signal("blur");
  await noPrivateDom("older notice page concealed");
  await login(replacement);
  await signal("focus");
  await page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .waitFor();
  await noPrivateDom("older notice page replacement account");
  await login(author);
  await signal("focus");
  await notice().waitFor();
  await sameDocument();
  assert.equal(new URL(page.url()).searchParams.get("after"), cursor);
  assert.deepEqual(
    await links().evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("href"))
    ),
    second
  );
  receipt.pagination = {
    firstPage: first,
    secondPage: second,
    totalDistinct: 21,
    cursor,
    preservedAfterOwnerRevalidation: true
  };
  assert.equal(receipt.browserWrites.length, 5);
  pass(
    "Actual20+1 paging returns21 distinct own notices and preserves cursor through conceal/revalidation while replacement accounts remain denied"
  );
}
async function run() {
  await setup();
  await verifySerializedAndDraft();
  await verifyOfferChangesAndReplay();
  await verifyConflictAndPaging();
  assert.deepEqual(receipt.errors, []);
  assert.deepEqual(receipt.routeErrors, []);
  assert.deepEqual(receipt.externalRequests, []);
}

try {
  await Promise.race([run(), routeFailure]);
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
    receipt.effects = [];
    for (const row of cases) {
      const supportCases = await db.supportCase.findMany({
          where: { moderationDecisionId: row.decision.id }
        }),
        ids = supportCases.map((item) => item.id);
      receipt.effects.push({
        postId: row.post.id,
        reportId: row.report.id,
        decisionId: row.decision.id,
        source: await db.platformPost.findUniqueOrThrow({
          where: { id: row.post.id }
        }),
        report: await db.communityReport.findUniqueOrThrow({
          where: { id: row.report.id }
        }),
        decisions: await db.communityReportDecision.findMany({
          where: { reportId: row.report.id }
        }),
        supportCases,
        supportOperations: await db.supportOperation.findMany({
          where: { caseId: { in: ids } }
        }),
        supportAudit: await db.supportAuditEvent.findMany({
          where: { caseId: { in: ids } }
        }),
        events: await db.socialEvent.findMany({
          where: { reportId: row.report.id }
        }),
        retentionControls: await db.retentionControl.findMany({
          where: { target: "REPORT", targetId: row.report.id }
        })
      });
    }
    receipt.reviewOperations = reviewer
      ? await db.socialOperation.findMany({ where: { ownerId: reviewer.id } })
      : [];
    receipt.finalGrants = reviewer
      ? await db.platformOperatorGrant.findMany({
          where: { userId: reviewer.id }
        })
      : [];
    receipt.sinkFiles = readdirSync(resolve(fixture, "sink")).filter(
      (file) => !sinksBefore.has(file)
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
  "CONTENT_DECISION_PRIVACY_BROWSER_PASS " +
    receipt.groups.length +
    " " +
    output
);
