import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createPortalActor, assertPortalTestDatabase } from "./seed-portal";
import { topicCommand } from "../lib/platform/topic-communities";
import { postCommand } from "../lib/platform/post-commands";
import { commentCommand } from "../lib/platform/comment-commands";
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
      cookie: `church_platform_session=${token}`,
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
  assert.ok(management.includes("Reopen this topic"));
  assert.ok(management.includes("Management history"));
});
