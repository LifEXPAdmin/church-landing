import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import {
  consumeNotificationWork,
  retryNotificationWork
} from "../lib/platform/notification-consumer";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());

test("shared native consumer rejects unsupported topics and mismatched payloads before database access", async () => {
  const noDatabase = new Proxy({} as PrismaClient, {
    get() {
      throw Error("Rejected input must not reach a domain service");
    }
  });
  for (const topic of [
    "comment-followers-v1",
    "notification-fanout-v1",
    "scheduled-publication-v1"
  ])
    for (const value of [
      null,
      {},
      { id: "../../bad" },
      { id: "valid", version: 0 },
      { id: "valid", version: 1, body: "unwanted" }
    ])
      await consumeNotificationWork(noDatabase, topic, value);
  await consumeNotificationWork(noDatabase, "unknown-topic", { id: "valid" });
  await consumeNotificationWork(noDatabase, "scheduled-publication-v1", {
    id: "valid"
  });
  for (const topic of ["comment-followers-v1", "notification-fanout-v1"])
    await consumeNotificationWork(noDatabase, topic, {
      id: "valid",
      version: 1
    });
  assert.deepEqual(
    retryNotificationWork(Error("temporary transport failure")),
    { afterSeconds: 60 }
  );
});

test("all three topics reach their own canonical no-op path without creating work or delivery", async (t) => {
  const counts = async () =>
    Promise.all([
      db.commentFollowerJob.count(),
      db.notificationFanoutJob.count(),
      db.platformPost.count(),
      db.socialEvent.count(),
      db.notificationDelivery.count()
    ]);
  const before = await counts(),
    messages: unknown[][] = [];
  t.mock.method(console, "info", (...args: unknown[]) => {
    messages.push(args);
  });
  const id = "probe-" + randomUUID();
  for (const topic of ["comment-followers-v1", "notification-fanout-v1"])
    await consumeNotificationWork(db, topic, { id });
  await consumeNotificationWork(db, "scheduled-publication-v1", {
    id,
    version: 1
  });
  assert.deepEqual(await counts(), before);
  assert.deepEqual(messages, [
    ["comment_follower_queue_probe_completed", { applicationWrites: 0 }],
    ["activity_fanout_queue_probe_completed", { applicationWrites: 0 }],
    ["scheduled_publication_queue_probe_completed", { applicationWrites: 0 }]
  ]);
});
