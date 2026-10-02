import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";

const fixture = process.argv[2];
assert.ok(fixture, "Pass the owned fictional fixture directory");
Object.assign(
  process.env,
  JSON.parse(readFileSync(fixture + "/environment.json", "utf8"))
);
const origin = process.env.ACCOUNT_ORIGIN;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
const { PrismaClient } = await import("@prisma/client");
const { createPortalActor, assertPortalTestDatabase, seedOperatorGrants } =
  await import("../tests/seed-portal.ts");
const { artistCommand } = await import("../lib/platform/artist-commands.ts");
const { ARTIST_POLICY } = await import("../lib/platform/artist-types.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const { chromium } = createRequire(process.env.PLAYWRIGHT_MODULE)("playwright");
const pub = execFileSync("openssl", [
  "x509",
  "-in",
  fixture + "/localhost-cert.pem",
  "-pubkey",
  "-noout"
]);
const der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], {
  input: pub
});
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.ARTIST_BUNDLED_CHROMIUM === "1"
      ? undefined
      : "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: [
    "--ignore-certificate-errors-spki-list=" +
      createHash("sha256").update(der).digest("base64"),
    "--no-proxy-server"
  ]
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }
});
const page = await context.newPage();
context.setDefaultTimeout(20000);
const output = fixture + "/artist-draft-browser-" + Date.now();
mkdirSync(output, { recursive: true });
const errors = [],
  external = [],
  results = [],
  posts = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("dialog", (dialog) => dialog.accept());
page.on("request", (request) => {
  if (
    new URL(request.url()).pathname === "/api/platform/artists" &&
    request.method() === "POST"
  )
    posts.push(request.postData());
});
await context.route("**/*", (route) => {
  if (new URL(route.request().url()).origin === origin) return route.continue();
  external.push(route.request().url());
  return route.abort();
});
const poll = async (fn, expected) => {
  for (let i = 0; i < 150; i++) {
    if ((await fn()) === expected) return;
    await new Promise((done) => setTimeout(done, 100));
  }
  assert.equal(await fn(), expected);
};
const button = (name, scope = page) =>
  scope.getByRole("button", { name, exact: true });
const field = (name, scope = page) =>
  name === "Biography"
    ? scope.getByRole("textbox", { name, exact: true })
    : name === "Permission basis"
      ? scope.getByRole("combobox", { name, exact: true })
      : scope.getByLabel(name, { exact: true });
const profileValues = () =>
  page
    .locator("form")
    .filter({ has: field("Artist name") })
    .locator("input,textarea,select")
    .evaluateAll((elements) =>
      elements.map((element) => ({
        tag: element.tagName,
        type: element.type,
        value: element.value,
        checked: element instanceof HTMLInputElement ? element.checked : null
      }))
    );
const focus = () =>
  page.evaluate(() => window.dispatchEvent(new Event("focus")));
const blur = () => page.evaluate(() => window.dispatchEvent(new Event("blur")));
const signIn = (actor) =>
  context.addCookies([
    {
      name: sessionCookieFixtureName(origin),
      value: actor.token,
      url: origin,
      httpOnly: true,
      secure: true,
      sameSite: "Lax"
    }
  ]);
const go = async (path) => {
  await page.goto(origin + path);
  await page.bringToFront();
  await focus();
};
const ok = (label) => {
  results.push(label);
  console.log("PASS " + label);
};
const rights = { policy: ARTIST_POLICY, confirmed: true, basis: "OWN_WORK" };
const command = (actor, operation, data = {}) =>
  artistCommand(db, actor.token, {
    operation,
    mutationId: randomUUID(),
    ...data
  });
const confirmRights = (scope = page) =>
  scope
    .getByLabel("I reviewed this exact version", { exact: false })
    .first()
    .check();
async function statusAction(label, operation, model, id, scope = page) {
  const before = await model.findUniqueOrThrow({ where: { id } });
  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/platform/artists" &&
      r.request().method() === "POST" &&
      JSON.parse(r.request().postData()).operation === operation
  );
  await button(label, scope).click();
  const accepted = await response;
  assert.equal(accepted.status(), 200, operation + " must succeed");
  const receipt = await accepted.json();
  assert.equal(receipt.version, before.version + 1);
  const after = await model.findUniqueOrThrow({ where: { id } });
  assert.equal(after.version, receipt.version);
  assert.equal(after.state, "UNPUBLISHED");
}
async function refreshAs(actor) {
  await signIn(actor);
  const pathname = new URL(page.url()).pathname;
  let currentOwnerResponse;
  // Buffer the real refresh before delivery: Chromium can discard a streamed
  // RSC response body after React consumes it, even without document navigation.
  const observeRefresh = async (route) => {
    if (
      route.request().headers().rsc !== "1" ||
      new URL(route.request().url()).pathname !== pathname
    )
      return route.fallback();
    const actual = await route.fetch();
    const body = await actual.body();
    currentOwnerResponse = body.toString("utf8");
    await route.fulfill({ response: actual, body });
  };
  await page.route("**/*", observeRefresh);
  const response = page.waitForResponse(
    (r) =>
      r.request().headers().rsc === "1" &&
      new URL(r.url()).pathname === pathname
  );
  await page.evaluate(() => {
    if (typeof window.next?.router?.refresh !== "function")
      throw new Error("Actual Next router required");
    window.next.router.refresh();
  });
  const actual = await response;
  await page.unroute("**/*", observeRefresh);
  assert.equal(actual.status(), 200);
  assert.ok(
    currentOwnerResponse?.includes(actor.id),
    "RSC identifies the current cookie owner"
  );
}
try {
  const owner = await createPortalActor(db, "draftowner"),
    other = await createPortalActor(db, "draftother");
  const reviewer = await createPortalActor(db, "draftreview");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  const fields = {
    name: "Fictional retained artist " + randomUUID(),
    biography: "Saved biography",
    presentation: "TEAM",
    roles: ["Band"],
    genres: ["Acoustic"],
    credits: []
  };
  const created = await command(owner, "create", {
    fields,
    rights,
    policy: ARTIST_POLICY,
    representation: true
  });
  await command(owner, "publish", {
    artistId: created.id,
    expectedVersion: created.version,
    fields,
    rights
  });
  const releaseFields = {
    kind: "ALBUM",
    title: "Saved album",
    description: "Saved release",
    releaseDate: null,
    credits: [],
    links: ["https://open.spotify.com/album/1234567890123456789012"],
    tracks: [
      {
        id: randomUUID(),
        title: "First track",
        durationSeconds: 100,
        links: []
      },
      {
        id: randomUUID(),
        title: "Second track",
        durationSeconds: 120,
        links: []
      }
    ]
  };
  const madeRelease = await command(owner, "create-release", {
    artistId: created.id,
    fields: releaseFields,
    rights
  });
  await command(owner, "publish-release", {
    artistId: created.id,
    releaseId: madeRelease.id,
    expectedVersion: madeRelease.version,
    fields: releaseFields,
    rights
  });
  await signIn(owner);
  await go(`/platform/music/${created.id}/edit`);
  await field("Artist name").waitFor();
  await field("Artist name").fill(" ");
  await confirmRights();
  const rejected = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/platform/artists" &&
      r.request().method() === "POST"
  );
  await button("Save reviewed profile").click();
  assert.equal((await rejected).status(), 400);
  await poll(() => field("Artist name").isEnabled(), true);
  assert.equal(await button("Retry exact change").count(), 0);
  await field("Artist name").fill("UNSENT_PRIVATE_ARTIST_NAME");
  await field("Biography").fill("UNSENT_PRIVATE_BIOGRAPHY");
  await field("Country").selectOption("US");
  await field("Find a town or area").fill("UNSENT_TOWN_QUERY");
  await field("Permission basis").selectOption("CURRENT_PERMISSION");
  await field("Permission expires at (optional)").fill(
    new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 16)
  );
  await button("Add credit").click();
  await field("Credit 1 name").fill("UNSENT_CREDIT_NAME");
  await field("Credit 1 role").fill("UNSENT_CREDIT_ROLE");
  const retainedProfile = await profileValues();
  ok("first real validation rejection keeps artist fields editable");

  const documentId = randomUUID();
  await page.evaluate((id) => {
    window.__artistDraftDocument = id;
  }, documentId);
  const beforeSwitch = posts.length;
  await refreshAs(other);
  await page
    .getByText("This artist workspace belongs to the account that opened it.", {
      exact: false
    })
    .waitFor();
  assert.equal(await field("Artist name").count(), 0);
  assert.ok(
    !(await page.locator("body").innerText()).includes("UNSENT_PRIVATE")
  );
  await refreshAs(owner);
  await field("Artist name").waitFor();
  assert.equal(
    await field("Artist name").inputValue(),
    "UNSENT_PRIVATE_ARTIST_NAME"
  );
  assert.equal(
    await field("Biography").inputValue(),
    "UNSENT_PRIVATE_BIOGRAPHY"
  );
  assert.equal(
    await page.evaluate(() => window.__artistDraftDocument),
    documentId
  );
  assert.equal(posts.length, beforeSwitch);
  assert.deepEqual(await profileValues(), retainedProfile);
  await page.screenshot({
    path: output + "/restored-profile.png",
    fullPage: true
  });
  ok(
    "actual same-document A-to-B-to-A refresh conceals and restores the complete original draft"
  );

  await blur();
  await poll(() => field("Artist name").count(), 0);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  assert.equal(await field("Artist name").count(), 0);
  await focus();
  await field("Artist name").waitFor();
  assert.equal(
    await field("Artist name").inputValue(),
    "UNSENT_PRIVATE_ARTIST_NAME"
  );
  ok("blur removes private controls and passive online cannot resume them");

  for (const [label, operation] of [
    ["Unpublish artist", "unpublish"],
    ["Withdraw profile permission", "withdraw-rights"]
  ]) {
    await statusAction(label, operation, db.artistProfile, created.id);
    await poll(() => field("Artist name").isEnabled(), true);
    assert.equal(
      await field("Artist name").inputValue(),
      "UNSENT_PRIVATE_ARTIST_NAME"
    );
    assert.equal(
      await field("Biography").inputValue(),
      "UNSENT_PRIVATE_BIOGRAPHY"
    );
    assert.equal(JSON.parse(posts.at(-1)).fields, undefined);
    assert.deepEqual(await profileValues(), retainedProfile);
    assert.equal(
      (await db.artistProfile.findUniqueOrThrow({ where: { id: created.id } }))
        .name,
      fields.name
    );
    assert.equal(
      await page
        .getByLabel("I reviewed this exact version", { exact: false })
        .first()
        .isChecked(),
      false
    );
  }
  const editUrl = page.url();
  await page
    .getByRole("link", { name: "Check the public artist page", exact: true })
    .click();
  assert.equal(page.url(), editUrl);
  await page
    .getByText(
      "Save or explicitly discard your profile edits before leaving.",
      { exact: true }
    )
    .waitFor();
  ok(
    "profile unpublish and withdrawal retain unsent metadata, reset confirmation and preserve the leave guard"
  );
  await button("Discard unsent edits").click();
  await poll(() => field("Event page link").isEnabled(), true);

  const eventDraft = origin + "/platform/events/fictional-unsent-event";
  await field("Event page link").fill(eventDraft);
  await field("Member account reference").fill(other.id);
  await field("Edit profile descriptions").check();
  await button("Propose editor permissions").click();
  await button("Review current permissions and keep entries").waitFor();
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const overflow = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    elements: [...document.querySelectorAll("body *")]
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        left: element.getBoundingClientRect().left,
        right: element.getBoundingClientRect().right
      }))
      .filter((element) => element.left < 0 || element.right > innerWidth)
  }));
  assert.ok(overflow.width <= overflow.viewport, JSON.stringify(overflow));
  const reviewBounds = await button(
    "Review current permissions and keep entries"
  ).boundingBox();
  assert.ok(
    reviewBounds && reviewBounds.width <= 320 && reviewBounds.height >= 44
  );
  await page.screenshot({
    path: output + "/permission-review-320.png",
    fullPage: true
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.setViewportSize({ width: 390, height: 844 });
  ok("permission review remains reachable at 320 pixels with enlarged text");
  const beforeReview = posts.length;
  await button("Review current permissions and keep entries").click();
  assert.equal(await field("Event page link").inputValue(), eventDraft);
  assert.equal(await field("Member account reference").inputValue(), "");
  assert.equal(posts.length, beforeReview);
  await field("Event page link").fill("");
  ok(
    "accepted invitation retains the event sibling through deliberate current-permission review without another POST"
  );

  await button("Edit release").click();
  const editor = page.getByRole("region", {
    name: "Release editor",
    exact: true
  });
  await field("Release title", editor).fill("UNSENT_RELEASE_TITLE");
  await field("Track 1 title", editor).fill("UNSENT_FIRST_TRACK");
  await field("Track 2 title", editor).fill("UNSENT_SECOND_TRACK");
  for (const [label, operation] of [
    ["Unpublish release", "unpublish-release"],
    ["Withdraw release permission", "withdraw-release-rights"]
  ]) {
    await statusAction(
      label,
      operation,
      db.artistRelease,
      madeRelease.id,
      editor
    );
    await poll(() => field("Release title", editor).isEnabled(), true);
    assert.equal(
      await field("Release title", editor).inputValue(),
      "UNSENT_RELEASE_TITLE"
    );
    assert.equal(
      await field("Track 1 title", editor).inputValue(),
      "UNSENT_FIRST_TRACK"
    );
    assert.equal(
      await field("Track 2 title", editor).inputValue(),
      "UNSENT_SECOND_TRACK"
    );
    assert.equal(JSON.parse(posts.at(-1)).fields, undefined);
    assert.equal(
      (
        await db.artistRelease.findUniqueOrThrow({
          where: { id: madeRelease.id }
        })
      ).title,
      releaseFields.title
    );
  }
  ok(
    "release unpublish and withdrawal retain unsent metadata and ordered tracks without saving them"
  );

  await go("/platform/music/new");
  const newName = "Fictional delayed artist " + randomUUID();
  await field("Artist name").fill(newName);
  await field("Band").check();
  await page.getByLabel("I am this artist", { exact: false }).check();
  await confirmRights();
  let acceptedId;
  await page.route(
    "**/api/platform/artists",
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      acceptedId = (await response.json()).id;
      await blur();
      await route.fulfill({ response });
    },
    { times: 1 }
  );
  const beforeCreate = posts.length;
  await button("Create private draft").click();
  await poll(() => typeof acceptedId, "string");
  await button("Continue after saved artist change").waitFor();
  assert.ok(page.url().endsWith("/platform/music/new"));
  assert.equal(await field("Artist name").count(), 0);
  await focus();
  await field("Artist name").waitFor();
  assert.equal(await field("Artist name").inputValue(), newName);
  await button("Continue after saved artist change").click();
  await poll(
    () => page.url().endsWith(`/platform/music/${acceptedId}/edit`),
    true
  );
  await field("Artist name").waitFor();
  assert.equal(await field("Artist name").inputValue(), newName);
  assert.equal(posts.length, beforeCreate + 1);
  assert.equal(
    await db.artistProfile.count({
      where: { stewardId: owner.id, name: newName }
    }),
    1
  );
  ok(
    "accepted create stays concealed until deliberate original-owner continuation and never sends a second POST"
  );
  await page.screenshot({
    path: output + "/accepted-create.png",
    fullPage: true
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      {
        passed: results.length,
        results,
        errors,
        external,
        productionWrites: 0
      },
      null,
      2
    )
  );
  console.log(JSON.stringify({ passed: results.length, errors, external }));
} catch (error) {
  console.error("Artist draft browser failure:", String(error));
  console.error(
    await page
      .locator("body")
      .innerText()
      .catch(() => "No body available")
  );
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
