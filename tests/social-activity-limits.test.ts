import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedPortal
} from "./seed-portal";
import { accountConfig } from "../lib/platform/account-config";
import { PortalError } from "../lib/platform/portal-policy";
import { postCommand } from "../lib/platform/post-commands";
import { postWorkspaceCommand as workspace } from "../lib/platform/post-workspace";
import {
  commentCommand,
  commentMentionIds
} from "../lib/platform/comment-commands";
import { relationshipCommand } from "../lib/platform/relationships";
import { repostCommand } from "../lib/platform/reposts";
import { handlePostRequest } from "../lib/platform/post-boundary";
import {
  handlePostWorkspaceRequest,
  workspaceError
} from "../lib/platform/post-workspace-boundary";

const db = new PrismaClient();
const variables = [
  "COMMUNITY_POSTS_PER_HOUR",
  "COMMUNITY_COMMENTS_PER_10_MINUTES",
  "COMMUNITY_FOLLOWS_PER_HOUR"
];
const initial = variables.map((k) => process.env[k]);
before(() => assertPortalTestDatabase(db));
beforeEach(() => {
  for (const k of variables) delete process.env[k];
});
after(async () => {
  variables.forEach((k, i) => {
    if (initial[i] === undefined) delete process.env[k];
    else process.env[k] = initial[i];
  });
  await db.$disconnect();
});
const m = (operation: string, fields: Record<string, unknown> = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const publish = (token: string, fields: Record<string, unknown> = {}) =>
  postCommand(db, token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "A fictional repeatable reflection.",
    ...fields
  });
const key = (ownerId: string, activity: string) =>
  createHmac("sha256", accountConfig().rateSecret)
    .update(`activity:community-${activity}:${ownerId}`)
    .digest("hex");
const bucket = (ownerId: string, activity: string) =>
  db.platformAuthLimit.findUnique({ where: { key: key(ownerId, activity) } });
const denied = (promise: Promise<unknown>, status: number) =>
  assert.rejects(
    promise,
    (e: unknown) => e instanceof PortalError && e.status === status
  );
async function limited(promise: Promise<unknown>, seconds: number) {
  await assert.rejects(promise, (e: unknown) => {
    assert.ok(e instanceof PortalError);
    assert.equal(e.status, 429);
    assert.ok(e.retryAfter! > 0 && e.retryAfter! <= seconds);
    assert.match(e.message, /Try again in \d+ minutes?\./);
    assert.equal(
      workspaceError(e).headers.get("Retry-After"),
      String(e.retryAfter)
    );
    return true;
  });
}
const request = (
  path: string,
  actor: { token: string; id: string },
  body: object
) =>
  new Request(accountConfig().origin + path, {
    method: "POST",
    headers: {
      Origin: accountConfig().origin,
      "Content-Type": "application/json",
      Cookie: `church_platform_session=${actor.token}`,
      "X-Expected-Account": actor.id,
      "X-Real-IP": "192.0.2.20"
    },
    body: JSON.stringify(body)
  });

test("ten committed posts share one account budget; exact direct retries survive quota and edited content while changed bodies conflict", async () => {
  const author = await createPortalActor(db, "postbudget");
  const input = {
    operation: "create",
    requestKey: "a".repeat(100),
    content: "The original exact request.",
    linkUrl: ""
  };
  const [first, same] = await Promise.all([
    postCommand(db, author.token, input),
    postCommand(db, author.token, input)
  ]);
  assert.equal(first.id, same.id);
  for (let i = 1; i < 10; i++) await publish(author.token);
  assert.equal((await bucket(author.id, "post"))!.hits, 10);
  await limited(publish(author.token), 3600);
  assert.equal((await bucket(author.id, "post"))!.hits, 10);
  await postCommand(db, author.token, {
    operation: "edit",
    postId: first.id,
    expectedVersion: 1,
    content: "A later legitimate edit."
  });
  assert.equal((await postCommand(db, author.token, input)).id, first.id);
  await denied(
    postCommand(db, author.token, {
      ...input,
      content: "Changed payload at the full limit"
    }),
    409
  );
  assert.equal(
    await db.platformPost.count({ where: { authorId: author.id } }),
    10
  );
  assert.equal((await bucket(author.id, "post"))!.hits, 10);
  await db.platformAuthLimit.update({
    where: { key: key(author.id, "post") },
    data: { expiresAt: new Date(Date.now() - 1000) }
  });
  await publish(author.token);
  assert.equal((await bucket(author.id, "post"))!.hits, 1);
});

test("private publication, quote posts and plain reposts share posting quota; autosave, replay, duplicate repost and undo remain available", async () => {
  const f = await seedPortal(db);
  process.env.COMMUNITY_POSTS_PER_HOUR = "3";
  const source = await publish(f.memberA.token, { allowReposts: true });
  const author = f.memberB;
  const draftId = randomUUID();
  const payload = {
    content: "Private draft with content choices",
    contentNote: "A note",
    safeExcerpt: "A short preview",
    audience: "PUBLIC",
    replyAudience: "VIEWERS",
    type: "UPDATE",
    topics: [],
    scripture: "",
    authorChurchId: null,
    audienceChurchId: null,
    eventOccurrenceId: null,
    linkUrl: "",
    photos: []
  };
  await workspace(
    db,
    author.token,
    m("save-draft", { id: draftId, expectedVersion: 0, payload })
  );
  assert.equal(await bucket(author.id, "post"), null);
  const publishInput = m("publish-draft", { id: draftId, expectedVersion: 1 });
  const saved = await workspace(db, author.token, publishInput);
  const repostInput = m("repost", {
    sourceId: source.id,
    expectedSourceVersion: 1,
    audience: "PUBLIC"
  });
  const repost = await repostCommand(db, author.token, repostInput);
  await publish(author.token, { quoteSourceId: source.id, audience: "PUBLIC" });
  assert.equal((await bucket(author.id, "post"))!.hits, 3);
  assert.equal(
    (await workspace(db, author.token, publishInput)).postId,
    saved.postId
  );
  assert.equal(
    (
      await repostCommand(db, author.token, {
        ...repostInput,
        mutationId: randomUUID()
      })
    ).id,
    repost.id
  );
  await denied(
    workspace(db, author.token, { ...publishInput, expectedVersion: 2 }),
    409
  );
  await repostCommand(
    db,
    author.token,
    m("undo", { id: repost.id, expectedVersion: 1 })
  );
  await limited(
    repostCommand(db, author.token, {
      ...repostInput,
      mutationId: randomUUID()
    }),
    3600
  );
  const next = randomUUID();
  await workspace(
    db,
    author.token,
    m("save-draft", { id: next, expectedVersion: 0, payload })
  );
  const response = await handlePostWorkspaceRequest(
    db,
    request(
      "/api/platform/workspace",
      author,
      m("publish-draft", { id: next, expectedVersion: 1 })
    )
  );
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get("Retry-After")) > 0);
  const retained = await db.privatePostDraft.findUniqueOrThrow({
    where: { ownerId_id: { ownerId: author.id, id: next } }
  });
  assert.equal(retained.deletedAt, null);
  assert.deepEqual(retained.payload, payload);
  assert.equal((await bucket(author.id, "post"))!.hits, 3);
});

test("thirty comments are admitted; private drafts, edits, retries and invalid mention validation do not consume fresh activity", async () => {
  const f = await seedPortal(db),
    author = f.memberB;
  const post = await publish(f.memberA.token);
  assert.throws(
    () => commentMentionIds(Array.from({ length: 6 }, () => randomUUID())),
    /at most five/
  );
  assert.throws(
    () => commentMentionIds([author.id, author.id]),
    /each mention once/
  );
  await denied(
    commentCommand(
      db,
      author.token,
      m("create", {
        postId: post.id,
        content: "Invalid chosen mention",
        mentionIds: [randomUUID()]
      })
    ),
    400
  );
  assert.equal(await bucket(author.id, "comment"), null);
  const draftId = randomUUID();
  await commentCommand(
    db,
    author.token,
    m("draft-save", {
      postId: post.id,
      draftId,
      expectedVersion: 0,
      content: "A retained comment draft",
      mentionIds: []
    })
  );
  assert.equal(await bucket(author.id, "comment"), null);
  const original = m("create", {
    postId: post.id,
    draftId,
    draftVersion: 1,
    content: "A retained comment draft",
    mentionIds: []
  });
  const first = await commentCommand(db, author.token, original);
  for (let i = 1; i < 30; i++)
    await commentCommand(
      db,
      author.token,
      m("create", {
        postId: post.id,
        content: "Another intentional fictional comment"
      })
    );
  await limited(
    commentCommand(
      db,
      author.token,
      m("create", { postId: post.id, content: "Keep this comment" })
    ),
    600
  );
  assert.equal((await commentCommand(db, author.token, original)).id, first.id);
  await denied(
    commentCommand(db, author.token, {
      ...original,
      content: "Changed replay body"
    }),
    409
  );
  await commentCommand(
    db,
    author.token,
    m("edit", {
      postId: post.id,
      commentId: first.id,
      expectedVersion: 1,
      content: "A legitimate correction",
      mentionIds: []
    })
  );
  assert.equal((await bucket(author.id, "comment"))!.hits, 30);
  assert.equal(
    await db.platformPostComment.count({
      where: { postId: post.id, authorId: author.id }
    }),
    30
  );
});

test("parallel comments cannot overshoot a configured ceiling; denied sources do not spend a slot", async () => {
  const f = await seedPortal(db),
    author = f.memberB;
  const post = await publish(f.memberA.token);
  process.env.COMMUNITY_COMMENTS_PER_10_MINUTES = "3";
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () =>
      commentCommand(
        db,
        author.token,
        m("create", {
          postId: post.id,
          content: "Concurrent fictional comment"
        })
      )
    )
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 3);
  for (const r of results)
    if (r.status === "rejected") {
      assert.ok(r.reason instanceof PortalError);
      assert.equal(r.reason.status, 429);
    }
  assert.equal((await bucket(author.id, "comment"))!.hits, 3);
  await db.platformPost.update({
    where: { id: post.id },
    data: { discussionClosed: true }
  });
  await denied(
    commentCommand(
      db,
      author.token,
      m("create", { postId: post.id, content: "Closed discussion" })
    ),
    403
  );
  assert.equal((await bucket(author.id, "comment"))!.hits, 3);
});

test("person and church follows share one quota; repeated desired state, exact retries, unfollow and block do not consume more", async () => {
  const f = await seedPortal(db),
    author = f.memberA;
  process.env.COMMUNITY_FOLLOWS_PER_HOUR = "2";
  const input = m("follow", {
    kind: "person",
    targetId: f.memberB.id,
    expectedVersion: 0,
    desired: true
  });
  const first = await relationshipCommand(db, author.token, input);
  await relationshipCommand(
    db,
    author.token,
    m("follow", {
      kind: "church",
      targetId: f.churchA.id,
      expectedVersion: 0,
      desired: true
    })
  );
  await limited(
    relationshipCommand(
      db,
      author.token,
      m("follow", {
        kind: "person",
        targetId: f.contact.id,
        expectedVersion: 0,
        desired: true
      })
    ),
    3600
  );
  assert.equal(
    (await relationshipCommand(db, author.token, input)).id,
    first.id
  );
  await denied(
    relationshipCommand(db, author.token, { ...input, desired: false }),
    409
  );
  const repeated = await relationshipCommand(db, author.token, {
    ...input,
    mutationId: randomUUID(),
    expectedVersion: first.version
  });
  const off = await relationshipCommand(db, author.token, {
    ...input,
    mutationId: randomUUID(),
    expectedVersion: repeated.version,
    desired: false
  });
  await limited(
    relationshipCommand(db, author.token, {
      ...input,
      mutationId: randomUUID(),
      expectedVersion: off.version
    }),
    3600
  );
  await relationshipCommand(
    db,
    author.token,
    m("block", {
      kind: "person",
      targetId: f.contact.id,
      expectedVersion: 0,
      desired: true
    })
  );
  assert.equal((await bucket(author.id, "follow"))!.hits, 2);
});

test("invalid activity configuration fails closed, preserves private drafts and committed retry receipts, and does not spend quota", async () => {
  const f = await seedPortal(db),
    author = f.memberA;
  const input = {
    operation: "create",
    requestKey: randomUUID(),
    content: "Committed before configuration changes"
  };
  const first = await postCommand(db, author.token, input);
  for (const value of ["", "0", "-1", "1.5", "101", "unlimited"]) {
    process.env.COMMUNITY_POSTS_PER_HOUR = value;
    await denied(publish(author.token), 503);
    assert.equal((await postCommand(db, author.token, input)).id, first.id);
  }
  process.env.COMMUNITY_COMMENTS_PER_10_MINUTES = "301";
  await denied(
    commentCommand(
      db,
      f.memberB.token,
      m("create", { postId: first.id, content: "Preserved comment" })
    ),
    503
  );
  process.env.COMMUNITY_FOLLOWS_PER_HOUR = "NaN";
  await denied(
    relationshipCommand(
      db,
      author.token,
      m("follow", {
        kind: "person",
        targetId: f.memberB.id,
        expectedVersion: 0,
        desired: true
      })
    ),
    503
  );
  assert.equal((await bucket(author.id, "post"))!.hits, 1);
  assert.equal(await bucket(f.memberB.id, "comment"), null);
  assert.equal(await bucket(author.id, "follow"), null);
});

test("signed-in posting does not borrow the shared-IP sign-in cap; direct 429 has Retry-After and no-store", async () => {
  const f = await seedPortal(db);
  const authors = [f.memberA, f.memberB, f.contact, f.coordinator];
  for (const actor of authors)
    for (let i = 0; i < 8; i++) {
      const response = await handlePostRequest(
        db,
        request("/api/platform/posts", actor, {
          operation: "create",
          requestKey: randomUUID(),
          content: "Fictional church Wi-Fi post"
        })
      );
      assert.equal(response.status, 200, await response.text());
    }
  for (let i = 0; i < 2; i++) await publish(authors[0].token);
  const response = await handlePostRequest(
    db,
    request("/api/platform/posts", authors[0], {
      operation: "create",
      requestKey: randomUUID(),
      content: "Keep this post at the limit"
    })
  );
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get("Retry-After")) > 0);
  assert.match(response.headers.get("Cache-Control")!, /no-store/);
  assert.match((await response.json()).message, /Keep your draft/);
  assert.equal((await bucket(authors[0].id, "post"))!.hits, 10);
  assert.equal((await bucket(authors[1].id, "post"))!.hits, 8);
});

test("historical canonical post retries preserve prior behavior and current church authority still gates new receipt replay", async () => {
  const f = await seedPortal(db),
    author = f.coordinator;
  const old = await db.platformPost.create({
    data: {
      authorId: author.id,
      requestKey: randomUUID(),
      content: "Pre-fingerprint canonical post"
    }
  });
  const result = await postCommand(db, author.token, {
    operation: "create",
    requestKey: old.requestKey,
    content: "Historical request body is not available",
    linkUrl: ""
  });
  assert.equal(result.id, old.id);
  assert.equal(await bucket(author.id, "post"), null);
  const input = {
    operation: "create",
    requestKey: randomUUID(),
    authorChurchId: f.churchA.id,
    content: "Authorized church post"
  };
  await db.churchCapabilityGrant.create({
    data: {
      churchId: f.churchA.id,
      userId: author.id,
      capability: "PUBLISH_CHURCH_POSTS"
    }
  });
  const first = await postCommand(db, author.token, input);
  await db.churchCapabilityGrant.updateMany({
    where: {
      churchId: f.churchA.id,
      userId: author.id,
      capability: "PUBLISH_CHURCH_POSTS"
    },
    data: { revokedAt: new Date() }
  });
  await denied(postCommand(db, author.token, input), 403);
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: first.id } }))
      .content,
    input.content
  );
});
