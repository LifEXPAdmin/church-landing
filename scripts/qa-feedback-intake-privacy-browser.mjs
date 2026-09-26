import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";

const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the existing isolated HTTPS fixture directory");
assert.ok(resolve(fixtureDir).startsWith(resolve(".account-test") + "/"));
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
  MEDIA_STORAGE_MODE: "local-test",
  MEDIA_TEST_DIR: resolve(fixtureDir, "images"),
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: "",
  SUPPORT_INTAKE_ENABLED: "true",
  FEEDBACK_INTAKE_ENABLED: "true",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  SOCIAL_EMAIL_ENABLED: "false",
  FOUNDER_WELCOME_ENABLED: "false",
  FOUNDER_ANNOUNCEMENTS_ENABLED: "false",
  PUSH_ENABLED: "false"
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase } = await import("../tests/seed-portal.ts");
const { seedSupport } = await import("../tests/seed-support.ts");
const { FEEDBACK_NOTICE } = await import("../lib/platform/feedback-types.ts");
const { default: sharp } = await import("sharp");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const originalIntake = await db.supportIntakeSetting.findUnique({
  where: { id: "default" }
});
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
  viewport: { width: 390, height: 844 }
});
const page = await context.newPage();
page.setDefaultTimeout(30000);
const output = resolve(
  fixtureDir,
  "feedback-intake-privacy-browser-" + Date.now()
);
mkdirSync(output, { recursive: true, mode: 0o700 });

const results = [],
  errors = [],
  externalRequests = [],
  browserWrites = [],
  retryEvidence = [];
const markers = [],
  releases = new Set();
await context.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (url.origin !== config.origin) {
    externalRequests.push(url.origin + url.pathname);
    await route.abort();
  } else await route.continue();
});
context.on("request", (request) => {
  if (!["GET", "HEAD"].includes(request.method()))
    browserWrites.push({
      method: request.method(),
      path: new URL(request.url()).pathname
    });
});
page.on("pageerror", (error) => errors.push(error.message));
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const nonce = randomUUID();
const marker = (name) => {
  const value = "Fictional intake " + name + " " + nonce;
  markers.push(value);
  return value;
};
const feedbackEndpoint = config.origin + "/api/platform/feedback";
const imageEndpoint = config.origin + "/api/platform/images";
const preferenceEndpoint = config.origin + "/api/platform/feedback/prompts";
const identityRoute = "**/api/platform/profile?view=identity";
const intakeRoute = (url) =>
  url.pathname === "/api/platform/feedback" &&
  url.searchParams.get("view") === "new";
const form = () => page.locator('form[aria-label="Send feedback"]');
const button = (name) => page.getByRole("button", { name, exact: true });
const field = (name) => form().locator('[name="' + name + '"]');
const uploads = () => form().locator('li[aria-label^="Upload "]');
const removeUploaded = () => button("Remove uploaded attachment");
const retryCreation = () =>
  page.getByRole("button", {
    name: /^(Retry original request|Confirm original request(?:: Send feedback)?)$/
  });
const preference = () =>
  page.locator("main details").filter({
    has: page
      .locator("summary")
      .filter({ hasText: "Automatic feedback prompts" })
  });
const retryPreference = () =>
  page.getByRole("button", {
    name: /^(Retry the same preference|Finish protecting this preference)$/
  });
const event = (name) =>
  page.evaluate((type) => window.dispatchEvent(new Event(type)), name);
const until = async (check, message) => {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((done) => setTimeout(done, 100));
  }
  assert.fail(message);
};
const signIn = async (actor) => {
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
const go = async () => {
  const response = await page.goto(config.origin + "/platform/feedback");
  assert.equal(response.status(), 200);
  await page.waitForLoadState("networkidle");
  await form().waitFor();
};
const absent = async () => {
  await page.waitForFunction((values) => {
    const html = document.documentElement.outerHTML;
    return (
      values.every((value) => !html.includes(value)) &&
      !document.querySelector('main form[aria-label="Send feedback"]') &&
      !document.querySelector(
        'main input[type="file"],main textarea,main select,main [name="consent"]'
      ) &&
      !document.querySelector(
        'main img[src^="blob:"],main img[src*="/api/platform/feedback/"]'
      ) &&
      ![...document.querySelectorAll("main summary")].some((node) =>
        node.textContent.includes("Automatic feedback prompts")
      )
    );
  }, markers);
};
const writtenState = () =>
  form().evaluate((node) => ({
    fields: Object.fromEntries(
      [...node.querySelectorAll("input[name],textarea[name],select[name]")]
        .filter((input) => input.type !== "file")
        .map((input) => [
          input.name === "channels" ? "channels:" + input.value : input.name,
          input.type === "checkbox" ? input.checked : input.value
        ])
    ),
    context: node.querySelector('input[aria-controls$="-context"]')?.checked
  }));
const selectedState = () =>
  uploads().evaluateAll((rows) =>
    rows.map((row) => ({
      name: row.getAttribute("aria-label"),
      caption: row.querySelector("textarea")?.value,
      alt: row.querySelector('input:not([type="file"])')?.value
    }))
  );
let originalWritten, originalSelected, fixture;
const retained = async (selected = true) => {
  await form().waitFor();
  assert.deepEqual(await writtenState(), originalWritten);
  if (selected) assert.deepEqual(await selectedState(), originalSelected);
};
const openPreferences = async () => {
  await preference().waitFor();
  if (!(await preference().evaluate((node) => node.open)))
    await preference().locator("summary").click();
};
const serialization = async () => {
  for (const flight of [false, true]) {
    const response = await context.request.get(
      config.origin + "/platform/feedback",
      flight ? { headers: { RSC: "1" } } : {}
    );
    assert.equal(response.status(), 200);
    if (flight)
      assert.match(response.headers()["content-type"], /text\/x-component/);
    const html = await response.text();
    for (const value of markers)
      assert.ok(
        !html.includes(value),
        "Private intake data absent from HTML/RSC"
      );
  }
};
const failedRead = async (pattern) => {
  const deliveries = [];
  const handler = (route) => {
    const delivery = route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Fictional intake read outage" })
    });
    deliveries.push(delivery);
    return delivery;
  };
  await page.route(pattern, handler);
  try {
    await event("focus");
    await page
      .getByText(
        pattern === identityRoute
          ? "Your sign-in could not be checked. Reconnect and try again."
          : "Fictional intake read outage",
        { exact: true }
      )
      .waitFor();
    await absent();
    await Promise.all(deliveries);
  } finally {
    await page.unroute(pattern, handler);
  }
  await button("Recheck current access").click();
  await retained();
};
// Hold every matching read: the uploader and workspace both verify identity.
// No parallel identity response may race past the hold and disclose the form.
const holdReads = async (pattern) => {
  let release, capture;
  const gate = new Promise((done) => {
    release = done;
  });
  const captured = new Promise((done) => {
    capture = done;
  });
  const deliveries = [];
  releases.add(release);
  const handler = (route) => {
    const delivery = (async () => {
      const response = await route.fetch();
      capture();
      await gate;
      await route.fulfill({ response });
    })();
    deliveries.push(delivery);
    return delivery;
  };
  await page.route(pattern, handler);
  return {
    captured,
    release,
    async close() {
      release();
      releases.delete(release);
      await Promise.all(deliveries);
      await page.unroute(pattern, handler);
    }
  };
};
const waitCaptured = async (captured) => {
  let timer;
  try {
    await Promise.race([
      captured,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error("Expected held request did not arrive")),
          30000
        );
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
};
const lateRead = async (pattern) => {
  const held = await holdReads(pattern);
  try {
    await event("focus");
    await waitCaptured(held.captured);
    await absent();
    await event("pagehide");
    held.release();
    await page.waitForLoadState("networkidle");
    await absent();
  } finally {
    await held.close();
  }
  await event("pageshow");
  await retained();
};
const post = async (target, endpoint, expectedStatus = 200) => {
  const response = page.waitForResponse(
    (r) => r.url() === endpoint && r.request().method() === "POST"
  );
  await target.click();
  const result = await response;
  assert.equal(result.status(), expectedStatus, await result.text());
  return result.json();
};
const waitReadyButton = async (target) => {
  await target.waitFor();
  await until(
    () => target.isEnabled(),
    "Expected recovery button remained disabled"
  );
};
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fingerprint = (attempt) => ({
  bodySha256: hash(attempt.body),
  account: attempt.account,
  requestKey: JSON.parse(attempt.body).requestKey,
  mutationId: JSON.parse(attempt.body).mutationId
});
const jsonAttempt = (request) => ({
  body: request.postData(),
  account: request.headers()["x-expected-account"]
});
const screenshot = async (name, width, enlarged = false) => {
  await page.setViewportSize({ width, height: 844 });
  const style = enlarged
    ? await page.addStyleTag({ content: "html{font-size:200%!important}" })
    : null;
  await openPreferences();
  await page.screenshot({ path: output + "/" + name + ".png", fullPage: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: output + "/" + name + "-top.png" });
  for (const [part, target] of [
    ["form", field("kind")],
    ["choices", field("contactAllowed")],
    ["attachment", uploads().getByLabel("Caption", { exact: true })],
    [
      "attachment-description",
      uploads().getByLabel("Image description for screen readers", {
        exact: true
      })
    ],
    ["preferences", preference()]
  ]) {
    await target.scrollIntoViewIfNeeded();
    await page.screenshot({ path: output + "/" + name + "-" + part + ".png" });
  }
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal overflow: " + name
  );
  if (style) await style.evaluate((node) => node.remove());
};
const privateDraft = Object.fromEntries(
  [
    "subject",
    "description",
    "actual",
    "expected",
    "steps",
    "outcome",
    "helps"
  ].map((name) => [name, marker(name)])
);
const caption = marker("selected caption"),
  alt = marker("selected alternative");
const fileName = "fictional-intake-" + nonce + ".png";
markers.push(fileName);
const reference =
  "QA_INTAKE_" + nonce.replaceAll("-", "").slice(0, 12).toUpperCase();
markers.push(reference);
const fillWrittenDraft = async () => {
  await field("subject").fill(privateDraft.subject);
  await field("description").fill(privateDraft.description);
  await field("rating").selectOption("4");
  await field("kind").selectOption("BUG");
  for (const name of ["actual", "expected", "steps"])
    await field(name).fill(privateDraft[name]);
  await field("kind").selectOption("SUGGESTION");
  for (const name of ["outcome", "helps"])
    await field(name).fill(privateDraft[name]);
  await field("contactAllowed").check();
  await form().locator('[name="channels"][value="IN_APP"]').check();
  await form().locator('[name="channels"][value="EMAIL"]').uncheck();
  await form().locator('[name="channels"][value="PUSH"]').check();
  await field("allowIdea").check();
  await field("publicAttribution").check();
  await form()
    .getByRole("checkbox", {
      name: "Include optional technical context I review below",
      exact: true
    })
    .check();
  await field("device").selectOption("PHONE");
  await field("browser").selectOption("CHROME");
  await field("errorReference").fill(reference);
  await field("consent").check();
  for (const kind of ["GENERAL", "BUG", "SUGGESTION"]) {
    await field("kind").selectOption(kind);
    for (const [name, value] of Object.entries(privateDraft))
      assert.equal(await field(name).inputValue(), value);
  }
};
const imageBytes = await sharp({
  create: { width: 160, height: 120, channels: 3, background: "blue" }
})
  .png()
  .toBuffer();
const originalFile = {
  name: fileName,
  mimeType: "image/png",
  buffer: imageBytes
};
try {
  fixture = await seedSupport(db);
  markers.push(
    fixture.owner.name,
    fixture.backup.name,
    fixture.ownerGrant.id,
    fixture.backupGrant.id
  );
  await signIn(fixture.memberA);
  await serialization();
  const source = await context.request.get(feedbackEndpoint + "?view=new", {
    headers: { "X-Expected-Account": fixture.memberA.id }
  });
  assert.equal(source.status(), 200);
  assert.match(source.headers()["cache-control"], /no-store/);
  const initial = await source.json();
  assert.equal(initial.viewer.id, fixture.memberA.id);
  assert.equal(initial.intake.recipient.id, fixture.ownerGrant.id);
  assert.equal(initial.intake.recipient.name, fixture.owner.name);
  await go();
  const emptyWritten = await writtenState();
  await fillWrittenDraft();
  await form()
    .getByLabel("Choose photos", { exact: true })
    .setInputFiles(originalFile);
  await uploads().waitFor();
  await uploads().getByLabel("Caption", { exact: true }).fill(caption);
  await uploads()
    .getByLabel("Image description for screen readers", { exact: true })
    .fill(alt);
  originalWritten = await writtenState();
  originalSelected = await selectedState();
  assert.equal(originalWritten.fields.kind, "SUGGESTION");
  assert.equal(originalWritten.fields.rating, "4");
  assert.equal(originalWritten.fields.consent, true);
  assert.equal(originalWritten.context, true);
  await page.evaluate(() => {
    window.__intakeDocument = "original draft";
  });
  ok(
    "Initial HTML/RSC omit the named recipient and grant IDs; the authorized API and hydrated form disclose the current recipient, while every kind-specific field, choice and technical-context value is independently entered."
  );

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
    await absent();
    if (trigger === "hidden")
      await page.evaluate(() => {
        delete document.visibilityState;
        document.dispatchEvent(new Event("visibilitychange"));
      });
    else
      await event(
        trigger === "offline"
          ? "online"
          : trigger === "pagehide"
            ? "pageshow"
            : "focus"
      );
    await retained();
  }
  await failedRead(identityRoute);
  await failedRead(intakeRoute);
  await lateRead(identityRoute);
  await lateRead(intakeRoute);
  await signIn(fixture.memberB);
  await event("focus");
  await page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .waitFor();
  await absent();
  assert.equal(browserWrites.length, 0);
  await signIn(fixture.memberA);
  await event("focus");
  await retained();
  assert.equal(
    await page.evaluate(() => window.__intakeDocument),
    "original draft"
  );
  ok(
    "Blur/offline/pagehide/hidden documents, failed and late identity/source reads and account replacement physically remove private recipient, fields, selected-file names and previews; the original account restores every draft and file-description value in the same document without writes."
  );

  await openPreferences();
  await page.waitForLoadState("networkidle");
  let releasePreferenceCheck,
    capturePreferenceCheck,
    preferenceReads = 0;
  const preferenceReadGate = new Promise((done) => {
    releasePreferenceCheck = done;
  });
  const preferenceReadCaptured = new Promise((done) => {
    capturePreferenceCheck = done;
  });
  const preferenceReadDeliveries = [];
  releases.add(releasePreferenceCheck);
  const changedPreferenceIdentity = (route) => {
    const ordinal = ++preferenceReads;
    const delivery = (async () => {
      const response = await route.fetch();
      if (ordinal > 1) {
        capturePreferenceCheck();
        await preferenceReadGate;
      }
      await route.fulfill({ response });
    })();
    preferenceReadDeliveries.push(delivery);
    return delivery;
  };
  await page.route(identityRoute, changedPreferenceIdentity);
  try {
    await signIn(fixture.memberB);
    // Deliberately no focus/visibility event: the inline preference owner must
    // propagate its own current-account denial to the whole intake presenter.
    await button("Check current prompt preference").click();
    await waitCaptured(preferenceReadCaptured);
    await absent();
    assert.equal(browserWrites.length, 0);
    await signIn(fixture.memberA);
    releasePreferenceCheck();
    await Promise.all(preferenceReadDeliveries);
    await page.waitForLoadState("networkidle");
    await absent();
  } finally {
    releasePreferenceCheck();
    releases.delete(releasePreferenceCheck);
    await page.unroute(identityRoute, changedPreferenceIdentity);
  }
  await event("focus");
  await retained();
  ok(
    "Changing cookies without a focus event and checking inline prompt preferences conceals the entire intake; a held stale identity reread cannot restore it, and the original account recovers the full draft and selected file without a write."
  );

  await db.supportIntakeSetting.update({
    where: { id: "default" },
    data: { ownerGrantId: fixture.backupGrant.id }
  });
  await event("focus");
  await button("Use current request with these entries").waitFor();
  await retained();
  assert.equal(await button("Send feedback").isDisabled(), true);
  assert.ok(
    (await page.getByRole("main").innerText()).includes(fixture.backup.name)
  );
  await button("Use current request with these entries").click();
  await retained();
  assert.equal(
    await button("Use current request with these entries").count(),
    0
  );
  await screenshot("draft-390", 390);
  await screenshot("draft-320", 320);
  await screenshot("draft-320-font-200", 320, true);
  await page.setViewportSize({ width: 390, height: 844 });
  ok(
    "A changed recipient preserves the complete draft and selected file but requires explicit current-request adoption; 390px, 320px and 200% text captures fit without horizontal overflow."
  );

  const uploadAttempts = [],
    uploadDeliveries = [];
  let firstUpload, captureUpload, releaseUpload;
  const uploaded = new Promise((done) => {
    captureUpload = done;
  });
  const uploadGate = new Promise((done) => {
    releaseUpload = done;
  });
  releases.add(releaseUpload);
  const uploadHandler = (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    const details = decodeURIComponent(request.headers()["x-image-details"]);
    uploadAttempts.push({
      body: details,
      account: request.headers()["x-expected-account"],
      fileSha256: hash(request.postDataBuffer())
    });
    const attempt = uploadAttempts.length;
    const delivery = (async () => {
      if (attempt >= 2 && attempt <= 4)
        return route.fulfill({
          status: [401, 403, 404][attempt - 2],
          contentType: "application/json",
          body: JSON.stringify({ message: "Fictional upload account denial" })
        });
      const response = await route.fetch();
      assert.equal(response.status(), 200, await response.text());
      if (attempt === 1) {
        firstUpload = await response.json();
        captureUpload();
        await uploadGate;
        await route.abort("failed");
      } else await route.fulfill({ response });
    })();
    uploadDeliveries.push(delivery);
    return delivery;
  };
  await page.route(imageEndpoint, uploadHandler);
  try {
    await button("Upload private attachment").click();
    await waitCaptured(uploaded);
    await event("pagehide");
    await absent();
    releaseUpload();
    await uploadDeliveries[0];
    await event("pageshow");
    await retained();
    await waitReadyButton(button("Retry same upload"));
    assert.equal(uploadAttempts[0].fileSha256, hash(imageBytes));
    const details = JSON.parse(uploadAttempts[0].body);
    assert.equal(details.targetId, fixture.memberA.id);
    assert.equal(details.purpose, "SUPPORT_ATTACHMENT");
    assert.equal(details.caption, caption);
    assert.equal(details.alt, alt);
    assert.equal(
      await db.mediaAsset.count({
        where: {
          uploaderId: fixture.memberA.id,
          requestKey: details.requestKey
        }
      }),
      1
    );
    for (const status of [401, 403, 404]) {
      const held = await holdReads(intakeRoute);
      try {
        await post(button("Retry same upload"), imageEndpoint, status);
        await waitCaptured(held.captured);
        await absent();
      } finally {
        await held.close();
      }
      await retained();
      await waitReadyButton(button("Retry same upload"));
    }
    await signIn(fixture.memberB);
    await event("focus");
    await page
      .getByText("Your sign-in changed. Reload before continuing.", {
        exact: true
      })
      .waitFor();
    await absent();
    assert.equal(uploadAttempts.length, 4);
    await signIn(fixture.memberA);
    await event("focus");
    await retained();
    await post(button("Retry same upload"), imageEndpoint);
    await until(
      async () =>
        (await removeUploaded().count()) === 1 &&
        (await uploads().count()) === 0,
      "Original uploaded image did not become one retained attachment"
    );
    await Promise.all(uploadDeliveries);
    assert.equal(uploadAttempts.length, 5);
    for (const attempt of uploadAttempts)
      assert.deepEqual(attempt, uploadAttempts[0]);
    assert.equal(
      await db.mediaAsset.count({
        where: {
          uploaderId: fixture.memberA.id,
          requestKey: details.requestKey
        }
      }),
      1
    );
    retryEvidence.push({
      kind: "upload",
      ...fingerprint(uploadAttempts[0]),
      fileSha256: hash(imageBytes),
      attempts: 5,
      effects: 1
    });
  } finally {
    releaseUpload();
    releases.delete(releaseUpload);
    await page.unroute(imageEndpoint, uploadHandler);
  }
  await event("blur");
  await absent();
  await event("focus");
  await retained(false);
  assert.equal(await removeUploaded().count(), 1);
  ok(
    "A real accepted upload survives a dropped acknowledgement across pagehide, 401/403/404 denials with held access rereads and account replacement; all five attempts repeat the original file hash/details/account/key and retain exactly one asset, while uploaded previews disappear during concealment."
  );

  const secondCaption = marker("removable caption"),
    secondAlt = marker("removable alternative");
  await form()
    .getByLabel("Choose photos", { exact: true })
    .setInputFiles({
      ...originalFile,
      name: "fictional-removable-" + nonce + ".png"
    });
  await uploads().waitFor();
  await uploads().getByLabel("Caption", { exact: true }).fill(secondCaption);
  await uploads()
    .getByLabel("Image description for screen readers", { exact: true })
    .fill(secondAlt);
  const secondUpload = await post(
    button("Upload private attachment"),
    imageEndpoint
  );
  await until(
    async () => (await removeUploaded().count()) === 2,
    "Second attachment did not render"
  );
  const removalAttempts = [],
    removalDeliveries = [];
  const removalHandler = (route) => {
    const request = route.request();
    if (
      request.method() !== "POST" ||
      request.postDataJSON()?.operation !== "feedback-remove-upload"
    )
      return route.continue();
    removalAttempts.push(jsonAttempt(request));
    const first = removalAttempts.length === 1;
    const delivery = (async () => {
      const response = await route.fetch();
      assert.equal(response.status(), 200, await response.text());
      if (first) await route.abort("failed");
      else await route.fulfill({ response });
    })();
    removalDeliveries.push(delivery);
    return delivery;
  };
  await page.route(feedbackEndpoint, removalHandler);
  try {
    await removeUploaded().nth(1).click();
    await until(
      async () =>
        removalAttempts.length === 1 &&
        (await removeUploaded().count()) === 2 &&
        (await removeUploaded().nth(1).isEnabled()),
      "Unconfirmed removal did not remain retryable"
    );
    await removalDeliveries[0];
    const retired = await db.mediaAsset.findUniqueOrThrow({
      where: { id: secondUpload.id }
    });
    assert.equal(retired.status, "RETIRED");
    assert.equal(retired.version, secondUpload.version + 1);
    assert.equal(await button("Send feedback").isDisabled(), true);
    await event("pagehide");
    await absent();
    await event("pageshow");
    await retained(false);
    assert.equal(await removeUploaded().count(), 2);
    await post(removeUploaded().nth(1), feedbackEndpoint);
    await until(
      async () => (await removeUploaded().count()) === 1,
      "Confirmed removal did not clear only its attachment"
    );
    await Promise.all(removalDeliveries);
    assert.deepEqual(removalAttempts[1], removalAttempts[0]);
    assert.equal(JSON.parse(removalAttempts[0].body).assetId, secondUpload.id);
    assert.equal(
      JSON.parse(removalAttempts[0].body).assetVersion,
      secondUpload.version
    );
    assert.equal(removalAttempts[0].account, fixture.memberA.id);
    const after = await db.mediaAsset.findUniqueOrThrow({
      where: { id: secondUpload.id }
    });
    assert.equal(after.version, retired.version);
    assert.equal(after.status, "RETIRED");
    assert.equal(after.feedbackCaseId, null);
    assert.equal(
      await db.retentionControl.count({
        where: {
          kind: "SUPPORT_ATTACHMENT",
          sourceId: secondUpload.id,
          journaledAt: null
        }
      }),
      0
    );
    retryEvidence.push({
      kind: "unsent removal",
      ...fingerprint(removalAttempts[0]),
      assetId: secondUpload.id,
      assetVersion: secondUpload.version,
      attempts: 2,
      retirements: 1
    });
  } finally {
    await page.unroute(feedbackEndpoint, removalHandler);
  }
  await waitReadyButton(button("Send feedback"));
  ok(
    "A lost unsent-removal acknowledgement keeps creation disabled and retains the exact asset/version through concealment; one identical retry confirms a single protected retirement without deleting the other upload."
  );

  const beforeDiscard = await db.mediaAsset.findUniqueOrThrow({
    where: { id: firstUpload.id }
  });
  const writesBeforeDiscard = browserWrites.length;
  await button("Discard local entries").click();
  await page
    .getByText("Local entries discarded. Previously saved changes remain.", {
      exact: true
    })
    .waitFor();
  assert.deepEqual(await writtenState(), emptyWritten);
  assert.equal(await removeUploaded().count(), 1);
  assert.equal(browserWrites.length, writesBeforeDiscard);
  await event("pagehide");
  await absent();
  await event("pageshow");
  await form().waitFor();
  assert.deepEqual(await writtenState(), emptyWritten);
  assert.equal(await removeUploaded().count(), 1);
  const afterDiscard = await db.mediaAsset.findUniqueOrThrow({
    where: { id: firstUpload.id }
  });
  assert.deepEqual(afterDiscard, beforeDiscard);
  await fillWrittenDraft();
  await retained(false);
  await waitReadyButton(button("Send feedback"));
  ok(
    "Discard local entries resets every kind, rating, text, choice, technical-context and consent value through concealment while retaining the saved attachment unchanged and issuing no mutation; the written draft can then be reentered."
  );

  const creationAttempts = [],
    creationDeliveries = [];
  let created;
  const creationHandler = (route) => {
    const request = route.request();
    if (
      request.method() !== "POST" ||
      request.postDataJSON()?.operation !== "feedback-create"
    )
      return route.continue();
    creationAttempts.push(jsonAttempt(request));
    const attempt = creationAttempts.length;
    const delivery = (async () => {
      if (attempt === 2 || attempt === 3)
        return route.fulfill({
          status: attempt === 2 ? 429 : 503,
          headers: attempt === 2 ? { "Retry-After": "0" } : {},
          contentType: "application/json",
          body: JSON.stringify({
            message: "Fictional uncertain creation retry outage"
          })
        });
      const response = await route.fetch();
      assert.equal(response.status(), 200, await response.text());
      if (attempt === 1) {
        created = await response.json();
        await route.abort("failed");
      } else await route.fulfill({ response });
    })();
    creationDeliveries.push(delivery);
    return delivery;
  };
  await page.route(feedbackEndpoint, creationHandler);
  try {
    await button("Send feedback").click();
    await waitReadyButton(retryCreation());
    await creationDeliveries[0];
    const original = JSON.parse(creationAttempts[0].body);
    assert.equal(original.recipientId, fixture.backupGrant.id);
    assert.equal(original.recipientVersion, fixture.backupGrant.version);
    assert.equal(original.notice, FEEDBACK_NOTICE);
    assert.deepEqual(original.attachments, [firstUpload.id]);
    assert.equal(original.subject, privateDraft.subject);
    assert.equal(original.kind, "SUGGESTION");
    assert.equal(original.rating, 4);
    assert.equal(original.technicalContext.errorReference, reference);
    const saved = await db.supportCase.findUniqueOrThrow({
      where: { id: created.caseId }
    });
    assert.equal(saved.ownerGrantId, fixture.backupGrant.id);
    assert.equal(saved.version, 1);
    assert.equal(
      await db.feedbackSubmission.count({
        where: { case: { requesterId: fixture.memberA.id } }
      }),
      1
    );
    await db.supportIntakeSetting.update({
      where: { id: "default" },
      data: { ownerGrantId: fixture.ownerGrant.id }
    });
    await event("pagehide");
    await absent();
    await event("pageshow");
    await waitReadyButton(retryCreation());
    await signIn(fixture.memberB);
    await event("focus");
    await page
      .getByText("Your sign-in changed. Reload before continuing.", {
        exact: true
      })
      .waitFor();
    await absent();
    assert.equal(creationAttempts.length, 1);
    await signIn(fixture.memberA);
    await event("focus");
    await waitReadyButton(retryCreation());
    await post(retryCreation(), feedbackEndpoint, 429);
    await waitReadyButton(retryCreation());
    await post(retryCreation(), feedbackEndpoint, 503);
    await waitReadyButton(retryCreation());
    await post(retryCreation(), feedbackEndpoint);
    await page.waitForURL(
      (url) => url.pathname === "/platform/feedback/cases/" + created.caseId
    );
    await page
      .getByRole("heading", { name: privateDraft.subject, exact: true })
      .waitFor();
    await Promise.all(creationDeliveries);
    assert.equal(creationAttempts.length, 4);
    for (const attempt of creationAttempts)
      assert.deepEqual(attempt, creationAttempts[0]);
    assert.equal(
      await db.supportOperation.count({
        where: { actorId: fixture.memberA.id, requestKey: original.requestKey }
      }),
      1
    );
    assert.equal(
      await db.feedbackSubmission.count({
        where: { case: { requesterId: fixture.memberA.id } }
      }),
      1
    );
    const after = await db.supportCase.findUniqueOrThrow({
      where: { id: created.caseId }
    });
    assert.equal(after.version, saved.version);
    assert.equal(after.ownerGrantId, saved.ownerGrantId);
    const included = await db.mediaAsset.findMany({
      where: { uploaderId: fixture.memberA.id, feedbackCaseId: created.caseId }
    });
    assert.equal(included.length, 1);
    assert.equal(included[0].id, firstUpload.id);
    assert.equal(included[0].version, firstUpload.version + 1);
    assert.equal(
      await db.mediaAsset.count({ where: { uploaderId: fixture.memberA.id } }),
      2
    );
    retryEvidence.push({
      kind: "creation",
      ...fingerprint(creationAttempts[0]),
      recipientId: original.recipientId,
      recipientVersion: original.recipientVersion,
      attempts: 4,
      cases: 1,
      attachedImages: 1,
      retryVersionIncrements: 0
    });
  } finally {
    await page.unroute(feedbackEndpoint, creationHandler);
  }
  ok(
    "A real lost creation acknowledgement retains its original recipient/version/notice, draft and attachment IDs through recipient replacement, account changes and 429/503 retries; four identical commands create one private case and attach its one surviving upload once."
  );

  await go();
  const secondSubject = marker("second receipt");
  await field("subject").fill(secondSubject);
  await field("description").fill(marker("second written experience"));
  await field("rating").selectOption("2");
  await field("consent").check();
  await openPreferences();
  const preferenceBefore = await db.feedbackPromptPreference.findUniqueOrThrow({
    where: { userId: fixture.memberA.id }
  });
  const preferenceAttempts = [],
    preferenceDeliveries = [];
  const preferenceHandler = (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    preferenceAttempts.push(jsonAttempt(request));
    const first = preferenceAttempts.length === 1;
    const delivery = (async () => {
      const response = await route.fetch();
      assert.equal(response.status(), 200, await response.text());
      if (first) await route.abort("failed");
      else await route.fulfill({ response });
    })();
    preferenceDeliveries.push(delivery);
    return delivery;
  };
  await page.route(preferenceEndpoint, preferenceHandler);
  try {
    await button("Don’t ask again").click();
    await waitReadyButton(retryPreference());
    await preferenceDeliveries[0];
    const saved = await db.feedbackPromptPreference.findUniqueOrThrow({
      where: { userId: fixture.memberA.id }
    });
    assert.ok(saved.neverAskAt);
    assert.equal(saved.version, preferenceBefore.version + 1);
    await page.evaluate(() => {
      window.__intakeDocument = "pending preference";
    });
    const secondCase = await post(button("Send feedback"), feedbackEndpoint);
    await page
      .getByText(
        "Your feedback was saved. Finish confirming your other work on this page to open the receipt.",
        { exact: true }
      )
      .waitFor();
    assert.equal(new URL(page.url()).pathname, "/platform/feedback");
    assert.equal(
      await page.evaluate(() => window.__intakeDocument),
      "pending preference"
    );
    assert.equal(
      await form().count(),
      0,
      "Confirmed form presentation must not invite a duplicate creation"
    );
    await waitReadyButton(retryPreference());
    assert.equal(preferenceAttempts.length, 1);
    assert.equal(
      await db.feedbackSubmission.count({
        where: { case: { requesterId: fixture.memberA.id } }
      }),
      2
    );
    await event("pagehide");
    await absent();
    await event("pageshow");
    await page
      .getByText(
        "Your feedback was saved. Finish confirming your other work on this page to open the receipt.",
        { exact: true }
      )
      .waitFor();
    await openPreferences();
    await waitReadyButton(retryPreference());
    const beforeConfirmation =
      await db.feedbackPromptPreference.findUniqueOrThrow({
        where: { userId: fixture.memberA.id }
      });
    await post(retryPreference(), preferenceEndpoint);
    await page.waitForURL(
      (url) => url.pathname === "/platform/feedback/cases/" + secondCase.caseId
    );
    await page
      .getByRole("heading", { name: secondSubject, exact: true })
      .waitFor();
    await Promise.all(preferenceDeliveries);
    assert.equal(preferenceAttempts.length, 2);
    assert.deepEqual(preferenceAttempts[1], preferenceAttempts[0]);
    const mutation = JSON.parse(preferenceAttempts[0].body);
    assert.equal(preferenceAttempts[0].account, fixture.memberA.id);
    assert.equal(mutation.operation, "never-ask");
    assert.equal(
      await db.socialOperation.count({
        where: {
          ownerId: fixture.memberA.id,
          key: "feedback-prompt-preference:" + mutation.mutationId
        }
      }),
      1
    );
    const after = await db.feedbackPromptPreference.findUniqueOrThrow({
      where: { userId: fixture.memberA.id }
    });
    // The intervening real creation legitimately advances response suppression;
    // compare the NEVER_ASK effect independently of that separate write.
    assert.equal(after.neverAskAt.getTime(), saved.neverAskAt.getTime());
    assert.equal(after.version, beforeConfirmation.version);
    assert.equal(
      await db.retentionControl.count({
        where: {
          kind: "FEEDBACK_PROMPT",
          sourceId: fixture.memberA.id,
          journaledAt: null
        }
      }),
      0
    );
    assert.equal(
      await db.feedbackSubmission.count({
        where: { case: { requesterId: fixture.memberA.id } }
      }),
      2
    );
    retryEvidence.push({
      kind: "sibling preference",
      ...fingerprint(preferenceAttempts[0]),
      attempts: 2,
      refusalEffects: 1,
      heldCaseId: secondCase.caseId,
      navigationReleasedAfterConfirmation: true
    });
  } finally {
    await page.unroute(preferenceEndpoint, preferenceHandler);
  }
  ok(
    "A second confirmed creation removes its completed form but keeps the real unconfirmed never-ask sibling and receipt destination across concealment; only its identical preference confirmation releases automatic navigation, with one refusal and no duplicate case."
  );

  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  assert.equal(
    browserWrites.length,
    15,
    "Six image, two removal, five creation and two preference attempts"
  );
  assert.deepEqual(
    Object.fromEntries(
      [
        "/api/platform/images",
        "/api/platform/feedback",
        "/api/platform/feedback/prompts"
      ].map((path) => [
        path,
        browserWrites.filter(
          (write) => write.method === "POST" && write.path === path
        ).length
      ])
    ),
    {
      "/api/platform/images": 6,
      "/api/platform/feedback": 7,
      "/api/platform/feedback/prompts": 2
    }
  );
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        results,
        errors,
        externalRequests,
        browserWrites,
        retryEvidence,
        fixtureOnly: true,
        productionWrites: 0,
        recipientSends: 0,
        limitations: [
          "Synthetic lifecycle events do not establish physical-device or operating-system snapshot behavior.",
          "Existing media suites own default non-opt-in upload regression coverage.",
          "Existing Feedback prompt suite owns measurement-withdrawal and prompt-origin attribution coverage."
        ]
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  console.log("FEEDBACK_INTAKE_PRIVACY_BROWSER_PASS " + results.length);
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.json",
    JSON.stringify(
      {
        results,
        errors,
        externalRequests,
        browserWrites,
        retryEvidence,
        url: page.url(),
        message: String(error),
        fixtureOnly: true
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  throw error;
} finally {
  for (const release of releases) release();
  try {
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
    else if (fixture)
      await db.supportIntakeSetting.deleteMany({
        where: {
          id: "default",
          ownerGrantId: { in: [fixture.ownerGrant.id, fixture.backupGrant.id] }
        }
      });
  } finally {
    await browser.close();
    await db.$disconnect();
  }
}
