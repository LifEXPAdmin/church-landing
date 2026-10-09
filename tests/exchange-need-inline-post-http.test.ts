import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedNeedInlinePost, proveInlinePostManager } from "./seed-need-inline-post";
const db = new PrismaClient(), origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(async () => { await assertPortalTestDatabase(db); assert.equal(process.env.PRIVILEGED_MFA_MODE, "enforce"); });
after(async () => { await db.$disconnect(); });
const request = (path: string, token: string, owner?: string, body?: string, extra: Record<string,string> = {}) => fetch(origin + path, {
  redirect: "manual", method: body === undefined ? "GET" : "POST", headers: {
    cookie: sessionCookieFixtureName() + "=" + token, origin,
    ...(owner ? { "x-expected-account": owner } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }), ...extra
  }, ...(body === undefined ? {} : { body })
});
function privateResponse(r: Response) {
  for (const name of ["cache-control", "cdn-cache-control", "vercel-cdn-cache-control"]) assert.match(r.headers.get(name)!, /no-store/);
}
type Fixture = Awaited<ReturnType<typeof seedNeedInlinePost>>;
async function omitted(f: Fixture, token: string, markers: string[]) {
  for (const rsc of [false, true]) {
    const r = await request(f.page + (rsc ? "?_rsc=inline-post-http" : ""), token, undefined, undefined, rsc ? { RSC: "1", "Next-Url": f.page } : {});
    assert.equal(r.status, 200);
    const html = (await r.text()).replaceAll("\\", "");
    assert.ok(html.includes(f.listing.title), "Positive control: real authorized Need page");
    for (const marker of markers) assert.ok(!html.includes(marker), "Initial HTML/RSC must omit the fictional private marker");
  }
}
const operationCount = (ownerId: string, mutationId: string) => db.socialOperation.count({ where: { ownerId, key: "exchange-need:" + mutationId } });

test("inline own rows stay out of initial HTML/RSC and current account-pinned reader remains uncached", async () => {
  const f = await seedNeedInlinePost(db);
  await omitted(f, f.owner.token, f.contributions.flatMap(r => [r.id, r.note]));
  const r = await request(f.inlineEndpoint, f.owner.token, f.owner.id);
  assert.equal(r.status, 200); privateResponse(r);
  const data = await r.json();
  assert.equal(data.ownerId, f.owner.id); assert.equal(data.listingId, f.listing.id); assert.equal(data.need.id, f.need.id);
  assert.equal(data.need.moreContributions, false);
  assert.deepEqual(new Set(data.need.contributions.map((row: { id: string }) => row.id)), new Set(f.contributions.map(row => row.id)));
  for (const row of f.contributions) assert.equal(data.need.contributions.find((v: { id: string }) => v.id === row.id).note, row.note);
  for (const token of [f.other.token, ""]) {
    const denied = await request(f.inlineEndpoint, token, f.owner.id);
    assert.equal(denied.status, 401); privateResponse(denied);
    const text = await denied.text(); for (const row of f.contributions) assert.ok(!text.includes(row.id) && !text.includes(row.note));
  }
  const mutationId = randomUUID(), row = f.contributions[0], note = "Fictional exact private dispute " + randomUUID();
  const body = JSON.stringify({ operation: "need-dispute", mutationId, id: row.id, expectedVersion: row.version, note });
  const saved = await request("/api/platform/exchange", f.owner.token, f.owner.id, body);
  assert.equal(saved.status, 200); privateResponse(saved);
  const receipt = await saved.json(); assert.equal(receipt.id, row.id); assert.equal(receipt.version, row.version + 1);
  const replay = await request("/api/platform/exchange", f.owner.token, f.owner.id, body);
  assert.equal(replay.status, 200); assert.deepEqual(await replay.json(), receipt);
  const actual = await db.exchangeNeedContribution.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(actual.version, row.version + 1); assert.equal(actual.disputeNote, note); assert.equal(await operationCount(f.owner.id, mutationId), 1);
});

test("post-link current reader omits initial private choices and paginates21 canonical posts in20+1", async () => {
  const f = await seedNeedInlinePost(db);
  await proveInlinePostManager(db, f);
  const firstResponse = await request(f.postsEndpoint, f.manager.token, f.manager.id);
  assert.equal(firstResponse.status, 200); privateResponse(firstResponse);
  const first = await firstResponse.json();
  assert.equal(first.ownerId, f.manager.id); assert.equal(first.postsListingId, f.listing.id); assert.equal(first.postsNeedId, f.need.id);
  assert.equal(first.postsCanLink, true); assert.equal(first.postsNeedVersion, (await db.exchangeNeed.findUniqueOrThrow({ where: { id: f.need.id } })).version);
  assert.equal(first.posts.length, 20); assert.ok(first.next);
  const secondResponse = await request(f.postsEndpoint + "&after=" + encodeURIComponent(first.next), f.manager.token, f.manager.id);
  assert.equal(secondResponse.status, 200); privateResponse(secondResponse);
  const second = await secondResponse.json(); assert.equal(second.posts.length, 1); assert.equal(second.next, null);
  assert.deepEqual([...first.posts, ...second.posts].map((p: { id: string }) => p.id), f.posts.map(p => p.id));
  await omitted(f, f.manager.token, [...f.posts.flatMap(p => [p.id, p.content]), first.next]);
  for (const token of [f.other.token, ""]) {
    const denied = await request(f.postsEndpoint, token, f.manager.id);
    assert.equal(denied.status, 401); privateResponse(denied);
    const text = await denied.text(); for (const p of f.posts) assert.ok(!text.includes(p.id) && !text.includes(p.content));
  }
});

test("post-link write requires bound MFA and owner then exact replay changes one canonical post and Need event", async () => {
  const f = await seedNeedInlinePost(db), post = f.posts[0];
  const need = await db.exchangeNeed.findUniqueOrThrow({ where: { id: f.need.id } });
  const mutationId = randomUUID(), body = JSON.stringify({ operation: "need-link-post", mutationId, needId: need.id,
    expectedVersion: need.version, postId: post.id, postVersion: post.version, linked: true });
  const unproven = await request("/api/platform/exchange", f.manager.token, f.manager.id, body);
  assert.equal(unproven.status, 404); privateResponse(unproven);
  assert.deepEqual(await unproven.json(), { message: "This need is unavailable to your current account or duties." });
  assert.equal(await operationCount(f.manager.id, mutationId), 0);
  await proveInlinePostManager(db, f);
  const wrong = await request("/api/platform/exchange", f.other.token, f.manager.id, body);
  assert.equal(wrong.status, 401); privateResponse(wrong);
  const originDenied = await request("/api/platform/exchange", f.manager.token, f.manager.id, body, { origin: "https://untrusted.example.test" });
  assert.equal(originDenied.status, 403); assert.equal(await operationCount(f.manager.id, mutationId), 0);
  const saved = await request("/api/platform/exchange", f.manager.token, f.manager.id, body);
  assert.equal(saved.status, 200); privateResponse(saved);
  const receipt = await saved.json(); assert.equal(receipt.id, need.id); assert.equal(receipt.version, need.version + 1);
  const replay = await request("/api/platform/exchange", f.manager.token, f.manager.id, body);
  assert.equal(replay.status, 200); assert.deepEqual(await replay.json(), receipt);
  const current = await db.platformPost.findUniqueOrThrow({ where: { id: post.id } });
  assert.equal(current.exchangeNeedId, need.id); assert.equal(current.version, post.version + 1);
  assert.equal((await db.exchangeNeed.findUniqueOrThrow({ where: { id: need.id } })).version, need.version + 1);
  assert.equal(await db.exchangeNeedEvent.count({ where: { needId: need.id, targetId: post.id, action: "LINK_POST" } }), 1);
  assert.equal(await operationCount(f.manager.id, mutationId), 1);
});

test("post-link prior choices confer no authority after current manager duties are revoked", async () => {
  const f = await seedNeedInlinePost(db); await proveInlinePostManager(db, f);
  const before = await request(f.postsEndpoint, f.manager.token, f.manager.id); assert.equal(before.status, 200);
  const current = await before.json(), post = current.posts[0], mutationId = randomUUID();
  await db.churchCapabilityGrant.update({ where: { userId_churchId_capability: { userId: f.manager.id, churchId: f.churchA.id, capability: "MANAGE_EXCHANGE_LISTINGS" } }, data: { revokedAt: new Date(), version: { increment: 1 } } });
  const denied = await request(f.postsEndpoint, f.manager.token, f.manager.id); assert.equal(denied.status, 404); privateResponse(denied);
  assert.deepEqual(await denied.json(), { message: "This need is unavailable to your current account or duties." });
  const body = JSON.stringify({ operation: "need-link-post", mutationId, needId: f.need.id, expectedVersion: current.postsNeedVersion, postId: post.id, postVersion: post.version, linked: true });
  const rejected = await request("/api/platform/exchange", f.manager.token, f.manager.id, body); assert.equal(rejected.status, 404);
  assert.equal(await operationCount(f.manager.id, mutationId), 0);
  const actual = await db.platformPost.findUniqueOrThrow({ where: { id: post.id } }); assert.equal(actual.exchangeNeedId, null); assert.equal(actual.version, post.version);
});
