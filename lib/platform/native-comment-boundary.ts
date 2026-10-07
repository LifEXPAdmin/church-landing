import type { PrismaClient } from "@prisma/client";
import { accountConfig } from "./account-config";
import { readBody } from "./account-boundary";
import { allowWorkspaceAttempt } from "./account-limits";
import { readNativeSession } from "./native-session";
import { commentCommand } from "./comment-commands";
import {
  API_VERSION,
  API_MAX_REQUEST_BYTES,
  API_MAX_RESPONSE_BYTES,
  apiContracts,
  apiErrorRules,
  apiFailure,
  encodeApiResponse,
  WireContractError,
  wire,
  type ApiErrorCode
} from "./api-contracts";
import { AccountError } from "./account-error";
import { AccountSessionOwnerError } from "./account-sessions";
import { readComments } from "./comment-reads";
import { nativeCommentThread } from "./native-comment-projections";
import { nativeReadCursors, NativeCursorError } from "./native-read-cursors";
import { NativePolicyError, requireNativeFeature } from "./native-api-policy";
import {
  nativeRequestCredential,
  NativeRequestError,
  nativeAuthHeaders
} from "./native-session-boundary";
import { PortalError } from "./portal-policy";

const canonicalCursor = wire.text(600, 1, /^[A-Za-z0-9_.-]+$/);
const queryKeys = ["view", "sort", "rootId", "commentId", "cursor"];
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
function denied(error: unknown, writing = false) {
  if (error instanceof NativePolicyError)
    return failure(error.code, error.message);
  if (error instanceof AccountSessionOwnerError)
    return failure(
      "account_changed",
      "Return to the original signed-in account before continuing."
    );
  if (error instanceof NativeCursorError)
    return failure("cursor_invalid", error.message);
  if (error instanceof NativeRequestError)
    return failure(
      error.code,
      "Use the supported native conversation controls."
    );
  if (error instanceof WireContractError)
    return failure("validation", "Check the requested conversation fields.");
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
                  ? writing
                    ? "unconfirmed"
                    : "feature_unavailable"
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
    writing
      ? "This change could not be confirmed. Keep the original request reference and retry the same change."
      : "This conversation could not be confirmed. Reconnect and try again."
  );
}

const commentWrites = {
  createComment: {
    command: "create",
    feature: "comments.create",
    methodMessage: "Use POST to publish a comment."
  },
  editComment: {
    command: "edit",
    feature: "comments.edit",
    methodMessage: "Use POST to edit a comment."
  },
  setCommentLike: {
    command: "like",
    feature: "commentLikes.write",
    methodMessage: "Use POST to change a comment Like."
  }
} as const;

/** Writes share admission, original-owner and uncertain-receipt boundaries. */
async function handleNativeCommentWriteRequest(
  db: PrismaClient,
  request: Request,
  params: unknown,
  operation: keyof typeof commentWrites,
  afterWrite?: (commentId: string) => void
) {
  try {
    const policy = commentWrites[operation];
    const contract = apiContracts[operation];
    if (request.method !== "POST") {
      const result = failure("method_not_allowed", policy.methodMessage);
      result.headers.set("Allow", "POST");
      return result;
    }
    if (request.url.length > 8192) throw new NativeRequestError("validation");
    const credential = nativeRequestCredential(request);
    if (!credential.token) throw new NativeRequestError("unauthenticated");
    if (!credential.owner) throw new NativeRequestError("validation");
    requireNativeFeature(policy.feature);
    const target = contract.params.parse(params) as {
      postId: string;
      commentId?: string;
    };
    // Check before charging/consuming input and again under the canonical lock.
    await readNativeSession(db, credential.token, credential.owner);
    if (
      !(await allowWorkspaceAttempt(
        db,
        accountConfig().rateSecret + ":comments",
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
      input = contract.body.parse(
        await readBody(request, Math.min(API_MAX_REQUEST_BYTES, 16384))
      );
    } catch {
      throw new NativeRequestError("validation");
    }
    const data = await commentCommand(
      db,
      credential.token,
      { operation: policy.command, ...input, ...target },
      credential.owner
    );
    // The route schedules the existing durable outbox, including exact retries.
    afterWrite?.(data.id);
    let body: string;
    try {
      body = JSON.stringify(
        encodeApiResponse(operation, {
          apiVersion: API_VERSION,
          viewerId: credential.owner,
          data
        })
      );
      if (Buffer.byteLength(body) > API_MAX_RESPONSE_BYTES) throw new Error();
    } catch {
      throw new Error("Native comment receipt projection failed");
    }
    return new Response(body, {
      headers: { ...nativeAuthHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    return denied(error, true);
  }
}

/** Direct publication has no implicit private draft or secondary comment store. */
export function handleNativeCommentCreateRequest(
  db: PrismaClient,
  request: Request,
  params: unknown,
  afterCreate?: (commentId: string) => void
) {
  return handleNativeCommentWriteRequest(
    db,
    request,
    params,
    "createComment",
    afterCreate
  );
}

/** Corrections preserve the canonical author, audience and immutable receipt. */
export function handleNativeCommentEditRequest(
  db: PrismaClient,
  request: Request,
  params: unknown,
  afterEdit?: (commentId: string) => void
) {
  return handleNativeCommentWriteRequest(
    db,
    request,
    params,
    "editComment",
    afterEdit
  );
}

/** The receipt is historical; read the thread again for current state and access. */
export function handleNativeCommentLikeRequest(
  db: PrismaClient,
  request: Request,
  params: unknown,
  afterLike?: (commentId: string) => void
) {
  return handleNativeCommentWriteRequest(
    db,
    request,
    params,
    "setCommentLike",
    afterLike
  );
}

/** Read transport only. Canonical web and native callers share one locked reader. */
export async function handleNativeCommentReadRequest(
  db: PrismaClient,
  request: Request,
  params: unknown
) {
  try {
    if (request.method !== "GET") {
      const result = failure("method_not_allowed", "Use GET for this reading.");
      result.headers.set("Allow", "GET");
      return result;
    }
    if (
      request.url.length > 8192 ||
      request.body ||
      (request.headers.has("content-length") &&
        request.headers.get("content-length") !== "0")
    )
      throw new NativeRequestError("validation");
    const credential = nativeRequestCredential(request, queryKeys);
    if (credential.token && !credential.owner)
      throw new NativeRequestError("validation");
    requireNativeFeature("comments.read");
    const { postId } = apiContracts.comments.params.parse(params) as {
      postId: string;
    };
    const search = new URL(request.url).searchParams;
    const query = apiContracts.comments.query.parse({
      view: search.get("view") ?? "roots",
      sort: search.get("sort") ?? "oldest",
      rootId: search.get("rootId"),
      commentId: search.get("commentId"),
      cursor: search.get("cursor")
    });
    const viewer = credential.owner ?? null;
    const cursors = nativeReadCursors(
      [
        "comments",
        viewer,
        postId,
        query.view,
        query.sort,
        query.rootId,
        query.commentId
      ],
      canonicalCursor
    );
    const prior = cursors.decode(query.cursor);
    const view = await readComments(
      db,
      credential.token,
      {
        postId,
        view: query.view,
        sort: query.sort,
        rootId: query.rootId,
        commentId: query.commentId,
        after: prior?.value
      },
      undefined,
      {
        expectedOwner: viewer,
        credentialSupplied: credential.token !== undefined
      }
    );
    if (view.kind !== "thread")
      throw new Error("Native thread view unavailable");
    const nextCursor = view.nextCursor
      ? cursors.encode(view.nextCursor, prior?.expires)
      : null;
    let body: string;
    try {
      body = JSON.stringify(
        encodeApiResponse("comments", {
          apiVersion: API_VERSION,
          viewerId: view.viewerId,
          data: nativeCommentThread(view, nextCursor)
        })
      );
      if (Buffer.byteLength(body) > API_MAX_RESPONSE_BYTES) throw new Error();
    } catch {
      throw new Error("Native conversation response projection failed");
    }
    return new Response(body, {
      headers: { ...nativeAuthHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    return denied(error);
  }
}
