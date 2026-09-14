import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, seedPortal } from "./seed-portal";
import { withAccountRead } from "../lib/platform/account-read";
import { postCommand } from "../lib/platform/post-commands";
import { postLikeCommand } from "../lib/platform/post-likes";
import { commentCommand } from "../lib/platform/comment-commands";
import { PortalError } from "../lib/platform/portal-policy";

const db = new PrismaClient();
let f: Awaited<ReturnType<typeof seedPortal>>;
function latch() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
before(async () => {
  await assertPortalTestDatabase(db);
  f = await seedPortal(db);
});
after(() => db.$disconnect());

async function waitingOnGate(shared: boolean) {
  const queryPart = shared
    ? "pg_advisory_xact_lock_shared"
    : "pg_advisory_xact_lock(";
  for (let i = 0; i < 100; i++) {
    const rows = await db.$queryRaw<Array<{ waiting: bigint }>>`
      SELECT count(*) AS waiting FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid()
        AND wait_event = 'advisory' AND strpos(query, ${queryPart}) > 0`;
    if (Number(rows[0].waiting) > 0) return true;
    await delay(10);
  }
  return false;
}

test("ordinary Likes and new comments complete while an unrelated permission reader remains open", async () => {
  const post = await postCommand(db, f.memberA.token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "Fictional concurrent reading"
  });
  const entered = latch(),
    release = latch();
  const reader = withAccountRead(db, f.contact.token, async () => {
    entered.release();
    await release.promise;
  });
  await entered.promise;
  const actions = Promise.all([
    postLikeCommand(db, f.memberA.token, {
      postId: post.id,
      mutationId: randomUUID(),
      expectedVersion: 0,
      desired: true
    }),
    commentCommand(db, f.memberB.token, {
      operation: "create",
      postId: post.id,
      mutationId: randomUUID(),
      content: "A fictional reply while another reader is open"
    })
  ]);
  let completedDuringRead = false;
  try {
    completedDuringRead = await Promise.race([
      actions.then(() => true),
      delay(2500, false)
    ]);
  } finally {
    release.release();
    await reader;
    await actions;
  }
  assert.equal(
    completedDuringRead,
    true,
    "Ordinary social writes must not queue behind an unrelated shared permission read"
  );
});

test("reciprocal comment writers reach the same barrier without foreign-key deadlock and exact retries preserve one result", async () => {
  const actors = [f.memberA, f.memberB];
  const posts: Array<Awaited<ReturnType<typeof postCommand>>> = [];
  for (const actor of actors)
    posts.push(
      await postCommand(db, actor.token, {
        operation: "create",
        requestKey: randomUUID(),
        content: "Fictional reciprocal discussion"
      })
    );
  const bothEntered = latch(),
    release = latch();
  let entries = 0;
  const concurrent = db.$extends({
    query: {
      platformPostComment: {
        async create({ args, query }) {
          if (++entries === 2) bothEntered.release();
          await release.promise;
          return query(args);
        }
      }
    }
  }) as unknown as PrismaClient;
  const inputs = actors.map((_, i) => ({
    operation: "create",
    postId: posts[1 - i].id,
    mutationId: randomUUID(),
    content: "A fictional reciprocal reply"
  }));
  const actions = Promise.allSettled(
    actors.map((actor, i) => commentCommand(concurrent, actor.token, inputs[i]))
  );
  let simultaneous = false;
  try {
    simultaneous = await Promise.race([
      bothEntered.promise.then(() => true),
      delay(2500, false)
    ]);
  } finally {
    release.release();
  }
  const results = await actions;
  assert.equal(
    simultaneous,
    true,
    "Different acting accounts must enter concurrently"
  );
  for (const [i, result] of results.entries()) {
    assert.equal(result.status, "fulfilled", JSON.stringify(result));
    if (result.status !== "fulfilled") continue;
    const pair = await Promise.all([
      commentCommand(db, actors[i].token, inputs[i]),
      commentCommand(db, actors[i].token, inputs[i])
    ]);
    assert.deepEqual(pair, [result.value, result.value]);
    assert.equal(
      await db.platformPostComment.count({ where: { id: result.value.id } }),
      1
    );
    assert.equal(
      await db.socialEvent.count({
        where: { commentId: result.value.id, kind: "COMMENT_CREATED" }
      }),
      1
    );
  }
  const like = {
    postId: posts[0].id,
    mutationId: randomUUID(),
    expectedVersion: 0,
    desired: true
  };
  const likes = await Promise.all([
    postLikeCommand(db, f.memberB.token, like),
    postLikeCommand(db, f.memberB.token, like)
  ]);
  assert.deepEqual(likes[0], likes[1]);
  assert.equal(
    await db.platformPostLike.count({
      where: { postId: posts[0].id, userId: f.memberB.id, active: true }
    }),
    1
  );
});

test("a permission writer blocks a new comment until its committed block is rechecked, without partial writes", async () => {
  const post = await postCommand(db, f.memberA.token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "Fictional revocation boundary"
  });
  const entered = latch(),
    release = latch();
  const blocker = db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
      entered.release();
      await release.promise;
      await tx.socialRelationship.create({
        data: {
          ownerId: f.memberA.id,
          targetUserId: f.memberB.id,
          blocked: true
        }
      });
    },
    { timeout: 15000 }
  );
  await entered.promise;
  const input = {
    operation: "create",
    postId: post.id,
    mutationId: randomUUID(),
    content: "Must not commit after block"
  };
  const command = commentCommand(db, f.memberB.token, input).then(
    (result) => ({ result, error: null }),
    (error: unknown) => ({ result: null, error })
  );
  let waited = false;
  try {
    waited = await waitingOnGate(true);
  } finally {
    release.release();
    await blocker;
  }
  try {
    const outcome = await command;
    assert.equal(
      waited,
      true,
      "The real command must wait on the shared permission gate"
    );
    assert.ok(
      outcome.error instanceof PortalError && outcome.error.status === 404
    );
    assert.equal(
      await db.platformPostComment.count({ where: { postId: post.id } }),
      0
    );
    assert.equal(
      await db.socialOperation.count({
        where: { ownerId: f.memberB.id, key: "comments:" + input.mutationId }
      }),
      0
    );
  } finally {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
      await tx.socialRelationship.deleteMany({
        where: {
          ownerId: f.memberA.id,
          targetUserId: f.memberB.id,
          blocked: true
        }
      });
    });
  }
});

test("comment deletion retains the exclusive gate until an existing permission reader completes", async () => {
  const post = await postCommand(db, f.memberA.token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "Fictional deletion boundary"
  });
  const comment = await commentCommand(db, f.memberB.token, {
    operation: "create",
    postId: post.id,
    mutationId: randomUUID(),
    content: "A fictional removable reply"
  });
  const entered = latch(),
    release = latch();
  const reader = withAccountRead(db, f.contact.token, async () => {
    entered.release();
    await release.promise;
  });
  await entered.promise;
  const deletion = commentCommand(db, f.memberB.token, {
    operation: "delete",
    postId: post.id,
    commentId: comment.id,
    mutationId: randomUUID(),
    expectedVersion: comment.version
  });
  let waited = false;
  try {
    waited = await waitingOnGate(false);
  } finally {
    release.release();
    await reader;
  }
  await deletion;
  assert.equal(
    waited,
    true,
    "Content removal must retain exclusive permission serialization"
  );
  assert.ok(
    (
      await db.platformPostComment.findUniqueOrThrow({
        where: { id: comment.id }
      })
    ).deletedAt
  );
});
