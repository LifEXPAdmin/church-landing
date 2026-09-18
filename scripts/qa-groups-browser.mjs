import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
const fixtureDir = process.argv[2];
assert.ok(fixtureDir, "Pass the existing isolated Exchange preview directory");
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(config.origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.match(config.localOrigin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.localOrigin,
  NEXT_PUBLIC_SITE_URL: config.localOrigin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + fixtureDir + "/sink",
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: "",
  PRIVILEGED_MFA_MODE: "enroll",
  COMMUNITY_REPORTS_ENABLED: "true",
  BLOB_READ_WRITE_TOKEN: "",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  MEDIA_STORAGE_MODE: "local-test",
  RETENTION_TEST_DIR: process.cwd() + "/" + fixtureDir + "/retention",
  MEDIA_TEST_DIR: process.cwd() + "/" + fixtureDir + "/images"
});
const { PrismaClient } = await import("@prisma/client");
const { createPortalActor, assertPortalTestDatabase } =
  await import("../tests/seed-portal.ts");
const db = new PrismaClient();
await assertPortalTestDatabase(db);
const { chromium } = createRequire(
  process.env.PLAYWRIGHT_MODULE ??
    `${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`
)("playwright");
const pub = execFileSync("openssl", [
  "x509",
  "-in",
  config.certificate,
  "-pubkey",
  "-noout"
]);
const der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], {
  input: pub
});
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROMIUM_PATH ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: [
    "--ignore-certificate-errors-spki-list=" +
      createHash("sha256").update(der).digest("base64"),
    "--host-resolver-rules=MAP exchange-fixture.example.test 127.0.0.1",
    "--no-proxy-server"
  ]
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true
});
await context.route("**/*", (route) =>
  new URL(route.request().url()).hostname === "127.0.0.1"
    ? route.continue()
    : route.abort()
);
context.setDefaultTimeout(15000);
const page = await context.newPage(),
  errors = [],
  results = [],
  output = fixtureDir + "/groups-browser-" + Date.now();
mkdirSync(output, { recursive: true });
page.on("pageerror", (e) =>
  errors.push({ path: new URL(page.url()).pathname, message: e.message })
);
page.on("dialog", (dialog) => dialog.accept());
const requests=[];
page.on("request",r=>{const u=new URL(r.url());if(u.pathname.includes("groups")) requests.push({kind:"request",method:r.method(),path:u.pathname,query:u.search,at:Date.now()});});
page.on("requestfailed",r=>{const u=new URL(r.url());requests.push({kind:"failed",path:u.pathname,error:r.failure(),at:Date.now()});});
page.on("response",async r=>{const u=new URL(r.url());if(u.pathname.includes("groups")) {const entry={kind:"response",status:r.status(),path:u.pathname,query:u.search,at:Date.now()};requests.push(entry);if(u.searchParams.has("_rsc"))try{writeFileSync(output+"/rsc-"+Date.now()+".txt",await r.text());}catch{}}});
const ok = (message) => {
  results.push(message);
  console.log("PASS " + message);
};
const go = async (path) => {
  const response = await page.goto(config.origin + path);
  assert.equal(response.status(), 200);
  await page.locator("main").first().waitFor({state:"visible"});
  await page.waitForFunction(()=>document.querySelectorAll("main").length===1);
  return response;
};
const signIn = async (actor) => {
  await context.clearCookies();
  if (actor)
    await context.addCookies([
      {
        name: "church_platform_session",
        value: actor.token,
        url: config.origin,
        secure: true,
        httpOnly: true,
        sameSite: "Lax"
      }
    ]);
};
const bounded = async () =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "No horizontal page overflow"
  );
const waitUntil = async (work) => {
  for (let i = 0; i < 80; i++) {
    if (await work()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Expected saved state was not observed");
};
try {
  const owner=await createPortalActor(db,"groupbrowser"), member=await createPortalActor(db,"groupjoin"), stranger=await createPortalActor(db,"groupoutsider");
  await db.socialPreferences.createMany({data:[owner,member].map(u=>({ownerId:u.id,contactRequests:"EVERYONE"}))});
  const slug="group-browser-"+randomUUID(), marker="Fictional adult group "+randomUUID(), base="/platform/groups/"+slug;
  const form=name=>page.getByRole("form",{name,exact:true});
  const group=()=>db.gatherGroup.findUnique({where:{slug}});
  const membership=async()=>db.gatherGroupMembership.findUnique({where:{groupId_userId:{groupId:(await group()).id,userId:member.id}}});
  writeFileSync(fixtureDir+"/latest-group-actors.json",JSON.stringify({owner,member,stranger,slug,marker}),{mode:0o600});
  await go("/platform/groups/mine");
  await page.locator("main").getByRole("link",{name:"Sign in",exact:true}).click();
  await page.waitForURL(u=>u.pathname==="/platform/login");
  assert.equal(new URL(page.url()).searchParams.get("next"),"/platform/groups/mine");
  ok("Guest group entry keeps its intended sign-in destination without private content");
  await signIn(owner); await go("/platform/groups/new");
  const identity=form("Create group");
  for(const [label,value] of [["Group name",marker],["Group address",slug],["Purpose","A fictional adult music group for isolated browser acceptance."],["Group rules","Respect every member and keep private discussion within this group."],["General area","Fictional town"]]) await identity.getByLabel(new RegExp("^"+label)).fill(value);
  await identity.getByLabel("I have read and accept the current group rules",{exact:true}).check();
  await identity.getByLabel(/I agree that my name and profile identify/).check();
  await identity.getByRole("button",{name:"Create group",exact:true}).click();
  await waitUntil(async()=>!!await group());
  await page.waitForURL(u=>u.pathname===base);
  await page.getByRole("heading",{name:marker,exact:true}).waitFor();await bounded();
  ok("An adult creates a listed approval group with explicit rules and named-leader consent");
  await signIn(null);await go(base);
  assert.ok((await page.locator("main").innerText()).includes(marker));
  assert.ok(!(await page.locator("main").innerText()).includes(member.username));
  assert.equal((await context.request.get(config.origin+"/api/platform/groups?view=members&slug="+slug)).status(),404);
  ok("The public About page shows identity and rules while the member roster remains private");
  await signIn(member);await go(base);
  const join=form("Request membership");
  assert.equal(await join.getByLabel(/Share my name/).isChecked(),false);
  await join.getByLabel("I have read and accept the current group rules",{exact:true}).check();
  await join.getByRole("button",{name:"Request membership",exact:true}).click();
  await waitUntil(async()=>(await membership())?.state==="PENDING");
  await page.getByText("Your membership: pending.",{exact:true}).waitFor();
  assert.equal((await context.request.get(config.origin+"/api/platform/groups?view=discussion&slug="+slug)).status(),404);
  ok("Membership is a deliberate request, private roster sharing starts off, and pending members cannot read discussions");
  await signIn(owner);await go(base+"/manage?state=PENDING");
  const approve=form("Approve membership request");
  await approve.getByLabel(/^Reason/).fill("Reviewed fictional adult request");
  assert.equal(await form("Save group details").getByRole("button",{name:"Save group details",exact:true}).isDisabled(),true);
  await approve.getByRole("button",{name:"Approve membership request",exact:true}).click();
  await waitUntil(async()=>(await membership())?.state==="ACTIVE");
  ok("A current leader approves the request and editing one section protects it from sibling saves");
  await signIn(member);await go(base+"/discussion");
  await page.getByRole("button",{name:"Start a private group discussion",exact:true}).click();
  const composer=form("Publish post");
  await composer.getByLabel(/^Thread type/).selectOption("QUESTION");
  await composer.getByLabel(/^Group category/).selectOption("PLANNING");
  await composer.getByLabel("Post content",{exact:true}).fill("Private fictional question: which rehearsal time works?");
  const button=await composer.getByRole("button").allTextContents();
  writeFileSync(output+"/composer-buttons.json",JSON.stringify(button));
  await composer.getByRole("button",{name:"Post",exact:true}).click();
  await waitUntil(async()=>!!await db.platformPost.findFirst({where:{groupId:(await group()).id,authorId:member.id}}));
  const post=await db.platformPost.findFirstOrThrow({where:{groupId:(await group()).id,authorId:member.id}});
  assert.equal(post.audience,"GROUP");assert.equal(post.groupCategory,"PLANNING");assert.equal(post.groupThreadKind,"QUESTION");
  await go("/platform/posts/"+post.id); await page.getByText("Private fictional question: which rehearsal time works?",{exact:true}).first().waitFor();await bounded();
  await page.screenshot({path:output+"/private-question-phone.png",fullPage:true});
  ok("A member publishes a question into its immutable private group with a category and a phone-width discussion view");
  await signIn(owner); await go("/platform/posts/"+post.id);
  await page.getByRole("button",{name:"Write a comment",exact:true}).click();
  const comment=form("Write a comment");
  await comment.getByLabel("Comment text",{exact:true}).fill("A helpful fictional answer for our rehearsal plan.");
  await comment.getByRole("button",{name:"Reply",exact:true}).click();
  await waitUntil(async()=>!!await db.platformPostComment.findFirst({where:{postId:post.id,authorId:owner.id}}));
  const answer=await db.platformPostComment.findFirstOrThrow({where:{postId:post.id,authorId:owner.id}});
  await signIn(member);await go("/platform/posts/"+post.id);
  const select=form("Select a helpful answer");
  await select.getByLabel(/^Link to the answer comment/).fill(config.origin+"/platform/posts/"+post.id+"?comment="+answer.id);
  await select.getByRole("button",{name:"Select a helpful answer",exact:true}).click();
  await waitUntil(async()=>(await db.platformPost.findUnique({where:{id:post.id}})).selectedAnswerId===answer.id);
  await page.getByRole("heading",{name:"Selected answer",exact:true}).waitFor();
  ok("A canonical comment becomes the question author's selected answer without copying the reply");
  await signIn(owner);await go("/platform/posts/"+post.id);
  const pin=form("Pin group thread");await pin.getByLabel(/^Reason/).fill("Useful fictional planning thread");
  await pin.getByRole("button",{name:"Pin group thread",exact:true}).click();
  await waitUntil(async()=>!!(await db.platformPost.findUnique({where:{id:post.id}})).groupPinnedAt);
  await page.getByRole("button",{name:"Unpin group thread",exact:true}).waitFor();
  await go(base+"/discussion");await page.getByRole("heading",{name:"Pinned threads",exact:true}).waitFor();
  ok("Current group leadership pins the canonical thread and the group discussion page shows it");
  await signIn(stranger);
  const forbidden=await context.request.get(config.origin+"/api/platform/posts/"+post.id);
  assert.ok([403,404].includes(forbidden.status()));
  await go(base+"/discussion");
  assert.ok(!(await page.locator("main").innerText()).includes(post.content));
  ok("A different signed-in adult cannot fetch or render the private group post");
  assert.deepEqual(errors,[]);
  writeFileSync(output+"/receipt.json",JSON.stringify({results,errors,at:new Date().toISOString()}));
  console.log("OUTPUT "+output);
} catch(error) {
  writeFileSync(output+"/requests.json",JSON.stringify(requests));
  writeFileSync(output+"/failure.json",JSON.stringify({message:String(error),url:page.url(),errors}));
  writeFileSync(output+"/failure.html",await page.content());
  writeFileSync(output+"/failure.txt",await page.locator("body").innerText());
  await page.screenshot({path:output+"/failure.png",fullPage:true});
  throw error;
} finally {await browser.close();await db.$disconnect();}
