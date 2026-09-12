import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  createPortalActor,
  seedOperatorGrants,
  assertPortalTestDatabase
} from "./seed-portal";
import { adultContactCommand } from "../lib/platform/adult-contact";
import { relationshipCommand } from "../lib/platform/relationships";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
const enabled = process.env.COMMUNITY_REPORTS_ENABLED === "true";
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
let sender: Awaited<ReturnType<typeof createPortalActor>>,
  recipient: typeof sender,
  outsider: typeof sender;
const command = (operation: string, fields: Record<string, unknown> = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
before(async () => {
  await assertPortalTestDatabase(db);
  sender = await createPortalActor(db, "contactapi");
  recipient = await createPortalActor(db, "recipientapi");
  outsider = await createPortalActor(db, "outsideapi");
  await seedOperatorGrants(db, outsider, ["REVIEW_COMMUNITY_REPORTS"]);
});
beforeEach(async () => {
  await db.adultContactRequest.deleteMany({ where: { senderId: sender.id } });
  await db.adultConversation.deleteMany({
    where: {
      OR: [{ participantAId: sender.id }, { participantBId: sender.id }]
    }
  });
  await db.socialRelationship.deleteMany({
    where: { ownerId: recipient.id, targetUserId: sender.id }
  });
  await db.socialPreferences.upsert({
    where: { ownerId: recipient.id },
    create: { ownerId: recipient.id, contactRequests: "EVERYONE" },
    update: { contactRequests: "EVERYONE", version: { increment: 1 } }
  });
  await db.platformAuthLimit.deleteMany();
});
after(() => db.$disconnect());
const get = (query: Record<string, string>, actor = sender) =>
  fetch(
    origin + "/api/platform/contact-requests?" + new URLSearchParams(query),
    { headers: { cookie: `church_platform_session=${actor.token}` } }
  );
const send = (
  body: Record<string, unknown>,
  actor = sender,
  expected = actor.id,
  from = origin
) =>
  fetch(origin + "/api/platform/contact-requests", {
    method: "POST",
    headers: {
      origin: from,
      cookie: `church_platform_session=${actor.token}`,
      "content-type": "application/json",
      "x-expected-account": expected
    },
    body: JSON.stringify(body)
  });
async function creation() {
  const r = await get({ view: "target", recipientId: recipient.id });
  assert.equal(r.status, 200);
  const data = await r.json();
  return command("create", {
    recipientId: recipient.id,
    purpose: "Private HTTP request purpose",
    expectedRecipientVersion: data.expectedRecipientVersion
  });
}
async function prepare(body: Record<string, unknown>) {
  const old = process.env.COMMUNITY_REPORTS_ENABLED;
  try {
    process.env.COMMUNITY_REPORTS_ENABLED = "true";
    return await adultContactCommand(db, sender.token, body);
  } finally {
    if (old === undefined) delete process.env.COMMUNITY_REPORTS_ENABLED;
    else process.env.COMMUNITY_REPORTS_ENABLED = old;
  }
}
test("contact HTTPS checks current account, origin, guest privacy and forbidden participant fields", async () => {
  const guest = await fetch(
    origin + "/api/platform/contact-requests?view=received"
  );
  assert.equal(guest.status, 401);
  assert.match(guest.headers.get("cache-control")!, /no-store/);
  const body = await creation();
  assert.equal((await send(body, sender, recipient.id)).status, 401);
  assert.equal(
    (await send(body, sender, sender.id, "https://elsewhere.example")).status,
    403
  );
  assert.equal((await send({ ...body, senderId: outsider.id })).status, 400);
  const target = await get({ view: "target", recipientId: recipient.id });
  assert.match(target.headers.get("cache-control")!, /private, no-store/);
  const text = await target.text();
  assert.doesNotMatch(
    text,
    /private-login|emailVerifiedAt|contactRequests|password/
  );
  assert.equal(JSON.parse(text).available, enabled);
  assert.equal(
    await db.adultContactRequest.count({ where: { senderId: sender.id } }),
    0
  );
});
test("HTTP exact receipts survive disabled intake while fresh submissions and decisions retain real availability", async () => {
  const body = await creation();
  assert.equal((await send(body)).status, enabled ? 200 : 503);
  const saved = await prepare(body);
  assert.deepEqual(await (await send(body)).json(), saved);
  assert.equal(
    (await send({ ...body, purpose: "Changed under old key" })).status,
    409
  );
  assert.equal(
    (await get({ view: "receipt", id: saved.id }, outsider)).status,
    404
  );
  assert.equal(
    (
      await send(
        command("accept", { id: saved.id, expectedVersion: saved.version })
      )
    ).status,
    404
  );
  const accepted = await send(
    command("accept", { id: saved.id, expectedVersion: saved.version }),
    recipient
  );
  assert.equal(accepted.status, enabled ? 200 : 503);
  const view = await (
    await get({ view: "receipt", id: saved.id }, recipient)
  ).json();
  assert.equal(view.request.status, enabled ? "ACCEPTED" : "PENDING");
  if (enabled) assert.ok(view.request.conversation.id);
  else
    assert.equal(
      (
        await send(
          command("withdraw", { id: saved.id, expectedVersion: saved.version })
        )
      ).status,
      200
    );
  assert.equal(
    await db.adultContactRequest.count({ where: { senderId: sender.id } }),
    1
  );
});
test("a block revokes the real request; stale retries never grant membership or reveal a profile", async () => {
  const body = await creation(),
    saved = await prepare(body);
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
  const r = await (await get({ view: "receipt", id: saved.id })).json();
  assert.equal(r.request.status, "REVOKED");
  assert.equal(r.request.person, null);
  assert.equal(r.request.canAccept, false);
  assert.deepEqual(await (await send(body)).json(), saved);
  assert.equal(
    (
      await send(
        command("accept", { id: saved.id, expectedVersion: saved.version }),
        recipient
      )
    ).status,
    409
  );
  assert.equal(
    (await get({ view: "target", recipientId: recipient.id })).status,
    404
  );
  assert.equal(
    await db.adultConversation.count({
      where: {
        OR: [{ participantAId: sender.id }, { participantBId: sender.id }]
      }
    }),
    0
  );
});
test("contact preferences preserve the shared version and disabling stays available without intake", async () => {
  const r = await (await get({ view: "preferences" }, recipient)).json();
  const body = command("preferences", {
    audience: "NOBODY",
    expectedVersion: r.preferences.version
  });
  const result = await send(body, recipient);
  assert.equal(result.status, 200);
  const saved = await result.json();
  assert.deepEqual(await (await send(body, recipient)).json(), saved);
  assert.equal(
    (
      await send(
        { ...body, mutationId: randomUUID(), audience: "EVERYONE" },
        recipient
      )
    ).status,
    409
  );
  const next = command("preferences", {
    audience: "EVERYONE",
    expectedVersion: saved.version
  });
  assert.equal((await send(next, recipient)).status, enabled ? 200 : 503);
  const own = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: recipient.id }
  });
  assert.equal(own.mentions, "EVERYONE");
  assert.equal(own.showRelationships, true);
});
