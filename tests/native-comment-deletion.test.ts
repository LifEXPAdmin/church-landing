import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import {
  handleNativeCommentDeleteRequest,
  handleNativeCommentReadRequest
} from "../lib/platform/native-comment-boundary";
import { commentCommand } from "../lib/platform/comment-commands";
import { apiFailure, decodeApiResponse } from "../lib/platform/api-contracts";
import { accountConfig } from "../lib/platform/account-config";
import { hashSessionToken } from "../lib/platform/auth";
import { socialWriteInput } from "../lib/platform/social-boundary";
import { PortalError } from "../lib/platform/portal-policy";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import {
  protectReportedWithdrawal,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import { commentNotificationSource } from "../lib/platform/comment-notification-source";
import { topicCommand, readTopic } from "../lib/platform/topic-communities";
import { groupCommand } from "../lib/platform/group-commands";
import { readGroup } from "../lib/platform/group-reads";
import { postCommand } from "../lib/platform/post-commands";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
type Actor = { id: string; token: string };
type Target = { postId: string; commentId: string };
const command = (operation: string, fields: Record<string, unknown>) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const change = (expectedVersion = 1) => ({
  mutationId: randomUUID(),
  expectedVersion
});
const headers = (actor: Actor) => ({
  Authorization: "Bearer " + actor.token,
  "X-Expected-Account": actor.id,
  "Content-Type": "application/json"
});
function request(target: Target, actor: Actor, body: BodyInit) {
  return new Request(
    new URL(
      `/api/platform/v1/posts/${target.postId}/comments/${target.commentId}/delete`,
      process.env.ACCOUNT_ORIGIN!
    ),
    {
      method: "POST",
      headers: headers(actor),
      body,
      ...(body instanceof ReadableStream ? { duplex: "half" } : {})
    } as RequestInit
  );
}
async function result(response: Response) {
  assert.match(response.headers.get("cache-control")!, /private.*no-store/);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("x-api-version"), "1");
  return { response, value: await response.json() };
}
async function call(target: Target, actor: Actor, input: object) {
  return result(
    await handleNativeCommentDeleteRequest(
      db,
      request(target, actor, JSON.stringify(input)),
      target
    )
  );
}
function ok(
  r: Awaited<ReturnType<typeof call>>,
  owner: string,
  pending = false
) {
  assert.equal(r.response.status, pending ? 202 : 200, JSON.stringify(r.value));
  const data = decodeApiResponse("deleteComment", r.value, owner).data;
  assert.equal(data.recoveryPending, pending);
  return data;
}
function denied(
  r: Awaited<ReturnType<typeof call>>,
  status: number,
  code: string
) {
  assert.equal(r.response.status, status, JSON.stringify(r.value));
  assert.equal(apiFailure.parse(r.value).error.code, code);
  assert.equal(r.value.data, undefined);
}
async function fixture() {
  const owner = await createPortalActor(db, "deleteowner"),
    author = await createPortalActor(db, "deleteauthor");
  const post = await db.platformPost.create({
    data: {
      authorId: owner.id,
      content: "Fictional deletion source",
      publishedAt: new Date()
    }
  });
  const comment = await commentCommand(
    db,
    author.token,
    command("create", {
      postId: post.id,
      content: "Original fictional comment"
    })
  );
  return {
    owner,
    author,
    post,
    comment,
    target: { postId: post.id, commentId: comment.id }
  };
}
const row = (id: string) =>
  db.platformPostComment.findUniqueOrThrow({ where: { id } });
async function thread(postId: string, actor: Actor) {
  const response = await handleNativeCommentReadRequest(
    db,
    new Request(
      new URL(
        `/api/platform/v1/posts/${postId}/comments`,
        process.env.ACCOUNT_ORIGIN!
      ),
      { headers: headers(actor) }
    ),
    { postId }
  );
  assert.equal(response.status, 200);
  return decodeApiResponse("comments", await response.json(), actor.id).data;
}

test("native and canonical concurrent deletion retries preserve replies and perform cleanup exactly once", async () => {
  const f = await fixture();
  const reply = await commentCommand(
    db,
    f.owner.token,
    command("create", {
      postId: f.post.id,
      replyToId: f.comment.id,
      content: "Fictional surviving reply"
    })
  );
  await commentCommand(
    db,
    f.author.token,
    command("edit", {
      ...f.target,
      expectedVersion: 1,
      content: "Fictional mentioned root",
      mentionIds: [f.owner.id]
    })
  );
  await commentCommand(
    db,
    f.owner.token,
    command("like", { ...f.target, expectedVersion: 0, desired: true })
  );
  await commentCommand(
    db,
    f.owner.token,
    command("pin", { ...f.target, expectedVersion: 0 })
  );
  const before = await row(f.comment.id),
    input = change(2);
  const events = await db.socialEvent.findMany({
    where: { commentId: f.comment.id },
    orderBy: { id: "asc" }
  });
  const responses = await Promise.all([
    call(f.target, f.author, input),
    call(f.target, f.author, input)
  ]);
  const receipt = ok(responses[0], f.author.id);
  assert.deepEqual(ok(responses[1], f.author.id), receipt);
  assert.deepEqual(
    await commentCommand(db, f.author.token, {
      operation: "delete",
      ...input,
      ...f.target
    }),
    {
      id: receipt.id,
      version: receipt.version,
      message: receipt.message
    }
  );
  const saved = await row(f.comment.id);
  assert.equal(saved.content, "");
  assert.ok(saved.deletedAt);
  assert.equal(saved.version, 3);
  for (const key of [
    "authorId",
    "authorChurchId",
    "postId",
    "rootId",
    "parentId",
    "createdAt"
  ] as const)
    assert.deepEqual(saved[key], before[key]);
  const like = await db.commentLike.findFirstOrThrow({
    where: { commentId: f.comment.id }
  });
  assert.equal(like.active, false);
  assert.equal(like.version, 2);
  const pin = await db.commentPin.findUniqueOrThrow({
    where: { postId: f.post.id }
  });
  assert.equal(pin.commentId, null);
  assert.equal(pin.version, 2);
  assert.equal(
    await db.commentMention.count({
      where: { commentId: f.comment.id, active: true }
    }),
    0
  );
  assert.equal(
    await db.socialOperation.count({
      where: { ownerId: f.author.id, key: "comments:" + input.mutationId }
    }),
    1
  );
  assert.deepEqual(
    await db.socialEvent.findMany({
      where: { commentId: f.comment.id },
      orderBy: { id: "asc" }
    }),
    events
  );
  for (const event of events.filter(
    (event) => event.kind === "COMMENT_ACTIVITY"
  ))
    assert.equal(await commentNotificationSource(db, event, false), null);
  const view = await thread(f.post.id, f.owner);
  assert.equal(view.visibleCount, 1);
  const root = view.items.find((item) => item.id === f.comment.id);
  assert.ok(root && !root.available);
  assert.deepEqual(Object.keys(root).sort(), [
    "available",
    "createdAt",
    "id",
    "parentId",
    "replyCount",
    "rootId"
  ]);
  assert.equal(root.replyCount, 1);
  assert.equal((await row(reply.id)).deletedAt, null);
  denied(
    await call({ ...f.target, commentId: reply.id }, f.author, input),
    409,
    "conflict"
  );
  denied(
    await call({ ...f.target, postId: "different" }, f.author, input),
    409,
    "conflict"
  );
  denied(
    await call(f.target, f.author, { ...input, expectedVersion: 3 }),
    409,
    "conflict"
  );
  denied(await call(f.target, f.author, change(3)), 404, "not_found");
  assert.deepEqual(await row(f.comment.id), saved);
  assert.deepEqual(
    await db.commentLike.findUniqueOrThrow({ where: { id: like.id } }),
    like
  );
  assert.deepEqual(
    await db.commentPin.findUniqueOrThrow({ where: { postId: f.post.id } }),
    pin
  );
});

test("fresh deletion requires author and current version but stays available when replies are closed", async () => {
  const f = await fixture();
  denied(await call(f.target, f.owner, change()), 403, "forbidden");
  await commentCommand(
    db,
    f.author.token,
    command("edit", {
      ...f.target,
      expectedVersion: 1,
      content: "Newer fictional correction",
      mentionIds: []
    })
  );
  denied(await call(f.target, f.author, change()), 409, "conflict");
  assert.equal((await row(f.comment.id)).content, "Newer fictional correction");
  await db.platformPost.update({
    where: { id: f.post.id },
    data: { discussionClosed: true }
  });
  const receipt = ok(await call(f.target, f.author, change(2)), f.author.id);
  assert.equal(receipt.version, 3);
  assert.equal((await thread(f.post.id, f.author)).items.length, 0);
});

test("fresh deletion rejects unreadable sources while an ordinary old receipt grants no continuing access", async () => {
  for (const loss of ["withdrawn", "block", "membership", "hidden"]) {
    const f = await fixture();
    const first = await commentCommand(
      db,
      f.author.token,
      command("create", {
        postId: f.post.id,
        content: "Earlier deleted comment"
      })
    );
    const firstTarget = { postId: f.post.id, commentId: first.id },
      input = change();
    const receipt = ok(await call(firstTarget, f.author, input), f.author.id);
    if (loss === "withdrawn")
      await db.platformPost.update({
        where: { id: f.post.id },
        data: { status: "WITHDRAWN", withdrawnAt: new Date() }
      });
    if (loss === "block")
      await db.socialRelationship.create({
        data: { ownerId: f.owner.id, targetUserId: f.author.id, blocked: true }
      });
    if (loss === "membership") {
      const church = await db.church.create({
        data: {
          slug: "delete-private-" + randomUUID(),
          name: "Fictional private church",
          summary: "Isolated audience"
        }
      });
      await db.platformPost.update({
        where: { id: f.post.id },
        data: { audience: "CHURCH", audienceChurchId: church.id }
      });
    }
    if (loss === "hidden")
      await db.platformPostComment.update({
        where: { id: f.comment.id },
        data: { moderationState: "HIDDEN" }
      });
    const saved = await row(f.comment.id);
    denied(await call(f.target, f.author, change()), 404, "not_found");
    assert.deepEqual(await row(f.comment.id), saved);
    assert.deepEqual(
      ok(await call(firstTarget, f.author, input), f.author.id),
      receipt
    );
  }
});

test("church deletion uses current speaking authority, including a different publisher", async () => {
  const f = await fixture(),
    publisher = await createPortalActor(db, "deletepublisher");
  const church = await db.church.create({
    data: {
      slug: "delete-church-" + randomUUID(),
      name: "Fictional speaking church",
      summary: "Isolated church"
    }
  });
  for (const actor of [f.author, publisher]) {
    await db.churchConnection.create({
      data: { churchId: church.id, userId: actor.id, state: "APPROVED" }
    });
    await db.churchCapabilityGrant.create({
      data: {
        churchId: church.id,
        userId: actor.id,
        capability: "PUBLISH_CHURCH_POSTS"
      }
    });
  }
  const create = () =>
    commentCommand(
      db,
      f.author.token,
      command("create", {
        postId: f.post.id,
        content: "Fictional church statement",
        authorChurchId: church.id
      })
    );
  const first = await create(),
    second = await create();
  const target = { postId: f.post.id, commentId: first.id },
    input = change();
  const receipt = ok(await call(target, publisher, input), publisher.id);
  assert.equal((await row(first.id)).authorChurchId, church.id);
  assert.equal((await row(first.id)).authorId, f.author.id);
  await db.churchCapabilityGrant.deleteMany({
    where: { churchId: church.id, userId: publisher.id }
  });
  denied(
    await call(
      { postId: f.post.id, commentId: second.id },
      publisher,
      change()
    ),
    403,
    "forbidden"
  );
  assert.equal((await row(second.id)).deletedAt, null);
  assert.deepEqual(
    ok(await call(target, publisher, input), publisher.id),
    receipt
  );
});

test("reported deletion remains saved during journal failure and exact retry reconciles protection without a second effect", async () => {
  const f = await fixture(),
    original = await row(f.comment.id),
    input = change();
  const report = await db.communityReport.create({
    data: {
      reporterId: f.owner.id,
      targetType: "COMMENT",
      targetId: f.comment.id,
      targetVersion: 1,
      reason: "PRIVACY",
      details: "Fictional selected report"
    }
  });
  const prior = process.env.RETENTION_TEST_DIR;
  // The existing fixture store rejects a path outside .account-test before any
  // provider call. This exercises the real canonical pending acknowledgement.
  process.env.RETENTION_TEST_DIR = "/invalid-fictional-retention-path";
  try {
    const pending = ok(
      await call(f.target, f.author, input),
      f.author.id,
      true
    );
    assert.match(pending.message, /removal is saved.*protection is pending/);
    const saved = await row(f.comment.id);
    assert.equal(saved.content, original.content);
    assert.ok(saved.deletedAt);
    assert.equal(saved.version, 2);
    assert.equal((await thread(f.post.id, f.owner)).items.length, 0);
    assert.deepEqual(
      ok(await call(f.target, f.author, input), f.author.id, true),
      pending
    );
    const entry = await db.retentionControl.findFirstOrThrow({
      where: { kind: "AUTHOR_WITHDRAW_COMMENT", sourceId: f.comment.id }
    });
    assert.equal(entry.targetId, report.id);
    assert.equal(entry.journaledAt, null);
    assert.ok(!JSON.stringify(entry.payload).includes(original.content));
    const journal: RetentionControlEntry[] = [];
    assert.equal(
      await protectReportedWithdrawal(db, "COMMENT", f.comment.id, {
        async record(value) {
          journal.push(value);
        }
      }),
      true
    );
    const confirmed = ok(await call(f.target, f.author, input), f.author.id);
    assert.equal(confirmed.id, pending.id);
    assert.equal(confirmed.version, pending.version);
    assert.equal(journal.length, 1);
    assert.deepEqual(await row(f.comment.id), saved);
    assert.equal(
      await db.retentionControl.count({
        where: { kind: "AUTHOR_WITHDRAW_COMMENT", sourceId: f.comment.id }
      }),
      1
    );
    assert.equal(
      await db.socialOperation.count({
        where: { ownerId: f.author.id, key: "comments:" + input.mutationId }
      }),
      1
    );
  } finally {
    if (prior === undefined) delete process.env.RETENTION_TEST_DIR;
    else process.env.RETENTION_TEST_DIR = prior;
  }
});

test("deletion rechecks original account and session under the lock before fresh effects or receipt replay", async () => {
  for (const replay of [false, true])
    for (const loss of ["owner", "expiry", "revoke"]) {
      const f = await fixture(),
        input = change(),
        tokenHash = hashSessionToken(f.author.token);
      if (replay) ok(await call(f.target, f.author, input), f.author.id);
      const saved = await row(f.comment.id);
      let pulls = 0;
      const body = new ReadableStream<Uint8Array>(
        {
          async pull(controller) {
            pulls++;
            if (loss === "owner")
              await db.platformSession.update({
                where: { tokenHash },
                data: { userId: f.owner.id }
              });
            if (loss === "expiry")
              await db.platformSession.update({
                where: { tokenHash },
                data: { expiresAt: new Date(Date.now() - 1000) }
              });
            if (loss === "revoke")
              await db.platformSession.delete({ where: { tokenHash } });
            controller.enqueue(new TextEncoder().encode(JSON.stringify(input)));
            controller.close();
          }
        },
        { highWaterMark: 0 }
      );
      denied(
        await result(
          await handleNativeCommentDeleteRequest(
            db,
            request(f.target, f.author, body),
            f.target
          )
        ),
        401,
        loss === "owner" ? "account_changed" : "unauthenticated"
      );
      assert.equal(pulls, 1);
      assert.deepEqual(await row(f.comment.id), saved);
      assert.equal(
        await db.socialOperation.count({
          where: { key: "comments:" + input.mutationId }
        }),
        replay ? 1 : 0
      );
    }
  const f = await fixture();
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls++;
        controller.close();
      }
    },
    { highWaterMark: 0 }
  );
  denied(
    await result(
      await handleNativeCommentDeleteRequest(
        db,
        request(f.target, { ...f.author, id: f.owner.id }, body),
        f.target
      )
    ),
    401,
    "account_changed"
  );
  assert.equal(pulls, 0);
});

test("deletion shares the website comment rate budget and rejects denied bodies before reading", async () => {
  const f = await fixture();
  const key = createHmac("sha256", accountConfig().rateSecret + ":comments")
    .update("post-workspace:" + f.author.id)
    .digest("hex");
  await db.platformAuthLimit.create({
    data: { key, hits: 239, expiresAt: new Date(Date.now() + 900000) }
  });
  ok(await call(f.target, f.author, change()), f.author.id);
  await assert.rejects(
    socialWriteInput(
      db,
      new Request(
        new URL("/api/platform/comments", process.env.ACCOUNT_ORIGIN!),
        {
          method: "POST",
          headers: {
            Origin: process.env.ACCOUNT_ORIGIN!,
            Cookie: sessionCookieFixtureName() + "=" + f.author.token,
            "X-Expected-Account": f.author.id,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ operation: "delete" })
        }
      ),
      "comments"
    ),
    (error) => error instanceof PortalError && error.status === 429
  );
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls++;
        controller.close();
      }
    },
    { highWaterMark: 0 }
  );
  const response = await result(
    await handleNativeCommentDeleteRequest(
      db,
      request(f.target, f.author, body),
      f.target
    )
  );
  denied(response, 429, "rate_limited");
  assert.equal(response.response.headers.get("retry-after"), "900");
  assert.equal(pulls, 0);
});

test("group membership loss still denies deletion receipt replay, while Topic deletion preserves its canonical historical receipt", async () => {
  for (const kind of ["group", "topic"]) {
    const f = await fixture(),
      slug = "native-delete-" + kind + "-" + randomUUID();
    let post;
    let restrict: () => Promise<unknown>;
    if (kind === "group") {
      const group = await groupCommand(
        db,
        f.owner.token,
        command("create", {
          schema: 1,
          slug,
          acceptedRules: true,
          leaderDisclosure: true,
          fields: {
            name: "Fictional deletion group " + randomUUID(),
            purpose: "Isolated adult group",
            rules: "Respect each member and protect private discussion.",
            kind: "INTEREST",
            discovery: "LISTED",
            joinPolicy: "OPEN",
            format: "LOCAL",
            area: "Fictional town",
            topic: "Music",
            churchId: null
          }
        })
      );
      const view = await readGroup(db, f.author.token, slug);
      await groupCommand(
        db,
        f.author.token,
        command("join", {
          groupId: group.id,
          expectedVersion: view.viewer.version,
          rulesVersion: view.group.rulesVersion,
          acceptedRules: true,
          rosterVisible: false
        })
      );
      post = await postCommand(db, f.owner.token, {
        operation: "create",
        requestKey: randomUUID(),
        groupId: group.id,
        audience: "GROUP",
        groupThreadKind: "QUESTION",
        groupCategory: "GENERAL",
        content: "Fictional private deletion source"
      });
      restrict = async () => {
        const member = await db.gatherGroupMembership.findUniqueOrThrow({
          where: { groupId_userId: { groupId: group.id, userId: f.author.id } }
        });
        return groupCommand(
          db,
          f.owner.token,
          command("decide", {
            groupId: group.id,
            targetId: f.author.id,
            expectedVersion: member.version,
            state: "REMOVED",
            reason: "Fictional explicit removal"
          })
        );
      };
    } else {
      const topic = await topicCommand(
        db,
        f.owner.token,
        command("create", {
          name: "Fictional deletion topic " + randomUUID(),
          slug,
          description: "Isolated deletion source",
          rules: "Respect members and protect private information.",
          acceptedRules: true
        })
      );
      const view = await readTopic(db, f.author.token, slug);
      await topicCommand(
        db,
        f.author.token,
        command("join", {
          communityId: topic.id,
          desired: true,
          acceptedRules: true,
          rulesVersion: view.community.rulesVersion,
          expectedVersion: view.viewer.version
        })
      );
      post = await postCommand(db, f.owner.token, {
        operation: "create",
        requestKey: randomUUID(),
        topicCommunityId: topic.id,
        content: "Fictional Topic deletion source",
        allowReposts: true
      });
      restrict = async () => {
        const member = await db.topicMembership.findUniqueOrThrow({
          where: {
            communityId_userId: { communityId: topic.id, userId: f.author.id }
          }
        });
        return topicCommand(
          db,
          f.owner.token,
          command("restrict", {
            communityId: topic.id,
            targetId: f.author.id,
            expectedVersion: member.version,
            desired: true,
            reason: "RULES"
          })
        );
      };
    }
    const deleted = await commentCommand(
      db,
      f.author.token,
      command("create", {
        postId: post.id,
        content: "Earlier removed fictional comment"
      })
    );
    const retained = await commentCommand(
      db,
      f.author.token,
      command("create", {
        postId: post.id,
        content: "Fictional restricted comment"
      })
    );
    const target = { postId: post.id, commentId: deleted.id },
      input = change();
    if (kind === "group")
      await db.platformPost.update({
        where: { id: post.id },
        data: { selectedAnswerId: deleted.id }
      });
    const receipt = ok(await call(target, f.author, input), f.author.id);
    const savedPost = await db.platformPost.findUniqueOrThrow({
      where: { id: post.id }
    });
    assert.equal(savedPost.selectedAnswerId, null);
    await restrict();
    denied(
      await call(
        { postId: post.id, commentId: retained.id },
        f.author,
        change()
      ),
      404,
      "not_found"
    );
    if (kind === "group")
      denied(await call(target, f.author, input), 404, "not_found");
    else
      assert.deepEqual(
        ok(await call(target, f.author, input), f.author.id),
        receipt
      );
    assert.equal(
      (await db.platformPost.findUniqueOrThrow({ where: { id: post.id } }))
        .version,
      savedPost.version
    );
    assert.equal((await row(retained.id)).deletedAt, null);
    assert.equal((await row(deleted.id)).version, 2);
  }
});
