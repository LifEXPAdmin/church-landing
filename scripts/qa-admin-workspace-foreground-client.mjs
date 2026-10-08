import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Actual parent and ReadVisibility; the stateful report child is fictional.
// This probe does not exercise AdminMetrics, exports, canonical identity or MFA.
const require = createRequire(import.meta.url);
const sourceRoot = resolve(
  process.env.ADMIN_FOREGROUND_SOURCE_ROOT ?? process.cwd()
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
const sha = (value) => createHash("sha256").update(value).digest("hex");
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
function fixtureChild(require, exports) {
  const React = require("react");
  const { useReadVisibility } = require("./read-visibility");
  exports.Report = function Report() {
    const [draft, setDraft] = React.useState("");
    const visible = useReadVisibility();
    React.useEffect(() => {
      window.childMounts++;
      return () => window.childUnmounts++;
    }, []);
    return React.createElement(
      "div",
      { "data-probe-report": true },
      React.createElement(
        "label",
        null,
        "Fictional retained draft",
        React.createElement("input", {
          "data-probe-draft": true,
          value: draft,
          onChange: (e) => setDraft(e.target.value)
        })
      ),
      visible
        ? React.createElement(
            "p",
            { "data-probe-canary": true },
            "Fictional private report"
          )
        : null
    );
  };
}
const modules = {
  workspace: compile("components/platform/admin-workspace.tsx"),
  "./read-visibility": compile("components/platform/read-visibility.ts"),
  "next/link":
    "module.exports=({children,...props})=>require('react').createElement('a',props,children);",
  "next/dynamic": "module.exports=()=>require('fixture-child').Report;",
  "@/components/platform/regional-presentation":
    "exports.RegionalTime=()=>null;",
  "./admin-worklist": "exports.AdminWorklist=()=>null;",
  "./admin-case": "exports.AdminCase=()=>null;",
  "./admin-form": "exports.adminInputClass='fixture';",
  "./admin-access": "exports.AdminAccess=()=>null;",
  "./admin-operations":
    "exports.AdminPeople=exports.AdminChurches=exports.AdminAudit=()=>null;",
  "./admin-overview": "exports.AdminOverview=()=>null;",
  "@/lib/platform/social-client":
    "exports.socialRequest=(...args)=>window.readAdmin(args);",
  "fixture-child": "(" + fixtureChild.toString() + ")(require,exports);"
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
  const { AdminWorkspace } = require("workspace");
  const root = require("react-dom/client").createRoot(
    document.getElementById("root")
  );
  window.fixtureFocused = true;
  window.fixtureOnline = true;
  window.fixtureVisibility = "visible";
  window.reads = [];
  window.pending = 0;
  window.maxPending = 0;
  window.childMounts = 0;
  window.childUnmounts = 0;
  window.visibleEvents = 0;
  window.section = "growth";
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
  window.addEventListener("admin-view-visible", () => window.visibleEvents++);
  window.readAdmin = (args) =>
    new Promise((resolveRead, rejectRead) => {
      window.pending++;
      window.maxPending = Math.max(window.maxPending, window.pending);
      let settled = false;
      window.reads.push({
        args,
        resolve(data) {
          if (!settled) {
            settled = true;
            window.pending--;
            resolveRead(data);
          }
        },
        reject(error) {
          if (!settled) {
            settled = true;
            window.pending--;
            rejectRead(error);
          }
        }
      });
    });
  window.nav = (owner = "owner-a", allowed = true) => ({
    viewer: { id: owner, name: "Fictional operator" },
    sections: allowed
      ? [
          {
            key: window.section,
            href: "/platform/admin/" + window.section,
            label: window.section
          }
        ]
      : [],
    capabilities: []
  });
  window.mount = (section = "growth") => {
    window.section = section;
    flushSync(() =>
      root.render(
        React.createElement(AdminWorkspace, {
          navigation: window.nav(),
          section,
          query: "view=" + section,
          back: "/platform/admin"
        })
      )
    );
  };
  window.reply = (index, owner = "owner-a", allowed = true) => {
    const payload =
      window.section === "health"
        ? {
            navigation: window.nav(owner, allowed),
            available: true,
            emailDelivery: "test-sink",
            health: {
              checkedAt: "2026-01-01T00:00:00Z",
              needsAttention: false,
              configuration: {},
              queues: {},
              alerts: []
            }
          }
        : {
            navigation: window.nav(owner, allowed),
            report: { fictional: true }
          };
    window.reads[index].resolve({ data: payload });
  };
  window.signal = (
    name,
    focused = window.fixtureFocused,
    online = window.fixtureOnline
  ) => {
    window.fixtureFocused = focused;
    window.fixtureOnline = online;
    flushSync(() =>
      (name === "visibilitychange" ? document : window).dispatchEvent(
        new Event(name)
      )
    );
  };
  window.refresh = () =>
    flushSync(() => window.dispatchEvent(new Event("admin-access-changed")));
  window.state = () => {
    const workspace = document.querySelector(
      'section[aria-label="Admin workspace"]'
    );
    const canary = document.querySelector("[data-probe-canary]");
    return {
      focused: document.hasFocus(),
      online: navigator.onLine,
      visibility: document.visibilityState,
      reads: window.reads.length,
      pending: window.pending,
      maxPending: window.maxPending,
      workspaceVisible: !!workspace?.getClientRects().length,
      canaryPresent: !!canary,
      canaryVisible: !!canary?.getClientRects().length,
      draftPresent: !!document.querySelector("[data-probe-draft]"),
      childMounts: window.childMounts,
      childUnmounts: window.childUnmounts,
      visibleEvents: window.visibleEvents,
      allPinnedReads: window.reads.every(
        (r) =>
          r.args.length === 3 &&
          r.args[0] === "/api/platform/admin?view=" + window.section &&
          r.args[1] === undefined &&
          r.args[2] === "owner-a"
      )
    };
  };
  let unmounted = false;
  window.unmount = () => {
    if (unmounted) return;
    unmounted = true;
    flushSync(() => root.unmount());
  };
}
const bundle = [
  "(()=>{const process={env:{NODE_ENV:'development'}};const modules={",
  Object.entries(modules)
    .map(
      ([name, code]) =>
        JSON.stringify(name) + ":(module,exports,require)=>{" + code + "\n}"
    )
    .join(","),
  "};const cache={};function require(name){if(cache[name])return cache[name].exports;if(!modules[name])throw Error('Unexpected fixture module');const m=cache[name]={exports:{}};modules[name](m,m.exports,require);return m.exports;}",
  "(" + fixtureRuntime.toString() + ")();})();"
].join("\n");
const evidence = {
  suite: "admin-workspace-foreground-client",
  scopeEvidence: "controlled-component-with-blocked-network-and-stub-transport",
  productionWrites: null,
  externalSends: null,
  startedAt: new Date().toISOString(),
  status: "running",
  sourceBindings,
  runtimeModules,
  harnessSha256: sha(readFileSync(fileURLToPath(import.meta.url))),
  sourceOverride: !!process.env.ADMIN_FOREGROUND_SOURCE_ROOT,
  caseFilter: process.env.ADMIN_FOREGROUND_CASE_FILTER ?? null,
  results: [],
  errors: [],
  blockedNetworkRequests: 0,
  limits: [
    "Actual AdminWorkspace parent, ReadVisibility and React DOM with modeled focus/visibility/connectivity and held fictional transport.",
    "Stateful fake report child tests retained parent mounting only. No actual AdminMetrics, report values, date editing, exports, identity service or MFA proof.",
    "No native trusted-focus, database, provider, full-application, authenticated production or physical-device acceptance."
  ]
};
const save = () =>
  writeFileSync(
    join(output, "results.json"),
    JSON.stringify(evidence, null, 2) + "\n",
    { mode: 0o600 }
  );
save();
let browser;
try {
  browser = await chromium.launch({
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
  const context = await browser.newContext({ serviceWorkers: "block" });
  await context.route("**/*", (route) => {
    evidence.blockedNetworkRequests++;
    return route.abort();
  });
  const tick = (page) =>
    page.evaluate(() => new Promise((done) => setTimeout(done, 0)));
  const state = (page) => page.evaluate(() => window.state());
  async function scenario(name, run) {
    if (evidence.caseFilter && !new RegExp(evidence.caseFilter).test(name))
      return;
    const page = await context.newPage();
    page.setDefaultTimeout(3000);
    const record = {
      name,
      pass: false,
      phase: "setup",
      observations: [],
      pageErrorCount: 0
    };
    evidence.results.push(record);
    page.on("pageerror", () => record.pageErrorCount++);
    const observe = async (phase) => {
      record.phase = phase;
      record.observations.push({ phase, ...(await state(page)) });
      save();
    };
    try {
      await page.setContent(
        "<!doctype html><title>Fictional admin boundary</title><div id='root'></div>"
      );
      await page.addScriptTag({ content: bundle });
      await run({ page, observe, tick: () => tick(page) });
      assert.equal(record.pageErrorCount, 0, "Unexpected component error");
      assert.equal(
        (await state(page)).allPinnedReads,
        true,
        "Original owner and query must stay pinned"
      );
      record.pass = true;
      record.phase = "complete";
    } catch {
      evidence.errors.push({
        name,
        phase: record.phase,
        code: "scenario-assertion-or-harness-failure"
      });
    } finally {
      await page.evaluate(() => window.unmount?.()).catch(() => {});
      await page.close();
      save();
    }
  }
  const mounted = async (page, section = "growth") => {
    await page.evaluate((section) => window.mount(section), section);
    await page.waitForFunction(() => window.reads.length === 1);
  };
  const ready = async (page) => {
    await mounted(page);
    await page.evaluate(() => window.reply(0));
    await page.locator("[data-probe-canary]").waitFor({ state: "visible" });
  };
  await scenario(
    "AW01 initial unfocused admission and focused original-owner recovery",
    async ({ page, observe, tick }) => {
      await page.evaluate(() => {
        window.fixtureFocused = false;
        window.mount();
      });
      await tick();
      await observe("unfocused initial admission invariant");
      assert.equal(
        (await state(page)).reads,
        0,
        "Unfocused mount must not read"
      );
      assert.equal((await state(page)).workspaceVisible, false);
      await page.evaluate(() => window.signal("focus", true));
      await page.waitForFunction(() => window.reads.length === 1);
      await page.evaluate(() => window.reply(0));
      await page.locator("[data-probe-canary]").waitFor({ state: "visible" });
      await observe("focused recovery");
    }
  );
  await scenario(
    "AW02 blurred pageshow online and visible visibilitychange stay concealed",
    async ({ page, observe, tick }) => {
      await ready(page);
      await page.evaluate(() => window.signal("blur", false));
      assert.equal((await state(page)).workspaceVisible, false);
      await page.evaluate(() => {
        window.signal("pageshow", false);
        window.signal("online", false);
        window.signal("visibilitychange", false);
      });
      await tick();
      await observe("unfocused resume admission invariant");
      if ((await state(page)).reads > 1) {
        await page.evaluate(() => window.reply(window.reads.length - 1));
        await tick();
        await observe("matching response after unfocused resume");
      }
      assert.equal(
        (await state(page)).reads,
        1,
        "Unfocused resume must not read"
      );
      assert.equal((await state(page)).workspaceVisible, false);
      assert.equal((await state(page)).canaryPresent, false);
    }
  );
  await scenario(
    "AW03 held pre-blur read cannot publish and recovery requires a fresh read",
    async ({ page, observe, tick }) => {
      await mounted(page);
      await page.evaluate(() => {
        window.signal("blur", false);
        window.reply(0);
      });
      await tick();
      await observe("old held response settled");
      assert.equal((await state(page)).workspaceVisible, false);
      assert.equal((await state(page)).visibleEvents, 0);
      await page.evaluate(() => window.signal("focus", true));
      await page.waitForFunction(() => window.reads.length === 2);
      await page.evaluate(() => window.reply(1));
      await page.locator("[data-probe-canary]").waitFor({ state: "visible" });
      await observe("fresh focused recovery");
      await page.evaluate(() => {
        window.refresh();
        window.fixtureFocused = false;
        window.reply(2);
      });
      await tick();
      await observe("held response with modeled focus loss and no blur event");
      assert.equal((await state(page)).workspaceVisible, false);
      assert.equal((await state(page)).canaryPresent, false);
      await page.evaluate(() => window.signal("focus", true));
      await page.waitForFunction(() => window.reads.length === 4);
      await page.evaluate(() => window.reply(3));
      await page.locator("[data-probe-canary]").waitFor({ state: "visible" });
      await observe("fresh focus after rejected settlement");
    }
  );
  await scenario(
    "AW04 same-owner recovery preserves the mounted fake-child draft",
    async ({ page, observe }) => {
      await ready(page);
      await page.locator("[data-probe-draft]").fill("Fictional unsent draft");
      await page.evaluate(() => window.signal("blur", false));
      await observe("draft concealed");
      assert.equal((await state(page)).workspaceVisible, false);
      assert.equal((await state(page)).childMounts, 1);
      assert.equal((await state(page)).childUnmounts, 0);
      await page.evaluate(() => window.signal("focus", true));
      await page.waitForFunction(() => window.reads.length === 2);
      assert.equal((await state(page)).workspaceVisible, false);
      await page.evaluate(() => window.reply(1));
      await page.locator("[data-probe-canary]").waitFor({ state: "visible" });
      assert.equal(
        await page.locator("[data-probe-draft]").inputValue(),
        "Fictional unsent draft"
      );
      assert.equal((await state(page)).childMounts, 1);
      assert.equal((await state(page)).childUnmounts, 0);
      await observe("same child restored");
    }
  );
  await scenario(
    "AW05 wrong owner missing section and failed read cannot authorize contents",
    async ({ page, observe, tick }) => {
      await mounted(page);
      await page.evaluate(() => window.reply(0, "owner-b"));
      await tick();
      await observe("wrong owner denied");
      assert.equal((await state(page)).workspaceVisible, false);
      await page.evaluate(() => window.signal("focus", true));
      await page.waitForFunction(() => window.reads.length === 2);
      await page.evaluate(() => window.reply(1, "owner-a", false));
      await tick();
      assert.equal((await state(page)).workspaceVisible, false);
      await page.evaluate(() => window.signal("focus", true));
      await page.waitForFunction(() => window.reads.length === 3);
      await page.evaluate(() =>
        window.reads[2].reject(Error("Fictional unavailable read"))
      );
      await tick();
      await observe("missing authority and failed read denied");
      assert.equal((await state(page)).workspaceVisible, false);
      assert.equal((await state(page)).visibleEvents, 0);
    }
  );
  await scenario(
    "AW06 coalesced refresh does not run parallel reads or drain while concealed",
    async ({ page, observe, tick }) => {
      await mounted(page);
      await page.evaluate(() => {
        window.refresh();
        window.refresh();
        window.signal("blur", false);
        window.reply(0);
      });
      await tick();
      await observe("queued refresh after blur");
      assert.equal((await state(page)).reads, 1);
      assert.equal((await state(page)).workspaceVisible, false);
      await page.evaluate(() => window.signal("focus", true));
      await page.waitForFunction(() => window.reads.length === 2);
      await page.evaluate(() => window.reply(1));
      await tick();
      if ((await state(page)).reads === 3)
        await page.evaluate(() => window.reply(2));
      await page.locator("[data-probe-canary]").waitFor({ state: "visible" });
      assert.equal((await state(page)).maxPending, 1);
      await observe("focused coalesced recovery");
    }
  );
  await scenario(
    "AW07 health uses the same owner and section visibility boundary",
    async ({ page, observe, tick }) => {
      await mounted(page, "health");
      await page.evaluate(() => window.reply(0));
      await page
        .getByRole("heading", { name: "Operational health", exact: true })
        .waitFor();
      await page.evaluate(() => window.signal("blur", false));
      assert.equal((await state(page)).workspaceVisible, false);
      await page.evaluate(() => window.signal("focus", true));
      await page.waitForFunction(() => window.reads.length === 2);
      await page.evaluate(() => window.reply(1, "owner-b"));
      await tick();
      assert.equal((await state(page)).workspaceVisible, false);
      await page.evaluate(() => window.signal("focus", true));
      await page.waitForFunction(() => window.reads.length === 3);
      await page.evaluate(() => window.reply(2, "owner-a", false));
      await tick();
      await observe("health owner and section rejection");
      assert.equal((await state(page)).workspaceVisible, false);
    }
  );
  await scenario(
    "AW08 unmount retires held reads and all lifecycle listeners",
    async ({ page, observe, tick }) => {
      await mounted(page);
      await page.evaluate(() => {
        window.refresh();
        window.unmount();
        window.reply(0);
        for (const name of [
          "focus",
          "online",
          "pageshow",
          "admin-access-changed",
          "visibilitychange"
        ])
          window.signal(name, true);
      });
      await tick();
      await observe("retired boundary after held settlement and events");
      assert.equal((await state(page)).reads, 1);
      assert.equal((await state(page)).visibleEvents, 0);
      assert.equal((await state(page)).workspaceVisible, false);
    }
  );
  await context.close();
  assert.equal(
    evidence.blockedNetworkRequests,
    0,
    "Unexpected network attempted"
  );
  assert.ok(evidence.results.length > 0, "No scenarios selected");
  if (!evidence.caseFilter) assert.equal(evidence.results.length, 8);
} catch {
  evidence.errors.push({
    name: "harness",
    phase: "setup-or-finalization",
    code: "harness-failure"
  });
} finally {
  await browser?.close();
  evidence.finishedAt = new Date().toISOString();
  evidence.status =
    evidence.errors.length === 0 && evidence.results.every((r) => r.pass)
      ? "passed"
      : "failed";
  save();
}
console.log(
  JSON.stringify({
    suite: evidence.suite,
    status: evidence.status,
    passed: evidence.results.filter((r) => r.pass).length,
    total: evidence.results.length,
    errors: evidence.errors.length
  })
);
if (evidence.status !== "passed") process.exitCode = 1;
