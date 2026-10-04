import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

/** A new attempt owns new files only. Never replace a previous receipt. */
export function createMeasurementReceipts(directory, phase) {
  assert.ok(["service", "http"].includes(phase));
  const root = join(directory, "resource-receipts");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const directoryName = mkdtempSync(join(root, `${phase}-`));
  return {
    id: basename(directoryName),
    write(name, value) {
      assert.match(name, /^[a-z][a-z0-9-]*\.json$/);
      const path = join(directoryName, name);
      writeFileSync(path, JSON.stringify(value, null, 2), {
        flag: "wx",
        mode: 0o600
      });
      return path;
    }
  };
}

export function summary(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    min: sorted[0] ?? null,
    p50: sorted[Math.ceil(sorted.length * 0.5) - 1] ?? null,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1] ?? null,
    max: sorted.at(-1) ?? null
  };
}

/** Cancellation stops scheduling, but evidence waits for every started call. */
export async function runSettledStage({
  count,
  concurrency,
  signal,
  abort,
  call
}) {
  assert.ok(Number.isSafeInteger(count) && count > 0);
  assert.ok(Number.isSafeInteger(concurrency) && concurrency > 0);
  let next = 0;
  await Promise.allSettled(
    Array.from({ length: concurrency }, async (_, actorIndex) => {
      try {
        while (!signal.aborted && next < count) {
          await call(next++, actorIndex);
        }
      } catch (error) {
        abort(error);
        throw error;
      }
    })
  );
  signal.throwIfAborted();
}
