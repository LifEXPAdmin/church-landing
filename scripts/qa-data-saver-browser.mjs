// Browser-level component integration. Identity responses are fictional fixtures;
// this does not claim database, hosted or production verification.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { createServer } from "node:http";
const require = createRequire(import.meta.url);
const output = process.env.DATA_SAVER_QA_DIR;
assert.ok(output, "Set DATA_SAVER_QA_DIR to a new isolated artifact folder");
mkdirSync(output, { recursive: false });
const loader = join(output, "typescript-loader.cjs");
writeFileSync(
  loader,
  `const ts = require(${JSON.stringify(require.resolve("typescript"))});
module.exports = function(source) {
 if (process.env.DATA_SAVER_BASELINE_SOURCE && this.resourcePath.endsWith("/components/platform/photo-viewer.tsx")) source = require("node:fs").readFileSync(process.env.DATA_SAVER_BASELINE_SOURCE,"utf8");
 return ts.transpileModule(source, {
 compilerOptions: {jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020,
 module: ts.ModuleKind.ESNext, esModuleInterop: true}, fileName: this.resourcePath
}).outputText; };`
);
const entry = join(output, "entry.tsx");
writeFileSync(
  entry,
  `import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
import {PhotoViewer} from ${JSON.stringify(resolve("components/platform/photo-viewer.tsx"))};
import {ReadingProvider} from ${JSON.stringify(resolve("components/platform/reading-preferences.tsx"))};
import {defaultReadingPreferences} from ${JSON.stringify(resolve("lib/platform/reading-preferences.ts"))};
function Fixture() { const [open,setOpen] = useState(false); return <ReadingProvider initial={{...defaultReadingPreferences,reduceData:true}}><button onClick={()=>setOpen(true)}>Open fixture photo</button>{open && <PhotoViewer source="/api/platform/gallery?postId=fixture" accountId="a" initialId="one" onClose={()=>setOpen(false)}/>}</ReadingProvider>; }
createRoot(document.getElementById('root')).render(<Fixture/>);`
);
const packed = require("next/dist/compiled/webpack/webpack");
packed.init();
await new Promise((resolveBuild, reject) =>
  packed.webpack(
    {
      mode: "development",
      plugins: [new packed.webpack.ProvidePlugin({process: require.resolve("next/dist/build/polyfills/process")})],
      devtool: false,
      entry,
      output: { path: resolve(output), filename: "bundle.js" },
      resolve: {
        extensions: [".tsx", ".ts", ".js"],
        alias: { "@": process.cwd() },
        modules: [resolve("node_modules"), "node_modules"]
      },
      module: {
        rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: loader }]
      }
    },
    (error, stats) =>
      error || stats.hasErrors()
        ? reject(error ?? Error(stats.toString({ all: false, errors: true })))
        : resolveBuild()
  )
);
const cssRoot = process.env.DATA_SAVER_QA_CSS;
assert.ok(cssRoot, "Pass a verified build CSS directory");
const css = readdirSync(cssRoot)
  .filter((p) => p.endsWith(".css"))
  .map((p) => readFileSync(join(cssRoot, p), "utf8"))
  .join("\n");
const requests = [];
let owner = "a";
const images = ["one", "two"].map((id) => ({
  id,
  version: 1,
  purpose: "POST_PHOTO",
  caption: "A fictional church photo",
  alt: "Fictional church courtyard",
  position: 0,
  crop: null,
  variants: Object.fromEntries(
    ["thumb", "medium", "large", "original"].map((size, i) => [
      size,
      {
        width: 240 * (i + 1),
        height: 160 * (i + 1),
        bytes: 2048 * (i + 1),
        url: `/api/platform/images/${id}/${size}`
      }
    ])
  )
}));
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://fixture").pathname;
  if (path === "/bundle.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(readFileSync(join(output, "bundle.js")));
  } else if (path === "/fixture.css") {
    res.setHeader("Content-Type", "text/css");
    res.end(css);
  } else if (path === "/api/platform/profile") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ id: owner }));
  } else if (path === "/api/platform/gallery") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ images }));
  } else if (path.startsWith("/api/platform/images/")) {
    requests.push(path);
    res.setHeader("Content-Type", "image/svg+xml");
    res.end(
      '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="#678569"/><path d="M70 140V70L120 30L170 70V140Z" fill="#eee6d8"/></svg>'
    );
  } else {
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><title>Data saver fixture</title><div id="root"></div><script src="/bundle.js"></script>'
    );
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ??
    `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`
)("playwright");
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROMIUM_PATH ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }
});
const page = await context.newPage();
page.setDefaultTimeout(8000);
const errors = [];
const passed = [];
page.on("pageerror", (e) => { errors.push(e.message); console.error("PAGE_ERROR", e.message); });
const ok = (s) => {
  passed.push(s);
  console.log("PASS", s);
};
const preference = (enabled) =>
  encodeURIComponent(
    JSON.stringify({
      appearance: "system",
      mode: "pages",
      size: "comfortable",
      reduceMotion: false,
      reduceData: enabled,
      hideReactionCounts: false
    })
  );
await context.addCookies([
  { name: "godschurches_reading", value: preference(true), url: origin }
]);
try {
  await page.goto(origin + "/platform");
  await page.getByRole("button", { name: "Open fixture photo" }).click();
  const dialog = page.getByRole("dialog");
  const photo = dialog.locator("img");
  await photo.waitFor();
  await page.waitForFunction(
    () => document.querySelector("dialog img")?.complete
  );
  assert.ok(
    (await photo.getAttribute("src")).endsWith("/thumb"),
    "Data saver must open a small preview"
  );
  assert.equal(
    requests.some((p) => /\/(large|original)$/.test(p)),
    false
  );
  ok("Opening the viewer with Data saver requests only the small preview");
  const larger = dialog.getByRole("button", {
    name: "Load larger photo",
    exact: true
  });
  await larger.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() =>
    document
      .querySelector("dialog img")
      ?.getAttribute("src")
      ?.endsWith("/large")
  );
  await page.waitForFunction(
    () => document.querySelector("dialog img")?.complete
  );
  assert.ok(requests.includes("/api/platform/images/one/large"));
  ok("Keyboard activation explicitly loads the larger version");
  await dialog.getByRole("button", { name: "Next photo", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector("dialog img")?.getAttribute("src") ===
      "/api/platform/images/two/thumb"
  );
  assert.equal(requests.includes("/api/platform/images/two/large"), false);
  await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
  assert.equal(requests.includes("/api/platform/images/two/large"), false);
  ok("Moving and zooming do not carry large-image consent to another photo");
  await larger.click();
  await page.waitForFunction(
    () =>
      document.querySelector("dialog img")?.getAttribute("src") ===
      "/api/platform/images/two/large"
  );
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(
    () =>
      document.querySelector("dialog img")?.getAttribute("src") ===
      "/api/platform/images/two/thumb"
  );
  ok("Rechecking access restores the small preview");
  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    true
  );
  await dialog.screenshot({ path: join(output, "data-saver-mobile.png") });
  ok("Viewer controls fit a narrow screen with enlarged text");
  owner = "b";
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await dialog
    .getByRole("status")
    .filter({ hasText: "This photo is unavailable" })
    .waitFor();
  assert.equal(await photo.count(), 0);
  ok("Changed account does not recover the previous account's image");
  owner = "a";
  await context.addCookies([
    { name: "godschurches_reading", value: preference(false), url: origin }
  ]);
  await page.goto(origin + "/platform");
  await page.getByRole("button", { name: "Open fixture photo" }).click();
  await page.waitForFunction(
    () =>
      document.querySelector("dialog img")?.getAttribute("src") ===
      "/api/platform/images/one/large"
  );
  assert.equal(await larger.count(), 0);
  assert.equal(
    requests.some((p) => p.endsWith("/original")),
    false
  );
  assert.deepEqual(errors, []);
  ok("Normal viewing is unchanged; no originals and no browser errors");
  writeFileSync(
    join(output, "results.json"),
    JSON.stringify(
      {
        scope:
          "Actual React viewer, ReadingProvider and network requests; fictional identity/gallery/image API; not full app or live",
        passed,
        requests,
        errors
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
