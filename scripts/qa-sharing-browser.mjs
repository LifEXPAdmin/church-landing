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
  NODE_ENV: "test",
  VERCEL: ""
});
const { PrismaClient } = await import("@prisma/client");
const { seedPortal, assertPortalTestDatabase } =
  await import("../tests/seed-portal.ts");
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
const output = fixtureDir + "/sharing-browser";
mkdirSync(output, { recursive: true });
const go = async (path) => {
  await page.goto(config.origin + path);
};
const bounded = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal page overflow"
  );

const signIn = async (actor) =>
  context.addCookies([
    {
      name: "church_platform_session",
      value: actor.token,
      domain: "127.0.0.1",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);

const { randomUUID } = await import("node:crypto");
const { default: jsQR } = await import("jsqr");
await context.addInitScript(() => {
  window.__shareMode = "cancel";
  window.__copied = [];
  window.__shared = [];
  window.__clipboardFail = false;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (text) => {
        if (window.__clipboardFail)
          throw new DOMException("Denied", "NotAllowedError");
        window.__copied.push(text);
      }
    }
  });
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: location.pathname.includes("/churches/")
      ? undefined
      : async (data) => {
          if (window.__shareMode === "cancel")
            throw new DOMException("Canceled", "AbortError");
          window.__shared.push(data);
        }
  });
});
try {
  const f = await seedPortal(db);
  await db.church.update({
    where: { id: f.churchA.id },
    data: { communityListed: true }
  });
  const marker = "PUBLIC SHARE " + randomUUID();
  const post = await db.platformPost.create({
    data: {
      id: "long-share-" + randomUUID() + "-" + "x".repeat(50),
      authorId: f.memberA.id,
      content: marker,
      publishedAt: new Date()
    }
  });
  const privatePost = await db.platformPost.create({
    data: {
      authorId: f.memberA.id,
      content: "PRIVATE SHARE SECRET",
      audience: "CHURCH",
      audienceChurchId: f.churchA.id,
      publishedAt: new Date()
    }
  });
  const canonical = config.origin + "/platform/posts/" + post.id;
  await go("/platform/posts/" + post.id);
  await page.getByText("Share publicly", { exact: true }).click();
  await page
    .getByRole("button", { name: "Copy public link", exact: true })
    .click();
  await page.getByText("Public link copied.", { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.__copied), [canonical]);
  assert.equal(
    await page
      .getByRole("textbox", { name: "Public link", exact: true })
      .inputValue(),
    canonical
  );
  await page.evaluate(() => (window.__clipboardFail = true));
  await page
    .getByRole("button", { name: "Copy public link", exact: true })
    .click();
  await page
    .getByText(
      "The link was not copied. Select and copy the public link below.",
      { exact: true }
    )
    .waitFor();
  assert.equal((await page.evaluate(() => window.__copied)).length, 1);
  await page
    .getByRole("button", { name: "Open share dialog", exact: true })
    .click();
  await page.getByText("Sharing canceled.", { exact: true }).waitFor();
  await page.evaluate(() => (window.__shareMode = "success"));
  await page
    .getByRole("button", { name: "Open share dialog", exact: true })
    .click();
  await page.getByText("Share dialog completed.", { exact: true }).waitFor();
  assert.equal((await page.evaluate(() => window.__shared))[0].url, canonical);
  ok(
    "Copy success/failure and native cancel/completion report truthfully using the same canonical URL"
  );
  await page.getByRole("button", { name: "Show QR code", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Public link QR code",
    exact: true
  });
  await dialog.waitFor();
  await page.waitForFunction(
    () => document.querySelector("dialog canvas")?.width === 512
  );
  const pixels = await dialog.locator("canvas").evaluate((c) => ({
    data: Array.from(
      c.getContext("2d").getImageData(0, 0, c.width, c.height).data
    ),
    width: c.width,
    height: c.height
  }));
  const decoded = jsQR(
    Uint8ClampedArray.from(pixels.data),
    pixels.width,
    pixels.height
  );
  assert.equal(decoded?.data, canonical);
  await page.setViewportSize({ width: 320, height: 844 });
  await bounded();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  await page.waitForFunction(
    () => document.activeElement?.textContent === "Show QR code"
  );
  await db.platformPost.update({
    where: { id: post.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  await page
    .getByRole("button", { name: "Copy public link", exact: true })
    .click();
  await page
    .getByText("A public share link is not available for this page.", {
      exact: true
    })
    .waitFor();
  assert.equal(
    await page
      .getByRole("textbox", { name: "Public link", exact: true })
      .count(),
    0
  );
  assert.equal((await page.evaluate(() => window.__copied)).length, 1);
  ok(
    "Long QR decodes to canonical URL, keyboard close restores focus, and withdrawal blocks a fresh Copy"
  );
  await go("/platform/churches/" + f.churchA.id);
  await page.getByText("Share publicly", { exact: true }).first().click();
  await page
    .getByText("Native sharing is unavailable. Use Copy public link.", {
      exact: true
    })
    .waitFor();
  await page
    .getByRole("button", { name: "Copy public link", exact: true })
    .click();
  await page.getByText("Public link copied.", { exact: true }).waitFor();
  assert.equal(
    (await page.evaluate(() => window.__copied))[0],
    config.origin + "/platform/churches/" + f.churchA.id
  );
  await signIn(f.memberA);
  await go("/platform/posts/" + privatePost.id);
  await page.getByText("Share publicly", { exact: true }).click();
  await page
    .getByText("A public share link is not available for this page.", {
      exact: true
    })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Copy public link", exact: true })
      .count(),
    0
  );
  ok(
    "Unsupported native share has Copy fallback; a signed-in member cannot share a private post publicly"
  );
  const calendar = await db.platformCalendar.create({
    data: {
      churchId: f.churchA.id,
      creatorId: f.memberA.id,
      requestKey: randomUUID(),
      name: "Sharing fixture",
      timeZone: "UTC"
    }
  });
  const event = await db.calendarEvent.create({
    data: {
      calendarId: calendar.id,
      requestKey: randomUUID(),
      title: "PUBLIC EVENT " + marker,
      visibility: "PUBLIC",
      timeZone: "UTC",
      startLocal: "2026-10-01T10:00",
      endLocal: "2026-10-01T11:00",
      occurrences: {
        create: {
          ordinal: 0,
          title: "PUBLIC EVENT " + marker,
          allDay: false,
          timeZone: "UTC",
          startLocal: "2026-10-01T10:00",
          endLocal: "2026-10-01T11:00",
          startAt: new Date("2026-10-01T10:00Z"),
          endAt: new Date("2026-10-01T11:00Z")
        }
      }
    },
    include: { occurrences: true }
  });
  await context.clearCookies();
  await go("/platform/events/" + event.occurrences[0].id);
  await page.getByText("Share publicly", { exact: true }).click();
  await page
    .getByRole("button", { name: "Copy public link", exact: true })
    .click();
  await page.getByText("Public link copied.", { exact: true }).waitFor();
  assert.equal(
    (await page.evaluate(() => window.__copied))[0],
    config.origin + "/platform/events/" + event.occurrences[0].id
  );
  await page
    .locator("main")
    .getByRole("link", { name: "Sign in", exact: true })
    .click();
  await page.locator("#account-login-email").fill(f.memberB.email);
  await page.locator("#account-login-password").fill(f.memberB.password);
  await page.locator("#account-login-form button[type=submit]").click();
  await page.waitForURL("**/platform/events/" + event.occurrences[0].id);
  await page
    .getByRole("button", { name: "Save my RSVP", exact: true })
    .waitFor();
  ok(
    "Shared occurrence URL follows normal sign-in return to authorized RSVP controls without granting membership"
  );
  await context.clearCookies();
  await go("/platform/share");
  await page.getByText("Share Godschurches", { exact: true }).last().click();
  await page.getByRole("button", { name: "Show QR code" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download QR PNG" }).click();
  const download = await downloadPromise;
  const pngPath = output + "/site-qr.png";
  await download.saveAs(pngPath);
  const sharp = (await import("sharp")).default;
  const raw = await sharp(pngPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(
    jsQR(new Uint8ClampedArray(raw.data), raw.info.width, raw.info.height)
      ?.data,
    config.origin + "/platform"
  );
  await page.getByRole("button", { name: "Close QR code" }).click();
  await bounded();
  ok(
    "App-level downloaded QR PNG independently decodes to canonical public entry at phone width"
  );
  const { friendInvitationCommand, readFriendInvitations } =
    await import("../lib/platform/friend-invitations.ts");
  await friendInvitationCommand(db, f.memberA.token, {
    operation: "enable",
    mutationId: randomUUID(),
    accountId: f.memberA.id,
    expectedVersion: 0,
    consent: true
  });
  const personalUrl = (await readFriendInvitations(db, f.memberA.token)).url;
  for (const actor of [null, f.memberA]) {
    await context.clearCookies();
    if (actor) await signIn(actor);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await go("/platform/menu");
      const shortcut = page
        .getByRole("list", { name: "Quick sharing" })
        .getByRole("link");
      const rect = await shortcut.boundingBox();
      assert.ok(
        rect && rect.y >= 0 && rect.y + rect.height < 844,
        "QR shortcut is visible without scrolling"
      );
      assert.match(
        await shortcut.innerText(),
        actor ? /My QR code/ : /Share Godschurches/
      );
      await shortcut.focus();
      assert.ok(await shortcut.evaluate((el) => el === document.activeElement));
      await page.keyboard.press("Enter");
      await page.waitForURL(
        actor ? "**/platform/invitations" : "**/platform/share?qr=1"
      );
      const qr = page.getByRole("region", {
        name: actor ? "Personal invitation QR code" : "Public link QR code"
      });
      await qr.getByRole("button", { name: "Download QR PNG" }).waitFor();
      await page.waitForFunction(
        () =>
          !document.querySelector('section[aria-label$="QR code"] button')
            ?.disabled
      );
      const pixels = await qr.locator("canvas").evaluate((c) => ({
        data: Array.from(
          c.getContext("2d").getImageData(0, 0, c.width, c.height).data
        ),
        width: c.width,
        height: c.height
      }));
      assert.equal(
        jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height)
          ?.data,
        actor ? personalUrl : config.origin + "/platform"
      );
      await bounded();
      await page.evaluate(
        () => (document.documentElement.style.fontSize = "200%")
      );
      await bounded();
      await page.goBack();
      await page.waitForURL("**/platform/menu");
      await bounded();
    }
  }
  await context.clearCookies();
  await page.setViewportSize({ width: 390, height: 844 });
  ok(
    "Menu QR shortcut visible at 320/390 signed in and out; keyboard one-tap QR decodes correctly, enlarged text and Back work"
  );
  await go("/platform/features");
  await page.getByRole("searchbox", { name: "Search features" }).fill("photo");
  await page
    .getByRole("heading", { name: "Profile photos", exact: true })
    .waitFor();
  await page
    .getByText(/^Signed-in accounts can manage their own photo/)
    .waitFor();
  assert.equal(await page.locator("main article").count(), 4);
  await go("/platform/releases/community-baseline");
  await page.getByRole("heading", { name: "Version 2026.09.12.0" }).waitFor();
  await bounded();
  const { currentRelease } = await import("../lib/platform/release-content.ts");
  const changed = {
    ...currentRelease,
    id: "future-fixture",
    version: "2026.09.13.1"
  };
  await page.route("**/api/platform/release", (route) =>
    route.fulfill({
      json: {
        release: "2".repeat(40),
        product: {
          build: "2".repeat(40),
          id: changed.id,
          version: changed.version
        },
        notes: changed
      }
    })
  );
  await page.getByRole("button", { name: "Check for updates" }).click();
  await page.getByRole("button", { name: "See what’s new" }).click();
  await page
    .getByRole("dialog")
    .getByRole("heading", { name: "Version 2026.09.13.1" })
    .waitFor();
  assert.ok(
    (await page.getByRole("dialog").innerText()).includes(
      `still running ${currentRelease.version}`
    )
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Read what’s new again" }).waitFor();
  assert.match(
    (await context.cookies()).find((c) => c.name === "gc_release_viewed")
      ?.value ?? "",
    /^future-fixture$/
  );
  await page.unroute("**/api/platform/release");
  ok(
    "Feature filtering, retained baseline notes and exact detected-release dialog preserve loaded version and viewed identity"
  );
  await db.platformPost.update({
    where: { id: post.id },
    data: { status: "PUBLISHED", withdrawnAt: null }
  });
  await signIn(f.memberA);
  await go("/platform/profile/me");
  const photoBytes = await sharp({
    create: { width: 100, height: 100, channels: 3, background: "blue" }
  })
    .png()
    .toBuffer();
  await page.locator("input[type=file]").first().setInputFiles({
    name: "fictional.png",
    mimeType: "image/png",
    buffer: photoBytes
  });
  await page.getByRole("button", { name: "Save avatar", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove avatar", exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "Remove avatar", exact: true })
    .waitFor();
  await page.locator("input[type=file]").first().setInputFiles({
    name: "fictional2.png",
    mimeType: "image/png",
    buffer: photoBytes
  });
  await page.getByRole("button", { name: "Discard selected photo" }).click();
  await page
    .getByRole("button", { name: "Remove avatar", exact: true })
    .waitFor();
  await go("/platform/posts/" + post.id);
  await page.locator(".gc-post-author .gc-avatar img").waitFor();
  await page.waitForFunction(() => {
    const img = document.querySelector(".gc-post-author .gc-avatar img");
    return img?.complete && img.naturalWidth > 0;
  });
  const photoComment = await db.platformPostComment.create({
    data: {
      postId: post.id,
      authorId: f.memberA.id,
      content: "Fictional avatar comment"
    }
  });
  await page.reload();
  await page
    .locator(`[data-comment-id="${photoComment.id}"] .gc-avatar img`)
    .waitFor();
  await page.waitForFunction((id) => {
    const img = document.querySelector(
      `[data-comment-id="${id}"] .gc-avatar img`
    );
    return img?.complete && img.naturalWidth > 0;
  }, photoComment.id);
  await go("/platform/profile/me");
  await page
    .getByRole("button", { name: "Remove avatar", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm remove avatar", exact: true })
    .click();
  await page.getByText(/^Avatar removed from current selection\./).waitFor();
  ok(
    "Existing photo editor uploads, persists on reload, preserves saved photo on cancel, serves authorized post avatar and removes it"
  );
  await context.clearCookies();
  await go("/platform/churches/" + f.churchA.id);
  await page
    .getByRole("heading", { name: "Upcoming events", exact: true })
    .waitFor();
  await page.getByText("PUBLIC EVENT " + marker, { exact: true }).waitFor();
  await bounded();
  ok(
    "Guest church overview includes actual authorized upcoming fixture event at phone width"
  );
  const metadata = async (path) => {
    const r = await context.request.get(config.origin + path, {
      headers: { "User-Agent": "Twitterbot/1.0" }
    });
    assert.match(r.headers()["cache-control"] ?? "", /no-store|private/);
    const html = await r.text();
    const tags = Object.fromEntries(
      [
        ...html.matchAll(
          /<meta[^>]+(?:property|name)="([^"]+)"[^>]*content="([^"]*)"/g
        )
      ].map((m) => [m[1], m[2]])
    );
    return { tags, html };
  };
  await db.platformPost.update({
    where: { id: post.id },
    data: { status: "PUBLISHED", withdrawnAt: null }
  });
  const pub = await metadata("/platform/posts/" + post.id);
  assert.ok(pub.tags["og:description"].includes(marker));
  assert.equal(pub.tags["og:image"], config.origin + "/brand/share-card.png");
  assert.equal(pub.tags["og:image:width"], "1200");
  assert.equal(pub.tags["og:image:height"], "630");
  assert.equal(pub.tags["twitter:card"], "summary_large_image");
  const churchMeta = await metadata("/platform/churches/" + f.churchA.id);
  assert.ok(churchMeta.tags["og:title"].includes(f.churchA.name));
  const eventMeta = await metadata(
    "/platform/events/" + event.occurrences[0].id
  );
  assert.ok(eventMeta.tags["og:title"].includes("PUBLIC EVENT"));
  for (const path of [
    "/platform/posts/" + privatePost.id,
    "/platform/posts/missing-share-resource",
    "/platform/profile/" + f.memberA.username
  ]) {
    const r = await metadata(path);
    assert.match(r.tags["og:title"], /^Godschurches(?: \| The Revival)?$/);
    assert.equal(r.tags["og:image"], config.origin + "/brand/share-card.png");
    assert.ok(!JSON.stringify(r.tags).includes("PRIVATE SHARE SECRET"));
    assert.ok(!JSON.stringify(r.tags).includes(f.memberA.email));
  }
  await db.platformPost.update({
    where: { id: post.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  assert.match(
    (await metadata("/platform/posts/" + post.id)).tags["og:title"],
    /^Godschurches(?: \| The Revival)?$/
  );
  await db.calendarEvent.update({
    where: { id: event.id },
    data: { visibility: "PRIVATE" }
  });
  assert.equal(
    (await metadata("/platform/events/" + event.occurrences[0].id)).tags[
      "og:title"
    ],
    "Godschurches"
  );
  const png = await context.request.get(
    config.origin + "/brand/share-card.png"
  );
  assert.equal(png.status(), 200);
  const bytes = await png.body();
  assert.equal(bytes.readUInt32BE(16), 1200);
  assert.equal(bytes.readUInt32BE(20), 630);
  ok(
    "Actual crawler HTML has public-safe metadata and generic private/missing/withdrawn/profile branding; absolute PNG is 1200x630"
  );
  await context.clearCookies();
  assert.match(
    (await metadata("/platform/posts/" + privatePost.id)).tags["og:title"],
    /^Godschurches(?: \| The Revival)?$/
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/receipt.json",
    JSON.stringify({ results, pageErrors: errors }, null, 2)
  );
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
