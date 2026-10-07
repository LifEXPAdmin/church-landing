import { API_MAX_RESPONSE_BYTES } from "@godschurches/shared-core";
import type { NativeApiConfiguration, NativeWire, NativeWireRequest, NativeWireResponse } from "./request-adapter.ts";

export type NativeJsonRequest = Pick<NativeWireRequest, "url" | "method" | "headers"> & { body: string | null };
export type NativeJsonBridge = {
  initialize(environment: string, origin: string): Promise<void>;
  /** Reserve one of four native slots with its own 15-second deadline. */
  reserve(id: string): Promise<void>;
  send(id: string, request: NativeJsonRequest): Promise<NativeWireResponse>;
  cancel(id: string): Promise<void>;
};
const failure = () => new Error("Native request could not be confirmed.");
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function interruptible<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(failure());
    if (signal.aborted) { reject(failure()); promise.catch(() => {}); return; }
    signal.addEventListener("abort", abort, { once: true });
    promise.then(value => { signal.removeEventListener("abort", abort); resolve(value); }, () => {
      signal.removeEventListener("abort", abort); reject(failure());
    });
  });
}

/** The real bridge enforces limits independently while JavaScript is suspended. */
export function createBridgedNativeWire(configuration: NativeApiConfiguration, bridge: NativeJsonBridge, requestId: () => string): NativeWire {
  const { origin, environment } = configuration;
  let initialized: Promise<void> | null = null;
  const active = new Set<string>();
  const cancel = async (id: string) => { try { await bridge.cancel(id); } catch { /* Native deadline still owns cleanup. */ } };
  return async request => {
    let id: string | null = null;
    let ownsSlot = false;
    let onAbort: (() => void) | null = null;
    try {
      if (request.signal.aborted || request.maximumResponseBytes !== API_MAX_RESPONSE_BYTES || request.timeoutMs !== 15000 || active.size >= 4) throw failure();
      id = requestId();
      if (!uuid.test(id) || active.has(id)) throw failure();
      const ownedId = id;
      active.add(ownedId);
      ownsSlot = true;
      onAbort = () => { void cancel(ownedId); };
      request.signal.addEventListener("abort", onAbort, { once: true });
      initialized ??= bridge.initialize(environment, origin);
      await interruptible(initialized, request.signal);
      if (request.signal.aborted) throw failure();
      // Native cancellation may arrive before reservation completes. The late
      // reservation callback must cancel again, and send must never recreate it.
      const reserved = bridge.reserve(ownedId).then(() => {
        if (request.signal.aborted) { void cancel(ownedId); throw failure(); }
      });
      await interruptible(reserved, request.signal);
      if (request.signal.aborted) throw failure();
      const result = await interruptible(bridge.send(ownedId, {
        url: request.url, method: request.method, headers: request.headers, body: request.body ?? null
      }), request.signal);
      if (request.signal.aborted) throw failure();
      return result;
    } catch { throw failure(); }
    finally {
      if (onAbort) request.signal.removeEventListener("abort", onAbort);
      if (ownsSlot && id && active.delete(id)) void cancel(id);
    }
  };
}
