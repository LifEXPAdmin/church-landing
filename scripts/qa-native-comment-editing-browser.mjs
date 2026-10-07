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
  readFileSync(join(fixture, "comment-editing-browser-fixture.json"), "utf8")
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
const output = join(fixture, "comment-editing-browser");
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
        Error("Fictional native correction browser check timed out")
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
    `${config.origin}/platform/posts/${data.postId}?comment=${data.commentId}`
  );
  await row(data.commentId).getByText(data.content, { exact: true }).waitFor();
  await row(data.commentId).getByText("Edited", { exact: true }).waitFor();
  const initial = await nativeTarget(data.commentId, data.content);
  assert.equal(initial.target.version, 2);
  await bounded();
  await page.screenshot({
    path: join(output, "native-correction-website-390.png"),
    fullPage: true
  });
  pass(
    "Native correction appears with Edited state in the actual website reader"
  );

  await row(data.commentId)
    .getByRole("button", { name: /More comment options/ })
    .click();
  await page
    .getByRole("dialog", { name: /More comment options/ })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  const editor = page.getByRole("form", { name: "Edit comment", exact: true });
  const textbox = editor.getByRole("textbox", {
    name: "Edited comment text",
    exact: true
  });
  const webText = "Fictional website correction with a lost acknowledgement";
  await textbox.fill(webText);
  const bodies = [],
    pattern = "**/api/platform/comments";
  let committed;
  await page.route(pattern, async (route) => {
    const body = route.request().postData();
    if (!body || JSON.parse(body).operation !== "edit") return route.continue();
    bodies.push(body);
    if (bodies.length === 1) {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      committed = await response.json();
      return route.abort("failed");
    }
    return route.continue();
  });
  await editor.getByRole("button", { name: "Save edit", exact: true }).click();
  const retry = editor.getByRole("button", {
    name: "Retry same edit",
    exact: true
  });
  await retry.waitFor();
  assert.equal(await textbox.inputValue(), webText);
  assert.equal(await textbox.isDisabled(), true);
  assert.equal(
    await editor
      .getByRole("button", { name: "Discard edit", exact: true })
      .isDisabled(),
    true
  );
  await page.setViewportSize({ width: 320, height: 640 });
  await retry.scrollIntoViewIfNeeded();
  await bounded();
  await page.screenshot({
    path: join(output, "lost-edit-receipt-320.png"),
    fullPage: true
  });
  pass(
    "Committed edit with lost acknowledgement retains disabled text and visible retry at 320 pixels"
  );
  await retry.click();
  await editor.waitFor({ state: "hidden" });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  const afterRetry = await nativeTarget(data.commentId, webText);
  assert.equal(afterRetry.target.version, 3);
  assert.equal(committed.id, data.commentId);
  assert.equal(committed.version, 3);
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
    await db.platformPostComment.count({ where: { postId: data.postId } }),
    1
  );
  await page.unroute(pattern);
  await row(data.commentId).getByText(webText, { exact: true }).waitFor();
  pass(
    "Actual website retries identical edit bytes once and native reads the same version"
  );

  await row(data.commentId)
    .getByRole("button", { name: /More comment options/ })
    .click();
  await page
    .getByRole("dialog", { name: /More comment options/ })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  const preservedText =
    "Fictional unsent correction from the older website version";
  await textbox.fill(preservedText);
  const currentText =
    "Fictional newer native correction wins its current version";
  const current = await native(readPath + "/" + data.commentId, {
    mutationId: "browser-concurrent-correction",
    expectedVersion: 3,
    content: currentText,
    mentionIds: []
  });
  assert.equal(current.status, 200);
  assert.equal(
    decodeApiResponse("editComment", current.value, data.reader.id).data
      .version,
    4
  );
  const conflict = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/platform/comments") &&
      response.request().postDataJSON()?.operation === "edit"
  );
  await editor.getByRole("button", { name: "Save edit", exact: true }).click();
  assert.equal((await conflict).status(), 409);
  await editor.getByText("Your edit is preserved.", { exact: false }).waitFor();
  assert.equal(await textbox.inputValue(), preservedText);
  assert.equal(
    await editor
      .getByRole("button", { name: "Save edit", exact: true })
      .isDisabled(),
    true
  );
  const discard = editor.getByRole("button", {
    name: "Discard edit",
    exact: true
  });
  assert.equal(await discard.isEnabled(), true);
  await discard.click();
  await editor.waitFor({ state: "hidden" });
  await row(data.commentId).getByText(currentText, { exact: true }).waitFor();
  const latest = await nativeTarget(data.commentId, currentText);
  assert.equal(latest.target.version, 4);
  const oldReceipt = await native(
    readPath + "/" + data.commentId,
    data.nativeInput
  );
  assert.equal(oldReceipt.status, 200);
  assert.deepEqual(
    decodeApiResponse("editComment", oldReceipt.value, data.reader.id).data,
    data.nativeReceipt
  );
  assert.equal(
    (await nativeTarget(data.commentId, currentText)).target.version,
    4
  );
  await bounded();
  pass(
    "Stale website edit preserves unsent text, while historical native retry cannot overwrite the newer correction"
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
          "Same-account edit/retry/version flows only; no A-to-B-to-A pending-edit recovery or native-device acceptance asserted."
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
