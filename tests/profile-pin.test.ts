import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedPortal
} from "./seed-portal";
import { readProfilePin, saveProfilePin } from "../lib/platform/profile-pin";
import { getMemberProfile } from "../lib/platform/profiles";
import { PortalError } from "../lib/platform/portal-policy";
import { listPosts } from "../lib/platform/post-reads";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const makePost = (authorId: string, extra = {}) =>
  db.platformPost.create({
    data: {
      authorId,
      content: "Fictional profile pin " + randomUUID(),
      publishedAt: new Date(Date.now() - 1000),
      ...extra
    }
  });
const choice = (postId: string, version = 0, desired = true) => ({
  postId,
  expectedVersion: version,
  desired,
  mutationId: randomUUID()
});
const denied = (result: Promise<unknown>, status: number) =>
  assert.rejects(
    result,
    (e: unknown) => e instanceof PortalError && e.status === status
  );

test("pin, replace and unpin reuse the canonical post without changing introduction, engagement or feed order", async () => {
  const a = await createPortalActor(db, "pinowner"),
    b = await createPortalActor(db, "pinvisitor");
  const p = await makePost(a.id),
    newer = await makePost(a.id, { publishedAt: new Date(Date.now() - 500) });
  await db.profilePresentation.create({
    data: { userId: a.id, introduction: "Keep this introduction" }
  });
  await db.socialPreferences.create({
    data: {
      ownerId: a.id,
      feedMode: "friends",
      feedVersion: 4,
      mentions: "NOBODY",
      version: 9
    }
  });
  await db.platformPostLike.create({ data: { postId: p.id, userId: b.id } });
  await db.platformPostComment.create({
    data: { postId: p.id, authorId: b.id, content: "Fictional original reply" }
  });
  const request = choice(p.id),
    first = await saveProfilePin(db, a.token, request);
  assert.deepEqual(await saveProfilePin(db, a.token, request), first);
  let page = await getMemberProfile(db, b.token, a.username);
  assert.equal(page.pinnedPost?.id, p.id);
  assert.equal(page.pinnedPost?.likeCount, 1);
  assert.equal(page.pinnedPost?.commentCount, 1);
  assert.deepEqual(
    page.posts.map((p) => p.id),
    [newer.id]
  );
  assert.deepEqual(
    await db.platformPost.findUnique({ where: { id: p.id } }),
    p
  );
  assert.equal(page.presentation.introduction, "Keep this introduction");
  assert.equal(JSON.stringify(page).includes('"profilePinPostId"'), false);
  assert.deepEqual(
    (await listPosts(db, b.token, { authorId: a.id })).map((p) => p.id),
    [newer.id, p.id]
  );
  const pref = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: a.id }
  });
  assert.equal(pref.feedMode, "friends");
  assert.equal(pref.feedVersion, 4);
  assert.equal(pref.version, 9);
  assert.equal(pref.mentions, "NOBODY");
  assert.equal((await readProfilePin(db, a.token, newer.id)).replaces, true);
  await saveProfilePin(db, a.token, choice(newer.id, 1));
  page = await getMemberProfile(db, b.token, a.username);
  assert.equal(page.pinnedPost?.id, newer.id);
  assert.deepEqual(
    page.posts.map((p) => p.id),
    [p.id]
  );
  await saveProfilePin(db, a.token, choice(newer.id, 2, false));
  page = await getMemberProfile(db, b.token, a.username);
  assert.equal(page.pinnedPost, null);
  assert.deepEqual(
    page.posts.map((p) => p.id),
    [newer.id, p.id]
  );
  assert.equal(
    await db.socialOperation.count({
      where: { ownerId: a.id, key: { startsWith: "profile-pin:" } }
    }),
    3
  );
});

test("a pin older than the first page appears once and does not skip chronological posts", async () => {
  const a = await createPortalActor(db, "pinpages"),
    b = await createPortalActor(db, "pinreader");
  const rows = await Promise.all(
    Array.from({ length: 66 }, (_, i) =>
      makePost(a.id, { publishedAt: new Date(Date.now() - (i + 1) * 1000) })
    )
  );
  const pinned = rows.at(-1)!;
  await saveProfilePin(db, a.token, choice(pinned.id));
  const seen: string[] = [],
    query: { before?: Date; cursor?: string } = {};
  for (let i = 0; i < 3; i++) {
    const page = await getMemberProfile(db, b.token, a.username, query);
    assert.equal(page.pinnedPost?.id ?? null, i === 0 ? pinned.id : null);
    if (page.pinnedPost) seen.push(page.pinnedPost.id);
    const items = page.posts.slice(0, 30);
    seen.push(...items.map((p) => p.id));
    const last = items.at(-1)!;
    query.before = last.createdAt;
    query.cursor = last.id;
  }
  assert.equal(seen.length, 66);
  assert.equal(new Set(seen).size, 66);
  assert.deepEqual([...seen].sort(), rows.map((p) => p.id).sort());
});

test("current ownership, published audience and replay authority gate all pin changes", async () => {
  const f = await seedPortal(db),
    a = f.memberA,
    b = f.memberB;
  const p = await makePost(a.id),
    church = await makePost(a.id, {
      authorChurchId: f.churchA.id,
      audienceChurchId: f.churchA.id
    });
  await denied(readProfilePin(db, "", p.id), 401);
  await denied(readProfilePin(db, b.token, p.id), 404);
  await denied(saveProfilePin(db, b.token, choice(p.id)), 404);
  await denied(saveProfilePin(db, a.token, choice(church.id)), 404);
  for (const data of [
    { status: "DRAFT" },
    { publishedAt: new Date(Date.now() + 60000) },
    { moderationState: "HIDDEN" },
    { withdrawnAt: new Date() }
  ]) {
    const unavailable = await makePost(a.id, data);
    await denied(saveProfilePin(db, a.token, choice(unavailable.id)), 404);
  }
  const input = choice(p.id);
  await saveProfilePin(db, a.token, input);
  await denied(saveProfilePin(db, a.token, { ...input, desired: false }), 409);
  await db.platformPost.update({
    where: { id: p.id },
    data: { moderationState: "HIDDEN" }
  });
  await denied(saveProfilePin(db, a.token, input), 404);
  assert.equal(
    (await getMemberProfile(db, a.token, a.username)).pinnedPost,
    null
  );
  assert.equal((await readProfilePin(db, a.token, p.id)).canPin, false);
  await saveProfilePin(db, a.token, choice(p.id, 1, false));
  assert.equal((await readProfilePin(db, a.token, p.id)).pinned, false);
});

test("current membership, generic member preview and blocks never disclose an ineligible pin", async () => {
  const f = await seedPortal(db),
    a = f.memberA,
    b = f.memberB;
  const p = await makePost(a.id, {
    audience: "CHURCH",
    audienceChurchId: f.churchA.id,
    content: "Fictional private pin marker"
  });
  await saveProfilePin(db, a.token, choice(p.id));
  assert.equal(
    (await getMemberProfile(db, a.token, a.username)).pinnedPost?.id,
    p.id
  );
  const outsider = await getMemberProfile(db, b.token, a.username);
  assert.equal(outsider.pinnedPost, null);
  assert.ok(!JSON.stringify(outsider).includes(p.id));
  const preview = await getMemberProfile(db, a.token, a.username, {
    preview: "member"
  });
  assert.equal(preview.pinnedPost, null);
  assert.ok(!JSON.stringify(preview).includes(p.content));
  await db.churchConnection.updateMany({
    where: { userId: a.id },
    data: { state: "WITHDRAWN" }
  });
  assert.equal(
    (await getMemberProfile(db, a.token, a.username)).pinnedPost,
    null
  );
  await db.socialRelationship.create({
    data: { ownerId: b.id, targetUserId: a.id, blocked: true }
  });
  await denied(getMemberProfile(db, b.token, a.username), 404);
});

test("concurrent pin replacements serialize per owner, stale unpin is harmless and deleting a pin clears its reference", async () => {
  const a = await createPortalActor(db, "pinconflict");
  const p = await makePost(a.id),
    q = await makePost(a.id);
  const results = await Promise.allSettled([
    saveProfilePin(db, a.token, choice(p.id)),
    saveProfilePin(db, a.token, choice(q.id))
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(
    results.some(
      (r) =>
        r.status === "rejected" &&
        r.reason instanceof PortalError &&
        r.reason.status === 409
    )
  );
  const pref = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: a.id }
  });
  const winner = pref.profilePinPostId!,
    other = winner === p.id ? q.id : p.id;
  await denied(saveProfilePin(db, a.token, choice(other, 1, false)), 409);
  await db.platformPost.delete({ where: { id: winner } });
  assert.equal(
    (await db.socialPreferences.findUniqueOrThrow({ where: { ownerId: a.id } }))
      .profilePinPostId,
    null
  );
  await saveProfilePin(db, a.token, choice(other, 1));
  await db.platformSession.deleteMany({ where: { userId: a.id } });
  await assert.rejects(saveProfilePin(db, a.token, choice(other, 2, false)));
});

test("a personally owned repost uses the existing source permission and canonical interaction target", async () => {
  const a = await createPortalActor(db, "pinreposter"),
    b = await createPortalActor(db, "pinsource"),
    c = await createPortalActor(db, "pinobserver");
  const source = await makePost(b.id, { allowReposts: true });
  const repost = await makePost(a.id, {
    repostKind: "PLAIN",
    repostSourceId: source.id,
    content: ""
  });
  await saveProfilePin(db, a.token, choice(repost.id));
  const page = await getMemberProfile(db, c.token, a.username);
  assert.equal(page.pinnedPost?.id, repost.id);
  assert.equal(page.pinnedPost?.repost?.source?.id, source.id);
  await db.platformPost.update({
    where: { id: source.id },
    data: { allowReposts: false }
  });
  assert.equal(
    (await getMemberProfile(db, c.token, a.username)).pinnedPost,
    null
  );
  await denied(saveProfilePin(db, a.token, choice(repost.id, 1)), 404);
});

test("account export includes only the owner's profile pin choice", async () => {
  const a = await createPortalActor(db, "pinexport"),
    b = await createPortalActor(db, "pinexportother");
  const p = await makePost(a.id),
    other = await makePost(b.id);
  await saveProfilePin(db, a.token, choice(p.id));
  await saveProfilePin(db, b.token, choice(other.id));
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!;
  const proof = await prepareAccountExport(db, a.token, a.password, secret);
  const text = await downloadAccountExport(
    db,
    a.token,
    proof.authorization,
    secret
  );
  assert.ok(text.includes('"profilePinPostId"'));
  assert.ok(text.includes(p.id));
  assert.ok(!text.includes(other.id));
});
