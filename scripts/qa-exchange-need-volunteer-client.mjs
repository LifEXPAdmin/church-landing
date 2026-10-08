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
const sources = {
  volunteers: "components/platform/exchange-need-volunteers.tsx",
  "./exchange-need-actions": "components/platform/exchange-need-actions.tsx",
  "./use-private-choice-action":
    "components/platform/use-private-choice-action.tsx",
  "./read-visibility": "components/platform/read-visibility.ts",
  "@/lib/platform/social-client": "lib/platform/social-client.ts",
  "@/lib/platform/exchange-need-options":
    "lib/platform/exchange-need-options.ts"
};
const modules = {
  "next/link": `exports.__esModule = true; exports.default = ({prefetch, children, ...props}) => require("react").createElement("a", props, children);`,
  "next/navigation": `const router = {refresh() {window.fixture.refreshes++;}}; exports.useRouter = () => router;`,
  "./exchange-need-progress": `const refresh = async () => {window.fixture.totals++;}; exports.useNeedProgressRefresh = (owner, needId) => {if(owner !== "owner-a" || needId !== "need-a") throw Error("Wrong progress scope"); return refresh;};`,
  "./use-photo-back-guard": `exports.settlePhotoNavigation = async () => {};`,
  "./private-snapshot-guard": `exports.usePrivateRecovery = () => {};`,
  "./use-unsaved-social-work": `exports.useUnsavedSocialWork = (value) => {window.fixture.guard = value;};`,
  "./privileged-auth-navigation": `exports.announcePrivilegedChallenge = () => false;`,
  "./exchange-saved-controls": `exports.useExchangeAction = () => {throw Error("Unused legacy action");};`,
  "./portal-action-form": `exports.portalInputClass = "";`,
  "./regional-presentation": `exports.RegionalTime = () => null;`,
  "@/lib/platform/community-report-types": `exports.reportEntryHref = () => "/unused";`
};
for (const [name, path] of Object.entries(sources))
  modules[name] = ts.transpileModule(readFileSync(path, "utf8"), {
    fileName: path,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true
    }
  }).outputText;
for (const [name, pkg, file] of [
  ["react", "react", "react.development.js"],
  ["react/jsx-runtime", "react", "react-jsx-runtime.development.js"],
  ["react-dom", "react-dom", "react-dom.development.js"],
  ["react-dom/client", "react-dom", "react-dom-client.development.js"],
  ["scheduler", "scheduler", "scheduler.development.js"]
])
  modules[name] = readFileSync(
    join(dirname(require.resolve(`${pkg}/package.json`)), "cjs", file),
    "utf8"
  );
// Actual React, canonical page, command hook and pinned transport. Only server,
// Next navigation and unrelated navigation guards are deterministic stand-ins.
const bundle = `(() => {
  const process={env:{NODE_ENV:"development"}};
  const modules={${Object.entries(modules)
    .map(([n, c]) => `${JSON.stringify(n)}:(module,exports,require)=>{${c}\n}`)
    .join(",\n")}};
  const cache={}; const require=(name)=>{if(cache[name])return cache[name].exports;if(!modules[name])throw Error("Unexpected module "+name);const m=cache[name]={exports:{}};modules[name](m,m.exports,require);return m.exports;};
  const React=require("react"), {flushSync}=require("react-dom");
  const View=require("volunteers").ExchangeNeedVolunteers;
  const root=require("react-dom/client").createRoot(document.getElementById("root"));
  const row=()=>({id:"signup-a",version:2,name:"Fictional private volunteer",state:"ACTIVE",completedAt:"2026-10-01T12:00:00.000Z"});
  let epoch=0;
  if(!crypto.randomUUID)crypto.randomUUID=()=>"00000000-0000-4000-8000-"+String(++epoch).padStart(12,"0");
  const response=(data,status=200)=>({ok:status>=200&&status<300,status,headers:new Headers(),body:{cancel:async()=>{}},json:async()=>structuredClone(data)});
  window.mount=()=>{
    window.fixture={owner:"owner-a",data:{ownerId:"owner-a",volunteerNeedId:"need-a",volunteerSlotId:"slot-a",volunteerRole:"Fictional private role",volunteers:[row()],next:"private-next"},reads:[],writes:[],refreshes:0,totals:0,writeMode:"success",readMode:"success",pending:[],guard:null};
    flushSync(()=>root.render(React.createElement(React.StrictMode,null,React.createElement(View,{key:++epoch,owner:"owner-a",needId:"need-a",slotId:"slot-a",path:"/needs/a"}))));
  };
  window.unmount=()=>flushSync(()=>root.render(null));
  window.fetch=async(path,options={})=>{
    const f=window.fixture;
    if(path==="/api/platform/profile?view=identity")return response({id:f.owner});
    if(options.cache!=="no-store" || options.headers["X-Expected-Account"]!=="owner-a")throw Error("Transport is not account pinned and uncached");
    if(!options.body){
      const query=new URL(path,"https://fixture.invalid").searchParams;
      if(query.get("view")!=="need-volunteers"||query.get("id")!=="slot-a")throw Error("Wrong volunteer query");
      f.reads.push(path);
      if(f.readMode==="hold")return new Promise(resolve=>f.pending.push(()=>resolve(response(f.data))));
      if(f.readMode==="deny")return response({message:"Access denied"},403);
      return response(f.data);
    }
    f.writes.push(options.body); const body=JSON.parse(options.body);
    if(body.operation!=="need-complete-volunteer"||body.needId!=="need-a"||body.signupId!=="signup-a")throw Error("Wrong volunteer command");
    if(f.writeMode==="lost")throw Error("Fictional lost reply");
    if(f.writeMode==="wrong")return response({id:"other-signup",version:body.expectedVersion+1,message:"Wrong receipt"});
    if(f.writeMode==="invalid")return response({message:"Fictional validation rejection"},400);
    f.data.volunteers[0]={...f.data.volunteers[0],version:body.expectedVersion+1,completedAt:body.completed?"2026-10-03T12:00:00.000Z":null};
    return response({id:body.signupId,version:body.expectedVersion+1,message:"Fictional completion saved"});
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
let externalRequests = 0;
try {
  const context = await browser.newContext();
  await context.route("**/*", (route) => {
    externalRequests++;
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.setContent(
    '<style>*,*:before,*:after{box-sizing:border-box}body{margin:8px}textarea{max-width:100%}section{overflow-wrap:anywhere}</style><div id="root"></div>'
  );
  await page.addScriptTag({ content: bundle });
  const tick = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
    );
  const reason = () => page.getByLabel("Reason for correcting completed help");
  const correct = () =>
    page.getByRole("button", {
      name: "Correct completion record",
      exact: true
    });
  const confirm = () =>
    page.getByRole("button", {
      name: "Confirm help actually completed",
      exact: true
    });
  const focus = async () => {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await tick();
  };
  const mount = async () => {
    await page.evaluate(() => window.mount());
    await reason().waitFor();
  };
  async function scenario(name, fn) {
    const start = errors.length;
    try {
      await fn();
      assert.deepEqual(errors.slice(start), []);
      results.push({ name, pass: true });
    } catch (e) {
      results.push({
        name,
        pass: false,
        error: e.message,
        browserErrors: errors.slice(start),
        dom: await page.locator("#root").innerText()
      });
    } finally {
      await page.evaluate(() => window.unmount());
      await tick();
    }
    console.log(JSON.stringify(results.at(-1)));
  }
  await scenario(
    "concealment removes private DOM and retains unsent correction through recheck",
    async () => {
      await mount();
      await reason().fill("Fictional unsent correction");
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      await tick();
      assert.equal(await reason().count(), 0);
      assert.doesNotMatch(
        await page.locator("#root").innerText(),
        /Fictional private|Fictional unsent/
      );
      assert.equal(await page.locator('a[href*="private-next"]').count(), 0);
      await focus();
      await reason().waitFor();
      assert.equal(await reason().inputValue(), "Fictional unsent correction");
    }
  );

  async function withControlledUnfocusedDocument(fn) {
    await page.evaluate(() => {
      if (document.visibilityState !== "visible")
        throw Error("Controlled foreground probe requires a visible document");
      if (Object.hasOwn(window, "__volunteerFocusDescriptor"))
        throw Error("Focus override already installed");
      window.__volunteerFocusDescriptor =
        Object.getOwnPropertyDescriptor(document, "hasFocus");
      Object.defineProperty(document, "hasFocus", {
        configurable: true,
        value: () => false
      });
    });
    try {
      assert.deepEqual(
        await page.evaluate(() => [document.visibilityState, document.hasFocus()]),
        ["visible", false]
      );
      await fn();
    } finally {
      await page.evaluate(() => {
        const descriptor = window.__volunteerFocusDescriptor;
        if (descriptor) Object.defineProperty(document, "hasFocus", descriptor);
        else delete document.hasFocus;
        delete window.__volunteerFocusDescriptor;
      });
    }
  }
  await scenario(
    "controlled visible unfocused passive events retain concealed volunteer drafts",
    async () => {
      await mount();
      await reason().fill("Fictional controlled passive correction");
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      await tick();
      assert.equal(await reason().count(), 0);
      const before = await page.evaluate(() => ({
        reads: window.fixture.reads.length,
        writes: window.fixture.writes.length,
        refreshes: window.fixture.refreshes,
        totals: window.fixture.totals
      }));
      await withControlledUnfocusedDocument(async () => {
        await page.evaluate(() => {
          window.dispatchEvent(new Event("pageshow"));
          document.dispatchEvent(new Event("visibilitychange"));
        });
        await tick();
        assert.deepEqual(
          await page.evaluate(() => ({
            reads: window.fixture.reads.length,
            writes: window.fixture.writes.length,
            refreshes: window.fixture.refreshes,
            totals: window.fixture.totals
          })),
          before,
          "Controlled passive events cannot admit another private roster read"
        );
        assert.equal(await reason().count(), 0);
        assert.doesNotMatch(
          await page.locator("#root").innerText(),
          /Fictional private|Fictional controlled passive/
        );
        assert.equal(await page.locator('a[href*="private-next"]').count(), 0);
      });
      await focus();
      await reason().waitFor();
      assert.equal(await reason().inputValue(), "Fictional controlled passive correction");
      assert.equal(await page.evaluate(() => window.fixture.writes.length), 0);
    }
  );
  await scenario(
    "controlled unfocused active refresh rejects direct volunteer load admission",
    async () => {
      await mount();
      await reason().fill("Fictional controlled direct correction");
      const before = await page.evaluate(() => ({
        reads: window.fixture.reads.length,
        writes: window.fixture.writes.length,
        refreshes: window.fixture.refreshes,
        totals: window.fixture.totals
      }));
      // No blur: isolate the load gate with active=true and a controlled false
      // focus predicate. This is not a claim about native OS event ordering.
      await withControlledUnfocusedDocument(async () => {
        await page.evaluate(() =>
          window.dispatchEvent(new Event("social-relationships-changed"))
        );
        await tick();
        assert.deepEqual(
          await page.evaluate(() => ({
            reads: window.fixture.reads.length,
            writes: window.fixture.writes.length,
            refreshes: window.fixture.refreshes,
            totals: window.fixture.totals
          })),
          before,
          "The active refresh path cannot read while document.hasFocus() is false"
        );
      });
      await focus();
      await reason().waitFor();
      assert.equal(await reason().inputValue(), "Fictional controlled direct correction");
      assert.equal(await page.evaluate(() => window.fixture.writes.length), 0);
    }
  );

  await scenario(
    "lost response retries immutable command then rearms correction and completion",
    async () => {
      await mount();
      await reason().fill("Fictional original correction");
      await page.evaluate(() => (window.fixture.writeMode = "lost"));
      await correct().click();
      await page
        .getByRole("button", { name: "Confirm original save", exact: true })
        .waitFor();
      const original = await page.evaluate(() => window.fixture.writes[0]);
      await page.evaluate(() => {
        window.fixture.writeMode = "success";
        window.dispatchEvent(new Event("blur"));
      });
      await tick();
      assert.equal(await reason().count(), 0);
      await focus();
      await page
        .getByRole("button", { name: "Confirm original save", exact: true })
        .click();
      await confirm().waitFor();
      assert.deepEqual(await page.evaluate(() => window.fixture.writes), [
        original,
        original
      ]);
      assert.deepEqual(
        await page.evaluate(() => [
          window.fixture.refreshes,
          window.fixture.totals
        ]),
        [1, 1]
      );
      await confirm().click();
      await reason().waitFor();
      assert.equal(await reason().inputValue(), "");
      const commands = await page.evaluate(() =>
        window.fixture.writes.map(JSON.parse)
      );
      assert.equal(commands[2].expectedVersion, 3);
      assert.equal(commands[2].completed, true);
      assert.notEqual(commands[2].mutationId, commands[0].mutationId);
    }
  );
  await scenario(
    "wrong receipt retains original command without public refresh",
    async () => {
      await mount();
      await reason().fill("Fictional correction");
      await page.evaluate(() => (window.fixture.writeMode = "wrong"));
      await correct().click();
      await page
        .getByRole("button", { name: "Confirm original save", exact: true })
        .waitFor();
      assert.deepEqual(
        await page.evaluate(() => [
          window.fixture.refreshes,
          window.fixture.totals
        ]),
        [0, 0]
      );
      await page.evaluate(() => (window.fixture.writeMode = "success"));
      await page
        .getByRole("button", { name: "Confirm original save", exact: true })
        .click();
      await confirm().waitFor();
      const writes = await page.evaluate(() => window.fixture.writes);
      assert.equal(writes[0], writes[1]);
    }
  );
  await scenario(
    "account A to B to A clears private data and local edit until reload",
    async () => {
      await mount();
      await reason().fill("Fictional local edit");
      await page.evaluate(() => (window.fixture.owner = "owner-b"));
      await focus();
      await page
        .getByText(
          "Your sign-in changed. Private entries were cleared. Reload for your current account.",
          { exact: true }
        )
        .waitFor();
      assert.equal(await reason().count(), 0);
      await page.evaluate(() => (window.fixture.owner = "owner-a"));
      await focus();
      assert.equal(await reason().count(), 0);
      assert.doesNotMatch(
        await page.locator("#root").innerText(),
        /Fictional private|Fictional local/
      );
    }
  );
  await scenario(
    "unrelated canonical changes conceal retained edit instead of silently rebasing",
    async () => {
      await mount();
      await reason().fill("Fictional retained correction");
      await page.evaluate(
        () =>
          (window.fixture.data.volunteers[0].name = "Unrelated changed name")
      );
      await focus();
      assert.equal(await reason().count(), 0);
      assert.doesNotMatch(
        await page.locator("#root").innerText(),
        /Unrelated changed name|Fictional private/
      );
      assert.deepEqual(
        await page.evaluate(() => [
          window.fixture.refreshes,
          window.fixture.totals
        ]),
        [0, 0]
      );
      await page.evaluate(
        () =>
          (window.fixture.data.volunteers[0].name =
            "Fictional private volunteer")
      );
      await focus();
      await reason().waitFor();
      assert.equal(
        await reason().inputValue(),
        "Fictional retained correction"
      );
    }
  );
  await scenario(
    "denied access keeps original save concealed until current access returns",
    async () => {
      await mount();
      await reason().fill("Fictional original correction");
      await page.evaluate(() => (window.fixture.writeMode = "lost"));
      await correct().click();
      await page
        .getByRole("button", { name: "Confirm original save", exact: true })
        .waitFor();
      await page.evaluate(() => (window.fixture.readMode = "deny"));
      await focus();
      assert.equal(await reason().count(), 0);
      assert.equal(
        await page
          .getByRole("button", { name: "Confirm original save", exact: true })
          .isDisabled(),
        true
      );
      await page.evaluate(() => {
        window.fixture.readMode = "success";
        window.fixture.writeMode = "success";
      });
      await focus();
      await page
        .getByRole("button", { name: "Confirm original save", exact: true })
        .click();
      await confirm().waitFor();
      const writes = await page.evaluate(() => window.fixture.writes);
      assert.equal(writes[0], writes[1]);
    }
  );
  await scenario(
    "validation rejection permits corrected input and a new command",
    async () => {
      await mount();
      await reason().fill("Fictional invalid correction");
      await page.evaluate(() => (window.fixture.writeMode = "invalid"));
      await correct().click();
      await tick();
      await reason().waitFor();
      assert.equal(await reason().inputValue(), "Fictional invalid correction");
      await reason().fill("Fictional corrected explanation");
      await page.evaluate(() => (window.fixture.writeMode = "success"));
      await correct().click();
      await confirm().waitFor();
      const writes = await page.evaluate(() =>
        window.fixture.writes.map(JSON.parse)
      );
      assert.notEqual(writes[0].mutationId, writes[1].mutationId);
      assert.equal(writes[1].reason, "Fictional corrected explanation");
    }
  );
  await scenario(
    "abandoned read cannot restore private data after unmount",
    async () => {
      await mount();
      await page.evaluate(() => (window.fixture.readMode = "hold"));
      await focus();
      await page.waitForFunction(() => window.fixture.pending.length === 1);
      await page.evaluate(() => {
        window.unmount();
        window.fixture.pending.splice(0).forEach((fn) => fn());
      });
      await tick();
      assert.equal(await page.locator("#root").innerText(), "");
      assert.equal(await page.evaluate(() => window.fixture.refreshes), 0);
    }
  );
  await scenario(
    "320px enlarged text and keyboard correction controls remain usable",
    async () => {
      await page.setViewportSize({ width: 320, height: 740 });
      await page.addStyleTag({
        content:
          "html{font-size:200%}textarea,button{font:inherit}textarea{width:100%}"
      });
      await mount();
      await reason().focus();
      await page.keyboard.type("Fictional keyboard correction");
      assert.equal(
        await reason().inputValue(),
        "Fictional keyboard correction"
      );
      await page.keyboard.press("Tab");
      assert.equal(
        await correct().evaluate((el) => document.activeElement === el),
        true
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        ),
        true
      );
    }
  );
  assert.deepEqual(errors, []);
  assert.equal(externalRequests, 0);
} finally {
  await browser.close();
}
const report = {
  scope: "Controlled actual React/Chrome component tree with stub HTTP and navigation, not full application or native-window focus acceptance",
  controlledForegroundScenarios: 2,
  executedAt: new Date().toISOString(),
  sources: Object.fromEntries(
    Object.values(sources).map((path) => [
      path,
      createHash("sha256").update(readFileSync(path)).digest("hex")
    ])
  ),
  harnessSha256: createHash("sha256")
    .update(readFileSync(new URL(import.meta.url)))
    .digest("hex"),
  browser: browser.version(),
  results,
  errors,
  externalRequests
};
if (process.argv[2])
  writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + "\n", {
    flag: "wx"
  });
console.log(JSON.stringify(report, null, 2));
if (results.some((r) => !r.pass)) process.exitCode = 1;
