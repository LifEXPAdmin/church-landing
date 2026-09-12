import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  seedPortal,
  createPortalActor,
  seedOperatorGrants,
  assertPortalTestDatabase
} from "./seed-portal";
import {
  adultContactCommand as command,
  readAdultContact as read
} from "../lib/platform/adult-contact";
import { relationshipCommand } from "../lib/platform/relationships";
import { PortalError } from "../lib/platform/portal-policy";
import { ADULT_POLICY } from "../lib/platform/portal-types";
import {
  contactAudience,
  conversationPair
} from "../lib/platform/adult-contact-policy";
import {
  deactivateAccount,
  reactivateAccount
} from "../lib/platform/account-lifecycle";
import { loginAccount } from "../lib/platform/accounts";
import { portalCommand } from "../lib/platform/portal";
import {
  communityReportCommand,
  readCommunityReports
} from "../lib/platform/community-reports";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
const db = new PrismaClient();
let f: Awaited<ReturnType<typeof seedPortal>>,
  reviewer: Awaited<ReturnType<typeof createPortalActor>>;
let ids: string[], extras: string[];
const oldEnabled = process.env.COMMUNITY_REPORTS_ENABLED;
const input = (operation: string, fields: Record<string, unknown> = {}) => ({
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
  reviewer = await createPortalActor(db, "contactreview");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  ids = [f.memberA.id, f.memberB.id, f.contact.id];
  extras = Array.from({ length: 105 }, () => randomUUID());
  await db.platformUser.createMany({
    data: extras.map((id) => ({
      id,
      name: "Fictional bounded contact",
      username: "c_" + id.replaceAll("-", ""),
      email: id + "@example.test",
      emailVerifiedAt: new Date(),
      adultAcknowledgedAt: new Date(),
      adultPolicyVersion: ADULT_POLICY
    }))
  });
});
beforeEach(async () => {
  process.env.COMMUNITY_REPORTS_ENABLED = "true";
  await db.adultContactRequest.deleteMany({
    where: { OR: [{ senderId: { in: ids } }, { recipientId: { in: ids } }] }
  });
  await db.adultConversation.deleteMany({
    where: {
      OR: [{ participantAId: { in: ids } }, { participantBId: { in: ids } }]
    }
  });
  await db.socialPreferences.deleteMany({
    where: { ownerId: { in: [...ids, ...extras] } }
  });
  await db.socialRelationship.deleteMany({
    where: { OR: [{ ownerId: { in: ids } }, { targetUserId: { in: ids } }] }
  });
  await db.platformFollow.deleteMany({
    where: { OR: [{ followerId: { in: ids } }, { followingId: { in: ids } }] }
  });
  await db.platformAuthLimit.deleteMany();
  await db.platformUser.updateMany({
    where: { id: { in: ids } },
    data: {
      adultAcknowledgedAt: new Date(),
      adultPolicyVersion: ADULT_POLICY,
      emailVerifiedAt: new Date(),
      suspendedAt: null,
      deactivatedAt: null
    }
  });
  await db.platformOperatorGrant.updateMany({
    where: { userId: reviewer.id },
    data: { revokedAt: null }
  });
});
after(async () => {
  if (oldEnabled === undefined) delete process.env.COMMUNITY_REPORTS_ENABLED;
  else process.env.COMMUNITY_REPORTS_ENABLED = oldEnabled;
  await db.$disconnect();
});
async function pref(actor: typeof f.memberA, audience: string) {
  const r = await read(db, actor.token, { view: "preferences" });
  assert.ok("preferences" in r && r.preferences);
  return command(
    db,
    actor.token,
    input("preferences", { expectedVersion: r.preferences.version, audience })
  );
}
async function creation(
  recipientId = f.memberB.id,
  token = f.memberA.token,
  purpose = "A clear personal purpose"
) {
  const r = await read(db, token, { view: "target", recipientId });
  assert.ok("expectedRecipientVersion" in r);
  return input("create", {
    recipientId,
    expectedRecipientVersion: r.expectedRecipientVersion,
    purpose
  });
}
async function request(id: string, token = f.memberA.token) {
  const r = await read(db, token, { view: "receipt", id });
  assert.ok("request" in r && r.request);
  return r.request;
}
async function relationship(
  actor: typeof f.memberA,
  targetId: string,
  operation: string,
  desired: boolean
) {
  const row = await db.socialRelationship.findUnique({
    where: {
      ownerId_targetUserId: { ownerId: actor.id, targetUserId: targetId }
    }
  });
  return relationshipCommand(
    db,
    actor.token,
    input(operation, {
      kind: "person",
      targetId,
      desired,
      expectedVersion: row?.version ?? 0
    })
  );
}
test("legacy/new preferences default off; each audience uses the recipient's follow direction and preserves mentions", async () => {
  assert.equal(contactAudience(undefined), "NOBODY");
  assert.throws(() => contactAudience("legacy-unknown"), PortalError);
  const r = await read(db, f.memberB.token, { view: "preferences" });
  assert.ok("preferences" in r && r.preferences);
  assert.deepEqual(r.preferences, { version: 0, audience: "NOBODY" });
  await denied(command(db, f.memberA.token, await creation()), 404);
  await pref(f.memberB, "FOLLOWED");
  await relationship(f.memberA, f.memberB.id, "follow", true);
  await denied(command(db, f.memberA.token, await creation()), 404);
  await relationship(f.memberB, f.memberA.id, "follow", true);
  const saved = await command(db, f.memberA.token, await creation());
  assert.equal((await request(saved.id, f.memberB.token)).canAccept, true);
  const privacy = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: f.memberB.id }
  });
  assert.equal(privacy.mentions, "EVERYONE");
  assert.equal(privacy.showRelationships, true);
});
test("adult, verification and account eligibility apply to both participants and exact receipt replay", async () => {
  await pref(f.memberB, "EVERYONE");
  for (const actor of [f.unverified, f.unacknowledged]) {
    await denied(read(db, actor.token, { view: "received" }), 403);
    await denied(
      command(
        db,
        actor.token,
        input("create", {
          recipientId: f.memberB.id,
          purpose: "No bypass",
          expectedRecipientVersion: 1
        })
      ),
      403
    );
    await denied(
      read(db, f.memberA.token, { view: "target", recipientId: actor.id }),
      404
    );
  }
  const body = await creation();
  await command(db, f.memberA.token, body);
  await db.platformUser.update({
    where: { id: f.memberA.id },
    data: { adultPolicyVersion: "superseded" }
  });
  await denied(command(db, f.memberA.token, body), 403);
  assert.throws(
    () =>
      command(
        db,
        f.memberB.token,
        input("preferences", {
          audience: "EVERYONE",
          expectedVersion: 1,
          participants: [f.contact.id]
        })
      ),
    (e: unknown) => e instanceof PortalError && e.status === 400
  );
});
test("exact and fresh duplicate creates consume one record and crossed requests never imply acceptance", async () => {
  await pref(f.memberA, "EVERYONE");
  await pref(f.memberB, "EVERYONE");
  const body = await creation();
  const saved = await Promise.all([
    command(db, f.memberA.token, body),
    command(db, f.memberA.token, body)
  ]);
  assert.deepEqual(saved[0], saved[1]);
  assert.equal(
    (await command(db, f.memberA.token, { ...body, mutationId: randomUUID() }))
      .id,
    saved[0].id
  );
  await denied(
    command(db, f.memberA.token, {
      ...body,
      purpose: "Changed under the old key"
    }),
    409
  );
  await denied(
    command(db, f.memberB.token, await creation(f.memberA.id, f.memberB.token)),
    409
  );
  assert.equal(
    await db.adultContactRequest.count({ where: { senderId: f.memberA.id } }),
    1
  );
  assert.equal(
    await db.adultConversation.count({
      where: conversationPair(f.memberA.id, f.memberB.id)
    }),
    0
  );
  assert.deepEqual(
    (await db.platformAuthLimit.findMany()).map((r) => r.hits),
    [1, 1]
  );
});
test("only the recipient accepts, and concurrent acceptance creates one two-person conversation", async () => {
  await pref(f.memberB, "EVERYONE");
  const saved = await command(db, f.memberA.token, await creation());
  const body = input("accept", {
    id: saved.id,
    expectedVersion: saved.version
  });
  await denied(command(db, f.memberA.token, body), 404);
  await denied(command(db, f.contact.token, body), 404);
  const results = await Promise.all([
    command(db, f.memberB.token, body),
    command(db, f.memberB.token, body)
  ]);
  assert.deepEqual(results[0], results[1]);
  await denied(
    command(db, f.memberB.token, { ...body, mutationId: randomUUID() }),
    409
  );
  const a = await request(saved.id),
    b = await request(saved.id, f.memberB.token);
  assert.equal(a.status, "ACCEPTED");
  assert.equal(a.conversation?.id, b.conversation?.id);
  assert.equal(a.conversation?.sendingAllowed, true);
  const conversation = await db.adultConversation.findUniqueOrThrow({
    where: { id: a.conversation!.id }
  });
  assert.deepEqual(
    [conversation.participantAId, conversation.participantBId].sort(),
    [f.memberA.id, f.memberB.id].sort()
  );
  await denied(
    read(db, f.contact.token, { view: "receipt", id: saved.id }),
    404
  );
  await denied(command(db, f.memberA.token, await creation()), 409);
});
test("stale preferences conflict; narrowing and unfollow/refollow permanently invalidate pending consent", async () => {
  const prefs = await pref(f.memberB, "EVERYONE");
  const body = await creation();
  await pref(f.memberB, "FOLLOWED");
  await denied(
    command(
      db,
      f.memberB.token,
      input("preferences", {
        audience: "EVERYONE",
        expectedVersion: prefs.version
      })
    ),
    409
  );
  await relationship(f.memberB, f.memberA.id, "follow", true);
  await denied(command(db, f.memberA.token, body), 409);
  const saved = await command(db, f.memberA.token, await creation());
  await relationship(f.memberB, f.memberA.id, "follow", false);
  await relationship(f.memberB, f.memberA.id, "follow", true);
  assert.equal((await request(saved.id)).status, "REVOKED");
  await denied(
    command(
      db,
      f.memberB.token,
      input("accept", { id: saved.id, expectedVersion: saved.version })
    ),
    409
  );
  const replacement = await command(db, f.memberA.token, await creation());
  await pref(f.memberB, "NOBODY");
  await pref(f.memberB, "EVERYONE");
  assert.equal((await request(replacement.id)).status, "REVOKED");
});
test("both block directions revoke pending requests and block/unblock cannot resurrect an accepted conversation", async () => {
  await pref(f.memberB, "EVERYONE");
  const first = await command(db, f.memberA.token, await creation());
  await relationship(f.memberA, f.memberB.id, "block", true);
  assert.equal((await request(first.id, f.memberB.token)).status, "REVOKED");
  await denied(
    read(db, f.memberB.token, { view: "target", recipientId: f.memberA.id }),
    404
  );
  await relationship(f.memberA, f.memberB.id, "block", false);
  const second = await command(db, f.memberA.token, await creation());
  await command(
    db,
    f.memberB.token,
    input("accept", { id: second.id, expectedVersion: second.version })
  );
  const conversation = (await request(second.id)).conversation!;
  await relationship(f.memberB, f.memberA.id, "block", true);
  const blocked = await request(second.id);
  assert.equal(blocked.person, null);
  assert.equal(blocked.purpose, "A clear personal purpose");
  assert.equal(blocked.conversation?.sendingAllowed, false);
  await pref(f.memberB, "EVERYONE");
  await denied(
    read(db, f.memberA.token, { view: "target", recipientId: f.memberB.id }),
    404
  );
  await relationship(f.memberB, f.memberA.id, "block", false);
  assert.equal((await request(second.id)).conversation?.sendingAllowed, false);
  const third = await command(db, f.memberA.token, await creation());
  await command(
    db,
    f.memberB.token,
    input("accept", { id: third.id, expectedVersion: third.version })
  );
  assert.equal((await request(third.id)).conversation?.id, conversation.id);
  assert.equal(
    await db.adultConversation.count({
      where: conversationPair(f.memberA.id, f.memberB.id)
    }),
    1
  );
});
test("expiry, decline cooldown and withdrawal never open a conversation or permit sender acceptance", async () => {
  await pref(f.memberA, "EVERYONE");
  await pref(f.memberB, "EVERYONE");
  const expired = await command(db, f.memberA.token, await creation());
  await db.adultContactRequest.update({
    where: { id: expired.id },
    data: { expiresAt: new Date(Date.now() - 1000) }
  });
  assert.equal((await request(expired.id)).status, "EXPIRED");
  await denied(
    command(
      db,
      f.memberB.token,
      input("accept", { id: expired.id, expectedVersion: expired.version })
    ),
    409
  );
  const fresh = await command(db, f.memberA.token, await creation());
  await command(
    db,
    f.memberB.token,
    input("decline", { id: fresh.id, expectedVersion: fresh.version })
  );
  await denied(command(db, f.memberA.token, await creation()), 429);
  const reverse = await command(
    db,
    f.memberB.token,
    await creation(f.memberA.id, f.memberB.token)
  );
  await denied(
    command(
      db,
      f.memberA.token,
      input("withdraw", { id: reverse.id, expectedVersion: reverse.version })
    ),
    404
  );
  await command(
    db,
    f.memberB.token,
    input("withdraw", { id: reverse.id, expectedVersion: reverse.version })
  );
  assert.equal((await request(reverse.id)).status, "WITHDRAWN");
  assert.equal(
    await db.adultConversation.count({
      where: conversationPair(f.memberA.id, f.memberB.id)
    }),
    0
  );
});
test("new-activity quotas return Retry-After without charging exact retries or failed transactions", async () => {
  await db.socialPreferences.createMany({
    data: extras
      .slice(0, 6)
      .map((ownerId) => ({ ownerId, contactRequests: "EVERYONE" }))
  });
  let first: Record<string, unknown>;
  for (const id of extras.slice(0, 5)) {
    const body = await creation(id);
    first ??= body;
    await command(db, f.memberA.token, body);
  }
  await command(db, f.memberA.token, first!);
  await assert.rejects(
    command(db, f.memberA.token, await creation(extras[5])),
    (e: unknown) =>
      e instanceof PortalError &&
      e.status === 429 &&
      !!e.retryAfter &&
      e.retryAfter <= 600
  );
  assert.equal(
    await db.adultContactRequest.count({ where: { senderId: f.memberA.id } }),
    5
  );
  assert.deepEqual(
    (await db.platformAuthLimit.findMany()).map((r) => r.hits).sort(),
    [5, 5]
  );
  await db.platformAuthLimit.updateMany({
    data: { expiresAt: new Date(Date.now() - 1000) }
  });
  await command(db, f.memberA.token, await creation(extras[5]));
  assert.equal(
    await db.adultContactRequest.count({ where: { senderId: f.memberA.id } }),
    6
  );
});
test("active incoming/outgoing limits are enforced against canonical rows with no request or quota write", async () => {
  await pref(f.memberB, "EVERYONE");
  const expiresAt = new Date(Date.now() + 86400000);
  await db.adultContactRequest.createMany({
    data: extras.slice(0, 100).map((senderId) => ({
      senderId,
      recipientId: f.memberB.id,
      purpose: "Fictional capacity",
      expiresAt
    }))
  });
  await denied(command(db, f.memberA.token, await creation()), 429);
  assert.equal(await db.platformAuthLimit.count(), 0);
  await db.adultContactRequest.deleteMany({
    where: { recipientId: f.memberB.id }
  });
  await db.adultContactRequest.createMany({
    data: extras.slice(0, 20).map((recipientId) => ({
      senderId: f.memberA.id,
      recipientId,
      purpose: "Fictional capacity",
      expiresAt
    }))
  });
  await denied(command(db, f.memberA.token, await creation()), 429);
  assert.equal(await db.platformAuthLimit.count(), 0);
});
test("daily limits survive short-window recovery and withdrawals", async () => {
  await db.socialPreferences.createMany({
    data: extras
      .slice(0, 21)
      .map((ownerId) => ({ ownerId, contactRequests: "EVERYONE" }))
  });
  for (let n = 0; n < 20; n++) {
    if (n && n % 5 === 0)
      await db.platformAuthLimit.updateMany({
        where: { expiresAt: { lt: new Date(Date.now() + 3600000) } },
        data: { expiresAt: new Date(Date.now() - 1000) }
      });
    const saved = await command(db, f.memberA.token, await creation(extras[n]));
    await command(
      db,
      f.memberA.token,
      input("withdraw", { id: saved.id, expectedVersion: saved.version })
    );
  }
  await db.platformAuthLimit.updateMany({
    where: { expiresAt: { lt: new Date(Date.now() + 3600000) } },
    data: { expiresAt: new Date(Date.now() - 1000) }
  });
  await assert.rejects(
    command(db, f.memberA.token, await creation(extras[20])),
    (e: unknown) =>
      e instanceof PortalError &&
      e.status === 429 &&
      !!e.retryAfter &&
      e.retryAfter > 600
  );
  assert.equal(
    await db.adultContactRequest.count({
      where: { senderId: f.memberA.id, status: "PENDING" }
    }),
    0
  );
  assert.equal(
    await db.adultContactRequest.count({ where: { senderId: f.memberA.id } }),
    20
  );
});
test("selected request reports expose only authorized evidence and exports retain only the account's own submissions", async () => {
  await pref(f.memberB, "EVERYONE");
  await pref(f.contact, "EVERYONE");
  const first = await command(
    db,
    f.memberA.token,
    await creation(f.memberB.id, f.memberA.token, "Selected private purpose")
  );
  await command(
    db,
    f.memberA.token,
    await creation(f.contact.id, f.memberA.token, "Unrelated private purpose")
  );
  await relationship(f.memberB, f.memberA.id, "block", true);
  const query = {
    view: "target",
    targetType: "CONTACT_REQUEST",
    targetId: first.id
  };
  await denied(readCommunityReports(db, f.contact.token, query), 404);
  const target = await readCommunityReports(db, f.memberB.token, query);
  assert.ok(target.target);
  const report = await communityReportCommand(
    db,
    f.memberB.token,
    input("create", {
      targetType: "CONTACT_REQUEST",
      targetId: first.id,
      expectedTargetVersion: target.target.version,
      expectedContextVersion: 0,
      reason: "HARASSMENT",
      details: "Deliberately submitted report context"
    })
  );
  const reviewed = await readCommunityReports(db, reviewer.token, {
    view: "review",
    id: report.id
  });
  assert.ok(
    "evidence" in reviewed && reviewed.evidence?.type === "CONTACT_REQUEST"
  );
  assert.equal(reviewed.evidence.purpose, "Selected private purpose");
  assert.doesNotMatch(
    JSON.stringify(reviewed),
    /Unrelated private purpose|private-login|password|token/
  );
  await denied(
    readCommunityReports(db, f.memberA.token, {
      view: "receipt",
      id: report.id
    }),
    404
  );
  const ownReceipt = await readCommunityReports(db, f.memberB.token, {
    view: "receipt",
    id: report.id
  });
  assert.doesNotMatch(
    JSON.stringify(ownReceipt),
    /Selected private purpose|evidence/
  );
  await db.platformOperatorGrant.updateMany({
    where: { userId: reviewer.id },
    data: { revokedAt: new Date() }
  });
  await denied(
    readCommunityReports(db, reviewer.token, { view: "review", id: report.id }),
    404
  );
  const secret = "Fictional-contact-export-secret-".repeat(3);
  for (const actor of [f.memberA, f.memberB]) {
    const proof = await prepareAccountExport(
      db,
      actor.token,
      actor.password,
      secret
    );
    const exported = JSON.parse(
      await downloadAccountExport(db, actor.token, proof.authorization, secret)
    );
    assert.equal(
      exported.sentContactRequests.length,
      actor.id === f.memberA.id ? 2 : 0
    );
    assert.ok(
      exported.socialPreferences.every((p: { contactRequests: string }) =>
        ["NOBODY", "EVERYONE"].includes(p.contactRequests)
      )
    );
    assert.doesNotMatch(
      JSON.stringify(exported),
      /REVIEW_COMMUNITY_REPORTS|"evidence"|"participantAId"/
    );
  }
});
test("private pagination is stable and owned, and disabled operations preserve receipts and cleanup", async () => {
  const expiresAt = new Date(Date.now() + 86400000),
    createdAt = new Date();
  await db.adultContactRequest.createMany({
    data: extras.slice(0, 35).map((senderId) => ({
      senderId,
      recipientId: f.memberA.id,
      purpose: "Fictional page",
      expiresAt,
      createdAt
    }))
  });
  const a = await read(db, f.memberA.token, { view: "received" });
  assert.ok("requests" in a && a.requests && a.after);
  assert.equal(a.requests.length, 30);
  const b = await read(db, f.memberA.token, {
    view: "received",
    after: a.after
  });
  assert.ok("requests" in b && b.requests);
  assert.equal(b.requests.length, 5);
  assert.equal(
    new Set([...a.requests, ...b.requests].map((r) => r.id)).size,
    35
  );
  await denied(
    read(db, f.memberB.token, { view: "received", after: a.after }),
    409
  );
  assert.doesNotMatch(
    JSON.stringify(a),
    /private-login|emailVerifiedAt|adultPolicyVersion|reviewer|password|token/
  );
  await pref(f.memberB, "EVERYONE");
  const body = await creation(),
    saved = await command(db, f.memberA.token, body);
  process.env.COMMUNITY_REPORTS_ENABLED = "false";
  assert.equal(
    (await read(db, f.memberA.token, { view: "preferences" })).available,
    false
  );
  await command(db, f.memberA.token, body);
  await denied(
    command(
      db,
      f.memberB.token,
      input("accept", { id: saved.id, expectedVersion: saved.version })
    ),
    503
  );
  await command(
    db,
    f.memberA.token,
    input("withdraw", { id: saved.id, expectedVersion: saved.version })
  );
  await pref(f.memberB, "NOBODY");
  await denied(pref(f.memberB, "EVERYONE"), 503);
  process.env.COMMUNITY_REPORTS_ENABLED = "true";
  const coverage = await db.platformOperatorGrant.findMany({
    where: { capability: "REVIEW_COMMUNITY_REPORTS", revokedAt: null },
    select: { id: true }
  });
  try {
    await db.platformOperatorGrant.updateMany({
      where: { id: { in: coverage.map((r) => r.id) } },
      data: { revokedAt: new Date() }
    });
    assert.equal(
      (await read(db, f.memberA.token, { view: "preferences" })).available,
      false
    );
  } finally {
    await db.platformOperatorGrant.updateMany({
      where: { id: { in: coverage.map((r) => r.id) } },
      data: { revokedAt: null }
    });
  }
});
test("database constraints reject crossed pending pairs, self contact and forged conversation membership order", async () => {
  const expiresAt = new Date(Date.now() + 86400000);
  await db.adultContactRequest.create({
    data: {
      senderId: f.memberA.id,
      recipientId: f.memberB.id,
      purpose: "First",
      expiresAt
    }
  });
  await assert.rejects(
    db.adultContactRequest.create({
      data: {
        senderId: f.memberB.id,
        recipientId: f.memberA.id,
        purpose: "Crossed",
        expiresAt
      }
    })
  );
  await assert.rejects(
    db.adultContactRequest.create({
      data: {
        senderId: f.memberA.id,
        recipientId: f.memberA.id,
        purpose: "Self",
        expiresAt
      }
    })
  );
  const sorted = conversationPair(f.memberA.id, f.memberB.id);
  await assert.rejects(
    db.adultConversation.create({
      data: {
        participantAId: sorted.participantBId,
        participantBId: sorted.participantAId
      }
    })
  );
});
test("actual account deactivation and operator suspension revoke consent without restoring it on reactivation", async () => {
  const actor = await createPortalActor(db, "contactlife");
  await pref(f.memberB, "EVERYONE");
  const saved = await command(
    db,
    actor.token,
    await creation(f.memberB.id, actor.token)
  );
  await command(
    db,
    f.memberB.token,
    input("accept", { id: saved.id, expectedVersion: saved.version })
  );
  const accepted = await request(saved.id, actor.token);
  await deactivateAccount(db, actor.token, actor.password, true);
  assert.equal(
    (
      await db.adultConversation.findUniqueOrThrow({
        where: { id: accepted.conversation!.id }
      })
    ).sendingAllowed,
    false
  );
  await assert.rejects(
    read(db, actor.token, { view: "receipt", id: saved.id })
  );
  await reactivateAccount(db, actor.email, actor.password, true);
  const renewed = await loginAccount(db, actor.email, actor.password, null);
  assert.equal(
    (await request(saved.id, renewed)).conversation?.sendingAllowed,
    false
  );
  const second = await command(db, f.memberA.token, await creation());
  const target = await db.platformUser.findUniqueOrThrow({
    where: { id: f.memberA.id }
  });
  await portalCommand(db, f.operator.token, {
    operation: "suspend",
    userId: f.memberA.id,
    suspended: true,
    expectedVersion: target.portalVersion
  });
  assert.equal(
    (
      await db.adultContactRequest.findUniqueOrThrow({
        where: { id: second.id }
      })
    ).status,
    "REVOKED"
  );
});
