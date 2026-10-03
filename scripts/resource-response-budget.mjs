import assert from "node:assert/strict";

/** Bound retained response bytes across all concurrent measurement requests. */
export function createResourceResponseBudget(
  maximumTotalBytes,
  maximumResponseBytes
) {
  assert.ok(Number.isSafeInteger(maximumTotalBytes) && maximumTotalBytes > 0);
  assert.ok(
    Number.isSafeInteger(maximumResponseBytes) && maximumResponseBytes > 0
  );
  const controller = new AbortController();
  let totalBytes = 0;
  return {
    signal: controller.signal,
    get totalBytes() {
      return totalBytes;
    },
    abort(error) {
      controller.abort(error);
    },
    async read(body) {
      const reader = body?.getReader();
      const chunks = [];
      let bytes = 0;
      const cancel = () => {
        void reader?.cancel(controller.signal.reason).catch(() => {});
      };
      controller.signal.addEventListener("abort", cancel, { once: true });
      try {
        controller.signal.throwIfAborted();
        if (!reader) return Buffer.alloc(0);
        for (;;) {
          const { value, done } = await reader.read();
          controller.signal.throwIfAborted();
          if (done) break;
          assert.ok(
            value instanceof Uint8Array,
            "Expected response byte chunks"
          );
          if (
            bytes + value.byteLength > maximumResponseBytes ||
            totalBytes + value.byteLength > maximumTotalBytes
          )
            throw new Error("Local response-byte collection budget exceeded");
          // No await between checking and reserving the shared collection budget.
          bytes += value.byteLength;
          totalBytes += value.byteLength;
          chunks.push(value);
        }
        return Buffer.concat(chunks, bytes);
      } catch (error) {
        controller.abort(error);
        throw error;
      } finally {
        controller.signal.removeEventListener("abort", cancel);
        await reader?.cancel().catch(() => {});
        reader?.releaseLock();
      }
    }
  };
}
