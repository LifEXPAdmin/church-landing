/** Browser adapter for the canonical request core. Never caches private responses. */
import { announcePrivilegedChallenge } from "./privileged-auth-navigation";
import {
  prepareRequest,
  RequestClientError as SocialClientError,
  type RequestAdapter,
  type RequestCancellation
} from "../../packages/shared-core/src/request-client";
export { RequestClientError as SocialClientError } from "../../packages/shared-core/src/request-client";

async function browserFetch(path: string, init: RequestInit, cancellation?: RequestCancellation) {
  const controller = cancellation ? new AbortController() : undefined;
  const release = cancellation?.subscribe(() => controller?.abort()) ?? (() => {});
  if (cancellation?.cancelled) controller?.abort();
  try {
    const response = await fetch(path, { ...init, ...(controller ? { signal: controller.signal } : {}) });
    return { response, release };
  } catch (error) { release(); throw error; }
}
async function readSocialOwner(cancellation?: RequestCancellation): Promise<string | null> {
  const { response, release } = await browserFetch("/api/platform/profile?view=identity", {
    cache: "no-store", credentials: "same-origin"
  }, cancellation);
  try {
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401) return null;
      throw new SocialClientError(response.status,
        "Your sign-in could not be checked. Reconnect and try again.");
    }
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).id !== "string")
      throw new SocialClientError(503, "Your sign-in could not be checked.");
    return (body as { id: string }).id;
  } finally { release(); }
}
export function currentSocialOwner(): Promise<string | null> { return readSocialOwner(); }
const identity = (owner: string | null) => ({ owner, generation: owner ?? "guest" });
const adapter: RequestAdapter = {
  async capture(cancellation) {
    const owner = await readSocialOwner(cancellation);
    return {
      identity: identity(owner),
      async send(request, cancellation) {
        const { response, release } = await browserFetch(request.path, {
          method: request.method,
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            ...(request.body ? { "Content-Type": "application/json" } : {}),
            ...(request.expectedOwner ? { "X-Expected-Account": request.expectedOwner } : {})
          },
          ...(request.body ? { body: request.body } : {})
        }, cancellation);
        return {
          status: response.status,
          retryAfter: response.headers.get("retry-after"),
          async read() { try { return await response.json(); } finally { release(); } }
        };
      }
    };
  },
  async currentIdentity(cancellation) { return identity(await readSocialOwner(cancellation)); },
  decodeFailure(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid response");
    const row = value as Record<string, unknown>;
    return {
      message: typeof row.message === "string" ? row.message : "This action could not be confirmed. Your entries are unchanged.",
      ...(typeof row.code === "string" ? { code: row.code } : {})
    };
  },
  challenge: announcePrivilegedChallenge,
  now: () => Date.now()
};

/** Retain this object, not just the current props, when recovering an original save. */
export function prepareSocialRequest<T>(
  path: string,
  body?: string,
  expectedOwner?: string | null,
  method: "POST" | "DELETE" = "POST",
  options: { decode?: (value: unknown) => T; idempotent?: boolean } = {}
) {
  return prepareRequest(adapter, {
    path, method: body ? method : "GET", ...(body ? { body } : {}), expectedOwner,
    // Existing legacy callers validate their own domain result. Migrated callers
    // supply the strict decoder here; native adapters must always provide one.
    decode: options.decode ?? (value => value as T),
    idempotent: options.idempotent
  });
}
export function socialRequest<T>(
  path: string,
  body?: string,
  expectedOwner?: string | null,
  method: "POST" | "DELETE" = "POST",
  onDispatch?: () => void
): Promise<{ owner: string | null; data: T }> {
  return prepareSocialRequest<T>(path, body, expectedOwner, method).run({ onDispatch }).catch(error => {
    // Legacy recovery distinguishes a confirmed server rejection code from
    // identity/transport uncertainty. The new prepared API retains richer codes.
    if (error instanceof SocialClientError && !error.responseError)
      throw new SocialClientError(error.status, error.message, error.retryAfter,
        error.needsAuthenticator, undefined, error.dispatched);
    throw error;
  });
}
export type CommentAuthor = {
  id: string;
  name: string;
  username: string | null;
  churchId: string | null;
};
export type CommentItem = {
  prayerUpdateKind?: import("./prayer-types").PrayerUpdateKind | null;
  id: string;
  rootId: string | null;
  parentId: string | null;
  unavailable: boolean;
  createdAt: string;
  content: string | null;
  author: CommentAuthor | null;
  version: number | null;
  editedAt: string | null;
  isPostAuthor: boolean;
  replyTo: { id: string; name: string | null } | null;
  mentions: { id: string; name: string; username: string }[];
  likeCount: number | null;
  liked: boolean;
  likeVersion: number;
  replyCount: number;
  canReply: boolean;
  canEdit: boolean;
  canDelete: boolean;
  href: string;
};
export type CommentThreadPage = {
  viewerId: string | null;
  readProof?: string | null;
  readScope?: string | null;
  kind: "thread";
  postId: string;
  sort: "oldest" | "newest";
  items: CommentItem[];
  nextCursor: string | null;
  root: CommentItem | null;
  target: CommentItem | null;
  pinned: CommentItem | null;
  pinVersion: number;
  canPin: boolean;
  discussionClosed: boolean;
  canReply: boolean;
  visibleCount: number;
  conversation: { mode: "DEFAULT" | "FOLLOW" | "MUTE"; version: number };
};
export const mergeComments = (old: CommentItem[], next: CommentItem[]) => [
  ...new Map([...old, ...next].map((item) => [item.id, item])).values()
];
