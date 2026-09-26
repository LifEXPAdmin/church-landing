import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";

const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the existing isolated preview artifact directory");
assert.ok(resolve(fixtureDir).startsWith(resolve(".account-test") + "/"));
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
  ACCOUNT_TEST_SINK_DIR: resolve(fixtureDir, "sink"),
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: ""
});
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase } = await import("../tests/seed-portal.ts");
const { seedSupport, requestInput } = await import("../tests/seed-support.ts");
const { supportCommand } = await import("../lib/platform/support.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
// This flag affects only the already-verified isolated seed process.
process.env.SUPPORT_INTAKE_ENABLED = "true";
const originalIntake = await db.supportIntakeSetting.findUnique({
  where: { id: "default" }
});
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
const externalRequests = [],
  browserWrites = [],
  caseRequests = [],
  errors = [],
  results = [];
await context.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (url.origin !== config.origin) {
    externalRequests.push(url.origin + url.pathname);
    await route.abort();
  } else await route.continue();
});
context.on("request", (request) => {
  const path = new URL(request.url()).pathname;
  if (path.startsWith("/platform/help/cases/")) caseRequests.push(path);
  if (!["GET", "HEAD"].includes(request.method()))
    browserWrites.push({ method: request.method(), path });
});
const page = await context.newPage();
page.setDefaultTimeout(30000);
page.on("pageerror", (error) =>
  errors.push({ path: new URL(page.url()).pathname, message: error.message })
);
const output = fixtureDir + "/support-index-browser-" + Date.now();
mkdirSync(output, { recursive: true, mode: 0o700 });
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const listRoute = "**/api/platform/support?*";
const changedNotice =
  "Your requests or access changed. Reload to inspect current details.";
const marker = "Fictional private Support index " + randomUUID();
const stamp = "2026-09-15T13:05:00.000Z";
const rows = () =>
  page
    .locator("main article")
    .filter({ has: page.locator('a[href^="/platform/help/cases/"]') });
const signIn = async (actor) => {
  await context.clearCookies();
  await context.addCookies([
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
};
const go = async (path) => {
  await page.goto(config.origin + path);
  await page.waitForLoadState("networkidle");
};
const waitRows = async (count) => {
  await page.waitForFunction(
    (expected) =>
      [...document.querySelectorAll("main article")].filter((node) =>
        node.querySelector('a[href^="/platform/help/cases/"]')
      ).length === expected,
    count
  );
};
const absent = async (text = marker) => {
  await page.waitForFunction(
    (value) => !document.body.textContent.includes(value),
    text
  );
  assert.equal(await rows().count(), 0);
};
const event = async (name) =>
  page.evaluate((type) => window.dispatchEvent(new Event(type)), name);
const restore = async () => {
  await event("focus");
  await waitRows(20);
};
const reload = async () => {
  await page
    .getByRole("button", { name: "Reload current information", exact: true })
    .click();
  await page.waitForLoadState("networkidle");
};
const bounded = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal page overflow"
  );
let fixture;
try {
  fixture = await seedSupport(db);
  for (const actor of [fixture.memberA, fixture.owner])
    await db.platformUser.update({
      where: { id: actor.id },
      data: { dateFormat: "DMY", timeFormat: "H24" }
    });
  const created = await supportCommand(
    db,
    fixture.memberA.token,
    await requestInput(db, fixture.memberA.token, { subject: marker })
  );
  await db.supportCase.update({
    where: { id: created.caseId },
    data: { createdAt: new Date(stamp), updatedAt: new Date(stamp) }
  });
  // Only pagination fixtures bypass the five-per-day create limit. All records
  // belong to this newly seeded requester and its actual fixture assignment.
  await db.supportCase.createMany({
    data: Array.from({ length: 21 }, (_, index) => ({
      requesterId: fixture.memberA.id,
      ownerGrantId: fixture.ownerGrant.id,
      ownerGrantVersion: fixture.ownerGrant.version,
      category: "ACCOUNT_WEBSITE",
      subject: `${marker} row ${String(index + 1).padStart(2, "0")}`,
      description:
        "Fictional pagination record in the isolated Support index suite.",
      createdAt: new Date(Date.parse(stamp) - (index + 1) * 60000),
      updatedAt: new Date(Date.parse(stamp) - (index + 1) * 60000)
    }))
  });
  const ownCaseCount = () =>
    db.supportCase.count({ where: { requesterId: fixture.memberA.id } });
  assert.equal(await ownCaseCount(), 22);

  for (const view of ["requests", "inbox"]) {
    await go("/platform/help/" + view);
    assert.equal(new URL(page.url()).pathname, "/platform/login");
    assert.ok(!(await page.content()).includes(marker));
    const response = await context.request.get(
      config.origin + "/api/platform/support?view=" + view
    );
    assert.equal(response.status(), 401);
  }
  ok(
    "Guest requests and assigned inbox redirect to sign-in and deny the private API"
  );

  for (const [view, actor] of [
    ["requests", fixture.memberA],
    ["inbox", fixture.owner]
  ]) {
    await signIn(actor);
    const html = await context.request.get(
      config.origin + "/platform/help/" + view
    );
    assert.equal(html.status(), 200);
    assert.ok(
      !(await html.text()).includes(marker),
      "Authenticated initial HTML and embedded scripts must not contain a private subject"
    );
    const flight = await context.request.get(
      config.origin + "/platform/help/" + view,
      { headers: { RSC: "1" } }
    );
    assert.equal(flight.status(), 200);
    assert.match(flight.headers()["content-type"], /text\/x-component/);
    assert.ok(!(await flight.text()).includes(marker));
    await go("/platform/help/" + view);
    await waitRows(20);
    await page.getByRole("link", { name: marker, exact: true }).waitFor();
    await page.getByRole("link", { name: marker, exact: true }).hover();
    await page.waitForLoadState("networkidle");
    assert.deepEqual(
      caseRequests,
      [],
      "Displaying or hovering index links must not preload private case pages"
    );
    assert.equal(
      await page.evaluate(
        (text) =>
          [...document.scripts].some((node) => node.textContent.includes(text)),
        marker
      ),
      false
    );
    assert.match(await rows().first().innerText(), /15\/09\/2026, 13:05 UTC/);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await bounded();
    }
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await bounded();
    await page.screenshot({
      path: `${output}/${view}-320-enlarged.png`,
      fullPage: true
    });
    await page.evaluate(() =>
      [...document.querySelectorAll("style")]
        .filter(
          (node) => node.textContent === "html { font-size: 200% !important; }"
        )
        .forEach((node) => node.remove())
    );
    // Private pagination starts a new document with a current-account read.
    const documentIdentity = randomUUID();
    await page.evaluate((id) => {
      window.supportIndexDocumentIdentity = id;
    }, documentIdentity);
    await page.getByRole("link", { name: "Next page", exact: true }).click();
    await page.waitForURL(
      (url) =>
        url.pathname.endsWith("/" + view) &&
        url.searchParams.get("page") === "1"
    );
    await waitRows(2);
    assert.equal(
      await page.evaluate(() => window.supportIndexDocumentIdentity),
      undefined,
      "Pagination starts a fresh document"
    );
    assert.equal(
      await page.getByRole("link", { name: marker, exact: true }).count(),
      0
    );
    await page.evaluate((id) => {
      window.supportIndexDocumentIdentity = id;
    }, documentIdentity);
    await page
      .getByRole("link", { name: "Previous page", exact: true })
      .click();
    await page.waitForURL((url) => url.searchParams.get("page") === "0");
    await waitRows(20);
    await page.getByRole("link", { name: marker, exact: true }).waitFor();
    assert.equal(
      await page.evaluate(() => window.supportIndexDocumentIdentity),
      undefined,
      "Previous page also starts a fresh document"
    );
    ok(
      `${view}: private subjects stay out of initial serialization, current regional dates and enlarged phone layout fit, and actual 20-row Next/Previous navigation works`
    );

    for (const trigger of ["blur", "offline", "pagehide"]) {
      await event(trigger);
      await absent();
      if (trigger === "offline") {
        await page
          .getByRole("button", { name: "Recheck current access", exact: true })
          .click();
        await waitRows(20);
      } else await restore();
    }
    ok(
      `${view}: blur, offline and pagehide remove full DOM subjects; a fresh same-owner read restores them`
    );

    for (const source of ["identity", "list"]) {
      const routePattern =
        source === "identity"
          ? "**/api/platform/profile?view=identity"
          : listRoute;
      await page.route(routePattern, (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Fictional Support index read outage"
          })
        })
      );
      await event("focus");
      await page
        .getByText(
          source === "identity"
            ? "Your sign-in could not be checked. Reconnect and try again."
            : "Fictional Support index read outage",
          { exact: true }
        )
        .waitFor();
      await absent();
      await page.unroute(routePattern);
      await page
        .getByRole("button", { name: "Recheck current access", exact: true })
        .click();
      await waitRows(20);
    }
    ok(
      `${view}: identity and list outages remove retained text and recover only after an authorized read`
    );
  }

  await signIn(fixture.memberA);
  await go("/platform/help/requests");
  await waitRows(20);
  const holdRead = async () => {
    let capture,
      release,
      reads = 0;
    const captured = new Promise((resolve) => {
      capture = resolve;
    });
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    await page.route(listRoute, async (route) => {
      reads++;
      const response = await route.fetch();
      if (reads === 1) {
        capture();
        await gate;
      }
      await route.fulfill({ response });
    });
    await event("focus");
    await captured;
    return { release, reads: () => reads };
  };
  let held = await holdRead();
  await event("pagehide");
  await absent();
  held.release();
  await page.waitForLoadState("networkidle");
  await absent();
  assert.equal(held.reads(), 1);
  await page.unroute(listRoute);
  await restore();
  ok(
    "A delayed successful list response cannot resurrect subjects after pagehide"
  );

  held = await holdRead();
  await event("blur");
  await event("focus");
  await absent();
  assert.equal(held.reads(), 1);
  held.release();
  await waitRows(20);
  await page.waitForLoadState("networkidle");
  assert.equal(held.reads(), 2, "Focus queues one fresh current read");
  await page.unroute(listRoute);
  ok(
    "Focus during a held read coalesces one fresh read before restoring the current list"
  );

  held = await holdRead();
  await signIn(fixture.memberB);
  await event("blur");
  await event("focus");
  held.release();
  await page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .waitFor();
  await page.waitForLoadState("networkidle");
  await absent();
  await page.unroute(listRoute);
  await go("/platform/help/requests");
  await page
    .getByText(
      "No requests to show here. New replies will appear with an Updated label.",
      { exact: true }
    )
    .waitFor();
  await absent();
  await signIn(fixture.memberA);
  await go("/platform/help/requests");
  await waitRows(20);
  ok(
    "Account replacement during a held read denies old subjects; the other account sees only its own empty list"
  );

  const newSubject = "Changed " + marker;
  await db.supportCase.update({
    where: { id: created.caseId },
    data: {
      subject: newSubject,
      version: { increment: 1 },
      updatedAt: new Date(stamp)
    }
  });
  await event("focus");
  await page.getByText(changedNotice, { exact: true }).waitFor();
  await absent();
  await page
    .getByRole("button", { name: "Recheck current access", exact: true })
    .click();
  await page.getByText(changedNotice, { exact: true }).waitFor();
  await absent();
  await reload();
  await waitRows(20);
  await page.getByRole("link", { name: newSubject, exact: true }).waitFor();
  assert.equal(
    await page.getByRole("link", { name: marker, exact: true }).count(),
    0
  );
  ok(
    "A changed snapshot stays concealed through recheck and is adopted only after explicit reload"
  );

  await signIn(fixture.owner);
  await go("/platform/help/inbox");
  await waitRows(20);
  await db.supportCase.update({
    where: { id: created.caseId },
    data: {
      ownerGrantId: fixture.backupGrant.id,
      ownerGrantVersion: fixture.backupGrant.version,
      updatedAt: new Date(stamp)
    }
  });
  await event("focus");
  await page.getByText(changedNotice, { exact: true }).waitFor();
  await absent();
  await reload();
  await waitRows(20);
  assert.equal(
    await page.getByRole("link", { name: newSubject, exact: true }).count(),
    0
  );
  const removed = await context.request.get(
    config.origin + "/api/platform/support?view=inbox",
    { headers: { "x-expected-account": fixture.owner.id } }
  );
  assert.equal(removed.status(), 200);
  assert.ok(
    !(await removed.json()).rows.some((row) => row.id === created.caseId)
  );
  await db.supportCase.update({
    where: { id: created.caseId },
    data: {
      ownerGrantId: fixture.ownerGrant.id,
      ownerGrantVersion: fixture.ownerGrant.version,
      updatedAt: new Date(stamp)
    }
  });
  await go("/platform/help/inbox");
  await waitRows(20);
  await page.getByRole("link", { name: newSubject, exact: true }).waitFor();
  const assignedBeforeRevocation = await db.supportCase.findMany({
    where: { requesterId: fixture.memberA.id },
    select: { id: true, version: true, updatedAt: true }
  });
  assert.equal(assignedBeforeRevocation.length, 22);
  await db.supportCapabilityGrant.update({
    where: { id: fixture.ownerGrant.id },
    data: { revokedAt: new Date() }
  });
  await event("focus");
  await page
    .getByRole("button", { name: "Recheck current access", exact: true })
    .waitFor();
  await page.waitForLoadState("networkidle");
  await absent();
  const denied = await context.request.get(
    config.origin + "/api/platform/support?view=inbox",
    { headers: { "x-expected-account": fixture.owner.id } }
  );
  assert.equal(denied.status(), 404);
  // A denied inbox transaction rolls back its reconciliation. Commit a
  // successful requester read so retirement does not depend on other readers.
  const { readSupport } = await import("../lib/platform/support.ts");
  const requesterAfterRevocation = await readSupport(
    db,
    fixture.memberA.token,
    "requests"
  );
  assert.equal(requesterAfterRevocation.rows.length, 20);
  const retiredAssignments = await db.supportCase.findMany({
    where: { requesterId: fixture.memberA.id },
    select: {
      id: true,
      version: true,
      ownerGrantId: true,
      ownerGrantVersion: true
    }
  });
  assert.equal(retiredAssignments.length, 22);
  for (const row of retiredAssignments) {
    assert.equal(row.ownerGrantId, null);
    assert.equal(row.ownerGrantVersion, null);
    assert.equal(
      row.version,
      assignedBeforeRevocation.find((previous) => previous.id === row.id)
        .version + 1
    );
  }
  const renewedGrant = await db.supportCapabilityGrant.update({
    where: { id: fixture.ownerGrant.id },
    data: { revokedAt: null }
  });
  const renewedInbox = await context.request.get(
    config.origin + "/api/platform/support?view=inbox",
    { headers: { "x-expected-account": fixture.owner.id } }
  );
  assert.equal(renewedInbox.status(), 200);
  assert.deepEqual((await renewedInbox.json()).rows, []);
  await page
    .getByRole("button", { name: "Recheck current access", exact: true })
    .click();
  await page.getByText(changedNotice, { exact: true }).waitFor();
  await absent();
  await reload();
  await page
    .getByText(
      "No requests to show here. New replies will appear with an Updated label.",
      { exact: true }
    )
    .waitFor();
  await absent();
  // Renewing a grant never restores assignments. Deliberately reassign only
  // these fixture cases, preserving their known order for the browser checks.
  await db.$transaction(
    assignedBeforeRevocation.map((row) =>
      db.supportCase.update({
        where: { id: row.id, requesterId: fixture.memberA.id },
        data: {
          ownerGrantId: fixture.ownerGrant.id,
          ownerGrantVersion: renewedGrant.version,
          version: { increment: 1 },
          updatedAt: row.updatedAt
        }
      })
    )
  );
  await event("focus");
  await page.getByText(changedNotice, { exact: true }).waitFor();
  await absent();
  await page
    .getByRole("button", { name: "Recheck current access", exact: true })
    .click();
  await page.getByText(changedNotice, { exact: true }).waitFor();
  await absent();
  await reload();
  await waitRows(20);
  await page.getByRole("link", { name: newSubject, exact: true }).waitFor();
  ok(
    "Assignment removal excludes the case; grant revocation retires assignments, renewal leaves the inbox empty, and deliberate fixture reassignment requires explicit snapshot reload"
  );

  await context.clearCookies();
  await event("blur");
  await event("focus");
  await page
    .getByText("Your sign-in changed. Reload before continuing.", {
      exact: true
    })
    .waitFor();
  await absent();
  assert.equal(await ownCaseCount(), 22);
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(browserWrites, []);
  assert.deepEqual(caseRequests, []);
  ok(
    "Sign-out clears the list; browser verification creates no mutations, private-case prefetches, localStorage copies, external requests or runtime errors"
  );
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        results,
        errors,
        externalRequests,
        browserWrites,
        caseRequests,
        fixtureOnly: true
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  console.log("SUPPORT_INDEX_BROWSER_PASS " + results.length);
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    output + "/failure.json",
    JSON.stringify(
      {
        results,
        errors,
        externalRequests,
        browserWrites,
        caseRequests,
        url: page.url(),
        message: String(error),
        fixtureOnly: true
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  throw error;
} finally {
  try {
    if (fixture)
      await db.supportCapabilityGrant.update({
        where: { id: fixture.ownerGrant.id },
        data: { revokedAt: fixture.ownerGrant.revokedAt }
      });
    if (originalIntake)
      await db.supportIntakeSetting.upsert({
        where: { id: "default" },
        create: originalIntake,
        update: {
          ownerGrantId: originalIntake.ownerGrantId,
          enabled: originalIntake.enabled,
          approvedNoticeVersion: originalIntake.approvedNoticeVersion
        }
      });
    else if (fixture)
      await db.supportIntakeSetting.deleteMany({
        where: { id: "default", ownerGrantId: fixture.ownerGrant.id }
      });
  } finally {
    await browser.close();
    await db.$disconnect();
  }
}
