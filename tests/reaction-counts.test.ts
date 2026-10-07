import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedReactionCounts, setAuthorCounts } from "./reaction-count-fixture";
import {
  readReactionPreferences,
  saveReactionPreferences
} from "../lib/platform/reaction-preferences";
import {
  getPost,
  getPostAvailabilityBatch,
  getProfilePosts,
  listPosts
} from "../lib/platform/post-reads";
import { getMemberProfile } from "../lib/platform/profiles";
import { readPostLike, postLikeCommand } from "../lib/platform/post-likes";
import { readComments } from "../lib/platform/comment-reads";
import { relationshipCommand } from "../lib/platform/relationships";
import { readPrayerTarget } from "../lib/platform/prayer-reads";
import { prayerCommand } from "../lib/platform/prayer-commands";
import { PRAYER_GUIDE_VERSION } from "../lib/platform/prayer-types";
import { repostCommand } from "../lib/platform/reposts";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
const db = new PrismaClient({ log: [{ level: "query", emit: "event" }] });
let queries = 0;
db.$on("query", () => {
  queries++;
});
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const action = (fields: Record<string, unknown>) => ({
  mutationId: randomUUID(),
  ...fields
});
async function thread(token: unknown, postId: string, extra = {}) {
  const value = await readComments(db, token, { postId, ...extra });
  assert.equal(value.kind, "thread");
  if (value.kind !== "thread") throw Error("Expected thread");
  return value;
}
test("author preference is original-owner versioned, exact-retry safe and preserved by older privacy clients", async () => {
  const f = await seedReactionCounts(db);
  const initial = await readReactionPreferences(db, f.a.token, f.a.id);
  assert.deepEqual(initial, {
    ownerId: f.a.id,
    hideAuthoredReactionCounts: false,
    version: 0,
    recoveryRequired: false
  });
  await assert.rejects(
    readReactionPreferences(db, f.b.token, f.a.id),
    /sign-in changed/
  );
  const body = action({ expectedVersion: 0, hideAuthoredReactionCounts: true });
  await assert.rejects(
    saveReactionPreferences(db, f.b.token, body, f.a.id),
    /sign-in changed/
  );
  const saved = await saveReactionPreferences(db, f.a.token, body, f.a.id);
  assert.deepEqual(
    await saveReactionPreferences(db, f.a.token, body, f.a.id),
    saved
  );
  await assert.rejects(
    saveReactionPreferences(
      db,
      f.a.token,
      { ...body, hideAuthoredReactionCounts: false },
      f.a.id
    ),
    /retry key/
  );
  await assert.rejects(
    saveReactionPreferences(
      db,
      f.a.token,
      action({ expectedVersion: 0, hideAuthoredReactionCounts: false }),
      f.a.id
    )
  );
  await assert.rejects(
    saveReactionPreferences(
      db,
      f.a.token,
      action({ expectedVersion: 1, hideAuthoredReactionCounts: "true" }),
      f.a.id
    )
  );
  const row = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: f.a.id }
  });
  await relationshipCommand(
    db,
    f.a.token,
    action({
      operation: "privacy",
      expectedVersion: row.version,
      mentions: "NOBODY",
      showRelationships: false
    })
  );
  assert.equal(
    (await readReactionPreferences(db, f.a.token, f.a.id))
      .hideAuthoredReactionCounts,
    true
  );
  assert.equal(
    (await readReactionPreferences(db, f.a.token, f.a.id)).version,
    1
  );
});
test("current count policy reaches guest/member detail, feed, profile, pin, availability and Like refresh without leaking private preferences", async () => {
  const f = await seedReactionCounts(db);
  await setAuthorCounts(db, f.a, true);
  await db.socialPreferences.update({
    where: { ownerId: f.a.id },
    data: { profilePinPostId: f.post.id, profilePinVersion: 1 }
  });
  for (const token of [null, f.viewer.token, f.a.token]) {
    assert.equal((await getPost(db, token, f.post.id))?.likeCount, null);
    assert.equal((await getPost(db, token, f.other.id))?.likeCount, 1);
    assert.equal((await getPost(db, token, f.churchPost.id))?.likeCount, 1);
    const feed = await listPosts(db, token, { authorId: f.a.id });
    assert.ok(feed.some((p) => p.id === f.post.id && p.likeCount === null));
    const profile = await getProfilePosts(db, token, f.a.id);
    assert.ok(
      profile.posts.some((p) => p.id === f.post.id && p.likeCount === null)
    );
    const availability = await getPostAvailabilityBatch(db, token, [
      f.post.id,
      f.other.id,
      f.churchPost.id
    ]);
    assert.deepEqual(
      availability.posts.map((p) => p.likeCount),
      [null, 1, 1]
    );
    const payload = JSON.stringify({ feed, profile, availability });
    assert.ok(
      !payload.includes("hideAuthoredReactionCounts") &&
        !payload.includes("reactionCountRecoveryRequired")
    );
  }
  const profile = await getMemberProfile(db, f.viewer.token, f.a.id);
  assert.ok(profile);
  const own = await readPostLike(db, f.viewer.token, f.post.id);
  assert.equal(own.count, null);
  assert.equal(own.liked, true);
  await postLikeCommand(
    db,
    f.viewer.token,
    action({ postId: f.post.id, expectedVersion: own.version, desired: false })
  );
  assert.equal(
    (await readPostLike(db, f.viewer.token, f.post.id)).liked,
    false
  );
  await setAuthorCounts(db, f.a, false);
  assert.equal((await getPost(db, null, f.post.id))?.likeCount, 0);
});
test("comment roots, replies, pinned and linked context follow each speaking identity, independently of the parent", async () => {
  const f = await seedReactionCounts(db);
  await setAuthorCounts(db, f.a, true);
  const roots = await thread(f.viewer.token, f.churchPost.id);
  assert.equal(roots.items.find((c) => c.id === f.comment.id)?.likeCount, null);
  assert.equal(
    roots.items.find((c) => c.id === f.churchComment.id)?.likeCount,
    1
  );
  assert.equal(roots.pinned?.likeCount, null);
  assert.equal(roots.pinned?.liked, true);
  const replies = await thread(f.viewer.token, f.churchPost.id, {
    view: "replies",
    rootId: f.comment.id
  });
  assert.equal(replies.root?.likeCount, null);
  assert.equal(replies.items.find((c) => c.id === f.reply.id)?.likeCount, 1);
  const context = await thread(f.viewer.token, f.churchPost.id, {
    view: "context",
    commentId: f.reply.id
  });
  assert.equal(context.target?.likeCount, 1);
  await setAuthorCounts(db, f.b, true);
  assert.equal(
    (
      await thread(f.viewer.token, f.churchPost.id, {
        view: "context",
        commentId: f.reply.id
      })
    ).target?.likeCount,
    null
  );
  assert.equal((await thread(null, f.churchPost.id)).visibleCount, 3);
});
test("prayer totals redact while own acknowledgement, consented names and private follow-up remain functional", async () => {
  const f = await seedReactionCounts(db);
  await prayerCommand(
    db,
    f.viewer.token,
    action({
      operation: "guide",
      guideVersion: PRAYER_GUIDE_VERSION,
      expectedVersion: 0
    })
  );
  for (const target of [
    { postId: f.post.id },
    { postId: f.churchPost.id, commentId: f.comment.id }
  ]) {
    await prayerCommand(
      db,
      f.viewer.token,
      action({
        ...target,
        operation: "acknowledge",
        expectedVersion: 0,
        desired: true,
        shareName: true,
        guideVersion: PRAYER_GUIDE_VERSION
      })
    );
    assert.equal((await readPrayerTarget(db, f.viewer.token, target)).count, 1);
  }
  await setAuthorCounts(db, f.a, true);
  for (const target of [
    { postId: f.post.id },
    { postId: f.churchPost.id, commentId: f.comment.id }
  ]) {
    const state = await readPrayerTarget(db, f.viewer.token, target);
    assert.equal(state.count, null);
    assert.equal(state.choice.acknowledged, true);
    assert.equal(state.choice.shareName, true);
    assert.equal(state.names[0]?.username, f.viewer.username);
    await prayerCommand(
      db,
      f.viewer.token,
      action({
        ...target,
        operation: "followup",
        expectedVersion: state.choice.version,
        desired: true,
        updates: false
      })
    );
    assert.equal(
      (await readPrayerTarget(db, f.viewer.token, target)).choice.saved,
      true
    );
  }
  assert.equal(
    (await readPrayerTarget(db, f.viewer.token, { postId: f.churchPost.id }))
      .count,
    0
  );
});
test("plain distribution uses original counts while quote commentary and quoted source follow their own authors", async () => {
  const f = await seedReactionCounts(db);
  const plain = await repostCommand(
    db,
    f.b.token,
    action({
      operation: "repost",
      sourceId: f.post.id,
      expectedSourceVersion: f.post.version
    })
  );
  const quote = await db.platformPost.create({
    data: {
      authorId: f.b.id,
      content: "Fictional quote commentary",
      repostKind: "QUOTE",
      repostSourceId: f.post.id,
      publishedAt: new Date()
    }
  });
  await db.platformPostLike.create({
    data: { postId: quote.id, userId: f.viewer.id }
  });
  await setAuthorCounts(db, f.a, true);
  assert.equal((await readPostLike(db, f.viewer.token, plain.id)).count, null);
  assert.equal((await readPostLike(db, f.viewer.token, plain.id)).liked, true);
  let card = await getPost(db, f.viewer.token, quote.id);
  assert.equal(card?.likeCount, 1);
  assert.equal(card?.repost?.source?.likeCount, null);
  await setAuthorCounts(db, f.a, false);
  await setAuthorCounts(db, f.b, true);
  card = await getPost(db, f.viewer.token, quote.id);
  assert.equal(card?.likeCount, null);
  assert.equal(card?.repost?.source?.likeCount, 1);
  assert.equal((await readPostLike(db, f.viewer.token, plain.id)).count, 1);
});
test("hidden totals never bypass current withdrawal or bilateral block checks", async () => {
  const f = await seedReactionCounts(db);
  await setAuthorCounts(db, f.a, true);
  await relationshipCommand(
    db,
    f.viewer.token,
    action({
      operation: "block",
      kind: "person",
      targetId: f.a.id,
      expectedVersion: 0,
      desired: true
    })
  );
  assert.equal(await getPost(db, f.viewer.token, f.post.id), null);
  assert.equal(
    (await getPostAvailabilityBatch(db, f.viewer.token, [f.post.id])).posts[0]
      .available,
    false
  );
  await assert.rejects(readPostLike(db, f.viewer.token, f.post.id));
  await db.platformPost.update({
    where: { id: f.post.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  assert.equal(await getPost(db, null, f.post.id), null);
});
test("mixed-author feed projection stays bounded as its page grows", async () => {
  const f = await seedReactionCounts(db);
  await setAuthorCounts(db, f.a, true);
  await db.platformPost.createMany({
    data: Array.from({ length: 24 }, (_, i) => ({
      authorId: i % 2 ? f.a.id : f.b.id,
      content: `Fictional count page ${i}`,
      publishedAt: new Date(Date.now() - 1)
    }))
  });
  queries = 0;
  await listPosts(db, null, { limit: 1 });
  const one = queries;
  queries = 0;
  const page = await listPosts(db, null, { limit: 30 });
  const thirty = queries;
  assert.ok(page.length >= 24);
  assert.ok(thirty <= one + 2, `${one} versus ${thirty} queries`);
  assert.ok(page.some((p) => p.author.id === f.a.id && p.likeCount === null));
  console.log(`COUNT_PROJECTION_QUERIES one=${one} thirty=${thirty}`);
});
test("private account export includes only the owner's versioned count choice", async () => {
  const f = await seedReactionCounts(db);
  await setAuthorCounts(db, f.a, true);
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!;
  const prepared = await prepareAccountExport(
    db,
    f.a.token,
    f.a.password,
    secret
  );
  const value = JSON.parse(
    await downloadAccountExport(db, f.a.token, prepared.authorization, secret)
  );
  assert.equal(value.socialPreferences.length, 1);
  assert.equal(value.socialPreferences[0].hideAuthoredReactionCounts, true);
  assert.equal(value.socialPreferences[0].reactionCountVersion, 1);
  assert.equal(value.socialPreferences[0].reactionCountRecoveryRequired, false);
});
