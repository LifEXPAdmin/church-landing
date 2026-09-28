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
  headless: process.env.TOPIC_CATALOGUE_HEADFUL !== "1",
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
const output = fixtureDir + "/topic-catalogue-privacy-browser-" + Date.now();
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
const go = async (path) => {
  const r = await page.goto(config.origin + path);
  assert.equal(r.status(), 200);
};

const { registerAccount, loginAccount } =
  await import("../lib/platform/accounts.ts");
const { ADULT_POLICY } = await import("../lib/platform/portal-types.ts");
const routeErrors = [],
  scenarios = [],
  actors = [];
const pendingRouteReleases = new Set();
const identityUrl = (url) =>
  url.pathname === "/api/platform/profile" &&
  url.searchParams.get("view") === "identity";
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
const { topicCommand } = await import("../lib/platform/topic-communities.ts");
const main = page.getByRole("main");
const writes = [],
  catalogueReads = [];
page.on("request", (request) => {
  if (
    new URL(request.url()).pathname === "/api/platform/topics" &&
    request.method() === "GET"
  )
    catalogueReads.push(request.url());
  if (
    new URL(request.url()).pathname === "/api/platform/topics" &&
    request.method() !== "GET"
  )
    writes.push(request.method());
});
async function topic(owner, suffix) {
  const tag = randomUUID().slice(0, 8),
    name = `Fictional private ${suffix} ${tag}`;
  const result = await topicCommand(db, owner.token, {
    operation: "create",
    mutationId: randomUUID(),
    name,
    slug: `private-${tag}`,
    description: `Private catalogue association ${tag}`,
    rules: "Protect private information.",
    acceptedRules: true
  });
  return { ...result, name, slug: `private-${tag}` };
}
const link = (name) => main.getByRole("link", { name, exact: true });
async function absent(name) {
  await poll(() => main.locator("a").filter({ hasText: name }).count(), 0);
  assert.equal((await main.textContent()).includes(name), false);
}
async function resume(name) {
  await main
    .getByRole("button", { name: "Recheck current access", exact: true })
    .click();
  await link(name).waitFor();
}
async function refreshAs(owner, forbidden) {
  await signIn(owner);
  const completed = Promise.withResolvers();
  const match = (url) => url.pathname === "/platform/topics";
  let handled = false;
  const handler = async (route) => {
    if (handled || route.request().headers().rsc !== "1")
      return route.fallback();
    handled = true;
    try {
      const response = await forwarded(route);
      assert.equal(response.status, 200);
      assert.match(response.headers["content-type"], /text\/x-component/);
      const body = response.body.toString("utf8");
      assert.ok(body.includes(owner.id));
      for (const marker of forbidden)
        assert.equal(body.includes(marker), false);
      await route.fulfill(response);
      completed.resolve({
        name: "actual-owner-rsc",
        owner: owner.id,
        bytes: response.body.length,
        sha256: createHash("sha256").update(response.body).digest("hex")
      });
    } catch (error) {
      routeErrors.push(error.message);
      await route.abort();
      completed.reject(error);
    }
  };
  await page.route(match, handler);
  let timer;
  try {
    await page.evaluate(() => window.next.router.refresh());
    scenarios.push(
      await Promise.race([
        completed.promise,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(Error("Catalogue RSC refresh did not settle")),
            25000
          );
        })
      ])
    );
  } finally {
    clearTimeout(timer);
    await page.unroute(match, handler);
  }
}
try {
  const a = await actor("catalogue"),
    b = await actor("other"),
    first = await topic(a, "owner"),
    second = await topic(b, "other"),
    archived = await topic(a, "archived");
  await topicCommand(db, a.token, {
    operation: "archive",
    mutationId: randomUUID(),
    communityId: archived.id,
    expectedVersion: archived.version,
    desired: true,
    confirmed: true
  });
  await topicCommand(db, a.token, {
    operation: "follow",
    mutationId: randomUUID(),
    communityId: second.id,
    expectedVersion: 0,
    desired: true
  });
  await signIn(a);
  for (const mode of ["mine", "owned"]) {
    const path = `/platform/topics?${mode}=1`;
    for (const headers of [{}, { RSC: "1" }]) {
      const r = await context.request.get(config.origin + path, { headers });
      assert.equal(r.status(), 200);
      assert.match(
        r.headers()["content-type"],
        headers.RSC ? /text\/x-component/ : /text\/html/
      );
      const body = await r.text();
      for (const marker of [first.name, second.name, archived.name])
        assert.equal(
          body.includes(marker),
          false,
          "Initial HTML and RSC omit private associations"
        );
    }
    await go(path);
    await link(first.name).waitFor();
    if (mode === "mine") await link(second.name).waitFor();
    else await absent(second.name);
    if (mode === "owned") await link(archived.name).waitFor();
    else await absent(archived.name);
    assert.ok(
      (await link(first.name).getAttribute("href")).endsWith(
        mode === "owned" ? "/manage" : first.slug
      )
    );
    for (const event of ["blur", "offline", "pagehide"]) {
      await pulse(event);
      await absent(first.name);
      await absent(second.name);
      const readsBefore = catalogueReads.length;
      await pulse("online");
      await pulse("social-relationships-changed");
      await page.waitForTimeout(150);
      assert.equal(
        catalogueReads.length,
        readsBefore,
        "Passive hints cannot dispatch a catalogue read while concealed"
      );
      await absent(first.name);
      await absent(archived.name);
      if (event === "pagehide") {
        await pulse("pageshow");
        await link(first.name).waitFor();
      } else await resume(first.name);
    }
    ok(
      `${mode} associations are absent from initial HTML/RSC and concealed DOM; passive background hints cannot restore them`
    );
  }
  await go("/platform/topics?mine=1&owned=1");
  await link(first.name).waitFor();
  await absent(second.name);
  await link(archived.name).waitFor();
  assert.equal(await main.locator("h2 a").count(), 2);
  ok(
    "Owned lists include archived topics; combined filters preserve the existing owned-plus-membership intersection"
  );
  await go("/platform/topics?owned=1");
  await link(first.name).waitFor();
  await pulse("blur");
  await absent(first.name);
  let identityAttempts = 0;
  const unavailable = async (route) => {
    identityAttempts++;
    await route.fulfill({
      status: 503,
      json: { message: "Fictional identity unavailable" }
    });
  };
  await page.route(identityUrl, unavailable);
  await main
    .getByRole("button", { name: "Recheck current access", exact: true })
    .click();
  await poll(() => identityAttempts > 0, true);
  await page
    .getByRole("status")
    .filter({ hasText: "Your sign-in could not be checked" })
    .first()
    .waitFor();
  await absent(first.name);
  await page.unroute(identityUrl, unavailable);
  await resume(first.name);
  ok(
    "Unavailable identity removes private catalogue rows until an original-owner recheck succeeds"
  );

  const listUrl = (u) =>
    u.pathname === "/api/platform/topics" &&
    u.searchParams.get("owned") === "1";
  let reads = 0,
    ready = false,
    done = false,
    release;
  const hold = new Promise((r) => (release = r));
  pendingRouteReleases.add(release);
  const delayed = async (route) => {
    reads++;
    if (reads !== 1) return route.fallback();
    try {
      const r = await forwarded(route);
      assert.equal(r.status, 200);
      ready = true;
      await hold;
      await route.fulfill(r);
    } catch (e) {
      routeErrors.push(e.message);
      await route.abort();
    } finally {
      done = true;
    }
  };
  await page.route(listUrl, delayed);
  await pulse("focus");
  await poll(() => ready, true);
  await pulse("focus");
  await pulse("blur");
  await pulse("online");
  await pulse("social-relationships-changed");
  release();
  await poll(() => done, true);
  await page.waitForTimeout(150);
  await absent(first.name);
  assert.equal(reads, 1);
  await resume(first.name);
  assert.equal(reads, 2);
  await page.unroute(listUrl, delayed);
  pendingRouteReleases.delete(release);
  ok(
    "Held reads and queued focus cannot restart or reveal after concealment; explicit recheck performs one fresh read"
  );

  const documentId = randomUUID();
  await page.evaluate((v) => (window.__catalogueDocument = v), documentId);
  await refreshAs(b, [first.name, second.name, archived.name]);
  await link(second.name).waitFor();
  await absent(first.name);
  await refreshAs(a, [first.name, second.name, archived.name]);
  await link(first.name).waitFor();
  await absent(second.name);
  assert.equal(
    await page.evaluate(() => window.__catalogueDocument),
    documentId
  );
  ok(
    "Actual A-to-B-to-A server refresh loads only the current owner's private catalogue in the same document"
  );

  const changedName = first.name + " changed";
  await topicCommand(db, a.token, {
    operation: "edit",
    mutationId: randomUUID(),
    communityId: first.id,
    expectedVersion: first.version,
    name: changedName,
    description: "Fictional changed catalogue description",
    rules: "Protect private information."
  });
  await pulse("blur");
  await pulse("focus");
  await main
    .getByRole("status")
    .filter({ hasText: "Your topic choices or ownership changed" })
    .waitFor();
  await absent(first.name);
  await absent(changedName);
  await main
    .getByRole("button", { name: "Reload current information", exact: true })
    .click();
  await link(changedName).waitFor();
  ok(
    "Changed catalogue snapshots stay absent until deliberate reload adopts current values"
  );

  const paginationOwner = await actor("paging"),
    tag = randomUUID().slice(0, 8),
    prefix = `Private paging ${tag}`;
  await db.topicCommunity.createMany({
    data: Array.from({ length: 21 }, (_, i) => ({
      name: `${prefix} ${String(i).padStart(2, "0")}`,
      nameKey: `${prefix.toLowerCase()} ${String(i).padStart(2, "0")}`,
      slug: `private-paging-${tag}-${i}`,
      description: "Fictional owner-scoped pagination",
      rules: "Protect private information.",
      creatorId: paginationOwner.id,
      ownerId: paginationOwner.id
    }))
  });
  await signIn(paginationOwner);
  await go("/platform/topics?owned=1");
  await main.getByRole("link", { name: "More topics", exact: true }).waitFor();
  await main
    .getByRole("searchbox", { name: "Search topics", exact: true })
    .fill(prefix);
  await main
    .getByRole("button", { name: "Search topics", exact: true })
    .click();
  await main.getByRole("link", { name: "More topics", exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("owned"), "1");
  const firstPage = await main.locator("h2 a").allTextContents();
  assert.equal(firstPage.length, 20);
  await main.getByRole("link", { name: "More topics", exact: true }).click();
  await main
    .getByRole("link", { name: "First topic page", exact: true })
    .waitFor();
  const lastPage = await main.locator("h2 a").allTextContents();
  assert.equal(lastPage.length, 1);
  assert.equal(firstPage.includes(lastPage[0]), false);
  assert.equal(new URL(page.url()).searchParams.get("owned"), "1");
  assert.equal(new URL(page.url()).searchParams.get("q"), prefix);
  await main
    .getByRole("link", { name: "First topic page", exact: true })
    .click();
  await main.getByRole("link", { name: "More topics", exact: true }).waitFor();
  assert.deepEqual(await main.locator("h2 a").allTextContents(), firstPage);
  for (const [width, size] of [
    [390, "100%"],
    [320, "100%"],
    [320, "200%"]
  ]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(
      (s) => (document.documentElement.style.fontSize = s),
      size
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      )
    );
    const searchBox = main.getByRole("searchbox", {
      name: "Search topics",
      exact: true
    });
    const searchBounds = await searchBox.boundingBox();
    assert.ok(
      searchBounds && searchBounds.width >= Math.min(160, width - 64),
      "The search input must remain usable with narrow or enlarged text"
    );
    await searchBox.fill(prefix);
    await main
      .getByRole("button", { name: "Search topics", exact: true })
      .click();
    await main
      .getByRole("link", { name: "More topics", exact: true })
      .waitFor();
    assert.equal(new URL(page.url()).searchParams.get("owned"), "1");
    assert.equal(new URL(page.url()).searchParams.get("q"), prefix);
    assert.deepEqual(await main.locator("h2 a").allTextContents(), firstPage);
    // Native search replaces the document, so reapply the enlarged-text setting.
    await page.evaluate(
      (s) => (document.documentElement.style.fontSize = s),
      size
    );
    await page.screenshot({
      path: output + `/catalogue-${width}-${size.replace("%", "")}.png`,
      fullPage: true
    });
  }
  ok(
    "Private search retains its ownership flag and disjoint 20/1 paging; first-page return and 320px enlarged text remain usable"
  );
  await signIn(null);
  await go("/platform/topics?owned=1");
  await main
    .getByRole("link", {
      name: "Create an account to participate",
      exact: true
    })
    .waitFor();
  assert.equal(await main.locator("h2 a").count(), 0);
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(routeErrors, []);
  assert.deepEqual(external, []);
  ok(
    "Guest private catalogue remains an account-entry surface; all catalogue browser actions are read-only"
  );
  const receipt = {
    source: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8"
    }).trim(),
    buildId: readFileSync(".next/BUILD_ID", "utf8").trim(),
    startedAt,
    finishedAt: new Date().toISOString(),
    results,
    scenarios,
    actors,
    errors,
    routeErrors,
    external,
    writes,
    productionWrites: 0,
    externalSends: 0
  };
  writeFileSync(output + "/receipt.json", JSON.stringify(receipt, null, 2));
  console.log(
    JSON.stringify({
      passed: results.length,
      output,
      productionWrites: 0,
      externalSends: 0
    })
  );
} catch (error) {
  writeFileSync(
    output + "/failure.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        error: error.stack,
        results,
        scenarios,
        actors,
        errors,
        routeErrors,
        external,
        url: page.url(),
        text: await main.innerText().catch(() => "unavailable")
      },
      null,
      2
    )
  );
  throw error;
} finally {
  for (const release of pendingRouteReleases) release();
  await page.unrouteAll({ behavior: "wait" }).catch(() => {});
  await browser.close();
  await db.$disconnect();
}
