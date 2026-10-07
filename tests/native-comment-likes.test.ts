import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import {
  handleNativeCommentLikeRequest,
  handleNativeCommentReadRequest
} from "../lib/platform/native-comment-boundary";
import { commentCommand } from "../lib/platform/comment-commands";
import { AccountSessionOwnerError } from "../lib/platform/account-sessions";
import { apiFailure, decodeApiResponse } from "../lib/platform/api-contracts";
import { accountConfig } from "../lib/platform/account-config";
import { socialWriteInput } from "../lib/platform/social-boundary";
import { PortalError } from "../lib/platform/portal-policy";
import { hashSessionToken } from "../lib/platform/auth";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import { topicCommand, readTopic } from "../lib/platform/topic-communities";
import { groupCommand } from "../lib/platform/group-commands";
import { readGroup } from "../lib/platform/group-reads";
import { postCommand } from "../lib/platform/post-commands";
import { seedReactionCounts, setAuthorCounts } from "./reaction-count-fixture";
import webpush from "web-push";
import { seedNotificationDevice } from "./seed-notifications";
import {
  notificationPreferenceCommand,
  readNotificationPreferences
} from "../lib/platform/notification-preferences";
import { dispatchNotifications } from "../lib/platform/notification-queue";
import { deliverNotification } from "../lib/platform/notification-outbox";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
type Actor = { id: string; token: string };
const change = (desired = true, expectedVersion = 0) => ({
  mutationId: randomUUID(),
  desired,
  expectedVersion
});
const command = (operation: string, fields: Record<string, unknown>) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const nativeHeaders = (actor: Actor) => ({
  Authorization: "Bearer " + actor.token,
  "X-Expected-Account": actor.id,
  "Content-Type": "application/json"
});
function request(
  postId: string,
  commentId: string,
  actor: Actor | null,
  body: BodyInit,
  extra: Record<string, string> = {}
) {
  return new Request(
    new URL(
      "/api/platform/v1/posts/" + postId + "/comments/" + commentId + "/like",
      process.env.ACCOUNT_ORIGIN!
    ),
    {
      method: "POST",
      headers: {
        ...(actor
          ? nativeHeaders(actor)
          : { "Content-Type": "application/json" }),
        ...extra
      },
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
  commentId: string,
  actor: Actor | null,
  input: object,
  extra: Record<string, string> = {},
  afterLike?: (id: string) => void
) {
  return result(
    await handleNativeCommentLikeRequest(
      db,
      request(postId, commentId, actor, JSON.stringify(input), extra),
      { postId, commentId },
      afterLike
    )
  );
}
function ok(r: Awaited<ReturnType<typeof call>>, owner: string) {
  assert.equal(r.response.status, 200, JSON.stringify(r.value));
  return decodeApiResponse("setCommentLike", r.value, owner).data;
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
  const owner = await createPortalActor(db, "clikeowner"),
    reader = await createPortalActor(db, "clikereader");
  const post = await db.platformPost.create({
    data: {
      authorId: owner.id,
      content: "Fictional comment Like source",
      publishedAt: new Date()
    }
  });
  const comment = await db.platformPostComment.create({
    data: {
      authorId: owner.id,
      postId: post.id,
      content: "Fictional comment Like target"
    }
  });
  return { owner, reader, post, comment };
}
const savedLike = (commentId: string, userId: string) =>
  db.commentLike.findUniqueOrThrow({
    where: { commentId_userId: { commentId, userId } }
  });

test("concurrent native and website retries share one receipt and never undo a later Unlike", async () => {
  const f = await fixture(),
    input = change(),
    handoffs: string[] = [];
  const replies = await Promise.all([
    call(f.post.id, f.comment.id, f.reader, input, {}, (id) => {
      handoffs.push(id);
    }),
    call(f.post.id, f.comment.id, f.reader, input, {}, (id) => {
      handoffs.push(id);
    })
  ]);
  const receipt = ok(replies[0], f.reader.id);
  assert.deepEqual(ok(replies[1], f.reader.id), receipt);
  assert.equal(receipt.id, f.comment.id);
  assert.deepEqual(handoffs, [f.comment.id, f.comment.id]);
  const webInput = {
    operation: "like",
    ...input,
    postId: f.post.id,
    commentId: f.comment.id
  };
  assert.deepEqual(await commentCommand(db, f.reader.token, webInput), receipt);
  assert.equal((await savedLike(f.comment.id, f.reader.id)).version, 1);
  assert.equal(
    await db.socialOperation.count({
      where: { ownerId: f.reader.id, key: "comments:" + input.mutationId }
    }),
    1
  );
  assert.equal(
    await db.socialEvent.count({
      where: {
        kind: "COMMENT_REACTION",
        commentId: f.comment.id,
        actorId: f.reader.id
      }
    }),
    1
  );
  denied(
    await call(f.post.id, f.comment.id, f.reader, { ...input, desired: false }),
    409,
    "conflict"
  );
  const other = await db.platformPostComment.create({
    data: {
      authorId: f.owner.id,
      postId: f.post.id,
      content: "Other fictional target"
    }
  });
  denied(await call(f.post.id, other.id, f.reader, input), 409, "conflict");
  denied(
    await call("different-post", f.comment.id, f.reader, input),
    409,
    "conflict"
  );
  denied(
    await call(f.post.id, f.comment.id, f.reader, change(false)),
    409,
    "conflict"
  );
  ok(
    await call(f.post.id, f.comment.id, f.reader, change(false, 1)),
    f.reader.id
  );
  assert.deepEqual(
    ok(await call(f.post.id, f.comment.id, f.reader, input), f.reader.id),
    receipt
  );
  assert.equal((await savedLike(f.comment.id, f.reader.id)).active, false);
  assert.equal((await savedLike(f.comment.id, f.reader.id)).version, 2);
  assert.equal(
    await db.socialEvent.count({
      where: { kind: "COMMENT_REACTION", commentId: f.comment.id }
    }),
    1
  );
});

test("fresh Like writes recheck withdrawal, comment deletion, bilateral blocks and private church membership", async () => {
  for (const loss of ["withdrawal", "comment", "block", "membership"]) {
    const f = await fixture(),
      input = change();
    let churchId: string | null = null;
    if (loss === "membership") {
      const church = await db.church.create({
        data: {
          slug: "like-" + randomUUID(),
          name: "Fictional private church",
          summary: "Isolated source"
        }
      });
      churchId = church.id;
      await db.churchConnection.create({
        data: { churchId, userId: f.reader.id, state: "APPROVED" }
      });
      await db.platformPost.update({
        where: { id: f.post.id },
        data: { audience: "CHURCH", audienceChurchId: churchId }
      });
    }
    const receipt = ok(
      await call(f.post.id, f.comment.id, f.reader, input),
      f.reader.id
    );
    if (loss === "withdrawal")
      await db.platformPost.update({
        where: { id: f.post.id },
        data: { status: "WITHDRAWN", withdrawnAt: new Date() }
      });
    if (loss === "comment")
      await commentCommand(
        db,
        f.owner.token,
        command("delete", {
          postId: f.post.id,
          commentId: f.comment.id,
          expectedVersion: f.comment.version
        })
      );
    if (loss === "block")
      await db.socialRelationship.create({
        data: { ownerId: f.owner.id, targetUserId: f.reader.id, blocked: true }
      });
    if (loss === "membership")
      await db.churchConnection.update({
        where: {
          userId_churchId: { userId: f.reader.id, churchId: churchId! }
        },
        data: { state: "REMOVED" }
      });
    denied(
      await call(f.post.id, f.comment.id, f.reader, change(false, 1)),
      404,
      "not_found"
    );
    // Canonical ordinary receipts remain historical after access is lost.
    assert.deepEqual(
      ok(await call(f.post.id, f.comment.id, f.reader, input), f.reader.id),
      receipt
    );
    assert.deepEqual(Object.keys(receipt).sort(), ["id", "message", "version"]);
  }
});

test("Topic restrictions gate positive receipt replay while permitting a current Unlike", async () => {
  const f = await fixture(),
    slug = "native-likes-" + randomUUID();
  const topic = await topicCommand(
    db,
    f.owner.token,
    command("create", {
      name: "Fictional native Like topic " + randomUUID(),
      slug,
      description: "Isolated native Like checks",
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
    content: "Fictional Topic Like source",
    allowReposts: true
  });
  const comment = await commentCommand(
    db,
    f.owner.token,
    command("create", { postId: post.id, content: "Fictional Topic reply" })
  );
  const input = change();
  ok(await call(post.id, comment.id, f.reader, input), f.reader.id);
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
  denied(await call(post.id, comment.id, f.reader, input), 403, "forbidden");
  ok(await call(post.id, comment.id, f.reader, change(false, 1)), f.reader.id);
  assert.equal((await savedLike(comment.id, f.reader.id)).active, false);
});

test("group membership loss denies both new Like work and an old positive receipt", async () => {
  const f = await fixture(),
    slug = "native-like-group-" + randomUUID();
  const group = await groupCommand(
    db,
    f.owner.token,
    command("create", {
      schema: 1,
      slug,
      acceptedRules: true,
      leaderDisclosure: true,
      fields: {
        name: "Fictional native Like group " + randomUUID(),
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
    content: "Fictional private group Like source"
  });
  const comment = await commentCommand(
    db,
    f.owner.token,
    command("create", { postId: post.id, content: "Fictional group reply" })
  );
  const input = change();
  ok(await call(post.id, comment.id, f.reader, input), f.reader.id);
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
  denied(await call(post.id, comment.id, f.reader, input), 404, "not_found");
  denied(
    await call(post.id, comment.id, f.reader, change(false, 1)),
    404,
    "not_found"
  );
});

test("native Like receipts do not reveal hidden totals or a church publisher, and reading retains current state", async () => {
  const f = await seedReactionCounts(db);
  await setAuthorCounts(db, f.a, true);
  const input = change();
  const receipt = ok(
    await call(f.churchPost.id, f.comment.id, f.b, input),
    f.b.id
  );
  assert.deepEqual(Object.keys(receipt).sort(), ["id", "message", "version"]);
  const response = await handleNativeCommentReadRequest(
    db,
    new Request(
      new URL(
        "/api/platform/v1/posts/" + f.churchPost.id + "/comments",
        process.env.ACCOUNT_ORIGIN!
      ),
      { headers: nativeHeaders(f.b) }
    ),
    { postId: f.churchPost.id }
  );
  const thread = decodeApiResponse(
    "comments",
    await response.json(),
    f.b.id
  ).data;
  const row = thread.items.find((item) => item.id === f.comment.id)!;
  assert.ok(row.available && !row.requiresWeb);
  assert.equal(row.likeCount, null);
  assert.deepEqual(row.ownReaction, { liked: true, version: 1 });
  const churchReceipt = ok(
    await call(f.churchPost.id, f.churchComment.id, f.b, change()),
    f.b.id
  );
  assert.ok(!JSON.stringify(churchReceipt).includes(f.a.id));
  assert.equal(
    await db.socialEvent.count({
      where: {
        kind: "COMMENT_REACTION",
        commentId: f.churchComment.id,
        actorId: f.b.id
      }
    }),
    0
  );
});

test("original owner is required inside the canonical lock even after early native identity verification", async () => {
  for (const loss of ["owner", "expiry", "revoke"]) {
    const f = await fixture(),
      input = change(),
      tokenHash = hashSessionToken(f.reader.token);
    await assert.rejects(
      commentCommand(
        db,
        f.reader.token,
        {
          operation: "like",
          ...input,
          postId: f.post.id,
          commentId: f.comment.id
        },
        f.owner.id
      ),
      AccountSessionOwnerError
    );
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
    const r = await result(
      await handleNativeCommentLikeRequest(
        db,
        request(f.post.id, f.comment.id, f.reader, body),
        { postId: f.post.id, commentId: f.comment.id }
      )
    );
    denied(r, 401, loss === "owner" ? "account_changed" : "unauthenticated");
    assert.equal(pulls, 1);
    assert.equal(
      await db.commentLike.count({ where: { commentId: f.comment.id } }),
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

test("native comment Likes share the website rate budget before consuming a rejected body", async () => {
  const f = await fixture();
  const key = createHmac("sha256", accountConfig().rateSecret + ":comments")
    .update("post-workspace:" + f.reader.id)
    .digest("hex");
  await db.platformAuthLimit.create({
    data: { key, hits: 239, expiresAt: new Date(Date.now() + 900000) }
  });
  ok(await call(f.post.id, f.comment.id, f.reader, change()), f.reader.id);
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
          body: JSON.stringify({ operation: "like" })
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
    await handleNativeCommentLikeRequest(
      db,
      request(f.post.id, f.comment.id, f.reader, body),
      { postId: f.post.id, commentId: f.comment.id }
    )
  );
  denied(r, 429, "rate_limited");
  assert.equal(r.response.headers.get("retry-after"), "900");
  assert.equal(pulls, 0);
});

test("lost postcommit handoff remains uncertain and exact retry returns the one committed result", async () => {
  const f = await fixture(),
    input = change();
  denied(
    await call(f.post.id, f.comment.id, f.reader, input, {}, () => {
      throw Error("Fictional handoff interrupted");
    }),
    503,
    "unconfirmed"
  );
  const handoffs: string[] = [];
  const receipt = ok(
    await call(f.post.id, f.comment.id, f.reader, input, {}, (id) => {
      handoffs.push(id);
    }),
    f.reader.id
  );
  assert.equal(receipt.version, 1);
  assert.deepEqual(handoffs, [f.comment.id]);
  assert.equal(
    await db.socialEvent.count({
      where: { kind: "COMMENT_REACTION", commentId: f.comment.id }
    }),
    1
  );
  assert.equal(
    await db.socialOperation.count({
      where: { ownerId: f.reader.id, key: "comments:" + input.mutationId }
    }),
    1
  );
  assert.equal((await savedLike(f.comment.id, f.reader.id)).version, 1);
});

test("comment-id dispatch owns one private reaction intent and cancels changed access before local delivery", async () => {
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
    for (const loss of ["none", "unlike", "withdrawal", "block"]) {
      const f = await fixture();
      await seedNotificationDevice(db, f.owner);
      const prefs = await readNotificationPreferences(db, f.owner.token);
      await notificationPreferenceCommand(
        db,
        f.owner.token,
        command("preferences", {
          ownerId: f.owner.id,
          expectedVersion: prefs.preferences.version,
          inApp: prefs.preferences.inApp,
          pushCategories: ["reactions"],
          quietHours: null
        })
      );
      const input = change();
      const receipt = ok(
        await call(f.post.id, f.comment.id, f.reader, input),
        f.reader.id
      );
      const rows = await db.notificationDelivery.findMany({
        where: { event: { commentId: f.comment.id, kind: "COMMENT_REACTION" } },
        include: { event: true }
      });
      assert.equal(rows.length, 1);
      assert.notEqual(rows[0].event.sourceId, receipt.id);
      assert.equal(rows[0].event.commentId, receipt.id);
      const queued: string[] = [];
      assert.deepEqual(
        await dispatchNotifications(db, receipt.id, async (id) => {
          queued.push(id);
        }),
        { queued: 1, failed: 0 }
      );
      assert.deepEqual(queued, [rows[0].id]);
      if (loss === "unlike")
        ok(
          await call(f.post.id, f.comment.id, f.reader, change(false, 1)),
          f.reader.id
        );
      if (loss === "withdrawal")
        await db.platformPost.update({
          where: { id: f.post.id },
          data: { withdrawnAt: new Date(), status: "WITHDRAWN" }
        });
      if (loss === "block")
        await db.socialRelationship.create({
          data: {
            ownerId: f.owner.id,
            targetUserId: f.reader.id,
            blocked: true
          }
        });
      let sends = 0;
      const delivered = await deliverNotification(
        db,
        rows[0].id,
        async (_subscription, payload) => {
          sends++;
          assert.deepEqual(Object.keys(payload).sort(), ["deliveryId", "tag"]);
          return 201;
        }
      );
      assert.deepEqual(delivered, {
        done: true,
        outcome: loss === "none" ? "accepted" : "cancelled"
      });
      assert.equal(sends, loss === "none" ? 1 : 0);
      await deliverNotification(db, rows[0].id, async () => {
        assert.fail("No duplicate provider delivery");
      });
      assert.deepEqual(
        ok(await call(f.post.id, f.comment.id, f.reader, input), f.reader.id),
        receipt
      );
      assert.equal(
        await db.socialEvent.count({
          where: { kind: "COMMENT_REACTION", commentId: f.comment.id }
        }),
        1
      );
      if (loss === "unlike") {
        ok(
          await call(f.post.id, f.comment.id, f.reader, change(true, 2)),
          f.reader.id
        );
        assert.equal(
          await db.socialEvent.count({
            where: { kind: "COMMENT_REACTION", commentId: f.comment.id }
          }),
          1
        );
        assert.equal(
          await db.notificationDelivery.count({
            where: { event: { commentId: f.comment.id } }
          }),
          1
        );
      }
    }
    const self = await fixture();
    ok(
      await call(self.post.id, self.comment.id, self.owner, change()),
      self.owner.id
    );
    assert.equal(
      await db.socialEvent.count({
        where: { kind: "COMMENT_REACTION", commentId: self.comment.id }
      }),
      0
    );
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test("malformed and changed-owner inputs never write, and forged path targets remain unrelated", async () => {
  const f = await fixture(),
    input = change();
  denied(
    await call(f.post.id, f.comment.id, null, input),
    401,
    "unauthenticated"
  );
  denied(
    await call(f.post.id, f.comment.id, f.reader, input, {
      "X-Expected-Account": f.owner.id
    }),
    401,
    "account_changed"
  );
  for (const fields of [
    { desired: "true" },
    { mutationId: "a".repeat(81) },
    { expectedVersion: -1 },
    { ownerId: f.owner.id },
    { commentId: "other" },
    { operation: "delete" },
    { content: "x".repeat(17000) }
  ])
    denied(
      await call(f.post.id, f.comment.id, f.reader, { ...input, ...fields }),
      400,
      "validation"
    );
  denied(await call(f.post.id, "unrelated", f.reader, input), 404, "not_found");
  denied(
    await call("unrelated", f.comment.id, f.reader, input),
    404,
    "not_found"
  );
  assert.equal(
    await db.commentLike.count({ where: { commentId: f.comment.id } }),
    0
  );
});
