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
const { supportCommand, readSupport } =
  await import("../lib/platform/support.ts");
const { FEEDBACK_NOTICE } = await import("../lib/platform/feedback-types.ts");
const { uploadImage } = await import("../lib/platform/media.ts");
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
  "feedback-receipt-privacy-browser-" + Date.now()
);
mkdirSync(output, { recursive: true, mode: 0o700 });
const results = [],
  errors = [],
  externalRequests = [],
  browserWrites = [],
  retryEvidence = [],
  markers = [],
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
  const value = "Fictional receipt " + name + " " + nonce;
  markers.push(value);
  return value;
};
const subject = marker("subject"),
  description = marker("description"),
  draftReply = marker("dirty reply"),
  lostReply = marker("unconfirmed reply"),
  resolution = marker("resolution");
const supportEndpoint = config.origin + "/api/platform/support";
const feedbackEndpoint = config.origin + "/api/platform/feedback";
const identityRoute = "**/api/platform/profile?view=identity";
const detailRoute = (url) =>
  url.pathname === "/api/platform/feedback" &&
  url.searchParams.get("view") === "detail";
const button = (name) => page.getByRole("button", { name, exact: true });
const form = (name) => page.locator('form[aria-label="' + name + '"]');
const replyForm = () => form("Save reply");
const choicesForm = () => form("Save contact and sharing choices");
const replyField = () => replyForm().getByLabel("Your reply", { exact: true });
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
const go = async (caseId) => {
  const response = await page.goto(
    config.origin + "/platform/feedback/cases/" + caseId
  );
  assert.equal(response.status(), 200);
  await page.waitForLoadState("networkidle");
};
const ready = async (title) => {
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  assert.equal(await page.getByRole("main").count(), 1);
};
const absent = async () => {
  await page.waitForFunction((values) => {
    const html = document.documentElement.outerHTML;
    const fields = [...document.querySelectorAll("input,textarea,select")];
    return (
      values.every(
        (value) =>
          !html.includes(value) &&
          fields.every((field) => !field.value.includes(value))
      ) &&
      !document.querySelector("main form") &&
      !document.querySelector(
        'main [name="contactAllowed"],main [name="channels"],main [name="allowIdea"],main [name="publicAttribution"]'
      )
    );
  }, markers);
};
const serialization = async (caseId, values) => {
  for (const flight of [false, true]) {
    const response = await context.request.get(
      config.origin + "/platform/feedback/cases/" + caseId,
      flight ? { headers: { RSC: "1" } } : {}
    );
    assert.equal(response.status(), 200);
    if (flight)
      assert.match(response.headers()["content-type"], /text\/x-component/);
    const body = await response.text();
    for (const value of values)
      assert.ok(!body.includes(value), "Private receipt absent from HTML/RSC");
  }
};
const openChoices = async () => {
  const details = page.locator("details").filter({ has: choicesForm() });
  assert.equal(await details.count(), 1);
  if (!(await details.evaluate((node) => node.open)))
    await details.locator("summary").click();
};
const choiceState = () =>
  choicesForm().evaluate((node) =>
    Object.fromEntries(
      [...node.querySelectorAll('input[type="checkbox"]')].map((input) => [
        input.name === "channels" ? input.value : input.name,
        input.checked
      ])
    )
  );
const desiredChoices = {
  contactAllowed: true,
  IN_APP: true,
  EMAIL: false,
  PUSH: true,
  allowIdea: true,
  publicAttribution: true
};
const setChoices = async (values) => {
  await openChoices();
  for (const [name, checked] of Object.entries(values)) {
    const selector = ["IN_APP", "EMAIL", "PUSH"].includes(name)
      ? 'input[name="channels"][value="' + name + '"]'
      : 'input[name="' + name + '"]';
    await choicesForm().locator(selector).setChecked(checked);
  }
};
const retained = async () => {
  await ready(subject);
  await openChoices();
  assert.equal(await replyField().inputValue(), draftReply);
  assert.deepEqual(await choiceState(), desiredChoices);
};
const send = async (target, endpoint) => {
  const response = page.waitForResponse(
    (r) => r.url() === endpoint && r.request().method() === "POST"
  );
  await target.click();
  const result = await response;
  assert.equal(result.status(), 200, await result.text());
  return {
    receipt: await result.json(),
    command: JSON.parse(result.request().postData())
  };
};
const failedRead = async (pattern, restore) => {
  const deliveries = [];
  const handler = (route) => {
    const delivery = route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Fictional feedback receipt read outage"
      })
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
          : "Fictional feedback receipt read outage",
        { exact: true }
      )
      .waitFor();
    await absent();
    await Promise.all(deliveries);
  } finally {
    await page.unroute(pattern, handler);
  }
  await button("Recheck current access").click();
  await restore();
};
const lateRead = async (pattern, restore) => {
  let capture, release;
  const captured = new Promise((done) => {
    capture = done;
  });
  const gate = new Promise((done) => {
    release = done;
  });
  releases.add(release);
  const deliveries = [];
  let reads = 0;
  const handler = async (route) => {
    const first = ++reads === 1;
    const delivery = (async () => {
      const response = await route.fetch();
      if (first) {
        capture();
        await gate;
      }
      await route.fulfill({ response });
    })();
    deliveries.push(delivery);
    return delivery;
  };
  await page.route(pattern, handler);
  let timer;
  try {
    await event("focus");
    await Promise.race([
      captured,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Receipt read was not captured")),
          30000
        );
      })
    ]);
    await absent();
    await event("pagehide");
    release();
    await deliveries[0];
    await page.waitForLoadState("networkidle");
    await absent();
    await Promise.all(deliveries);
  } finally {
    clearTimeout(timer);
    release();
    releases.delete(release);
    await page.unroute(pattern, handler);
  }
  await event("focus");
  await restore();
};
const discardUncertain = async (target) => {
  const dialog = page.waitForEvent("dialog");
  const clicked = target.click();
  const prompt = await dialog;
  assert.equal(prompt.type(), "confirm");
  assert.match(prompt.message(), /may already be saved/i);
  await prompt.accept();
  await clicked;
};
const fingerprint = (attempt) => ({
  sha256: createHash("sha256").update(attempt.body).digest("hex"),
  operation: JSON.parse(attempt.body).operation,
  requestKey: JSON.parse(attempt.body).requestKey,
  expectedVersion: JSON.parse(attempt.body).expectedVersion
});
let fixture;
const createReceipt = async (overrides = {}) => {
  const intake = await readSupport(db, fixture.memberA.token, "new", {
    feedbackOnly: true
  });
  assert.ok(intake.intake.available && intake.intake.recipient);
  return supportCommand(db, fixture.memberA.token, {
    operation: "feedback-create",
    requestKey: randomUUID(),
    kind: "GENERAL",
    rating: 3,
    subject,
    description,
    notice: FEEDBACK_NOTICE,
    consent: true,
    recipientId: intake.intake.recipient.id,
    recipientVersion: intake.intake.recipient.version,
    contactAllowed: false,
    channels: [],
    allowIdea: false,
    publicAttribution: false,
    ...overrides
  });
};
const makeImage = async (label) => {
  const caption = marker(label + " caption"),
    alt = marker(label + " alternative");
  const image = await uploadImage(
    db,
    fixture.memberA.token,
    {
      purpose: "SUPPORT_ATTACHMENT",
      targetId: fixture.memberA.id,
      requestKey: randomUUID(),
      caption,
      alt
    },
    await sharp({
      create: { width: 160, height: 120, channels: 3, background: "blue" }
    })
      .png()
      .toBuffer()
  );
  markers.push(image.id);
  return { image, caption, alt };
};
try {
  fixture = await seedSupport(db);
  markers.push(fixture.owner.name);
  const first = await createReceipt({
    kind: "SUGGESTION",
    outcome: "A fictional clearer route to receipt recovery.",
    helps: "Fictional website members."
  });
  await signIn(fixture.memberA);
  await serialization(first.caseId, [subject, description, fixture.owner.name]);
  const authorized = await context.request.get(
    feedbackEndpoint + "?view=detail&caseId=" + first.caseId,
    { headers: { "X-Expected-Account": fixture.memberA.id } }
  );
  assert.equal(authorized.status(), 200);
  assert.match(authorized.headers()["cache-control"], /no-store/);
  const dto = await authorized.json();
  assert.equal(dto.detail.id, first.caseId);
  assert.equal(dto.detail.subject, subject);
  assert.ok(dto.detail.description.includes(description));
  assert.equal(dto.detail.access.requester, true);
  await go(first.caseId);
  await ready(subject);
  await replyField().fill(draftReply);
  await setChoices(desiredChoices);
  assert.deepEqual(await choiceState(), desiredChoices);
  ok(
    "Initial HTML/RSC excludes private receipt data while its authorized API and hydrated requester view remain complete."
  );

  for (const trigger of ["blur", "offline", "pagehide", "hidden"]) {
    if (trigger === "hidden")
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          value: "hidden"
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
    else await event(trigger === "offline" ? "online" : "focus");
    await retained();
  }
  await failedRead(identityRoute, retained);
  await failedRead(detailRoute, retained);
  await lateRead(identityRoute, retained);
  await lateRead(detailRoute, retained);
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
  ok(
    "Blur, offline, pagehide, visibility changes, failed or late identity/detail reads and account replacement remove physical private DOM; the original account restores the exact reply and six choice values."
  );

  for (const status of [401, 403, 404]) {
    const deliveries = [];
    const handler = (route) => {
      const delivery = route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ message: "Fictional receipt authority denial" })
      });
      deliveries.push(delivery);
      return delivery;
    };
    await page.route(supportEndpoint, handler);
    await replyForm()
      .getByRole("button", { name: "Save reply", exact: true })
      .click();
    await absent();
    assert.equal(
      await button("Confirm original request: Save reply").count(),
      0
    );
    await Promise.all(deliveries);
    await page.unroute(supportEndpoint, handler);
    await button("Recheck current access").click();
    await retained();
    await discardUncertain(
      replyForm().getByRole("button", {
        name: "Discard local entries",
        exact: true
      })
    );
    await replyField().fill(draftReply);
  }
  assert.equal(
    await db.supportMessage.count({
      where: { caseId: first.caseId, body: draftReply }
    }),
    0
  );
  ok(
    "Mutation authority denials immediately conceal receipt controls; rechecking the original account preserves both drafts without an accepted reply."
  );

  await page.evaluate((value) => {
    window.feedbackReceiptDocument = value;
  }, nonce);
  const choicesSaved = await send(
    choicesForm().getByRole("button", {
      name: "Save contact and sharing choices",
      exact: true
    }),
    feedbackEndpoint
  );
  const adopt = replyForm().getByRole("button", {
    name: "Use current request with these entries",
    exact: true
  });
  await adopt.waitFor();
  await retained();
  assert.equal(
    await page.evaluate(() => window.feedbackReceiptDocument),
    nonce
  );
  assert.equal(
    await replyForm()
      .getByRole("button", { name: "Save reply", exact: true })
      .isEnabled(),
    false
  );
  await adopt.click();
  const replySaved = await send(
    replyForm().getByRole("button", { name: "Save reply", exact: true }),
    supportEndpoint
  );
  assert.equal(
    replySaved.command.expectedVersion,
    choicesSaved.receipt.version
  );
  assert.equal(replySaved.command.body, draftReply);
  await page.getByRole("main").getByText(draftReply, { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => window.feedbackReceiptDocument),
    nonce
  );
  assert.equal(await replyField().inputValue(), "");
  await openChoices();
  assert.deepEqual(await choiceState(), desiredChoices);
  await setChoices({
    ...desiredChoices,
    EMAIL: true,
    allowIdea: false,
    publicAttribution: false
  });
  await choicesForm()
    .getByRole("button", { name: "Discard local entries", exact: true })
    .click();
  assert.deepEqual(
    await choiceState(),
    desiredChoices,
    "Discarding the custom checkbox draft restores the accepted server choices"
  );
  assert.equal(
    await db.supportMessage.count({
      where: { caseId: first.caseId, body: draftReply }
    }),
    1
  );
  assert.equal(
    await db.supportOperation.count({
      where: {
        actorId: fixture.memberA.id,
        requestKey: replySaved.command.requestKey
      }
    }),
    1
  );
  assert.equal(
    (
      await db.supportCase.findUniqueOrThrow({
        where: { id: first.caseId }
      })
    ).version,
    replySaved.receipt.version
  );
  ok(
    "Saving contact/sharing choices keeps the sibling reply in the same document; only explicit version adoption enables its one accepted save."
  );

  const uncertainTitle = marker("uncertain subject");
  const uncertain = await createReceipt({ subject: uncertainTitle });
  await go(uncertain.caseId);
  await ready(uncertainTitle);
  await replyField().fill(lostReply);
  await page.evaluate((value) => {
    window.feedbackReceiptDocument = value;
  }, nonce);
  const replyAttempts = [],
    replyDeliveries = [];
  let firstReplyReceipt;
  const replyHandler = (route) => {
    const request = route.request(),
      body = request.postData();
    const command = JSON.parse(body);
    assert.equal(command.operation, "reply");
    assert.equal(command.caseId, uncertain.caseId);
    replyAttempts.push({
      body,
      owner: request.headers()["x-expected-account"]
    });
    const number = replyAttempts.length;
    const delivery = (async () => {
      if (number === 1) {
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        firstReplyReceipt = await response.json();
        await route.abort("failed");
      } else if (number < 4) {
        await route.fulfill({
          status: number === 2 ? 429 : 503,
          headers: { "Retry-After": "1" },
          contentType: "application/json",
          body: JSON.stringify({
            message: "Fictional original reply retry outage"
          })
        });
      } else {
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        const saved = await response.json();
        assert.equal(saved.caseId, firstReplyReceipt.caseId);
        assert.equal(saved.version, firstReplyReceipt.version);
        await route.fulfill({ response });
      }
    })();
    replyDeliveries.push(delivery);
    return delivery;
  };
  await page.route(supportEndpoint, replyHandler);
  await replyForm()
    .getByRole("button", { name: "Save reply", exact: true })
    .click();
  await replyForm()
    .getByRole("button", { name: "Retry original request", exact: true })
    .waitFor();
  assert.equal(
    await db.supportMessage.count({
      where: { caseId: uncertain.caseId, body: lostReply }
    }),
    1
  );
  const resolved = await supportCommand(db, fixture.owner.token, {
    operation: "transition",
    requestKey: randomUUID(),
    caseId: uncertain.caseId,
    expectedVersion: firstReplyReceipt.version,
    status: "RESOLVED",
    reason: resolution
  });
  await event("blur");
  await event("focus");
  const confirmReply = button("Confirm original request: Save reply");
  await confirmReply.waitFor();
  await absent();
  const dismissed = page.waitForEvent("dialog");
  const reloadClick = button("Reload current information").click();
  const reloadDialog = await dismissed;
  assert.match(reloadDialog.message(), /discard|clear/i);
  await reloadDialog.dismiss();
  await reloadClick;
  await absent();
  await signIn(fixture.memberB);
  await event("focus");
  await page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .waitFor();
  await absent();
  assert.equal(await confirmReply.count(), 0);
  assert.equal(replyAttempts.length, 1);
  await signIn(fixture.memberA);
  await event("focus");
  await confirmReply.waitFor();
  for (const status of [429, 503]) {
    const response = page.waitForResponse(
      (r) => r.url() === supportEndpoint && r.status() === status
    );
    await confirmReply.click();
    await response;
    await page
      .getByRole("alert")
      .filter({
        hasText: /We could not confirm the original request/
      })
      .waitFor();
    await absent();
    assert.equal(replyAttempts.at(-1).body, replyAttempts[0].body);
    assert.equal(
      await db.supportMessage.count({
        where: { caseId: uncertain.caseId, body: lostReply }
      }),
      1
    );
  }
  const confirmation = page.waitForResponse(
    (r) =>
      r.url() === supportEndpoint &&
      r.request().method() === "POST" &&
      r.status() === 200
  );
  await confirmReply.click();
  await confirmation;
  await ready(uncertainTitle);
  await form("Reopen request").waitFor();
  assert.equal(
    await page.evaluate(() => window.feedbackReceiptDocument),
    nonce
  );
  assert.equal(replyAttempts.length, 4);
  assert.ok(
    replyAttempts.every(
      (a) => a.body === replyAttempts[0].body && a.owner === fixture.memberA.id
    )
  );
  const originalReply = JSON.parse(replyAttempts[0].body);
  assert.equal(originalReply.expectedVersion, uncertain.version);
  assert.equal(
    await db.supportOperation.count({
      where: {
        actorId: fixture.memberA.id,
        requestKey: originalReply.requestKey
      }
    }),
    1
  );
  assert.equal(
    await db.supportMessage.count({
      where: { caseId: uncertain.caseId, body: lostReply }
    }),
    1
  );
  assert.equal(
    (
      await db.supportCase.findUniqueOrThrow({
        where: { id: uncertain.caseId }
      })
    ).version,
    resolved.version
  );
  await Promise.all(replyDeliveries);
  await page.unroute(supportEndpoint, replyHandler);
  retryEvidence.push({
    scenario: "resolved-reply",
    attempts: replyAttempts.map(fingerprint)
  });
  ok(
    "A real lost reply survives resolution, rejected reload, account replacement and concealed 429/503 retries; all four commands are identical and confirmation adds no second message or version."
  );

  const { image, caption, alt } = await makeImage("attachment");
  const attachmentTitle = marker("attachment subject");
  const attached = await createReceipt({
    subject: attachmentTitle,
    attachments: [image.id]
  });
  await serialization(attached.caseId, [
    attachmentTitle,
    caption,
    alt,
    image.id
  ]);
  await go(attached.caseId);
  await ready(attachmentTitle);
  const enlarge = button("Enlarge attachment: " + caption);
  await enlarge.waitFor();
  const beforeViewer = await page.evaluate(() => ({
    length: history.length,
    overflow: document.body.style.overflow
  }));
  await enlarge.click();
  await page
    .getByRole("dialog")
    .getByRole("img", { name: alt, exact: true })
    .waitFor();
  const viewerState = await page.evaluate(() => ({
    length: history.length,
    key: history.state?.gcPhotoViewer
  }));
  assert.equal(viewerState.length, beforeViewer.length + 1);
  assert.equal(typeof viewerState.key, "string");
  for (const trigger of ["blur", "pagehide"]) {
    await event(trigger);
    await absent();
    assert.equal(await page.locator("dialog").count(), 0);
    await event("focus");
    await page
      .getByRole("dialog")
      .getByRole("img", { name: alt, exact: true })
      .waitFor();
    assert.deepEqual(
      await page.evaluate(() => ({
        length: history.length,
        key: history.state?.gcPhotoViewer
      })),
      viewerState
    );
  }
  await page.goBack();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(
    new URL(page.url()).pathname,
    "/platform/feedback/cases/" + attached.caseId
  );
  assert.equal(
    await enlarge.evaluate((node) => node === document.activeElement),
    true
  );
  assert.equal(
    await page.evaluate(() => document.body.style.overflow),
    beforeViewer.overflow
  );
  ok(
    "Private viewer DOM and image attributes leave on concealment, reread on return and keep one history entry; Back restores the original receipt and opener."
  );

  const removalAttempts = [],
    removalDeliveries = [];
  let removalReceipt;
  const removalHandler = (route) => {
    const request = route.request(),
      body = request.postData();
    const command = JSON.parse(body);
    assert.equal(command.operation, "feedback-remove-attachment");
    assert.equal(command.caseId, attached.caseId);
    assert.equal(command.assetId, image.id);
    removalAttempts.push({
      body,
      owner: request.headers()["x-expected-account"]
    });
    const number = removalAttempts.length;
    const delivery = (async () => {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      const saved = await response.json();
      if (number === 1) {
        removalReceipt = saved;
        await route.abort("failed");
      } else {
        assert.equal(saved.caseId, removalReceipt.caseId);
        assert.equal(saved.version, removalReceipt.version);
        await route.fulfill({ response });
      }
    })();
    removalDeliveries.push(delivery);
    return delivery;
  };
  await page.route(feedbackEndpoint, removalHandler);
  const removalForm = form("Remove this attachment");
  await removalForm
    .getByRole("button", { name: "Remove this attachment", exact: true })
    .click();
  await removalForm
    .getByRole("button", { name: "Retry original request", exact: true })
    .waitFor();
  const retiredOnce = await db.mediaAsset.findUniqueOrThrow({
    where: { id: image.id },
    select: { status: true, version: true, caption: true, alt: true }
  });
  assert.equal(retiredOnce.status, "RETIRED");
  assert.equal(retiredOnce.caption, "");
  assert.equal(retiredOnce.alt, "");
  const currentAttached = await readSupport(
    db,
    fixture.memberA.token,
    "detail",
    {
      caseId: attached.caseId,
      feedbackOnly: true
    }
  );
  assert.deepEqual(currentAttached.detail.feedback.attachments, []);
  await event("blur");
  await event("focus");
  const confirmRemoval = button(
    "Confirm original request: Remove attachment 1"
  );
  await confirmRemoval.waitFor();
  await absent();
  const removedResponse = page.waitForResponse(
    (r) =>
      r.url() === feedbackEndpoint &&
      r.request().method() === "POST" &&
      r.status() === 200
  );
  await confirmRemoval.click();
  await removedResponse;
  await ready(attachmentTitle);
  await until(
    async () => (await removalForm.count()) === 0,
    "Confirmed removal owner leaves after a current empty attachment read"
  );
  assert.equal(removalAttempts.length, 2);
  assert.ok(
    removalAttempts.every(
      (a) =>
        a.body === removalAttempts[0].body && a.owner === fixture.memberA.id
    )
  );
  const removalCommand = JSON.parse(removalAttempts[0].body);
  assert.equal(retiredOnce.version, removalCommand.assetVersion + 1);
  assert.equal(removalReceipt.version, removalCommand.expectedVersion + 1);
  assert.deepEqual(
    await db.mediaAsset.findUniqueOrThrow({
      where: { id: image.id },
      select: { status: true, version: true, caption: true, alt: true }
    }),
    retiredOnce
  );
  assert.equal(
    (
      await db.supportCase.findUniqueOrThrow({
        where: { id: attached.caseId }
      })
    ).version,
    removalReceipt.version
  );
  assert.equal(
    await db.supportOperation.count({
      where: {
        actorId: fixture.memberA.id,
        requestKey: removalCommand.requestKey
      }
    }),
    1
  );
  assert.ok(
    (
      await db.retentionControl.findFirstOrThrow({
        where: { kind: "SUPPORT_ATTACHMENT", sourceId: attached.caseId }
      })
    ).journaledAt
  );
  const removedHtml = await page
    .locator("html")
    .evaluate((node) => node.outerHTML);
  for (const value of [caption, alt, image.id])
    assert.ok(!removedHtml.includes(value));
  await Promise.all(removalDeliveries);
  await page.unroute(feedbackEndpoint, removalHandler);
  retryEvidence.push({
    scenario: "removed-attachment",
    attempts: removalAttempts.map(fingerprint)
  });
  ok(
    "A lost attachment-removal acknowledgment retains its mounted exact retry after a current read has no attachments; confirmation retires and versions the image once with protected recovery recorded."
  );

  const last = await makeImage("open viewer removal");
  const lastTitle = marker("open viewer subject");
  const lastCase = await createReceipt({
    subject: lastTitle,
    attachments: [last.image.id]
  });
  const lastSnapshot = await readSupport(db, fixture.memberA.token, "detail", {
    caseId: lastCase.caseId,
    feedbackOnly: true
  });
  const attachedVersion = lastSnapshot.detail.feedback.attachments.find(
    (current) => current.id === last.image.id
  ).version;
  await go(lastCase.caseId);
  await ready(lastTitle);
  await button("Enlarge attachment: " + last.caption).click();
  await page
    .getByRole("dialog")
    .getByRole("img", { name: last.alt, exact: true })
    .waitFor();
  const lastViewer = await page.evaluate(() => ({
    length: history.length,
    key: history.state?.gcPhotoViewer
  }));
  // A second authenticated caller changes only this run's own attachment.
  // There is no dirty form to prevent replacing the visible case snapshot.
  const lastRemoved = await context.request.post(feedbackEndpoint, {
    headers: {
      Origin: config.origin,
      "X-Expected-Account": fixture.memberA.id
    },
    data: {
      operation: "feedback-remove-attachment",
      requestKey: randomUUID(),
      caseId: lastCase.caseId,
      expectedVersion: lastCase.version,
      assetId: last.image.id,
      assetVersion: attachedVersion
    }
  });
  assert.equal(lastRemoved.status(), 200, await lastRemoved.text());
  await event("blur");
  await absent();
  await event("focus");
  await page.getByRole("dialog").waitFor();
  await page
    .getByRole("dialog")
    .getByText("This photo is no longer available.", { exact: true })
    .waitFor();
  assert.equal(await page.getByRole("dialog").locator("img").count(), 0);
  assert.deepEqual(
    await page.evaluate(() => ({
      length: history.length,
      key: history.state?.gcPhotoViewer
    })),
    lastViewer
  );
  await page.goBack();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(
    new URL(page.url()).pathname,
    "/platform/feedback/cases/" + lastCase.caseId
  );
  assert.notEqual(
    await page.evaluate(() => history.state?.gcPhotoViewer),
    lastViewer.key
  );
  assert.equal(await page.evaluate(() => document.body.style.overflow), "");
  assert.equal(await form("Remove this attachment").count(), 0);
  ok(
    "Replacing the last attachment while its viewer is open and no form is dirty preserves the viewer owner/history; its empty current read closes with one Back action."
  );

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate((large) => {
      document.documentElement.style.fontSize = large ? "200%" : "";
    }, width === 320);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      ),
      "Receipt fits narrow and enlarged-text viewports"
    );
    await page.screenshot({
      path: output + "/receipt-" + width + ".png",
      fullPage: true
    });
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  assert.ok(
    browserWrites.every(
      (write) =>
        write.method === "POST" &&
        ["/api/platform/support", "/api/platform/feedback"].includes(write.path)
    )
  );
  assert.equal(
    browserWrites.length,
    11,
    "Three authority denials, choices/reply saves, four uncertain-reply attempts and two removal attempts"
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
        additionalFixtureHttpWrites: 1,
        fixtureOnly: true,
        productionWrites: 0,
        recipientSends: 0
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  console.log("FEEDBACK_RECEIPT_PRIVACY_BROWSER_PASS " + results.length);
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
        where: { id: "default", ownerGrantId: fixture.ownerGrant.id }
      });
  } finally {
    await browser.close();
    await db.$disconnect();
  }
}
