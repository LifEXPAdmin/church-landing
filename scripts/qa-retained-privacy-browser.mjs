import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the existing isolated preview artifact directory");
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + fixtureDir + "/sink",
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  MEDIA_STORAGE_MODE: "local-test",
  MEDIA_TEST_DIR: process.cwd() + "/" + fixtureDir + "/images",
  RETENTION_TEST_DIR: process.cwd() + "/" + fixtureDir + "/retention",
  COMMUNITY_REPORTS_ENABLED: "true",
  NODE_ENV: "test",
  VERCEL: ""
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
const errors = [];
page.on("pageerror", (e) => {
  const issue = { path: new URL(page.url()).pathname, message: e.message };
  errors.push(issue);
  console.log("BROWSER_ERROR", JSON.stringify(issue));
});
const results = [];
const ok = (s) => {
  results.push(s);
  console.log("PASS " + s);
};
const output = fixtureDir + "/retained-privacy-browser";
mkdirSync(output, { recursive: true });
const go = async (path) => {
  await page.goto(config.origin + path);
  await page.getByRole("heading", { level: 1 }).waitFor();
};
const bounded = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal page overflow"
  );

const { seedPortal } = await import("../tests/seed-portal.ts");
const { randomUUID } = await import("node:crypto");
const { seedOperatorGrants } = await import("../tests/seed-portal.ts");
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

page.setDefaultTimeout(25000);
const requests = [];
page.on("request", (request) => {
  const url = new URL(request.url());
  if (
    url.pathname === "/api/platform/posts" &&
    url.searchParams.get("view") === "availability-batch"
  )
    requests.push({ ids: url.searchParams.getAll("postId"), at: Date.now() });
});
const api = async (actor, path, body) => {
  const response = await fetch(config.origin + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(actor
        ? {
            Cookie: "church_platform_session=" + actor.token,
            "X-Expected-Account": actor.id
          }
        : {}),
      ...(body
        ? { Origin: config.origin, "Content-Type": "application/json" }
        : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return response;
};
const focus = () =>
  page.evaluate(() => window.dispatchEvent(new Event("focus")));
const blur = () => page.evaluate(() => window.dispatchEvent(new Event("blur")));
const waitBody = (text) => page.getByText(text, { exact: true }).waitFor();
const hiddenBody = (text) =>
  page.getByText(text, { exact: true }).waitFor({ state: "hidden" });
const f = await seedPortal(db);
await db.friendAcceptance.create({
  data: {
    inviterId: f.memberA.id,
    recipientId: f.coordinator.id,
    invitationVersion: 1,
    state: "CONNECTED"
  }
});
await db.platformFollow.createMany({
  data: [
    { followerId: f.memberA.id, followingId: f.coordinator.id },
    { followerId: f.coordinator.id, followingId: f.memberA.id }
  ]
});
await seedOperatorGrants(db, f.operator, ["REVIEW_COMMUNITY_REPORTS"]);
const suffix = randomUUID();
const source = await db.platformPost.create({
  data: {
    authorId: f.memberA.id,
    content: "Fictional retained public source " + suffix,
    allowReposts: true,
    replyAudience: "VIEWERS"
  }
});
const privateSource = await db.platformPost.create({
  data: {
    authorId: f.memberA.id,
    content: "Fictional retained church source " + suffix,
    audience: "CHURCH",
    audienceChurchId: f.churchA.id,
    replyAudience: "CHURCH_MEMBERS"
  }
});
const { uploadImage } = await import("../lib/platform/media.ts");
const sharp = (await import("sharp")).default;
await uploadImage(
  db,
  f.memberA.token,
  {
    purpose: "POST_PHOTO",
    targetId: source.id,
    requestKey: randomUUID(),
    alt: "Fictional blue acceptance photo"
  },
  await sharp({
    create: { width: 80, height: 60, channels: 3, background: "blue" }
  })
    .png()
    .toBuffer()
);
const reports = new Map();
async function moderate(id, action, type = "POST") {
  let report = reports.get(id);
  if (!report) {
    const row =
      type === "POST"
        ? await db.platformPost.findUniqueOrThrow({ where: { id } })
        : await db.platformPostComment.findUniqueOrThrow({
            where: { id },
            include: { post: true }
          });
    report = await db.communityReport.create({
      data: {
        reporterId: f.contact.id,
        targetType: type,
        targetId: id,
        targetVersion: row.version,
        contextVersion: type === "COMMENT" ? row.post.version : 0,
        reason: "PRIVACY",
        details: "Fictional selected review"
      }
    });
    reports.set(id, report);
  }
  const read = await api(
    f.operator,
    "/api/platform/community-reports?view=review&id=" + report.id
  );
  assert.equal(read.status, 200, await read.clone().text());
  const view = await read.json();
  const response = await api(f.operator, "/api/platform/community-reports", {
    operation: "moderate",
    mutationId: randomUUID(),
    id: report.id,
    expectedVersion: view.report.version,
    expectedSourceVersion: view.source.version,
    expectedContextVersion: view.source.contextVersion,
    action,
    authorReason: action === "RESTORE" ? "NO_VIOLATION" : "PRIVATE_INFORMATION",
    decisionReason: "Fictional current-source acceptance"
  });
  assert.equal(response.status, 200, await response.clone().text());
}
async function showHome(post) {
  await go(
    "/platform?mode=pages&feed=" +
      (post.audience === "CHURCH" ? "friends" : "latest") +
      "&post=" +
      post.id
  );
  await waitBody(post.content);
  await page.getByText(post.content, { exact: true }).scrollIntoViewIfNeeded();
}
try {
  await signIn(f.coordinator);
  await showHome(source);
  await moderate(source.id, "HIDE");
  await blur();
  await hiddenBody(source.content);
  await focus();
  await page
    .getByText("Original post unavailable.", { exact: true })
    .first()
    .waitFor();
  await hiddenBody(source.content);
  for (const actor of [f.coordinator, null]) {
    const response = await api(
      actor,
      "/api/platform/posts?view=availability&postId=" + source.id
    );
    assert.equal((await response.json()).available, false);
    const html = await (
      await api(actor, "/platform/posts/" + source.id)
    ).text();
    assert.ok(!html.includes(source.content));
  }
  await page.screenshot({
    path: output + "/hidden-home-390.png",
    fullPage: true
  });
  ok(
    "A real moderation decision conceals retained Home content and fresh member/guest reads deny it"
  );
  await moderate(source.id, "RESTORE");
  await focus();
  await waitBody(source.content);
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: source.id } }))
      .audience,
    "PUBLIC"
  );
  ok(
    "Authorized restoration refreshes the original audience without fabricating a wider grant"
  );

  await showHome(privateSource);
  await blur();
  await hiddenBody(privateSource.content);
  await signIn(f.memberB);
  await focus();
  await page
    .getByText("Reconnect to check the original post.", { exact: true })
    .first()
    .waitFor();
  await hiddenBody(privateSource.content);
  assert.equal(
    (
      await (
        await api(
          f.memberB,
          "/api/platform/posts?view=availability&postId=" + privateSource.id
        )
      ).json()
    ).available,
    false
  );
  await signIn(f.coordinator);
  await focus();
  await waitBody(privateSource.content);
  await db.churchConnection.updateMany({
    where: { userId: f.coordinator.id, churchId: f.churchA.id },
    data: { state: "REMOVED" }
  });
  await blur();
  await focus();
  await hiddenBody(privateSource.content);
  assert.equal(
    (
      await (
        await api(
          f.coordinator,
          "/api/platform/posts?view=availability&postId=" + privateSource.id
        )
      ).json()
    ).available,
    false
  );
  ok(
    "Account replacement and removed church membership conceal the old reader and deny fresh source access"
  );

  await showHome(source);
  await page.getByRole("button", { name: /^Comment, 0 comments$/ }).click();
  const discussion = page.getByRole("dialog", {
    name: "Post discussion",
    exact: true
  });
  await discussion
    .getByRole("button", { name: "Write a comment", exact: true })
    .click();
  const composer = page.getByRole("dialog", {
    name: "Write a comment",
    exact: true
  });
  const draft = "Fictional preserved unsent comment " + suffix;
  await composer.getByLabel("Comment text", { exact: true }).fill(draft);
  await composer
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await composer.getByText("Saved privately.", { exact: true }).waitFor();
  await moderate(source.id, "HIDE");
  await blur();
  await focus();
  await composer.waitFor({ state: "hidden" });
  await hiddenBody(source.content);
  await moderate(source.id, "RESTORE");
  await focus();
  await composer.waitFor();
  assert.equal(
    await composer.getByLabel("Comment text", { exact: true }).inputValue(),
    draft
  );
  const stored = await db.privateCommentDraft.findFirstOrThrow({
    where: {
      ownerId: f.coordinator.id,
      postId: source.id,
      content: draft,
      deletedAt: null
    }
  });
  assert.equal(stored.content, draft);
  assert.equal(
    await db.platformPostComment.count({
      where: { postId: source.id, content: draft }
    }),
    0
  );
  await composer.screenshot({ path: output + "/preserved-comment-390.png" });
  await composer
    .getByRole("button", { name: "Close composer", exact: true })
    .click();
  await discussion
    .getByRole("button", { name: "Close discussion", exact: true })
    .click();
  ok(
    "A saved comment survives source concealment and restoration without an unintended public send"
  );

  await showHome(source);
  await page
    .getByRole("button", { name: "Open photo 1 of 1", exact: true })
    .click();
  const viewer = page.getByRole("dialog", {
    name: "Photo viewer",
    exact: true
  });
  await viewer
    .getByRole("img", { name: "Fictional blue acceptance photo", exact: true })
    .waitFor();
  await moderate(source.id, "HIDE");
  await blur();
  await focus();
  await viewer.waitFor({ state: "hidden" });
  const gallery = await api(
    f.coordinator,
    "/api/platform/gallery?postId=" + source.id
  );
  assert.equal(gallery.status, 404);
  await moderate(source.id, "RESTORE");
  await focus();
  await viewer.waitFor();
  await viewer
    .getByRole("img", { name: "Fictional blue acceptance photo", exact: true })
    .waitFor();
  await viewer
    .getByRole("button", { name: "Close photo", exact: true })
    .click();
  ok(
    "The open photo viewer conceals with the source and reloads current permitted media on restoration"
  );

  const commentResponse = await api(f.coordinator, "/api/platform/comments", {
    operation: "create",
    mutationId: randomUUID(),
    postId: source.id,
    content: "Fictional comment counted before restriction " + suffix
  });
  assert.equal(commentResponse.status, 200);
  const comment = await commentResponse.json();
  await showHome(source);
  await page
    .getByRole("button", { name: "Comment, 1 comments", exact: true })
    .waitFor();
  await moderate(comment.id, "HIDE", "COMMENT");
  await blur();
  await focus();
  await page
    .getByRole("button", { name: "Comment, 0 comments", exact: true })
    .waitFor();
  ok(
    "A comment restriction refreshes the retained permitted count even when the post version is unchanged"
  );

  const saved = await api(f.coordinator, "/api/platform/post-workspace", {
    operation: "save-item",
    mutationId: randomUUID(),
    postId: source.id,
    expectedVersion: 0
  });
  assert.equal(saved.status, 200);
  await go("/platform/search?kind=posts&q=" + encodeURIComponent(suffix));
  await page.getByRole("link", { name: source.content, exact: true }).waitFor();
  await moderate(source.id, "HIDE");
  await blur();
  await focus();
  await page
    .getByRole("link", { name: source.content, exact: true })
    .waitFor({ state: "hidden" });
  const savedRead = await api(
    f.coordinator,
    "/api/platform/post-workspace?view=saved"
  );
  const savedText = await savedRead.text();
  assert.ok(!savedText.includes(source.content));
  assert.ok(savedText.includes('"available":false'));
  const preview = await api(null, "/platform/posts/" + source.id);
  assert.ok(!(await preview.text()).includes(source.content));
  await moderate(source.id, "RESTORE");
  ok(
    "Search revalidation, saved-item reads and anonymous share pages cannot resurrect a restricted source"
  );

  await go("/platform/profile/" + f.memberA.username);
  await page
    .getByRole("heading", { name: f.memberA.name, exact: true })
    .waitFor();
  await waitBody(source.content);
  await moderate(source.id, "HIDE");
  await blur();
  await focus();
  await page.getByText(/This member profile or its access changed/).waitFor();
  await page
    .getByRole("heading", { name: f.memberA.name, exact: true })
    .waitFor({ state: "hidden" });
  await hiddenBody(source.content);
  const snapshot = await api(
    f.coordinator,
    "/api/platform/profile?view=member-snapshot&username=" + f.memberA.username
  );
  assert.equal(snapshot.status, 200);
  assert.deepEqual(Object.keys(await snapshot.json()), ["snapshot"]);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Reload current information", exact: true })
    .click();
  await page
    .getByRole("heading", { name: f.memberA.name, exact: true })
    .waitFor();
  await hiddenBody(source.content);
  await page.screenshot({
    path: output + "/current-profile-390.png",
    fullPage: true
  });
  ok(
    "A retained member profile conceals changed counts and content until a deliberate current-snapshot reload"
  );

  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await bounded();
  }
  assert.ok(requests.length > 0);
  assert.ok(
    requests.every(
      (request) => request.ids.length > 0 && request.ids.length <= 30
    )
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      { results, requests, errors, productionWrites: 0, externalSends: 0 },
      null,
      2
    )
  );
  console.log("All retained-reader browser groups passed.");
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.txt",
    String(error) +
      "\n" +
      (await page
        .locator("body")
        .innerText()
        .catch(() => ""))
  );
  throw error;
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
