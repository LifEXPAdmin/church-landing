import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { seedPortal, assertPortalTestDatabase } from "./seed-portal";
import { portalCommand, PortalError } from "../lib/platform/portal";
import { postCommand } from "../lib/platform/post-commands";
import { getPostEditor } from "../lib/platform/post-editor";
import { getPost, listPosts } from "../lib/platform/post-reads";
import { handlePostRequest } from "../lib/platform/post-boundary";
import { relationshipCommand } from "../lib/platform/relationships";
import { socialCommand } from "../lib/platform/social-operations";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const denied = (promise: Promise<unknown>, status = 403) =>
  assert.rejects(
    promise,
    (error: unknown) => error instanceof PortalError && error.status === status
  );

test("a previously committed no-reason request stays confirmable across the release, but cannot become a new change", async () => {
  const f = await fixture();
  const input = {
    operation: "discussion",
    postId: f.post.id,
    expectedVersion: 1,
    closed: true,
    mutationId: randomUUID()
  };
  // Seed the preceding release's committed settings and receipt through the
  // unchanged receipt owner. Its browser lost the response before this release.
  const prior = await socialCommand(
    db,
    f.contact.token,
    "post-control",
    input,
    async (tx, actorId) => {
      const post = await tx.platformPost.update({
        where: { id: f.post.id },
        data: { discussionClosed: true, version: { increment: 1 } }
      });
      await tx.postAudit.create({
        data: {
          postId: post.id,
          actorId,
          action: "discussion-changed",
          version: post.version
        }
      });
      return {
        id: post.id,
        version: post.version,
        message: "Discussion permissions are saved."
      };
    }
  );
  assert.deepEqual(await postCommand(db, f.contact.token, input), prior);
  await denied(
    postCommand(db, f.contact.token, {
      ...input,
      expectedVersion: 2,
      closed: false,
      mutationId: randomUUID()
    }),
    400
  );
  const post = await db.platformPost.findUniqueOrThrow({
    where: { id: f.post.id }
  });
  assert.equal(post.discussionClosed, true);
  assert.equal(post.version, 2);
  assert.equal(
    await db.churchAuditEvent.count({
      where: { targetId: post.id, action: "DISCUSSION_MODERATED" }
    }),
    0,
    "A new reason must not be invented for an earlier committed decision"
  );
  assert.equal(
    await db.postAudit.count({
      where: { postId: post.id, action: "discussion-changed" }
    }),
    1
  );
});
async function fixture() {
  const f = await seedPortal(db);
  for (const [actor, capability] of [
    [f.memberA, "PUBLISH_CHURCH_POSTS"],
    [f.contact, "MODERATE_CHURCH_POSTS"]
  ] as const)
    await portalCommand(db, f.operator.token, {
      operation: "grant",
      churchId: f.churchA.id,
      userId: actor.id,
      capability,
      expectedVersion: 0
    });
  const post = await postCommand(db, f.memberA.token, {
    operation: "create",
    requestKey: randomUUID(),
    authorChurchId: f.churchA.id,
    content: "Fictional moderated discussion " + randomUUID(),
    replyAudience: "CHURCH_MEMBERS"
  });
  const input = (changes: Record<string, unknown> = {}) => ({
    operation: "discussion",
    postId: post.id,
    expectedVersion: 1,
    closed: true,
    moderationReason: "PRIVACY",
    mutationId: randomUUID(),
    ...changes
  });
  return { ...f, post, input };
}

test("moderator discussion changes require a supported reason before any settings, audit or receipt changes", async () => {
  const f = await fixture();
  for (const reason of [
    undefined,
    "",
    "Other private free text",
    "PRIVACY ",
    {},
    "x".repeat(2000)
  ]) {
    const input = f.input({ moderationReason: reason });
    await denied(postCommand(db, f.contact.token, input), 400);
    assert.equal(
      await db.socialOperation.count({
        where: {
          ownerId: f.contact.id,
          key: "post-control:" + input.mutationId
        }
      }),
      0
    );
  }
  const row = await db.platformPost.findUniqueOrThrow({
    where: { id: f.post.id }
  });
  assert.equal(row.version, 1);
  assert.equal(row.discussionClosed, false);
  assert.equal(
    await db.postAudit.count({
      where: { postId: f.post.id, action: "discussion-changed" }
    }),
    0
  );
  assert.equal(
    await db.churchAuditEvent.count({
      where: { targetId: f.post.id, action: "DISCUSSION_MODERATED" }
    }),
    0
  );
});

test("one reasoned moderator change has one scoped immutable audit and exact receipt; changed reason conflicts", async () => {
  const f = await fixture(),
    input = f.input();
  const result = await postCommand(db, f.contact.token, input);
  assert.deepEqual(await postCommand(db, f.contact.token, input), result);
  await denied(
    postCommand(db, f.contact.token, { ...input, moderationReason: "SAFETY" }),
    409
  );
  const audits = await db.churchAuditEvent.findMany({
    where: { targetId: f.post.id, action: "DISCUSSION_MODERATED" }
  });
  assert.equal(audits.length, 1);
  assert.deepEqual(
    {
      churchId: audits[0].churchId,
      actorId: audits[0].actorId,
      reason: audits[0].reason,
      before: audits[0].fromState,
      after: audits[0].toState,
      version: audits[0].version
    },
    {
      churchId: f.churchA.id,
      actorId: f.contact.id,
      reason: "PRIVACY",
      before: "OPEN:CHURCH_MEMBERS",
      after: "CLOSED:CHURCH_MEMBERS",
      version: 2
    }
  );
  const post = await getPost(db, f.coordinator.token, f.post.id);
  assert.equal(post?.canReply, false);
  assert.equal(post?.audience, "CHURCH");
  assert.equal(await getPost(db, f.memberB.token, f.post.id), null);
  assert.ok(!JSON.stringify(post).includes("DISCUSSION_MODERATED"));
  assert.ok(
    !JSON.stringify(await listPosts(db, f.coordinator.token)).includes(
      audits[0].id
    )
  );
});

test("authors retain their existing no-reason controls and can inspect only their post's permitted decision history", async () => {
  const f = await fixture();
  await postCommand(db, f.contact.token, f.input());
  const editor = await getPostEditor(db, f.memberA.token, f.post.id);
  assert.equal(editor.canEdit, true);
  assert.equal(editor.discussionModeration.length, 1);
  assert.equal(editor.discussionModeration[0].actor, f.contact.name);
  assert.equal(
    editor.discussionModeration[0].reason,
    "Protecting personal information"
  );
  assert.equal(
    editor.discussionModeration[0].after,
    "Closed; church-member reply setting retained"
  );
  for (const secret of [f.contact.email, f.contact.id, f.contact.token])
    assert.ok(!JSON.stringify(editor.discussionModeration).includes(secret));
  await postCommand(
    db,
    f.memberA.token,
    f.input({ expectedVersion: 2, closed: false, moderationReason: undefined })
  );
  const restored = await getPost(db, f.coordinator.token, f.post.id);
  assert.equal(restored?.discussionClosed, false);
  assert.equal(restored?.replyAudience, "CHURCH_MEMBERS");
  assert.equal(
    await db.churchAuditEvent.count({
      where: { targetId: f.post.id, action: "DISCUSSION_MODERATED" }
    }),
    1
  );
  await denied(getPostEditor(db, f.coordinator.token, f.post.id));
});

test("current church authority precedes both history and prior receipt replay", async () => {
  const f = await fixture(),
    input = f.input();
  await postCommand(db, f.contact.token, input);
  await portalCommand(db, f.operator.token, {
    operation: "grant",
    churchId: f.churchB.id,
    userId: f.memberB.id,
    capability: "MODERATE_CHURCH_POSTS",
    expectedVersion: 0
  });
  await denied(
    postCommand(
      db,
      f.memberB.token,
      f.input({ expectedVersion: 2, closed: false })
    )
  );
  await denied(getPostEditor(db, f.memberB.token, f.post.id), 404);
  await db.churchCapabilityGrant.updateMany({
    where: {
      userId: f.contact.id,
      churchId: f.churchA.id,
      capability: "MODERATE_CHURCH_POSTS"
    },
    data: { revokedAt: new Date() }
  });
  await denied(postCommand(db, f.contact.token, input));
  await denied(getPostEditor(db, f.contact.token, f.post.id));
  assert.equal(
    await db.churchAuditEvent.count({
      where: { targetId: f.post.id, action: "DISCUSSION_MODERATED" }
    }),
    1
  );
});

test("the management snapshot bounds history to the selected church post and does not expose blocked actor identities", async () => {
  const f = await fixture();
  for (let i = 0; i < 12; i++)
    await postCommand(
      db,
      f.contact.token,
      f.input({
        expectedVersion: i + 1,
        closed: i % 2 === 0,
        moderationReason: i % 2 === 0 ? "REVIEW_NEEDED" : "REVIEW_COMPLETE"
      })
    );
  await db.churchAuditEvent.create({
    data: {
      churchId: f.churchB.id,
      targetId: f.post.id,
      actorId: f.memberB.id,
      action: "DISCUSSION_MODERATED",
      reason: "PRIVATE UNRELATED CASE"
    }
  });
  const editor = await getPostEditor(db, f.memberA.token, f.post.id);
  assert.equal(editor.discussionModeration.length, 10);
  assert.deepEqual(
    editor.discussionModeration.map((row) => row.version),
    Array.from({ length: 10 }, (_, i) => 13 - i)
  );
  assert.ok(!JSON.stringify(editor).includes("PRIVATE UNRELATED CASE"));
  await relationshipCommand(db, f.memberA.token, {
    operation: "block",
    kind: "person",
    targetId: f.contact.id,
    desired: true,
    expectedVersion: 0,
    mutationId: randomUUID()
  });
  const concealed = await getPostEditor(db, f.memberA.token, f.post.id);
  assert.ok(
    concealed.discussionModeration.every(
      (row) => row.actor === "Unavailable member"
    )
  );
});

test("HTTP pins the acting account and returns private current management history", async () => {
  const f = await fixture(),
    origin = process.env.ACCOUNT_ORIGIN!;
  const send = (expectedAccount: string, data: Record<string, unknown>) =>
    handlePostRequest(
      db,
      new Request(origin + "/api/platform/posts", {
        method: "POST",
        headers: {
          Origin: origin,
          Cookie: "church_platform_session=" + f.contact.token,
          "Content-Type": "application/json",
          "X-Expected-Account": expectedAccount
        },
        body: JSON.stringify(data)
      })
    );
  assert.equal((await send(f.memberA.id, f.input())).status, 401);
  assert.equal(
    (await send(f.contact.id, f.input({ moderationReason: "" }))).status,
    400
  );
  const input = f.input();
  assert.equal((await send(f.contact.id, input)).status, 200);
  const read = await handlePostRequest(
    db,
    new Request(origin + "/api/platform/posts?postId=" + f.post.id, {
      headers: {
        Cookie: "church_platform_session=" + f.contact.token,
        "X-Expected-Account": f.contact.id
      }
    })
  );
  assert.equal(read.status, 200);
  assert.match(read.headers.get("cache-control")!, /private.*no-store/);
  const body = await read.json();
  assert.equal(body.canEdit, false);
  assert.equal(body.canDiscuss, true);
  assert.equal(body.discussionModeration.length, 1);
  assert.equal((await send(f.contact.id, input)).status, 200);
  assert.equal(
    await db.churchAuditEvent.count({
      where: { targetId: f.post.id, action: "DISCUSSION_MODERATED" }
    }),
    1
  );
});
