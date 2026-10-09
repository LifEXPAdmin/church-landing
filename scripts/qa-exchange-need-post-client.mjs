import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve, relative, isAbsolute } from "node:path";
import { execFileSync } from "node:child_process";
const output = resolve(process.argv[2] ?? "");
assert.ok(process.argv[2], "Pass an exclusive private results path");
const outputParent = realpathSync(dirname(output));
const fixtureRelative = relative(realpathSync(".account-test"), outputParent);
assert.ok(
  fixtureRelative &&
    !fixtureRelative.startsWith("..") &&
    !isAbsolute(fixtureRelative),
);
assert.equal(process.env.NEED_POST_SOURCE_ROOT, undefined);
assert.equal(process.env.NEED_POST_CASE_FILTER, undefined);
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
assert.match(sourceSha, /^[a-f0-9]{40}$/);
const runtimeModules = [];
const require = createRequire(import.meta.url);
const ts = require(process.env.TYPESCRIPT_MODULE ?? "typescript");
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ??
    `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`,
)("playwright");
const sources = {
  posts: "components/platform/exchange-need-posts.tsx",
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
]) {
  const modulePath = join(
    dirname(require.resolve(`${pkg}/package.json`)),
    "cjs",
    file,
  );
  const bytes = readFileSync(modulePath);
  runtimeModules.push({
    name,
    package: pkg,
    file,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  modules[name] = readFileSync(
    join(dirname(require.resolve(`${pkg}/package.json`)), "cjs", file),
    "utf8",
  );
}
// Actual React, canonical page, command hook and pinned transport. Only server,
// Next navigation and unrelated navigation guards are deterministic stand-ins.
const bundle = `(() => {
  const process={env:{NODE_ENV:"development"}};
  const modules={${Object.entries(modules)
    .map(([n, c]) => `${JSON.stringify(n)}:(module,exports,require)=>{${c}\n}`)
    .join(",\n")}};
  const cache={}; const require=(name)=>{if(cache[name])return cache[name].exports;if(!modules[name])throw Error("Unexpected module "+name);const m=cache[name]={exports:{}};modules[name](m,m.exports,require);return m.exports;};
  const React=require("react"), {flushSync}=require("react-dom");
  const View=require("posts").ExchangeNeedPosts;
  const root=require("react-dom/client").createRoot(document.getElementById("root"));
  Object.defineProperty(document,"hasFocus",{value:()=>window.fixture?.focused!==false});
  let epoch=0,uuid=0;
  if(!crypto.randomUUID)crypto.randomUUID=()=>"00000000-0000-4000-8000-"+String(++uuid).padStart(12,"0");
  if(!crypto.subtle)Object.defineProperty(crypto,"subtle",{value:{digest:async(_algorithm,bytes)=>Uint8Array.from(await window.fixtureDigest(Array.from(bytes))).buffer}});
  const hash=async(data)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(data)))),b=>b.toString(16).padStart(2,"0")).join("");
  const response=(data,status=200)=>({ok:status>=200&&status<300,status,headers:new Headers(),body:{cancel:async()=>{}},json:async()=>structuredClone(data)});
  const detail=()=>({ownerId:"owner-a",listingId:"listing-a",need:{id:"need-a",version:window.fixture.data.postsNeedVersion}});
  function Parent(){const [visible,setVisible]=React.useState(true),[checksum,setChecksum]=React.useState(window.fixture.checksum);window.setParent=setVisible;
    window.refreshServer=async()=>setChecksum(await hash(detail()));
    const child=React.createElement(View,{owner:"owner-a",listingId:"listing-a",needId:"need-a",path:"/needs/a",after:"page-a"});
    return React.createElement(require("./read-visibility").ReadVisibility.Provider,{value:visible},window.fixture.guarded?React.createElement(require("./private-snapshot-guard").PrivateSnapshotGuard,{owner:"owner-a",url:"/api/platform/exchange?view=need-need&listingId=listing-a",checksum,label:"need actions and progress"},child):child);
  }
  window.mount=async(options={})=>{
    window.fixture={owner:"owner-a",data:{ownerId:"owner-a",postsListingId:"listing-a",postsNeedId:"need-a",postsNeedVersion:3,postsCanLink:true,
      posts:[{id:"post-a",version:4,excerpt:"Fictional private post excerpt",linked:false},{id:"post-b",version:7,excerpt:"Fictional sibling excerpt",linked:false}],next:"private-next"},
      reads:[],writes:[],refreshes:0,focused:options.focused??true,guarded:options.guarded??false,writeMode:"success",readMode:options.readMode??"success",pending:[],receipts:new Map(),guard:null};
    window.fixture.checksum=await hash(detail());
    flushSync(()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Parent,{key:++epoch}))));
  };
  window.unmount=()=>flushSync(()=>root.render(null));
  window.fetch=async(path,options={})=>{
    const f=window.fixture;
    if(path==="/api/platform/profile?view=identity")return response({id:f.owner});
    if(options.cache!=="no-store" || options.headers["X-Expected-Account"]!=="owner-a")throw Error("Transport is not account pinned and uncached");
    if(!options.body){
      const query=new URL(path,"https://fixture.invalid").searchParams;
      if(query.get("listingId")!=="listing-a")throw Error("Wrong listing query");
      if(query.get("view")==="need-need")return response(detail());
      if(query.get("view")!=="need-posts"||query.get("after")!=="page-a")throw Error("Wrong post page query");
      f.reads.push({path,signal:options.signal});
      if(f.readMode==="hold")return new Promise(resolve=>f.pending.push(()=>resolve(response(f.data))));
      if(f.readMode==="deny")return response({message:"Access denied"},403);
      return response(f.data);
    }
    f.writes.push(options.body); const body=JSON.parse(options.body);
    if(body.operation!=="need-link-post"||body.needId!=="need-a")throw Error("Wrong post-link command");
    if(f.writeMode==="wrong")return response({id:"other-need",version:body.expectedVersion+1,message:"Wrong receipt"});
    if(f.writeMode==="wrongVersion")return response({id:"need-a",version:body.expectedVersion+2,message:"Wrong receipt"});
    if(f.writeMode==="invalid")return response({message:"Fictional validation rejection"},400);
    let receipt=f.receipts.get(options.body);
    if(!receipt){
      const i=f.data.posts.findIndex(r=>r.id===body.postId),prior=f.data.posts[i];
      if(body.expectedVersion!==f.data.postsNeedVersion || body.postVersion!==prior.version)throw Error("Stale command fields");
      f.data.posts[i]={...prior,version:body.postVersion+1,linked:body.linked};f.data.postsNeedVersion=body.expectedVersion+1;
      if(f.writeMode==="changedSibling")f.data.posts[1]={...f.data.posts[1],excerpt:"Unexpected sibling change"};
      receipt={id:body.needId,version:body.expectedVersion+1,message:"Fictional post link saved"};f.receipts.set(options.body,receipt);
    }
    if(f.writeMode==="lost")throw Error("Fictional lost reply after saving");
    return response(receipt);
  };
})();`;
const results = [],
  errors = [];
let externalRequests = 0,
  fatal = null,
  browser = null;
try {
  browser = await chromium.launch({
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

  const context = await browser.newContext({ serviceWorkers: "block" });
  await context.route("**/*", (route) => {
    externalRequests++;
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on("pageerror", () => errors.push("pageerror"));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console-error");
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
  const panel = () =>
    page.getByRole("region", { name: "Church Need post links", exact: true });
  const link = () =>
    panel()
      .getByRole("button", { name: "Link this post to this need", exact: true })
      .first();
  const unlink = () =>
    panel().getByRole("button", { name: "Remove this need link", exact: true });
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
    if (!options.readMode && options.focused !== false) await panel().waitFor();
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
        error: "scenario-assertion-failed",
        browserErrors: errors.slice(start),
      });
      console.error(
        JSON.stringify({
          scenario: name,
          code:
            e?.code === "ERR_ASSERTION"
              ? "ERR_ASSERTION"
              : "CONTROLLED_FAILURE",
          operator:
            typeof e?.operator === "string" ? e.operator.slice(0, 40) : null,
        }),
      );
    } finally {
      await page.evaluate(() => window.unmount());
      await tick();
    }
    console.log(JSON.stringify(results.at(-1)));
  }
  await scenario(
    "held and denied reads expose no post excerpts, link state or next cursor",
    async () => {
      await mount({ readMode: "hold" });
      assert.equal(await panel().count(), 0);
      assert.doesNotMatch(
        await page.locator("#root").innerText(),
        /Fictional private|Fictional sibling/,
      );
      await page.evaluate(() => {
        window.unmount();
        window.fixture.pending.splice(0).forEach((f) => f());
      });
      await tick();
      await mount({ readMode: "deny" });
      assert.equal(await panel().count(), 0);
      assert.equal(await page.getByRole("link").count(), 0);
    },
  );
  await scenario(
    "blur and parent concealment physically remove private excerpts and pagination",
    async () => {
      await mount();
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      await tick();
      assert.equal(await panel().count(), 0);
      assert.equal(await page.getByRole("link").count(), 0);
      assert.doesNotMatch(
        await page.locator("#root").innerText(),
        /Fictional private|Fictional sibling/,
      );
      await focus();
      await panel().waitFor();
      await page.evaluate(() => window.setParent(false));
      await tick();
      assert.equal(await panel().count(), 0);
      await page.evaluate(() => window.setParent(true));
      await panel().waitFor();
    },
  );
  await scenario(
    "link and unlink use fresh need and post versions after exact canonical receipts",
    async () => {
      await mount();
      await link().click();
      await unlink().waitFor();
      await page.waitForFunction(() =>
        Array.from(document.querySelectorAll("button")).some(
          (b) => b.textContent === "Remove this need link" && !b.disabled,
        ),
      );
      await unlink().click();
      await link().waitFor();
      await tick();
      const commands = await page.evaluate(() =>
        window.fixture.writes.map(JSON.parse),
      );
      assert.equal(commands.length, 2);
      assert.deepEqual(
        commands.map((c) => [
          c.needId,
          c.expectedVersion,
          c.postId,
          c.postVersion,
          c.linked,
        ]),
        [
          ["need-a", 3, "post-a", 4, true],
          ["need-a", 4, "post-a", 5, false],
        ],
      );
      assert.equal(await page.evaluate(() => window.fixture.refreshes), 2);
    },
  );
  await scenario(
    "a committed lost response retains the original command through concealment and byte-identical retry",
    async () => {
      await mount();
      await page.evaluate(() => (window.fixture.writeMode = "lost"));
      await link().click();
      await exact("Confirm original save").waitFor();
      const original = await page.evaluate(() => window.fixture.writes[0]);
      await page.evaluate(() => {
        window.fixture.writeMode = "success";
        window.dispatchEvent(new Event("blur"));
      });
      await focus();
      assert.equal(await panel().count(), 0);
      await exact("Confirm original save").click();
      await unlink().waitFor();
      assert.deepEqual(await page.evaluate(() => window.fixture.writes), [
        original,
        original,
      ]);
      assert.equal(await page.evaluate(() => window.fixture.refreshes), 1);
    },
  );
  await scenario(
    "wrong target and future-version receipts cannot confirm or rearm an original request",
    async () => {
      for (const mode of ["wrong", "wrongVersion"]) {
        await mount();
        await page.evaluate((mode) => (window.fixture.writeMode = mode), mode);
        await link().click();
        await exact("Confirm original save").waitFor();
        assert.equal(await link().isDisabled(), true);
        assert.equal(await page.evaluate(() => window.fixture.refreshes), 0);
        await page.evaluate(() => window.unmount());
        await tick();
      }
    },
  );
  await scenario(
    "correct receipt with a changed sibling remains concealed without page refresh",
    async () => {
      await mount();
      await page.evaluate(() => (window.fixture.writeMode = "changedSibling"));
      await link().click();
      await page.waitForFunction(() =>
        document.getElementById("root").textContent.includes("posts changed"),
      );
      assert.equal(await panel().count(), 0);
      assert.equal(await page.evaluate(() => window.fixture.refreshes), 0);
      assert.doesNotMatch(
        await page.locator("#root").innerText(),
        /Unexpected sibling/,
      );
    },
  );
  await scenario(
    "wrong scope and lost linking duty fail closed on current reads",
    async () => {
      for (const field of [
        "ownerId",
        "postsListingId",
        "postsNeedId",
        "postsCanLink",
      ]) {
        await mount();
        await page.evaluate((field) => {
          window.fixture.data[field] =
            field === "postsCanLink" ? false : "other";
          window.dispatchEvent(new Event("blur"));
        }, field);
        await focus();
        assert.equal(await panel().count(), 0);
        await page.evaluate(() => window.unmount());
        await tick();
      }
    },
  );
  await scenario(
    "A to B to A sign-in clears original post data and does not resurrect it",
    async () => {
      await mount();
      await page.evaluate(() => {
        window.fixture.owner = "owner-b";
        window.dispatchEvent(new Event("blur"));
      });
      await focus();
      assert.equal(await panel().count(), 0);
      assert.match(await page.locator("#root").innerText(), /sign-in changed/i);
      await page.evaluate(() => (window.fixture.owner = "owner-a"));
      await focus();
      assert.equal(await panel().count(), 0);
    },
  );
  await scenario(
    "validation failure permits an explicit fresh command and does not auto-retry",
    async () => {
      await mount();
      await page.evaluate(() => (window.fixture.writeMode = "invalid"));
      await link().click();
      await tick();
      assert.equal(await page.evaluate(() => window.fixture.writes.length), 1);
      await page.evaluate(() => (window.fixture.writeMode = "success"));
      await link().click();
      await unlink().waitFor();
      assert.equal(await page.evaluate(() => window.fixture.writes.length), 2);
    },
  );
  await scenario(
    "actual parent guard accepts new detail only after the original lost request is confirmed",
    async () => {
      await mount({ guarded: true });
      await page.evaluate(() => (window.fixture.writeMode = "lost"));
      await link().click();
      await exact("Confirm original save").waitFor();
      const original = await page.evaluate(() => window.fixture.writes[0]);
      await page.evaluate(() => {
        window.fixture.writeMode = "success";
        window.dispatchEvent(new Event("blur"));
      });
      await focus();
      await exact("Confirm original request").click();
      await unlink().waitFor();
      await focus();
      await unlink().waitFor();
      assert.deepEqual(await page.evaluate(() => window.fixture.writes), [
        original,
        original,
      ]);
      assert.equal(await page.evaluate(() => window.fixture.refreshes), 1);
    },
  );
  await scenario(
    "unmount cancels a held post page and a late read cannot restore excerpts",
    async () => {
      await mount({ readMode: "hold" });
      await page.evaluate(() => {
        window.unmount();
        window.fixture.pending.splice(0).forEach((f) => f());
      });
      await tick();
      assert.equal(await panel().count(), 0);
      assert.equal(
        await page.evaluate(() => window.fixture.reads.at(-1).signal.aborted),
        true,
      );
    },
  );
  await scenario(
    "320-pixel enlarged post controls fit and remain keyboard reachable",
    async () => {
      await page.setViewportSize({ width: 320, height: 1000 });
      await page.addStyleTag({
        content:
          "html{font-size:200%}button{font:inherit;max-width:100%;white-space:normal}",
      });
      await mount();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await link().focus();
      await page.keyboard.press("Tab");
      assert.equal(
        await panel()
          .getByRole("button", {
            name: "Link this post to this need",
            exact: true,
          })
          .nth(1)
          .evaluate((el) => el === document.activeElement),
        true,
      );
    },
  );
  await scenario(
    "visible unfocused return admits no private post read until focused",
    async () => {
      await mount({ focused: false });
      assert.equal(await page.evaluate(() => window.fixture.reads.length), 0);
      assert.equal(await panel().count(), 0);
      await page.evaluate(() =>
        document.dispatchEvent(new Event("visibilitychange")),
      );
      await tick();
      assert.equal(await page.evaluate(() => window.fixture.reads.length), 0);
      assert.equal(await panel().count(), 0);
      await focus();
      await panel().waitFor();
      assert.ok(await page.evaluate(() => window.fixture.reads.length > 0));
    },
  );
  await scenario(
    "current-page refresh refuses visible unfocused read admission",
    async () => {
      await mount();
      const before = await page.evaluate(() => window.fixture.reads.length);
      await page.evaluate(() => {
        window.fixture.focused = false;
        window.dispatchEvent(new Event("social-relationships-changed"));
      });
      await tick();
      assert.equal(
        await page.evaluate(() => window.fixture.reads.length),
        before,
      );
    },
  );
  await scenario(
    "held post page cannot publish after focus loss without blur",
    async () => {
      await mount({ readMode: "hold" });
      assert.ok(await page.evaluate(() => window.fixture.reads.length > 0));
      await page.evaluate(() => {
        window.fixture.focused = false;
        window.fixture.pending.splice(0).forEach((release) => release());
      });
      await tick();
      assert.equal(await panel().count(), 0);
      assert.equal(await page.getByRole("link").count(), 0);
      assert.doesNotMatch(
        await page.locator("#root").innerText(),
        /Fictional private|Fictional sibling/,
      );
    },
  );
  assert.equal(results.length, 15);
  assert.deepEqual(errors, []);
  assert.equal(externalRequests, 0);
} catch (error) {
  fatal =
    error?.code === "ERR_ASSERTION"
      ? "ERR_ASSERTION"
      : "CONTROLLED_HARNESS_FAILURE";
  console.error(
    JSON.stringify({
      phase: "controlled-harness",
      code: fatal,
      operator:
        typeof error?.operator === "string"
          ? error.operator.slice(0, 40)
          : null,
    }),
  );
} finally {
  await browser?.close();
  const report = {
    suite: "need-post-client",
    sourceSha,
    executedAt: new Date().toISOString(),
    scopeEvidence:
      "controlled-component-with-blocked-network-and-stub-transport",
    productionWrites: null,
    externalSends: null,
    sourceOverride: false,
    caseFilter: null,
    sourceBindings: Object.values(sources).map((path) => ({
      path,
      sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
    })),
    runtimeModules,
    harnessSha256: createHash("sha256")
      .update(readFileSync(new URL(import.meta.url)))
      .digest("hex"),
    browser: browser?.version() ?? null,
    results,
    errors,
    externalRequests,
    blockedNetworkRequests: externalRequests,
    failure: fatal,
  };
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      suite: report.suite,
      completed: results.length,
      passed: results.filter((r) => r.pass).length,
      errors: errors.length,
      blockedNetworkRequests: externalRequests,
      failure: fatal,
    }),
  );
  if (
    fatal ||
    errors.length ||
    externalRequests ||
    results.length !== 15 ||
    results.some((r) => !r.pass)
  )
    process.exitCode = 1;
}
