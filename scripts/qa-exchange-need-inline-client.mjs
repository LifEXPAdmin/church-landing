import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve, relative, isAbsolute } from "node:path";
const output = resolve(process.argv[2] ?? "");
assert.ok(process.argv[2], "Pass an exclusive private results path");
const outputParent = realpathSync(dirname(output));
const fixtureRelative = relative(realpathSync(".account-test"), outputParent);
assert.ok(
  fixtureRelative &&
    !fixtureRelative.startsWith("..") &&
    !isAbsolute(fixtureRelative),
);
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
assert.match(sourceSha, /^[a-f0-9]{40}$/);
const require = createRequire(import.meta.url);
const ts = require(process.env.TYPESCRIPT_MODULE ?? "typescript");
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ??
    `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`,
)("playwright");
const sources = {
  contributions: "components/platform/exchange-need-contributions.tsx",
  "./private-snapshot-guard": "components/platform/private-snapshot-guard.tsx",
  "./exchange-need-actions": "components/platform/exchange-need-actions.tsx",
  "./use-private-choice-action":
    "components/platform/use-private-choice-action.tsx",
  "./read-visibility": "components/platform/read-visibility.ts",
  "@/lib/platform/social-client": "lib/platform/social-client.ts",
  "@/lib/platform/exchange-need-options":
    "lib/platform/exchange-need-options.ts",
};
const modules = {
  "next/link": `exports.__esModule = true; exports.default = ({prefetch, children, ...props}) => require("react").createElement("a", props, children);`,
  "next/navigation": `const router = {refresh() {window.fixture.refreshes++; void window.refreshServer?.();}}; exports.useRouter = () => router;`,
  "./exchange-need-progress": `const refresh=async()=>{window.fixture.totals++;}; exports.useNeedProgressRefresh=(owner, listingId)=>{if(owner!=="owner-a"||listingId!=="listing-a")throw Error("Wrong totals scope");return refresh;};`,
  "./use-photo-back-guard": `exports.settlePhotoNavigation = async () => {};`,
  "./private-snapshot-guard": `exports.usePrivateRecovery = () => {};`,
  "./use-unsaved-social-work": `exports.useUnsavedSocialWork = (value) => {window.fixture.guard = value;};`,
  "./privileged-auth-navigation": `exports.announcePrivilegedChallenge = () => false;`,
  "./exchange-saved-controls": `exports.useExchangeAction = () => {throw Error("Unused legacy action");};`,
  "./portal-action-form": `exports.portalInputClass = "";`,
  "./regional-presentation": `exports.RegionalTime = () => null;`,
  "@/lib/platform/community-report-types": `exports.reportEntryHref = () => "/unused";`,
};
for (const [name, path] of Object.entries(sources))
  modules[name] = ts.transpileModule(readFileSync(path, "utf8"), {
    fileName: path,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
for (const [name, pkg, file] of [
  ["react", "react", "react.development.js"],
  ["react/jsx-runtime", "react", "react-jsx-runtime.development.js"],
  ["react-dom", "react-dom", "react-dom.development.js"],
  ["react-dom/client", "react-dom", "react-dom-client.development.js"],
  ["scheduler", "scheduler", "scheduler.development.js"],
])
  modules[name] = readFileSync(
    join(dirname(require.resolve(`${pkg}/package.json`)), "cjs", file),
    "utf8",
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
  const View=require("contributions").ExchangeNeedContributions;
  const root=require("react-dom/client").createRoot(document.getElementById("root"));
  const row=(id="contribution-a")=>({id,version:3,state:"COMMITTED",quantity:5,received:3,returned:0,createdAt:"2026-10-01T12:00:00.000Z",endedAt:null,current:true,own:true,needId:"need-a",slotId:"slot-a",listingId:"listing-a",title:"Fictional private contribution",note:"Fictional private note",quoteMinor:18765,quoteCurrency:"USD",shareName:false,disputed:false,disputeNote:"",loanReturnAt:"2026-10-10T12:00:00.000Z",loanResponsibility:"Fictional private terms",contributor:null});
  let epoch=0,uuid=0,timerId=0;
  const controlledIntervals=new Map(),nativeSetInterval=window.setInterval,nativeClearInterval=window.clearInterval;
  window.setInterval=(fn,ms,...args)=>ms===30000?(controlledIntervals.set(++timerId,fn),timerId):nativeSetInterval(fn,ms,...args);
  window.clearInterval=id=>controlledIntervals.delete(id)||nativeClearInterval(id);
  window.poll=()=>[...controlledIntervals.values()].forEach(fn=>fn());
  Object.defineProperty(document,"hasFocus",{value:()=>window.fixture?.focused!==false});
  if(!crypto.randomUUID)crypto.randomUUID=()=>"00000000-0000-4000-8000-"+String(++uuid).padStart(12,"0");
  const response=(data,status=200)=>({ok:status>=200&&status<300,status,headers:new Headers(),body:{cancel:async()=>{}},json:async()=>structuredClone(data)});
  if(!crypto.subtle)Object.defineProperty(crypto,"subtle",{value:{digest:async(_algorithm,bytes)=>Uint8Array.from(await window.fixtureDigest(Array.from(bytes))).buffer}});
  const hash=async(data)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(data)))),b=>b.toString(16).padStart(2,"0")).join("");
  const query={view:"need",listingId:"listing-a",needId:"need-a"};
  function Parent(){const [visible,setVisible]=React.useState(true),[checksum,setChecksum]=React.useState(window.fixture.checksum);window.setParent=setVisible;
    window.refreshServer=async()=>{const next=await hash(window.fixture.data);setChecksum(next);};
    const child=React.createElement(View,{owner:"owner-a",query});
    return React.createElement(require("./read-visibility").ReadVisibility.Provider,{value:visible},window.fixture.guarded?React.createElement(require("./private-snapshot-guard").PrivateSnapshotGuard,{owner:"owner-a",url:"/api/platform/exchange?view=need-need&listingId=listing-a",checksum,label:"need actions and progress"},child):child);
  }
  window.mount=async(options={})=>{
    window.fixture={focused:options.focused??true,owner:"owner-a",data:{ownerId:"owner-a",listingId:"listing-a",need:{id:"need-a",contributions:[row(),...(options.sibling?[row("sibling-a")]:[])],moreContributions:true}},reads:[],writes:[],refreshes:0,totals:0,guarded:options.guarded??false,writeMode:"success",readMode:options.readMode??"success",pending:[],guard:null};
    window.fixture.checksum=await hash(window.fixture.data);
    flushSync(()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Parent,{key:++epoch}))));
  };
  window.unmount=()=>flushSync(()=>root.render(null));
  window.fetch=async(path,options={})=>{
    const f=window.fixture;
    if(path==="/api/platform/profile?view=identity")return response({id:f.owner});
    if(options.cache!=="no-store" || options.headers["X-Expected-Account"]!=="owner-a")throw Error("Transport is not account pinned and uncached");
    if(!options.body){
      const query=new URL(path,"https://fixture.invalid").searchParams;
      if(query.get("view")!=="need-need"||query.get("listingId")!=="listing-a")throw Error("Wrong inline query");
      f.reads.push(path);
      if(f.readMode==="hold")return new Promise(resolve=>f.pending.push(()=>resolve(response(f.data))));
      if(f.readMode==="deny")return response({message:"Access denied"},403);
      return response(f.data);
    }
    f.writes.push(options.body); const body=JSON.parse(options.body);
    if(!["need-dispute","need-attribution","need-confirm-return"].includes(body.operation))throw Error("Wrong contribution command");
    if(f.writeMode==="wrong")return response({id:"other-contribution",version:body.expectedVersion+1,message:"Wrong receipt"});
    if(f.writeMode==="invalid")return response({message:"Fictional validation rejection"},400);
    const i=f.data.need.contributions.findIndex(r=>r.id===body.id), prior=f.data.need.contributions[i];
    f.data.need.contributions[i]={...prior,version:body.expectedVersion+1,...(body.operation==="need-dispute"?{disputed:true,disputeNote:body.note}:body.operation==="need-attribution"?{shareName:body.shareName}:{returned:body.quantity})};
    if(f.writeMode==="lost")throw Error("Fictional lost reply after saving");
    return response({id:body.id,version:body.expectedVersion+1,message:"Fictional contribution saved"});
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
    "--disable-gpu-shader-disk-cache",
  ],
});
const results = [],
  errors = [],
  diagnostics = [];
let fatal;
let externalRequests = 0;
try {
  const context = await browser.newContext();
  await context.route("**/*", (route) => {
    externalRequests++;
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on("pageerror", (e) => {
    errors.push("page-error");
    diagnostics.push(e.message);
  });
  page.on("console", (m) => {
    if (m.type() === "error") {
      errors.push("console-error");
      diagnostics.push(m.text());
    }
  });
  await page.exposeFunction("fixtureDigest", (bytes) =>
    Array.from(createHash("sha256").update(Buffer.from(bytes)).digest()),
  );
  await page.setContent(
    '<style>*,*:before,*:after{box-sizing:border-box}body{margin:8px}textarea{max-width:100%}section{overflow-wrap:anywhere}</style><div id="root"></div>',
  );
  await page.addScriptTag({ content: bundle });
  const tick = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  const cards = () =>
    page.getByRole("article", { name: "Your need contribution", exact: true });
  const reason = (index = 0) =>
    cards()
      .nth(index)
      .getByRole("textbox", { name: "Private dispute note", exact: true });
  const exact = (name) => page.getByRole("button", { name, exact: true });
  const focus = async () => {
    await page.evaluate(() => {
      window.fixture.focused = true;
      window.dispatchEvent(new Event("focus"));
    });
    await tick();
  };
  const mount = async (options = {}) => {
    await page.evaluate((options) => window.mount(options), options);
    if (!options.readMode && options.focused !== false)
      await reason().waitFor();
    else await tick();
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
        error: "scenario-assertion",
        browserErrors: errors.slice(start),
      });
      diagnostics.push({
        name,
        error: String(e.stack ?? e),
        dom: await page
          .locator("#root")
          .innerText()
          .catch(() => "unavailable"),
      });
    } finally {
      await page.evaluate(() => window.unmount());
      await tick();
    }
    console.log(JSON.stringify({ name, pass: results.at(-1).pass }));
  }
  await scenario(
    "held and denied account reads initialize no private cards",
    async () => {
      await mount({ readMode: "hold" });
      assert.equal(await cards().count(), 0);
      assert.doesNotMatch(
        await page.locator("#root").innerText(),
        /Fictional private/,
      );
      await page.evaluate(() => {
        window.unmount();
        window.fixture.pending.splice(0).forEach((f) => f());
      });
      await tick();
      await mount({ readMode: "deny" });
      assert.equal(await cards().count(), 0);
      assert.equal(await page.getByRole("link").count(), 0);
    },
  );
  await scenario(
    "concealment removes saved and unsent private DOM while retaining the draft",
    async () => {
      await mount();
      await reason().fill("Fictional unsent dispute");
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      await tick();
      assert.equal(await cards().count(), 0);
      assert.equal(await page.getByRole("textbox").count(), 0);
      assert.doesNotMatch(
        await page.locator("#root").innerText(),
        /Fictional private|Fictional unsent/,
      );
      await focus();
      assert.equal(await reason().inputValue(), "Fictional unsent dispute");
      await page.evaluate(() => window.setParent(false));
      await tick();
      assert.equal(await cards().count(), 0);
      await page.evaluate(() => window.setParent(true));
      await tick();
      assert.equal(await reason().inputValue(), "Fictional unsent dispute");
    },
  );
  await scenario(
    "lost committed response retries the identical command and waits for its receipt",
    async () => {
      await mount();
      await reason().fill("Fictional original dispute");
      await page.evaluate(() => (window.fixture.writeMode = "lost"));
      await exact("Flag a private dispute").click();
      await exact("Confirm original save").waitFor();
      const original = await page.evaluate(() => window.fixture.writes[0]);
      await page.evaluate(() => {
        window.fixture.writeMode = "success";
        window.dispatchEvent(new Event("blur"));
      });
      await focus();
      assert.equal(await cards().count(), 0);
      await exact("Confirm original save").click();
      await reason().waitFor();
      assert.deepEqual(await page.evaluate(() => window.fixture.writes), [
        original,
        original,
      ]);
      await page.waitForFunction(
        () => document.querySelector("textarea")?.value === "",
      );
      assert.equal(await reason().inputValue(), "");
      assert.match(await cards().innerText(), /Fictional original dispute/);
      assert.equal(await page.evaluate(() => window.fixture.refreshes), 1);
    },
  );
  await scenario(
    "a confirmed command preserves a sibling draft through one server refresh",
    async () => {
      await mount({ sibling: true });
      await reason(1).fill("Sibling private draft");
      await cards()
        .nth(0)
        .getByRole("button", {
          name: "Allow my contributor name to be shown",
          exact: true,
        })
        .click();
      await cards()
        .nth(0)
        .getByRole("button", {
          name: "Stop showing my contributor name",
          exact: true,
        })
        .waitFor();
      assert.equal(await reason(1).inputValue(), "Sibling private draft");
      assert.equal(await page.evaluate(() => window.fixture.refreshes), 1);
    },
  );
  await scenario(
    "wrong account, listing, need and unrelated own row fail closed",
    async () => {
      for (const field of ["account", "listing", "need", "row"]) {
        await mount();
        await page.evaluate((field) => {
          const f = window.fixture;
          if (field === "account") f.data.ownerId = "other";
          if (field === "listing") f.data.listingId = "other";
          if (field === "need") f.data.need.id = "other";
          if (field === "row") f.data.need.contributions[0].needId = "other";
          window.dispatchEvent(new Event("blur"));
        }, field);
        await focus();
        assert.equal(await cards().count(), 0);
        await page.evaluate(() => window.unmount());
        await tick();
      }
    },
  );
  await scenario(
    "A to B to A sign-in clears retained private cards and drafts",
    async () => {
      await mount();
      await reason().fill("Abandoned A draft");
      await page.evaluate(() => {
        window.fixture.owner = "owner-b";
        window.dispatchEvent(new Event("blur"));
      });
      await focus();
      assert.equal(await cards().count(), 0);
      assert.match(await page.locator("#root").innerText(), /sign-in changed/i);
      await page.evaluate(() => (window.fixture.owner = "owner-a"));
      await focus();
      assert.equal(await cards().count(), 0);
      assert.doesNotMatch(
        await page.locator("#root").innerText(),
        /Abandoned A draft/,
      );
    },
  );
  await scenario(
    "changed more-page marker conceals original owners and preserves sibling drafts",
    async () => {
      await mount({ sibling: true });
      await reason(1).fill("Retained draft");
      await page.evaluate(() => {
        window.fixture.data.need.moreContributions = false;
        window.dispatchEvent(new Event("blur"));
      });
      await focus();
      assert.equal(await cards().count(), 0);
      assert.match(
        await page.locator("#root").innerText(),
        /contributions changed/i,
      );
      await page.evaluate(() => {
        window.fixture.data.need.moreContributions = true;
        window.dispatchEvent(new Event("blur"));
      });
      await focus();
      assert.equal(await reason(1).inputValue(), "Retained draft");
    },
  );
  await scenario(
    "abandoned read cannot restore private content after unmount",
    async () => {
      await mount({ readMode: "hold" });
      await page.evaluate(() => {
        window.unmount();
        window.fixture.pending.splice(0).forEach((f) => f());
      });
      await tick();
      assert.equal(await cards().count(), 0);
    },
  );
  await scenario(
    "actual parent guard accepts the refreshed checksum after a confirmed inline write",
    async () => {
      await mount({ guarded: true, sibling: true });
      await reason(1).fill("Guarded sibling draft");
      await cards()
        .nth(0)
        .getByRole("button", {
          name: "Allow my contributor name to be shown",
          exact: true,
        })
        .click();
      await cards()
        .nth(0)
        .getByRole("button", {
          name: "Stop showing my contributor name",
          exact: true,
        })
        .waitFor();
      await focus();
      await reason(1).waitFor();
      assert.equal(await reason(1).inputValue(), "Guarded sibling draft");
      assert.deepEqual(
        await page.evaluate(() => [
          window.fixture.refreshes,
          window.fixture.totals,
        ]),
        [1, 1],
      );
    },
  );
  await scenario(
    "actual parent guard preserves and confirms a lost original request before accepting new details",
    async () => {
      await mount({ guarded: true });
      await reason().fill("Guarded original dispute");
      await page.evaluate(() => (window.fixture.writeMode = "lost"));
      await exact("Flag a private dispute").click();
      await exact("Confirm original save").waitFor();
      const original = await page.evaluate(() => window.fixture.writes[0]);
      await page.evaluate(() => {
        window.fixture.writeMode = "success";
        window.dispatchEvent(new Event("blur"));
      });
      await focus();
      await exact("Confirm original request").click();
      await reason().waitFor();
      await page.waitForFunction(
        () => document.querySelector("textarea")?.value === "",
      );
      assert.deepEqual(await page.evaluate(() => window.fixture.writes), [
        original,
        original,
      ]);
      await focus();
      await reason().waitFor();
      assert.deepEqual(
        await page.evaluate(() => [
          window.fixture.refreshes,
          window.fixture.totals,
        ]),
        [1, 1],
      );
    },
  );
  await scenario(
    "320-pixel enlarged controls fit and retain keyboard access",
    async () => {
      await page.setViewportSize({ width: 320, height: 1000 });
      await page.addStyleTag({
        content:
          "html{font-size:200%}button,input,textarea{font:inherit;max-width:100%;min-width:0}button{white-space:normal}fieldset{min-width:0}",
      });
      await mount();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await reason().focus();
      await page.keyboard.press("Tab");
      assert.equal(
        await exact("Allow my contributor name to be shown").evaluate(
          (el) => el === document.activeElement,
        ),
        true,
      );
    },
  );
  await scenario(
    "direct visible-unfocused inline mount has no read or private DOM",
    async () => {
      await mount({ focused: false });
      assert.equal(
        await page.evaluate(() => document.visibilityState),
        "visible",
      );
      assert.equal(await page.evaluate(() => window.fixture.reads.length), 0);
      assert.equal(await cards().count(), 0);
      await focus();
      await reason().waitFor();
    },
  );
  await scenario(
    "visible-unfocused timer conceals retained inline draft without reading",
    async () => {
      await mount();
      await reason().fill("Fictional retained focus draft");
      const count = await page.evaluate(() => window.fixture.reads.length);
      await page.evaluate(() => {
        window.fixture.focused = false;
        window.poll();
      });
      await tick();
      assert.equal(
        await page.evaluate(() => document.visibilityState),
        "visible",
      );
      assert.equal(
        await page.evaluate(() => window.fixture.reads.length),
        count,
      );
      assert.equal(await cards().count(), 0);
      await focus();
      await reason().waitFor();
      assert.equal(
        await reason().inputValue(),
        "Fictional retained focus draft",
      );
    },
  );
  await scenario(
    "held inline reply cannot expose rows after focus is lost",
    async () => {
      await mount({ readMode: "hold" });
      assert.ok((await page.evaluate(() => window.fixture.reads.length)) > 0);
      await page.evaluate(() => {
        window.fixture.focused = false;
        window.fixture.pending.splice(0).forEach((fn) => fn());
      });
      await tick();
      assert.equal(await cards().count(), 0);
      assert.equal(await page.getByRole("textbox").count(), 0);
      await page.evaluate(() => {
        window.fixture.readMode = "success";
      });
      await focus();
      await reason().waitFor();
    },
  );
  await scenario(
    "queued inline recheck revalidates focus before transport admission",
    async () => {
      await mount();
      await page.evaluate(() => {
        window.fixture.readMode = "hold";
        window.poll();
      });
      await tick();
      const count = await page.evaluate(() => window.fixture.reads.length);
      await page.evaluate(() => {
        window.poll();
        window.fixture.focused = false;
        window.fixture.pending.splice(0).forEach((fn) => fn());
      });
      await tick();
      assert.equal(
        await page.evaluate(() => window.fixture.reads.length),
        count,
      );
      assert.equal(await cards().count(), 0);
      await page.evaluate(() => {
        window.fixture.readMode = "success";
      });
      await focus();
      await reason().waitFor();
    },
  );
  assert.deepEqual(errors, []);
  assert.equal(externalRequests, 0);
} catch (error) {
  fatal = error;
  errors.push("harness-assertion");
  diagnostics.push(String(error.stack ?? error));
} finally {
  await browser.close().catch((error) => {
    fatal ??= error;
    errors.push("browser-close-error");
  });
}
const report = {
  suite: "need-inline-client",
  sourceSha,
  scopeEvidence: "controlled-component-with-blocked-network-and-stub-transport",
  productionWrites: null,
  externalSends: null,
  visibility: "controlled-ReadVisibility-context-not-native-focus",
  lifecycleEvidence: "controlled-document-focus-events-not-native-focus",
  complete:
    !fatal &&
    results.length === 15 &&
    results.every((r) => r.pass) &&
    errors.length === 0 &&
    externalRequests === 0,
  executedAt: new Date().toISOString(),
  sources: Object.fromEntries(
    Object.values(sources).map((path) => [
      path,
      createHash("sha256").update(readFileSync(path)).digest("hex"),
    ]),
  ),
  harnessSha256: createHash("sha256")
    .update(readFileSync(new URL(import.meta.url)))
    .digest("hex"),
  browser: browser.version(),
  results,
  errors,
  externalRequests,
};
writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
  flag: "wx",
  mode: 0o600,
});
if (diagnostics.length)
  writeFileSync(
    join(outputParent, "private-diagnostics.json"),
    JSON.stringify(diagnostics, null, 2) + "\n",
    { flag: "wx", mode: 0o600 },
  );
console.log(
  JSON.stringify({
    suite: report.suite,
    groups: results.length,
    complete: report.complete,
  }),
);
if (!report.complete) process.exitCode = 1;
