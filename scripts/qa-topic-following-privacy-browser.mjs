import { request as httpsRequest } from "node:https";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";
const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the isolated fixture directory");
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  NODE_ENV: "test",
  VERCEL: "",
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + fixtureDir + "/sink",
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  PRIVILEGED_MFA_MODE: "off"
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase } = await import("../tests/seed-portal.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
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
  headless: process.env.TOPIC_PRIVACY_HEADFUL !== "1",
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
});
const output = fixtureDir + "/topic-following-privacy-browser-" + Date.now();
mkdirSync(output, { recursive: true });
const external = [],
  errors = [],
  results = [],
  startedAt = new Date().toISOString();
await context.route(
  (url) => url.origin !== config.origin,
  (route) => {
    external.push(route.request().url());
    return route.abort();
  }
);
const page = await context.newPage();
page.setDefaultTimeout(20000);
page.on("pageerror", (error) => errors.push(error.message));
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
  writeFileSync(
    output + "/progress.json",
    JSON.stringify(
      { at: new Date().toISOString(), results, scenarios },
      null,
      2
    )
  );
};
const signIn = async (actor) => {
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
const { registerAccount, loginAccount } =
  await import("../lib/platform/accounts.ts");
const { ADULT_POLICY } = await import("../lib/platform/portal-types.ts");
const routeErrors = [],
  scenarios = [],
  actors = [];
const pendingRouteReleases = new Set();
const button = (name) => page.getByRole("button", { name, exact: true });
const topicUrl = (url) => url.pathname === "/api/platform/topics";
const poll = async (read, expected) => {
  for (let i = 0; i < 200; i++) {
    const value = await read();
    if (value === expected) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(await read(), expected);
};
async function actor(label) {
  const tag = randomUUID().replaceAll("-", "").slice(0, 10),
    username = "tr_" + label.slice(0, 8) + "_" + tag,
    password = "Fictional-only-" + randomUUID();
  const made = await registerAccount(db, {
    name: "Fictional topic " + label + " " + tag,
    username,
    email: username + "@example.test",
    password,
    confirmPassword: password,
    role: "BELIEVER"
  });
  await db.platformUser.update({
    where: { id: made.id },
    data: {
      emailVerifiedAt: new Date(),
      adultAcknowledgedAt: new Date(),
      adultPolicyVersion: ADULT_POLICY,
      metricExcluded: true
    }
  });
  const token = await loginAccount(
    db,
    username + "@example.test",
    password,
    "topic-recovery-" + tag
  );
  actors.push(made.id);
  return { id: made.id, token, password };
}
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
const pulse = (name) =>
  page.evaluate((n) => window.dispatchEvent(new Event(n)), name);
async function refreshAs(owner) {
  writeFileSync(
    output + "/before-refresh-" + owner.id + ".json",
    JSON.stringify(
      await page.evaluate(() => ({
        documentId: window.__followingDocument,
        historyKeys: Object.keys(history.state ?? {}),
        photoWork: history.state?.gcPhotoWork ?? null,
        href: location.href,
        openForms: Array.from(
          document.querySelectorAll("form[aria-label]")
        ).map((n) => n.getAttribute("aria-label"))
      })),
      null,
      2
    )
  );
  await signIn(owner);
  const completed = Promise.withResolvers();
  const requests = [];
  const observe = (r) =>
    requests.push({
      path: new URL(r.url()).pathname,
      rsc: r.headers().rsc ?? null,
      method: r.method()
    });
  page.on("request", observe);
  const navigations = [];
  const navigated = (frame) => {
    if (frame === page.mainFrame())
      navigations.push({ at: new Date().toISOString(), url: frame.url() });
  };
  page.on("framenavigated", navigated);
  let handled = false;
  let phase = "awaiting RSC request";
  const match = (u) => u.pathname === managementPath;
  const handler = async (route) => {
    if (handled || route.request().headers().rsc !== "1")
      return route.fallback();
    handled = true;
    phase = "forwarding RSC";
    try {
      const r = await forwarded(route);
      assert.equal(r.status, 200);
      assert.match(r.headers["content-type"], /text\/x-component/);
      assert.ok(
        r.body.toString("utf8").includes(owner.id),
        "RSC must identify the actual cookie owner"
      );
      for (const marker of privateMarkers)
        assert.equal(
          r.body.toString("utf8").includes(marker),
          false,
          "Private followed selection must not enter RSC"
        );
      phase = "fulfilling RSC";
      await route.fulfill(r);
      phase = "RSC fulfilled";
      completed.resolve({
        owner: owner.id,
        bytes: r.body.length,
        sha256: createHash("sha256").update(r.body).digest("hex")
      });
    } catch (e) {
      routeErrors.push(e.message);
      await route.abort();
      completed.reject(e);
    }
  };
  await page.route(match, handler);
  try {
    await page.evaluate(() => {
      if (typeof window.next?.router?.refresh !== "function")
        throw Error("Actual Next router required");
      window.next.router.refresh();
    });
    let timer;
    const receipt = await Promise.race([
      completed.promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error("Account refresh did not settle: " + phase)),
          25000
        );
      })
    ]).finally(() => clearTimeout(timer));
    scenarios.push({ name: "actual-owner-rsc", ...receipt });
  } finally {
    writeFileSync(
      output + "/refresh-" + owner.id + ".json",
      JSON.stringify(
        {
          at: new Date().toISOString(),
          phase,
          requests,
          navigations,
          url: page.url()
        },
        null,
        2
      )
    );
    page.off("request", observe);
    page.off("framenavigated", navigated);
    await page.unroute(match, handler);
  }
}
const { topicCommand } = await import("../lib/platform/topic-communities.ts");
const { postCommand } = await import("../lib/platform/post-commands.ts");
const managementPath = "/platform/topics/following";
let privateMarkers = [];
const streamUrl = (u) =>
  topicUrl(u) && u.searchParams.get("view") === "following-stream";
const commentUrl = (u) => u.pathname === "/api/platform/comments";
const main = page.getByRole("main");
const composer = () =>
  page.getByRole("form", { name: "Write a comment", exact: true });
const commentText = () =>
  composer().getByLabel("Comment text", { exact: true });
let current;
async function setup(label) {
  process.env.PRIVILEGED_MFA_MODE = "off";
  const a = await actor(label),
    b = await actor(label + "other"),
    tag = randomUUID().slice(0, 8);
  const topic = await topicCommand(db, a.token, {
    operation: "create",
    mutationId: randomUUID(),
    name: "Followed private selection " + tag,
    slug: "stream-" + tag,
    description: "Fictional followed topic.",
    rules: "Respect privacy.",
    acceptedRules: true
  });
  const member = await db.topicMembership.findUniqueOrThrow({
    where: { communityId_userId: { communityId: topic.id, userId: a.id } }
  });
  await topicCommand(db, a.token, {
    operation: "follow",
    mutationId: randomUUID(),
    communityId: topic.id,
    desired: true,
    expectedVersion: member.version
  });
  const content = "Selected discussion marker " + tag;
  const post = await postCommand(db, a.token, {
    operation: "create",
    requestKey: randomUUID(),
    topicCommunityId: topic.id,
    content
  });
  privateMarkers = [content, "Followed private selection " + tag];
  await signIn(a);
  const response = await page.goto(config.origin + managementPath);
  assert.equal(response.status(), 200);
  const html = await response.text();
  for (const marker of privateMarkers)
    assert.equal(
      html.includes(marker),
      false,
      "No selected source in initial HTML"
    );
  await main
    .getByRole("article", { name: /Post by/ })
    .filter({ hasText: content })
    .waitFor();
  current = { a, b, tag, topic, post, content };
  return current;
}
async function absent(extra = []) {
  await poll(
    () =>
      page.evaluate(
        (markers) =>
          !markers.some((m) => document.documentElement.outerHTML.includes(m)),
        [...privateMarkers, ...extra]
      ),
    true
  );
  assert.equal(
    await page.locator('form[aria-label="Write a comment"] textarea').count(),
    0
  );
}
async function openComposer() {
  await main
    .getByRole("button", { name: /^Comment,/ })
    .first()
    .click();
  await page
    .getByRole("dialog", { name: "Post discussion", exact: true })
    .getByRole("button", { name: "Write a comment", exact: true })
    .click();
  await commentText().waitFor();
}
async function returnVisible(event = "focus") {
  await pulse(event);
  await main
    .getByRole("article", { name: /Post by/ })
    .filter({ hasText: current.content })
    .waitFor();
}
try {
  await setup("conceal");
  for (const event of ["blur", "pagehide", "offline"]) {
    await pulse(event);
    await absent();
    await pulse("online");
    await absent();
    await returnVisible(event === "pagehide" ? "pageshow" : "focus");
  }
  ok(
    "Selected topic and post are absent from initial HTML and physically removed on blur, pagehide and offline; passive online does not reveal them"
  );
  await openComposer();
  const draft =
    "  Preserved followed reply " + current.tag + "\n\nComplete text  ";
  await commentText().fill(draft);
  await pulse("blur");
  await absent([draft]);
  await returnVisible();
  await commentText().waitFor();
  assert.equal(await commentText().inputValue(), draft);
  await page.evaluate(() => (window.__followingDocument = "original"));
  await refreshAs(current.b);
  await absent([draft]);
  await refreshAs(current.a);
  await returnVisible();
  await commentText().waitFor();
  assert.equal(await commentText().inputValue(), draft);
  assert.equal(
    await page.evaluate(() => window.__followingDocument),
    "original"
  );
  ok(
    "Full comment draft/controller survives concealment and actual same-document A-to-B-to-A RSC refresh without serialized selected data"
  );
  assert.equal(process.env.TOPIC_PRIVACY_HEADFUL, "1");
  const otherTab = await context.newPage(),
    foreground = await context.newCDPSession(page),
    background = await context.newCDPSession(otherTab);
  try {
    await foreground.send("Emulation.setFocusEmulationEnabled", { enabled: false });
    await background.send("Emulation.setFocusEmulationEnabled", { enabled: false });
    await page.bringToFront();
    await page.waitForFunction(() => document.hasFocus());
    await commentText().waitFor();
    await page.evaluate(() => {
      window.__followingNativeBlur = 0;
      window.addEventListener("blur", (event) => {
        if (event.isTrusted) window.__followingNativeBlur++;
      });
    });
    await otherTab.bringToFront();
    await page.waitForFunction(() => !document.hasFocus(), undefined, { polling: 100 });
    assert.ok(await page.evaluate(() => window.__followingNativeBlur > 0));
    await absent([draft]);
    await page.bringToFront();
    await commentText().waitFor();
    assert.equal(await commentText().inputValue(), draft);
  } finally {
    await foreground.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await foreground.detach();
    await background.detach();
    await otherTab.close();
  }
  ok("Trusted native tab blur conceals selected posts and complete comment drafts; foreground return restores the original text");
  await db.topicMembership.update({
    where: { communityId_userId: { communityId: current.topic.id, userId: current.a.id } },
    data: { following: false }
  });
  await pulse("focus");
  await absent([draft]);
  await main.getByText(/These followed topics or their posts changed/).waitFor();
  await db.topicMembership.update({
    where: { communityId_userId: { communityId: current.topic.id, userId: current.a.id } },
    data: { following: true }
  });
  await returnVisible();
  await commentText().waitFor();
  assert.equal(await commentText().inputValue(), draft);
  ok("An actual changed following selection conceals the frozen dirty controller and restores its complete draft only when the original selection is current again");
  let releaseRead, enteredRead;
  const entered = new Promise((r) => (enteredRead = r)),
    held = new Promise((r) => (releaseRead = r));
  pendingRouteReleases.add(releaseRead);
  const readReleased = Promise.withResolvers();
  const hold = async (route) => {
    await held;
    await route.continue();
    readReleased.resolve();
  };
  await pulse("blur");
  await page.route(streamUrl, async (route) => {
    enteredRead();
    await hold(route);
  });
  await pulse("focus");
  await entered;
  await absent([draft]);
  await pulse("pagehide");
  releaseRead();
  await readReleased.promise;
  await page.unroute(streamUrl);
  await page.waitForTimeout(350);
  await absent([draft]);
  await returnVisible("pageshow");
  assert.equal(await commentText().inputValue(), draft);
  ok(
    "Held successful stream read cannot reveal selected content or a draft after a newer concealment"
  );
  await page.setViewportSize({ width: 320, height: 760 });
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    )
  );
  await page.screenshot({
    path: output + "/draft-320-enlarged.png",
    fullPage: true
  });
  let warned = false;
  page.once("dialog", async (dialog) => {
    warned = dialog.type() === "beforeunload";
    await dialog.dismiss();
  });
  await page.evaluate(() => setTimeout(() => location.reload(), 0));
  await poll(() => Promise.resolve(warned), true);
  assert.equal(await commentText().inputValue(), draft);
  ok(
    "320-pixel enlarged-text composer is bounded and canceling the native unsaved reload preserves complete text"
  );
  // A fresh owner-scoped target isolates receipt tests from the previous unsent draft.
  page.once("dialog", (d) => d.accept());
  await setup("lostreply");
  await openComposer();
  const text = "Original comment command " + current.tag;
  await commentText().fill(text);
  const bodies = [];
  let attempts = 0;
  await page.route(commentUrl, async (route) => {
    if (
      route.request().method() !== "POST" ||
      JSON.parse(route.request().postData()).operation !== "create"
    )
      return route.fallback();
    try {
      bodies.push(route.request().postData());
      attempts++;
      if (attempts === 1) {
        const actual = await forwarded(route);
        assert.ok([200, 202].includes(actual.status));
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Fictional lost committed response" })
        });
      } else if (attempts === 2)
        await route.fulfill({
          status: 429,
          headers: { "retry-after": "900" },
          contentType: "application/json",
          body: JSON.stringify({ message: "Fictional cooldown" })
        });
      else await route.fulfill(await forwarded(route));
    } catch (error) {
      routeErrors.push(error.message);
      await route.abort();
    }
  });
  await composer().getByRole("button", { name: "Reply", exact: true }).click();
  await composer()
    .getByRole("button", { name: "Retry same request", exact: true })
    .waitFor();
  await poll(
    () =>
      db.platformPostComment.count({
        where: { postId: current.post.id, content: text }
      }),
    1
  );
  await pulse("focus");
  await absent([text]);
  await button("Confirm original request").waitFor();
  await button("Confirm original request").click();
  await poll(() => Promise.resolve(attempts), 2);
  await button("Confirm original request").waitFor();
  await button("Confirm original request").click();
  await poll(() => Promise.resolve(attempts), 3);
  await returnVisible();
  assert.ok(bodies.every((b) => b === bodies[0]));
  assert.equal(
    await db.platformPostComment.count({
      where: { postId: current.post.id, content: text }
    }),
    1
  );
  await page.unroute(commentUrl);
  scenarios.push({
    name: "lost-comment-receipt",
    attempts,
    bodySha256: createHash("sha256").update(bodies[0]).digest("hex"),
    effects: 1
  });
  ok(
    "Committed lost comment response survives 429 and confirms byte-identical original request once without duplicate comments"
  );
  await setup("lateack");
  await openComposer();
  const late = "Late accepted reply " + current.tag;
  await commentText().fill(late);
  let releaseAck, ackEntered;
  const ackHeld = new Promise((r) => (releaseAck = r)),
    ackReady = new Promise((r) => (ackEntered = r));
  pendingRouteReleases.add(releaseAck);
  let createPosts = 0;
  await page.route(commentUrl, async (route) => {
    if (
      route.request().method() !== "POST" ||
      JSON.parse(route.request().postData()).operation !== "create"
    )
      return route.fallback();
    createPosts++;
    const actual = await forwarded(route);
    assert.ok([200, 202].includes(actual.status));
    ackEntered();
    await ackHeld;
    await route.fulfill(actual);
  });
  await composer().getByRole("button", { name: "Reply", exact: true }).click();
  await ackReady;
  await pulse("blur");
  await absent([late]);
  releaseAck();
  await page.waitForTimeout(350);
  await absent([late]);
  await pulse("focus");
  await button("Confirm original request").waitFor();
  await button("Confirm original request").click();
  await returnVisible();
  assert.equal(createPosts, 1);
  assert.equal(
    await db.platformPostComment.count({
      where: { postId: current.post.id, content: late }
    }),
    1
  );
  await page.unroute(commentUrl);
  ok(
    "Late accepted comment receipt stays protected through concealment and continues without another POST"
  );
  await setup("paging");
  const publishedAt = new Date();
  await db.platformPost.update({ where: { id: current.post.id }, data: { publishedAt } });
  await db.platformPost.createMany({ data: Array.from({ length: 20 }, (_, i) => ({
    id: `followed_paging_${current.tag}_${String(i).padStart(2, "0")}`,
    authorId: current.a.id,
    topicCommunityId: current.topic.id,
    content: `Fictional followed paging ${current.tag} ${i}`,
    publishedAt
  })) });
  await page.reload();
  await poll(() => main.getByRole("article", { name: /Post by/ }).count(), 20);
  const firstIds = await main.locator('article.gc-post a[href^="/platform/posts/"]').evaluateAll((rows) => rows.map((row) => row.getAttribute("href")));
  await main.getByRole("link", { name: "Older topic posts", exact: true }).click();
  await poll(() => main.getByRole("article", { name: /Post by/ }).count(), 1);
  const olderIds = await main.locator('article.gc-post a[href^="/platform/posts/"]').evaluateAll((rows) => rows.map((row) => row.getAttribute("href")));
  assert.equal(new Set([...firstIds, ...olderIds]).size, 21);
  await main.getByRole("link", { name: "Latest topic posts", exact: true }).click();
  await poll(() => main.getByRole("article", { name: /Post by/ }).count(), 20);
  assert.deepEqual(await main.locator('article.gc-post a[href^="/platform/posts/"]').evaluateAll((rows) => rows.map((row) => row.getAttribute("href"))), firstIds);
  ok("Real older/latest links preserve bounded 20+1 equal-time pagination with no duplicate or missing posts");
  await setup("share");
  await page.evaluate(() => {
    window.__followingShares = [];
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (value) => window.__followingShares.push(["copy", value]) } });
    Object.defineProperty(navigator, "share", { configurable: true, value: async (value) => window.__followingShares.push(["share", value]) });
  });
  // Mount after the harmless native-share spy is installed.
  await pulse("blur");
  await returnVisible();
  const shareUrl = (u) => u.pathname === "/api/platform/share-preview" && u.searchParams.get("id") === current.post.id;
  for (const label of ["Copy link", "Show QR code"]) {
    if ((await button("Share post").getAttribute("aria-expanded")) !== "true") await button("Share post").click();
    await button(label).waitFor();
    const ready = Promise.withResolvers(), release = Promise.withResolvers(), finished = Promise.withResolvers();
    pendingRouteReleases.add(release.resolve);
    let handled = false;
    await page.route(shareUrl, async (route) => {
      if (handled) return route.fallback();
      handled = true;
      const actual = await forwarded(route);
      assert.equal(actual.status, 200);
      ready.resolve();
      await release.promise;
      await route.fulfill(actual);
      finished.resolve();
    });
    await button(label).click();
    await ready.promise;
    await pulse("offline");
    await absent();
    release.resolve();
    await finished.promise;
    await page.unroute(shareUrl);
    await page.waitForTimeout(150);
    await absent();
    assert.deepEqual(await page.evaluate(() => window.__followingShares), []);
    assert.equal(await page.getByRole("dialog", { name: /QR/ }).count(), 0);
    await returnVisible();
  }
  ok("Held successful share checks released after offline cannot copy a link or reveal a QR dialog");
  await setup("bookmark");
  const bookmarkReady = Promise.withResolvers(), bookmarkRelease = Promise.withResolvers(), bookmarkFinished = Promise.withResolvers();
  pendingRouteReleases.add(bookmarkRelease.resolve);
  const bookmarkBodies = [];
  const workspaceUrl = (u) => u.pathname === "/api/platform/post-workspace";
  await page.route(workspaceUrl, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    bookmarkBodies.push(route.request().postData());
    const actual = await forwarded(route);
    assert.equal(actual.status, 200);
    if (bookmarkBodies.length === 1) {
      bookmarkReady.resolve();
      await bookmarkRelease.promise;
    }
    await route.fulfill(actual);
    bookmarkFinished.resolve();
  });
  await button("Bookmark").click();
  await bookmarkReady.promise;
  await pulse("blur");
  await absent();
  await returnVisible();
  assert.equal(await button("Bookmark").isDisabled(), true);
  assert.equal(bookmarkBodies.length, 1);
  assert.equal(await db.savedPostItem.count({ where: { ownerId: current.a.id, postId: current.post.id } }), 1);
  bookmarkRelease.resolve();
  await bookmarkFinished.promise;
  await button("Bookmark recovery").waitFor();
  await button("Bookmark recovery").click();
  await button("Refresh saved status").click();
  await poll(() => button("Retry same save choice").isEnabled(), true);
  await button("Retry same save choice").click();
  await poll(() => Promise.resolve(bookmarkBodies.length), 2);
  assert.equal(bookmarkBodies[1], bookmarkBodies[0]);
  await poll(() => button("Remove bookmark").isEnabled(), true);
  assert.equal(await db.savedPostItem.count({ where: { ownerId: current.a.id, postId: current.post.id } }), 1);
  await page.unroute(workspaceUrl);
  ok("A held committed bookmark remains busy across concealment and recovers the exact original request without a second saved item");
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  assert.deepEqual(routeErrors, []);
  const receipt = {
    startedAt,
    completedAt: new Date().toISOString(),
    passed: results.length,
    results,
    scenarios,
    actors,
    errors,
    external,
    routeErrors,
    productionWrites: 0,
    externalSends: 0
  };
  writeFileSync(output + "/receipt.json", JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        error: String(error),
        stack: error.stack,
        results,
        scenarios,
        actors,
        errors,
        external,
        routeErrors,
        url: page.url()
      },
      null,
      2
    )
  );
  throw error;
} finally {
  for (const release of pendingRouteReleases) release();
  await browser.close();
  await db.$disconnect();
}
