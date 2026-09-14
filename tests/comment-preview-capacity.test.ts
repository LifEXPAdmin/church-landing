import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedParticipation } from "./seed-post-participation";
import { postCommand } from "../lib/platform/post-commands";
import { listPosts } from "../lib/platform/post-reads";
import { withPostRead } from "../lib/platform/post-access";
import {
  commentPreviewIds,
  commentVisibleWhere
} from "../lib/platform/comment-policy";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());

test("dense multi-post previews stay bounded and match current comment visibility before selecting the newest six", async () => {
  const f = await seedParticipation(db);
  const posts: string[] = [];
  for (let i = 0; i < 5; i++) {
    const post = await postCommand(db, f.lee.token, {
      operation: "create",
      requestKey: randomUUID(),
      content: "Dense preview " + i
    });
    posts.push(post.id);
  }
  await db.platformUser.update({
    where: { id: f.morgan.id },
    data: { suspendedAt: new Date() }
  });
  await db.platformUser.update({
    where: { id: f.val.id },
    data: { deactivatedAt: new Date() }
  });
  await db.socialRelationship.create({
    data: { ownerId: f.blake.id, targetUserId: f.lee.id, blocked: true }
  });
  const at = new Date(Date.now() - 60_000);
  for (const postId of posts) {
    await db.platformPostComment.createMany({
      data: Array.from({ length: 1000 }, (_, i) => ({
        id: randomUUID(),
        postId,
        content: i % 7 === 0 ? "" : "Fictional preview " + i,
        authorId: [f.ada.id, f.blake.id, f.morgan.id, f.val.id, f.lee.id][
          i % 5
        ],
        // Church identity remains separate from its publisher's private status.
        authorChurchId: i % 17 === 0 ? f.churchA.id : null,
        createdAt: new Date(at.getTime() + Math.floor(i / 3)),
        deletedAt: i % 7 === 0 ? at : null,
        moderationState:
          i % 11 === 0 ? ("HIDDEN" as const) : ("VISIBLE" as const)
      }))
    });
  }
  const expected = await withPostRead(db, f.lee.token, async (tx, context) => {
    const bounded = await commentPreviewIds(tx, context, posts, 6);
    assert.equal(bounded.length, 30);
    const result = new Map<string, string[]>();
    for (const postId of posts) {
      const canonical = await tx.platformPostComment.findMany({
        where: { AND: [{ postId }, commentVisibleWhere(context)] },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 6,
        select: { id: true }
      });
      result.set(
        postId,
        canonical.map((row) => row.id)
      );
      assert.deepEqual(
        bounded.filter((id) => canonical.some((row) => row.id === id)),
        result.get(postId)
      );
    }
    return result;
  });
  const page = await listPosts(db, f.lee.token, { authorId: f.lee.id });
  for (const postId of posts) {
    const row = page.find((post) => post.id === postId)!;
    assert.deepEqual(
      row.comments.map((c) => c.id),
      expected.get(postId)
    );
    assert.ok(row.commentCount > 6);
  }
  // Later policy changes are re-evaluated; no cross-request preview cache exists.
  await db.socialRelationship.create({
    data: { ownerId: f.lee.id, targetUserId: f.ada.id, blocked: true }
  });
  const afterBlock = await listPosts(db, f.lee.token, { authorId: f.lee.id });
  assert.ok(
    afterBlock.every((post) =>
      post.comments.every((c) => c.author.id !== f.ada.id)
    )
  );
});
