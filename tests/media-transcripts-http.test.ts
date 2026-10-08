import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import { assertPortalTestDatabase, createPortalActor, type PortalActor } from "./seed-portal";
import { MEDIA_POLICY } from "../lib/platform/media-catalog-options";
const db = new PrismaClient(), origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
let owner: PortalActor, other: PortalActor;
before(async () => { await assertPortalTestDatabase(db); owner = await createPortalActor(db, "transcripthttp"); other = await createPortalActor(db, "transcripthttpother"); });
beforeEach(() => db.platformAuthLimit.deleteMany());
after(() => db.$disconnect());
const fields = (patch: Record<string, unknown> = {}) => ({ title: "Fictional HTTP transcript " + randomUUID(), description: "HTTP fixture", format: "SERMON", presentation: "VIDEO", audience: "MEMBERS", details: { preachedOn: null }, sourceUrl: "https://www.youtube.com/watch?v=abcdefghijk", durationSeconds: 120, transcriptText: "Private fictional transcript", chapters: [{ startSeconds: 0, title: "Opening" }], ...patch });
const reviewed = (f: ReturnType<typeof fields>) => ({ fields: f, acknowledgment: { policy: MEDIA_POLICY, sourceUrl: f.sourceUrl, audience: f.audience, accepted: true }, rights: { basis: "OWN", reviewed: true, publicRecording: true, textRights: true } });
const send = (body: unknown, options: { actor?: PortalActor; expected?: string; source?: string; path?: string; raw?: boolean } = {}) => {
  const actor = options.actor ?? owner;
  return fetch(origin + (options.path ?? "/api/platform/media-catalog"), { method: "POST", headers: { origin: options.source ?? origin, cookie: `${sessionCookieFixtureName(origin)}=${actor.token}`, "x-expected-account": options.expected ?? actor.id, "content-type": "application/json" }, body: options.raw ? String(body) : JSON.stringify(body) });
};
const get = (path: string, actor?: PortalActor, expected?: string) => fetch(origin + path, { headers: { ...(actor ? { cookie: `${sessionCookieFixtureName(origin)}=${actor.token}` } : {}), ...(expected ? { "x-expected-account": expected } : {}) } });
const create = (f = fields()) => ({ operation: "create", mutationId: randomUUID(), ownerChurchId: null, ...reviewed(f) });

test("trusted HTTPS accepts complete multibyte transcripts above 32KiB and preserves exact retry identity", async () => {
  const f = fields({ transcriptText: "界".repeat(60000) }), body = create(f);
  assert.ok(Buffer.byteLength(JSON.stringify(body)) > 32768);
  assert.ok(Buffer.byteLength(JSON.stringify(body)) < 512 * 1024);
  const response = await send(body); assert.equal(response.status, 200, await response.clone().text());
  const saved = await response.json();
  assert.deepEqual(await (await send(body)).json(), saved);
  assert.equal(await db.mediaCatalogItem.count({ where: { ownerId: owner.id, title: f.title } }), 1);
  const editor = await get(`/api/platform/media-catalog?view=editor&id=${saved.id}`, owner, owner.id);
  assert.equal(editor.status, 200);
  assert.equal((await editor.json()).item.transcriptText, f.transcriptText);
  for (const name of ["cache-control", "cdn-cache-control", "vercel-cdn-cache-control"]) assert.match(editor.headers.get(name) ?? "", /no-store/);
  assert.equal((await send({ ...body, fields: { ...f, transcriptText: "Changed retry" } })).status, 409);
});

test("the media-only 512KiB transport limit does not enlarge unrelated domain request limits", async () => {
  const body = create(), before = await db.mediaCatalogItem.count({ where: { ownerId: owner.id } });
  // Valid payload plus insignificant JSON whitespace separates transport rejection from field validation.
  const oversized = JSON.stringify(body) + " ".repeat(512 * 1024);
  const response = await send(oversized, { raw: true });
  assert.ok([400, 413].includes(response.status), `oversized media status ${response.status}`);
  assert.equal(await db.mediaCatalogItem.count({ where: { ownerId: owner.id } }), before);
  const playlist = { operation: "create", mutationId: randomUUID(), ownerChurchId: null, fields: { title: "Unrelated small-limit control " + randomUUID(), description: "Fixture", audience: "PUBLIC" } };
  const larger = await send(JSON.stringify(playlist) + " ".repeat(32768), { path: "/api/platform/media-playlists", raw: true });
  assert.ok([400, 413].includes(larger.status));
  assert.equal(await db.mediaPlaylist.count({ where: { ownerId: owner.id, title: playlist.fields.title } }), 0);
  // The exact same logical unrelated-domain payload remains valid below its existing limit.
  const smaller = await send(playlist, { path: "/api/platform/media-playlists" });
  assert.equal(smaller.status, 200, await smaller.clone().text());
});

test("HTTP transcript writes pin the owner and private text is absent from unauthorized detail and search", async () => {
  const f = fields({ transcriptText: "httpsecret" + randomUUID() }), body = create(f);
  assert.equal((await send(body, { source: "https://unrelated.example" })).status, 403);
  assert.equal((await send(body, { expected: other.id })).status, 401);
  assert.equal((await send(body, { expected: "" })).status, 401);
  const created = await send(body); assert.equal(created.status, 200);
  const r = await created.json();
  const otherEditor = await get(`/api/platform/media-catalog?view=editor&id=${r.id}`, other, other.id);
  assert.equal(otherEditor.status, 404); assert.ok(!(await otherEditor.text()).includes(f.transcriptText));
  const publication = await send({ operation: "publish", mutationId: randomUUID(), itemId: r.id, expectedVersion: r.version, ...reviewed(f) });
  assert.equal(publication.status, 200);
  const denied = await get(`/api/platform/media-catalog?view=detail&id=${r.id}`);
  assert.equal(denied.status, 404); assert.ok(!(await denied.text()).includes(f.transcriptText));
  const search = await get(`/api/platform/media-catalog?q=${encodeURIComponent(f.transcriptText)}`);
  assert.equal(search.status, 200); const result = await search.json(); assert.equal(result.total, 0); assert.deepEqual(result.items, []);
  const allowed = await get(`/api/platform/media-catalog?view=detail&id=${r.id}`, other, other.id);
  assert.equal(allowed.status, 200); assert.equal((await allowed.json()).item.transcriptText, f.transcriptText);
});
