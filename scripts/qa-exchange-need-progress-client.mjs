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
const sourceContents = readFileSync(source, "utf8");
const modules = {
  "@/lib/platform/social-client": `
    exports.socialRequest = (path, body, owner, method, onDispatch, signal) =>
      new Promise((resolve, reject) => {
        const listingId = new URL(path, "http://fixture.invalid").searchParams.get("listingId");
        if (body !== undefined || !signal) throw Error("Progress must use an abortable canonical read");
        window.needReads.push({owner, listingId, signal, resolve, reject});
      });
  `,
  progress: ts.transpileModule(sourceContents, {
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
  function RetainedDraft() {
    const [note, setNote] = React.useState("");
    return React.createElement("input", {
      "aria-label": "Fictional retained offer note", value: note,
      onChange: (event) => setNote(event.target.value)
    });
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
      id: "slot-a", status: config.status ?? "Open", target: config.target ?? 10, unit: "parcels",
      committed: Object.hasOwn(config, "committed") ? config.committed : 10,
      received: config.received, returned: config.returned ?? 0, loan: config.loan ?? false
    };
    flushSync(() => root.render(React.createElement(React.StrictMode, null,
      React.createElement(progress.ExchangeNeedProgressProvider, {
        key: config.pageKey, owner: config.owner, listingId: config.listingId,
        needVersion: config.needVersion ?? 1, slots: config.slots ?? [slot]
      },
        React.createElement(Frozen, null,
          React.createElement(React.Fragment, null,
            React.createElement(progress.NeedSlotProgress, {
              owner: config.owner, listingId: config.listingId, slot
            }),
            React.createElement(RetainedDraft)
          )
        ),
        React.createElement(Control, {owner: config.owner, listingId: config.listingId})
      )
    )));
  };
  window.unmountProgress = () => flushSync(() => root.render(null));
  window.resolveProgress = (index, received, override = {}, needVersion = 2) => {
    const read = window.needReads[index];
    const totals = typeof received === "number" ? {received, returned: 0} : received;
    read.resolve({owner: read.owner, data: {
      ownerId: read.owner, listingId: read.listingId,
      need: {id: read.listingId, version: needVersion, slots: [{
        id: "slot-a", status: "Open", target: 10, unit: "parcels", committed: 10, loan: false, ...totals,
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
  page.setDefaultTimeout(2000);
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
  const mount = (pageKey, received, options = {}) =>
    page.evaluate((config) => window.mountProgress(config), {
      pageKey,
      owner: "coordinator-a",
      listingId: pageKey,
      received,
      ...options
    });
  const startRead = () =>
    page.evaluate(() => {
      const index = window.needReads.length;
      window.refreshProgress();
      return index;
    });
  const flush = () =>
    page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done))
        )
    );
  const resolveRead = async (index, received, override, needVersion = 2) => {
    await page.evaluate(
      ({ index, received, override, needVersion }) =>
        window.resolveProgress(index, received, override, needVersion),
      { index, received, override, needVersion }
    );
    // Wait for React to commit after the request settles before checking that
    // an obsolete response did not change previously correct presentation.
    await flush();
  };
  const rejectRead = async (index) => {
    await page.evaluate(
      (i) =>
        window.needReads[i].reject(Error("Fictional progress read failure")),
      index
    );
    await flush();
  };
  const readCount = () => page.evaluate(() => window.needReads.length);
  const expectOneRead = async (before) => {
    await page.waitForFunction((n) => window.needReads.length > n, before);
    await flush();
    assert.equal(
      await readCount(),
      before + 1,
      "One automatic current read per changed summary"
    );
    return before;
  };
  const expectConcealed = async () => {
    await flush();
    const text = await page.locator("#root").innerText();
    assert.doesNotMatch(text, /(?:Committed|Received|Returned|Target): [0-9]/);
    assert.ok(
      text.trim().length > 0,
      "An unavailable summary should explain how to recover"
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
    "newer server props replace a previously confirmed progress summary",
    async () => {
      await mount("newer-props", 0);
      await resolveRead(await startRead(), 5);
      await expectReceived(5);
      await page.evaluate(() =>
        window.mountProgress({
          pageKey: "newer-props",
          owner: "coordinator-a",
          listingId: "newer-props",
          needVersion: 3,
          received: 7,
          target: 20,
          status: "Closed"
        })
      );
      const text = await page.locator("#root").innerText();
      assert.match(text, /Closed\. Target: 20 parcels\./);
      assert.match(text, /Received: 7\./);
    }
  );
  await scenario(
    "confirmed totals update frozen children and accept a downward correction",
    async () => {
      await mount("receipt", 0);
      await expectReceived(0);
      await resolveRead(await startRead(), 5);
      await expectReceived(5);
      await resolveRead(await startRead(), 2, undefined, 3);
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
      await resolveRead(await startRead(), {
        received: 2,
        returned: 0,
        loan: true
      });
      await expectReceived(2);
      assert.match(
        await page.locator("#root").innerText(),
        /Returned: 0 of 2 received\./
      );
      await resolveRead(
        await startRead(),
        { received: 2, returned: 1, loan: true },
        undefined,
        3
      );
      await expectReceived(2);
      assert.match(
        await page.locator("#root").innerText(),
        /Returned: 1 of 2 received\./
      );
      await mount("loan", 2, { needVersion: 4, loan: false });
      assert.doesNotMatch(
        await page.locator("#root").innerText(),
        /Equipment loan|Returned:/
      );
    }
  );
  await scenario(
    "newer props recover after a failed canonical refresh",
    async () => {
      await mount("failed-then-newer", 0);
      await resolveRead(await startRead(), 5);
      const failed = await startRead();
      await rejectRead(failed);
      assert.equal(
        await page.evaluate((i) => window.needResults[i], failed),
        "rejected"
      );
      await mount("failed-then-newer", 8, {
        needVersion: 4,
        status: "Closed",
        target: 20
      });
      await expectReceived(8);
      assert.match(
        await page.locator("#root").innerText(),
        /Closed\. Target: 20 parcels\./
      );
    }
  );
  await scenario(
    "a higher server revision survives a delayed lower server revision",
    async () => {
      await mount("server-high-water", 0);
      await resolveRead(await startRead(), 5, undefined, 6);
      await mount("server-high-water", 8, { needVersion: 8 });
      await expectReceived(8);
      await mount("server-high-water", 7, { needVersion: 7 });
      await expectReceived(8);
      await resolveRead(await startRead(), 6, undefined, 6);
      await expectReceived(8);
    }
  );
  await scenario(
    "a pending older read cannot undo newer server progress",
    async () => {
      await mount("props-during-read", 5, { needVersion: 6 });
      const held = await startRead();
      await mount("props-during-read", 8, { needVersion: 8 });
      await expectReceived(8);
      await resolveRead(held, 7, undefined, 7);
      await expectReceived(8);
    }
  );
  await scenario(
    "equal-version differing props trigger one canonical read without a rerender loop",
    async () => {
      await mount("equal-revision", 5, { needVersion: 5 });
      const before = await readCount();
      await mount("equal-revision", 7, { needVersion: 5 });
      const check = await expectOneRead(before);
      await expectConcealed();
      // Current authorization can legitimately reproduce the original summary.
      await resolveRead(check, 5, undefined, 5);
      await expectReceived(5);
      await mount("equal-revision", 7, { needVersion: 5 });
      await flush();
      assert.equal(
        await readCount(),
        before + 1,
        "Identical server props must not start another read"
      );
      await expectReceived(5);
    }
  );
  await scenario(
    "equal-version redaction stays concealed after failure and recovers through Check progress",
    async () => {
      await mount("redaction-retry", 5, { needVersion: 5 });
      const before = await readCount();
      const redacted = {
        needVersion: 5,
        committed: null,
        status: "Event role unavailable"
      };
      await mount("redaction-retry", null, redacted);
      const check = await expectOneRead(before);
      await expectConcealed();
      await rejectRead(check);
      await expectConcealed();
      await mount("redaction-retry", null, redacted);
      await flush();
      assert.equal(
        await readCount(),
        before + 1,
        "A failed automatic check must not retry itself"
      );
      const retry = await readCount();
      await page.getByRole("button", { name: /check progress/i }).click();
      await expectOneRead(retry);
      await resolveRead(
        retry,
        {
          received: null,
          returned: 0,
          committed: null,
          status: "Event role unavailable"
        },
        undefined,
        5
      );
      const text = await page.locator("#root").innerText();
      assert.match(text, /Event role unavailable/);
      assert.doesNotMatch(text, /(?:Committed|Received|Returned): [0-9]/);
      assert.equal(await readCount(), retry + 1);
    }
  );
  await scenario(
    "newer props recover a disputed summary even after its canonical read failed",
    async () => {
      await mount("disputed-then-newer", 5, { needVersion: 5 });
      const check = await readCount();
      await mount("disputed-then-newer", null, {
        needVersion: 5,
        committed: null,
        status: "Event role unavailable"
      });
      await expectOneRead(check);
      await rejectRead(check);
      await expectConcealed();
      await mount("disputed-then-newer", 8, {
        needVersion: 6,
        status: "Closed",
        target: 20
      });
      await expectReceived(8);
      assert.match(
        await page.locator("#root").innerText(),
        /Closed\. Target: 20 parcels\./
      );
    }
  );
  await scenario(
    "an earlier equal-version read cannot reveal progress during a newer redaction check",
    async () => {
      await mount("redaction-race", 5, { needVersion: 5 });
      const older = await startRead();
      const current = await readCount();
      await mount("redaction-race", null, {
        needVersion: 5,
        committed: null,
        status: "Event role unavailable"
      });
      await expectOneRead(current);
      await resolveRead(older, 9, undefined, 5);
      await expectConcealed();
      await resolveRead(
        current,
        {
          received: null,
          returned: 0,
          committed: null,
          status: "Event role unavailable"
        },
        undefined,
        5
      );
      assert.doesNotMatch(
        await page.locator("#root").innerText(),
        /(?:Committed|Received): [0-9]/
      );
    }
  );
  await scenario(
    "anonymous owners can canonically resolve equal-version progress",
    async () => {
      await mount("guest-progress", 5, { owner: null, needVersion: 5 });
      const check = await readCount();
      await mount("guest-progress", 6, { owner: null, needVersion: 5 });
      await expectOneRead(check);
      assert.equal(
        await page.evaluate((i) => window.needReads[i].owner, check),
        null
      );
      await expectConcealed();
      await resolveRead(check, 6, undefined, 5);
      await expectReceived(6);
    }
  );
  await scenario(
    "a removed current slot cannot fall back to the retained child snapshot",
    async () => {
      await mount("removed-slot", 5, { needVersion: 5 });
      await mount("removed-slot", 5, { needVersion: 6, slots: [] });
      await expectConcealed();
      const check = await readCount();
      await page.getByRole("button", { name: /check progress/i }).click();
      await expectOneRead(check);
      await resolveRead(check, 5, {
        need: { id: "removed-slot", version: 6, slots: [] }
      });
      await expectConcealed();
    }
  );
  await scenario(
    "frozen controlled drafts keep their DOM owner through revision and redaction recovery",
    async () => {
      await mount("retained-draft", 0);
      const input = page.getByLabel("Fictional retained offer note");
      await input.fill("Fictional unsent offer details");
      await page.evaluate(() => {
        window.originalDraft = document.querySelector("input");
      });
      await resolveRead(await startRead(), 5);
      await mount("retained-draft", 7, { needVersion: 3 });
      await expectReceived(7);
      const check = await readCount();
      await mount("retained-draft", null, {
        needVersion: 3,
        committed: null,
        status: "Event role unavailable"
      });
      await expectOneRead(check);
      await expectConcealed();
      await resolveRead(check, 8, undefined, 4);
      await expectReceived(8);
      assert.equal(await input.inputValue(), "Fictional unsent offer details");
      assert.equal(
        await page.evaluate(
          () => window.originalDraft === document.querySelector("input")
        ),
        true
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
    sourceSha256: createHash("sha256").update(sourceContents).digest("hex"),
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
