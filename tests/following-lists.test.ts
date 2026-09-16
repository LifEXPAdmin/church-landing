import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import {
  followingListCommand as command,
  readFollowingLists
} from "../lib/platform/following-lists";
import {
  followingListEntries,
  type FollowingListEntry
} from "../lib/platform/following-list-options";
import { readFeed } from "../lib/platform/feed-reads";
import { saveFeedPreference } from "../lib/platform/feed-preferences";
import { defaultDiscoveryPreferences } from "../lib/platform/discovery-options";
import { saveDiscoveryPreferences } from "../lib/platform/discovery-preferences";
import { getPostAvailabilityBatch } from "../lib/platform/post-reads";
import { relationshipCommand } from "../lib/platform/relationships";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
import { PortalError } from "../lib/platform/portal-policy";
import { requestPermanentAccountDeletion } from "../lib/platform/account-deletion";
import { eraseRequestedAccountData } from "../lib/platform/account-erasure";
import { createSessionToken } from "../lib/platform/auth";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const input = (
  operation: string,
  expectedVersion: number,
  extra: Record<string, unknown> = {}
) => ({ operation, expectedVersion, mutationId: randomUUID(), ...extra });
const status = (code: number) => (error: unknown) =>
  error instanceof PortalError && error.status === code;
const entry = (m: FollowingListEntry) => ({
  kind: m.kind,
  targetId: m.targetId,
  relationshipId: m.relationshipId,
  since: m.since
});
async function setup() {
  const a = await createPortalActor(db, "listowner"),
    b = await createPortalActor(db, "listother"),
    c = await createPortalActor(db, "listthird");
  const follow = await db.platformFollow.create({
    data: { followerId: a.id, followingId: b.id }
  });
  const second = await db.platformFollow.create({
    data: { followerId: a.id, followingId: c.id }
  });
  const member: FollowingListEntry = {
    kind: "person",
    targetId: b.id,
    relationshipId: follow.id,
    since: null
  };
  const created = await command(
    db,
    a.token,
    input("create", 0, { name: "Private reading " + randomUUID() })
  );
  const save = (version: number, extra: Record<string, unknown> = {}) =>
    command(
      db,
      a.token,
      input("members", version, {
        listId: created.id,
        members: [member],
        ...extra
      })
    );
  const choose = async (id: string | null = created.id) => {
    const current = await readFollowingLists(db, a.token);
    return saveFeedPreference(db, a.token, {
      mode: "following",
      followingListId: id,
      expectedVersion: current.feedVersion,
      expectedListsVersion: current.version,
      mutationId: randomUUID()
    });
  };
  return { a, b, c, follow, second, member, created, save, choose };
}
test("private lists have owner-only reads, bounded names and membership, exact receipts and serialized versions", async () => {
  const f = await setup();
  const body = input("members", 1, {
    listId: f.created.id,
    members: [f.member]
  });
  const saved = await command(db, f.a.token, body);
  assert.deepEqual(await command(db, f.a.token, body), saved);
  await assert.rejects(
    command(db, f.a.token, { ...body, members: [] }),
    status(409)
  );
  await assert.rejects(
    command(
      db,
      f.b.token,
      input("rename", 0, { listId: f.created.id, name: "Stolen" })
    ),
    status(404)
  );
  await assert.rejects(
    readFollowingLists(db, f.b.token, { listId: f.created.id }),
    status(404)
  );
  await assert.rejects(readFollowingLists(db, ""), status(401));
  assert.deepEqual((await readFollowingLists(db, f.b.token)).lists, []);
  assert.deepEqual(
    (
      await readFollowingLists(db, f.a.token, { listId: f.created.id })
    ).list!.members.map(entry),
    [f.member]
  );
  const parallel = await Promise.allSettled(
    ["A", "B"].map((name) =>
      command(db, f.a.token, input("rename", 2, { listId: f.created.id, name }))
    )
  );
  assert.equal(parallel.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(parallel.filter((r) => r.status === "rejected").length, 1);
  await assert.rejects(
    command(db, f.a.token, input("create", 3, { name: "bad\nname" })),
    status(400)
  );
  await assert.rejects(
    command(db, f.a.token, input("create", 3, { name: "x".repeat(61) })),
    status(400)
  );
  await assert.rejects(
    command(
      db,
      f.a.token,
      input("members", 3, {
        listId: f.created.id,
        members: [f.member, f.member]
      })
    ),
    status(400)
  );
  assert.throws(
    () => followingListEntries(Array.from({ length: 101 }, () => f.member)),
    status(400)
  );
  await assert.rejects(
    command(db, f.a.token, input("create", 3, { name: "x", ownerId: f.b.id })),
    status(400)
  );
});
test("selected lists constrain pages and availability with current mute, block, follow epochs and post audience", async () => {
  const f = await setup();
  await f.save(1);
  await f.choose();
  const at = new Date(Date.now() - 1000);
  const post = await db.platformPost.create({
    data: {
      authorId: f.b.id,
      content: "Fictional listed post",
      publishedAt: at
    }
  });
  const other = await db.platformPost.create({
    data: {
      authorId: f.c.id,
      content: "Fictional excluded followed post",
      publishedAt: at
    }
  });
  const first = await readFeed(db, f.a.token, { mode: "following" });
  assert.deepEqual(
    first.posts.map((p) => p.id),
    [post.id]
  );
  assert.ok(!first.posts.some((p) => p.id === other.id));
  assert.equal(
    (
      await getPostAvailabilityBatch(
        db,
        f.a.token,
        [post.id, other.id],
        "following",
        { filterKey: first.feedKey }
      )
    ).posts.filter((p) => p.available).length,
    1
  );
  await db.socialRelationship.create({
    data: { ownerId: f.a.id, targetUserId: f.b.id, muted: true }
  });
  assert.deepEqual(
    (
      await readFeed(db, f.a.token, {
        mode: "following",
        cursor: first.pageCursor
      })
    ).posts,
    []
  );
  await db.socialRelationship.update({
    where: { ownerId_targetUserId: { ownerId: f.a.id, targetUserId: f.b.id } },
    data: { muted: false }
  });
  const privateChurch = await db.church.create({
    data: {
      name: "Fictional audience church",
      slug: "private-" + randomUUID(),
      summary: "Fixture"
    }
  });
  await db.platformPost.update({
    where: { id: post.id },
    data: { audience: "CHURCH", audienceChurchId: privateChurch.id }
  });
  assert.equal(
    (
      await getPostAvailabilityBatch(db, f.a.token, [post.id], "following", {
        filterKey: first.feedKey
      })
    ).posts[0].available,
    false
  );
  await db.platformPost.update({
    where: { id: post.id },
    data: { audience: "PUBLIC", audienceChurchId: null }
  });
  await db.platformFollow.delete({ where: { id: f.follow.id } });
  await db.platformFollow.create({
    data: { followerId: f.a.id, followingId: f.b.id }
  });
  assert.deepEqual(
    (
      await readFeed(db, f.a.token, {
        mode: "following",
        cursor: first.pageCursor
      })
    ).posts,
    []
  );
  assert.deepEqual(
    (await readFollowingLists(db, f.a.token, { listId: f.created.id })).list!
      .members,
    []
  );
  await assert.rejects(f.save(3), status(409));
  const current = await readFollowingLists(db, f.a.token, {
    listId: f.created.id
  });
  await f.save(3, {
    members: current.candidates.filter((p) => p.targetId === f.b.id).map(entry)
  });
  const relation = await db.socialRelationship.findUniqueOrThrow({
    where: { ownerId_targetUserId: { ownerId: f.a.id, targetUserId: f.b.id } }
  });
  await relationshipCommand(db, f.a.token, {
    ...input("block", relation.version),
    kind: "person",
    targetId: f.b.id,
    desired: true
  });
  assert.deepEqual(
    (await readFollowingLists(db, f.a.token, { listId: f.created.id })).list!
      .members,
    []
  );
});
test("church entries bind to following epochs without granting membership or exposing private church posts", async () => {
  const f = await setup();
  const church = await db.church.create({
    data: {
      name: "Fictional List Church",
      slug: "list-" + randomUUID(),
      summary: "Fixture",
      communityListed: true
    }
  });
  const r = await db.socialRelationship.create({
    data: { ownerId: f.a.id, churchId: church.id, followingChurch: true }
  });
  const members = (
    await readFollowingLists(db, f.a.token, { kind: "church" })
  ).candidates.map(entry);
  assert.equal(members.length, 1);
  assert.ok(members[0].since);
  await f.save(1, { members });
  await f.choose();
  const publicPost = await db.platformPost.create({
    data: {
      authorId: f.b.id,
      authorChurchId: church.id,
      audienceChurchId: church.id,
      content: "Fictional church list post",
      publishedAt: new Date(Date.now() - 1000)
    }
  });
  await db.platformPost.create({
    data: {
      authorId: f.b.id,
      authorChurchId: church.id,
      audience: "CHURCH",
      audienceChurchId: church.id,
      content: "Fictional restricted church list post",
      publishedAt: new Date(Date.now() - 1000)
    }
  });
  assert.deepEqual(
    (await readFeed(db, f.a.token, { mode: "following" })).posts.map(
      (p) => p.id
    ),
    [publicPost.id]
  );
  assert.equal(
    await db.churchConnection.count({
      where: { userId: f.a.id, churchId: church.id }
    }),
    0
  );
  await db.socialRelationship.update({
    where: { id: r.id },
    data: { followingChurch: false }
  });
  await db.socialRelationship.update({
    where: { id: r.id },
    data: { followingChurch: true }
  });
  assert.deepEqual(
    (await readFollowingLists(db, f.a.token, { listId: f.created.id })).list!
      .members,
    []
  );
  assert.deepEqual(
    (await readFeed(db, f.a.token, { mode: "following" })).posts,
    []
  );
});
test("list edits invalidate reading sets; deleting the selected list never broadens the feed or removes follows", async () => {
  const f = await setup();
  await f.save(1);
  await f.choose();
  const first = await readFeed(db, f.a.token, { mode: "following" });
  await command(
    db,
    f.a.token,
    input("rename", 3, { listId: f.created.id, name: "Renamed private list" })
  );
  await assert.rejects(
    readFeed(db, f.a.token, { mode: "following", cursor: first.pageCursor }),
    status(409)
  );
  await command(db, f.a.token, input("delete", 4, { listId: f.created.id }));
  assert.equal(
    await db.platformFollow.count({ where: { followerId: f.a.id } }),
    2
  );
  await assert.rejects(
    readFeed(db, f.a.token, { mode: "following" }),
    status(409)
  );
  await assert.rejects(f.choose(), status(404));
  await readFeed(db, f.a.token, { mode: "latest" });
  await f.choose(null);
  await readFeed(db, f.a.token, { mode: "following" });
});
test("older discovery and feed forms preserve list choices and selecting a foreign list is denied", async () => {
  const f = await setup();
  await f.save(1);
  await f.choose();
  const before = await readFollowingLists(db, f.a.token);
  await saveDiscoveryPreferences(db, f.a.token, {
    operation: "save",
    preferences: defaultDiscoveryPreferences(),
    expectedVersion: 0,
    mode: "following",
    expectedFeedVersion: before.feedVersion,
    mutationId: randomUUID()
  });
  await saveFeedPreference(db, f.a.token, {
    mode: "following",
    expectedVersion: before.feedVersion + 1,
    mutationId: randomUUID()
  });
  const after = await readFollowingLists(db, f.a.token);
  assert.equal(after.version, before.version);
  assert.equal(after.selectedId, f.created.id);
  await assert.rejects(
    saveFeedPreference(db, f.b.token, {
      mode: "following",
      followingListId: f.created.id,
      expectedVersion: 0,
      expectedListsVersion: 0,
      mutationId: randomUUID()
    }),
    status(404)
  );
});
test("protected recovery clears stale names and membership, is idempotent and requires deliberate review", async () => {
  const f = await setup();
  await f.save(1);
  await f.choose();
  const older = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: f.a.id }
  });
  await command(db, f.a.token, input("delete", 3, { listId: f.created.id }));
  const receipt = await db.retentionControl.findFirstOrThrow({
    where: { sourceId: f.a.id, kind: "FOLLOWING_LISTS", version: 4 }
  });
  const payload = receipt.payload as unknown as RetentionControlEntry;
  assert.ok(!JSON.stringify(payload).includes("Private reading"));
  await db.socialPreferences.update({
    where: { ownerId: f.a.id },
    data: {
      followingLists: older.followingLists as Prisma.InputJsonObject,
      followingListsVersion: 3
    }
  });
  await replayRetentionControls(db, [payload]);
  await replayRetentionControls(db, [payload]);
  const current = await readFollowingLists(db, f.a.token);
  assert.equal(current.recoveryRequired, true);
  assert.equal(current.version, 4);
  assert.deepEqual(current.lists, []);
  await assert.rejects(
    readFeed(db, f.a.token, { mode: "following" }),
    status(409)
  );
  await assert.rejects(
    command(db, f.a.token, input("create", 4, { name: "Not yet" })),
    status(409)
  );
  await command(db, f.a.token, input("recover", 4));
  assert.equal(
    (await readFollowingLists(db, f.a.token)).recoveryRequired,
    false
  );
  assert.equal(
    await db.platformFollow.count({ where: { followerId: f.a.id } }),
    2
  );
  await replayRetentionControls(db, [payload]);
  assert.equal((await readFollowingLists(db, f.a.token)).version, 5);
});
test("owner export includes private lists while another account export does not", async () => {
  const f = await setup();
  await f.save(1);
  const name = (await readFollowingLists(db, f.a.token)).lists[0].name;
  async function exported(actor: typeof f.a) {
    const secret = process.env.AUTH_RATE_LIMIT_SECRET!;
    const proof = await prepareAccountExport(
      db,
      actor.token,
      actor.password,
      secret
    );
    return downloadAccountExport(db, actor.token, proof.authorization, secret);
  }
  assert.ok((await exported(f.a)).includes(name));
  assert.ok(!(await exported(f.b)).includes(name));
  const journal = { async recordAccount() {}, async completeAccount() {} };
  await requestPermanentAccountDeletion(
    db,
    f.a.token,
    f.a.password,
    true,
    createSessionToken(),
    journal
  );
  const deletion = await db.accountDeletion.findUniqueOrThrow({
    where: { userId: f.a.id }
  });
  await eraseRequestedAccountData(db, deletion.id, journal);
  assert.equal(
    await db.socialPreferences.count({ where: { ownerId: f.a.id } }),
    0
  );
});
test("unfollow journals list removal so a backup cannot restore the earlier membership", async () => {
  const f = await setup();
  await f.save(1);
  const previous = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: f.a.id }
  });
  const saved = await relationshipCommand(db, f.a.token, {
    ...input("follow", 0),
    kind: "person",
    targetId: f.b.id,
    desired: false
  });
  const current = await readFollowingLists(db, f.a.token, {
    listId: f.created.id
  });
  assert.equal(current.version, 3);
  assert.deepEqual(current.list!.members, []);
  const control = await db.retentionControl.findFirstOrThrow({
    where: { sourceId: f.a.id, kind: "FOLLOWING_LISTS", version: 3 }
  });
  assert.ok(control.journaledAt);
  await relationshipCommand(db, f.a.token, {
    ...input("follow", saved.version),
    kind: "person",
    targetId: f.b.id,
    desired: true
  });
  assert.deepEqual(
    (await readFollowingLists(db, f.a.token, { listId: f.created.id })).list!
      .members,
    []
  );
  await db.socialPreferences.update({
    where: { ownerId: f.a.id },
    data: {
      followingLists: previous.followingLists as Prisma.InputJsonObject,
      followingListsVersion: 2
    }
  });
  await replayRetentionControls(db, [
    control.payload as unknown as RetentionControlEntry
  ]);
  assert.equal(
    (await readFollowingLists(db, f.a.token)).recoveryRequired,
    true
  );
});
test("the complete editor saves name and membership atomically; list and picker limits are explicit", async () => {
  const f = await setup();
  await command(
    db,
    f.a.token,
    input("save", 1, {
      listId: f.created.id,
      name: "Reading together",
      members: [f.member]
    })
  );
  const current = await readFollowingLists(db, f.a.token, {
    listId: f.created.id
  });
  assert.equal(current.list!.name, "Reading together");
  assert.equal(current.list!.members.length, 1);
  await assert.rejects(
    command(
      db,
      f.a.token,
      input("save", 2, {
        listId: f.created.id,
        name: "Must not partially save",
        members: [{ ...f.member, relationshipId: "unavailable" }]
      })
    ),
    status(409)
  );
  assert.equal(
    (await readFollowingLists(db, f.a.token, { listId: f.created.id })).list!
      .name,
    "Reading together"
  );
  for (let n = 0; n < 19; n++)
    await command(
      db,
      f.a.token,
      input("create", n + 2, { name: "Bounded list " + n })
    );
  await assert.rejects(
    command(db, f.a.token, input("create", 21, { name: "One too many" })),
    status(409)
  );
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  await db.platformUser.createMany({
    data: Array.from({ length: 22 }, (_, n) => ({
      id: `list-picker-${suffix}-${n}`,
      email: `list-picker-${suffix}-${n}@example.test`,
      username: `lp_${suffix}_${n}`,
      name: `Fictional picker ${suffix} ${n}`
    }))
  });
  await db.platformFollow.createMany({
    data: Array.from({ length: 22 }, (_, n) => ({
      followerId: f.a.id,
      followingId: `list-picker-${suffix}-${n}`
    }))
  });
  const first = await readFollowingLists(db, f.a.token, { q: suffix });
  assert.equal(first.candidates.length, 20);
  assert.ok(first.nextCursor);
  const second = await readFollowingLists(db, f.a.token, {
    q: suffix,
    after: first.nextCursor
  });
  assert.equal(second.candidates.length, 2);
  assert.equal(second.nextCursor, null);
  assert.equal(
    new Set(
      [...first.candidates, ...second.candidates].map((m) => m.relationshipId)
    ).size,
    22
  );
});
