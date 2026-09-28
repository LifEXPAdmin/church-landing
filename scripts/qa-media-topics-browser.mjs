import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const fixture = process.argv[2];
assert.ok(fixture, "Pass the owned isolated fixture directory");
Object.assign(
  process.env,
  JSON.parse(readFileSync(fixture + "/environment.json", "utf8"))
);
const origin = process.env.ACCOUNT_ORIGIN;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
const { PrismaClient } = await import("@prisma/client");
const { createPortalActor, assertPortalTestDatabase } =
  await import("../tests/seed-portal.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ??
    `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`
)("playwright");
const publicKey = execFileSync("openssl", [
  "x509",
  "-in",
  fixture + "/localhost-cert.pem",
  "-pubkey",
  "-noout"
]);
const der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], {
  input: publicKey
});
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: [
    "--ignore-certificate-errors-spki-list=" +
      createHash("sha256").update(der).digest("base64"),
    "--no-proxy-server"
  ]
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }
});
context.setDefaultTimeout(15000);
await context.route("**/*", (route) =>
  new URL(route.request().url()).hostname === "127.0.0.1"
    ? route.continue()
    : route.abort()
);
const page = await context.newPage(),
  errors = [],
  results = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
const output = fixture + "/browser-" + Date.now();
mkdirSync(output, { recursive: true });
const ok = (label) => {
  results.push(label);
  console.log("PASS " + label);
};
const wait = async (fn) => {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Expected saved state was not observed");
};
const go = async (path) => {
  await page.goto(origin + path);
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
};
const actor = await createPortalActor(db, "topicbrowser");
await context.addCookies([
  {
    name: sessionCookieFixtureName(origin),
    value: actor.token,
    url: origin,
    httpOnly: true,
    secure: true,
    sameSite: "Lax"
  }
]);
let providerAttempts = 0;
await context.unroute("**/*");
await context.route("**/*", (route) => {
  if (new URL(route.request().url()).hostname === "127.0.0.1")
    return route.continue();
  providerAttempts++;
  return route.abort();
});
const { mediaCatalogCommand: command } =
  await import("../lib/platform/media-catalog-commands.ts");
const { mediaFields } = await import("../lib/platform/media-catalog-input.ts");
const { MEDIA_POLICY } =
  await import("../lib/platform/media-catalog-options.ts");
const suffix = randomUUID(),
  title = "Fictional topic recording " + suffix;
const tag = "Hope & prayer? #" + suffix.slice(0, 8);
const reviewer = (fields) => ({
  fields,
  acknowledgment: {
    policy: MEDIA_POLICY,
    sourceUrl: fields.sourceUrl,
    audience: fields.audience,
    accepted: true
  },
  rights: {
    basis: "OWN",
    reviewed: true,
    publicRecording: true,
    textRights: true
  }
});
const create = async (patch, publish = true) => {
  const fields = mediaFields({
    title: "Fictional companion " + suffix,
    description: "Editorial fixture only",
    format: "SERMON",
    presentation: "VIDEO",
    audience: "PUBLIC",
    details: { preachedOn: null },
    sourceUrl: "https://youtu.be/abcdefghijk",
    ...patch
  });
  const r = await command(db, actor.token, {
    operation: "create",
    mutationId: randomUUID(),
    ownerChurchId: null,
    ...reviewer(fields)
  });
  return publish
    ? await command(db, actor.token, {
        operation: "publish",
        mutationId: randomUUID(),
        itemId: r.id,
        expectedVersion: r.version,
        ...reviewer(fields)
      })
    : r;
};
try {
  await db.platformAuthLimit.deleteMany();
  await go("/platform/media/new");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Publisher selected labels, no listener classification.");
  await page.getByLabel("Format", { exact: true }).selectOption("SERMON");
  await page
    .getByLabel("Audio or video", { exact: true })
    .selectOption("VIDEO");
  await page
    .getByLabel("Catalog audience", { exact: true })
    .selectOption("PUBLIC");
  await page
    .getByLabel("Public source URL", { exact: true })
    .fill("https://youtu.be/abcdefghijk");
  await page.getByText("Optional catalog details", { exact: true }).click();
  await page.getByRole("button", { name: "Add Hope", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Add Hope", exact: true })
      .isDisabled(),
    true
  );
  await page
    .getByLabel("Topics, one per line", { exact: true })
    .fill(Array.from({ length: 12 }, (_, i) => "Label " + i).join("\n"));
  assert.equal(
    await page
      .getByRole("button", { name: "Add Prayer", exact: true })
      .isDisabled(),
    true
  );
  await page
    .getByLabel("Topics, one per line", { exact: true })
    .fill("Hope\n" + tag);
  await page
    .getByLabel("I understand this source and catalog audience.")
    .check();
  await page
    .getByRole("button", { name: "Save private draft", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Publish media", exact: true })
    .waitFor();
  await page
    .getByLabel("I understand this source and catalog audience.")
    .check();
  await page
    .getByLabel("I reviewed this exact source", { exact: false })
    .check();
  await page
    .getByRole("button", { name: "Publish media", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save reviewed publication", exact: true })
    .waitFor();
  const row = await db.mediaCatalogItem.findFirstOrThrow({
    where: { ownerId: actor.id, title }
  });
  assert.deepEqual(row.topics, ["Hope", tag]);
  await page.goto(
    origin + "/platform/media/" + encodeURIComponent(row.id) + "/edit"
  );
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByLabel("Title", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Topics, one per line", { exact: true }).inputValue(),
    "Hope\n" + tag
  );
  ok(
    "publisher optional labels respect duplicate/cap bounds and persist through reviewed publication and reload"
  );
  await create({ topics: ["Hope"] });
  const secret = "Private topic " + suffix.slice(0, 8);
  await create({
    title: "Private members " + suffix,
    audience: "MEMBERS",
    topics: [secret]
  });
  await create({ title: "Private draft " + suffix, topics: [secret] }, false);
  await context.clearCookies();
  const browseWrites = [];
  page.on("request", (r) => {
    if (!["GET", "HEAD"].includes(r.method()))
      browseWrites.push(r.method() + " " + new URL(r.url()).pathname);
  });
  await go("/platform/media");
  await page.getByRole("link", { name: title, exact: true }).waitFor();
  assert.equal(
    (await page.locator("body").innerText()).includes(secret),
    false
  );
  await page
    .getByRole("region", { name: "Explore topics", exact: true })
    .getByRole("link", { name: "Hope", exact: true })
    .click();
  await wait(
    async () =>
      (await page.getByLabel("Topic", { exact: true }).inputValue()) === "Hope"
  );
  await page.getByRole("link", { name: title, exact: true }).waitFor();
  assert.ok(
    (await page.getByLabel("Applied media filters").innerText()).includes(
      "Topic: Hope"
    )
  );
  ok(
    "guest topic entry uses visible editable URL filters and excludes private publisher labels"
  );
  await page.getByLabel("Keywords", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Search media", exact: true }).click();
  await wait(async () =>
    (await page.locator("body").innerText()).includes("1 item available")
  );
  assert.equal(new URL(page.url()).searchParams.get("topic"), "Hope");
  await page.reload();
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("link", { name: title, exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Keywords", { exact: true }).inputValue(),
    title
  );
  ok(
    "topic and keyword filters combine and survive reload without persisting a personal preference"
  );
  await page.getByRole("link", { name: title, exact: true }).click();
  await page
    .getByRole("heading", { name: title, exact: true, level: 1 })
    .waitFor();
  const topicLink = page
    .getByRole("region", { name: "Publisher topics" })
    .getByRole("link", { name: tag, exact: true });
  assert.equal(
    await topicLink.getAttribute("href"),
    "/platform/media?topic=" + encodeURIComponent(tag)
  );
  await topicLink.focus();
  await page.keyboard.press("Enter");
  await wait(
    async () =>
      (await page.getByLabel("Topic", { exact: true }).inputValue()) === tag
  );
  await page.getByRole("link", { name: title, exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("topic"), tag);
  assert.equal(new URL(page.url()).searchParams.has("q"), false);
  ok(
    "detail topic keyboard link safely encodes punctuation and starts the selected topic search"
  );
  await page.getByRole("link", { name: "Clear filters", exact: true }).click();
  await wait(
    async () =>
      (await page.getByLabel("Topic", { exact: true }).inputValue()) === ""
  );
  await page.goBack();
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await wait(
    async () =>
      (await page.getByLabel("Topic", { exact: true }).inputValue()) === tag
  );
  await page.getByRole("link", { name: title, exact: true }).waitFor();
  ok("clear and browser Back restore the actual filter and permitted results");
  await go("/platform/media?topic=" + encodeURIComponent(tag) + "&page=1");
  await page
    .getByText(
      "No matching media is available. Try another search or format.",
      { exact: true }
    )
    .waitFor();
  await page
    .getByRole("region", { name: "Explore topics" })
    .getByRole("link", { name: "Hope", exact: true })
    .click();
  await page.getByRole("link", { name: title, exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.has("page"), false);
  ok(
    "a new topic resets an out-of-range result page without retaining stale pagination"
  );
  await go("/platform/media?topic=" + encodeURIComponent(secret));
  await page
    .getByText(
      "No matching media is available. Try another search or format.",
      { exact: true }
    )
    .waitFor();
  assert.ok(
    (await page.locator("body").innerText()).includes("0 items available")
  );
  assert.equal(
    await page
      .getByRole("link", { name: "Private members " + suffix, exact: true })
      .count(),
    0
  );
  ok(
    "explicit guessed private topic returns zero authorized matches and no hidden-source cards"
  );
  const pageTopic = "Pages " + suffix.slice(0, 8);
  for (let index = 0; index < 21; index++)
    await create({
      title: `Fictional pagination ${suffix} ${index}`,
      topics: [pageTopic]
    });
  const pageFilters = new URLSearchParams({
    topic: pageTopic,
    format: "SERMON",
    q: `Fictional pagination ${suffix}`
  });
  await go("/platform/media?" + pageFilters);
  await page.getByText("21 items available", { exact: true }).waitFor();
  const resultLinks = page.getByRole("link", {
    name: new RegExp(`^Fictional pagination ${suffix} `)
  });
  await wait(async () => (await resultLinks.count()) === 20);
  const firstPage = await resultLinks.allTextContents();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByText("Page 2", { exact: true }).waitFor();
  await wait(async () => (await resultLinks.count()) === 1);
  for (const [key, value] of pageFilters)
    assert.equal(new URL(page.url()).searchParams.get(key), value);
  assert.ok(!firstPage.includes(await resultLinks.innerText()));
  assert.equal(
    await page.getByRole("button", { name: "Next", exact: true }).isDisabled(),
    true
  );
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await page.getByText("Page 1", { exact: true }).waitFor();
  await wait(async () => (await resultLinks.count()) === 20);
  assert.deepEqual(await resultLinks.allTextContents(), firstPage);
  for (const [key, value] of pageFilters)
    assert.equal(new URL(page.url()).searchParams.get(key), value);
  ok(
    "populated 20+1 pagination preserves combined filters and returns the original current results"
  );
  await go("/platform/media?topic=" + encodeURIComponent(tag));
  await page.getByRole("link", { name: title, exact: true }).waitFor();
  await page.setViewportSize({ width: 320, height: 740 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    true
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: output + "/topics-320-enlarged.png",
    fullPage: true
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: output + "/topics-390.png", fullPage: true });
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal(
    await page.getByRole("link", { name: title, exact: true }).count(),
    0
  );
  await db.mediaCatalogItem.update({
    where: { id: row.id },
    data: { state: "UNPUBLISHED", version: { increment: 1 } }
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByText(
      "No matching media is available. Try another search or format.",
      { exact: true }
    )
    .waitFor();
  ok(
    "narrow enlarged layout and foreground revalidation conceal withdrawn source topics and results"
  );
  assert.deepEqual(browseWrites, []);
  assert.equal(providerAttempts, 0);
  assert.deepEqual(errors, []);
  ok(
    "all browsing used read-only requests, no provider calls and no browser errors"
  );
  writeFileSync(
    output + "/results.json",
    JSON.stringify({ results, errors, providerAttempts, browseWrites }, null, 2)
  );
  console.log(output);
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
