import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
import { requestPermanentAccountDeletion } from "../lib/platform/account-deletion";
import { eraseRequestedAccountData } from "../lib/platform/account-erasure";
import { createSessionToken } from "../lib/platform/auth";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedPortal
} from "./seed-portal";
import { uploadImage, readImage } from "../lib/platform/media";
import { personalPhotoCommand } from "../lib/platform/personal-photos";
import { photoTagCommand } from "../lib/platform/photo-tags";
import { readPhotoTags } from "../lib/platform/photo-tag-reads";
import { readActivity } from "../lib/platform/activity";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import { portalCommand } from "../lib/platform/portal";
import { handlePhotoTagRequest } from "../lib/platform/photo-tag-boundary";
import { SESSION_COOKIE } from "../lib/platform/account-boundary";
import { accountConfig } from "../lib/platform/account-config";

const db = new PrismaClient();
before(async () => {
  await assertPortalTestDatabase(db);
  process.env.PERSONAL_PHOTO_LIBRARY_ENABLED = "true";
  process.env.PUSH_ENABLED = "false";
});
after(() => db.$disconnect());
type Actor = Awaited<ReturnType<typeof createPortalActor>>;
const command = (actor: Actor, operation: string, fields: object = {}) => ({
  operation,
  mutationId: randomUUID(),
  ownerId: actor.id,
  ...fields
});
function store() {
  const files = new Map<string, Buffer>();
  return {
    files,
    async put(path: string, value: Buffer) {
      files.set(path, value);
    },
    async get(path: string) {
      return files.get(path) ?? null;
    },
    async delete(paths: string[]) {
      paths.forEach((path) => files.delete(path));
    }
  };
}
async function photo(actor: Actor, rest: object = {}) {
  const storage = store(),
    bytes = await sharp({
      create: { width: 80, height: 60, channels: 3, background: "blue" }
    })
      .png()
      .toBuffer();
  const image = await uploadImage(
    db,
    actor.token,
    {
      purpose: "PROFILE_PHOTO",
      targetId: actor.id,
      requestKey: randomUUID(),
      audience: "MEMBERS",
      ...rest
    },
    bytes,
    storage
  );
  return { image, storage };
}
async function fixture() {
  const a = await createPortalActor(db, "tagauthor"),
    b = await createPortalActor(db, "tagrecipient"),
    c = await createPortalActor(db, "tagviewer");
  const { image, storage } = await photo(a);
  const request = command(a, "request", {
    assetId: image.id,
    imageVersion: image.version,
    recipientId: b.id
  });
  const tag = await photoTagCommand(db, a.token, request);
  return { a, b, c, image, storage, tag, request };
}
async function items(
  actor: Actor,
  query: Parameters<typeof readPhotoTags>[2] = {}
) {
  const view = await readPhotoTags(db, actor.token, query);
  if (!("items" in view) || !view.items) throw Error("Expected tag items");
  return view.items;
}

test("photo tag requests stay private until an adult approves, then use canonical activity and the source audience without duplicates", async () => {
  const f = await fixture();
  assert.deepEqual(await photoTagCommand(db, f.a.token, f.request), f.tag);
  assert.equal(
    (await items(f.c, { view: "asset", assetId: f.image.id })).length,
    0
  );
  assert.equal(
    (await items(f.c, { view: "profile", profileId: f.b.id })).length,
    0
  );
  const pending = await readPhotoTags(db, f.b.token, { id: f.tag.id });
  assert.equal(pending.kind, "inbox");
  if (pending.kind !== "inbox") throw Error();
  assert.equal(pending.items[0].canAccept, true);
  assert.equal(pending.items[0].image?.id, f.image.id);
  const received = await readActivity(db, f.b.token, { category: "photos" });
  assert.equal(received.items.length, 1);
  assert.equal(received.items[0].href, `/platform/photo-tags?tag=${f.tag.id}`);
  const accept = command(f.b, "accept", {
    id: f.tag.id,
    expectedVersion: f.tag.version,
    imageVersion: f.image.version
  });
  const approved = await photoTagCommand(db, f.b.token, accept);
  assert.deepEqual(await photoTagCommand(db, f.b.token, accept), approved);
  assert.equal(
    (await items(f.c, { view: "profile", profileId: f.b.id })).length,
    1
  );
  assert.equal(
    (await readActivity(db, f.a.token, { category: "photos" })).items[0].href,
    `/platform/photo-tags?tag=${f.tag.id}`
  );
  const events = await db.socialEvent.findMany({
    where: { sourceId: f.tag.id }
  });
  assert.equal(events.length, 2);
  assert.ok(events.every((e) => e.actorId !== e.recipientId));
  assert.equal(
    await db.notificationDelivery.count({
      where: { eventId: { in: events.map((e) => e.id) } }
    }),
    0
  );
});

test("decline and removal cannot be retried into approval and do not delete another person's photo", async () => {
  const f = await fixture();
  const declined = await photoTagCommand(
    db,
    f.b.token,
    command(f.b, "decline", { id: f.tag.id, expectedVersion: f.tag.version })
  );
  await assert.rejects(
    photoTagCommand(
      db,
      f.b.token,
      command(f.b, "accept", {
        id: f.tag.id,
        expectedVersion: declined.version,
        imageVersion: f.image.version
      })
    ),
    /pending/
  );
  await assert.rejects(
    photoTagCommand(db, f.a.token, { ...f.request, mutationId: randomUUID() }),
    /already exists/
  );
  assert.equal(
    (await items(f.c, { view: "profile", profileId: f.b.id })).length,
    0
  );
  assert.ok(
    (await readImage(db, f.c.token, f.image.id, "large", f.storage)).length > 0
  );
  const other = await photo(f.a);
  const request = await photoTagCommand(
    db,
    f.a.token,
    command(f.a, "request", {
      assetId: other.image.id,
      imageVersion: other.image.version,
      recipientId: f.b.id
    })
  );
  const accepted = await photoTagCommand(
    db,
    f.b.token,
    command(f.b, "accept", {
      id: request.id,
      expectedVersion: request.version,
      imageVersion: other.image.version
    })
  );
  await photoTagCommand(
    db,
    f.b.token,
    command(f.b, "remove", {
      id: request.id,
      expectedVersion: accepted.version
    })
  );
  assert.equal(
    (await items(f.c, { view: "profile", profileId: f.b.id })).length,
    0
  );
  assert.ok(
    (await readImage(db, f.c.token, other.image.id, "large", other.storage))
      .length > 0
  );
  assert.equal(
    (await readActivity(db, f.a.token, { category: "photos" })).items.find(
      (i) => i.href
    )?.href,
    undefined
  );
});

test("approval requires the current image version; adult request controls and bilateral blocks are independent of mention choices", async () => {
  const f = await fixture();
  await db.mediaAsset.update({
    where: { id: f.image.id },
    data: { version: { increment: 1 } }
  });
  await assert.rejects(
    photoTagCommand(
      db,
      f.b.token,
      command(f.b, "accept", {
        id: f.tag.id,
        expectedVersion: f.tag.version,
        imageVersion: f.image.version
      })
    ),
    /changed/
  );
  await photoTagCommand(
    db,
    f.b.token,
    command(f.b, "preferences", { expectedVersion: 0, choice: "NOBODY" })
  );
  const other = await photo(f.a);
  const input = command(f.a, "request", {
    assetId: other.image.id,
    imageVersion: other.image.version,
    recipientId: f.b.id
  });
  await assert.rejects(photoTagCommand(db, f.a.token, input), /cannot receive/);
  assert.equal(
    (
      await db.socialPreferences.findUniqueOrThrow({
        where: { ownerId: f.b.id }
      })
    ).mentions,
    "EVERYONE"
  );
  await photoTagCommand(
    db,
    f.b.token,
    command(f.b, "preferences", { expectedVersion: 1, choice: "FOLLOWED" })
  );
  await assert.rejects(
    photoTagCommand(db, f.a.token, { ...input, mutationId: randomUUID() })
  );
  await db.platformFollow.create({
    data: { followerId: f.b.id, followingId: f.a.id }
  });
  await db.socialRelationship.create({
    data: { ownerId: f.a.id, targetUserId: f.b.id, blocked: true }
  });
  await assert.rejects(
    photoTagCommand(db, f.a.token, { ...input, mutationId: randomUUID() })
  );
  const pending = await readPhotoTags(db, f.b.token, { id: f.tag.id });
  if (pending.kind !== "inbox") throw Error();
  assert.equal(pending.items[0].image, null);
  assert.equal(pending.items[0].canDecline, true);
  await photoTagCommand(
    db,
    f.b.token,
    command(f.b, "decline", { id: f.tag.id, expectedVersion: f.tag.version })
  );
  await db.socialRelationship.deleteMany({ where: { ownerId: f.a.id } });
  await db.platformUser.update({
    where: { id: f.b.id },
    data: { adultAcknowledgedAt: null }
  });
  await assert.rejects(
    photoTagCommand(db, f.a.token, { ...input, mutationId: randomUUID() })
  );
});

test("a tag never widens a church photo, even after its author broadens the source; lost membership removes the association", async () => {
  const f = await seedPortal(db),
    a = f.memberA,
    b = f.contact,
    outside = f.memberB;
  const { image, storage } = await photo(a, {
    audience: "CHURCH",
    audienceChurchId: f.churchA.id
  });
  await assert.rejects(
    photoTagCommand(
      db,
      a.token,
      command(a, "request", {
        assetId: image.id,
        imageVersion: image.version,
        recipientId: outside.id
      })
    ),
    /cannot view/
  );
  const request = await photoTagCommand(
    db,
    a.token,
    command(a, "request", {
      assetId: image.id,
      imageVersion: image.version,
      recipientId: b.id
    })
  );
  await photoTagCommand(
    db,
    b.token,
    command(b, "accept", {
      id: request.id,
      expectedVersion: request.version,
      imageVersion: image.version
    })
  );
  const saved = await db.personalPhoto.findUniqueOrThrow({
    where: { assetId: image.id }
  });
  await personalPhotoCommand(db, a.token, {
    operation: "audience",
    mutationId: randomUUID(),
    imageId: image.id,
    imageVersion: image.version,
    expectedVersion: saved.version,
    audience: "PUBLIC",
    confirmed: true
  });
  assert.ok(
    (await readImage(db, outside.token, image.id, "large", storage)).length
  );
  assert.equal(
    (await items(outside, { view: "profile", profileId: b.id })).length,
    0
  );
  assert.equal(
    (await items(a, { view: "profile", profileId: b.id })).length,
    1
  );
  const connection = await db.churchConnection.findUniqueOrThrow({
    where: { userId_churchId: { userId: b.id, churchId: f.churchA.id } }
  });
  await portalCommand(db, f.reviewerA.token, {
    operation: "transition",
    action: "REMOVE",
    churchId: f.churchA.id,
    connectionId: connection.id,
    expectedVersion: connection.version
  });
  assert.equal(
    (await items(a, { view: "profile", profileId: b.id })).length,
    0
  );
});

test("protected replay suppresses an older approved association and older permissive tag choices without changing mention settings", async () => {
  const f = await fixture();
  const approved = await photoTagCommand(
    db,
    f.b.token,
    command(f.b, "accept", {
      id: f.tag.id,
      expectedVersion: f.tag.version,
      imageVersion: f.image.version
    })
  );
  const removed = await photoTagCommand(
    db,
    f.b.token,
    command(f.b, "remove", { id: f.tag.id, expectedVersion: approved.version })
  );
  const control = await db.retentionControl.findFirstOrThrow({
    where: { kind: "PHOTO_TAG", sourceId: f.tag.id, version: removed.version }
  });
  assert.ok(control.journaledAt);
  assert.doesNotMatch(
    JSON.stringify(control.payload),
    new RegExp(f.a.name + "|" + f.b.name + "|" + f.image.id)
  );
  await db.photoTag.update({
    where: { id: f.tag.id },
    data: { state: "APPROVED", version: approved.version }
  });
  await replayRetentionControls(db, [
    control.payload as unknown as RetentionControlEntry
  ]);
  assert.equal(
    (await db.photoTag.findUniqueOrThrow({ where: { id: f.tag.id } })).state,
    "REMOVED"
  );
  const choice = await photoTagCommand(
    db,
    f.b.token,
    command(f.b, "preferences", { expectedVersion: 0, choice: "NOBODY" })
  );
  const receipt = await db.retentionControl.findFirstOrThrow({
    where: {
      kind: "PHOTO_TAG_PREFERENCES",
      sourceId: f.b.id,
      version: choice.version
    }
  });
  await db.socialPreferences.update({
    where: { ownerId: f.b.id },
    data: { photoTagRequests: "EVERYONE", photoTagVersion: 0 }
  });
  await replayRetentionControls(db, [
    receipt.payload as unknown as RetentionControlEntry
  ]);
  const restored = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: f.b.id }
  });
  assert.equal(restored.photoTagRequests, "NOBODY");
  assert.equal(restored.photoTagRecoveryRequired, true);
  assert.equal(restored.mentions, "EVERYONE");
  assert.equal(
    (await items(f.c, { view: "profile", profileId: f.b.id })).length,
    0
  );
});

test("photo tag HTTP denies account confusion, unsupported queries, foreign private requests and guest reads", async () => {
  const f = await fixture(),
    config = accountConfig();
  const get = (query: string, actor = f.b, expected = actor.id) =>
    handlePhotoTagRequest(
      db,
      new Request(config.origin + "/api/platform/photo-tags" + query, {
        headers: {
          cookie: `${SESSION_COOKIE}=${actor.token}`,
          "x-expected-account": expected
        }
      })
    );
  assert.equal(
    (
      await handlePhotoTagRequest(
        db,
        new Request(config.origin + "/api/platform/photo-tags")
      )
    ).status,
    401
  );
  assert.equal((await get("?id=" + f.tag.id, f.c)).status, 404);
  for (const query of [
    "?view=unknown",
    "?view=preferences&id=x",
    "?scope=sent&scope=received",
    "?ownerId=foreign",
    "?id=x&after=y"
  ])
    assert.equal((await get(query)).status, 400);
  assert.equal((await get("", f.b, f.a.id)).status, 401);
  const owned = await get("?id=" + f.tag.id);
  assert.equal(owned.status, 200);
  assert.match(owned.headers.get("cache-control")!, /private, no-store/);
  const response = await handlePhotoTagRequest(
    db,
    new Request(config.origin + "/api/platform/photo-tags", {
      method: "POST",
      headers: {
        origin: config.origin,
        cookie: `${SESSION_COOKIE}=${f.b.token}`,
        "content-type": "application/json",
        "x-expected-account": f.a.id
      },
      body: JSON.stringify(
        command(f.b, "decline", {
          id: f.tag.id,
          expectedVersion: f.tag.version
        })
      )
    })
  );
  assert.equal(response.status, 401);
  assert.equal(
    (await db.photoTag.findUniqueOrThrow({ where: { id: f.tag.id } })).state,
    "PENDING"
  );
});

test("credential-checked export is owner-scoped and account erasure removes incoming tags without deleting another adult's photo", async () => {
  const f = await fixture(),
    other = await fixture();
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!;
  const proof = await prepareAccountExport(db, f.b.token, f.b.password, secret);
  const data = JSON.parse(
    await downloadAccountExport(db, f.b.token, proof.authorization, secret)
  );
  assert.deepEqual(
    data.photoTags.map((tag: { id: string }) => tag.id),
    [f.tag.id]
  );
  assert.equal(JSON.stringify(data).includes(other.tag.id), false);
  assert.equal(data.photoTags[0].state, "PENDING");
  assert.equal(Object.hasOwn(data.photoTags[0], "requester"), false);
  const journal = { async recordAccount() {}, async completeAccount() {} };
  await requestPermanentAccountDeletion(
    db,
    f.b.token,
    f.b.password,
    true,
    createSessionToken(),
    journal
  );
  const deletion = await db.accountDeletion.findUniqueOrThrow({
    where: { userId: f.b.id }
  });
  await eraseRequestedAccountData(db, deletion.id, journal);
  assert.equal(await db.photoTag.count({ where: { id: f.tag.id } }), 0);
  assert.equal(
    await db.mediaAsset.count({ where: { id: f.image.id, status: "READY" } }),
    1
  );
  assert.equal(await db.photoTag.count({ where: { id: other.tag.id } }), 1);
  assert.equal((await readActivity(db, f.a.token)).items.length, 0);
});
