import type { PrismaClient } from "@prisma/client";
import { accountConfig } from "./account-config";
import { readBody } from "./account-boundary";
import { AccountError } from "./account-error";
import { allowWorkspaceAttempt } from "./account-limits";
import { AccountSessionOwnerError } from "./account-sessions";
import { readNativeSession } from "./native-session";
import { readPostLike, postLikeCommand } from "./post-likes";
import {
  readReactionPreferences,
  saveReactionPreferences
} from "./reaction-preferences";
import { PortalError } from "./portal-policy";
import {
  API_VERSION,
  API_MAX_REQUEST_BYTES,
  API_MAX_RESPONSE_BYTES,
  apiContracts,
  apiId,
  apiFailure,
  apiErrorRules,
  encodeApiResponse,
  WireContractError,
  type ApiErrorCode
} from "./api-contracts";
import {
  nativeAuthHeaders,
  nativeRequestCredential,
  NativeRequestError
} from "./native-session-boundary";
import { requireNativeFeature, NativePolicyError } from "./native-api-policy";

export type NativeReactionResource = "like" | "reactionPreferences";
type Operation = NativeReactionResource | "setLike" | "setReactionPreferences";
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
  if (error instanceof NativeRequestError)
    return failure(
      error.code,
      "Use the supported native reaction controls. Keep your unsent changes."
    );
  if (error instanceof WireContractError)
    return failure("validation", "Check the requested reaction fields.");
  if (error instanceof AccountError)
    return failure("unauthenticated", "Sign in again to continue.");
  if (error instanceof PortalError) {
    const code: ApiErrorCode =
      error.status === 401
        ? "unauthenticated"
        : error.status === 403
          ? "forbidden"
          : error.status === 404
            ? "not_found"
            : error.status === 409
              ? "conflict"
              : error.status === 429
                ? "rate_limited"
                : // A recovery write may already have committed. Preserve the exact retry.
                  error.status === 503
                  ? "unconfirmed"
                  : "validation";
    return failure(
      code,
      error.message,
      code === "rate_limited"
        ? Math.min(86400, Math.max(1, error.retryAfter ?? 60))
        : null
    );
  }
  return failure(
    "unconfirmed",
    "This result could not be confirmed. Keep your changes and retry with the same request reference."
  );
}
function success(operation: Operation, viewerId: string | null, data: unknown) {
  try {
    const body = JSON.stringify(
      encodeApiResponse(operation, { apiVersion: API_VERSION, viewerId, data })
    );
    if (Buffer.byteLength(body) > API_MAX_RESPONSE_BYTES) throw new Error();
    return new Response(body, {
      headers: { ...nativeAuthHeaders, "Content-Type": "application/json" }
    });
  } catch {
    throw new Error("Native reaction response projection failed");
  }
}

/** Native transport only; permission, version and operation receipts remain canonical. */
export async function handleNativeReactionRequest(
  db: PrismaClient,
  request: Request,
  resource: NativeReactionResource,
  params: unknown = {},
  afterLike?: (postId: string) => void
) {
  try {
    if (request.method !== "GET" && request.method !== "POST") {
      const response = failure(
        "method_not_allowed",
        "Use GET to read or POST to save a reaction choice."
      );
      response.headers.set("Allow", "GET, POST");
      return response;
    }
    const write = request.method === "POST";
    if (
      request.url.length > 8192 ||
      (!write &&
        (request.body ||
          (request.headers.has("content-length") &&
            request.headers.get("content-length") !== "0")))
    )
      throw new NativeRequestError("validation");
    const credential = nativeRequestCredential(request);
    if (credential.token && !credential.owner)
      throw new NativeRequestError("validation");
    if ((write || resource === "reactionPreferences") && !credential.token)
      throw new NativeRequestError("unauthenticated");
    const operation: Operation =
      resource === "like"
        ? write
          ? "setLike"
          : "like"
        : write
          ? "setReactionPreferences"
          : "reactionPreferences";
    const parsed = apiContracts[operation].params.parse(params);
    const postId =
      resource === "like"
        ? apiId.parse((parsed as { postId: unknown }).postId)
        : null;
    requireNativeFeature(
      resource === "like"
        ? write
          ? "likes.write"
          : "likes.read"
        : write
          ? "reactionPreferences.write"
          : "reactionPreferences.read"
    );
    const owner = credential.owner ?? null;
    if (!write && resource === "like") {
      const data = await readPostLike(db, credential.token, postId, {
        expectedOwner: owner,
        credentialSupplied: credential.token !== undefined
      });
      return success(operation, owner, data);
    }
    // Early identity verification also precedes rate charges/body consumption.
    // Each canonical command checks ownership again under its own session lock.
    await readNativeSession(db, credential.token!, credential.owner);
    if (!write)
      return success(
        operation,
        owner,
        await readReactionPreferences(db, credential.token, credential.owner!)
      );
    const domain =
      resource === "like" ? "post-likes" : "reaction-count-preferences";
    if (
      !(await allowWorkspaceAttempt(
        db,
        accountConfig().rateSecret + ":" + domain,
        credential.owner!
      ))
    )
      throw new PortalError(
        429,
        "Too many changes. Keep your entries and retry in 15 minutes.",
        900
      );
    let input;
    try {
      input = apiContracts[operation].body.parse(
        await readBody(request, Math.min(API_MAX_REQUEST_BYTES, 32768))
      );
    } catch {
      throw new NativeRequestError("validation");
    }
    if (resource === "like") {
      const data = await postLikeCommand(
        db,
        credential.token,
        { ...input, postId },
        credential.owner
      );
      // Route supplies the same durable notification drain as the website.
      afterLike?.(data.id);
      return success(operation, owner, data);
    }
    return success(
      operation,
      owner,
      await saveReactionPreferences(
        db,
        credential.token,
        input,
        credential.owner!
      )
    );
  } catch (error) {
    return denied(error);
  }
}
