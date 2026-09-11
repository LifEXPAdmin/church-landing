import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { createPortalActor, assertPortalTestDatabase } from "./seed-portal";
import { PortalError } from "../lib/platform/portal";
import {
  readPostGallery,
  postGalleryCommand
} from "../lib/platform/post-gallery";
import { uploadImage, readImage, removeImage } from "../lib/platform/media";
import {
  publicSharePreview,
  canonicalSharePath
} from "../lib/platform/public-sharing";
import { safeAccountReturn } from "../lib/platform/account-entry";
import { relationshipCommand } from "../lib/platform/relationships";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const m = (operation: string, fields: Record<string, unknown>) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const denied = (p: Promise<unknown>, status: number) =>
  assert.rejects(
    p,
    (e: unknown) => e instanceof PortalError && e.status === status
  );
test("ten real processed photos reorder atomically, metadata conflicts retain prior values and withdrawal closes every delivery", async () => {
  const a = await createPortalActor(db, "gallery"),
    b = await createPortalActor(db, "outsider");
  const p = await db.platformPost.create({
    data: { authorId: a.id, content: "Fictional gallery" }
  });
  const files = new Map<string, Buffer>(),
    store = {
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
    create: { width: 100, height: 60, channels: 3, background: "blue" }
  })
    .png()
    .toBuffer();
  for (let i = 0; i < 10; i++)
    await uploadImage(
      db,
      a.token,
      {
        purpose: "POST_PHOTO",
        targetId: p.id,
        requestKey: randomUUID(),
        caption: "Photo " + i,
        alt: "Blue test photo"
      },
      bytes,
      store
    );
  const first = await readPostGallery(db, a.token, p.id);
  assert.equal(first.images.length, 10);
  assert.equal(files.size, 40);
  await assert.rejects(
    uploadImage(
      db,
      a.token,
      { purpose: "POST_PHOTO", targetId: p.id, requestKey: randomUUID() },
      bytes,
      store
    )
  );
  const images = first.images
      .map((i) => ({ id: i.id, version: i.version }))
      .reverse(),
    order = m("reorder", {
      postId: p.id,
      expectedVersion: first.postVersion,
      images
    });
  const saved = await postGalleryCommand(db, a.token, order);
  assert.deepEqual(await postGalleryCommand(db, a.token, order), saved);
  const second = await readPostGallery(db, a.token, p.id);
  assert.deepEqual(
    second.images.map((i) => i.id),
    images.map((i) => i.id)
  );
  await denied(
    postGalleryCommand(
      db,
      b.token,
      m("reorder", {
        postId: p.id,
        expectedVersion: second.postVersion,
        images: second.images.map((i) => ({ id: i.id, version: i.version }))
      })
    ),
    403
  );
  await denied(
    postGalleryCommand(
      db,
      a.token,
      m("reorder", { postId: p.id, expectedVersion: first.postVersion, images })
    ),
    409
  );
  const current = second.images[0],
    edit = (caption: string) =>
      m("metadata", {
        postId: p.id,
        expectedVersion: second.postVersion,
        imageId: current.id,
        imageVersion: current.version,
        caption,
        alt: "Accessible caption"
      });
  const race = await Promise.allSettled([
    postGalleryCommand(db, a.token, edit("First caption")),
    postGalleryCommand(db, a.token, edit("Second caption"))
  ]);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  const third = await readPostGallery(db, a.token, p.id);
  assert.equal(third.images[0].alt, "Accessible caption");
  assert.ok(!JSON.stringify(third).includes("storagePrefix"));
  assert.ok(!JSON.stringify(third).includes(a.email));
  await removeImage(db, a.token, third.images[9].id, third.images[9].version);
  await denied(readImage(db, a.token, third.images[9].id, "thumb", store), 404);
  await db.platformPost.update({
    where: { id: p.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  await denied(readPostGallery(db, a.token, p.id), 404);
  for (const variant of ["original", "large", "medium", "thumb"])
    await denied(readImage(db, a.token, current.id, variant, store), 404);
});
test("public sharing always uses anonymous permission and redacts private, withdrawn, deleted and member-profile targets", async () => {
  const a = await createPortalActor(db, "share"),
    b = await createPortalActor(db, "shareview");
  const church = await db.church.create({
    data: {
      name: "Fictional public church",
      slug: randomUUID(),
      summary: "Public fixture summary",
      communityListed: true,
      publicEmail: "not-in-preview@example.test"
    }
  });
  const p = await db.platformPost.create({
    data: { authorId: a.id, content: "Public safe excerpt" }
  });
  const publicPreview = await publicSharePreview(db, {
    kind: "post",
    id: p.id
  });
  assert.equal(publicPreview.available, true);
  assert.equal(publicPreview.description, p.content);
  assert.ok(!JSON.stringify(publicPreview).includes(a.email));
  assert.equal(publicPreview.author?.name, a.name);
  await relationshipCommand(
    db,
    b.token,
    m("block", {
      kind: "person",
      targetId: a.id,
      expectedVersion: 0,
      desired: true
    })
  );
  assert.equal(
    (await publicSharePreview(db, { kind: "post", id: p.id })).available,
    true,
    "Public preview cannot claim internet-wide blocking"
  );
  assert.equal(
    (await publicSharePreview(db, { kind: "post", id: p.id }, b.token))
      .available,
    false
  );
  const comment = await db.platformPostComment.create({
    data: {
      postId: p.id,
      authorId: a.id,
      content: "Comment text stays outside preview"
    }
  });
  assert.equal(
    (
      await publicSharePreview(db, {
        kind: "comment",
        id: p.id,
        commentId: comment.id
      })
    ).available,
    true
  );
  await db.platformPostComment.update({
    where: { id: comment.id },
    data: { content: "", deletedAt: new Date() }
  });
  const gone = await publicSharePreview(db, {
    kind: "comment",
    id: p.id,
    commentId: comment.id
  });
  assert.equal(gone.available, false);
  assert.equal(gone.author, null);
  await db.platformPost.update({
    where: { id: p.id },
    data: {
      audience: "CHURCH",
      audienceChurchId: church.id,
      content: "Private prayer secret"
    }
  });
  const privatePreview = await publicSharePreview(db, {
    kind: "post",
    id: p.id
  });
  assert.equal(privatePreview.available, false);
  assert.ok(!JSON.stringify(privatePreview).includes("Private prayer secret"));
  assert.equal(privatePreview.author, null);
  const profile = await publicSharePreview(db, {
    kind: "profile",
    id: a.username
  });
  assert.equal(profile.available, false);
  assert.ok(!JSON.stringify(profile).includes(a.name));
  const visibleChurch = await publicSharePreview(db, {
    kind: "church",
    id: church.id
  });
  assert.equal(visibleChurch.available, true);
  assert.ok(!JSON.stringify(visibleChurch).includes(church.publicEmail));
  await db.church.update({
    where: { id: church.id },
    data: { communityListed: false }
  });
  assert.equal(
    (await publicSharePreview(db, { kind: "church", id: church.id })).available,
    false
  );
  await db.platformPost.update({
    where: { id: p.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date(), audience: "PUBLIC" }
  });
  assert.equal(
    (await publicSharePreview(db, { kind: "post", id: p.id })).available,
    false
  );
});
test("only published church occurrences produce event previews; canceled and personal-calendar events stay generic", async () => {
  const a = await createPortalActor(db, "shareevent"),
    church = await db.church.create({
      data: {
        name: "Fictional event church",
        slug: randomUUID(),
        summary: "Fixture"
      }
    });
  const calendar = await db.platformCalendar.create({
    data: {
      churchId: church.id,
      creatorId: a.id,
      name: "Public church calendar",
      timeZone: "UTC",
      requestKey: randomUUID()
    }
  });
  const event = await db.calendarEvent.create({
    data: {
      calendarId: calendar.id,
      requestKey: randomUUID(),
      title: "Fictional event",
      visibility: "PUBLIC",
      timeZone: "UTC",
      startLocal: "2026-09-20T10:00",
      endLocal: "2026-09-20T11:00"
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
      startAt: new Date("2026-09-20T10:00:00Z"),
      endAt: new Date("2026-09-20T11:00:00Z")
    }
  });
  assert.equal(
    (await publicSharePreview(db, { kind: "event", id: occurrence.id }))
      .available,
    true
  );
  await db.calendarEvent.update({
    where: { id: event.id },
    data: { visibility: "CHURCH" }
  });
  assert.equal(
    (await publicSharePreview(db, { kind: "event", id: occurrence.id }))
      .available,
    false
  );
  await db.calendarEvent.update({
    where: { id: event.id },
    data: { visibility: "PUBLIC", canceledAt: new Date() }
  });
  assert.equal(
    (await publicSharePreview(db, { kind: "event", id: occurrence.id }))
      .available,
    false
  );
  await db.platformCalendar.update({
    where: { id: calendar.id },
    data: { churchId: null, ownerId: a.id }
  });
  await db.calendarEvent.update({
    where: { id: event.id },
    data: { canceledAt: null, visibility: "PRIVATE" }
  });
  assert.equal(
    (await publicSharePreview(db, { kind: "event", id: occurrence.id }))
      .available,
    false
  );
});
test("canonical share and authentication-return routes retain only a validated comment reference and no authority", () => {
  const path = canonicalSharePath("comment", "post123", "comment456");
  assert.equal(path, "/platform/posts/post123?comment=comment456");
  assert.equal(safeAccountReturn(path + "&token=secret&admin=true"), path);
  for (const bad of [
    "https://evil.example/",
    "//evil.example",
    "/platform/../outside",
    "/platform/posts/%2f%2fevil.example",
    "/platform/posts/post123\\evil"
  ])
    assert.equal(safeAccountReturn(bad), "/platform");
  assert.equal(
    safeAccountReturn("/platform/posts/post123?comment=%0aevil"),
    "/platform/posts/post123"
  );
  assert.throws(() => canonicalSharePath("post", "//evil.example"));
  assert.throws(() => canonicalSharePath("admin", "post123"));
});
