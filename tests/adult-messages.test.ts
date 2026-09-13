import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  seedPortal,
  assertPortalTestDatabase,
  seedOperatorGrants
} from "./seed-portal";
import {
  adultMessageCommand as command,
  readAdultMessages as read
} from "../lib/platform/adult-messages";
import {
  adultContactCommand,
  readAdultContact
} from "../lib/platform/adult-contact";
import { relationshipCommand } from "../lib/platform/relationships";
import { PortalError } from "../lib/platform/portal-policy";
import { ADULT_POLICY } from "../lib/platform/portal-types";
import { accountConfig } from "../lib/platform/account-config";
import {
  communityReportCommand,
  readCommunityReports
} from "../lib/platform/community-reports";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
const db = new PrismaClient();
let f: Awaited<ReturnType<typeof seedPortal>>, ids: string[];
const oldEnabled = process.env.COMMUNITY_REPORTS_ENABLED;
const input = (operation: string, fields: Record<string, unknown> = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const denied = (work: Promise<unknown>, status: number) =>
  assert.rejects(work, (e) => e instanceof PortalError && e.status === status);
before(async () => {
  await assertPortalTestDatabase(db);
  f = await seedPortal(db);
  ids = [f.memberA.id, f.memberB.id, f.contact.id];
  await seedOperatorGrants(db, f.operator, ["REVIEW_COMMUNITY_REPORTS"]);
});
beforeEach(async () => {
  process.env.COMMUNITY_REPORTS_ENABLED = "true";
  const own = {
    OR: [{ participantAId: { in: ids } }, { participantBId: { in: ids } }]
  };
  await db.adultMessage.deleteMany({ where: { conversation: own } });
  await db.adultConversationState.deleteMany({ where: { conversation: own } });
  await db.adultContactRequest.deleteMany({
    where: { OR: [{ senderId: { in: ids } }, { recipientId: { in: ids } }] }
  });
  await db.adultConversation.deleteMany({ where: own });
  await db.socialRelationship.deleteMany({
    where: { OR: [{ ownerId: { in: ids } }, { targetUserId: { in: ids } }] }
  });
  await db.socialPreferences.deleteMany({ where: { ownerId: { in: ids } } });
  await db.platformAuthLimit.deleteMany();
  await db.platformUser.updateMany({
    where: { id: { in: ids } },
    data: {
      emailVerifiedAt: new Date(),
      adultAcknowledgedAt: new Date(),
      adultPolicyVersion: ADULT_POLICY,
      suspendedAt: null,
      deactivatedAt: null
    }
  });
});
after(async () => {
  if (oldEnabled === undefined) delete process.env.COMMUNITY_REPORTS_ENABLED;
  else process.env.COMMUNITY_REPORTS_ENABLED = oldEnabled;
  await db.$disconnect();
});
async function pair(a = f.memberA, b = f.memberB) {
  const preferences = await readAdultContact(db, b.token, {
    view: "preferences"
  });
  await adultContactCommand(
    db,
    b.token,
    input("preferences", {
      audience: "EVERYONE",
      expectedVersion: preferences.preferences!.version
    })
  );
  const target = await readAdultContact(db, a.token, {
    view: "target",
    recipientId: b.id
  });
  const request = await adultContactCommand(
    db,
    a.token,
    input("create", {
      recipientId: b.id,
      purpose: "Original accepted purpose",
      expectedRecipientVersion: target.expectedRecipientVersion
    })
  );
  await adultContactCommand(
    db,
    b.token,
    input("accept", { id: request.id, expectedVersion: request.version })
  );
  const saved = await db.adultContactRequest.findUniqueOrThrow({
    where: { id: request.id }
  });
  return db.adultConversation.findUniqueOrThrow({
    where: { id: saved.conversationId! }
  });
}
async function send(
  conversationId: string,
  content: string,
  actor = f.memberA
) {
  const row = await db.adultConversation.findUniqueOrThrow({
    where: { id: conversationId }
  });
  return command(
    db,
    actor.token,
    input("send", { conversationId, content, expectedVersion: row.version })
  );
}
const conversation = (
  id: string,
  actor = f.memberA,
  fields: Record<string, unknown> = {}
) =>
  read(db, actor.token, {
    view: "conversation",
    conversationId: id,
    ...fields
  });
async function block(actor = f.memberA, other = f.memberB, desired = true) {
  const prior = await db.socialRelationship.findUnique({
    where: {
      ownerId_targetUserId: { ownerId: actor.id, targetUserId: other.id }
    }
  });
  return relationshipCommand(
    db,
    actor.token,
    input("block", {
      kind: "person",
      targetId: other.id,
      desired,
      expectedVersion: prior?.version ?? 0
    })
  );
}
async function choice(
  id: string,
  operation: string,
  fields: Record<string, unknown> = {},
  actor = f.memberA
) {
  const view = await conversation(id, actor);
  return command(
    db,
    actor.token,
    input(operation, {
      conversationId: id,
      expectedVersion: view.conversation!.preferences.version,
      ...fields
    })
  );
}
async function seedMessages(id: string, count: number) {
  const start = (
    await db.adultConversation.findUniqueOrThrow({ where: { id } })
  ).lastSequence;
  await db.adultMessage.createMany({
    data: Array.from({ length: count }, (_, index) => ({
      id: randomUUID(),
      conversationId: id,
      senderId: f.memberB.id,
      sequence: start + index + 1,
      content: `Fictional sequence ${start + index + 1}`
    }))
  });
  await db.adultConversation.update({
    where: { id },
    data: { lastSequence: start + count }
  });
}
test("only accepted eligible participants read/send; input cannot forge membership", async () => {
  const row = await pair();
  await denied(conversation(row.id, f.contact), 404);
  await denied(send(row.id, "Guessed conversation", f.contact), 404);
  await denied(
    read(db, "", { view: "conversation", conversationId: row.id }),
    401
  );
  assert.throws(
    () =>
      command(
        db,
        f.memberA.token,
        input("send", {
          conversationId: row.id,
          content: "Forged",
          senderId: f.memberB.id
        })
      ),
    PortalError
  );
  await db.platformUser.update({
    where: { id: f.memberB.id },
    data: { adultAcknowledgedAt: null }
  });
  await denied(send(row.id, "Unknown other adult"), 403);
  const view = await conversation(row.id);
  assert.equal(view.conversation!.person, null);
  assert.equal(view.conversation!.sendingAllowed, false);
});
test("concurrent exact sends produce one message, one sequence and one quota charge per scope", async () => {
  const row = await pair();
  const body = input("send", {
    conversationId: row.id,
    expectedVersion: row.version,
    content: "Exact \r\n immutable text"
  });
  const [a, b] = await Promise.all([
    command(db, f.memberA.token, body),
    command(db, f.memberA.token, body)
  ]);
  assert.deepEqual(a, b);
  assert.equal(
    await db.adultMessage.count({ where: { conversationId: row.id } }),
    1
  );
  assert.equal(
    (await db.adultConversation.findUniqueOrThrow({ where: { id: row.id } }))
      .lastSequence,
    1
  );
  const view = await conversation(row.id, f.memberB);
  assert.equal(view.messages![0].content, "Exact \n immutable text");
  assert.equal(view.conversation!.unread, 1);
  assert.equal(view.context!.purpose, "Original accepted purpose");
  assert.equal(
    view.messages!.length,
    1,
    "Accepted purpose must not be duplicated into a message"
  );
  await denied(
    command(db, f.memberA.token, { ...body, content: "Changed" }),
    409
  );
  for (const scope of ["minute", "day"]) {
    const key = createHmac("sha256", accountConfig().rateSecret)
      .update(`activity:adult-message-${scope}:${f.memberA.id}`)
      .digest("hex");
    assert.equal(
      (await db.platformAuthLimit.findUniqueOrThrow({ where: { key } })).hits,
      1
    );
  }
  const writes = await Promise.all([
    send(row.id, "One"),
    send(row.id, "Two"),
    send(row.id, "Three", f.memberB)
  ]);
  assert.deepEqual(writes.map((r) => r.version).sort(), [2, 3, 4]);
});
test("text is bounded/plain and wrong permission versions cannot change state", async () => {
  const row = await pair();
  for (const content of ["   ", "x".repeat(4001), null])
    await denied(
      command(
        db,
        f.memberA.token,
        input("send", {
          conversationId: row.id,
          expectedVersion: row.version,
          content
        })
      ),
      400
    );
  await denied(
    command(
      db,
      f.memberA.token,
      input("send", {
        conversationId: row.id,
        expectedVersion: row.version + 1,
        content: "Stale"
      })
    ),
    409
  );
  const literal = "<script>literal plain text</script>";
  await send(row.id, literal);
  assert.equal((await conversation(row.id)).messages![0].content, literal);
  await denied(
    command(
      db,
      f.memberA.token,
      input("edit", {
        conversationId: row.id,
        expectedVersion: 0,
        content: "No edit capability"
      })
    ),
    400
  );
});
test("history is bounded, stable and private across older/newer cursors and fresh service sessions", async () => {
  const row = await pair();
  await seedMessages(row.id, 123);
  const first = await conversation(row.id);
  assert.equal(first.messages!.length, 50);
  assert.deepEqual(
    first.messages!.map((m) => m.sequence),
    Array.from({ length: 50 }, (_, i) => i + 74)
  );
  const second = await conversation(row.id, f.memberA, { before: first.older });
  assert.equal(second.messages![0].sequence, 24);
  const third = await conversation(row.id, f.memberA, { before: second.older });
  assert.equal(third.messages!.length, 23);
  assert.equal(third.older, null);
  const caught = await conversation(row.id, f.memberA, {
    after: third.messages!.at(-1)!.id
  });
  assert.equal(caught.messages!.length, 50);
  assert.equal(caught.messages![0].sequence, 24);
  assert.ok(caught.newer);
  const other = await pair(f.memberA, f.contact);
  const elsewhere = await send(other.id, "Other private thread");
  await denied(conversation(row.id, f.memberA, { after: elsewhere.id }), 409);
  await denied(
    conversation(row.id, f.contact, { after: first.messages![0].id }),
    404
  );
  const independent = new PrismaClient();
  try {
    assert.equal(
      (
        await read(independent, f.memberA.token, {
          view: "conversation",
          conversationId: row.id
        })
      ).messages!.at(-1)!.sequence,
      123
    );
  } finally {
    await independent.$disconnect();
  }
  assert.equal(
    (await conversation(row.id)).conversation!.preferences.readThrough,
    0,
    "Reads never mark history seen"
  );
});
test("own visible read marker advances monotonically and stays independent from preference versions", async () => {
  const row = await pair();
  await seedMessages(row.id, 4);
  const initial = await conversation(row.id),
    messages = initial.messages!;
  await command(
    db,
    f.memberA.token,
    input("read", { conversationId: row.id, through: messages[2].id })
  );
  let view = await conversation(row.id);
  const version = view.conversation!.preferences.version;
  assert.equal(view.conversation!.unread, 1);
  await command(
    db,
    f.memberA.token,
    input("read", { conversationId: row.id, through: messages[0].id })
  );
  view = await conversation(row.id);
  assert.equal(view.conversation!.preferences.readThrough, 3);
  assert.equal(view.conversation!.preferences.version, version);
  await command(
    db,
    f.memberA.token,
    input("mute", {
      conversationId: row.id,
      expectedVersion: version,
      value: true
    })
  );
  assert.equal(
    (await conversation(row.id, f.memberB)).conversation!.preferences
      .readThrough,
    0
  );
  assert.doesNotMatch(
    JSON.stringify((await conversation(row.id, f.memberB)).conversation),
    /readThrough":3/
  );
  await denied(
    command(
      db,
      f.contact.token,
      input("read", { conversationId: row.id, through: messages[3].id })
    ),
    404
  );
});
test("mute and archive are personal; incoming messages restore an archived inbox without unmuting", async () => {
  const row = await pair();
  await choice(row.id, "mute", { value: true });
  const stale = (await conversation(row.id)).conversation!.preferences.version;
  await choice(row.id, "archive", { value: true });
  assert.equal(
    (await read(db, f.memberA.token, { view: "inbox" })).conversations!.length,
    0
  );
  assert.equal(
    (await read(db, f.memberA.token, { view: "inbox", archived: "true" }))
      .conversations![0].id,
    row.id
  );
  await denied(
    command(
      db,
      f.memberA.token,
      input("mute", {
        conversationId: row.id,
        expectedVersion: stale,
        value: false
      })
    ),
    409
  );
  await send(row.id, "New incoming while archived", f.memberB);
  const view = (await read(db, f.memberA.token, { view: "inbox" }))
    .conversations![0];
  assert.equal(view.preferences.archived, false);
  assert.equal(view.preferences.muted, true);
  assert.equal(view.unread, 1);
  assert.equal(
    (await conversation(row.id, f.memberB)).conversation!.preferences.muted,
    false
  );
  assert.throws(
    () =>
      command(
        db,
        f.memberA.token,
        input("mute", {
          ownerId: f.memberB.id,
          conversationId: row.id,
          value: true
        })
      ),
    PortalError
  );
});
test("clear hides only an acknowledged prefix for its owner and survives later messages and unarchive", async () => {
  const row = await pair();
  await seedMessages(row.id, 3);
  const first = (await conversation(row.id)).messages!;
  await choice(row.id, "clear", { through: first[1].id });
  let view = await conversation(row.id);
  assert.deepEqual(
    view.messages!.map((m) => m.sequence),
    [3]
  );
  assert.equal(view.conversation!.preferences.readThrough, 2);
  assert.equal((await conversation(row.id, f.memberB)).messages!.length, 3);
  await denied(conversation(row.id, f.memberA, { before: first[1].id }), 409);
  await choice(row.id, "archive", { value: true });
  await choice(row.id, "archive", { value: false });
  await send(row.id, "After clear", f.memberB);
  view = await conversation(row.id);
  assert.deepEqual(
    view.messages!.map((m) => m.sequence),
    [3, 4]
  );
  assert.equal(
    await db.adultMessage.count({ where: { conversationId: row.id } }),
    4
  );
});
test("block races cannot permit a later send; historical retries never restore consent and unblock needs acceptance", async () => {
  const row = await pair();
  const body = input("send", {
    conversationId: row.id,
    expectedVersion: row.version,
    content: "Committed before block"
  });
  const saved = await command(db, f.memberA.token, body);
  await block(f.memberB, f.memberA);
  const replay = await command(db, f.memberA.token, body);
  assert.deepEqual(replay, saved);
  await denied(send(row.id, "After block"), 403);
  const view = await conversation(row.id);
  assert.equal(view.messages!.length, 1);
  assert.equal(view.conversation!.person, null);
  await block(f.memberB, f.memberA, false);
  await denied(send(row.id, "Unblocking is not consent"), 403);
  const reopened = await pair();
  assert.equal(reopened.id, row.id);
  await send(row.id, "Explicitly accepted again");
  assert.equal((await conversation(row.id)).messages!.length, 2);
  const raced = await Promise.allSettled([
    block(),
    send(row.id, "Race before revocation", f.memberB)
  ]);
  assert.equal(raced[0].status, "fulfilled");
  await denied(send(row.id, "Cannot race a committed block", f.memberB), 403);
  assert.equal(
    (await db.adultConversation.findUniqueOrThrow({ where: { id: row.id } }))
      .sendingAllowed,
    false
  );
});
test("current actor eligibility applies to retained history and receipt replay", async () => {
  const row = await pair();
  const body = input("send", {
    conversationId: row.id,
    expectedVersion: row.version,
    content: "Historic text"
  });
  await command(db, f.memberA.token, body);
  for (const data of [
    { adultPolicyVersion: "outdated" },
    { emailVerifiedAt: null }
  ]) {
    await db.platformUser.update({ where: { id: f.memberA.id }, data });
    await denied(conversation(row.id), 403);
    await denied(command(db, f.memberA.token, body), 403);
    await db.platformUser.update({
      where: { id: f.memberA.id },
      data: { adultPolicyVersion: ADULT_POLICY, emailVerifiedAt: new Date() }
    });
  }
});
test("paused operations preserve private history and personal cleanup but do not queue new sends", async () => {
  const row = await pair(),
    message = await send(row.id, "Before operations paused");
  process.env.COMMUNITY_REPORTS_ENABLED = "false";
  const view = await conversation(row.id);
  assert.equal(view.available, false);
  assert.equal(view.conversation!.sendingAllowed, false);
  await denied(send(row.id, "Not queued"), 503);
  await choice(row.id, "mute", { value: true });
  await choice(row.id, "archive", { value: true });
  await choice(row.id, "clear", { through: message.id });
  assert.equal(
    await db.adultMessage.count({ where: { conversationId: row.id } }),
    1
  );
});

test("new-request preferences cannot replace or silently revoke explicit accepted conversation consent", async () => {
  const row = await pair();
  const current = await readAdultContact(db, f.memberB.token, {
    view: "preferences"
  });
  await adultContactCommand(
    db,
    f.memberB.token,
    input("preferences", {
      audience: "NOBODY",
      expectedVersion: current.preferences!.version
    })
  );
  await send(row.id, "Already accepted private contact");
  assert.equal((await conversation(row.id)).conversation!.sendingAllowed, true);
  await block(f.memberB, f.memberA);
  const restricted = await readAdultContact(db, f.memberB.token, {
    view: "preferences"
  });
  await adultContactCommand(
    db,
    f.memberB.token,
    input("preferences", {
      audience: "EVERYONE",
      expectedVersion: restricted.preferences!.version
    })
  );
  await denied(send(row.id, "A broader preference cannot undo a block"), 403);
});

test("canonical request activity is atomic, deduplicated and permission checked without copying purpose", async () => {
  await adultContactCommand(
    db,
    f.memberB.token,
    input("preferences", { audience: "EVERYONE", expectedVersion: 0 })
  );
  const pending = input("create", {
    recipientId: f.memberB.id,
    purpose: "No purpose copy in activity",
    expectedRecipientVersion: 1
  });
  const [saved, replay] = await Promise.all([
    adultContactCommand(db, f.memberA.token, pending),
    adultContactCommand(db, f.memberA.token, pending)
  ]);
  assert.deepEqual(saved, replay);
  const events = await db.socialEvent.findMany({
    where: { requestId: saved.id }
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].recipientId, f.memberB.id);
  assert.doesNotMatch(JSON.stringify(events), /No purpose copy in activity/);
  let activity = (await read(db, f.memberB.token, { view: "activity" }))
    .activity!;
  assert.equal(activity.pendingRequests, 1);
  assert.equal(activity.requestAlerts, 1);
  const alerts = input("alerts", {
    expectedVersion: activity.preferences.version,
    requests: false,
    messages: true
  });
  const pref = await command(db, f.memberB.token, alerts);
  assert.deepEqual(await command(db, f.memberB.token, alerts), pref);
  activity = (await read(db, f.memberB.token, { view: "activity" })).activity!;
  assert.equal(activity.pendingRequests, 1);
  assert.equal(activity.requestAlerts, 0);
  assert.equal(
    (await read(db, f.contact.token, { view: "activity" })).activity!
      .pendingRequests,
    0
  );
  await db.platformUser.update({
    where: { id: f.memberA.id },
    data: { emailVerifiedAt: null }
  });
  assert.equal(
    (await read(db, f.memberB.token, { view: "activity" })).activity!
      .pendingRequests,
    0
  );
  await db.platformUser.update({
    where: { id: f.memberA.id },
    data: { emailVerifiedAt: new Date() }
  });
  await block(f.memberB, f.memberA);
  assert.equal(
    (await read(db, f.memberB.token, { view: "activity" })).activity!
      .pendingRequests,
    0
  );
});

test("message activity consumes own canonical read/mute state and independent in-app choices", async () => {
  const row = await pair();
  const body = input("send", {
    conversationId: row.id,
    expectedVersion: row.version,
    content: "Never copied message activity body"
  });
  const saved = await command(db, f.memberA.token, body);
  await command(db, f.memberA.token, body);
  const events = await db.socialEvent.findMany({
    where: { messageId: saved.id }
  });
  assert.equal(events.length, 1);
  assert.doesNotMatch(
    JSON.stringify(events),
    /Never copied message activity body/
  );
  assert.equal(
    await db.socialEvent.count({
      where: { conversationId: row.id, kind: "ADULT_REQUEST_ACCEPTED" }
    }),
    1
  );
  const activity = (await read(db, f.memberB.token, { view: "activity" }))
    .activity!;
  assert.equal(activity.messageAlerts, 1);
  assert.deepEqual(activity.channels, {
    inApp: true,
    email: false,
    push: false
  });
  assert.equal(
    (await read(db, f.memberA.token, { view: "activity" })).activity!
      .messageAlerts,
    0
  );
  const changed = await command(
    db,
    f.memberB.token,
    input("alerts", {
      expectedVersion: activity.preferences.version,
      requests: true,
      messages: false
    })
  );
  assert.equal(
    (await read(db, f.memberB.token, { view: "activity" })).activity!
      .messageAlerts,
    0
  );
  assert.equal(
    (await conversation(row.id, f.memberB)).conversation!.unread,
    1,
    "Optional alerts do not hide actual unread history"
  );
  assert.equal(
    (
      await db.socialPreferences.findUniqueOrThrow({
        where: { ownerId: f.memberB.id }
      })
    ).contactRequests,
    "EVERYONE"
  );
  await command(
    db,
    f.memberB.token,
    input("alerts", {
      expectedVersion: changed.version,
      requests: true,
      messages: true
    })
  );
  await choice(row.id, "mute", { value: true }, f.memberB);
  assert.equal(
    (await read(db, f.memberB.token, { view: "activity" })).activity!
      .messageAlerts,
    0
  );
  await choice(row.id, "mute", { value: false }, f.memberB);
  assert.equal(
    (await read(db, f.memberB.token, { view: "activity" })).activity!
      .messageAlerts,
    1
  );
  await command(
    db,
    f.memberB.token,
    input("read", { conversationId: row.id, through: saved.id })
  );
  assert.equal(
    (await read(db, f.memberB.token, { view: "activity" })).activity!
      .messageAlerts,
    0
  );
  await send(row.id, "Later unseen message");
  assert.equal(
    (await read(db, f.memberB.token, { view: "activity" })).activity!
      .messageAlerts,
    1
  );
  await block(f.memberB, f.memberA);
  assert.equal(
    (await read(db, f.memberB.token, { view: "activity" })).activity!
      .messageAlerts,
    0
  );
});

test("in-app activity ignores orphan/forged sources and database constraints prevent duplicate or mixed intents", async () => {
  const row = await pair(),
    message = await send(row.id, "Single source");
  const original = await db.socialEvent.findFirstOrThrow({
    where: { messageId: message.id }
  });
  await assert.rejects(
    db.socialEvent.create({
      data: {
        ...original,
        id: randomUUID(),
        key: "changed-key-" + randomUUID()
      }
    })
  );
  await assert.rejects(
    db.socialEvent.create({
      data: {
        key: randomUUID(),
        kind: "ADULT_MESSAGE_CREATED",
        actorId: f.memberA.id,
        recipientId: f.memberB.id,
        postId: "mixed-source",
        commentId: "mixed-source",
        conversationId: row.id,
        messageId: randomUUID()
      }
    })
  );
  await db.socialEvent.create({
    data: {
      key: randomUUID(),
      kind: "ADULT_MESSAGE_CREATED",
      actorId: f.memberA.id,
      recipientId: f.contact.id,
      conversationId: row.id,
      messageId: randomUUID()
    }
  });
  assert.equal(
    (await read(db, f.contact.token, { view: "activity" })).activity!
      .messageAlerts,
    0
  );
  const before = await db.socialEvent.count({
    where: { conversationId: row.id }
  });
  await denied(
    command(
      db,
      f.contact.token,
      input("send", {
        conversationId: row.id,
        expectedVersion: row.version,
        content: "No event on rejection"
      })
    ),
    404
  );
  assert.equal(
    await db.socialEvent.count({ where: { conversationId: row.id } }),
    before
  );
  await db.adultMessage.delete({ where: { id: message.id } });
  assert.equal(
    (await read(db, f.memberB.token, { view: "activity" })).activity!
      .messageAlerts,
    0
  );
});
test("minute/day abuse limits return real retry deadlines without charging exact replays", async () => {
  const row = await pair();
  const body = input("send", {
    conversationId: row.id,
    expectedVersion: row.version,
    content: "First budgeted send"
  });
  await command(db, f.memberA.token, body);
  const key = (scope: string) =>
    createHmac("sha256", accountConfig().rateSecret)
      .update(`activity:adult-message-${scope}:${f.memberA.id}`)
      .digest("hex");
  for (const [scope, hits] of [
    ["minute", 30],
    ["day", 500]
  ] as const) {
    await db.platformAuthLimit.update({
      where: { key: key(scope) },
      data: { hits, expiresAt: new Date(Date.now() + 60000) }
    });
    await assert.rejects(
      send(row.id, "Over limit"),
      (e) =>
        e instanceof PortalError &&
        e.status === 429 &&
        !!e.retryAfter &&
        e.retryAfter <= 60
    );
    assert.deepEqual(await command(db, f.memberA.token, body), {
      id: (await conversation(row.id)).messages![0].id,
      version: 1,
      message: "Message saved. This does not confirm delivery or reading."
    });
    await db.platformAuthLimit.update({
      where: { key: key(scope) },
      data: { expiresAt: new Date(Date.now() - 1000) }
    });
  }
  await send(row.id, "After budget expiry");
  assert.equal(
    await db.adultMessage.count({ where: { conversationId: row.id } }),
    2
  );
});
test("selected-message reporting excludes unrelated history and honors clear and current reviewer scope", async () => {
  const row = await pair(),
    selected = await send(row.id, "Only selected evidence");
  await send(row.id, "Unrelated message evidence must not appear");
  const q = { view: "target", targetType: "MESSAGE", targetId: selected.id };
  await denied(readCommunityReports(db, f.contact.token, q), 404);
  const target = await readCommunityReports(db, f.memberB.token, q);
  assert.ok(target.target);
  const report = await communityReportCommand(
    db,
    f.memberB.token,
    input("create", {
      targetType: "MESSAGE",
      targetId: selected.id,
      expectedTargetVersion: target.target.version,
      expectedContextVersion: 0,
      reason: "HARASSMENT",
      details: "Chosen private context"
    })
  );
  await block(f.memberB, f.memberA);
  assert.ok((await readCommunityReports(db, f.memberB.token, q)).target);
  const review = await readCommunityReports(db, f.operator.token, {
    view: "review",
    id: report.id
  });
  assert.ok("evidence" in review && review.evidence?.type === "MESSAGE");
  assert.equal(review.evidence.content, "Only selected evidence");
  assert.doesNotMatch(JSON.stringify(review), /Unrelated message evidence/);
  await denied(
    readCommunityReports(db, f.memberA.token, {
      view: "receipt",
      id: report.id
    }),
    404
  );
  await choice(row.id, "clear", { through: selected.id }, f.memberB);
  await denied(readCommunityReports(db, f.memberB.token, q), 404);
  const retained = await readCommunityReports(db, f.operator.token, {
    view: "review",
    id: report.id
  });
  assert.ok(retained.report);
  assert.equal(retained.report.id, report.id);
});
test("credential-checked exports contain only the owner's visible accepted history and own preferences", async () => {
  const row = await pair();
  const one = await send(row.id, "Hidden own export prefix");
  await send(row.id, "Visible received body", f.memberB);
  await choice(row.id, "clear", { through: one.id });
  const other = await pair(f.memberB, f.contact);
  await send(other.id, "Other people's thread", f.memberB);
  const secret = "message-export-fixture-secret-".repeat(3);
  const proof = await prepareAccountExport(
    db,
    f.memberA.token,
    f.memberA.password,
    secret
  );
  const exported = JSON.parse(
    await downloadAccountExport(
      db,
      f.memberA.token,
      proof.authorization,
      secret
    )
  );
  assert.deepEqual(
    exported.adultMessages.map((m: { content: string }) => m.content),
    ["Visible received body"]
  );
  assert.equal(exported.adultConversationChoices.length, 1);
  assert.doesNotMatch(
    JSON.stringify(exported),
    /Other people's thread|Hidden own export prefix/
  );
});
test("database sequence, content and personal-position constraints reject malformed durable rows", async () => {
  const row = await pair();
  await send(row.id, "Existing sequence");
  for (const data of [
    { sequence: 1, content: "Duplicate" },
    { sequence: 0, content: "Invalid" },
    { sequence: 2, content: " " }
  ]) {
    await assert.rejects(
      db.adultMessage.create({
        data: { conversationId: row.id, senderId: f.memberA.id, ...data }
      })
    );
  }
  await assert.rejects(
    db.adultConversationState.create({
      data: {
        conversationId: row.id,
        ownerId: f.memberA.id,
        hiddenThrough: 3,
        readThrough: 2
      }
    })
  );
});

test("inbox paginates before projection with a constant query count and no unrelated church-page reads", async () => {
  await pair();
  const measured = new PrismaClient({
    log: [{ emit: "event", level: "query" }]
  });
  let queries: string[] = [];
  measured.$on("query", (event) => queries.push(event.query));
  try {
    await read(measured, f.memberA.token, { view: "inbox" });
    const small = queries.length;
    const people = Array.from({ length: 31 }, () => randomUUID());
    await db.platformUser.createMany({
      data: people.map((id) => ({
        id,
        name: "Fictional inbox person",
        username: "inbox_" + id.replaceAll("-", ""),
        email: id + "@example.test",
        emailVerifiedAt: new Date(),
        adultAcknowledgedAt: new Date(),
        adultPolicyVersion: ADULT_POLICY
      }))
    });
    const rows = people.map((person, i) => ({
      id: randomUUID(),
      participantAId: f.memberA.id < person ? f.memberA.id : person,
      participantBId: f.memberA.id < person ? person : f.memberA.id,
      sendingAllowed: true,
      lastSequence: 1,
      updatedAt: new Date(Date.now() + i * 1000)
    }));
    await db.adultConversation.createMany({ data: rows });
    await db.adultMessage.createMany({
      data: rows.map((r, i) => ({
        conversationId: r.id,
        senderId: people[i],
        sequence: 1,
        content: "One canonical preview"
      }))
    });
    queries = [];
    const page = await read(measured, f.memberA.token, { view: "inbox" });
    assert.equal(page.conversations!.length, 30);
    assert.ok(
      queries.length <= small + 2,
      `Query count stays bounded: ${small} for one, ${queries.length} for thirty`
    );
    assert.ok(queries.every((query) => !query.includes('"ChurchConnection"')));
    const older = await read(measured, f.memberA.token, {
      view: "inbox",
      after: page.after
    });
    assert.equal(older.conversations!.length, 2);
    assert.equal(
      new Set(
        [...page.conversations!, ...older.conversations!].map((c) => c.id)
      ).size,
      32
    );
    await denied(
      read(measured, f.contact.token, { view: "inbox", after: page.after }),
      409
    );
    queries = [];
    await readAdultContact(measured, f.memberA.token, {
      view: "target",
      recipientId: f.memberB.id
    });
    assert.ok(
      queries.every((query) => !query.includes('"ChurchConnection"')),
      "Personal contact must not depend on church-page connection limits"
    );
  } finally {
    await measured.$disconnect();
  }
});
