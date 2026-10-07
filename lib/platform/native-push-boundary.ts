import type { PrismaClient } from "@prisma/client";
import { accountConfig } from "./account-config";
import { readBody } from "./account-boundary";
import { allowWorkspaceAttempt } from "./account-limits";
import { AccountError } from "./account-error";
import { AccountSessionOwnerError } from "./account-sessions";
import { readNativeSession } from "./native-session";
import {
  nativeAuthHeaders,
  nativeRequestCredential,
  NativeRequestError
} from "./native-session-boundary";
import { NativePolicyError, requireNativeFeature } from "./native-api-policy";
import {
  API_VERSION,
  API_MAX_REQUEST_BYTES,
  API_MAX_RESPONSE_BYTES,
  apiFailure,
  apiErrorRules,
  WireContractError,
  type ApiErrorCode
} from "./api-contracts";
import {
  encodeNativePushResponse,
  nativePushOpenInput,
  nativePushRequiresWeb,
  type NativePushOperation
} from "./native-push-contracts";
import {
  prepareNativePush,
  registerNativePush,
  revokeNativePush,
  listNativePushDevices
} from "./native-push";
import { openNotification } from "./notification-outbox";
import { PortalError } from "./portal-policy";

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
function denied(error: unknown) {
  if (error instanceof NativePolicyError)
    return failure(error.code, error.message);
  if (error instanceof AccountSessionOwnerError)
    return failure(
      "account_changed",
      "Return to the original signed-in account before continuing."
    );
  if (error instanceof AccountError)
    return failure("unauthenticated", "Sign in again to continue.");
  if (error instanceof NativeRequestError)
    return failure(
      error.code,
      "Use the supported native notification controls."
    );
  if (error instanceof WireContractError)
    return failure(
      "validation",
      "Check the requested device fields. Keep the original request for an uncertain retry."
    );
  if (error instanceof PortalError) {
    const code: ApiErrorCode =
      error.status === 403
        ? "forbidden"
        : error.status === 404
          ? "not_found"
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
      code === "rate_limited" ? (error.retryAfter ?? 900) : null
    );
  }
  return failure(
    "unconfirmed",
    "The device result could not be confirmed. Retry with the same request reference and entries."
  );
}
function success(operation: NativePushOperation, owner: string, data: unknown) {
  let body: string;
  try {
    body = JSON.stringify(
      encodeNativePushResponse(operation, {
        apiVersion: API_VERSION,
        viewerId: owner,
        data
      })
    );
    if (Buffer.byteLength(body) > API_MAX_RESPONSE_BYTES) throw Error();
  } catch {
    throw Error("Native notification response projection failed");
  }
  return new Response(body, {
    headers: { ...nativeAuthHeaders, "Content-Type": "application/json" }
  });
}

export async function handleNativePushRequest(
  db: PrismaClient,
  request: Request,
  operation: NativePushOperation
) {
  try {
    const method = operation === "list" ? "GET" : "POST";
    if (request.method !== method) {
      const response = failure(
        "method_not_allowed",
        `Use ${method} for this notification action.`
      );
      response.headers.set("Allow", method);
      return response;
    }
    if (
      request.url.length > 8192 ||
      (method === "GET" &&
        (request.body ||
          (request.headers.has("content-length") &&
            request.headers.get("content-length") !== "0")))
    )
      throw new NativeRequestError("validation");
    const credential = nativeRequestCredential(request);
    if (!credential.token) throw new NativeRequestError("unauthenticated");
    if (!credential.owner) throw new NativeRequestError("validation");
    requireNativeFeature(`push.${operation}`);
    await readNativeSession(db, credential.token, credential.owner);
    if (method === "GET")
      return success(
        operation,
        credential.owner,
        await listNativePushDevices(db, credential.token, credential.owner)
      );
    if (
      !(await allowWorkspaceAttempt(
        db,
        accountConfig().rateSecret + ":notifications",
        credential.owner
      ))
    )
      throw new PortalError(
        429,
        "Too many changes. Keep your entries and retry in 15 minutes.",
        900
      );
    let input: unknown;
    try {
      input = await readBody(request, Math.min(API_MAX_REQUEST_BYTES, 8192));
    } catch {
      throw new NativeRequestError("validation");
    }
    const data =
      operation === "prepare"
        ? await prepareNativePush(db, credential.token, credential.owner, input)
        : operation === "register"
          ? await registerNativePush(
              db,
              credential.token,
              credential.owner,
              input
            )
          : operation === "revoke"
            ? await revokeNativePush(
                db,
                credential.token,
                credential.owner,
                input
              )
            : await openNotification(
                db,
                credential.token,
                nativePushOpenInput.parse(input).deliveryId,
                true,
                credential.owner,
                true
              );
    return success(
      operation,
      credential.owner,
      operation === "open"
        ? {
            ...data,
            requiresWeb: nativePushRequiresWeb((data as { href: string }).href)
          }
        : data
    );
  } catch (error) {
    return denied(error);
  }
}
