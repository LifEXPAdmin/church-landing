import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { request as httpsRequest } from "node:https";
import { resolve, join } from "node:path";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";

assert.ok(process.argv[2], "Pass the owned fictional HTTPS fixture");
const fixture = resolve(process.argv[2]);
const config = JSON.parse(
  readFileSync(join(fixture, "browser-env.json"), "utf8")
);
const data = JSON.parse(
  readFileSync(join(fixture, "comment-like-browser-fixture.json"), "utf8")
);
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(process.env.DATABASE_URL, config.database);
const { PrismaClient } = await import("@prisma/client");
const { assertPortalTestDatabase } = await import("../tests/seed-portal.ts");
const { decodeApiResponse } = await import("../lib/platform/api-contracts.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ??
    `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`
)("playwright");
const publicKey = execFileSync("openssl", [
  "x509",
  "-in",
  config.certificate,
  "-pubkey",
  "-noout"
]);
const der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], {
  input: publicKey
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
page.setDefaultTimeout(15000);
const errors = [],
  results = [];
page.on("pageerror", (error) => errors.push(error.message));
const output = join(fixture, "comment-like-browser");
mkdirSync(output, { mode: 0o700 });
const thread = () =>
  page.getByRole("region", { name: "Full discussion", exact: true });
const row = () => thread().locator(`[data-comment-id="${data.commentId}"]`);
const button = (name) => row().getByRole("button", { name, exact: true });
const readPath = "/api/platform/v1/posts/" + data.postId + "/comments";
const likePath = readPath + "/" + data.commentId + "/like";
function native(path, body) {
  const bytes = body ? JSON.stringify(body) : undefined;
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      config.origin + path,
      {
        method: body ? "POST" : "GET",
        servername: "localhost",
        ca: readFileSync(config.certificate),
        timeout: 30000,
        headers: {
          Authorization: "Bearer " + data.reader.token,
          "X-Expected-Account": data.reader.id,
          ...(bytes
            ? {
                "Content-Type": "application/json",
                "Content-Length": String(Buffer.byteLength(bytes))
              }
            : {})
        }
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.once("error", reject);
        response.once("end", () =>
          resolve({
            status: response.statusCode,
            value: JSON.parse(Buffer.concat(chunks).toString())
          })
        );
      }
    );
    request.once("error", reject);
    request.once("timeout", () =>
      request.destroy(Error("Fictional native Like browser check timed out"))
    );
    request.end(bytes);
  });
}
async function current(liked, version) {
  const response = await native(readPath);
  assert.equal(response.status, 200);
  const item = decodeApiResponse(
    "comments",
    response.value,
    data.reader.id
  ).data.items.find((item) => item.id === data.commentId);
  assert.ok(item.available && !item.requiresWeb);
  assert.equal(item.likeCount, null);
  assert.deepEqual(item.ownReaction, { liked, version });
}
const bounded = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    )
  );
const pass = (name) => {
  results.push(name);
  console.log("PASS " + name);
};
try {
  await context.addCookies([
    {
      name: sessionCookieFixtureName(config.origin),
      value: data.reader.token,
      url: config.origin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
  await page.goto(
    `${config.origin}/platform/posts/${data.postId}?comment=${data.commentId}`
  );
  await row().getByText(data.content, { exact: true }).waitFor();
  await button("Unlike").waitFor();
  assert.equal(await button("Unlike").getAttribute("aria-pressed"), "true");
  await current(true, 1);
  await bounded();
  await page.screenshot({
    path: join(output, "native-like-shared.png"),
    fullPage: true
  });
  pass(
    "Native Like appears on the actual website with hidden totals preserved"
  );

  await button("Unlike").click();
  await button("Like").waitFor();
  await current(false, 2);
  const old = await native(likePath, data.nativeInput);
  assert.equal(old.status, 200);
  assert.deepEqual(
    decodeApiResponse("setCommentLike", old.value, data.reader.id).data,
    data.nativeReceipt
  );
  await current(false, 2);
  pass(
    "Website Unlike is visible natively and old native receipt replay does not undo it"
  );

  const bodies = [];
  const pattern = "**/api/platform/comments";
  await page.route(pattern, async (route) => {
    const body = route.request().postData();
    if (!body || JSON.parse(body).operation !== "like") return route.continue();
    bodies.push(body);
    if (bodies.length === 1) {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      return route.abort("failed");
    }
    return route.continue();
  });
  await button("Like").click();
  const retry = thread().getByRole("button", {
    name: "Retry same like",
    exact: true
  });
  await retry.waitFor();
  await page.setViewportSize({ width: 320, height: 640 });
  await bounded();
  await page.screenshot({
    path: join(output, "lost-receipt-320.png"),
    fullPage: true
  });
  await retry.click();
  await button("Unlike").waitFor();
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  await current(true, 3);
  const mutationId = JSON.parse(bodies[0]).mutationId;
  assert.equal(
    await db.socialOperation.count({
      where: { ownerId: data.reader.id, key: "comments:" + mutationId }
    }),
    1
  );
  assert.equal(
    await db.socialEvent.count({
      where: { kind: "COMMENT_REACTION", commentId: data.commentId }
    }),
    1
  );
  await page.unroute(pattern);
  pass(
    "Lost website Like acknowledgement retries identical bytes once without duplicate intent"
  );

  await db.platformPost.update({
    where: { id: data.postId },
    data: { withdrawnAt: new Date(), status: "WITHDRAWN" }
  });
  await page.reload();
  await page
    .getByRole("heading", { name: "Page Not Found", exact: true })
    .waitFor();
  assert.equal(await row().count(), 0);
  assert.equal((await native(readPath)).status, 404);
  const denied = await native(likePath, {
    ...data.nativeInput,
    mutationId: "withdrawn-browser-choice",
    desired: false,
    expectedVersion: 3
  });
  assert.equal(denied.status, 404);
  await bounded();
  pass(
    "Withdrawn source removes website controls and rejects fresh native reads and Likes"
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    join(output, "receipt.json"),
    JSON.stringify(
      { results, browserErrors: errors, productionWrites: 0 },
      null,
      2
    ),
    { flag: "wx", mode: 0o600 }
  );
} finally {
  await context.close();
  await browser.close();
  await db.$disconnect();
}
