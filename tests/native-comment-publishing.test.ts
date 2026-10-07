import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import {
  handleNativeCommentCreateRequest,
  handleNativeCommentReadRequest
} from "../lib/platform/native-comment-boundary";
import { commentCommand } from "../lib/platform/comment-commands";
import { apiFailure, decodeApiResponse } from "../lib/platform/api-contracts";
import { hashSessionToken } from "../lib/platform/auth";
import { accountConfig } from "../lib/platform/account-config";
import { socialWriteInput } from "../lib/platform/social-boundary";
import { PortalError } from "../lib/platform/portal-policy";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import { advanceCommentFollowers } from "../lib/platform/comment-followers";
import {
  notificationPreferenceCommand,
  readNotificationPreferences
} from "../lib/platform/notification-preferences";
import { deliverNotification } from "../lib/platform/notification-outbox";
import { seedNotificationDevice } from "./seed-notifications";
import webpush from "web-push";
import { topicCommand, readTopic } from "../lib/platform/topic-communities";
import { groupCommand } from "../lib/platform/group-commands";
import { readGroup } from "../lib/platform/group-reads";
import { postCommand } from "../lib/platform/post-commands";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
type Actor = { id: string; token: string };
const command = (operation: string, fields: Record<string, unknown>) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const change = (fields: Record<string, unknown> = {}) => ({
  mutationId: randomUUID(),
  content: "Fictional native publication",
  replyToId: null,
  authorChurchId: null,
  mentionIds: [],
  ...fields
});
const headers = (actor: Actor) => ({
  Authorization: "Bearer " + actor.token,
  "X-Expected-Account": actor.id,
  "Content-Type": "application/json"
});
function request(postId: string, actor: Actor, body: BodyInit) {
  return new Request(
    new URL(
      "/api/platform/v1/posts/" + postId + "/comments",
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
  postId: string,
  actor: Actor,
  input: object,
  afterCreate?: (id: string) => void
) {
  return result(
    await handleNativeCommentCreateRequest(
      db,
      request(postId, actor, JSON.stringify(input)),
      { postId },
      afterCreate
    )
  );
}
function ok(r: Awaited<ReturnType<typeof call>>, owner: string) {
  assert.equal(r.response.status, 200, JSON.stringify(r.value));
  return decodeApiResponse("createComment", r.value, owner).data;
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
  const owner = await createPortalActor(db, "publishowner"),
    reader = await createPortalActor(db, "publishreader");
  const post = await db.platformPost.create({
    data: {
      authorId: owner.id,
      content: "Fictional native publication source",
      publishedAt: new Date()
    }
  });
  return { owner, reader, post };
}
async function thread(postId: string, actor: Actor) {
  const response = await handleNativeCommentReadRequest(
    db,
    new Request(
      new URL(
        "/api/platform/v1/posts/" + postId + "/comments",
        process.env.ACCOUNT_ORIGIN!
      ),
      { headers: headers(actor) }
    ),
    { postId }
  );
  assert.equal(response.status, 200);
  return decodeApiResponse("comments", await response.json(), actor.id).data;
}

test("native and canonical retries publish once, preserve the raw fingerprint and create no implicit draft", async () => {
  const f = await fixture(),
    input = change({ content: "a\r\n".repeat(750) }),
    handoffs: string[] = [];
  const replies = await Promise.all([
    call(f.post.id, f.reader, input, (id) => {
      handoffs.push(id);
    }),
    call(f.post.id, f.reader, input, (id) => {
      handoffs.push(id);
    })
  ]);
  const receipt = ok(replies[0], f.reader.id);
  assert.deepEqual(ok(replies[1], f.reader.id), receipt);
  assert.deepEqual(handoffs, [receipt.id, receipt.id]);
  assert.deepEqual(
    await commentCommand(db, f.reader.token, {
      operation: "create",
      ...input,
      postId: f.post.id
    }),
    receipt
  );
  const saved = await db.platformPostComment.findUniqueOrThrow({
    where: { id: receipt.id }
  });
  assert.equal(saved.content, "a\n".repeat(750).trim());
  assert.equal(saved.version, 1);
  assert.equal(
    await db.platformPostComment.count({ where: { postId: f.post.id } }),
    1
  );
  assert.equal(
    await db.socialOperation.count({
      where: { ownerId: f.reader.id, key: "comments:" + input.mutationId }
    }),
    1
  );
  assert.equal(
    await db.socialEvent.count({
      where: { kind: "COMMENT_CREATED", commentId: receipt.id }
    }),
    1
  );
  assert.equal(
    await db.privateCommentDraft.count({ where: { ownerId: f.reader.id } }),
    0
  );
  assert.deepEqual(Object.keys(receipt).sort(), ["id", "message", "version"]);
  denied(
    await call(f.post.id, f.reader, { ...input, content: saved.content }),
    409,
    "conflict"
  );
  denied(await call("different-post", f.reader, input), 409, "conflict");
  denied(
    await call(f.post.id, f.reader, change({ content: "a".repeat(1501) })),
    400,
    "validation"
  );
  denied(
    await call(f.post.id, f.reader, change({ content: "  a  " })),
    400,
    "validation"
  );
  assert.equal(
    await db.platformPostComment.count({ where: { postId: f.post.id } }),
    1
  );
});

test("native replies use canonical one-level roots and refuse unrelated or unavailable targets", async () => {
  const f = await fixture();
  const root = ok(await call(f.post.id, f.owner, change()), f.owner.id);
  const child = ok(
    await call(f.post.id, f.reader, change({ replyToId: root.id })),
    f.reader.id
  );
  const nested = ok(
    await call(f.post.id, f.owner, change({ replyToId: child.id })),
    f.owner.id
  );
  const saved = await db.platformPostComment.findUniqueOrThrow({
    where: { id: nested.id }
  });
  assert.equal(saved.parentId, child.id);
  assert.equal(saved.rootId, root.id);
  const other = await db.platformPost.create({
    data: { authorId: f.owner.id, content: "Unrelated fictional post" }
  });
  denied(
    await call(other.id, f.reader, change({ replyToId: root.id })),
    404,
    "not_found"
  );
  await commentCommand(
    db,
    f.owner.token,
    command("delete", {
      postId: f.post.id,
      commentId: root.id,
      expectedVersion: 1
    })
  );
  denied(
    await call(f.post.id, f.reader, change({ replyToId: root.id })),
    404,
    "not_found"
  );
  await db.platformPostComment.update({
    where: { id: child.id },
    data: { moderationState: "HIDDEN" }
  });
  denied(
    await call(f.post.id, f.owner, change({ replyToId: child.id })),
    404,
    "not_found"
  );
  assert.equal(
    await db.platformPostComment.count({ where: { postId: other.id } }),
    0
  );
  assert.equal(
    await db.platformPostComment.count({ where: { postId: f.post.id } }),
    3
  );
});

test("fresh publication rechecks closed replies, withdrawal, blocks and private membership while receipts stay historical", async () => {
  for (const loss of [
    "closed",
    "withdrawn",
    "block",
    "membership",
    "reply-membership"
  ]) {
    const f = await fixture(),
      input = change();
    let churchId: string | null = null;
    if (loss.endsWith("membership")) {
      const church = await db.church.create({
        data: {
          slug: "native-publish-" + randomUUID(),
          name: "Fictional publication church",
          summary: "Isolated source"
        }
      });
      churchId = church.id;
      await db.churchConnection.create({
        data: { churchId, userId: f.reader.id, state: "APPROVED" }
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
    const receipt = ok(await call(f.post.id, f.reader, input), f.reader.id);
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
        data: { ownerId: f.owner.id, targetUserId: f.reader.id, blocked: true }
      });
    if (churchId)
      await db.churchConnection.update({
        where: { userId_churchId: { churchId, userId: f.reader.id } },
        data: { state: "REMOVED" }
      });
    const forbidden = loss === "closed" || loss === "reply-membership";
    denied(
      await call(f.post.id, f.reader, change()),
      forbidden ? 403 : 404,
      forbidden ? "forbidden" : "not_found"
    );
    assert.deepEqual(
      ok(await call(f.post.id, f.reader, input), f.reader.id),
      receipt
    );
    assert.equal(
      await db.platformPostComment.count({ where: { postId: f.post.id } }),
      1
    );
  }
});

test("church publication requires current speaking authority and readers see no internal publisher", async () => {
  const f = await fixture();
  const church = await db.church.create({
    data: {
      slug: "native-speaker-" + randomUUID(),
      name: "Fictional speaking church",
      summary: "Isolated speaker"
    }
  });
  const input = change({ authorChurchId: church.id });
  denied(await call(f.post.id, f.reader, input), 403, "forbidden");
  await db.churchConnection.create({
    data: { churchId: church.id, userId: f.reader.id, state: "APPROVED" }
  });
  const grant = await db.churchCapabilityGrant.create({
    data: {
      churchId: church.id,
      userId: f.reader.id,
      capability: "PUBLISH_CHURCH_POSTS"
    }
  });
  const receipt = ok(await call(f.post.id, f.reader, input), f.reader.id);
  const row = (await thread(f.post.id, f.owner)).items.find(
    (item) => item.id === receipt.id
  )!;
  assert.ok(row.available && !row.requiresWeb);
  assert.equal(row.author.kind, "church");
  assert.ok(row.author.kind === "church");
  assert.equal(row.author.id, church.id);
  assert.ok(!JSON.stringify(row).includes(f.reader.id));
  await db.churchCapabilityGrant.delete({ where: { id: grant.id } });
  denied(
    await call(f.post.id, f.reader, change({ authorChurchId: church.id })),
    403,
    "forbidden"
  );
  assert.equal(
    await db.platformPostComment.count({ where: { postId: f.post.id } }),
    1
  );
});

test("native mentions use current preferences and source access with atomic rejection", async () => {
  const f = await fixture(),
    recipient = await createPortalActor(db, "publishmention"),
    outsider = await createPortalActor(db, "publishoutsider");
  const receipt = ok(
    await call(f.post.id, f.reader, change({ mentionIds: [recipient.id] })),
    f.reader.id
  );
  assert.equal(
    await db.commentMention.count({
      where: { commentId: receipt.id, recipientId: recipient.id, active: true }
    }),
    1
  );
  for (const mentionIds of [
    [recipient.id, recipient.id],
    [f.reader.id],
    ["missing-recipient"]
  ]) {
    const input = change({ mentionIds });
    denied(await call(f.post.id, f.reader, input), 400, "validation");
    assert.equal(
      await db.socialOperation.count({
        where: { key: "comments:" + input.mutationId }
      }),
      0
    );
  }
  await db.socialPreferences.create({
    data: { ownerId: outsider.id, mentions: "NOBODY" }
  });
  denied(
    await call(f.post.id, f.reader, change({ mentionIds: [outsider.id] })),
    400,
    "validation"
  );
  await db.socialPreferences.update({
    where: { ownerId: outsider.id },
    data: { mentions: "EVERYONE" }
  });
  await db.socialRelationship.create({
    data: { ownerId: recipient.id, targetUserId: f.reader.id, blocked: true }
  });
  denied(
    await call(f.post.id, f.reader, change({ mentionIds: [recipient.id] })),
    400,
    "validation"
  );
  const church = await db.church.create({
    data: {
      slug: "native-mention-" + randomUUID(),
      name: "Fictional private mention",
      summary: "Isolated audience"
    }
  });
  await db.churchConnection.create({
    data: { churchId: church.id, userId: f.reader.id, state: "APPROVED" }
  });
  await db.platformPost.update({
    where: { id: f.post.id },
    data: { audience: "CHURCH", audienceChurchId: church.id }
  });
  denied(
    await call(f.post.id, f.reader, change({ mentionIds: [outsider.id] })),
    400,
    "validation"
  );
  assert.equal(
    await db.platformPostComment.count({ where: { postId: f.post.id } }),
    1
  );
  assert.equal(
    await db.socialEvent.count({
      where: { kind: "COMMENT_CREATED", postId: f.post.id }
    }),
    1
  );
});

test("original session ownership is rechecked under the command lock after body consumption", async () => {
  for (const loss of ["owner", "expiry", "revoke"]) {
    const f = await fixture(),
      input = change(),
      tokenHash = hashSessionToken(f.reader.token);
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
        await handleNativeCommentCreateRequest(
          db,
          request(f.post.id, f.reader, body),
          { postId: f.post.id }
        )
      ),
      401,
      loss === "owner" ? "account_changed" : "unauthenticated"
    );
    assert.equal(pulls, 1);
    assert.equal(
      await db.platformPostComment.count({ where: { postId: f.post.id } }),
      0
    );
    assert.equal(
      await db.socialOperation.count({
        where: { key: "comments:" + input.mutationId }
      }),
      0
    );
  }
});

test("native publishing shares the website comment rate bucket before reading a denied body", async () => {
  const f = await fixture();
  const key = createHmac("sha256", accountConfig().rateSecret + ":comments")
    .update("post-workspace:" + f.reader.id)
    .digest("hex");
  await db.platformAuthLimit.create({
    data: { key, hits: 239, expiresAt: new Date(Date.now() + 900000) }
  });
  ok(await call(f.post.id, f.reader, change()), f.reader.id);
  await assert.rejects(
    socialWriteInput(
      db,
      new Request(
        new URL("/api/platform/comments", process.env.ACCOUNT_ORIGIN!),
        {
          method: "POST",
          headers: {
            Origin: process.env.ACCOUNT_ORIGIN!,
            Cookie: sessionCookieFixtureName() + "=" + f.reader.token,
            "X-Expected-Account": f.reader.id,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ operation: "create" })
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
  const r = await result(
    await handleNativeCommentCreateRequest(
      db,
      request(f.post.id, f.reader, body),
      { postId: f.post.id }
    )
  );
  denied(r, 429, "rate_limited");
  assert.equal(r.response.headers.get("retry-after"), "900");
  assert.equal(pulls, 0);
});

test("lost publication handoff is uncertain and exact retry retains one canonical comment", async () => {
  const f = await fixture(),
    input = change();
  denied(
    await call(f.post.id, f.reader, input, () => {
      throw Error("Fictional handoff lost");
    }),
    503,
    "unconfirmed"
  );
  const handoffs: string[] = [];
  const receipt = ok(
    await call(f.post.id, f.reader, input, (id) => {
      handoffs.push(id);
    }),
    f.reader.id
  );
  assert.deepEqual(handoffs, [receipt.id]);
  assert.equal(
    await db.platformPostComment.count({ where: { postId: f.post.id } }),
    1
  );
  assert.equal(
    await db.socialEvent.count({
      where: { commentId: receipt.id, kind: "COMMENT_CREATED" }
    }),
    1
  );
  assert.equal(
    await db.socialOperation.count({
      where: { key: "comments:" + input.mutationId }
    }),
    1
  );
});

test("native publication uses the existing follower job and one recipient intent for reply, mention and follow", async () => {
  const names = [
    "PUSH_ENABLED",
    "PUSH_VAPID_PUBLIC_KEY",
    "PUSH_VAPID_PRIVATE_KEY",
    "PUSH_VAPID_SUBJECT"
  ];
  const previous = Object.fromEntries(
    names.map((name) => [name, process.env[name]])
  );
  const keys = webpush.generateVAPIDKeys();
  Object.assign(process.env, {
    PUSH_ENABLED: "true",
    PUSH_VAPID_PUBLIC_KEY: keys.publicKey,
    PUSH_VAPID_PRIVATE_KEY: keys.privateKey,
    PUSH_VAPID_SUBJECT: "https://example.test/contact"
  });
  try {
    const f = await fixture(),
      follower = await createPortalActor(db, "publishfollower");
    for (const [actor, categories] of [
      [f.owner, ["replies", "mentions", "conversations"]],
      [follower, ["conversations"]]
    ] as const) {
      await seedNotificationDevice(db, actor);
      const prefs = await readNotificationPreferences(db, actor.token);
      await notificationPreferenceCommand(
        db,
        actor.token,
        command("preferences", {
          ownerId: actor.id,
          expectedVersion: prefs.preferences.version,
          inApp: prefs.preferences.inApp,
          pushCategories: [...categories],
          quietHours: null
        })
      );
      await commentCommand(
        db,
        actor.token,
        command("conversation", {
          postId: f.post.id,
          mode: "FOLLOW",
          expectedVersion: 0
        })
      );
    }
    const input = change({ mentionIds: [f.owner.id] });
    const receipt = ok(await call(f.post.id, f.reader, input), f.reader.id);
    assert.equal(
      await db.commentFollowerJob.count({ where: { commentId: receipt.id } }),
      1
    );
    const queued: string[] = [];
    const advanced = await advanceCommentFollowers(
      db,
      receipt.id,
      async (id) => {
        queued.push(id);
      }
    );
    assert.equal(advanced.done, true);
    assert.equal(advanced.failed, 0);
    const rows = await db.notificationDelivery.findMany({
      where: { event: { commentId: receipt.id } },
      include: { event: true }
    });
    assert.equal(rows.length, 2);
    assert.deepEqual(
      new Set(rows.map((row) => row.event.recipientId)),
      new Set([f.owner.id, follower.id])
    );
    assert.deepEqual(new Set(queued), new Set(rows.map((row) => row.id)));
    assert.deepEqual(
      ok(await call(f.post.id, f.reader, input), f.reader.id),
      receipt
    );
    await advanceCommentFollowers(db, receipt.id, async () => {
      assert.fail("No second dispatch");
    });
    for (const actor of [f.owner, follower])
      assert.equal(
        await db.socialEvent.count({
          where: {
            commentId: receipt.id,
            recipientId: actor.id,
            kind: "COMMENT_ACTIVITY"
          }
        }),
        1
      );
    await db.socialRelationship.create({
      data: { ownerId: follower.id, targetUserId: f.reader.id, blocked: true }
    });
    for (const row of rows) {
      let sends = 0;
      const delivered = await deliverNotification(
        db,
        row.id,
        async (_subscription, payload) => {
          sends++;
          assert.deepEqual(Object.keys(payload).sort(), ["deliveryId", "tag"]);
          return 201;
        }
      );
      const blocked = row.event.recipientId === follower.id;
      assert.deepEqual(delivered, {
        done: true,
        outcome: blocked ? "cancelled" : "accepted"
      });
      assert.equal(sends, blocked ? 0 : 1);
    }
    assert.equal(
      await db.notificationDelivery.count({
        where: { event: { commentId: receipt.id } }
      }),
      2
    );
  } finally {
    for (const name of names)
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
  }
});

test("Topic restriction denies both new publication and exact receipt replay", async () => {
  const f = await fixture(),
    slug = "native-publishing-" + randomUUID();
  const topic = await topicCommand(
    db,
    f.owner.token,
    command("create", {
      name: "Fictional native publication topic " + randomUUID(),
      slug,
      description: "Isolated native publication checks",
      rules: "Respect the members and protect private information.",
      acceptedRules: true
    })
  );
  const view = await readTopic(db, f.reader.token, slug);
  await topicCommand(
    db,
    f.reader.token,
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
    content: "Fictional Topic publication source",
    allowReposts: true
  });
  const comment = await commentCommand(
    db,
    f.owner.token,
    command("create", { postId: post.id, content: "Fictional Topic reply" })
  );
  const input = change({ replyToId: comment.id });
  ok(await call(post.id, f.reader, input), f.reader.id);
  const membership = await db.topicMembership.findUniqueOrThrow({
    where: {
      communityId_userId: { communityId: topic.id, userId: f.reader.id }
    }
  });
  await topicCommand(
    db,
    f.owner.token,
    command("restrict", {
      communityId: topic.id,
      targetId: f.reader.id,
      expectedVersion: membership.version,
      desired: true,
      reason: "RULES"
    })
  );
  denied(await call(post.id, f.reader, input), 403, "forbidden");
  denied(await call(post.id, f.reader, change()), 403, "forbidden");
  assert.equal(
    await db.platformPostComment.count({ where: { postId: post.id } }),
    2
  );
});

test("group membership loss denies new publication and old publication receipt", async () => {
  const f = await fixture(),
    slug = "native-publishing-group-" + randomUUID();
  const group = await groupCommand(
    db,
    f.owner.token,
    command("create", {
      schema: 1,
      slug,
      acceptedRules: true,
      leaderDisclosure: true,
      fields: {
        name: "Fictional native publication group " + randomUUID(),
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
  const view = await readGroup(db, f.reader.token, slug);
  await groupCommand(
    db,
    f.reader.token,
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
    content: "Fictional private group publication source"
  });
  const comment = await commentCommand(
    db,
    f.owner.token,
    command("create", { postId: post.id, content: "Fictional group reply" })
  );
  const input = change({ replyToId: comment.id });
  ok(await call(post.id, f.reader, input), f.reader.id);
  const member = await db.gatherGroupMembership.findUniqueOrThrow({
    where: { groupId_userId: { groupId: group.id, userId: f.reader.id } }
  });
  await groupCommand(
    db,
    f.owner.token,
    command("decide", {
      groupId: group.id,
      targetId: f.reader.id,
      expectedVersion: member.version,
      state: "REMOVED",
      reason: "Fictional explicit membership removal"
    })
  );
  denied(await call(post.id, f.reader, input), 404, "not_found");
  denied(await call(post.id, f.reader, change()), 404, "not_found");
});
