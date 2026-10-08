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
    !isAbsolute(fixtureRelative)
);
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8"
}).trim();
assert.match(sourceSha, /^[a-f0-9]{40}$/);
const require = createRequire(import.meta.url);
const ts = require(process.env.TYPESCRIPT_MODULE ?? "typescript");
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ??
    `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`
)("playwright");
const sources = {
  context: "lib/platform/exchange-need-form-context.ts",
  forms: "components/platform/exchange-need-forms.tsx",
  "./exchange-need-roles": "components/platform/exchange-need-roles.tsx",
  "./exchange-need-actions": "components/platform/exchange-need-actions.tsx",
  "./exchange-saved-controls":
    "components/platform/exchange-saved-controls.tsx",
  "./use-private-choice-action":
    "components/platform/use-private-choice-action.tsx",
  "./read-visibility": "components/platform/read-visibility.ts",
  "./private-snapshot-guard": "components/platform/private-snapshot-guard.tsx",
  "@/lib/platform/social-client": "lib/platform/social-client.ts",
  "@/lib/platform/exchange-need-options":
    "lib/platform/exchange-need-options.ts",
  "@/lib/platform/exchange-options": "lib/platform/exchange-options.ts"
};
const modules = {
  "next/link": `exports.__esModule = true; exports.default = ({prefetch, children, ...props}) => require("react").createElement("a", props, children);`,
  "next/navigation": `const router = {refresh() {window.fixture.refreshes++; void window.refreshGuard?.();}}; exports.useRouter = () => router;`,
  "./exchange-need-progress": `const refresh = async () => {window.fixture.totals++;}; exports.useNeedProgressRefresh = (owner, needId) => {if(owner !== "owner-a" || needId !== "need-a") throw Error("Wrong progress scope"); return refresh;};`,
  "./use-photo-back-guard": `exports.settlePhotoNavigation = async () => {};`,
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
// Actual leaf components and command/transport owners. The fixture changes the
// same ReadVisibility context as the app guard; it does not prove guard/SSR behavior.
const bundle = `(() => {
  const process={env:{NODE_ENV:"development"}};
  const modules={${Object.entries(modules)
    .map(([n, c]) => `${JSON.stringify(n)}:(module,exports,require)=>{${c}\n}`)
    .join(",\n")}};
  const cache={}; const require=(name)=>{if(cache[name])return cache[name].exports;if(!modules[name])throw Error("Unexpected module "+name);const m=cache[name]={exports:{}};modules[name](m,m.exports,require);return m.exports;};
  const React=require("react"), {flushSync}=require("react-dom");
  const forms=require("forms"),actions=require("./exchange-need-actions"),context=require("context");
  const Visibility=require("./read-visibility").ReadVisibility;
  const Guard=require("./private-snapshot-guard").PrivateSnapshotGuard;
  if(!crypto.subtle)Object.defineProperty(crypto,"subtle",{value:{digest:async(_algorithm,bytes)=>Uint8Array.from(await window.fixtureDigest(Array.from(bytes))).buffer}});
  const hash=async(data)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(data)))),b=>b.toString(16).padStart(2,"0")).join("");
  Object.defineProperty(document,"hasFocus",{value:()=>window.fixture?.focused!==false});

  const root=require("react-dom/client").createRoot(document.getElementById("root"));
  let epoch=0,uuid=0,kind;
  if(!crypto.randomUUID)crypto.randomUUID=()=>"00000000-0000-4000-8000-"+String(++uuid).padStart(12,"0");
  const need={id:"need-a",version:2,consentVersion:1,timeZone:"UTC",contributions:[],canContribute:true,closed:false,canceled:false};
  const slot={id:"slot-a",version:1,action:"DONATE",label:"Fictional private slot",unit:"items",target:10,committed:0,closed:false};
  const row={id:"row-a",version:1,state:"COMMITTED",quantity:3,received:1,returned:0,current:true,own:true,title:"Fictional saved title",note:"Fictional saved note",quoteMinor:null,quoteCurrency:null,shareName:false,disputed:false,disputeNote:"",loanResponsibility:"",loanReturnAt:null,contributor:null,createdAt:"2026-10-01T12:00:00Z",listingId:"need-a"};
  const cases={
    setup:[forms.NeedSetupForm,context.needSetupContext({listingId:"need-a",listingVersion:1,need,canCoordinate:true})],
    slot:[forms.NeedSlotForm,{...context.needSlotContext(need,slot),roles:[]}],
    roles:[forms.NeedSlotForm,context.needSlotContext(need)],
    donation:[forms.NeedClaimForm,context.needClaimContext(need,slot)],
    quote:[forms.NeedClaimForm,context.needClaimContext(need,{...slot,action:"SELL"})],
    organizer:[actions.NeedOrganizerActions,context.needOrganizerContext(need)],
    contribution:[actions.NeedContributionCard,{row}],
    volunteer:[actions.NeedVolunteerReceipt,{needId:"need-a",signup:{id:"signup-a",version:1,name:"Fictional private name",state:"ACTIVE",completedAt:"2026-10-01T12:00:00Z"}}],
    posts:[actions.NeedPostLinks,{...context.needPostContext(need),posts:[{id:"post-a",version:1,excerpt:"Fictional private post excerpt",linked:false}]}]
  };
  function paint(){const [Component,props]=cases[kind];let child=React.createElement(Component,{key:epoch,owner:window.fixture.ownerProp,...props});if(window.fixture.guarded)child=React.createElement(kind==="roles"?require("./exchange-need-roles").ExchangeNeedRoles:Guard,{key:epoch,owner:window.fixture.ownerProp,url:"/api/fixture-private",checksum:window.fixture.checksum,label:"need form",path:"/needs/a"},child);flushSync(()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Visibility.Provider,{value:window.fixture.visible},child))));}
  window.mount=async(value,guarded=false,focused=true,readMode="success")=>{kind=value;epoch++;window.fixture={visible:true,owner:"owner-a",ownerProp:"owner-a",writes:[],mode:"lost",refreshes:0,guard:null,guarded,focused,reads:0,privateData:kind==="roles"?{ownerId:"owner-a",roles:[{id:"role-a",role:"Fictional private role",eventTitle:"Fictional private event",capacity:4,postId:"post-a",startAt:"2026-10-05T12:00:00Z",approvalRequired:false}],next:"private-role-cursor"}:{ownerId:"owner-a",version:1},readMode};window.fixture.checksum=await hash(window.fixture.privateData);paint();};
  window.refreshGuard=async()=>{if(window.fixture.guarded){window.fixture.checksum=await hash(window.fixture.privateData);paint();}};
  window.lifecycle=(event)=>{if(event==="blur")window.fixture.focused=false;if(event==="focus")window.fixture.focused=true;window.dispatchEvent(new Event(event));};
  window.setVisible=(value)=>{window.fixture.visible=value;paint();};
  window.changeOwnerProps=async(owner)=>{window.fixture.owner=owner;window.fixture.ownerProp=owner;window.fixture.privateData.ownerId=owner;window.fixture.checksum=await hash(window.fixture.privateData);paint();};
  window.unmount=()=>flushSync(()=>root.render(null));
  const response=(data,status=200)=>({ok:status>=200&&status<300,status,headers:new Headers(),body:{cancel:async()=>{}},json:async()=>structuredClone(data)});
  window.fetch=async(path,options={})=>{
    const f=window.fixture;
    if(path==="/api/platform/profile?view=identity")return f.owner?response({id:f.owner}):response({message:"Fictional sign-out"},401);
    if(path==="/api/fixture-private") {if(options.cache!=="no-store"||options.headers["X-Expected-Account"]!==f.ownerProp)throw Error("Wrong private read");f.reads++;if(f.readMode==="denied")return response({message:"Fictional denied read"},401);if(f.readMode==="held")return new Promise(resolve=>{window.releaseRead=()=>{f.readMode="success";resolve(response(f.privateData));};});return response(f.privateData);}

    if(options.cache!=="no-store" || options.headers["X-Expected-Account"]!==f.ownerProp || !options.body)throw Error("Wrong pinned command");
    f.writes.push(options.body);const body=JSON.parse(options.body);
    if(f.mode==="lost")throw Error("Fictional private lost-reply message");
    return response({id:body.id??body.signupId??body.slotId??"need-a",version:body.expectedVersion+1,message:"Fictional saved reply"});
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
let externalRequests = 0,
  fatal = null;
const diagnostics = [];
try {
  const context = await browser.newContext();
  await context.route("**/*", (route) => {
    externalRequests++;
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on("pageerror", (e) => {
    errors.push("pageerror");
    diagnostics.push(e.message);
  });
  page.on("console", (m) => {
    if (m.type() === "error") {
      errors.push("console-error");
      diagnostics.push(m.text());
    }
  });
  await page.setContent('<div id="root"></div>');
  await page.exposeFunction("fixtureDigest", (bytes) =>
    Array.from(createHash("sha256").update(Buffer.from(bytes)).digest())
  );
  await page.addScriptTag({ content: bundle });
  const tick = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
    );
  async function scenario(name, fn) {
    const start = errors.length;
    try {
      await fn();
      assert.deepEqual(errors.slice(start), []);
      results.push({ name, pass: true });
    } catch (e) {
      // Preserve the first assertion before optional diagnostic inspection.
      diagnostics.push(String(e.stack ?? e));
      results.push({ name, pass: false, error: "scenario-assertion" });
      try {
        diagnostics.push(await page.locator("#root").innerHTML());
      } catch {}
    } finally {
      try {
        await page.evaluate(() => window.unmount());
        await tick();
      } catch (e) {
        errors.push("cleanup-error");
        diagnostics.push(String(e));
      }
    }
    console.log(JSON.stringify(results.at(-1)));
  }
  for (const [kind, label] of Object.entries({
    setup: "Time zone, for example America/Chicago",
    slot: "Item or help description",
    donation: "Optional private note to the coordinator",
    quote: "Exact scope of this quote",
    organizer: "Public organizer update",
    contribution: "Private dispute note",
    volunteer: "Reason for correcting completed help"
  })) {
    await scenario(
      kind + " removes concealed DOM and retains unsent input",
      async () => {
        await page.evaluate((value) => window.mount(value), kind);
        if (kind === "slot")
          await page.locator("details").evaluate((el) => (el.open = true));
        const field = page.getByRole("textbox", { name: label, exact: true });
        await field.fill("Fictional retained private entry");
        await page.evaluate(() => window.setVisible(false));
        await tick();
        assert.equal(await page.locator("#root").innerHTML(), "");
        assert.equal(
          await page.evaluate(() => window.fixture.guard.dirty),
          true
        );
        await page.evaluate(() => window.setVisible(true));
        if (kind === "slot")
          await page.locator("details").evaluate((el) => (el.open = true));
        assert.equal(
          await field.inputValue(),
          "Fictional retained private entry"
        );
      }
    );
  }
  await scenario(
    "post excerpt and command links leave concealed DOM",
    async () => {
      await page.evaluate(() => window.mount("posts"));
      assert.match(
        await page.locator("#root").innerText(),
        /Fictional private post excerpt/
      );
      await page.evaluate(() => window.setVisible(false));
      assert.equal(await page.locator("#root").innerHTML(), "");
      await page.evaluate(() => window.setVisible(true));
      assert.match(
        await page.locator("#root").innerText(),
        /Fictional private post excerpt/
      );
    }
  );
  await scenario(
    "concealed lost donation reply retains exact request and dirty guard",
    async () => {
      await page.evaluate(() => window.mount("donation"));
      const field = page.getByRole("textbox", {
        name: "Optional private note to the coordinator",
        exact: true
      });
      await field.fill("Fictional original note");
      await page
        .getByRole("button", { name: "Commit this quantity", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Confirm original save", exact: true })
        .waitFor();
      const original = await page.evaluate(() => window.fixture.writes[0]);
      await page.evaluate(() => window.setVisible(false));
      assert.equal(await page.locator("#root").innerHTML(), "");
      assert.equal(
        await page.evaluate(() => window.fixture.guard.saving),
        true
      );
      await page.evaluate(() => {
        window.fixture.mode = "success";
        window.setVisible(true);
      });
      assert.equal(await field.inputValue(), "Fictional original note");
      await page
        .getByRole("button", { name: "Confirm original save", exact: true })
        .click();
      await tick();
      assert.deepEqual(await page.evaluate(() => window.fixture.writes), [
        original,
        original
      ]);
      assert.equal(await page.evaluate(() => window.fixture.refreshes), 1);
      assert.equal(await field.inputValue(), "");
    }
  );
  await scenario(
    "real parent guard waits for focus before revealing a private form",
    async () => {
      await page.evaluate(() => window.mount("donation", true, false));
      await tick();
      assert.equal(await page.getByRole("textbox").count(), 0);
      assert.equal(await page.evaluate(() => window.fixture.reads), 0);
      await page.evaluate(() => window.lifecycle("focus"));
      await page
        .getByRole("textbox", {
          name: "Optional private note to the coordinator",
          exact: true
        })
        .waitFor();
    }
  );
  await scenario(
    "real parent guard keeps drafts concealed through blur and passive notifications",
    async () => {
      await page.evaluate(() => window.mount("donation", true));
      const field = page.getByRole("textbox", {
        name: "Optional private note to the coordinator",
        exact: true
      });
      await field.fill("Fictional guarded draft");
      await page.evaluate(() => window.lifecycle("blur"));
      await tick();
      const reads = await page.evaluate(() => window.fixture.reads);
      for (const event of ["online", "social-relationships-changed"]) {
        await page.evaluate((value) => window.lifecycle(value), event);
        await tick();
      }
      assert.equal(await page.getByRole("textbox").count(), 0);
      assert.equal(
        await page
          .locator("#root")
          .innerHTML()
          .then((x) => x.includes("Fictional guarded draft")),
        false
      );
      assert.equal(await page.evaluate(() => window.fixture.reads), reads);
      assert.equal(await page.evaluate(() => window.fixture.guard.dirty), true);
      await page.evaluate(() => window.lifecycle("focus"));
      await field.waitFor();
      assert.equal(await field.inputValue(), "Fictional guarded draft");
    }
  );
  await scenario(
    "real parent guard conceals a pagehide while retaining the slot editor",
    async () => {
      await page.evaluate(() => window.mount("slot", true));
      await page.locator("details").waitFor();
      await page.locator("details").evaluate((el) => (el.open = true));
      const field = page.getByRole("textbox", {
        name: "Item or help description",
        exact: true
      });
      await field.fill("Fictional retained slot draft");
      await page.evaluate(() => window.lifecycle("pagehide"));
      await tick();
      assert.equal(await page.locator("input").count(), 0);
      await page.evaluate(() =>
        window.lifecycle("social-relationships-changed")
      );
      await tick();
      assert.equal(await page.locator("input").count(), 0);
      await page.evaluate(() => window.lifecycle("pageshow"));
      await page.locator("details").waitFor();
      await page.locator("details").evaluate((el) => (el.open = true));
      assert.equal(await field.inputValue(), "Fictional retained slot draft");
    }
  );
  await scenario(
    "real parent guard retains a lost original command across a changed private snapshot",
    async () => {
      await page.evaluate(() => window.mount("donation", true));
      const field = page.getByRole("textbox", {
        name: "Optional private note to the coordinator",
        exact: true
      });
      await field.fill("Fictional guarded original");
      await page
        .getByRole("button", { name: "Commit this quantity", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Confirm original save", exact: true })
        .waitFor();
      const original = await page.evaluate(() => window.fixture.writes[0]);
      await page.evaluate(() => {
        window.fixture.privateData.version++;
        window.lifecycle("blur");
      });
      await tick();
      await page.evaluate(() => window.lifecycle("online"));
      await tick();
      assert.equal(await page.getByRole("textbox").count(), 0);
      await page.evaluate(() => {
        window.fixture.mode = "success";
        window.lifecycle("focus");
      });
      await page
        .getByRole("button", { name: "Confirm original request", exact: true })
        .click();
      await field.waitFor();
      await tick();
      assert.deepEqual(await page.evaluate(() => window.fixture.writes), [
        original,
        original
      ]);
      assert.equal(await page.evaluate(() => window.fixture.refreshes), 1);
      assert.equal(await field.inputValue(), "");
    }
  );
  const roleField = () =>
    page.getByRole("combobox", { name: "Current event role", exact: true });
  async function openRoles() {
    await page.locator("details").waitFor();
    await page.locator("details").evaluate((el) => (el.open = true));
    await page
      .getByRole("combobox", { name: "Help requested", exact: true })
      .selectOption("VOLUNTEER");
    await roleField().waitFor();
  }
  await scenario(
    "current role adapter exposes no choices or cursor before the existing guard verifies",
    async () => {
      await page.evaluate(() => window.mount("roles", true, true, "held"));
      await tick();
      assert.equal(await page.getByRole("combobox").count(), 0);
      assert.equal(
        (await page.locator("#root").innerHTML()).includes(
          "Fictional private event"
        ),
        false
      );
      assert.equal(
        await page
          .getByRole("link", { name: "More current event roles" })
          .count(),
        0
      );
      await page.evaluate(() => window.releaseRead());
      await openRoles();
      assert.equal(await roleField().locator("option").count(), 2);
      assert.match(
        await roleField().innerText(),
        /Fictional private event: Fictional private role/
      );
      assert.equal(
        await page
          .getByRole("link", { name: "More current event roles" })
          .getAttribute("href"),
        "/needs/a?rolesAfter=private-role-cursor"
      );
    }
  );
  await scenario(
    "changed role choices stay concealed without replacing the selected role or unsent description",
    async () => {
      await page.evaluate(() => window.mount("roles", true));
      await openRoles();
      await roleField().selectOption("role-a");
      const field = page.getByRole("textbox", {
        name: "Item or help description",
        exact: true
      });
      await field.fill("Fictional role draft");
      await page.evaluate(() => {
        window.fixture.privateData.roles[0].role = "Changed role";
        window.lifecycle("social-relationships-changed");
      });
      await tick();
      assert.equal(await page.getByRole("combobox").count(), 0);
      assert.equal(
        await page
          .getByRole("link", { name: "More current event roles" })
          .count(),
        0
      );
      await page.evaluate(() => {
        window.fixture.privateData.roles[0].role = "Fictional private role";
        window.lifecycle("focus");
      });
      await page.locator("details").waitFor();
      await page.locator("details").evaluate((el) => (el.open = true));
      assert.equal(await roleField().inputValue(), "role-a");
      assert.equal(await field.inputValue(), "Fictional role draft");
    }
  );
  await scenario(
    "lost role-slot command keeps exact role and mutation through changed-role recovery",
    async () => {
      await page.evaluate(() => window.mount("roles", true));
      await openRoles();
      await roleField().selectOption("role-a");
      await page
        .getByRole("textbox", { name: "Item or help description", exact: true })
        .fill("Fictional volunteer help");
      await page
        .getByRole("button", { name: "Save action slot", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Confirm original save", exact: true })
        .waitFor();
      const original = await page.evaluate(() => window.fixture.writes[0]);
      assert.equal(JSON.parse(original).fields.volunteerSlotId, "role-a");
      await page.evaluate(() => {
        window.fixture.privateData.next = "new-role-cursor";
        window.lifecycle("social-relationships-changed");
      });
      await page
        .getByRole("button", { name: "Confirm original request", exact: true })
        .waitFor();
      assert.equal(await page.getByRole("combobox").count(), 0);
      await page.evaluate(() => {
        window.fixture.mode = "success";
      });
      await page
        .getByRole("button", { name: "Confirm original request", exact: true })
        .click();
      await page.locator("details").waitFor();
      assert.deepEqual(await page.evaluate(() => window.fixture.writes), [
        original,
        original
      ]);
      assert.equal(await page.evaluate(() => window.fixture.refreshes), 1);
    }
  );
  await scenario(
    "wrong-owner role page fails the complete guard without rendering choices",
    async () => {
      await page.evaluate(() => window.mount("roles", true, true, "held"));
      await tick();
      await page.evaluate(() => {
        window.fixture.privateData.ownerId = "owner-b";
        window.releaseRead();
      });
      await tick();
      assert.equal(await page.getByRole("combobox").count(), 0);
      assert.equal(
        (await page.locator("#root").innerHTML()).includes(
          "Fictional private event"
        ),
        false
      );
    }
  );
  for (const identity of ["owner-b", null])
    await scenario(
      "actual guard clears draft after identity " +
        identity +
        " and does not revive it on return",
      async () => {
        await page.evaluate(() => window.mount("donation", true));
        const field = page.getByRole("textbox", {
          name: "Optional private note to the coordinator",
          exact: true
        });
        await field.fill("Fictional old account draft");
        await page.evaluate((owner) => {
          window.fixture.owner = owner;
          window.lifecycle("focus");
        }, identity);
        await page
          .getByText(
            "Your sign-in changed. Private entries and requests were cleared. Reload for your current account.",
            { exact: true }
          )
          .waitFor();
        assert.equal(await page.getByRole("textbox").count(), 0);
        await page.evaluate(() => {
          window.fixture.owner = "owner-a";
          window.lifecycle("focus");
        });
        await tick();
        assert.equal(await page.getByRole("textbox").count(), 0);
        assert.equal(
          await page
            .getByRole("button", {
              name: "Recheck current access",
              exact: true
            })
            .count(),
          0
        );
        assert.equal(
          await page.evaluate(() => window.fixture.writes.length),
          0
        );
      }
    );
  await scenario(
    "account replacement removes a lost original request without retrying it",
    async () => {
      await page.evaluate(() => window.mount("donation", true));
      await page
        .getByRole("textbox", {
          name: "Optional private note to the coordinator",
          exact: true
        })
        .fill("Fictional lost account original");
      await page
        .getByRole("button", { name: "Commit this quantity", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Confirm original save", exact: true })
        .waitFor();
      await page.evaluate(() => {
        window.fixture.owner = "owner-b";
        window.lifecycle("focus");
      });
      await page
        .getByText(
          "Your sign-in changed. Private entries and requests were cleared. Reload for your current account.",
          { exact: true }
        )
        .waitFor();
      await page.evaluate(() => {
        window.fixture.owner = "owner-a";
        window.fixture.mode = "success";
        window.lifecycle("focus");
      });
      await tick();
      assert.equal(
        await page.getByRole("button", { name: /Confirm original/ }).count(),
        0
      );
      assert.equal(await page.evaluate(() => window.fixture.writes.length), 1);
    }
  );
  await scenario(
    "same-account read denial preserves its draft for explicit current recovery",
    async () => {
      await page.evaluate(() => window.mount("donation", true));
      const field = page.getByRole("textbox", {
        name: "Optional private note to the coordinator",
        exact: true
      });
      await field.fill("Fictional retained same-account draft");
      await page.evaluate(() => {
        window.fixture.readMode = "denied";
        window.lifecycle("social-relationships-changed");
      });
      await page.getByText("Fictional denied read", { exact: true }).waitFor();
      assert.equal(await page.getByRole("textbox").count(), 0);
      await page.evaluate(() => {
        window.fixture.readMode = "success";
      });
      await page
        .getByRole("button", { name: "Recheck current access", exact: true })
        .click();
      await field.waitFor();
      assert.equal(
        await field.inputValue(),
        "Fictional retained same-account draft"
      );
    }
  );
  await scenario(
    "new owner props mount a fresh guard while its first read remains held",
    async () => {
      await page.evaluate(() => window.mount("donation", true));
      const field = page.getByRole("textbox", {
        name: "Optional private note to the coordinator",
        exact: true
      });
      await field.fill("Fictional prior owner entry");
      await page.evaluate(async () => {
        window.fixture.readMode = "held";
        await window.changeOwnerProps("owner-b");
      });
      await tick();
      assert.equal(await page.getByRole("textbox").count(), 0);
      await page.evaluate(() => window.releaseRead());
      await field.waitFor();
      assert.equal(await field.inputValue(), "");
      assert.equal(await page.evaluate(() => window.fixture.writes.length), 0);
    }
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
  suite: "need-form-client",
  sourceSha,
  scopeEvidence: "controlled-component-with-blocked-network-and-stub-transport",
  productionWrites: null,
  externalSends: null,
  visibility: "controlled-ReadVisibility-context-not-native-focus",
  lifecycleEvidence: "controlled-document-focus-events-not-native-focus",
  complete:
    !fatal &&
    results.length === 22 &&
    results.every((r) => r.pass) &&
    errors.length === 0 &&
    externalRequests === 0,
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
writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
  flag: "wx",
  mode: 0o600
});
if (diagnostics.length)
  writeFileSync(
    join(outputParent, "private-diagnostics.json"),
    JSON.stringify(diagnostics, null, 2) + "\n",
    { flag: "wx", mode: 0o600 }
  );
console.log(
  JSON.stringify({
    suite: report.suite,
    groups: results.length,
    complete: report.complete
  })
);
if (!report.complete) process.exitCode = 1;
