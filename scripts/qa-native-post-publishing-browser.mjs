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
  readFileSync(join(fixture, "post-publishing-browser-fixture.json"), "utf8")
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
const output = join(fixture, "post-publishing-browser");
mkdirSync(output, { mode: 0o700 });
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
          Authorization: "Bearer " + data.actor.token,
          "X-Expected-Account": data.actor.id,
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
try {
  await context.addCookies([
    {
      name: sessionCookieFixtureName(config.origin),
      value: data.actor.token,
      url: config.origin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
  await page.goto(config.origin + "/platform/posts/" + data.nativeReceipt.id);
  await page.getByText(data.nativeInput.content, { exact: true }).waitFor();
  await page.getByText(data.actor.name, { exact: true }).first().waitFor();
  await bounded();
  await page.screenshot({
    path: join(output, "native-post-website-390.png"),
    fullPage: true
  });
  pass(
    "Native text publication renders in the actual website with its canonical author"
  );

  await page.goto(config.origin + "/platform");
  await page.locator("#compose-post").click();
  const form = page.getByRole("form", { name: "Publish post", exact: true });
  const content = form.getByLabel("Post content", { exact: true });
  await content.waitFor();
  const webText =
    "Fictional actual website publication with a lost acknowledgement";
  await content.fill(webText);
  await form.getByText("Author, audience and replies", { exact: true }).click();
  assert.equal(
    await form.getByLabel("Speaking as", { exact: true }).inputValue(),
    ""
  );
  assert.equal(
    await form
      .getByLabel("Also share on a church page", { exact: true })
      .inputValue(),
    ""
  );
  assert.equal(
    await form
      .getByLabel("Who can read this post?", { exact: true })
      .inputValue(),
    "PUBLIC"
  );
  assert.equal(
    await form.getByLabel("Who may reply?", { exact: true }).inputValue(),
    "VIEWERS"
  );
  const publishBodies = [];
  let committed;
  await page.route("**/api/platform/post-workspace", async (route) => {
    const body = route.request().postData();
    if (
      route.request().method() === "POST" &&
      body &&
      JSON.parse(body).operation === "publish-draft"
    ) {
      publishBodies.push(body);
      if (publishBodies.length === 1) {
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        committed = await response.json();
        await route.abort("failed");
        return;
      }
    }
    await route.continue();
  });
  await form.getByRole("button", { name: "Post", exact: true }).click();
  const retry = form.getByRole("button", {
    name: "Retry same request",
    exact: true
  });
  await retry.waitFor();
  assert.equal(await content.inputValue(), webText);
  assert.equal(await content.isDisabled(), true);
  assert.ok(committed?.postId);
  await page.setViewportSize({ width: 320, height: 844 });
  await retry.scrollIntoViewIfNeeded();
  await bounded();
  assert.equal(await retry.isVisible(), true);
  await page.screenshot({
    path: join(output, "lost-post-receipt-320.png"),
    fullPage: true
  });
  pass(
    "Actual website keeps publication text and a visible retry after a committed response is lost"
  );
  await retry.click();
  const link = form.getByRole("link", {
    name: "View published post",
    exact: true
  });
  await link.waitFor();
  assert.equal(publishBodies.length, 2);
  assert.equal(publishBodies[0], publishBodies[1]);
  await page.unroute("**/api/platform/post-workspace");
  const input = JSON.parse(publishBodies[0]);
  const draft = await db.privatePostDraft.findUniqueOrThrow({
    where: { ownerId_id: { ownerId: data.actor.id, id: input.id } }
  });
  assert.equal(draft.publishedPostId, committed.postId);
  assert.ok(draft.deletedAt);
  assert.equal(draft.payload, null);
  assert.equal(
    await db.platformPost.count({
      where: {
        authorId: data.actor.id,
        requestKey: "draft-" + draft.publicationKey
      }
    }),
    1
  );
  assert.equal(
    await db.postWorkspaceOperation.count({
      where: { ownerId: data.actor.id, key: input.mutationId }
    }),
    1
  );
  const post = await native("/api/platform/v1/posts/" + committed.postId);
  assert.equal(post.status, 200);
  const projected = decodeApiResponse("post", post.value, data.actor.id).data;
  assert.equal(projected.id, committed.postId);
  assert.equal(projected.body.text, webText);
  assert.equal(projected.audience, "PUBLIC");
  await link.click();
  await page.getByText(webText, { exact: true }).waitFor();
  await bounded();
  pass(
    "Byte-identical website retry consumes one draft and one publication; native reading sees the same post"
  );

  await db.platformPost.update({
    where: { id: data.nativeReceipt.id },
    data: {
      status: "WITHDRAWN",
      withdrawnAt: new Date(),
      version: { increment: 1 }
    }
  });
  await page.goto(config.origin + "/platform/posts/" + data.nativeReceipt.id);
  assert.equal(
    await page.getByText(data.nativeInput.content, { exact: true }).count(),
    0
  );
  assert.equal(
    (await native("/api/platform/v1/posts/" + data.nativeReceipt.id)).status,
    404
  );
  assert.equal(
    (await native("/api/platform/v1/posts", data.nativeInput)).status,
    403
  );
  assert.equal(
    await db.platformPost.count({
      where: {
        requestKey: data.nativeInput.requestKey,
        authorId: data.actor.id
      }
    }),
    1
  );
  pass(
    "Current withdrawal hides both readers and denies replay without republishing"
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
