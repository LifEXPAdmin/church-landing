import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  createPortalActor,
  assertPortalTestDatabase,
  seedOperatorGrants
} from "./seed-portal";
import {
  requestPermanentAccountDeletion,
  readAccountDeletionProgress,
  type AccountDeletionRecord
} from "../lib/platform/account-deletion";
import {
  eraseRequestedAccountData,
  finalizeAccountDeletion
} from "../lib/platform/account-erasure";
import {
  protectedAccountDeletionJournal,
  replayAccountDeletions,
  type AccountJournalEntry
} from "../lib/platform/account-deletion-journal";
import { readCommunityReports } from "../lib/platform/community-reports";
import {
  runMessagingRetention,
  DAY
} from "../lib/platform/messaging-retention";
import { commentVisibleWhere } from "../lib/platform/comment-policy";
import { createSessionToken } from "../lib/platform/auth";
import { handleAccountRequest } from "../lib/platform/account-boundary";
import { readAccountSession, loginAccount } from "../lib/platform/accounts";
import { reactivateAccount } from "../lib/platform/account-lifecycle";
import {
  readAdultMessages,
  adultMessageCommand
} from "../lib/platform/adult-messages";
import { inspectMessagingRetention } from "../lib/platform/messaging-retention";

const db = new PrismaClient();
const records: AccountDeletionRecord[] = [];
const journal = {
  async completeAccount() {},
  async recordAccount(r: AccountDeletionRecord) {
    records.push(r);
  }
};
before(async () => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const owner = () => createPortalActor(db, "erase");

test("permanent closure requires verified owner credentials and confirmation; journal failure cannot restore access or postpone the deadline", async () => {
  const a = await owner(),
    proof = createSessionToken();
  for (const [password, confirmed] of [
    ["wrong-password", true],
    [a.password, false]
  ] as const)
    await assert.rejects(
      requestPermanentAccountDeletion(
        db,
        a.token,
        password,
        confirmed,
        proof,
        journal
      )
    );
  assert.equal(await db.accountDeletion.count({ where: { userId: a.id } }), 0);
  const result = await requestPermanentAccountDeletion(
    db,
    a.token,
    a.password,
    true,
    proof,
    {
      async recordAccount() {
        throw Error("Provider unavailable");
      }
    }
  );
  assert.equal(result.accepted, true);
  assert.equal(result.protectedJournalReady, false);
  assert.equal(
    Date.parse(result.activeDataDueAt) - Date.parse(result.requestedAt),
    30 * 86400000
  );
  assert.equal(await readAccountSession(db, a.token), null);
  await assert.rejects(loginAccount(db, a.email, a.password, "old owner"));
  await assert.rejects(reactivateAccount(db, a.email, a.password, true));
  await assert.rejects(
    db.platformUser.update({
      where: { id: a.id },
      data: { deactivatedAt: null }
    })
  );
  assert.deepEqual(await readAccountDeletionProgress(db, proof), result);
  assert.deepEqual(
    await requestPermanentAccountDeletion(
      db,
      a.token,
      a.password,
      true,
      proof,
      journal
    ),
    result
  );
  const fixed = await db.accountDeletion.findUniqueOrThrow({
    where: { userId: a.id }
  });
  await assert.rejects(
    db.accountDeletion.update({
      where: { id: fixed.id },
      data: { dueAt: new Date(fixed.dueAt.getTime() + DAY) }
    })
  );
  await assert.rejects(readAccountDeletionProgress(db, createSessionToken()));
  assert.ok(!JSON.stringify(result).includes(a.email));
  assert.ok(!JSON.stringify(result).includes(a.id));
});

test("only selected reported comment text survives erasure, stays invisible to ordinary readers, and expires with the last report", async () => {
  const a = await owner(),
    b = await owner(),
    reviewer = await owner();
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  const post = await db.platformPost.create({
    data: { authorId: b.id, content: "Fictional public parent" }
  });
  const comment = await db.platformPostComment.create({
    data: {
      authorId: a.id,
      postId: post.id,
      content: "Selected fictional evidence"
    }
  });
  const reports = await Promise.all(
    [a, b].map((actor) =>
      db.communityReport.create({
        data: {
          reporterId: actor.id,
          targetType: "COMMENT",
          targetId: comment.id,
          targetVersion: 1,
          reason: "PRIVACY",
          status: "CLOSED",
          closedAt: new Date(Date.now() - 181 * DAY)
        }
      })
    )
  );
  await requestPermanentAccountDeletion(
    db,
    a.token,
    a.password,
    true,
    createSessionToken(),
    journal
  );
  const request = await db.accountDeletion.findUniqueOrThrow({
    where: { userId: a.id }
  });
  await eraseRequestedAccountData(db, request.id, journal);
  const selected = (
    await readCommunityReports(db, reviewer.token, {
      view: "review",
      id: reports[0].id
    })
  ).evidence;
  assert.ok(selected && selected.type === "COMMENT");
  assert.equal(selected.content, comment.content);
  assert.equal(
    await db.platformPostComment.count({
      where: {
        AND: [
          { id: comment.id },
          commentVisibleWhere({
            actorId: b.id,
            churches: [],
            blockedIds: [],
            publishers: new Set(),
            moderators: new Set(),
            volunteers: new Set()
          })
        ]
      }
    }),
    0
  );
  const purge = async (id: string) =>
    runMessagingRetention(
      db,
      (await inspectMessagingRetention(db)).candidates.filter(
        (c) => c.id === id
      ),
      { async record() {}, async complete() {} }
    );
  await purge(reports[0].id);
  assert.equal(
    (
      await db.platformPostComment.findUniqueOrThrow({
        where: { id: comment.id }
      })
    ).content,
    comment.content
  );
  await purge(reports[1].id);
  const removed = await db.platformPostComment.findUniqueOrThrow({
    where: { id: comment.id }
  });
  assert.equal(removed.content, "");
  assert.ok(removed.deletedAt);
});

function memoryAccountJournal() {
  const files = new Map<string, AccountJournalEntry>();
  return {
    files,
    journal: protectedAccountDeletionJournal({
      async read(path) {
        return files.get(path) ?? null;
      },
      async write(path, entry) {
        if (files.has(path)) throw Error("Immutable object already exists");
        files.set(path, structuredClone(entry));
      },
      async remove(path) {
        files.delete(path);
      },
      async page() {
        return { paths: [...files.keys()] };
      }
    })
  };
}

test("a separately protected request replays against a pre-deletion snapshot before sign-in and keeps its original completion/expiry clock", async () => {
  const a = await owner(),
    protectedStore = memoryAccountJournal();
  const before = await db.platformUser.findUniqueOrThrow({
    where: { id: a.id }
  });
  const p = await db.platformPost.create({
    data: { authorId: a.id, content: "Old backup private data" }
  });
  const proof = createSessionToken();
  await requestPermanentAccountDeletion(
    db,
    a.token,
    a.password,
    true,
    proof,
    protectedStore.journal
  );
  const request = await db.accountDeletion.findUniqueOrThrow({
    where: { userId: a.id }
  });
  await eraseRequestedAccountData(db, request.id, protectedStore.journal);
  const done = await finalizeAccountDeletion(
    db,
    request.id,
    protectedStore.journal
  );
  assert.equal(done.pending, false);
  const page = await protectedStore.journal.page();
  assert.equal(page.entries.length, 1);
  assert.equal(page.entries[0].completedAt, done.completedAt!.toISOString());
  // This isolated fixture simulates older restored rows; production restoration
  // uses a separate database with traffic disabled, never this trigger bypass.
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      "SET LOCAL session_replication_role = 'replica'"
    );
    await tx.accountDeletion.delete({ where: { id: request.id } });
    await tx.platformUser.update({
      where: { id: a.id },
      data: {
        name: before.name,
        username: before.username,
        email: before.email,
        passwordHash: before.passwordHash,
        emailVerifiedAt: before.emailVerifiedAt,
        deactivatedAt: null,
        deletionRequestedAt: null,
        erasedAt: null
      }
    });
    await tx.platformPost.update({
      where: { id: p.id },
      data: { content: p.content }
    });
  });
  const staleToken = await loginAccount(
    db,
    a.email,
    a.password,
    "isolated pre-restore session"
  );
  assert.deepEqual(
    await replayAccountDeletions(db, page.entries, protectedStore.journal),
    { replayed: 1 }
  );
  assert.equal(await readAccountSession(db, staleToken), null);
  await assert.rejects(
    loginAccount(db, a.email, a.password, "restored credentials")
  );
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: p.id } })).content,
    ""
  );
  const replayDone = await finalizeAccountDeletion(
    db,
    request.id,
    protectedStore.journal
  );
  assert.equal(replayDone.completedAt!.getTime(), done.completedAt!.getTime());
  const r = page.entries[0];
  const record: AccountDeletionRecord = {
    id: r.id,
    userId: r.userId,
    requestedAt: r.requestedAt,
    policy: r.policy
  };
  assert.equal(
    await protectedStore.journal.expire(
      record,
      new Date(done.completedAt!.getTime() + 90 * DAY - 1)
    ),
    false
  );
  assert.equal(
    await protectedStore.journal.expire(
      record,
      new Date(done.completedAt!.getTime() + 90 * DAY)
    ),
    true
  );
  assert.equal(protectedStore.files.size, 0);
  assert.ok(!JSON.stringify(page).includes(a.email));
  assert.ok(!JSON.stringify(page).includes(proof));
});

test("personal calendar and support input are erased; provider-pending personal media prevents a false completion", async () => {
  const a = await owner();
  const cal = await db.platformCalendar.create({
    data: {
      ownerId: a.id,
      creatorId: a.id,
      requestKey: randomUUID(),
      name: "Fictional private calendar",
      timeZone: "America/Chicago"
    }
  });
  const c = await db.supportCase.create({
    data: {
      requesterId: a.id,
      category: "ACCOUNT_WEBSITE",
      subject: "Fictional private support",
      description: "Fictional private support request"
    }
  });
  const m = await db.supportMessage.create({
    data: {
      caseId: c.id,
      authorId: a.id,
      kind: "REPLY",
      body: "Fictional requester detail",
      version: 1
    }
  });
  const image = await db.mediaAsset.create({
    data: {
      uploaderId: a.id,
      profileUserId: a.id,
      requestKey: randomUUID(),
      fingerprint: "a".repeat(64),
      purpose: "PROFILE_AVATAR",
      status: "READY",
      leaseUntil: new Date(),
      storagePrefix: "fixture/" + randomUUID(),
      caption: "Private caption",
      alt: "Private alt"
    }
  });
  await requestPermanentAccountDeletion(
    db,
    a.token,
    a.password,
    true,
    createSessionToken(),
    journal
  );
  const request = await db.accountDeletion.findUniqueOrThrow({
    where: { userId: a.id }
  });
  await eraseRequestedAccountData(db, request.id, journal);
  assert.equal(
    await db.platformCalendar.findUnique({ where: { id: cal.id } }),
    null
  );
  assert.equal(
    (await db.supportCase.findUniqueOrThrow({ where: { id: c.id } }))
      .description,
    "Personal information removed after account deletion."
  );
  assert.equal(
    (await db.supportMessage.findUniqueOrThrow({ where: { id: m.id } })).body,
    "Removed after account deletion."
  );
  assert.equal(
    (await finalizeAccountDeletion(db, request.id, journal)).pending,
    true
  );
  const retired = await db.mediaAsset.findUniqueOrThrow({
    where: { id: image.id }
  });
  assert.equal(retired.status, "RETIRED");
  assert.equal(retired.caption, "");
  // Isolated provider-ack simulation; end-to-end media tests exercise actual worker I/O.
  await db.mediaGarbage.delete({
    where: { storagePrefix: image.storagePrefix }
  });
  assert.equal(
    (await finalizeAccountDeletion(db, request.id, journal)).pending,
    false
  );
  assert.equal(
    await db.mediaAsset.findUnique({ where: { id: image.id } }),
    null
  );
});
test("unverified accounts and another person's session cannot erase a selected account", async () => {
  const a = await createPortalActor(db, "eraseun", { verified: false });
  await assert.rejects(
    requestPermanentAccountDeletion(
      db,
      a.token,
      a.password,
      true,
      createSessionToken(),
      journal
    )
  );
  assert.equal(await db.accountDeletion.count({ where: { userId: a.id } }), 0);
  const b = await owner();
  await assert.rejects(
    requestPermanentAccountDeletion(
      db,
      b.token,
      a.password,
      true,
      createSessionToken(),
      journal
    )
  );
  assert.equal(await db.accountDeletion.count({ where: { userId: b.id } }), 0);
});

test("deletion HTTP boundary rejects forged origins, switched accounts and extra targets; exact retry and progress need no restored session", async () => {
  const a = await owner(),
    b = await owner(),
    proof = createSessionToken();
  const prior = {
    enabled: process.env.ACCOUNT_DELETION_ENABLED,
    store: process.env.BLOB_STORE_ID
  };
  const call = (
    body: Record<string, unknown>,
    token = a.token,
    origin = process.env.ACCOUNT_ORIGIN!
  ) =>
    handleAccountRequest(
      db,
      new Request(process.env.ACCOUNT_ORIGIN + "/api/platform/account", {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: "church_platform_session=" + token
        },
        body: JSON.stringify(body)
      }),
      undefined,
      journal
    );
  const body = {
    operation: "delete-account",
    ownerId: a.id,
    proof,
    currentPassword: a.password,
    confirmed: true
  };
  try {
    process.env.ACCOUNT_DELETION_ENABLED = "false";
    assert.equal((await call(body)).status, 503);
    assert.equal(
      await db.accountDeletion.count({ where: { userId: a.id } }),
      0
    );
    process.env.ACCOUNT_DELETION_ENABLED = "true";
    process.env.BLOB_STORE_ID = "isolated-injected-journal";
    assert.equal(
      (await call(body, a.token, "https://attacker.example.test")).status,
      403
    );
    assert.equal((await call({ ...body, targetId: b.id })).status, 400);
    assert.equal(
      (await call({ ...body, currentPassword: b.password }, b.token)).status,
      401
    );
    const response = await call(body);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.match(response.headers.get("set-cookie")!, /Max-Age=0/);
    const receipt = await response.json();
    assert.deepEqual(await (await call(body)).json(), receipt);
    assert.deepEqual(
      await (await call({ operation: "deletion-progress", proof }, "")).json(),
      receipt
    );
    assert.equal(
      (
        await call(
          { operation: "deletion-progress", proof: createSessionToken() },
          ""
        )
      ).status,
      400
    );
    assert.ok(await readAccountSession(db, b.token));
  } finally {
    if (prior.enabled === undefined)
      delete process.env.ACCOUNT_DELETION_ENABLED;
    else process.env.ACCOUNT_DELETION_ENABLED = prior.enabled;
    if (prior.store === undefined) delete process.env.BLOB_STORE_ID;
    else process.env.BLOB_STORE_ID = prior.store;
  }
});
test("erasure removes private collections/profile/credentials while preserving the other participant's canonical history under Deleted member", async () => {
  const a = await owner(),
    b = await owner(),
    proof = createSessionToken();
  const marker = "Fictional personal data " + randomUUID();
  await db.platformUser.update({
    where: { id: a.id },
    data: {
      bio: marker,
      location: marker,
      website: "https://example.test/private"
    }
  });
  await db.profilePresentation.create({
    data: { userId: a.id, introduction: marker }
  });
  await db.privatePostDraft.create({
    data: {
      ownerId: a.id,
      id: randomUUID(),
      payload: { content: marker, replyAudience: "CHURCH_MEMBERS" }
    }
  });
  const p = await db.platformPost.create({
    data: {
      authorId: a.id,
      content: marker,
      discoveryCountry: "US",
      discoveryLanguage: "en",
      discoveryDenomination: "private-erasure-tradition"
    }
  });
  const comment = await db.platformPostComment.create({
    data: { authorId: a.id, postId: p.id, content: marker }
  });
  await db.socialPreferences.create({
    data: {
      ownerId: a.id,
      contactRequests: "NOBODY",
      feedMode: "weekly",
      feedVersion: 2,
      discovery: { hiddenWords: [marker], feedback: { community: 1 } },
      discoveryVersion: 2,
      profilePinPostId: p.id,
      profilePinVersion: 1
    }
  });
  await db.feedSnapshot.create({
    data: {
      id: randomUUID(),
      ownerId: a.id,
      mode: "weekly",
      selectionKey: "private-erasure-selection",
      postIds: [p.id],
      expiresAt: new Date(Date.now() + 3600000)
    }
  });
  const [participantAId, participantBId] = [a.id, b.id].sort();
  const c = await db.adultConversation.create({
    data: {
      participantAId,
      participantBId,
      sendingAllowed: true,
      lastSequence: 1
    }
  });
  const message = await db.adultMessage.create({
    data: {
      conversationId: c.id,
      senderId: a.id,
      sequence: 1,
      content: "Shared recipient-retained history"
    }
  });
  await requestPermanentAccountDeletion(
    db,
    a.token,
    a.password,
    true,
    proof,
    journal
  );
  const request = await db.accountDeletion.findUniqueOrThrow({
    where: { userId: a.id }
  });
  await eraseRequestedAccountData(db, request.id, journal);
  const deleted = await db.platformUser.findUniqueOrThrow({
    where: { id: a.id }
  });
  assert.equal(deleted.name, "Deleted member");
  assert.equal(deleted.passwordHash, null);
  assert.equal(deleted.bio, null);
  assert.equal(await db.feedSnapshot.count({ where: { ownerId: a.id } }), 0);
  assert.equal(
    await db.socialPreferences.count({ where: { ownerId: a.id } }),
    0
  );
  assert.notEqual(deleted.email, a.email);
  assert.equal(
    await db.privatePostDraft.count({ where: { ownerId: a.id } }),
    0
  );
  assert.equal(
    await db.profilePresentation.count({ where: { userId: a.id } }),
    0
  );
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: p.id } })).content,
    ""
  );
  const erasedPost = await db.platformPost.findUniqueOrThrow({
    where: { id: p.id }
  });
  for (const key of [
    "discoveryCountry",
    "discoveryLanguage",
    "discoveryDenomination",
    "discoveryPlaceId",
    "discoveryRegion",
    "discoveryLatitude",
    "discoveryLongitude"
  ] as const)
    assert.equal(erasedPost[key], null, key);
  assert.equal(
    (
      await db.platformPostComment.findUniqueOrThrow({
        where: { id: comment.id }
      })
    ).content,
    ""
  );
  const view = await readAdultMessages(db, b.token, {
    view: "conversation",
    conversationId: c.id
  });
  assert.equal(view.conversation!.deletedMember, true);
  assert.equal(view.conversation!.person, null);
  assert.equal(view.conversation!.sendingAllowed, false);
  assert.equal(view.messages![0].content, message.content);
  assert.ok(
    !(await inspectMessagingRetention(db)).candidates.some(
      (x) => x.id === message.id
    )
  );
  await adultMessageCommand(db, b.token, {
    operation: "clear",
    mutationId: randomUUID(),
    conversationId: c.id,
    through: message.id,
    expectedVersion: 0
  });
  assert.ok(
    (await inspectMessagingRetention(db)).candidates.some(
      (x) => x.id === message.id
    )
  );
  const before = await readAccountDeletionProgress(db, proof);
  await eraseRequestedAccountData(db, request.id, journal);
  const after = await readAccountDeletionProgress(db, proof);
  assert.equal(after.requestedAt, before.requestedAt);
  assert.equal(after.activeDataDueAt, before.activeDataDueAt);
  assert.equal(after.structuredPurgedAt, before.structuredPurgedAt);
  assert.ok(
    records.every(
      (r) =>
        !JSON.stringify(r).includes(a.email) &&
        !JSON.stringify(r).includes(proof)
    )
  );
});
test("outstanding privileged duties remain a recorded handoff exception while unaffected personal data is erased", async () => {
  const a = await owner();
  await seedOperatorGrants(db, a, ["REVIEW_COMMUNITY_REPORTS"]);
  const proof = createSessionToken();
  const first = await requestPermanentAccountDeletion(
    db,
    a.token,
    a.password,
    true,
    proof,
    journal
  );
  assert.equal(
    (first.handoffs as { operatorCapabilities: number }).operatorCapabilities,
    1
  );
  const row = await db.accountDeletion.findUniqueOrThrow({
    where: { userId: a.id }
  });
  await eraseRequestedAccountData(db, row.id, journal);
  const next = await readAccountDeletionProgress(db, proof);
  assert.equal(next.activeDataDueAt, first.activeDataDueAt);
  assert.equal(
    (next.handoffs as { operatorCapabilities: number }).operatorCapabilities,
    1
  );
  assert.equal(next.completedAt, null);
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { id: a.id } }))
      .emailVerifiedAt,
    null
  );
  assert.equal(
    await db.platformOperatorGrant.count({ where: { userId: a.id } }),
    1
  );
});
