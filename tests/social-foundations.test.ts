import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { seedPortal, assertPortalTestDatabase } from "./seed-portal";
import { PortalError } from "../lib/platform/portal";
import {
  relationshipCommand as relation,
  readRelationships
} from "../lib/platform/relationships";
import { socialPolicy } from "../lib/platform/social-policy";
import { commentCommand as comment } from "../lib/platform/comment-commands";
import { readComments, readCommentDrafts } from "../lib/platform/comment-reads";
import { communityCommand } from "./community-fixture";
import { getPost, listPosts } from "../lib/platform/post-reads";
import { getMemberProfile } from "../lib/platform/profiles";
import { communitySearch } from "../lib/platform/community-search";
import { listImages } from "../lib/platform/media";
import { readChurchImages } from "../lib/platform/church-images";
import {
  postWorkspaceCommand,
  readPostWorkspace
} from "../lib/platform/post-workspace";
const db = new PrismaClient();
let f: Awaited<ReturnType<typeof seedPortal>>;
const m = (operation: string, fields: Record<string, unknown> = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const denied = (p: Promise<unknown>, status: number) =>
  assert.rejects(
    p,
    (e: unknown) => e instanceof PortalError && e.status === status
  );
before(async () => {
  await assertPortalTestDatabase(db);
  f = await seedPortal(db);
});
beforeEach(async () => {
  const ids = [f.memberA.id, f.memberB.id, f.contact.id];
  await db.socialRelationship.deleteMany({
    where: { OR: [{ ownerId: { in: ids } }, { targetUserId: { in: ids } }] }
  });
  await db.socialPreferences.deleteMany({ where: { ownerId: { in: ids } } });
  await db.platformFollow.deleteMany({
    where: { OR: [{ followerId: { in: ids } }, { followingId: { in: ids } }] }
  });
});
after(() => db.$disconnect());
test("church identity projection separates public read from current profile-management authority", async () => {
  await db.church.update({
    where: { id: f.churchA.id },
    data: { communityListed: true }
  });
  const guest = await readChurchImages(db, undefined, f.churchA.id);
  assert.equal(guest.canManage, false);
  assert.equal(guest.logo, null);
  assert.equal(guest.cover, null);
  assert.equal(
    (await readChurchImages(db, f.memberA.token, f.churchA.id)).canManage,
    false
  );
  const grant = await db.churchCapabilityGrant.create({
    data: {
      userId: f.memberA.id,
      churchId: f.churchA.id,
      capability: "MANAGE_CHURCH_PROFILE"
    }
  });
  assert.equal(
    (await readChurchImages(db, f.memberA.token, f.churchA.id)).canManage,
    true
  );
  await db.churchCapabilityGrant.update({
    where: { id: grant.id },
    data: { revokedAt: new Date() }
  });
  assert.equal(
    (await readChurchImages(db, f.memberA.token, f.churchA.id)).canManage,
    false
  );
  await db.church.update({
    where: { id: f.churchA.id },
    data: { communityListed: false }
  });
  await denied(readChurchImages(db, undefined, f.churchA.id), 404);
});
const post = (
  authorId = f.contact.id,
  extra: {
    authorChurchId?: string;
    audience?: "CHURCH";
    audienceChurchId?: string;
  } = {}
) =>
  db.platformPost.create({
    data: {
      authorId,
      audienceChurchId: extra.authorChurchId,
      content: "Fictional social contract post " + randomUUID(),
      ...extra
    }
  });
async function block(
  owner = f.memberA,
  target = f.memberB,
  desired = true,
  expectedVersion = 0
) {
  return relation(
    db,
    owner.token,
    m("block", {
      kind: "person",
      targetId: target.id,
      desired,
      expectedVersion
    })
  );
}
async function thread(token: unknown, postId: string, query = {}) {
  const r = await readComments(db, token, { postId, ...query });
  assert.ok(r.kind === "thread");
  return r;
}

test("existing follow identity survives desired-state retries, favorites remain private and church follows grant no membership", async () => {
  const old = await db.platformFollow.create({
    data: { followerId: f.memberA.id, followingId: f.memberB.id }
  });
  const input = m("follow", {
    kind: "person",
    targetId: f.memberB.id,
    desired: true,
    expectedVersion: 0
  });
  const receipt = await relation(db, f.memberA.token, input);
  assert.deepEqual(await relation(db, f.memberA.token, input), receipt);
  assert.equal(
    (await db.platformFollow.findUniqueOrThrow({ where: { id: old.id } })).id,
    old.id
  );
  await denied(
    relation(db, f.memberA.token, { ...input, desired: false }),
    409
  );
  await relation(
    db,
    f.memberA.token,
    m("favorite", {
      kind: "person",
      targetId: f.memberB.id,
      desired: true,
      expectedVersion: 1
    })
  );
  assert.ok(
    JSON.stringify(
      await readRelationships(db, f.memberA.token, { view: "favorites" })
    ).includes(f.memberB.id)
  );
  assert.ok(
    !JSON.stringify(
      await readRelationships(db, f.contact.token, { view: "favorites" })
    ).includes(f.memberB.id)
  );
  await communityCommand(db, f.memberA.token, "unfollow", {
    followingId: f.memberB.id
  });
  assert.equal(
    await db.socialRelationship.count({
      where: { ownerId: f.memberA.id, favorite: true }
    }),
    0
  );
  await relation(
    db,
    f.memberA.token,
    m("follow", {
      kind: "church",
      targetId: f.churchB.id,
      desired: true,
      expectedVersion: 0
    })
  );
  const privatePost = await post(f.memberB.id, {
    authorChurchId: f.churchB.id,
    audience: "CHURCH",
    audienceChurchId: f.churchB.id
  });
  assert.equal(await getPost(db, f.memberA.token, privatePost.id), null);
  assert.equal(
    await db.churchConnection.count({
      where: { userId: f.memberA.id, churchId: f.churchB.id }
    }),
    0
  );
  await denied(
    relation(
      db,
      f.memberA.token,
      m("follow", {
        kind: "person",
        targetId: f.memberA.id,
        desired: true,
        expectedVersion: 0
      })
    ),
    400
  );
  await denied(
    relation(db, f.memberA.token, { ...m("follow"), ownerId: f.memberB.id }),
    400
  );
});
test("bilateral block reaches legacy writes, direct reads, paginated search, saved sources, images and unblocks without restoring edges", async () => {
  const personal = await post(f.memberB.id),
    church = await post(f.memberB.id, { authorChurchId: f.churchB.id });
  await db.platformFollow.createMany({
    data: [
      { followerId: f.memberA.id, followingId: f.memberB.id },
      { followerId: f.memberB.id, followingId: f.memberA.id }
    ]
  });
  await postWorkspaceCommand(
    db,
    f.memberA.token,
    m("save-item", { postId: personal.id, expectedVersion: 0 })
  );
  await block();
  assert.equal(await getPost(db, f.memberA.token, personal.id), null);
  assert.ok(await getPost(db, undefined, personal.id));
  assert.ok(await getPost(db, f.memberA.token, church.id));
  await denied(getMemberProfile(db, f.memberA.token, f.memberB.username), 404);
  await denied(
    listImages(db, f.memberA.token, "PROFILE_AVATAR", f.memberB.id),
    404
  );
  assert.equal(
    (
      await communitySearch(db, f.memberA.token, {
        kind: "people",
        q: f.memberB.username
      })
    ).items.length,
    0
  );
  assert.equal(
    (await communitySearch(db, f.memberA.token, { q: personal.content })).items
      .length,
    0
  );
  const saved = JSON.stringify(
    await readPostWorkspace(db, f.memberA.token, { view: "saved" })
  );
  assert.ok(!saved.includes(personal.content));
  await denied(
    communityCommand(db, f.memberA.token, "follow", {
      followingId: f.memberB.id
    }),
    404
  );
  await denied(
    communityCommand(db, f.memberB.token, "follow", {
      followingId: f.memberA.id
    }),
    404
  );
  await denied(
    communityCommand(db, f.memberA.token, "like", { postId: personal.id }),
    404
  );
  await denied(
    communityCommand(db, f.memberA.token, "comment", {
      postId: personal.id,
      content: "Blocked reply"
    }),
    404
  );
  assert.equal(
    await db.platformFollow.count({
      where: {
        OR: [{ followerId: f.memberA.id }, { followerId: f.memberB.id }]
      }
    }),
    0
  );
  assert.equal(
    await db.platformPostLike.count({ where: { postId: personal.id } }),
    0
  );
  assert.equal(
    await db.platformPostComment.count({ where: { postId: personal.id } }),
    0
  );
  await denied(
    comment(
      db,
      f.memberA.token,
      m("create", { postId: personal.id, content: "Blocked direct reply" })
    ),
    404
  );
  await block(f.memberA, f.memberB, false, 1);
  assert.ok(await getPost(db, f.memberA.token, personal.id));
  assert.equal(
    await db.platformFollow.count({ where: { followerId: f.memberA.id } }),
    0
  );
});
test("mute and snooze affect discovery only, expire at the boundary, and relationship counts can be private", async () => {
  const p = await post(f.memberB.id);
  await relation(
    db,
    f.memberA.token,
    m("snooze", {
      kind: "person",
      targetId: f.memberB.id,
      days: 1,
      expectedVersion: 0
    })
  );
  const row = await db.socialRelationship.findFirstOrThrow({
    where: { ownerId: f.memberA.id, targetUserId: f.memberB.id }
  });
  assert.ok(
    (
      await socialPolicy(
        db,
        f.memberA.id,
        new Date(row.snoozedUntil!.getTime() - 1)
      )
    ).mutedIds?.includes(f.memberB.id)
  );
  assert.ok(
    !(
      await socialPolicy(db, f.memberA.id, row.snoozedUntil!)
    ).mutedIds?.includes(f.memberB.id)
  );
  assert.ok(
    !(await listPosts(db, f.memberA.token, { feed: true })).some(
      (r) => r.id === p.id
    )
  );
  assert.ok(await getPost(db, f.memberA.token, p.id));
  await relation(
    db,
    f.memberB.token,
    m("privacy", {
      mentions: "NOBODY",
      showRelationships: false,
      expectedVersion: 0
    })
  );
  const profile = await getMemberProfile(
    db,
    f.memberA.token,
    f.memberB.username
  );
  assert.equal(profile?.relationshipsVisible, false);
  assert.equal(profile?._count.followers, null);
});
test("60 roots and 45 replies remain exactly reachable in both sorts, including deep-linked context and signed cursor binding", async () => {
  const p = await post(),
    roots = Array.from({ length: 60 }, () => randomUUID()).sort(),
    at = new Date("2026-01-01T12:00:00Z");
  await db.platformPostComment.createMany({
    data: roots.map((id) => ({
      id,
      postId: p.id,
      authorId: f.memberA.id,
      content: "Root " + id,
      createdAt: at
    }))
  });
  let parentId: string = roots[0];
  const replies = [];
  for (let i = 0; i < 45; i++) {
    const row = await db.platformPostComment.create({
      data: {
        postId: p.id,
        authorId: f.memberB.id,
        content: "Reply " + i,
        parentId,
        rootId: roots[0],
        createdAt: new Date(at.getTime() + i + 1)
      }
    });
    replies.push(row.id);
    parentId = row.id;
  }
  for (const sort of ["oldest", "newest"]) {
    let after: string | null = null;
    const seen: string[] = [];
    do {
      const page = await thread(f.contact.token, p.id, { sort, after });
      seen.push(...page.items.map((r) => r.id));
      after = page.nextCursor;
      assert.equal(page.visibleCount, 105);
    } while (after);
    assert.deepEqual(seen, sort === "oldest" ? roots : [...roots].reverse());
  }
  let after: string | null = null;
  const seen: string[] = [];
  do {
    const page = await thread(f.contact.token, p.id, {
      view: "replies",
      rootId: roots[0],
      after
    });
    seen.push(...page.items.map((r) => r.id));
    after = page.nextCursor;
  } while (after);
  assert.deepEqual(seen, replies);
  const deep = await thread(f.contact.token, p.id, {
    view: "context",
    commentId: replies[44]
  });
  assert.equal(deep.target?.id, replies[44]);
  assert.equal(deep.root?.id, roots[0]);
  const cursor = (await thread(f.contact.token, p.id)).nextCursor;
  await denied(
    readComments(db, f.contact.token, {
      postId: p.id,
      sort: "newest",
      after: cursor
    }),
    400
  );
  await denied(
    readComments(db, f.memberA.token, { postId: p.id, after: cursor }),
    400
  );
  await comment(
    db,
    f.memberA.token,
    m("delete", { postId: p.id, commentId: roots[0], expectedVersion: 1 })
  );
  const deleted = await thread(f.contact.token, p.id, {
    view: "replies",
    rootId: roots[0]
  });
  assert.equal(deleted.root?.content, null);
  assert.equal(deleted.root?.author, null);
  assert.equal(deleted.visibleCount, 104);
  assert.equal(
    (
      await db.platformPostComment.findUniqueOrThrow({
        where: { id: roots[0] }
      })
    ).content,
    ""
  );
  await denied(
    readComments(db, f.contact.token, {
      postId: p.id,
      view: "context",
      commentId: roots[0]
    }),
    404
  );
});
test("lost-response creates and edits deduplicate mentions and activity, concurrent edits conflict, desired Likes undo exactly once", async () => {
  const p = await post(),
    input = m("create", {
      postId: p.id,
      content: "Hello friend",
      mentionIds: [f.memberB.id]
    });
  const first = await comment(db, f.memberA.token, input);
  assert.deepEqual(await comment(db, f.memberA.token, input), first);
  assert.equal(
    await db.platformPostComment.count({ where: { postId: p.id } }),
    1
  );
  assert.equal(
    await db.socialEvent.count({ where: { commentId: first.id } }),
    2
  );
  const edit = (content: string) =>
    m("edit", {
      postId: p.id,
      commentId: first.id,
      expectedVersion: 1,
      content,
      mentionIds: [f.memberB.id]
    });
  const race = await Promise.allSettled([
    comment(db, f.memberA.token, edit("One edit")),
    comment(db, f.memberA.token, edit("Another edit"))
  ]);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(
    race.some((r) => r.status === "rejected" && r.reason.status === 409)
  );
  assert.equal(
    await db.socialEvent.count({ where: { commentId: first.id } }),
    2
  );
  const like = m("like", {
    postId: p.id,
    commentId: first.id,
    expectedVersion: 0,
    desired: true
  });
  assert.deepEqual(
    await comment(db, f.memberB.token, like),
    await comment(db, f.memberB.token, like)
  );
  assert.equal((await thread(f.contact.token, p.id)).items[0].likeCount, 1);
  const undo = m("like", {
    postId: p.id,
    commentId: first.id,
    expectedVersion: 1,
    desired: false
  });
  await comment(db, f.memberB.token, undo);
  await comment(db, f.memberB.token, undo);
  assert.equal((await thread(f.contact.token, p.id)).items[0].likeCount, 0);
});
test("blocked historic comments and reactions are hidden consistently, private mentions and cross-post parents are rejected", async () => {
  const p = await post(),
    other = await post(),
    a = await comment(
      db,
      f.memberA.token,
      m("create", { postId: p.id, content: "Visible root" })
    ),
    b = await comment(
      db,
      f.memberB.token,
      m("create", { postId: p.id, replyToId: a.id, content: "Later hidden" })
    );
  await comment(
    db,
    f.memberB.token,
    m("like", {
      postId: p.id,
      commentId: a.id,
      desired: true,
      expectedVersion: 0
    })
  );
  await denied(
    comment(
      db,
      f.memberA.token,
      m("create", { postId: other.id, replyToId: a.id, content: "Cross post" })
    ),
    404
  );
  await block();
  const mine = await thread(f.memberA.token, p.id);
  assert.equal(mine.visibleCount, 1);
  assert.equal(mine.items[0].likeCount, 0);
  assert.equal((await getPost(db, f.memberA.token, p.id))?.commentCount, 1);
  assert.equal((await thread(f.contact.token, p.id)).visibleCount, 2);
  await denied(
    comment(
      db,
      f.memberA.token,
      m("like", {
        postId: p.id,
        commentId: b.id,
        expectedVersion: 0,
        desired: true
      })
    ),
    404
  );
  await denied(
    comment(
      db,
      f.memberA.token,
      m("create", {
        postId: p.id,
        content: "Mention blocked",
        mentionIds: [f.memberB.id]
      })
    ),
    400
  );
  assert.equal(
    (
      await readComments(db, f.memberA.token, {
        postId: p.id,
        view: "mentions",
        q: f.memberB.username
      })
    ).items.length,
    0
  );
  const churchOnly = await post(f.contact.id, {
    audience: "CHURCH",
    audienceChurchId: f.churchA.id
  });
  await denied(
    comment(
      db,
      f.contact.token,
      m("create", {
        postId: churchOnly.id,
        content: "Private mention",
        mentionIds: [f.memberB.id]
      })
    ),
    400
  );
  await relation(
    db,
    f.memberB.token,
    m("privacy", {
      mentions: "FOLLOWED",
      showRelationships: true,
      expectedVersion: 0
    })
  );
  await denied(
    comment(
      db,
      f.contact.token,
      m("create", {
        postId: p.id,
        content: "Mention needs consent",
        mentionIds: [f.memberB.id]
      })
    ),
    400
  );
  await communityCommand(db, f.memberB.token, "follow", {
    followingId: f.contact.id
  });
  await comment(
    db,
    f.contact.token,
    m("create", {
      postId: p.id,
      content: "Mention allowed",
      mentionIds: [f.memberB.id]
    })
  );
});
test("private drafts are scoped, versioned and consumed atomically; pin and conversation controls obey current rights", async () => {
  const p = await post(),
    id = randomUUID(),
    draft = m("draft-save", {
      postId: p.id,
      draftId: id,
      expectedVersion: 0,
      content: "  Unsent draft  ",
      mentionIds: []
    });
  await comment(db, f.memberA.token, draft);
  assert.equal(
    (await readCommentDrafts(db, f.memberB.token, { id })).items.length,
    0
  );
  assert.equal(
    (await readCommentDrafts(db, f.memberA.token, { id })).items[0].content,
    "  Unsent draft  "
  );
  await denied(
    comment(
      db,
      f.memberA.token,
      m("draft-save", {
        postId: p.id,
        draftId: id,
        expectedVersion: 0,
        content: "Stale text"
      })
    ),
    409
  );
  const send = m("create", {
    postId: p.id,
    draftId: id,
    draftVersion: 1,
    content: "  Unsent draft  "
  });
  const sent = await comment(db, f.memberA.token, send);
  assert.deepEqual(await comment(db, f.memberA.token, send), sent);
  assert.equal(
    (await readCommentDrafts(db, f.memberA.token, { id })).items.length,
    0
  );
  await denied(
    comment(
      db,
      f.memberA.token,
      m("draft-save", {
        postId: p.id,
        draftId: id,
        expectedVersion: 2,
        content: "Resurrect"
      })
    ),
    409
  );
  await denied(
    comment(
      db,
      f.memberA.token,
      m("pin", { postId: p.id, commentId: sent.id, expectedVersion: 0 })
    ),
    403
  );
  await comment(
    db,
    f.contact.token,
    m("pin", { postId: p.id, commentId: sent.id, expectedVersion: 0 })
  );
  const page = await thread(f.memberA.token, p.id);
  assert.equal(page.pinned?.id, sent.id);
  assert.equal(page.visibleCount, 1);
  await comment(
    db,
    f.memberA.token,
    m("conversation", { postId: p.id, expectedVersion: 0, mode: "MUTE" })
  );
  assert.equal((await thread(f.memberA.token, p.id)).conversation.mode, "MUTE");
  assert.equal(
    (await thread(f.memberB.token, p.id)).conversation.mode,
    "DEFAULT"
  );
  await comment(
    db,
    f.memberA.token,
    m("delete", { postId: p.id, commentId: sent.id, expectedVersion: 1 })
  );
  assert.equal((await thread(f.contact.token, p.id)).pinned, null);
  await db.platformPost.update({
    where: { id: p.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  await denied(readComments(db, f.memberA.token, { postId: p.id }), 404);
});
test("church speaker identity requires current permission and never exposes the internal publisher", async () => {
  const p = await post(f.contact.id, { authorChurchId: f.churchA.id });
  await denied(
    comment(
      db,
      f.memberA.token,
      m("create", {
        postId: p.id,
        authorChurchId: f.churchA.id,
        content: "Forged church reply"
      })
    ),
    403
  );
  const grant = await db.churchCapabilityGrant.create({
    data: {
      churchId: f.churchA.id,
      userId: f.memberA.id,
      capability: "PUBLISH_CHURCH_POSTS"
    }
  });
  const c = await comment(
    db,
    f.memberA.token,
    m("create", {
      postId: p.id,
      authorChurchId: f.churchA.id,
      content: "Church announcement reply"
    })
  );
  await block(f.memberB, f.memberA);
  const r = await thread(f.memberB.token, p.id);
  assert.equal(r.items[0].author?.id, f.churchA.id);
  assert.equal(r.items[0].isPostAuthor, true);
  assert.ok(!JSON.stringify(r).includes(f.memberA.id));
  assert.ok(
    !JSON.stringify(await getPost(db, f.memberB.token, p.id)).includes(
      f.memberA.id
    )
  );
  await db.churchCapabilityGrant.delete({ where: { id: grant.id } });
  await denied(
    comment(
      db,
      f.memberA.token,
      m("edit", {
        postId: p.id,
        commentId: c.id,
        expectedVersion: 1,
        content: "Old permission"
      })
    ),
    403
  );
});
test("database constraints reject orphan shape, cross-post roots and moving a comment identity", async () => {
  const a = await post(),
    b = await post(),
    root = await db.platformPostComment.create({
      data: { postId: a.id, authorId: f.memberA.id, content: "Root" }
    });
  await assert.rejects(
    db.socialRelationship.create({ data: { ownerId: f.memberA.id } })
  );
  await assert.rejects(
    db.socialRelationship.create({
      data: { ownerId: f.memberA.id, targetUserId: f.memberA.id }
    })
  );
  await assert.rejects(
    db.platformPostComment.create({
      data: {
        postId: b.id,
        authorId: f.memberA.id,
        content: "Wrong audience",
        parentId: root.id,
        rootId: root.id
      }
    })
  );
  await assert.rejects(
    db.platformPostComment.update({
      where: { id: root.id },
      data: { authorId: f.memberB.id }
    })
  );
});
