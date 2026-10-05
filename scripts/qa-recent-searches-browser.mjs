// Browser-level component integration. Identity responses are fictional fixtures;
// this does not claim database, hosted or production verification.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { createServer } from "node:http";
const require = createRequire(import.meta.url);
const output = process.env.RECENT_SEARCH_QA_DIR;
assert.ok(output, "Set RECENT_SEARCH_QA_DIR to a new isolated artifact folder");
mkdirSync(output, { recursive: false });
const loader = join(output, "typescript-loader.cjs");
writeFileSync(
  loader,
  `const ts = require(${JSON.stringify(require.resolve("typescript"))});
module.exports = function(source) { return ts.transpileModule(source, {
 compilerOptions: {jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020,
 module: ts.ModuleKind.ESNext, esModuleInterop: true}, fileName: this.resourcePath
}).outputText; };`
);
const entry = join(output, "entry.tsx");
writeFileSync(
  entry,
  `import React from 'react'; import {createRoot} from 'react-dom/client';
import {ExploreSearchForm} from ${JSON.stringify(resolve("components/platform/explore-search-form.tsx"))};
const root = createRoot(document.getElementById('root'));
window.renderOwner = (owner) => root.render(<ExploreSearchForm key={owner ?? 'guest'} owner={owner} query={new URLSearchParams(location.search).get('q') ?? ''} />);
window.renderOwner('a');`
);
const packed = require("next/dist/compiled/webpack/webpack");
packed.init();
await new Promise((resolveBuild, reject) =>
  packed.webpack(
    {
      mode: "development",
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
const html =
  '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recent search fixture</title><link rel="stylesheet" href="/fixture.css"><main class="platform-design"><div class="container-shell p-6" id="root"></div></main><script src="/bundle.js"></script>';
const css = readdirSync(".next/static/css")
  .filter((p) => p.endsWith(".css"))
  .map((p) => readFileSync(join(".next/static/css", p), "utf8"))
  .join("\n");
const server = createServer((req, res) => {
  if (req.url === "/bundle.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(readFileSync(join(output, "bundle.js")));
  } else if (req.url === "/fixture.css") {
    res.setHeader("Content-Type", "text/css");
    res.end(css);
  } else {
    res.setHeader("Content-Type", "text/html");
    res.end(html);
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
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--disable-dev-shm-usage"]
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }
});
const page = await context.newPage();
let owner = "a",
  hold = false;
const held = [];
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await context.route("**/api/platform/profile?view=identity", async (route) => {
  if (hold) await new Promise((r) => held.push(r));
  await route.fulfill({
    status: owner ? 200 : 401,
    contentType: "application/json",
    body: JSON.stringify(owner ? { id: owner } : {})
  });
});
const checkbox = page.getByRole("checkbox", {
  name: "Remember my searches in this browser"
});
const history = page.getByRole("region", { name: "Recent searches" });
const key = "godschurches:recent-searches:v1:a";
const pass = [];
const ok = (name) => {
  pass.push(name);
  console.log("PASS", name);
};
const stored = () =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null"), key);
const search = async (text) => {
  await page
    .getByRole("searchbox", { name: "Search the community" })
    .fill(text);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("q") === text);
  await checkbox.waitFor();
};
try {
  await page.goto(origin);
  await checkbox.waitFor();
  assert.equal(await checkbox.isChecked(), false);
  await search("not remembered");
  assert.equal(await stored(), null);
  ok("Off by default; ordinary Search works without recording");
  await checkbox.click();
  await page.waitForFunction(
    (k) => JSON.parse(localStorage.getItem(k) ?? "null")?.enabled === true,
    key
  );
  await search("Sunday service");
  await history.getByRole("link", { name: "Sunday service (posts)" }).waitFor();
  await search("prayer group");
  await history
    .getByRole("button", {
      name: "Remove Sunday service from recent posts searches"
    })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Search removed." })
    .waitFor();
  assert.deepEqual(
    (await stored()).items.map((x) => x.q),
    ["prayer group"]
  );
  ok(
    "Explicit searches record; accessible remove deletes only the selected query"
  );
  await page.getByRole("button", { name: "Clear all recent searches" }).focus();
  await page.keyboard.press("Enter");
  await history.getByText("Recent searches cleared.").waitFor();
  assert.equal(
    await history
      .getByRole("heading")
      .evaluate((e) => e === document.activeElement),
    true
  );
  await page.reload();
  await checkbox.waitFor();
  assert.equal((await stored()).items.length, 0);
  ok("Keyboard clear all stays empty when old search URL reloads");
  await search("account A private query");
  owner = "b";
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal(await history.getByRole("link").count(), 0);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await history.getByText("Your sign-in changed.", { exact: false }).waitFor();
  assert.equal(await history.getByRole("link").count(), 0);
  await page.evaluate(() => window.renderOwner("b"));
  await checkbox.waitFor();
  assert.equal(await checkbox.isChecked(), false);
  assert.equal(await history.getByRole("link").count(), 0);
  owner = "a";
  await page.evaluate(() => window.renderOwner("a"));
  await history
    .getByRole("link", { name: "account A private query (posts)" })
    .waitFor();
  ok(
    "Account switch conceals A history; B defaults off; verified A can recover it"
  );
  // Hold a refresh identity read, clear from another page, then release the old read.
  hold = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(50);
  const other = await context.newPage();
  await other.goto(origin);
  await other.evaluate((k) => {
    const value = JSON.parse(localStorage.getItem(k));
    value.items = [];
    localStorage.setItem(k, JSON.stringify(value));
  }, key);
  hold = false;
  for (const r of held.splice(0)) r();
  await other.close();
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await checkbox.waitFor();
  assert.equal(await history.getByRole("link").count(), 0);
  assert.equal((await stored()).items.length, 0);
  ok(
    "Delayed identity response and cross-tab clearing do not restore cached queries"
  );
  await search("clear on disable");
  await checkbox.click();
  await history.getByText("Recent searches turned off and cleared.").waitFor();
  assert.equal(await stored(), null);
  ok("Opting out deletes this account's stored history and preference");
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Storage blocked", "SecurityError");
    };
  });
  await checkbox.click();
  await history
    .getByText("Recent searches are unavailable.", { exact: false })
    .waitFor();
  await search("still searchable");
  assert.equal(await stored(), null);
  ok("Storage failure is visible and does not prevent searching");
  await page.evaluate(() => window.renderOwner(null));
  assert.equal(await history.count(), 0);
  assert.deepEqual(errors, []);
  ok("Guest sees no personal history controls; zero browser errors");
  await page.reload();
  await checkbox.waitFor();
  await checkbox.click();
  await page.waitForFunction(
    (k) => JSON.parse(localStorage.getItem(k) ?? "null")?.enabled,
    key
  );
  await search("Community prayer and Sunday service");
  await search("x".repeat(200));
  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    true
  );
  await history.screenshot({
    path: join(output, "recent-searches-320-large-text.png")
  });
  ok(
    "Built website CSS fits 320 pixels with 200 percent text and long queries"
  );
  await page.setViewportSize({ width: 1000, height: 1000 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "100%";
  });
  await history.screenshot({
    path: join(output, "recent-searches-desktop.png")
  });
  writeFileSync(
    join(output, "results.json"),
    JSON.stringify(
      {
        scope:
          "Real React component and browser storage; mocked identity API; not full app or live",
        pass,
        errors
      },
      null,
      2
    )
  );
} finally {
  for (const r of held.splice(0)) r();
  await browser.close();
  await new Promise((r) => server.close(r));
}
