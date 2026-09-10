import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedParticipation } from "./seed-post-participation";
import {
  getPostComposer,
  getPostEditor,
  getPostEventOptions
} from "../lib/platform/post-editor";
import { handlePostRequest } from "../lib/platform/post-boundary";
import { postCommand } from "../lib/platform/post-commands";
import { getChurchPostFeed } from "../lib/platform/post-reads";
import { calendarCommand } from "../lib/platform/calendar-commands";
import { PortalError } from "../lib/platform/portal";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const denied = (p: Promise<unknown>, status = 403) =>
  assert.rejects(
    p,
    (e: unknown) => e instanceof PortalError && e.status === status
  );
const send = (token: string, data: Record<string, unknown>, source = origin) =>
  handlePostRequest(
    db,
    new Request(origin + "/api/platform/posts", {
      method: "POST",
      headers: {
        Origin: source,
        Cookie: "church_platform_session=" + token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    })
  );
test("composer and event choices expose only current approved church capabilities and published source occurrences", async () => {
  const f = await seedParticipation(db);
  await denied(getPostComposer(db, ""), 401);
  assert.equal(
    (await getPostComposer(db, f.ada.token)).churches.find(
      (c) => c.id === f.churchA.id
    )?.canPublish,
    true
  );
  assert.equal(
    (await getPostComposer(db, f.lee.token)).churches.find(
      (c) => c.id === f.churchA.id
    )?.canPublish,
    false
  );
  assert.ok(
    !(await getPostComposer(db, f.blake.token)).churches.some(
      (c) => c.id === f.churchA.id
    )
  );
  await denied(getPostEventOptions(db, f.blake.token, f.churchA.id));
  const options = await getPostEventOptions(db, f.lee.token, f.churchA.id);
  assert.equal(options.events[0].id, f.occurrence.id);
  assert.equal(options.events[0].hasDiscussion, true);
  for (const secret of [
    f.ada.id,
    f.ada.email,
    "requestKey",
    "location",
    "description"
  ])
    assert.ok(!JSON.stringify(options).includes(secret));
  await calendarCommand(db, f.ada.token, {
    operation: "set-visibility",
    eventId: f.event.id,
    expectedVersion: 1,
    visibility: "PRIVATE",
    confirmed: true
  });
  assert.equal(
    (await getPostEventOptions(db, f.lee.token, f.churchA.id)).events.length,
    0
  );
  await db.churchCapabilityGrant.updateMany({
    where: { userId: f.ada.id, capability: "PUBLISH_CHURCH_POSTS" },
    data: { revokedAt: new Date() }
  });
  assert.equal(
    (await getPostComposer(db, f.ada.token)).churches.find(
      (c) => c.id === f.churchA.id
    )?.canPublish,
    false
  );
});
test("publishing boundary rejects forged authors, origins, scheduling and excessive fields while identical retries publish once", async () => {
  const f = await seedParticipation(db),
    requestKey = randomUUID(),
    content = "文".repeat(1499) + "\r\n\r\n" + "字".repeat(1499);
  const payload = {
    operation: "create",
    requestKey,
    content,
    topics: ["service", "community"],
    scripture: "Galatians 6:9"
  };
  assert.equal(
    (await send(f.lee.token, payload, "https://wrong.example")).status,
    403
  );
  assert.equal((await send("", payload)).status, 401);
  assert.equal(
    (await send(f.lee.token, { ...payload, authorId: f.ada.id })).status,
    400
  );
  assert.equal(
    (await send(f.lee.token, { ...payload, authorChurchId: f.churchA.id }))
      .status,
    403
  );
  assert.equal(
    (
      await send(f.lee.token, {
        ...payload,
        scheduleLocal: "2026-12-01T09:00",
        scheduleZone: "UTC"
      })
    ).status,
    400
  );
  assert.equal(
    (await send(f.lee.token, { ...payload, content: content + "字" })).status,
    400
  );
  assert.equal(
    (
      await send(f.lee.token, {
        ...payload,
        topics: [
          "service",
          "community",
          "prayer",
          "fasting",
          "family",
          "worship"
        ]
      })
    ).status,
    400
  );
  assert.equal(
    (await send(f.lee.token, { ...payload, scripture: "x".repeat(121) }))
      .status,
    400
  );
  const first = await send(f.lee.token, payload);
  assert.equal(first.status, 200);
  assert.match(first.headers.get("cache-control")!, /no-store/);
  const saved = await first.json();
  assert.equal((await (await send(f.lee.token, payload)).json()).id, saved.id);
  const posts = await db.platformPost.findMany({ where: { requestKey } });
  assert.equal(posts.length, 1);
  assert.equal(posts[0].content.length, 3000);
  assert.equal(posts[0].authorId, f.lee.id);
  assert.equal(posts[0].authorChurchId, null);
  const editor = await getPostEditor(db, f.lee.token, saved.id);
  assert.equal(editor.authorName, "Me");
  for (const hidden of [f.lee.email, f.lee.id, "requestKey", "scheduledById"])
    assert.ok(!JSON.stringify(editor).includes(hidden));
  await denied(getPostEditor(db, f.ada.token, saved.id));
});
test("versioned post edits require audience confirmation and preserve poll ballots and volunteer reservations", async () => {
  const f = await seedParticipation(db);
  const poll = await f.poll(),
    slot = await f.slot();
  const option = await db.postPollOption.findFirstOrThrow({
    where: { pollId: poll.id }
  });
  await f.command(f.lee, {
    operation: "vote",
    pollVersion: 1,
    expectedVersion: 0,
    optionIds: [option.id]
  });
  await f.command(f.val, {
    operation: "volunteer",
    slotId: slot.id,
    slotVersion: 1,
    expectedVersion: 0
  });
  const ballots = await db.postPollBallot.findMany({
      where: { pollId: poll.id }
    }),
    signups = await db.postVolunteerSignup.findMany({
      where: { slotId: slot.id }
    });
  const input = {
    operation: "edit",
    postId: f.post.id,
    expectedVersion: 1,
    content:
      "Edited church announcement.\n\n- Bring water\n- Welcome neighbors",
    audience: "PUBLIC",
    topics: ["service"]
  };
  assert.equal((await send(f.ada.token, input)).status, 400);
  assert.equal(
    (await send(f.ada.token, { ...input, confirmAudienceChange: true })).status,
    200
  );
  assert.equal(
    (await send(f.ada.token, { ...input, confirmAudienceChange: true })).status,
    409
  );
  const latest = await getPostEditor(db, f.ada.token, f.post.id);
  assert.equal(latest.version, 2);
  assert.equal(latest.audience, "PUBLIC");
  assert.equal(latest.eventAudience, "CHURCH");
  await denied(getPostEditor(db, f.blake.token, f.post.id), 404);
  assert.deepEqual(
    await db.postPollBallot.findMany({ where: { pollId: poll.id } }),
    ballots
  );
  assert.deepEqual(
    await db.postVolunteerSignup.findMany({ where: { slotId: slot.id } }),
    signups
  );
  assert.ok(
    (await db.platformPost.findUniqueOrThrow({ where: { id: f.post.id } }))
      .editedAt
  );
  await db.churchCapabilityGrant.updateMany({
    where: { userId: f.ada.id, capability: "PUBLISH_CHURCH_POSTS" },
    data: { revokedAt: new Date() }
  });
  assert.equal(
    (await send(f.ada.token, { ...input, expectedVersion: 2 })).status,
    403
  );
  await denied(getPostEditor(db, f.ada.token, f.post.id));
});
test("church feed separates bounded pins, applies expiry and paginates deliberately shared posts without inferring membership authorship", async () => {
  const f = await seedParticipation(db),
    until = new Date(Date.now() + 86400000).toISOString(),
    pinned: string[] = [];
  for (let i = 0; i < 4; i++) {
    const p = await postCommand(db, f.ada.token, {
      operation: "create",
      requestKey: randomUUID(),
      authorChurchId: f.churchA.id,
      audience: "PUBLIC",
      content: "Notice " + i
    });
    if (i < 3) {
      await postCommand(db, f.ada.token, {
        operation: "pin",
        postId: p.id,
        expectedVersion: 1,
        until
      });
      pinned.push(p.id);
    } else
      await denied(
        postCommand(db, f.ada.token, {
          operation: "pin",
          postId: p.id,
          expectedVersion: 1,
          until
        }),
        409
      );
  }
  const privatePin = await postCommand(db, f.ada.token, {
    operation: "create",
    requestKey: randomUUID(),
    authorChurchId: f.churchA.id,
    content: "Private notice"
  });
  await db.platformPost.update({
    where: { id: pinned[0] },
    data: { pinUntil: new Date(Date.now() - 1000) }
  });
  await postCommand(db, f.ada.token, {
    operation: "pin",
    postId: privatePin.id,
    expectedVersion: 1,
    until
  });
  for (let i = 0; i < 33; i++)
    await postCommand(db, f.lee.token, {
      operation: "create",
      requestKey: randomUUID(),
      audienceChurchId: f.churchA.id,
      audience: "PUBLIC",
      content: "Deliberately shared personal post " + i
    });
  const unshared = await postCommand(db, f.lee.token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "Not shared with my church"
  });
  const guest = await getChurchPostFeed(db, "", f.churchA.id);
  assert.deepEqual(
    guest.pinned.map((p) => p.id).sort(),
    pinned.slice(1).sort()
  );
  assert.equal(guest.posts.length, 31);
  assert.equal(guest.canShare, false);
  assert.ok(
    !guest.posts.some(
      (p) => p.id === unshared.id || pinned.slice(1).includes(p.id)
    )
  );
  const last = guest.posts[29];
  const next = await getChurchPostFeed(db, "", f.churchA.id, {
    before: last.createdAt,
    cursor: last.id
  });
  assert.ok(next.posts.some((p) => p.id === pinned[0]));
  assert.ok(
    !next.posts.some((p) =>
      guest.posts.slice(0, 30).some((first) => first.id === p.id)
    )
  );
  const member = await getChurchPostFeed(db, f.lee.token, f.churchA.id);
  assert.equal(member.canShare, true);
  assert.equal(member.pinned.length, 3);
  assert.ok(member.pinned.some((p) => p.id === privatePin.id));
});
