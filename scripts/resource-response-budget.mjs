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
  let totalBytes = 0,
    totalReceivedBytes = 0;
  return {
    signal: controller.signal,
    get totalBytes() {
      return totalBytes;
    },
    get totalReceivedBytes() {
      return totalReceivedBytes;
    },
    abort(error) {
      controller.abort(error);
    },
    // Each observed snapshot is cumulative for this read, including a delivered
    // chunk rejected by a cap or a concurrent abort. Only retained bytes buffer.
    async read(body, observe) {
      const reader = body?.getReader();
      const chunks = [];
      let bytes = 0,
        receivedBytes = 0;
      const report = () => observe?.({ receivedBytes, retainedBytes: bytes });
      const cancel = () => {
        void reader?.cancel(controller.signal.reason).catch(() => {});
      };
      controller.signal.addEventListener("abort", cancel, { once: true });
      try {
        controller.signal.throwIfAborted();
        if (!reader) return Buffer.alloc(0);
        for (;;) {
          const { value, done } = await reader.read();
          const received = !done && value instanceof Uint8Array;
          if (received) {
            receivedBytes += value.byteLength;
            totalReceivedBytes += value.byteLength;
          }
          if (controller.signal.aborted && received) report();
          controller.signal.throwIfAborted();
          if (done) break;
          assert.ok(
            value instanceof Uint8Array,
            "Expected response byte chunks"
          );
          if (
            bytes + value.byteLength > maximumResponseBytes ||
            totalBytes + value.byteLength > maximumTotalBytes
          ) {
            const error = new Error(
              "Local response-byte collection budget exceeded"
            );
            controller.abort(error);
            report();
            throw error;
          }
          // No await between checking and reserving the shared collection budget.
          bytes += value.byteLength;
          totalBytes += value.byteLength;
          chunks.push(value);
          report();
        }
        return Buffer.concat(chunks, bytes);
      } catch (error) {
        controller.abort(error);
        throw controller.signal.reason;
      } finally {
        controller.signal.removeEventListener("abort", cancel);
        await reader?.cancel().catch(() => {});
        reader?.releaseLock();
      }
    }
  };
}
