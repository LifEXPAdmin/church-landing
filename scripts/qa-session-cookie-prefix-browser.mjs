import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:https";

const fixture = process.argv[2];
assert.ok(fixture, "Pass the isolated cookie fixture directory");
const config = JSON.parse(readFileSync(fixture + "/browser-env.json", "utf8"));
Object.assign(
  process.env,
  JSON.parse(readFileSync(fixture + "/test-env.json", "utf8"))
);
assert.match(config.origin, /^https:\/\/mfa-fixture\.example\.test:\d+$/);
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase, createPortalActor } =
  await import("../tests/seed-portal.ts");
const { hashSessionToken } = await import("../lib/platform/auth.ts");
const {
  ACCOUNT_SESSION_COOKIE: legacy,
  ACCOUNT_SECURE_SESSION_COOKIE: host,
  LEGACY_SECURE_SESSION_ENDS_AT
} = await import("../lib/platform/account-cookies.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const a = await createPortalActor(db, "hostcookie"),
  b = await createPortalActor(db, "otherhost");
const output = fixture + "/cookie-prefix-browser-" + Date.now();
mkdirSync(output, { recursive: true });
const server = createServer(
  { cert: readFileSync(config.certificate), key: readFileSync(config.key) },
  (request, response) => {
    const cookie =
      request.url === "/legacy"
        ? `${legacy}=${a.token}; Domain=example.test; Path=/; Secure; HttpOnly; SameSite=Lax`
        : request.url === "/path"
          ? `${host}=${a.token}; Path=/api; Secure; HttpOnly; SameSite=Lax`
          : `${host}=${a.token}; Domain=example.test; Path=/; Secure; HttpOnly; SameSite=Lax`;
    response.writeHead(200, {
      "Content-Type": "text/html",
      "Cache-Control": "no-store",
      "Set-Cookie": cookie
    });
    response.end(
      "<!doctype html><title>Fictional sibling</title><p>Isolated cookie scope fixture</p>"
    );
  }
);
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const sibling = `https://sibling.example.test:${server.address().port}`;
const { chromium } = createRequire(process.env.PLAYWRIGHT_MODULE)("playwright");
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
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: [
    "--ignore-certificate-errors-spki-list=" +
      createHash("sha256").update(der).digest("base64"),
    "--host-resolver-rules=MAP mfa-fixture.example.test 127.0.0.1, MAP sibling.example.test 127.0.0.1",
    "--no-proxy-server"
  ]
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }
});
const page = await context.newPage(),
  errors = [],
  external = [],
  checks = [];
page.on("pageerror", (error) => errors.push(error.message));
await context.route("**/*", (route) => {
  const origin = new URL(route.request().url()).origin;
  if ([config.origin, sibling].includes(origin)) return route.continue();
  external.push(origin);
  return route.abort();
});
const pass = (name) => {
  checks.push(name);
  console.log("PASS " + name);
};
const cookies = () => context.cookies(config.origin);
const state = () =>
  db.platformSession.findMany({
    where: { userId: { in: [a.id, b.id] } },
    orderBy: { id: "asc" }
  });
const seed = (name, actor) =>
  context.addCookies([
    {
      name,
      value: actor.token,
      url: config.origin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
const identity = async () => {
  const response = await page.goto(
    config.origin + "/api/platform/profile?view=identity"
  );
  return {
    status: response.status(),
    body: await response.json(),
    headers: await response.allHeaders()
  };
};
async function login(actor, password = actor.password) {
  await db.platformAuthLimit.deleteMany();
  await page.goto(config.origin + "/platform/login");
  await page.locator("#account-login-email").fill(actor.email);
  await page.locator("#account-login-password").fill(password);
  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/platform/account" &&
      r.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  return response;
}
let stage = "startup";
try {
  stage = "legacy compatibility";
  if (Date.now() < Date.parse(LEGACY_SECURE_SESSION_ENDS_AT)) {
    await seed(legacy, a);
    const before = await state(),
      original = await cookies();
    const r = await identity();
    assert.equal(r.status, 200);
    assert.equal(r.body.id, a.id);
    assert.equal(r.headers["set-cookie"], undefined);
    await page.goto(config.origin + "/platform/settings");
    await page
      .getByRole("heading", { name: "Settings", exact: true })
      .waitFor();
    assert.deepEqual(await state(), before);
    assert.deepEqual(await cookies(), original);
    pass(
      "Existing legacy sign-in works in API and rendered Settings without promotion, rotation or expiry extension"
    );
  }
  stage = "actual password login";
  await context.clearCookies();
  const signedIn = await login(b);
  assert.equal(signedIn.status(), 200);
  await page.waitForURL((url) => url.pathname !== "/platform/login");
  const issued = (await cookies()).filter((c) => c.name === host);
  assert.equal(issued.length, 1);
  assert.equal(issued[0].domain, "mfa-fixture.example.test");
  assert.equal(issued[0].path, "/");
  assert.equal(issued[0].secure, true);
  assert.equal(issued[0].httpOnly, true);
  assert.equal(issued[0].sameSite, "Lax");
  assert.equal(
    (await cookies()).some((c) => c.name === legacy),
    false
  );
  assert.equal((await identity()).body.id, b.id);
  assert.ok(!(await page.evaluate(() => document.cookie)).includes(host));
  pass(
    "Actual password form issues one browser-enforced host-only Secure HttpOnly root cookie and retires the old host cookie"
  );

  stage = "sibling prefix rejection";
  const stable = await cookies();
  await page.goto(sibling + "/prefix");
  await page.goto(sibling + "/path");
  assert.deepEqual(await cookies(), stable);
  assert.equal((await identity()).body.id, b.id);
  pass(
    "Sibling Domain and narrow-path prefixed Set-Cookie attempts cannot replace the legitimate sign-in"
  );

  stage = "cross-name conflict";
  const beforeConflict = await state();
  await page.goto(sibling + "/legacy");
  const conflicted = await identity();
  if (Date.now() < Date.parse(LEGACY_SECURE_SESSION_ENDS_AT)) {
    assert.equal(conflicted.status, 401);
    await page.goto(config.origin + "/platform/settings");
    assert.equal(new URL(page.url()).pathname, "/platform/join");
    assert.ok(!(await page.content()).includes(b.id));
    pass(
      "During the compatibility window, conflicting legacy Domain and host identities fail closed in API and rendered pages"
    );
  } else {
    assert.equal(conflicted.body.id, b.id);
    pass(
      "After fixed retirement, an obsolete Domain cookie cannot interfere with the host identity"
    );
  }
  assert.deepEqual(await state(), beforeConflict);

  stage = "failed login preserves existing identity";
  await context.clearCookies();
  await seed(host, b);
  const beforeFailure = await state(),
    jar = await cookies();
  const rejected = await login(a, "Fictional-wrong-password");
  assert.equal(rejected.status(), 400);
  assert.equal((await rejected.allHeaders())["set-cookie"], undefined);
  assert.deepEqual(await cookies(), jar);
  assert.deepEqual(await state(), beforeFailure);
  assert.equal((await identity()).body.id, b.id);
  pass(
    "Failed sign-in preserves the current host cookie and every existing session"
  );

  stage = "successful replacement and exact-device logout";
  await context.clearCookies();
  await seed(legacy, a);
  const switched = await login(b);
  assert.equal(switched.status(), 200);
  await page.waitForURL((url) => url.pathname !== "/platform/login");
  assert.equal(
    (await cookies()).some((c) => c.name === legacy),
    false
  );
  const token = (await cookies()).find((c) => c.name === host).value;
  if (Date.now() < Date.parse(LEGACY_SECURE_SESSION_ENDS_AT))
    assert.equal(
      await db.platformSession.findUnique({
        where: { tokenHash: hashSessionToken(a.token) }
      }),
      null
    );
  assert.equal((await identity()).body.id, b.id);
  await page.goto(config.origin + "/platform/settings");
  await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Log out", exact: true })
    .first()
    .click();
  await page.waitForURL((url) => url.pathname !== "/platform/settings");
  assert.equal(
    (await cookies()).some((c) => [legacy, host].includes(c.name)),
    false
  );
  assert.equal(
    await db.platformSession.findUnique({
      where: { tokenHash: hashSessionToken(token) }
    }),
    null
  );
  assert.ok(
    await db.platformSession.findUnique({
      where: { tokenHash: hashSessionToken(b.token) }
    })
  );
  assert.equal((await identity()).status, 401);
  pass(
    "Explicit replacement retires only the previous browser session; the real logout action clears both names and preserves another device"
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  writeFileSync(
    output + "/result.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        checks,
        pageErrors: errors,
        externalRequests: external,
        productionWrites: 0,
        realSends: 0
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  console.log(
    JSON.stringify({ passed: checks.length, output, productionWrites: 0 })
  );
} catch (error) {
  writeFileSync(
    output + "/failure.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        stage,
        error: String(error),
        checks,
        errors,
        external
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await db.$disconnect();
}
