import { nativePushConfig, type NativePushConfig } from "./native-push-config";
import { isExpoPushToken } from "./native-push-contracts";

type Failure = {
  kind: "retry" | "invalid" | "failed";
  statusCode: number | null;
};
export type NativePushSendResult =
  | Failure
  | { kind: "ticket"; ticketId: string; statusCode: number };
export type NativePushReceiptResult =
  | Failure
  | {
      kind: "accepted" | "pending" | "retry-delivery";
      statusCode: number;
    };
export type NativePushPayload = { deliveryId: string; tag: string };
export type NativePushTransport = {
  send(
    token: string,
    payload: NativePushPayload,
    ttl: number
  ): Promise<NativePushSendResult>;
  receipt(ticketId: string): Promise<NativePushReceiptResult>;
};
const API = "https://exp.host/--/api/v2/push/";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const failed = (statusCode: number | null = null): Failure => ({
  kind: "failed",
  statusCode
});

async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw Error("Missing provider result");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 32768) throw Error("Oversized provider result");
      chunks.push(part.value);
    }
    const joined = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined));
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function providerFailure(
  value: Record<string, unknown>,
  statusCode: number,
  receipt: boolean
): Failure | { kind: "retry-delivery"; statusCode: number } {
  const error = object(value.details) ? value.details.error : null;
  if (error === "DeviceNotRegistered") return { kind: "invalid", statusCode };
  if (error === "MessageRateExceeded")
    return { kind: receipt ? "retry-delivery" : "retry", statusCode };
  return failed(statusCode);
}

/** Results contain no provider messages, token material or raw response bodies. */
export function createNativePushTransport(
  request: typeof fetch = fetch,
  config: () => NativePushConfig | null = nativePushConfig
): NativePushTransport {
  async function call(path: "send" | "getReceipts", body: object) {
    const settings = config();
    if (!settings) return { failure: failed(503) } as const;
    try {
      const response = await request(API + path, {
        method: "POST",
        redirect: "error",
        cache: "no-store",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          authorization: `Bearer ${settings.accessToken}`
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        return {
          failure: {
            kind:
              response.status === 408 ||
              response.status === 429 ||
              response.status >= 500
                ? "retry"
                : "failed",
            statusCode: response.status
          } as Failure
        };
      }
      const value = await boundedJson(response);
      if (
        !object(value) ||
        (value.errors != null &&
          (!Array.isArray(value.errors) || value.errors.length))
      )
        return { failure: failed(response.status) };
      return { value: value.data, statusCode: response.status };
    } catch {
      // Exceptions may contain routing tokens or credentials. Never retain them.
      return { failure: { kind: "retry", statusCode: null } as Failure };
    }
  }
  return {
    async send(token, payload, ttl) {
      if (
        !isExpoPushToken(token) ||
        !/^[\w-]{1,80}$/.test(payload.deliveryId) ||
        !/^[0-9a-f]{64}$/.test(payload.tag) ||
        !Number.isSafeInteger(ttl) ||
        ttl < 1 ||
        ttl > 300
      )
        return failed();
      const result = await call("send", {
        to: token,
        title: "God’s Churches",
        body: "You have new activity on God’s Churches.",
        data: { deliveryId: payload.deliveryId, tag: payload.tag },
        ttl,
        priority: "normal",
        collapseId: payload.tag,
        tag: payload.tag,
        channelId: "activity"
      });
      if (result.failure) return result.failure;
      if (!object(result.value)) return failed(result.statusCode);
      if (result.value.status === "error") {
        const failure = providerFailure(result.value, result.statusCode, false);
        return failure.kind === "retry-delivery"
          ? { kind: "retry", statusCode: failure.statusCode }
          : failure;
      }
      return result.value.status === "ok" &&
        typeof result.value.id === "string" &&
        UUID.test(result.value.id)
        ? {
            kind: "ticket",
            ticketId: result.value.id,
            statusCode: result.statusCode
          }
        : failed(result.statusCode);
    },
    async receipt(ticketId) {
      if (!UUID.test(ticketId)) return failed();
      const result = await call("getReceipts", { ids: [ticketId] });
      if (result.failure) return result.failure;
      if (
        !object(result.value) ||
        Object.keys(result.value).some((id) => id !== ticketId)
      )
        return failed(result.statusCode);
      const receipt = result.value[ticketId];
      if (receipt === undefined)
        return { kind: "pending", statusCode: result.statusCode };
      if (!object(receipt)) return failed(result.statusCode);
      if (receipt.status === "error")
        return providerFailure(receipt, result.statusCode, true);
      return receipt.status === "ok"
        ? { kind: "accepted", statusCode: result.statusCode }
        : failed(result.statusCode);
    }
  };
}

export const nativePushTransport = createNativePushTransport();
