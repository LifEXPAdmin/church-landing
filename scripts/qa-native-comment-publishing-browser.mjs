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
  readFileSync(join(fixture, "comment-publishing-browser-fixture.json"), "utf8")
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
const output = join(fixture, "comment-publishing-browser");
mkdirSync(output, { mode: 0o700 });
const thread = () =>
  page.getByRole("region", { name: "Full discussion", exact: true });
const row = (id) => thread().locator(`[data-comment-id="${id}"]`);
const readPath = "/api/platform/v1/posts/" + data.postId + "/comments";
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
      request.destroy(
        Error("Fictional native publication browser check timed out")
      )
    );
    request.end(bytes);
  });
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
async function nativeTarget(id, content) {
  const response = await native(readPath + "?view=context&commentId=" + id);
  assert.equal(response.status, 200);
  const view = decodeApiResponse(
    "comments",
    response.value,
    data.reader.id
  ).data;
  assert.ok(view.target?.available && !view.target.requiresWeb);
  assert.equal(view.target.id, id);
  assert.equal(view.target.content, content);
  return view;
}
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
    `${config.origin}/platform/posts/${data.postId}?comment=${data.childId}`
  );
  await row(data.rootId).getByText(data.rootContent, { exact: true }).waitFor();
  await row(data.childId)
    .getByText(data.childContent, { exact: true })
    .waitFor();
  const initial = await nativeTarget(data.childId, data.childContent);
  assert.equal(initial.root?.id, data.rootId);
  assert.equal(initial.target?.parentId, data.rootId);
  await bounded();
  await page.screenshot({
    path: join(output, "native-publication-shared.png"),
    fullPage: true
  });
  pass(
    "Native root and child render in the actual website with canonical parent identity"
  );

  await page
    .getByRole("button", { name: "Write a comment", exact: true })
    .click();
  const composer = page.getByRole("dialog", {
    name: "Write a comment",
    exact: true
  });
  const webText = "Fictional website publication visible to the native reader";
  await composer
    .getByRole("textbox", { name: "Comment text", exact: true })
    .fill(webText);
  const publication = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/platform/comments") &&
      response.request().postDataJSON()?.operation === "create"
  );
  await composer.getByRole("button", { name: "Reply", exact: true }).click();
  const webResponse = await publication;
  assert.equal(webResponse.status(), 200);
  const webReceipt = await webResponse.json();
  await composer.waitFor({ state: "hidden" });
  await nativeTarget(webReceipt.id, webText);
  assert.equal(
    await db.privateCommentDraft.count({
      where: { ownerId: data.reader.id, postId: data.postId, deletedAt: null }
    }),
    0
  );
  pass(
    "Actual website draft and publish controls produce the same comment read by the native adapter"
  );

  await row(data.childId)
    .getByRole("button", { name: "Reply", exact: true })
    .click();
  const replyComposer = page.getByRole("dialog", {
    name: "Write a reply",
    exact: true
  });
  const replyText = "Fictional reply with a lost publication acknowledgement";
  await replyComposer
    .getByRole("textbox", { name: "Comment text", exact: true })
    .fill(replyText);
  const bodies = [],
    pattern = "**/api/platform/comments";
  let committed;
  await page.route(pattern, async (route) => {
    const body = route.request().postData();
    if (!body || JSON.parse(body).operation !== "create")
      return route.continue();
    bodies.push(body);
    if (bodies.length === 1) {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      committed = await response.json();
      return route.abort("failed");
    }
    return route.continue();
  });
  await replyComposer
    .getByRole("button", { name: "Reply", exact: true })
    .click();
  const retry = replyComposer.getByRole("button", {
    name: "Retry same request",
    exact: true
  });
  await retry.waitFor();
  assert.equal(
    await replyComposer
      .getByRole("textbox", { name: "Comment text", exact: true })
      .inputValue(),
    replyText
  );
  await page.setViewportSize({ width: 320, height: 640 });
  await bounded();
  await page.screenshot({
    path: join(output, "lost-publication-receipt-320.png"),
    fullPage: true
  });
  await retry.click();
  await replyComposer.waitFor({ state: "hidden" });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  const nativeReply = await nativeTarget(committed.id, replyText);
  assert.equal(nativeReply.target.parentId, data.childId);
  assert.equal(nativeReply.target.rootId, data.rootId);
  assert.equal(
    await db.socialOperation.count({
      where: {
        ownerId: data.reader.id,
        key: "comments:" + JSON.parse(bodies[0]).mutationId
      }
    }),
    1
  );
  assert.equal(
    await db.platformPostComment.count({
      where: { postId: data.postId, content: replyText }
    }),
    1
  );
  assert.equal(
    await db.socialEvent.count({
      where: { kind: "COMMENT_CREATED", commentId: committed.id }
    }),
    1
  );
  assert.equal(
    await db.privateCommentDraft.count({
      where: { ownerId: data.reader.id, postId: data.postId, deletedAt: null }
    }),
    0
  );
  await page.unroute(pattern);
  pass(
    "Lost website reply acknowledgement retains text and retries identical bytes without duplicate publication"
  );

  await db.platformPost.update({
    where: { id: data.postId },
    data: { withdrawnAt: new Date(), status: "WITHDRAWN" }
  });
  await page.reload();
  await page
    .getByRole("heading", { name: "Page Not Found", exact: true })
    .waitFor();
  assert.equal(await row(data.rootId).count(), 0);
  assert.equal((await native(readPath)).status, 404);
  assert.equal(
    (
      await native(readPath, {
        ...data.nativeInput,
        mutationId: "withdrawn-browser-publication"
      })
    ).status,
    404
  );
  await bounded();
  pass(
    "Withdrawn source removes website publication controls and denies fresh native publication"
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
