import type { PrismaClient } from "@prisma/client";
import { readBody } from "./account-boundary";
import { accountConfig } from "./account-config";
import { AccountError } from "./account-error";
import { allowWorkspaceAttempt } from "./account-limits";
import { AccountSessionOwnerError } from "./account-sessions";
import {
  API_VERSION,
  API_MAX_REQUEST_BYTES,
  API_MAX_RESPONSE_BYTES,
  apiContracts,
  apiErrorRules,
  apiFailure,
  encodeApiResponse,
  WireContractError,
  type ApiErrorCode
} from "./api-contracts";
import { NativePolicyError, requireNativeFeature } from "./native-api-policy";
import { readNativeSession } from "./native-session";
import {
  nativeRequestCredential,
  NativeRequestError,
  nativeAuthHeaders
} from "./native-session-boundary";
import { PortalError } from "./portal-policy";
import { postCommand } from "./post-commands";

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

/** Direct text publication uses the website command and its request-key receipt. */
export async function handleNativePostCreateRequest(
  db: PrismaClient,
  request: Request,
  afterCreate?: (postId: string, ownerId: string) => void
) {
  try {
    if (request.method !== "POST") {
      const result = failure(
        "method_not_allowed",
        "Use POST to publish a post."
      );
      result.headers.set("Allow", "POST");
      return result;
    }
    if (request.url.length > 8192) throw new NativeRequestError("validation");
    const credential = nativeRequestCredential(request);
    if (!credential.token) throw new NativeRequestError("unauthenticated");
    if (!credential.owner) throw new NativeRequestError("validation");
    requireNativeFeature("posts.create");
    // Admission precedes body consumption; the command repeats ownership under lock.
    await readNativeSession(db, credential.token, credential.owner);
    if (
      !(await allowWorkspaceAttempt(
        db,
        accountConfig().rateSecret + ":posts",
        credential.owner
      ))
    )
      throw new PortalError(
        429,
        "Too many changes. Keep your entries and retry in 15 minutes.",
        900
      );
    let input;
    try {
      input = apiContracts.createPost.body.parse(
        await readBody(request, API_MAX_REQUEST_BYTES)
      );
    } catch {
      throw new NativeRequestError("validation");
    }
    const data = await postCommand(
      db,
      credential.token,
      { operation: "create", ...input },
      credential.owner
    );
    // An exact retry also resumes the existing durable publication handoffs.
    afterCreate?.(data.id, credential.owner);
    let body: string;
    try {
      body = JSON.stringify(
        encodeApiResponse("createPost", {
          apiVersion: API_VERSION,
          viewerId: credential.owner,
          data
        })
      );
      if (Buffer.byteLength(body) > API_MAX_RESPONSE_BYTES) throw new Error();
    } catch {
      throw new Error("Native post receipt projection failed");
    }
    return new Response(body, {
      headers: { ...nativeAuthHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
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
        "Use the supported native publication controls."
      );
    if (error instanceof WireContractError)
      return failure("validation", "Check the requested publication fields.");
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
                  : error.status === 503
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
      "This publication could not be confirmed. Keep the original request reference and retry the same post."
    );
  }
}
