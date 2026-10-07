import type { PrismaClient } from "@prisma/client";
import { accountConfig, accountOrigin } from "./account-config";
import { isAccountSessionCookieName } from "./account-cookies";
import { readBody } from "./account-boundary";
import { AccountError } from "./account-error";
import { allowAccountAttempt } from "./account-limits";
import { loginAccount, normalizeEmail } from "./accounts";
import {
  AccountSessionOwnerError,
  revokeCurrentAccountSession
} from "./account-sessions";
import {
  readAccountSessionActivity,
  recordAccountSessionActivity
} from "./account-session-activity";
import { PortalError } from "./portal-policy";
import {
  privilegedAuthenticatorCommand,
  readPrivilegedAuthentication
} from "./privileged-auth";
import { readNativeSession } from "./native-session";
import {
  API_VERSION,
  API_MAX_REQUEST_BYTES,
  WireContractError,
  apiErrorRules,
  apiFailure,
  apiId,
  type ApiErrorCode
} from "./api-contracts";
import {
  nativeActivityInput,
  nativeAuthenticatorInput,
  nativeEmptyInput,
  nativePasswordInput,
  encodeNativeResponse,
  type NativeResponseOperation
} from "./native-auth-contracts";

export const nativeAuthHeaders = {
  "Cache-Control": "private, no-store",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Authorization, Cookie, X-Expected-Account"
};
export class NativeRequestError extends Error {
  readonly code: ApiErrorCode;
  constructor(code: ApiErrorCode) {
    super(code);
    this.code = code;
  }
}

/** Explicit native-only transport. Browser requests retain their existing boundary. */
export function nativeRequestCredential(
  request: Request,
  allowedQuery: readonly string[] = []
) {
  const url = new URL(request.url);
  const configured = accountOrigin();
  // Next's Node adapter can construct request.url with its internal listen port
  // behind TLS termination. Check the received Host, not x-forwarded-host;
  // direct Request callers without Host still use their actual URL host.
  const host = request.headers.get("host") ?? url.host;
  if (
    host.toLowerCase() !== configured.host ||
    url.protocol !== configured.protocol ||
    url.username ||
    url.password ||
    request.headers.has("origin") ||
    [...request.headers.keys()].some((k) => k.startsWith("sec-fetch-"))
  )
    throw new NativeRequestError("forbidden");
  if (
    url.hash ||
    [...url.searchParams.keys()].some((key) => !allowedQuery.includes(key)) ||
    [...new Set(url.searchParams.keys())].some(
      (key) => url.searchParams.getAll(key).length !== 1
    )
  )
    throw new NativeRequestError("validation");
  if (
    (request.headers.get("cookie") ?? "")
      .split(";")
      .some((entry) =>
        isAccountSessionCookieName(entry.trim().split("=", 1)[0].trim())
      )
  )
    throw new NativeRequestError("unauthenticated");
  const raw = request.headers.get("authorization");
  if (raw !== null && !/^Bearer [A-Za-z0-9_-]{43}$/.test(raw))
    throw new NativeRequestError("unauthenticated");
  const owner = request.headers.get("x-expected-account");
  if (owner !== null) apiId.parse(owner);
  if (owner !== null && raw === null)
    throw new NativeRequestError("unauthenticated");
  return { token: raw?.slice(7), owner: owner ?? undefined };
}
function member(credential: ReturnType<typeof nativeRequestCredential>) {
  if (!credential.token) throw new NativeRequestError("unauthenticated");
  if (!credential.owner) throw new NativeRequestError("validation");
  return { token: credential.token, owner: credential.owner };
}
function success(
  operation: NativeResponseOperation,
  viewerId: string | null,
  data: unknown
) {
  // Serialization errors are server failures, never client input errors.
  let body;
  try {
    body = encodeNativeResponse(operation, {
      apiVersion: API_VERSION,
      viewerId,
      data
    });
  } catch {
    throw new Error("Native response projection failed");
  }
  return Response.json(body, { headers: nativeAuthHeaders });
}
function failure(
  code: ApiErrorCode,
  message: string,
  retryAfterSeconds: number | null = null
) {
  return Response.json(
    apiFailure.parse({
      apiVersion: API_VERSION,
      error: { code, message, retryAfterSeconds }
    }),
    {
      status: apiErrorRules[code].status,
      headers: {
        ...nativeAuthHeaders,
        ...(retryAfterSeconds
          ? { "Retry-After": String(retryAfterSeconds) }
          : {})
      }
    }
  );
}
function denied(error: unknown, operation: Operation) {
  if (error instanceof AccountSessionOwnerError)
    return failure(
      "account_changed",
      "Return to the original signed-in account before continuing."
    );
  if (error instanceof NativeRequestError)
    return failure(
      error.code,
      error.code === "unauthenticated"
        ? "Sign in again to continue."
        : "Use the supported native account controls."
    );
  if (error instanceof AccountError)
    if (error.code === "credentials" && operation === "authenticator")
      return failure(
        "validation",
        "Confirm your current password and try again."
      );
    else
      return failure(
        error.code === "session" || error.code === "credentials"
          ? "unauthenticated"
          : "validation",
        error.code === "credentials"
          ? "The email or password could not be confirmed."
          : "Your sign-in could not be confirmed."
      );
  if (error instanceof SyntaxError || error instanceof WireContractError)
    return failure("validation", "Use the supported native account fields.");
  if (error instanceof PortalError) {
    const code: ApiErrorCode =
      error.status === 401
        ? "unauthenticated"
        : error.status === 403
          ? "forbidden"
          : error.status === 409
            ? "conflict"
            : error.status === 429
              ? "rate_limited"
              : error.status === 503
                ? "feature_unavailable"
                : "validation";
    return failure(
      code,
      error.message,
      code === "rate_limited"
        ? Math.min(86400, Math.max(1, error.retryAfter ?? 900))
        : null
    );
  }
  // No exception/request logging: credentials and unexpected database state stay private.
  return failure(
    "unconfirmed",
    "The result could not be confirmed. Reconnect and check your current account state."
  );
}
type Operation =
  | "password"
  | "session"
  | "activity"
  | "logout"
  | "authenticator";
export async function handleNativeSessionRequest(
  db: PrismaClient,
  request: Request,
  operation: Operation,
  afterNotice?: (userId: string) => void
) {
  try {
    const credential = nativeRequestCredential(request);
    const methods =
      operation === "session"
        ? ["GET"]
        : operation === "activity" || operation === "authenticator"
          ? ["GET", "POST"]
          : ["POST"];
    if (!methods.includes(request.method)) {
      const result = failure(
        "method_not_allowed",
        "Use the supported account request method."
      );
      return new Response(result.body, {
        status: 405,
        headers: {
          ...nativeAuthHeaders,
          "Content-Type": "application/json",
          Allow: methods.join(", ")
        }
      });
    }
    if (operation === "password") {
      if (credential.token || credential.owner)
        throw new NativeRequestError("validation");
      const input = nativePasswordInput.parse(
        await readBody(request, API_MAX_REQUEST_BYTES)
      );
      const config = accountConfig();
      const ip = process.env.VERCEL
        ? (request.headers.get("x-real-ip") ?? "unknown").slice(0, 64)
        : "local";
      if (
        !(await allowAccountAttempt(
          db,
          config.rateSecret,
          "login",
          ip,
          normalizeEmail(input.email) ?? "anonymous"
        ))
      )
        return failure(
          "rate_limited",
          "Too many sign-in attempts. Try again in fifteen minutes.",
          900
        );
      const token = await loginAccount(
        db,
        input.email,
        input.password,
        request.headers.get("user-agent")
      );
      const session = await readNativeSession(db, token);
      const activity = await readAccountSessionActivity(
        db,
        token,
        session.account.id
      );
      return success("password", session.account.id, {
        tokenType: "Bearer",
        token,
        session,
        activity
      });
    }
    if (operation === "session") {
      if (!credential.token)
        return success("session", null, { state: "guest", account: null });
      const session = await readNativeSession(
        db,
        credential.token,
        credential.owner
      );
      return success("session", session.account.id, session);
    }
    const { token, owner } = member(credential);
    if (operation === "activity") {
      if (request.method === "GET")
        return success(
          "activity",
          owner,
          await readAccountSessionActivity(db, token, owner)
        );
      nativeActivityInput.parse(await readBody(request, 128));
      return success(
        "activity",
        owner,
        await recordAccountSessionActivity(db, token, owner)
      );
    }
    if (operation === "logout") {
      nativeEmptyInput.parse(await readBody(request, 128));
      const result = await revokeCurrentAccountSession(db, token, owner);
      return success("logout", result.ownerId, { ...result, signedOut: true });
    }
    if (request.method === "GET") {
      const state = await readPrivilegedAuthentication(db, token, owner);
      return success("authenticator", state.ownerId, {
        ownerId: state.ownerId,
        eligible: state.eligible,
        hasDuties: state.hasDuties,
        mode: state.mode,
        available: state.available,
        googleRecentAuthentication: false,
        factor: state.factor,
        confirmedForWork: state.confirmedForWork,
        notices: state.notices
      });
    }
    const input = nativeAuthenticatorInput.parse(
      await readBody(request, API_MAX_REQUEST_BYTES)
    );
    const result = await privilegedAuthenticatorCommand(
      db,
      token,
      input,
      "currentPassword" in input ? input.currentPassword : undefined,
      owner
    );
    const response = success("authenticatorCommand", owner, {
      version: result.version,
      message: result.message,
      enrollment:
        "secret" in result
          ? { secret: result.secret, expiresAt: result.expiresAt }
          : null,
      recoveryCodes: "recoveryCodes" in result ? result.recoveryCodes : null
    });
    try {
      afterNotice?.(owner);
    } catch {
      throw new Error("Native security notice scheduling was not confirmed");
    }
    return response;
  } catch (error) {
    return denied(error, operation);
  }
}
