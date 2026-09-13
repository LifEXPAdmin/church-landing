// Real disposable process; all bytes live in guarded, isolated local storage.
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { imageStorage } from "../lib/platform/media-storage";
import { collectImageGarbage, uploadImage } from "../lib/platform/media";

const db = new PrismaClient();
const input = JSON.parse(process.argv[2]);
async function send(value: object) {
  assert.ok(process.send);
  await new Promise<void>((resolve, reject) =>
    process.send!(value, (error: Error | null) =>
      error ? reject(error) : resolve()
    )
  );
}
async function pause(phase: string) {
  const resume = new Promise<void>((resolve) =>
    process.once("message", () => resolve())
  );
  await send({ phase });
  await resume;
}
try {
  await assertPortalTestDatabase(db);
  assert.equal(process.env.MEDIA_STORAGE_MODE, "local-test");
  assert.ok(["upload", "cleanup"].includes(input.operation));
  assert.ok(
    ["normal", "first-put", "last-put", "committed", "deleted"].includes(
      input.mode
    )
  );
  const storage = imageStorage();
  let puts = 0;
  const result =
    input.operation === "upload"
      ? await uploadImage(
          db,
          input.token,
          input.command,
          Buffer.from(input.bytes, "base64"),
          {
            ...storage,
            async put(path, bytes, signal) {
              await storage.put(path, bytes, signal);
              puts++;
              if (
                (input.mode === "first-put" && puts === 1) ||
                (input.mode === "last-put" && puts === 4)
              )
                await pause(input.mode);
            }
          }
        )
      : await collectImageGarbage(
          db,
          {
            ...storage,
            async delete(paths, signal) {
              await storage.delete(paths, signal);
              if (input.mode === "deleted") await pause("deleted");
            }
          },
          new Date(input.now)
        );
  if (input.mode === "committed") await pause("committed");
  await send({ result, puts });
} catch (error) {
  const value = error as { code?: string; status?: number };
  await send({
    error: { code: value.code ?? "FIXTURE_ERROR", status: value.status ?? null }
  });
} finally {
  await db.$disconnect();
  process.disconnect?.();
}
