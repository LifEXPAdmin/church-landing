import test from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { postCommand } from "../lib/platform/post-commands";

test("a killed fanout transaction rolls back intents and cursor; killing after commit resumes without duplicate recipients", async (t) => {
  const db = new PrismaClient();
  t.after(() => db.$disconnect());
  await assertPortalTestDatabase(db);
  const author = await createPortalActor(db, "fanoutcrashauthor");
  const template = await db.platformUser.findUniqueOrThrow({
    where: { id: author.id }
  });
  const earlier = new Date(Date.now() - 60000);
  for (let i = 0; i < 25; i++) {
    const id = randomUUID(),
      username = `restart_${id.replaceAll("-", "").slice(0, 20)}`;
    await db.platformUser.create({
      data: {
        id,
        username,
        email: `${username}@example.test`,
        name: "Fictional restart recipient",
        passwordHash: template.passwordHash,
        emailVerifiedAt: earlier,
        adultAcknowledgedAt: earlier,
        adultPolicyVersion: template.adultPolicyVersion,
        role: "BELIEVER"
      }
    });
    await db.socialRelationship.create({
      data: {
        ownerId: id,
        targetUserId: author.id,
        authorBellSince: earlier,
        authorBellVersion: 1
      }
    });
  }
  const post = await postCommand(db, author.token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "Fictional restart source"
  });
  const job = await db.notificationFanoutJob.findFirstOrThrow({
    where: { sourceId: post.id }
  });
  const row = () =>
    db.notificationFanoutJob.findUniqueOrThrow({ where: { id: job.id } });
  const count = () =>
    db.socialEvent.count({ where: { sourceId: post.id, kind: "AUTHOR_POST" } });
  const children = new Set<ReturnType<typeof fork>>();
  t.after(async () => {
    await Promise.all(
      [...children].map(
        (child) =>
          new Promise<void>((resolve) => {
            child.once("exit", () => resolve());
            child.kill("SIGKILL");
          })
      )
    );
  });
  function worker(mode: string) {
    const child = fork(
      new URL("./notification-fanout-recovery-worker.ts", import.meta.url),
      [JSON.stringify({ id: job.id, mode })],
      {
        execArgv: ["--import", new URL("./register.mjs", import.meta.url).href],
        env: { ...process.env },
        stdio: ["ignore", "ignore", "inherit", "ipc"]
      }
    );
    children.add(child);
    const phase = Promise.withResolvers<void>();
    let reply:
      | { result?: { done: boolean; processed: number }; error?: string }
      | undefined;
    child.on("message", (value: typeof reply & { phase?: string }) => {
      if (value?.phase) phase.resolve();
      else reply = value;
    });
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      child.kill("SIGKILL");
    }, 15000);
    const finished = new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
    }>((resolve) =>
      child.once("exit", (code, signal) => {
        clearTimeout(timer);
        children.delete(child);
        resolve({ code, signal });
      })
    );
    return {
      wait: () =>
        Promise.race([
          phase.promise,
          finished.then(() => {
            throw Error("Fixture ended before interruption point");
          })
        ]),
      kill: async () => {
        child.kill("SIGKILL");
        assert.equal((await finished).signal, "SIGKILL");
        assert.equal(expired, false);
      },
      result: async () => {
        assert.equal((await finished).code, 0);
        assert.equal(expired, false);
        assert.equal(reply?.error, undefined);
        assert.ok(reply?.result);
        return reply.result;
      }
    };
  }
  const before = worker("before-commit");
  await before.wait();
  assert.equal(await count(), 0, "Uncommitted intents remain invisible");
  await before.kill();
  assert.equal(await count(), 0);
  assert.equal((await row()).cursor, null);
  const after = worker("after-commit");
  await after.wait();
  assert.equal(await count(), 20);
  assert.ok((await row()).cursor);
  await after.kill();
  assert.deepEqual(await worker("normal").result(), {
    done: true,
    processed: 5,
    sourceId: post.id
  });
  assert.equal(await count(), 25);
  assert.ok((await row()).completedAt);
  assert.deepEqual(await worker("normal").result(), {
    done: true,
    processed: 0,
    sourceId: null
  });
  assert.equal(await count(), 25);
  assert.equal(
    await db.notificationDelivery.count({
      where: { event: { sourceId: post.id } }
    }),
    0
  );
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: post.id } }))
      .content,
    "Fictional restart source"
  );
});
