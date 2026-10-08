import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Actual React DOM and PhotoViewer with modeled foreground and held transport.
// No Next server, database, identity service or image network is used.
const require = createRequire(import.meta.url);
const sourceRoot = resolve(
  process.env.PHOTO_FOREGROUND_SOURCE_ROOT ?? process.cwd()
);
assert.ok(process.argv[2], "Provide a new output directory");
const output = resolve(process.argv[2]);
mkdirSync(output, { mode: 0o700 });
const ts = require(process.env.TYPESCRIPT_MODULE ?? "typescript");
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ??
    process.env.HOME +
      "/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json"
)("playwright");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourceBindings = [];
function compile(path) {
  const bytes = readFileSync(join(sourceRoot, path));
  sourceBindings.push({ path, sha256: sha(bytes), bytes: bytes.length });
  const result = ts.transpileModule(bytes.toString(), {
    fileName: path,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true
    }
  });
  assert.equal(
    result.diagnostics?.filter(
      (d) => d.category === ts.DiagnosticCategory.Error
    ).length ?? 0,
    0
  );
  return result.outputText;
}
const modules = {
  viewer: compile("components/platform/photo-viewer.tsx"),
  "./read-visibility": compile("components/platform/read-visibility.ts"),
  "./reading-preferences":
    "exports.useReadingPreferences=()=>({preferences:{reduceData:true}});",
  "next/link":
    "module.exports=({children,...props})=>require('react').createElement('a',props,children);",
  "@/lib/platform/social-client":
    "exports.socialRequest=(...args)=>window.readGallery(args);"
};
const runtimeModules = [];
for (const [name, pkg, file] of [
  ["react", "react", "react.development.js"],
  ["react/jsx-runtime", "react", "react-jsx-runtime.development.js"],
  ["react-dom", "react-dom", "react-dom.development.js"],
  ["react-dom/client", "react-dom", "react-dom-client.development.js"],
  ["scheduler", "scheduler", "scheduler.development.js"]
]) {
  const bytes = readFileSync(
    join(dirname(require.resolve(pkg + "/package.json")), "cjs", file)
  );
  modules[name] = bytes.toString();
  runtimeModules.push({ name, package: pkg, file, sha256: sha(bytes) });
}
function fixtureRuntime() {
  const React = require("react"),
    { flushSync } = require("react-dom");
  const { ReadVisibility } = require("./read-visibility");
  const { PhotoViewer } = require("viewer");
  const root = require("react-dom/client").createRoot(
    document.getElementById("root")
  );
  window.fixtureFocused = true;
  window.fixtureOnline = true;
  window.fixtureVisibility = "visible";
  window.reads = [];
  window.closed = 0;
  window.parentVisible = true;
  Object.defineProperty(document, "hasFocus", {
    configurable: true,
    value: () => window.fixtureFocused
  });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => window.fixtureVisibility
  });
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => window.fixtureOnline
  });
  Object.defineProperty(window, "crypto", {
    configurable: true,
    value: { randomUUID: () => "fictional-viewer-history" }
  });
  window.readGallery = (args) =>
    new Promise((resolve, reject) =>
      window.reads.push({ args, resolve, reject })
    );
  const variant = (size) => ({
    url:
      "data:image/svg+xml," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><title>' +
          size +
          '</title><rect width="20" height="20" fill="green"/></svg>'
      ),
    width: 20,
    height: 20,
    bytes: 256
  });
  window.gallery = [
    {
      id: "photo-a",
      version: 1,
      alt: "Fictional private photo",
      caption: "Fictional caption",
      variants: { thumb: variant("thumb"), large: variant("large") }
    }
  ];
  window.renderViewer = () =>
    flushSync(() =>
      root.render(
        React.createElement(
          ReadVisibility.Provider,
          { value: window.parentVisible },
          React.createElement(PhotoViewer, {
            source: "/fictional/gallery",
            accountId: "owner-a",
            initialId: "photo-a",
            onClose: () => window.closed++
          })
        )
      )
    );
  window.signal = (name, focused, online = window.fixtureOnline) => {
    window.fixtureFocused = focused;
    window.fixtureOnline = online;
    flushSync(() =>
      (name === "visibilitychange" ? document : window).dispatchEvent(
        new Event(name)
      )
    );
  };
  window.reply = (index) =>
    window.reads[index].resolve({ data: { images: window.gallery } });
  window.state = () => ({
    focused: document.hasFocus(),
    online: navigator.onLine,
    visibility: document.visibilityState,
    reads: window.reads.length,
    imagePresent: !!document.querySelector("dialog img"),
    imageVisible: !!document.querySelector("dialog img")?.getClientRects()
      .length,
    status: document.querySelector('[role="status"]')?.textContent ?? "",
    active: document.activeElement?.tagName,
    closed: window.closed
  });
  window.unmount = () => flushSync(() => root.unmount());
}
const bundle = [
  "(()=>{const process={env:{NODE_ENV:'development'}};const modules={",
  Object.entries(modules)
    .map(
      ([name, code]) =>
        JSON.stringify(name) + ":(module,exports,require)=>{" + code + "\n}"
    )
    .join(","),
  "};const cache={};function require(name){if(cache[name])return cache[name].exports;if(!modules[name])throw Error('Unexpected module '+name);const m=cache[name]={exports:{}};modules[name](m,m.exports,require);return m.exports;}",
  "(" + fixtureRuntime.toString() + ")();})();"
].join("\n");
const evidence = {
  suite: "photo-foreground-client",
  scopeEvidence: "controlled-component-with-blocked-network-and-stub-transport",
  productionWrites: null,
  externalSends: null,
  startedAt: new Date().toISOString(),
  status: "running",
  sourceBindings,
  runtimeModules,
  harnessSha256: sha(readFileSync(fileURLToPath(import.meta.url))),
  caseFilter: process.env.PHOTO_FOREGROUND_CASE_FILTER ?? null,
  sourceOverride: !!process.env.PHOTO_FOREGROUND_SOURCE_ROOT,
  cases: [],
  errors: [],
  blockedNetworkRequests: 0,
  limits: [
    "Actual component and React DOM with modeled focus, visibility, online state and held fictional transport.",
    "No native trusted-focus, canonical identity, image-network, full application, database, production or physical-device proof.",
    "The reading preference is a fixed Data Saver boundary stub; the original seven Data Saver cases cover the actual ReadingProvider separately."
  ]
};
const save = () =>
  writeFileSync(
    join(output, "results.json"),
    JSON.stringify(evidence, null, 2) + "\n",
    { mode: 0o600 }
  );
save();
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROMIUM_PATH ??
    (process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : undefined),
  args: [
    "--disable-background-networking",
    "--disk-cache-size=1",
    "--media-cache-size=1",
    "--disable-gpu-shader-disk-cache"
  ]
});
try {
  const context = await browser.newContext({ serviceWorkers: "block" });
  await context.route("**/*", (route) => {
    evidence.blockedNetworkRequests++;
    return route.abort();
  });
  async function scenario(name, run) {
    if (evidence.caseFilter && !new RegExp(evidence.caseFilter).test(name))
      return;
    const page = await context.newPage();
    page.setDefaultTimeout(3000);
    const errors = [],
      record = { name, phase: "setup", status: "setup", observations: [] };
    evidence.cases.push(record);
    page.on("pageerror", (error) => errors.push(error.message));
    const flush = () =>
      page.evaluate(() => new Promise((done) => setTimeout(done, 0)));
    const observe = async (phase) => {
      record.phase = phase;
      record.observations.push({
        phase,
        ...(await page.evaluate(() => window.state()))
      });
      save();
    };
    try {
      await page.setContent(
        '<!doctype html><title>Fictional viewer</title><button id="outside">Outside</button><div id="root"></div>'
      );
      await page.addScriptTag({ content: bundle });
      await run({ page, flush, observe });
      assert.deepEqual(errors, []);
      record.status = "passed";
    } catch (error) {
      record.status = "failed";
      record.error = error.message;
      evidence.errors.push({
        name,
        phase: record.phase,
        message: error.message
      });
    } finally {
      record.pageErrors = errors;
      await page.evaluate(() => window.unmount?.()).catch(() => {});
      await page.close();
      save();
    }
  }
  const mounted = async (page) => {
    await page.evaluate(() => window.renderViewer());
    await page.waitForFunction(() => window.reads.length === 1);
  };
  const ready = async (page) => {
    await mounted(page);
    await page.evaluate(() => window.reply(0));
    await page.getByRole("img", { name: "Fictional private photo" }).waitFor();
  };
  await scenario(
    "visible-unfocused resume does not reload private gallery",
    async ({ page, flush, observe }) => {
      await ready(page);
      await page.evaluate(() => window.signal("blur", false));
      assert.equal(await page.locator("dialog img").count(), 0);
      await page.evaluate(() => {
        window.signal("online", false);
        window.signal("visibilitychange", false);
      });
      await flush();
      await observe("unfocused resume admission");
      if (await page.evaluate(() => window.reads.length > 1)) {
        await page.evaluate(() => window.reply(window.reads.length - 1));
        await flush();
        await observe("unfocused matching reply");
      }
      assert.equal(
        await page.evaluate(() => window.reads.length),
        1,
        "Unfocused resume must not read"
      );
      assert.equal(await page.locator("dialog img").count(), 0);
    }
  );
  await scenario(
    "held reply after silent focus loss stays concealed",
    async ({ page, flush, observe }) => {
      await mounted(page);
      await page.evaluate(() => {
        window.fixtureFocused = false;
        window.reply(0);
      });
      await flush();
      await observe("held reply settled without blur");
      assert.equal(
        await page.locator("dialog img").count(),
        0,
        "A late gallery reply must not publish while unfocused"
      );
    }
  );
  await scenario(
    "initial unfocused and offline admission waits for foreground",
    async ({ page, flush, observe }) => {
      await page.evaluate(() => {
        window.fixtureFocused = false;
        window.fixtureOnline = false;
        window.renderViewer();
      });
      await flush();
      assert.equal(await page.evaluate(() => window.reads.length), 0);
      await page.evaluate(() => window.signal("online", false, true));
      await flush();
      assert.equal(await page.evaluate(() => window.reads.length), 0);
      await page.evaluate(() => window.signal("focus", true));
      await page.waitForFunction(() => window.reads.length === 1);
      await page.evaluate(() => window.reply(0));
      await page.getByRole("img").waitFor();
      await observe("foreground recovery");
    }
  );
  await scenario(
    "blur invalidates held reply and focused recheck recovers",
    async ({ page, flush, observe }) => {
      await mounted(page);
      await page.evaluate(() => {
        window.signal("blur", false);
        window.reply(0);
      });
      await flush();
      assert.equal(await page.locator("dialog img").count(), 0);
      await page.evaluate(() => window.signal("focus", true));
      await page.waitForFunction(() => window.reads.length === 2);
      await page.evaluate(() => window.reply(1));
      await page.getByRole("img").waitFor();
      await observe("new focused read accepted");
    }
  );
  await scenario(
    "held reply after silent offline transition stays concealed",
    async ({ page, flush, observe }) => {
      await mounted(page);
      await page.evaluate(() => {
        window.fixtureOnline = false;
        window.reply(0);
      });
      await flush();
      await observe("offline reply");
      assert.equal(await page.locator("dialog img").count(), 0);
    }
  );
  await scenario(
    "source concealment invalidates pending read and preserves history",
    async ({ page, flush, observe }) => {
      await mounted(page);
      const historyLength = await page.evaluate(() => history.length);
      await page.evaluate(() => {
        window.parentVisible = false;
        window.renderViewer();
        window.reply(0);
      });
      await flush();
      assert.equal(await page.locator("dialog img").count(), 0);
      await page.evaluate(() => {
        window.parentVisible = true;
        window.renderViewer();
      });
      await page.waitForFunction(() => window.reads.length === 2);
      await page.evaluate(() => window.reply(1));
      await page.getByRole("img").waitFor();
      assert.equal(await page.evaluate(() => history.length), historyLength);
      await observe("same viewer source recovery");
    }
  );
  await scenario(
    "refresh discards larger selection and rechecks original owner",
    async ({ page, observe }) => {
      await ready(page);
      await page
        .getByRole("button", { name: "Load larger photo", exact: true })
        .click();
      assert.match(
        await page.locator("dialog img").getAttribute("src"),
        /large/
      );
      await page.evaluate(() => {
        window.signal("blur", false);
        window.signal("focus", true);
      });
      await page.waitForFunction(() => window.reads.length === 2);
      assert.deepEqual(
        await page.evaluate(() => window.reads.map((r) => r.args.slice(0, 3))),
        [
          ["/fictional/gallery", undefined, "owner-a"],
          ["/fictional/gallery", undefined, "owner-a"]
        ]
      );
      await page.evaluate(() => window.reply(1));
      await page.getByRole("img").waitFor();
      assert.match(
        await page.locator("dialog img").getAttribute("src"),
        /thumb/
      );
      await observe("preview reset after access refresh");
    }
  );
  await scenario(
    "failed current access keeps photos absent",
    async ({ page, flush, observe }) => {
      await ready(page);
      await page.evaluate(() => {
        window.signal("blur", false);
        window.signal("focus", true);
      });
      await page.waitForFunction(() => window.reads.length === 2);
      await page.evaluate(() =>
        window.reads[1].reject(Error("Fictional current-owner denial"))
      );
      await flush();
      await observe("current access denied");
      assert.equal(await page.locator("dialog img").count(), 0);
      assert.match(await page.getByRole("status").innerText(), /unavailable/);
    }
  );
  await context.close();
} finally {
  await browser.close();
  evidence.finishedAt = new Date().toISOString();
  evidence.passed = evidence.cases.filter((c) => c.status === "passed").length;
  evidence.failed = evidence.cases.filter((c) => c.status === "failed").length;
  evidence.results = evidence.cases.map((c) => ({
    name: c.name,
    pass: c.status === "passed"
  }));
  evidence.status =
    evidence.failed || evidence.blockedNetworkRequests
      ? "failed"
      : evidence.cases.length === 8 &&
          !evidence.caseFilter &&
          !evidence.sourceOverride
        ? "passed"
        : "diagnostic";
  save();
}
console.log(
  JSON.stringify({
    status: evidence.status,
    passed: evidence.passed,
    failed: evidence.failed,
    result: join(output, "results.json"),
    sha256: sha(readFileSync(join(output, "results.json")))
  })
);
if (evidence.failed || evidence.blockedNetworkRequests) process.exitCode = 1;
