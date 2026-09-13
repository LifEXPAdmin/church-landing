import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  seedPortal,
  createPortalActor,
  seedOperatorGrants
} from "./seed-portal";
import {
  communityReportCommand as rawCommand,
  readCommunityReports as read
} from "../lib/platform/community-reports";
import {
  getPost,
  listPosts,
  getProfilePosts
} from "../lib/platform/post-reads";
import { readComments } from "../lib/platform/comment-reads";
import { postCommand } from "../lib/platform/post-commands";
import { PortalError } from "../lib/platform/portal-policy";
import { postContext } from "../lib/platform/post-access";
import { readableImageTarget } from "../lib/platform/media-access";
import { readableAssetWhere } from "../lib/platform/personal-photo-policy";
import { readActivity, openActivity } from "../lib/platform/activity";
import { communitySearch } from "../lib/platform/community-search";
import { publicSharePreview } from "../lib/platform/public-sharing";
import sharp from "sharp";
import { uploadImage, readImage } from "../lib/platform/media";
import { readPostGallery } from "../lib/platform/post-gallery";
import {
  postWorkspaceCommand,
  readPostWorkspace
} from "../lib/platform/post-workspace";
import { repostCommand } from "../lib/platform/reposts";
import { commentCommand } from "../lib/platform/comment-commands";
import { notificationSource } from "../lib/platform/notification-source";
const db = new PrismaClient();
const command = (...args: Parameters<typeof rawCommand>) =>
  Promise.resolve().then(() => rawCommand(...args));
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const denied = (p: Promise<unknown>, status: number) =>
  assert.rejects(
    p,
    (e: unknown) => e instanceof PortalError && e.status === status
  );
async function fixture(church = false) {
  const f = await seedPortal(db),
    reviewer = await createPortalActor(db, "moderation");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  await db.churchCapabilityGrant.createMany({
    data: [
      {
        userId: f.coordinator.id,
        churchId: f.churchA.id,
        capability: "MODERATE_CHURCH_POSTS"
      },
      {
        userId: f.memberB.id,
        churchId: f.churchB.id,
        capability: "MODERATE_CHURCH_POSTS"
      }
    ]
  });
  const post = await db.platformPost.create({
    data: {
      authorId: f.memberA.id,
      content: "Fictional moderated source " + randomUUID(),
      audienceChurchId: f.churchA.id,
      audience: church ? "CHURCH" : "PUBLIC",
      replyAudience: "CHURCH_MEMBERS",
      allowReposts: true
    }
  });
  const report = await db.communityReport.create({
    data: {
      reporterId: f.contact.id,
      targetType: "POST",
      targetId: post.id,
      targetVersion: 1,
      scopeChurchId: church ? f.churchA.id : null,
      reason: "PRIVACY",
      details: "Private reporter context " + randomUUID()
    }
  });
  const review = (token = reviewer.token) =>
    read(db, token, { view: "review", id: report.id });
  const body = async (action = "HIDE", token = reviewer.token) => {
    const view = await review(token);
    return {
      operation: "moderate",
      mutationId: randomUUID(),
      id: report.id,
      expectedVersion: view.report!.version,
      expectedSourceVersion: view.source!.version,
      expectedContextVersion: view.source!.contextVersion,
      action,
      authorReason: ["RESTORE", "NO_VIOLATION"].includes(action)
        ? "NO_VIOLATION"
        : "PRIVATE_INFORMATION",
      decisionReason: "Private reviewer rationale " + randomUUID()
    };
  };
  return { ...f, reviewer, post, report, body, review };
}
test("one restriction reaches saved items, reposts, real image reads and pending comment notifications without copying media", async () => {
  const f = await fixture();
  const files = new Map<string, Buffer>();
  const storage = {
    async put(path: string, data: Buffer) {
      files.set(path, data);
    },
    async get(path: string) {
      return files.get(path) ?? null;
    },
    async delete(paths: string[]) {
      paths.forEach((path) => files.delete(path));
    }
  };
  const bytes = await sharp({
    create: { width: 80, height: 60, channels: 3, background: "blue" }
  })
    .png()
    .toBuffer();
  await uploadImage(
    db,
    f.memberA.token,
    {
      purpose: "POST_PHOTO",
      targetId: f.post.id,
      requestKey: randomUUID(),
      alt: "Fictional selected image"
    },
    bytes,
    storage
  );
  const gallery = await readPostGallery(db, f.contact.token, f.post.id);
  assert.equal(gallery.images.length, 1);
  assert.ok(
    await readImage(db, f.contact.token, gallery.images[0].id, "thumb", storage)
  );
  const current = await db.platformPost.findUniqueOrThrow({
    where: { id: f.post.id }
  });
  const repost = await repostCommand(db, f.contact.token, {
    operation: "repost",
    mutationId: randomUUID(),
    sourceId: f.post.id,
    expectedSourceVersion: current.version
  });
  await postWorkspaceCommand(db, f.contact.token, {
    operation: "save-item",
    mutationId: randomUUID(),
    postId: f.post.id,
    expectedVersion: 0
  });
  const comment = await commentCommand(db, f.coordinator.token, {
    operation: "create",
    mutationId: randomUUID(),
    postId: f.post.id,
    content: "Fictional personal reply"
  });
  const event = await db.socialEvent.findFirstOrThrow({
    where: {
      kind: "COMMENT_ACTIVITY",
      commentId: comment.id,
      recipientId: f.memberA.id
    }
  });
  assert.ok(
    await db.$transaction((tx) => notificationSource(tx, event, false))
  );
  const fileCount = files.size;
  await command(db, f.reviewer.token, await f.body());
  for (const token of [
    null,
    f.contact.token,
    f.memberA.token,
    f.reviewer.token
  ])
    for (const variant of ["thumb", "display"])
      await denied(
        readImage(db, token, gallery.images[0].id, variant, storage),
        404
      );
  const saved = JSON.stringify(
    await readPostWorkspace(db, f.contact.token, { view: "saved" })
  );
  assert.ok(saved.includes('"available":false'));
  assert.ok(!saved.includes(f.post.content));
  assert.equal(
    (await getPost(db, f.contact.token, repost.id!))?.repost?.source,
    null
  );
  assert.equal(
    await db.$transaction((tx) => notificationSource(tx, event, false)),
    null
  );
  assert.equal(
    await db.$transaction((tx) => notificationSource(tx, event, true)),
    null
  );
  assert.equal(files.size, fileCount);
  await command(db, f.reviewer.token, await f.body("RESTORE"));
  assert.ok(
    await readImage(db, f.contact.token, gallery.images[0].id, "thumb", storage)
  );
  assert.equal(files.size, fileCount);
});
test("restriction uses the shared reader/media predicate and exact retries create one private author notice", async () => {
  const f = await fixture(),
    input = await f.body();
  const before = await db.platformPost.findUniqueOrThrow({
    where: { id: f.post.id }
  });
  assert.ok(await getPost(db, f.memberA.token, f.post.id));
  const result = await command(db, f.reviewer.token, input);
  assert.deepEqual(await command(db, f.reviewer.token, input), result);
  await denied(
    command(db, f.reviewer.token, { ...input, authorReason: "SPAM" }),
    409
  );
  assert.equal(
    await db.communityReportDecision.count({
      where: { reportId: f.report.id }
    }),
    1
  );
  for (const token of [
    undefined,
    f.memberA.token,
    f.reviewer.token,
    f.coordinator.token
  ])
    assert.equal(await getPost(db, token, f.post.id), null);
  assert.ok(
    !(await listPosts(db, f.memberA.token, {})).some((p) => p.id === f.post.id)
  );
  const profile = await getProfilePosts(db, f.memberA.token, f.memberA.id);
  assert.ok(!profile.posts.some((p) => p.id === f.post.id));
  assert.equal(profile.count, 0);
  await db.$transaction(async (tx) => {
    const context = await postContext(tx, f.memberA.id);
    await denied(
      readableImageTarget(tx, context, {
        purpose: "POST_PHOTO",
        postId: f.post.id,
        churchId: null,
        profileUserId: null
      }),
      404
    );
    const predicate = readableAssetWhere(context);
    assert.match(JSON.stringify(predicate), /moderationState/);
  });
  const after = await db.platformPost.findUniqueOrThrow({
    where: { id: f.post.id }
  });
  for (const key of [
    "status",
    "content",
    "audience",
    "audienceChurchId",
    "replyAudience",
    "allowReposts",
    "discussionClosed",
    "withdrawnAt",
    "authorId",
    "authorChurchId"
  ] as const)
    assert.deepEqual(after[key], before[key], key);
  assert.equal(after.moderationState, "HIDDEN");
  const notice = await read(db, f.memberA.token, { view: "decisions" });
  assert.equal(notice.notices?.length, 1);
  const activity = await readActivity(db, f.memberA.token, {
    category: "reports"
  });
  assert.equal(activity.items.length, 1);
  assert.equal(activity.items[0].available, true);
  assert.equal(
    activity.items[0].href,
    `/platform/reports/decisions?id=${notice.notices![0].id}`
  );
  assert.equal(
    (await openActivity(db, f.memberA.token, activity.items[0].id)).href,
    activity.items[0].href
  );
  await denied(openActivity(db, f.contact.token, activity.items[0].id), 404);
  const ownDetail = await read(db, f.memberA.token, {
    view: "decisions",
    id: notice.notices![0].id
  });
  assert.equal(ownDetail.ownSource?.content, f.post.content);
  assert.ok(!JSON.stringify(ownDetail).includes(f.report.details));
  assert.equal(
    (await communitySearch(db, null, { q: f.post.content })).items.length,
    0
  );
  assert.ok(
    !JSON.stringify(
      await publicSharePreview(db, { kind: "post", id: f.post.id })
    ).includes(f.post.content)
  );
  const serialized = JSON.stringify(notice);
  for (const secret of [
    f.report.details,
    input.decisionReason,
    f.contact.id,
    f.reviewer.id,
    f.report.id,
    f.post.content
  ])
    assert.ok(!serialized.includes(secret));
  assert.equal(
    (await read(db, f.contact.token, { view: "decisions" })).notices?.length,
    0
  );
  await denied(
    read(db, f.contact.token, { view: "decisions", id: notice.notices![0].id }),
    404
  );
  const evidence = (await f.review()).evidence;
  assert.equal(
    evidence && "content" in evidence ? evidence.content : null,
    f.post.content
  );
});
test("lifting restrictions preserves both reply modes and author narrowing, closure and withdrawal", async () => {
  for (const replyAudience of ["VIEWERS", "CHURCH_MEMBERS"] as const) {
    const f = await fixture();
    await db.platformPost.update({
      where: { id: f.post.id },
      data: { replyAudience, discussionClosed: true }
    });
    await command(db, f.reviewer.token, await f.body("REMOVE"));
    await command(db, f.reviewer.token, await f.body("RESTORE"));
    const restored = await getPost(db, f.memberA.token, f.post.id);
    assert.equal(restored?.replyAudience, replyAudience);
    assert.equal(restored?.discussionClosed, true);
    await command(db, f.reviewer.token, await f.body());
    const latest = await db.platformPost.findUniqueOrThrow({
      where: { id: f.post.id }
    });
    await postCommand(db, f.memberA.token, {
      operation: "withdraw",
      requestKey: randomUUID(),
      postId: f.post.id,
      expectedVersion: latest.version,
      confirmed: true
    });
    assert.equal((await f.review()).source?.authorWithdrawn, true);
    await command(db, f.reviewer.token, await f.body("RESTORE"));
    assert.equal(await getPost(db, f.memberA.token, f.post.id), null);
    assert.equal(
      (await db.platformPost.findUniqueOrThrow({ where: { id: f.post.id } }))
        .status,
      "WITHDRAWN"
    );
  }
});
test("current and pinned church authority is required for every action and privileged replay", async () => {
  const f = await fixture(true);
  await denied(f.review(), 404);
  await denied(f.review(f.memberB.token), 404);
  await denied(f.review(f.memberA.token), 404);
  const input = await f.body("HIDE", f.coordinator.token);
  await command(db, f.coordinator.token, input);
  await db.churchCapabilityGrant.updateMany({
    where: { userId: f.coordinator.id, capability: "MODERATE_CHURCH_POSTS" },
    data: { revokedAt: new Date() }
  });
  await denied(command(db, f.coordinator.token, input), 404);
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: f.post.id } }))
      .moderationState,
    "HIDDEN"
  );
  const publicCase = await fixture();
  const pending = await publicCase.body();
  await db.platformPost.update({
    where: { id: publicCase.post.id },
    data: { audience: "CHURCH", version: { increment: 1 } }
  });
  await denied(command(db, publicCase.reviewer.token, pending), 404);
  assert.equal(
    (
      await db.platformPost.findUniqueOrThrow({
        where: { id: publicCase.post.id }
      })
    ).moderationState,
    "VISIBLE"
  );
});
test("source and report version conflicts roll back the whole decision; no client can choose its author or scope", async () => {
  const f = await fixture(),
    pending = await f.body();
  await db.platformPost.update({
    where: { id: f.post.id },
    data: { content: "Later author edit", version: { increment: 1 } }
  });
  await denied(command(db, f.reviewer.token, pending), 409);
  assert.equal(
    await db.communityReportDecision.count({
      where: { reportId: f.report.id }
    }),
    0
  );
  const current = await f.body();
  await denied(
    command(db, f.reviewer.token, { ...current, authorId: f.contact.id }),
    400
  );
  await denied(
    command(db, f.reviewer.token, { ...current, action: "SUSPEND" }),
    400
  );
  await denied(
    command(db, f.reviewer.token, { ...current, authorReason: "NO_VIOLATION" }),
    400
  );
  await command(db, f.reviewer.token, current);
  await denied(
    command(db, f.reviewer.token, { ...current, mutationId: randomUUID() }),
    409
  );
  assert.equal(
    await db.communityReportDecision.count({
      where: { reportId: f.report.id }
    }),
    1
  );
});
test("requesting correction leaves content readable; only explicit restore lifts a restriction", async () => {
  const f = await fixture();
  await command(db, f.reviewer.token, await f.body("REQUEST_CORRECTION"));
  assert.ok(await getPost(db, f.memberA.token, f.post.id));
  assert.equal((await f.review()).report?.status, "FOLLOW_UP_REQUIRED");
  await command(db, f.reviewer.token, await f.body());
  await denied(
    command(db, f.reviewer.token, await f.body("NO_VIOLATION")),
    400
  );
  await denied(command(db, f.reviewer.token, await f.body()), 409);
  const r = (await f.review()).report!;
  await command(db, f.reviewer.token, {
    operation: "resolve",
    mutationId: randomUUID(),
    id: r.id,
    expectedVersion: r.version,
    resolution: "CLOSED",
    decisionReason: "Administrative case closure only"
  });
  assert.equal(await getPost(db, f.memberA.token, f.post.id), null);
});
test("comment restriction conceals parent text and author but keeps independent visible replies", async () => {
  const f = await fixture();
  const root = await db.platformPostComment.create({
    data: {
      postId: f.post.id,
      authorId: f.contact.id,
      content: "Hidden root text"
    }
  });
  const child = await db.platformPostComment.create({
    data: {
      postId: f.post.id,
      authorId: f.memberA.id,
      content: "Independent reply",
      parentId: root.id,
      rootId: root.id
    }
  });
  const report = await db.communityReport.create({
    data: {
      reporterId: f.memberA.id,
      targetType: "COMMENT",
      targetId: root.id,
      targetVersion: 1,
      contextVersion: f.post.version,
      reason: "HARASSMENT"
    }
  });
  const input = {
    operation: "moderate",
    mutationId: randomUUID(),
    id: report.id,
    expectedVersion: report.version,
    expectedSourceVersion: root.version,
    expectedContextVersion: f.post.version,
    action: "REMOVE",
    authorReason: "HARASSMENT",
    decisionReason: "Deliberate selected-comment decision"
  };
  await command(db, f.reviewer.token, input);
  const view = await readComments(db, f.memberA.token, { postId: f.post.id });
  const text = JSON.stringify(view);
  assert.ok(!text.includes("Hidden root text"));
  assert.ok(!text.includes(f.contact.name));
  const replies = await readComments(db, f.memberA.token, {
    postId: f.post.id,
    view: "replies",
    rootId: root.id
  });
  assert.ok(JSON.stringify(replies).includes(child.content));
  assert.ok(!JSON.stringify(replies).includes(f.contact.name));
  const changed = await read(db, f.reviewer.token, {
    view: "review",
    id: report.id
  });
  await command(db, f.reviewer.token, {
    ...input,
    mutationId: randomUUID(),
    expectedVersion: changed.report!.version,
    expectedSourceVersion: changed.source!.version,
    action: "RESTORE",
    authorReason: "CORRECTION_COMPLETE"
  });
  assert.ok(
    JSON.stringify(
      await readComments(db, f.memberA.token, { postId: f.post.id })
    ).includes(root.content)
  );
});
