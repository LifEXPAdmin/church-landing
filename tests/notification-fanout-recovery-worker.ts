// Real process interruption points exist only in this isolated fixture adapter.
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { processNotificationFanoutBatch } from "../lib/platform/notification-fanout";

const input = JSON.parse(process.argv[2]);
const original = new PrismaClient();
async function send(value: object) {
  assert.ok(process.send);
  await new Promise<void>((resolve, reject) =>
    process.send!(value, (error: Error | null) =>
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
  await assertPortalTestDatabase(original);
  assert.match(input.id, /^[\w-]{1,80}$/);
  assert.ok(["normal", "before-commit", "after-commit"].includes(input.mode));
  const db = original.$extends({
    query: {
      notificationFanoutJob: {
        async update({ args, query }) {
          if (input.mode === "before-commit") await pause("before-commit");
          return query(args);
        }
      }
    }
  });
  const result = await processNotificationFanoutBatch(
    db as unknown as PrismaClient,
    input.id
  );
  if (input.mode === "after-commit") await pause("after-commit");
  await send({ result });
} catch (error) {
  await send({ error: (error as { code?: string }).code ?? "FIXTURE_ERROR" });
  process.exitCode = 1;
} finally {
  await original.$disconnect();
  process.disconnect?.();
}
