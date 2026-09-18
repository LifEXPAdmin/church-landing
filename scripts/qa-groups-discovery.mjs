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
  // Replacing the fixture cookie is not a user navigation. Let an acknowledged
  // form finish removing its temporary Back entry before switching identities.
  await page.waitForFunction(() => !history.state?.gcPhotoWork);
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
try {
  const owner = await createPortalActor(db, "churchgroupui"),
    peer = await createPortalActor(db, "churchgrouppeer");
  const church = await db.church.create({
    data: {
      slug: "group-ui-" + randomUUID(),
      name: "Fictional group filter church " + randomUUID(),
      summary: "Isolated group discovery and church permissions",
      communityListed: true
    }
  });
  await db.churchConnection.createMany({
    data: [owner, peer].map((x) => ({
      userId: x.id,
      churchId: church.id,
      state: "APPROVED"
    }))
  });
  const grant = await db.churchCapabilityGrant.create({
    data: {
      userId: owner.id,
      churchId: church.id,
      capability: "MANAGE_CHURCH_GROUPS"
    }
  });
  await signIn(owner);
  await go("/platform/groups/new");
  const slug = "church-group-" + randomUUID(),
    name = "Fictional life group " + randomUUID(),
    topic = "Fictional topic " + randomUUID();
  const form = page.getByRole("form", { name: "Create group", exact: true });
  for (const [label, value] of [
    ["Group name", name],
    ["Group address", slug],
    ["Purpose", "An isolated church life group with independent membership."],
    [
      "Group rules",
      "Join this group deliberately and protect members' private discussions."
    ],
    ["Topic", topic]
  ])
    await form.getByLabel(new RegExp("^" + label)).fill(value);
  await form.getByLabel(/^Group type/).selectOption("CHURCH_LIFE");
  await form.getByLabel(/^Church connection/).selectOption(church.id);
  await form.getByLabel(/^Meeting format/).selectOption("ONLINE");
  await form
    .getByLabel("I have read and accept the current group rules", {
      exact: true
    })
    .check();
  await form.getByLabel(/I agree that my name and profile identify/).check();
  await form.getByRole("button", { name: "Create group", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/platform/groups/" + slug);
  const group = await db.gatherGroup.findUniqueOrThrow({ where: { slug } });
  assert.equal(group.churchId, church.id);
  await page.getByText("Topic: " + topic, { exact: true }).waitFor();
  ok(
    "An explicitly assigned church-group manager creates a church life group with its own rules and topic"
  );
  await signIn(null);
  await go("/platform/groups?q=" + encodeURIComponent(topic));
  await page.getByRole("link", { name, exact: true }).waitFor();
  await page.getByRole("link", { name: topic, exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get("q"), topic);
  await page
    .getByRole("link", { name: "Groups from " + church.name, exact: true })
    .click();
  await page.waitForURL((u) => u.searchParams.get("churchId") === church.id);
  await page
    .getByText("Showing groups linked to the selected church.", { exact: true })
    .waitFor();
  const search = page.getByRole("form", {
    name: "Find adult groups",
    exact: true
  });
  await search
    .getByLabel("Search group names, purposes and topics", { exact: true })
    .fill(topic);
  await search
    .getByLabel(/^Meeting format/)
    .selectOption("ONLINE");
  await search
    .getByRole("button", { name: "Search groups", exact: true })
    .click();
  await page.getByRole("link", { name, exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("churchId"), church.id);
  assert.equal(new URL(page.url()).searchParams.get("format"), "ONLINE");
  await bounded();
  await page.screenshot({
    path: output + "/church-topic-filter-phone.png",
    fullPage: true
  });
  await page
    .getByRole("link", { name: "Clear church filter", exact: true })
    .click();
  await page.waitForURL(
    (u) => u.pathname === "/platform/groups" && !u.searchParams.has("churchId")
  );
  ok(
    "Public topic and church filters work, survive a new format/search submission and can be explicitly cleared"
  );
  await signIn(peer);
  await go("/platform/groups/" + slug);
  await page
    .getByText("Your membership: not joined.", { exact: true })
    .waitFor();
  assert.equal(
    await db.gatherGroupMembership.count({
      where: { userId: peer.id, groupId: group.id }
    }),
    0
  );
  const denied = await context.request.get(
    config.origin + "/api/platform/groups?view=discussion&slug=" + slug
  );
  assert.equal(denied.status(), 404);
  ok(
    "Approved church membership alone neither joins the group nor exposes its private discussions"
  );
  await signIn(owner);
  await go("/platform/groups/" + slug + "/manage");
  await page
    .getByRole("form", { name: "Save group details", exact: true })
    .waitFor();
  await db.churchCapabilityGrant.update({
    where: { id: grant.id },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByRole("form", { name: "Save group details", exact: true })
    .waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => (document.documentElement.style.fontSize = "24px"));
  await bounded();
  await page.screenshot({
    path: output + "/church-authority-revoked-enlarged.png",
    fullPage: true
  });
  ok(
    "Revoked church group authority conceals an already-open management form at narrow enlarged-text width"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/receipt.json",
    JSON.stringify({ results, errors, at: new Date().toISOString() })
  );
  console.log("OUTPUT " + output);
} catch (error) {
  writeFileSync(
    output + "/failure.txt",
    await page.locator("body").innerText()
  );
  writeFileSync(
    output + "/failure.json",
    JSON.stringify({ message: String(error), errors })
  );
  await page.screenshot({ path: output + "/failure.png", fullPage: true });
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
