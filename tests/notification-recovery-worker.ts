// A real disposable worker process, with transport restricted to a local fixture.
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { deliverNotification } from "../lib/platform/notification-outbox";

const db = new PrismaClient();
const input = JSON.parse(process.argv[2]);
async function send(message: object) {
  assert.ok(process.send, "Recovery fixture requires its parent IPC channel");
  await new Promise<void>((resolve, reject) =>
    process.send!(message, (error: Error | null) =>
      error ? reject(error) : resolve()
    )
  );
}
async function pause(phase: string) {
  const resumed = new Promise<void>((resolve) =>
    process.once("message", () => resolve())
  );
  await send({ phase });
  await resumed;
}
try {
  await assertPortalTestDatabase(db);
  const provider = new URL(input.provider);
  assert.equal(provider.protocol, "http:");
  assert.equal(provider.hostname, "127.0.0.1");
  assert.ok(provider.port);
  assert.match(input.id, /^[\w-]{1,80}$/);
  assert.ok(
    ["normal", "before-send", "after-send", "lock-timeout"].includes(input.mode)
  );
  if (input.mode === "lock-timeout")
    await db.$executeRawUnsafe("SET lock_timeout = '250ms'");
  const result = await deliverNotification(
    db,
    input.id,
    async (_subscription, payload) => {
      if (input.mode === "before-send") await pause("before-send");
      const response = await fetch(provider, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000)
      });
      await response.text();
      if (input.mode === "after-send") await pause("after-send");
      return response.status;
    },
    input.now ? new Date(input.now) : new Date()
  );
  await send({ result });
} catch (error) {
  // Only a sanitized database code crosses IPC; never endpoint/key material.
  const value = error as { code?: string; meta?: { code?: string } };
  await send({
    error: {
      code: value.code ?? "FIXTURE_ERROR",
      sqlState: value.meta?.code ?? null
    }
  });
} finally {
  await db.$disconnect();
  process.disconnect?.();
}
