import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient, type TopicCommunity } from "@prisma/client";
import { createPortalActor, assertPortalTestDatabase } from "./seed-portal";
import { topicCommand } from "../lib/platform/topic-communities";
import { postCommand } from "../lib/platform/post-commands";
import { commentCommand } from "../lib/platform/comment-commands";
import { registerAccount, loginAccount } from "../lib/platform/accounts";
import { ADULT_POLICY } from "../lib/platform/portal-types";
import { PortalError } from "../lib/platform/portal-policy";
import { topicFollowingStream } from "../lib/platform/topic-following-stream";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const req = (
  path: string,
  token = "",
  body?: Record<string, unknown>,
  headers: Record<string, string> = {}
) =>
  fetch(origin + path, {
    method: body ? "POST" : "GET",
    redirect: "manual",
    headers: {
      cookie: `${sessionCookieFixtureName()}=${token}`,
      origin,
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
const command = (
  operation: string,
  input: Record<string, unknown> = {}
): Record<string, unknown> => ({
  operation,
  mutationId: randomUUID(),
  ...input
});

test("production HTTPS topic controls require current identity and explicit consent, while guest HTML and RSC expose only public sources", async () => {
  const owner = await createPortalActor(db, "topichttpa"),
    member = await createPortalActor(db, "topichttpb"),
    tag = randomUUID();
  const body = command("create", {
    name: `Fictional HTTP topic ${tag}`,
    slug: `http-${tag}`,
    description: "Public topic description marker",
    rules: "Protect other people's privacy.",
    acceptedRules: true
  });
  assert.equal(
    (await req("/api/platform/topics", owner.token, body)).status,
    401
  );
  assert.equal(
    (
      await req("/api/platform/topics", owner.token, body, {
        "x-expected-account": member.id
      })
    ).status,
    401
  );
  assert.equal(
    (
      await req("/api/platform/topics", owner.token, body, {
        "x-expected-account": owner.id,
        origin: "https://other.invalid"
      })
    ).status,
    403
  );
  const first = await req("/api/platform/topics", owner.token, body, {
    "x-expected-account": owner.id
  });
  assert.ok([200, 202].includes(first.status));
  assert.match(first.headers.get("cache-control")!, /no-store/);
  const topic = await first.json();
  const retry = await (
    await req("/api/platform/topics", owner.token, body, {
      "x-expected-account": owner.id
    })
  ).json();
  assert.equal(retry.id, topic.id);
  assert.equal(retry.version, topic.version);
  const count = await db.topicMembership.count({
    where: { communityId: topic.id }
  });
  const path = `/platform/topics/${body.slug}`;
  for (const headers of [{}, { RSC: "1" }] as Record<string, string>[]) {
    const response = await req(path, "", undefined, headers),
      html = await response.text();
    assert.equal(response.status, 200);
    assert.ok(html.includes(String(body.name)));
    assert.ok(html.includes(String(body.rules)));
    assert.equal(html.includes(owner.email), false);
    assert.equal(html.includes(member.email), false);
    assert.equal(html.includes("Your topic choices"), false);
    assert.ok(html.includes("Create an account to participate"));
  }
  assert.equal(
    await db.topicMembership.count({ where: { communityId: topic.id } }),
    count
  );
  assert.equal(
    (
      await req(
        `/api/platform/topics?view=management&slug=${body.slug}`,
        member.token
      )
    ).status,
    404
  );
  assert.equal(
    (
      await req(
        `/api/platform/topics?view=members&communityId=${topic.id}`,
        member.token
      )
    ).status,
    403
  );
  await topicCommand(
    db,
    member.token,
    command("join", {
      communityId: topic.id,
      desired: true,
      acceptedRules: true,
      rulesVersion: 1,
      expectedVersion: 0
    })
  );
  const publicPost = await postCommand(db, member.token, {
    operation: "create",
    requestKey: randomUUID(),
    topicCommunityId: topic.id,
    content: `Topic visible words ${tag}`
  });
  const reply = await commentCommand(
    db,
    owner.token,
    command("create", {
      postId: publicPost.id,
      content: `Topic public comment ${tag}`
    })
  );
  for (const headers of [{}, { RSC: "1" }] as Record<string, string>[]) {
    const text = await (await req(path, "", undefined, headers)).text();
    assert.ok(text.includes(`Topic visible words ${tag}`));
    const discussion = await (
      await req(`/platform/posts/${publicPost.id}`, "", undefined, headers)
    ).text();
    assert.ok(discussion.includes(`Topic visible words ${tag}`));
  }
  const commentPath = `/api/platform/comments?postId=${publicPost.id}&view=roots`;
  const comments = await req(commentPath);
  assert.equal(comments.status, 200);
  assert.ok((await comments.text()).includes(`Topic public comment ${tag}`));
  await topicCommand(
    db,
    owner.token,
    command("restrict", {
      communityId: topic.id,
      targetId: member.id,
      expectedVersion: 1,
      desired: true,
      reason: "PRIVACY"
    })
  );
  for (const pathToRead of [
    path,
    `/platform/posts/${publicPost.id}`,
    `/platform/search?q=${tag}`
  ]) {
    for (const headers of [{}, { RSC: "1" }] as Record<string, string>[]) {
      const text = await (await req(pathToRead, "", undefined, headers)).text();
      assert.equal(text.includes(`Topic visible words ${tag}`), false);
      assert.equal(text.includes(`Topic public comment ${tag}`), false);
    }
  }
  const restrictedComments = await req(commentPath);
  assert.equal(restrictedComments.status, 404);
  assert.equal(
    (await restrictedComments.text()).includes(`Topic public comment ${tag}`),
    false
  );
  const preview = await (
    await req(
      `/api/platform/share-preview?kind=comment&id=${publicPost.id}&commentId=${reply.id}`
    )
  ).json();
  assert.equal(preview.available, false);
  await topicCommand(
    db,
    owner.token,
    command("archive", {
      communityId: topic.id,
      expectedVersion: 1,
      desired: true,
      confirmed: true
    })
  );
  for (const headers of [{}, { RSC: "1" }] as Record<string, string>[]) {
    const text = await (await req(path, "", undefined, headers)).text();
    assert.equal(text.includes(String(body.name)), false);
    assert.equal(text.includes(String(body.rules)), false);
  }
  const hidden = await (
    await req(`/api/platform/share-preview?kind=topic&id=${body.slug}`)
  ).json();
  assert.equal(hidden.available, false);
  assert.equal(JSON.stringify(hidden).includes(String(body.name)), false);
  const management = await (await req(path + "/manage", owner.token)).text();
  assert.equal(management.includes("Reopen this topic"), false);
  assert.equal(management.includes("Management history"), false);
  assert.equal(management.includes(String(body.name)), false);
  assert.equal(management.includes(String(body.rules)), false);
  assert.ok(management.includes("Checking current topic management access"));
  const privateManagement = await req(
    `/api/platform/topics?view=management&slug=${body.slug}`,
    owner.token,
    undefined,
    { "x-expected-account": owner.id }
  );
  assert.equal(privateManagement.status, 200);
  const current = await privateManagement.json();
  assert.equal(current.view.community.lifecycle, "ARCHIVED");
  assert.equal(current.view.viewer.isOwner, true);
  assert.equal(current.members, null);
  assert.ok(current.history.entries.length > 0);
});

async function streamActor() {
  const username = `tfs_${randomBytes(6).toString("hex")}`,
    email = `${username}@example.test`,
    password = `Fictional-only-${randomBytes(16).toString("hex")}`;
  const created = await registerAccount(db, {
    name: "Fictional followed topic reader",
    username,
    email,
    password,
    confirmPassword: password,
    role: "BELIEVER"
  });
  assert.ok(created);
  // Only this test's new actor receives fictional prerequisite facts. Do not
  // reset shared abuse budgets or grant authority to any existing account.
  await db.platformUser.update({
    where: { id: created.id },
    data: {
      emailVerifiedAt: new Date(),
      adultAcknowledgedAt: new Date(),
      adultPolicyVersion: ADULT_POLICY
    }
  });
  return {
    id: created.id,
    token: await loginAccount(db, email, password, "topic-stream-test")
  };
}
type StreamActor = Awaited<ReturnType<typeof streamActor>>;

async function streamFixture(count = 21) {
  const owner = await streamActor(),
    reader = await streamActor(),
    tag = randomBytes(8).toString("hex"),
    publishedAt = new Date(Date.now() - 60000);
  const topics: TopicCommunity[] = [];
  for (const label of ["first", "second"]) {
    const name = `Fictional stream ${label} ${tag}`;
    topics.push(
      await db.topicCommunity.create({
        data: {
          name,
          nameKey: name.toLowerCase(),
          slug: `stream-${label}-${tag}`,
          description: "An isolated fictional followed stream fixture.",
          rules: "Keep the discussion respectful and protect privacy.",
          creatorId: owner.id,
          ownerId: owner.id,
          members: {
            create: [
              { userId: owner.id, joined: true, rulesVersion: 1 },
              {
                userId: reader.id,
                following: true,
                followingSince: publishedAt
              }
            ]
          }
        }
      })
    );
  }
  // Direct fictional rows avoid unrelated publication abuse budgets. All
  // canonical topic, author, audience and membership constraints remain active.
  const ids = Array.from(
    { length: count },
    (_, i) => `tfs_${tag}_${String(i).padStart(3, "0")}`
  );
  await db.platformPost.createMany({
    data: ids.map((id) => ({
      id,
      authorId: owner.id,
      topicCommunityId: topics[0].id,
      content: `Fictional followed stream ${id}`,
      publishedAt
    }))
  });
  return {
    owner,
    reader,
    topics,
    ids: ids.sort().reverse(),
    publishedAt,
    tag
  };
}

const streamPath = (query: Record<string, string> = {}) =>
  `/api/platform/topics?${new URLSearchParams({ view: "following-stream", ...query })}`;
async function streamRead(
  actor: StreamActor,
  query: Record<string, string> = {}
) {
  const response = await req(streamPath(query), actor.token, undefined, {
    "x-expected-account": actor.id
  });
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("cache-control") ?? "",
    /private.*no-store/
  );
  assert.match(response.headers.get("vary") ?? "", /X-Expected-Account/i);
  assert.equal(response.headers.get("set-cookie"), null);
  return response.json() as Promise<{
    accountId: string;
    following: string[];
    posts: Array<{ id: string; content: string; createdAt: string }>;
    next: { before: string; cursor: string } | null;
  }>;
}

test("followed Topic stream is signed-in, account-bound, private and read-only", async () => {
  const f = await streamFixture(1),
    stranger = await streamActor();
  await assert.rejects(
    topicFollowingStream(db, null),
    (error: unknown) => error instanceof PortalError && error.status === 401
  );
  for (const [token, headers] of [
    ["", {}],
    [f.reader.token, { "x-expected-account": stranger.id }],
    [stranger.token, { "x-expected-account": f.reader.id }]
  ] as Array<[string, Record<string, string>]>) {
    const response = await req(streamPath(), token, undefined, headers);
    assert.equal(response.status, 401);
    assert.match(
      response.headers.get("cache-control") ?? "",
      /private.*no-store/
    );
    assert.equal(response.headers.get("set-cookie"), null);
    const body = await response.text();
    assert.equal(body.includes(f.ids[0]), false);
    assert.equal(body.includes(f.topics[0].id), false);
  }
  const membershipBefore = await db.topicMembership.findMany({
    where: { userId: f.reader.id },
    orderBy: { id: "asc" }
  });
  const sessionBefore = await db.platformSession.findMany({
    where: { userId: f.reader.id },
    orderBy: { id: "asc" }
  });
  const response = await streamRead(f.reader);
  assert.equal(response.accountId, f.reader.id);
  assert.deepEqual(response.following, f.topics.map((t) => t.id).sort());
  assert.deepEqual(
    response.posts.map((post) => post.id),
    f.ids
  );
  assert.equal(response.posts[0].createdAt, f.publishedAt.toISOString());
  assert.equal(response.next, null);
  // A forged selector cannot read another account's private following choices.
  const other = await streamRead(stranger, { accountId: f.reader.id });
  assert.equal(other.accountId, stranger.id);
  assert.deepEqual(other.following, []);
  assert.deepEqual(other.posts, []);
  assert.equal(other.next, null);
  assert.deepEqual(
    await db.topicMembership.findMany({
      where: { userId: f.reader.id },
      orderBy: { id: "asc" }
    }),
    membershipBefore
  );
  assert.deepEqual(
    await db.platformSession.findMany({
      where: { userId: f.reader.id },
      orderBy: { id: "asc" }
    }),
    sessionBefore,
    "A private GET must not renew the session"
  );
});

test("followed stream filters before its 20+1 page and uses a stable equal-time cursor", async () => {
  const f = await streamFixture();
  await db.platformPost.createMany({
    data: Array.from({ length: 30 }, (_, i) => ({
      id: `tfs_hidden_${f.tag}_${i}`,
      authorId: f.owner.id,
      topicCommunityId: f.topics[0].id,
      content: `Fictional hidden stream marker ${f.tag}`,
      publishedAt: new Date(f.publishedAt.getTime() + 1000),
      moderationState: "HIDDEN" as const
    }))
  });
  const first = await streamRead(f.reader),
    service = await topicFollowingStream(db, f.reader.token);
  assert.deepEqual(
    first.posts.map((post) => post.id),
    f.ids.slice(0, 20)
  );
  assert.deepEqual(
    service.posts.map((post) => post.id),
    f.ids.slice(0, 20)
  );
  assert.deepEqual(first.next, {
    before: f.publishedAt.toISOString(),
    cursor: f.ids[19]
  });
  assert.deepEqual(service.next, first.next);
  assert.equal(
    JSON.stringify(first).includes("Fictional hidden stream marker"),
    false
  );
  assert.ok(first.next);
  const second = await streamRead(f.reader, first.next);
  assert.deepEqual(
    second.posts.map((post) => post.id),
    f.ids.slice(20)
  );
  assert.equal(second.next, null);
  assert.equal(
    new Set([...first.posts, ...second.posts].map((p) => p.id)).size,
    21
  );
  const last = second.posts[0];
  const end = await streamRead(f.reader, {
    before: last.createdAt,
    cursor: last.id
  });
  assert.deepEqual(end.posts, []);
  assert.equal(end.next, null);
  const resetQueries: Record<string, string>[] = [
    { before: "not-a-date", cursor: f.ids[19] },
    { before: "2026-02-30T00:00:00Z", cursor: f.ids[19] },
    { before: f.publishedAt.toISOString(), cursor: "invalid/cursor" },
    { before: f.publishedAt.toISOString() },
    { cursor: f.ids[19] }
  ];
  for (const query of resetQueries) {
    const reset = await streamRead(f.reader, query);
    assert.deepEqual(
      reset.posts.map((post) => post.id),
      f.ids.slice(0, 20)
    );
  }
  await db.platformPost.update({
    where: { id: f.ids[20] },
    data: { withdrawnAt: new Date() }
  });
  const twenty = await streamRead(f.reader);
  assert.equal(twenty.posts.length, 20);
  assert.equal(
    twenty.next,
    null,
    "An inaccessible lookahead must not advertise another page"
  );
});

test("a followed stream continuation rechecks unfollow, restriction, archive and block access", async () => {
  const f = await streamFixture();
  const first = await streamRead(f.reader);
  assert.ok(first.next);
  const cursor = first.next,
    primary = f.topics[0],
    secondary = f.topics[1],
    memberKey = {
      communityId_userId: { communityId: primary.id, userId: f.reader.id }
    };
  const concealed = async () => {
    const current = await streamRead(f.reader, cursor);
    assert.deepEqual(current.following, [secondary.id]);
    assert.deepEqual(current.posts, []);
    assert.equal(current.next, null);
  };
  const restored = async () => {
    const current = await streamRead(f.reader, cursor);
    assert.deepEqual(current.following, [primary.id, secondary.id].sort());
    assert.deepEqual(
      current.posts.map((post) => post.id),
      f.ids.slice(20)
    );
  };
  await topicCommand(
    db,
    f.reader.token,
    command("follow", {
      communityId: primary.id,
      desired: false,
      expectedVersion: 1
    })
  );
  await concealed();
  await topicCommand(
    db,
    f.reader.token,
    command("follow", {
      communityId: primary.id,
      desired: true,
      expectedVersion: 2
    })
  );
  await restored();
  await db.topicMembership.update({
    where: memberKey,
    data: { restrictedAt: new Date() }
  });
  await concealed();
  await db.topicMembership.update({
    where: memberKey,
    data: { restrictedAt: null }
  });
  await restored();
  for (const data of [
    { lifecycle: "ARCHIVED" as const },
    { moderationState: "HIDDEN" as const },
    { recoveryRequired: true }
  ]) {
    await db.topicCommunity.update({ where: { id: primary.id }, data });
    await concealed();
    await db.topicCommunity.update({
      where: { id: primary.id },
      data: {
        lifecycle: "ACTIVE",
        moderationState: "VISIBLE",
        recoveryRequired: false
      }
    });
    await restored();
  }
  const block = await db.socialRelationship.create({
    data: { ownerId: f.reader.id, targetUserId: f.owner.id, blocked: true }
  });
  const blocked = await streamRead(f.reader, cursor);
  assert.deepEqual(blocked.following, []);
  assert.deepEqual(blocked.posts, []);
  assert.equal(blocked.next, null);
  await db.socialRelationship.delete({ where: { id: block.id } });
  await restored();
  await db.topicMembership.update({
    where: {
      communityId_userId: { communityId: primary.id, userId: f.owner.id }
    },
    data: { restrictedAt: new Date() }
  });
  const restrictedAuthor = await streamRead(f.reader, cursor);
  assert.deepEqual(
    restrictedAuthor.following,
    [primary.id, secondary.id].sort()
  );
  assert.deepEqual(restrictedAuthor.posts, []);
  assert.equal(restrictedAuthor.next, null);
});
