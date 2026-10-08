import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const ts = require(process.env.TYPESCRIPT_MODULE ?? "typescript");
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ??
    process.env.HOME +
      "/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json"
)("playwright");
const source = "components/platform/public-share-controls.tsx";
const sourceContents = readFileSync(source, "utf8");
const modules = {
  "lucide-react": "exports.Copy = exports.Share2 = () => null;",
  "./private-post-workspace":
    "exports.usePrivatePostWorkspace = () => null; exports.usePrivatePostConcealed = () => window.fixtureConcealed;",
  "./read-visibility":
    "exports.useReadVisibility = () => !window.fixtureConcealed;",
  "./action-popover": "exports.ActionPopover = ({children}) => children;",
  "@/lib/platform/social-client": [
    "exports.socialRequest = (path, body, owner) => {",
    "if (body !== undefined) throw Error('Unexpected command in read-only QR fixture');",
    "return new Promise((resolve, reject) => window.previewReads.push({path, owner, resolve, reject}));",
    "};"
  ].join("\n"),
  // Stub only the encoder and its completion timing. Full application QA
  // separately decodes the actual qrcode package's canvas and PNG output.
  qrcode: [
    "exports.toCanvas = (canvas, url) => {",
    "canvas.width = canvas.height = 32; canvas.dataset.fixtureUrl = url;",
    "canvas.getContext('2d').fillRect(0, 0, 8, 8);",
    "return new Promise((resolve, reject) => window.qrDraws.push({url, canvas, resolve, reject}));",
    "};"
  ].join("\n"),
  controls: ts.transpileModule(sourceContents, {
    fileName: source,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX
    }
  }).outputText
};
for (const [name, pkg, file] of [
  ["react", "react", "react.development.js"],
  ["react/jsx-runtime", "react", "react-jsx-runtime.development.js"],
  ["react-dom", "react-dom", "react-dom.development.js"],
  ["react-dom/client", "react-dom", "react-dom-client.development.js"],
  ["scheduler", "scheduler", "scheduler.development.js"]
])
  modules[name] = readFileSync(
    join(dirname(require.resolve(pkg + "/package.json")), "cjs", file),
    "utf8"
  );

function fixtureRuntime() {
  const React = require("react"),
    { flushSync } = require("react-dom");
  const { PublicShareControls, ShareQr } = require("controls");
  const root = require("react-dom/client").createRoot(
    document.getElementById("root")
  );
  window.previewReads = [];
  window.qrDraws = [];
  window.downloadChecks = [];
  window.savedQr = [];
  window.fixtureConcealed = false;
  window.fixtureFocused = true;
  Object.defineProperty(document, "hasFocus", {
    value: () => window.fixtureFocused
  });
  Object.defineProperty(document, "visibilityState", { get: () => "visible" });
  Object.defineProperty(navigator, "onLine", { get: () => true });
  const encode = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function (...args) {
    window.lastEncodedUrl = this.dataset.fixtureUrl;
    return encode.apply(this, args);
  };
  HTMLAnchorElement.prototype.click = function () {
    window.savedQr.push({
      url: window.lastEncodedUrl,
      filename: this.download
    });
  };
  window.mountQr = (next) => {
    window.fixtureConcealed = next.concealed ?? false;
    flushSync(() =>
      root.render(
        React.createElement(
          React.StrictMode,
          null,
          next.mode === "public"
            ? React.createElement(PublicShareControls, {
                kind: "media",
                id: "media-a",
                accountId: next.owner
              })
            : React.createElement(ShareQr, {
                url: next.url,
                inline: next.inline ?? false,
                personal: next.personal ?? false,
                onDownload: (url) =>
                  new Promise((resolve, reject) =>
                    window.downloadChecks.push({ url, resolve, reject })
                  )
              })
        )
      )
    );
  };
  window.unmountQr = () => flushSync(() => root.render(null));
  window.resolvePreview = (index, available, url) =>
    window.previewReads[index].resolve({
      data: {
        available,
        url,
        title: "Fictional public resource",
        description: "Supplied public copy"
      }
    });
}
const bundle = [
  "(() => { const process = {env:{NODE_ENV:'development'}};",
  "const modules = {" +
    Object.entries(modules)
      .map(
        ([name, code]) =>
          JSON.stringify(name) +
          ": (module, exports, require) => {" +
          code +
          "\n}"
      )
      .join(",\n") +
    "};",
  "const cache = {}; const require = (name) => {",
  "if (cache[name]) return cache[name].exports;",
  "if (!modules[name]) throw Error('Unexpected controlled module');",
  "const module = cache[name] = {exports:{}};",
  "modules[name](module, module.exports, require); return module.exports; };",
  "(" + fixtureRuntime.toString() + ")(); })();"
].join("\n");
const urlA = "https://fixture.invalid/platform/media/media-a";
const urlB = "https://fixture.invalid/platform/media/media-b";
const results = [],
  errors = [];
function failureCode(error) {
  return error?.code === "ERR_ASSERTION"
    ? "assertion-failed"
    : error?.name === "TimeoutError"
      ? "controlled-timeout"
      : "controlled-scenario-error";
}
function reportFailure(name, error) {
  const code = failureCode(error);
  const allowed = ["strictEqual", "deepStrictEqual", "==", "ok", "match"];
  console.error(
    JSON.stringify({
      suite: "share-qr-client",
      scenario: name,
      code,
      operator: allowed.includes(error?.operator) ? error.operator : null
    })
  );
  return code;
}
let blockedNetworkRequests = 0;
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROMIUM_PATH ??
    (process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : undefined),
  args: [
    "--disk-cache-size=1",
    "--media-cache-size=1",
    "--disable-gpu-shader-disk-cache"
  ]
});
try {
  const context = await browser.newContext();
  await context.route("**/*", (route) => {
    blockedNetworkRequests++;
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(2500);
  page.on("pageerror", () => errors.push("browser-page-error"));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push("browser-console-error");
  });
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: bundle });
  const flush = () =>
    page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done))
        )
    );
  const count = (name) => page.evaluate((key) => window[key].length, name);
  const mount = async (config) => {
    await page.evaluate((next) => window.mountQr(next), config);
    await flush();
  };
  const resolveDraw = async (index) => {
    await page.evaluate((i) => window.qrDraws[i].resolve(), index);
    await flush();
  };
  const ready = async () => {
    await page.waitForFunction(() => window.qrDraws.length > 0);
    await resolveDraw((await count("qrDraws")) - 1);
    await page
      .getByRole("button", { name: "Download QR PNG", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Download QR PNG", exact: true })
        .isEnabled(),
      true
    );
  };
  const resolveCheck = async (index, accepted) => {
    await page.evaluate(
      ({ index, accepted }) => window.downloadChecks[index].resolve(accepted),
      { index, accepted }
    );
    await flush();
  };
  const resolvePreview = async (index, available = true, url = urlA) => {
    await page.evaluate(
      ({ index, available, url }) =>
        window.resolvePreview(index, available, url),
      { index, available, url }
    );
    await flush();
  };
  const download = () =>
    page.getByRole("button", { name: "Download QR PNG", exact: true });
  const publicQr = async (owner = "account-a") => {
    await mount({ mode: "public", owner });
    await page.locator("summary").click();
    await page.waitForFunction(() => window.previewReads.length > 0);
    await flush();
    await resolvePreview((await count("previewReads")) - 1);
    await page
      .getByRole("button", { name: "Show QR code", exact: true })
      .click();
    await resolvePreview((await count("previewReads")) - 1);
    await ready();
  };
  async function scenario(name, fn) {
    try {
      await fn();
      results.push({ name, pass: true });
    } catch (error) {
      results.push({
        name,
        pass: false,
        failureCode: reportFailure(name, error)
      });
    } finally {
      await page.evaluate(() => {
        window.unmountQr();
        window.fixtureFocused = true;
        window.fixtureConcealed = false;
      });
      await flush();
    }
  }
  await scenario(
    "replacement waits for its own QR render and downloads only its current canvas",
    async () => {
      await mount({ url: urlA });
      const older = (await count("qrDraws")) - 1;
      await mount({ url: urlB });
      const current = (await count("qrDraws")) - 1;
      assert.ok(current > older);
      await resolveDraw(older);
      assert.equal(await download().isDisabled(), true);
      await resolveDraw(current);
      await download().click();
      const check = (await count("downloadChecks")) - 1;
      assert.equal(
        await page.evaluate((i) => window.downloadChecks[i].url, check),
        urlB
      );
      const saved = await count("savedQr");
      await resolveCheck(check, true);
      assert.equal(await count("savedQr"), saved + 1);
      assert.equal(await page.evaluate(() => window.savedQr.at(-1).url), urlB);
    }
  );
  await scenario(
    "URL replacement discards a pending prior download without unlocking the next pending download",
    async () => {
      await mount({ url: urlA });
      await ready();
      await download().click();
      const old = (await count("downloadChecks")) - 1,
        saved = await count("savedQr");
      await mount({ url: urlB });
      await ready();
      await download().click();
      const current = (await count("downloadChecks")) - 1;
      await resolveCheck(old, true);
      assert.equal(await count("savedQr"), saved);
      assert.equal(await download().isDisabled(), true);
      await resolveCheck(current, true);
      assert.equal(await count("savedQr"), saved + 1);
      assert.equal(await page.evaluate(() => window.savedQr.at(-1).url), urlB);
    }
  );
  await scenario(
    "dialog close prevents a held access confirmation from downloading",
    async () => {
      await mount({ url: urlA });
      await ready();
      await download().click();
      const held = (await count("downloadChecks")) - 1,
        saved = await count("savedQr");
      await page
        .getByRole("button", { name: "Close QR code", exact: true })
        .click();
      await page.waitForFunction(() => !document.querySelector("dialog")?.open);
      await resolveCheck(held, true);
      assert.equal(await count("savedQr"), saved);
    }
  );
  await scenario(
    "unmount prevents a held access confirmation from downloading",
    async () => {
      await mount({ url: urlA });
      await ready();
      await download().click();
      const held = (await count("downloadChecks")) - 1,
        saved = await count("savedQr");
      await page.evaluate(() => window.unmountQr());
      await resolveCheck(held, true);
      assert.equal(await count("savedQr"), saved);
    }
  );
  await scenario(
    "personal invitation callback denies stale images and prevents duplicate pending validation",
    async () => {
      await mount({ url: urlA, inline: true, personal: true });
      await ready();
      const before = await count("downloadChecks"),
        saved = await count("savedQr");
      await download().click();
      await page.evaluate(() =>
        [...document.querySelectorAll("button")]
          .find((b) => b.textContent === "Download QR PNG")
          .click()
      );
      assert.equal(await count("downloadChecks"), before + 1);
      await resolveCheck(before, false);
      assert.equal(await count("savedQr"), saved);
      await download().click();
      await resolveCheck(before + 1, true);
      assert.equal(await count("savedQr"), saved + 1);
      assert.equal(
        await page.evaluate(() => window.savedQr.at(-1).filename),
        "godschurches-invitation-qr.png"
      );
    }
  );
  await scenario(
    "public download checks current guest eligibility and discards revoked or replaced destinations",
    async () => {
      for (const [available, url] of [
        [false, urlA],
        [true, urlB]
      ]) {
        await publicQr(null);
        const reads = await count("previewReads"),
          saved = await count("savedQr");
        await download().click();
        assert.equal(await count("previewReads"), reads + 1);
        assert.equal(
          await page.evaluate((i) => window.previewReads[i].owner, reads),
          null
        );
        await resolvePreview(reads, available, url);
        assert.equal(await page.locator("dialog").count(), 0);
        assert.equal(await count("savedQr"), saved);
        await page.evaluate(() => window.unmountQr());
        await flush();
      }
    }
  );
  await scenario(
    "account replacement pins the next reader and discards original-owner download completion",
    async () => {
      await publicQr("account-a");
      await download().click();
      const held = (await count("previewReads")) - 1,
        saved = await count("savedQr");
      assert.equal(
        await page.evaluate((i) => window.previewReads[i].owner, held),
        "account-a"
      );
      await mount({ mode: "public", owner: "account-b" });
      assert.equal(
        await page.evaluate(() => window.previewReads.at(-1).owner),
        "account-b"
      );
      await resolvePreview(held);
      assert.equal(await page.locator("dialog").count(), 0);
      assert.equal(await count("savedQr"), saved);
    }
  );
  await scenario(
    "blur and parent concealment discard held work; unfocused pageshow starts no current read",
    async () => {
      await publicQr();
      await download().click();
      const held = (await count("previewReads")) - 1,
        saved = await count("savedQr");
      await page.evaluate(() => {
        window.fixtureFocused = false;
        window.dispatchEvent(new Event("blur"));
      });
      await flush();
      const reads = await count("previewReads");
      await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
      await flush();
      assert.equal(await count("previewReads"), reads);
      await resolvePreview(held);
      assert.equal(await page.locator("dialog").count(), 0);
      assert.equal(await count("savedQr"), saved);
      await page.evaluate(() => {
        window.fixtureFocused = true;
        window.dispatchEvent(new Event("focus"));
      });
      await flush();
      const current = (await count("previewReads")) - 1;
      await mount({ mode: "public", owner: "account-a", concealed: true });
      await resolvePreview(current);
      assert.equal(
        await page
          .getByRole("group", { name: "Public sharing choices" })
          .count(),
        0
      );
      assert.equal(await count("savedQr"), saved);
    }
  );
  assert.equal(results.length, 8);
  assert.deepEqual(errors, []);
  assert.equal(blockedNetworkRequests, 0);
} catch (error) {
  reportFailure("controlled-harness-setup-or-final-check", error);
  errors.push("controlled-harness-failure");
} finally {
  const browserVersion = browser.version();
  await browser.close();
  const report = {
    executedAt: new Date().toISOString(),
    suite: "share-qr-client",
    source,
    sourceSha256: createHash("sha256").update(sourceContents).digest("hex"),
    harnessSha256: createHash("sha256")
      .update(readFileSync(new URL(import.meta.url)))
      .digest("hex"),
    browser: browserVersion,
    scopeEvidence:
      "controlled-component-with-blocked-network-and-stub-transport",
    encoder:
      "stubbed; actual QR pixels belong to the separate full application suite",
    productionWrites: null,
    externalSends: null,
    blockedNetworkRequests,
    results,
    errors
  };
  if (process.argv[2])
    writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600
    });
  console.log(JSON.stringify(report, null, 2));
  if (
    results.length !== 8 ||
    results.some((r) => !r.pass) ||
    errors.length ||
    blockedNetworkRequests
  )
    process.exitCode = 1;
}
