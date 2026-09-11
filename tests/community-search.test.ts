import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { seedPortal, assertPortalTestDatabase } from "./seed-portal";
import { communitySearch as search } from "../lib/platform/community-search";
import {
  postWorkspaceCommand,
  readPostWorkspace
} from "../lib/platform/post-workspace";
const db = new PrismaClient();
let f: Awaited<ReturnType<typeof seedPortal>>;
before(async () => {
  await assertPortalTestDatabase(db);
  f = await seedPortal(db);
});
after(() => db.$disconnect());

test("search paginates visible posts before projection, filters topics and treats percent/underscore literally", async () => {
  const marker = randomUUID();
  for (let i = 0; i < 23; i++)
    await db.platformPost.create({
      data: {
        authorId: f.memberA.id,
        content: `${marker} result ${i}`,
        topics: ["community"],
        publishedAt: new Date()
      }
    });
  await db.platformPost.create({
    data: {
      authorId: f.memberA.id,
      content: `${marker} private`,
      audience: "CHURCH",
      audienceChurchId: f.churchA.id,
      publishedAt: new Date()
    }
  });
  const page = await search(db, undefined, { q: marker, topic: "community" });
  assert.equal(page.items.length, 20);
  assert.ok(page.nextCursor);
  const next = await search(db, undefined, {
    q: marker,
    topic: "community",
    after: page.nextCursor
  });
  assert.equal(next.items.length, 3);
  assert.equal(next.nextCursor, null);
  assert.equal(
    new Set([...page.items, ...next.items].map((p) => p.id)).size,
    23
  );
  assert.throws(() =>
    search(db, undefined, { q: "changed", after: page.nextCursor })
  );
  assert.equal(
    (await search(db, undefined, { q: marker, topic: "fasting" })).items.length,
    0
  );
  assert.ok(
    (await search(db, undefined, { topic: "community" })).items.length > 0
  );
  const literal = `${marker} 100%_literal`;
  await db.platformPost.create({
    data: { authorId: f.memberA.id, content: literal, publishedAt: new Date() }
  });
  await db.platformPost.create({
    data: {
      authorId: f.memberA.id,
      content: `${marker} 100XXliteral`,
      publishedAt: new Date()
    }
  });
  assert.equal((await search(db, undefined, { q: literal })).items.length, 1);
});
test("people search exposes author labels only, excludes suspended users, church and vocabulary routes are bounded", async () => {
  await db.platformUser.update({
    where: { id: f.pending.id },
    data: { bio: "Private profile marker" }
  });
  const result = await search(db, undefined, {
    kind: "people",
    q: f.pending.username
  });
  assert.equal(result.items.length, 1);
  const json = JSON.stringify(result);
  for (const secret of [
    f.pending.email,
    "Private profile marker",
    "passwordHash",
    "emailVerifiedAt"
  ])
    assert.ok(!json.includes(secret));
  assert.ok(json.includes('"requiresSignIn":true'));
  await db.platformUser.update({
    where: { id: f.pending.id },
    data: { suspendedAt: new Date() }
  });
  assert.equal(
    (await search(db, undefined, { kind: "people", q: f.pending.username }))
      .items.length,
    0
  );
  assert.equal(
    (await search(db, undefined, { kind: "churches", q: f.churchA.name }))
      .items[0].id,
    f.churchA.id
  );
  assert.equal(
    (await search(db, undefined, { kind: "topics", q: "pray" })).items[0].id,
    "prayer"
  );
  assert.throws(() => search(db, undefined, { kind: "support", q: "secret" }));
  assert.throws(() =>
    search(db, undefined, { kind: "people", q: "name", topic: "prayer" })
  );
  assert.throws(() => search(db, undefined, { q: "x".repeat(201) }));
});
test("event search excludes personal calendars, private and canceled events, and reevaluates publication", async () => {
  const marker = randomUUID();
  const church = await db.platformCalendar.create({
    data: {
      churchId: f.churchA.id,
      creatorId: f.memberA.id,
      requestKey: randomUUID(),
      name: "Fictional community",
      timeZone: "UTC"
    }
  });
  const personal = await db.platformCalendar.create({
    data: {
      ownerId: f.memberA.id,
      creatorId: f.memberA.id,
      requestKey: randomUUID(),
      name: "Fictional personal",
      timeZone: "UTC"
    }
  });
  const create = (
    calendarId: string,
    visibility: "PUBLIC" | "PRIVATE" | "CHURCH"
  ) =>
    db.calendarEvent.create({
      data: {
        calendarId,
        requestKey: randomUUID(),
        title: marker,
        visibility,
        timeZone: "UTC",
        startLocal: "2026-10-01T10:00",
        endLocal: "2026-10-01T11:00",
        occurrences: {
          create: {
            ordinal: 0,
            title: marker,
            allDay: false,
            timeZone: "UTC",
            startLocal: "2026-10-01T10:00",
            endLocal: "2026-10-01T11:00",
            startAt: new Date("2026-10-01T10:00Z"),
            endAt: new Date("2026-10-01T11:00Z")
          }
        }
      },
      include: { occurrences: true }
    });
  const published = await create(church.id, "PUBLIC");
  await create(church.id, "PRIVATE");
  await create(personal.id, "PUBLIC");
  await create(church.id, "CHURCH");
  assert.equal(
    (await search(db, undefined, { kind: "events", q: marker })).items.length,
    1
  );
  assert.equal(
    (await search(db, f.memberA.token, { kind: "events", q: marker })).items
      .length,
    2
  );
  await db.calendarEvent.update({
    where: { id: published.id },
    data: { visibility: "PRIVATE" }
  });
  assert.equal(
    (await search(db, undefined, { kind: "events", q: marker })).items.length,
    0
  );
  await db.platformCalendar.update({
    where: { id: church.id },
    data: { archivedAt: new Date() }
  });
  assert.equal(
    (await search(db, f.memberA.token, { kind: "events", q: marker })).items
      .length,
    0
  );
});
test("membership revocation removes private post search and saved excerpts on the next read", async () => {
  const marker = randomUUID();
  const post = await db.platformPost.create({
    data: {
      authorId: f.memberA.id,
      content: marker,
      audience: "CHURCH",
      audienceChurchId: f.churchA.id,
      publishedAt: new Date()
    }
  });
  assert.equal(
    (await search(db, f.coordinator.token, { q: marker })).items.length,
    1
  );
  assert.equal((await search(db, undefined, { q: marker })).items.length, 0);
  await postWorkspaceCommand(db, f.coordinator.token, {
    operation: "save-item",
    mutationId: randomUUID(),
    postId: post.id,
    expectedVersion: 0
  });
  assert.ok(
    JSON.stringify(
      await readPostWorkspace(db, f.coordinator.token, { view: "saved" })
    ).includes(marker)
  );
  await db.churchConnection.update({
    where: {
      userId_churchId: { userId: f.coordinator.id, churchId: f.churchA.id }
    },
    data: { state: "REMOVED", version: { increment: 1 } }
  });
  assert.equal(
    (await search(db, f.coordinator.token, { q: marker })).items.length,
    0
  );
  const saved = JSON.stringify(
    await readPostWorkspace(db, f.coordinator.token, { view: "saved" })
  );
  assert.ok(!saved.includes(marker));
  assert.ok(!saved.includes(post.id));
});
test("draft publish rechecks church authority and keeps private work when authority is absent", async () => {
  const id = randomUUID();
  await postWorkspaceCommand(db, f.memberB.token, {
    operation: "save-draft",
    mutationId: randomUUID(),
    id,
    expectedVersion: 0,
    payload: {
      content: "Unsent church fixture",
      replyAudience: "CHURCH_MEMBERS",
      authorChurchId: f.churchA.id,
      audience: "CHURCH",
      audienceChurchId: f.churchA.id
    }
  });
  await assert.rejects(
    postWorkspaceCommand(db, f.memberB.token, {
      operation: "publish-draft",
      mutationId: randomUUID(),
      id,
      expectedVersion: 1
    }),
    (e: unknown) =>
      !!e && typeof e === "object" && "status" in e && e.status === 403
  );
  assert.ok(
    JSON.stringify(
      await readPostWorkspace(db, f.memberB.token, { view: "draft", id })
    ).includes("Unsent church fixture")
  );
  assert.equal(
    await db.platformPost.count({
      where: { content: "Unsent church fixture" }
    }),
    0
  );
});
