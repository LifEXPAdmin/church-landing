// Browser-level component integration. Identity responses are fictional fixtures;
// this does not claim database, hosted or production verification.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { createServer } from "node:http";
const require = createRequire(import.meta.url);
const output = process.env.SAVED_RESOURCES_QA_DIR;
assert.ok(
  output,
  "Set SAVED_RESOURCES_QA_DIR to a new isolated artifact folder"
);
mkdirSync(output, { recursive: false });
const loader = join(output, "typescript-loader.cjs");
writeFileSync(
  loader,
  `const ts = require(${JSON.stringify(require.resolve("typescript"))});
module.exports = function(source) {
 return ts.transpileModule(source, {
 compilerOptions: {jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020,
 module: ts.ModuleKind.ESNext, esModuleInterop: true}, fileName: this.resourcePath
}).outputText; };`
);
const entry = join(output, "entry.tsx");
writeFileSync(
  entry,
  `import React from 'react'; import {createRoot} from 'react-dom/client';
import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {PathnameContext} from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import {DraftWorkspaceProvider} from ${JSON.stringify(resolve("components/platform/draft-workspace-provider.tsx"))};
import {SavePostControl} from ${JSON.stringify(resolve("components/platform/save-post-control.tsx"))};
import {SavedLibrary} from ${JSON.stringify(resolve("components/platform/saved-library.tsx"))};
const root=createRoot(document.getElementById('root'));
const router={refresh(){},push(){},replace(){},prefetch(){},back(){},forward(){}};
window.showFixture=(kind='eventOccurrence', owner='a', library=false)=>root.render(<AppRouterContext.Provider value={router}><PathnameContext.Provider value="/platform/saved"><DraftWorkspaceProvider><main className="platform-design mx-auto max-w-2xl p-4">{library?<SavedLibrary key={owner+kind} owner={owner}/>:<SavePostControl key={owner+kind} accountId={owner} postId={'resource_'+kind} resourceKind={kind}/>}</main></DraftWorkspaceProvider></PathnameContext.Provider></AppRouterContext.Provider>);
window.showFixture();`
);
const packed = require("next/dist/compiled/webpack/webpack");
packed.init();
await new Promise((resolveBuild, reject) =>
  packed.webpack(
    {
      mode: "development",
      plugins: [
        new packed.webpack.ProvidePlugin({
          process: require.resolve("next/dist/build/polyfills/process")
        })
      ],
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
const cssRoot = process.env.SAVED_RESOURCES_QA_CSS;
assert.ok(cssRoot, "Pass a verified build CSS directory");
const css = readdirSync(cssRoot)
  .filter((p) => p.endsWith(".css"))
  .map((p) => readFileSync(join(cssRoot, p), "utf8"))
  .join("\n");

let owner = "a",
  revoked = false,
  loseResponse = false;
const records = [],
  mutations = [],
  receipts = new Map();
const json = (res, value, status = 200) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(value));
};
const server = createServer(async (req, res) => {
  const u = new URL(req.url, "http://fixture");
  if (u.pathname === "/bundle.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(readFileSync(join(output, "bundle.js")));
    return;
  }
  if (u.pathname === "/fixture.css") {
    res.setHeader("Content-Type", "text/css");
    res.end(css);
    return;
  }
  if (u.pathname === "/api/platform/profile") return json(res, { id: owner });
  if (u.pathname === "/api/platform/post-workspace") {
    if (req.method === "POST") {
      let raw = "";
      for await (const part of req) raw += part;
      const body = JSON.parse(raw);
      mutations.push(body);
      if (req.headers["x-expected-account"] !== owner)
        return json(res, { message: "Sign-in changed" }, 401);
      let result = receipts.get(body.mutationId);
      if (!result) {
        if (body.operation === "save-resource") {
          const row = {
            id: "saved_" + body.resource.kind,
            version: 1,
            collectionId: null,
            owner,
            resource: body.resource
          };
          records.push(row);
          result = { id: row.id, version: 1 };
        } else {
          const at = records.findIndex(
            (r) => r.id === body.id && r.owner === owner
          );
          if (at < 0) return json(res, { message: "Unavailable" }, 404);
          if (body.operation === "remove-item") records.splice(at, 1);
          else if (body.operation === "move-item") {
            records[at].collectionId = body.collectionId;
            records[at].version++;
          }
          result = { id: body.id, version: 2 };
        }
        receipts.set(body.mutationId, result);
      }
      if (loseResponse) {
        loseResponse = false;
        return json(
          res,
          { message: "Fictional lost response. Retry the same save." },
          503
        );
      }
      return json(res, result);
    }
    const view = u.searchParams.get("view");
    if (view === "collections")
      return json(res, {
        items: [{ id: "collection", version: 1, name: "Plans" }],
        nextCursor: null
      });
    if (view === "saved-resource-status") {
      if (revoked) return json(res, { message: "Resource unavailable." }, 404);
      return json(res, {
        item:
          records.find(
            (r) =>
              r.owner === owner &&
              r.resource.kind === u.searchParams.get("resourceKind")
          ) ?? null
      });
    }
    if (view === "saved")
      return json(res, {
        items: records
          .filter((r) => r.owner === owner)
          .map((r) => ({
            id: r.id,
            version: r.version,
            collectionId: r.collectionId,
            available: !revoked,
            ...(!revoked
              ? {
                  resource: {
                    ...r.resource,
                    title: "Fictional " + r.resource.kind,
                    href: "/platform/events/fictional",
                    state: "Available"
                  }
                }
              : {})
          })),
        nextCursor: null
      });
  }
  res.setHeader("Content-Type", "text/html");
  res.end(
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><title>Bookmark fixture</title><div id="root"></div><script src="/bundle.js"></script>'
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
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
  }),
  page = await context.newPage();
page.setDefaultTimeout(8000);
const errors = [],
  passed = [];
page.on("pageerror", (e) => {
  errors.push(e.message);
  console.error("PAGE_ERROR", e.message);
});
const ok = (name) => {
  passed.push(name);
  console.log("PASS", name);
};
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  for (const kind of [
    "eventOccurrence",
    "exchangeListing",
    "mediaCatalogItem",
    "volunteerOpportunity"
  ]) {
    await page.evaluate((k) => window.showFixture(k), kind);
    const save = page.getByRole("button", { name: "Bookmark", exact: true });
    await save.waitFor();
    await page.waitForFunction(
      () => !document.querySelector('button[aria-label="Bookmark"]')?.disabled
    );
    await save.focus();
    await save.press("Enter");
    await page
      .getByRole("button", { name: "Remove bookmark", exact: true })
      .waitFor();
    assert.deepEqual(mutations.at(-1).resource, {
      kind,
      id: "resource_" + kind
    });
    assert.equal(mutations.at(-1).operation, "save-resource");
  }
  ok("keyboard bookmarks all four types with typed references only");
  await page
    .getByRole("button", { name: "Remove bookmark", exact: true })
    .click();
  await page.getByRole("button", { name: "Bookmark", exact: true }).waitFor();
  assert.equal(records.length, 3);
  assert.equal(mutations.at(-1).operation, "remove-item");
  loseResponse = true;
  await page.getByRole("button", { name: "Bookmark", exact: true }).click();
  await page
    .getByRole("button", { name: "Retry same save choice", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove bookmark", exact: true })
    .waitFor();
  assert.deepEqual(mutations.at(-1), mutations.at(-2));
  assert.equal(records.length, 4);
  ok("remove and lost-response retry preserve one bookmark per resource");
  await page.evaluate(() => window.showFixture("eventOccurrence", "a", true));
  await page
    .getByRole("link", { name: "Open bookmarked item" })
    .first()
    .waitFor();
  assert.equal(
    await page.getByRole("link", { name: "Open bookmarked item" }).count(),
    4
  );
  const row = page.locator('[data-saved-id="saved_eventOccurrence"]');
  await row.getByRole("combobox").selectOption("collection");
  await row.getByRole("button", { name: /Move/ }).click();
  await page.getByText("Private changes saved.", {exact:true}).waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-saved-id="saved_eventOccurrence"] select')
        ?.value === "collection"
  );
  assert.equal(
    records.find((r) => r.id === "saved_eventOccurrence").collectionId,
    "collection"
  );
  ok(
    "mixed private collections display current resource cards and move bookmarks"
  );
  revoked = true;
  await page
    .getByRole("button", { name: "Refresh bookmarks", exact: true })
    .click();
  await page
    .getByText("Bookmarked item unavailable", { exact: true })
    .first()
    .waitFor();
  assert.equal(
    await page.getByRole("link", { name: "Open bookmarked item" }).count(),
    0
  );
  assert.equal(await page.getByText(/Fictional eventOccurrence/).count(), 0);
  ok("current unavailable response removes previous titles and links");
  owner = "b";
  await page.evaluate(() => window.showFixture("eventOccurrence", "b", true));
  await page.getByText("No bookmarks in this view.", { exact: true }).waitFor();
  assert.equal(await page.locator("[data-saved-id]").count(), 0);
  ok("another account does not retain prior account bookmarks");
  owner = "a";
  revoked = false;
  await page.evaluate(() => window.showFixture("eventOccurrence", "a", true));
  await page
    .getByRole("link", { name: "Open bookmarked item" })
    .first()
    .waitFor();
  await page.setViewportSize({ width: 320, height: 900 });
  await page.addStyleTag({ content: "html{font-size:200%}" });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    )
  );
  await page.screenshot({
    path: join(output, "bookmarks-mobile.png"),
    fullPage: true
  });
  assert.deepEqual(errors, []);
  ok("320px enlarged-text layout and no browser errors");
  writeFileSync(
    join(output, "results.json"),
    JSON.stringify(
      {
        passed,
        errors,
        scope:
          "Real bookmark controls and collection React components; fictional HTTP APIs. Real PostgreSQL service results are separate."
      },
      null,
      2
    )
  );
} catch (e) {
  writeFileSync(
    join(output, "failure.json"),
    JSON.stringify({ errors, html: await page.content() }, null, 2)
  );
  await page.screenshot({ path: join(output, "failure.png"), fullPage: true });
  throw e;
} finally {
  await context.close();
  await browser.close();
  await new Promise((r) => server.close(r));
}
