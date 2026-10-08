import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";

// Invoke with --import ./tests/register.mjs and the owned fixture's trusted CA.
// This driver consumes an already-built local app; it does not start services.
assert.ok(process.argv[2], "Pass the owned ready HTTPS fixture directory.");
const root = realpathSync(process.cwd()),
  fixture = realpathSync(resolve(process.argv[2]));
assert.ok(fixture.startsWith(realpathSync(join(root, ".account-test")) + "/"));
const supplied = JSON.parse(
  readFileSync(join(fixture, "test-env.json"), "utf8")
);
const config = JSON.parse(
  readFileSync(join(fixture, "browser-env.json"), "utf8")
);
assert.equal(config.database, supplied.DATABASE_URL);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
assert.equal(supplied.ACCOUNT_TEST_ISOLATED, "1");
assert.equal(supplied.ACCOUNT_DELIVERY_MODE, "test-sink");
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.ok(realpathSync(config.certificate).startsWith(fixture + "/"));
assert.equal(process.env.NODE_EXTRA_CA_CERTS, config.certificate);
assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED, "0");
assert.ok(
  supplied.AUTH_RATE_LIMIT_SECRET,
  "Use the supplied isolated fixture secret."
);
Object.assign(process.env, supplied, {
  ACCOUNT_ORIGIN: config.origin,
  NEXT_PUBLIC_SITE_URL: config.origin,
  NODE_ENV: "test",
  VERCEL: "",
  VERCEL_ENV: "",
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  PRIVILEGED_MFA_MODE: "off",
  PERSONAL_PHOTO_LIBRARY_ENABLED: "true",
  PHOTO_ALBUMS_ENABLED: "true",
  PUSH_ENABLED: "false",
  SOCIAL_EMAIL_ENABLED: "false",
  FOUNDER_WELCOME_ENABLED: "false",
  FOUNDER_ANNOUNCEMENTS_ENABLED: "false",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  ACCOUNT_GOOGLE_ENABLED: "false",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  BLOB_READ_WRITE_TOKEN: "",
  BLOB_STORE_ID: ""
});
assert.equal(process.env.MEDIA_STORAGE_MODE, "local-test");
assert.ok(resolve(process.env.MEDIA_TEST_DIR).startsWith(fixture + "/"));
const built = JSON.parse(
  readFileSync(
    join(fixture, "profile-photo-sections-build-receipt.json"),
    "utf8"
  )
);
const runtime = JSON.parse(readFileSync(join(fixture, "runtime.json"), "utf8"));
assert.equal(
  readFileSync(join(root, ".next/BUILD_ID"), "utf8").trim(),
  built.buildId
);
assert.equal(runtime.buildId, built.buildId);
assert.equal(runtime.origin, config.origin);
assert.equal(runtime.source, root);
assert.ok(Object.keys(built.files ?? {}).length);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const sourceHashes = () =>
  Object.fromEntries(
    Object.keys(built.files).map((path) => [
      path,
      hash(readFileSync(join(root, path)))
    ])
  );
assert.deepEqual(
  sourceHashes(),
  built.files,
  "Source changed after the pinned production build."
);
const { PrismaClient } = await import("@prisma/client");
const { profilePhotoFixture, saveProfileSectionPhotos, changeSectionPhoto } =
  await import("../tests/profile-photo-sections-fixture.ts");
const { getProfileEditor } = await import("../lib/platform/profiles.ts");
const db = new PrismaClient();
const output = join(fixture, `profile-photo-sections-browser-${Date.now()}`);
mkdirSync(output, { recursive: true, mode: 0o700 });
const receipt = {
  startedAt: new Date().toISOString(),
  buildId: built.buildId,
  head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  runnerSha256: hash(readFileSync(new URL(import.meta.url))),
  boundBuild: {
    buildId: built.buildId,
    files: built.files,
    runtimeOrigin: runtime.origin,
    runtimeSource: runtime.source
  },
  groups: [],
  observations: [],
  captures: [],
  imageRequests: [],
  writes: [],
  pageErrors: [],
  externalRequests: [],
  failures: [],
  actors: [],
  limitations: [
    "Fictional isolated actors and local images only.",
    "Chrome native window focus, browser offline mode, and browser Back are desktop checks, not physical-device testing.",
    "32px root text is bounded text enlargement, not browser-zoom conformance.",
    "The held fresh read is a bounded test-controlled network delay, not a simulated successful permission result."
  ]
};
const save = () =>
  writeFileSync(
    join(output, "result.json"),
    JSON.stringify(receipt, null, 2) + "\n",
    { mode: 0o600 }
  );
save();
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
  // Native window-focus assertions require a headed browser.
  headless: false,
  executablePath:
    process.env.CHROMIUM_PATH ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: [
    "--no-proxy-server",
    "--ignore-certificate-errors-spki-list=" +
      createHash("sha256").update(der).digest("base64")
  ]
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  reducedMotion: "reduce"
});
context.setDefaultTimeout(15000);
context.setDefaultNavigationTimeout(15000);
await context.route("**/*", (route) => {
  if (new URL(route.request().url()).origin === config.origin)
    return route.continue();
  receipt.externalRequests.push({
    url: route.request().url(),
    method: route.request().method()
  });
  return route.abort();
});
const page = await context.newPage();
page.on("pageerror", (error) => receipt.pageErrors.push(error.message));
page.on("dialog", (dialog) => dialog.accept());
page.on("request", (request) => {
  const url = new URL(request.url());
  if (url.pathname.startsWith("/api/platform/images/"))
    receipt.imageRequests.push(url.pathname);
  if (request.method() === "POST")
    receipt.writes.push({
      path: url.pathname,
      expectedAccount: request.headers()["x-expected-account"] ?? null
    });
});
const wait = async (condition, label) => {
  for (let i = 0; i < 150; i++) {
    if (await condition()) return;
    await page.waitForTimeout(100);
  }
  throw Error("Timed out: " + label);
};
const capture = async (name) => {
  const path = join(output, name + ".png");
  await page.screenshot({ path, fullPage: true });
  receipt.captures.push(path);
  save();
};
const group = async (name, work) => {
  try {
    await work();
    receipt.groups.push({ name, passed: true });
    console.log("PASS " + name);
  } catch (error) {
    receipt.groups.push({ name, passed: false });
    receipt.failures.push({
      name,
      error: String(error),
      stack: error.stack,
      url: page.url()
    });
    await capture("failure-" + receipt.failures.length).catch(() => {});
    throw error;
  } finally {
    save();
  }
};
const button = (name) => page.getByRole("button", { name, exact: true });
const picker = () => page.locator('[data-profile-photo-picker="editor"]');
const reader = () => page.locator('[data-profile-photo-section="reader"]');
const selectedList = () =>
  page.getByRole("list", { name: "Selected photo order", exact: true });
const testimony = () => page.locator('textarea[name="moduleTestimony"]');
const cookie = (actor) => ({
  name: sessionCookieFixtureName(config.origin),
  value: actor.token,
  url: config.origin,
  httpOnly: true,
  secure: true,
  sameSite: "Lax"
});
const login = async (actor) => {
  await page.goto("about:blank");
  await context.clearCookies();
  await context.addCookies([cookie(actor)]);
};
const go = async (path) => {
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
  await page.bringToFront();
};
// Real native tab movement, without focus injection or tabindex changes.
const keyboardTo = async (locator, label) => {
  const trace = [];
  await locator.waitFor({ state: "visible" });
  for (let i = 0; i < 180; i++) {
    const state = await locator.evaluate((node) => {
      const active = document.activeElement;
      return {
        reached: node === active,
        documentFocused: document.hasFocus(),
        direction:
          active &&
          active.compareDocumentPosition(node) &
            Node.DOCUMENT_POSITION_PRECEDING
            ? "Shift+Tab"
            : "Tab",
        activeTag: active?.tagName,
        activeLabel: active?.getAttribute("aria-label"),
        activeText: active?.textContent?.slice(0, 120)
      };
    });
    trace.push(state);
    if (state.reached) {
      receipt.observations.push({
        label: "keyboard reached " + label,
        tabCount: i,
        trace
      });
      return;
    }
    if (!state.documentFocused) {
      receipt.observations.push({
        label: "keyboard left document: " + label,
        trace
      });
      throw Error("Native keyboard left document while reaching " + label);
    }
    await page.keyboard.press(state.direction);
  }
  receipt.observations.push({
    label: "keyboard target unreached: " + label,
    trace
  });
  throw Error("Keyboard could not reach " + label);
};
const activate = async (locator, label) => {
  await keyboardTo(locator, label);
  await page.keyboard.press("Enter");
};
const nativeOtherWindow = async () => {
  const cdp = await browser.newBrowserCDPSession(),
    local = await context.newCDPSession(page);
  await local.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  await page.bringToFront();
  await page.waitForFunction(() => document.hasFocus());
  const { targetInfo } = await local.send("Target.getTargetInfo");
  const created = context.waitForEvent("page");
  await cdp.send("Target.createTarget", {
    url: "about:blank",
    browserContextId: targetInfo.browserContextId,
    newWindow: true,
    background: false
  });
  const other = await created,
    otherCdp = await context.newCDPSession(other);
  await otherCdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  await other.bringToFront();
  await page.waitForFunction(() => !document.hasFocus());
  assert.equal(await other.evaluate(() => document.hasFocus()), true);
  return other;
};
const returnToPage = async (other) => {
  await page.bringToFront();
  await page.waitForFunction(() => document.hasFocus());
  await other.close();
};
let f;
const profile = () => getProfileEditor(db, f.owner.token);
const readyEditor = async () => {
  await testimony().waitFor();
  await picker().scrollIntoViewIfNeeded();
  await wait(
    () => button("Save profile").isEnabled(),
    "current owner editor ready"
  );
};
const choose = async (photo, count) => {
  const available = page.getByRole("group", {
    name: "Available library photos",
    exact: true
  });
  await available.scrollIntoViewIfNeeded();
  const item = available
    .getByRole("listitem")
    .filter({ has: page.getByText(photo.caption, { exact: true }) });
  await item.waitFor();
  await item.getByRole("button", { name: /^Select library photo / }).click();
  await wait(
    async () => (await selectedList().getByRole("listitem").count()) === count,
    "new draft selection"
  );
};
const openReader = async (actor, query = "") => {
  await login(actor);
  await go(`/platform/profile/${f.owner.username}${query}`);
  await reader().scrollIntoViewIfNeeded();
};
try {
  f = await profilePhotoFixture(db);
  receipt.actors = [f.owner, f.member, f.outsider].map(({ id, username }) => ({
    id,
    username
  }));
  save();
  await group(
    "actual picker saves canonical owned photos, reordered section and sibling testimony",
    async () => {
      await login(f.owner);
      await go("/platform/profile/me");
      await readyEditor();
      await testimony().fill(
        "Fictional photo section testimony saved through the editor."
      );
      await button("Choose photos from your library").click();
      await choose(f.photos.public, 1);
      await choose(f.photos.members, 2);
      assert.equal(
        (await profile()).presentation.modules.photoIds,
        undefined,
        "Selecting does not save profile or alter photo audience."
      );
      await activate(
        button("Move selected photo 2 up"),
        "move selected photo up"
      );
      await wait(
        async () =>
          (
            await selectedList().getByRole("listitem").first().textContent()
          ).includes(f.photos.members.caption),
        "reordered selected metadata"
      );
      await activate(button("Move Photos up"), "move photo section up");
      const prior = await profile();
      await activate(button("Save profile"), "save selected photos");
      await wait(
        async () =>
          (await profile()).presentation.version > prior.presentation.version,
        "profile saved"
      );
      const saved = await profile();
      assert.deepEqual(saved.presentation.modules.photoIds, [
        f.photos.members.id,
        f.photos.public.id
      ]);
      assert.deepEqual(saved.presentation.modules.order, [
        "testimony",
        "skills",
        "photos",
        "links"
      ]);
      assert.equal(
        saved.presentation.modules.testimony,
        "Fictional photo section testimony saved through the editor."
      );
      await page.waitForURL(
        config.origin + `/platform/profile/${f.owner.username}`
      );
      await go("/platform/profile/me");
      await readyEditor();
      await page.reload();
      await page.bringToFront();
      await readyEditor();
      assert.equal(await selectedList().getByRole("listitem").count(), 2);
      assert.equal(
        await testimony().inputValue(),
        saved.presentation.modules.testimony
      );
      await capture("saved-editor-desktop");
    }
  );
  await group(
    "unsaved photo removal and text survive native blur, offline and account replacement without writes",
    async () => {
      const prior = await profile(),
        draft = "Distinct unsaved profile photo section testimony.";
      await testimony().fill(draft);
      await button("Remove selected photo 1").click();
      assert.equal(await selectedList().getByRole("listitem").count(), 1);
      const writes = receipt.writes.length;
      const otherWindow = await nativeOtherWindow();
      await wait(
        async () => (await testimony().count()) === 0,
        "blur conceals private draft"
      );
      assert.equal(await picker().getByRole("img").count(), 0);
      await returnToPage(otherWindow);
      await readyEditor();
      assert.equal(await testimony().inputValue(), draft);
      assert.equal(await selectedList().getByRole("listitem").count(), 1);
      await context.setOffline(true);
      await page.waitForFunction(() => !navigator.onLine);
      await wait(
        async () => (await testimony().count()) === 0,
        "offline conceals private draft"
      );
      await context.setOffline(false);
      await page.waitForFunction(() => navigator.onLine);
      const unavailableSignIn = page.getByText(
        "Your sign-in could not be checked. Your entries stay in this tab. Reconnect, then recheck before continuing.",
        { exact: true }
      );
      if (await button("Recheck this sign-in").isVisible()) {
        const checked = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/api/platform/session" &&
            response.request().method() === "GET" &&
            response.status() === 200
        );
        await button("Recheck this sign-in").click();
        await checked;
        await unavailableSignIn.waitFor({ state: "hidden" });
        await button("Recheck this sign-in").waitFor({ state: "hidden" });
        receipt.observations.push({
          label: "Explicit sign-in read after offline recovery",
          method: "GET",
          status: 200
        });
      }
      assert.equal(await unavailableSignIn.isVisible(), false);
      await readyEditor();
      assert.equal(await testimony().inputValue(), draft);
      assert.equal(await selectedList().getByRole("listitem").count(), 1);
      const switchedWindow = await nativeOtherWindow();
      await context.addCookies([cookie(f.outsider)]);
      await returnToPage(switchedWindow);
      await wait(
        async () =>
          /sign-in changed/i.test(await page.locator("body").innerText()),
        "replacement account warning"
      );
      assert.equal(await testimony().count(), 0);
      assert.equal(await picker().getByRole("img").count(), 0);
      await page
        .getByText(
          "The signed-in account changed. This tab keeps its original account and entries. Reload before using a different account.",
          { exact: true }
        )
        .waitFor();
      const restoreWindow = await nativeOtherWindow();
      await context.addCookies([cookie(f.owner)]);
      await returnToPage(restoreWindow);
      await readyEditor();
      assert.equal(await testimony().inputValue(), draft);
      assert.equal(await selectedList().getByRole("listitem").count(), 1);
      assert.equal(receipt.writes.length, writes);
      assert.deepEqual(await profile(), prior);
      await page.reload();
      await page.bringToFront();
      await readyEditor();
    }
  );
  await group(
    "failed save retains exact photo draft, appearance reset preserves it, and a real conflict requires review",
    async () => {
      const prior = await profile();
      const draft =
        "Distinct photo draft for failed-save and conflict recovery.";
      await testimony().fill(draft);
      await button("Move selected photo 2 up").click();
      await page
        .getByRole("combobox", { name: "Accent palette", exact: true })
        .selectOption("blue");
      await page
        .getByRole("combobox", { name: "Cover background", exact: true })
        .selectOption("lines");
      const orderBefore = await page
        .getByRole("group", { name: "Optional section order", exact: true })
        .getByRole("listitem")
        .allTextContents();
      await button("Restore appearance defaults").click();
      assert.equal(
        await page
          .getByRole("combobox", { name: "Accent palette", exact: true })
          .inputValue(),
        "sage"
      );
      assert.equal(
        await page
          .getByRole("combobox", { name: "Cover background", exact: true })
          .inputValue(),
        "plain"
      );
      assert.equal(await testimony().inputValue(), draft);
      assert.equal(await selectedList().getByRole("listitem").count(), 2);
      assert.deepEqual(
        await page
          .getByRole("group", { name: "Optional section order", exact: true })
          .getByRole("listitem")
          .allTextContents(),
        orderBefore
      );
      const attempts = [];
      const loseBeforeDispatch = async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        attempts.push(route.request().postData());
        if (attempts.length === 1) return route.abort("failed");
        return route.continue();
      };
      await context.route("**/api/platform/account", loseBeforeDispatch);
      try {
        await button("Save profile").click();
        await button("Retry original save").waitFor();
        assert.deepEqual(await profile(), prior);
        assert.equal(await testimony().inputValue(), draft);
        assert.equal(await selectedList().getByRole("listitem").count(), 2);
        await button("Retry original save").click();
        await page.waitForURL(
          config.origin + `/platform/profile/${f.owner.username}`
        );
        assert.equal(attempts.length, 2);
        assert.equal(
          attempts[1],
          attempts[0],
          "Retry must use the unchanged original photo selection and version."
        );
        const saved = await profile();
        assert.deepEqual(saved.presentation.modules.photoIds, [
          f.photos.public.id,
          f.photos.members.id
        ]);
        assert.equal(saved.presentation.modules.testimony, draft);
        assert.equal(saved.presentation.palette, "sage");
        assert.equal(saved.presentation.background, "plain");
        assert.deepEqual(
          saved.presentation.modules.order,
          prior.presentation.modules.order
        );
      } finally {
        await context.unroute("**/api/platform/account", loseBeforeDispatch);
      }
      await go("/platform/profile/me");
      await readyEditor();
      const localText = "Distinct retained local photo conflict draft.";
      await testimony().fill(localText);
      await button("Remove selected photo 1").click();
      await saveProfileSectionPhotos(db, f.owner, [f.photos.private.id], {
        testimony: "Fictional concurrent saved version."
      });
      const remote = await profile();
      const conflictResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/platform/account"
      );
      await button("Save profile").click();
      assert.equal((await conflictResponse).status(), 409);
      await button("Review latest saved profile").waitFor();
      assert.equal(await testimony().inputValue(), localText);
      assert.equal(await selectedList().getByRole("listitem").count(), 1);
      assert.deepEqual(
        await profile(),
        remote,
        "Conflict must not silently merge or overwrite a newer selection."
      );
      await button("Review latest saved profile").click();
      await page
        .getByRole("heading", { name: "Latest saved version", exact: true })
        .waitFor();
      assert.ok(
        (
          await page
            .getByRole("region", { name: "Latest saved version", exact: true })
            .innerText()
        ).includes(f.photos.private.id)
      );
      await button("Keep my edits and use this version").click();
      await wait(
        () => button("Save profile").isEnabled(),
        "deliberately reviewed version ready"
      );
      assert.equal(await testimony().inputValue(), localText);
      assert.equal(await selectedList().getByRole("listitem").count(), 1);
      await button("Save profile").click();
      await page.waitForURL(
        config.origin + `/platform/profile/${f.owner.username}`
      );
      const reviewed = await profile();
      assert.deepEqual(reviewed.presentation.modules.photoIds, [
        f.photos.members.id
      ]);
      assert.equal(reviewed.presentation.modules.testimony, localText);
      receipt.observations.push({
        label: "Failed transport retry and explicit conflict review",
        originalAttempts: attempts.length,
        unchangedOriginalBody: attempts[0] === attempts[1]
      });
    }
  );
  await group(
    "member and owner preview readers apply current audiences, keyboard viewer and native Back",
    async () => {
      await saveProfileSectionPhotos(db, f.owner, [
        f.photos.public.id,
        f.photos.members.id,
        f.photos.private.id,
        f.photos.church.id
      ]);
      await openReader(f.member);
      await button("Open selected photo 1 of 3").waitFor();
      assert.equal(await reader().getByRole("img").count(), 3);
      assert.ok(
        !(await reader().innerText()).includes(f.photos.private.caption)
      );
      await activate(
        button("Open selected photo 1 of 3"),
        "open selected photo"
      );
      await page.getByRole("dialog", { name: "Photo viewer" }).waitFor();
      await page.getByRole("dialog").getByRole("img").waitFor();
      await page.goBack();
      await wait(
        async () => (await page.getByRole("dialog").count()) === 0,
        "native Back closes viewer"
      );
      assert.equal(
        new URL(page.url()).pathname,
        `/platform/profile/${f.owner.username}`
      );
      await button("Open selected photo 1 of 3").waitFor();
      await button("Open selected photo 1 of 3").click();
      await page.getByRole("dialog").getByRole("img").waitFor();
      const away = await nativeOtherWindow();
      await wait(
        async () => (await page.getByRole("dialog").count()) === 0,
        "open viewer conceals on blur"
      );
      await returnToPage(away);
      await page.getByRole("dialog").getByRole("img").waitFor();
      await page.goBack();
      await wait(
        async () => (await page.getByRole("dialog").count()) === 0,
        "one Back closes restored viewer"
      );
      assert.equal(
        new URL(page.url()).pathname,
        `/platform/profile/${f.owner.username}`
      );
      await page.goBack();
      assert.equal(
        page.url(),
        "about:blank",
        "Restoring an open viewer must not orphan or add a history entry."
      );
      await openReader(f.outsider);
      await button("Open selected photo 1 of 2").waitFor();
      assert.equal(await reader().getByRole("img").count(), 2);
      assert.ok(
        !(await reader().innerText()).includes(f.photos.church.caption)
      );
      await openReader(f.owner, "?preview=member");
      await button("Open selected photo 1 of 2").waitFor();
      assert.equal(await reader().getByRole("img").count(), 2);
      assert.ok(
        !(await reader().innerText()).includes(f.photos.private.caption)
      );
    }
  );
  await group(
    "revocation while away clears cards and viewer until a held fresh read resolves",
    async () => {
      await openReader(f.member);
      await button("Open selected photo 2 of 3").click();
      await page.getByRole("dialog").getByRole("img").waitFor();
      const away = await nativeOtherWindow();
      await wait(
        async () => (await reader().getByRole("img").count()) === 0,
        "native blur removes photo cards"
      );
      assert.equal(await page.getByRole("dialog").count(), 0);
      await changeSectionPhoto(db, f.owner, f.photos.members.id, "audience", {
        audience: "ONLY_ME"
      });
      let held = 0,
        release;
      const gate = new Promise((done) => {
        release = done;
      });
      const timeout = setTimeout(() => release(), 15000);
      const matcher = "**/api/platform/profile?**";
      const hold = async (route) => {
        const url = new URL(route.request().url());
        if (url.searchParams.get("view") !== "photo-section")
          return route.continue();
        held++;
        await gate;
        return route.continue().catch(() => {});
      };
      await context.route(matcher, hold);
      try {
        await returnToPage(away);
        await wait(
          () => Promise.resolve(held > 0),
          "fresh section request held"
        );
        assert.equal(await reader().getByRole("img").count(), 0);
        assert.equal(await page.getByRole("dialog").count(), 0);
        assert.ok(
          !(await page.locator("body").innerText()).includes(
            f.photos.members.caption
          )
        );
        release();
        clearTimeout(timeout);
        await button("Open selected photo 1 of 2").waitFor();
        assert.ok(
          !(await reader().innerText()).includes(f.photos.members.caption)
        );
        const response = await context.request.get(
          config.origin + `/api/platform/images/${f.photos.members.id}/large`
        );
        assert.equal(response.status(), 404);
        assert.match(response.headers()["cache-control"], /no-store/);
        await page
          .getByRole("dialog")
          .getByText("This photo is no longer available.", { exact: true })
          .waitFor();
        await activate(button("Close photo"), "close revoked photo viewer");
        await wait(
          async () => (await page.getByRole("dialog").count()) === 0,
          "revoked viewer closes normally"
        );
      } finally {
        release();
        clearTimeout(timeout);
        await context.unroute(matcher, hold);
      }
      await capture("revoked-current-reader");
    }
  );
  await group(
    "normal foreground polling revokes an open photo without lifecycle signals or extra history entries",
    async () => {
      await openReader(f.member);
      await button("Open selected photo 1 of 2").click();
      await page.getByRole("dialog").getByRole("img").waitFor();
      assert.equal(await page.evaluate(() => document.hasFocus()), true);
      await page.evaluate(() => {
        window.__profilePhotoBlurCount = 0;
        window.addEventListener("blur", () => {
          window.__profilePhotoBlurCount++;
        });
      });
      const started = Date.now();
      await changeSectionPhoto(db, f.owner, f.photos.public.id, "audience", {
        audience: "ONLY_ME"
      });
      await page.waitForFunction(
        (caption) => {
          const root = document.querySelector(
            '[data-profile-photo-section="reader"]'
          );
          const dialog = root?.querySelector("dialog[open]");
          return (
            !!dialog &&
            !dialog.querySelector("img") &&
            !root.textContent.includes(caption)
          );
        },
        f.photos.public.caption,
        { timeout: 45000 }
      );
      assert.equal(
        await page.evaluate(() => window.__profilePhotoBlurCount),
        0,
        "No focus signal may shortcut normal polling."
      );
      assert.equal(await page.evaluate(() => document.hasFocus()), true);
      assert.equal(await reader().getByRole("img").count(), 1);
      await page
        .getByRole("dialog")
        .getByText("This photo is no longer available.", { exact: true })
        .waitFor();
      receipt.observations.push({
        label: "Foreground poll removed revoked photo",
        elapsedMs: Date.now() - started,
        lifecycleSignals: 0
      });
      await button("Close photo").click();
      await wait(
        async () => (await page.getByRole("dialog").count()) === 0,
        "revoked polling viewer closes once"
      );
      assert.equal(
        new URL(page.url()).pathname,
        `/platform/profile/${f.owner.username}`
      );
      await page.goBack();
      assert.equal(
        page.url(),
        "about:blank",
        "A background refresh must not add a viewer history entry."
      );
      await changeSectionPhoto(db, f.owner, f.photos.public.id, "audience", {
        audience: "PUBLIC",
        confirmed: true
      });
    }
  );
  await group(
    "data saver requests only small previews until explicit larger-photo action",
    async () => {
      await login(f.member);
      await go("/platform/settings/display/reading");
      await page.getByRole("checkbox", { name: /^Reduce photo data/ }).check();
      await button("Save display choices").click();
      const start = receipt.imageRequests.length;
      await go(`/platform/profile/${f.owner.username}`);
      await reader().scrollIntoViewIfNeeded();
      await button("Open selected photo 1 of 2").waitFor();
      await wait(
        async () =>
          await reader()
            .getByRole("img")
            .first()
            .evaluate((image) => image.complete && image.naturalWidth > 0),
        "small reader preview loaded"
      );
      await button("Open selected photo 1 of 2").click();
      await button("Load larger photo").waitFor();
      assert.equal(
        receipt.imageRequests
          .slice(start)
          .some((path) => /\/(large|original)$/.test(path)),
        false
      );
      await activate(button("Load larger photo"), "explicit larger photo");
      await wait(
        () =>
          Promise.resolve(
            receipt.imageRequests
              .slice(start)
              .some(
                (path) =>
                  path === `/api/platform/images/${f.photos.public.id}/large`
              )
          ),
        "larger variant requested after action"
      );
      assert.equal(
        receipt.imageRequests
          .slice(start)
          .some((path) => /\/original$/.test(path)),
        false
      );
      await activate(button("Close photo"), "close photo viewer");
      await wait(
        async () => (await page.getByRole("dialog").count()) === 0,
        "viewer closed"
      );
    }
  );
  await group(
    "320px and desktop section and editor retain keyboard access without horizontal overflow",
    async () => {
      for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await openReader(f.member);
        await button("Open selected photo 1 of 2").waitFor();
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "32px";
        });
        const aboutAnchor = page
          .getByRole("navigation", { name: "Profile sections", exact: true })
          .getByRole("link", { name: "About", exact: true });
        await activate(
          aboutAnchor,
          `${width}px native About navigation after text enlargement`
        );
        await page.waitForFunction(() => location.hash === "#about");
        await reader().scrollIntoViewIfNeeded();
        await button("Open selected photo 1 of 2").waitFor();
        assert.equal(await reader().getByRole("img").count(), 2);
        receipt.observations.push({
          label: `${width}px resolved reader after native About anchor`,
          state: await page.evaluate(() => ({
            hash: location.hash,
            scrollX,
            scrollY,
            activeTag: document.activeElement?.tagName,
            activeId: document.activeElement?.id,
            documentFocused: document.hasFocus()
          }))
        });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1
          ),
          `${width}px reader overflow`
        );
        await activate(
          button("Open selected photo 1 of 2"),
          `${width}px keyboard photo open`
        );
        await button("Close photo").waitFor();
        await activate(
          button("Close photo"),
          `${width}px keyboard photo close`
        );
        await capture(`reader-${width}`);
        await login(f.owner);
        await go("/platform/profile/me?focus=sections");
        await readyEditor();
        await page.waitForFunction(
          () => document.activeElement?.id === "profile-sections-heading"
        );
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "32px";
        });
        await picker().scrollIntoViewIfNeeded();
        await wait(
          async () => (await selectedList().getByRole("img").count()) === 4,
          "current selected photo projection after text enlargement"
        );
        receipt.observations.push({
          label: `${width}px resolved editor via existing sections navigation`,
          state: await page.evaluate(() => ({
            search: location.search,
            scrollX,
            scrollY,
            activeTag: document.activeElement?.tagName,
            activeId: document.activeElement?.id,
            documentFocused: document.hasFocus()
          }))
        });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1
          ),
          `${width}px editor overflow`
        );
        await activate(
          button("Move selected photo 2 up"),
          `${width}px keyboard selection order`
        );
        assert.equal(await selectedList().getByRole("listitem").count(), 4);
        await capture(`editor-${width}`);
      }
    }
  );
  await group(
    "photo-only profile stays empty for denied reader and regains its section through the fallback observer",
    async () => {
      const before = await profile();
      await saveProfileSectionPhotos(
        db,
        f.owner,
        [f.photos.private.id],
        { testimony: "", skills: [], links: [] },
        {
          bio: "",
          introduction: "",
          palette: before.presentation.palette,
          background: before.presentation.background,
          sectionOrder: before.presentation.sectionOrder
        }
      );
      const saved = await profile();
      const emptyRead = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          url.pathname === "/api/platform/profile" &&
          url.searchParams.get("view") === "photo-section" &&
          url.searchParams.get("username") === f.owner.username &&
          response.status() === 200
        );
      });
      await openReader(f.outsider);
      assert.deepEqual((await (await emptyRead).json()).images, []);
      await page.evaluate(
        () =>
          new Promise((done) =>
            requestAnimationFrame(() => requestAnimationFrame(done))
          )
      );
      assert.equal(
        await page.getByRole("heading", { name: "About", exact: true }).count(),
        0
      );
      assert.equal(
        await page
          .getByRole("heading", { name: "Photos", exact: true })
          .count(),
        0
      );
      assert.ok(!(await page.content()).includes(f.photos.private.id));
      assert.ok(
        !(await page.locator("body").innerText()).includes(
          f.photos.private.caption
        )
      );
      const documentTimeOrigin = await page.evaluate(
        () => performance.timeOrigin
      );
      await changeSectionPhoto(db, f.owner, f.photos.private.id, "audience", {
        audience: "MEMBERS"
      });
      assert.equal(
        (await profile()).presentation.version,
        saved.presentation.version
      );
      const away = await nativeOtherWindow();
      await returnToPage(away);
      await button("Open selected photo 1 of 1").waitFor();
      assert.equal(
        await page.getByRole("heading", { name: "About", exact: true }).count(),
        1
      );
      assert.equal(
        await page
          .getByRole("heading", { name: "Photos", exact: true })
          .count(),
        1
      );
      assert.ok(
        (await reader().innerText()).includes(f.photos.private.caption)
      );
      assert.equal(
        await page.evaluate(() => performance.timeOrigin),
        documentTimeOrigin,
        "Access regain must not reload the photo-only profile."
      );
      await capture("photo-only-regained-section");
    }
  );
  assert.deepEqual(receipt.externalRequests, []);
  assert.deepEqual(receipt.pageErrors, []);
  assert.deepEqual(
    sourceHashes(),
    built.files,
    "Source changed during acceptance."
  );
  receipt.completedAt = new Date().toISOString();
  save();
  console.log("RESULT " + join(output, "result.json"));
} catch (error) {
  receipt.completedAt = new Date().toISOString();
  save();
  console.error(String(error));
  process.exitCode = 1;
} finally {
  await context.setOffline(false).catch(() => {});
  await browser.close();
  await db.$disconnect();
}
