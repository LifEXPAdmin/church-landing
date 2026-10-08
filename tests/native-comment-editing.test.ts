import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import {
  handleNativeCommentEditRequest,
  handleNativeCommentReadRequest
} from "../lib/platform/native-comment-boundary";
import { commentCommand } from "../lib/platform/comment-commands";
import { apiFailure, decodeApiResponse } from "../lib/platform/api-contracts";
import { hashSessionToken } from "../lib/platform/auth";
import { accountConfig } from "../lib/platform/account-config";
import { socialWriteInput } from "../lib/platform/social-boundary";
import { PortalError } from "../lib/platform/portal-policy";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import { topicCommand, readTopic } from "../lib/platform/topic-communities";
import { groupCommand } from "../lib/platform/group-commands";
import { readGroup } from "../lib/platform/group-reads";
import { postCommand } from "../lib/platform/post-commands";
import { commentNotificationSource } from "../lib/platform/comment-notification-source";
import { readActivity } from "../lib/platform/activity";

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
const change = (fields: Record<string, unknown> = {}) => ({
  mutationId: randomUUID(),
  expectedVersion: 1,
  content: "Fictional corrected comment",
  mentionIds: [],
  ...fields
});
const headers = (actor: Actor) => ({
  Authorization: "Bearer " + actor.token,
  "X-Expected-Account": actor.id,
  "Content-Type": "application/json"
});
function request(target: Target, actor: Actor, body: BodyInit) {
  return new Request(
    new URL(
      `/api/platform/v1/posts/${target.postId}/comments/${target.commentId}`,
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
async function call(
  target: Target,
  actor: Actor,
  input: object,
  afterEdit?: (id: string) => void
) {
  return result(
    await handleNativeCommentEditRequest(
      db,
      request(target, actor, JSON.stringify(input)),
      target,
      afterEdit
    )
  );
}
function ok(r: Awaited<ReturnType<typeof call>>, owner: string) {
  assert.equal(r.response.status, 200, JSON.stringify(r.value));
  return decodeApiResponse("editComment", r.value, owner).data;
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
  const owner = await createPortalActor(db, "editowner"),
    author = await createPortalActor(db, "editauthor");
  const post = await db.platformPost.create({
    data: {
      authorId: owner.id,
      content: "Fictional correction source",
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

test("concurrent native and canonical retries correct once without changing author, audience or structure", async () => {
  const f = await fixture(),
    original = await row(f.comment.id),
    input = change({ content: "a\r\n".repeat(750) }),
    handoffs: string[] = [];
  const replies = await Promise.all([
    call(f.target, f.author, input, (id) => {
      handoffs.push(id);
    }),
    call(f.target, f.author, input, (id) => {
      handoffs.push(id);
    })
  ]);
  const receipt = ok(replies[0], f.author.id);
  assert.deepEqual(ok(replies[1], f.author.id), receipt);
  assert.deepEqual(handoffs, [f.comment.id, f.comment.id]);
  assert.deepEqual(
    await commentCommand(db, f.author.token, {
      operation: "edit",
      ...input,
      ...f.target
    }),
    receipt
  );
  const saved = await row(f.comment.id);
  assert.equal(saved.content, "a\n".repeat(750).trim());
  assert.equal(saved.version, 2);
  assert.ok(saved.editedAt);
  for (const key of [
    "authorId",
    "authorChurchId",
    "postId",
    "parentId",
    "rootId",
    "topicCommunityId",
    "groupId",
    "createdAt"
  ] as const)
    assert.deepEqual(saved[key], original[key]);
  assert.equal(
    await db.platformPostComment.count({ where: { postId: f.post.id } }),
    1
  );
  assert.equal(
    await db.socialOperation.count({
      where: { ownerId: f.author.id, key: "comments:" + input.mutationId }
    }),
    1
  );
  assert.equal(
    await db.privateCommentDraft.count({ where: { ownerId: f.author.id } }),
    0
  );
  const projected = (await thread(f.post.id, f.author)).items[0];
  assert.ok(projected.available && !projected.requiresWeb);
  assert.equal(projected.content, saved.content);
  assert.equal(projected.editedAt, saved.editedAt.toISOString());
  assert.equal(projected.version, 2);
  assert.equal(projected.canEdit, true);
  denied(
    await call(f.target, f.author, { ...input, content: saved.content }),
    409,
    "conflict"
  );
  denied(
    await call({ ...f.target, commentId: "different" }, f.author, input),
    409,
    "conflict"
  );
  denied(
    await call({ ...f.target, postId: "different" }, f.author, input),
    409,
    "conflict"
  );
  denied(
    await call(f.target, f.author, change({ expectedVersion: 1 })),
    409,
    "conflict"
  );
  for (const content of ["x".repeat(1501), "  a  "])
    denied(
      await call(f.target, f.author, change({ expectedVersion: 2, content })),
      400,
      "validation"
    );
  const later = change({
    expectedVersion: 2,
    content: "Later fictional correction"
  });
  assert.equal(
    ok(await call(f.target, f.author, later), f.author.id).version,
    3
  );
  assert.deepEqual(
    ok(await call(f.target, f.author, input), f.author.id),
    receipt
  );
  assert.equal((await row(f.comment.id)).content, later.content);
  assert.equal((await row(f.comment.id)).version, 3);
});

test("fresh corrections require the current author and readable, reply-enabled source", async () => {
  const notAuthor = await fixture();
  denied(
    await call(notAuthor.target, notAuthor.owner, change()),
    403,
    "forbidden"
  );
  assert.equal((await row(notAuthor.comment.id)).version, 1);
  for (const loss of [
    "closed",
    "withdrawn",
    "block",
    "membership",
    "reply-membership",
    "hidden",
    "deleted"
  ]) {
    const f = await fixture(),
      input = change();
    let churchId: string | null = null;
    if (loss.endsWith("membership")) {
      const church = await db.church.create({
        data: {
          slug: "edit-private-" + randomUUID(),
          name: "Fictional edit audience",
          summary: "Isolated audience"
        }
      });
      churchId = church.id;
      await db.churchConnection.create({
        data: { churchId, userId: f.author.id, state: "APPROVED" }
      });
      await db.platformPost.update({
        where: { id: f.post.id },
        data: {
          audience: loss === "membership" ? "CHURCH" : "PUBLIC",
          audienceChurchId: churchId,
          replyAudience: "CHURCH_MEMBERS"
        }
      });
    }
    const receipt = ok(await call(f.target, f.author, input), f.author.id);
    if (loss === "closed")
      await db.platformPost.update({
        where: { id: f.post.id },
        data: { discussionClosed: true }
      });
    if (loss === "withdrawn")
      await db.platformPost.update({
        where: { id: f.post.id },
        data: { status: "WITHDRAWN", withdrawnAt: new Date() }
      });
    if (loss === "block")
      await db.socialRelationship.create({
        data: { ownerId: f.owner.id, targetUserId: f.author.id, blocked: true }
      });
    if (churchId)
      await db.churchConnection.update({
        where: { userId_churchId: { churchId, userId: f.author.id } },
        data: { state: "REMOVED" }
      });
    if (loss === "hidden")
      await db.platformPostComment.update({
        where: { id: f.comment.id },
        data: { moderationState: "HIDDEN" }
      });
    if (loss === "deleted")
      await commentCommand(
        db,
        f.author.token,
        command("delete", { ...f.target, expectedVersion: 2 })
      );
    const saved = await row(f.comment.id),
      forbidden = loss === "closed" || loss === "reply-membership";
    denied(
      await call(
        f.target,
        f.author,
        change({ expectedVersion: saved.version })
      ),
      forbidden ? 403 : 404,
      forbidden ? "forbidden" : "not_found"
    );
    // An ordinary historical receipt acknowledges the earlier edit only.
    assert.deepEqual(
      ok(await call(f.target, f.author, input), f.author.id),
      receipt
    );
    assert.deepEqual(await row(f.comment.id), saved);
  }
});

test("church corrections preserve the speaking church and require a current publisher", async () => {
  const f = await fixture(),
    publisher = await createPortalActor(db, "editpublisher"),
    mentioned = await createPortalActor(db, "editchurchmention");
  const church = await db.church.create({
    data: {
      slug: "edit-church-" + randomUUID(),
      name: "Fictional speaking church",
      summary: "Isolated speaker"
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
  const comment = await commentCommand(
    db,
    f.author.token,
    command("create", {
      postId: f.post.id,
      content: "Original church statement",
      authorChurchId: church.id
    })
  );
  // Consent follows the publisher who selects the mention, including when the
  // original author is explicitly mentioned by a different church publisher.
  for (const recipient of [mentioned, f.author]) {
    await db.socialPreferences.create({
      data: { ownerId: recipient.id, mentions: "FOLLOWED" }
    });
    await db.platformFollow.create({
      data: { followerId: recipient.id, followingId: publisher.id }
    });
  }
  const target = { postId: f.post.id, commentId: comment.id },
    input = change({ mentionIds: [mentioned.id, f.author.id] });
  ok(await call(target, publisher, input), publisher.id);
  const saved = await row(comment.id);
  assert.equal(saved.authorId, f.author.id);
  assert.equal(saved.authorChurchId, church.id);
  const projected = (await thread(f.post.id, f.owner)).items.find(
    (item) => item.id === comment.id
  )!;
  assert.ok(projected.available && !projected.requiresWeb);
  assert.deepEqual(projected.author, {
    kind: "church",
    id: church.id,
    name: church.name
  });
  const { mentions: projectedMentions, ...sourceProjection } = projected;
  assert.deepEqual(
    projectedMentions.map((person) => person.id).sort(),
    [mentioned.id, f.author.id].sort()
  );
  assert.ok(!JSON.stringify(sourceProjection).includes(f.author.id));
  assert.ok(!JSON.stringify(projected).includes(publisher.id));
  assert.equal(
    await db.socialEvent.count({
      where: {
        commentId: comment.id,
        recipientId: mentioned.id,
        kind: "COMMENT_ACTIVITY"
      }
    }),
    1,
    "A current church publisher's new mention must reach canonical Activity."
  );
  const events = await db.socialEvent.findMany({
    where: {
      commentId: comment.id,
      kind: "COMMENT_ACTIVITY",
      recipientId: { in: [mentioned.id, f.author.id] }
    }
  });
  assert.equal(events.length, 2);
  for (const event of events) {
    assert.equal(event.actorId, publisher.id);
    assert.equal(event.notificationCategory, "mentions");
    assert.equal(
      (await commentNotificationSource(db, event, true))?.category,
      "mentions"
    );
    for (const notificationCategory of [
      null,
      "",
      "replies",
      "conversations",
      "prayer"
    ])
      assert.equal(
        await commentNotificationSource(
          db,
          { ...event, notificationCategory },
          false
        ),
        null
      );
    assert.equal(
      await commentNotificationSource(
        db,
        { ...event, actorId: f.owner.id },
        false
      ),
      null
    );
  }
  const activity = await readActivity(db, mentioned.token);
  assert.equal(activity.items[0].available, true);
  assert.equal(activity.items[0].summary, "Latest from " + church.name);
  assert.equal(activity.unread, 1);
  const mentionedEvent = events.find(
    (event) => event.recipientId === mentioned.id
  )!;
  await db.socialRelationship.create({
    data: { ownerId: mentioned.id, churchId: church.id, muted: true }
  });
  assert.equal((await readActivity(db, mentioned.token)).items.length, 0);
  assert.equal((await readActivity(db, mentioned.token)).unread, 0);
  assert.equal(await commentNotificationSource(db, mentionedEvent, true), null);
  await db.socialRelationship.deleteMany({
    where: { ownerId: mentioned.id, churchId: church.id }
  });
  for (const ownerId of [mentioned.id, publisher.id]) {
    const targetUserId = ownerId === mentioned.id ? publisher.id : mentioned.id;
    await db.socialRelationship.create({
      data: { ownerId, targetUserId, blocked: true }
    });
    assert.equal(
      await commentNotificationSource(db, mentionedEvent, false),
      null
    );
    assert.equal(
      await commentNotificationSource(db, mentionedEvent, true),
      null
    );
    await db.socialRelationship.deleteMany({
      where: { ownerId, targetUserId }
    });
  }
  await db.platformFollow.deleteMany({
    where: { followerId: mentioned.id, followingId: publisher.id }
  });
  assert.equal(await commentNotificationSource(db, mentionedEvent, true), null);
  await db.socialPreferences.update({
    where: { ownerId: mentioned.id },
    data: { mentions: "NOBODY" }
  });
  assert.equal(
    await commentNotificationSource(db, mentionedEvent, false),
    null
  );
  await db.socialPreferences.update({
    where: { ownerId: mentioned.id },
    data: { mentions: "EVERYONE" }
  });
  assert.equal(
    (await commentNotificationSource(db, mentionedEvent, true))?.category,
    "mentions"
  );
  ok(await call(target, publisher, input), publisher.id);
  assert.equal(
    await db.socialEvent.count({
      where: {
        commentId: comment.id,
        recipientId: mentioned.id,
        kind: "COMMENT_ACTIVITY"
      }
    }),
    1
  );
  await db.churchCapabilityGrant.deleteMany({
    where: { churchId: church.id, userId: publisher.id }
  });
  assert.equal(
    (await commentNotificationSource(db, mentionedEvent, true))?.category,
    "mentions"
  );
  denied(
    await call(target, publisher, change({ expectedVersion: 2 })),
    403,
    "forbidden"
  );
  assert.deepEqual(await row(comment.id), saved);
});

test("mention corrections add each intent once, retire removed mentions and never repeat follower publication", async () => {
  const f = await fixture(),
    first = await createPortalActor(db, "editmentionone"),
    second = await createPortalActor(db, "editmentiontwo");
  await commentCommand(
    db,
    f.owner.token,
    command("conversation", {
      postId: f.post.id,
      expectedVersion: 0,
      mode: "FOLLOW"
    })
  );
  const originalEvents = await db.socialEvent.findMany({
    where: { commentId: f.comment.id, kind: "COMMENT_CREATED" }
  });
  const input = change({ mentionIds: [first.id, second.id] });
  ok(await call(f.target, f.author, input), f.author.id);
  denied(
    await call(f.target, f.author, {
      ...input,
      mentionIds: [second.id, first.id]
    }),
    409,
    "conflict"
  );
  for (const mentionIds of [[], [first.id], [first.id, second.id]]) {
    const current = await row(f.comment.id);
    ok(
      await call(
        f.target,
        f.author,
        change({ expectedVersion: current.version, mentionIds })
      ),
      f.author.id
    );
    assert.deepEqual(
      (
        await db.commentMention.findMany({
          where: { commentId: f.comment.id, active: true },
          select: { recipientId: true }
        })
      )
        .map((mention) => mention.recipientId)
        .sort(),
      [...mentionIds].sort()
    );
  }
  assert.equal(
    await db.commentMention.count({
      where: { commentId: f.comment.id, active: true }
    }),
    2
  );
  for (const recipientId of [first.id, second.id]) {
    assert.equal(
      await db.socialEvent.count({
        where: { key: `mention:${f.comment.id}:${recipientId}` }
      }),
      1
    );
    assert.equal(
      await db.socialEvent.count({
        where: {
          commentId: f.comment.id,
          recipientId,
          kind: "COMMENT_ACTIVITY"
        }
      }),
      1
    );
  }
  assert.equal(
    await db.commentFollowerJob.count({ where: { commentId: f.comment.id } }),
    0
  );
  assert.deepEqual(
    await db.socialEvent.findMany({
      where: { commentId: f.comment.id, kind: "COMMENT_CREATED" }
    }),
    originalEvents
  );
  const saved = await row(f.comment.id);
  for (const mentionIds of [
    [first.id, first.id],
    [f.author.id],
    ["missing-recipient"]
  ]) {
    const rejected = change({ expectedVersion: saved.version, mentionIds });
    denied(await call(f.target, f.author, rejected), 400, "validation");
    assert.equal(
      await db.socialOperation.count({
        where: { key: "comments:" + rejected.mutationId }
      }),
      0
    );
    assert.deepEqual(await row(f.comment.id), saved);
  }
  await db.socialPreferences.create({
    data: { ownerId: first.id, mentions: "NOBODY" }
  });
  denied(
    await call(
      f.target,
      f.author,
      change({ expectedVersion: saved.version, mentionIds: [first.id] })
    ),
    400,
    "validation"
  );
  assert.deepEqual(await row(f.comment.id), saved);
  assert.equal(
    await db.commentMention.count({
      where: { commentId: f.comment.id, active: true }
    }),
    2
  );
});

test("original account is checked before body use and again under the canonical lock, including receipt replay", async () => {
  for (const replay of [false, true]) {
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
          await handleNativeCommentEditRequest(
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
      await handleNativeCommentEditRequest(
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

test("edit admission shares the website comment rate bucket and rejects a denied body before consumption", async () => {
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
          body: JSON.stringify({ operation: "edit" })
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
    await handleNativeCommentEditRequest(
      db,
      request(f.target, f.author, body),
      f.target
    )
  );
  denied(response, 429, "rate_limited");
  assert.equal(response.response.headers.get("retry-after"), "900");
  assert.equal(pulls, 0);
});

test("a lost post-commit edit handoff remains uncertain and exact retry cannot apply the correction twice", async () => {
  const f = await fixture(),
    input = change(),
    ids: string[] = [];
  denied(
    await call(f.target, f.author, input, () => {
      throw Error("Fictional handoff lost");
    }),
    503,
    "unconfirmed"
  );
  const saved = await row(f.comment.id);
  assert.equal(saved.version, 2);
  const receipt = ok(
    await call(f.target, f.author, input, (id) => {
      ids.push(id);
    }),
    f.author.id
  );
  assert.equal(receipt.id, f.comment.id);
  assert.equal(receipt.version, 2);
  assert.deepEqual(ids, [f.comment.id]);
  assert.deepEqual(await row(f.comment.id), saved);
  assert.equal(
    await db.socialOperation.count({
      where: { key: "comments:" + input.mutationId }
    }),
    1
  );
});

test("Topic restrictions deny both new edits and historical edit receipts", async () => {
  const f = await fixture(),
    slug = "native-edit-topic-" + randomUUID();
  const topic = await topicCommand(
    db,
    f.owner.token,
    command("create", {
      name: "Fictional edit topic " + randomUUID(),
      slug,
      description: "Isolated corrections",
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
  const post = await postCommand(db, f.owner.token, {
    operation: "create",
    requestKey: randomUUID(),
    topicCommunityId: topic.id,
    content: "Fictional Topic correction source",
    allowReposts: true
  });
  const comment = await commentCommand(
    db,
    f.author.token,
    command("create", { postId: post.id, content: "Original Topic comment" })
  );
  const target = { postId: post.id, commentId: comment.id },
    input = change();
  ok(await call(target, f.author, input), f.author.id);
  const membership = await db.topicMembership.findUniqueOrThrow({
    where: {
      communityId_userId: { communityId: topic.id, userId: f.author.id }
    }
  });
  await topicCommand(
    db,
    f.owner.token,
    command("restrict", {
      communityId: topic.id,
      targetId: f.author.id,
      expectedVersion: membership.version,
      desired: true,
      reason: "RULES"
    })
  );
  denied(await call(target, f.author, input), 403, "forbidden");
  denied(
    await call(target, f.author, change({ expectedVersion: 2 })),
    403,
    "forbidden"
  );
  assert.equal((await row(comment.id)).version, 2);
});

test("group membership loss denies new edits and historical edit receipts", async () => {
  const f = await fixture(),
    slug = "native-edit-group-" + randomUUID();
  const group = await groupCommand(
    db,
    f.owner.token,
    command("create", {
      schema: 1,
      slug,
      acceptedRules: true,
      leaderDisclosure: true,
      fields: {
        name: "Fictional edit group " + randomUUID(),
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
  const post = await postCommand(db, f.owner.token, {
    operation: "create",
    requestKey: randomUUID(),
    groupId: group.id,
    audience: "GROUP",
    groupThreadKind: "DISCUSSION",
    groupCategory: "GENERAL",
    content: "Fictional private group correction source"
  });
  const comment = await commentCommand(
    db,
    f.author.token,
    command("create", { postId: post.id, content: "Original group comment" })
  );
  const target = { postId: post.id, commentId: comment.id },
    input = change();
  ok(await call(target, f.author, input), f.author.id);
  const member = await db.gatherGroupMembership.findUniqueOrThrow({
    where: { groupId_userId: { groupId: group.id, userId: f.author.id } }
  });
  await groupCommand(
    db,
    f.owner.token,
    command("decide", {
      groupId: group.id,
      targetId: f.author.id,
      expectedVersion: member.version,
      state: "REMOVED",
      reason: "Fictional explicit membership removal"
    })
  );
  denied(await call(target, f.author, input), 404, "not_found");
  denied(
    await call(target, f.author, change({ expectedVersion: 2 })),
    404,
    "not_found"
  );
  assert.equal((await row(comment.id)).version, 2);
});
