import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import {
  handleOperationalHealth,
  readOperationalHealth
} from "../lib/platform/operational-health";

const db = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
const oldSecret = process.env.CRON_SECRET;
const secret = randomBytes(32).toString("hex");
let capture = false;
let queries: string[] = [];
db.$on("query", (event) => {
  if (capture) queries.push(event.query);
});
before(async () => {
  await assertPortalTestDatabase(db);
  process.env.CRON_SECRET = secret;
});
after(async () => {
  if (oldSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = oldSecret;
  await db.$disconnect();
});
const request = (authorization = `Bearer ${secret}`, method = "GET") =>
  new Request("https://example.test/api/maintenance/health", {
    method,
    headers: {
      authorization,
      cookie: "church_platform_session=not-operator-authority"
    }
  });

test("operational health requires the maintenance secret before accessing data and sanitizes unavailable service failures", async () => {
  let reads = 0;
  const unavailable = {
    $transaction: async () => {
      reads++;
      throw Error("private database credential must never be returned");
    }
  } as unknown as PrismaClient;
  for (const value of ["", "Bearer undefined", "Bearer incorrect", secret]) {
    const response = await handleOperationalHealth(unavailable, request(value));
    assert.equal(response.status, 401);
    assert.match(response.headers.get("cache-control")!, /no-store/);
  }
  assert.equal(
    (await handleOperationalHealth(unavailable, request(undefined, "POST")))
      .status,
    405
  );
  assert.equal(reads, 0);
  const failure = await handleOperationalHealth(unavailable, request());
  assert.equal(failure.status, 503);
  const body = await failure.json();
  assert.deepEqual(body.database, { available: false });
  assert.deepEqual(body.alerts, ["health_unavailable"]);
  assert.ok(!JSON.stringify(body).includes("credential"));
});

test("health reports actual backlog ages with a fixed query shape and never projects private identities or changes data", async () => {
  const now = new Date();
  const before = await readOperationalHealth(db, now);
  const prefixes = Array.from({ length: 101 }, () => "images/" + randomUUID());
  const oldest = new Date(now.getTime() - 91_000_000);
  try {
    await db.mediaGarbage.create({
      data: { storagePrefix: prefixes[0], dueAt: oldest }
    });
    capture = true;
    queries = [];
    const one = await readOperationalHealth(db, now);
    capture = false;
    const oneQueries = queries.filter((q) => /^\s*SELECT\s/i.test(q));
    assert.equal(one.queues.media.due, before.queues.media.due + 1);
    await db.mediaGarbage.createMany({
      data: prefixes
        .slice(1)
        .map((storagePrefix) => ({ storagePrefix, dueAt: now }))
    });
    const rows = JSON.stringify(
      await db.mediaGarbage.findMany({ orderBy: { storagePrefix: "asc" } })
    );
    capture = true;
    queries = [];
    const many = await readOperationalHealth(db, now);
    capture = false;
    assert.equal(
      queries.filter((q) => /^\s*SELECT\s/i.test(q)).length,
      oneQueries.length
    );
    assert.equal(many.queues.media.due, before.queues.media.due + 101);
    assert.ok(many.ages.mediaDueSeconds! >= 91_000);
    assert.ok(many.alerts.includes("media_backlog"));
    assert.equal(
      many.workerLastSuccess,
      "unavailable; inspect scoped completion logs"
    );
    assert.equal(many.configuration.scheduledPublishingConfigured, false);
    assert.ok(queries.every((q) => !/^\s*(INSERT|UPDATE|DELETE)\s/i.test(q)));
    assert.equal(
      JSON.stringify(
        await db.mediaGarbage.findMany({ orderBy: { storagePrefix: "asc" } })
      ),
      rows
    );
    assert.ok(
      prefixes.every((prefix) => !JSON.stringify(many).includes(prefix))
    );
    const response = await handleOperationalHealth(db, request());
    assert.equal(response.status, 503);
    assert.match(response.headers.get("cache-control")!, /private.*no-store/);
    console.log(
      JSON.stringify({
        healthDataQueries: oneQueries.length,
        mediaBacklog: 101
      })
    );
  } finally {
    capture = false;
    await db.mediaGarbage.deleteMany({
      where: { storagePrefix: { in: prefixes } }
    });
  }
});

test("unverified signup intent is excluded from welcome backlog while eligible waiting work and active announcements raise attention", async () => {
  const now = new Date();
  const a = await createPortalActor(db, "healthprivacy");
  const baseline = await readOperationalHealth(db, now);
  const pendingAt = new Date(now.getTime() - 600_000);
  const announcement = await db.founderAnnouncement.create({
    data: {
      founderId: a.id,
      content: "Private announcement marker",
      status: "SENDING",
      previewedAt: pendingAt,
      queuedAt: pendingAt
    }
  });
  try {
    await db.platformUser.update({
      where: { id: a.id },
      data: { pendingFounderWelcomeAt: pendingAt }
    });
    const pending = await readOperationalHealth(db, now);
    assert.equal(
      pending.queues.welcome.pending,
      baseline.queues.welcome.pending + 1
    );
    assert.ok(pending.alerts.includes("founder_delivery_backlog"));
    assert.ok(pending.queues.announcements.pending >= 1);
    const body = JSON.stringify(pending);
    for (const privateValue of [
      a.id,
      a.token,
      a.email,
      announcement.id,
      "Private announcement marker"
    ])
      assert.ok(!body.includes(privateValue));
    await db.platformUser.update({
      where: { id: a.id },
      data: { emailVerifiedAt: null }
    });
    const awaitingVerification = await readOperationalHealth(db, now);
    assert.equal(
      awaitingVerification.queues.welcome.pending,
      baseline.queues.welcome.pending
    );
  } finally {
    await db.founderAnnouncement.delete({ where: { id: announcement.id } });
    await db.platformUser.update({
      where: { id: a.id },
      data: { pendingFounderWelcomeAt: null }
    });
  }
});

test("a real database lock timeout returns unavailable health and leaves the connection usable after release", async () => {
  const locker = new PrismaClient();
  const locked = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const held = locker.$transaction(
    async (tx) => {
      await tx.$executeRaw`LOCK TABLE "MediaGarbage" IN ACCESS EXCLUSIVE MODE`;
      locked.resolve();
      await release.promise;
    },
    { timeout: 10_000 }
  );
  try {
    await locked.promise;
    const began = performance.now();
    const response = await handleOperationalHealth(db, request());
    assert.equal(response.status, 503);
    assert.equal((await response.json()).database.available, false);
    assert.ok(performance.now() - began < 8000);
  } finally {
    release.resolve();
    await held;
    await locker.$disconnect();
  }
  assert.equal((await readOperationalHealth(db)).database.available, true);
});
