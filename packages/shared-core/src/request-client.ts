/** Runtime-neutral request attempts. Adapters own fetch, credentials and events. */
export type RequestIdentity = Readonly<{
  owner: string | null;
  /** A non-secret generation that changes on account or credential replacement. */
  generation: string | number;
}>;
export type RequestCancellation = {
  readonly cancelled: boolean;
  subscribe: (listener: () => void) => () => void;
};
export type RequestData = Readonly<{
  path: string;
  method: "GET" | "POST" | "DELETE";
  body?: string;
  expectedOwner?: string | null;
}>;
export type RequestResponse = {
  status: number;
  retryAfter?: string | null;
  read: () => Promise<unknown>;
};
export type RequestFailure = { message: string; code?: string };
export type RequestAdapter = {
  /** Capture one credential/identity pair. send must use that captured credential. */
  capture: (cancellation?: RequestCancellation) => Promise<{
    identity: RequestIdentity;
    send: (request: RequestData, cancellation?: RequestCancellation) => Promise<RequestResponse>;
  }>;
  currentIdentity: (cancellation?: RequestCancellation) => Promise<RequestIdentity>;
  decodeFailure: (value: unknown) => RequestFailure;
  challenge?: (value: unknown) => boolean;
  now: () => number;
};

export class RequestClientError extends Error {
  readonly status: number;
  readonly retryAfter?: number;
  readonly needsAuthenticator: boolean;
  readonly code?: string;
  readonly dispatched: boolean;
  readonly responseError: boolean;
  constructor(
    status: number,
    message: string,
    retryAfter?: number,
    needsAuthenticator = false,
    code?: string,
    dispatched = false,
    responseError = false
  ) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
    this.needsAuthenticator = needsAuthenticator;
    this.code = code;
    this.dispatched = dispatched;
    this.responseError = responseError;
  }
}

const unconfirmed = (dispatched: boolean) => new RequestClientError(
  503, "This action could not be confirmed. Your entries are unchanged.",
  undefined, false, "unconfirmed", dispatched
);
const accountChanged = (dispatched: boolean) => new RequestClientError(
  401, "Your sign-in changed. Reload before continuing.",
  undefined, false, "account_changed", dispatched
);
const cancelled = (dispatched: boolean) => new RequestClientError(
  499, dispatched
    ? "The request was interrupted. Confirm the original request before another change."
    : "The request was cancelled before it was sent.",
  undefined, false, "cancelled", dispatched
);
const sameIdentity = (a: RequestIdentity, b: RequestIdentity) =>
  a.owner === b.owner && a.generation === b.generation;
const validIdentity = (identity: RequestIdentity) => identity &&
  (identity.owner === null || (typeof identity.owner === "string" && identity.owner.length > 0 && identity.owner.length <= 100)) &&
  ((typeof identity.generation === "number" && Number.isSafeInteger(identity.generation) && identity.generation >= 0) ||
    (typeof identity.generation === "string" && identity.generation.length > 0 && identity.generation.length <= 128));

/** Seconds and IMF-fixdate are hints for explicit recovery, never automatic replay. */
export function retryAfterSeconds(value: string | null | undefined, now: number): number | undefined {
  if (!value) return undefined;
  const text = value.trim();
  const seconds = /^\d+$/.test(text) ? Number(text)
    : /^[A-Za-z]{3}, .+ GMT$/.test(text) ? Math.max(0, Math.ceil((Date.parse(text) - now) / 1000)) : NaN;
  return Number.isSafeInteger(seconds) && seconds >= 0 && seconds <= 86400 ? seconds : undefined;
}

export type PreparedRequest<T> = {
  /** Original path/body/actor stay immutable across explicit attempts. No token is exposed. */
  readonly request: RequestData;
  run: (options?: RequestRunOptions) => Promise<{ owner: string | null; data: T }>;
};
export type RequestRunOptions = { cancellation?: RequestCancellation; onDispatch?: () => void };

export function prepareRequest<T>(
  adapter: RequestAdapter,
  input: RequestData & {
    decode: (value: unknown, identity: RequestIdentity) => T;
    /** Enable only for an endpoint with a reviewed original-key replay contract. */
    idempotent?: boolean;
  }
): PreparedRequest<T> {
  let safePath = input.path.startsWith("/api/platform/") && input.path.length <= 8192 && !/[\\\s#]/.test(input.path);
  try {
    for (const part of input.path.split("?")[0].split("/")) {
      const decoded = decodeURIComponent(part);
      if (decoded === "." || decoded === ".." || /[\\/\u0000-\u001f]/.test(decoded)) safePath = false;
    }
  } catch { safePath = false; }
  const write = input.method !== "GET";
  if (!safePath || !["GET", "POST", "DELETE"].includes(input.method) ||
      (input.body !== undefined && (typeof input.body !== "string" || input.body.length > 1024 * 1024)) ||
      (write ? !input.body : input.body !== undefined)) {
    throw new RequestClientError(400, "Use a supported request with bounded entries.", undefined, false, "validation");
  }
  if (write && input.idempotent) {
    let key: unknown;
    try { key = JSON.parse(input.body!).mutationId; } catch { /* Invalid JSON has no stable key. */ }
    if (typeof key !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(key))
      throw new RequestClientError(400, "Keep the original mutation reference for this request.", undefined, false, "validation");
  }
  const request: RequestData = Object.freeze({
    path: input.path, method: input.method,
    ...(input.body !== undefined ? { body: input.body } : {}),
    ...(input.expectedOwner !== undefined ? { expectedOwner: input.expectedOwner } : {})
  });
  // Capture callbacks/policy too; changing the caller's input cannot rebind a retry.
  const decode = input.decode, idempotent = input.idempotent === true;
  let original: RequestIdentity | undefined, attempts = 0, busy = false;
  return Object.freeze({
    request,
    async run({ cancellation, onDispatch }: RequestRunOptions = {}) {
      if (busy) throw new RequestClientError(409, "Wait for the original request to finish.", undefined, false, "in_progress");
      if (write && attempts && !idempotent)
        throw new RequestClientError(409, "Reconcile the original request before another change.", undefined, false, "recovery_required");
      busy = true;
      let dispatched = false;
      let confirmedRejection: RequestClientError | undefined;
      try {
        if (cancellation?.cancelled) throw cancelled(false);
        const context = await adapter.capture(cancellation);
        if (cancellation?.cancelled) throw cancelled(false);
        if (!validIdentity(context.identity)) throw unconfirmed(false);
        if ((request.expectedOwner !== undefined && context.identity.owner !== request.expectedOwner) ||
            (write && !context.identity.owner) || (original && !sameIdentity(original, context.identity)))
          throw accountChanged(false);
        original ??= Object.freeze({ ...context.identity });
        onDispatch?.();
        if (cancellation?.cancelled) throw cancelled(false);
        dispatched = true;
        attempts++;
        const response = await context.send(request, cancellation);
        let value: unknown, malformed = false;
        try { value = await response.read(); } catch { malformed = true; }
        // Check identity even for a malformed reply. Never expose data or a
        // challenge from another actor or from an earlier credential generation.
        if (cancellation?.cancelled) throw cancelled(true);
        const after = await adapter.currentIdentity(cancellation);
        if (!validIdentity(after) || !sameIdentity(original, after)) throw accountChanged(true);
        if (cancellation?.cancelled) throw cancelled(true);
        if (malformed || !Number.isInteger(response.status) || response.status < 200 || response.status > 599)
          throw unconfirmed(true);
        if (response.status >= 300) {
          let failure: RequestFailure;
          try { failure = adapter.decodeFailure(value); } catch { throw unconfirmed(true); }
          if (!failure || typeof failure.message !== "string" || !failure.message.length || failure.message.length > 1000 ||
              (failure.code !== undefined && (typeof failure.code !== "string" || failure.code.length > 80))) throw unconfirmed(true);
          const challenge = response.status === 403 && !!adapter.challenge?.(value);
          confirmedRejection = new RequestClientError(response.status, failure.message,
            [429, 503].includes(response.status) ? retryAfterSeconds(response.retryAfter, adapter.now()) : undefined,
            challenge, failure.code, true, true);
          throw confirmedRejection;
        }
        let data: T;
        try { data = decode(value, original); } catch { throw unconfirmed(true); }
        return { owner: original.owner, data };
      } catch (error) {
        if (cancellation?.cancelled) throw cancelled(dispatched);
        // Identity adapters may fail after a command committed. Their status is
        // not a confirmed command rejection and must not discard its original.
        if (error instanceof RequestClientError)
          throw new RequestClientError(error.status, error.message, error.retryAfter,
            error === confirmedRejection && error.needsAuthenticator, error.code,
            dispatched, error === confirmedRejection);
        // Transport errors may contain URLs, credentials or response fragments.
        // The portable boundary never forwards their arbitrary diagnostic text.
        throw unconfirmed(dispatched);
      } finally { busy = false; }
    }
  });
}
