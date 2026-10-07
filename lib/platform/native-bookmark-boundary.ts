import type { PrismaClient } from "@prisma/client";
import { accountConfig } from "./account-config";
import { readBody } from "./account-boundary";
import { AccountError } from "./account-error";
import { allowWorkspaceAttempt } from "./account-limits";
import { AccountSessionOwnerError } from "./account-sessions";
import { readNativeSession } from "./native-session";
import { postWorkspaceCommand, readPostWorkspace } from "./post-workspace";
import { PortalError } from "./portal-policy";
import {
  API_VERSION,
  API_MAX_REQUEST_BYTES,
  API_MAX_RESPONSE_BYTES,
  apiContracts,
  apiFailure,
  apiErrorRules,
  encodeApiResponse,
  wire,
  WireContractError,
  type ApiErrorCode
} from "./api-contracts";
import {
  nativeAuthHeaders,
  nativeRequestCredential,
  NativeRequestError
} from "./native-session-boundary";
import { nativeReadCursors, NativeCursorError } from "./native-read-cursors";
import { requireNativeFeature, NativePolicyError } from "./native-api-policy";

export type NativeBookmarkResource =
  | "bookmarks"
  | "bookmarkCollections"
  | "bookmarkStatus";
type Operation =
  | NativeBookmarkResource
  | "bookmarkCommand"
  | "bookmarkCollectionCommand";
const cursorKey = wire.text(80, 1, /^[A-Za-z0-9_-]+$/);

function failure(
  code: ApiErrorCode,
  message: string,
  retry: number | null = null
) {
  return Response.json(
    apiFailure.parse({
      apiVersion: API_VERSION,
      error: { code, message, retryAfterSeconds: retry }
    }),
    {
      status: apiErrorRules[code].status,
      headers: {
        ...nativeAuthHeaders,
        ...(retry ? { "Retry-After": String(retry) } : {})
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
  if (error instanceof NativeCursorError)
    return failure(
      "cursor_invalid",
      "Reopen your saved list from its first page."
    );
  if (error instanceof NativeRequestError)
    return failure(error.code, "Use the supported native bookmark controls.");
  if (error instanceof WireContractError)
    return failure("validation", "Check the requested bookmark fields.");
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
    "This result could not be confirmed. Retry with the same request reference and entries."
  );
}
function success(operation: Operation, viewerId: string, data: unknown) {
  try {
    const body = JSON.stringify(
      encodeApiResponse(operation, {
        apiVersion: API_VERSION,
        viewerId,
        data
      })
    );
    if (Buffer.byteLength(body) > API_MAX_RESPONSE_BYTES) throw new Error();
    return new Response(body, {
      headers: { ...nativeAuthHeaders, "Content-Type": "application/json" }
    });
  } catch {
    throw new Error("Native bookmark response projection failed");
  }
}

/** Transport and bounded projection only. The website service owns saved state. */
export async function handleNativeBookmarkRequest(
  db: PrismaClient,
  request: Request,
  resource: NativeBookmarkResource,
  params: unknown = {}
) {
  try {
    const writable = resource !== "bookmarkStatus";
    const write = request.method === "POST" && writable;
    if (request.method !== "GET" && !write) {
      const response = failure(
        "method_not_allowed",
        "Use the supported bookmark request method."
      );
      response.headers.set(
        "Allow",
        writable ? "GET, POST" : "GET"
      );
      return response;
    }
    if (
      request.url.length > 8192 ||
      (!write &&
        (request.body ||
          (request.headers.has("content-length") &&
            request.headers.get("content-length") !== "0")))
    )
      throw new NativeRequestError("validation");
    const credential = nativeRequestCredential(
      request,
      write || resource === "bookmarkStatus"
        ? []
        : resource === "bookmarks"
          ? ["cursor", "collectionId"]
          : ["cursor"]
    );
    if (!credential.token) throw new NativeRequestError("unauthenticated");
    if (!credential.owner) throw new NativeRequestError("validation");
    const command =
      resource === "bookmarks"
        ? "bookmarkCommand"
        : "bookmarkCollectionCommand";
    const operation: Operation = write ? command : resource;
    const parsedParams = apiContracts[operation].params.parse(params);
    requireNativeFeature(write ? "bookmarks.write" : "bookmarks.read");
    // Owner verification precedes cursor decoding, rate charges and body reads.
    // The canonical service checks it again inside its permission/session lock.
    await readNativeSession(db, credential.token, credential.owner);
    const { token, owner } = credential;
    if (write) {
      // Share the website's actual bucket. Do not give each transport a new quota.
      if (!(await allowWorkspaceAttempt(db, accountConfig().rateSecret, owner)))
        throw new PortalError(
          429,
          "Too many saves. Keep your entries and retry in 15 minutes.",
          900
        );
      let input;
      try {
        input = apiContracts[command].body.parse(
          await readBody(request, API_MAX_REQUEST_BYTES)
        );
      } catch {
        throw new NativeRequestError("validation");
      }
      // Keep original post/item references and fields in the canonical fingerprint.
      const receipt = await postWorkspaceCommand(db, token, input, owner);
      return success(operation, owner, {
        id: receipt.id,
        version: receipt.version,
        message: receipt.message
      });
    }
    if (resource === "bookmarkStatus") {
      const { postId } = parsedParams as { postId: string };
      const data = await readPostWorkspace(
        db,
        token,
        { view: "saved-status", postId },
        owner
      );
      if (!("item" in data)) throw new Error("Bookmark status unavailable");
      const item = data.item;
      return success(operation, owner, {
        item: item
          ? {
              id: item.id,
              version: item.version,
              collectionId: item.collectionId
            }
          : null
      });
    }
    const query = new URL(request.url).searchParams;
    const parsed =
      resource === "bookmarks"
        ? apiContracts.bookmarks.query.parse({
            cursor: query.get("cursor"),
            collectionId: query.get("collectionId")
          })
        : {
            ...apiContracts.bookmarkCollections.query.parse({
              cursor: query.get("cursor")
            }),
            collectionId: null
          };
    const { collectionId } = parsed;
    const cursors = nativeReadCursors(
      [resource, owner, collectionId],
      cursorKey
    );
    const prior = cursors.decode(parsed.cursor);
    const data = await readPostWorkspace(
      db,
      token,
      {
        view: resource === "bookmarks" ? "saved" : "collections",
        collectionId,
        after: prior?.value
      },
      owner
    );
    if (!("items" in data)) throw new Error("Bookmark page unavailable");
    const nextCursor = data.nextCursor
      ? cursors.encode(data.nextCursor, prior?.expires)
      : null;
    const items = data.items.map((row) => {
      if (resource === "bookmarkCollections") {
        if (!("name" in row))
          throw new Error("Bookmark collection unavailable");
        return {
          id: row.id,
          name: row.name,
          version: row.version,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString()
        };
      }
      if (!("available" in row)) throw new Error("Bookmark unavailable");
      const base = {
        id: row.id,
        version: row.version,
        collectionId: row.collectionId
      };
      if (!row.available) return { ...base, available: false };
      if (row.post) {
        const post = row.post;
        return {
          ...base,
          available: true,
          post: {
            id: post.id,
            excerpt: post.excerpt,
            contentNote: post.contentNote,
            type: post.type,
            publishedAt: post.publishedAt?.toISOString() ?? null,
            href: post.href
          }
        };
      }
      if (!row.resource) throw new Error("Bookmark resource unavailable");
      const card = row.resource;
      return {
        ...base,
        available: true,
        resource: {
          kind: card.kind,
          id: card.id,
          title: card.title,
          href: card.href,
          state: card.state,
          requiresWeb: true,
          event:
            card.kind === "eventOccurrence"
              ? {
                  startAt: card.startAt,
                  endAt: card.endAt,
                  timeZone: card.timeZone,
                  allDay: card.allDay,
                  startLocal: card.startLocal,
                  endLocal: card.endLocal
                }
              : null
        }
      };
    });
    return success(operation, owner, { items, nextCursor });
  } catch (error) {
    return denied(error);
  }
}
