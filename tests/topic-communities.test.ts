import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants,
  type PortalActor
} from "./seed-portal";
import {
  topicCommand,
  listTopics,
  readTopic,
  readTopicMembers
} from "../lib/platform/topic-communities";
import { postCommand } from "../lib/platform/post-commands";
import { getPost, listPosts } from "../lib/platform/post-reads";
import { commentCommand } from "../lib/platform/comment-commands";
import { postLikeCommand } from "../lib/platform/post-likes";
import {
  postWorkspaceCommand,
  readPostWorkspace
} from "../lib/platform/post-workspace";
import {
  readCommunityReports,
  communityReportCommand
} from "../lib/platform/community-reports";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import { PortalError } from "../lib/platform/portal-policy";
import { handleTopicRequest } from "../lib/platform/topic-boundary";
import { accountConfig } from "../lib/platform/account-config";
import { SESSION_COOKIE } from "../lib/platform/account-boundary";
import { safeAccountReturn } from "../lib/platform/account-entry";
import { readSupport, supportCommand } from "../lib/platform/support";
import { contentAppealOffer } from "../lib/platform/moderation-support";
import { readAdminQueue } from "../lib/platform/admin-queue";
import { readAdminNavigation } from "../lib/platform/admin-authority";
import { relationshipCommand } from "../lib/platform/relationships";

const db = new PrismaClient();
const priorReports = process.env.COMMUNITY_REPORTS_ENABLED;
before(async () => {
  await assertPortalTestDatabase(db);
  process.env.COMMUNITY_REPORTS_ENABLED = "true";
});
after(async () => {
  await db.$disconnect();
  if (priorReports === undefined) delete process.env.COMMUNITY_REPORTS_ENABLED;
  else process.env.COMMUNITY_REPORTS_ENABLED = priorReports;
});
const input = (
  operation: string,
  fields: Record<string, unknown> = {}
): Record<string, unknown> => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const denied = (work: Promise<unknown>, status: number) =>
  assert.rejects(
    work,
    (e: unknown) => e instanceof PortalError && e.status === status
  );
async function create(owner: PortalActor, namePrefix = "Fictional topic") {
  const tag = randomUUID();
  const body = input("create", {
    name: `${namePrefix} ${tag}`,
    slug: `topic-${tag}`,
    description: "A fictional isolated community",
    rules: "Keep discussion respectful and protect private information.",
    acceptedRules: true
  });
  const saved = await topicCommand(db, owner.token, body);
  return { ...saved, body, slug: String(body.slug) };
}
async function join(actor: PortalActor, topic: { id: string; slug: string }) {
  const state = await readTopic(db, actor.token, topic.slug);
  return topicCommand(
    db,
    actor.token,
    input("join", {
      communityId: topic.id,
      desired: true,
      acceptedRules: true,
      rulesVersion: state.community.rulesVersion,
      expectedVersion: state.viewer.version
    })
  );
}
async function fixture() {
  const owner = await createPortalActor(db, "topicowner"),
    member = await createPortalActor(db, "topicmember");
  const topic = await create(owner);
  await join(member, topic);
  return { owner, member, topic };
}
const publish = (
  actor: PortalActor,
  communityId: string,
  content = "Fictional public topic discussion"
) =>
  postCommand(db, actor.token, {
    operation: "create",
    requestKey: randomUUID(),
    topicCommunityId: communityId,
    content,
    allowReposts: true
  });
const own = (actor: PortalActor, communityId: string) =>
  db.topicMembership.findUniqueOrThrow({
    where: { communityId_userId: { communityId, userId: actor.id } }
  });

test("two public topics persist; reading creates no membership; duplicates, forged ownership and abuse fail", async () => {
  const owner = await createPortalActor(db, "topicnames");
  const prefix = `Fictional topic ${randomUUID().slice(0, 8)}`;
  const a = await create(owner, prefix),
    b = await create(owner, prefix);
  assert.deepEqual(await topicCommand(db, owner.token, a.body), {
    id: a.id,
    version: a.version,
    message: a.message
  });
  const count = await db.topicMembership.count();
  const topics = await listTopics(db, undefined, { q: prefix });
  assert.ok(topics.topics.some((t) => t.id === a.id));
  assert.ok(topics.topics.some((t) => t.id === b.id));
  assert.equal((await readTopic(db, undefined, a.slug)).viewer.accountId, null);
  assert.equal(await db.topicMembership.count(), count);
  await denied(
    topicCommand(db, owner.token, {
      ...a.body,
      mutationId: randomUUID(),
      name: String(a.body.name).toUpperCase(),
      slug: "other-unique-topic"
    }),
    409
  );
  await denied(
    topicCommand(db, owner.token, {
      ...a.body,
      mutationId: randomUUID(),
      name: "Another unique topic"
    }),
    409
  );
  await denied(
    topicCommand(db, owner.token, {
      ...a.body,
      mutationId: randomUUID(),
      ownerId: "forged"
    }),
    400
  );
  await create(owner);
  await denied(create(owner), 429);
  const unverified = await createPortalActor(db, "topicunver", {
    verified: false
  });
  await denied(create(unverified), 403);
});

test("canonical posts, comments and private drafts preserve the public topic and exact request", async () => {
  const f = await fixture();
  const draftId = randomUUID(),
    payload = {
      content: "Fictional saved topic draft",
      topicCommunityId: f.topic.id,
      replyAudience: "VIEWERS"
    };
  const saved = await postWorkspaceCommand(
    db,
    f.member.token,
    input("save-draft", { id: draftId, expectedVersion: 0, payload })
  );
  const restoredDraft = await readPostWorkspace(db, f.member.token, {
    view: "draft",
    id: draftId
  });
  assert.ok("draft" in restoredDraft);
  assert.equal(restoredDraft.draft?.payload.topicCommunityId, f.topic.id);
  const request = input("publish-draft", {
    id: draftId,
    expectedVersion: saved.version
  });
  const published = await postWorkspaceCommand(db, f.member.token, request);
  assert.ok(published.postId);
  assert.deepEqual(
    await postWorkspaceCommand(db, f.member.token, request),
    published
  );
  const reply = input("create", {
    postId: published.postId,
    content: "Fictional second member reply"
  });
  await commentCommand(db, f.owner.token, reply);
  const view = await getPost(db, undefined, published.postId!);
  assert.equal(view?.topicCommunity?.id, f.topic.id);
  assert.equal(view?.comments.length, 1);
  assert.equal(
    (await listPosts(db, undefined, { topicCommunityId: f.topic.id })).length,
    1
  );
  const second = new PrismaClient();
  try {
    assert.equal(
      (await readTopic(second, f.member.token, f.topic.slug)).viewer.joined,
      true
    );
  } finally {
    await second.$disconnect();
  }
  const outsider = await createPortalActor(db, "topicouts");
  await denied(publish(outsider, f.topic.id), 403);
  await denied(
    postCommand(db, f.member.token, {
      operation: "create",
      requestKey: randomUUID(),
      topicCommunityId: f.topic.id,
      content: "Cannot forge church sharing",
      audience: "CHURCH"
    }),
    400
  );
  await denied(
    postCommand(db, f.member.token, {
      operation: "edit",
      postId: published.postId,
      expectedVersion: view!.version,
      topicCommunityId: null,
      content: "Cannot move a published topic post"
    }),
    400
  );
  await assert.rejects(
    db.platformPostComment.create({
      data: {
        postId: published.postId!,
        authorId: f.owner.id,
        content: "Cannot omit canonical topic scope"
      }
    })
  );
});

test("rules changes require fresh acceptance, following is separate, and leaving preserves authored public content", async () => {
  const f = await fixture(),
    post = await publish(f.member, f.topic.id);
  const before = await own(f.member, f.topic.id);
  await topicCommand(
    db,
    f.member.token,
    input("follow", {
      communityId: f.topic.id,
      desired: true,
      expectedVersion: before.version
    })
  );
  assert.equal(
    (await listPosts(db, f.member.token, { followedTopics: true })).some(
      (p) => p.id === post.id
    ),
    true
  );
  const row = await readTopic(db, f.owner.token, f.topic.slug);
  await topicCommand(
    db,
    f.owner.token,
    input("edit", {
      communityId: f.topic.id,
      expectedVersion: row.community.version,
      name: row.community.name,
      description: row.community.description,
      rules: "Updated fictional rules requiring fresh acceptance."
    })
  );
  await denied(publish(f.member, f.topic.id), 403);
  await join(f.member, f.topic);
  const latest = await own(f.member, f.topic.id);
  await topicCommand(
    db,
    f.member.token,
    input("join", {
      communityId: f.topic.id,
      desired: false,
      expectedVersion: latest.version
    })
  );
  assert.ok(await getPost(db, undefined, post.id));
  await denied(publish(f.member, f.topic.id), 403);
  assert.equal((await own(f.member, f.topic.id)).following, true);
});

test("restrictions hide authored sources, previews and comments and deny stale positive requests without widening private rights", async () => {
  const f = await fixture(),
    memberPost = await publish(f.member, f.topic.id),
    ownerPost = await publish(f.owner, f.topic.id);
  const reply = input("create", {
    postId: ownerPost.id,
    content: "Fictional restricted reply marker"
  });
  await commentCommand(db, f.member.token, reply);
  const like = {
    mutationId: randomUUID(),
    postId: ownerPost.id,
    desired: true,
    expectedVersion: 0
  };
  await postLikeCommand(db, f.member.token, like);
  const member = await own(f.member, f.topic.id);
  await topicCommand(
    db,
    f.owner.token,
    input("restrict", {
      communityId: f.topic.id,
      targetId: f.member.id,
      expectedVersion: member.version,
      desired: true,
      reason: "RULES"
    })
  );
  assert.equal(await getPost(db, undefined, memberPost.id), null);
  const visible = await getPost(db, undefined, ownerPost.id);
  assert.equal(visible?.comments.length, 0);
  assert.equal(visible?.commentCount, 0);
  assert.ok(
    !JSON.stringify(
      await listPosts(db, undefined, { topicCommunityId: f.topic.id })
    ).includes("restricted reply marker")
  );
  await denied(commentCommand(db, f.member.token, reply), 403);
  await denied(postLikeCommand(db, f.member.token, like), 403);
  await denied(join(f.member, f.topic), 403);
  await denied(publish(f.member, f.topic.id), 403);
  await postLikeCommand(db, f.member.token, {
    mutationId: randomUUID(),
    postId: ownerPost.id,
    desired: false,
    expectedVersion: 1
  });
  await denied(readTopicMembers(db, f.member.token, f.topic.id), 403);
});

test("role nomination grants nothing until consent; revocation, forged cross-topic actions and ownership handoff stay scoped", async () => {
  const f = await fixture(),
    other = await create(f.owner),
    member = await own(f.member, f.topic.id);
  const offer = input("offer-role", {
    communityId: f.topic.id,
    targetId: f.member.id,
    role: "MODERATOR",
    expectedVersion: member.version
  });
  await topicCommand(db, f.owner.token, offer);
  await denied(readTopicMembers(db, f.member.token, f.topic.id), 403);
  let state = await own(f.member, f.topic.id);
  const acceptance = input("accept-role", {
    communityId: f.topic.id,
    role: "MODERATOR",
    expectedVersion: state.version
  });
  await topicCommand(db, f.member.token, acceptance);
  assert.deepEqual(
    await topicCommand(db, f.member.token, acceptance),
    await topicCommand(db, f.member.token, acceptance)
  );
  assert.ok(
    (await readTopicMembers(db, f.member.token, f.topic.id)).members.length
  );
  await denied(readTopicMembers(db, f.member.token, other.id), 403);
  state = await own(f.member, f.topic.id);
  await topicCommand(
    db,
    f.owner.token,
    input("revoke-role", {
      communityId: f.topic.id,
      targetId: f.member.id,
      expectedVersion: state.version
    })
  );
  await denied(topicCommand(db, f.member.token, acceptance), 403);
  state = await own(f.member, f.topic.id);
  await topicCommand(
    db,
    f.owner.token,
    input("offer-role", {
      communityId: f.topic.id,
      targetId: f.member.id,
      role: "OWNER",
      expectedVersion: state.version
    })
  );
  state = await own(f.member, f.topic.id);
  await topicCommand(
    db,
    f.member.token,
    input("accept-role", {
      communityId: f.topic.id,
      role: "OWNER",
      expectedVersion: state.version
    })
  );
  assert.equal(
    (await readTopic(db, f.member.token, f.topic.slug)).viewer.isOwner,
    true
  );
  await denied(topicCommand(db, f.owner.token, offer), 403);
  await denied(readTopicMembers(db, f.owner.token, f.topic.id), 403);
});

test("topic content reports reach only its managers and platform reviewers; topic identity review remains platform-only", async () => {
  const f = await fixture(),
    outsider = await createPortalActor(db, "topicreview"),
    reviewer = await createPortalActor(db, "topicglobal");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  const post = await publish(f.member, f.topic.id);
  const report = await communityReportCommand(
    db,
    outsider.token,
    input("create", {
      targetType: "POST",
      targetId: post.id,
      expectedTargetVersion: 1,
      expectedContextVersion: 0,
      reason: "SPAM",
      details: "Fictional selected public source review"
    })
  );
  const review = await readCommunityReports(db, f.owner.token, {
    view: "review",
    id: report.id
  });
  assert.equal(review.source?.type, "POST");
  const admin = await readAdminQueue(db, f.owner.token, {
    type: "REPORT",
    topicId: f.topic.id
  });
  assert.equal(admin.rows.length, 1);
  assert.equal(admin.rows[0].sourceId, report.id);
  assert.equal(
    (await readAdminNavigation(db, f.owner.token)).topics[0].id,
    f.topic.id
  );
  await denied(
    readAdminQueue(db, outsider.token, { type: "REPORT", topicId: f.topic.id }),
    404
  );
  assert.ok(
    !JSON.stringify(admin).includes("Fictional selected public source review")
  );

  await denied(
    readCommunityReports(db, outsider.token, { view: "review", id: report.id }),
    404
  );
  const decision = input("moderate", {
    id: report.id,
    expectedVersion: review.report!.version,
    expectedSourceVersion: review.source!.version,
    expectedContextVersion: review.source!.contextVersion,
    action: "REMOVE",
    authorReason: "SPAM",
    decisionReason: "Fictional rule enforcement in an isolated topic"
  });
  await communityReportCommand(db, f.owner.token, decision);
  assert.equal(await getPost(db, undefined, post.id), null);
  const savedDecision = await db.communityReportDecision.findFirstOrThrow({
    where: { reportId: report.id, action: "REMOVE" }
  });
  const offered = await db.$transaction((tx) =>
    contentAppealOffer(tx, f.member.id, savedDecision.id)
  );
  const appeal = await supportCommand(db, f.member.token, {
    operation: "appeal",
    requestKey: randomUUID(),
    decisionId: savedDecision.id,
    decisionVersion: offered.offer.decisionVersion,
    reportVersion: offered.offer.reportVersion,
    notice: offered.offer.notice,
    consent: true,
    description:
      "Fictional private topic appeal explaining the original context."
  });
  assert.ok(
    (await readSupport(db, f.owner.token, "inbox")).rows.some(
      (c) => c.id === appeal.caseId
    )
  );
  assert.ok(
    (await readAdminQueue(db, f.owner.token, { type: "SUPPORT" })).rows.some(
      (c) => c.sourceId === appeal.caseId
    )
  );

  const topicReport = await communityReportCommand(
    db,
    outsider.token,
    input("create", {
      targetType: "TOPIC",
      targetId: f.topic.id,
      expectedTargetVersion: 1,
      expectedContextVersion: 0,
      reason: "SPAM",
      details: "Fictional topic identity concern"
    })
  );
  await denied(
    readCommunityReports(db, f.owner.token, {
      view: "review",
      id: topicReport.id
    }),
    404
  );
  const topicReview = await readCommunityReports(db, reviewer.token, {
    view: "review",
    id: topicReport.id
  });
  assert.equal(topicReview.source?.type, "TOPIC");
  await communityReportCommand(
    db,
    reviewer.token,
    input("moderate", {
      id: topicReport.id,
      expectedVersion: topicReview.report!.version,
      expectedSourceVersion: topicReview.source!.version,
      expectedContextVersion: 0,
      action: "HIDE",
      authorReason: "SPAM",
      decisionReason: "Fictional topic restriction"
    })
  );
  await denied(readTopic(db, undefined, f.topic.slug), 404);
});

test("archiving and protected older-copy recovery exclude all public sources and never reuse older management authority", async () => {
  const f = await fixture(),
    post = await publish(f.member, f.topic.id);
  const state = await readTopic(db, f.owner.token, f.topic.slug);
  await topicCommand(
    db,
    f.owner.token,
    input("archive", {
      communityId: f.topic.id,
      desired: true,
      confirmed: true,
      expectedVersion: state.community.version
    })
  );
  await denied(readTopic(db, undefined, f.topic.slug), 404);
  assert.equal(await getPost(db, undefined, post.id), null);
  const entries = await db.retentionControl.findMany({
    where: { kind: "TOPIC_ACCESS", sourceId: f.topic.id }
  });
  assert.ok(entries.length);
  await db.topicCommunity.update({
    where: { id: f.topic.id },
    data: { lifecycle: "ACTIVE", securityVersion: 1 }
  });
  await replayRetentionControls(
    db,
    entries.map((r) => r.payload as unknown as RetentionControlEntry)
  );
  assert.equal(
    (await db.topicCommunity.findUniqueOrThrow({ where: { id: f.topic.id } }))
      .recoveryRequired,
    true
  );
  assert.equal(await getPost(db, undefined, post.id), null);
  await denied(
    topicCommand(
      db,
      f.owner.token,
      input("archive", {
        communityId: f.topic.id,
        desired: false,
        confirmed: true,
        expectedVersion: 2
      })
    ),
    503
  );
});

test("public pagination stays bounded and private membership lists omit contact and follow choices", async () => {
  const f = await fixture(),
    tag = randomUUID();
  for (let i = 0; i < 23; i++)
    await db.topicCommunity.create({
      data: {
        name: `Paging ${tag} ${String(i).padStart(2, "0")}`,
        nameKey: `paging-${tag}-${String(i).padStart(2, "0")}`,
        slug: `paging-${tag}-${i}`,
        description: "Fictional paging fixture",
        rules: "Fictional public community rules",
        creatorId: f.owner.id,
        ownerId: f.owner.id
      }
    });
  const first = await listTopics(db, undefined, { q: `Paging ${tag}` });
  assert.equal(first.topics.length, 20);
  assert.ok(first.after);
  const second = await listTopics(db, undefined, {
    q: `Paging ${tag}`,
    after: first.after!
  });
  assert.equal(second.topics.length, 3);
  assert.equal(second.after, null);
  assert.equal(
    new Set([...first.topics, ...second.topics].map((t) => t.id)).size,
    23
  );
  await denied(
    listTopics(db, undefined, { q: `Paging ${tag}`, after: f.topic.id }),
    409
  );
  const members = JSON.stringify(
    await readTopicMembers(db, f.owner.token, f.topic.id)
  );
  assert.ok(!members.includes(f.member.email));
  assert.ok(!members.includes('"following"'));
  assert.ok(
    !JSON.stringify(await readTopic(db, undefined, f.topic.slug)).includes(
      f.member.id
    )
  );
});

test("HTTP requires same-origin current-account writes, preserves safe topic returns, and never grants a role on GET", async () => {
  const f = await fixture(),
    origin = accountConfig().origin;
  const headers = {
    origin,
    "content-type": "application/json",
    cookie: `${SESSION_COOKIE}=${f.member.token}`,
    "x-expected-account": f.member.id
  };
  const before = await db.topicMembership.count();
  const get = await handleTopicRequest(
    db,
    new Request(`${origin}/api/platform/topics?view=topic&slug=${f.topic.slug}`)
  );
  assert.equal(get.status, 200);
  assert.match(get.headers.get("cache-control")!, /no-store/);
  assert.equal(await db.topicMembership.count(), before);
  const body = JSON.stringify(
    input("follow", {
      communityId: f.topic.id,
      desired: true,
      expectedVersion: (await own(f.member, f.topic.id)).version
    })
  );
  assert.equal(
    (
      await handleTopicRequest(
        db,
        new Request(`${origin}/api/platform/topics`, {
          method: "POST",
          headers: { ...headers, origin: "https://other.invalid" },
          body
        })
      )
    ).status,
    403
  );
  assert.equal(
    (
      await handleTopicRequest(
        db,
        new Request(`${origin}/api/platform/topics`, {
          method: "POST",
          headers: { ...headers, "x-expected-account": f.owner.id },
          body
        })
      )
    ).status,
    401
  );
  assert.equal(
    (
      await handleTopicRequest(
        db,
        new Request(`${origin}/api/platform/topics`, {
          method: "POST",
          headers,
          body
        })
      )
    ).status,
    200
  );
  assert.equal(
    safeAccountReturn(
      `/platform/topics/${f.topic.slug}?mutationId=discard&after=private`
    ),
    `/platform/topics/${f.topic.slug}`
  );
  assert.equal(
    safeAccountReturn("/platform/topics/new?ownerId=forged"),
    "/platform/topics/new"
  );
  assert.equal(
    safeAccountReturn("//evil.invalid/platform/topics"),
    "/platform"
  );
});

test("blocking and account lifecycle are checked again for public sources and role consent", async () => {
  const f = await fixture(),
    post = await publish(f.member, f.topic.id);
  await relationshipCommand(
    db,
    f.owner.token,
    input("block", {
      kind: "person",
      targetId: f.member.id,
      expectedVersion: 0,
      desired: true
    })
  );
  assert.equal(await getPost(db, f.owner.token, post.id), null);
  await denied(publish(f.member, f.topic.id), 403);
  await denied(
    topicCommand(
      db,
      f.owner.token,
      input("offer-role", {
        communityId: f.topic.id,
        targetId: f.member.id,
        role: "MODERATOR",
        expectedVersion: (await own(f.member, f.topic.id)).version
      })
    ),
    404
  );
  await db.platformUser.update({
    where: { id: f.owner.id },
    data: { suspendedAt: new Date() }
  });
  await denied(readTopic(db, undefined, f.topic.slug), 404);
  assert.equal(await getPost(db, undefined, post.id), null);
});

test("lost verification cannot bypass topic restrictions and preserves negative private choices", async () => {
  const f = await fixture(),
    p = await publish(f.owner, f.topic.id);
  await topicCommand(
    db,
    f.member.token,
    input("follow", {
      communityId: f.topic.id,
      desired: true,
      expectedVersion: (await own(f.member, f.topic.id)).version
    })
  );
  const like = {
    mutationId: randomUUID(),
    postId: p.id,
    desired: true,
    expectedVersion: 0
  };
  await postLikeCommand(db, f.member.token, like);
  await topicCommand(
    db,
    f.owner.token,
    input("restrict", {
      communityId: f.topic.id,
      targetId: f.member.id,
      desired: true,
      reason: "RULES",
      expectedVersion: (await own(f.member, f.topic.id)).version
    })
  );
  await db.platformUser.update({
    where: { id: f.member.id },
    data: { emailVerifiedAt: null }
  });
  await denied(postLikeCommand(db, f.member.token, like), 403);
  await denied(publish(f.member, f.topic.id), 403);
  assert.equal(
    (await readTopic(db, f.member.token, f.topic.slug)).viewer.restricted,
    true
  );
  await topicCommand(
    db,
    f.member.token,
    input("follow", {
      communityId: f.topic.id,
      desired: false,
      expectedVersion: (await own(f.member, f.topic.id)).version
    })
  );
  await topicCommand(
    db,
    f.member.token,
    input("join", {
      communityId: f.topic.id,
      desired: false,
      expectedVersion: (await own(f.member, f.topic.id)).version
    })
  );
  const state = await own(f.member, f.topic.id);
  assert.equal(state.following, false);
  assert.equal(state.joined, false);
  assert.ok(state.restrictedAt);
});

test("topic sharing withdraws current metadata and scoped management history never discloses private follow choices", async () => {
  const { publicSharePreview } = await import("../lib/platform/public-sharing");
  const { readTopicManagement, readTopicHistory } =
    await import("../lib/platform/topic-communities");
  const f = await fixture(),
    stranger = await createPortalActor(db, "topicoutsider");
  const preview = await publicSharePreview(db, {
    kind: "topic",
    id: f.topic.slug
  });
  assert.equal(preview.available, true);
  assert.equal(preview.path, `/platform/topics/${f.topic.slug}`);
  const current = await readTopicManagement(db, f.owner.token, f.topic.slug);
  assert.equal(current.members?.communityOwnerId, f.owner.id);
  assert.equal(current.history?.entries[0].action, "CREATED");
  for (const forbidden of [f.member.email, '"following"', '"invitedById"'])
    assert.equal(
      JSON.stringify({
        members: current.members,
        history: current.history
      }).includes(forbidden),
      false
    );
  await denied(readTopicHistory(db, stranger.token, f.topic.id), 403);
  await db.topicAudit.createMany({
    data: Array.from({ length: 22 }, (_, i) => ({
      communityId: f.topic.id,
      actorId: f.owner.id,
      action: "EDITED",
      version: i + 2
    }))
  });
  const first = await readTopicHistory(db, f.owner.token, f.topic.id);
  const second = await readTopicHistory(
    db,
    f.owner.token,
    f.topic.id,
    first.after!
  );
  assert.equal(first.entries.length, 20);
  assert.equal(second.entries.length, 3);
  assert.equal(
    new Set([...first.entries, ...second.entries].map((e) => e.id)).size,
    23
  );
  await topicCommand(
    db,
    f.owner.token,
    input("archive", {
      communityId: f.topic.id,
      desired: true,
      confirmed: true,
      expectedVersion: f.topic.version
    })
  );
  const hidden = await publicSharePreview(db, {
    kind: "topic",
    id: f.topic.slug
  });
  assert.equal(hidden.available, false);
  assert.equal(
    JSON.stringify(hidden).includes(String(f.topic.body.name)),
    false
  );
  assert.equal(
    (await readTopicManagement(db, f.owner.token, f.topic.slug)).members,
    null
  );
});

test("topic export is owner-scoped; archive permits closure and erasure preserves other members and restricted canonical content", async () => {
  const { prepareAccountExport, downloadAccountExport } =
    await import("../lib/platform/account-export");
  const { requestPermanentAccountDeletion } =
    await import("../lib/platform/account-deletion");
  const { eraseRequestedAccountData } =
    await import("../lib/platform/account-erasure");
  const { deactivateAccount, AccountLifecycleError } =
    await import("../lib/platform/account-lifecycle");
  const { createSessionToken } = await import("../lib/platform/auth");
  const f = await fixture(),
    post = await publish(
      f.member,
      f.topic.id,
      "Other member words must survive topic owner erasure"
    );
  await topicCommand(
    db,
    f.member.token,
    input("follow", {
      communityId: f.topic.id,
      desired: true,
      expectedVersion: (await own(f.member, f.topic.id)).version
    })
  );
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!;
  const proof = await prepareAccountExport(
    db,
    f.owner.token,
    f.owner.password,
    secret
  );
  const exported = await downloadAccountExport(
      db,
      f.owner.token,
      proof.authorization,
      secret
    ),
    data = JSON.parse(exported);
  assert.equal(data.ownedTopics.length, 1);
  assert.equal(data.topicChoices.length, 1);
  assert.equal(data.topicChoices[0].following, false);
  assert.equal(exported.includes(f.member.email), false);
  assert.equal(
    exported.includes("Other member words must survive topic owner erasure"),
    false
  );
  await assert.rejects(
    deactivateAccount(db, f.owner.token, f.owner.password, true),
    (e: unknown) => e instanceof AccountLifecycleError && e.code === "handoff"
  );
  await topicCommand(
    db,
    f.owner.token,
    input("archive", {
      communityId: f.topic.id,
      desired: true,
      confirmed: true,
      expectedVersion: f.topic.version
    })
  );
  const journal = { async recordAccount() {}, async completeAccount() {} };
  await requestPermanentAccountDeletion(
    db,
    f.owner.token,
    f.owner.password,
    true,
    createSessionToken(),
    journal
  );
  const deletion = await db.accountDeletion.findUniqueOrThrow({
    where: { userId: f.owner.id }
  });
  await eraseRequestedAccountData(db, deletion.id, journal);
  const topic = await db.topicCommunity.findUniqueOrThrow({
    where: { id: f.topic.id }
  });
  assert.equal(topic.ownerId, null);
  assert.equal(topic.lifecycle, "ARCHIVED");
  assert.equal((await own(f.member, f.topic.id)).following, true);
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: post.id } }))
      .content,
    "Other member words must survive topic owner erasure"
  );
  await denied(readTopic(db, undefined, f.topic.slug), 404);
});
