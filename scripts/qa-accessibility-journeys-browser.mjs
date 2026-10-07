import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { createHash, randomUUID, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";
// Bounded real-app audit, not an all-site accessibility certification.
// The parent owns the ready app/database; this runner owns fictional source rows.
assert.ok(process.argv[2], "Pass the active isolated fixture directory.");
const fixture = resolve(process.argv[2]);
assert.ok(fixture.startsWith(resolve(".account-test") + "/"));
const config = JSON.parse(
  readFileSync(join(fixture, "browser-env.json"), "utf8")
);
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(
  resolve(process.env.NODE_EXTRA_CA_CERTS ?? ""),
  resolve(config.certificate),
  "Start Node with the fixture CA certificate"
);
Object.assign(
  process.env,
  JSON.parse(readFileSync(join(fixture, "test-env.json"), "utf8")),
  {
    DATABASE_URL: config.database,
    DIRECT_URL: config.database,
    ACCOUNT_ORIGIN: config.origin,
    NEXT_PUBLIC_SITE_URL: config.origin,
    ACCOUNT_TEST_ISOLATED: "1",
    ACCOUNT_DELIVERY_MODE: "test-sink",
    NODE_ENV: "test",
    VERCEL: "",
    COMMUNITY_REPORTS_ENABLED: "true",
    PRIVILEGED_MFA_MODE: "off",
    RESEND_API_KEY: "",
    MAILERLITE_API_KEY: "",
    SOCIAL_EMAIL_ENABLED: "false",
    PUSH_ENABLED: "false",
    FOUNDER_WELCOME_ENABLED: "false",
    FOUNDER_ANNOUNCEMENTS_ENABLED: "false"
  }
);
const { PrismaClient } = await import("@prisma/client");
const { seedOperatorGrants, assertPortalTestDatabase } =
  await import("../tests/seed-portal.ts");
const {
  registerAccount,
  requestAccountGrant,
  consumeAccountGrant,
  loginAccount
} = await import("../lib/platform/accounts.ts");
const { deliverAccountGrant } =
  await import("../lib/platform/account-delivery.ts");
const { ADULT_POLICY, getPortalSnapshot, portalCommand } =
  await import("../lib/platform/portal.ts");
const { postCommand } = await import("../lib/platform/post-commands.ts");
const { uploadImage } = await import("../lib/platform/media.ts");
const { default: sharp } = await import("sharp");
const { default: jsQR } = await import("jsqr");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
assert.equal(process.env.MEDIA_STORAGE_MODE, "local-test");
async function createActor(label) {
  const suffix = randomBytes(5).toString("hex"),
    username = "p_" + label.slice(0, 9) + "_" + suffix;
  const email = username + ".private-login@example.test",
    password = "Fictional-only-" + randomBytes(12).toString("hex");
  await registerAccount(db, {
    name: "Fictional " + label + " " + suffix,
    username,
    email,
    password,
    confirmPassword: password,
    role: "BELIEVER"
  });
  const user = await db.platformUser.findUniqueOrThrow({ where: { username } });
  await requestAccountGrant(db, email, "VERIFY_EMAIL", deliverAccountGrant);
  let verification;
  for (const file of readdirSync(process.env.ACCOUNT_TEST_SINK_DIR)) {
    const mail = JSON.parse(
      readFileSync(join(process.env.ACCOUNT_TEST_SINK_DIR, file), "utf8")
    );
    if (mail.email === email && mail.purpose === "VERIFY_EMAIL")
      verification = new URLSearchParams(new URL(mail.url).hash.slice(1)).get(
        "token"
      );
  }
  assert.ok(verification);
  await consumeAccountGrant(db, verification, "VERIFY_EMAIL");
  const token = await loginAccount(
    db,
    email,
    password,
    "fictional-accessibility-" + suffix
  );
  const snapshot = await getPortalSnapshot(db, token, "discover");
  await portalCommand(db, token, {
    operation: "ack-adult",
    acknowledged: true,
    policy: ADULT_POLICY,
    expectedVersion: snapshot.viewer.version
  });
  return { id: user.id, name: user.name, username, email, password, token };
}
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
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
  colorScheme: "light",
  timezoneId: "America/Chicago"
});
let page = await context.newPage();
page.setDefaultTimeout(15000);
const output = join(fixture, "accessibility-journeys-browser-" + Date.now());
mkdirSync(output, { recursive: true, mode: 0o700 });
const results = [],
  findings = [],
  evidence = [],
  errors = [],
  external = [],
  images = [];
const runtime = {
  buildId: readFileSync(resolve(".next/BUILD_ID"), "utf8").trim(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8"
  }).trim(),
  origin: config.origin
};
const contrastChecks = {
  light: { text: 0, focus: 0 },
  dark: { text: 0, focus: 0 }
};
let phase = "fixture",
  actor,
  photoOwner;
const save = () =>
  writeFileSync(
    join(output, "results.json"),
    JSON.stringify(
      {
        runtime,
        phase,
        results,
        findings,
        evidence,
        errors,
        external,
        contrastChecks
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
const ok = (message) => {
  results.push({ phase, message });
  console.log("PASS " + message);
  save();
};
const finding = async (message, detail = {}) => {
  const screenshot = join(output, `finding-${findings.length + 1}.png`);
  findings.push({ phase, message, detail, screenshot });
  console.log("FINDING " + message + " " + JSON.stringify(detail));
  await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
  save();
};
const check = async (condition, message, detail) => {
  if (!condition) await finding(message, detail);
};
page.on("pageerror", (error) => errors.push({ phase, message: error.message }));
page.on("dialog", (dialog) => dialog.accept());
page.on("request", (request) => {
  const url = new URL(request.url());
  if (url.pathname.startsWith("/api/platform/images/"))
    images.push(url.pathname);
});
await context.route(/^https?:\/\//, (route) => {
  const url = new URL(route.request().url());
  if (url.origin === config.origin) return route.continue();
  external.push(url.origin + url.pathname);
  return route.abort();
});
const wait = async (work, message = "Expected state did not settle") => {
  for (let i = 0; i < 100; i++) {
    if (await work()) return;
    await new Promise((done) => setTimeout(done, 100));
  }
  assert.fail(message);
};
const settle = () =>
  page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done))
      )
  );
const active = (label) =>
  page.evaluate((label) => {
    const el = document.activeElement;
    return {
      label,
      tag: el?.tagName,
      id: el?.id,
      text: el?.textContent?.trim().slice(0, 140),
      name: el?.getAttribute("aria-label"),
      visible: !!el?.getClientRects().length,
      disabled: el?.matches(":disabled")
    };
  }, label);
const focusReceipt = async (label) => {
  await settle();
  const focus = await active(label);
  evidence.push({ phase, focus });
  save();
  if (
    /confirmed|saved|published|publication settled/.test(label) &&
    ["BODY", "HTML"].includes(focus.tag)
  )
    await finding("Confirmed editor action loses keyboard position", focus);
  return focus;
};
const go = async (path) => {
  await page.bringToFront();
  const r = await page.goto(config.origin + path);
  assert.equal(r.status(), 200);
  await settle();
};
const button = (name) => page.getByRole("button", { name, exact: true });
// Primary controls are reached through actual Tab order, never locator.focus().
const tabTo = async (locator) => {
  await locator.waitFor();
  await wait(
    () => locator.isEnabled(),
    "Target control becomes enabled after current access and request settle"
  );
  for (let n = 0; n < 160; n++) {
    if (await locator.evaluate((el) => el === document.activeElement)) return;
    const backwards = await locator.evaluate(
      (target) =>
        document.activeElement !== document.body &&
        !!(
          target.compareDocumentPosition(document.activeElement) &
          Node.DOCUMENT_POSITION_FOLLOWING
        )
    );
    await page.keyboard.press(backwards ? "Shift+Tab" : "Tab");
  }
  throw Error(
    "Keyboard could not reach " +
      (await locator.evaluate(
        (el) => el.getAttribute("aria-label") || el.textContent || el.id
      ))
  );
};
const activate = async (locator) => {
  await tabTo(locator);
  await page.keyboard.press("Enter");
};
const enter = async (locator, text) => {
  await tabTo(locator);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(text);
};
const toggle = async (locator, value) => {
  await tabTo(locator);
  if ((await locator.isChecked()) !== value) await page.keyboard.press("Space");
  assert.equal(await locator.isChecked(), value);
};
const select = async (locator, value) => {
  const label = await locator
    .locator("option")
    .evaluateAll(
      (nodes, value) =>
        nodes
          .find((el) => el.value === value && !el.disabled)
          ?.textContent.trim(),
      value
    );
  assert.ok(label, "Requested labeled option exists");
  await tabTo(locator);
  // macOS headless Chrome ignores arrow selection even in plain HTML. Native
  // type-ahead is a real keyboard path and does not invoke DOM selectOption.
  await page.keyboard.type(label, { delay: 25 });
  await page.keyboard.press("Tab");
  assert.equal(
    await locator.inputValue(),
    value,
    "Native keyboard type-ahead chooses requested option"
  );
};
const status = async () =>
  (await page.getByRole("status").allTextContents())
    .map((t) => t.trim())
    .filter(Boolean)
    .join("\n");
const labelAudit = async (scope, label) => {
  const missing = await scope
    .locator("input:not([type=hidden]),select,textarea,button")
    .evaluateAll((nodes) =>
      nodes
        .filter(
          (el) =>
            el.getClientRects().length && !el.closest("[inert]") && !el.disabled
        )
        .filter((el) => {
          const ids = el.getAttribute("aria-labelledby")?.split(/\s+/) ?? [];
          return !(
            el.getAttribute("aria-label") ||
            ids
              .map((id) => document.getElementById(id)?.textContent ?? "")
              .join(" ") ||
            Array.from(el.labels ?? [])
              .map((n) => n.textContent)
              .join(" ") ||
            (el.tagName === "BUTTON" ? el.textContent : "")
          ).trim();
        })
        .map((el) => ({ tag: el.tagName, id: el.id, type: el.type }))
    );
  evidence.push({ phase, labelAudit: label, missing });
  await check(!missing.length, label + " has unnamed visible controls", {
    missing
  });
};
const colors = (locator) =>
  locator.evaluate((el) => {
    const rgba = (color) => {
      const m = color.match(/^rgba?\(([^)]+)\)$/);
      if (!m) return null;
      const a = m[1].split(/[,\s/]+/).map(Number);
      return a.length === 3 ? [...a, 1] : a;
    };
    const over = (fg, bg) =>
      fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]));
    const parents = [];
    for (let n = el; n; n = n.parentElement) parents.unshift(n);
    let bg = [255, 255, 255],
      image = false,
      parentImage = false,
      parentBg = bg,
      opacity = 1;
    for (const n of parents) {
      const s = getComputedStyle(n),
        color = rgba(s.backgroundColor);
      if (n === el) {
        parentBg = [...bg];
        parentImage = image;
      }
      if (color) {
        bg = over(color, bg);
        if (color[3] === 1) image = false;
      }
      if (s.backgroundImage !== "none") image = true;
      opacity *= Number(s.opacity);
    }
    const s = getComputedStyle(el),
      text = rgba(s.color),
      outline = rgba(s.outlineColor);
    const lum = (rgb) =>
      rgb
        .map((v) => {
          const n = v / 255;
          return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
        })
        .reduce((a, n, i) => a + n * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (rgb, background = bg) => {
      const a = lum(rgb),
        b = lum(background);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    return {
      foreground: s.color,
      background: bg,
      ratio: text ? ratio(over(text, bg)) : null,
      minimum:
        parseFloat(s.fontSize) >= 24 ||
        (parseFloat(s.fontSize) >= 18.66 && parseInt(s.fontWeight) >= 700)
          ? 3
          : 4.5,
      outline: {
        style: s.outlineStyle,
        width: s.outlineWidth,
        color: s.outlineColor,
        offset: s.outlineOffset,
        background: parseFloat(s.outlineOffset) >= 0 ? parentBg : bg,
        image: parseFloat(s.outlineOffset) >= 0 ? parentImage : image,
        ratio: outline
          ? parseFloat(s.outlineOffset) >= 0
            ? ratio(over(outline, parentBg), parentBg)
            : ratio(over(outline, bg))
          : null
      },
      focusVisible: el.matches(":focus-visible"),
      shadow: s.boxShadow,
      image,
      opacity
    };
  });
const visual = async (label, samples) => {
  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await settle();
    for (const [name, locator] of samples) {
      await locator.waitFor();
      const color = await colors(locator);
      evidence.push({ phase, sample: label + ": " + name, scheme, color });
      if (!color.image && color.opacity === 1 && color.ratio !== null) {
        contrastChecks[scheme].text++;
        await check(
          color.ratio + 1e-6 >= color.minimum,
          label + ": insufficient sampled text contrast",
          { scheme, name, ...color }
        );
      }
    }
    const locator = samples[0][1];
    await tabTo(locator);
    const color = await colors(locator);
    evidence.push({ phase, sample: label + ": keyboard focus", scheme, color });
    await check(
      color.focusVisible &&
        ((color.outline.style !== "none" &&
          parseFloat(color.outline.width) > 0) ||
          color.shadow !== "none"),
      label + ": keyboard focus lacks a visible indicator",
      { scheme, color }
    );
    if (
      color.outline.style !== "none" &&
      color.outline.ratio !== null &&
      !color.outline.image &&
      color.opacity === 1
    ) {
      contrastChecks[scheme].focus++;
      await check(
        color.outline.ratio + 1e-6 >= 3,
        label + ": insufficient sampled focus-outline contrast",
        { scheme, color }
      );
    }
  }
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  await settle();
  const size = await page.evaluate(() => ({
    width: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    overflowing: Array.from(document.querySelectorAll("main *"))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.width &&
          (r.right > innerWidth + 1 || r.left < -1) &&
          !el.closest("[inert]")
        );
      })
      .slice(0, 20)
      .map((el) => ({
        tag: el.tagName,
        className: String(el.className),
        text: el.textContent?.trim().slice(0, 90),
        width: el.getBoundingClientRect().width,
        right: el.getBoundingClientRect().right
      }))
  }));
  evidence.push({ phase, resizing: label, ...size });
  await check(
    size.documentWidth <= size.width + 1,
    label + ": page overflows at 320px with 200% text",
    size
  );
  await page.screenshot({
    path: join(output, label + "-320-text200.png"),
    fullPage: true
  });
  await samples[0][1].scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(output, label + "-viewport-text200.png")
  });
  const motion = await page
    .locator("main *,[role=dialog] *")
    .evaluateAll((nodes) =>
      nodes
        .filter((el) => el.getClientRects().length)
        .map((el) => ({
          tag: el.tagName,
          className: String(el.className).slice(0, 100),
          duration: getComputedStyle(el).animationDuration,
          transition: getComputedStyle(el).transitionDuration,
          behavior: getComputedStyle(el).scrollBehavior
        }))
        .filter(
          (x) =>
            x.duration.split(",").some((n) => parseFloat(n) > 0.01) ||
            x.transition.split(",").some((n) => parseFloat(n) > 0.01) ||
            x.behavior === "smooth"
        )
        .slice(0, 12)
    );
  evidence.push({ phase, reducedMotion: label, motion });
  await check(
    !motion.length,
    label + ": sampled motion remains under reduced motion",
    { motion }
  );
  await page.evaluate(() =>
    document.documentElement.style.removeProperty("font-size")
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await settle();
  save();
};
const focusReturn = async (locator, label) => {
  await locator.waitFor();
  await settle();
  const focus = await focusReceipt(label);
  await check(
    await locator.evaluate((el) => el === document.activeElement),
    label + ": focus did not return to the initiating control",
    focus
  );
};
async function listingJourney() {
  phase = "listing create and invalid publication";
  const title = "Fictional keyboard table " + randomUUID().slice(0, 8);
  await go("/platform/exchange/new");
  const form = page.getByRole("form", { name: "Listing editor", exact: true });
  const titleField = form.getByLabel("Title (required to publish)", {
    exact: true
  });
  await enter(titleField, title);
  await labelAudit(form, "Listing editor");
  await activate(
    form.getByRole("button", { name: "Save a private draft", exact: true })
  );
  await page.waitForURL((url) =>
    /\/platform\/exchange\/[^/]+\/edit$/.test(url.pathname)
  );
  assert.equal(new URL(page.url()).hash, "#listing-editor-heading");
  await titleField.waitFor();
  const id = new URL(page.url()).pathname.split("/")[3];
  await focusReceipt("listing draft confirmed, before next Tab");
  assert.equal(await titleField.inputValue(), title);
  const confirm = form.getByRole("checkbox", {
    name: /I may publish this listing/
  });
  await toggle(confirm, true);
  await activate(button("Publish as active"));
  await wait(async () => /Use 1 to 5000|description/i.test(await status()));
  const notice = await status(),
    focus = await focusReceipt(
      "listing invalid publication settled, before next Tab"
    );
  await check(
    /description/i.test(notice),
    "Listing publication error does not identify the missing description field",
    { notice, focus, source: "lib/platform/exchange-input.ts:312" }
  );
  const repeated = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/platform/exchange" &&
      response.request().method() === "POST"
  );
  await toggle(confirm, true);
  await activate(button("Publish as active"));
  assert.equal((await repeated).status(), 400);
  await wait(() => titleField.isEnabled());
  await settle();
  const repeatFocus = await focusReceipt(
    "repeated listing invalid publication settled, before next Tab"
  );
  await check(
    !["BODY", "HTML"].includes(repeatFocus.tag),
    "Repeated validation loses keyboard position",
    repeatFocus
  );
  assert.equal(
    (await db.exchangeListing.findUniqueOrThrow({ where: { id } })).state,
    "DRAFT"
  );
  await enter(
    form.getByLabel("Description (required to publish)", { exact: true }),
    "Fictional sound wooden table. Collect in the selected public area."
  );
  await select(
    form.getByLabel("Category (required to publish)", { exact: true }),
    "FURNITURE"
  );
  await select(
    form.getByLabel("Condition (required to publish)", { exact: true }),
    "GOOD"
  );
  await select(form.getByLabel("Country", { exact: true }), "US");
  await enter(
    form.getByLabel("Find a town or area", { exact: true }),
    "Chicago"
  );
  await activate(form.getByRole("button", { name: "Find area", exact: true }));
  await activate(form.getByRole("button", { name: /^Chicago,/ }).first());
  await activate(
    form.getByRole("button", { name: "Save private draft", exact: true })
  );
  await wait(async () =>
    (
      await db.exchangeListing.findUniqueOrThrow({ where: { id } })
    ).description.includes("wooden")
  );
  await wait(() => titleField.isEnabled());
  await focusReceipt("listing repaired draft saved, before next Tab");
  await toggle(confirm, true);
  await activate(button("Publish as active"));
  await wait(
    async () =>
      (await db.exchangeListing.findUniqueOrThrow({ where: { id } })).state ===
      "ACTIVE"
  );
  await wait(() => titleField.isEnabled());
  await focusReceipt("listing published, before next Tab");
  await visual("listing-editor", [
    ["Title", titleField],
    [
      "Description",
      form.getByLabel("Description (required to publish)", { exact: true })
    ]
  ]);
  ok(
    "Keyboard creates a private listing, repairs invalid publication through labeled fields and publishes without losing title"
  );
  phase = "listing filtered list detail edit Back";
  await activate(
    page.getByRole("link", { name: "Browse listings", exact: true })
  );
  const filters = page.getByRole("form", {
    name: "Filter Exchange listings",
    exact: true
  });
  await enter(filters.getByLabel("Search listings", { exact: true }), title);
  await activate(
    filters.getByRole("button", { name: "Show listings", exact: true })
  );
  await page.waitForURL((url) => url.searchParams.get("q") === title);
  const link = page.getByRole("link", { name: title, exact: true });
  await link.waitFor();
  const filtered = page.url();
  await activate(link);
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  const edit = page.locator(`a[href*="/platform/exchange/${id}/edit"]`).first();
  await visual("listing-detail", [["Edit", edit]]);
  const detail = page.url();
  await activate(edit);
  await titleField.waitFor();
  await page.goBack();
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  assert.equal(page.url(), detail);
  await focusReceipt("native Back from listing editor");
  await page.goBack();
  await link.waitFor();
  assert.equal(page.url(), filtered);
  await focusReceipt("native Back to filtered listing list");
  ok(
    "Keyboard filtering and list/detail/edit navigation retain the exact filtered URL on native Back"
  );
}
async function mediaJourney() {
  phase = "media draft invalid source reviewed publication";
  const title = "Fictional keyboard recording " + randomUUID().slice(0, 8);
  await go("/platform/media/new");
  const form = page.getByRole("form", { name: "Media editor", exact: true });
  await enter(form.getByLabel("Title", { exact: true }), title);
  await enter(
    form.getByLabel("Description", { exact: true }),
    "Fictional recording with readable metadata and no external preview."
  );
  await select(form.getByLabel("Format", { exact: true }), "SERMON");
  await select(form.getByLabel("Audio or video", { exact: true }), "VIDEO");
  await select(form.getByLabel("Catalog audience", { exact: true }), "PUBLIC");
  await labelAudit(form, "Media editor");
  await activate(
    form.getByRole("button", { name: "Save private draft", exact: true })
  );
  await wait(
    async () =>
      !!(await db.mediaCatalogItem.findFirst({
        where: { ownerId: actor.id, title }
      }))
  );
  const id = (
    await db.mediaCatalogItem.findFirstOrThrow({
      where: { ownerId: actor.id, title }
    })
  ).id;
  await button("Publish media").waitFor();
  await focusReceipt("media draft confirmed, before next Tab");
  const source = form.getByLabel("Public source URL", { exact: true });
  await enter(source, "https://example.test/unsupported-recording");
  await activate(button("Publish media"));
  await page
    .getByRole("alert")
    .filter({ hasText: /canonical public item link/ })
    .waitFor();
  const notice = await status(),
    focus = await focusReceipt("media invalid source settled, before next Tab");
  await check(
    /source|url|link/i.test(notice),
    "Media invalid-source error does not identify source-link recovery",
    { notice, focus }
  );
  const sourceError = await source.evaluate((el) => ({
    invalid: el.getAttribute("aria-invalid"),
    described: (el.getAttribute("aria-describedby") || "")
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent || "")
      .join(" ")
  }));
  await check(
    sourceError.invalid === "true" &&
      /canonical public item link/.test(sourceError.described),
    "Invalid media source is not associated with its field and recovery description",
    sourceError
  );
  assert.equal(
    (await db.mediaCatalogItem.findUniqueOrThrow({ where: { id } })).state,
    "DRAFT"
  );
  await enter(source, "https://youtu.be/abcdefghijk");
  await toggle(
    form.getByRole("checkbox", {
      name: "I understand this source and catalog audience.",
      exact: true
    }),
    true
  );
  await toggle(
    form.getByRole("checkbox", { name: /I reviewed this exact source/ }),
    true
  );
  await activate(button("Publish media"));
  await wait(
    async () =>
      (await db.mediaCatalogItem.findUniqueOrThrow({ where: { id } })).state ===
      "PUBLISHED"
  );
  await button("Save reviewed publication").waitFor();
  await focusReceipt("media publication confirmed, before next Tab");
  const stableNavigation = page
    .getByRole("link", { name: "Settings", exact: true })
    .first();
  await tabTo(stableNavigation);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await form.waitFor({ state: "hidden" });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await form.waitFor();
  await settle();
  await check(
    await stableNavigation.evaluate((el) => el === document.activeElement),
    "Media access recheck steals focus from stable navigation",
    await active("controlled blur/focus recheck")
  );
  assert.equal(await source.getAttribute("aria-invalid"), null);
  await visual("media-editor", [
    ["Title", form.getByLabel("Title", { exact: true })],
    ["Source", source]
  ]);
  ok(
    "Keyboard draft, invalid-source recovery and deliberate source/audience/rights review publish media through the actual editor"
  );
  phase = "media library detail QR keyboard return";
  await activate(page.getByRole("link", { name: "Browse media", exact: true }));
  const link = page.getByRole("link", { name: title, exact: true });
  await link.waitFor();
  await activate(link);
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  await activate(
    page.locator("summary").filter({ hasText: /^Share publicly$/ })
  );
  const qr = button("Show QR code");
  await qr.waitFor();
  await visual("media-detail-share", [
    ["QR action", qr],
    [
      "Public link",
      page.getByRole("textbox", { name: "Public link", exact: true })
    ]
  ]);
  await activate(qr);
  const dialog = page.getByRole("dialog", {
    name: "Public link QR code",
    exact: true
  });
  await dialog.waitFor();
  await page.waitForFunction(
    () => document.querySelector("dialog canvas")?.width === 512
  );
  const pixels = await dialog.locator("canvas").evaluate((canvas) => ({
    data: Array.from(
      canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height)
        .data
    ),
    width: canvas.width,
    height: canvas.height
  }));
  assert.equal(
    jsQR(Uint8ClampedArray.from(pixels.data), pixels.width, pixels.height)
      ?.data,
    config.origin + "/platform/media/" + id
  );
  await focusReceipt("QR opened by keyboard");
  await check(
    await dialog.evaluate((el) => el.contains(document.activeElement)),
    "QR opens without focus inside the modal"
  );
  await visual("media-qr", [
    [
      "Close",
      dialog.getByRole("button", { name: "Close QR code", exact: true })
    ]
  ]);
  await activate(
    dialog.getByRole("button", { name: "Close QR code", exact: true })
  );
  await dialog.waitFor({ state: "detached" });
  await focusReturn(qr, "QR close-button return");
  await activate(qr);
  await dialog.waitFor();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  await focusReturn(qr, "QR Escape return");
  ok(
    "Keyboard library/detail sharing renders the canonical QR and restores its initiating control after keyboard Close and Escape"
  );
}
async function settingsJourney() {
  phase = "settings search resource choices focused reading";
  for (const content of [
    "Fictional accessibility reading post " + randomUUID(),
    "Fictional second accessible reading post"
  ])
    await postCommand(db, actor.token, {
      operation: "create",
      requestKey: randomUUID(),
      audience: "PUBLIC",
      content,
      resourceReferences: []
    });
  await go("/platform/settings");
  const search = page.getByLabel("Search settings", { exact: true });
  await enter(search, "Default feed");
  await page.keyboard.press("Enter");
  await activate(
    page
      .getByRole("region", { name: "Settings search results", exact: true })
      .getByRole("link", { name: /Default feed/ })
  );
  await activate(button("Feed Settings"));
  const form = page.getByRole("form", {
    name: "Save feed settings",
    exact: true
  });
  await form.waitFor();
  await select(form.getByLabel("Saved feed", { exact: true }), "latest");
  const resources = form.getByRole("group", {
    name: "Posts sharing resources",
    exact: true
  });
  await toggle(
    resources.getByRole("checkbox", { name: "Events", exact: true }),
    false
  );
  await labelAudit(form, "Feed Settings");
  await visual("feed-settings", [
    ["Saved feed", form.getByLabel("Saved feed", { exact: true })],
    [
      "Save",
      form.getByRole("button", { name: "Save feed settings", exact: true })
    ]
  ]);
  await activate(
    form.getByRole("button", { name: "Save feed settings", exact: true })
  );
  await page.waitForURL(
    (url) =>
      url.pathname === "/platform" && url.searchParams.get("feed") === "latest"
  );
  await form.waitFor({ state: "detached" });
  await button("Feed Settings").waitFor();
  await settle();
  const savedFocus = await focusReceipt("feed choices saved, before next Tab");
  await check(
    savedFocus.tag !== "BODY" && savedFocus.tag !== "HTML",
    "Successful feed-setting save loses keyboard position",
    savedFocus
  );
  await activate(button("Feed Settings"));
  await resources.waitFor();
  assert.equal(
    await resources
      .getByRole("checkbox", { name: "Events", exact: true })
      .isChecked(),
    false
  );
  await activate(button("Feed Settings"));
  await form.waitFor({ state: "detached" });
  const open = button("Open My feed");
  await open.waitFor();
  await page.waitForFunction(
    () => !!new URL(location.href).searchParams.get("feedCursor")
  );
  const state = () => {
    const u = new URL(page.url());
    return {
      feed: u.searchParams.get("feed"),
      cursor: u.searchParams.get("feedCursor"),
      post: u.searchParams.get("post")
    };
  };
  const before = state();
  await activate(open);
  const focused = page.getByRole("dialog", { name: "My feed", exact: true });
  await focused.waitFor();
  await focusReceipt("focused reader initial focus");
  await check(
    await focused.evaluate((el) => el.contains(document.activeElement)),
    "Focused reader opens without keyboard focus inside"
  );
  const next = focused.getByRole("button", { name: "Next", exact: true });
  if ((await next.getAttribute("aria-disabled")) !== "true") {
    const id = state().post;
    await activate(next);
    await wait(async () => state().post !== id);
    await activate(
      focused.getByRole("button", { name: "Previous", exact: true })
    );
    await wait(async () => state().post === id);
  }
  await visual("focused-reader", [
    [
      "Close",
      focused.getByRole("button", { name: "Close My feed", exact: true })
    ],
    ["Next", next]
  ]);
  await page.keyboard.press("Escape");
  await focused.waitFor({ state: "detached" });
  await focusReturn(open, "Focused reader Escape return");
  assert.deepEqual(state(), before);
  ok(
    "Keyboard settings search reaches Feed Settings, persists resource choices and navigates/returns from focused reading with exact feed state and no gestures"
  );
  phase = "reading settings and data saver photo";
  await go("/platform/settings");
  await enter(search, "Reading preferences");
  await page.keyboard.press("Enter");
  await activate(
    page
      .getByRole("region", { name: "Settings search results", exact: true })
      .getByRole("link", { name: /Reading preferences/ })
  );
  const appearance = page.getByRole("region", {
    name: "Appearance and reading",
    exact: true
  });
  await appearance.waitFor();
  await toggle(
    appearance.getByRole("checkbox", { name: /^Reduce photo data/ }),
    true
  );
  await toggle(
    appearance.getByRole("checkbox", { name: /^Reduce motion/ }),
    true
  );
  await select(
    appearance.getByLabel("Post text size", { exact: true }),
    "largest"
  );
  await activate(
    appearance.getByRole("button", {
      name: "Save display choices",
      exact: true
    })
  );
  await page
    .getByText("Reading preferences saved in this browser.", { exact: true })
    .waitFor();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await settle();
  const savedMotion = await appearance.evaluate((region) => ({
    osReduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
    saved: region
      .closest(".platform-design[data-reduce-motion]")
      ?.getAttribute("data-reduce-motion"),
    moving: Array.from(document.querySelectorAll("main *"))
      .filter((el) => el.getClientRects().length)
      .filter((el) => {
        const s = getComputedStyle(el);
        return (
          [s.animationDuration, s.transitionDuration].some((value) =>
            value
              .split(",")
              .some(
                (n) =>
                  parseFloat(n) / (n.trim().endsWith("ms") ? 1000 : 1) > 0.01
              )
          ) || s.scrollBehavior === "smooth"
        );
      })
      .map((el) => ({ tag: el.tagName, className: String(el.className) }))
      .slice(0, 12)
  }));
  evidence.push({ phase, independentlySavedReducedMotion: savedMotion });
  await check(
    !savedMotion.osReduced &&
      savedMotion.saved === "true" &&
      savedMotion.moving.length === 0,
    "Saved Reduce motion does not work independently of OS preference",
    savedMotion
  );
  await visual("reading-settings", [
    ["Appearance", appearance.getByLabel("Appearance", { exact: true })],
    ["Text size", appearance.getByLabel("Post text size", { exact: true })]
  ]);
  await go("/platform/profile/" + photoOwner.username);
  const trigger = page.getByRole("button", {
    name: `Enlarge ${photoOwner.name}’s profile photo`,
    exact: true
  });
  await trigger.waitFor();
  const start = images.length;
  await activate(trigger);
  const dialog = page.getByRole("dialog", {
    name: "Photo viewer",
    exact: true
  });
  await dialog.waitFor();
  const image = dialog.getByRole("img", {
    name: "Fictional teal courtyard",
    exact: true
  });
  await image.waitFor();
  await wait(async () =>
    image.evaluate((el) => el.complete && el.naturalWidth > 0)
  );
  const previewWidth = await image.evaluate((el) => el.naturalWidth);
  assert.ok((await image.getAttribute("src")).endsWith("/thumb"));
  assert.equal(
    images.slice(start).some((url) => /\/(large|original)$/.test(url)),
    false
  );
  const largerResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.startsWith("/api/platform/images/") &&
      new URL(response.url()).pathname.endsWith("/large") &&
      response.status() === 200
  );
  await activate(
    dialog.getByRole("button", { name: "Load larger photo", exact: true })
  );
  const photoViewport = dialog.locator(".gc-photo-viewport");
  await focusReturn(photoViewport, "Load larger photo returns focus to photo");
  await largerResponse;
  await wait(async () => (await image.getAttribute("src")).endsWith("/large"));
  await wait(() =>
    image.evaluate(
      (el, width) => el.complete && el.naturalWidth > width,
      previewWidth
    )
  );
  evidence.push({
    phase,
    photoPixels: {
      previewWidth,
      loadedWidth: await image.evaluate((el) => el.naturalWidth)
    }
  });
  await activate(dialog.getByRole("button", { name: "Zoom in", exact: true }));
  await activate(dialog.getByRole("button", { name: "Zoom in", exact: true }));
  await wait(() =>
    dialog.getByRole("button", { name: "Zoom in", exact: true }).isDisabled()
  );
  await focusReturn(photoViewport, "Maximum zoom returns focus to photo");
  await activate(
    dialog.getByRole("button", { name: "Fit photo", exact: true })
  );
  await focusReturn(photoViewport, "Fit photo returns focus to photo");
  await visual("photo-data-saver", [
    ["Close", dialog.getByRole("button", { name: "Close photo", exact: true })],
    ["Zoom", dialog.getByRole("button", { name: "Zoom in", exact: true })]
  ]);
  assert.equal(
    images.some((url) => url.endsWith("/original")),
    false
  );
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  await focusReturn(trigger, "Photo Escape return");
  ok(
    "Actual profile photo uses a small data-saver preview, explicit keyboard larger/zoom/fit controls and focus recovery without original-image requests"
  );
  // The profile avatar endpoint intentionally exposes only the current image.
  // A real two-photo post exercises the same viewer's finite gallery controls.
  phase = "photo gallery boundaries and failed image recovery";
  const galleryPost = await postCommand(db, photoOwner.token, {
    operation: "create",
    requestKey: randomUUID(),
    audience: "PUBLIC",
    content: "Fictional keyboard photo gallery " + randomUUID(),
    resourceReferences: []
  });
  for (const [name, color] of [
    ["first", "#397186"],
    ["second", "#815f42"]
  ]) {
    await uploadImage(
      db,
      photoOwner.token,
      {
        purpose: "POST_PHOTO",
        targetId: galleryPost.id,
        requestKey: randomUUID(),
        alt: "Fictional " + name + " gallery photo"
      },
      await sharp({
        create: { width: 1400, height: 1000, channels: 3, background: color }
      })
        .png()
        .toBuffer()
    );
  }
  await go("/platform/posts/" + galleryPost.id);
  await page.locator('[aria-label="Post photos"]').scrollIntoViewIfNeeded();
  const galleryTrigger = button("Open photo 1 of 2");
  await activate(galleryTrigger);
  await dialog
    .getByRole("img", { name: "Fictional first gallery photo", exact: true })
    .waitFor();
  const nextPhoto = dialog.getByRole("button", {
    name: "Next photo",
    exact: true
  });
  const previousPhoto = dialog.getByRole("button", {
    name: "Previous photo",
    exact: true
  });
  assert.ok(await previousPhoto.isDisabled());
  await activate(nextPhoto);
  await dialog
    .getByRole("img", { name: "Fictional second gallery photo", exact: true })
    .waitFor();
  assert.ok(await nextPhoto.isDisabled());
  await focusReturn(photoViewport, "Last photo returns focus to photo");
  await activate(previousPhoto);
  const firstGalleryImage = dialog.getByRole("img", {
    name: "Fictional first gallery photo",
    exact: true
  });
  await firstGalleryImage.waitFor();
  assert.ok(await previousPhoto.isDisabled());
  await focusReturn(photoViewport, "First photo returns focus to photo");
  const failedLargeUrl = new URL(
    (await firstGalleryImage.getAttribute("src")).replace(/\/thumb$/, "/large"),
    config.origin
  ).href;
  let deliberatelyFailed = 0;
  await page.route(failedLargeUrl, (route) => {
    deliberatelyFailed++;
    return route.abort("failed");
  });
  try {
    await activate(
      dialog.getByRole("button", { name: "Load larger photo", exact: true })
    );
    await dialog
      .getByText(
        "This photo could not be loaded. It may no longer be available.",
        { exact: true }
      )
      .waitFor();
    await photoViewport.waitFor({ state: "detached" });
    assert.equal(deliberatelyFailed, 1);
    await focusReturn(
      dialog.getByRole("button", { name: "Close photo", exact: true }),
      "Failed larger image removal retains Close focus"
    );
    await activate(
      dialog.getByRole("button", { name: "Zoom in", exact: true })
    );
    await activate(
      dialog.getByRole("button", { name: "Zoom in", exact: true })
    );
    await focusReturn(
      dialog.getByRole("button", { name: "Close photo", exact: true }),
      "Failed-image maximum zoom retains Close focus"
    );
    await activate(
      dialog.getByRole("button", { name: "Fit photo", exact: true })
    );
    await focusReturn(
      dialog.getByRole("button", { name: "Close photo", exact: true }),
      "Failed-image Fit retains Close focus"
    );
    await page.screenshot({
      path: join(output, "failed-photo-close-focus.png")
    });
  } finally {
    await page.unroute(failedLargeUrl);
  }
  await activate(
    dialog.getByRole("button", { name: "Close photo", exact: true })
  );
  await dialog.waitFor({ state: "detached" });
  await focusReturn(galleryTrigger, "Gallery keyboard Close returns to opener");
  await activate(galleryTrigger);
  await firstGalleryImage.waitFor();
  let failureHeld = false,
    releaseFailure,
    finishFailure;
  const failureGate = new Promise((resolve) => {
    releaseFailure = resolve;
  });
  const failureFinished = new Promise((resolve) => {
    finishFailure = resolve;
  });
  const delayedFailure = async (route) => {
    failureHeld = true;
    try {
      await failureGate;
      await route.abort("failed");
    } finally {
      finishFailure();
    }
  };
  await page.route(failedLargeUrl, delayedFailure);
  try {
    await activate(
      dialog.getByRole("button", { name: "Load larger photo", exact: true })
    );
    await wait(() => failureHeld, "Deliberate larger-image request is held");
    await focusReturn(
      photoViewport,
      "Pending larger image retains photo focus"
    );
    const zoomControl = dialog.getByRole("button", {
      name: "Zoom in",
      exact: true
    });
    await activate(zoomControl);
    assert.ok(await zoomControl.isEnabled());
    releaseFailure();
    await failureFinished;
    await dialog
      .getByText(
        "This photo could not be loaded. It may no longer be available.",
        { exact: true }
      )
      .waitFor();
    await photoViewport.waitFor({ state: "detached" });
    await focusReturn(
      zoomControl,
      "Delayed failed image does not steal moved focus"
    );
  } finally {
    releaseFailure();
    if (failureHeld) await failureFinished;
    await page.unroute(failedLargeUrl, delayedFailure);
  }
  await activate(
    dialog.getByRole("button", { name: "Close photo", exact: true })
  );
  await dialog.waitFor({ state: "detached" });
  await focusReturn(
    galleryTrigger,
    "Delayed failure keyboard Close returns to opener"
  );
  assert.equal(
    images.some((url) => url.endsWith("/original")),
    false
  );
  ok(
    "Keyboard gallery boundaries and failed images preserve focus, while delayed failure respects a user's changed focus"
  );
}
try {
  actor = await createActor("a11yowner");
  const reviewer = await createActor("a11yreview");
  // Public listing publication requires actual review intake coverage. This
  // isolated reviewer satisfies exchange-listings.ts publication eligibility.
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  photoOwner = await createActor("a11yphoto");
  await uploadImage(
    db,
    photoOwner.token,
    {
      purpose: "PROFILE_AVATAR",
      targetId: photoOwner.id,
      requestKey: randomUUID(),
      alt: "Fictional teal courtyard"
    },
    await sharp({
      create: { width: 1400, height: 1000, channels: 3, background: "#397186" }
    })
      .png()
      .toBuffer()
  );
  await context.addCookies([
    {
      name: sessionCookieFixtureName(config.origin),
      value: actor.token,
      url: config.origin,
      httpOnly: true,
      secure: true,
      sameSite: "Lax"
    }
  ]);
  for (const journey of [listingJourney, mediaJourney, settingsJourney]) {
    try {
      await journey();
    } catch (error) {
      await finding("Journey did not complete: " + String(error), {
        stack: error.stack,
        active: await active("failure"),
        url: page.url()
      });
      await page.close();
      page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on("pageerror", (error) =>
        errors.push({ phase, message: error.message })
      );
      page.on("dialog", (dialog) => dialog.accept());
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (url.pathname.startsWith("/api/platform/images/"))
          images.push(url.pathname);
      });
    }
  }
  for (const scheme of ["light", "dark"])
    await check(
      contrastChecks[scheme].text > 0 && contrastChecks[scheme].focus > 0,
      "No actual text/focus contrast samples were evaluated in " + scheme,
      contrastChecks[scheme]
    );
  console.log("CONTRAST " + JSON.stringify(contrastChecks));
  await check(!errors.length, "Browser reported runtime errors", { errors });
  await check(
    !external.length,
    "Journey attempted external requests without activation",
    { external }
  );
  save();
  console.log("EVIDENCE " + output);
  if (findings.length) process.exitCode = 1;
} finally {
  await browser.close();
  await db.$disconnect();
}
