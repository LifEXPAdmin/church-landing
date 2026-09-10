import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  seedPortal,
  type PortalFixture
} from "./seed-portal";

const db = new PrismaClient();
const origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
let fixture: PortalFixture;
let postId: string;
const marker = "Public entrance fixture " + randomBytes(6).toString("hex");
const historicalEmail =
  "historical-" + randomBytes(6).toString("hex") + "@example.test";
before(async () => {
  await assertPortalTestDatabase(db);
  fixture = await seedPortal(db);
  postId = (
    await db.platformPost.create({
      data: { authorId: fixture.memberA.id, content: marker, type: "TESTIMONY" }
    })
  ).id;
  await db.waitlistSignup.create({
    data: {
      name: "Historical fixture",
      email: historicalEmail,
      role: "CHURCH",
      source: "original-consent-fixture",
      message: "Preserve original context"
    }
  });
  await db.waitlistEvent.create({
    data: { eventType: "JOIN_SUCCESS", path: "/join" }
  });
});
after(() => db.$disconnect());

const cookie = () => "church_platform_session=" + fixture.memberA.token;
const get = (path: string, signedIn = false, rsc = false) =>
  fetch(origin + path, {
    redirect: "manual",
    headers: {
      ...(signedIn ? { Cookie: cookie() } : {}),
      ...(rsc ? { RSC: "1" } : {})
    }
  });
async function fingerprint() {
  const rows = await db.$queryRaw<Array<{ state: unknown }>>`
    SELECT jsonb_build_object(
      'waitlist', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "WaitlistSignup" t),
      'events', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "WaitlistEvent" t),
      'users', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "PlatformUser" t),
      'sessions', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "PlatformSession" t),
      'connections', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "ChurchConnection" t),
      'grants', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "ChurchCapabilityGrant" t)
    ) AS state`;
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}
function noPrivateData(body: string) {
  for (const value of [
    fixture.memberA.email,
    fixture.memberA.token,
    fixture.memberB.email,
    fixture.memberB.token,
    fixture.sharing.contactEmail,
    fixture.sharing.phone,
    historicalEmail
  ]) {
    assert.ok(
      !body.includes(value),
      "No private account, directory, or waitlist value in response"
    );
  }
}

test("root reaches existing Home in one redirect for visitors and members, without changing records", async () => {
  const beforeState = await fingerprint();
  for (const signedIn of [false, true]) {
    const root = await get("/", signedIn);
    assert.equal(root.status, 307);
    assert.equal(root.headers.get("location"), "/platform");
    assert.equal(root.headers.get("set-cookie"), null);
    const home = await get(root.headers.get("location")!, signedIn);
    assert.equal(home.status, 200);
    assert.equal(home.headers.get("location"), null);
    const body = await home.text();
    assert.ok(body.includes(marker));
    assert.ok(
      body.includes(
        signedIn
          ? "Public posts from everyone, newest first."
          : "Take a look around."
      )
    );
    assert.ok(!body.includes("Join Waitlist"));
    noPrivateData(body);
  }
  const head = await fetch(origin + "/", {
    method: "HEAD",
    redirect: "manual"
  });
  assert.equal(head.status, 307);
  assert.equal(head.headers.get("location"), "/platform");
  assert.equal(await fingerprint(), beforeState);
});

test("legacy links have deliberate GET behavior and reject stale form/analytics submissions without writes", async () => {
  const beforeState = await fingerprint();
  for (const path of [
    "/join",
    "/join?role=CHURCH&source=header&next=https%3A%2F%2Fevil.example"
  ]) {
    const response = await get(path);
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "/platform/signup");
    assert.equal(response.headers.get("set-cookie"), null);
  }
  const thanks = await get("/thanks?role=CHURCH");
  assert.equal(thanks.status, 307);
  assert.equal(thanks.headers.get("location"), "/platform");
  for (const email of [historicalEmail, "new-waitlist@example.test"]) {
    for (const action of [false, true]) {
      const response = await fetch(origin + "/join?role=CHURCH", {
        method: "POST",
        redirect: "manual",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          ...(action ? { "Next-Action": "retired-waitlist-action" } : {})
        },
        body: new URLSearchParams({
          email,
          name: "Attempted overwrite",
          role: "CHURCH",
          source: "replacement",
          company: "",
          message: "Do not store this"
        })
      });
      assert.equal(response.status, 410);
      assert.equal((await response.json()).success, false);
      assert.equal(response.headers.get("location"), null);
      assert.equal(response.headers.get("set-cookie"), null);
    }
  }
  const multipart = new FormData();
  multipart.set("$ACTION_ID_retired", "");
  multipart.set("email", "multipart@example.test");
  const stale = await fetch(origin + "/join", {
    method: "POST",
    body: multipart,
    redirect: "manual"
  });
  assert.equal(stale.status, 410);
  for (const path of ["/", "/thanks"]) {
    const response = await fetch(origin + path, {
      method: "POST",
      body: "email=ignored",
      redirect: "manual"
    });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("location"), null);
  }
  for (const path of ["/", "/join", "/platform/help/cases/private-reference"]) {
    const response = await fetch(origin + "/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType: "JOIN_SUCCESS", path, role: "CHURCH" })
    });
    assert.equal(response.status, 410);
    assert.equal((await response.json()).ok, false);
  }
  assert.equal(
    await db.platformUser.count({ where: { email: historicalEmail } }),
    0
  );
  assert.equal(
    await fingerprint(),
    beforeState,
    "Accounts, sessions, waitlist consent and church authority stay unchanged"
  );
});

test("public information has canonical metadata, useful account links and no active waitlist funnel", async () => {
  const beforeState = await fingerprint();
  const paths = [
    "/about",
    "/help",
    "/manifesto",
    "/for-users",
    "/for-churches",
    "/for-creators",
    "/for-businesses",
    "/privacy",
    "/terms"
  ];
  for (const path of paths) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    const body = await response.text();
    assert.match(body, /<title>[^<]+\| Godschurches<\/title>/);
    assert.ok(
      body.includes('rel="canonical" href="' + origin + path + '"'),
      path + " canonical"
    );
    assert.ok(
      body.includes('property="og:url" content="' + origin + path + '"'),
      path + " share URL"
    );
    assert.ok(body.includes('href="/platform/login"'));
    assert.ok(body.includes('href="/help"'));
    assert.doesNotMatch(body, /href="\/join(?:[?"])/);
    assert.doesNotMatch(
      body,
      /Join (?:the |this |Founding )?Waitlist|coming soon|early access invitations/i
    );
    noPrivateData(body);
  }
  for (const path of ["/about", "/help"]) {
    const body = await (await get(path, true, true)).text();
    noPrivateData(body);
  }
  const sitemap = await (await get("/sitemap.xml")).text();
  for (const path of paths) assert.ok(sitemap.includes(origin + path));
  assert.ok(!sitemap.includes(origin + "/platform"));
  assert.ok(!sitemap.includes(origin + "/join"));
  assert.ok(!sitemap.includes(origin + "/thanks"));
  assert.ok(!sitemap.includes("<loc>" + origin + "</loc>"));
  assert.equal(await fingerprint(), beforeState);
});

test("existing account and selected-post/profile links stay stable and private projections stay protected", async () => {
  const beforeState = await fingerprint();
  for (const path of [
    "/platform/login?notice=password-changed",
    "/platform/signup",
    "/platform/account/recover",
    "/platform?post=" + postId + "&mode=pages",
    "/platform/profile/" + fixture.memberA.username
  ]) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
    noPrivateData(await response.text());
  }
  const selected = await (
    await get("/platform?post=" + postId + "&mode=pages", true)
  ).text();
  assert.ok(selected.includes(marker));
  assert.ok(selected.includes(postId));
  for (const church of [fixture.churchA, fixture.churchB]) {
    const response = await get(
      "/platform/churches/" + church.id + "/directory"
    );
    assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
    noPrivateData(await response.text());
  }
  assert.equal(await fingerprint(), beforeState);
});
