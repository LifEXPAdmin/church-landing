import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const ts = require(process.env.TYPESCRIPT_MODULE ?? "typescript");
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ??
    `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`
)("playwright");
const source = "components/platform/exchange-need-progress.tsx";
const modules = {
  "@/lib/platform/social-client": `
    exports.socialRequest = (path, body, owner, method, onDispatch, signal) =>
      new Promise((resolve) => {
        const listingId = new URL(path, "http://fixture.invalid").searchParams.get("listingId");
        window.needReads.push({owner, listingId, signal, resolve});
      });
  `,
  progress: ts.transpileModule(readFileSync(source, "utf8"), {
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
]) {
  modules[name] = readFileSync(
    join(dirname(require.resolve(`${pkg}/package.json`)), "cjs", file),
    "utf8"
  );
}
// Compile only the actual component and existing React runtime into memory.
// This deliberately avoids a Next build, database, new dependency or disk bundle.
const bundle = `(() => {
  const process = {env: {NODE_ENV: "development"}};
  const modules = {${Object.entries(modules)
    .map(
      ([name, code]) =>
        `${JSON.stringify(name)}: (module, exports, require) => {${code}\n}`
    )
    .join(",\n")}};
  const cache = {};
  const require = (name) => {
    if (cache[name]) return cache[name].exports;
    if (!modules[name]) throw Error("Unexpected fixture module: " + name);
    const module = cache[name] = {exports: {}};
    modules[name](module, module.exports, require);
    return module.exports;
  };
  const React = require("react"), {flushSync} = require("react-dom");
  const progress = require("progress");
  const root = require("react-dom/client").createRoot(document.getElementById("root"));
  window.needReads = [];
  window.needResults = {};
  function Frozen({children}) {
    return React.useState(children)[0];
  }
  function Control({owner, listingId}) {
    const refresh = progress.useNeedProgressRefresh(owner, listingId);
    React.useLayoutEffect(() => {
      window.refreshProgress = () => {
        if (!refresh) throw Error("Missing current page refresh owner");
        const index = window.needReads.length;
        refresh().then(
          () => window.needResults[index] = "resolved",
          () => window.needResults[index] = "rejected"
        );
      };
    }, [refresh, owner, listingId]);
    return null;
  }
  window.mountProgress = (config) => {
    const slot = {
      id: "slot-a", status: "Open", target: 10, unit: "parcels",
      committed: 10, received: config.received, returned: config.returned ?? 0, loan: config.loan ?? false
    };
    flushSync(() => root.render(React.createElement(React.StrictMode, null,
      React.createElement(progress.ExchangeNeedProgressProvider, {
        key: config.pageKey, owner: config.owner, listingId: config.listingId, slots: [slot]
      },
        React.createElement(Frozen, null, React.createElement(progress.NeedSlotProgress, {
          owner: config.owner, listingId: config.listingId, slot
        })),
        React.createElement(Control, {owner: config.owner, listingId: config.listingId})
      )
    )));
  };
  window.unmountProgress = () => flushSync(() => root.render(null));
  window.resolveProgress = (index, received, override = {}) => {
    const read = window.needReads[index];
    const totals = typeof received === "number" ? {received, returned: 0} : received;
    read.resolve({owner: read.owner, data: {
      ownerId: read.owner, listingId: read.listingId,
      need: {id: read.listingId, slots: [{
        id: "slot-a", status: "Open", target: 10, unit: "parcels", committed: 10, ...totals,
        privateNote: "Fictional private note", contributor: {name: "Fictional private name"}
      }]}, ...override
    }});
  };
})();`;

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
const results = [],
  errors = [];
try {
  const context = await browser.newContext();
  await context.route("**/*", (route) => route.abort());
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: bundle });
  async function scenario(name, fn) {
    try {
      await fn();
      results.push({ name, pass: true });
    } catch (error) {
      results.push({ name, pass: false, error: error.message });
    }
    await page.evaluate(() => window.unmountProgress());
  }
  const mount = (pageKey, received) =>
    page.evaluate((config) => window.mountProgress(config), {
      pageKey,
      owner: "coordinator-a",
      listingId: pageKey,
      received
    });
  const startRead = () =>
    page.evaluate(() => {
      const index = window.needReads.length;
      window.refreshProgress();
      return index;
    });
  const resolveRead = async (index, received, override) => {
    await page.evaluate(
      ({ index, received, override }) =>
        window.resolveProgress(index, received, override),
      { index, received, override }
    );
    await page.waitForFunction((i) => i in window.needResults, index);
    // Wait for React to commit after the request settles before checking that
    // an obsolete response did not change previously correct presentation.
    await page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done))
        )
    );
  };
  const expectReceived = async (value) => {
    await page.waitForFunction(
      (n) =>
        document.getElementById("root").textContent.includes(`Received: ${n}.`),
      value,
      { timeout: 1500 }
    );
    assert.ok(
      !(await page.locator("#root").innerText()).includes("Fictional private")
    );
  };
  await scenario(
    "confirmed totals update frozen children and accept a downward correction",
    async () => {
      await mount("receipt", 0);
      await expectReceived(0);
      await resolveRead(await startRead(), 5);
      await expectReceived(5);
      await resolveRead(await startRead(), 2);
      await expectReceived(2);
    }
  );
  await scenario(
    "a stale server render cannot roll back the acknowledged total",
    async () => {
      await mount("server-race", 0);
      await resolveRead(await startRead(), 5);
      await expectReceived(5);
      await mount("server-race", 0);
      await expectReceived(5);
    }
  );
  await scenario(
    "unmount aborts and prevents a late response from changing the next visit",
    async () => {
      await mount("navigation", 0);
      const held = await startRead();
      await page.evaluate(() => window.unmountProgress());
      const aborted = await page.evaluate(
        (i) => window.needReads[i].signal.aborted,
        held
      );
      await mount("navigation", 1);
      await expectReceived(1);
      await resolveRead(held, 9);
      await expectReceived(1);
      assert.equal(
        aborted,
        true,
        "The abandoned page must abort its outstanding read"
      );
    }
  );
  await scenario(
    "the newest read wins and wrong account/listing replies are rejected",
    async () => {
      await mount("read-race", 0);
      const older = await startRead(),
        newer = await startRead();
      assert.equal(
        await page.evaluate((i) => window.needReads[i].signal.aborted, older),
        true
      );
      await resolveRead(newer, 4);
      await expectReceived(4);
      await resolveRead(older, 8);
      await expectReceived(4);
      const wrongOwner = await startRead();
      await resolveRead(wrongOwner, 7, { ownerId: "another-account" });
      assert.equal(
        await page.evaluate((i) => window.needResults[i], wrongOwner),
        "rejected"
      );
      await expectReceived(4);
      const wrongListing = await startRead();
      await resolveRead(wrongListing, 7, { listingId: "another-listing" });
      assert.equal(
        await page.evaluate((i) => window.needResults[i], wrongListing),
        "rejected"
      );
      await expectReceived(4);
    }
  );
  await scenario(
    "account replacement discards the old page totals and pending read",
    async () => {
      await mount("account-change", 0);
      await resolveRead(await startRead(), 5);
      await expectReceived(5);
      const held = await startRead();
      await page.evaluate(() =>
        window.mountProgress({
          pageKey: "account-change",
          owner: "coordinator-b",
          listingId: "account-change",
          received: 2
        })
      );
      await expectReceived(2);
      assert.equal(
        await page.evaluate((i) => window.needReads[i].signal.aborted, held),
        true
      );
      await resolveRead(held, 9);
      await expectReceived(2);
    }
  );
  await scenario(
    "equipment receipt and return counts update together",
    async () => {
      await page.evaluate(() =>
        window.mountProgress({
          pageKey: "loan",
          owner: "coordinator-a",
          listingId: "loan",
          received: 0,
          loan: true
        })
      );
      await resolveRead(await startRead(), { received: 2, returned: 0 });
      await expectReceived(2);
      assert.match(
        await page.locator("#root").innerText(),
        /Returned: 0 of 2 received\./
      );
      await resolveRead(await startRead(), { received: 2, returned: 1 });
      await expectReceived(2);
      assert.match(
        await page.locator("#root").innerText(),
        /Returned: 1 of 2 received\./
      );
    }
  );
  assert.deepEqual(errors, [], "No browser or React errors are allowed");
} finally {
  await browser.close();
}
const report = JSON.stringify(
  {
    executedAt: new Date().toISOString(),
    source,
    sourceSha256: createHash("sha256")
      .update(readFileSync(source))
      .digest("hex"),
    harnessSha256: createHash("sha256")
      .update(readFileSync(new URL(import.meta.url)))
      .digest("hex"),
    browser: browser.version(),
    results,
    errors
  },
  null,
  2
);
if (process.argv[2])
  writeFileSync(process.argv[2], report + "\n", { flag: "wx" });
console.log(report);
if (results.some((result) => !result.pass)) process.exitCode = 1;
