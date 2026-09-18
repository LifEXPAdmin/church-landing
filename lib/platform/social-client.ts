/** Browser transport for existing social APIs. Never caches private responses. */
import { announcePrivilegedChallenge } from "./privileged-auth-navigation";
export class SocialClientError extends Error {
  status: number;
  retryAfter?: number;
  needsAuthenticator: boolean;
  constructor(status: number, message: string, retryAfter?: number, needsAuthenticator = false) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
    this.needsAuthenticator = needsAuthenticator;
  }
}
export async function currentSocialOwner(): Promise<string | null> {
  const response = await fetch("/api/platform/profile?view=identity", {
    cache: "no-store",
    credentials: "same-origin"
  });
  if (!response.ok) {
    // Identity denials have no payload to use. Release the unread stream before
    // continuing guest reads or reporting a failure.
    await response.body?.cancel();
    if (response.status === 401) return null;
    throw new SocialClientError(
      response.status,
      "Your sign-in could not be checked. Reconnect and try again."
    );
  }
  const body = await response.json();
  if (typeof body.id !== "string")
    throw new SocialClientError(503, "Your sign-in could not be checked.");
  return body.id;
}
export async function socialRequest<T>(
  path: string,
  body?: string,
  expectedOwner?: string | null,
  method: "POST" | "DELETE" = "POST"
): Promise<{ owner: string | null; data: T }> {
  const owner = await currentSocialOwner();
  if (
    (expectedOwner !== undefined && owner !== expectedOwner) ||
    (body && !owner)
  )
    throw new SocialClientError(
      401,
      "Your sign-in changed. Reload before continuing."
    );
  const response = await fetch(path, {
    method: body ? method : "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(expectedOwner ? { "X-Expected-Account": expectedOwner } : {})
    },
    ...(body ? { body } : {})
  });
  const data = await response.json();
  if ((await currentSocialOwner()) !== owner)
    throw new SocialClientError(
      401,
      "Your sign-in changed. Reload before continuing."
    );
  if (!response.ok) {
    const needsAuthenticator = response.status === 403 && announcePrivilegedChallenge(data);
    throw new SocialClientError(
      response.status,
      data.message ??
        "This action could not be confirmed. Your entries are unchanged.",
      response.status === 429 &&
        /^\d+$/.test(response.headers.get("retry-after") ?? "")
        ? Number(response.headers.get("retry-after"))
        : undefined,
      needsAuthenticator
    );
  }
  return { owner, data };
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
  likeCount: number;
  liked: boolean;
  likeVersion: number;
  replyCount: number;
  canReply: boolean;
  canEdit: boolean;
  canDelete: boolean;
  href: string;
};
export type CommentThreadPage = {
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
