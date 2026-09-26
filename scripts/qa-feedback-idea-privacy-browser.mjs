import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const fixtureDir = resolve(process.argv[2] ?? "");
assert.ok(
  process.argv[2],
  "Pass the existing isolated HTTPS fixture directory"
);
assert.ok(fixtureDir.startsWith(resolve(".account-test") + "/"));
const config = JSON.parse(
  readFileSync(resolve(fixtureDir, "browser-env.json"), "utf8")
);
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: resolve(fixtureDir, "sink"),
  RETENTION_TEST_DIR: resolve(fixtureDir, "retention"),
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: "",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  SOCIAL_EMAIL_ENABLED: "false",
  FOUNDER_WELCOME_ENABLED: "false",
  FOUNDER_ANNOUNCEMENTS_ENABLED: "false",
  PUSH_ENABLED: "false",
  FEEDBACK_INTAKE_ENABLED: "true",
  FEEDBACK_IDEAS_ENABLED: "true",
  SUPPORT_INTAKE_ENABLED: "true"
});
// Use the inspected runtime's modules even when this script lives elsewhere.
const require = createRequire(resolve("package.json"));
const load = (name) => import(pathToFileURL(resolve(name)));
const { PrismaClient } = require("@prisma/client");
const { assertPortalTestDatabase, createPortalActor, seedOperatorGrants } =
  await load("tests/seed-portal.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
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
]);
const der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], {
  input: publicKey
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
  viewport: { width: 390, height: 844 },
  acceptDownloads: true
});
const page = await context.newPage();
page.setDefaultTimeout(30000);
const { readSupport, supportCommand } = await load("lib/platform/support.ts");
const { SUPPORT_NOTICE } = await load("lib/platform/support-types.ts");
const { FEEDBACK_NOTICE } = await load("lib/platform/feedback-policy.ts");
const { readFeedbackIdeaAdministration, feedbackIdeaAdminCommand } = await load(
  "lib/platform/feedback-idea-admin.ts"
);
const output = resolve(
  fixtureDir,
  "feedback-idea-privacy-browser-" + Date.now()
);
mkdirSync(output, { recursive: true, mode: 0o700 });
const originalIntake = await db.supportIntakeSetting.findUnique({
  where: { id: "default" }
});
const results = [],
  errors = [],
  routeErrors = [],
  externalRequests = [],
  browserWrites = [],
  requests = [],
  observations = [],
  recoveries = [],
  captures = [],
  dialogs = [];
const rules = [],
  releases = new Set();
let actor,
  requester,
  replacement,
  respondGrant,
  productGrant,
  caseId,
  destinationId,
  disappearingId,
  ideaId,
  privateSource,
  searchDraft;
let dialogAccept = true,
  rejectRouting,
  grantRevoked = false;
const caseIds = [],
  ideaIds = [];
const marker = "Fictional idea " + randomUUID().slice(0, 8);
const routingFailure = new Promise((_, reject) => {
  rejectRouting = reject;
});
void routingFailure.catch(() => {});
const register = (matches, handler) => {
  const rule = { matches, handler };
  rules.unshift(rule);
  return () => {
    const at = rules.indexOf(rule);
    if (at >= 0) rules.splice(at, 1);
  };
};
// One native dispatcher owns each request. A local rule is selected before an
// await, preserving held-response ownership when later rules are registered.
await context.route(/^https?:\/\//, async (route) => {
  try {
    const url = new URL(route.request().url());
    if (url.origin !== config.origin) {
      externalRequests.push(url.origin + url.pathname);
      return await route.abort();
    }
    const rule = rules.find((entry) => entry.matches(url));
    return rule ? await rule.handler(route) : await route.continue();
  } catch (error) {
    const diagnostic = {
      method: route.request().method(),
      url: route.request().url(),
      message: String(error),
      stack: error.stack
    };
    routeErrors.push(diagnostic);
    rejectRouting(
      new Error("Browser routing failed: " + JSON.stringify(diagnostic), {
        cause: error
      })
    );
  }
});
context.on("request", (request) => {
  const url = new URL(request.url());
  requests.push({
    method: request.method(),
    path: url.pathname + url.search,
    document: request.isNavigationRequest()
  });
  if (!["GET", "HEAD"].includes(request.method()))
    browserWrites.push({
      method: request.method(),
      path: url.pathname,
      body: request.postData(),
      owner: request.headers()["x-expected-account"]
    });
});
page.on("pageerror", (error) => errors.push(error.message));
page.on("dialog", async (dialog) => {
  dialogs.push({
    type: dialog.type(),
    message: dialog.message(),
    accepted: dialogAccept
  });
  if (dialogAccept) await dialog.accept();
  else await dialog.dismiss();
});
const write = (name, value) =>
  writeFileSync(resolve(output, name), JSON.stringify(value, null, 2), {
    mode: 0o600
  });
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const button = (name) => page.getByRole("button", { name, exact: true });
const form = (name) => page.getByRole("form", { name, exact: true });
const saveForm = page.locator('main form:has([name="title"])');
const mergeForm = form("Merge into selected idea");
const unmergeForm = form("Reverse this idea merge");
const withdrawForm = form("Withdraw public idea");
const search = page.locator("#merge-search");
const searchForm = page.locator("main form:has(#merge-search)");
const retry = (owner) =>
  owner.getByRole("button", { name: "Retry original action", exact: true });
const discard = (owner) =>
  owner.getByRole("button", { name: "Discard local entries", exact: true });
const event = (name) =>
  page.evaluate((type) => window.dispatchEvent(new Event(type)), name);
const identity = (url) =>
  url.pathname === "/api/platform/profile" &&
  url.searchParams.get("view") === "identity";
const source = (url) =>
  url.pathname === "/api/platform/admin" &&
  url.searchParams.get("view") === "feedback-idea";
const command = (url) => url.pathname === "/api/platform/admin" && !url.search;
const settled = () => page.waitForLoadState("networkidle");
const sourceReads = () =>
  requests.filter(
    (request) =>
      request.method === "GET" && source(new URL(request.path, config.origin))
  ).length;
const signIn = async (who) => {
  await context.clearCookies();
  await context.addCookies([
    {
      name: "church_platform_session",
      value: who.token,
      url: config.origin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
};
const ready = async () => {
  await page
    .getByRole("heading", { name: "Review a public idea", exact: true })
    .waitFor();
  await saveForm.waitFor();
};
const refresh = async () => {
  const next = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      source(new URL(response.url())) &&
      response.status() === 200
  );
  await button("Refresh current view").click();
  const response = await next;
  const data = await response.json();
  await ready();
  return data;
};
const resume = async (name = "focus") => {
  await event(name);
  await ready();
};
const api = async (status = 200) => {
  const response = await context.request.get(
    config.origin +
      "/api/platform/admin?" +
      new URLSearchParams({ view: "feedback-idea", caseId }),
    { headers: { "X-Expected-Account": actor.id } }
  );
  assert.equal(response.status(), status, await response.text());
  assert.match(response.headers()["cache-control"], /no-store/);
  const value = await response.json();
  if (status === 200) assert.equal(value.navigation.viewer.id, actor.id);
  return value;
};
const fieldsAre = async (owner, values) => {
  await owner.waitFor();
  await page.waitForFunction(
    ({ label, titleForm, values }) => {
      const node = titleForm
        ? document.querySelector('main form:has([name="title"])')
        : [...document.querySelectorAll("form")].find(
            (el) => el.getAttribute("aria-label") === label
          );
      return (
        !!node &&
        Object.entries(values).every(([key, value]) => {
          const field = node.querySelector(`[name="${key}"]`);
          return (
            field &&
            (typeof value === "boolean"
              ? field.checked === value
              : field.value === value)
          );
        })
      );
    },
    {
      label: await owner.getAttribute("aria-label"),
      titleForm: owner === saveForm,
      values
    }
  );
};
const fill = async (owner, values) => {
  for (const [name, value] of Object.entries(values)) {
    const field = owner.locator(`[name="${name}"]`);
    if (typeof value === "boolean") await field.setChecked(value);
    else if (await field.evaluate((node) => node.tagName === "SELECT"))
      await field.selectOption(value);
    else await field.fill(value);
  }
};
const inactive = async (label) => {
  await page.waitForFunction(
    ({ marker, caseId, ideaId }) => {
      const root = document.querySelector("main");
      return (
        !!root &&
        !root.querySelector(
          '[name="title"],[name="summary"],[name="explanation"],[name="destinationChoice"],[name="q"],[name="reviewed"]'
        ) &&
        !root.textContent.includes(marker) &&
        !root.textContent.includes("Private source for this review") &&
        ![...root.querySelectorAll("a[href]")].some(
          (a) =>
            a.getAttribute("href").includes(caseId) ||
            (ideaId && a.getAttribute("href").includes(ideaId))
        )
      );
    },
    { marker, caseId, ideaId }
  );
  observations.push({
    label,
    privateDomAbsent: true,
    browserWrites: browserWrites.length
  });
};
const blockedSearch = async () => {
  if (!(await search.count())) return;
  assert.equal(await search.isDisabled(), true);
  assert.equal(await button("Find merge destinations").isDisabled(), true);
  const before = requests.filter((request) => request.document).length,
    url = page.url();
  await searchForm.evaluate((node) => node.requestSubmit());
  await settled();
  assert.equal(page.url(), url);
  assert.equal(requests.filter((request) => request.document).length, before);
  assert.equal(await page.evaluate(() => window.__ideaDocument), "original");
};
const capturedWithin = async (captured) => {
  let timer;
  try {
    return await Promise.race([
      captured,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error("Held idea request did not arrive")),
          30000
        );
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
};
const hold = (matches) => {
  let release, capture;
  const gate = new Promise((done) => {
      release = done;
    }),
    captured = new Promise((done) => {
      capture = done;
    }),
    deliveries = [];
  releases.add(release);
  const remove = register(matches, (route) => {
    const delivery = (async () => {
      const response = await route.fetch();
      assert.equal(response.status(), 200, await response.text());
      capture();
      await gate;
      await route.fulfill({ response });
    })();
    deliveries.push(delivery);
    return delivery;
  });
  return {
    captured,
    async finish() {
      release();
      await Promise.all(deliveries);
    },
    remove() {
      release();
      releases.delete(release);
      remove();
    }
  };
};
const failedRead = async (matches) => {
  const remove = register(matches, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Fictional idea source unavailable" })
    })
  );
  try {
    await event("focus");
    await page
      .getByText(
        matches === identity
          ? "Your sign-in could not be checked. Reconnect and try again."
          : "Fictional idea source unavailable",
        { exact: true }
      )
      .waitFor();
    await inactive(matches === identity ? "failed identity" : "failed source");
  } finally {
    remove();
  }
  await button("Recheck current access").click();
  await ready();
};
const lateRead = async (matches) => {
  const held = hold(matches);
  try {
    await event("focus");
    await capturedWithin(held.captured);
    await inactive(matches === identity ? "held identity" : "held source");
    await event("pagehide");
    await held.finish();
    await settled();
    await inactive(
      matches === identity
        ? "late identity after pagehide"
        : "late source after pagehide"
    );
  } finally {
    held.remove();
  }
  await resume("pageshow");
};
const newSuggestion = async (label) => {
  const state = await readSupport(db, requester.token, "new", {
    feedbackOnly: true
  });
  const result = await supportCommand(db, requester.token, {
    operation: "feedback-create",
    requestKey: randomUUID(),
    kind: "SUGGESTION",
    rating: null,
    outcome: marker + " private outcome " + label,
    helps: marker + " private audience " + label,
    recipientId: state.intake.recipient.id,
    recipientVersion: state.intake.recipient.version,
    notice: FEEDBACK_NOTICE,
    consent: true,
    contactAllowed: false,
    channels: [],
    allowIdea: true,
    publicAttribution: false
  });
  caseIds.push(result.caseId);
  return result.caseId;
};
const publish = async (id, label) => {
  const state = await readFeedbackIdeaAdministration(db, actor.token, {
    caseId: id
  });
  const result = await feedbackIdeaAdminCommand(db, actor.token, {
    operation: "idea-save",
    requestKey: randomUUID(),
    caseId: id,
    expectedVersion: 0,
    grantVersion: state.grantVersion,
    sourceVersion: state.source.version,
    feedbackVersion: state.source.feedbackVersion,
    sharingVersion: state.source.sharingVersion,
    title: marker + " reviewed " + label,
    summary: "A separately reviewed fictional public improvement.",
    status: "CONSIDERING",
    explanation: "A fictional independently reviewed public explanation.",
    reviewed: true
  });
  ideaIds.push(result.id);
  return result.id;
};
const oneReceipt = async (body) => {
  const payload = JSON.parse(body),
    rows = await db.adminOperation.findMany({
      where: { actorId: actor.id, requestKey: payload.requestKey }
    });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, payload.operation);
  assert.equal(rows[0].sourceId, caseId);
  return rows[0];
};
const ownedEffects = async () => ({
  operations: await db.adminOperation.count({ where: { actorId: actor.id } }),
  events: await db.feedbackIdeaEvent.count({ where: { actorId: actor.id } })
});
const ideaState = () =>
  db.feedbackIdea.findUniqueOrThrow({ where: { sourceCaseId: caseId } });
const recovery = async ({
  operation,
  owner,
  submit,
  verifyState,
  denied = false
}) => {
  const attempts = [],
    statuses = [],
    denialHolds = new Map();
  const sequence = denied ? [401, 403, 404, 429, 503] : [429, 503];
  for (const code of denied ? [401, 403, 404] : []) {
    let release, capture;
    const gate = new Promise((done) => {
        release = done;
      }),
      captured = new Promise((done) => {
        capture = done;
      });
    releases.add(release);
    denialHolds.set(code, { gate, captured, release, capture });
  }
  const before = await ownedEffects();
  const remove = register(command, async (route) => {
    attempts.push({
      body: route.request().postData(),
      owner: route.request().headers()["x-expected-account"]
    });
    assert.equal(JSON.parse(attempts.at(-1).body).operation, operation);
    if (attempts.length === 1) {
      const response = await route.fetch();
      assert.equal(response.status(), 200, await response.text());
      statuses.push(200);
      return route.abort("failed");
    }
    const code = sequence[attempts.length - 2];
    if (code) {
      statuses.push(code);
      const held = denialHolds.get(code);
      if (held) {
        held.capture();
        await held.gate;
      }
      return route.fulfill({
        status: code,
        contentType: "application/json",
        headers: code === 429 ? { "retry-after": "1" } : {},
        body: JSON.stringify({ message: "Fictional idea response " + code })
      });
    }
    const response = await route.fetch();
    assert.equal(response.status(), 200, await response.text());
    statuses.push(200);
    return route.fulfill({ response });
  });
  try {
    await owner.getByRole("button", { name: submit, exact: true }).click();
    await retry(owner).waitFor();
    const original = await oneReceipt(attempts[0].body),
      saved = await ideaState();
    await verifyState(saved);
    const fresh = await refresh();
    assert.equal(fresh.idea.version, saved.version);
    await retry(owner).waitFor();
    assert.deepEqual(await ownedEffects(), {
      operations: before.operations + 1,
      events: before.events + 1
    });
    await blockedSearch();
    await event("pagehide");
    await inactive(operation + " pending pagehide");
    await resume("pageshow");
    await retry(owner).waitFor();
    if (denied) {
      const count = browserWrites.length;
      await signIn(replacement);
      await retry(owner).click();
      await page
        .getByText("Your sign-in changed. Reload before continuing.", {
          exact: true
        })
        .waitFor();
      await inactive("pending withdrawal account replacement");
      assert.equal(browserWrites.length, count);
      await signIn(actor);
      await resume();
      await retry(owner).waitFor();
    }
    for (const code of sequence) {
      await retry(owner).click();
      const held = denialHolds.get(code);
      if (held) {
        await capturedWithin(held.captured);
        const trigger = code === 403 ? "blur" : "pagehide";
        await event(trigger);
        await inactive("held denial " + code);
        const beforeReads = sourceReads();
        held.release();
        await settled();
        await inactive("late denial " + code);
        assert.equal(
          sourceReads(),
          beforeReads,
          "Late denial must not resume a concealed private source"
        );
        await resume(trigger === "blur" ? "focus" : "pageshow");
        await retry(owner).waitFor();
      } else {
        await owner
          .getByText("Fictional idea response " + code, { exact: true })
          .waitFor();
        await page.waitForFunction(
          (label) =>
            [...document.querySelectorAll("form")]
              .find((form) => form.getAttribute("aria-label") === label)
              ?.querySelector('button:not([type]),button[type="submit"]')
              ?.disabled === false,
          await owner.getAttribute("aria-label")
        );
      }
      await blockedSearch();
      assert.equal(statuses.at(-1), code);
      assert.deepEqual(await oneReceipt(attempts[0].body), original);
    }
    const submitting = await owner.elementHandle();
    const confirmed = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/platform/admin" &&
        response.request().postData() === attempts[0].body &&
        response.status() === 200
    );
    const refreshed = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        source(new URL(response.url())) &&
        response.status() === 200
    );
    await retry(owner).click();
    await (await confirmed).finished();
    await page.waitForFunction(
      (node) => !node?.isConnected || node.getAttribute("aria-busy") !== "true",
      submitting
    );
    await (await refreshed).finished();
    await ready();
    await settled();
    assert.ok(
      attempts.every(
        (attempt) =>
          attempt.body === attempts[0].body && attempt.owner === actor.id
      )
    );
    assert.equal(attempts.length, sequence.length + 2);
    assert.deepEqual(statuses, [200, ...sequence, 200]);
    assert.deepEqual(await oneReceipt(attempts[0].body), original);
    assert.deepEqual(await ideaState(), saved);
    assert.deepEqual(await ownedEffects(), {
      operations: before.operations + 1,
      events: before.events + 1
    });
    recoveries.push({
      operation,
      attempts,
      statuses,
      auditId: original.id,
      ideaVersion: saved.version
    });
    return saved;
  } finally {
    for (const held of denialHolds.values()) {
      held.release();
      releases.delete(held.release);
    }
    remove();
  }
};
const fit = async (width, enlarged = false) => {
  await page.setViewportSize({ width, height: 844 });
  const name = "draft-" + width + (enlarged ? "-font-200" : "");
  const style = enlarged
    ? await page.addStyleTag({ content: "html{font-size:200%!important}" })
    : null;
  try {
    const targets = [
      [
        "source",
        page.getByRole("heading", {
          name: "Private source for this review",
          exact: true
        })
      ],
      ["save", saveForm.locator('button:not([type]),button[type="submit"]')],
      ["merge", mergeForm.locator('button:not([type]),button[type="submit"]')],
      [
        "withdraw",
        withdrawForm.locator('button:not([type]),button[type="submit"]')
      ]
    ];
    for (const [part, target] of targets) {
      await target.evaluate((node) =>
        node.scrollIntoView({ block: "center", inline: "nearest" })
      );
      if (part !== "source") await target.focus();
      const geometry = await target.evaluate((node) => {
        const r = node.getBoundingClientRect(),
          x = (r.left + r.right) / 2,
          y = (r.top + r.bottom) / 2;
        const nav = document.querySelector('nav[aria-label="Platform"]'),
          n = nav?.getBoundingClientRect();
        const availableBottom =
          nav &&
          getComputedStyle(nav).position === "fixed" &&
          n.top > innerHeight / 2
            ? n.top
            : innerHeight;
        return {
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          availableBottom,
          centerHit:
            node === document.elementFromPoint(x, y) ||
            node.contains(document.elementFromPoint(x, y)),
          focused: document.activeElement === node
        };
      });
      const path = resolve(output, name + "-" + part + ".png");
      await page.screenshot({ path });
      captures.push({ path, geometry });
      if (part !== "source") {
        assert.ok(geometry.centerHit && geometry.focused);
        assert.ok(
          geometry.top >= 0 && geometry.bottom <= geometry.availableBottom
        );
      }
    }
    const layout = await page.evaluate(() => ({
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflow: [...document.querySelectorAll("main *")]
        .map((node) => {
          const r = node.getBoundingClientRect();
          return {
            tag: node.tagName,
            name: node.getAttribute("name"),
            class: node.className,
            right: r.right + scrollX,
            width: r.width,
            text: node.textContent.slice(0, 100)
          };
        })
        .filter((row) => row.width && row.right > innerWidth + 1)
        .slice(0, 30)
    }));
    write(name + "-layout.json", layout);
    assert.ok(
      layout.scrollWidth <= width + 1,
      "No horizontal overflow: " + name
    );
  } finally {
    if (style) await style.evaluate((node) => node.remove());
  }
};
const run = async () => {
  actor = await createPortalActor(db, "ideaqarev");
  requester = await createPortalActor(db, "ideaqareq");
  replacement = await createPortalActor(db, "ideaqaswap");
  await seedOperatorGrants(db, actor, ["MANAGE_PRODUCT_FEEDBACK"]);
  productGrant = await db.platformOperatorGrant.findFirstOrThrow({
    where: { userId: actor.id, capability: "MANAGE_PRODUCT_FEEDBACK" }
  });
  respondGrant = await db.supportCapabilityGrant.create({
    data: { userId: actor.id, capability: "RESPOND" }
  });
  await db.supportIntakeSetting.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      ownerGrantId: respondGrant.id,
      enabled: true,
      approvedNoticeVersion: SUPPORT_NOTICE
    },
    update: {
      ownerGrantId: respondGrant.id,
      enabled: true,
      approvedNoticeVersion: SUPPORT_NOTICE
    }
  });
  caseId = await newSuggestion("source");
  const destinationCase = await newSuggestion("destination"),
    disappearingCase = await newSuggestion("disappearing option");
  destinationId = await publish(destinationCase, "destination");
  disappearingId = await publish(disappearingCase, "disappearing option");
  await signIn(actor);
  const snapshot = await api();
  privateSource = snapshot.source;
  assert.ok(privateSource.description.includes(marker));
  assert.ok(snapshot.releases.length);
  const path = "/platform/admin/feedback/ideas/" + caseId;
  for (const rsc of [false, true]) {
    const response = await context.request.get(
      config.origin + path,
      rsc ? { headers: { RSC: "1" } } : {}
    );
    assert.equal(response.status(), 200);
    if (rsc)
      assert.match(response.headers()["content-type"], /text\/x-component/);
    const text = await response.text();
    for (const value of [
      marker,
      privateSource.subject,
      privateSource.description,
      'name="title"',
      'name="summary"'
    ])
      assert.ok(
        !text.includes(value),
        "SSR/RSC omit private source and editor fields"
      );
  }
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
  await ready();
  await page.evaluate(() => {
    window.__ideaDocument = "original";
  });
  const draft = {
    title: marker + " reviewed title",
    summary: marker + " separately sanitized summary",
    status: "RELEASED",
    explanation: marker + " public explanation",
    releaseId: snapshot.releases[0].id,
    reviewed: true
  };
  await fill(saveForm, draft);
  for (const trigger of ["blur", "pagehide"]) {
    await event(trigger);
    await inactive("unpublished " + trigger);
    await resume(trigger === "blur" ? "focus" : "pageshow");
    await fieldsAre(saveForm, draft);
  }
  await db.platformOperatorGrant.update({
    where: { id: productGrant.id },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  grantRevoked = true;
  await api(404);
  await event("focus");
  await page
    .getByText("This admin view or request is not available to this account.", {
      exact: true
    })
    .waitFor();
  await inactive("actual product capability revocation");
  await db.platformOperatorGrant.update({
    where: { id: productGrant.id },
    data: { revokedAt: productGrant.revokedAt, version: { increment: 1 } }
  });
  grantRevoked = false;
  await resume();
  await fieldsAre(saveForm, draft);
  await saveForm
    .getByRole("button", {
      name: "Use current version with these entries",
      exact: true
    })
    .click();
  await fieldsAre(saveForm, draft);
  assert.equal(browserWrites.length, 0);
  ok(
    "Initial HTML/RSC omit the private idea source and unsent editor. Real capability revocation conceals physical DOM; original-owner restoration retains all six publication values and requires explicit adoption of the changed grant version."
  );

  const saved = await recovery({
    operation: "idea-save",
    owner: saveForm,
    submit: "Publish reviewed idea",
    verifyState: async (state) => {
      assert.ok(state.publishedAt && !state.withdrawnAt);
      assert.equal(state.title, draft.title);
    }
  });
  ideaId = saved.id;
  ideaIds.push(ideaId);
  assert.equal(saved.version, 1);
  await fieldsAre(saveForm, { ...draft, reviewed: false });
  ok(
    "A real publication with lost acknowledgment survives the unpublished-to-published transition, concealment, 429 and 503. Four byte-identical retries keep the original owner/key/source versions/release evidence and produce one publication audit/event."
  );

  searchDraft = marker + " retained search";
  await search.fill(searchDraft);
  const sibling = {
    ...draft,
    title: marker + " unsent sibling title",
    summary: marker + " unsent sibling summary",
    status: "PLANNED",
    releaseId: "",
    explanation: marker + " unsent sibling explanation",
    reviewed: true
  };
  const mergeDraft = {
    destinationChoice: disappearingId + ":1",
    explanation: marker + " unsent merge explanation",
    reviewed: true
  };
  const withdrawDraft = { explanation: marker + " unsent withdrawal reason" };
  await fill(saveForm, sibling);
  await fill(mergeForm, mergeDraft);
  await fill(withdrawForm, withdrawDraft);
  await blockedSearch();
  const retain = async () => {
    await fieldsAre(saveForm, sibling);
    await fieldsAre(mergeForm, mergeDraft);
    await fieldsAre(withdrawForm, withdrawDraft);
    assert.equal(await search.inputValue(), searchDraft);
  };
  for (const trigger of ["blur", "offline", "pagehide", "hidden"]) {
    if (trigger === "hidden")
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => "hidden"
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
    else await event(trigger);
    await inactive("all drafts " + trigger);
    if (trigger === "hidden")
      await page.evaluate(() => {
        delete document.visibilityState;
        document.dispatchEvent(new Event("visibilitychange"));
      });
    else
      await event(
        trigger === "blur"
          ? "focus"
          : trigger === "offline"
            ? "online"
            : "pageshow"
      );
    await ready();
    await retain();
  }
  await failedRead(identity);
  await retain();
  await failedRead(source);
  await retain();
  await lateRead(identity);
  await retain();
  await lateRead(source);
  await retain();
  await signIn(replacement);
  await event("focus");
  await page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .waitFor();
  await inactive("all drafts account replacement");
  await signIn(actor);
  await resume();
  await retain();
  for (const [width, enlarged] of [
    [390, false],
    [320, false],
    [320, true]
  ])
    await fit(width, enlarged);
  await page.setViewportSize({ width: 390, height: 844 });
  ok(
    "Published-source, publication, merge, withdrawal and controlled search drafts physically disappear through lifecycle, failed/held reads and account replacement, then restore exactly. Search click/native navigation stays blocked. Twelve responsive captures include fully visible focused action buttons above the fixed navigation."
  );

  const disappearing = await readFeedbackIdeaAdministration(db, actor.token, {
    caseId: disappearingCase
  });
  await feedbackIdeaAdminCommand(db, actor.token, {
    operation: "idea-withdraw",
    requestKey: randomUUID(),
    caseId: disappearingCase,
    ideaId: disappearingId,
    expectedVersion: disappearing.idea.version,
    grantVersion: disappearing.grantVersion,
    explanation: "Fictional destination option was independently withdrawn."
  });
  await refresh();
  await retain();
  const choice = mergeForm.locator('[name="destinationChoice"]');
  assert.equal(await choice.inputValue(), disappearingId + ":1");
  assert.equal(
    await choice.locator("option:checked").innerText(),
    "Previous selection is no longer available"
  );
  assert.equal(await choice.locator("option:checked").isDisabled(), true);
  assert.equal(
    await mergeForm
      .locator('button:not([type]),button[type="submit"]')
      .isDisabled(),
    true
  );
  const beforeMissing = browserWrites.length;
  await mergeForm.evaluate((node) => node.requestSubmit());
  await settled();
  assert.equal(browserWrites.length, beforeMissing);
  await discard(mergeForm).click();
  await refresh();
  await fieldsAre(mergeForm, {
    destinationChoice: "",
    explanation: "",
    reviewed: false
  });
  await fieldsAre(saveForm, sibling);
  await fieldsAre(withdrawForm, withdrawDraft);
  assert.equal(await search.inputValue(), searchDraft);
  ok(
    "An independently withdrawn destination cannot silently become another choice. Its original value remains in a generic disabled option, fresh submission sends nothing, and deliberate merge-draft discard leaves sibling publication/withdrawal/search drafts intact."
  );

  await fill(mergeForm, {
    destinationChoice: destinationId + ":1",
    explanation: marker + " original accepted merge",
    reviewed: true
  });
  const merged = await recovery({
    operation: "idea-merge",
    owner: mergeForm,
    submit: "Merge into selected idea",
    verifyState: async (state) =>
      assert.equal(state.mergedIntoId, destinationId)
  });
  assert.equal(merged.version, 2);
  await fieldsAre(saveForm, sibling);
  await fieldsAre(withdrawForm, withdrawDraft);
  await mergeForm.waitFor({ state: "detached" });
  await unmergeForm.waitFor();
  await discard(withdrawForm).click();
  await refresh();
  await fieldsAre(withdrawForm, { explanation: "" });
  await fill(unmergeForm, {
    explanation: marker + " original accepted reversal",
    reviewed: true
  });
  const unmerged = await recovery({
    operation: "idea-unmerge",
    owner: unmergeForm,
    submit: "Reverse this idea merge",
    verifyState: async (state) => assert.equal(state.mergedIntoId, null)
  });
  assert.equal(unmerged.version, 3);
  await unmergeForm.waitFor({ state: "detached" });
  await fieldsAre(saveForm, sibling);
  ok(
    "Accepted merge and reversal each keep their original controller after refreshed applicability changes. Each runs lost acknowledgment →429→503→exact successful retry with one event/audit; retained sibling publication text is never remounted or silently rebased."
  );

  await fill(withdrawForm, {
    explanation: marker + " original accepted withdrawal"
  });
  const withdrawn = await recovery({
    operation: "idea-withdraw",
    owner: withdrawForm,
    submit: "Withdraw public idea",
    denied: true,
    verifyState: async (state) => assert.ok(state.withdrawnAt)
  });
  assert.equal(withdrawn.version, 4);
  await withdrawForm.waitFor({ state: "detached" });
  await fieldsAre(saveForm, sibling);
  ok(
    "Accepted withdrawal retains its original command after publication disappears. Same-page account replacement sends no POST, held401/403/404 never reread or reveal while concealed, and429/503 preserve exact recovery. Seven identical requests leave one withdrawal event/audit."
  );

  await discard(saveForm).click();
  await refresh();
  await fieldsAre(saveForm, { ...draft, reviewed: false });
  const republishDraft = {
    ...draft,
    title: marker + " deliberate republished title",
    explanation: marker + " deliberate republished explanation"
  };
  await fill(saveForm, republishDraft);
  let discardedBody;
  const remove = register(command, async (route) => {
    discardedBody = route.request().postData();
    const response = await route.fetch();
    assert.equal(response.status(), 200, await response.text());
    return route.abort("failed");
  });
  try {
    await saveForm
      .getByRole("button", { name: "Publish reviewed idea", exact: true })
      .click();
    await retry(saveForm).waitFor();
  } finally {
    remove();
  }
  const discardedReceipt = await oneReceipt(discardedBody),
    republished = await ideaState();
  assert.equal(republished.version, 5);
  await refresh();
  await retry(saveForm).waitFor();
  dialogAccept = false;
  const beforeDialogs = dialogs.length;
  await discard(saveForm).click();
  assert.equal(dialogs.length, beforeDialogs + 1);
  assert.match(dialogs.at(-1).message, /may already be saved/);
  await retry(saveForm).waitFor();
  dialogAccept = true;
  await discard(saveForm).click();
  await ready();
  await fieldsAre(saveForm, { ...republishDraft, reviewed: false });
  await saveForm
    .getByRole("status")
    .filter({ hasText: "Local entries discarded. Saved changes remain." })
    .waitFor();
  assert.equal(await retry(saveForm).count(), 0);
  assert.deepEqual(await oneReceipt(discardedBody), discardedReceipt);
  assert.deepEqual(await ideaState(), republished);
  await search.waitFor();
  assert.equal(await search.isEnabled(), true);
  assert.equal(await search.inputValue(), searchDraft);
  await search.fill(marker);
  await button("Find merge destinations").click();
  await page.waitForURL(
    (url) => url.pathname === path && url.searchParams.get("q") === marker
  );
  await ready();
  assert.equal(await page.evaluate(() => window.__ideaDocument), undefined);
  assert.equal(await search.inputValue(), marker);
  ok(
    "Warned discard can be canceled, then clears only local uncertainty after a real accepted republish. Authoritative saved defaults return, audit/effect survive, and clean search navigation opens a fresh document without any additional mutation."
  );

  const effects = await ownedEffects();
  assert.deepEqual(effects, { operations: 8, events: 8 });
  assert.equal(browserWrites.length, 20);
  assert.equal(
    (await db.feedbackIdea.findUniqueOrThrow({ where: { id: destinationId } }))
      .version,
    3
  );
  assert.equal(
    (await db.feedbackIdea.findUniqueOrThrow({ where: { id: disappearingId } }))
      .version,
    2
  );
  assert.ok(
    browserWrites.every(
      (request) =>
        request.method === "POST" &&
        request.path === "/api/platform/admin" &&
        request.owner === actor.id
    )
  );
  assert.equal(
    await db.supportOperation.count({ where: { actorId: requester.id } }),
    3
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(routeErrors, []);
  assert.deepEqual(externalRequests, []);
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  write("result.json", {
    results,
    errors,
    routeErrors,
    externalRequests,
    browserWrites,
    requests,
    observations,
    recoveries,
    dialogs,
    captures,
    fixtureOnly: true,
    node: { version: process.version, execPath: process.execPath },
    browserMutationAttempts: browserWrites.length,
    fixtureEffects: {
      createdActors: 3,
      operatorGrants: 1,
      supportRespondGrants: 1,
      feedbackCreates: 3,
      serviceIdeaPublications: 2,
      serviceDestinationWithdrawals: 1,
      browserIdeaEffects: 5,
      ideaRows: 3,
      ideaEvents: effects.events,
      adminOperations: effects.operations,
      grantRevokeRestoreUpdates: 2,
      intakeTemporaryAndRestoreWrites: 2,
      localVerificationMessages: 3
    },
    productionWrites: 0,
    externalSends: 0,
    limitations: [
      "Synthetic browser lifecycle events do not establish physical-device or operating-system snapshot behavior.",
      "Lost acknowledgments and401/403/404/429/503 are explicit response simulations around actual saved operations; they do not establish rate-limiter configuration.",
      "Real product-grant revocation is tested on unsent entries. Original command retries retain the same grant version, because the existing backend checks current grant version before prior receipt lookup.",
      "Public-only AdminIdeaModeration and broad shared AdminForm regression remain in their separate existing suites.",
      "Standard actor signup uses only the local test sink and the existing isolated authentication-rate fixture reset."
    ]
  });
  console.log("FEEDBACK_IDEA_PRIVACY_BROWSER_PASS " + results.length);
};
try {
  await Promise.race([run(), routingFailure]);
} catch (error) {
  await page
    .screenshot({ path: resolve(output, "failure.png"), fullPage: true })
    .catch(() => {});
  write("failure.json", {
    results,
    errors,
    routeErrors,
    externalRequests,
    browserWrites,
    requests,
    observations,
    recoveries,
    dialogs,
    captures,
    message: String(error),
    stack: error.stack,
    url: page.url(),
    fixtureOnly: true
  });
  throw error;
} finally {
  for (const release of releases) release();
  try {
    if (grantRevoked)
      await db.platformOperatorGrant.update({
        where: { id: productGrant.id },
        data: { revokedAt: productGrant.revokedAt, version: { increment: 1 } }
      });
    if (respondGrant) {
      if (originalIntake)
        await db.supportIntakeSetting.upsert({
          where: { id: "default" },
          create: originalIntake,
          update: {
            ownerGrantId: originalIntake.ownerGrantId,
            enabled: originalIntake.enabled,
            approvedNoticeVersion: originalIntake.approvedNoticeVersion
          }
        });
      else
        await db.supportIntakeSetting.deleteMany({
          where: { id: "default", ownerGrantId: respondGrant.id }
        });
    }
  } finally {
    await browser.close();
    await db.$disconnect();
  }
}
