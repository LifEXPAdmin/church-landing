import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { createPortalActor, assertPortalTestDatabase } from "./seed-portal";
import { readActivity, activityCommand } from "../lib/platform/activity";
const db = new PrismaClient({ log: [{ level: "query", emit: "event" }] });
let recording = false;
let queries: Array<{ query: string; params: string }> = [];
db.$on("query", (e) => {
  if (
    recording &&
    /^SELECT\b/.test(e.query.trimStart()) &&
    !e.query.includes("pg_advisory")
  )
    queries.push({ query: e.query, params: e.params });
});
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());

test("twenty thousand owned intents keep activity page and query counts bounded without per-item source reads", async () => {
  const owner = await createPortalActor(db, "activityvolume"),
    author = await createPortalActor(db, "activityvolumeactor");
  const postIds = Array.from({ length: 500 }, () => randomUUID());
  await db.platformPost.createMany({
    data: postIds.map((id) => ({
      id,
      authorId: owner.id,
      content: "Isolated activity query fixture"
    }))
  });
  const add = async (start: number, end: number) => {
    const comments = Array.from({ length: end - start }, (_, offset) => ({
      id: randomUUID(),
      postId: postIds[Math.floor((start + offset) / 40)],
      authorId: author.id,
      content: "Isolated bounded-read comment"
    }));
    await db.platformPostComment.createMany({ data: comments });
    await db.socialEvent.createMany({
      data: comments.map((c) => ({
        key: randomUUID(),
        kind: "COMMENT_ACTIVITY",
        actorId: author.id,
        recipientId: owner.id,
        postId: c.postId,
        commentId: c.id
      }))
    });
  };
  const measure = async () => {
    queries = [];
    recording = true;
    const start = performance.now();
    try {
      const page = await readActivity(db, owner.token);
      return { page, ms: performance.now() - start, queries };
    } finally {
      recording = false;
    }
  };
  await add(0, 1);
  const one = await measure();
  assert.equal(one.page.unread, 1);
  for (let start = 1; start < 20000; start += 500)
    await add(start, Math.min(start + 500, 20000));
  const page = await measure();
  assert.equal(page.page.items.length, 20);
  assert.equal(page.page.unread, 20000);
  assert.ok(page.page.items.every((i) => i.count === 40 && i.unread === 40));
  assert.equal(page.queries.length, one.queries.length);
  const times = [page.ms];
  for (let i = 0; i < 4; i++) {
    const r = await measure();
    assert.equal(r.page.unread, 20000);
    times.push(r.ms);
  }
  const plans = [];
  for (const q of page.queries.filter(
    (q) => q.query.includes("FROM (") && q.query.includes('"SocialEvent"')
  )) {
    const params = JSON.parse(q.params).map((v: unknown) =>
      typeof v === "string" && /^[0-9]+$/.test(v) ? BigInt(v) : v
    );
    plans.push(
      await db.$queryRawUnsafe(
        "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + q.query,
        ...params
      )
    );
  }
  assert.equal(plans.length, 2);
  await activityCommand(db, owner.token, {
    operation: "read-all",
    mutationId: randomUUID(),
    ownerId: owner.id,
    boundary: page.page.boundary
  });
  const read = await measure();
  assert.equal(read.page.unread, 0);
  assert.equal(read.page.items.length, 20);
  assert.equal(
    await db.socialEvent.count({ where: { recipientId: owner.id } }),
    20000
  );
  const receipt = {
    checkedAt: new Date().toISOString(),
    intents: 20000,
    sourcePosts: 500,
    pageSize: 20,
    dataQueries: {
      one: one.queries.length,
      twentyThousand: page.queries.length
    },
    pageMilliseconds: times.map((t) => Math.round(t * 10) / 10),
    allReadMilliseconds: Math.round(read.ms * 10) / 10,
    writes: "isolated fixtures only",
    productionLatencyClaim: false
  };
  writeFileSync(
    join(
      process.env.ACCOUNT_TEST_SINK_DIR!,
      "activity-query-bound-" + owner.id + ".json"
    ),
    JSON.stringify({ receipt, plans }, null, 2),
    { mode: 0o600 }
  );
  console.log(JSON.stringify(receipt));
});
