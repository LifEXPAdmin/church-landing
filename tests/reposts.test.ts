import { postCommand } from "../lib/platform/post-commands";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { uploadImage, readImage } from "../lib/platform/media";
import { readPostGallery } from "../lib/platform/post-gallery";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedPortal
} from "./seed-portal";
import { PortalError, portalCommand } from "../lib/platform/portal";
import {
  repostCommand as command,
  readRepostOptions
} from "../lib/platform/reposts";
import {
  getPost,
  getProfilePosts,
  listPosts
} from "../lib/platform/post-reads";
import { publicSharePreview } from "../lib/platform/public-sharing";
import { handlePostWorkspaceRequest } from "../lib/platform/post-workspace-boundary";
import { handleRepostRequest } from "../lib/platform/repost-boundary";
import { allowWorkspaceAttempt } from "../lib/platform/account-limits";
import { accountConfig } from "../lib/platform/account-config";
import { communityCommand } from "./community-fixture";
import {
  postWorkspaceCommand as workspace,
  readPostWorkspace,
  privateDraftPayload
} from "../lib/platform/post-workspace";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const mutation = (operation: string, fields: Record<string, unknown> = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const denied = (work: Promise<unknown>, status: number) =>
  assert.rejects(
    work,
    (e: unknown) =>
      (e instanceof PortalError && e.status === status) ||
      (status === 401 && e instanceof Error && e.message === "session")
  );
async function fixture() {
  const sourceAuthor = await createPortalActor(db, "repsource"),
    actor = await createPortalActor(db, "reposter");
  const church = await db.church.create({
    data: {
      slug: `repost-${randomUUID()}`,
      name: "Fictional Repost Church",
      summary: "Isolated fixture"
    }
  });
  const source = await db.platformPost.create({
    data: {
      authorId: sourceAuthor.id,
      audienceChurchId: church.id,
      content: "Original attribution marker",
      allowReposts: true,
      publishedAt: new Date(Date.now() - 3600000)
    }
  });
  return { sourceAuthor, actor, source };
}
test("plain repost is one attributed reference across concurrent exact retries, duplicate actions and Undo", async () => {
  const { sourceAuthor, actor, source } = await fixture();
  const body = mutation("repost", {
    sourceId: source.id,
    expectedSourceVersion: source.version
  });
  const [one, two] = await Promise.all([
    command(db, actor.token, body),
    command(db, actor.token, body)
  ]);
  assert.deepEqual(one, two);
  await denied(command(db, actor.token, { ...body, audience: "PUBLIC" }), 409);
  const duplicate = await command(
    db,
    actor.token,
    mutation("repost", {
      sourceId: source.id,
      expectedSourceVersion: source.version
    })
  );
  assert.equal(duplicate.id, one.id);
  const options = await readRepostOptions(db, actor.token, {
    sourceId: source.id
  });
  assert.equal(options.existing?.id, one.id);
  assert.equal(options.canRepost, true);
  const row = await db.platformPost.findUniqueOrThrow({
    where: { id: one.id }
  });
  assert.equal(row.content, "");
  assert.equal(row.repostSourceId, source.id);
  assert.equal(row.repostKind, "PLAIN");
  assert.equal(await db.mediaAsset.count({ where: { postId: row.id } }), 0);
  const view = await getPost(db, actor.token, row.id);
  assert.equal(view?.author.id, actor.id);
  assert.equal(view?.repost?.source?.author.id, sourceAuthor.id);
  assert.equal(
    view?.repost?.source?.createdAt.getTime(),
    source.publishedAt!.getTime()
  );
  assert.ok(view!.createdAt!.getTime() > source.publishedAt!.getTime());
  assert.ok(
    (await getProfilePosts(db, null, actor.id)).posts.some(
      (p) => p.id === row.id
    )
  );
  assert.ok(
    (await listPosts(db, actor.token, { feed: true, limit: 31 })).some(
      (p) => p.id === row.id
    )
  );
  assert.equal(view?.canEdit, false);
  assert.equal(view?.canReply, false);
  await denied(
    command(
      db,
      sourceAuthor.token,
      mutation("undo", { id: row.id, expectedVersion: 1 })
    ),
    403
  );
  await denied(
    command(
      db,
      actor.token,
      mutation("undo", { id: row.id, expectedVersion: 0 })
    ),
    409
  );
  const undo = mutation("undo", { id: row.id, expectedVersion: 1 });
  assert.deepEqual(
    await command(db, actor.token, undo),
    await command(db, actor.token, undo)
  );
  assert.deepEqual(await command(db, actor.token, body), one);
  assert.equal(await getPost(db, null, row.id), null);
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: source.id } }))
      .status,
    "PUBLISHED"
  );
  const again = await command(
    db,
    actor.token,
    mutation("repost", { sourceId: source.id, expectedSourceVersion: 1 })
  );
  assert.notEqual(again.id, row.id);
  assert.equal(
    await db.platformPost.count({
      where: {
        authorId: actor.id,
        repostSourceId: source.id,
        status: "PUBLISHED"
      }
    }),
    1
  );
});
test("only eligible actors can repost public opted-in sources, and recursive links normalize to one original", async () => {
  const { sourceAuthor, actor, source } = await fixture();
  const send = (id = source.id, v = 1) =>
    command(
      db,
      actor.token,
      mutation("repost", { sourceId: id, expectedSourceVersion: v })
    );
  await denied(
    command(
      db,
      null,
      mutation("repost", { sourceId: source.id, expectedSourceVersion: 1 })
    ),
    401
  );
  const ineligible = await createPortalActor(db, "repchild", { adult: false });
  await denied(
    command(
      db,
      ineligible.token,
      mutation("repost", { sourceId: source.id, expectedSourceVersion: 1 })
    ),
    403
  );
  await db.platformPost.update({
    where: { id: source.id },
    data: { allowReposts: false }
  });
  await denied(send(), 403);
  await db.platformPost.update({
    where: { id: source.id },
    data: { allowReposts: true, audience: "CHURCH" }
  });
  await denied(send(), 403);
  await db.platformPost.update({
    where: { id: source.id },
    data: { audience: "PUBLIC" }
  });
  await denied(send(source.id, 9), 409);
  const first = await send();
  const third = await createPortalActor(db, "repthird");
  const normalized = await command(
    db,
    third.token,
    mutation("repost", { sourceId: first.id, expectedSourceVersion: 1 })
  );
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: normalized.id } }))
      .repostSourceId,
    source.id
  );
  await db.socialRelationship.create({
    data: { ownerId: sourceAuthor.id, targetUserId: actor.id, blocked: true }
  });
  assert.equal((await getPost(db, null, first.id!))?.repost?.source, null);
  assert.equal(
    (await publicSharePreview(db, { kind: "post", id: first.id })).available,
    false
  );
  await denied(send(), 403);
});
test("source edits carry through; opt-out, narrowing, withdrawal, account state and physical deletion never reveal source copies", async () => {
  const { sourceAuthor, actor, source } = await fixture();
  const made = await command(
    db,
    actor.token,
    mutation("repost", { sourceId: source.id, expectedSourceVersion: 1 })
  );
  await db.platformPost.update({
    where: { id: source.id },
    data: {
      content: "Edited original marker",
      version: { increment: 1 },
      editedAt: new Date()
    }
  });
  assert.equal(
    (await getPost(db, null, made.id!))?.repost?.source?.content,
    "Edited original marker"
  );
  const preview = await publicSharePreview(db, { kind: "post", id: made.id });
  assert.equal(preview.available, true);
  assert.ok(preview.path.endsWith(source.id));
  for (const patch of [
    { allowReposts: false },
    { audience: "CHURCH" as const },
    { status: "WITHDRAWN" as const, withdrawnAt: new Date() }
  ]) {
    await db.platformPost.update({ where: { id: source.id }, data: patch });
    for (const token of [null, actor.token, sourceAuthor.token]) {
      const v = await getPost(db, token, made.id!);
      assert.equal(v?.repost?.source, null);
      assert.ok(!JSON.stringify(v).includes("Edited original marker"));
    }
    assert.equal(
      (await publicSharePreview(db, { kind: "post", id: made.id })).available,
      false
    );
    await denied(
      workspace(
        db,
        actor.token,
        mutation("save-item", { postId: made.id, expectedVersion: 0 })
      ),
      404
    );
    await db.platformPost.update({
      where: { id: source.id },
      data: {
        allowReposts: true,
        audience: "PUBLIC",
        status: "PUBLISHED",
        withdrawnAt: null
      }
    });
  }
  await db.platformPost.delete({ where: { id: source.id } });
  const tombstone = await getPost(db, actor.token, made.id!);
  assert.equal(tombstone?.repost?.source, null);
  assert.equal(tombstone?.repost?.canUndo, true);
  await command(
    db,
    actor.token,
    mutation("undo", { id: made.id, expectedVersion: 1 })
  );
});
test("plain repost Like and Bookmark operate on the source while quote interactions remain separate", async () => {
  const { actor, source } = await fixture();
  const made = await command(
    db,
    actor.token,
    mutation("repost", { sourceId: source.id, expectedSourceVersion: 1 })
  );
  await communityCommand(db, actor.token, "like", { postId: made.id });
  assert.equal(
    await db.platformPostLike.count({
      where: { postId: source.id, userId: actor.id }
    }),
    1
  );
  assert.equal(
    await db.platformPostLike.count({ where: { postId: made.id } }),
    0
  );
  await workspace(
    db,
    actor.token,
    mutation("save-item", { postId: made.id, expectedVersion: 0 })
  );
  assert.equal(
    await db.savedPostItem.count({
      where: { postId: source.id, ownerId: actor.id }
    }),
    1
  );
  assert.equal(await db.savedPostItem.count({ where: { postId: made.id } }), 0);
  const draft = randomUUID();
  await workspace(
    db,
    actor.token,
    mutation("save-draft", {
      id: draft,
      expectedVersion: 0,
      payload: {
        content: "My distinct added words",
        replyAudience: "VIEWERS",
        quoteSourceId: made.id
      }
    })
  );
  const quote = await workspace(
    db,
    actor.token,
    mutation("publish-draft", { id: draft, expectedVersion: 1 })
  );
  const row = await db.platformPost.findUniqueOrThrow({
    where: { id: quote.postId }
  });
  assert.equal(row.repostKind, "QUOTE");
  assert.equal(row.repostSourceId, source.id);
  assert.equal(row.content, "My distinct added words");
  await communityCommand(db, actor.token, "like", { postId: row.id });
  assert.equal(
    await db.platformPostLike.count({
      where: { postId: row.id, userId: actor.id }
    }),
    1
  );
  await db.platformPost.update({
    where: { id: source.id },
    data: { allowReposts: false }
  });
  const view = await getPost(db, null, row.id);
  assert.equal(view?.repost?.source, null);
  assert.equal(view?.content, "My distinct added words");
});
test("church destinations require current publishing authority; logical church identity prevents duplicates across publishers", async () => {
  const f = await seedPortal(db),
    source = await db.platformPost.create({
      data: {
        authorId: f.memberB.id,
        content: "Church destination source",
        allowReposts: true,
        publishedAt: new Date()
      }
    });
  const fields = {
    sourceId: source.id,
    expectedSourceVersion: 1,
    authorChurchId: f.churchA.id,
    audienceChurchId: f.churchA.id,
    audience: "PUBLIC"
  };
  await denied(command(db, f.memberA.token, mutation("repost", fields)), 403);
  await denied(
    command(
      db,
      f.memberA.token,
      mutation("repost", { ...fields, authorChurchId: null })
    ),
    403
  );
  for (const actor of [f.memberA, f.coordinator])
    await portalCommand(db, f.operator.token, {
      operation: "grant",
      churchId: f.churchA.id,
      userId: actor.id,
      capability: "PUBLISH_CHURCH_POSTS",
      expectedVersion: 0
    });
  const made = await Promise.all(
    [f.memberA, f.coordinator].map((a) =>
      command(db, a.token, mutation("repost", fields))
    )
  );
  assert.equal(made[0].id, made[1].id);
  await denied(
    command(
      db,
      f.memberA.token,
      mutation("repost", { ...fields, audience: "CHURCH" })
    ),
    409
  );
  assert.equal((await getPost(db, null, made[0].id!))?.author.id, f.churchA.id);
  await db.churchCapabilityGrant.update({
    where: {
      userId_churchId_capability: {
        userId: f.memberA.id,
        churchId: f.churchA.id,
        capability: "PUBLISH_CHURCH_POSTS"
      }
    },
    data: { revokedAt: new Date() }
  });
  await denied(
    command(
      db,
      f.memberA.token,
      mutation("undo", { id: made[0].id, expectedVersion: 1 })
    ),
    403
  );
  await command(
    db,
    f.coordinator.token,
    mutation("undo", { id: made[0].id, expectedVersion: 1 })
  );
});
test("quote drafts retain source and both reply modes through save/read/conflict/retry and recheck revoked church access at publication", async () => {
  const f = await seedPortal(db),
    source = await db.platformPost.create({
      data: {
        authorId: f.memberB.id,
        content: "Quote permission source",
        allowReposts: true,
        publishedAt: new Date()
      }
    });
  await portalCommand(db, f.operator.token, {
    operation: "grant",
    churchId: f.churchA.id,
    userId: f.memberA.id,
    capability: "PUBLISH_CHURCH_POSTS",
    expectedVersion: 0
  });
  for (const replyAudience of ["VIEWERS", "CHURCH_MEMBERS"]) {
    const id = randomUUID(),
      payload = {
        content: "Independent quote words",
        quoteSourceId: source.id,
        replyAudience,
        audience: "PUBLIC",
        audienceChurchId: f.churchA.id
      };
    const save = mutation("save-draft", { id, expectedVersion: 0, payload });
    assert.deepEqual(
      await workspace(db, f.memberA.token, save),
      await workspace(db, f.memberA.token, save)
    );
    await denied(
      workspace(db, f.memberA.token, {
        ...save,
        payload: { ...payload, quoteSourceId: null }
      }),
      409
    );
    await denied(
      workspace(
        db,
        f.memberA.token,
        mutation("save-draft", {
          id,
          expectedVersion: 0,
          payload: { ...payload, content: "Other tab" }
        })
      ),
      409
    );
    const snapshot = await readPostWorkspace(db, f.memberA.token, {
      view: "draft",
      id
    });
    assert.ok(JSON.stringify(snapshot).includes(source.id));
    assert.ok(JSON.stringify(snapshot).includes(replyAudience));
    const publish = mutation("publish-draft", { id, expectedVersion: 1 });
    const result = await workspace(db, f.memberA.token, publish);
    assert.deepEqual(await workspace(db, f.memberA.token, publish), result);
    const row = await db.platformPost.findUniqueOrThrow({
      where: { id: result.postId }
    });
    assert.equal(row.replyAudience, replyAudience);
    assert.equal(row.repostSourceId, source.id);
  }
  const id = randomUUID(),
    payload = {
      content: "Waiting quote",
      quoteSourceId: source.id,
      replyAudience: "CHURCH_MEMBERS",
      audience: "PUBLIC",
      audienceChurchId: f.churchA.id
    };
  await workspace(
    db,
    f.memberA.token,
    mutation("save-draft", { id, expectedVersion: 0, payload })
  );
  await db.churchCapabilityGrant.update({
    where: {
      userId_churchId_capability: {
        userId: f.memberA.id,
        churchId: f.churchA.id,
        capability: "PUBLISH_CHURCH_POSTS"
      }
    },
    data: { revokedAt: new Date() }
  });
  await denied(
    workspace(
      db,
      f.memberA.token,
      mutation("publish-draft", { id, expectedVersion: 1 })
    ),
    403
  );

  const publishedQuote = await db.platformPost.findFirstOrThrow({
    where: {
      authorId: f.memberA.id,
      authorChurchId: null,
      repostKind: "QUOTE",
      repostSourceId: source.id
    }
  });
  const readableQuote = await getPost(db, f.memberA.token, publishedQuote.id);
  assert.equal(readableQuote?.canEdit, false);
  assert.equal(readableQuote?.canWithdraw, true);
  await denied(
    postCommand(db, f.memberA.token, {
      operation: "edit",
      postId: publishedQuote.id,
      expectedVersion: publishedQuote.version,
      content: "Revoked publisher cannot replace church content"
    }),
    403
  );
  await postCommand(db, f.memberA.token, {
    operation: "withdraw",
    postId: publishedQuote.id,
    expectedVersion: publishedQuote.version,
    confirmed: true
  });
  const retained = await db.privatePostDraft.findUniqueOrThrow({
    where: { ownerId_id: { ownerId: f.memberA.id, id } }
  });
  assert.equal(retained.version, 1);
  assert.equal(retained.deletedAt, null);
  assert.equal(
    privateDraftPayload({ content: "Old snapshot" }).quoteSourceId,
    undefined
  );
  const old = randomUUID();
  await workspace(
    db,
    f.memberB.token,
    mutation("save-draft", {
      id: old,
      expectedVersion: 0,
      payload: { content: "Old quote", quoteSourceId: source.id }
    })
  );
  await denied(
    workspace(
      db,
      f.memberB.token,
      mutation("publish-draft", { id: old, expectedVersion: 1 })
    ),
    400
  );
});

test("boundary rejects cross-site, guests, forged actors, changed accounts and retries without cacheable private responses", async () => {
  const { actor, source } = await fixture(),
    origin = accountConfig().origin;
  const body = mutation("repost", {
    sourceId: source.id,
    expectedSourceVersion: 1
  });
  const request = (value: unknown, headers: Record<string, string> = {}) =>
    new Request(origin + "/api/platform/reposts", {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        cookie: `church_platform_session=${actor.token}`,
        "x-expected-account": actor.id,
        ...headers
      },
      body: JSON.stringify(value)
    });
  for (const headers of [
    { origin: "https://cross.example" },
    { "sec-fetch-site": "cross-site" }
  ] as Record<string, string>[])
    assert.equal(
      (await handleRepostRequest(db, request(body, headers))).status,
      403
    );
  assert.equal(
    (await handleRepostRequest(db, request(body, { cookie: "" }))).status,
    401
  );
  assert.equal(
    (
      await handleRepostRequest(
        db,
        request(body, { "x-expected-account": "other" })
      )
    ).status,
    401
  );
  assert.equal(
    (await handleRepostRequest(db, request({ ...body, ownerId: "other" })))
      .status,
    400
  );
  const quoteId = randomUUID();
  const switched = new Request(origin + "/api/platform/post-workspace", {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      cookie: `church_platform_session=${actor.token}`,
      "x-expected-account": "previous-account"
    },
    body: JSON.stringify(
      mutation("save-draft", {
        id: quoteId,
        expectedVersion: 0,
        payload: {
          content: "",
          quoteSourceId: source.id,
          replyAudience: "VIEWERS"
        }
      })
    )
  });
  assert.equal((await handlePostWorkspaceRequest(db, switched)).status, 401);
  assert.equal(
    await db.privatePostDraft.count({
      where: { ownerId: actor.id, id: quoteId }
    }),
    0
  );
  const first = await handleRepostRequest(db, request(body));
  assert.equal(first.status, 200);
  assert.match(first.headers.get("cache-control")!, /private.*no-store/);
  const receipt = await first.json();
  assert.deepEqual(
    await (await handleRepostRequest(db, request(body))).json(),
    receipt
  );
  assert.equal(
    (await handleRepostRequest(db, request({ ...body, audience: "PUBLIC" })))
      .status,
    409
  );
  for (let i = 0; i < 245; i++)
    await allowWorkspaceAttempt(
      db,
      accountConfig().rateSecret + ":reposts",
      actor.id
    );
  assert.equal(
    (
      await handleRepostRequest(
        db,
        request(
          mutation("repost", { sourceId: source.id, expectedSourceVersion: 1 })
        )
      )
    ).status,
    429
  );
});
test("quote publication fails atomically after source revocation; viewer blocks, mutes and account suspension retain source boundaries", async () => {
  const { sourceAuthor, actor, source } = await fixture();
  const id = randomUUID(),
    payload = {
      content: "Preserved pending words",
      quoteSourceId: source.id,
      replyAudience: "VIEWERS"
    };
  await workspace(
    db,
    actor.token,
    mutation("save-draft", { id, expectedVersion: 0, payload })
  );
  await db.platformPost.update({
    where: { id: source.id },
    data: { allowReposts: false }
  });
  await denied(
    workspace(
      db,
      actor.token,
      mutation("publish-draft", { id, expectedVersion: 1 })
    ),
    403
  );
  const retained = await db.privatePostDraft.findUniqueOrThrow({
    where: { ownerId_id: { ownerId: actor.id, id } }
  });
  assert.equal(retained.version, 1);
  assert.equal(retained.deletedAt, null);
  await db.platformPost.update({
    where: { id: source.id },
    data: { allowReposts: true }
  });
  const made = await command(
    db,
    actor.token,
    mutation("repost", { sourceId: source.id, expectedSourceVersion: 1 })
  );
  const viewer = await createPortalActor(db, "repviewer");
  const relationship = await db.socialRelationship.create({
    data: { ownerId: viewer.id, targetUserId: sourceAuthor.id, blocked: true }
  });
  assert.equal(
    (await getPost(db, viewer.token, made.id!))?.repost?.source,
    null
  );
  await db.socialRelationship.update({
    where: { id: relationship.id },
    data: { blocked: false, muted: true }
  });
  assert.ok(
    !(await listPosts(db, viewer.token, { feed: true })).some(
      (p) => p.id === made.id
    )
  );
  assert.equal(
    (await getPost(db, viewer.token, made.id!))?.repost?.source?.id,
    source.id
  );
  await db.platformUser.update({
    where: { id: sourceAuthor.id },
    data: { suspendedAt: new Date() }
  });
  assert.equal((await getPost(db, null, made.id!))?.repost?.source, null);
  await db.platformUser.update({
    where: { id: sourceAuthor.id },
    data: { suspendedAt: null }
  });
});
test("restricted event sources cannot be reposted even by approved members; cycles are rejected", async () => {
  const f = await seedPortal(db);
  const calendar = await db.platformCalendar.create({
    data: {
      churchId: f.churchA.id,
      creatorId: f.memberA.id,
      requestKey: randomUUID(),
      name: "Fictional restricted calendar",
      timeZone: "UTC"
    }
  });
  const event = await db.calendarEvent.create({
    data: {
      calendarId: calendar.id,
      requestKey: randomUUID(),
      title: "Restricted source event",
      visibility: "CHURCH",
      timeZone: "UTC",
      startLocal: "2026-10-01T10:00",
      endLocal: "2026-10-01T11:00"
    }
  });
  const occurrence = await db.calendarOccurrence.create({
    data: {
      eventId: event.id,
      ordinal: 0,
      title: event.title,
      allDay: false,
      timeZone: "UTC",
      startLocal: event.startLocal,
      endLocal: event.endLocal,
      startAt: new Date("2026-10-01T10:00Z"),
      endAt: new Date("2026-10-01T11:00Z")
    }
  });
  const source = await db.platformPost.create({
    data: {
      authorId: f.memberA.id,
      audienceChurchId: f.churchA.id,
      eventOccurrenceId: occurrence.id,
      content: "Restricted event source",
      allowReposts: true,
      publishedAt: new Date()
    }
  });
  assert.ok(await getPost(db, f.memberA.token, source.id));
  await denied(
    command(
      db,
      f.memberA.token,
      mutation("repost", { sourceId: source.id, expectedSourceVersion: 1 })
    ),
    403
  );
  const one = await db.platformPost.create({
      data: {
        authorId: f.memberA.id,
        content: "Cycle one",
        allowReposts: true,
        publishedAt: new Date()
      }
    }),
    two = await db.platformPost.create({
      data: {
        authorId: f.memberA.id,
        content: "Cycle two",
        allowReposts: true,
        publishedAt: new Date(),
        repostKind: "QUOTE",
        repostSourceId: one.id
      }
    });
  await db.platformPost.update({
    where: { id: one.id },
    data: { repostKind: "QUOTE", repostSourceId: two.id }
  });
  await denied(
    command(
      db,
      f.memberA.token,
      mutation("repost", { sourceId: one.id, expectedSourceVersion: 1 })
    ),
    403
  );
  await assert.rejects(
    db.platformPost.update({
      where: { id: one.id },
      data: { repostSourceId: one.id }
    })
  );
});

test("reposting a processed source photo stores no duplicate upload and source withdrawal revokes its deliveries", async () => {
  const { sourceAuthor, actor, source } = await fixture();
  const files = new Map<string, Buffer>();
  const storage = {
    async put(path: string, data: Buffer) {
      files.set(path, data);
    },
    async get(path: string) {
      return files.get(path) ?? null;
    },
    async delete(paths: string[]) {
      paths.forEach((p) => files.delete(p));
    }
  };
  const bytes = await sharp({
    create: { width: 80, height: 60, channels: 3, background: "blue" }
  })
    .png()
    .toBuffer();
  await uploadImage(
    db,
    sourceAuthor.token,
    {
      purpose: "POST_PHOTO",
      targetId: source.id,
      requestKey: randomUUID(),
      alt: "Fictional source photo"
    },
    bytes,
    storage
  );
  const gallery = await readPostGallery(db, actor.token, source.id),
    before = files.size;
  assert.equal(gallery.images.length, 1);
  const current = await db.platformPost.findUniqueOrThrow({
    where: { id: source.id }
  });
  const made = await command(
    db,
    actor.token,
    mutation("repost", {
      sourceId: source.id,
      expectedSourceVersion: current.version
    })
  );
  assert.equal(files.size, before);
  assert.equal(await db.mediaAsset.count({ where: { postId: made.id } }), 0);
  const view = await getPost(db, actor.token, made.id!);
  assert.equal(view?.photoCount, 0);
  assert.equal(view?.repost?.source?.photoCount, 1);
  assert.ok(
    await readImage(db, actor.token, gallery.images[0].id, "thumb", storage)
  );
  await db.platformPost.update({
    where: { id: source.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  assert.equal(
    (await getPost(db, actor.token, made.id!))?.repost?.source,
    null
  );
  for (const token of [actor.token, null])
    for (const variant of ["thumb", "medium", "large", "original"] as const)
      await denied(
        readImage(db, token, gallery.images[0].id, variant, storage),
        404
      );
});
