import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { sessionCookieFixtureName } from "./session-cookie-fixture.mjs";

const fixture = resolve(process.argv[2] ?? "");
assert.ok(process.argv[2], "Pass the owned fictional HTTPS fixture");
const config = JSON.parse(
  readFileSync(join(fixture, "browser-env.json"), "utf8")
);
const data = JSON.parse(
  readFileSync(join(fixture, "comment-browser-fixture.json"), "utf8")
);
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
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
const output = join(fixture, "comment-browser");
mkdirSync(output, { mode: 0o700 });
const thread = () =>
  page.getByRole("region", { name: "Full discussion", exact: true });
const go = async (commentId) => {
  await page.goto(
    `${config.origin}/platform/posts/${data.postId}${commentId ? "?comment=" + commentId : ""}`
  );
  await thread().waitFor();
};
const neutral = async () => {
  const root = thread().locator(`[data-comment-id="${data.rootId}"]`);
  await root.getByText("Comment unavailable", { exact: true }).waitFor();
  const text = await thread().innerText();
  assert.ok(!text.includes(data.hiddenContent));
  assert.ok(!text.includes(data.hiddenName));
  assert.equal(
    await root.locator(":scope > div > a[href*='/platform/profile/']").count(),
    0
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    )
  );
};
const pass = (name) => {
  results.push(name);
  console.log("PASS " + name);
};
try {
  await go(data.childId);
  await thread()
    .locator(`[data-comment-id="${data.childId}"]`)
    .getByText(data.childContent, { exact: true })
    .waitFor();
  await neutral();
  assert.ok(
    (await thread().innerText()).includes("Replying to an unavailable comment")
  );
  await page.screenshot({
    path: join(output, "guest-linked-child.png"),
    fullPage: true
  });
  pass(
    "Guest linked child stays readable beneath neutral restricted Topic root"
  );

  await context.addCookies([
    {
      name: sessionCookieFixtureName(config.origin),
      value: data.owner.token,
      url: config.origin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
  await go(data.childId);
  await thread()
    .locator(`[data-comment-id="${data.childId}"]`)
    .getByText(data.childContent, { exact: true })
    .waitFor();
  await neutral();
  pass("Signed-in post owner sees the same neutral root and permitted child");

  await go(data.rootId);
  await thread()
    .getByText(
      "The linked comment is unavailable. You can read the permitted discussion below.",
      { exact: true }
    )
    .waitFor();
  await neutral();
  await thread()
    .getByRole("button", { name: "Read replies (1)", exact: true })
    .click();
  await thread()
    .locator(`[data-comment-id="${data.childId}"]`)
    .getByText(data.childContent, { exact: true })
    .waitFor();
  await neutral();
  pass(
    "Restricted direct link stays unavailable while remaining reply can be opened"
  );

  await context.clearCookies();
  let interrupted = false;
  const pattern = "**/api/platform/comments?**";
  await page.route(pattern, async (route) => {
    if (
      !interrupted &&
      new URL(route.request().url()).searchParams.get("view") === "roots"
    ) {
      interrupted = true;
      await route.abort("failed");
    } else await route.continue();
  });
  await go();
  const reload = thread().getByRole("button", {
    name: "Reload discussion",
    exact: true
  });
  await reload.waitFor();
  await page.waitForFunction(() => {
    const buttons = [
      ...document.querySelectorAll("[data-comment-thread] button")
    ];
    return buttons.some(
      (button) => button.textContent === "Reload discussion" && !button.disabled
    );
  });
  assert.equal(interrupted, true);
  assert.equal(await thread().locator("[data-comment-id]").count(), 0);
  await page.unroute(pattern);
  await reload.click();
  await neutral();
  pass(
    "Interrupted canonical read exposes retry and recovers without restricted text"
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
}
