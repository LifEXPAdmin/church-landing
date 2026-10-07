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
const { seedVolunteerApplications } =
  await import("../tests/seed-volunteer-applications.ts");
const { volunteerCommand } =
  await import("../lib/platform/volunteer-commands.ts");
const { commentCommand } = await import("../lib/platform/comment-commands.ts");
const db = new PrismaClient();
const f = await seedVolunteerApplications(db, false);
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
  headless: process.env.RESOURCE_CONVERSATIONS_HEADED !== "1",
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
const output = fixture + "/resource-conversations-" + Date.now();
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
  assert.fail("Timed out waiting for current resource state");
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
const bounded = async (promise, label, milliseconds = 20000) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label)), milliseconds);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
};
const refresh = async () => {
  console.log("PHASE refresh " + phase);
  const completed = Promise.withResolvers();
  const match = (u) => u.pathname === "/platform/serve/" + f.opportunity.id;
  const handler = async (route) => {
    if (route.request().headers().rsc !== "1") return route.fallback();
    try {
      const r = await forwarded(route);
      assert.equal(r.status, 200);
      await route.fulfill(r);
      completed.resolve();
    } catch (e) {
      completed.reject(e);
      await route.abort().catch(() => {});
    }
  };
  await page.route(match, handler);
  try {
    await page.evaluate(() => {
      if (!window.next?.router?.refresh)
        throw Error("Actual Next router unavailable");
      window.next.router.refresh();
    });
    await bounded(completed.promise, "Actual RSC refresh failed to settle");
    await bounded(
      page.evaluate(
        () =>
          new Promise((done) =>
            requestAnimationFrame(() => requestAnimationFrame(done))
          )
      ),
      "Refreshed render did not settle"
    );
  } finally {
    await page.unroute(match, handler);
  }
  console.log("PHASE refreshed " + phase);
};
const thread = () =>
  page.getByRole("region", { name: "Full discussion", exact: true });
let phase = "canonical thread";
try {
  const existing = await commentCommand(db, f.val.token, {
    operation: "create",
    mutationId: crypto.randomUUID(),
    postId: f.opportunityPost.id,
    content: "Fictional canonical recruitment discussion"
  });
  await signIn(f.lee);
  await go("/platform/serve/" + f.opportunity.id);
  await page.locator('[data-comment-id="' + existing.id + '"]').waitFor();
  assert.equal(
    await page
      .getByText(/Commenting does not apply or reserve a place/)
      .isVisible(),
    true
  );
  await go("/platform/posts/" + f.opportunityPost.id);
  await page.locator('[data-comment-id="' + existing.id + '"]').waitFor();
  ok(
    "Recruitment and canonical post render the same comment identity and explicit private application separation"
  );
  await go("/platform/serve/" + f.opportunity.id);
  await thread()
    .getByRole("button", { name: "Write a comment", exact: true })
    .click();
  const unsent = "Unsent original-owner recruitment note  ";
  await page.getByLabel("Comment text", { exact: true }).fill(unsent);
  phase = "account refresh retention";
  await cookieOwner(f.val);
  await refresh();
  assert.equal(
    await page.getByLabel("Comment text", { exact: true }).isVisible(),
    false
  );
  await cookieOwner(f.lee);
  await refresh();
  await page.getByLabel("Comment text", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Comment text", { exact: true }).inputValue(),
    unsent
  );
  ok(
    "Original comment working copy survives actual A-to-B-to-A cookie and Next router refreshes"
  );
  phase = "native focus and offline retention";
  const other = await nativeOtherWindow();
  assert.equal(
    await page.getByLabel("Comment text", { exact: true }).isVisible(),
    false
  );
  await other.close();
  await page.bringToFront();
  await page.getByLabel("Comment text", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Comment text", { exact: true }).inputValue(),
    unsent
  );
  await context.setOffline(true);
  await page.waitForFunction(() => !navigator.onLine);
  assert.equal(
    await page.getByLabel("Comment text", { exact: true }).isVisible(),
    false
  );
  await context.setOffline(false);
  await page.getByLabel("Comment text", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Comment text", { exact: true }).inputValue(),
    unsent
  );
  ok(
    "Native window blur and browser offline state conceal and preserve the original comment draft"
  );

  phase = "committed comment with changed account";
  const committed = Promise.withResolvers(),
    release = Promise.withResolvers();
  const bodies = [];
  let saved;
  let denyRetry = null;
  const commentRoute = async (route) => {
    const request = route.request();
    if (
      request.method() !== "POST" ||
      JSON.parse(request.postData() ?? "{}").operation !== "create"
    )
      return route.fallback();
    bodies.push(request.postData());
    if (bodies.length === 1) {
      const response = await forwarded(route);
      assert.equal(response.status, 200, response.body.toString());
      saved = JSON.parse(response.body);
      committed.resolve();
      await bounded(
        release.promise,
        "Release committed create response",
        30000
      );
      await route.fulfill(response);
    } else if (denyRetry) {
      await route.fulfill({
        status: denyRetry,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Fictional temporary original-request denial"
        })
      });
    } else await route.continue();
  };
  await page.route("**/api/platform/comments", commentRoute);
  await page
    .getByRole("dialog", { name: "Write a comment", exact: true })
    .getByRole("button", { name: "Reply", exact: true })
    .click();
  await bounded(committed.promise, "Comment did not commit");
  await cookieOwner(f.val);
  await refresh();
  release.resolve();
  await waitFor(() =>
    db.platformPostComment
      .count({ where: { id: saved.id } })
      .then((n) => n === 1)
  );
  await cookieOwner(f.lee);
  await refresh();
  const retry = page.getByRole("button", {
    name: "Retry same request",
    exact: true
  });
  await retry.waitFor();
  assert.equal(
    await db.volunteerApplication.count({
      where: { opportunityId: f.opportunity.id }
    }),
    0
  );
  for (const status of [503, 403, 404, 409]) {
    denyRetry = status;
    const count = bodies.length;
    await retry.click();
    await waitFor(() => Promise.resolve(bodies.length === count + 1));
    await page
      .getByRole("status")
      .filter({ hasText: "Fictional temporary original-request denial" })
      .waitFor();
    assert.equal(bodies.at(-1), bodies[0]);
  }
  // A sibling private application changes the full resource snapshot. The
  // shared comment recovery must not depend on that application's checksum.
  const statement =
    "Fictional private application while comment acknowledgment is uncertain";
  await volunteerCommand(db, f.lee.token, f.application(statement));
  await refresh();
  await retry.waitFor();
  assert.equal(
    await page.getByLabel("Comment text", { exact: true }).inputValue(),
    unsent
  );
  denyRetry = null;
  await retry.click();
  await page.locator('[data-comment-id="' + saved.id + '"]').waitFor();
  assert.equal(
    await db.platformPostComment.count({ where: { id: saved.id } }),
    1
  );
  assert.ok(bodies.every((body) => body === bodies[0]));
  await page.unroute("**/api/platform/comments", commentRoute);
  await page
    .getByText("Your application note: " + statement, { exact: true })
    .waitFor();
  ok(
    "The already-received application snapshot becomes visible after the last protected comment request is confirmed"
  );
  assert.equal(await thread().getByText(statement, { exact: true }).count(), 0);
  writeFileSync(
    output + "/original-comment-retries.json",
    JSON.stringify({ bodies, commentId: saved.id }, null, 2)
  );
  ok(
    "A committed create survives account change, 503/403/404/409 responses and sibling application refresh; original bytes recover exactly one comment"
  );

  phase = "source revocation and restore";
  await thread()
    .getByRole("button", { name: "Write a comment", exact: true })
    .click();
  const retained = "Unsent note before source withdrawal";
  await page.getByLabel("Comment text", { exact: true }).fill(retained);
  await db.platformPost.update({
    where: { id: f.opportunityPost.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  await refresh();
  await page
    .getByRole("region", { name: "Recruitment access", exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("Comment text", { exact: true }).isVisible(),
    false
  );
  await db.platformPost.update({
    where: { id: f.opportunityPost.id },
    data: { status: "PUBLISHED", withdrawnAt: null }
  });
  await refresh();
  await page.getByLabel("Comment text", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Comment text", { exact: true }).inputValue(),
    retained
  );
  ok(
    "Unavailable-source RSC retains the original working tree and returns it only after current access is restored"
  );
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() =>
    document.documentElement.style.setProperty("--gc-reader-size", "24px")
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    )
  );
  await page.screenshot({
    path: output + "/comment-320-enlarged.png",
    timeout: 5000
  });
  ok("320-pixel enlarged comment editor has no horizontal page overflow");
  phase = "public guest discussion and sign-in return";
  await db.platformPost.update({
    where: { id: f.opportunityPost.id },
    data: { audience: "PUBLIC", replyAudience: "CHURCH_MEMBERS" }
  });
  const guestContext = await browser.newContext({
    viewport: { width: 390, height: 844 }
  });
  await guestContext.route("**/*", (route) =>
    new URL(route.request().url()).origin === config.origin
      ? route.continue()
      : route.abort()
  );
  const guest = await guestContext.newPage();
  guest.on("pageerror", (error) => errors.push(error.message));
  await guest.goto(config.origin + "/platform/serve/" + f.opportunity.id);
  await guest.bringToFront();
  await guest.locator('[data-comment-id="' + saved.id + '"]').waitFor();
  assert.equal(
    await guest.getByLabel("Comment text", { exact: true }).count(),
    0
  );
  assert.equal(await guest.getByText(statement, { exact: true }).count(), 0);
  const entry = guest.getByRole("link", {
    name: "Sign in to take part",
    exact: true
  });
  const target = new URL(await entry.getAttribute("href"), config.origin);
  assert.equal(
    target.searchParams.get("next"),
    "/platform/serve/" + f.opportunity.id
  );
  await guestContext.close();
  await page.bringToFront();
  ok(
    "Public recruitment discussion is guest-readable without private application details, and sign-in preserves the opportunity destination"
  );

  phase = "initially unavailable source becomes a protected workspace";
  const recoveryContext = await browser.newContext({
    viewport: { width: 390, height: 844 }
  });
  await recoveryContext.route("**/*", (route) =>
    new URL(route.request().url()).origin === config.origin
      ? route.continue()
      : route.abort()
  );
  await recoveryContext.addCookies([
    {
      name: sessionCookieFixtureName(config.origin),
      value: f.lee.token,
      url: config.origin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
  const recoveryPage = await recoveryContext.newPage();
  recoveryPage.on("pageerror", (error) => errors.push(error.message));
  await db.platformPost.update({
    where: { id: f.opportunityPost.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  await recoveryPage.goto(
    config.origin + "/platform/serve/" + f.opportunity.id
  );
  await recoveryPage.bringToFront();
  await recoveryPage
    .getByRole("status")
    .filter({ hasText: /unavailable/ })
    .waitFor();
  const refreshRecovery = async () => {
    const completed = Promise.withResolvers();
    const matcher = (u) => u.pathname === "/platform/serve/" + f.opportunity.id;
    const handler = async (route) => {
      if (route.request().headers().rsc !== "1") return route.fallback();
      try {
        await route.fulfill(await forwarded(route));
        completed.resolve();
      } catch (e) {
        completed.reject(e);
        await route.abort().catch(() => {});
      }
    };
    await recoveryPage.route(matcher, handler);
    try {
      await recoveryPage.evaluate(() => window.next.router.refresh());
      await bounded(completed.promise, "Initial-source refresh failed");
    } finally {
      await recoveryPage.unroute(matcher, handler);
    }
  };
  await db.platformPost.update({
    where: { id: f.opportunityPost.id },
    data: { status: "PUBLISHED", withdrawnAt: null }
  });
  await refreshRecovery();
  await recoveryPage
    .getByRole("button", { name: "Write a comment", exact: true })
    .click();
  const recoveredDraft =
    "Fictional draft after an initially unavailable source";
  await recoveryPage
    .getByLabel("Comment text", { exact: true })
    .fill(recoveredDraft);
  await recoveryContext.clearCookies();
  await recoveryContext.addCookies([
    {
      name: sessionCookieFixtureName(config.origin),
      value: f.val.token,
      url: config.origin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
  await refreshRecovery();
  await recoveryPage
    .getByRole("region", { name: "Recruitment access", exact: true })
    .waitFor();
  assert.equal(
    await recoveryPage.getByLabel("Comment text", { exact: true }).isVisible(),
    false
  );
  await recoveryContext.clearCookies();
  await recoveryContext.addCookies([
    {
      name: sessionCookieFixtureName(config.origin),
      value: f.lee.token,
      url: config.origin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
  await refreshRecovery();
  await recoveryPage.getByLabel("Comment text", { exact: true }).waitFor();
  assert.equal(
    await recoveryPage.getByLabel("Comment text", { exact: true }).inputValue(),
    recoveredDraft
  );
  await recoveryContext.close();
  await page.bringToFront();
  ok(
    "An initially unavailable page establishes the original-owner workspace on first permitted refresh and retains its later A-to-B-to-A draft"
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      {
        passed: results,
        errors,
        external,
        source: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8"
        }).trim()
      },
      null,
      2
    )
  );
} catch (error) {
  await page
    .screenshot({
      path: output + "/failure.png",
      fullPage: true,
      timeout: 5000
    })
    .catch(() => {});
  writeFileSync(
    output + "/failure.json",
    JSON.stringify(
      { phase, error: String(error), passed: results, errors, external },
      null,
      2
    )
  );
  throw error;
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
