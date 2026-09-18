import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the existing isolated Exchange preview directory");
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.match(config.localOrigin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.localOrigin,
  NEXT_PUBLIC_SITE_URL: config.localOrigin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + fixtureDir + "/sink",
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: "",
  PRIVILEGED_MFA_MODE: "enroll",
  COMMUNITY_REPORTS_ENABLED: "true",
  BLOB_READ_WRITE_TOKEN: "",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  MEDIA_STORAGE_MODE: "local-test",
  RETENTION_TEST_DIR: process.cwd() + "/" + fixtureDir + "/retention",
  MEDIA_TEST_DIR: process.cwd() + "/" + fixtureDir + "/images"
});
const { PrismaClient } = await import("@prisma/client");
const { createPortalActor, assertPortalTestDatabase } =
  await import("../tests/seed-portal.ts");
const { calendarCommand } =
  await import("../lib/platform/calendar-commands.ts");
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
      createHash("sha256").update(der).digest("base64"),
    "--host-resolver-rules=MAP exchange-fixture.example.test 127.0.0.1",
    "--no-proxy-server"
  ]
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true
});
await context.route("**/*", (route) =>
  new URL(route.request().url()).hostname === "127.0.0.1"
    ? route.continue()
    : route.abort()
);
context.setDefaultTimeout(15000);
const page = await context.newPage(),
  errors = [],
  results = [],
  output = fixtureDir + "/groups-browser-" + Date.now();
mkdirSync(output, { recursive: true });
await page.addInitScript(() => {
  window.__groupHistory = [];
  const record = (kind) =>
    window.__groupHistory.push({
      kind,
      at: Date.now(),
      state: history.state,
      path: location.pathname
    });
  for (const name of ["back", "pushState", "replaceState"]) {
    const original = history[name].bind(history);
    history[name] = (...args) => {
      record(name);
      return original(...args);
    };
  }
  window.addEventListener("popstate", () => record("popstate capture"), true);
  window.addEventListener("popstate", () => {
    record("popstate bubble");
    requestAnimationFrame(() => record("popstate frame"));
    setTimeout(() => record("popstate timeout"), 0);
  });
});
page.on("pageerror", (e) =>
  errors.push({ path: new URL(page.url()).pathname, message: e.message })
);
page.on("dialog", (dialog) => dialog.accept());
const requests = [];
page.on("request", (r) => {
  const u = new URL(r.url());
  if (u.pathname.includes("groups"))
    requests.push({
      kind: "request",
      method: r.method(),
      path: u.pathname,
      query: u.search,
      at: Date.now()
    });
});
page.on("requestfailed", (r) => {
  const u = new URL(r.url());
  requests.push({
    kind: "failed",
    path: u.pathname,
    error: r.failure(),
    at: Date.now()
  });
});
page.on("response", async (r) => {
  const u = new URL(r.url());
  if (u.pathname.includes("groups")) {
    const entry = {
      kind: "response",
      status: r.status(),
      path: u.pathname,
      query: u.search,
      at: Date.now()
    };
    requests.push(entry);
    if (u.searchParams.has("_rsc"))
      try {
        writeFileSync(output + "/rsc-" + Date.now() + ".txt", await r.text());
      } catch {}
  }
});
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const go = async (path) => {
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
  await page.locator("main").first().waitFor({ state: "visible" });
  await page.waitForFunction(
    () => document.querySelectorAll("main").length === 1
  );
  return response;
};
const signIn = async (actor) => {
  await context.clearCookies();
  if (actor)
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
const bounded = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal page overflow"
  );
const waitUntil = async (work) => {
  for (let i = 0; i < 80; i++) {
    if (await work()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Expected saved state was not observed");
};
try {
  const owner = await createPortalActor(db, "groupbrowser"),
    member = await createPortalActor(db, "groupjoin"),
    stranger = await createPortalActor(db, "groupoutsider");
  await db.socialPreferences.createMany({
    data: [owner, member].map((u) => ({
      ownerId: u.id,
      contactRequests: "EVERYONE"
    }))
  });
  const slug = "group-browser-" + randomUUID(),
    marker = "Fictional adult group " + randomUUID(),
    base = "/platform/groups/" + slug;
  const form = (name) => page.getByRole("form", { name, exact: true });
  const group = () => db.gatherGroup.findUnique({ where: { slug } });
  const membership = async () =>
    db.gatherGroupMembership.findUnique({
      where: {
        groupId_userId: { groupId: (await group()).id, userId: member.id }
      }
    });
  writeFileSync(
    fixtureDir + "/latest-group-actors.json",
    JSON.stringify({ owner, member, stranger, slug, marker }),
    { mode: 0o600 }
  );
  await go("/platform/groups/mine");
  await page
    .locator("main")
    .getByRole("link", { name: "Sign in", exact: true })
    .click();
  await page.waitForURL((u) => u.pathname === "/platform/login");
  assert.equal(
    new URL(page.url()).searchParams.get("next"),
    "/platform/groups/mine"
  );
  ok(
    "Guest group entry keeps its intended sign-in destination without private content"
  );
  await signIn(owner);
  await go("/platform/groups/new");
  const identity = form("Create group");
  for (const [label, value] of [
    ["Group name", marker],
    ["Group address", slug],
    [
      "Purpose",
      "A fictional adult music group for isolated browser acceptance."
    ],
    [
      "Group rules",
      "Respect every member and keep private discussion within this group."
    ],
    ["General area", "Fictional town"]
  ])
    await identity.getByLabel(new RegExp("^" + label)).fill(value);
  await identity
    .getByLabel("I have read and accept the current group rules", {
      exact: true
    })
    .check();
  await identity
    .getByLabel(/I agree that my name and profile identify/)
    .check();
  await identity
    .getByRole("button", { name: "Create group", exact: true })
    .click();
  await waitUntil(async () => !!(await group()));
  await page.waitForURL((u) => u.pathname === base);
  await page.getByRole("heading", { name: marker, exact: true }).waitFor();
  await bounded();
  ok(
    "An adult creates a listed approval group with explicit rules and named-leader consent"
  );
  await signIn(null);
  await go(base);
  assert.ok((await page.locator("main").innerText()).includes(marker));
  assert.ok(
    !(await page.locator("main").innerText()).includes(member.username)
  );
  assert.equal(
    (
      await context.request.get(
        config.origin + "/api/platform/groups?view=members&slug=" + slug
      )
    ).status(),
    404
  );
  ok(
    "The public About page shows identity and rules while the member roster remains private"
  );
  await signIn(member);
  await go(base);
  const join = form("Request membership");
  assert.equal(await join.getByLabel(/Share my name/).isChecked(), false);
  await join
    .getByLabel("I have read and accept the current group rules", {
      exact: true
    })
    .check();
  const joinBodies = [];
  let lostJoin = false;
  const loseJoin = async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON()?.operation === "join"
    ) {
      joinBodies.push(route.request().postData());
      if (!lostJoin) {
        lostJoin = true;
        const saved = await route.fetch();
        assert.ok([200, 202].includes(saved.status()));
        await route.abort("failed");
        return;
      }
    }
    await route.continue();
  };
  await page.route("**/api/platform/groups", loseJoin);
  await join
    .getByRole("button", { name: "Request membership", exact: true })
    .click();
  await waitUntil(async () => (await membership())?.state === "PENDING");
  await join
    .getByRole("button", { name: "Confirm original save", exact: true })
    .click();
  await page.getByText("Your membership: pending.", { exact: true }).waitFor();
  await page.unroute("**/api/platform/groups", loseJoin);
  assert.equal(joinBodies.length, 2);
  assert.equal(joinBodies[0], joinBodies[1]);
  assert.equal((await membership()).version, 1);
  ok(
    "A lost join reply retains its exact request and retry creates one membership choice"
  );
  assert.equal(
    (
      await context.request.get(
        config.origin + "/api/platform/groups?view=discussion&slug=" + slug
      )
    ).status(),
    404
  );
  ok(
    "Membership is a deliberate request, private roster sharing starts off, and pending members cannot read discussions"
  );
  await signIn(owner);
  await go(base + "/manage?state=PENDING");
  const approve = form("Approve membership request");
  await approve.getByLabel(/^Reason/).fill("Reviewed fictional adult request");
  assert.equal(
    await form("Save group details")
      .getByRole("button", { name: "Save group details", exact: true })
      .isDisabled(),
    true
  );
  await approve
    .getByRole("button", { name: "Approve membership request", exact: true })
    .click();
  await waitUntil(async () => (await membership())?.state === "ACTIVE");
  ok(
    "A current leader approves the request and editing one section protects it from sibling saves"
  );
  await signIn(member);
  await go(base + "/discussion");
  await page
    .getByRole("button", {
      name: "Start a private group discussion",
      exact: true
    })
    .click();
  const composer = form("Publish post");
  await composer.getByLabel(/^Thread type/).selectOption("QUESTION");
  await composer.getByLabel(/^Group category/).selectOption("PLANNING");
  await composer
    .getByLabel("Post content", { exact: true })
    .fill("Private fictional question: which rehearsal time works?");
  const button = await composer.getByRole("button").allTextContents();
  writeFileSync(output + "/composer-buttons.json", JSON.stringify(button));
  await composer.getByRole("button", { name: "Post", exact: true }).click();
  await waitUntil(
    async () =>
      !!(await db.platformPost.findFirst({
        where: { groupId: (await group()).id, authorId: member.id }
      }))
  );
  const post = await db.platformPost.findFirstOrThrow({
    where: { groupId: (await group()).id, authorId: member.id }
  });
  assert.equal(post.audience, "GROUP");
  assert.equal(post.groupCategory, "PLANNING");
  assert.equal(post.groupThreadKind, "QUESTION");
  await go("/platform/posts/" + post.id);
  await page
    .getByText("Private fictional question: which rehearsal time works?", {
      exact: true
    })
    .first()
    .waitFor();
  await bounded();
  await page.screenshot({
    path: output + "/private-question-phone.png",
    fullPage: true
  });
  ok(
    "A member publishes a question into its immutable private group with a category and a phone-width discussion view"
  );
  await page.getByText("Add a poll", { exact: true }).click();
  const pollForm = page
    .locator("form")
    .filter({
      has: page.getByRole("button", { name: "Save poll", exact: true })
    });
  await pollForm
    .getByLabel("Poll question", { exact: true })
    .fill("Which fictional rehearsal day?");
  await pollForm
    .getByLabel("Options, one per line", { exact: true })
    .fill("Monday\nTuesday");
  await pollForm
    .getByLabel("Closing date and time", { exact: true })
    .fill(new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 16));
  await pollForm.getByLabel("Closing time zone", { exact: true }).fill("UTC");
  await pollForm
    .getByRole("button", { name: "Save poll", exact: true })
    .click();
  await waitUntil(
    async () => !!(await db.postPoll.findUnique({ where: { postId: post.id } }))
  );
  await page
    .getByRole("button", { name: "Submit vote", exact: true })
    .waitFor();
  const vote = page
    .locator("form")
    .filter({
      has: page.getByRole("button", { name: "Submit vote", exact: true })
    });
  await vote.getByLabel(/^Monday/).check();
  await vote.getByRole("button", { name: "Submit vote", exact: true }).click();
  await waitUntil(
    async () =>
      !!(await db.postPollBallot.findFirst({
        where: { userId: member.id, poll: { postId: post.id } }
      }))
  );
  await page
    .getByRole("button", { name: "Save changed vote", exact: true })
    .waitFor();
  await page.waitForFunction(() => !history.state?.gcPhotoWork);
  ok(
    "A group question uses the existing poll editor and private canonical ballot controls"
  );
  await signIn(owner);
  await go("/platform/posts/" + post.id);
  await page
    .getByRole("button", { name: "Write a comment", exact: true })
    .click();
  const comment = form("Write a comment");
  await comment
    .getByLabel("Comment text", { exact: true })
    .fill("A helpful fictional answer for our rehearsal plan.");
  await comment.getByRole("button", { name: "Reply", exact: true }).click();
  await waitUntil(
    async () =>
      !!(await db.platformPostComment.findFirst({
        where: { postId: post.id, authorId: owner.id }
      }))
  );
  const answer = await db.platformPostComment.findFirstOrThrow({
    where: { postId: post.id, authorId: owner.id }
  });
  await signIn(member);
  await go("/platform/posts/" + post.id);
  const select = form("Select a helpful answer");
  await select
    .getByLabel(/^Link to the answer comment/)
    .fill(
      config.origin + "/platform/posts/" + post.id + "?comment=" + answer.id
    );
  const answerBodies = [];
  let lostAnswer = false;
  const loseAnswer = async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON()?.operation === "select-answer"
    ) {
      answerBodies.push(route.request().postData());
      if (!lostAnswer) {
        lostAnswer = true;
        await route.fetch();
        await route.abort("failed");
        return;
      }
    }
    await route.continue();
  };
  await page.route("**/api/platform/groups", loseAnswer);
  await select
    .getByRole("button", { name: "Select a helpful answer", exact: true })
    .click();
  await waitUntil(
    async () =>
      (await db.platformPost.findUnique({ where: { id: post.id } }))
        .selectedAnswerId === answer.id
  );
  await page
    .getByRole("button", { name: "Confirm original save", exact: true })
    .waitFor();
  const changeVote = page
    .locator("form")
    .filter({
      has: page.getByRole("button", { name: "Save changed vote", exact: true })
    });
  await changeVote.getByLabel(/^Tuesday/).check();
  await changeVote
    .getByRole("button", { name: "Save changed vote", exact: true })
    .click();
  await waitUntil(async () => {
    const ballot = await db.postPollBallot.findFirst({
      where: { userId: member.id, poll: { postId: post.id } }
    });
    const option = await db.postPollOption.findFirst({
      where: { pollId: ballot.pollId, label: "Tuesday" }
    });
    return ballot.optionIds.includes(option.id);
  });
  await page
    .getByRole("heading", { name: "Selected answer", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: /^Confirm original (save|request)$/ })
    .first()
    .waitFor();
  await page
    .getByRole("button", { name: /^Confirm original (save|request)$/ })
    .first()
    .click();
  await waitUntil(async () => answerBodies.length === 2);
  await page.unroute("**/api/platform/groups", loseAnswer);
  await page
    .getByRole("button", { name: "Clear selected answer", exact: true })
    .waitFor();
  assert.equal(answerBodies.length, 2);
  assert.equal(answerBodies[0], answerBodies[1]);
  ok(
    "A sibling poll refresh preserves a lost answer-save request until its exact retry is confirmed"
  );
  await page
    .getByRole("heading", { name: "Selected answer", exact: true })
    .waitFor();
  ok(
    "A canonical comment becomes the question author's selected answer without copying the reply"
  );
  await signIn(owner);
  await go("/platform/posts/" + post.id);
  const pin = form("Pin group thread");
  await pin.getByLabel(/^Reason/).fill("Useful fictional planning thread");
  await pin
    .getByRole("button", { name: "Pin group thread", exact: true })
    .click();
  await waitUntil(
    async () =>
      !!(await db.platformPost.findUnique({ where: { id: post.id } }))
        .groupPinnedAt
  );
  await page
    .getByRole("button", { name: "Unpin group thread", exact: true })
    .waitFor();
  await go(base + "/discussion");
  await page
    .getByRole("heading", { name: "Pinned threads", exact: true })
    .waitFor();
  ok(
    "Current group leadership pins the canonical thread and the group discussion page shows it"
  );
  const replies = Array.from({ length: 10 }, () => randomUUID());
  await db.platformPostComment.createMany({
    data: replies.map((id, i) => ({
      id,
      postId: post.id,
      authorId: owner.id,
      groupId: post.groupId,
      content:
        "Fictional visible reply " +
        i +
        ". " +
        "Keep this discussion private and consider the plan together. ".repeat(
          10
        ),
      createdAt: new Date(Date.now() + i)
    }))
  });
  await signIn(member);
  await go("/platform/posts/" + post.id);
  const unread = async () => {
    const response = await context.request.get(
      config.origin + "/api/platform/groups?view=discussion&slug=" + slug,
      { headers: { "x-expected-account": member.id } }
    );
    assert.equal(response.status(), 200);
    return (await response.json()).discussion.threads.find(
      (t) => t.post.id === post.id
    );
  };
  await page
    .locator('[data-group-comment-content="' + replies[0] + '"]')
    .scrollIntoViewIfNeeded();
  await waitUntil(async () => (await unread()).unreadReplies < 11);
  const readState = await unread();
  assert.ok(readState.unreadReplies > 0);
  assert.equal(readState.following, false);
  ok(
    "On-screen read tracking leaves below-screen replies unread and never turns on following"
  );
  await signIn(owner);
  const calendar = await calendarCommand(db, owner.token, {
    operation: "create-calendar",
    requestKey: randomUUID(),
    name: "Fictional group event calendar",
    timeZone: "UTC"
  });
  const event = await calendarCommand(db, owner.token, {
    operation: "create-event",
    calendarId: calendar.id,
    requestKey: randomUUID(),
    expectedVersion: 1,
    title: "Fictional original rehearsal event",
    allDay: false,
    startLocal: "2026-11-20T10:00",
    endLocal: "2026-11-20T11:00",
    timeZone: "UTC",
    weeklyUntil: null
  });
  const occurrence = await db.calendarOccurrence.findFirstOrThrow({
    where: { eventId: event.id }
  });
  await go(base + "/manage");
  const eventLookup = form("Check existing event link");
  await eventLookup
    .getByLabel("Existing event page link", { exact: true })
    .fill(config.origin + "/platform/events/" + occurrence.id);
  await eventLookup
    .getByRole("button", { name: "Check original event", exact: true })
    .click();
  const eventLink = form("Link event to group");
  await eventLink.getByLabel(/I understand the original event/).check();
  await eventLink
    .getByRole("button", { name: "Link event to group", exact: true })
    .click();
  await waitUntil(
    async () =>
      !!(await db.gatherGroupEventLink.findFirst({
        where: {
          groupId: post.groupId,
          occurrenceId: occurrence.id,
          active: true
        }
      }))
  );
  await go(base + "/events");
  await page
    .getByRole("link", {
      name: "Fictional original rehearsal event",
      exact: true
    })
    .waitFor();
  await signIn(member);
  await go(base + "/events");
  assert.ok(
    !(await page.locator("main").innerText()).includes(
      "Fictional original rehearsal event"
    )
  );
  const church = await db.church.create({
    data: {
      slug: "gather-calendar-" + randomUUID(),
      name: "Fictional calendar sharing church",
      summary: "Isolated"
    }
  });
  await db.churchConnection.createMany({
    data: [owner, member].map((u) => ({
      userId: u.id,
      churchId: church.id,
      state: "APPROVED",
      approvedSince: new Date()
    }))
  });
  await calendarCommand(db, owner.token, {
    operation: "share-calendar",
    calendarId: calendar.id,
    churchId: church.id,
    expectedVersion: 0,
    level: "DETAILS",
    confirmed: true
  });
  await go(base + "/events");
  await page
    .getByRole("link", {
      name: "Fictional original rehearsal event",
      exact: true
    })
    .waitFor();
  assert.equal(
    await db.calendarOccurrence.count({ where: { eventId: event.id } }),
    1
  );
  assert.equal(
    await db.calendarResponse.count({ where: { occurrenceId: occurrence.id } }),
    0
  );
  ok(
    "A leader links the original event; members see it only with its independent calendar permission and no duplicated attendance"
  );
  await signIn(stranger);
  const forbidden = await context.request.get(
    config.origin + "/api/platform/posts/" + post.id
  );
  assert.ok([403, 404].includes(forbidden.status()));
  await go(base + "/discussion");
  assert.ok(!(await page.locator("main").innerText()).includes(post.content));
  ok(
    "A different signed-in adult cannot fetch or render the private group post"
  );
  await signIn(member);
  await go("/platform/posts/" + post.id);
  const other = await browser.newContext({
    viewport: { width: 390, height: 844 }
  });
  await other.route("**/*", (r) =>
    new URL(r.request().url()).hostname === "127.0.0.1"
      ? r.continue()
      : r.abort()
  );
  await other.addCookies([
    {
      name: "church_platform_session",
      value: owner.token,
      url: config.origin,
      httpOnly: true,
      sameSite: "Lax",
      secure: true
    }
  ]);
  const manager = await other.newPage();
  await manager.goto(config.origin + base + "/manage?state=ACTIVE");
  const removal = manager.getByRole("form", {
    name: "Remove membership",
    exact: true
  });
  await removal
    .getByLabel(/^Reason/)
    .fill("Fictional retained-page revocation check");
  await removal
    .getByRole("button", { name: "Remove membership", exact: true })
    .click();
  await waitUntil(async () => (await membership())?.state === "REMOVED");
  await other.close();
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByText(post.content, { exact: true })
    .first()
    .waitFor({ state: "hidden" });
  assert.equal(
    (
      await context.request.get(
        config.origin + "/api/platform/groups?view=discussion&slug=" + slug
      )
    ).status(),
    404
  );
  ok(
    "Removing membership through a leader's form conceals an already-open private discussion"
  );
  await signIn(owner);
  await go("/platform/groups/new");
  const privateSlug = "private-" + randomUUID(),
    privateName = "Fictional private cohort " + randomUUID();
  const privateForm = form("Create group");
  for (const [label, value] of [
    ["Group name", privateName],
    ["Group address", privateSlug],
    ["Purpose", "An isolated named adult cohort."],
    [
      "Group rules",
      "Accept only your own named invitation and respect private members."
    ]
  ])
    await privateForm.getByLabel(new RegExp("^" + label)).fill(value);
  await privateForm.getByLabel(/^Group type/).selectOption("PRIVATE_COHORT");
  await privateForm.getByLabel(/^Discovery/).selectOption("UNLISTED");
  await privateForm.getByLabel(/^Joining/).selectOption("INVITE_ONLY");
  await privateForm
    .getByLabel("I have read and accept the current group rules", {
      exact: true
    })
    .check();
  await privateForm
    .getByLabel(/I agree that my name and profile identify/)
    .check();
  await privateForm
    .getByRole("button", { name: "Create group", exact: true })
    .click();
  await page.waitForURL(
    (u) => u.pathname === "/platform/groups/" + privateSlug
  );
  const privateGroup = await db.gatherGroup.findUniqueOrThrow({
    where: { slug: privateSlug }
  });
  await go("/platform/groups/" + privateSlug + "/manage");
  const invite = form("Find named invitation recipient");
  await invite
    .getByLabel("Exact username", { exact: true })
    .fill(member.username);
  await invite
    .getByRole("button", { name: "Check named recipient", exact: true })
    .click();
  await form("Send named group invitation")
    .getByRole("button", { name: "Send named group invitation", exact: true })
    .click();
  await waitUntil(
    async () =>
      !!(await db.gatherGroupMembership.findFirst({
        where: { groupId: privateGroup.id, userId: member.id, state: "INVITED" }
      }))
  );
  await signIn(stranger);
  assert.equal(
    (
      await context.request.get(
        config.origin + "/api/platform/groups?view=about&slug=" + privateSlug
      )
    ).status(),
    404
  );
  await signIn(member);
  await go("/platform/groups/invitations");
  await page.getByRole("link", { name: privateName, exact: true }).click();
  const accept = form("Accept named invitation");
  await accept
    .getByLabel("I have read and accept the current group rules", {
      exact: true
    })
    .check();
  await accept
    .getByRole("button", { name: "Accept named invitation", exact: true })
    .click();
  await waitUntil(
    async () =>
      !!(await db.gatherGroupMembership.findFirst({
        where: { groupId: privateGroup.id, userId: member.id, state: "ACTIVE" }
      }))
  );
  await page.getByText("Your membership: active.", { exact: true }).waitFor();
  await bounded();
  await page.screenshot({
    path: output + "/private-membership-phone.png",
    fullPage: true
  });
  ok(
    "An unlisted cohort uses a current named invitation, rejects forwarding and requires deliberate rules acceptance"
  );
  const privateBase = "/platform/groups/" + privateSlug;
  await signIn(owner);
  await go(privateBase + "/members");
  assert.equal(
    await page.getByRole("heading", { name: member.name, exact: true }).count(),
    0
  );
  await signIn(member);
  await go(privateBase);
  const roster = form("Save roster choice");
  await roster
    .getByLabel("Show my name and profile on the member roster", {
      exact: true
    })
    .check();
  await roster
    .getByRole("button", { name: "Save roster choice", exact: true })
    .click();
  await waitUntil(
    async () =>
      (
        await db.gatherGroupMembership.findFirst({
          where: { groupId: privateGroup.id, userId: member.id }
        })
      ).rosterVisible
  );
  await page.waitForFunction(() => !history.state?.gcPhotoWork);
  await signIn(owner);
  await go(privateBase + "/members");
  await page.getByRole("heading", { name: member.name, exact: true }).waitFor();
  ok(
    "Ordinary member roster identity appears only after that member deliberately opts in"
  );
  const offer = async (role) => {
    await go(privateBase + "/manage?state=ACTIVE");
    const f = form("Offer named responsibility");
    await f.getByLabel(/^Responsibility/).selectOption(role);
    await f.getByLabel(/^Reason/).fill("Fictional named responsibility review");
    await f
      .getByRole("button", { name: "Offer named responsibility", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Cancel leadership offer", exact: true })
      .waitFor();
  };
  await offer("LEADER");
  const privateMember = () =>
    db.gatherGroupMembership.findFirstOrThrow({
      where: { groupId: privateGroup.id, userId: member.id }
    });
  assert.equal((await privateMember()).leader, false);
  await signIn(member);
  await go(privateBase);
  const acceptRole = async (role) => {
    const f = form("Accept " + role + " responsibility");
    await f
      .getByLabel("I have read and accept the current group rules", {
        exact: true
      })
      .check();
    await f.getByLabel(/I agree that my name and profile identify/).check();
    await f
      .getByRole("button", {
        name: "Accept " + role + " responsibility",
        exact: true
      })
      .click();
    await page.getByRole("link", { name: "Manage", exact: true }).waitFor();
    await page.waitForFunction(() => !history.state?.gcPhotoWork);
  };
  await acceptRole("leader");
  assert.equal((await privateMember()).leader, true);
  await signIn(owner);
  await go(privateBase + "/manage?state=ACTIVE");
  const revoke = form("Revoke group leadership");
  await revoke
    .getByLabel(/^Reason/)
    .fill("Fictional ending of delegated responsibility");
  await revoke
    .getByRole("button", { name: "Revoke group leadership", exact: true })
    .click();
  await waitUntil(async () => (await privateMember()).leader === false);
  await page
    .getByRole("button", { name: "Revoke group leadership", exact: true })
    .waitFor({ state: "hidden" });
  await offer("OWNER");
  assert.equal(
    (await db.gatherGroup.findUniqueOrThrow({ where: { id: privateGroup.id } }))
      .ownerId,
    owner.id
  );
  await signIn(member);
  await go(privateBase);
  await acceptRole("owner");
  assert.equal(
    (await db.gatherGroup.findUniqueOrThrow({ where: { id: privateGroup.id } }))
      .ownerId,
    member.id
  );
  assert.equal(
    await db.gatherGroupMembership.count({
      where: {
        groupId: privateGroup.id,
        userId: member.id,
        leader: true,
        state: "ACTIVE"
      }
    }),
    1
  );
  ok(
    "Leadership requires named acceptance, can be revoked, and accepted ownership transfer keeps exactly one accountable owner"
  );
  await go(privateBase + "/discussion");
  await page
    .getByRole("button", {
      name: "Start a private group discussion",
      exact: true
    })
    .click();
  await form("Publish post")
    .getByLabel("Post content", { exact: true })
    .fill("Fictional retained cohort history after archiving.");
  await form("Publish post")
    .getByRole("button", { name: "Post", exact: true })
    .click();
  await page
    .getByText("Fictional retained cohort history after archiving.", {
      exact: true
    })
    .first()
    .waitFor();
  await page.getByText("Post published once.", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Close composer", exact: true })
    .click();
  await page.waitForFunction(() => !history.state?.gcPhotoWork);
  await go(privateBase + "/manage");
  const archive = form("Archive group");
  await archive
    .getByLabel(/^Reason/)
    .fill("Fictional cohort has finished its plan");
  await archive.getByLabel("I confirm this change", { exact: true }).check();
  await archive
    .getByRole("button", { name: "Archive group", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reopen group", exact: true })
    .waitFor();
  await go(privateBase + "/discussion");
  await page
    .getByText("Fictional retained cohort history after archiving.", {
      exact: true
    })
    .first()
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", {
        name: "Start a private group discussion",
        exact: true
      })
      .count(),
    0
  );
  await bounded();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({
    path: output + "/archived-group-dark-phone.png",
    fullPage: true
  });
  await go(privateBase + "/manage");
  const reopen = form("Reopen group");
  await reopen
    .getByLabel(/^Reason/)
    .fill("Fictional approved next cohort plan");
  await reopen.getByLabel("I confirm this change", { exact: true }).check();
  await reopen
    .getByRole("button", { name: "Reopen group", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Archive group", exact: true })
    .waitFor();
  ok(
    "Archiving retains permitted discussion history while disabling publishing; the current owner can explicitly reopen it"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/receipt.json",
    JSON.stringify({ results, errors, at: new Date().toISOString() })
  );
  console.log("OUTPUT " + output);
} catch (error) {
  writeFileSync(output + "/requests.json", JSON.stringify(requests));
  writeFileSync(
    output + "/history.json",
    JSON.stringify(await page.evaluate(() => window.__groupHistory))
  );
  writeFileSync(
    output + "/failure.json",
    JSON.stringify({ message: String(error), url: page.url(), errors })
  );
  writeFileSync(output + "/failure.html", await page.content());
  writeFileSync(
    output + "/failure.txt",
    await page.locator("body").innerText()
  );
  await page.screenshot({ path: output + "/failure.png", fullPage: true });
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
