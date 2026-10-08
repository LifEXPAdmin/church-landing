import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Controlled actual React DOM acceptance. No server, database or provider is used.
// The isolated runner supplies its task-owned temporary directory.
const sourceRoot = process.cwd();
assert.ok(
  process.argv[2],
  "Provide a new controlled-evidence output directory"
);
const output = resolve(process.argv[2]);
mkdirSync(output, { mode: 0o700 });
const require = createRequire(import.meta.url);
const ts = require(process.env.TYPESCRIPT_MODULE ?? "typescript");
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ??
    process.env.HOME +
      "/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json"
)("playwright");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const bindings = [];
function retained(path) {
  const bytes = readFileSync(join(sourceRoot, path));
  bindings.push({ path, sha256: sha(bytes), bytes: bytes.length });
  return bytes.toString("utf8");
}
function transpile(path) {
  const result = ts.transpileModule(retained(path), {
    fileName: path,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      resolveJsonModule: true
    }
  });
  assert.equal(
    result.diagnostics?.filter(
      (entry) => entry.category === ts.DiagnosticCategory.Error
    ).length ?? 0,
    0,
    "Transpile diagnostics must be resolved before a behavioral result is claimed"
  );
  return result.outputText;
}
const modules = {
  boundary: transpile("components/platform/repost-source-boundary.tsx"),
  settings: transpile("components/platform/discovery-settings.tsx"),
  "./read-visibility": transpile("components/platform/read-visibility.ts"),
  "@/lib/platform/discovery-options": transpile(
    "lib/platform/discovery-options.ts"
  ),
  "@/lib/platform/feed-options": transpile("lib/platform/feed-options.ts"),
  "@/lib/platform/post-options": transpile("lib/platform/post-options.ts"),
  "@/lib/platform/portal-policy": transpile("lib/platform/portal-policy.ts"),
  "./portal-types": transpile("lib/platform/portal-types.ts"),
  "../../data/discovery/countries.json":
    "module.exports = " + retained("data/discovery/countries.json") + ";",
  "../../data/discovery/languages.json":
    "module.exports = " + retained("data/discovery/languages.json") + ";",
  "next/navigation": "exports.useRouter = () => window.fixtureRouter;",
  "next/dynamic": "module.exports = () => () => null;",
  "./private-post-workspace": "exports.usePrivatePostWorkspace = () => null;",
  "@/lib/platform/post-availability-client":
    "exports.currentPostAvailability = (...args) => window.queueAvailability(args);",
  "@/lib/platform/social-client": [
    "exports.currentSocialOwner = () => window.queueIdentity();",
    "exports.socialRequest = (...args) => { window.unexpectedTransport.push(args); throw Error('Unexpected social request'); };",
    "exports.SocialClientError = class SocialClientError extends Error { constructor(status,message){super(message);this.status=status;} };"
  ].join("\n"),
  "./private-snapshot-guard": [
    "exports.PrivateSnapshotGuard = () => { throw Error('Guest fixture must not mount the signed-in guard'); };",
    "exports.usePrivateRecovery = () => undefined;"
  ].join("\n"),
  "./use-unsaved-social-work":
    "exports.useUnsavedSocialWork = () => undefined;",
  "./use-photo-back-guard":
    "exports.settlePhotoNavigation = async () => { throw Error('No navigation settlement is expected'); };",
  "./discovery-place-picker": "exports.DiscoveryPlacePicker = () => null;",
  "./portal-action-form": "exports.portalInputClass = '';"
};
modules["./discovery-options"] =
  'module.exports = require("@/lib/platform/discovery-options");';
modules["./post-options"] =
  'module.exports = require("@/lib/platform/post-options");';
modules["./portal-policy"] =
  'module.exports = require("@/lib/platform/portal-policy");';
const runtimeModules = [];
for (const [name, pkg, file] of [
  ["react", "react", "react.development.js"],
  ["react/jsx-runtime", "react", "react-jsx-runtime.development.js"],
  ["react-dom", "react-dom", "react-dom.development.js"],
  ["react-dom/client", "react-dom", "react-dom-client.development.js"],
  ["scheduler", "scheduler", "scheduler.development.js"]
]) {
  const path = join(
    dirname(require.resolve(pkg + "/package.json")),
    "cjs",
    file
  );
  const content = readFileSync(path);
  modules[name] = content.toString("utf8");
  runtimeModules.push({ name, package: pkg, file, sha256: sha(content) });
}
function fixtureRuntime() {
  const React = require("react");
  const { flushSync } = require("react-dom");
  const root = require("react-dom/client").createRoot(
    document.getElementById("root")
  );
  window.fixtureRouter = { refresh: () => window.refreshCalls++ };
  window.refreshCalls = 0;
  window.fixtureFocused = true;
  window.fixtureVisibility = "visible";
  window.fixtureOnline = true;
  window.availability = [];
  window.identity = [];
  window.digests = [];
  window.intersections = [];
  window.intervals = [];
  window.unexpectedTransport = [];
  window.unexpectedNetwork = [];
  window.savedCalls = [];
  window.fixtureCookie = "";
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
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => window.fixtureCookie,
    set: () => {
      throw Error("No guest cookie write belongs to these read-only probes");
    }
  });
  // Hold only the digest completion boundary. Node computes the actual SHA-256
  // from the exact bytes supplied by the unmodified component before release.
  Object.defineProperty(window, "crypto", {
    configurable: true,
    value: {
      subtle: {
        digest: (algorithm, bytes) =>
          new Promise((resolve, reject) => {
            window.digests.push({
              algorithm,
              bytes: Array.from(new Uint8Array(bytes)),
              resolve,
              reject
            });
          })
      },
      randomUUID: () => {
        throw Error("No mutation ID is expected");
      }
    }
  });
  window.fetch = (...args) => {
    window.unexpectedNetwork.push({ kind: "fetch", value: String(args[0]) });
    return Promise.reject(Error("Network prohibited"));
  };
  window.WebSocket = class {
    constructor() {
      throw Error("WebSocket prohibited");
    }
  };
  window.EventSource = class {
    constructor() {
      throw Error("EventSource prohibited");
    }
  };
  navigator.sendBeacon = () => {
    throw Error("Beacon prohibited");
  };
  window.IntersectionObserver = class {
    constructor(callback) {
      this.callback = callback;
      this.active = true;
      window.intersections.push(this);
    }
    observe(element) {
      this.element = element;
    }
    disconnect() {
      this.active = false;
    }
    unobserve() {}
  };
  window.setInterval = (callback, ms) => {
    const value = { callback, ms, active: true };
    window.intervals.push(value);
    return window.intervals.length;
  };
  window.clearInterval = (id) => {
    if (window.intervals[id - 1]) window.intervals[id - 1].active = false;
  };
  window.queueAvailability = (args) =>
    new Promise((resolve, reject) => {
      window.availability.push({ args, resolve, reject });
    });
  window.queueIdentity = () =>
    new Promise((resolve, reject) => {
      window.identity.push({ resolve, reject });
    });
  window.mountPost = (props = {}) => {
    const { PostReadBoundary } = require("boundary");
    flushSync(() =>
      root.render(
        React.createElement(
          PostReadBoundary,
          {
            enabled: true,
            postId: "fictional-post-a",
            version: 3,
            accountId: "fictional-account-a",
            commentCount: 0,
            likeCount: 0,
            feedMode: "latest",
            ...props
          },
          React.createElement(
            "article",
            { "data-testid": "protected-post" },
            "Fictional retained post content"
          )
        )
      )
    );
  };
  window.intersect = () => {
    flushSync(() => {
      for (const observer of window.intersections)
        if (observer.active)
          observer.callback([
            { target: observer.element, isIntersecting: true }
          ]);
    });
  };
  window.mountGuest = () => {
    const {
      defaultDiscoveryPreferences,
      GUEST_DISCOVERY_COOKIE
    } = require("@/lib/platform/discovery-options");
    const preferences = defaultDiscoveryPreferences();
    preferences.hiddenWords = ["fictional guest-only phrase"];
    window.fixtureCookie =
      GUEST_DISCOVERY_COOKIE +
      "=" +
      encodeURIComponent(JSON.stringify(preferences));
    const { DiscoverySettings } = require("settings");
    flushSync(() =>
      root.render(
        React.createElement(DiscoverySettings, {
          owner: null,
          onSaved: (value) => window.savedCalls.push(value)
        })
      )
    );
  };
  window.signal = (name, focused, online = window.fixtureOnline) => {
    window.fixtureFocused = focused;
    window.fixtureOnline = online;
    flushSync(() =>
      (name === "visibilitychange" ? document : window).dispatchEvent(
        new Event(name)
      )
    );
  };
  window.blurVisible = () => {
    window.fixtureFocused = false;
    flushSync(() => window.dispatchEvent(new Event("blur")));
  };
  window.tickPostInterval = () => {
    const current = window.intervals.filter(
      (entry) => entry.active && entry.ms === 30000
    );
    if (current.length !== 1)
      throw Error("Expected one current 30-second interval");
    for (const interval of current) interval.callback();
  };
  window.state = () => ({
    hasFocus: document.hasFocus(),
    visibilityState: document.visibilityState,
    online: navigator.onLine,
    availabilityReads: window.availability.length,
    identityReads: window.identity.length,
    digestRequests: window.digests.length,
    refreshCalls: window.refreshCalls,
    unexpectedTransport: window.unexpectedTransport.length,
    unexpectedNetwork: window.unexpectedNetwork.length,
    savedCalls: window.savedCalls.length,
    cookie: window.fixtureCookie
  });
  window.unmount = () => flushSync(() => root.unmount());
}
const bundle = [
  "(() => {const process={env:{NODE_ENV:'development'}};",
  "const modules={" +
    Object.entries(modules)
      .map(
        ([name, code]) =>
          JSON.stringify(name) + ":(module,exports,require)=>{" + code + "\n}"
      )
      .join(",\n") +
    "};",
  "const cache={}; const require=(name)=>{if(cache[name])return cache[name].exports;",
  "if(!modules[name])throw Error('Unexpected module '+name);const m=cache[name]={exports:{}};",
  "modules[name](m,m.exports,require);return m.exports;};",
  "(" + fixtureRuntime.toString() + ")();})();"
].join("\n");
const evidence = {
  suite: "resource-foreground-client",
  scopeEvidence: "controlled-component-with-blocked-network-and-stub-transport",
  productionWrites: null,
  externalSends: null,
  errors: [],
  status: "running",
  startedAt: new Date().toISOString(),
  sourceBindings: bindings,
  runtimeModules,
  harnessSha256: sha(readFileSync(fileURLToPath(import.meta.url))),
  cases: [],
  blockedNetworkRequests: 0,
  limits: [
    "Actual unmodified TSX and React DOM with modeled foreground, intersection, interval and transport timing.",
    "Not a native trusted focus event, full Next tree, real identity API, canonical DB, production or physical-device test.",
    "PrivatePostWorkspace is absent by design; signed-in snapshot guard is asserted unreachable in the guest case.",
    "Place picker, unused navigation and recovery registration are boundary stubs; no save is performed.",
    "Focused lifecycle acceptance only; synthetic focus events do not establish native trusted-focus or physical-device behavior."
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
    const page = await context.newPage();
    page.setDefaultTimeout(3000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const record = {
      name,
      status: "setup",
      phase: "setup",
      observations: [],
      errors
    };
    evidence.cases.push(record);
    const observe = async (label, extra = {}) => {
      record.observations.push({
        label,
        ...(await page.evaluate(() => window.state())),
        ...extra
      });
      save();
    };
    const flush = () =>
      page.evaluate(
        () =>
          new Promise((done) =>
            requestAnimationFrame(() => requestAnimationFrame(done))
          )
      );
    try {
      await page.setContent('<div id="root"></div>');
      await page.addScriptTag({ content: bundle });
      await run({ page, observe, flush, record });
      assert.deepEqual(errors, [], "No component runtime errors");
      const state = await page.evaluate(() => window.state());
      assert.equal(state.unexpectedTransport, 0);
      assert.equal(state.unexpectedNetwork, 0);
      record.status = "passed";
    } catch (error) {
      record.status = "failed";
      record.error = {
        name: error.name,
        code: error.code ?? null,
        message: error.message
      };
      evidence.errors.push({
        scenario: name,
        phase: record.phase,
        code: error.code ?? error.name
      });
    } finally {
      save();
      await page.close();
    }
  }
  await scenario(
    "ordinary post remains concealed after visible-unfocused interval revalidation",
    async ({ page, observe, flush, record }) => {
      await page.evaluate(() => window.mountPost());
      await page.waitForFunction(() => window.intersections.length === 1);
      await page.evaluate(() => window.intersect());
      await page.waitForFunction(() => window.availability.length === 1);
      const matching = {
        available: true,
        entryVersion: 3,
        commentCount: 0,
        likeCount: 0
      };
      await page.evaluate(
        (value) => window.availability[0].resolve(value),
        matching
      );
      await page.getByTestId("protected-post").waitFor({ state: "visible" });
      await observe("matching foreground read visible", {
        contentVisible: true
      });
      await page.evaluate(() => window.blurVisible());
      await flush();
      assert.equal(
        await page.getByTestId("protected-post").isVisible(),
        false,
        "Blur first conceals"
      );
      await observe("after blur", { contentVisible: false });
      await page.evaluate(() => window.tickPostInterval());
      await flush();
      const afterTick = await page.evaluate(() => window.state());
      // A repaired admission gate may issue no read. If it issues one, settle the
      // genuine matching shape and still require foreground-safe presentation.
      if (afterTick.availabilityReads > 1) {
        assert.equal(
          afterTick.availabilityReads,
          2,
          "One modeled interval may issue at most one read"
        );
        await page.evaluate(
          (value) => window.availability[1].resolve(value),
          matching
        );
        await flush();
      }
      const visible = await page.getByTestId("protected-post").isVisible();
      await observe("after interval and matching settlement", {
        contentVisible: visible
      });
      const state = await page.evaluate(() => window.state());
      assert.equal(state.hasFocus, false);
      assert.equal(state.visibilityState, "visible");
      assert.equal(state.online, true);
      record.phase = "invariant";
      assert.equal(
        visible,
        false,
        "An intersecting post must not redisplay while the document is unfocused"
      );
    }
  );
  await scenario(
    "guest initial digest cannot redisplay choices after blur",
    async ({ page, observe, flush, record }) => {
      await page.evaluate(() => window.mountGuest());
      await page.waitForFunction(() => window.identity.length === 1);
      await page.evaluate(() => window.identity[0].resolve(null));
      await page.waitForFunction(() => window.digests.length === 1);
      const before = await page.evaluate(() => window.state());
      assert.equal(before.hasFocus, true);
      assert.equal(before.visibilityState, "visible");
      await observe("guest identity accepted with digest held", {
        formVisible: false
      });
      await page.evaluate(() => window.blurVisible());
      await flush();
      const digest = await page.evaluate(() => ({
        algorithm: window.digests[0].algorithm,
        bytes: window.digests[0].bytes
      }));
      assert.equal(digest.algorithm, "SHA-256");
      const hashBytes = Array.from(
        createHash("sha256").update(Buffer.from(digest.bytes)).digest()
      );
      await page.evaluate(
        (bytes) => window.digests[0].resolve(Uint8Array.from(bytes).buffer),
        hashBytes
      );
      await flush();
      const form = page.locator("form");
      const visible = await form.isVisible();
      await observe("initial digest settled after blur", {
        formMounted: await form.count(),
        formVisible: visible,
        retainedHiddenWords:
          (await form.locator("textarea").count()) > 0
            ? await page
                .getByLabel("Hidden words or phrases", { exact: true })
                .inputValue()
            : null
      });
      const state = await page.evaluate(() => window.state());
      assert.equal(state.hasFocus, false);
      assert.equal(state.visibilityState, "visible");
      assert.equal(
        state.identityReads,
        1,
        "No second identity check was used to create the race"
      );
      assert.equal(state.savedCalls, 0);
      assert.equal(
        state.cookie,
        before.cookie,
        "The read must not rewrite guest choices"
      );
      record.phase = "invariant";
      assert.equal(
        visible,
        false,
        "Initial digest must not reveal guest choices after blur"
      );
    }
  );
  const matching = {
    available: true,
    entryVersion: 3,
    commentCount: 0,
    likeCount: 0
  };
  async function releaseDigest(page, index) {
    const digest = await page.evaluate(
      (i) => ({
        algorithm: window.digests[i].algorithm,
        bytes: window.digests[i].bytes
      }),
      index
    );
    assert.equal(digest.algorithm, "SHA-256");
    const bytes = Array.from(
      createHash("sha256").update(Buffer.from(digest.bytes)).digest()
    );
    await page.evaluate(
      ({ index, bytes }) =>
        window.digests[index].resolve(Uint8Array.from(bytes).buffer),
      { index, bytes }
    );
  }
  async function readyPost(page) {
    await page.evaluate(() => window.mountPost());
    await page.waitForFunction(() => window.intersections.length === 1);
    await page.evaluate(() => window.intersect());
    await page.waitForFunction(() => window.availability.length === 1);
    await page.evaluate(
      (value) => window.availability[0].resolve(value),
      matching
    );
    await page.getByTestId("protected-post").waitFor({ state: "visible" });
  }
  async function readyGuest(page) {
    await page.evaluate(() => window.mountGuest());
    await page.waitForFunction(() => window.identity.length === 1);
    await page.evaluate(() => window.identity[0].resolve(null));
    await page.waitForFunction(() => window.digests.length === 1);
    await releaseDigest(page, 0);
    await page.locator("form").waitFor({ state: "visible" });
  }
  await scenario(
    "post focus return waits for a current matching read",
    async ({ page, observe, flush }) => {
      await readyPost(page);
      await page.evaluate(() => window.blurVisible());
      await flush();
      assert.equal(await page.getByTestId("protected-post").isVisible(), false);
      await page.evaluate(() => window.signal("focus", true));
      await page.waitForFunction(() => window.availability.length === 2);
      assert.equal(await page.getByTestId("protected-post").isVisible(), false);
      await page.evaluate(
        (value) => window.availability[1].resolve(value),
        matching
      );
      await page.getByTestId("protected-post").waitFor({ state: "visible" });
      await observe("focused matching read restores content");
    }
  );
  await scenario(
    "post late matching settlement checks focus without a blur event",
    async ({ page, observe, flush }) => {
      await readyPost(page);
      await page.evaluate(() => window.tickPostInterval());
      await page.waitForFunction(() => window.availability.length === 2);
      await page.evaluate((value) => {
        window.fixtureFocused = false;
        window.availability[1].resolve(value);
      }, matching);
      await flush();
      await observe("focus lost silently before settlement");
      assert.equal(await page.getByTestId("protected-post").isVisible(), false);
    }
  );
  await scenario(
    "post offline admission waits for an online foreground return",
    async ({ page, observe, flush }) => {
      await page.evaluate(() => {
        window.fixtureOnline = false;
        window.mountPost();
      });
      await page.waitForFunction(() => window.intersections.length === 1);
      await page.evaluate(() => window.intersect());
      await flush();
      assert.equal(await page.evaluate(() => window.availability.length), 0);
      await page.evaluate(() => window.signal("online", false, true));
      await flush();
      assert.equal(await page.evaluate(() => window.availability.length), 0);
      await page.evaluate(() => window.signal("focus", true));
      await page.waitForFunction(() => window.availability.length === 1);
      await page.evaluate(
        (value) => window.availability[0].resolve(value),
        matching
      );
      await page.getByTestId("protected-post").waitFor({ state: "visible" });
      await observe("only the foreground online read restored content");
    }
  );
  await scenario(
    "post offline settlement cannot restore content without an event",
    async ({ page, observe, flush }) => {
      await readyPost(page);
      await page.evaluate(() => window.tickPostInterval());
      await page.waitForFunction(() => window.availability.length === 2);
      await page.evaluate((value) => {
        window.fixtureOnline = false;
        window.availability[1].resolve(value);
      }, matching);
      await flush();
      await observe("connectivity lost silently before settlement");
      assert.equal(await page.getByTestId("protected-post").isVisible(), false);
    }
  );
  await scenario(
    "guest cancelled initial load recovers on focused return",
    async ({ page, observe, flush }) => {
      await page.evaluate(() => window.mountGuest());
      await page.waitForFunction(() => window.identity.length === 1);
      await page.evaluate(() => window.identity[0].resolve(null));
      await page.waitForFunction(() => window.digests.length === 1);
      await page.evaluate(() => window.blurVisible());
      await releaseDigest(page, 0);
      await flush();
      assert.equal(await page.locator("form").isVisible(), false);
      await page.evaluate(() => window.signal("focus", true));
      await page.waitForFunction(() => window.identity.length === 2);
      await page.evaluate(() => window.identity[1].resolve(null));
      await page.waitForFunction(() => window.digests.length === 2);
      await releaseDigest(page, 1);
      await page.locator("form").waitFor({ state: "visible" });
      assert.equal(
        await page
          .getByLabel("Hidden words or phrases", { exact: true })
          .inputValue(),
        "fictional guest-only phrase"
      );
      await observe(
        "fresh focused initial read recovered original guest choices"
      );
    }
  );
  await scenario(
    "guest unsaved draft and form owner survive blur and identity recheck",
    async ({ page, observe, flush }) => {
      await readyGuest(page);
      await page
        .getByText("Hidden words, hidden topics and recommendation feedback", {
          exact: true
        })
        .click();
      const field = page.getByLabel("Hidden words or phrases", { exact: true });
      await field.fill("Unsent fictional guest draft");
      await page.evaluate(() => {
        window.originalForm = document.querySelector("form");
        window.originalText = document.querySelector('textarea[id$="-hidden"]');
      });
      const before = await page.evaluate(() => window.state());
      await page.evaluate(() => window.blurVisible());
      await flush();
      assert.equal(await page.locator("form").isVisible(), false);
      await page.evaluate(() => window.signal("focus", true));
      await page.waitForFunction(() => window.identity.length === 2);
      await page.evaluate(() => window.identity[1].resolve(null));
      await page.locator("form").waitFor({ state: "visible" });
      assert.equal(await field.inputValue(), "Unsent fictional guest draft");
      assert.equal(
        await page.evaluate(
          () => window.originalForm === document.querySelector("form")
        ),
        true
      );
      assert.equal(
        await page.evaluate(
          () =>
            window.originalText ===
            document.querySelector('textarea[id$="-hidden"]')
        ),
        true
      );
      const after = await page.evaluate(() => window.state());
      assert.equal(
        after.digestRequests,
        before.digestRequests,
        "Identity recheck must not reload/rebase the draft"
      );
      assert.equal(after.cookie, before.cookie);
      await observe(
        "same mounted form retains unsent draft after current guest identity"
      );
    }
  );
  await scenario(
    "replacement account denies guest choices and older identity cannot override it",
    async ({ page, observe, flush }) => {
      await readyGuest(page);
      await page.evaluate(() => {
        window.blurVisible();
        window.signal("focus", true);
      });
      await page.waitForFunction(() => window.identity.length === 2);
      await page.evaluate(() => window.signal("focus", true));
      await page.waitForFunction(() => window.identity.length === 3);
      await page.evaluate(() =>
        window.identity[2].resolve("fictional-account-b")
      );
      await flush();
      assert.equal(await page.locator("form").isVisible(), false);
      await page.evaluate(() => window.identity[1].resolve(null));
      await flush();
      await observe("newer replacement identity wins over old guest response");
      assert.equal(await page.locator("form").isVisible(), false);
      assert.match(
        await page.getByRole("status").innerText(),
        /sign-in changed/
      );
    }
  );
  await scenario(
    "guest held identity response checks focus without a second blur event",
    async ({ page, observe, flush }) => {
      await readyGuest(page);
      await page.evaluate(() => {
        window.blurVisible();
        window.signal("focus", true);
      });
      await page.waitForFunction(() => window.identity.length === 2);
      await page.evaluate(() => {
        window.fixtureFocused = false;
        window.identity[1].resolve(null);
      });
      await flush();
      await observe("identity settled after silent focus loss");
      assert.equal(await page.locator("form").isVisible(), false);
    }
  );
  await scenario(
    "guest initial digest checks current focus without a blur event",
    async ({ page, observe, flush }) => {
      await page.evaluate(() => window.mountGuest());
      await page.waitForFunction(() => window.identity.length === 1);
      await page.evaluate(() => window.identity[0].resolve(null));
      await page.waitForFunction(() => window.digests.length === 1);
      await page.evaluate(() => {
        window.fixtureFocused = false;
      });
      await releaseDigest(page, 0);
      await flush();
      await observe("digest settled after silent focus loss");
      assert.equal(await page.locator("form").isVisible(), false);
    }
  );
  await scenario(
    "guest initial online admission requires actual foreground",
    async ({ page, observe, flush }) => {
      await page.evaluate(() => {
        window.fixtureOnline = false;
        window.mountGuest();
      });
      await flush();
      assert.equal(await page.evaluate(() => window.identity.length), 0);
      await page.evaluate(() => window.signal("online", false, true));
      await flush();
      assert.equal(await page.evaluate(() => window.identity.length), 0);
      await page.evaluate(() => window.signal("focus", true));
      await page.waitForFunction(() => window.identity.length === 1);
      await page.evaluate(() => window.identity[0].resolve(null));
      await page.waitForFunction(() => window.digests.length === 1);
      await releaseDigest(page, 0);
      await page.locator("form").waitFor({ state: "visible" });
      await observe("foreground online recovery reads guest choices");
    }
  );
  await context.close();
} finally {
  await browser.close();
  evidence.finishedAt = new Date().toISOString();
  evidence.passed = evidence.cases.filter(
    (entry) => entry.status === "passed"
  ).length;
  evidence.failed = evidence.cases.filter(
    (entry) => entry.status === "failed"
  ).length;
  evidence.results = evidence.cases.map((entry) => ({
    name: entry.name,
    pass: entry.status === "passed"
  }));
  evidence.status =
    evidence.failed || evidence.blockedNetworkRequests
      ? "failed"
      : evidence.cases.length === 12
        ? "passed"
        : "incomplete";
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
if (evidence.status !== "passed") process.exitCode = 1;
