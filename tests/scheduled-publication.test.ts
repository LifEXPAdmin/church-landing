import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, seedPortal } from "./seed-portal";
import { portalCommand, PortalError } from "../lib/platform/portal";
import {
  postCommand,
  publishScheduledPost
} from "../lib/platform/post-commands";
import { getPost } from "../lib/platform/post-reads";
import { getPostEditor, getScheduledPosts } from "../lib/platform/post-editor";
import {
  postWorkspaceCommand,
  readPostWorkspace
} from "../lib/platform/post-workspace";
import { relationshipCommand } from "../lib/platform/relationships";
import {
  advanceScheduledPost,
  dispatchScheduledPosts
} from "../lib/platform/scheduled-publication";
import { processNotificationFanoutBatch } from "../lib/platform/notification-fanout";
import {
  consumeNotificationWork,
  retryNotificationWork
} from "../lib/platform/notification-consumer";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const mutation = (operation: string, fields: object = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const denied = (work: Promise<unknown>, status: number) =>
  assert.rejects(
    work,
    (error: unknown) => error instanceof PortalError && error.status === status
  );
async function fixture() {
  const f = await seedPortal(db);
  await portalCommand(db, f.operator.token, {
    operation: "grant",
    churchId: f.churchA.id,
    userId: f.memberA.id,
    capability: "PUBLISH_CHURCH_POSTS",
    expectedVersion: 0
  });
  const at = new Date(Date.now() + 3_600_000);
  const local = at.toISOString().slice(0, 16),
    due = new Date(local + ":00Z");
  const create = (fields: object = {}) =>
    postCommand(db, f.memberA.token, {
      operation: "create",
      requestKey: randomUUID(),
      authorChurchId: f.churchA.id,
      content: "Fictional future church notice",
      audience: "CHURCH",
      replyAudience: "CHURCH_MEMBERS",
      scheduleLocal: local,
      scheduleZone: "UTC",
      ...fields
    });
  return { ...f, create, local, due };
}

test("private draft scheduling preserves choices, publishes once and triggers only the explicit church bell", async (t) => {
  const f = await fixture();
  await relationshipCommand(
    db,
    f.coordinator.token,
    mutation("author-bell", {
      kind: "church",
      targetId: f.churchA.id,
      desired: true,
      expectedVersion: 0
    })
  );
  const id = randomUUID();
  const payload = {
    content: "Fictional scheduled private-draft publication",
    authorChurchId: f.churchA.id,
    audienceChurchId: f.churchA.id,
    audience: "CHURCH",
    replyAudience: "CHURCH_MEMBERS",
    scheduleLocal: f.local,
    scheduleZone: "UTC"
  };
  const saved = await postWorkspaceCommand(
    db,
    f.memberA.token,
    mutation("save-draft", { id, expectedVersion: 0, payload })
  );
  const {
    scheduleLocal: omittedLocal,
    scheduleZone: omittedZone,
    ...oldPayload
  } = payload;
  void omittedLocal;
  void omittedZone;
  await denied(
    postWorkspaceCommand(
      db,
      f.memberA.token,
      mutation("save-draft", {
        id,
        expectedVersion: saved.version,
        payload: oldPayload
      })
    ),
    400
  );
  const command = mutation("publish-draft", {
    id,
    expectedVersion: saved.version
  });
  const scheduled = await postWorkspaceCommand(db, f.memberA.token, command);
  assert.equal(scheduled.scheduled, true);
  assert.deepEqual(
    await postWorkspaceCommand(db, f.memberA.token, command),
    scheduled
  );
  const postId = scheduled.postId!;
  assert.deepEqual(
    await readPostWorkspace(db, f.memberA.token, { view: "draft", id }),
    { draft: null }
  );
  assert.equal(await getPost(db, f.coordinator.token, postId), null);
  assert.equal(await getPost(db, undefined, postId), null);
  assert.equal(
    (await getPostEditor(db, f.memberA.token, postId)).replyAudience,
    "CHURCH_MEMBERS"
  );
  await denied(getPostEditor(db, f.coordinator.token, postId), 404);
  assert.equal(
    (await getScheduledPosts(db, f.coordinator.token)).items.length,
    0
  );
  assert.ok(
    (await getScheduledPosts(db, f.memberA.token)).items.some(
      (row) => row.id === postId
    )
  );
  assert.equal(
    await db.notificationFanoutJob.count({ where: { sourceId: postId } }),
    0
  );
  let calls = 0;
  // Advance every application read to the execution time, not only the worker.
  t.mock.timers.enable({ apis: ["Date"], now: f.due });
  const handoff = async () => ({ failed: ++calls === 1 ? 1 : 0 });
  const published = await advanceScheduledPost(db, postId, 1, f.due, handoff);
  assert.equal(published.published, true);
  assert.equal(published.failed, 1);
  const retried = await advanceScheduledPost(db, postId, 1, f.due, handoff);
  assert.equal(retried.changed, false);
  assert.equal(retried.failed, 0);
  assert.equal(
    await db.postAudit.count({
      where: { postId, action: "schedule-published" }
    }),
    1
  );
  const jobs = await db.notificationFanoutJob.findMany({
    where: { sourceId: postId }
  });
  assert.equal(jobs.length, 1);
  assert.equal(
    (await processNotificationFanoutBatch(db, jobs[0].id)).done,
    true
  );
  assert.equal(
    await db.socialEvent.count({
      where: {
        kind: "AUTHOR_POST",
        sourceId: postId,
        recipientId: f.coordinator.id
      }
    }),
    1
  );
  assert.equal(
    (await getPost(db, f.coordinator.token, postId))?.replyAudience,
    "CHURCH_MEMBERS"
  );
});

test("rolling dispatch is bounded, repairs failed acceptance and hands off edited revisions without replacing the plan", async () => {
  const f = await fixture(),
    post = await f.create();
  const accepted = new Set<string>();
  let calls = 0;
  const transport = async (
    plan: { id: string; version: number },
    delay: number,
    key: string
  ) => {
    assert.ok(delay >= 0 && delay <= 6 * 86400);
    assert.deepEqual(Object.keys(plan).sort(), ["id", "version"]);
    assert.ok(key.startsWith(`scheduled:${plan.id}:${plan.version}:`));
    accepted.add(key);
    if (++calls === 1)
      throw Error("Acknowledgment lost after provider acceptance");
  };
  const now = new Date();
  assert.equal(
    (await dispatchScheduledPosts(db, f.memberA.id, transport, now)).failed,
    1
  );
  assert.equal(
    (await dispatchScheduledPosts(db, f.memberA.id, transport, now)).queued,
    1
  );
  assert.equal(accepted.size, 1);
  assert.equal(
    (await dispatchScheduledPosts(db, f.memberA.id, transport, now)).queued,
    0
  );
  const edit = await postCommand(
    db,
    f.memberA.token,
    mutation("edit", {
      postId: post.id,
      expectedVersion: 1,
      content: "Revised fictional scheduled church notice"
    })
  );
  assert.equal(
    (await dispatchScheduledPosts(db, undefined, transport, now, post.id))
      .queued,
    1
  );
  const current = await db.platformPost.findUniqueOrThrow({
    where: { id: post.id }
  });
  assert.equal(current.scheduleDispatchedVersion, edit.version);
  assert.equal(current.scheduleLocal, f.local);
  assert.equal(
    (await publishScheduledPost(db, post.id, 1, f.due)).changed,
    false
  );
  const future = new Date(Date.now() + 20 * 86400000)
    .toISOString()
    .slice(0, 16);
  await f.create({ scheduleLocal: future });
  assert.equal(
    (await dispatchScheduledPosts(db, f.memberA.id, transport, now)).queued,
    0
  );
  // Guarded fictional fixture only: force a continuation beyond one 100-plan page.
  await db.platformPost.createMany({
    data: Array.from({ length: 105 }, () => ({
      id: randomUUID(),
      authorId: f.memberA.id,
      authorChurchId: f.churchA.id,
      audienceChurchId: f.churchA.id,
      content: "Fictional bounded dispatch fixture",
      status: "SCHEDULED",
      publishedAt: null,
      scheduledById: f.memberA.id,
      scheduleAt: f.due,
      scheduleLocal: f.local,
      scheduleZone: "UTC"
    }))
  });
  assert.equal(
    (await dispatchScheduledPosts(db, f.memberA.id, transport, now)).queued,
    100
  );
  assert.equal(
    (await dispatchScheduledPosts(db, f.memberA.id, transport, now)).queued,
    5
  );
});

test("cancel, reschedule and racing consumers preserve revision authority and never publish early", async () => {
  const f = await fixture(),
    post = await f.create();
  assert.ok((await publishScheduledPost(db, post.id, 1)).retryAfterSeconds > 0);
  await assert.rejects(
    consumeNotificationWork(db, "comment-followers-v1", {
      id: post.id,
      kind: "scheduled",
      version: 1
    }),
    (error) => {
      const retry = retryNotificationWork(error);
      return retry.afterSeconds > 0 && retry.afterSeconds <= 3600;
    }
  );
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: post.id } }))
      .status,
    "SCHEDULED"
  );
  const cancel = mutation("cancel-schedule", {
    postId: post.id,
    expectedVersion: 1
  });
  const canceled = await postCommand(db, f.memberA.token, cancel);
  assert.deepEqual(await postCommand(db, f.memberA.token, cancel), canceled);
  await consumeNotificationWork(db, "comment-followers-v1", {
    id: post.id,
    kind: "scheduled",
    version: 1
  });
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: post.id } }))
      .status,
    "DRAFT"
  );
  assert.equal(
    (await publishScheduledPost(db, post.id, 1, f.due)).changed,
    false
  );
  const reschedule = mutation("schedule", {
    postId: post.id,
    expectedVersion: canceled.version,
    scheduleLocal: f.local,
    scheduleZone: "UTC"
  });
  const saved = await postCommand(db, f.memberA.token, reschedule);
  assert.deepEqual(await postCommand(db, f.memberA.token, reschedule), saved);
  await denied(
    postCommand(db, f.memberA.token, {
      ...reschedule,
      scheduleZone: "America/Chicago"
    }),
    409
  );
  assert.deepEqual(await postCommand(db, f.memberA.token, cancel), canceled);
  const outcomes = await Promise.all(
    Array.from({ length: 3 }, () =>
      publishScheduledPost(db, post.id, saved.version, f.due)
    )
  );
  assert.equal(outcomes.filter((row) => row.published).length, 1);
  assert.equal(
    await db.postAudit.count({
      where: { postId: post.id, action: "schedule-published" }
    }),
    1
  );
});

test("incomplete plans stay private and revoked, moderated or stale plans remain drafts without notification fanout", async () => {
  const f = await fixture();
  await denied(f.create({ scheduleLocal: "", scheduleZone: "UTC" }), 400);
  const id = randomUUID();
  const draft = await postWorkspaceCommand(
    db,
    f.memberA.token,
    mutation("save-draft", {
      id,
      expectedVersion: 0,
      payload: {
        content: "Unfinished publication plan",
        replyAudience: "CHURCH_MEMBERS",
        audienceChurchId: f.churchA.id,
        authorChurchId: f.churchA.id,
        scheduleLocal: "",
        scheduleZone: "UTC"
      }
    })
  );
  await denied(
    postWorkspaceCommand(
      db,
      f.memberA.token,
      mutation("publish-draft", { id, expectedVersion: draft.version })
    ),
    400
  );
  assert.ok(
    (
      (await readPostWorkspace(db, f.memberA.token, { view: "draft", id })) as {
        draft: unknown;
      }
    ).draft
  );
  const stale = await f.create();
  assert.equal(
    (
      await publishScheduledPost(
        db,
        stale.id,
        1,
        new Date(f.due.getTime() + 86400001)
      )
    ).published,
    false
  );
  const hidden = await f.create();
  await db.platformPost.update({
    where: { id: hidden.id },
    data: { moderationState: "HIDDEN" }
  });
  assert.equal(
    (await publishScheduledPost(db, hidden.id, 1, f.due)).published,
    false
  );
  const revoked = await f.create();
  const grant = await db.churchCapabilityGrant.findUniqueOrThrow({
    where: {
      userId_churchId_capability: {
        userId: f.memberA.id,
        churchId: f.churchA.id,
        capability: "PUBLISH_CHURCH_POSTS"
      }
    }
  });
  await portalCommand(db, f.operator.token, {
    operation: "revoke-grant",
    churchId: f.churchA.id,
    id: grant.id,
    expectedVersion: grant.version
  });
  assert.equal(
    (await publishScheduledPost(db, revoked.id, 1, f.due)).published,
    false
  );
  const ids = [stale.id, hidden.id, revoked.id];
  const rows = await db.platformPost.findMany({ where: { id: { in: ids } } });
  assert.ok(
    rows.every(
      (row) =>
        row.status === "DRAFT" &&
        !row.scheduleAt &&
        row.content.includes("Fictional")
    )
  );
  assert.equal(
    await db.notificationFanoutJob.count({ where: { sourceId: { in: ids } } }),
    0
  );
  await denied(getPostEditor(db, f.memberA.token, revoked.id), 404);
});
