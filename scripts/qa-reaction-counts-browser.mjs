import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { request as httpsRequest } from "node:https";
import { resolve } from "node:path";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";
const fixture = process.argv[2];
assert.ok(fixture);
const config = JSON.parse(readFileSync(fixture + "/browser-env.json", "utf8"));
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: resolve(fixture, "sink"),
  NODE_ENV: "test",
  VERCEL: "",
  PRIVILEGED_MFA_MODE: "off"
});
const { PrismaClient } = await import("@prisma/client");
const { seedReactionCounts, setAuthorCounts } =
  await import("../tests/reaction-count-fixture.ts");
const db = new PrismaClient();
const f = await seedReactionCounts(db);
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
  headless: process.env.REACTION_COUNTS_HEADED !== "1",
  executablePath:
    process.env.CHROMIUM_PATH ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: [
    "--ignore-certificate-errors-spki-list=" +
      createHash("sha256").update(der).digest("base64")
  ]
});
const context = await browser.newContext({
    viewport: { width: 390, height: 844 }
  }),
  page = await context.newPage();
page.setDefaultTimeout(20000);
const errors = [],
  external = [],
  results = [];
page.on("pageerror", (error) => errors.push(error.message));
await context.route("**/*", (route) => {
  if (new URL(route.request().url()).origin === config.origin)
    return route.continue();
  external.push(route.request().url());
  return route.abort();
});
const output = fixture + "/reaction-counts-" + Date.now();
mkdirSync(output);
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const signIn = async (actor) => {
  await page.goto("about:blank");
  await context.clearCookies();
  if (actor)
    await context.addCookies([
      {
        name: sessionCookieFixtureName(config.origin),
        value: actor.token,
        url: config.origin,
        secure: true,
        httpOnly: true,
        sameSite: "Lax"
      }
    ]);
};
const go = async (path) => {
  assert.equal((await page.goto(config.origin + path)).status(), 200);
  await page.bringToFront();
};
const waitFor = async (work) => {
  for (let i = 0; i < 100; i++) {
    if (await work()) return;
    await page.waitForTimeout(100);
  }
  assert.fail("Timed out waiting for current count state");
};
const nativeOtherWindow = async () => {
  const cdp = await browser.newBrowserCDPSession();
  const pageCdp = await context.newCDPSession(page);
  await pageCdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  await page.bringToFront();
  await page.waitForFunction(() => document.hasFocus());
  const { targetInfo } = await pageCdp.send("Target.getTargetInfo");
  const created = context.waitForEvent("page");
  await cdp.send("Target.createTarget", {
    url: "about:blank",
    browserContextId: targetInfo.browserContextId,
    newWindow: true,
    background: false
  });
  const other = await created;
  const otherCdp = await context.newCDPSession(other);
  await otherCdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  await other.bringToFront();
  await page.waitForFunction(() => !document.hasFocus());
  assert.equal(await other.evaluate(() => document.hasFocus()), true);
  return other;
};
const cookieOwner = async (actor) => {
  await context.clearCookies();
  if (actor)
    await context.addCookies([
      {
        name: sessionCookieFixtureName(config.origin),
        value: actor.token,
        url: config.origin,
        secure: true,
        httpOnly: true,
        sameSite: "Lax"
      }
    ]);
};
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
        ca: readFileSync(config.certificate),
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
const settingPath = "/platform/settings/display/reading";
const authorControl = page.getByLabel(
  "Hide Like and prayer totals on my posts and comments"
);
const totalCount = () => page.locator(".gc-reaction-count").count();
const setBrowserHide = async (hide) => {
  await go(settingPath);
  await authorControl.waitFor({ state: "visible" });
  await page
    .getByRole("checkbox", { name: "Hide reaction counts", exact: true })
    .setChecked(hide);
  const save = page.getByRole("button", {
    name: "Save display choices",
    exact: true
  });
  if (await save.isEnabled()) await save.click();
  await waitFor(
    async () =>
      (await page.locator(`div[data-hide-reaction-counts="${hide}"]`).count()) ===
      1
  );
};
let otherWindow;
try {
  await signIn(f.viewer);
  await go(`/platform/posts/${f.post.id}`);
  const like = page
    .getByRole("button", { name: "Unlike post", exact: true })
    .first();
  await like.waitFor();
  assert.equal(await like.getAttribute("aria-pressed"), "true");
  assert.equal(await like.locator(".gc-reaction-count").innerText(), "1");
  ok("Default post total and own Like state are visible");

  await go(settingPath);
  await authorControl.waitFor({ state: "visible" });
  const local = page.getByRole("checkbox", {
    name: "Hide reaction counts",
    exact: true
  });
  await local.check();
  assert.equal(
    await page.locator('div[data-hide-reaction-counts="false"]').count(),
    1
  );
  await page
    .getByRole("button", { name: "Save display choices", exact: true })
    .click();
  await page.reload();
  await page.bringToFront();
  await local.waitFor();
  assert.equal(await local.isChecked(), true);
  assert.equal(await authorControl.isChecked(), false);
  ok(
    "Display preview saves and survives reload independently of the author's account choice"
  );

  for (const path of [
    `/platform/posts/${f.post.id}`,
    `/platform/posts/${f.churchPost.id}`,
    `/platform/profile/${f.a.username}`,
    "/platform"
  ]) {
    await go(path);
    await waitFor(
      async () =>
        (await page.locator('div[data-hide-reaction-counts="true"]').count()) === 1
    );
    assert.equal(await totalCount(), 0, path);
  }
  await go(`/platform/posts/${f.churchPost.id}`);
  const comment = page.locator(`[data-comment-id="${f.comment.id}"]`).first();
  await comment.waitFor();
  assert.equal(
    await comment
      .getByRole("button", { name: "Unlike", exact: true })
      .getAttribute("aria-pressed"),
    "true"
  );
  assert.equal(await totalCount(), 0);
  ok(
    "Viewer hiding removes rendered totals from feed, detail, profile and comments while preserving own reactions"
  );

  await setBrowserHide(false);
  await go("/platform/settings/privacy");
  const shortcut = page.getByRole("link", {
    name: "Reaction-count display and contribution choices",
    exact: true
  });
  assert.equal(
    await shortcut.getAttribute("href"),
    settingPath + "#hide-reaction-counts"
  );
  await shortcut.click();
  await local.waitFor();
  assert.equal(await local.isChecked(), false);
  ok("Privacy links to the same persisted Appearance control");

  await signIn(f.a);
  await go(settingPath);
  await authorControl.waitFor({ state: "visible" });
  await authorControl.check();
  await page
    .getByRole("button", {
      name: "Save contribution count choice",
      exact: true
    })
    .click();
  await page
    .getByText("Your reaction-count choice is saved.", { exact: true })
    .waitFor();
  assert.equal(
    (
      await db.socialPreferences.findUniqueOrThrow({
        where: { ownerId: f.a.id }
      })
    ).hideAuthoredReactionCounts,
    true
  );
  await page.reload();
  await page.bringToFront();
  await authorControl.waitFor({ state: "visible" });
  assert.equal(await authorControl.isChecked(), true);
  ok(
    "Author saves a versioned contribution choice through the production application"
  );

  for (const actor of [null, f.viewer, f.a]) {
    await signIn(actor);
    await go(`/platform/posts/${f.post.id}`);
    assert.equal(await totalCount(), 0);
    await go(`/platform/posts/${f.other.id}`);
    await waitFor(async () => (await totalCount()) > 0);
    await go(`/platform/posts/${f.churchPost.id}`);
    const hiddenComment = page
      .locator(`[data-comment-id="${f.comment.id}"]`)
      .first();
    await hiddenComment.waitFor();
    assert.equal(await hiddenComment.locator(".gc-reaction-count").count(), 0);
    if (actor) {
      const churchLike = page
        .getByRole("button", { name: "Unlike post", exact: true })
        .or(page.getByRole("button", { name: "Like post", exact: true }))
        .first();
      assert.equal(
        await churchLike.locator(".gc-reaction-count").innerText(),
        "1"
      );
    }
  }
  ok(
    "Author hiding applies to guest, member and self without changing another author or church speech"
  );

  await signIn(f.viewer);
  await go(`/platform/posts/${f.post.id}`);
  await page
    .getByRole("button", { name: "Unlike post", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Like post", exact: true })
    .first()
    .waitFor();
  assert.equal(await totalCount(), 0);
  await page
    .getByRole("button", { name: "Like post", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Unlike post", exact: true })
    .first()
    .waitFor();
  assert.equal(await totalCount(), 0);
  ok("Like and Unlike stay usable with author totals hidden");

  await page
    .getByRole("button", { name: "Pray for this post", exact: true })
    .first()
    .click();
  await page.getByLabel("I have read this prayer guide").check();
  await page
    .getByRole("button", { name: "Accept prayer guide", exact: true })
    .click();
  const prayed = page.getByRole("button", { name: "I prayed", exact: true });
  await waitFor(() => prayed.isEnabled());
  await prayed.click();
  await page
    .getByRole("button", { name: "Undo I prayed", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("region", { name: "Prayer participants", exact: true })
      .locator(".gc-reaction-count")
      .count(),
    0
  );
  await page.getByRole("button", { name: "Close prayer", exact: true }).click();
  ok(
    "Prayer acknowledgement remains functional while the author's prayer total is absent"
  );

  await signIn(f.a);
  await go(settingPath);
  await authorControl.waitFor({ state: "visible" });
  await authorControl.uncheck();
  otherWindow = await nativeOtherWindow();
  assert.equal(await authorControl.isVisible(), false);
  await cookieOwner(f.b);
  await page.bringToFront();
  await page
    .getByText(/sign-in changed/)
    .first()
    .waitFor();
  assert.equal(await authorControl.isVisible(), false);
  await cookieOwner(f.a);
  await otherWindow.bringToFront();
  await page.bringToFront();
  await authorControl.waitFor({ state: "visible" });
  assert.equal(await authorControl.isChecked(), false);
  assert.equal(
    (
      await db.socialPreferences.findUniqueOrThrow({
        where: { ownerId: f.a.id }
      })
    ).hideAuthoredReactionCounts,
    true
  );
  await otherWindow.close();
  otherWindow = null;
  ok(
    "Native blur and A-to-B-to-A cookie changes conceal the editor and retain A's unsaved choice"
  );

  const bodies = [];
  let lose = true;
  await page.route("**/api/platform/reaction-preferences", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    bodies.push(route.request().postData());
    const actual = await forwarded(route);
    assert.equal(actual.status, 200);
    if (lose) {
      lose = false;
      await route.abort("failed");
    } else await route.fulfill(actual);
  });
  await page
    .getByRole("button", {
      name: "Save contribution count choice",
      exact: true
    })
    .click();
  const retry = page.getByRole("button", {
    name: "Retry same count choice",
    exact: true
  });
  await retry.waitFor({ state: "visible" });
  await retry.click();
  await page
    .getByText("Your reaction-count choice is saved.", { exact: true })
    .waitFor();
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  await page.unroute("**/api/platform/reaction-preferences");
  assert.equal(
    (
      await db.socialPreferences.findUniqueOrThrow({
        where: { ownerId: f.a.id }
      })
    ).hideAuthoredReactionCounts,
    false
  );
  ok(
    "Lost real POST response retries identical bytes and confirms the single saved version"
  );

  await authorControl.check();
  await setAuthorCounts(db, f.a, true);
  await page
    .getByRole("button", { name: "Review current saved choice", exact: true })
    .click();
  await authorControl.waitFor({ state: "visible" });
  assert.equal(await authorControl.isChecked(), true);
  assert.equal(
    await page
      .getByRole("button", {
        name: "Save contribution count choice",
        exact: true
      })
      .isEnabled(),
    false
  );
  await page
    .getByRole("button", {
      name: "Discard local change and use saved choice",
      exact: true
    })
    .click();
  assert.equal(await authorControl.isChecked(), true);
  ok(
    "Another tab version change preserves the draft and requires explicit reconciliation"
  );

  await page.setViewportSize({ width: 320, height: 844 });
  await page.screenshot({ path: output + "/settings-320.png", fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    ),
    true
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  ok("Small-screen settings fit without horizontal overflow or page errors");
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        results,
        errors,
        external,
        source: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8"
        }).trim(),
        at: new Date().toISOString()
      },
      null,
      2
    )
  );
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.json",
    JSON.stringify(
      { results, error: String(error), errors, external, url: page.url() },
      null,
      2
    )
  );
  throw error;
} finally {
  if (otherWindow) await otherWindow.close();
  await browser.close();
  await db.$disconnect();
}
