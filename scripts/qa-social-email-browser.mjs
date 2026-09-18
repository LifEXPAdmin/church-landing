// Run against an isolated built HTTPS preview with provider delivery disabled.
// Enable PUSH_ENABLED with fictional keys to exercise denied browser permission.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const dir = process.argv[2];
assert.match(dir ?? "", /^\.account-test\/[a-z0-9-]+$/);
const config = JSON.parse(readFileSync(dir + "/browser-env.json", "utf8"));
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: resolve(dir, "sink"),
  RETENTION_TEST_DIR: resolve(dir, "retention"),
  NODE_ENV: "test",
  VERCEL: "",
  SOCIAL_EMAIL_ENABLED: "true",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  FOUNDER_WELCOME_ENABLED: "false"
});
const { PrismaClient } = await import("@prisma/client");
const { createPortalActor } = await import("../tests/seed-portal.ts");
const { readNotificationPreferences, notificationPreferenceCommand } =
  await import("../lib/platform/notification-preferences.ts");
const { commentCommand } = await import("../lib/platform/comment-commands.ts");
const { deliverNotification } =
  await import("../lib/platform/notification-outbox.ts");
const db = new PrismaClient();
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ??
    `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`
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
    process.env.CHROMIUM_PATH ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: [
    "--ignore-certificate-errors-spki-list=" +
      createHash("sha256").update(der).digest("base64")
  ]
});
const output = dir + "/social-email-browser";
mkdirSync(output, { recursive: true, mode: 0o700 });
const results = [],
  errors = [];
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const context = await browser.newContext({
  viewport: { width: 320, height: 844 }
});
await context.route("**/*", (route) =>
  new URL(route.request().url()).origin === config.origin
    ? route.continue()
    : route.abort()
);
await context.addInitScript(() =>
  Object.defineProperty(Notification, "permission", { get: () => "denied" })
);
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
page.on("dialog", (dialog) => dialog.accept());
const url = config.origin + "/api/platform/notifications";
const group = (label) => page.getByRole("group", { name: label, exact: true });
const reply = () => group("Replies to your posts and comments");
const likes = () => group("Likes on your posts and comments");
const email = (section) =>
  section.getByRole("checkbox", { name: /Email updates/ });
const go = async () => {
  const response = await page.goto(
    config.origin + "/platform/settings/notifications/availability"
  );
  assert.equal(response.status(), 200);
  await email(reply()).waitFor();
};
const save = async () => {
  const response = page.waitForResponse(
    (r) => r.url() === url && r.request().method() === "POST"
  );
  await page
    .getByRole("button", { name: "Save notification choices", exact: true })
    .click();
  assert.equal((await response).status(), 200);
  await page
    .getByText("Your notification choices are saved.", { exact: true })
    .waitFor();
};
const signIn = async (actor) => {
  await context.clearCookies();
  await context.addCookies([
    {
      name: "church_platform_session",
      value: actor.token,
      url: config.origin,
      httpOnly: true,
      secure: true,
      sameSite: "Lax"
    }
  ]);
};
try {
  const actor = await createPortalActor(db, "socialmailui");
  await signIn(actor);
  await go();
  assert.equal(await email(reply()).isChecked(), false);
  assert.equal(await email(reply()).isDisabled(), true);
  assert.equal(await email(likes()).isDisabled(), true);
  assert.equal(
    await reply()
      .getByRole("checkbox", { name: "In-app alerts", exact: true })
      .isChecked(),
    true
  );
  await page
    .getByText(
      "Notifications are blocked in this browser or phone settings. Change that setting yourself, then check again.",
      { exact: true }
    )
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Enable notifications", exact: true })
      .isDisabled(),
    true
  );
  ok(
    "New email consent starts off and is unavailable honestly; denied browser permission preserves in-app choices"
  );

  const old = await readNotificationPreferences(db, actor.token);
  await notificationPreferenceCommand(db, actor.token, {
    operation: "preferences",
    mutationId: crypto.randomUUID(),
    ownerId: actor.id,
    expectedVersion: old.preferences.version,
    inApp: old.preferences.inApp,
    pushCategories: [],
    quietHours: null,
    emailCategories: ["replies", "reactions"]
  });
  await go();
  assert.equal(await email(reply()).isChecked(), true);
  assert.equal(await email(likes()).isChecked(), true);
  assert.equal(await email(likes()).isDisabled(), false);
  await email(likes()).focus();
  await email(likes()).press("Space");
  await save();
  await go();
  assert.equal(await email(likes()).isChecked(), false);
  assert.equal(await email(reply()).isChecked(), true);
  const saved = await readNotificationPreferences(db, actor.token);
  assert.deepEqual(saved.preferences.emailCategories, ["replies"]);
  assert.equal(saved.preferences.inApp.reactions, true);
  assert.equal(saved.preferences.inApp.replies, true);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    true
  );
  await reply().screenshot({ path: output + "/reply-320.png" });
  await likes().screenshot({ path: output + "/likes-320.png" });
  ok(
    "Keyboard withdrawal of Likes email persists without changing replies or Activity at 320 pixels"
  );

  const commenter = await createPortalActor(db, "mailuilink");
  const post = await db.platformPost.create({
    data: {
      authorId: actor.id,
      content: "Fictional email link source"
    }
  });
  const comment = await commentCommand(db, commenter.token, {
    operation: "create",
    mutationId: crypto.randomUUID(),
    postId: post.id,
    content: "Fictional email link reply"
  });
  const delivery = await db.notificationDelivery.findFirstOrThrow({
    where: {
      channel: "EMAIL",
      ownerId: actor.id,
      event: { commentId: comment.id }
    }
  });
  const noOtherChannel = async () => {
    throw Error("Only isolated social email is expected");
  };
  assert.deepEqual(
    await deliverNotification(
      db,
      delivery.id,
      noOtherChannel,
      new Date(),
      noOtherChannel
    ),
    { done: true, outcome: "accepted" }
  );
  const sent = JSON.parse(
    readFileSync(resolve(dir, "sink", `social-${delivery.id}.json`), "utf8")
  );
  assert.ok(sent.text.includes(`/platform/notifications/${delivery.id}`));
  await page.goto(config.origin + `/platform/notifications/${delivery.id}`);
  await page.waitForURL(
    (u) =>
      u.pathname === `/platform/posts/${post.id}` &&
      u.searchParams.get("comment") === comment.id
  );
  await page
    .getByText("Fictional email link reply", { exact: true })
    .first()
    .waitFor();
  await go();
  ok(
    "A real isolated email intent and test-sink message open the exact authorized reply in the built browser"
  );

  const bodies = [];
  const applied = Promise.withResolvers();
  await page.route(url, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    bodies.push(route.request().postData());
    if (bodies.length === 1) {
      const result = await route.fetch();
      assert.equal(result.status(), 200);
      await result.dispose();
      applied.resolve();
      return route.abort("failed");
    }
    return route.continue();
  });
  await email(reply()).uncheck();
  await page
    .getByRole("button", { name: "Save notification choices", exact: true })
    .click();
  const retry = page.getByRole("button", {
    name: "Retry last notification action",
    exact: true
  });
  await retry.waitFor();
  await applied.promise;
  assert.deepEqual(
    (await readNotificationPreferences(db, actor.token)).preferences
      .emailCategories,
    []
  );
  await retry.click();
  await page
    .getByText("Your notification choices are saved.", { exact: true })
    .waitFor();
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  assert.equal(
    await db.socialOperation.count({
      where: {
        ownerId: actor.id,
        key: "notification:" + JSON.parse(bodies[0]).mutationId
      }
    }),
    1
  );
  await page.unroute(url);
  ok(
    "Lost save acknowledgment retries the exact request with one durable receipt and no revived consent"
  );

  const other = await createPortalActor(db, "mailuiswitch");
  await signIn(other);
  await page.goto(config.origin + `/platform/notifications/${delivery.id}`);
  await page
    .getByRole("heading", {
      name: "This notification is no longer available",
      exact: true
    })
    .waitFor();
  assert.ok(
    !(await page.locator("body").innerText()).includes(
      "Fictional email link source"
    )
  );
  await go();
  assert.deepEqual(
    (await readNotificationPreferences(db, other.token)).preferences
      .emailCategories,
    []
  );
  assert.equal(await email(reply()).isChecked(), false);
  await page.setViewportSize({ width: 1280, height: 900 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    true
  );
  assert.equal(
    await page.locator("[data-nextjs-dialog], .vite-error-overlay").count(),
    0
  );
  assert.deepEqual(errors, []);
  ok(
    "Account switch shows only the current owner's choices; desktop layout and browser error checks pass"
  );
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      {
        results,
        errors,
        externalRequests: "blocked",
        delivery: "disabled server, isolated test-sink setup"
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
