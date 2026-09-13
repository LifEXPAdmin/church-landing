import test, { before, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { fork, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import webpush from "web-push";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants
} from "./seed-portal";
import { seedNotificationPair } from "./seed-notifications";
import { adultMessageCommand } from "../lib/platform/adult-messages";
import { relationshipCommand } from "../lib/platform/relationships";
import { dispatchNotifications } from "../lib/platform/notification-queue";
import type { PushWorkResult } from "../lib/platform/notification-outbox";

const db = new PrismaClient();
const envNames = [
  "PUSH_ENABLED",
  "PUSH_VAPID_PUBLIC_KEY",
  "PUSH_VAPID_PRIVATE_KEY",
  "PUSH_VAPID_SUBJECT",
  "COMMUNITY_REPORTS_ENABLED"
];
const prior = Object.fromEntries(
  envNames.map((key) => [key, process.env[key]])
);
const received: Array<{ deliveryId: string; tag: string; status: number }> = [];
let providerStatus = 201,
  provider = "";
const server = createServer(async (request, response) => {
  try {
    let body = "";
    for await (const chunk of request) {
      body += chunk;
      assert.ok(body.length <= 1024);
    }
    const payload = JSON.parse(body);
    assert.deepEqual(Object.keys(payload).sort(), ["deliveryId", "tag"]);
    received.push({ ...payload, status: providerStatus });
    response.writeHead(providerStatus).end();
  } catch {
    response.writeHead(400).end();
  }
});
type Reply = {
  result?: PushWorkResult;
  error?: { code: string; sqlState: string | null };
};
const children = new Map<ChildProcess, Promise<unknown>>();
function worker(id: string, mode = "normal", now?: Date) {
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("connection_limit", "1");
  const child = fork(
    new URL("./notification-recovery-worker.ts", import.meta.url),
    [JSON.stringify({ id, mode, now: now?.toISOString(), provider })],
    {
      execArgv: ["--import", new URL("./register.mjs", import.meta.url).href],
      env: { ...process.env, DATABASE_URL: url.href, DIRECT_URL: url.href },
      stdio: ["ignore", "ignore", "inherit", "ipc"]
    }
  );
  let reply: Reply | undefined,
    timedOut = false;
  const phase = Promise.withResolvers<void>();
  child.on("message", (message) => {
    const value = message as Reply & { phase?: string };
    if (value.phase) phase.resolve();
    else reply = value;
  });
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, 15000);
  const finished = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
    reply?: Reply;
    timedOut: boolean;
  }>((resolve) => {
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      children.delete(child);
      resolve({ code, signal, reply, timedOut });
    });
  });
  children.set(child, finished);
  return {
    finished,
    waitForPhase: () =>
      Promise.race([
        phase.promise,
        finished.then(() => {
          throw Error(
            "Recovery worker exited before the requested interruption point"
          );
        })
      ]),
    resume: () => child.send({ resume: true }),
    kill: async () => {
      child.kill("SIGKILL");
      const stopped = await finished;
      assert.equal(stopped.signal, "SIGKILL");
      assert.equal(stopped.timedOut, false);
    },
    result: async () => {
      const done = await finished;
      assert.equal(done.code, 0);
      assert.equal(done.timedOut, false);
      assert.equal(done.reply?.error, undefined);
      assert.ok(done.reply?.result);
      return done.reply.result;
    }
  };
}
before(async () => {
  await assertPortalTestDatabase(db);
  const vapid = webpush.generateVAPIDKeys();
  Object.assign(process.env, {
    PUSH_ENABLED: "true",
    PUSH_VAPID_PUBLIC_KEY: vapid.publicKey,
    PUSH_VAPID_PRIVATE_KEY: vapid.privateKey,
    PUSH_VAPID_SUBJECT: "https://example.test/contact",
    COMMUNITY_REPORTS_ENABLED: "true"
  });
  const reviewer = await createPortalActor(db, "crashreview");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  provider = `http://127.0.0.1:${address.port}`;
});
beforeEach(() => {
  received.length = 0;
  providerStatus = 201;
});
afterEach(async () => {
  const pending = [...children];
  for (const [child] of pending) child.kill("SIGKILL");
  await Promise.all(pending.map(([, finished]) => finished));
});
after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.$disconnect();
  for (const key of envNames)
    if (prior[key] === undefined) delete process.env[key];
    else process.env[key] = prior[key];
});
const row = (id: string) =>
  db.notificationDelivery.findUniqueOrThrow({ where: { id } });
async function afterLease(id: string) {
  const delivery = await row(id);
  assert.ok(delivery.leaseUntil);
  return new Date(delivery.leaseUntil.getTime() + 1);
}
async function canonical(f: Awaited<ReturnType<typeof seedNotificationPair>>) {
  assert.equal(
    await db.adultMessage.count({
      where: { conversationId: f.conversation.id }
    }),
    1
  );
  assert.equal(
    await db.socialEvent.count({ where: { messageId: f.sent.id } }),
    1
  );
  assert.equal(
    await db.notificationDelivery.count({
      where: { eventId: f.delivery.eventId }
    }),
    1
  );
  assert.equal(
    (await db.adultMessage.findUniqueOrThrow({ where: { id: f.sent.id } }))
      .content,
    f.input.content
  );
}

test("killing a worker after lease commit preserves the canonical message and native redelivery waits for lease expiry", async () => {
  const f = await seedNotificationPair(db);
  const interrupted = worker(f.delivery.id, "before-send");
  await interrupted.waitForPhase();
  assert.equal((await row(f.delivery.id)).state, "IN_FLIGHT");
  await interrupted.kill();
  assert.equal(received.length, 0);
  const waiting = await worker(f.delivery.id).result();
  assert.equal(waiting.done, false);
  assert.equal(received.length, 0);
  assert.deepEqual(
    await worker(
      f.delivery.id,
      "normal",
      await afterLease(f.delivery.id)
    ).result(),
    { done: true, outcome: "accepted" }
  );
  assert.equal(received.length, 1);
  assert.equal((await row(f.delivery.id)).attempts, 2);
  assert.deepEqual(await adultMessageCommand(db, f.a.token, f.input), f.sent);
  await canonical(f);
});

test("provider acceptance followed by process death can repeat a generic push but never duplicates the canonical message", async () => {
  const f = await seedNotificationPair(db);
  const interrupted = worker(f.delivery.id, "after-send");
  await interrupted.waitForPhase();
  assert.equal(received.length, 1);
  assert.equal(received[0].status, 201);
  assert.equal((await row(f.delivery.id)).outcome, null);
  await interrupted.kill();
  await worker(
    f.delivery.id,
    "normal",
    await afterLease(f.delivery.id)
  ).result();
  assert.equal(received.length, 2);
  assert.deepEqual(received[0], received[1]);
  assert.doesNotMatch(
    JSON.stringify(received),
    /Private canonical|endpoint|p256dh|pushsend|pushread/
  );
  const attempts = await db.pushDeliveryAttempt.findMany({
    where: { deliveryId: f.delivery.id },
    orderBy: { attempt: "asc" }
  });
  assert.deepEqual(
    attempts.map((attempt) => attempt.outcome),
    ["ATTEMPTED", "ACCEPTED"]
  );
  assert.equal(
    attempts[0].statusCode,
    null,
    "The lost acknowledgement must remain unknown"
  );
  await canonical(f);
});

test("a delayed old worker cannot overwrite a newer lease or its retry ownership", async () => {
  const f = await seedNotificationPair(db);
  const delayed = worker(f.delivery.id, "before-send");
  await delayed.waitForPhase();
  providerStatus = 503;
  const retry = await worker(
    f.delivery.id,
    "normal",
    await afterLease(f.delivery.id)
  ).result();
  assert.equal(retry.done, false);
  providerStatus = 201;
  delayed.resume();
  assert.deepEqual(await delayed.result(), {
    done: true,
    outcome: "cancelled"
  });
  const pending = await row(f.delivery.id);
  assert.equal(pending.state, "QUEUED");
  assert.equal(pending.attempts, 2);
  assert.equal(pending.outcome, null);
  await worker(f.delivery.id, "normal", pending.availableAt).result();
  assert.equal((await row(f.delivery.id)).outcome, "ACCEPTED");
  assert.deepEqual(
    received.map((request) => request.status),
    [503, 201, 201]
  );
  await canonical(f);
});

test("blocking or revoking a session during an interrupted lease prevents restart from sending", async () => {
  for (const change of ["block", "logout"] as const) {
    const f = await seedNotificationPair(db);
    const interrupted = worker(f.delivery.id, "before-send");
    await interrupted.waitForPhase();
    const recoveredAt = await afterLease(f.delivery.id);
    await interrupted.kill();
    if (change === "block")
      await relationshipCommand(db, f.b.token, {
        operation: "block",
        mutationId: randomUUID(),
        kind: "person",
        targetId: f.a.id,
        desired: true,
        expectedVersion: 0
      });
    else await db.platformSession.deleteMany({ where: { userId: f.b.id } });
    assert.equal(
      (await worker(f.delivery.id, "normal", recoveredAt).result()).done,
      true
    );
    assert.equal(received.length, 0);
    assert.equal((await row(f.delivery.id)).outcome, "CANCELLED");
    await canonical(f);
  }
});

test("a real database lock timeout rolls back the lease and a restarted worker can recover once", async () => {
  const f = await seedNotificationPair(db);
  await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
      const failed = await worker(f.delivery.id, "lock-timeout").finished;
      assert.equal(failed.code, 0);
      assert.equal(failed.timedOut, false);
      assert.equal(failed.reply?.error?.sqlState, "55P03");
    },
    { timeout: 15000 }
  );
  assert.equal(received.length, 0);
  const pending = await row(f.delivery.id);
  assert.equal(pending.state, "QUEUED");
  assert.equal(pending.attempts, 0);
  assert.equal(
    await db.pushDeliveryAttempt.count({
      where: { deliveryId: f.delivery.id }
    }),
    0
  );
  assert.deepEqual(await worker(f.delivery.id).result(), {
    done: true,
    outcome: "accepted"
  });
  assert.equal(received.length, 1);
  await canonical(f);
});

test("repeated failed workers converge to the existing terminal guard without a ninth send or message rollback", async () => {
  const f = await seedNotificationPair(db);
  providerStatus = 503;
  for (let attempt = 1; attempt <= 8; attempt++) {
    const pending = await row(f.delivery.id);
    const result = await worker(
      f.delivery.id,
      "normal",
      pending.availableAt
    ).result();
    assert.equal(result.done, attempt === 8);
  }
  const failed = await row(f.delivery.id);
  assert.equal(failed.state, "FINISHED");
  assert.equal(failed.outcome, "FAILED");
  assert.equal(failed.attempts, 8);
  assert.equal(received.length, 8);
  assert.deepEqual(await worker(f.delivery.id).result(), {
    done: true,
    outcome: "finished"
  });
  let published = 0;
  await dispatchNotifications(db, f.sent.id, async () => {
    published++;
  });
  assert.equal(published, 0);
  assert.equal(received.length, 8);
  await canonical(f);
});
