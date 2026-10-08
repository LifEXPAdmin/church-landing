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
  readFileSync(join(fixture, "comment-deletion-browser-fixture.json"), "utf8")
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
    process.env.HOME +
      "/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json"
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
const output = join(fixture, "comment-deletion-browser");
mkdirSync(output, { mode: 0o700 });
const thread = () =>
  page.getByRole("region", { name: "Full discussion", exact: true });
const row = (id) => thread().locator('[data-comment-id="' + id + '"]');
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
        Error("Fictional native deletion browser check timed out")
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
async function neutralParent(parentId, childId, text) {
  await row(parentId)
    .getByText("Comment unavailable", { exact: true })
    .waitFor();
  await row(childId).getByText(text, { exact: true }).waitFor();
  await row(childId)
    .getByText("Replying to an unavailable comment", { exact: true })
    .waitFor();
  assert.equal(
    await row(parentId)
      .locator(":scope > div > a[href*='/platform/profile/']")
      .count(),
    0
  );
  assert.equal(
    await row(parentId)
      .locator(":scope > div > a[href*='/platform/churches/']")
      .count(),
    0
  );
  const response = await native(readPath + "?view=replies&rootId=" + parentId);
  assert.equal(response.status, 200);
  const view = decodeApiResponse(
    "comments",
    response.value,
    data.reader.id
  ).data;
  assert.ok(view.root && !view.root.available);
  assert.equal(view.items.find((item) => item.id === childId)?.content, text);
  await bounded();
}
async function openDelete() {
  await row(data.webCommentId)
    .getByRole("button", { name: /More comment options/ })
    .click();
  return page
    .getByRole("dialog", { name: /More comment options/ })
    .getByRole("button", { name: "Delete", exact: true });
}
async function confirmDelete(button, accept) {
  const dialog = page.waitForEvent("dialog");
  const click = button.click();
  const confirmation = await dialog;
  assert.equal(confirmation.type(), "confirm");
  assert.equal(
    confirmation.message(),
    "Delete this comment? Replies may remain beneath an unavailable comment."
  );
  if (accept) await confirmation.accept();
  else await confirmation.dismiss();
  await click;
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
    config.origin +
      "/platform/posts/" +
      data.postId +
      "?comment=" +
      data.replyId
  );
  await neutralParent(data.commentId, data.replyId, data.replyText);
  await page.screenshot({
    path: join(output, "native-deletion-replies-390.png"),
    fullPage: true
  });
  pass(
    "Native deletion leaves a neutral parent and permitted reply in the actual website"
  );

  await page.goto(
    config.origin +
      "/platform/posts/" +
      data.postId +
      "?comment=" +
      data.webCommentId
  );
  await row(data.webCommentId)
    .getByText(data.webCommentText, { exact: true })
    .waitFor();
  const bodies = [],
    pattern = "**/api/platform/comments";
  let committed;
  await page.route(pattern, async (route) => {
    const body = route.request().postData();
    if (!body || JSON.parse(body).operation !== "delete")
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
  await confirmDelete(await openDelete(), false);
  assert.equal(bodies.length, 0);
  const canceled = await db.platformPostComment.findUniqueOrThrow({
    where: { id: data.webCommentId }
  });
  assert.equal(canceled.deletedAt, null);
  assert.equal(canceled.version, 1);
  assert.equal(canceled.content, data.webCommentText);
  pass(
    "Canceling the website confirmation sends no deletion and preserves the comment"
  );

  // The menu may remain open after cancel because the browser dialog does not
  // itself dismiss the React dialog. Use its existing Delete control.
  const deleteButton = page
    .getByRole("dialog", { name: /More comment options/ })
    .getByRole("button", { name: "Delete", exact: true });
  await confirmDelete(
    (await deleteButton.isVisible()) ? deleteButton : await openDelete(),
    true
  );
  const retry = thread().getByRole("button", {
    name: "Retry same delete",
    exact: true
  });
  await retry.waitFor();
  await page.setViewportSize({ width: 320, height: 640 });
  await retry.scrollIntoViewIfNeeded();
  await bounded();
  await page.screenshot({
    path: join(output, "lost-delete-receipt-320.png"),
    fullPage: true
  });
  await retry.click();
  await retry.waitFor({ state: "hidden" });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  const original = JSON.parse(bodies[0]);
  assert.equal(original.postId, data.postId);
  assert.equal(original.commentId, data.webCommentId);
  assert.equal(original.expectedVersion, 1);
  assert.equal(committed.id, data.webCommentId);
  assert.equal(committed.version, 2);
  const saved = await db.platformPostComment.findUniqueOrThrow({
    where: { id: data.webCommentId }
  });
  assert.ok(saved.deletedAt);
  assert.equal(saved.version, 2);
  assert.equal(saved.content, "");
  assert.equal(
    await db.socialOperation.count({
      where: { ownerId: data.reader.id, key: "comments:" + original.mutationId }
    }),
    1
  );
  await page.unroute(pattern);
  const replay = await native(readPath + "/" + data.webCommentId + "/delete", {
    mutationId: original.mutationId,
    expectedVersion: original.expectedVersion
  });
  assert.equal(replay.status, 200);
  assert.deepEqual(
    decodeApiResponse("deleteComment", replay.value, data.reader.id).data,
    { ...committed, recoveryPending: false }
  );
  pass(
    "Lost website acknowledgement retries identical deletion bytes and shares one receipt with native"
  );

  await page.goto(
    config.origin +
      "/platform/posts/" +
      data.postId +
      "?comment=" +
      data.webReplyId
  );
  await neutralParent(data.webCommentId, data.webReplyId, data.webReplyText);
  await page.screenshot({
    path: join(output, "website-deletion-replies-320.png"),
    fullPage: true
  });
  const oldNative = await native(
    readPath + "/" + data.commentId + "/delete",
    data.nativeInput
  );
  assert.equal(oldNative.status, 200);
  assert.deepEqual(
    decodeApiResponse("deleteComment", oldNative.value, data.reader.id).data,
    data.nativeReceipt
  );
  assert.equal(
    await db.platformPostComment.count({ where: { postId: data.postId } }),
    4
  );
  pass(
    "Website deletion preserves the permitted reply, and old native receipt cannot delete again"
  );

  assert.deepEqual(errors, []);
  writeFileSync(
    join(output, "receipt.json"),
    JSON.stringify(
      {
        results,
        browserErrors: errors,
        productionWrites: 0,
        limitations:
          "Fictional website confirmation and retry parity only; no native app UI, device, provider or store acceptance asserted."
      },
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
