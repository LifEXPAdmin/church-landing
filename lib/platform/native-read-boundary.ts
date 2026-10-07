import type { PrismaClient } from "@prisma/client";
import {
  API_VERSION,
  API_MAX_RESPONSE_BYTES,
  apiContracts,
  apiCursor,
  apiDate,
  apiId,
  apiUsername,
  apiFailure,
  apiErrorRules,
  encodeApiResponse,
  WireContractError,
  wire,
  type ApiErrorCode
} from "./api-contracts";
import { AccountError } from "./account-error";
import { AccountSessionOwnerError } from "./account-sessions";
import { withAccountRead, type ReadIdentity } from "./account-read";
import { withPostRead } from "./post-access";
import { readFeed } from "./feed-reads";
import { getPost, getChurchPostFeedIn, type PostView } from "./post-reads";
import { getMemberProfile } from "./profiles";
import { publicChurches } from "./portal";
import { PortalError } from "./portal-policy";
import { churchSearchQuery } from "./church-search";
import { nativeReadCursors, NativeCursorError } from "./native-read-cursors";
import {
  nativePost,
  nativeProfile,
  nativeChurch
} from "./native-read-projections";
import {
  nativeRequestCredential,
  NativeRequestError,
  nativeAuthHeaders
} from "./native-session-boundary";

export type NativeReadOperation =
  | "capabilities"
  | "feed"
  | "post"
  | "profile"
  | "churches"
  | "church";
const postCursor = wire.object({ before: apiDate, id: apiId });
const queryKeys: Record<NativeReadOperation, readonly string[]> = {
  capabilities: [],
  feed: ["mode", "cursor", "scope"],
  post: [],
  profile: ["cursor"],
  churches: ["query", "cursor"],
  church: ["cursor"]
};
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
  if (error instanceof AccountSessionOwnerError)
    return failure(
      "account_changed",
      "Return to the original signed-in account before continuing."
    );
  if (error instanceof NativeCursorError)
    return failure("cursor_invalid", error.message);
  if (error instanceof NativeRequestError)
    return failure(error.code, "Use the supported native reading controls.");
  if (error instanceof WireContractError)
    return failure("validation", "Check the requested reading fields.");
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
                  ? "feature_unavailable"
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
    "This reading could not be confirmed. Reconnect and try again."
  );
}
function success(
  operation: NativeReadOperation,
  viewerId: string | null,
  data: unknown
) {
  // Every outbound field is explicitly projected and then strictly allowlisted.
  try {
    const body = JSON.stringify(
      encodeApiResponse(operation, { apiVersion: API_VERSION, viewerId, data })
    );
    if (Buffer.byteLength(body) > API_MAX_RESPONSE_BYTES) throw new Error();
    return new Response(body, {
      headers: { ...nativeAuthHeaders, "Content-Type": "application/json" }
    });
  } catch {
    throw new Error("Native reading response projection failed");
  }
}
function nextPostCursor(
  rows: PostView[],
  cursors: ReturnType<typeof nativeReadCursors<{ before: string; id: string }>>,
  expires?: number
) {
  const last = rows[29];
  return rows.length > 30 && last
    ? cursors.encode(
        { before: last.createdAt.toISOString(), id: last.id },
        expires
      )
    : null;
}

/** Bounded native GET transport; web RSC readers continue calling their services directly. */
export async function handleNativeReadRequest(
  db: PrismaClient,
  request: Request,
  operation: NativeReadOperation,
  params: unknown = {}
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
    const credential = nativeRequestCredential(request, queryKeys[operation]);
    if (credential.token && !credential.owner)
      throw new NativeRequestError("validation");
    const identity: ReadIdentity = {
      expectedOwner: credential.owner ?? null,
      credentialSupplied: credential.token !== undefined
    };
    const viewer = identity.expectedOwner;
    const parsed = apiContracts[operation].params.parse(params);
    const search = new URL(request.url).searchParams;
    const cursor = search.get("cursor");
    if (operation === "capabilities") {
      const data = await withAccountRead(
        db,
        credential.token,
        async () => ({
          supportedVersions: [API_VERSION],
          features: [
            ...[
              "session.read",
              "session.password",
              "session.activity",
              "session.logout",
              "feed.read",
              "post.read",
              "profile.read",
              "churches.read",
              "church.read"
            ].map((name) => ({ name, available: true })),
            ...[
              "session.google",
              "comments.read",
              "comments.write",
              "posts.write",
              "likes.write",
              "media.read",
              "push"
            ].map((name) => ({ name, available: false }))
          ]
        }),
        identity
      );
      return success(operation, viewer, data);
    }
    if (operation === "feed") {
      const query = apiContracts.feed.query.parse({
        mode: search.get("mode") ?? "latest",
        cursor,
        scope: search.get("scope")
      });
      if (query.cursor && !query.scope) throw new NativeCursorError();
      const cursors = nativeReadCursors(
        [operation, viewer, query.mode, query.scope],
        apiCursor
      );
      const prior = cursors.decode(query.cursor);
      const view = await readFeed(
        db,
        credential.token,
        {
          mode: query.mode,
          scope: query.scope ?? undefined,
          cursor: prior?.value
        },
        new Date(),
        identity
      );
      const outgoing = nativeReadCursors(
        [operation, view.ownerId, view.mode, view.scope],
        apiCursor
      );
      return success(operation, view.ownerId, {
        mode: view.mode,
        scope: view.scope,
        pageCursor: outgoing.encode(view.pageCursor, prior?.expires),
        page: {
          items: view.posts.map((post) => nativePost(post, view.ownerId)),
          nextCursor: view.nextCursor
            ? outgoing.encode(view.nextCursor, prior?.expires)
            : null
        },
        notice: view.notice
      });
    }
    if (operation === "post") {
      const postId = apiId.parse((parsed as { postId: unknown }).postId);
      const view = await getPost(
        db,
        credential.token,
        postId,
        { comments: false },
        identity
      );
      if (!view) throw new PortalError(404, "This post is unavailable.");
      return success(operation, viewer, nativePost(view, viewer));
    }
    if (operation === "profile") {
      const username = apiUsername.parse(
        (parsed as { username: unknown }).username
      );
      const query = apiContracts.profile.query.parse({ cursor });
      const cursors = nativeReadCursors(
        [operation, viewer, username],
        postCursor
      );
      const prior = cursors.decode(query.cursor);
      const view = await getMemberProfile(
        db,
        credential.token,
        username,
        prior
          ? { before: new Date(prior.value.before), cursor: prior.value.id }
          : {},
        identity
      );
      return success(
        operation,
        viewer,
        nativeProfile(
          view,
          viewer!,
          nextPostCursor(view.posts, cursors, prior?.expires)
        )
      );
    }
    if (operation === "churches") {
      const query = apiContracts.churches.query.parse({
        query: search.get("query") ?? "",
        cursor
      });
      const normalized = churchSearchQuery(query.query);
      const cursors = nativeReadCursors([operation, viewer, normalized], apiId);
      const prior = cursors.decode(query.cursor);
      const rows = await withAccountRead(
        db,
        credential.token,
        (tx) => publicChurches(tx, undefined, prior?.value, normalized),
        identity
      );
      return success(operation, viewer, {
        items: rows.slice(0, 100).map(nativeChurch),
        nextCursor:
          rows.length > 100 ? cursors.encode(rows[99].id, prior?.expires) : null
      });
    }
    const churchId = apiId.parse((parsed as { churchId: unknown }).churchId);
    const query = apiContracts.church.query.parse({ cursor });
    const cursors = nativeReadCursors(
      [operation, viewer, churchId],
      postCursor
    );
    const prior = cursors.decode(query.cursor);
    const data = await withPostRead(
      db,
      credential.token,
      async (tx, context) => {
        const church = (
          await publicChurches(
            tx,
            churchId,
            undefined,
            "",
            context.actorId ?? ""
          )
        )[0];
        if (!church) throw new PortalError(404, "This church is unavailable.");
        const feed = await getChurchPostFeedIn(
          tx,
          context,
          churchId,
          prior
            ? { before: new Date(prior.value.before), cursor: prior.value.id }
            : {}
        );
        return {
          church: nativeChurch(church),
          meetingInfo: church.meetingInfo,
          serviceTimes: church.serviceTimes ?? "",
          accessibilityInfo: church.accessibilityInfo ?? "",
          connectionsAvailable: church.connectionsAvailable === true,
          pinnedPosts: feed.pinned.map((post) =>
            nativePost(post, context.actorId)
          ),
          posts: {
            items: feed.posts
              .slice(0, 30)
              .map((post) => nativePost(post, context.actorId)),
            nextCursor: nextPostCursor(feed.posts, cursors, prior?.expires)
          },
          requiresWeb: true
        };
      },
      identity
    );
    return success(operation, viewer, data);
  } catch (error) {
    return denied(error);
  }
}
