import {
  API_VERSION, API_MAX_REQUEST_BYTES, API_MAX_RESPONSE_BYTES, apiFailure, apiId,
  type RequestAdapter, type RequestCancellation, type RequestData, type RequestIdentity
} from "@godschurches/shared-core";
import type { Credential } from "../session/credential-vault.ts";

/** Private transport input. Never expose this snapshot through a UI store. */
export type NativeIdentity = Readonly<{ identity: RequestIdentity; credential: Credential | null }>;
export type NativeIdentitySource = { current(): NativeIdentity };
export type NativeWireRequest = Readonly<{
  url: string;
  method: "GET" | "POST";
  headers: Readonly<Record<string, string>>;
  body?: string;
  maximumResponseBytes: number;
  timeoutMs: number;
  signal: AbortSignal;
}>;
export type NativeWireResponse = Readonly<{
  status: number;
  apiVersion: string | null;
  contentType: string | null;
  cacheControl: string | null;
  retryAfter: string | null;
  body: string;
}>;
/**
 * Implement in the native bridge, not stock Expo fetch. The port must enforce
 * the byte cap BEFORE buffering/bridging, strict UTF-8, a native deadline, no
 * redirects/cache/cookies/ambient HTTP credentials, and bounded flights. Writes
 * must not replay and the app adds no retry loop. URLSession can internally
 * retry idempotent reads; see NATIVE_TRANSPORT.md and its acceptance limits.
 * Abort must cancel the actual native task. Tests may inject a fictional port;
 * that is not native transport acceptance.
 */
export type NativeWire = (request: NativeWireRequest) => Promise<NativeWireResponse>;
export type NativeApiConfiguration = Readonly<{
  environment: "development" | "staging";
  origin: string;
}>;

const fail = () => new Error("Native request could not be confirmed.");
const sameIdentity = (a: RequestIdentity, b: RequestIdentity) => a.owner === b.owner && a.generation === b.generation;
function snapshot(source: NativeIdentitySource): NativeIdentity {
  try {
    const value = source.current();
    const identity = { owner: value.identity.owner, generation: value.identity.generation };
    if (!((typeof identity.generation === "number" && Number.isSafeInteger(identity.generation) && identity.generation >= 0) ||
      (typeof identity.generation === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(identity.generation)))) throw fail();
    if (identity.owner === null) {
      if (value.credential !== null) throw fail();
      return { identity: Object.freeze(identity), credential: null };
    }
    apiId.parse(identity.owner);
    if (value.credential?.ownerId !== identity.owner || !/^[A-Za-z0-9_-]{43}$/.test(value.credential.token)) throw fail();
    return { identity: Object.freeze(identity), credential: Object.freeze({ ...value.credential }) };
  } catch { throw fail(); }
}
function current(source: NativeIdentitySource, captured: NativeIdentity) {
  const now = snapshot(source);
  return sameIdentity(now.identity, captured.identity) && now.credential?.token === captured.credential?.token;
}
function requestUrl(origin: string, input: RequestData): URL {
  if (!input.path.startsWith("/api/platform/v1/") || input.path.length > 8192 || /[\\\s#]/.test(input.path)) throw fail();
  let url: URL;
  try {
    // Reject normalization tricks before constructing a URL. Params/cursors are
    // still parsed by their canonical contract and the authoritative server.
    for (const part of input.path.split("?")[0].split("/")) {
      const decoded = decodeURIComponent(part);
      if (decoded === "." || decoded === ".." || /[\\/\u0000-\u001f]/.test(decoded)) throw fail();
    }
    url = new URL(input.path, origin);
  } catch { throw fail(); }
  if (url.origin !== origin || url.username || url.password || url.hash) throw fail();
  const like = /^\/api\/platform\/v1\/posts\/[A-Za-z0-9_-]{1,100}\/like$/.test(url.pathname);
  // URL.search hides an empty query delimiter. This new route accepts none.
  if (like && input.path.includes("?")) throw fail();
  if (input.method === "POST") {
    if (!(like || ["/api/platform/v1/auth/password", "/api/platform/v1/session/activity", "/api/platform/v1/session/logout"].includes(url.pathname)) || url.search)
      throw fail();
  } else if (input.method !== "GET" || !(
    like ||
    ["/api/platform/v1/capabilities", "/api/platform/v1/session", "/api/platform/v1/session/activity", "/api/platform/v1/feed", "/api/platform/v1/churches"].includes(url.pathname) ||
    /^\/api\/platform\/v1\/(?:posts|profiles|churches)\/[A-Za-z0-9_-]{1,100}$/.test(url.pathname)
  )) throw fail();
  return url;
}

/** Adapter only: canonical shared-core owns attempts, schemas and error rules. */
export function createNativeRequestAdapter(
  configuration: NativeApiConfiguration,
  source: NativeIdentitySource,
  wire: NativeWire,
  now: () => number = Date.now
): RequestAdapter {
  let url: URL;
  try { url = new URL(configuration.origin); } catch { throw fail(); }
  if (!["development", "staging"].includes(configuration.environment) || url.protocol !== "https:" ||
    url.origin !== configuration.origin || url.username || url.password) throw fail();
  const origin = url.origin;
  let inFlight = 0;
  return {
    async capture(cancellation?: RequestCancellation) {
      if (cancellation?.cancelled) throw fail();
      const captured = snapshot(source);
      return {
        identity: captured.identity,
        async send(input: RequestData, cancellation?: RequestCancellation) {
          if (cancellation?.cancelled || !current(source, captured) || input.expectedOwner !== captured.identity.owner) throw fail();
          const url = requestUrl(origin, input);
          const issuance = url.pathname === "/api/platform/v1/auth/password";
          if ((issuance && captured.credential) || (input.method === "POST" && !issuance && !captured.credential)) throw fail();
          if (input.method === "GET" ? input.body !== undefined : typeof input.body !== "string") throw fail();
          const body = input.body;
          if (body !== undefined && (body.length > API_MAX_REQUEST_BYTES || new TextEncoder().encode(body).byteLength > API_MAX_REQUEST_BYTES)) throw fail();
          if (body !== undefined && url.pathname.startsWith("/api/platform/v1/session/") && new TextEncoder().encode(body).byteLength > 128) throw fail();
          if (inFlight >= 4) throw fail();
          const headers: Record<string, string> = { Accept: "application/json", "Cache-Control": "no-store", Pragma: "no-cache", "X-API-Version": API_VERSION };
          if (body !== undefined) headers["Content-Type"] = "application/json";
          if (captured.credential) {
            headers.Authorization = "Bearer " + captured.credential.token;
            headers["X-Expected-Account"] = captured.credential.ownerId;
          }
          const controller = new AbortController();
          let unsubscribe: (() => void) | undefined;
          const timer = setTimeout(() => controller.abort(), 15000);
          inFlight++;
          try {
            unsubscribe = cancellation?.subscribe(() => controller.abort());
            if (cancellation?.cancelled || controller.signal.aborted || !current(source, captured)) throw fail();
            const response = await wire(Object.freeze({
              url: url.href, method: input.method as "GET" | "POST", headers: Object.freeze(headers),
              ...(body !== undefined ? { body } : {}), maximumResponseBytes: API_MAX_RESPONSE_BYTES,
              timeoutMs: 15000, signal: controller.signal
            }));
            if (controller.signal.aborted || cancellation?.cancelled || !current(source, captured)) throw fail();
            if (response.apiVersion !== API_VERSION || !Number.isInteger(response.status) || response.status < 200 || response.status > 599 ||
              response.status >= 300 && response.status < 400 ||
              typeof response.contentType !== "string" || response.contentType.length > 128 ||
              !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.contentType) ||
              typeof response.cacheControl !== "string" || response.cacheControl.length > 256 ||
              !response.cacheControl.split(",").some(part => part.trim().toLowerCase() === "no-store") ||
              typeof response.body !== "string" || response.body.length > API_MAX_RESPONSE_BYTES ||
              new TextEncoder().encode(response.body).byteLength > API_MAX_RESPONSE_BYTES) throw fail();
            let text: string | null = response.body;
            const retryAfter = typeof response.retryAfter === "string" && /^[\x20-\x7e]{1,128}$/.test(response.retryAfter) ? response.retryAfter : null;
            return {
              status: response.status, retryAfter,
              async read() {
                try {
                  if (text === null || cancellation?.cancelled || !current(source, captured)) throw fail();
                  return JSON.parse(text) as unknown;
                } catch { throw fail(); }
                finally { text = null; }
              }
            };
          } catch { throw fail(); }
          finally {
            controller.abort(); clearTimeout(timer); inFlight--;
            try { unsubscribe?.(); } catch { /* The request is already cancelled. */ }
          }
        }
      };
    },
    async currentIdentity(cancellation?: RequestCancellation) {
      if (cancellation?.cancelled) throw fail();
      return snapshot(source).identity;
    },
    decodeFailure(value) {
      const error = apiFailure.parse(value, "strip").error;
      return { code: error.code, message: "This request could not be completed. Check your connection or current sign-in." };
    },
    // No global browser challenge event and no native privileged flow activated.
    now() {
      try {
        const value = now();
        if (!Number.isFinite(value)) throw fail();
        return value;
      } catch { throw fail(); }
    }
  };
}
