import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedParticipation } from "./seed-post-participation";
import { postCommand } from "../lib/platform/post-commands";
import { listPosts } from "../lib/platform/post-reads";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
test("frozen feed excludes new arrivals, has stable timestamp ties and disjoint older batches", async () => {
  const f = await seedParticipation(db);
  const ids: string[] = [];
  for (let i = 0; i < 34; i++) {
    const post = await postCommand(db, f.lee.token, {
      operation: "create",
      requestKey: randomUUID(),
      content: "Reader record " + i
    });
    ids.push(post.id);
  }
  const at = new Date(Date.now() - 1000);
  await db.platformPost.updateMany({
    where: { id: { in: ids } },
    data: { publishedAt: at }
  });
  const initial = await listPosts(db, f.lee.token, { feed: true });
  const fixed = {
    feed: true,
    through: initial[0].createdAt,
    anchor: initial[0].id
  };
  const added = await postCommand(db, f.lee.token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "Arrived after opening the reader"
  });
  const frozen = await listPosts(db, f.lee.token, fixed);
  assert.deepEqual(
    frozen.map((p) => p.id),
    initial.map((p) => p.id)
  );
  assert.ok(!frozen.some((p) => p.id === added.id));
  assert.equal(
    (await listPosts(db, f.lee.token, { feed: true }))[0].id,
    added.id
  );
  const last = frozen[29];
  const older = await listPosts(db, f.lee.token, {
    ...fixed,
    before: last.createdAt,
    cursor: last.id
  });
  assert.ok(older.length > 0);
  assert.ok(
    !older.some((p) => frozen.slice(0, 30).some((first) => first.id === p.id))
  );
  assert.deepEqual(
    [...frozen.slice(0, 30), ...older]
      .filter((p) => ids.includes(p.id))
      .map((p) => p.id),
    ids.sort().reverse()
  );
});
test("a frozen reader still enforces withdrawal, changed audience and revoked membership on every refresh", async () => {
  const f = await seedParticipation(db);
  const personal = await postCommand(db, f.lee.token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "Reader personal note"
  });
  const shared = await postCommand(db, f.ada.token, {
    operation: "create",
    requestKey: randomUUID(),
    authorChurchId: f.churchA.id,
    audience: "PUBLIC",
    content: "Reader public church notice"
  });
  const initial = await listPosts(db, f.lee.token, { feed: true });
  const fixed = {
    feed: true,
    through: initial[0].createdAt,
    anchor: initial[0].id
  };
  assert.ok(initial.some((p) => p.id === f.post.id));
  await postCommand(db, f.ada.token, {
    operation: "edit",
    postId: shared.id,
    expectedVersion: 1,
    audience: "CHURCH",
    confirmAudienceChange: true
  });
  const guest = await listPosts(db, "", fixed);
  assert.ok(!guest.some((p) => p.id === shared.id || p.id === f.post.id));
  await postCommand(db, f.lee.token, {
    operation: "withdraw",
    postId: personal.id,
    expectedVersion: 1,
    confirmed: true
  });
  assert.ok(
    !(await listPosts(db, f.lee.token, fixed)).some((p) => p.id === personal.id)
  );
  await db.churchConnection.updateMany({
    where: { churchId: f.churchA.id, userId: f.lee.id },
    data: { state: "WITHDRAWN" }
  });
  const revoked = await listPosts(db, f.lee.token, fixed);
  assert.ok(!revoked.some((p) => p.id === f.post.id || p.id === shared.id));
});
