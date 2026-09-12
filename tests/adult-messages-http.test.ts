import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { PrismaClient, type AdultConversation } from "@prisma/client";
import {
  createPortalActor,
  seedOperatorGrants,
  assertPortalTestDatabase
} from "./seed-portal";
import { adultContactCommand } from "../lib/platform/adult-contact";
import { adultMessageCommand } from "../lib/platform/adult-messages";
import { relationshipCommand } from "../lib/platform/relationships";
import { accountConfig } from "../lib/platform/account-config";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
const enabled = process.env.COMMUNITY_REPORTS_ENABLED === "true";
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
let sender: Awaited<ReturnType<typeof createPortalActor>>,
  recipient: typeof sender,
  outsider: typeof sender,
  conversation: AdultConversation;
const command = (operation: string, fields: Record<string, unknown> = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
async function preparing<T>(work: () => Promise<T>) {
  const old = process.env.COMMUNITY_REPORTS_ENABLED;
  try {
    process.env.COMMUNITY_REPORTS_ENABLED = "true";
    return await work();
  } finally {
    if (old === undefined) delete process.env.COMMUNITY_REPORTS_ENABLED;
    else process.env.COMMUNITY_REPORTS_ENABLED = old;
  }
}
before(async () => {
  await assertPortalTestDatabase(db);
  sender = await createPortalActor(db, "messageapi");
  recipient = await createPortalActor(db, "messagerecipient");
  outsider = await createPortalActor(db, "messageoutsider");
  await seedOperatorGrants(db, outsider, ["REVIEW_COMMUNITY_REPORTS"]);
});
beforeEach(async () => {
  await db.platformAuthLimit.deleteMany();
  await db.socialRelationship.deleteMany({
    where: { OR: [{ ownerId: sender.id }, { ownerId: recipient.id }] }
  });
  const own = {
    OR: [{ participantAId: sender.id }, { participantBId: sender.id }]
  };
  await db.adultMessage.deleteMany({ where: { conversation: own } });
  await db.adultConversationState.deleteMany({ where: { conversation: own } });
  await db.adultContactRequest.deleteMany({ where: { senderId: sender.id } });
  await db.adultConversation.deleteMany({ where: own });
  const pref = await db.socialPreferences.upsert({
    where: { ownerId: recipient.id },
    create: { ownerId: recipient.id, contactRequests: "EVERYONE" },
    update: { contactRequests: "EVERYONE", version: { increment: 1 } }
  });
  await preparing(async () => {
    const request = await adultContactCommand(
      db,
      sender.token,
      command("create", {
        recipientId: recipient.id,
        purpose: "Fictional accepted HTTP context",
        expectedRecipientVersion: pref.version
      })
    );
    await adultContactCommand(
      db,
      recipient.token,
      command("accept", { id: request.id, expectedVersion: request.version })
    );
    const saved = await db.adultContactRequest.findUniqueOrThrow({
      where: { id: request.id }
    });
    conversation = await db.adultConversation.findUniqueOrThrow({
      where: { id: saved.conversationId! }
    });
  });
});
after(() => db.$disconnect());
const get = (query: Record<string, string>, actor = sender) =>
  fetch(origin + "/api/platform/messages?" + new URLSearchParams(query), {
    headers: { cookie: `church_platform_session=${actor.token}` }
  });
const send = (
  body: Record<string, unknown>,
  actor = sender,
  expected = actor.id,
  from = origin
) =>
  fetch(origin + "/api/platform/messages", {
    method: "POST",
    headers: {
      origin: from,
      cookie: `church_platform_session=${actor.token}`,
      "content-type": "application/json",
      "x-expected-account": expected
    },
    body: JSON.stringify(body)
  });
const body = (content = "Fictional HTTP message") =>
  command("send", {
    conversationId: conversation.id,
    expectedVersion: conversation.version,
    content
  });
test("message HTTPS protects guests, current account, origin, participant identity and private projections", async () => {
  const guest = await fetch(origin + "/api/platform/messages?view=inbox");
  assert.equal(guest.status, 401);
  assert.match(guest.headers.get("cache-control")!, /no-store/);
  const input = body();
  assert.equal((await send(input, sender, recipient.id)).status, 401);
  assert.equal(
    (await send(input, sender, sender.id, "https://elsewhere.example")).status,
    403
  );
  assert.equal((await send({ ...input, senderId: recipient.id })).status, 400);
  assert.equal((await send(input, outsider)).status, 404);
  assert.equal(
    (
      await get(
        { view: "conversation", conversationId: conversation.id },
        outsider
      )
    ).status,
    404
  );
  const view = await get({
    view: "conversation",
    conversationId: conversation.id
  });
  assert.match(view.headers.get("cache-control")!, /private, no-store/);
  const text = await view.text();
  assert.doesNotMatch(text, /private-login|password|emailVerifiedAt|token/);
  assert.equal(JSON.parse(text).conversation.sendingAllowed, enabled);
  assert.equal(
    await db.adultMessage.count({ where: { conversationId: conversation.id } }),
    0
  );
});
test("HTTP exact message receipts are retryable with intake paused and never duplicate canonical history", async () => {
  const input = body();
  assert.equal((await send(input)).status, enabled ? 200 : 503);
  const saved = await preparing(() =>
    adultMessageCommand(db, sender.token, input)
  );
  assert.deepEqual(await (await send(input)).json(), saved);
  assert.equal(
    (await send({ ...input, content: "Altered retry" })).status,
    409
  );
  const view = await (
    await get(
      { view: "conversation", conversationId: conversation.id },
      recipient
    )
  ).json();
  assert.equal(view.messages.length, 1);
  assert.equal(view.messages[0].mine, false);
  assert.equal(view.conversation.unread, 1);
  assert.equal((await send(body("Fresh send"))).status, enabled ? 200 : 503);
});
test("HTTP visible positions, mute/archive and clear are owner-only and available while intake is paused", async () => {
  const message = await preparing(() =>
    adultMessageCommand(db, sender.token, body())
  );
  const cursor = { conversationId: conversation.id, through: message.id };
  assert.equal((await send(command("read", cursor), outsider)).status, 404);
  assert.equal((await send(command("read", cursor), recipient)).status, 200);
  let view = await (
    await get(
      { view: "conversation", conversationId: conversation.id },
      recipient
    )
  ).json();
  assert.equal(view.conversation.unread, 0);
  const mute = command("mute", {
    conversationId: conversation.id,
    value: true,
    expectedVersion: view.conversation.preferences.version
  });
  assert.equal((await send(mute, recipient)).status, 200);
  assert.equal(
    (await send({ ...mute, mutationId: randomUUID(), value: false }, recipient))
      .status,
    409
  );
  view = await (
    await get(
      { view: "conversation", conversationId: conversation.id },
      recipient
    )
  ).json();
  assert.equal(
    (
      await send(
        command("archive", {
          conversationId: conversation.id,
          value: true,
          expectedVersion: view.conversation.preferences.version
        }),
        recipient
      )
    ).status,
    200
  );
  assert.equal(
    (await (await get({ view: "inbox" }, recipient)).json()).conversations
      .length,
    0
  );
  assert.equal(
    (await (await get({ view: "inbox", archived: "true" }, recipient)).json())
      .conversations.length,
    1
  );
  view = await (
    await get(
      { view: "conversation", conversationId: conversation.id },
      recipient
    )
  ).json();
  assert.equal(
    (
      await send(
        command("clear", {
          ...cursor,
          expectedVersion: view.conversation.preferences.version
        }),
        recipient
      )
    ).status,
    200
  );
  assert.equal(
    (
      await (
        await get(
          { view: "conversation", conversationId: conversation.id },
          recipient
        )
      ).json()
    ).messages.length,
    0
  );
  assert.equal(
    (
      await (
        await get({ view: "conversation", conversationId: conversation.id })
      ).json()
    ).messages.length,
    1
  );
});
test("real mid-conversation block stops new HTTPS sends but keeps selected retained history private", async () => {
  const input = body();
  await preparing(() => adultMessageCommand(db, sender.token, input));
  await relationshipCommand(
    db,
    recipient.token,
    command("block", {
      kind: "person",
      targetId: sender.id,
      desired: true,
      expectedVersion: 0
    })
  );
  assert.equal((await send(body("Stale version after block"))).status, 409);
  assert.equal((await send(input)).status, 200);
  const view = await (
    await get({ view: "conversation", conversationId: conversation.id })
  ).json();
  assert.equal((await send({ ...body("Current version after block"), expectedVersion: view.conversation.version })).status, 403);
  assert.equal(view.conversation.person, null);
  assert.equal(view.conversation.sendingAllowed, false);
  assert.equal(view.messages.length, 1);
  assert.equal(
    (
      await get({
        view: "conversation",
        conversationId: conversation.id,
        after: "foreign-cursor"
      })
    ).status,
    409
  );
});
test("HTTPS rate headers and revoked account sessions cannot fake a send or expose history", async () => {
  if (enabled) {
    const key = createHmac("sha256", accountConfig().rateSecret)
      .update(`activity:adult-message-minute:${sender.id}`)
      .digest("hex");
    await db.platformAuthLimit.create({
      data: { key, hits: 30, expiresAt: new Date(Date.now() + 60000) }
    });
    const limited = await send(body());
    assert.equal(limited.status, 429);
    assert.match(limited.headers.get("retry-after")!, /^\d+$/);
  }
  await db.platformUser.update({
    where: { id: sender.id },
    data: { emailVerifiedAt: null }
  });
  assert.equal(
    (await get({ view: "conversation", conversationId: conversation.id }))
      .status,
    403
  );
  await db.platformUser.update({
    where: { id: sender.id },
    data: { emailVerifiedAt: new Date(), credentialVersion: { increment: 1 } }
  });
  assert.equal(
    (await get({ view: "conversation", conversationId: conversation.id }))
      .status,
    401
  );
  assert.equal((await send(body())).status, 401);
});
