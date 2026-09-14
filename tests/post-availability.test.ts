import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { seedPortal, assertPortalTestDatabase } from "./seed-portal";
import { getPostAvailabilityBatch } from "../lib/platform/post-reads";
import { handlePostRequest } from "../lib/platform/post-boundary";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());

test("bounded source checks apply current church access and moderation before returning versions or counts", async () => {
  const f = await seedPortal(db);
  const publicPost = await db.platformPost.create({
    data: {
      authorId: f.memberA.id,
      content: "Fictional public body " + randomUUID()
    }
  });
  const privatePost = await db.platformPost.create({
    data: {
      authorId: f.memberA.id,
      content: "Fictional private body " + randomUUID(),
      audience: "CHURCH",
      audienceChurchId: f.churchA.id
    }
  });
  const comment = await db.platformPostComment.create({
    data: {
      authorId: f.coordinator.id,
      postId: privatePost.id,
      content: "Fictional selected comment"
    }
  });
  const ids = [publicPost.id, privatePost.id, "unknown-reference"];
  const member = await getPostAvailabilityBatch(db, f.coordinator.token, ids);
  assert.deepEqual(
    member.posts.map((row) => row.available),
    [true, true, false]
  );
  assert.equal(member.posts[1].commentCount, 1);
  assert.equal(JSON.stringify(member).includes("Fictional"), false);
  for (const token of [undefined, f.memberB.token]) {
    const result = await getPostAvailabilityBatch(db, token, ids);
    assert.deepEqual(result.posts[1], {
      id: privatePost.id,
      available: false,
      entryVersion: null,
      commentCount: null,
      likeCount: null
    });
  }
  await db.platformPostComment.update({
    where: { id: comment.id },
    data: { moderationState: "HIDDEN", version: { increment: 1 } }
  });
  assert.equal(
    (await getPostAvailabilityBatch(db, f.coordinator.token, ids)).posts[1]
      .commentCount,
    0
  );
  await db.platformPost.update({
    where: { id: privatePost.id },
    data: { moderationState: "HIDDEN", version: { increment: 1 } }
  });
  assert.deepEqual(
    (await getPostAvailabilityBatch(db, f.coordinator.token, ids)).posts[1],
    {
      id: privatePost.id,
      available: false,
      entryVersion: null,
      commentCount: null,
      likeCount: null
    }
  );
  await db.platformPost.update({
    where: { id: privatePost.id },
    data: { moderationState: "VISIBLE", version: { increment: 1 } }
  });
  assert.equal(
    (await getPostAvailabilityBatch(db, f.coordinator.token, ids)).posts[1]
      .available,
    true
  );
  assert.equal(
    (await getPostAvailabilityBatch(db, f.memberB.token, ids)).posts[1]
      .available,
    false
  );
  await db.churchConnection.updateMany({
    where: { userId: f.coordinator.id, churchId: f.churchA.id },
    data: { state: "REMOVED" }
  });
  assert.equal(
    (await getPostAvailabilityBatch(db, f.coordinator.token, ids)).posts[1]
      .available,
    false
  );
});

test("batch transport rejects changed accounts, malformed or oversized inputs and discloses no source bodies", async () => {
  const f = await seedPortal(db);
  const request = (ids: string[], owner = f.memberA.id) =>
    handlePostRequest(
      db,
      new Request(
        "http://127.0.0.1/api/platform/posts?" +
          new URLSearchParams([
            ["view", "availability-batch"],
            ...ids.map((id) => ["postId", id])
          ]),
        {
          headers: {
            Cookie: "church_platform_session=" + f.memberA.token,
            "X-Expected-Account": owner
          }
        }
      )
    );
  assert.equal((await request(["missing"], f.memberB.id)).status, 401);
  for (const ids of [[], ["bad reference"], Array(31).fill("missing")])
    assert.equal((await request(ids)).status, 400);
  const response = await request(["missing", "missing"]);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /private.*no-store/);
  assert.deepEqual(await response.json(), {
    posts: [
      {
        id: "missing",
        available: false,
        entryVersion: null,
        commentCount: null,
        likeCount: null
      }
    ]
  });
});

test("thirty references share one policy read and one bounded source query", async () => {
  const client = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
  const queries: string[] = [];
  client.$on("query", (event) => queries.push(event.query));
  try {
    const f = await seedPortal(client);
    const read = async (count: number) => {
      queries.length = 0;
      const result = await getPostAvailabilityBatch(
        client,
        f.memberA.token,
        Array.from({ length: count }, (_, i) => `missing-${i}`)
      );
      assert.equal(result.posts.length, count);
      return queries.filter((query) => !/^(BEGIN|COMMIT|ROLLBACK)/.test(query))
        .length;
    };
    const one = await read(1),
      thirty = await read(30);
    assert.equal(thirty, one);
    assert.ok(thirty < 20);
  } finally {
    await client.$disconnect();
  }
});
